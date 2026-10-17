// Integration test: real @click dispatch through lstnrs.js's delegated
// listeners (2026-09-16). Found via an actual `lm build` output driven by
// real Chrome (puppeteer-core, not jsdom) — every @-prefixed event handler
// (@click, @sort, @drag, ... 34 call sites in lstnrs.js, all the same
// `[\@name]` delegated-selector shape) was completely dead in every
// environment tested this whole session, dev and prod alike. Root cause:
// vendor/reconnecting-websocket.js's real framework code monkey-patches
// HTMLElement.prototype.setAttribute/getAttribute/removeAttribute so a
// `@`-prefixed write is redirected to el.events[name] instead of the real
// attribute store (deliberate, existing V2 behavior). dom-shim.js's
// $.fn.hasAttr used native (unpatched) hasAttribute, and its .on()
// delegation used native closest() — both blind to that redirect, so a
// delegated @click listener could never even be invoked. Fixed in
// dom-shim.js: hasAttr now routes through the patch-aware getAttribute,
// and .on() walks up manually via getAttribute for `[\@name]`-shaped
// selectors instead of native closest().
//
// Fixture generation recipe is in click-events.view's own header comment,
// same convention as render-hooks.integration.test.js's fixture.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const hst = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/click-events.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:3000/', runScripts: 'dangerously',
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
            // jsdom doesn't implement the Web Audio API — a real, universally-
            // supported browser API lstnrs.js's own global (non-delegated)
            // "click touch tap" listener references unconditionally, to lazily
            // unlock audio playback on first interaction (a real, unrelated
            // feature, not something to paper over in the shipped bundle —
            // same reasoning as plugins-bundle.integration.test.js's
            // requestAnimationFrame stub).
            window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
        }
    }
);
const win = dom.window;

const mainScript = `
window.__results = [];
function check(name, cond, detail) { window.__results.push({ name, cond: !!cond, detail }); }
// A real .view <script> block's top-level "count = count + 1" gets AST-
// rewritten by walk.js into _vt.View.vars.count += 1 before it ever ships;
// this test injects bump() raw (matching render-hooks.integration.test.js's
// own callbacks), so it writes to the reactive store directly to mirror
// what compiled output would actually do — the point here is proving the
// click dispatch itself reaches the handler, not re-testing walk.js's
// rewrite (already covered elsewhere).
function bump(ev, el) { _vt.View.vars.count = _vt.View.vars.count + 1; }

try {
    var hst = ${JSON.stringify(hst)};
    var view = new _v({ name: 'home', type: 'main', hst: hst, vars: { count: 0 }, rvs: ['count'] });
    var engine = new _lm(view);
    engine.reactiveVariables = ['count'];
    engine.renderAll();
    // Real @click dispatch is delegated off document.body (lstnrs.js:
    // $("body").on("click touch", "[\\\\@click]", ...)) — content has to
    // actually be attached under <body>, not just held in a detached
    // fragment, for delegation to have anything to bubble through.
    document.body.append.apply(document.body, engine._RealDOM);

    var btn = document.getElementById('e2e-btn');
    check('button rendered', !!btn, btn);
    check('the @click attribute is NOT a real DOM attribute (redirected to el.events by design)', btn.getAttribute('@click') === 'bump' && !btn.hasAttribute('@click'), 'getAttribute=' + btn.getAttribute('@click') + ' hasAttribute=' + btn.hasAttribute('@click'));
    check('count starts at 0', document.getElementById('e2e-count').textContent.trim() === 'count: 0', document.getElementById('e2e-count').textContent);

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    setTimeout(function () {
        check('a real, bubbled click on the @click-bound button actually invoked bump() and re-rendered the mustache', document.getElementById('e2e-count').textContent.trim() === 'count: 1', document.getElementById('e2e-count').textContent);

        // Click on the button's own text/inner content (not the button
        // element itself) to prove delegation walks UP from the real
        // click target to find the nearest @click-bearing ancestor, the
        // same way native closest()-based delegation does for every other
        // selector in this file.
        btn.firstChild.dispatchEvent ? null : null; // text nodes can't dispatch; click a child element instead
        var inner = document.createElement('span');
        inner.textContent = 'x';
        btn.appendChild(inner);
        inner.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        setTimeout(function () {
            check('a click on a child of the @click-bound button also bubbles up and fires it (delegation walks ancestors, not just the exact target)', document.getElementById('e2e-count').textContent.trim() === 'count: 2', document.getElementById('e2e-count').textContent);
        }, 200);
        setTimeout(function () {
            reportResults();
        }, 400);
    }, 200);
} catch (e) {
    window.__results.push({ name: 'test script ran to completion', cond: false, detail: e.message + '\\n' + e.stack });
    reportResults();
}

function reportResults() {
    window.__done = true;
}
`;

setTimeout(() => {
    const script = win.document.createElement('script');
    script.textContent = mainScript;
    win.document.body.appendChild(script);

    const deadline = Date.now() + 3000;
    (function poll() {
        if (win.__done || Date.now() > deadline) {
            let pass = 0, fail = 0;
            for (const r of (win.__results || [])) {
                if (r.cond) { pass++; console.log('PASS  ' + r.name); }
                else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
            }
            console.log(`\n${pass} passed, ${fail} failed`);
            process.exit(fail === 0 ? 0 : 1);
        } else {
            setTimeout(poll, 50);
        }
    })();
}, 300);
