// Integration test: two real, confirmed :for bugs found and fixed
// 2026-09-17 while building real documentation content (lumenjs.com's
// guide site) — both are common, explicitly documented patterns, not
// edge cases:
//
// 1. A bare `:for="items"` (no `as item` alias) is documented — and was
//    V1's real, working behavior — to spread each item's own object keys
//    directly into loop scope, so `items = [{number:1}]` lets a mustache
//    read `{{number}}` with no alias at all. The vx-building loop in
//    _re.js never did that spread for the no-alias case; a bare mustache
//    like this always evaluated as an undefined identifier and silently
//    rendered blank.
// 2. `:for-if="item.value > 10"` — the exact documented example shape —
//    always evaluated against an empty scope. evalExp()'s 2nd param is a
//    NAMES array to look up in _vt.View.vars/_vt.Global.vars (see its
//    other real call site, `evalExp(cx.content, this.reactiveVariables)`)
//    but the :for-if call site passed `vx`, a VALUES object — `vars.length`
//    on a plain object is undefined, so evalExp's own lookup loop never
//    ran even once. Fixed by routing through the same `this.vrs` merge
//    mechanism getVal()/evalExp() already use for mustache/`:if` loop
//    variables, instead of a second, broken parameter shape.
//
// The HST fixture is real fcs.js parser output (test/fixtures/for-if-bare.hst.json),
// not hand-built — see render-hooks.integration.test.js's own note on why.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const hst = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/for-if-bare.hst.json'), 'utf8'));

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
    var hst = ${JSON.stringify(hst)};
    var view = new _v({
        name: 'fortest', type: 'main', hst: hst,
        vars: {
            items: [{ number: 1 }, { number: 2 }, { number: 3 }],
            items2: [{ key: 'a', value: 5 }, { key: 'b', value: 20 }],
        },
        rvs: ['items', 'items2'],
    });
    var engine = new _lm(view);
    engine.reactiveVariables = ['items', 'items2'];
    engine.renderAll();
    var root = document.getElementById('root');
    root.append.apply(root, engine._RealDOM);

    setTimeout(function () {
        var bareText = document.getElementById('bare') ? document.getElementById('bare').textContent : '';
        var filteredText = document.getElementById('filtered') ? document.getElementById('filtered').textContent : '';

        check('bare :for spreads each item\\'s own keys (number 1/2/3 all present)',
            bareText.indexOf('1') > -1 && bareText.indexOf('2') > -1 && bareText.indexOf('3') > -1,
            bareText);

        check(':for-if filters using the loop item\\'s own scope (only value>10 item "b" rendered)',
            filteredText.indexOf('b') > -1 && filteredText.indexOf('20') > -1,
            filteredText);

        check(':for-if actually excludes the item that fails the condition (item "a" is not rendered)',
            filteredText.indexOf('a:') === -1,
            filteredText);

        window.__done = true;
    }, 50);
} catch (e) {
    window.__results.push({ name: 'no uncaught exception during render', cond: false, detail: e.message + '\\n' + e.stack });
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
