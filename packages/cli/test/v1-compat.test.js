// CLI-side V1-migration helpers: an unmodified V1 project (index.html
// loading /js/bea.js + the V1 CDN runtime + /index.js, no layouts, no
// src/js/lm.js, bea.css, comps/ + tpls/) must serve and build as-is.
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', 'lib', 'fcs.js'));

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const v1Html = `<html><head>
<link href="/css/bea.css" rel="stylesheet">
<script src="https://www.googletagmanager.com/gtag/js?id=X"></script>
</head><body>
<script src="/js/bea.js"></script>
<script src="https://s.beacdn.com/beajs/latest"></script>
<script src="/index.js" type="text/javascript"></script>
<script src="/js/site.js"></script>
</body></html>`;
const out = fcs.v1CompatIndexHtml(v1Html);
check('/js/bea.js is rewritten to /js/lm.js', out.includes('src="/js/lm.js"') && !out.includes('/js/bea.js'));
check('the V1 CDN runtime script is removed', !out.includes('beacdn.com/beajs'));
check('the raw /index.js tag is removed (V2 runs index.js itself)', !/src="\/index\.js"/.test(out));
check('unrelated third-party and local scripts are kept', out.includes('googletagmanager') && out.includes('/js/site.js'));
check('a V2 index.html passes through unchanged', fcs.v1CompatIndexHtml('<script src="/js/lm.js"></script>') === '<script src="/js/lm.js"></script>');
check('/js/bea.js is not treated as a project script', fcs.detectLocalProjectScripts(v1Html).join() === '/js/site.js', JSON.stringify(fcs.detectLocalProjectScripts(v1Html)));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-v1compat-')));
const w = (rel, s) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), s); };
w('src/index.html', v1Html);
w('src/js/bea.js', '/* V1 runtime: new Flickity(); $.fn.select2 = 1; gsap.to(); Rellax */');
w('src/js/site.js', 'var r = new Rellax(".p");');
w('src/views/home.view', `<div crslf class="c"></div><input date><div :for="items as it" tpl="card"></div>
<script>var items = [];</script>`);
w('src/comps/card.tpl', `<b>{{it.name}}</b><i>{{label}}</i><style>b{color:red}</style>`);
w('src/tpls/row.tpl', `<i>{{x}}</i>`);

const found = fcs.detectUsedPlugins(root).sort();
check('plugins detected from the project\'s own code and attributes', JSON.stringify(found) === JSON.stringify(['bootstrap-datetimepicker', 'flickity', 'rellax']), JSON.stringify(found));
const selected = fcs.selectedProjectPlugins(root).map(e => e.key);
check('selection auto-includes real jQuery and jquery-form', selected.includes('jquery') && selected.includes('jquery-form'), JSON.stringify(selected));

const cwd = process.cwd();
process.chdir(root); // the CLI always runs from the project root
const tpls = fcs.readTemplates(root);
const keys = Object.keys(tpls).map(k => Buffer.from(k, 'base64').toString());
check('readTemplates() loads both comps/ and tpls/ (with <style>, no build error)', keys.includes('src/comps/card.tpl') && keys.includes('src/tpls/row.tpl'), JSON.stringify(keys));
const views = fcs.linkTemplateReactiveVars(fcs.getAllFiles(root + '/src/views/', {}, false, true), tpls);
process.chdir(cwd);
const home = views[Buffer.from('src/views/home.view').toString('base64')];
check('host view gets the :for source and the row template\'s vars as reactive', home && home.reactiveVars.includes('items') && home.reactiveVars.includes('label'), home && JSON.stringify(home.reactiveVars));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
