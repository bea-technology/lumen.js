// V1 parity (V1 re.js createClone): an object item's own fields are spread into the row's scope in EVERY :for —
// with or without `as alias` — so `:for="sectors as sector"` can still say `{{Text}}` / `{{Category}}` (dv2's
// sector cards). V2 spread them only for the bare `:for="sectors"` form; `{{Text}}` then resolved to the DOM's
// Text constructor ("Failed to construct 'Text'") and the cards rendered empty.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-aliasspread-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<div class="r" :for="sectors as sector" data-cat="_\`{{Category}}\`"><b>{{Name}}</b>|<i>{{Text}}</i>|<u>{{sector.Name}}</u>|<s>{{index}}</s></div>
<div class="m" :for="matrix as row">{{row.length}}</div>
<script>
var sectors = [{ Name: 'Transport', Text: '36% Total', Category: 'emission' }, { Name: 'Industry', Text: '52% Total', Category: 'gdp' }];
var matrix = [[1, 2], [3]];
window.editFirst = function () { sectors[0].Text = '40% Total'; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19998/', runScripts: 'dangerously',
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
    const txt = (sel) => Array.from(win.document.querySelectorAll(sel)).map((e) => e.textContent).join(' / ');
    await wait(600);
    check('aliased loop: item fields are in row scope, alias and index still work', txt('.r') === 'Transport|36% Total|Transport|0 / Industry|52% Total|Industry|1', txt('.r'));
    check('item fields in attributes of the loop element', Array.from(win.document.querySelectorAll('.r')).map((e) => e.getAttribute('data-cat')).join() === '_emission,_gdp', Array.from(win.document.querySelectorAll('.r')).map((e) => e.getAttribute('data-cat')).join());
    check('array items are not spread (only plain objects, as V1)', txt('.m') === '2 / 1', txt('.m'));
    win.editFirst(); await wait(200);
    check('editing a field of an aliased row refreshes the bare-field mustache', txt('.r').indexOf('Transport|40% Total') === 0, txt('.r'));
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
