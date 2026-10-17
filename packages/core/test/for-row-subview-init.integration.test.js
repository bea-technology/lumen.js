// @init on a sub-view inside a :for row (the V2 replacement for :data on sub-views): the handler gets the row's
// own scope as its third argument — `function rowInit(ev, el, row) { return { rowName: row.rowName }; }`. It got an
// empty object (the row alias lives on the row's section-view vars, not yet in vrs), so every card rendered blank.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-forinit-')));
fs.mkdirSync(root + '/src/views/parts', { recursive: true });
fs.writeFileSync(root + '/src/views/parts/rowcard.view', '<span class="rc">card:{{ rowName }}#{{ i }}</span>');
fs.writeFileSync(root + '/src/views/home.view', `<div id="rows"><div class="sub" :for="names as rowName" view="parts/rowcard" @init="rowInit"></div></div>
<div id="objs"><div class="sub2" :for="people as p" view="parts/rowcard" @init="objInit"></div></div>
<script>
var names = ['n1', 'n2'];
var people = [{ n: 'Ann' }, { n: 'Bob' }];
function rowInit(ev, el, row) { return { rowName: row && row.rowName, i: row && row.index }; }
function objInit(ev, el, row) { return { rowName: row && row.p && row.p.n, i: row && row.index }; }
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19994/', runScripts: 'dangerously',
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
    const txt = (sel) => Array.from(win.document.querySelectorAll(sel)).map((e) => e.textContent).join();
    await wait(800);
    check('@init on a :for-row sub-view receives the row alias and index', txt('#rows .rc') === 'card:n1#0,card:n2#1', txt('#rows .rc'));
    check('works with an object row alias too', txt('#objs .rc') === 'card:Ann#0,card:Bob#1', txt('#objs .rc'));
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
