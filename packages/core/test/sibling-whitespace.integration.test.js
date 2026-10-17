// Regression: whitespace between two sibling elements is a real text node in V1 (it is what separates
// inline/inline-block siblings and keeps newlines between inline siblings inside <pre>). V2's HST tokenizer
// dropped it, so every migrated V1 page rendered such rows a space-width tighter. It must also not disturb
// :if / :else-if / :else chains or :for sections that now have a text node between their branches.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-sibws-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<div id="chips"><span class="c">A</span>
  <span class="c">B</span> <span class="c">C</span></div>
<pre id="pre"><b>x</b>
<i>y</i></pre>
<div id="chain">
  <p :if="mode == 'a'">AAA</p>
  <p :else-if="mode == 'b'">BBB</p>
  <p :else>CCC</p>
</div>
<ul id="rows">
  <li :for="rows as r">{{r}}</li>
</ul>
<div id="tail"><i>one</i> <i>two</i></div>
<script>
let mode = 'a';
let rows = ['x', 'y'];
window.setMode = function (m) { mode = m; };
window.setRows = function (r) { rows = r; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19986/', runScripts: 'dangerously',
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
const textNodes = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue);
const visible = (id) => [...win.document.querySelectorAll('#' + id + ' p')].map((p) => p.textContent.trim());

(async () => {
    await wait(500);
    const chips = $('#chips');
    check('chips: a whitespace text node sits between B and C (the V1 inline gap)',
        chips.innerHTML.includes('B</span> <span'), chips.innerHTML);
    check('chips: and between A and B', /A<\/span>\s+<span/.test(chips.innerHTML), chips.innerHTML);
    check('tail: single space kept between two inline siblings', $('#tail').innerHTML.includes('</i> <i>'), $('#tail').innerHTML);
    check('pre: the newline between inline siblings survives', $('#pre').textContent === 'x\ny', JSON.stringify($('#pre').textContent));

    check('chain: mode a shows only AAA', visible('chain').join('|') === 'AAA', JSON.stringify(visible('chain')));
    win.setMode('b');
    await wait(300);
    check('chain: else-if branch shows only BBB', visible('chain').join('|') === 'BBB', JSON.stringify(visible('chain')));
    win.setMode('z');
    await wait(300);
    check('chain: else branch shows only CCC', visible('chain').join('|') === 'CCC', JSON.stringify(visible('chain')));
    win.setMode('a');
    await wait(300);
    check('chain: back to AAA, no duplicates', visible('chain').join('|') === 'AAA', JSON.stringify(visible('chain')));

    const rows = () => [...win.document.querySelectorAll('#rows li')].map((l) => l.textContent.trim());
    check('for: rows render with whitespace around the section', rows().join('|') === 'x|y', JSON.stringify(rows()));
    win.setRows(['p', 'q', 'r']);
    await wait(300);
    check('for: update adds a row', rows().join('|') === 'p|q|r', JSON.stringify(rows()));
    win.setRows([]);
    await wait(300);
    check('for: clearing removes every row', rows().length === 0, JSON.stringify(rows()));

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
