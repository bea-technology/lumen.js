// HST v3 (2026-10-03): `lm build` ships every view <script> already rewritten (fcs.precompileViewScripts), with
// `_vt.__LMROOT__` for the mount's scope path, and cuts acorn/astring/walk.js out of the runtime it ships
// (fcs.stripDevOnlyRuntime). This renders the same pages twice — dev (source scripts, full runtime) and production
// (precompiled scripts, trimmed runtime) — and requires identical DOM and behaviour, including a sub-view mounted
// twice (two scope paths), a script inside an :if section, a tpl row template with a script, and @click handlers.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-precompiled-')));
fs.mkdirSync(root + '/src/views/parts', { recursive: true });
fs.mkdirSync(root + '/src/tpls', { recursive: true });
fs.writeFileSync(root + '/src/tpls/row.tpl', '<b class="tr">{{it.n}}</b><script>window.__rowRuns = (window.__rowRuns || 0) + 1;</script>');
fs.writeFileSync(root + '/src/views/parts/counter.view', '<span class="ctr"><b class="v">{{ ctr }}</b><button class="inc" @click="inc()">+</button></span><script>var ctr = 1; function inc() { ctr = ctr + 1; }</script>');
fs.writeFileSync(root + '/src/views/home.view', `<div id="app-root">
  <h1 id="t" title="{{title}}">{{title}}</h1>
  <p id="cnt">{{items.length}} {{box.n}}</p>
  <ul id="list"><li :for="items as it" data-n="{{it.n}}" @click="pick(it.n)">{{it.n}}</li></ul>
  <div id="tp"><div :for="items as it" tpl="row"></div></div>
  <div id="twice"><div class="t1" view="parts/counter"></div><div class="t2" view="parts/counter"></div></div>
  <div id="gated" :if="items.length > 0"><i id="g">{{gate}}</i><script>window.__sectionRan = (window.__sectionRan || 0) + 1;</script></div>
  <button id="add" @click="addItem()">add</button>
</div>
<script>
var title = 'Hello';
var gate = 'open';
var box = { n: 1 };
var items = [{ n: 'a' }, { n: 'b' }];
var picked = [];
function addItem() { items.push({ n: 'c' }); title = 'Changed'; box.n = 2; }
function pick(n) { picked.push(n); window.__picked = picked.join(); }
</script>`);
const cwd = process.cwd();
process.chdir(root);
const tpls = fcs.readTemplates(root);
const views = fcs.linkTemplateReactiveVars(fcs.getAllFiles(root + '/src/views/', {}, false, true), tpls);
process.chdir(cwd);
const pViews = JSON.parse(JSON.stringify(views)), pTpls = JSON.parse(JSON.stringify(tpls));
const failed = fcs.precompileViewScripts([{ kind: 'views', files: pViews }, { kind: 'layouts', files: {} }, { kind: 'tpls', files: pTpls }]);
const prodViews = JSON.parse(JSON.stringify(pViews, fcs.compactHstReplacer));
const prodTpls = JSON.parse(JSON.stringify(pTpls, fcs.compactHstReplacer));

const results = [];
function check(name, cond, detail) { results.push({ name, cond: !!cond, detail }); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fullRuntime = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const prodRuntime = fcs.stripDevOnlyRuntime(fullRuntime);

function boot(runtime, v, t, version) {
    const dom = new JSDOM(`<!doctype html><body><div app></div><script>${runtime}</script></body>`, {
        url: 'http://127.0.0.1:19980/', runScripts: 'dangerously',
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
            window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
        }
    });
    const w = dom.window;
    w.__payload = { hstFormatVersion: version, views: v, layouts: {}, tpls: t };
    w.eval(`_vcD = window.__payload; _csswrk.isStarted = function () { return true; }; _initialized = true;
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__" }; renderView('home', false, {});`);
    return w;
}
const norm = (h) => h.replace(/\s(vuid|_dd)="[^"]*"/g, '');
const appHtml = (w) => norm(w.document.querySelector('[app]').innerHTML.replace(/<script>[\s\S]*?<\/script>/g, '<script></script>'));

(async () => {
    const all = JSON.stringify(pViews) + JSON.stringify(pTpls);
    check('every script was precompiled', failed === 0, 'failed: ' + failed);
    check('build output carries `pre` and no source/AST for those scripts', /"pre":/.test(all) && !/"jst":/.test(all) && !/function addItem\(\) \{ items/.test(all.replace(/"pre":"[^"]*"/g, '')));
    check('the production runtime has no acorn / astring / walk.js', prodRuntime.length < fullRuntime.length - 100000 && !/__lmDevOnlyStart__/.test(prodRuntime) && !/function getWatcher\(/.test(prodRuntime), fullRuntime.length + ' -> ' + prodRuntime.length);

    const D = boot(fullRuntime, views, tpls, 3), P = boot(prodRuntime, prodViews, prodTpls, 3);
    await wait(900);
    check('production runtime really lacks the compiler', P.eval('typeof acorn') === 'undefined' && P.eval('typeof getWatcher') === 'undefined', P.eval('typeof acorn') + ' ' + P.eval('typeof getWatcher'));
    const d1 = appHtml(D), p1 = appHtml(P);
    check('precompiled production page renders the same DOM as dev', d1 === p1 && d1.length > 300, d1.length + ' vs ' + p1.length);
    check('scripts ran: top level, tpl rows, :if section', P.document.querySelector('#t').textContent === 'Hello' && P.__rowRuns === 2 && P.__sectionRan === 1, [P.document.querySelector('#t').textContent, P.__rowRuns, P.__sectionRan].join());
    for (const w of [D, P]) {
        w.document.querySelector('#twice .t1 .inc').click();
        w.document.querySelectorAll('#list li')[1].click();
        w.document.querySelector('#add').click();
    }
    await wait(300);
    const d2 = appHtml(D), p2 = appHtml(P);
    check('after clicks and reactive updates both are still identical', d2 === p2, d2.length + ' vs ' + p2.length);
    const ctrs = Array.from(P.document.querySelectorAll('#twice .v')).map((e) => e.textContent).join();
    check('each sub-view instance writes its own scope (2,1)', ctrs === '2,1', ctrs);
    check('@click handlers, nested writes and list growth work in production', P.__picked === 'b' && P.document.querySelectorAll('#list li').length === 3 && P.document.querySelector('#cnt').textContent === '3 2' && P.document.querySelector('#t').getAttribute('title') === 'Changed', [P.__picked, P.document.querySelectorAll('#list li').length, P.document.querySelector('#cnt').textContent].join(' | '));

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
