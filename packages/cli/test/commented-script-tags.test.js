// Regression: `lm build` compiled every local `<script src>` in index.html into the app bundle, including tags inside
// an HTML comment. The browser (and V1) never load those, so leftover test scripts ran in production and threw
// (acceleratezev.ca: `<!-- <script src="/test1.js"> ... -->` -> "j2 is not defined" on every route of the build).
const fcs = require('../lib/fcs.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const html = `<html><head>
<script src="/js/bea.js"></script>
<script src="/index.js"></script>
<script src="/js/app.js"></script>
<!-- <script src="/test1.js" type="text/javascript"></script>
<script src="/test2.js" type="text/javascript"></script> -->
<!--<script src="/js/old.js"></script>-->
<script src="/js/after.js"></script>
</head></html>`;
const found = fcs.detectLocalProjectScripts(html);
check('live local scripts are still detected, in order', JSON.stringify(found) === JSON.stringify(['/js/app.js', '/js/after.js']), JSON.stringify(found));
check('scripts inside a multi-line comment are ignored', !found.includes('/test1.js') && !found.includes('/test2.js'), JSON.stringify(found));
check('a script inside a single-line comment is ignored', !found.includes('/js/old.js'), JSON.stringify(found));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
