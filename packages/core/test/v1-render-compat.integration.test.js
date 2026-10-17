// Three render-behavior gaps found running the unmodified V1 lumenjs.com
// site on V2:
//  1. A subview nested inside another subview rendered before its parent's
//     <script> had run (the parent's DOM wasn't connected yet), so it read
//     undeclared data (`footerData is not defined` on ~8 guide pages).
//  2. `items = data; items[i].extra = x` in the same tick: updates arriving
//     while the first :for pass was still in flight were skipped by the
//     re-entrancy guard and never re-run, and a bare :for row only
//     refreshed the array's name, not the item keys its mustaches use.
//  3. A text mustache naming something that exists nowhere (V1 prose/code
//     samples — V1 left mustaches outside bind= literal) rendered blank.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-v1render-')));
const w = (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s); };
w('src/views/home.view', `<div view="mid"></div>
<ul id="L"><li :for="items">{{name}}:{{extra}}</li></ul>
<p id="lit">The {{ ghostVar }} syntax interpolates a value.</p>
<script>
var items = [];
setTimeout(function () {
    items = [{ name: "a" }, { name: "b" }];
    for (var i = 0; i < items.length; i++) { items[i]['extra'] = 'X' + i; }
}, 30);
</script>`);
w('src/views/mid.view', `<div view="leaf"></div>
<script>var leafData = { v: "ok" };</script>`);
w('src/views/leaf.view', `<b id="leaf">{{leafData.v}}</b>`);

const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
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
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__" };
renderView('home', false, {});
`);

setTimeout(() => {
    const d = win.document;
    const results = [];
    const check = (name, cond, detail) => results.push({ name, cond: !!cond, detail });
    const leaf = d.getElementById('leaf');
    check('nested subview reads its parent subview\'s script data', leaf && leaf.textContent === 'ok', leaf ? JSON.stringify(leaf.textContent) : 'no #leaf');
    const rows = [...d.querySelectorAll('#L li')].map(li => li.textContent);
    check('bare :for picks up item keys added in the same tick as the assignment', rows.join(',') === 'a:X0,b:X1', JSON.stringify(rows));
    const lit = d.getElementById('lit');
    check('a mustache naming something defined nowhere stays literal (V1 behavior)', lit && /\{\{\s*ghostVar\s*\}\}/.test(lit.textContent) && !/\{\{\{\{/.test(lit.textContent), lit && JSON.stringify(lit.textContent));
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}, 900);
