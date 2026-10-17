// Regression: V1 let a pure dotted path index arrays and digit-led keys (`{{rows.0.name}}`). eval() cannot parse
// that, so V2 logged "expression error ... Unexpected number" for every such mustache (cloud.bea: dozens per page)
// even though the dotted-path fallback still produced the value. The value must render and nothing may be logged.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-numpath-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<span id="a">{{rows.0.name}}</span> <span id="b">{{cfg.specs.2.Value}}</span> <span id="c">{{cfg.map.1st}}</span> <span id="d">{{rows.1.name}}</span>
<script>
let rows = [{ name: 'first' }, { name: 'second' }];
let cfg = { specs: [{ Value: 'x' }, { Value: 'y' }, { Value: 'z' }], map: { '1st': 'digit-led' } };
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
    url: 'http://127.0.0.1:19978/', runScripts: 'dangerously', virtualConsole: vc,
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
_lumenDevMode = true;
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
    check('rows.0.name renders', text('a') === 'first', text('a'));
    check('specs.2.Value renders', text('b') === 'z', text('b'));
    check('digit-led key renders', text('c') === 'digit-led', text('c'));
    check('rows.1.name renders', text('d') === 'second', text('d'));
    check('no expression error logged', !errors.some((e) => /expression error|Unexpected number/.test(e)), errors.join(' | ').slice(0, 300));
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
