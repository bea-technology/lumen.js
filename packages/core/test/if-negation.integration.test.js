// V1 parity: a leading '!' in :if / :else-if negates the WHOLE remaining condition
// (`!a == 'x'` means `!(a == 'x')`), and a condition that throws counts as false
// before the negation (so `!list[0].hasOwnProperty('id')` is true while list is empty).
// Real V1 sites depend on both (`:if="!nodes[1] == 'error'"`, the "Loading.." idiom).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-ifneg-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<div id="cmp"><b :if="!kind == 'error'">NOT-ERROR</b><i :else>IS-ERROR</i></div>
<div id="load"><b :if="!list[0].hasOwnProperty('id')">LOADING</b><i :else>LOADED {{list[0].id}}</i></div>
<div id="and"><b :if="!a && b">NOT-BOTH</b><i :else>BOTH-OR-NOT-A</i></div>
<div id="chain"><b :if="p">P</b><i :else-if="!(x && y)">NOT-XY</i><u :else>XY</u></div>
<div id="dbl"><b :if="!!flag">FLAG</b><i :else>NOFLAG</i></div>
<div id="plain"><b :if="!flag">OFF</b><i :else>ON</i></div>
<script>
let kind = 'ok';
let list = [];
let a = true; let b = false;
let p = false; let x = true; let y = true;
let flag = true;
window.set = function (o) { if ('kind' in o) kind = o.kind; if ('list' in o) list = o.list; if ('a' in o) a = o.a; if ('b' in o) b = o.b; if ('p' in o) p = o.p; if ('x' in o) x = o.x; if ('y' in o) y = o.y; if ('flag' in o) flag = o.flag; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19987/', runScripts: 'dangerously',
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
const t = (id) => win.document.getElementById(id).textContent.replace(/\s+/g, ' ').trim();

(async () => {
    await wait(500);
    check('!kind == "error" is true for "ok"', t('cmp') === 'NOT-ERROR', t('cmp'));
    check('empty list: the throwing condition renders the "!" branch (Loading)', t('load') === 'LOADING', t('load'));
    check('!a && b is !(a && b): a=true b=false -> true', t('and') === 'NOT-BOTH', t('and'));
    check('else-if with !(x && y): x,y true -> else', t('chain') === 'XY', t('chain'));
    check('!!flag', t('dbl') === 'FLAG', t('dbl'));
    check('plain !flag still works', t('plain') === 'ON', t('plain'));

    win.set({ kind: 'error' });
    await wait(250);
    check('!kind == "error" is false for "error"', t('cmp') === 'IS-ERROR', t('cmp'));

    win.set({ list: [{ id: 7 }] });
    await wait(250);
    check('loaded list hides the Loading branch', t('load') === 'LOADED 7', t('load'));

    win.set({ b: true });
    await wait(250);
    check('!a && b with a=true b=true -> false', t('and') === 'BOTH-OR-NOT-A', t('and'));
    win.set({ a: false, b: false });
    await wait(250);
    check('!a && b with a=false b=false -> true', t('and') === 'NOT-BOTH', t('and'));

    win.set({ x: false });
    await wait(250);
    check('else-if !(x && y) with x=false -> NOT-XY', t('chain') === 'NOT-XY', t('chain'));

    win.set({ flag: false });
    await wait(250);
    check('!!flag false', t('dbl') === 'NOFLAG', t('dbl'));
    check('!flag true', t('plain') === 'OFF', t('plain'));

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
