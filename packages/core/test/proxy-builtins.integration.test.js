// Regression: reactive proxies must only wrap plain objects and arrays. Objects with internal slots
// (Promise, Date, Map, Set, RegExp, typed arrays, DOM nodes, ...) throw "incompatible receiver" /
// "this is not a Date object" when their methods run with a Proxy as `this`. V1 had no deep proxy, so V1
// sites do this routinely (e.g. `bea._prom.then(...)` where `bea` is a Global var set in index.js).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-proxybuiltin-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="o">{{holder.o.x}} {{holder.arr.length}}</p>
<script>
let holder = {
    p: Promise.resolve(42),
    d: new Date(86400000),
    m: new Map([[1, 'one']]),
    s: new Set([7]),
    re: /a+/g,
    t: new Uint8Array(3),
    el: document.body,
    o: { x: 1 },
    arr: [1, 2]
};
window.probe = async function () {
    const out = {};
    const t = async (name, fn) => { try { out[name] = String(await fn()); } catch (e) { out[name] = 'THREW: ' + e.message; } };
    await t('promise.then', () => holder.p.then((v) => v + 1));
    await t('await promise', () => holder.p);
    await t('date.getTime', () => holder.d.getTime());
    await t('map.get', () => holder.m.get(1));
    await t('set.has', () => holder.s.has(7));
    await t('regexp.test', () => holder.re.test('caat'));
    await t('typed.length', () => holder.t.length);
    await t('dom.tagName', () => holder.el.tagName);
    return out;
};
window.bumpPlain = function () { holder.o.x = 2; holder.arr.push(3); };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19985/', runScripts: 'dangerously',
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
    check('initial render of plain nested object + array', win.document.getElementById('o').textContent === '1 2', win.document.getElementById('o').textContent);
    const o = await win.probe();
    const eq = (k, want) => check(k + ' -> ' + want, o[k] === want, o[k]);
    eq('promise.then', '43');
    eq('await promise', '42');
    eq('date.getTime', '86400000');
    eq('map.get', 'one');
    eq('set.has', 'true');
    eq('regexp.test', 'true');
    eq('typed.length', '3');
    eq('dom.tagName', 'BODY');
    win.bumpPlain();
    await wait(300);
    check('plain nested object and array stay reactive', win.document.getElementById('o').textContent === '2 3', win.document.getElementById('o').textContent);

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
