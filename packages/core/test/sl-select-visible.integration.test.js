// V1 parity, found by mac-beacdn on console.roxyon.com (2026-10-03): createEl() ran the plugin auto-init BEFORE the
// element was attached; select2 inserts its visible container with $el.after(), a silent no-op on a parentless
// node, so the <select> was hidden (select2-hidden-accessible) with no .select2-container — and initSl's
// "already initialised" guard skipped it forever. Every [sl] select vanished. Real Select2 + jQuery, loaded before
// the runtime as `lm serve` / `lm build` emit them.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));
const pluginsEsbuild = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'plugins-esbuild-plugin.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-slvisible-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="x">{{label}}</p>
<div id="wrap"><select id="s" sl sl-prt="self"><option value="a">A</option><option value="b">B</option></select></div>
<div id="rows"><div class="r" :for="rows as r"><select class="rs" sl><option>{{r}}</option></select></div></div>
<script>
var label = 'one';
var rows = [];
window.setLabel = function (v) { label = v; };
window.addRows = function () { rows = ['x', 'y']; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

(async () => {
const coreSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const pluginsSrc = await pluginsEsbuild.buildSelectedPluginsBundle(pluginsEsbuild.selectedRegistryEntries({ select2: '*' }), path.join(__dirname, '..'));
const bundleSrc = coreSrc;
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${pluginsSrc}</script><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19982/', runScripts: 'dangerously',
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

    await wait(800);
    const jq = win.jQuery;
    check('real jQuery + Select2 loaded', !!(jq && jq.fn && jq.fn.select2));
    const cont = () => win.document.querySelectorAll('#wrap .select2-container').length;
    check('the [sl] select is initialised', $('#s').classList.contains('select2-hidden-accessible'));
    check('and its visible .select2-container exists next to it', cont() === 1, $('#wrap').innerHTML.slice(0, 200));
    win.setLabel('two'); await wait(200);
    check('the container survives a later reactive update (still exactly one)', cont() === 1 && $('#x').textContent === 'two', cont());
    win.addRows(); await wait(600);
    const rs = win.document.querySelectorAll('#rows .r');
    check('[sl] selects created later inside :for rows get their containers too', rs.length === 2 && Array.from(rs).every((r) => r.querySelectorAll('.select2-container').length === 1), Array.from(rs).map((r) => r.querySelectorAll('.select2-container').length).join());
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
