// Regression: a :for whose source is a path or expression (g.items, data.items,
// rows.filter(...)) must refresh when its ROOT variable changes. updateLXRs()
// only matched loops whose whole source text equalled the changed name, so an
// inner loop of an updated row, or a loop over a dotted path, never refreshed.
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

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-fornested-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<div id="N"><div :for="groups as g" class="grp"><h4>{{g.title}}</h4><span :for="g.items as it" class="cell">{{it}}</span></div></div>
<ul id="D"><li :for="data.items as it">{{it}}</li></ul>
<ul id="F"><li :for="rows.filter(r => r.on) as r">{{r.name}}</li></ul>
<script>
let groups = [];
let data = { items: ['a', 'b'] };
let rows = [];
window.setGroups = function (g, c, p) { groups = Array.from({ length: g }, (_, i) => ({ title: 'g' + i, items: Array.from({ length: c }, (_, j) => (p || '') + i + '-' + j) })); };
window.growInner = function (i) { groups[i].items.push('extra'); };
window.replaceInner = function (i, arr) { groups[i].items = arr; };
window.setItems = function (arr) { data.items = arr; };
window.pushItem = function (v) { data.items.push(v); };
window.setRows = function (arr) { rows = arr; };
window.toggleRow = function (i) { rows[i].on = !rows[i].on; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19989/', runScripts: 'dangerously',
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
const q = (sel) => [...win.document.querySelectorAll(sel)].map((e) => e.textContent.trim());
const cellsPerGroup = () => [...win.document.querySelectorAll('#N .grp')].map((g) => g.querySelectorAll('.cell').length).join(',');

(async () => {
    await wait(400);
    win.setGroups(3, 2);
    await wait(400);
    check('nested initial render', cellsPerGroup() === '2,2,2', cellsPerGroup());

    win.setGroups(5, 4);
    await wait(500);
    check('replacing outer array grows existing rows\' inner loops', cellsPerGroup() === '4,4,4,4,4', cellsPerGroup());

    win.setGroups(2, 1);
    await wait(500);
    check('replacing outer array shrinks existing rows\' inner loops', cellsPerGroup() === '1,1', cellsPerGroup());

    win.setGroups(2, 1, 'new-');
    await wait(500);
    check('inner loop content refreshes in existing rows', q('#N .cell').join('|') === 'new-0-0|new-1-0', JSON.stringify(q('#N .cell')));

    win.growInner(1);
    await wait(500);
    check('pushing onto one row\'s inner array adds a cell to that row only', cellsPerGroup() === '1,2', cellsPerGroup());

    win.replaceInner(0, ['x', 'y', 'z']);
    await wait(500);
    check('assigning a new inner array to one row refreshes it', cellsPerGroup() === '3,2' && q('#N .grp:first-child .cell').join('') === 'xyz', cellsPerGroup());

    check('top-level loop over a dotted path renders', q('#D li').join('|') === 'a|b', JSON.stringify(q('#D li')));
    win.pushItem('c');
    await wait(400);
    check('push onto data.items updates the loop', q('#D li').join('|') === 'a|b|c', JSON.stringify(q('#D li')));
    win.setItems(['q']);
    await wait(400);
    check('assigning data.items updates the loop', q('#D li').join('|') === 'q', JSON.stringify(q('#D li')));

    win.setRows([{ name: 'one', on: true }, { name: 'two', on: false }]);
    await wait(400);
    check('loop over an expression (filter) renders', q('#F li').join('|') === 'one', JSON.stringify(q('#F li')));
    win.toggleRow(1);
    await wait(400);
    check('mutating an item re-evaluates the filter loop', q('#F li').join('|') === 'one|two', JSON.stringify(q('#F li')));

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
