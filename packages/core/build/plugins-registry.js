// plugins-registry.js — the 18-library (+jQuery) set available for
// per-project selective plugin bundling (packages/cli/lib/
// plugins-esbuild-plugin.js), the single source of truth for each
// library's npm path(s), build-time patch, and `after`-ordering
// constraint. (2026-09-19: originally factored out of build/bundle.js's
// now-removed buildCoreWithPlugins()/buildPluginsCss() — those built one
// monolithic bundle with all 18 always included; removed as functionally
// redundant with selecting all 18 via the selective mechanism. This
// registry itself is unaffected — still the shared source of truth, just
// with one consumer instead of two.)
//
// Deliberately a plain ORDERED ARRAY, not something that computes an order
// via topological sort: this array's declaration order IS the real,
// already-tested load order. A topo sort over `after` edges could legally
// reorder two independent no-dependency entries (e.g. jquery.easing vs
// jquery.numeric — no real dependency between them, but SOME specific
// order was already tested) for no functional reason. `validateOrder()`
// below instead turns the ordering knowledge that used to live only in
// code comments into an enforced invariant: it throws if any entry's
// `after` key doesn't already appear earlier in the array, catching a
// broken reorder immediately instead of letting it silently ship.
//
// Each entry:
//   key      — the real npm package name (also what a project's own
//              package.json dependency list is matched against — see
//              PROVENANCE.md).
//   npm      — one path or an array of paths, relative to node_modules.
//   css      — one path or an array of paths (relative to node_modules),
//              if this library ships compiled CSS.
//   lessCss  — a LESS source path to compile via the `less` package,
//              for the one library (bootstrap-datetimepicker) that ships
//              only LESS, no compiled CSS.
//   after    — keys that must already have been emitted before this one.
//   patch(src)    — transforms this entry's own JS source before it's
//                   emitted (the datetimepicker null-guard, the slick→crsl
//                   rename). Throws loudly if its patch anchor isn't found
//                   (package updated out from under it), exactly like the
//                   original inline checks did.
//   cssPatch(src) — same, for this entry's CSS (crsl's rename, applied to
//                   its CSS too).
//   code     — a registration statement emitted verbatim after this
//               entry's own source (the hasAttr polyfill, the jQueryBridget
//               registration, GSAP's ScrollToPlugin registration).
//   always   — true for the one entry (jQuery) that's implicitly required
//              by every other entry; not itself gated by `after` since
//              every real entry already declares `after: ["jquery"]`.

function datetimepickerPatch(src) {
    const patches = [
        ["icon.addClass(this.timeIcon);", "if (icon) icon.addClass(this.timeIcon);"],
        ["icon.removeClass(this.timeIcon);\n        icon.addClass(this.dateIcon);", "if (icon) {\n          icon.removeClass(this.timeIcon);\n          icon.addClass(this.dateIcon);\n        }"],
    ];
    for (const [from, to] of patches) {
        if (src.indexOf(from) === -1) {
            throw new Error('bootstrap-datetimepicker patch anchor not found: "' + from + '" — did the package update? Re-check the fix in plugins-registry.js against the new source.');
        }
        src = src.replace(from, to);
    }
    return src;
}

function crslRenamePatch(src) {
    if (src.indexOf('slick') === -1) {
        throw new Error('slick-carousel rename anchor "slick" not found in its own source — did the package change its own naming? Re-check this rename in plugins-registry.js.');
    }
    return src.split('Slick').join('Crsl').split('slick').join('crsl');
}

function crslCssPatch(src) {
    return src.split('slick').join('crsl');
}

