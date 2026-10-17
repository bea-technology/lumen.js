// `:if` and `:for` on the same element apply in the order they are written — the earlier attribute has priority
// (user rule, 2026-10-02). `<li :if="show" :for="items as i">` gates the whole loop (V1 does this too);
// `<li :for="items as i" :if="i > 1">` loops first and filters each row (V1 rendered nothing here). V2 let the LAST
// directive decide the element's type, so the other was silently dropped: the gate was ignored and the per-row
// form lost its loop. Checked for view markup (fcs.js) and runtime [reactive] chunks (reactive.js).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-iforder-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<ul id="gate"><li :if="show" :for="items as i">{{i}}</li></ul>
<ul id="row"><li :for="items as i" :if="i > 1">{{i}}</li></ul>
<ul id="both"><li :for="items as i" :for-if="i > 1" :if="i < 4">{{i}}</li></ul>
<p id="solo"><b :if="show">on</b><b :else>off</b></p>
<div id="host"></div>
<script>
var items = [1, 2, 3, 4];
var show = true;
window.setShow = function (v) { show = v; };
window.addItem = function () { items.push(5); };
window.addChunk = function () {
  document.getElementById('host').insertAdjacentHTML('beforeend', '<div reactive><ul id="rg"><li :if="show" :for="items as i">{{i}}</li></ul><ul id="rr"><li :for="items as i" :if="i > 2">{{i}}</li></ul></div>');
};
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19984/', runScripts: 'dangerously',
    beforeParse(window) {
        window.URL.createObjectURL = () => 'blob:test';
        window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
        window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
    }
});
const win = dom.window;
win.__payload = { hstFormatVersion: 1, views, layouts: {}, tpls: {} };
win.eval(`
_vcD = window.__payload;
_csswrk.isStarted = function () { return true; };
_initialized = true;
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__" };
renderView('home', false, {});
`);

const results = [];
function check(name, cond, detail) { results.push({ name, cond: !!cond, detail }); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => win.document.querySelector(s);
const log = () => win.eval('log.join()');
const reset = () => win.eval('log.length = 0');

(async () => {
    const txt = (sel) => Array.from(win.document.querySelectorAll(sel + ' li')).map((e) => e.textContent).join(',');
    await wait(600);
    check(':if before :for gates the whole loop (shown)', txt('#gate') === '1,2,3,4', txt('#gate'));
    check(':for before :if filters each row', txt('#row') === '2,3,4', txt('#row'));
    check(':for-if and a later :if combine per row', txt('#both') === '2,3', txt('#both'));
    check('a plain :if / :else is unaffected', $('#solo').textContent === 'on', $('#solo').textContent);
    win.addChunk(); await wait(300);
    check('runtime [reactive] chunk: :if before :for gates the loop', txt('#rg') === '1,2,3,4', txt('#rg'));
    check('runtime [reactive] chunk: :for before :if filters rows', txt('#rr') === '3,4', txt('#rr'));
    win.setShow(false); await wait(200);
    check('flipping the gate hides the whole loop', txt('#gate') === '' && txt('#rg') === '', txt('#gate') + ' | ' + txt('#rg'));
    check('...and the plain :else shows', $('#solo').textContent === 'off', $('#solo').textContent);
    win.setShow(true); await wait(200);
    check('flipping it back renders the loop again', txt('#gate') === '1,2,3,4', txt('#gate'));
    win.addItem(); await wait(200);
    check('per-row :if applies to new rows', txt('#row') === '2,3,4,5' && txt('#both') === '2,3', txt('#row') + ' | ' + txt('#both'));
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
