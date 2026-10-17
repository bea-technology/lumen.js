// Regression test for the 2026-09-21 (cont'd) performance fix: :for's
// "add" action loop used to await createSection() SEQUENTIALLY, one item
// at a time. createSection() -> renderSection() -> renderHST() does a
// real async round trip through the CSS worker whenever a section
// carries scoped CSS — for N new items that's N sequential round trips,
// and a nested :for compounds this multiplicatively. Fixed by creating
// every "add" section for a pass in PARALLEL (Promise.all) instead.
//
// Two things verified here, both real risks of that kind of change:
// 1. Items are actually created CONCURRENTLY, not just batched-then-
//    sequential — proven by giving each item's creation a RANDOM delay
//    and confirming total time is close to the SLOWEST single item, not
//    the SUM of all of them.
// 2. Final DOM order matches array order EXACTLY, even when items
//    resolve in a scrambled order (the slowest ones finishing before the
//    fastest, deliberately) — Promise.all() preserves input order in its
//    result regardless of resolution order, and insertion iterates that
//    preserved order, not resolution order.
//
// Fixture: real fcs.js parser output for a `:for="items as item"` view,
// same established discipline as every other *.integration.test.js.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/parallel-add.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/parallel-add.layouts.hst.json'), 'utf8'));

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

// Deliberately scrambled per-item delays -- item 0 (first in array order)
// is the SLOWEST to resolve, item 7 (last) is the FASTEST. If insertion
// followed RESOLUTION order instead of ARRAY order, item 7 would land
// before item 0 in the DOM. Also proves real concurrency: 8 items with
// delays [70,10,60,20,50,30,40,5]ms would take 285ms summed sequentially,
// but well under 100ms if truly run in parallel.
var delays = [70, 10, 60, 20, 50, 30, 40, 5];
var callOrder = [];
var origCreateSection = _lm.prototype.createSection;
_lm.prototype.createSection = function (cx, vx, isObj, forX) {
    var self = this;
    var args = arguments;
    var delay = delays[vx.index] !== undefined ? delays[vx.index] : 0;
    callOrder.push(vx.index);
    return new Promise(function (resolve) {
        setTimeout(function () {
            resolve(origCreateSection.apply(self, args));
        }, delay);
    });
};

var t0 = performance.now();
renderView('home', false, {}).then(function () {
    return new Promise(function (resolve) { setTimeout(resolve, 150); });
}).then(function () {
    var elapsed = performance.now() - t0;
    check('all items resolved well under the sequential-sum time (concurrency proof)', elapsed < 250, elapsed + 'ms (sequential sum would be ~285ms + overhead)');

    var el = document.getElementById('target');
    var texts = [].slice.call(el.children).map(function (c) { return c.textContent.trim(); });
    check('all 8 items rendered', texts.length === 8, JSON.stringify(texts));
    check('DOM order matches array order (0..7), NOT resolution order, despite item 0 being slowest and item 7 fastest', texts.join(',') === '0,1,2,3,4,5,6,7', texts.join(','));

    window.__done = true;
}).catch(function (e) {
    window.__results.push({ name: 'no uncaught error', cond: false, detail: e.message + '\\n' + e.stack });
    window.__done = true;
});
`;

const scriptEl = win.document.createElement('script');
scriptEl.textContent = mainScript;
win.document.body.appendChild(scriptEl);

const deadline = Date.now() + 8000;
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
