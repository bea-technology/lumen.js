// Integration test: @before-render / @after-render (2026-09-14) — lets a
// developer tear down and re-initialize a DOM-owning plugin (a slider, for
// instance) around a :for loop's diff-and-patch pass or a :if/:else-if/
// :else section's show/hide transition, instead of it silently breaking
// the next time the underlying data or condition changes. See _re.js's
// fireRenderHook() and its call sites in updateLXRs()/showSectionCX()/
// hideSectionCX() for the implementation.
//
// The HST fixture below is copied verbatim from fcs.js's real parser
// output (getAllFiles() against a real .view file using :for/:if/:else
// with @before-render/@after-render) rather than hand-built — earlier
// synthetic fixtures in this test suite's history have drifted from real
// parser output in subtle ways (see core-bundle.integration.test.js's own
// notes), and this specifically caught a real bug during development:
// @-prefixed attributes get lifted into `doc.evs` (the events map) by the
// parser, not left in `doc.attrs` alongside plain attributes like :for/:if
// — the first implementation read the wrong place and silently never fired.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const hst = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/render-hooks.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body><div id="root"></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:3000/', runScripts: 'dangerously',
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
        }
    }
);
const win = dom.window;

const mainScript = `
window.__results = [];
function check(name, cond, detail) { window.__results.push({ name, cond: !!cond, detail }); }
window.__calls = [];

function onBeforeRender(ev, el) { window.__calls.push({ hook: 'before-render', items: (ev.items||[]).length, containerId: el[0] && el[0].id }); }
function onAfterRender(ev, el) { window.__calls.push({ hook: 'after-render', items: (ev.items||[]).length, containerId: el[0] && el[0].id }); }
function onIfBeforeRender(ev, el) { window.__calls.push({ hook: 'if-before-render', visible: ev.visible }); }
function onIfAfterRender(ev, el) { window.__calls.push({ hook: 'if-after-render', visible: ev.visible }); }
function onElseAfterRender(ev, el) { window.__calls.push({ hook: 'else-after-render', visible: ev.visible }); }

try {
    var hst = ${JSON.stringify(hst)};
    var view = new _v({ name: 'home', type: 'main', hst: hst, vars: { images: ['a', 'b'], isAdmin: false }, rvs: ['images', 'image', 'isAdmin'] });
    var engine = new _lm(view);
    engine.reactiveVariables = ['images', 'image', 'isAdmin'];
    engine.renderAll();
    var root = document.getElementById('root');
    root.append.apply(root, engine._RealDOM);

    setTimeout(function () {
        check(':for initial render fires after-render with the rendered items', window.__calls.some(c => c.hook === 'after-render' && c.items === 2), JSON.stringify(window.__calls));
        check(':if/:else initial render: isAdmin=false -> else-after-render fires', window.__calls.some(c => c.hook === 'else-after-render'), JSON.stringify(window.__calls));
        check(':if/:else initial render: isAdmin=false -> if-after-render does NOT fire (never shown)', !window.__calls.some(c => c.hook === 'if-after-render'), JSON.stringify(window.__calls));

        window.__calls = [];
        _vt.View.vars.images = ['a', 'b', 'c'];
        setTimeout(function () {
            check(':for update: before-render fires around a real data change', window.__calls.some(c => c.hook === 'before-render'), JSON.stringify(window.__calls));
            check(':for update: after-render fires with the new item count', window.__calls.some(c => c.hook === 'after-render' && c.items === 3), JSON.stringify(window.__calls));

            window.__calls = [];
            _vt.View.vars.isAdmin = true;
            setTimeout(function () {
                check(':if/:else toggle to shown: if-before-render does NOT fire (was never visible, nothing to tear down)', !window.__calls.some(c => c.hook === 'if-before-render'), JSON.stringify(window.__calls));
                check(':if/:else toggle to shown: if-after-render fires', window.__calls.some(c => c.hook === 'if-after-render' && c.visible === true), JSON.stringify(window.__calls));

                window.__calls = [];
                _vt.View.vars.isAdmin = false;
                setTimeout(function () {
                    check(':if/:else toggle to hidden: if-before-render fires (real visible->hidden transition)', window.__calls.some(c => c.hook === 'if-before-render' && c.visible === false), JSON.stringify(window.__calls));

                    window.__calls = [];
                    _vt.View.vars.someUnrelatedThing = 123;
                    setTimeout(function () {
                        check('an unrelated var mutation does not spuriously re-fire any render hook', window.__calls.length === 0, JSON.stringify(window.__calls));
                        window.__done = true;
                    }, 100);
                }, 100);
            }, 100);
        }, 100);
    }, 100);
} catch (e) {
    window.__results.push({ name: 'test script ran to completion', cond: false, detail: e.message + '\\n' + e.stack });
    window.__done = true;
}
`;

setTimeout(() => {
    const script = win.document.createElement('script');
    script.textContent = mainScript;
    win.document.body.appendChild(script);

    let waited = 0;
    const iv = setInterval(() => {
        waited += 100;
        if (win.__done || waited > 3000) {
            clearInterval(iv);
            let pass = 0, fail = 0;
            for (const r of (win.__results || [])) {
                if (r.cond) { pass++; console.log('PASS  ' + r.name); }
                else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
            }
            console.log(`\n${pass} passed, ${fail} failed`);
            process.exit(fail === 0 ? 0 : 1);
        }
    }, 100);
}, 300);
