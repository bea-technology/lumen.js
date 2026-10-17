// V1 parity: :for-limit / :for-offset written as mustaches (`:for-offset="{{(current - 1) * 15}}"`, ~100 uses across
// the V1 sites' pagers) were read raw by V2: "{{...}}" * 1 is NaN, so the list rendered EMPTY. V1 rendered the
// attribute mustaches first. The loop must also re-render when a var used only in those attributes changes.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-forpager-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<ul id="pager"><li :for="nums as x" :for-limit="3" :for-offset="{{(current - 1) * 3}}">{{x}}</li></ul>
<ul id="vars"><li :for="nums as x" :for-limit="{{lim}}" :for-offset="{{off}}">{{x}}</li></ul>
<ul id="plain"><li :for="nums as x" :for-limit="2" :for-offset="8">{{x}}</li></ul>
<ul id="ternary"><li :for="nums as x" :for-limit="{{big ? 1000 : 1}}">{{x}}</li></ul>
<script>
var nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
var current = 1;
var lim = 3;
var off = 0;
var big = false;
window.setv = function (k, v) { if (k == 'current') current = v; if (k == 'lim') lim = v; if (k == 'off') off = v; if (k == 'big') big = v; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19987/', runScripts: 'dangerously',
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
    const txt = (sel) => Array.from(win.document.querySelectorAll(sel + ' li')).map((e) => e.textContent).join();
    await wait(500);
    check('expression offset {{(current - 1) * 3}} renders page 1', txt('#pager') === '1,2,3', txt('#pager'));
    check('limit/offset from {{var}} mustaches', txt('#vars') === '1,2,3', txt('#vars'));
    check('plain numeric limit/offset unchanged', txt('#plain') === '9,10', txt('#plain'));
    check('ternary limit', txt('#ternary') === '1', txt('#ternary'));
    win.setv('current', 2); await wait(200);
    check('pager re-renders when `current` (used only in :for-offset) changes', txt('#pager') === '4,5,6', txt('#pager'));
    win.setv('off', 3); win.setv('lim', 2); await wait(200);
    check('limit/offset vars re-render on change', txt('#vars') === '4,5', txt('#vars'));
    win.setv('big', true); await wait(200);
    check('ternary limit re-renders', txt('#ternary') === '1,2,3,4,5,6,7,8,9,10', txt('#ternary'));

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
