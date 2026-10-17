// Regression test: <script>/<style> raw-text boundary (2026-09-18) — a
// real, unmodified V1 project's form.view broke fcs.js's HTML parser
// entirely: `var frm = "<div>...";` (an ordinary JS string/template
// literal building real HTML markup — ordinary, common code) truncated
// the ENTIRE rest of that <script> block at the first "<" found inside
// the string, silently. Everything after that point (most of the real
// script) was parsed as if it were page markup, not script content.
// fcs.js's tag-boundary finder now specifically looks for the real
// </script>/</style> closing tag for those two tag names (matching how
// real HTML parsing treats them as raw text), and the outer tag-scanning
// loop skips every tag-looking match found inside that range (reusing the
// same mechanism `inComponent` already had for a different reason) —
// both pieces are required together; this test would have caught either
// one being missing.
const fs = require('fs');
const os = require('os');
const path = require('path');

const fcs = require('../lib/fcs.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

function findScriptTextNode(nodes) {
    if (!Array.isArray(nodes)) return null;
    for (const n of nodes) {
        if (!n) continue;
        if (n.type === 'tag' && n.name === 'script') return n.children && n.children[0];
        if (n.children) { const r = findScriptTextNode(n.children); if (r) return r; }
    }
    return null;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-script-rawtext-'));
const viewsDir = path.join(tmpDir, 'src', 'views');
fs.mkdirSync(viewsDir, { recursive: true });

const realWorldMarkup = `
<div>hi</div>
<script>
    function greet() { console.log('hi'); }
    var frm = "<div class=\\"dv-form\\"><form o-sub=\\"sendForm\\"><input name=\\"a\\"></form></div>";
    var afterMarkup = "this line must still be parsed";
</script>
`;
fs.writeFileSync(path.join(viewsDir, 'formtest.view'), realWorldMarkup);

const views = fcs.getAllFiles(viewsDir, {}, false, true);
const entry = Object.values(views)[0];
const scriptTextNode = entry && findScriptTextNode(entry.hst);

check('a <script> containing a JS string with real "<" markup inside it is found at all', !!scriptTextNode);
if (scriptTextNode) {
    // HST v2: the script ships as its source text; parse it the way the runtime does.
    const ast = scriptTextNode.jst || require('acorn').parse(scriptTextNode.content, { ecmaVersion: 'latest', sourceType: 'script' });
    const body = ast.body;
    check('the whole script is parsed as real statements, not truncated at the inner "<"', body.length === 3, 'body.length=' + body.length);
    check('the statement AFTER the markup string survived (proves the boundary reached the real </script>)',
        body.length === 3 && body[2].type === 'VariableDeclaration' && body[2].declarations[0].id.name === 'afterMarkup',
        JSON.stringify(body.map(s => s.type)));
}

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
