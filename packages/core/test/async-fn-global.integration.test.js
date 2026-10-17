// V1 parity: `async function` / `function*` declared in a view <script> were window globals in V1 (scripts ran
// unwrapped). V2 runs the script inside `try { ... }`, where only PLAIN function declarations still become globals
// (Annex B); async and generator ones stayed block-scoped, so `onclick="save()"`, other scripts and window lookups
// could not find them (14 V1 sites declare async handlers in views).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-asyncfn-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="res">{{res}}</p>
<button id="named" @click="asyncHandler">a</button>
<button id="inline" @click="asyncWithArg('x')">b</button>
<button id="native" onclick="asyncWithArg('native')">c</button>
<script>
var res = 'none';
function syncFn() { return 1; }
async function asyncHandler(ev, el) { await null; res = 'named:' + (ev && ev.type); }
async function asyncWithArg(a) { await null; res = 'arg:' + a; }
function* genFn() { yield 7; }
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19989/', runScripts: 'dangerously',
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
    check('plain function is a window global', win.eval('typeof window.syncFn') === 'function');
    check('async function is a window global', win.eval('typeof window.asyncHandler') === 'function', win.eval('typeof window.asyncHandler'));
    check('generator function is a window global', win.eval('typeof window.genFn') === 'function' && win.eval('window.genFn().next().value') === 7, win.eval('typeof window.genFn'));
    $('#named').click(); await wait(100);
    check('@click="asyncHandler" runs and re-renders', $('#res').textContent === 'named:click', $('#res').textContent);
    $('#inline').click(); await wait(100);
    check('@click="asyncWithArg(..)" runs', $('#res').textContent === 'arg:x', $('#res').textContent);
    $('#native').click(); await wait(100);
    check('native onclick= can call a view async function', $('#res').textContent === 'arg:native', $('#res').textContent);
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
