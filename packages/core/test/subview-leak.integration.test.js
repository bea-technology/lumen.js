// Regression test for the 2026-09-21 (cont'd) fix: _mountedSubviewEngines
// (_re.js) grows unbounded — every re-mount of the same logical subview
// slot (a `view=` attribute re-firing) pushed a NEW entry without ever
// removing the old, now-orphaned one. On a real page (lumenjs.com's
// /guide/loops) this had accumulated 94 entries, and since EVERY Global
// var write walks the whole array calling .update() on each entry, this
// caused 925 update("globals") calls for a handful of real writes and a
// multi-second real render time — the user's own report: "the :for loops
// page is very bad in terms of performance, seconds to render."
//
// Fixed by making the walk in _dispatchVarsUpdate's Global-write branch
// self-cleaning: an entry whose own rendered DOM is no longer connected
// to the document (the newer mount's `el.innerHTML = ""` already wiped
// it) is definitively stale and gets spliced out during the same pass
// that would have called .update() on it.
//
// Fixture: real fcs.js parser output for a minimal view that switches
// between two subviews via a reactive `view="{{target}}"` attribute,
// same established discipline as every other *.integration.test.js.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/subview-leak.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/subview-leak.layouts.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19994/', runScripts: 'dangerously',
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

async function clickSwitchAndWait() {
    document.getElementById('switch-btn').click();
    await new Promise(function (resolve) { setTimeout(resolve, 60); });
}

renderView('home', false, {}).then(async function () {
    var el = document.getElementById('sub-content');
    check('initial subview shows A', el && el.textContent.trim() === 'A', el && el.textContent);

    for (var i = 0; i < 10; i++) {
        await clickSwitchAndWait();
    }

    var elAfter = document.getElementById('sub-content');
    check('subview content still correct after 10 switches (A/B alternates, 10 switches = back to A)', elAfter && elAfter.textContent.trim() === 'A', elAfter && elAfter.textContent);

    // Pruning is lazy -- it happens as a side effect of walking the array
    // during a Global var write, not eagerly on every subview switch (the
    // switches above use a VIEW-scoped var, target, which never touches
    // this array's walk at all). This matches the real page: pruning
    // there happens naturally as index.js's own real Global writes fire
    // during normal page load, not as a separate mechanism.
    var updateCalls = [];
    var currentRe = document.getElementById('slot').querySelector('#sub-content')._ownerRe;
    if (currentRe) {
        var origUpdate = currentRe.update.bind(currentRe);
        currentRe.update = function (k) { updateCalls.push(k); return origUpdate(k); };
    }
    globals.someVar = "test";
    await new Promise(function (resolve) { resolve(); });
    check('a Global var write still reaches the currently-mounted subview after pruning', updateCalls.indexOf('globals') !== -1, JSON.stringify(updateCalls));

    check('_mountedSubviewEngines is pruned down to a small, sane count after a Global write walks it (not left at 10+)', _mountedSubviewEngines.length <= 2, _mountedSubviewEngines.length);

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
