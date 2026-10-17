// Regression: enumerating a reactive array/object proxy (Object.keys/entries,
// for-in, spread, Object.assign, getOwnPropertyDescriptor) must not throw.
// The proxy's getOwnPropertyDescriptor trap reported every property as
// configurable, which violates the Proxy invariant for an array's own
// non-configurable 'length' and made V8 throw a TypeError.
// Regression: an existing :for row must re-render its content when the item
// at that index changes (in-place mutation or whole-array replacement).
// Each row's view.vars used to stay frozen at the first-render item and,
// having top priority in getVal(), shadowed the fresh data forever; add and
// remove worked, content updates did not.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-proxydesc-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="o">ready {{arr.length}} {{obj.a}}</p>
<script>
let arr = [1, 2, 3];
let obj = { a: 1, b: 2 };
window.probe = function () {
    const out = {};
    const t = (name, fn) => { try { out[name] = fn(); } catch (e) { out[name] = 'THREW: ' + e.message; } };
    t('arrKeys', () => Object.keys(arr).join(','));
    t('arrEntries', () => Object.entries(arr).map((e) => e.join(':')).join(','));
    t('arrForIn', () => { const k = []; for (const i in arr) k.push(i); return k.join(','); });
    t('arrSpreadObj', () => Object.keys({ ...arr }).join(','));
    t('arrAssign', () => JSON.stringify(Object.assign({}, arr)));
    t('arrDescLength', () => { const d = Object.getOwnPropertyDescriptor(arr, 'length'); return d.value + ':' + d.enumerable + ':' + d.configurable; });
    t('arrIter', () => [...arr].join(','));
    t('objKeys', () => Object.keys(obj).join(','));
    t('objEntries', () => Object.entries(obj).map((e) => e.join(':')).join(','));
    t('objSpread', () => JSON.stringify({ ...obj }));
    t('objDesc', () => { const d = Object.getOwnPropertyDescriptor(obj, 'a'); return d.value + ':' + d.enumerable; });
    return out;
};
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19990/', runScripts: 'dangerously',
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
    const o = win.probe();
    const eq = (k, want) => check(k + ' -> ' + want, o[k] === want, String(o[k]));
    eq('arrKeys', '0,1,2');
    eq('arrEntries', '0:1,1:2,2:3');
    eq('arrForIn', '0,1,2');
    eq('arrSpreadObj', '0,1,2');
    eq('arrAssign', '{"0":1,"1":2,"2":3}');
    eq('arrDescLength', '3:false:false');
    eq('arrIter', '1,2,3');
    eq('objKeys', 'a,b');
    eq('objEntries', 'a:1,b:2');
    eq('objSpread', '{"a":1,"b":2}');
    eq('objDesc', '1:true');

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
