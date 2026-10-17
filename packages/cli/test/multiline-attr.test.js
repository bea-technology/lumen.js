// A quoted attribute value spanning several lines (dv2 mhdv.view: `data-perc="{{parseFloat((v * 100 /\n (c == 'jobs' ?\n
// a : b))).toFixed(2))}}"`) was cut at the first newline by the compiler's attribute regex (`".*?"`), and the rest of
// the value turned into stray attributes — the `:` of the ternary became an attribute named ":". The browser (and so
// V1, which let the browser parse) reads the whole value.
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
        const r = find(n.children, pred);
        if (r) return r;
    }
    return null;
}

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-mlattr-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<div id="a" class="x" data-perc="{{parseFloat((v * 100 /
    (cat == 'jobs' ?
    jobs : (cat == 'gdp' ? gdp :
    em))).toFixed(2))}}" title='one
two'>x</div>
<p id="b" class="y">after</p>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);
const hst = views[Object.keys(views)[0]].hst;
const a = find(hst, (n) => n.attrs && n.attrs.id === 'a');
const b = find(hst, (n) => n.attrs && n.attrs.id === 'b');

check('the element and its plain attributes are parsed', !!a && a.attrs['class'] === 'x', a && JSON.stringify(a.attrs));
check('no stray attributes from inside the multi-line value', a && Object.keys(a.attrs).sort().join() === 'class,data-perc,id,title', a && Object.keys(a.attrs).join());
check('the multi-line mustache value is kept whole', a && /cat == 'gdp' \? gdp :\s+em\)\)\)\.toFixed\(2\)/.test(JSON.stringify(a.ax['data-perc'] || a.attrs['data-perc'])), String(a && JSON.stringify(a.attrs['data-perc'])).slice(0, 160));
check('a single-quoted multi-line value is kept whole', a && a.attrs['title'] === 'one\ntwo', a && JSON.stringify(a.attrs['title']));
check('the next element is unaffected', !!b && b.attrs['class'] === 'y', b && JSON.stringify(b.attrs));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
