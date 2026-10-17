// Integration test: Reactor({init, tick}) (2026-09-18) — documented
// (lumenjs-spec.md §3/§5.4, llms.md §3: "init: runs once, before first
// render"; "tick: runs after every re-render, anywhere") but never
// actually called anywhere in the real, shipped runtime — a real
// unrelated-looking function (setAppFuncs(), in vendor/reconnecting-
// websocket.js) checked appSettings.init but was itself never called from
// anywhere. Found tracing a real migrated V1 project end-to-end: an
// index.js-declared SDK instance (`rx = new RX(...)`, set inside init())
// was silently never assigned, with no error — every reference elsewhere
// just read "not defined" instead, which looked like an unrelated
// scoping/reactivity bug until this was actually traced to its root.
// Fixed at both real render-lifecycle points: Reactor(o) itself now calls
// o.init() synchronously (see that function's own comment for why that's
// always before the first render), and _lm.prototype.renderAll()/update()
// (the real per-render and per-reactive-change points — not the same as
// a view merely mounting) now call appSettings.tick().
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const hst = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/render-hooks.hst.json'), 'utf8'));

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

window.__initCalled = false;
window.__tickCount = 0;

try {
    Reactor({
        App: "[app]",
        init: function () { window.__initCalled = true; },
        tick: function () { window.__tickCount++; },
    });
    check('Reactor({init}) calls init() synchronously, before this line runs', window.__initCalled === true);

    var hst = ${JSON.stringify(hst)};
    var view = new _v({ name: 'home', type: 'main', hst: hst, vars: { images: ['a', 'b'], isAdmin: false }, rvs: ['images', 'image', 'isAdmin'] });
    var engine = new _lm(view);
    var tickCountBeforeMount = window.__tickCount;
    engine.renderAll();
    var root = document.getElementById('root');
    root.append.apply(root, engine._RealDOM);

    setTimeout(function () {
        check('tick() fires on the initial renderAll() (mount), not just later updates', window.__tickCount > tickCountBeforeMount, 'before=' + tickCountBeforeMount + ' after=' + window.__tickCount);

        var tickCountBeforeUpdate = window.__tickCount;
        _vt.View.vars.isAdmin = true;

        setTimeout(function () {
            check('tick() fires again after a real reactive update', window.__tickCount > tickCountBeforeUpdate, 'before=' + tickCountBeforeUpdate + ' after=' + window.__tickCount);
            window.__done = true;
        }, 30);
    }, 30);
} catch (e) {
    window.__results.push({ name: 'no uncaught exception during setup', cond: false, detail: e.message + '\\n' + e.stack });
    window.__done = true;
}
`;

win.eval(mainScript);

function waitAndReport() {
    if (!win.__done) {
        setTimeout(waitAndReport, 20);
        return;
    }
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
}
waitAndReport();
