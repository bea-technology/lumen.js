// Decision (2026-10-02): a bare `stop` attribute stops propagation on EVERY handler. V1 was inconsistent — 13
// handlers (h/s, modal, gestures, ...) tested presence, 5 (incl. the generic @event processEv) tested the value,
// so a bare `stop` on an @click did nothing. No V1 site writes stop="value"; all 8 uses are bare.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-barestop-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<div id="parent" @click="logIt('parent')">
<button id="bare" stop @click="logIt('bare')">bare stop</button>
<button id="val" stop="1" @click="logIt('val')">stop="1"</button>
<button id="none" @click="logIt('none')">no stop</button>
</div>
<p>{{n}}</p>
<script>
var n = 1;
var log = [];
function logIt(s) { log.push(s); }
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19985/', runScripts: 'dangerously',
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
    await wait(500);
    $('#none').click(); await wait(50);
    check('without stop the click reaches the parent @click', log() === 'none,parent', log());
    reset(); $('#bare').click(); await wait(50);
    check('bare stop stops propagation on an @click', log() === 'bare', log());
    reset(); $('#val').click(); await wait(50);
    check('stop="1" still stops propagation', log() === 'val', log());
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
