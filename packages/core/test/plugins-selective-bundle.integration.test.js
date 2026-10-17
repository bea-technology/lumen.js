// Integration test: per-project SELECTIVE plugin bundling (2026-09-16,
// packages/cli/lib/plugins-esbuild-plugin.js) — a project can select just
// the plugins it actually uses (via its own package.json dependencies,
// matching packages/core/build/plugins-registry.js's own keys) instead of
// tree-shaking being all-or-nothing.
//
// 2026-09-19: this used to also compare against a separate, monolithic
// --with-plugins bundle (dist/lumenjs-core-with-plugins.js) — removed,
// confirmed functionally redundant with selecting all 18 registry entries
// via this exact mechanism (see PROVENANCE.md). Check #1 below now compares
// a small selection against a full-18-selection built the same way
// `plugins-selective-bundle-full.integration.test.js` does, instead of
// reading a dist file that no longer exists.
//
// Covers exactly the properties this feature's design depended on:
//   1. a small selection is meaningfully smaller than selecting everything
//   2. build-time patches (bootstrap-datetimepicker's null-guard, the
//      slick->crsl rename) survive real per-project esbuild resolution,
//      not just the hardcoded monolithic path
//   3. layering this bundle on top of the DEFAULT (dom-shim) runtime does
//      NOT double-load jQuery -- verifies this session's "no framework
//      internal captures a local $ reference" finding for real, not just
//      in theory
//   4. selecting a plugin with an unmet `after` dependency auto-includes it
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const pluginsEsbuild = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'plugins-esbuild-plugin.js'));
const registry = require(path.join(__dirname, '..', 'build', 'plugins-registry.js'));

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// packages/core is where select2/flickity/bootstrap-datetimepicker/etc.
// actually live in node_modules (they're packages/core's own dependencies,
// same source plugins-registry.js's readModule()-equivalent resolution
// uses) — resolve against that, not packages/cli's own node_modules.
const projectRoot = path.join(__dirname, '..');

async function main() {
    // --- 1. bundle-size test: select 2 plugins, compare to selecting all 18 ---
    const smallSelection = pluginsEsbuild.selectedRegistryEntries({ select2: '*', flickity: '*' });
    check('selecting 2 plugins auto-includes jquery (always-on)', smallSelection.some((e) => e.key === 'jquery'));
    const smallBundle = await pluginsEsbuild.buildSelectedPluginsBundle(smallSelection, projectRoot);

    // 2026-09-19: "full" is now built the same way "small" is — via this
    // same selective mechanism, selecting every registry key — rather than
    // reading the now-removed monolithic dist/lumenjs-core-with-plugins.js.
    const allDeps = {};
    for (const e of registry) allDeps[e.key] = '*';
    const fullSelection = pluginsEsbuild.selectedRegistryEntries(allDeps);
    const fullBundle = await pluginsEsbuild.buildSelectedPluginsBundle(fullSelection, projectRoot);
    const fullBundleSize = fullBundle.length;
    check(
        `selective bundle (select2+flickity, ${smallBundle.length} bytes) is meaningfully smaller than selecting all 18 libraries (${fullBundleSize} bytes)`,
        smallBundle.length < fullBundleSize * 0.5,
        `${smallBundle.length} vs ${fullBundleSize}`
    );

    // --- 2. correctness: patches survive real per-project esbuild resolution ---
    const patchSelection = pluginsEsbuild.selectedRegistryEntries({ 'slick-carousel': '*', 'bootstrap-datetimepicker': '*' });
    const patchBundle = await pluginsEsbuild.buildSelectedPluginsBundle(patchSelection, projectRoot);
    check('crsl rename survived real esbuild resolution (crsl present)', /crsl/.test(patchBundle));
    check('the ORIGINAL slick identifier is gone after the rename patch (renamed, not just added alongside)', !/\bSlick\.prototype\b/.test(patchBundle));

    const dtpDom = new JSDOM(`<!doctype html><body><input id="bare-input"><script>${patchBundle}</script></body>`, {
        url: 'http://127.0.0.1:3000/', runScripts: 'dangerously',
    });
    await new Promise((r) => setTimeout(r, 300));
    const dtpResult = await new Promise((resolve) => {
        const s = dtpDom.window.document.createElement('script');
        s.textContent = `
            window.__dtpResult = 'not run';
            try {
                jQuery('#bare-input').datetimepicker({});
                window.__dtpResult = 'ok';
            } catch (e) {
                window.__dtpResult = 'threw: ' + e.message;
            }
        `;
        dtpDom.window.document.body.appendChild(s);
        setTimeout(() => resolve(dtpDom.window.__dtpResult), 200);
    });
    check('bootstrap-datetimepicker null-guard patch survived real esbuild resolution (no throw on a bare <input>)', dtpResult === 'ok', dtpResult);

    // --- 3. double-jQuery guard: load the DEFAULT (dom-shim) runtime, then this selective bundle, in one window ---
    const defaultRuntime = fs.readFileSync(path.join(__dirname, '..', 'dist', 'lumenjs-core.js'), 'utf8');
    const selectiveSelection = pluginsEsbuild.selectedRegistryEntries({ select2: '*' });
    const selectiveBundle = await pluginsEsbuild.buildSelectedPluginsBundle(selectiveSelection, projectRoot);
    const combinedDom = new JSDOM(
        `<!doctype html><body><div main></div><script>${defaultRuntime}</script><script>${selectiveBundle}</script></body>`,
        {
            url: 'http://127.0.0.1:3000/', runScripts: 'dangerously',
            beforeParse(window) {
                window.URL.createObjectURL = () => 'blob:test';
                window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
            },
        }
    );
    await new Promise((r) => setTimeout(r, 500));
    check('after loading the default runtime then the selective plugins bundle, window.jQuery === window.$ (one instance, not two)', combinedDom.window.jQuery === combinedDom.window.$);
    check('real select2 is attached (not the dom-shim, which has no .select2)', typeof combinedDom.window.jQuery.fn.select2 === 'function');

    // --- 4. auto-include test ---
    const autoIncludeSelection = pluginsEsbuild.selectedRegistryEntries({ nestedSortable: '*' });
    check('selecting only nestedSortable auto-includes jquery-ui-dist (its "after" dependency)', autoIncludeSelection.some((e) => e.key === 'jquery-ui-dist'));
    const uiIdx = autoIncludeSelection.findIndex((e) => e.key === 'jquery-ui-dist');
    const nestedIdx = autoIncludeSelection.findIndex((e) => e.key === 'nestedSortable');
    check('jquery-ui-dist is ordered before nestedSortable in the result', uiIdx !== -1 && nestedIdx !== -1 && uiIdx < nestedIdx);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
    console.log('FAIL  test script threw: ' + e.message + '\n' + e.stack);
    process.exit(1);
});
