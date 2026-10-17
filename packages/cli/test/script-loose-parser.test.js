// Regression: acorn-loose (the lenient fallback parser) mis-parses some VALID scripts, replacing a statement with an
// "✖" placeholder that regenerates as invalid JS, so the whole <script> of the view fails ("Invalid or unexpected
// token") and none of its variables or functions exist. A full scan of the V1 sites found 13 such scripts in 10
// sites (cloud.bea domains.view, takween login.view, console.roxyon.com applications.view, ...). Valid source must
// go through the strict parser; the loose one is only the fallback for scripts that really are broken.
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require('../lib/fcs.js');
const astring = require('astring');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
function scriptNode(nodes) {
    for (const n of nodes || []) {
        if (!n) continue;
        if (n.type === 'tag' && n.name === 'script') return n.children && n.children[0];
        const r = scriptNode(n.children); if (r) return r;
    }
    return null;
}
function compile(name, body) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-loose-'));
    fs.mkdirSync(path.join(dir, 'src', 'views'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'views', name + '.view'), '<div>x</div>\n<script>\n' + body + '\n</script>');
    const cwd = process.cwd(); process.chdir(dir);
    try {
        const views = fcs.getAllFiles(path.join(dir, 'src', 'views') + '/', {}, false, true);
        return scriptNode(Object.values(views)[0].hst);
    } finally { process.chdir(cwd); fs.rmSync(dir, { recursive: true, force: true }); }
}

const valid = `function getDomains(){
        if(nb1<=globals.tlds.length){
            for(var i=nb1;i<(nb1+10);i++){
        }
         bea.get("https://x/host/?domain="+domainName+"&tlds=" + test.join(","), { })
            .then((data) => {
                for (var i = 0; i < test.length; i++) {
                    if(test[i]!=tldName){
                        shDomains.push({
                    })
                    }
                }
            $('.dv-domains').removeClass('h')
            })
            .catch((err) => {
            });
        }
    }
var after = 1;`;
const node = compile('valid', valid);
// HST v2: a script that parses strictly ships as source (`content`); only a lenient-parser fallback ships `jst`.
const acorn = require('acorn');
const astOf = (n) => n && (n.jst || acorn.parse(n.content, { ecmaVersion: 'latest', sourceType: 'script' }));
const validAst = astOf(node);
const code = node ? astring.generate(validAst) : '';
check('a valid script ships as source, not an AST', node && typeof node.content === 'string' && node.content.length > 0 && node.jst === undefined);
check('valid script is found', !!node);
check('valid script has no loose-parser placeholder', node && !code.includes('✖'), code.slice(0, 200));
check('valid script regenerates as parseable JS', node && (() => { try { new Function(code); return true; } catch (e) { return false; } })());
check('statements after it survive', node && validAst.body.some((s) => s.type === 'VariableDeclaration' && s.declarations[0].id.name === 'after'));

const broken = compile('broken', 'var a = 1;\nfunction f( {\nvar b = 2;');
check('a genuinely broken script still parses leniently (fallback kept)', !!(broken && broken.jst && broken.jst.body.length >= 1));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
