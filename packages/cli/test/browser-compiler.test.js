// The playground's in-browser compiler (build/browser-compiler.js) must produce exactly what the CLI's own parser
// produces, and must not depend on Node: it is loaded into a bare vm context with no require/Buffer/process.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const hst = require('../lib/hst.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-bc-')), 'c.js');
execFileSync(process.execPath, [path.join(__dirname, '..', 'build', 'browser-compiler.js'), out], { stdio: 'ignore' });
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(out, 'utf8') + ';this.LC = LumenCompiler;', ctx);
check('bundle loads with no Node globals', ctx.LC && typeof ctx.LC.compile === 'function');

const samples = [
    '<div><h1>{{ title }}</h1><button @click="n++">{{ n }}</button></div><script>var title = "x"; var n = 0;</script>',
    '<ul><li :if="show" :for="items as it">{{ it.name }}</li><li :for="items as it" :if="it.on">{{it}}</li></ul>',
    '<svg viewBox="0 0 10 10"><circle r="4"></circle></svg><p :else>&amp; done</p>',
    '<form o-sub="save"><input name="a" value="{{ a }}"></form><script>var a = 1; function save(d){ a = d.a; }</script>',
];
const scaffold = path.join(__dirname, '..', 'lib', 'files', 'project', 'src', 'views');
for (const f of fs.readdirSync(scaffold)) if (f.endsWith('.view')) samples.push(fs.readFileSync(path.join(scaffold, f), 'utf8'));
let same = 0;
for (const s of samples) if (JSON.stringify(ctx.LC.compile(s)) === JSON.stringify(hst._hst(s))) same++;
check('browser output equals the CLI parser on ' + samples.length + ' views', same === samples.length, same + '/' + samples.length);

const layout = ctx.LC.compileLayout('<nav nav></nav><main body></main><footer footer></footer>');
check('layouts get their widget regions', JSON.stringify(layout.regions) === '["nav","footer"]', JSON.stringify(layout.regions));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
