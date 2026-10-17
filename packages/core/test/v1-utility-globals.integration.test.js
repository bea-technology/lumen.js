// Regression test for the 2026-09-21 addition of three real V1 global
// utilities (beajs/core.js) that a full audit found missing from V2:
// paramsToObj, Arr2Obj, ObjFromArr. Arr2Obj is confirmed actively used in
// a real migrated project's index.js. Loads the real built bundle (not a
// reimplementation) so this actually proves the functions ship, not just
// that a hand-copied reference implementation works.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19996/', runScripts: 'dangerously',
    beforeParse(window) {
        window.URL.createObjectURL = () => 'blob:test';
        window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
    }
});
const win = dom.window;

const mainScript = `
window.__results = [];
function check(name, cond, detail) { window.__results.push({ name, cond: !!cond, detail }); }
try {

check('Arr2Obj is exposed', typeof Arr2Obj === 'function');
const arr = [{ objectId: 'a', v: 1 }, { objectId: 'b', v: 2 }];
const obj = Arr2Obj(arr, 'objectId');
check('Arr2Obj keys the array by the given property', obj.a && obj.a.v === 1 && obj.b && obj.b.v === 2, JSON.stringify(obj));
check('Arr2Obj improvement: non-array input fails safe to {} instead of throwing', JSON.stringify(Arr2Obj(undefined, 'x')) === '{}');
check('Arr2Obj improvement: null input also fails safe', JSON.stringify(Arr2Obj(null, 'x')) === '{}');

check('ObjFromArr is exposed', typeof ObjFromArr === 'function');
check('ObjFromArr finds the matching item by default key (objectId)', ObjFromArr(arr, 'b').v === 2);
check('ObjFromArr respects a custom key', ObjFromArr([{ id: 5, name: 'x' }], 5, 'id').name === 'x');
check('ObjFromArr returns undefined (not {}) when nothing matches, same as real V1', ObjFromArr(arr, 'nope') === undefined);
check('ObjFromArr fails safe to {} on a genuine error (non-array input)', JSON.stringify(ObjFromArr(null, 'x')) === '{}');

check('paramsToObj is exposed', typeof paramsToObj === 'function');
const parsed = paramsToObj('https://example.test/page?a=1&b=two');
check('paramsToObj parses real query params into a plain object', parsed.a === '1' && parsed.b === 'two', JSON.stringify(parsed));
check('paramsToObj fails safe to {} on a bad URL', JSON.stringify(paramsToObj('not a url')) === '{}');

} catch (e) {
    window.__results.push({ name: 'no uncaught error', cond: false, detail: (e && e.stack) || String(e) });
}
`;

const scriptEl = win.document.createElement('script');
scriptEl.textContent = mainScript;
win.document.body.appendChild(scriptEl);

let pass = 0, fail = 0;
setTimeout(() => {
    const results = win.__results || [];
    if (results.length === 0) {
        fail++;
        console.log('FAIL  test script never ran (window.__results missing)');
    }
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail === 0 ? 0 : 1);
}, 200);
