// Regression test for the 2026-09-21 fix: an @click (or any @-event)
// INLINE EXPRESSION that mutates a reactive var (@click="count++",
// @click="flag = !flag") never actually worked, for ANY view/subview
// scope. Found testing real lumenjs.com guide content — its own demo
// buttons do exactly this ({{age}}++, isLoggedIn toggling) and silently
// did nothing on click, with zero console errors.
//
// Root cause: lstnrs.js's evalEvAttr() falls back to a completely bare
// `eval(_v)` for anything that isn't a real named function call. This
// happened to work for @click="someFunctionName" (the only pattern
// click-events.integration.test.js exercised) because top-level function
// declarations stay real, window-attached globals by design — but a
// reactive var (rewritten by walk.js into _vt.View.vars[...]/
// _vt.View.views[i].vars[...]/_vt.Global.vars[...]) has no such bare
// identifier anywhere for a plain eval() to find or write back to.
//
// Fixed with _evalEventScopedExpr() (_re.js) — `with` + a Proxy whose
// get/set/has traps route bare identifier reads AND writes through the
// real reactive system (mirroring concatVarsAtLevel()'s own read
// priority: Global < Widgets < the triggering element's own owner view),
// so a write actually triggers _dispatchVarsUpdate() and a real
// re-render, not a silent no-op on a detached plain object.
//
// Fixture is real fcs.js parser output — a minimal view with count++ and
// flag = !flag inline @click expressions, same established discipline as
// every other *.integration.test.js in this suite.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/click-scoped-expr.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/click-scoped-expr.layouts.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19989/', runScripts: 'dangerously',
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
            window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
        }
    }
);
const win = dom.window;

const mainScript = `
window.__results = [];
function check(name, cond, detail) { window.__results.push({ name, cond: !!cond, detail }); }

_vcD = { hstFormatVersion: ${JSON.stringify(1)}, views: ${JSON.stringify(views)}, layouts: ${JSON.stringify(layouts)} };
_csswrk.isStarted = function () { return true; };
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__" };

renderView('home', false, {}).then(function () {
    var countEl = document.getElementById('count-target');
    check('initial count renders correctly', countEl.textContent.trim() === '0', countEl.textContent);

    document.getElementById('inc-btn').click();
    return new Promise(function (resolve) { setTimeout(resolve, 50); });
}).then(function () {
    var countEl = document.getElementById('count-target');
    check('@click="count++" actually incremented the reactive var and re-rendered', countEl.textContent.trim() === '1', countEl.textContent);

    document.getElementById('inc-btn').click();
    return new Promise(function (resolve) { setTimeout(resolve, 50); });
}).then(function () {
    var countEl = document.getElementById('count-target');
    check('a second click keeps incrementing (not a one-shot fluke)', countEl.textContent.trim() === '2', countEl.textContent);

    var flagEl = document.getElementById('flag-target');
    check('initial flag renders correctly', flagEl.textContent.trim() === 'false', flagEl.textContent);

    document.getElementById('toggle-btn').click();
    return new Promise(function (resolve) { setTimeout(resolve, 50); });
}).then(function () {
    var flagEl = document.getElementById('flag-target');
    check('@click="flag = !flag" actually toggled the reactive var and re-rendered', flagEl.textContent.trim() === 'true', flagEl.textContent);
    window.__done = true;
}).catch(function (e) {
    window.__results.push({ name: 'no uncaught error', cond: false, detail: e.message + '\\n' + e.stack });
    window.__done = true;
});
`;

const scriptEl = win.document.createElement('script');
scriptEl.textContent = mainScript;
win.document.body.appendChild(scriptEl);

const deadline = Date.now() + 5000;
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
