// Regression test for a real, confirmed missing V1 feature, found
// 2026-09-22: `watch` (the documented global object for variable-change
// callbacks — `watch = { myVar: function(){...} }`) was declared
// (`var watch = {};`, vendor/reconnecting-websocket.js) but never
// actually consulted anywhere in the framework. Clicking a real
// `@click="myVar++"` button on the real /guide/watch page never
// triggered the documented `watch.myVar` callback at all.
//
// Fixed by having `_dispatchVarsUpdate()` — the one place every tracked
// var write (View, Global, Widgets, subviews) passes through exactly
// once, regardless of how many mounted instances subsequently call
// their own .update() — check `watch[varName]` and call it if present.
// `watch` itself doesn't need to be a Proxy: it's a plain lookup table
// (name -> callback), not a reactive value needing its own change-
// tracking; what it needed was for the EXISTING reactive dispatch to
// consult it.
//
// Fixture: real fcs.js parser output for a view-scoped watched var
// (mirroring the real guide page's own example) and a Global var, to
// confirm watch works across both scopes via the one shared dispatch
// point, not just one.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/watch-mechanism.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/watch-mechanism.layouts.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19999/', runScripts: 'dangerously',
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
    return new Promise(function (resolve) { setTimeout(resolve, 100); });
}).then(function () {
    var mv = document.getElementById('myvar-target');
    check('{{myVar}} renders its initial value', mv && mv.textContent.trim() === '1', mv && mv.textContent);

    // The initial "var myVar = 1" declaration is itself a real reactive
    // write, so it may have already fired watch.myVar once -- reset the
    // log right before the real test action so we're only checking the
    // click-driven change.
    window.__watchCalls = [];

    document.getElementById('inc-btn').click();
    return new Promise(function (resolve) { setTimeout(resolve, 100); });
}).then(function () {
    var mv = document.getElementById('myvar-target');
    check('clicking @click="myVar++" actually incremented the reactive var and re-rendered', mv && mv.textContent.trim() === '2', mv && mv.textContent);
    check('clicking @click="myVar++" triggers the watch.myVar callback', window.__watchCalls.indexOf('myVar:2') !== -1, JSON.stringify(window.__watchCalls));

    // Add a Global-scoped watch too, confirming watch works through the
    // Global dispatch branch, not just the View-scoped one.
    window.__globalWatchCalls = [];
    watch = Object.assign({}, watch, {
        'globals': function () {
            window.__globalWatchCalls.push('globals fired');
        }
    });
    document.getElementById('global-btn').click();
    return new Promise(function (resolve) { setTimeout(resolve, 100); });
}).then(function () {
    check('a Global var write also triggers its own watch callback', window.__globalWatchCalls.length > 0, JSON.stringify(window.__globalWatchCalls));

    window.__done = true;
}).catch(function (e) {
    window.__results.push({ name: 'no uncaught error', cond: false, detail: e.message + '\\n' + e.stack });
    window.__done = true;
});
`;

const scriptEl = win.document.createElement('script');
scriptEl.textContent = mainScript;
win.document.body.appendChild(scriptEl);

const deadline = Date.now() + 6000;
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
