// V1 parity (checked against the real V1 CLI): a sub-view reads the page's variables by name, so when the page
// changes one (inline or in a function) every sub-view and sub-sub-view showing it re-renders. V2 had two gaps:
// (1) a name only the sub-view displays was never made reactive in the host, so the host's writes notified
// nothing; (2) view-variable changes never re-rendered mounted sub-views at all.
// Also: with the same sub-view mounted twice, `@click="inc()"` must run the CLICKED instance's function (it ran
// the last-mounted instance's window.inc).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-subflow-')));
fs.mkdirSync(root + '/src/views/parts/deep', { recursive: true });
fs.writeFileSync(root + '/src/views/parts/child.view', '<div class="child"><b class="c">child of {{ childName }}</b><div view="parts/deep/grand"></div></div>');
fs.writeFileSync(root + '/src/views/parts/deep/grand.view', '<i class="g">grand sees {{ childName }}</i>');
fs.writeFileSync(root + '/src/views/parts/counter.view', '<span class="ctr"><b class="v">{{ ctr }}</b><button class="inc" @click="inc()">+</button></span><script>var ctr = 1; function inc() { ctr = ctr + 1; }</script>');
fs.writeFileSync(root + '/src/views/home.view', `<div id="chain"><div view="parts/child"></div></div>
<button id="inline" @click="childName = 'Zoe'">inline</button>
<button id="fn" @click="rename('Max')">fn</button>
<div id="twice"><div class="t1" view="parts/counter"></div><div class="t2" view="parts/counter"></div></div>
<script>
var childName = 'Ann';
function rename(n) { childName = n; }
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.linkTemplateReactiveVars(fcs.getAllFiles(root + '/src/views/', {}, false, true), {});
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19991/', runScripts: 'dangerously',
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
    const txt = (sel) => Array.from(win.document.querySelectorAll(sel)).map((e) => e.textContent.trim()).join('|');
    await wait(800);
    check('sub-view and sub-sub-view render the page var', txt('#chain .c, #chain .g') === 'child of Ann|grand sees Ann', txt('#chain .c, #chain .g'));
    $('#fn').click(); await wait(200);
    check('a write in a page function reaches the sub-view and sub-sub-view', txt('#chain .c, #chain .g') === 'child of Max|grand sees Max', txt('#chain .c, #chain .g'));
    $('#inline').click(); await wait(200);
    check('an inline page write reaches them too', txt('#chain .c, #chain .g') === 'child of Zoe|grand sees Zoe', txt('#chain .c, #chain .g'));
    win.document.querySelector('#twice .t1 .inc').click(); await wait(200);
    check('@click="inc()" on the first instance updates the first instance', txt('#twice .v') === '2|1', txt('#twice .v'));
    win.document.querySelector('#twice .t2 .inc').click(); await wait(200);
    check('and on the second instance, the second', txt('#twice .v') === '2|2', txt('#twice .v'));
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
