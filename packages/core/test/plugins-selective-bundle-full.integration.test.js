// Integration test: per-project selective plugin bundling (2026-09-16,
// packages/cli/lib/plugins-esbuild-plugin.js), selecting ALL 18 libraries
// at once (mirroring plugins-bundle.integration.test.js's own fixture and
// checks almost exactly, but sourcing the bundle from the SELECTIVE
// esbuild mechanism instead of the prebuilt --with-plugins monolith).
//
// Why this exists as its own file, separate from
// plugins-selective-bundle.integration.test.js's narrower checks: real,
// non-obvious esbuild-specific bugs kept surfacing while building this
// feature, each only found by actually loading a bundle in jsdom and
// checking real behavior, not string presence — an unrelated ordering bug
// (jQuery attaching after a plugin that needed it already ran), jQuery
// getting duplicated once per plugin that internally requires it, and
// Select2 specifically exporting a CommonJS factory function needing
// explicit invocation rather than self-attaching (see plugins-registry.js's
// `cjsFactory` field). Given that track record, checking only 3-4 of the
// 18 libraries would leave real risk unverified — this runs the exact
// same real-initialization checks across every one of them.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const pluginsEsbuild = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'plugins-esbuild-plugin.js'));
const registry = require(path.join(__dirname, '..', 'build', 'plugins-registry.js'));

const projectRoot = path.join(__dirname, '..');

const testScript = `
try {
    window.__results = [];
    function check(name, cond, detail) {
        window.__results.push({ name, cond: !!cond, detail });
    }

    check('jQuery loaded (real, not the shim)', typeof jQuery === 'function' && /^3\\./.test(jQuery.fn.jquery), 'jquery=' + (typeof jQuery !== 'undefined' ? jQuery.fn.jquery : 'undefined'));
    check('$.fn.animate exists (real jQuery core, not in the lightweight shim)', typeof $.fn.animate === 'function');
    // 2026-09-19: ported over from plugins-bundle.integration.test.js
    // (deleted — tested only the now-removed monolithic --with-plugins
    // bundle) so this file stays a genuine 100% superset of that
    // coverage, not 32/33 of it.
    check('$.fn.stop exists (real jQuery core, not in the lightweight shim)', typeof $.fn.stop === 'function');
    check('$.fn.hasAttr polyfill exists', typeof $.fn.hasAttr === 'function');
    check('$.fn.select2 exists', typeof $.fn.select2 === 'function');
    check('$.fn.flickity exists', typeof $.fn.flickity === 'function');
    check('$.fn.colorpicker exists', typeof $.fn.colorpicker === 'function');
    check('$.fn.datetimepicker exists', typeof $.fn.datetimepicker === 'function');

    $('#e2e-select').select2({ width: '100%' });
    check('select2 initializes without throwing, creates .select2-container', document.querySelector('.select2-container') !== null);

    $('#e2e-carousel').flickity({ cellAlign: 'center', wrapAround: false, pageDots: false });
    check('flickity initializes without throwing, adds .flickity-enabled', document.getElementById('e2e-carousel').classList.contains('flickity-enabled'));

    $('#e2e-color').colorpicker({ format: 'rgba' });
    check('colorpicker initializes without throwing', true);

    $('#e2e-date').datetimepicker({});
    check('datetimepicker initializes without throwing on a bare <input>', true);

    check('$.fn.sortable exists (jQuery UI)', typeof $.fn.sortable === 'function');
    $('#e2e-sortable').sortable();
    check('jQuery UI sortable() initializes on a real element without throwing', true);

    // 2026-09-22, real coverage gap found and closed: draggable() was
    // never actually checked here, despite being the exact real jQuery
    // UI method the vendored [drag] attribute auto-init (vendor/
    // reconnecting-websocket.js's renderPlugins()) calls directly —
    // found investigating a real user report of /guide/draggable/
    // structure throwing "t2.draggable is not a function" on the
    // default (no jQuery UI selected) runtime.
    check('$.fn.draggable exists (jQuery UI)', typeof $.fn.draggable === 'function');
    $('#e2e-draggable').draggable();
    check('jQuery UI draggable() initializes on a real element, adds .ui-draggable', document.getElementById('e2e-draggable').classList.contains('ui-draggable'));

    check('$.fn.nestedSortable exists', typeof $.fn.nestedSortable === 'function');
    check('$.easing has more than the 2 jQuery-core built-ins', Object.keys($.easing).length > 2);

    $('#e2e-numeric').numeric();
    check('jquery.numeric initializes without throwing', true);

    $('#e2e-timeago').timeago();
    check('timeago initializes without throwing', true);

    check('$.fn.crsl exists, $.fn.slick does not (confirms the rename took)', typeof $.fn.crsl === 'function' && typeof $.fn.slick === 'undefined');
    $('#e2e-crsl').crsl();
    check('crsl initializes on a real element, adds .crsl-initialized', document.getElementById('e2e-crsl').classList.contains('crsl-initialized'));

    check('Iconify global exists', typeof Iconify === 'object');
    new Rellax('#e2e-rellax');
    check('rellax (Rellax class) constructs without throwing', typeof Rellax === 'function');

    check('Headroom class exists', typeof Headroom === 'function');
    check('$.fn.headroom exists', typeof $.fn.headroom === 'function');
    check('window.inView exists and is callable', typeof inView === 'function');

    check('window.gsap exists', typeof gsap === 'object' && typeof gsap.to === 'function');
    check('GSAP ScrollToPlugin is registered', !!(gsap.plugins && gsap.plugins.scrollTo));

    check('$.fn.caret exists and a real call does not throw', typeof $.fn.caret === 'function');
    $('#e2e-numeric').caret('pos');

    $('#e2e-tageditor').tagEditor();
    check('jquery-tageditor initializes without throwing', typeof $.fn.tagEditor === 'function');

    check('$.fn.ajaxSubmit exists (jquery-form)', typeof $.fn.ajaxSubmit === 'function');
    check('$.fn.ajaxForm exists', typeof $.fn.ajaxForm === 'function');

    check('jquery.lazy: $.fn.Lazy exists', typeof $.fn.Lazy === 'function');
} catch (e) {
    window.__results = window.__results || [];
    window.__results.push({ name: 'plugin checks ran to completion', cond: false, detail: e.message + '\\n' + e.stack });
}
`;

