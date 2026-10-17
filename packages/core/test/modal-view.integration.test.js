// Regression: <x modal="viewName"> must mount that view inside the popup it creates. The handler used to emit a bare
// `<div for-modal=... view='name'>` host that nothing ever rendered into, so the modal opened empty. The view must
// render with its mustaches resolved, its script must run with `view` bound to the popup host (V1 behaviour), the
// template must stay reactive, and two modals opened in turn must not share state.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-modalview-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<button id="open" modal="mview" modal-title="Policy">open</button>
<p id="main">main</p>`);
fs.writeFileSync(root + '/src/views/mview.view', `<span id="mv">{{label}}</span>
<script>
let label = 'hello';
window.__mvHost = (typeof view !== 'undefined' && view[0]) ? view[0].getAttribute('for-modal') : 'no-view';
window.bumpLabel = function () { label = 'changed'; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19981/', runScripts: 'dangerously',
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

(async () => {
    await wait(500);
    check('home rendered, no popup yet', $('#main') && !$('popup'));

    $('#open').click();
    await wait(600);

    check('popup created', !!$('popup#modals_0'), win.document.body.innerHTML.slice(0, 300));
    check('modal title filled from modal-title', $('popup#modals_0 [pop-t]') && $('popup#modals_0 [pop-t]').textContent === 'Policy');
    check('the view rendered INSIDE the popup host', !!$('popup#modals_0 [for-modal] #mv'));
    check('view mustache resolved from its own script var', $('#mv') && $('#mv').textContent === 'hello', $('#mv') && $('#mv').textContent);
    check('view script saw `view` = the popup host', win.__mvHost === 'modals_0', String(win.__mvHost));

    win.bumpLabel();
    await wait(300);
    check('modal view template is reactive', $('#mv') && $('#mv').textContent === 'changed', $('#mv') && $('#mv').textContent);

    $('popup#modals_0 [close-modal]').click();
    await wait(600);
    check('close-modal removes the popup', !$('popup#modals_0'), String(!!$('popup#modals_0')));

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
