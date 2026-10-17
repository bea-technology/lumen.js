// V1 parity: a view variable that is declared but currently undefined/null (`items = resp.results` when the
// response has no `results`, `user = null` on logout) must render its mustaches BLANK. The evaluator's
// "strip null/undefined names and retry" fallback used to turn that into a ReferenceError, which the text
// renderer reads as "exists nowhere" and shows the raw `{{items.length ? ... }}` on the page.
// A name that really is declared nowhere must still stay literal (V1 prose/code samples rely on that).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-emptyvar-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="t">[{{items.length ? items[0].t : ''}}]</p>
<p id="l">[{{items.length}}]</p>
<p id="n">[{{user.name}}]</p>
<p id="s">[{{lbl}}]</p>
<p id="u">[{{nowhereDeclared.x}}]</p>
<ul id="rows"><li :for="rows">[{{title}}|{{missingField}}]</li></ul>
<script>
var items = [{ t: 'first' }];
var user = { name: 'Ann' };
var lbl = 'lbl';
var rows = [{ title: 'a' }, { other: 1 }];
window.clear = function () { items = undefined; user = null; lbl = undefined; };
window.refill = function () { items = [{ t: 'again' }]; user = { name: 'Bob' }; lbl = 'back'; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19977/', runScripts: 'dangerously',
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
const text = (id) => win.document.getElementById(id).textContent;

(async () => {
    await wait(500);
    check('initial render', text('t') === '[first]' && text('l') === '[1]' && text('n') === '[Ann]' && text('s') === '[lbl]',
        [text('t'), text('l'), text('n'), text('s')].join(' '));
    check('a name declared nowhere stays literal', text('u') === '[{{nowhereDeclared.x}}]', text('u'));

    const rowTxt = () => Array.from(win.document.querySelectorAll('#rows li')).map((l) => l.textContent).join(',');
    check('a :for row lacking a field renders it blank (V1), never raw {{field}}', rowTxt() === '[a|],[|]', rowTxt());

    win.clear();
    await wait(300);
    check('ternary on an undefined array renders blank, not literal', text('t') === '[]', text('t'));
    check('property of an undefined array renders blank', text('l') === '[]', text('l'));
    check('property of a null object renders blank', text('n') === '[]', text('n'));
    check('an undefined scalar renders blank', text('s') === '[]', text('s'));
    check('a name declared nowhere still literal after the clear', text('u') === '[{{nowhereDeclared.x}}]', text('u'));

    win.refill();
    await wait(300);
    check('values come back after being empty', text('t') === '[again]' && text('l') === '[1]' && text('n') === '[Bob]' && text('s') === '[back]',
        [text('t'), text('l'), text('n'), text('s')].join(' '));

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
