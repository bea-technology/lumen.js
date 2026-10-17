// Integration test: a Global var change must reach an ordinary mounted
// SUBVIEW's (view="...") own mustaches too, not just the main view and
// persistent widgets.
//
// Real, confirmed bug (2026-09-21), found immediately after the sibling
// widget-global-reactivity fix, from a user report that the same real
// project was "still" not rendering a globals-dependent mustache even
// after that fix shipped and was verified live. This file's own earlier
// design comment (removed now) incorrectly assumed subviews were already
// covered "since they share the parent View's single ._re" — untrue, and
// this test is what proved it: a real subview mount, same as a widget,
// gets its own SEPARATE ._re from its own renderHST() call.
//
// Root cause, traced to the actual renderHST() call sites: BOTH the
// widget mount and the real subview mount construct their _v with
// `_pv: null` — the one thing that would make the pre-existing
// `this.view._pv.subscribe(this.view)` auto-registration (used correctly
// by :for/:if "section" renders, whose own renderHST call passes the
// real parent) ever fire. A subview's own ._re is stored directly on its
// DOM element (`el._re`), not a central registry like _vt.Widgets — and
// the obvious next idea, querying the DOM for `[view]` elements, doesn't
// work either: `view="..."` is intentionally stripped from real rendered
// output (same treatment :if/:for get). Fixed with
// `_mountedSubviewEngines` (_re.js) — a flat array populated at mount
// time, walked by _dispatchVarsUpdate()'s Global-write branch alongside
// the widgets loop.
//
// Fixtures: real fcs.js parser output — a bare layout, a home view that
// mounts one subview (`<div view="widgets/sub">`, filed under widgets/
// purely by folder convention, not because it's an actual persistent
// widget — an ordinary subview reference works from any folder), and the
// subview itself containing only {{globals.testVar}}. Same regeneration
// recipe as widget-global-reactivity's own fixtures (real project root,
// so getAllFiles()'s cwd-stripping produces correct keys) — see that
// file's header for the exact recipe if regenerating.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/subview-global-reactivity.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/subview-global-reactivity.layouts.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19984/', runScripts: 'dangerously',
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
_vt.Global.vars.globals = { testVar: "initial" };

renderView('home', false, {}).then(function () {
    var homeEl = document.getElementById('home-target');
    check('home view rendered', !!homeEl);
    var subEl = document.getElementById('subview-target');
    check('subview mounted, shows initial Global value', subEl && subEl.textContent.trim() === 'initial', subEl && subEl.textContent);
    check('view="..." is really stripped from the rendered DOM (confirms this test exercises the real gap, not a querySelectorAll shortcut)', document.querySelectorAll('[view]').length === 0);
    check('the subview really did get its own ._re (proving this is a real subview mount)', !!(subEl && subEl.closest('[data-layout]') && _mountedSubviewEngines.length === 1));

    _vt.Global.vars.globals = { testVar: "updated via Global write" };

    return new Promise(function (resolve) { setTimeout(resolve, 100); });
}).then(function () {
    var subEl = document.getElementById('subview-target');
    check('the subview\\'s mustache updates when a Global var changes (the actual bug)', subEl && subEl.textContent.trim() === 'updated via Global write', subEl && subEl.textContent);
    var homeEl = document.getElementById('home-target');
    check('the main view is unaffected (still there, unrelated content untouched)', homeEl && homeEl.textContent.trim() === 'Home');
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
