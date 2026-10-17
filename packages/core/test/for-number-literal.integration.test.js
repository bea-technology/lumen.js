// Regression test for the 2026-09-21 (cont'd) fix: a number-based
// :for="N" loop (V1's real, documented "loop N times" pattern, e.g.
// `<div :for="3">Item {{index}}</div>`) only ever rendered N-1 items,
// always missing index 0 specifically. Found on a real lumenjs.com guide
// page and confirmed to only affect this exact pattern — array-based
// :for loops (objects, non-empty strings) were never affected.
//
// Root cause, traced via direct instrumentation (not guessed): the item-
// building loop (updateLXRs) was always correct, producing a real
// 3-element array [0, 1, 2] every time. The bug was in compareArrays(),
// which used `if (!element2)` to decide whether an index is "missing" in
// the new array — but for a number-based :for, item VALUES are the raw
// numbers 0, 1, 2 themselves, and the number 0 is falsy. `!0 === true`,
// so index 0 was misclassified as needing a "remove" action instead of
// "add" — createSection() was never called for it, on every single
// render, forever. Array-based :for loops never hit this since real item
// values there (objects, non-empty strings) are always truthy.
//
// Fixed with strict `=== undefined` checks — the only thing that
// actually means "this index doesn't exist in this array" (a real `null`
// item stays correctly treated as present, not missing).
//
// Fixture: real fcs.js parser output for a minimal `:for="3"` view, same
// established discipline as every other *.integration.test.js.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/for-number-literal.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/for-number-literal.layouts.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19997/', runScripts: 'dangerously',
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
    return new Promise(function (resolve) { setTimeout(resolve, 200); });
}).then(function () {
    var el = document.getElementById('target');
    var items = [].slice.call(el.children).map(function (c) { return c.textContent.trim(); });
    check(':for="3" renders exactly 3 items, not 2', items.length === 3, JSON.stringify(items));
    check('item 0 specifically is present (the actual bug -- it was always the missing one)', items.indexOf('Item 0') !== -1, JSON.stringify(items));
    check('items render in correct order', items.join(',') === 'Item 0,Item 1,Item 2', items.join(','));
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
