// Bundle size (2026-10-03): `lm build` now ships view <script>s as source (parsed with the bundled acorn at mount)
// instead of an ESTree, drops the unused per-mustache ASTs, and omits empty HST fields (fcs.compactHstReplacer); the
// runtime restores the defaults once per payload (_lmHstDefaults). console.roxyon.com's app.js went 7.9 MB -> 2.4 MB.
// This proves the compact build payload renders and behaves exactly like the full one, and that a script only the
// lenient parser accepts is shipped as an AST (the path every 2.4.x script used) and its view still renders.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-compact-')));
fs.mkdirSync(root + '/src/views/parts', { recursive: true });
fs.mkdirSync(root + '/src/tpls', { recursive: true });
fs.writeFileSync(root + '/src/tpls/row.tpl', '<b class="tr">{{it.n}}</b><i :if="it.on">on</i><i :else>off</i>');
fs.writeFileSync(root + '/src/views/parts/child.view', '<div class="child">child of {{ who }} <span class="cl">{{ local }}</span></div><script>var local = "L";</script>');
fs.writeFileSync(root + '/src/views/home.view', `<div id="app-root" class="a b">
  <h1 title="{{title}}">{{title}} &amp; more</h1>
  <p id="cnt">[{{items.length}}] [{{2+3}}]</p>
  <ul id="list"><li :for="items as it" data-n="{{it.n}}" class="row">{{it.n}}: <em :if="it.on">yes</em><em :else>no</em></li></ul>
  <div id="tp"><div :for="items as it" tpl="row"></div></div>
  <input id="inp" value="{{title}}" disabled>
  <br>
  <div id="sv" view="parts/child"></div>
  <button id="btn" @click="addItem()">add</button>
  <button id="tog" @click="items[0].on = !items[0].on">toggle</button>
  <svg id="svg" viewBox="0 0 10 10"><circle :for="items as it" r="{{it.n.length}}"/></svg>
</div>
<script>
var title = 'Hello';
var who = 'Ann';
var items = [{ n: 'a', on: true }, { n: 'bb', on: false }];
function addItem() { items.push({ n: 'ccc', on: true }); title = 'Changed'; who = 'Max'; }
</script>`);
fs.writeFileSync(root + '/src/views/loose.view', `<p id="lz">{{lz}}</p>
<script>
var lz = 'before';
window.__looseRan = true;
lz = 'after' +;
</script>`);
const cwd = process.cwd();
process.chdir(root);
const tpls = fcs.readTemplates(root);
const full = fcs.linkTemplateReactiveVars(fcs.getAllFiles(root + '/src/views/', {}, false, true), tpls);
process.chdir(cwd);
const compact = JSON.parse(JSON.stringify(full, fcs.compactHstReplacer));
const compactTpls = JSON.parse(JSON.stringify(tpls, fcs.compactHstReplacer));

const results = [];
function check(name, cond, detail) { results.push({ name, cond: !!cond, detail }); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

function boot(views, tplsPayload, viewName, version) {
    const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
        url: 'http://127.0.0.1:19981/', runScripts: 'dangerously',
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
            window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
        }
    });
    const win = dom.window;
    win.__payload = { hstFormatVersion: version, views, layouts: {}, tpls: tplsPayload };
    win.eval(`
_vcD = window.__payload;
_csswrk.isStarted = function () { return true; };
_initialized = true;
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__" };
renderView('${viewName}', false, {});
`);
    return win;
}
const norm = (h) => h.replace(/\s(vuid|_dd)="[^"]*"/g, '');
const homeKey = Object.keys(full).find((k) => /home\.view$/.test(Buffer.from(k, 'base64').toString()));
const looseKey = Object.keys(full).find((k) => /loose\.view$/.test(Buffer.from(k, 'base64').toString()));

(async () => {
    const fullStr = JSON.stringify(full), compStr = JSON.stringify(compact);
    check('compiler: no per-mustache ASTs and no script AST for a valid script', !/"jst"/.test(JSON.stringify(full[homeKey])), JSON.stringify(full[homeKey]).match(/"jst"/g));
    check('compiler: a valid view script ships as its source text', /function addItem\(\)/.test(JSON.stringify(full[homeKey])));
    check('compiler: a script only acorn-loose accepts ships an AST', /"jst"/.test(JSON.stringify(full[looseKey])));
    check('compact payload is smaller than the full one', compStr.length < fullStr.length * 0.9, fullStr.length + ' -> ' + compStr.length);

    const A = boot(full, tpls, 'home', 2), B = boot(compact, compactTpls, 'home', 2);
    await wait(700);
    const a1 = norm(A.document.querySelector('[app]').innerHTML), b1 = norm(B.document.querySelector('[app]').innerHTML);
    check('compact payload renders the same DOM as the full payload', a1 === b1 && a1.length > 200, a1.length + ' vs ' + b1.length);
    check('the view script (shipped as source) ran: mustaches, loops, tpl rows, sub-view, svg', !!B.document.querySelector('#cnt') && B.document.querySelector('#cnt').textContent === '[2] [5]' && B.document.querySelectorAll('#list li').length === 2 && B.document.querySelectorAll('#tp .tr').length === 2 && /child of Ann/.test(B.document.querySelector('#sv').textContent) && B.document.querySelector('#svg circle').namespaceURI === 'http://www.w3.org/2000/svg', String(B.document.querySelector('[app]').textContent).replace(/\s+/g, ' ').slice(0, 200));
    for (const w of [A, B]) { const b = w.document.querySelector('#btn'), t = w.document.querySelector('#tog'); if (b) b.click(); if (t) t.click(); }
    await wait(300);
    const a2 = norm(A.document.querySelector('[app]').innerHTML), b2 = norm(B.document.querySelector('[app]').innerHTML);
    check('after events and reactive updates both are still identical', a2 === b2, a2.length + ' vs ' + b2.length);
    check('...and the updates happened (row added, title, sub-view var, toggle)', B.document.querySelectorAll('#list li').length === 3 && !!B.document.querySelector('h1') && B.document.querySelector('h1').getAttribute('title') === 'Changed' && /child of Max/.test(B.document.querySelector('#sv').textContent) && /a: no/.test(B.document.querySelector('#list').textContent), String(B.document.querySelector('#list') && B.document.querySelector('#list').textContent).replace(/\s+/g, ' '));

    const L = boot(compact, compactTpls, 'loose', 2);
    await wait(500);
    // A script with a real syntax error never ran in V1 either (the browser rejects the block); what matters is that
    // the AST fallback path is the one 2.4.x always used and the view itself still renders.
    check('a lenient-parser-only script takes the AST path and the view still renders', !!L.document.querySelector('#lz'), L.document.querySelector('[app]').innerHTML.slice(0, 120));

    const V1 = boot(full, tpls, 'home', 1);
    await wait(500);
    check('a v1-stamped payload still renders on this runtime', V1.document.querySelector('#cnt') && V1.document.querySelector('#cnt').textContent === '[2] [5]');

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
