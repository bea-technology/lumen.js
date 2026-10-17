// V1 parity: V1 bridged Select2's select2:select / select2:unselect on an [sl] element to sl-select / sl-unselect
// and ran the element's @sl-select / @sl-unselect handler (ev, el, data). V2 had neither the bridge nor the
// handlers, so @sl-select never fired. Runs against the real Select2 + jQuery selective plugin bundle, loaded
// before the runtime as `lm serve` / `lm build` emit it.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));
const pluginsEsbuild = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'plugins-esbuild-plugin.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-slselect-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="x">{{picked}}</p>
<select id="s" sl multiple @sl-select="onSl" @sl-unselect="offSl(el, arg1)"><option value="a">A</option><option value="b">B</option></select>
<script>
var picked = '';
var log = [];
function onSl(ev, el, data) { log.push('sel:' + (data && data.id) + ':' + (ev.params && ev.params.data && ev.params.data.id)); picked = data && data.id; }
function offSl(el, data) { log.push('unsel:' + (data && data.id)); }
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
    url: 'http://127.0.0.1:19992/', runScripts: 'dangerously',
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

    await wait(600);
    const jq = win.jQuery;
    check('real jQuery + Select2 loaded', !!(jq && jq.fn && jq.fn.select2));
    jq('#s').trigger({ type: 'select2:select', params: { data: { id: 'b', text: 'B' } } }); await wait(100);
    check('select2:select runs @sl-select with (ev, el, data) and ev.params', log().indexOf('sel:b:b') > -1, log());
    check('the handler write re-renders', $('#x').textContent === 'b', $('#x').textContent);
    jq('#s').trigger({ type: 'select2:unselect', params: { data: { id: 'b' } } }); await wait(100);
    check('select2:unselect runs an inline @sl-unselect with the data as arg1', log().indexOf('unsel:b') > -1, log());
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
