// Regression test: :for's array-source expression used to be pushed
// verbatim into the file's shared reactiveVariables list (fcs.js's
// parseTag(), the ":for" branch) — instead of being reduced to its real
// base identifier via collectVariableUsageFromAST, the way :if/:else-if
// and every mustache already were. For a bare identifier like
// `:for="items"` this happened to look harmless, but for a real, common
// V1 shape — a DOTTED expression, e.g. `:for="globals.sections.footer_
// social.specs"` (found migrating a real V1 footer.view) — the whole
// dotted string landed in reactiveVariables as if it were one variable
// name. Since that list is shared across the WHOLE file, not scoped to
// the one :for, it poisoned every OTHER expression's evaluation context
// too: _re.js's scopedEval() builds its eval context from these names as
// literal function PARAMETER names, and a name containing dots makes
// Function.apply(...) throw "Arg string terminates parameters early" for
// ANY expression evaluated in that context — not just the :for's own.
// Confirmed real via the actual console error, then traced to this exact
// line by parsing the real footer.view with the real parser.
const fs = require('fs');
const os = require('os');
const path = require('path');

const fcs = require('../lib/fcs.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-for-reactive-vars-'));
const viewsDir = path.join(tmpDir, 'src', 'views');
fs.mkdirSync(viewsDir, { recursive: true });

// Real shape: a dotted :for source, plus an unrelated mustache elsewhere
// in the same file referencing a completely different variable — proving
// the dotted :for doesn't leak into, or corrupt, the shared list.
const realWorldMarkup = `
<div>
    <a :for="globals.sections.footer_social.specs" href="\`{{Value}}\`">{{Icon}}</a>
    <div>{{unrelatedVar}}</div>
</div>
`;
fs.writeFileSync(path.join(viewsDir, 'fortest.view'), realWorldMarkup);

const views = fcs.getAllFiles(viewsDir, {}, false, true);
const entry = Object.values(views)[0];
const reactiveVars = entry && entry.reactiveVars;

check('reactiveVars is present', !!reactiveVars, JSON.stringify(entry));
if (reactiveVars) {
    check('the dotted :for source string itself is NOT in reactiveVars', !reactiveVars.includes('globals.sections.footer_social.specs'), JSON.stringify(reactiveVars));
    check('the :for source\'s real base identifier ("globals") IS in reactiveVars', reactiveVars.includes('globals'), JSON.stringify(reactiveVars));
    check('an unrelated mustache variable elsewhere in the same file is still detected too', reactiveVars.includes('unrelatedVar'), JSON.stringify(reactiveVars));
    check('every entry in reactiveVars is a bare, valid identifier (no dots/spaces/hyphens)', reactiveVars.every(v => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(v)), JSON.stringify(reactiveVars));
}

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
