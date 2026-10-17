// Size budget (2026-10-03). V1 was lightweight and V2 must stay so: 2.4.2 shipped console.roxyon.com as 9.35 MB of
// JS (V1: 2.16 MB) before the build stopped emitting ASTs and empty fields and started minifying plugins (3.04 MB).
// These limits sit ~10% above the 2.5.0 numbers so a regression fails CI instead of reaching users.
// Baselines measured 2026-10-03: runtime 416.8 KB; console.roxyon.com views compile to 1.40x their source;
// select2 + datetimepicker plugin bundle 296.8 KB minified (749.6 KB unminified); the dense fixture view below
// compiles to 3.18x its source (2.4.2: 13.3x).
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require('../lib/fcs.js');
const plugins = require('../lib/plugins-esbuild-plugin.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function compileDir(dir) {
    const cwd = process.cwd();
    process.chdir(path.dirname(path.dirname(dir)));
    try { return fcs.getAllFiles(dir + path.sep, {}, false, true); } finally { process.chdir(cwd); }
}
function viewSourceBytes(dir) {
    let n = 0;
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.view')) n += fs.statSync(p).size; } })(dir);
    return n;
}

(async () => {
    // 1. The runtime every project ships.
    const runtime = fs.statSync(path.join(__dirname, '..', 'lib', 'files', 'libs', 'lm.js')).size;
    check('runtime (lm.js) <= 460 KB', runtime <= 460 * 1024, (runtime / 1024).toFixed(1) + ' KB');

    // 2. Compiled views vs their source, on a fixture shaped like real admin views (loops, conditions, events,
    // attribute mustaches, a sizeable script).
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-budget-')));
    const views = path.join(root, 'src', 'views');
    fs.mkdirSync(views, { recursive: true });
    let rows = '';
    for (let i = 0; i < 40; i++) {
        rows += `<tr class="row r${i}" :for="list${i % 4} as it" data-id="{{it.id}}" @click="pick(it.id, index)">
  <td class="c1">{{it.name}}</td><td class="c2" :if="it.on">{{it.qty * it.price}}</td><td :else>-</td>
  <td><button class="btn sm" @click="edit(el, it)" tip="Edit {{it.name}}">edit</button></td></tr>\n`;
    }
    let script = '';
    for (let i = 0; i < 40; i++) script += `function f${i}(a, b) { var t = a + b * ${i}; if (t > 10) { return list${i % 4}.filter(function (x) { return x.id !== t; }); } return []; }\n`;
    fs.writeFileSync(path.join(views, 'big.view'), `<div class="page"><table class="tbl">${rows}</table>
<p class="total">Total: {{list0.length + list1.length}} items, {{title}}</p></div>
<script>
var list0 = [], list1 = [], list2 = [], list3 = [];
var title = 'Admin';
function pick(id, i) { title = id + ':' + i; }
function edit(el, it) { it.on = !it.on; }
${script}</script>`);
    const compiled = compileDir(views);
    const out = JSON.stringify(compiled, fcs.compactHstReplacer);
    const src = viewSourceBytes(views);
    check('fixture views compile to <= 3.5x their source (baseline 3.18x; 2.4.2 was 13.3x)', out.length <= src * 3.5, (out.length / src).toFixed(2) + 'x (' + out.length + ' / ' + src + ' bytes)');
    check('no AST is shipped for a valid script', !/"jst"/.test(out));
    check('no empty HST fields are shipped', !/"attrs":\{\}|"ax":\{\}|"evs":\{\}|"ex":\{\}|"isV":false/.test(out));

    // 2b. The real fixture this budget was measured on, when it exists on this machine (not in CI).
    const consoleViews = '/Users/Shared/www/BEACDN/console.roxyon.com/src/views';
    if (fs.existsSync(consoleViews)) {
        const c = JSON.stringify(compileDir(consoleViews), fcs.compactHstReplacer).length;
        const s = viewSourceBytes(consoleViews);
        check('console.roxyon.com views compile to <= 1.55x their source (baseline 1.40x)', c <= s * 1.55, (c / s).toFixed(2) + 'x');
    } else {
        console.log('SKIP  console.roxyon.com fixture not on this machine');
    }

    // 3. Plugin bundle as `lm build` ships it.
    const entries = plugins.selectedRegistryEntries({ select2: '*', 'bootstrap-datetimepicker': '*' });
    const coreDir = path.join(__dirname, '..', '..', 'core');
    const min = await plugins.buildSelectedPluginsBundle(entries, coreDir, { minify: true });
    const raw = await plugins.buildSelectedPluginsBundle(entries, coreDir);
    check('select2 + datetimepicker plugin bundle <= 330 KB minified', min.length <= 330 * 1024, (min.length / 1024).toFixed(1) + ' KB');
    check('lm build minifies plugins (< 45% of the readable bundle)', min.length < raw.length * 0.45, (min.length / raw.length * 100).toFixed(0) + '%');

    fs.rmSync(root, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
