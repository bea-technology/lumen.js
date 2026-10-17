// V1 parity (verified by rendering the same view under the real V1 CLI): in an attribute, "`{{expr}}`" is replaced as
// one unit and that one pair of backticks disappears — `data-k="`{{it.n + '-' + index}}`"` -> "a-0",
// `data-k="``{{k}}``"` -> "`tea`". V2 kept them ("`a-0`"). Event attributes are left as written.
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require('../lib/fcs.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function find(nodes, pred) {
    for (const n of nodes || []) {
        if (!n) continue;
        if (pred(n)) return n;
        const r = find(n.children, pred) || find(n.content && typeof n.content === 'object' ? n.content : null, pred);
        if (r) return r;
    }
    return null;
}

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-bt-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<ul><li id="a" :for="items as it" data-k="\`{{it.n + '-' + index}}\`">x</li></ul>
<b id="b" data-k="\`\`{{k}}\`\`">y</b>
<i id="c" class="a-\`{{cnt}}\`-b" @click="go(\`{{cnt}}\`)">z</i>
<s id="d" title="plain {{cnt}} \`lit\`">w</s>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);
const hst = views[Object.keys(views)[0]].hst;
const byId = (id) => find(hst, (n) => n.attrs && n.attrs.id === id);

check('single backtick pair around a whole-attr mustache is dropped', byId('a') && byId('a').attrs['data-k'] === "{{it.n + '-' + index}}", byId('a') && byId('a').attrs['data-k']);
check('double backticks lose exactly one pair', byId('b') && byId('b').attrs['data-k'] === '`{{k}}`', byId('b') && byId('b').attrs['data-k']);
check('a backtick pair inside a longer value is dropped', byId('c') && byId('c').attrs['class'] === 'a-{{cnt}}-b', byId('c') && byId('c').attrs['class']);
check('event attributes keep their backticks', byId('c') && /`/.test(JSON.stringify(byId('c').evs['@click'])), byId('c') && JSON.stringify(byId('c').evs));
check('backticks not wrapping a mustache are untouched', byId('d') && byId('d').attrs['title'] === 'plain {{cnt}} `lit`', byId('d') && byId('d').attrs['title']);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
