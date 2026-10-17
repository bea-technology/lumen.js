// Regression test for the 2026-09-22 mustache-HTML feature: matching
// real V1 behavior (confirmed by reading V1's own real source directly,
// SBEACDN/s.beacdn.com/beajs/re.js), a mustache whose rendered value
// looks like real HTML markup or a named/numeric entity now renders as
// real, parsed markup instead of always-escaped text — a deliberate,
// explicit choice (the user was asked and chose "match V1" knowing the
// XSS tradeoff), not the framework's previous default.
//
// This fixture is deliberately loop-free — a real, confirmed, PRE-
// EXISTING render-cascade bug (documented elsewhere this session, e.g.
// the 2026-09-21 [view]-cascade/double-mount entries) causes `:for`-
// bound content to sometimes render duplicate DOM subtrees; that bug
// makes duplicate identical *text* invisible (same string overwrites
// itself) but duplicate *inserted <span> clones* visible, which is what
// surfaced testing this feature against the real, loop-based
// /guide/storage/cookies demo page. This fixture isolates the actual
// mustache-HTML mechanism from that unrelated, already-tracked bug.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/html-mustache.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/html-mustache.layouts.hst.json'), 'utf8'));

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

renderView('home', false, {}).then(function () {
    return new Promise(function (resolve) { setTimeout(resolve, 100); });
}).then(function () {
    var plainEl = document.getElementById('plain-target');
    check('a plain-text mustache value ("1 < 2 and 3 > 1") stays real, safe text (no false-positive HTML sniff)', plainEl && plainEl.textContent === '1 < 2 and 3 > 1', plainEl && JSON.stringify(plainEl.innerHTML));
    check('a plain-text mustache value is not parsed into any element', plainEl && plainEl.querySelector('span') === null);

    var htmlEl = document.getElementById('html-target');
    var styledSpan = htmlEl && htmlEl.querySelector('span.x');
    check('an HTML-shaped mustache value renders as a real, parsed element', !!styledSpan, htmlEl && htmlEl.innerHTML);
    check('the real element has the real text content from inside the markup', styledSpan && styledSpan.textContent === 'styled', styledSpan && styledSpan.textContent);
    check('exactly one clone exists (no duplicate insertion)', htmlEl && htmlEl.querySelectorAll('span.x').length === 1, htmlEl && htmlEl.querySelectorAll('span.x').length);

    document.getElementById('toggle-btn').click();
    return new Promise(function (resolve) { setTimeout(resolve, 100); });
}).then(function () {
    var htmlEl = document.getElementById('html-target');
    check('toggling to a plain-text value removes the old HTML clone and falls back to safe text', htmlEl && htmlEl.textContent.trim() === 'plain again' && htmlEl.querySelector('span') === null, htmlEl && htmlEl.innerHTML);

    document.getElementById('toggle-btn').click();
    return new Promise(function (resolve) { setTimeout(resolve, 100); });
}).then(function () {
    var htmlEl = document.getElementById('html-target');
    var span = htmlEl && htmlEl.querySelector('span.y');
    // #html-target itself is a real <span> from the fixture's own
    // template, so exactly one real clone means exactly TWO <span>
    // elements total here: the fixture's own wrapper plus the one clone.
    check('toggling back to an HTML value creates exactly one new clone, not a leftover stack', !!span && htmlEl.querySelectorAll('span').length === 2, htmlEl && htmlEl.innerHTML);
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
