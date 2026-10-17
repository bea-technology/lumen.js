// Regression: V1 keeps a global `historyStack` that getURLNodes() appends {nodes, params, url} to on every
// navigation (skipping a repeat of the same URL). Sites read it in view scripts, e.g. birt's tool.view:
// `historyStack?.[historyStack.length - 2]?.nodes?.[0] == 'home'` to decide where "back" goes. V2 never declared
// it, so those scripts died with "historyStack is not defined".
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-histstack-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<p id="h">home</p>
<script>
window.__homeSaw = (typeof historyStack) + ':' + (Array.isArray(historyStack));
</script>`);
fs.writeFileSync(root + '/src/views/about.view', `<p id="a">about</p>
<script>
window.__aboutBack = historyStack?.[historyStack.length - 2]?.nodes?.[0];
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19982/', runScripts: 'dangerously',
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
appSettings = { App: "[app]", Base: "http://127.0.0.1:19982/", defaultView: "home" };
goToNode({});
`);

const results = [];
function check(name, cond, detail) { results.push({ name, cond: !!cond, detail }); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    await wait(500);
    check('home view script can read historyStack (an array)', win.__homeSaw === 'object:true', String(win.__homeSaw));
    check('home view rendered', win.document.getElementById('h') && win.document.getElementById('h').textContent === 'home');
    const len0 = win.eval('historyStack.length');
    check('first navigation recorded one entry', len0 === 1, String(len0));
    check('entry has nodes/params/url', win.eval('historyStack[0].nodes[0] === "home" && typeof historyStack[0].params === "object" && historyStack[0].url === location.href'),
        win.eval('JSON.stringify(historyStack[0])'));

    win.eval('goToNode({})');
    await wait(200);
    check('navigating to the same URL again does not duplicate the entry', win.eval('historyStack.length') === 1, String(win.eval('historyStack.length')));

    win.history.pushState({}, '', '/about?x=1');
    win.eval('goToNode({})');
    await wait(500);
    check('second URL adds a second entry', win.eval('historyStack.length') === 2, String(win.eval('historyStack.length')));
    check('latest entry is the about page with its query params', win.eval('historyStack[1].nodes[0] === "about" && historyStack[1].params.x == "1"'),
        win.eval('JSON.stringify(historyStack[1])'));
    check('about view rendered', win.document.getElementById('a') && win.document.getElementById('a').textContent === 'about');
    check('tool.view idiom: previous entry is "home"', win.__aboutBack === 'home', String(win.__aboutBack));

    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
