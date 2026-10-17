// V1 parity (checked against the real V1 CLI): a mustache that reads no reactive variable ({{2+3}}, {{Math.max(..)}},
// {{"a"+"b"}}, data-a="{{1+1}}") rendered its value in V1. In V2 it never got an effect (effects were registered per
// reactive variable only), so it stayed blank forever.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-const-mustache-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="c">[{{2+3}}][{{Math.max(2,5)}}][{{(1234.567).toFixed(2)}}][{{"a"+"b"}}][{{parseInt("42")}}]</p>
<p id="m">[{{cnt + 1}}][{{2*3}}]</p>
<div id="a" data-a="{{1+1}}" data-b="x{{cnt}}-{{3+4}}"></div>
<textarea id="t">{{5+5}}</textarea>
<script>
var cnt = 1;
window.bump = function () { cnt++; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19988/', runScripts: 'dangerously',
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
    check('constant-only mustaches render their value', $('#c').textContent === '[5][5][1234.57][ab][42]', $('#c').textContent);
    check('constant next to a reactive mustache', $('#m').textContent === '[2][6]', $('#m').textContent);
    check('constant-only attribute', $('#a').getAttribute('data-a') === '2', $('#a').getAttribute('data-a'));
    check('mixed attribute', $('#a').getAttribute('data-b') === 'x1-7', $('#a').getAttribute('data-b'));
    check('constant in a textarea', $('#t').value === '10', $('#t').value);
    win.bump(); await wait(150);
    check('reactive parts still update, constants keep their value', $('#m').textContent === '[3][6]' && $('#a').getAttribute('data-b') === 'x2-7', $('#m').textContent + ' ' + $('#a').getAttribute('data-b'));
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
