// V1's per-view auth gate: <settings>{requireAuth: true}</settings> only
// mounts when Reactor({auth}) returns truthy, otherwise renderView() hands
// off to appSettings.authView with {redirect, data}. V2 parsed requireAuth
// but never enforced it — a "members only" V1 page rendered for everyone.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-auth-')));
const w = (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s); };
w('src/views/secret.view', `<settings>{ requireAuth: true }</settings><p id="secret">members only</p>`);
w('src/views/login.view', `<p id="login">please log in</p>`);
w('src/views/home.view', `<p id="home">home</p>`);
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
const win = dom.window, d = win.document;
win.__payload = { hstFormatVersion: 1, views, layouts: {}, tpls: {} };
win.eval(`
_vcD = window.__payload;
_csswrk.isStarted = function () { return true; };
window.__loggedIn = false;
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__", authView: "login", auth: function () { return window.__loggedIn; } };
renderView('secret', false, {});
`);

const results = [];
const check = (name, cond, detail) => results.push({ name, cond: !!cond, detail });
setTimeout(() => {
    check('a requireAuth view does not render while auth() is false', !d.getElementById('secret'));
    check('...and the authView renders in its place', !!d.getElementById('login'), d.body.innerHTML.slice(0, 200));
    check('...with View.props.redirect naming the blocked view', win.eval('View.props && View.props.redirect') === 'secret', JSON.stringify(win.eval('View.props')));
    win.eval(`window.__loggedIn = true; renderView('secret', false, {});`);
    setTimeout(() => {
        check('the same view renders once auth() returns true', !!d.getElementById('secret'));
        win.eval(`renderView('home', false, {});`);
        setTimeout(() => {
            check('views without requireAuth are unaffected', !!d.getElementById('home'));
            let pass = 0, fail = 0;
            for (const r of results) {
                if (r.cond) { pass++; console.log('PASS  ' + r.name); }
                else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
            }
            console.log(`\n${pass} passed, ${fail} failed`);
            process.exit(fail ? 1 : 0);
        }, 400);
    }, 400);
}, 600);
