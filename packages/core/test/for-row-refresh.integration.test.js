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

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-forrefresh-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<ul id="A"><li :for="rows as r">{{r.name}}</li></ul>
<ul id="B"><li :for="rows as r" class="row {{r.cls}}">{{r.id}}: {{r.name}}</li></ul>
<script>
let rows = [];
window.setRows = function (n, p) { rows = Array.from({ length: n }, (_, i) => ({ id: i, name: (p || 'item ') + i, cls: i % 2 ? 'odd' : 'even' })); };
window.mutate = function (i, v) { rows[i].name = v; };
window.dropFirst = function () { rows.shift(); };
window.reverseAll = function () { rows.reverse(); };
window.unshiftOne = function () { rows.unshift({ id: 99, name: 'first', cls: 'odd' }); };
window.cutTwo = function () { rows.splice(1, 2); };
var held = null;
window.hold = function () { held = rows; };
window.pushViaHeld = function () { held.push({ id: 7, name: 'via-held', cls: 'even' }); };
window.clearAll = function () { rows = []; };
window.nullOut = function () { rows = null; };
window.popOne = function () { rows.pop(); };
window.pushOne = function () { rows.push({ id: rows.length, name: 'added', cls: 'even' }); };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19994/', runScripts: 'dangerously',
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
const texts = (id) => [...win.document.querySelectorAll('#' + id + ' li')].map((l) => l.textContent.trim());
const classes = (id) => [...win.document.querySelectorAll('#' + id + ' li')].map((l) => l.className);

(async () => {
    await wait(400);
    win.setRows(3);
    await wait(300);
    check('initial render', texts('A').join('|') === 'item 0|item 1|item 2', JSON.stringify(texts('A')));

    win.setRows(3, 'new ');
    await wait(300);
    check('same-length array replacement refreshes text', texts('A').join('|') === 'new 0|new 1|new 2', JSON.stringify(texts('A')));
    check('same-length replacement refreshes multi-field text', texts('B').join('|') === '0: new 0|1: new 1|2: new 2', JSON.stringify(texts('B')));

    win.mutate(1, 'CHANGED');
    await wait(300);
    check('in-place mutation of one item refreshes that row', texts('A').join('|') === 'new 0|CHANGED|new 2', JSON.stringify(texts('A')));
    check('in-place mutation refreshes the second loop too', texts('B')[1] === '1: CHANGED', JSON.stringify(texts('B')));

    win.dropFirst();
    await wait(300);
    check('removing the first item shifts every row\'s content', texts('A').join('|') === 'CHANGED|new 2', JSON.stringify(texts('A')));
    check('row attribute bindings follow the shifted item', classes('B').join('|') === 'row odd|row even', JSON.stringify(classes('B')));

    win.pushOne();
    await wait(300);
    check('appending still adds a row with the new content', texts('A').join('|') === 'CHANGED|new 2|added', JSON.stringify(texts('A')));

    win.reverseAll();
    await wait(300);
    check('reverse() refreshes every row', texts('A').join('|') === 'added|new 2|CHANGED', JSON.stringify(texts('A')));

    win.unshiftOne();
    await wait(300);
    check('unshift() refreshes every row and adds one', texts('A').join('|') === 'first|added|new 2|CHANGED', JSON.stringify(texts('A')));

    win.cutTwo();
    await wait(300);
    check('splice(1,2) removes the middle rows', texts('A').join('|') === 'first|CHANGED', JSON.stringify(texts('A')));

    win.hold();
    win.pushViaHeld();
    await wait(300);
    check('a mutator called through a held array reference still updates', texts('A').join('|') === 'first|CHANGED|via-held', JSON.stringify(texts('A')));

    win.clearAll();
    await wait(300);
    check('assigning [] removes every rendered row', texts('A').length === 0 && texts('B').length === 0, JSON.stringify(texts('A')));

    win.setRows(2, 'again ');
    await wait(300);
    check('rows render again after being cleared', texts('A').join('|') === 'again 0|again 1', JSON.stringify(texts('A')));

    win.popOne();
    win.popOne();
    await wait(300);
    check('popping the last items down to empty removes the rows', texts('A').length === 0, JSON.stringify(texts('A')));

    win.setRows(3, 'third ');
    await wait(300);
    check('rows render again after pop-to-empty', texts('A').join('|') === 'third 0|third 1|third 2', JSON.stringify(texts('A')));

    win.nullOut();
    await wait(300);
    check('assigning null removes every rendered row', texts('A').length === 0, JSON.stringify(texts('A')));

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
