// `lm build` / `lm serve` run the project's OWN src/js/lm.js. HST v2 (2026-10-03) ships view scripts as source, which a
// pre-v2 runtime cannot run (it would refuse the payload with "HST format mismatch"). The CLI warns up front and says
// to run `lm update-core`; a current runtime passes silently.
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require('../lib/fcs.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function project(lmSource) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-rtcheck-'));
    fs.mkdirSync(path.join(root, 'src', 'js'), { recursive: true });
    if (lmSource !== null) fs.writeFileSync(path.join(root, 'src', 'js', 'lm.js'), lmSource);
    return root;
}
check('the CLI emits HST v3', fcs.HST_FORMAT_VERSION === 3, String(fcs.HST_FORMAT_VERSION));
check('checkProjectRuntime exists', typeof fcs.checkProjectRuntime === 'function');
if (typeof fcs.checkProjectRuntime === 'function') {
    const warn = console.warn; const warned = [];
    console.warn = (m) => warned.push(String(m));
    const old = fcs.checkProjectRuntime(project('var EXPECTED_HST_FORMAT_VERSION=2;var _HST_FORMATS_ACCEPTED=[1, 2];'));
    const cur = fcs.checkProjectRuntime(project('var EXPECTED_HST_FORMAT_VERSION=3;var _HST_FORMATS_ACCEPTED=[1, 2, 3];'));
    const none = fcs.checkProjectRuntime(project(null));
    console.warn = warn;
    check('a pre-v2 project runtime is reported', old === false && warned.length === 1 && /lm update-core/.test(warned[0]), warned.join(' | '));
    check('a current runtime passes silently', cur === true);
    check('no src/js/lm.js: nothing to check, no warning', none === true && warned.length === 1);
}
const shipped = fs.readFileSync(path.join(__dirname, '..', 'lib', 'files', 'libs', 'lm.js'), 'utf8');
check('the runtime the CLI seeds new projects with accepts what the CLI emits', /_HST_FORMATS_ACCEPTED\s*=\s*\[1,\s*2,\s*3\]/.test(shipped) && /EXPECTED_HST_FORMAT_VERSION\s*=\s*3/.test(shipped));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