const registry = [
    {
        key: 'jquery',
        npm: 'jquery/dist/jquery.js',
        after: [],
        always: true,
        code: 'jQuery.fn.hasAttr = function (name) { return !!(this[0] && this[0].getAttribute(name) != null); };' +
            'if (!jQuery.fn.live) jQuery.fn.live = function (events, data, fn) { if (typeof this.selector === "string") jQuery(document).on(events, this.selector, data, fn); else this.on(events, data, fn); return this; };',
    },
    {
        key: 'select2',
        npm: 'select2/dist/js/select2.js',
        css: 'select2/dist/css/select2.css',
        after: ['jquery'],
        // Only consumed by packages/cli's per-project selective esbuild
        // bundle (plugins-esbuild-plugin.js) — plain string concatenation
        // (how every other entry here gets combined) never triggers
        // select2's UMD wrapper's CommonJS branch at all, so this quirk
        // only matters for esbuild-based resolution. Select2's own
        // UMD wrapper (dist/js/select2.js) is unusual among these 18
        // libraries: its CommonJS branch exports a FACTORY FUNCTION
        // (`module.exports = function (root, jQuery) {...}`) rather than
        // self-attaching to jQuery.fn the moment it's required — real
        // esbuild bundling (which wraps every dependency in a genuine
        // module/exports closure) takes that branch, so a plain
        // side-effect import alone never actually calls the factory;
        // .select2 never gets attached. Confirmed by reading select2's
        // real source directly, not guessed.
        cjsFactory: true,
    },
    {
        key: 'flickity',
        npm: ['flickity/dist/flickity.pkgd.js', 'jquery-bridget/jquery-bridget.js'],
        css: 'flickity/dist/flickity.css',
        after: ['jquery'],
        code: 'jQueryBridget("flickity", Flickity, jQuery);',
    },
    {
        key: 'bootstrap-colorpicker',
        npm: 'bootstrap-colorpicker/dist/js/bootstrap-colorpicker.js',
        css: 'bootstrap-colorpicker/dist/css/bootstrap-colorpicker.css',
        after: ['jquery'],
    },
    {
        key: 'bootstrap-datetimepicker',
        npm: 'bootstrap-datetimepicker/src/js/bootstrap-datetimepicker.js',
        lessCss: 'bootstrap-datetimepicker/src/less/bootstrap-datetimepicker.less',
        after: ['jquery'],
        patch: datetimepickerPatch,
    },
    {
        key: 'jquery-ui-dist',
        npm: 'jquery-ui-dist/jquery-ui.js',
        css: 'jquery-ui-dist/jquery-ui.css',
        after: ['jquery'],
    },
    {
        key: 'jquery.easing',
        npm: 'jquery.easing/jquery.easing.js',
        after: ['jquery'],
    },
    {
        key: 'nestedSortable',
        npm: 'nestedSortable/jquery.mjs.nestedSortable.js',
        after: ['jquery-ui-dist'],
    },
    {
        key: 'jquery.numeric',
        npm: 'jquery.numeric/jquery.numeric.js',
        after: ['jquery'],
    },
    {
        key: 'timeago',
        npm: 'timeago/jquery.timeago.js',
        after: ['jquery'],
    },
    {
        key: 'slick-carousel',
        npm: 'slick-carousel/slick/slick.js',
        css: ['slick-carousel/slick/slick.css', 'slick-carousel/slick/slick-theme.css'],
        after: ['jquery'],
        patch: crslRenamePatch,
        cssPatch: crslCssPatch,
    },
    {
        key: '@iconify/iconify',
        npm: '@iconify/iconify/dist/iconify.js',
        after: [],
    },
    {
        key: 'rellax',
        npm: 'rellax/rellax.js',
        after: [],
    },
    {
        key: 'headroom.js',
        npm: ['headroom.js/dist/headroom.js', 'headroom.js/dist/jQuery.headroom.js'],
        after: ['jquery'],
    },
    {
        key: 'in-view',
        npm: 'in-view/dist/in-view.min.js',
        after: [],
    },
    {
        key: 'gsap',
        npm: ['gsap/dist/gsap.js', 'gsap/dist/ScrollToPlugin.js'],
        after: [],
        code: 'gsap.registerPlugin(ScrollToPlugin);',
    },
    {
        key: 'jquery.caret',
        npm: 'jquery.caret/dist/jquery.caret.js',
        after: ['jquery'],
    },
    {
        key: 'jquery-tageditor',
        npm: 'jquery-tageditor/jquery.tag-editor.js',
        css: 'jquery-tageditor/jquery.tag-editor.css',
        after: ['jquery.caret'],
    },
    {
        key: 'jquery-form',
        npm: 'jquery-form/src/jquery.form.js',
        after: ['jquery'],
    },
    {
        key: 'jquery-lazy',
        npm: 'jquery-lazy/jquery.lazy.js',
        after: ['jquery'],
    },
];

function validateOrder(entries) {
    const seen = new Set();
    for (const e of entries) {
        for (const dep of e.after) {
            if (!seen.has(dep)) {
                throw new Error(`plugins-registry.js: "${e.key}" is declared before its "after" dependency "${dep}" — reorder the array.`);
            }
        }
        seen.add(e.key);
    }
}

module.exports = registry;
module.exports.validateOrder = validateOrder;
