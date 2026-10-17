// V1 parity: an inline @-event expression is eval'd inside evalEvAttr(ev, el, n, arg1..3), so `el`, `ev`, `n` are in
// scope (`@click="save(el, ev)"`, `@click="el.addClass('on')"`, `@keydown="ev.key == 'Enter' && go()"` — 35 V1
// sites). V2 evaluated it without them: ReferenceError, swallowed, the handler silently never ran.
// Also: a nested write or array mutation from an inline handler (`city.name = 'x'`, `tags.push(1)`) must re-render,
// and a :for row's own alias/index must still resolve inside its handlers — including on the :for element itself
// (`<li :for="rows as r" @click="picked = r.id">`, created by the loop's owner engine, which knew no `r`).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-inline-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<button id="b1" data-k="K1" @click="withEl(el, ev)">a</button>
<button id="b2" @click="el.addClass('was-clicked')">b</button>
<input id="k" @keydown="logIt('kd:' + ev.key + ':' + n)">
<button id="b3" @click="city.name = 'Paris'; tags.push(9)">c</button>
<p id="city">{{city.name}}/{{tags.join(',')}}</p>
<ul id="rows"><li :for="rows as r"><button class="pick" @click="pick(r.id, index)">{{r.id}}</button></li></ul>
<button id="b4" @click="count++">d</button><i id="count">{{count}}</i>
<ul id="sel"><li class="opt" :for="rows as r" @click="picked = r.id">{{r.id}}</li></ul><b id="picked">{{picked}}</b>
<ul id="named"><li class="opt2" :for="rows as r" @click="onRow">{{r.id}}</li></ul>
<script>
var city = { name: 'Rome' };
var tags = [1];
var rows = [{ id: 'r1' }, { id: 'r2' }];
var count = 0;
var picked = '';
function onRow(ev, el) { logIt('row:' + el.text()); }
var log = [];
function logIt(s) { log.push(s); }
function withEl(el, ev) { logIt('withEl:' + (el && el.attr ? el.attr('data-k') : 'no-el') + ':' + (ev && ev.type)); }
function pick(id, i) { logIt('pick:' + id + ':' + i); }
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
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
const log = () => win.eval('log.join()');
const reset = () => win.eval('log.length = 0');

(async () => {
    await wait(500);
    check('view rendered', $('#city') && $('#city').textContent === 'Rome/1', $('#city') && $('#city').textContent);

    $('#b1').click(); await wait(50);
    check('@click="fn(el, ev)" receives the element wrapper and the event', log() === 'withEl:K1:click', log());

    $('#b2').click(); await wait(50);
    check('@click="el.addClass(..)" runs against the clicked element', $('#b2').classList.contains('was-clicked'), $('#b2').className);

    reset();
    $('#k').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(50);
    check('inline @keydown sees ev.key and n (the event name)', log() === 'kd:Enter:keydown', log());

    $('#b3').click(); await wait(100);
    check('inline nested-prop write and array push re-render', $('#city').textContent === 'Paris/1,9', $('#city').textContent);

    reset(); win.document.querySelectorAll('.pick')[1].click(); await wait(50);
    check(':for row handler still resolves the row alias and index', log() === 'pick:r2:1', log());

    $('#b4').click(); await wait(100);
    check('inline write to a plain reactive var still works', $('#count').textContent === '1', $('#count').textContent);

    win.document.querySelectorAll('.opt')[1].click(); await wait(100);
    check('@click on the :for element itself reads the row alias and writes the view var', $('#picked').textContent === 'r2', $('#picked').textContent);
    reset(); win.document.querySelectorAll('.opt2')[0].click(); await wait(50);
    check('a named @click on the :for element still finds the view function', log() === 'row:r1', log());

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
