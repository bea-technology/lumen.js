// Integration test: HST wire-format version check (2026-09-15) — see
// renderView()'s own comment in _re.js and packages/cli/lib/fcs.js's
// HST_FORMAT_VERSION comment for the full rationale. A payload (whichever
// of `_vcD`/`_vcData` renderView() resolves — dev vs. prod, see that same
// comment for why both are checked) carrying a present-but-mismatched
// `hstFormatVersion` must hard-fail via reportLumenError() and render
// nothing, rather than attempting to walk a shape this runtime doesn't
// understand.
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
    // Mismatched on purpose — renderView() must catch this before ever
    // looking at "views"/"layouts" (both left empty on purpose: if the
    // version check didn't run first, the very next line down would throw
    // on a missing key instead, which would be a false pass for this test).
    _vcD = { hstFormatVersion: 999, views: {}, layouts: {} };

    renderView('home', false, {}).then(function () {
        check('renderView() resolves (doesn\\'t throw) on a version mismatch', true);
        check('reportLumenError logged a hst-version-mismatch entry', _lumenErrorLog.some(e => e.stage === 'hst-version-mismatch'), JSON.stringify(_lumenErrorLog));
        var lastEntry = _lumenErrorLog.find(e => e.stage === 'hst-version-mismatch');
        check('the error message names both the found and expected version', lastEntry && lastEntry.message.indexOf('999') > -1 && lastEntry.message.indexOf(String(EXPECTED_HST_FORMAT_VERSION)) > -1, lastEntry && lastEntry.message);
        check('nothing got appended to #root (render aborted, not partially attempted)', document.getElementById('root').children.length === 0, document.getElementById('root').innerHTML);
        window.__done = true;
    }).catch(function (e) {
        window.__results.push({ name: 'renderView() ran to completion', cond: false, detail: e.message + '\\n' + e.stack });
        window.__done = true;
    });
} catch (e) {
    window.__results.push({ name: 'test script ran to completion', cond: false, detail: e.message + '\\n' + e.stack });
    window.__done = true;
}
`;

setTimeout(() => {
    const script = win.document.createElement('script');
    script.textContent = mainScript;
    win.document.body.appendChild(script);

    let waited = 0;
    const iv = setInterval(() => {
        waited += 100;
        if (win.__done || waited > 3000) {
            clearInterval(iv);
            let pass = 0, fail = 0;
            for (const r of (win.__results || [])) {
                if (r.cond) { pass++; console.log('PASS  ' + r.name); }
                else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
            }
            console.log(`\n${pass} passed, ${fail} failed`);
            process.exit(fail === 0 ? 0 : 1);
        }
    }, 100);
}, 300);
