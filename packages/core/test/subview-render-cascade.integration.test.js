// Regression test for the 2026-09-22 fix: updateVXRs() (the batch pass
// every renderAll()/update() call runs) used to call renderView() for
// EVERY tracked subview on EVERY single render pass of ANY ancestor
// _lm instance — including every :for/:if SECTION instance, since
// renderSection() passes the parent's own .views array reference down,
// not a fresh one, so a page with N section re-renders triggered N
// redundant full subview rebuilds regardless of whether the subview
// itself had anything to do with what changed.
//
// Found chasing a real user report: /guide/loops taking 8-10s to load
// on a real page with a persistent footer subview and many :for/:if
// sections. Confirmed live via direct instrumentation: 48-50 real
// renderHST("_guide/footer", ..., "sub") calls from a single page load,
// most from section-level updateVXRs() calls that had nothing to do
// with the footer at all. Root-caused to two distinct, compounding
// bugs, both fixed:
//   1. No gate at all on re-rendering an already-live, correctly-
//      mounted subview — fixed with a per-element `_mountedSubPath`
//      check (mirrors the widget system's own `_resolvedFile` gate).
//   2. A subview's own containing element can legitimately be rebuilt
//      once (e.g. guide.view's dynamic `view="_guide/{{nodes[1]}}/
//      {{nodes[2]}}"` resolving in two passes), orphaning the OLDER
//      mount element — which never satisfies gate #1 (it's genuinely
//      disconnected) and was getting retried on every single
//      downstream section update, forever. Fixed by recognizing an
//      element that already completed one real mount (_mountedSubPath
//      is set) and is NOW disconnected as permanently dead, not
//      "still under construction" — the exact distinction the earlier,
//      reverted fix attempt for this same symptom got wrong.
//
// This fixture (home.view mounting a real widgets/sub subview alongside
// a :for loop) isolates gate #1 (does an unrelated section update
// rebuild an unrelated, already-mounted subview) using real fcs.js
// parser output — the established discipline. Gate #2 (the orphaned-
// entry case) is exercised via direct, documented array manipulation
// below, since reproducing the real dynamic-view-resolving-twice
// scenario in a minimal fixture isn't practical; the manipulation
// matches the exact state confirmed present on the real page
// (_mountedSubPath set, both the mount element and its rendered DOM
// disconnected).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/subview-cascade.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/subview-cascade.layouts.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19995/', runScripts: 'dangerously',
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
    return new Promise(function (resolve) { setTimeout(resolve, 150); });
}).then(function () {
    var subContent = document.getElementById('sub-content');
    check('subview mounted with real content', subContent && subContent.textContent.trim() === 'hello', subContent && subContent.textContent);

    var subEl = document.getElementById('sub-mount');
    var subRe = subEl._re;
    check('subview element has a real ._re engine', !!subRe);

    window.__renderHSTCalls = 0;
    var origRenderHST = window.renderHST;
    window.renderHST = function (hst, n) {
        if (n === 'widgets/sub') window.__renderHSTCalls++;
        return origRenderHST.apply(this, arguments);
    };

    // Trigger several unrelated :for section updates (nothing to do
    // with the subview at all) -- each one's own renderAll()/
    // updateVXRs() call used to redundantly rebuild the subview too.
    document.getElementById('push-btn').click();
    return new Promise(function (resolve) { setTimeout(resolve, 80); });
}).then(function () {
    document.getElementById('push-btn').click();
    return new Promise(function (resolve) { setTimeout(resolve, 80); });
}).then(function () {
    document.getElementById('push-btn').click();
    return new Promise(function (resolve) { setTimeout(resolve, 80); });
}).then(function () {
    check('the list actually grew (proves the section updates were real, not no-ops)', document.getElementById('list').textContent.trim().length > 3, document.getElementById('list').textContent);
    check('the already-mounted subview was NOT rebuilt by unrelated section updates', window.__renderHSTCalls === 0, 'renderHST("widgets/sub", ...) called ' + window.__renderHSTCalls + ' times after mount');

    var subEl = document.getElementById('sub-mount');
    check('the subview element identity is unchanged (never wiped/rebuilt)', document.getElementById('sub-content') && document.getElementById('sub-content').textContent.trim() === 'hello');

    // --- Gate #2: a stale, permanently-orphaned duplicate entry ---
    // Simulate exactly the state confirmed on the real page: a second,
    // OLDER mount element for the same subPath that already completed
    // one real mount (_mountedSubPath set) and is now genuinely
    // disconnected (both the element itself and its own rendered DOM).
    var orphan = document.createElement('div');
    orphan.subPath = 'widgets/sub';
    orphan.vars = {};
    orphan.views = [];
    orphan.fns = {};
    orphan._mountedSubPath = 'widgets/sub';
    var fakeInner = document.createElement('span');
    orphan._re = { _RealDOM: [fakeInner], renderAll: function () { } };
    // Neither orphan nor fakeInner is ever appended anywhere -- both
    // stay genuinely disconnected, matching the real, confirmed state.
    _vt.View.views.push(orphan);

    window.__renderHSTCalls = 0;
    document.getElementById('push-btn').click();
    return new Promise(function (resolve) { setTimeout(resolve, 100); });
}).then(function () {
    check('an orphaned, previously-mounted duplicate entry is never retried', window.__renderHSTCalls === 0, 'renderHST("widgets/sub", ...) called ' + window.__renderHSTCalls + ' times for the orphan');
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
