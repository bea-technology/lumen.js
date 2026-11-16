// 2.8.2: a `plugins.*.js` must never contain a top-level import/export. The 2.8.1 console build shipped one
// (`import Gi from"jquery"`), a SyntaxError that stopped every plugin in the file (Iconify blank, no select2).
const path = require('path');
const { containsEsm, assertNoTopLevelEsm, bundleEsmSource } = require('../lib/plugins-esbuild-plugin.js');

const CORE = path.dirname(require.resolve('@lmjs/core/package.json'));
const results = [];
const check = (name, cond, detail) => results.push({ name, cond: !!cond, detail });

(async () => {
  // detection
  check('detects an ESM import', containsEsm('import Gi from"jquery";\nvar x=1;'));
  check('detects an ESM export', containsEsm('export default function () {}'));
  check('ignores UMD / classic scripts', !containsEsm('(function($){ $.fn.x = function(){} })(jQuery);'));
  check('ignores a dynamic import inside code', !containsEsm('var p = import("x");'));
  check('ignores the word import in a string', !containsEsm('var s = "import x from y";'));

  // guard
  let threw = false;
  try { assertNoTopLevelEsm('var a=1;\nimport x from "jquery";\n'); } catch (e) { threw = /top-level import\/export/.test(e.message); }
  check('the bundle guard throws on a top-level import', threw);
  check('the bundle guard passes a clean bundle', assertNoTopLevelEsm('var a=1; (function(){})();') === 'var a=1; (function(){})();');

  // a real ESM piece, bundled the way buildPlainPiece does it
  try {
    const out = await bundleEsmSource('import Gi from "jquery";\nwindow.__iconifyTest = typeof Gi;', CORE);
    check('an ESM piece is rebundled to CJS (no top-level import left)', !containsEsm(out) && /jquery/i.test(out), out.slice(0, 80));
    check('the rebundled piece still runs its own code', /__iconifyTest/.test(out));
  } catch (e) {
    check('ESM piece rebundling works', false, e.message);
  }

  let pass = 0, fail = 0;
  for (const r of results) {
    if (r.cond) { pass++; console.log('PASS  ' + r.name); }
    else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
