// Integration test: load the REAL built bundle (dist/lumenjs-core.js — shim +
// workers + walk.js + _re.js + ws.js + lstnrs.js, exactly what a browser
// would fetch) into a real DOM, mount a minimal view by hand, and confirm a
// reactive variable mutation actually patches the DOM. This is the one thing
// none of the earlier unit-level tests proved: that the pieces work together
// when loaded as the real, shipped artifact.
//
// The test logic itself runs as a SECOND <script> tag in the same document,
// not from Node afterward — `class _v`/`class _lm`/`let _vt` are top-level
// declarations in a classic script, which (unlike `var`) never attach to
// `window`. They're only visible to other script tags sharing the same
// top-level scope, which is exactly how the framework's "everything is
// global across classic <script> tags" design is meant to work — so the
// test has to run inside that same scope, not poke at it from outside.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

const testScript = `
try {
    window.__results = [];
    function check(name, cond, detail) {
        window.__results.push({ name, cond: !!cond, detail });
    }

    check('_re.js core classes are present', typeof _lm === 'function' && typeof _v === 'function');
    check('reactive proxy _vt exists', typeof _vt === 'object' && _vt !== null);

    // Smallest possible "doc" tree by hand — a text node with one mustache
    // referencing a reactive variable 'count', wrapped in a div — the same
    // shape _re.js's own walk() expects (mirrors what the server-side
    // compiler normally hands it, per point 7).
    var docTree = {
        type: 'tag', name: 'div', attrs: {}, evs: {}, ax: {}, ex: {}, isV: false,
        children: [{
            type: 'text', tag: 'div', content: 'Count: {{count}}',
            mss: [{ start: 7, end: 16, jst: null, rvs: ['count'] }]
        }]
    };

    var view = new _v({ name: 'test', type: 'main', hst: [docTree], vars: {}, rvs: ['count'] });
    // Seed the initial value the way transformTopLevelDeclarations's output
    // would (a plain assignment onto vars, pre-mount).
    view.vars.count = 1;

    var engine = new _lm(view);
    _vt.View = view;
    engine.reactiveVariables = ['count'];
    engine.renderAll();

    var root = document.getElementById('root');
    root.append.apply(root, engine._RealDOM);

    var textNode = root.querySelector('div');
    check('DEBUG: _effects has count key', engine._effects.hasOwnProperty('count'), JSON.stringify(Object.keys(engine._effects)));
    check('DEBUG: _vt.View.vars.count is 1', _vt.View.vars.count === 1, 'got: ' + JSON.stringify(_vt.View.vars.count));
    check('DEBUG: getVal("{{count}}") directly', engine.getVal('{{count}}') === 1, 'got: ' + JSON.stringify(engine.getVal('{{count}}')));
    check('initial render shows count = 1', textNode.textContent === 'Count: 1', 'got: ' + textNode.textContent);

    // The actual thing under test: does mutating the reactive var through
    // the real Proxy patch the real DOM node, with zero manual re-render?
    _vt.View.vars.count = 42;
    check('mutating _vt.View.vars.count patches the DOM directly (no manual re-render)', textNode.textContent === 'Count: 42', 'got: ' + textNode.textContent);

    _vt.View.vars.count = 43;
    check('a second mutation also patches correctly', textNode.textContent === 'Count: 43', 'got: ' + textNode.textContent);

    // Confirm the [tgl] directive — migrated off .live() onto
    // $("body").on(...) in lstnrs.js — actually fires via real body
    // delegation, on an element that was never explicitly bound.
    var tglEl = document.createElement('div');
    tglEl.setAttribute('tgl', 'active');
    document.body.appendChild(tglEl);
    tglEl.dispatchEvent(new Event('click', { bubbles: true }));
    check('[tgl] directive fires via body delegation (post .live() removal)', tglEl.classList.contains('active') && tglEl.classList.contains('toggled'), 'classList: ' + tglEl.className);
} catch (e) {
    window.__results = window.__results || [];
    window.__results.push({ name: 'test script ran to completion', cond: false, detail: e.message + '\\n' + e.stack });
}
`;

const dom = new JSDOM(
    `<!doctype html><body><div id="root"></div><script>${bundleSrc}</script><script>${testScript}</script></body>`,
    {
        url: 'https://example.test/', runScripts: 'dangerously',
        // jsdom has no real Worker/Blob-URL support — a real browser does,
        // this stub exists only so lstnrs.js's top-level WebWorker
        // construction (unrelated to what this test verifies) doesn't
        // crash the whole script before the reactive core even loads.
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () {
                this.postMessage = () => { };
                this.addEventListener = () => { };
                this.terminate = () => { };
            };
            // Real browser APIs jsdom doesn't implement, unrelated to what
            // this test verifies — other body-delegated handlers in
            // lstnrs.js reference these unconditionally, and a real click
            // bubbling through `body` correctly reaches all of them, not
            // just the one this test cares about.
            window.confirm = () => true;
            window.AudioContext = window.AudioContext || function () {
                this.createOscillator = () => ({ connect: () => { }, start: () => { }, stop: () => { }, frequency: {} });
                this.createGain = () => ({ connect: () => { }, gain: { setValueAtTime: () => { }, exponentialRampToValueAtTime: () => { } } });
                this.destination = {};
                this.currentTime = 0;
            };
        }
    }
);
const win = dom.window;

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

check('bundle loaded without throwing, $ is our shim', typeof win.$ === 'function' && win.$.fn.jquery === 'lumenjs-shim');

const results = win.__results || [];
if (results.length === 0) {
    fail++;
    console.log('FAIL  test script never ran (window.__results missing)');
}
for (const r of results) {
    if (r.cond) { pass++; console.log('PASS  ' + r.name); }
    else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
