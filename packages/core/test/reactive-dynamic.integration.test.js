// V1 parity: a `<div reactive>` that code inserts at runtime (`$(x).append('<div reactive>...')`, DataTable column
// renderers, "load more" lists) must be rendered by the engine — :for (+ :for-limit/:for-offset), :if/:else,
// {{mustache}} in text and attributes, @events — instead of staying raw markup. The host gets class `binded`
// and is processed once; a mustache that resolves to nothing renders blank; static `reactive` markup that a view
// already compiled is left to the view.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-reactive-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="count">[{{items.length}}]</p>
<div id="host"></div>
<div id="static" reactive><b :for="items as it">{{it.n}};</b></div>
<script>
var items = [{ n: 'a', p: 1 }, { n: 'b', p: 0 }, { n: 'c', p: 2 }, { n: 'd', p: 3 }];
var clicked = [];
window.pickRow = function (name) { clicked.push(name); };
window.addChunk = function (off) {
  var html =
    '<div reactive>' +
      '<ul class="rows"><li :for="items" :for-limit="2" :for-offset="' + off + '" data-n={{n}}>' +
        '<span class="nm">{{n}}</span>|<span class="mis">{{noSuchField}}</span>|' +
        '<i :if="p == 0" class="free">free</i><i :else class="paid">{{p}}$</i>' +
        '<button class="go" @click="pickRow(\\'' + 'x' + '\\')">go</button>' +
        '<em>a &lt; b &amp; c</em>' +
      '</li></ul>' +
    '</div>';
  document.getElementById('host').insertAdjacentHTML('beforeend', html);
};
window.addTotal = function () {
  document.getElementById('host').insertAdjacentHTML('beforeend', '<div reactive class="tot"><u>{{items.length}} items</u><s>[{{nothingAnywhere}}]</s></div>');
};
window.setItems = function (v) { items = v; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
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
const $ = (s) => win.document.querySelector(s);
const $$ = (s) => Array.from(win.document.querySelectorAll(s));

(async () => {
    await wait(500);
    check('view rendered', $('#count') && $('#count').textContent === '[4]', $('#count') && $('#count').textContent);
    check('static reactive markup is compiled by the view, once', $('#static').textContent === 'a;b;c;d;', $('#static').textContent);

    win.addChunk(1);
    await wait(300);
    const host = $('#host > div[reactive]');
    check('host got class binded', host && host.classList.contains('binded'), host && host.className);
    const lis = $$('#host li');
    check(':for with :for-limit=2 / :for-offset=1 rendered rows b,c', lis.length === 2 && $$('#host .nm').map((e) => e.textContent).join() === 'b,c',
        lis.length + ' rows: ' + $$('#host .nm').map((e) => e.textContent).join());
    check('no raw {{ left in the chunk', host && host.textContent.indexOf('{{') === -1, host && host.textContent);
    check('unresolvable field renders blank', $$('#host .mis').every((e) => e.textContent === ''), $$('#host .mis').map((e) => e.textContent).join());
    check('attribute mustache resolved', lis.map((l) => l.getAttribute('data-n')).join() === 'b,c', lis.map((l) => l.getAttribute('data-n')).join());
    check(':if / :else picked per row', $$('#host .free').length === 1 && $$('#host .paid').length === 1 && $('#host .paid').textContent === '2$',
        $$('#host .free').length + '/' + $$('#host .paid').length);
    check('directive attributes are gone from the output', !$('#host [\\:for]') && !$('#host [\\:if]') && !$('#host [\\:else]'), $('#host .rows').outerHTML.slice(0, 200));
    check('entities survive the round trip', $('#host em').textContent === 'a < b & c', $('#host em').textContent);

    $('#host .go').click();
    await wait(50);
    check('@click on a runtime-rendered row fires its handler', win.eval('clicked.join()') === 'x', win.eval('clicked.join()'));

    win.addChunk(0);
    await wait(300);
    check('a second chunk appended later is processed too (4 rows total)', $$('#host li').length === 4, String($$('#host li').length));
    check('the first chunk was not re-rendered or duplicated', $$('#host > div[reactive]')[0].querySelectorAll('li').length === 2);

    win.addTotal();
    await wait(300);
    check('plain mustaches in a chunk resolve against view vars', $('#host .tot u').textContent === '4 items', $('#host .tot u').textContent);
    check('a name declared nowhere renders blank inside a chunk (V1)', $('#host .tot s').textContent === '[]', $('#host .tot s').textContent);

    win.setItems([{ n: 'z', p: 9 }]);
    await wait(400);
    check('a chunk re-renders when a view var it reads changes', $('#host .tot u').textContent === '1 items', $('#host .tot u').textContent);
    check('a chunk :for re-renders when its list changes', $$('#host > div[reactive]')[0].querySelectorAll('li').length === 0 && $$('#host > div[reactive]')[1].querySelectorAll('li').length === 1,
        $$('#host > div[reactive]').map((h) => h.querySelectorAll('li').length).join());

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
