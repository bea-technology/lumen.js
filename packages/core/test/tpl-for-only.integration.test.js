// tpl= renders a template once per :for row, in the row's scope: `<li :for="articles as a" tpl="article">`
// (decided 2026-10-02). It must NOT work anywhere else — V1's plain-element form `<div tpl="row" :data="rows">`
// and comp= (deprecated) render nothing and report a clear [LumenJS] error naming the change to make, so a
// migrating site's leftovers are found instead of silently half-working. Also: the template's own <style> and
// <script> still apply, a leading-slash name resolves, a template may live in src/comps/, and an async host
// assignment re-renders the rows (fcs.js linkTemplateReactiveVars() made the template's names reactive).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

function buildFixture() {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-tplcomp-')));
    const w = (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s); };
    w('src/tpls/article.tpl', `<b class="art">{{a.Title}}</b><i class="hint">{{hint}}</i>
<style>.art{color:rgb(255, 0, 0)}</style>
<script>window.__tplScriptRuns = (window.__tplScriptRuns || 0) + 1;</script>`);
    w('src/tpls/row.tpl', `<span :for="rows as r" class="row">{{r}}</span>`);
    w('src/comps/card.tpl', `<b class="card">{{c.t}}</b>`);
    w('src/layouts/default.layout', `<main body></main>`);
    w('src/views/home.view', `<div id="arts"><div :for="articles as a" tpl="article"></div></div>
<div id="slash"><p :for="cards as c" tpl="/card"></p></div>
<div id="plain" tpl="row" :data="rows"></div>
<div id="comp" comp="card"></div>
<div id="compfor"><p :for="cards as c" comp="card"></p></div>
<script>
var articles = [];
var rows = ["x", "y"];
var cards = [{ t: "C1" }];
var hint = "h";
setTimeout(function () { articles = [{ Title: "A" }, { Title: "B" }]; }, 60);
</script>`);
    const cwd = process.cwd();
    process.chdir(root);
    try {
        const tpls = fcs.readTemplates(root);
        const views = fcs.linkTemplateReactiveVars(fcs.getAllFiles(root + '/src/views/', {}, false, true), tpls);
        const layouts = fcs.annotateLayoutRegions(fcs.getAllFiles(root + '/src/layouts/', {}, false, true));
        return { views, layouts, tpls };
    } finally { process.chdir(cwd); }
}

const { views, layouts, tpls } = buildFixture();
const homeKey = Buffer.from('src/views/home.view').toString('base64');
const results = [];
function check(name, cond, detail) { results.push({ name, cond: !!cond, detail }); }
check('compiler linked the :for template\'s names into the host view', ['articles', 'hint'].every(v => views[homeKey].reactiveVars.includes(v)), JSON.stringify(views[homeKey].reactiveVars));

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19994/', runScripts: 'dangerously',
    beforeParse(window) {
        window.URL.createObjectURL = () => 'blob:test';
        window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
        window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
        window.__errs = [];
        const ce = window.console.error.bind(window.console);
        window.console.error = function () { window.__errs.push([].join.call(arguments, ' ')); };
    }
});
const win = dom.window;
win.__payload = { hstFormatVersion: 1, views, layouts, tpls };
win.eval(`
_vcD = window.__payload;
_csswrk.isStarted = function () { return true; };
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__" };
renderView('home', false, {});
`);

// Poll (up to 5 s) instead of one fixed delay: row templates render asynchronously, slower on a loaded machine.
const __t0 = Date.now();
(function __poll() {
    if (win.document.querySelectorAll('#arts .art').length < 2 && Date.now() - __t0 < 5000) return setTimeout(__poll, 100);
    const d = win.document;
    const texts = sel => [...d.querySelectorAll(sel)].map(n => n.textContent.trim());
    const errs = (win.__errs || []).join('\n');
    check('tpl= on a :for renders one template per row, after an async host assignment', texts('#arts .art').join(',') === 'A,B', JSON.stringify(texts('#arts .art')));
    check('the template reads host vars too', texts('#arts .hint').join(',') === 'h,h', JSON.stringify(texts('#arts .hint')));
    check('a leading-slash name resolves, and a template may live in src/comps/', texts('#slash .card').join() === 'C1', JSON.stringify(texts('#slash .card')));
    check('the template\'s own <style> is applied', [...d.querySelectorAll('style')].some(s => s.textContent.includes('.art')));
    check('the template\'s own <script> ran', win.__tplScriptRuns >= 1, 'runs=' + win.__tplScriptRuns);
    check('tpl= on a plain element renders nothing', d.getElementById('plain') && d.getElementById('plain').children.length === 0 && !d.querySelector('#plain .row'), d.getElementById('plain') && d.getElementById('plain').outerHTML);
    check('...and reports what to change', /tpl="row".*only works on a :for loop element/.test(errs), errs.slice(0, 300));
    check('comp= on a plain element renders nothing', d.getElementById('comp') && d.getElementById('comp').children.length === 0);
    check('comp= on a :for row renders nothing', !d.querySelector('#compfor .card'), d.getElementById('compfor').innerHTML.slice(0, 120));
    check('...and comp= reports that it is no longer supported (once per element)', (errs.match(/comp="card".*no longer supported/g) || []).length === 2, errs.slice(0, 400));
    check('no leftover tpl/comp attributes on plain elements', !d.querySelector('#plain[tpl],#comp[comp]'));
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
