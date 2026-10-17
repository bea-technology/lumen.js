// Integration test: a real gap found migrating a real V1 project — an
// index.js-declared Global var (e.g. `rx = new RX(...)`, set inside
// Reactor's init()) was reachable as `_vt.Global.vars.rx` but NOT as a
// bare `rx` identifier from a view's own <script> — the real JS scope
// chain never finds it, since nothing ever put it on `window`. This
// file's own design comment above _vt's declaration documents the
// INTENDED behavior ("ordinary view code can just reference the name")
// — this was never actually implemented. Fixed by mirroring every
// _vt.Global.vars write onto window[name] too, in _x()'s shared
// _dispatchVarsUpdate() (used by both the set and deleteProperty traps).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

const dom = new JSDOM(
    `<!doctype html><body><div id="root"></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:3000/', runScripts: 'dangerously',
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
        }
    }
);
const win = dom.window;

const mainScript = `
window.__results = [];
function check(name, cond, detail) { window.__results.push({ name, cond: !!cond, detail }); }

try {
    _vt.Global.vars.rx = { post: function () { return 'real rx'; } };
    check('_vt.Global.vars write mirrors onto a plain bare window global', typeof window.rx !== 'undefined' && window.rx.post() === 'real rx', 'window.rx=' + JSON.stringify(window.rx));
    check('the mirrored global is reachable as a genuinely bare identifier (no window. prefix)', (function () { try { return rx.post() === 'real rx'; } catch (e) { return false; } })());

    _vt.Global.vars.rx = { post: function () { return 'updated'; } };
    check('re-assigning the Global var updates the mirrored bare identifier too', (function () { try { return rx.post() === 'updated'; } catch (e) { return false; } })());
} catch (e) {
    window.__results.push({ name: 'no uncaught exception', cond: false, detail: e.message + '\\n' + e.stack });
}
window.__done = true;
`;

win.eval(mainScript);

const results = win.__results;
let failed = 0;
for (const r of results) {
    if (r.cond) {
        console.log('PASS ', r.name);
    } else {
        failed++;
        console.log('FAIL ', r.name, '--', r.detail);
    }
}
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
