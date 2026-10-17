// Decision (2026-10-02): wait() / resume() only pause and resume rendering (`_initialized`); they never show or
// hide the loader — the developer triggers `_loader` from their own logic. Canonical V1 core.js does exactly this;
// V2 had copied a 2023 V1 variant that also showed the loader, which left an overlay up on pages calling wait().
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-waitresume-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="x">{{n}}</p>
<script>
var n = 1;
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19999/', runScripts: 'dangerously',
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
    const loaderOn = () => !!win.document.querySelector('[loader]');
    check('no loader before wait()', !loaderOn());
    win.eval('wait()');
    check('wait() pauses rendering', win.eval('_initialized') === false, String(win.eval('_initialized')));
    check('wait() does not show the loader', !loaderOn(), win.document.querySelector('[loader]') && win.document.querySelector('[loader]').outerHTML.slice(0, 80));
    win.eval('_loader.show()');
    win.eval('resume()');
    check('resume() resumes rendering', win.eval('_initialized') === true, String(win.eval('_initialized')));
    check('resume() leaves a loader the developer showed alone', loaderOn());
    win.eval('_loader.hide()');
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
