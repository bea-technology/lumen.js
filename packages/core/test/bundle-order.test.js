// Regression test for the 2026-09-20 fix: index-bootstrap.js used to run
// (via a synchronous XHR + eval — see that file's own comment for why
// synchronous) BEFORE ws.js in the bundle assembly order (build/bundle.js).
// Since a synchronous XHR blocks and evals inline, any real index.js code
// that used something ws.js defines — the global `API` object, which the
// real/ported legacy BEA SDK's BEA.request() depends on — crashed with
// "Cannot read properties of undefined (reading 'req')": `var API` was
// only hoisted (declared), not yet assigned, at that point in the bundle's
// linear top-level execution. Found migrating a real V1 project's index.js
// (bea = new BEA({sections:true, locale:true})) to run on V2. Fixed by
// moving index-bootstrap.js to run after ws.js/lstnrs.js instead. This
// test locks in the ordering directly against the built bundle text
// (fast, no network/eval simulation needed) rather than the fuller BEA
// scenario, which needs a real XHR round trip this suite doesn't drive.
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// Real code tokens (survive whitespace-only minification, unlike comments).
const apiIdx = bundleSrc.indexOf('var API={');
const bootstrapIdx = bundleSrc.indexOf('_idxXhr');

check('ws.js\'s "var API={" is present in the built bundle', apiIdx !== -1);
check('index-bootstrap.js\'s XHR marker is present in the built bundle', bootstrapIdx !== -1);
check('ws.js (defines API) runs before index-bootstrap.js (may synchronously eval real index.js code that uses API)', apiIdx > -1 && bootstrapIdx > -1 && apiIdx < bootstrapIdx, 'API at ' + apiIdx + ', bootstrap at ' + bootstrapIdx);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
