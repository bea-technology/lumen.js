// Regression: a subview's <script> must see `view` — the jQuery-wrapped host element of that subview (V1 injected
// `var view = $("x[_dd=..]").closest('[view]')` before every view-mounted view). V1 sites use it everywhere
// (`view.scope(function (view, props) {...})`, `view.set()`, `view.props()`); V2 never defined it, so those
// scripts died with "view is not defined". A route's own (non-subview) script still has no `view`, as in V1.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-viewvar-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<div id="hostA" view="sub"></div>
<div id="hostB" view="sub"></div>
<p id="main">main</p>`);
fs.writeFileSync(root + '/src/views/sub.view', `<span class="mark">sub</span>
<script>
window.__seen = window.__seen || [];
try {
    view.scope(function (v, props) {
        window.__seen.push({ id: v[0] && v[0].id, len: v.length, props: typeof props });
        return { scoped: v[0] ? v[0].id : 'none' };
    });
} catch (e) { window.__seen.push({ error: e.message }); }
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19983/', runScripts: 'dangerously',
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
    await wait(800);
    const seen = win.__seen || [];
    check('both subview instances mounted', win.document.querySelectorAll('.mark').length === 2, String(win.document.querySelectorAll('.mark').length));
    check('no "view is not defined" error in either script', !seen.some((s) => s.error), JSON.stringify(seen));
    check('view.scope ran once per subview instance', seen.length === 2, JSON.stringify(seen));
    check('each script got its OWN host element (hostA then hostB)', seen.map((s) => s.id).join(',') === 'hostA,hostB', JSON.stringify(seen));
    check('view is a one-element jQuery-style wrapper', seen.every((s) => s.len === 1), JSON.stringify(seen));
    check('scope() received a props object', seen.every((s) => s.props === 'object'), JSON.stringify(seen));
    check('scope() return values were stored on the host (view.set)',
        win.$('#hostA').data('scoped') === 'hostA' && win.$('#hostB').data('scoped') === 'hostB',
        win.$('#hostA').data('scoped') + ' / ' + win.$('#hostB').data('scoped'));
    check('main view still rendered', win.document.getElementById('main') && win.document.getElementById('main').textContent === 'main');

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
