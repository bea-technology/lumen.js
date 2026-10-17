// Regression test: fcs.js's custom parser never HTML-entity-decoded
// attribute values at all — a real browser's native HTML parser always
// does this (an attribute value like `:if="age &lt; 18"` really means
// the 8-character string "age < 18", not the literal text "age &lt; 18").
//
// Real, severe, confirmed impact: `:if="age &lt; 18"` (real migrated
// content, entity-encoded — common when authored/copy-pasted alongside
// documentation code samples that legitimately need the entity) got
// parsed by acorn as TWO real JS statements ("age & lt;" then "18;",
// since "&" is a real bitwise-AND operator and "lt" a real bare
// identifier) — "lt" got detected as a genuinely-used variable and
// added to reactiveVariables, which meant it round-tripped through
// scopedEval() as a real (undefined-valued) function parameter instead
// of throwing a ReferenceError — eval()'s result became the LAST
// statement's value (the literal 18, always truthy), making a real
// :if condition permanently stuck true regardless of the real variable
// value, with no error anywhere. Confirmed live on a real running page
// (/guide/conditions): an age-increment demo's :if/:else-if never
// switched branches no matter how high `age` got.
const fs = require('fs');
const os = require('os');
const path = require('path');

const fcs = require('../lib/fcs.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-entity-decode-'));
const viewsDir = path.join(tmpDir, 'src', 'views');
fs.mkdirSync(viewsDir, { recursive: true });

const markup = `
<div>
    <p :if="age &lt; 18">minor</p>
    <p :else-if="age &lt; 21">young adult</p>
    <p :else>adult</p>
    <a href="/x?a=1&amp;b=2" title="Tom &amp; Jerry">link</a>
</div>
`;
fs.writeFileSync(path.join(viewsDir, 'entitytest.view'), markup);

const views = fcs.getAllFiles(viewsDir, {}, false, true);
const entry = Object.values(views)[0];
const hst = entry && entry.hst;

function findByAttr(nodes, key) {
    for (const n of nodes || []) {
        if (n.attrs && Object.prototype.hasOwnProperty.call(n.attrs, key)) return n;
        const found = findByAttr(n.children, key);
        if (found) return found;
    }
    return null;
}

const ifNode = findByAttr(hst, ':if');
check(':if condition is real, decoded JS ("age < 18"), not the raw entity text', ifNode && ifNode.attrs[':if'] === 'age < 18', ifNode && JSON.stringify(ifNode.attrs));

const elseIfNode = findByAttr(hst, ':else-if');
check(':else-if condition is also decoded', elseIfNode && elseIfNode.attrs[':else-if'] === 'age < 21', elseIfNode && JSON.stringify(elseIfNode.attrs));

check('reactiveVars contains the real "age" identifier', entry.reactiveVars.includes('age'), JSON.stringify(entry.reactiveVars));
check('reactiveVars does NOT contain the entity-parsing artifact "lt" (the actual bug)', !entry.reactiveVars.includes('lt'), JSON.stringify(entry.reactiveVars));

const linkNode = findByAttr(hst, 'href');
check('a plain attribute value with &amp; is also decoded ("/x?a=1&b=2")', linkNode && linkNode.attrs['href'] === '/x?a=1&b=2', linkNode && JSON.stringify(linkNode.attrs));
check('a title attribute with &amp; decodes to a real ampersand', linkNode && linkNode.attrs['title'] === 'Tom & Jerry', linkNode && JSON.stringify(linkNode.attrs));

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
