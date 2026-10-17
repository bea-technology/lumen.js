// Regression: a subview's own top-level `let` must stay reactive when it is written from a function after the
// script has run (`window.bump = () => { label = 'x' }`, the everyday V1 pattern). Generated code writes it as
// `_vt.View.views[n].vars[x] = ...`, observed only if the reactive proxy wraps the subview HOST element. Restricting
// the proxy to plain objects/arrays (so Promise/Date/Map/DOM nodes keep working) stopped wrapping the host, and every
// such write silently stopped updating the page.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-sublocal-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<div id="host" view="sub"></div>`);
fs.writeFileSync(root + '/src/views/sub.view', `<span id="lbl">{{label}}</span> <span id="cnt">{{st.n}}</span> <ul id="items"><li :for="items as it">{{it}}</li></ul>
<script>
let label = 'hello';
let st = { n: 1 };
let items = ['a'];
window.setLabel = function (v) { label = v; };
window.setN = function (v) { st.n = v; };
window.addItem = function (v) { items.push(v); };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19980/', runScripts: 'dangerously',
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
const text = (id) => win.document.getElementById(id) && win.document.getElementById(id).textContent;
const items = () => [...win.document.querySelectorAll('#items li')].map((l) => l.textContent.trim()).join(',');

(async () => {
    await wait(500);
    check('initial render of subview locals', text('lbl') === 'hello' && text('cnt') === '1' && items() === 'a', text('lbl') + '/' + text('cnt') + '/' + items());

    win.setLabel('changed');
    await wait(300);
    check('scalar subview local written from a function re-renders', text('lbl') === 'changed', text('lbl'));

    win.setN(5);
    await wait(300);
    check('nested property of a subview local re-renders', text('cnt') === '5', text('cnt'));

    win.addItem('b');
    await wait(300);
    check('array push on a subview local re-renders its :for', items() === 'a,b', items());

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
