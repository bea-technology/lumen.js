// A row's index in a filtered loop (:for + :if, :for-if) is the item's position in the array, plus :for-offset —
// as in V1. V2 numbered the rows shown instead, so `items[i]` in a click handler changed a different item than the
// row clicked (found building lumenjs.com's todo demo, 2026-10-08; V1 confirmed with tools/migration-check/v1v2-probe.js).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const hst = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/for-filtered-index.hst.json'), 'utf8'));

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
    var view = new _v({ name: 'idx', type: 'main', hst: hst,
        vars: { xs: [{ n: 'a', on: true }, { n: 'b', on: false }, { n: 'c', on: true }, { n: 'd', on: true }] }, rvs: ['xs'] });
    var engine = new _lm(view);
    engine.reactiveVariables = ['xs'];
    engine.renderAll();
    var root = document.getElementById('root');
    root.append.apply(root, engine._RealDOM);
    setTimeout(function () {
        var t = function (id) { var e = document.getElementById(id); return e ? e.textContent.replace(/\\s+/g, '') : ''; };
        check(':for + :if keeps each row\\'s array index (a=0, c=2, d=3)', t('f') === '0=a,2=c,3=d,', t('f'));
        check(':for-if keeps the array index, for the alias and for index', t('g') === '0=0=a,2=2=c,3=3=d,', t('g'));
        check(':for-offset rows are numbered from the offset, as in V1', t('o') === '1=b,2=c,', t('o'));
        check('an unfiltered loop is unchanged', t('p') === '0=a,1=b,2=c,3=d,', t('p'));
        window.__done = true;
    }, 300);
} catch (e) { window.__results.push({ name: 'threw', cond: false, detail: String(e && e.stack || e) }); window.__done = true; }
`;
win.eval(mainScript);
function waitAndReport() {
    if (!win.__done) { setTimeout(waitAndReport, 20); return; }
    let failed = 0;
    for (const r of win.__results) { if (r.cond) console.log('PASS ', r.name); else { failed++; console.log('FAIL ', r.name, '--', r.detail); } }
    console.log(`\n${win.__results.length - failed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}
waitAndReport();
