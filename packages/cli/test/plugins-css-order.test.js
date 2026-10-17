// V1 parity: plugin CSS (select2, datetimepicker, ...) must load BEFORE the project's own stylesheets so the project's
// styling wins, as in V1 where it was part of the base runtime CSS. `lm build` appended plugins.<ts>.css before
// </head>, after the site's CSS, and stock select2 CSS overrode console.roxyon.com's selects (a second arrow).
// Both `lm build` and `lm serve` place it through fcs.placePluginsCss().
const fs = require('fs');
const path = require('path');
const fcs = require('../lib/fcs.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const TAG = '<link href="/css/plugins.1.css" rel="stylesheet" type="text/css" />';
check('placePluginsCss exists', typeof fcs.placePluginsCss === 'function');
if (typeof fcs.placePluginsCss === 'function') {
    const html = '<head>\n<link href="https://cdn.example/x.css" rel="stylesheet">\n<link rel="stylesheet" href="/css/app.9.css">\n<link href="/css/theme.css" rel="stylesheet">\n</head><body></body>';
    const out = fcs.placePluginsCss(html, TAG);
    check('goes before the first local /css/ stylesheet', out.indexOf(TAG) < out.indexOf('/css/app.9.css') && out.indexOf(TAG) > out.indexOf('cdn.example'), out);
    check('inserted exactly once', out.split(TAG).length === 2);
    const noLocal = fcs.placePluginsCss('<head><title>t</title></head><body></body>', TAG);
    check('without local stylesheets it goes before </head>', /<link href="\/css\/plugins\.1\.css"[^>]*>\s*<\/head>/.test(noLocal), noLocal);
}
const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'fcs.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'lib', 'app.js'), 'utf8');
check('lm build uses it', /placePluginsCss\(_indexOut, _pluginsCssTag\)/.test(src));
check('lm serve uses it', /fcs\.placePluginsCss\(html,/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
