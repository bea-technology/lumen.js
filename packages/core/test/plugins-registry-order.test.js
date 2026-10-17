// Unit test: plugins-registry.js's validateOrder() (2026-09-16) — proves
// the safety net this session's registry refactor added actually catches
// a broken reorder, since the refactor itself only guarantees TODAY's
// order is correct (verified separately by a byte-identical-output diff
// against the pre-refactor build/bundle.js) — this guards against a
// FUTURE edit accidentally breaking a real ordering constraint (e.g.
// nestedSortable needs jQuery UI loaded first because it extends its
// Sortable widget).
const path = require('path');
const registryModule = path.join(__dirname, '../build/plugins-registry.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const registry = require(registryModule);
const { validateOrder } = registry;

check('validateOrder() does not throw on the real, current registry', (() => {
    try { validateOrder(registry); return true; } catch (e) { return false; }
})());

check('validateOrder() throws when an entry is moved before its "after" dependency', (() => {
    // Real constraint in the actual registry: nestedSortable has
    // after: ["jquery-ui-dist"]. Swap their positions and confirm the
    // validator catches it.
    const broken = registry.slice();
    const nestedIdx = broken.findIndex((e) => e.key === 'nestedSortable');
    const uiIdx = broken.findIndex((e) => e.key === 'jquery-ui-dist');
    if (nestedIdx === -1 || uiIdx === -1) {
        console.log('FAIL  (setup) could not find nestedSortable/jquery-ui-dist in the real registry to construct this test');
        return false;
    }
    [broken[nestedIdx], broken[uiIdx]] = [broken[uiIdx], broken[nestedIdx]];
    try { validateOrder(broken); return false; } catch (e) { return e.message.includes('nestedSortable'); }
})());

check('every registry entry has a unique key', (() => {
    const keys = registry.map((e) => e.key);
    return new Set(keys).size === keys.length;
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
