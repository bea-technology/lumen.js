// Regression guard for the reactive proxy's child-proxy cache: reading the same
// nested value twice must return the same proxy (stable identity), and one
// array reachable under two keys must keep updating both bindings after a
// mutation through either path. Also covers the scope evaluator cache: the
// same expression text rendered under different loop-variable scopes.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-proxyident-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="o">{{box.x.length}}|{{box.y.length}}</p>
<ul id="A"><li :for="rows as r">{{r.name}}</li></ul>
<ul id="B"><li :for="rows as item">{{item.name}}</li></ul>
<script>
let box = { x: [1], y: null };
let rows = [{ name: 'a' }, { name: 'b' }];
window.share = function () { box.y = box.x; };
window.pushX = function () { box.x.push(8); };
window.pushY = function () { box.y.push(9); };
window.ident = function () { return { arr: box.x === box.x, obj: box === box, row: rows[0] === rows[0], other: box.x !== rows }; };
window.rename = function (v) { rows[0].name = v; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19988/', runScripts: 'dangerously',
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

(async () => {
    await wait(500);
    const txt = (id) => [...win.document.querySelectorAll('#' + id + ' li')].map((l) => l.textContent.trim()).join('|');
    const o = win.ident();
    check('same array read twice is the same proxy', o.arr, JSON.stringify(o));
    check('same object read twice is the same proxy', o.obj);
    check('same row read twice is the same proxy', o.row);
    check('different values are different proxies', o.other);
    check('initial render', win.document.getElementById('o').textContent === '1|', win.document.getElementById('o').textContent);

    win.share();
    await wait(200);
    check('array shared under a second key renders under both', win.document.getElementById('o').textContent === '1|1', win.document.getElementById('o').textContent);
    win.pushX();
    await wait(200);
    check('mutation through the first key updates both bindings', win.document.getElementById('o').textContent === '2|2', win.document.getElementById('o').textContent);
    win.pushY();
    await wait(200);
    check('mutation through the second key updates both bindings', win.document.getElementById('o').textContent === '3|3', win.document.getElementById('o').textContent);

    check('same expression under two loop variables, first loop', txt('A') === 'a|b', txt('A'));
    check('same expression under two loop variables, second loop', txt('B') === 'a|b', txt('B'));
    win.rename('z');
    await wait(200);
    check('in-place rename reaches both loops', txt('A') === 'z|b' && txt('B') === 'z|b', txt('A') + ' / ' + txt('B'));

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
