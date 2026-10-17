// Regression test for a real, severe, framework-wide bug found 2026-09-22:
// typing into ANY plain text input (no data-pattern/max/min-num/max-num
// attribute at all — the overwhelming majority of real inputs) cleared
// the field on every single keystroke, making every form on a real site
// unusable. Confirmed on a real guide page: typing "Abdul" character by
// character left the input empty after every single character.
//
// Root cause: checkFormInputs() (vendor/reconnecting-websocket.js), wired
// to a global delegated "change keyup" listener on every input/textarea/
// select, reads `pat = el.data("pattern")` (undefined when absent) and
// `max`/`min_num`/`max_num` via el.attr(...) (null when absent), then
// checked presence with `x != ""` — which is TRUE for both `undefined`
// and `null` (neither loosely equals an empty string). The pattern
// branch then built `new RegExp(undefined)`, a regex that literally
// matches the word "undefined" and nothing else a user could ever type,
// so pattern validation always "failed" and called el.val("") — clearing
// the field on every keystroke, even with zero data-pattern attribute
// anywhere in sight. The max/min-num/max-num branches had the identical
// bug via a different mechanism: `isNaN(null) === false` (since
// `Number(null) === 0`, not NaN), so `x != "" && !isNaN(x)` was ALSO
// true for a missing attribute. Fixed with real truthy checks — only
// validate when the attribute genuinely exists.
//
// Fixture: real fcs.js parser output for a minimal form with a plain
// input (no validation attributes) and a data-pattern="" input (an empty
// but PRESENT attribute, which should still validate normally, not be
// treated as absent) — same established discipline as every other
// *.integration.test.js.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/checkform-inputs.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/checkform-inputs.layouts.hst.json'), 'utf8'));

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
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__" };

renderView('home', false, {}).then(function () {
    var el = document.getElementById('plain-input');
    // Simulate real typing: value changes first (matching real browser
    // native text insertion), THEN the keyup event fires -- exactly the
    // sequence checkFormInputs()'s global delegated listener reacts to.
    var chars = ['A', 'Ab', 'Abd', 'Abdu', 'Abdul'];
    for (var i = 0; i < chars.length; i++) {
        el.value = chars[i];
        el.dispatchEvent(new window.Event('keyup', { bubbles: true }));
    }
    check('typing into a plain input (no validation attrs) is NOT cleared after each keystroke', el.value === 'Abdul', el.value);

    var el2 = document.getElementById('numlike-input');
    el2.value = 'hello';
    el2.dispatchEvent(new window.Event('keyup', { bubbles: true }));
    check('an input with an empty-but-PRESENT data-pattern is not wiped either (no pattern check applies since it evaluates to an empty regex, matching everything)', el2.value === 'hello', el2.value);

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
