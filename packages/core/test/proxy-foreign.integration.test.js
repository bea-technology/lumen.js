// Regression: a view var holding a foreign Proxy (the BEA/RX SDK's `cookies` is one: its get trap calls
// encodeURIComponent(key), which throws on a Symbol key) must be readable through the reactive proxy.
// A brand check via Object.prototype.toString read Symbol.toStringTag on the foreign Proxy and threw
// "Cannot convert a Symbol value to a string" the moment the var was wrapped.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-foreign-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<span id="a">{{sdk.a}}</span> <span id="d">{{when.getFullYear()}}</span> <span id="p">{{typeof prom.then}}</span>
<script>
let sdk = new Proxy({ a: 'one' }, { get(t, k) { if (typeof k === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string'); return t[k]; } });
let when = new Date(2020, 1, 1);
let prom = Promise.resolve(1);
window.setA = function (v) { sdk.a = v; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(String(e && e.detail && e.detail.message || e.message)));
for (const m of ['error', 'warn', 'log']) vc.on(m, (...a) => errors.push(a.map((x) => String(x && x.message || x)).join(' ')));
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19979/', runScripts: 'dangerously', virtualConsole: vc,
    beforeParse(window) {
        window.URL.createObjectURL = () => 'blob:test';
        window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
        window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
        window.addEventListener('error', (e) => errors.push(String(e.message)));
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
const text = (id) => win.document.getElementById(id) && win.document.getElementById(id).textContent;

(async () => {
    await wait(500);
    check('foreign Proxy var renders', text('a') === 'one', text('a'));
    check('no Symbol-key error raised', !errors.some((e) => /Symbol/.test(e)), errors.join(' | '));
    check('Date var still usable (native, unwrapped)', text('d') === '2020', text('d'));
    check('Promise var still usable (native, unwrapped)', text('p') === 'function', text('p'));
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