async function main() {
    const allDeps = {};
    for (const e of registry) allDeps[e.key] = '*';
    const selected = pluginsEsbuild.selectedRegistryEntries(allDeps);
    console.log(`Selected ${selected.length} entries (all ${registry.length} registry entries).`);

    const bundle = await pluginsEsbuild.buildSelectedPluginsBundle(selected, projectRoot);

    const dom = new JSDOM(
        `<!doctype html><body>
            <div main></div>
            <select id="e2e-select"><option value="a">Alpha</option><option value="b">Beta</option></select>
            <div class="carousel" id="e2e-carousel"><div class="carousel-cell">1</div><div class="carousel-cell">2</div></div>
            <input id="e2e-color" value="#ff0000">
            <input id="e2e-date">
            <div id="e2e-sortable"><div id="i1">a</div><div id="i2">b</div></div>
            <div id="e2e-draggable">drag me</div>
            <input id="e2e-numeric">
            <time id="e2e-timeago" datetime="2020-01-01"></time>
            <div id="e2e-crsl"><div>1</div><div>2</div></div>
            <div id="e2e-rellax" data-rellax-speed="2"></div>
            <textarea id="e2e-tageditor"></textarea>
            <script>${bundle}</script>
        </body>`,
        {
            url: 'http://127.0.0.1:3000/', runScripts: 'dangerously',
            beforeParse(window) {
                window.URL.createObjectURL = window.URL.createObjectURL || (() => 'blob:test');
                window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
                window.requestAnimationFrame = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
                window.cancelAnimationFrame = window.cancelAnimationFrame || function (id) { clearTimeout(id); };
            }
        }
    );
    const win = dom.window;

    setTimeout(() => {
        const script = win.document.createElement('script');
        script.textContent = testScript;
        win.document.body.appendChild(script);

        setTimeout(() => {
            let pass = 0, fail = 0;
            for (const r of (win.__results || [])) {
                if (r.cond) { pass++; console.log('PASS  ' + r.name); }
                else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
            }
            console.log(`\n${pass} passed, ${fail} failed`);
            process.exit(fail === 0 ? 0 : 1);
        }, 300);
    }, 300);
}

main().catch((e) => {
    console.log('FAIL  test script threw: ' + e.message + '\n' + e.stack);
    process.exit(1);
});
