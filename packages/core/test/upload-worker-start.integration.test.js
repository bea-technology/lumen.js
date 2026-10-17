// V1 parity: V1 started its upload worker at boot, so an [up] element reported files-added / upload-progress / ...
// to its @-handlers. V2 never started it (`_upwrk.start()` commented out since the first V2 commit), so no upload
// event ever fired. Now it starts when the page first gets an uploader. (The worker round-trip itself is verified in
// real Chrome; jsdom cannot run a Worker.) Also: an uploader inside a runtime-inserted [reactive] chunk is initialized
// like V1, which ran globalWatch() (and so renderPlugins()) in the pass that rendered the chunk.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-upworker-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="x">{{n}}</p><div id="host"></div>
<script>
var n = 1;
window.addUploader = function () { document.getElementById('host').insertAdjacentHTML('beforeend', '<div reactive><div id="up" up @files-added="onFiles"><div drpzn></div></div></div>'); };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19993/', runScripts: 'dangerously',
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
    await wait(600);
    check('no uploader on the page: the upload worker is not started', win.eval('_upwrk.isStarted()') === false, String(win.eval('_upwrk.isStarted()')));
    win.eval('window.__upStarts = 0; var _origStart = _upwrk.start; _upwrk.start = function () { window.__upStarts++; return _origStart.apply(this, arguments); };');
    win.addUploader();
    for (let i = 0; i < 30 && !$('#up').hasAttribute('upid'); i++) await wait(50);
    check('an [up] inside a runtime [reactive] chunk is initialized (upid + file input)', $('#up').hasAttribute('upid') && !!$('#up input[type=file]'), $('#up').outerHTML.slice(0, 160));
    check('the upload worker is started once an uploader exists', win.eval('window.__upStarts') >= 1, String(win.eval('window.__upStarts')));
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
