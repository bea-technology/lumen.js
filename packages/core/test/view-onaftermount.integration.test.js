// Regression test for the 2026-09-23 fix: V1's real renderView()
// (core.js:1945) calls View.onAfterMount() once the main view's HTML is
// actually mounted into [body], if the developer defined it — a real,
// documented per-navigation lifecycle hook with no V2 equivalent at all
// (confirmed absent via the V1-vs-V2 parity dashboard audit: grepped both
// packages/core/src/ and packages/core/vendor/, zero matches, unlike
// several other "missing" items from the same audit pass that turned out
// to already be ported in vendor/reconnecting-websocket.js and were
// simply missed by an src/-only grep).
//
// Distinct from appSettings.tick() (already ported, fires after EVERY
// re-render anywhere, not just a real top-level navigation) and from
// @after-render (an element-level hook, not a per-navigation one).
//
// Fixture: reuses the same real fcs.js-parser-output fixture pair
// (for-number-literal.views/layouts.hst.json — a plain "home" view with
// layout:'default') already established for renderView()-driving tests;
// View.onAfterMount is set directly by this test's own JS, not by
// anything in the view/layout content, so no new fixture was needed.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/for-number-literal.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/for-number-literal.layouts.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19996/', runScripts: 'dangerously',
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

window.__onAfterMountCalls = 0;
View.onAfterMount = function () { window.__onAfterMountCalls++; };

renderView('home', false, {}).then(function () {
    return new Promise(function (resolve) { setTimeout(resolve, 200); });
}).then(function () {
    check('View.onAfterMount() fires once after the main view is mounted into [body]', window.__onAfterMountCalls === 1, 'calls=' + window.__onAfterMountCalls);
    check('the view content itself still rendered correctly (onAfterMount did not break the render)', document.getElementById('target') !== null);

    var callsBefore = window.__onAfterMountCalls;
    return renderView('home', false, {}).then(function () {
        return new Promise(function (resolve) { setTimeout(resolve, 200); });
    }).then(function () {
        check('a second real navigation to the same view fires it again (per-navigation, not once-ever)', window.__onAfterMountCalls === callsBefore + 1, 'before=' + callsBefore + ' after=' + window.__onAfterMountCalls);
        window.__done = true;
    });
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
