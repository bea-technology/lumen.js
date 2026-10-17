// Regression test for the 2026-09-21 (cont'd) fix: even after
// touch()/setGlobals() (see nested-mutation-reactivity.integration.test.js)
// made EXPLICIT ways of updating `globals` reactive, the overwhelmingly
// common real V1 pattern — a bare nested mutation with no setGlobals()
// call at all (`globals.Me = "1234"`, typed directly in a click handler
// or anywhere else) — still silently bypassed the reactive system. Found
// immediately after that fix shipped: a real user reported "the mustache
// renders correctly now, but when I change the value... it doesn't change
// and rerender."
//
// Root cause: `globals` is a plain top-level `var` in
// vendor/reconnecting-websocket.js, never routed through _vt's reactive
// Proxy at all except at the exact moments setGlobals() runs. An ordinary
// nested write on it is just a plain JS object mutation.
//
// Also confirmed NOT covered by the existing `storage` event listener
// (`$(window).on("storage", ...)`): that only fires in OTHER tabs/windows
// sharing the same origin (a hard browser-platform rule, not something
// this codebase controls), and a bare mutation never calls
// localStorage.setItem() in the first place — only setGlobals() does.
// Same-tab, in-memory reactivity needed a real fix, not a re-use of that
// mechanism.
//
// Fixed with _deepReactive(obj, onChange) (_re.js) — a small, SEPARATE
// reactive-Proxy mechanism from _x()/_vt's own (deliberately not reusing
// it: _x()'s update-dispatch relies on a single shared, mutable currPath
// that assumes a get-then-set chain happens atomically right before each
// write, which doesn't hold for a long-lived reference like `globals`,
// mutated arbitrarily later from anywhere). It wraps `globals` recursively
// (memoized per underlying target via a WeakMap, so repeated reads return
// the same Proxy instance — real identity comparisons on nested
// sub-objects still work) and fires a callback on ANY set/delete at ANY
// depth. That callback (_onGlobalsDeepChange, vendor file) does exactly
// one thing — `_vt.Global.vars.globals = globals;` — an ordinary write
// through the PRIMARY reactive system, funneling into the exact same
// _dispatchVarsUpdate() -> walk View/Widgets/subviews -> update("globals")
// pathway every other Global var already uses. Not a second, parallel
// render-dispatch mechanism — just an adapter for the one access pattern
// the primary system can't natively track.
//
// Two layers of coverage here: primitive-level checks (mutate `globals`
// directly, confirm the dispatch fires) proving the mechanism itself is
// correct, then a real fcs.js-parsed fixture + renderView() proving an
// actual {{globals.Me}} mustache in the DOM updates after a bare mutation
// with no setGlobals() call at all — this is the literal scenario the
// real user hit.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/globals-deep-reactivity.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/globals-deep-reactivity.layouts.hst.json'), 'utf8'));

let pass = 0, fail = 0;
function report(results) {
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
}

function freshDOM(url) {
    return new JSDOM(
        `<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`,
        {
            url, runScripts: 'dangerously',
            beforeParse(window) {
                window.URL.createObjectURL = () => 'blob:test';
                window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
                window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
            }
        }
    );
}

function runPrimitiveChecks(done) {
    const dom = freshDOM('http://127.0.0.1:19985/');
    const win = dom.window;
    const mainScript = `
window.__results = [];
function check(name, cond, detail) { window.__results.push({ name, cond: !!cond, detail }); }
try {

var updateCalls = [];
_vt.View._re = { update: function(name) { updateCalls.push(name); } };

check('globals starts as an object', typeof globals === 'object');

globals.Me = "1234";
check('bare nested mutation syncs into _vt.Global.vars.globals', _vt.Global.vars.globals && _vt.Global.vars.globals.Me === "1234", JSON.stringify(_vt.Global.vars.globals));
check('bare nested mutation triggers update("globals") on the mounted view', updateCalls.indexOf("globals") !== -1, JSON.stringify(updateCalls));

globals.locale = { lang: "en" };
updateCalls.length = 0;
globals.locale.lang = "fr";
check('a 2-level-deep nested mutation also triggers update', updateCalls.indexOf("globals") !== -1, JSON.stringify(updateCalls));
check('the deep mutation actually applied', globals.locale.lang === "fr");

check('window.globals stays the exact same live object (no drift)', window.globals === globals);

updateCalls.length = 0;
setGlobals({ Me: "reset", extra: "x" });
check('setGlobals() still triggers update (no regression)', updateCalls.indexOf("globals") !== -1);
check('setGlobals() still sets the value correctly (no regression)', globals.Me === "reset" && globals.extra === "x");

window.__done = true;
} catch (e) {
    window.__results.push({ name: 'no uncaught error (primitive checks)', cond: false, detail: e.message + '\\n' + e.stack });
    window.__done = true;
}
`;
    const scriptEl = win.document.createElement('script');
    scriptEl.textContent = mainScript;
    win.document.body.appendChild(scriptEl);

    const deadline = Date.now() + 5000;
    (function poll() {
        if (win.__done || Date.now() > deadline) {
            report(win.__results || []);
            done();
        } else {
            setTimeout(poll, 50);
        }
    })();
}

function runRealDomCheck(done) {
    const dom = freshDOM('http://127.0.0.1:19986/');
    const win = dom.window;
    const mainScript = `
window.__results = [];
function check(name, cond, detail) { window.__results.push({ name, cond: !!cond, detail }); }

_vcD = { hstFormatVersion: ${JSON.stringify(1)}, views: ${JSON.stringify(views)}, layouts: ${JSON.stringify(layouts)} };
_csswrk.isStarted = function () { return true; };
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__" };

renderView('home', false, {}).then(function () {
    // No setGlobals() call anywhere -- literally the real user's own
    // report: mustache already renders correctly, now mutate it.
    globals.Me = "hello";
    return new Promise(function (resolve) { setTimeout(resolve, 30); });
}).then(function () {
    var el = document.getElementById('home-target');
    check('mustache shows the value after the FIRST bare mutation', el && el.textContent.trim() === 'hello', el && JSON.stringify(el.textContent));

    // The actual reported bug: change it AGAIN, no setGlobals() involved.
    globals.Me = "1234";
    return new Promise(function (resolve) { setTimeout(resolve, 30); });
}).then(function () {
    var el = document.getElementById('home-target');
    check('mustache re-renders after a SECOND bare mutation (the real reported bug)', el && el.textContent.trim() === '1234', el && JSON.stringify(el.textContent));
    window.__done = true;
}).catch(function (e) {
    window.__results.push({ name: 'no uncaught error (real DOM check)', cond: false, detail: e.message + '\\n' + e.stack });
    window.__done = true;
});
`;
    const scriptEl = win.document.createElement('script');
    scriptEl.textContent = mainScript;
    win.document.body.appendChild(scriptEl);

    const deadline = Date.now() + 5000;
    (function poll() {
        if (win.__done || Date.now() > deadline) {
            report(win.__results || []);
            done();
        } else {
            setTimeout(poll, 50);
        }
    })();
}

runPrimitiveChecks(function () {
    runRealDomCheck(function () {
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail === 0 ? 0 : 1);
    });
});
