// A view containing `<script src="...">` (no inline body) crashed the whole view render in walk()
// (`doc.children[0]` undefined). V1 loaded the external script and rendered the rest of the view normally.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-scriptsrc-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="t">[{{lbl}}]</p>
<script src="data:text/javascript,window.__extLoaded=1"></script>
<script>
var lbl = 'rendered';
</script>
<p id="after">after</p>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19977/', runScripts: 'dangerously',
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
const text = (id) => win.document.getElementById(id).textContent;

(async () => {
    await wait(500);
    const d = win.document;
    check('view renders past an external <script src>', d.getElementById('after') && d.getElementById('after').textContent === 'after');
    check('inline script + mustache still work', text('t') === '[rendered]', text('t'));
    const sc = Array.from(d.querySelectorAll('script')).find((x) => /extLoaded/.test(x.getAttribute('src') || ''));
    check('the external script element is kept with its src', !!sc && !sc.textContent.trim(), sc && sc.outerHTML);

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
