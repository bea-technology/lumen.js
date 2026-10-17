// Integration test: a Global var change (_vt.Global.vars.*) must reach a
// currently-mounted persistent layout widget's own mustaches too, not
// just the main view's.
//
// Real, confirmed bug (2026-09-21), found continuing the same-day
// {{globals.locale...}}-stays-empty investigation: `touch()`/the fixed
// `setGlobals()` (see nested-mutation-reactivity.integration.test.js)
// correctly notify _vt.View._re — but a persistent layout widget
// (_vt.Widgets, 2026-09-18) gets its OWN separate ._re from its own
// renderHST() call, and _dispatchVarsUpdate()'s Global-write branch only
// ever called `_vt.View._re.update(varName)`. A footer widget's real
// {{globals.locale.link_guide[...]}} stayed empty forever even after that
// same-day fix, because the fix correctly notified the main view's engine
// — which the footer widget's own effects were never registered on.
// (A subview needed no equivalent fix: it shares the parent View's single
// ._re, so it was already covered.)
//
// This is exactly why the earlier, narrower reactivity tests
// (nested-mutation-reactivity.integration.test.js) didn't catch this —
// they all used _vt.View directly, never a real mounted widget. This test
// drives the REAL renderView() pipeline with a real mounted widget
// instead, the only way to actually prove this.
//
// Fixtures: real fcs.js parser output for a minimal project — a layout
// declaring one <nav nav> region, a nav widget whose only content is
// {{globals.testVar}}, and a bare home view. Regeneration recipe: from a
// scratch project root (so getAllFiles()'s process.cwd()-stripping
// produces the right "src/views/..."-shaped keys — this bit real,
// confirmed once during development), src/layouts/default.layout =
// `<nav nav></nav><main body></main>`, src/views/widgets/nav.view =
// `<div id="widget-target">{{globals.testVar}}</div>`, src/views/
// home.view = `<div id="home-target">Home</div>`, then
// fcs.getAllFiles(cwd+"/src/views", {}, false, true) for the views
// fixture and fcs.annotateLayoutRegions(fcs.getAllFiles(cwd+"/src/
// layouts", {}, false, true)) for the layouts fixture.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/widget-global-reactivity.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/widget-global-reactivity.layouts.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19987/', runScripts: 'dangerously',
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
    var widgetEl = document.getElementById('widget-target');
    check('nav widget mounted, shows initial Global value', widgetEl && widgetEl.textContent.trim() === 'initial', widgetEl && widgetEl.textContent);
    check('the widget really did get its own ._re (proving this is a real widget mount, not the main view)', !!(_vt.Widgets.nav && _vt.Widgets.nav._re));

    _vt.Global.vars.globals = { testVar: "updated via Global write" };

    return new Promise(function (resolve) { setTimeout(resolve, 100); });
}).then(function () {
    var widgetEl = document.getElementById('widget-target');
    check('the widget\\'s mustache updates when a Global var changes (the actual bug)', widgetEl && widgetEl.textContent.trim() === 'updated via Global write', widgetEl && widgetEl.textContent);
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
