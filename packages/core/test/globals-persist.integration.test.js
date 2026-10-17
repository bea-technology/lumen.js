// V1 parity (checked against the real V1 CLI across a page reload): `globals` is written to localStorage["globals"]
// whenever it changes, nested changes included, so it survives a reload and reaches other tabs. V2 had that save
// commented out ("NEED TO TURN ON"), so every globals change was lost on reload.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-globals-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="x">{{globals.name}}</p>
<script>
window.setName = function (v) { globals.name = v; };
window.pushDeep = function () { globals.deep = { list: [1] }; globals.deep.list.push(2); };
window.replaceAll = function () { globals = { fresh: true }; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19990/', runScripts: 'dangerously',
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
    const saved = () => JSON.parse(win.localStorage.getItem('globals') || 'null');
    win.setName('Ann'); await wait(50);
    check('a globals property write is saved to localStorage', saved() && saved().name === 'Ann', JSON.stringify(saved()));
    check('the page still renders it', $('#x').textContent === 'Ann', $('#x').textContent);
    win.pushDeep(); await wait(50);
    check('nested changes are saved', saved() && JSON.stringify(saved().deep) === '{"list":[1,2]}', JSON.stringify(saved()));
    win.replaceAll(); await wait(50);
    check('reassigning globals is saved', JSON.stringify(saved()) === '{"fresh":true}', JSON.stringify(saved()));
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
