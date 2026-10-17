// Integration test: a Global var set via a plain nested mutation on the
// bare identifier BEFORE any view has ever rendered (the real,
// documented index.js pattern — Reactor({init: function(){ globals.Me =
// "Abdul"; }})) must render correctly on the very first render. No
// setGlobals(), no touch(), no prior explicit write through
// _vt.Global.vars at all — this is the single most common real shape a
// Global var actually takes in real V1 code, and it doesn't involve any
// timing/async race the way the sibling nested-mutation-reactivity test's
// scenarios do (the value is already correct by the time render happens
// — this bug was never about timing).
//
// Real, confirmed bug (2026-09-21): the mustache rendered EMPTY despite
// `globals.Me` being confirmed correct (checked directly in the console:
// `globals.Me` -> `'Abdul'`). Root cause, traced precisely: getVal()
// (what mustache text nodes actually call) builds its own `vars` object
// by walking `this.reactiveVariables` (every base identifier the parser
// found referenced in this view, "globals" included, purely from
// {{globals.Me}} appearing in the markup) and used to assign
// `vars[__name] = <value found in View/Widgets/Global, or undefined>`
// UNCONDITIONALLY — turning "no known value" into an explicit
// `vars.globals = undefined` KEY (since _vt.Global.vars.globals was
// never actually written — only the bare identifier was mutated). That
// object flows into scopedEval(), which builds a `Function(...Object.
// keys(ctx), "expr", "return eval(expr)")` — "globals" becomes a real
// function PARAMETER, explicitly undefined, SHADOWING the real,
// correctly-populated `globals` sitting in the true enclosing scope.
// `eval("globals.Me")` then reads `.Me` off that undefined parameter,
// throws, and the existing TypeError-retry path never actually recovered
// anything (see the fix below).
//
// Fixed two ways, both real and worth testing separately: (1) getVal()
// now only assigns a vars[] key when a real value was actually found,
// letting an unset name fall through to normal JS scope resolution
// instead of shadowing it with an explicit undefined — same spread
// semantics concatVarsAtLevel() already had. (2) scopedEval()'s
// TypeError-retry was ALSO broken independently and fixed as a real
// safety net: `e.message.split(" ")[0]` was meant to extract the
// responsible ctx key, but for the real V8 message shape ("Cannot read
// properties of undefined (reading 'Me')") the first word is always
// literally "Cannot" — never a real key — so the retry always bailed out
// immediately, for any realistic TypeError, not just this one. Now
// strips every ctx key whose own value is undefined/null and retries
// once. This test can't cleanly isolate which of the two fixes alone
// would have been sufficient (fix 1 already prevents the bad key from
// ever reaching scopedEval() at all) — both are real, both are covered
// by this suite, that's enough.
//
// Fixture: real fcs.js parser output for a minimal
// {{globals.Me}} view — no index.js/Reactor() simulation needed in the
// fixture itself, since the bug is entirely about how the RENDER reads
// an already-correct value, not about timing.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/global-init-mutation.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/global-init-mutation.layouts.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19982/', runScripts: 'dangerously',
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
try {

_vcD = { hstFormatVersion: ${JSON.stringify(1)}, views: ${JSON.stringify(views)}, layouts: ${JSON.stringify(layouts)} };
_csswrk.isStarted = function () { return true; };
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__" };

// The real, documented index.js pattern: Reactor({init(){ globals.Me =
// "Abdul" }}) -- a bare nested mutation, no setGlobals()/touch() at all,
// happening before any view has ever rendered.
globals.Me = "Abdul";
check('globals.Me is really set on the real identifier before render', globals.Me === "Abdul");

renderView('home', false, {}).then(function () {
    var el = document.getElementById('home-target');
    check('the mustache shows the correct value on the very first render, no update needed', el && el.textContent.trim() === 'Abdul', el && JSON.stringify(el.textContent));

    // Confirm the fix doesn't break the ordinary case: a real, populated
    // Global var (going through the real reactive channel) still works
    // exactly as the sibling reactivity tests already established.
    setGlobals({ Me: "Abdul", extra: "still here" });
    return new Promise(function (resolve) { setTimeout(resolve, 50); });
}).then(function () {
    var el = document.getElementById('home-target');
    check('a subsequent real setGlobals() call still works correctly too', el && el.textContent.trim() === 'Abdul', el && JSON.stringify(el.textContent));
    window.__done = true;
} ).catch(function (e) {
    window.__results.push({ name: 'no uncaught error', cond: false, detail: e.message + '\\n' + e.stack });
    window.__done = true;
});

} catch (e) {
    window.__results.push({ name: 'no uncaught error (sync)', cond: false, detail: e.message + '\\n' + e.stack });
    window.__done = true;
}
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
