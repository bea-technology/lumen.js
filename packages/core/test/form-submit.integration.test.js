// Regression test for the 2026-09-22 form-submission fix — a cluster of
// real, confirmed bugs that together made every plain <form action="...">
// (and every o-sub/b-sub form) on the DEFAULT runtime silently fall
// through to a raw native browser submission instead of LumenJS's real
// pushURL()-based SPA navigation:
//
// 1. globalWatch() (vendor/reconnecting-websocket.js) — the function that
//    actually binds forms via renderPlugins() — had a hard, unconditional
//    `return;` right after its one real guard, making everything below it
//    (form binding, lazy image loading, @scroll-* listeners, carousel
//    refresh) permanently dead code.
// 2. Even with that fixed, NOTHING in the real render pipeline ever
//    called globalWatch() at all after an ordinary navigation — every
//    real call site was gated behind an unrelated event (a modal-open
//    click, a real AJAX request completing). Fixed by wiring a call into
//    renderView()'s real navigation-completion points (_re.js).
// 3. `$.fn.hasAttr` was overwritten (vendor file loads after dom-shim.js)
//    with a version using `this.attr(k) !== undefined` — always true for
//    a present-or-absent attribute, since a real absent attribute reads
//    back as `null`, not `undefined`.
// 4. `$.fn.ajaxForm`/`$.fn.serializeArray` (real jQuery.form methods the
//    vendor code's whole form-binding logic depends on) never existed in
//    this lightweight runtime at all.
// 5. `$.map` (getFormData()'s own dependency) was also missing.
//
// This test exercises the REAL, full chain end to end: render a page with
// a real <form>, dispatch a real submit event, and confirm the SPA
// navigated to the target view with the real form data — not any of the
// pieces in isolation (those are covered in dom-shim.test.js).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/form-submit.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/form-submit.layouts.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19998/', runScripts: 'dangerously',
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
// Base must be a stable, absolute value here — an empty string resolves
// relative to window.location AT CALL TIME (via a real <a href> trick in
// getURLNodes()), which self-referentially breaks once pushURL() has
// already updated the URL by the time goToNode() reads it back. A real
// app sets this once during Reactor() init, before any navigation; this
// test bypasses Reactor() entirely, so it's set explicitly instead.
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__", Base: window.location.origin };
// goToNode() (what pushURL() calls) waits on this real framework flag,
// normally set inside Reactor() — this test drives renderView() directly
// without a full Reactor() bootstrap, so it's set here to let a real
// pushURL()-triggered navigation actually complete instead of polling
// forever.
_initialized = true;

renderView('home', false, {}).then(function () {
    return new Promise(function (resolve) { setTimeout(resolve, 150); });
}).then(function () {
    var form = document.getElementById('plain-form');
    check('form rendered', !!form);
    check('globalWatch really did bind this form (the .binded class renderPlugins() adds)', form && form.classList.contains('binded'), form && form.className);

    document.getElementById('name-input').value = 'Abdul';
    var submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);

    return new Promise(function (resolve) { setTimeout(resolve, 300); });
}).then(function () {
    check('submitting the real form navigated to the target view via pushURL, not a native reload', window.location.pathname.indexOf('view-example') !== -1, window.location.pathname);
    var welcome = document.getElementById('welcome');
    check('the target view received the real typed form data', welcome && welcome.textContent.trim() === 'Welcome: Abdul!', welcome && welcome.textContent);
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
