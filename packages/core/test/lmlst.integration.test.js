// V1's <lmlst :config="..." @query="..."> data table/grid (core.js:5302-5717),
// ported into vendor/reconnecting-websocket.js. Driven through the real
// pipeline: compiled view -> renderView() -> globalWatch() ->
// renderPlugins() init -> @query("initiated") -> setData() -> page click
// -> @query("page-changed").
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-lmlst-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<lmlst id="L" :config="listConf" @query="loadList"></lmlst>
<script>
var listConf = { show: 2, total: 5, columns: { name: { title: "Name", sort: true } } };
function loadList(ev, el, list, config, type) {
    (window.__queries = window.__queries || []).push(type);
    var all = [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }, { name: "e" }];
    var start = (config.page - 1) * config.show;
    list.setData(all.slice(start, start + config.show));
}
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19993/', runScripts: 'dangerously',
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
const rowTexts = () => [...win.document.querySelectorAll('#L lmlst-body ul.p0')].map(u => u.textContent.replace(/\s+/g, ''));

setTimeout(() => {
    const L = win.document.getElementById('L');
    check('lmlst element exists and got a __myList instance', L && L.list && L.list.constructor.name === '__myList');
    check(':config was applied (show=2, total=5)', L && L.list && L.list.config.show === 2 && L.list.config.total === 5, L && L.list && JSON.stringify({ show: L.list.config.show, total: L.list.config.total }));
    check('@query fired with "initiated"', (win.__queries || [])[0] === 'initiated', JSON.stringify(win.__queries));
    check('first page rows rendered', rowTexts().join(',') === 'a,b', JSON.stringify(rowTexts()));
    check('sortable column header rendered', !!win.document.querySelector('#L [order][column="name"]'));
    const p2 = win.document.querySelector('#L lmlst-footer [page="2"]');
    check('pagination footer has a page-2 link', !!p2);
    if (p2) p2.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    setTimeout(() => {
        check('page click fired @query "page-changed"', (win.__queries || []).includes('page-changed'), JSON.stringify(win.__queries));
        check('second page rows rendered', rowTexts().join(',') === 'c,d', JSON.stringify(rowTexts()));
        let threw = false;
        const stray = win.document.createElement('span'); stray.setAttribute('page', '3'); win.document.body.appendChild(stray);
        try { stray.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); } catch (e) { threw = true; }
        check('a bare [page] outside any lmlst does not throw', !threw);
        let pass = 0, fail = 0;
        for (const r of results) {
            if (r.cond) { pass++; console.log('PASS  ' + r.name); }
            else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
        }
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    }, 200);
}, 500);
