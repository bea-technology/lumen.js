// plugins-esbuild-plugin.js — per-project SELECTIVE plugin bundling
// (2026-09-16). A project lists exact npm package names in its own
// package.json `dependencies` —
// the same strings as packages/core/build/plugins-registry.js's own
// `key`s (verified 1:1 against packages/core/package.json's real
// dependency names, so no separate alias table is needed) — and gets a
// real bundle file containing only real jQuery + the plugins it actually
// selected, with the exact same build-time patches (bootstrap-
// datetimepicker's null-guard, the slick→crsl rename) the monolithic
// bundle already applies.
//
// 2026-09-16, real architectural correction, found only by actually
// running the output in a real browser/jsdom (not by reasoning about it):
// an earlier version of this file bundled EVERY selected entry through
// esbuild (`bundle: true`), on the assumption these "packaged"/"dist"
// vendor files might have real, unbundled dependencies esbuild needed to
// resolve. That assumption was wrong for this specific class of file, and
// actively broke things: these are UMD-wrapped bundles authored to be
// consumed via plain <script> concatenation (typeof module === 'undefined'
// in that context, so they take the "browser globals" branch and self-
// attach to a global jQuery/$). esbuild's CJS-format bundling wraps every
// dependency in a REAL module/exports closure, so these same files
// instead take their UMD wrapper's "real CommonJS" branch — which, for
// something like Flickity's .pkgd.js (itself a concatenation of several
// UMD-wrapped internal sub-modules: ev-emitter, get-size, fizzy-ui-utils,
// unidragger, ./cell, ./slide, ./animate, ./core), means a cascade of
// real `require(...)` calls for things that were never meant to be
// resolved as real dependencies at all — esbuild either fails the build
// outright, or (once genuinely-external ones are exempted) leaves a bare
// `require(...)` call in browser output where no `require` function
// exists, throwing "ReferenceError: require is not defined" the moment
// that code actually executes (confirmed for real, not assumed).
//
// The registry already has each library's EXACT file path hardcoded
// (`npm`) — there is no real path resolution these files need at all, the
// same reason packages/core/build/bundle.js's own buildCoreWithPlugins()
// never needed a bundler for them either: readFileSync + a plain string
// patch + concatenation, exactly the same proven mechanism, just filtered
// to the selected subset instead of all of them. esbuild is reserved for
// the two entries that genuinely need a real, resolved value: jQuery
// itself (its export has to be captured and reassigned to window.jQuery/
// $, since nothing else could set that global for us) and any entry
// marked `cjsFactory` (Select2's own CommonJS export is a factory
// function needing explicit invocation with a real jQuery argument, not
// a plain side effect — see plugins-registry.js's select2 entry).
//
// Deliberately built to layer on top of the DEFAULT (dom-shim) runtime: no
// framework internal (_re.js, walk.js, ws.js, lstnrs.js, dom-shim.js
// itself — verified by reading all of them) captures a local $/jQuery
// reference; every one looks it up fresh off the global at call time
// (including _re.js's autoInitPlugins(), called at per-element mount time,
// well after page load). So this bundle, loaded as a later <script>,
// simply overwrites window.$/window.jQuery — "last script wins" — and
// every subsequent framework call transparently picks up the real
// plugins.
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

// 2026-09-16, real bug found and fixed while preparing to actually
// publish @lmjs/cli: this file (and the plugins-registry.js require
// below) used to locate packages/core via a hardcoded relative path
// (path.join(__dirname, "..", "..", "core")), which only resolves inside
// this monorepo's own directory layout — once @lmjs/cli is published and
// installed standalone, @lmjs/core lives in node_modules, not two
// directories up. require.resolve() finds its real, installed location
// either way (a pnpm workspace symlink here, a real npm install once
// published) — @lmjs/core is declared as a real "workspace:*" dependency
// in package.json.
const CORE_PACKAGE_DIR = path.dirname(require.resolve("@lmjs/core/package.json"));
const registry = require(path.join(CORE_PACKAGE_DIR, "build", "plugins-registry.js"));

// 2026-09-16, real bug found and fixed: every one of these 18+ libraries
// is already a real, exact-version-pinned, build-time-patched dependency
// of packages/core (it needs them for its own buildCoreWithPlugins()) —
// but this file originally resolved them from the CALLING PROJECT's own
// node_modules instead. A project selecting `select2` (installing only
// that) broke immediately: select2's `after: ["jquery"]` auto-includes
// jQuery into the selection, but nothing ever told the developer to
// `npm install jquery` too — confirmed empirically, "Could not resolve
// jquery/dist/jquery.js" the moment a real project tried this. A
// project's package.json dependency entry is a SELECTOR (which of the
// registry's known entries do you want), not an install requirement —
// resolving from packages/core's own dependencies instead guarantees the
// exact same, already-tested/patched version regardless of what (if
// anything) the project's own node_modules happens to contain.
//
// Deliberately NOT a hardcoded path.join(CORE_PACKAGE_DIR, "node_modules")
// — real npm installs commonly HOIST a dependency's own dependencies to a
// shared top-level node_modules instead of nesting them under
// @lmjs/core/node_modules specifically (this monorepo's own pnpm layout
// happens to have them nested, which would have hidden this bug from
// every test run inside it). require.resolve(npmPath, {paths:
// [CORE_PACKAGE_DIR]}) uses Node's own resolution algorithm — the same
// one esbuild's own `resolveDir` option already relies on for the
// jQuery/cjsFactory pieces below — which correctly walks up from
// CORE_PACKAGE_DIR to find each package wherever it actually landed,
// hoisted or not.
function resolveCoreModule(npmPath) {
  return require.resolve(npmPath, { paths: [CORE_PACKAGE_DIR] });
}

// Filters the registry to keys present in projectDeps (a project's own
// package.json `dependencies` object), auto-including any missing
// transitive `after` dependency (logged, not silently pulled in) plus the
// always-on jQuery/hasAttr entry — preserves registry (= validated) order.
function selectedRegistryEntries(projectDeps) {
  const selected = registry.filter((e) => projectDeps.hasOwnProperty(e.key));
  if (selected.length === 0) return [];

  const need = new Set(selected.map((e) => e.key));
  for (const e of selected) {
    for (const dep of e.after) {
      if (!need.has(dep)) {
        console.log(`LumenJS: "${e.key}" requires "${dep}" — auto-including it.`);
        need.add(dep);
      }
    }
  }
  for (const e of registry) {
    if (e.always) need.add(e.key);
  }
  // Selecting any plugin swaps the shim for real jQuery, which has no
  // ajaxForm — the framework's own form auto-binding needs it.
  if (need.has("jquery")) need.add("jquery-form");
  return registry.filter((e) => need.has(e.key));
}
exports.selectedRegistryEntries = selectedRegistryEntries;

// jQuery's own piece: needs a real, resolved import binding (not just a
// side-effect import) since it's reassigned to window.jQuery/$ — nothing
// else could set those globals for us. esbuild's CJS bundling makes
// jQuery's own UMD wrapper take its "real CommonJS" branch (exports via
// module.exports instead of self-attaching to window — confirmed
// empirically), which is exactly why this explicit capture-and-reassign
// step is necessary in the first place.
async function buildJqueryPiece(entry) {
  const npmPath = [].concat(entry.npm)[0];
  const result = await esbuild.build({
    stdin: {
      contents: `import __jquery from ${JSON.stringify(npmPath)};\nwindow.jQuery = window.$ = __jquery;`,
      resolveDir: CORE_PACKAGE_DIR,
      loader: "js",
    },
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: ["es2019"],
    write: false,
    minify: false,
    logLevel: "silent",
  });
  const parts = [result.outputFiles[0].text];
  if (entry.code) parts.push(entry.code);
  return parts.join(";\n");
}

// select2's own piece (or any future entry marked `cjsFactory`): its
// CommonJS export is a factory function (`module.exports = function
// (root, jQuery) {...}`) rather than a self-attaching side effect — needs
// explicit invocation with a real jQuery argument. Bundled with esbuild
// for the same reason as jQuery's own piece: this needs a real,
// resolved import binding to call.
async function buildCjsFactoryPiece(entry) {
  const npmPath = [].concat(entry.npm)[0];
  const result = await esbuild.build({
    stdin: {
      contents: `import __factory from ${JSON.stringify(npmPath)};\nif (typeof __factory === "function") __factory(window, window.jQuery);`,
      resolveDir: CORE_PACKAGE_DIR,
      loader: "js",
    },
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: ["es2019"],
    write: false,
    minify: false,
    logLevel: "silent",
  });
  const parts = [result.outputFiles[0].text];
  if (entry.code) parts.push(entry.code);
  return parts.join(";\n");
}

// Every other entry: plain read + patch + concatenate, exactly matching
// packages/core/build/bundle.js's own buildCoreWithPlugins() — see this
// file's header comment for why these vendored "packaged"/"dist" UMD
// files must NOT be run through esbuild's bundler at all.
function buildPlainPiece(entry) {
  const parts = [];
  for (const npmPath of [].concat(entry.npm || [])) {
    let src = fs.readFileSync(resolveCoreModule(npmPath), "utf8");
    if (entry.patch) src = entry.patch(src);
    parts.push(src);
  }
  if (entry.code) parts.push(entry.code);
  return parts.join(";\n");
}

async function buildEntryPiece(entry) {
  if (entry.key === "jquery") return buildJqueryPiece(entry);
  if (entry.cjsFactory) return buildCjsFactoryPiece(entry);
  return buildPlainPiece(entry);
}

// esbuild onLoad plugin: intercepts each selected entry's own npm path(s)
// that have a patch() function and returns the patched source instead of
// the raw file — same registry.patch() functions the monolithic bundle
// already applies. Exported for reuse/testing; buildPlainPiece() above
// applies patches directly (no esbuild involved) for the common case.
function createPatchPlugin(entries) {
  const patchable = entries.filter((e) => e.patch);
  return {
    name: "lumenjs-plugins-patch",
    setup(build) {
      for (const e of patchable) {
        for (const npmPath of [].concat(e.npm || [])) {
          const escaped = npmPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const filter = new RegExp(escaped.split("/").join("[\\\\/]") + "$");
          build.onLoad({ filter }, async (args) => {
            let src = await fs.promises.readFile(args.path, "utf8");
            return { contents: e.patch(src), loader: "js" };
          });
        }
      }
    },
  };
}
exports.createPatchPlugin = createPatchPlugin;

// Compiles CSS for the selected entries only — reuses the registry's own
// css/lessCss/cssPatch fields directly (the same data
// build/bundle.js's buildPluginsCss() reads), no need to route CSS
// through esbuild's own bundler for these — none of these files have
// relative url()/@import complexity that would benefit from it.
async function buildSelectedCss(entries) {
  const less = require("less");
  const parts = [];
  for (const e of entries) {
    if (e.css) {
      for (const cssPath of [].concat(e.css)) {
        let src = fs.readFileSync(resolveCoreModule(cssPath), "utf8");
        if (e.cssPatch) src = e.cssPatch(src);
        parts.push(src);
      }
    }
    if (e.lessCss) {
      const lessFile = resolveCoreModule(e.lessCss);
      const lessSrc = fs.readFileSync(lessFile, "utf8");
      const vendorStubs = path.join(CORE_PACKAGE_DIR, "vendor", "bootstrap2-less-stubs");
      const lessOut = await less.render(lessSrc, {
        filename: lessFile,
        paths: [vendorStubs],
      });
      parts.push(lessOut.css);
    }
  }
  return parts.join("\n");
}
exports.buildSelectedCss = buildSelectedCss;

// Bundles jQuery + selected plugins (with patches, in registry order) into
// one string, ready to write as a project's own additional <script> file.
//
// 2026-09-16, real bug found and fixed: an earlier version of this
// function bundled ALL selected entries together in ONE esbuild call.
// That broke execution order — esbuild's CJS-format bundler does not
// guarantee a bound import and unrelated side-effect-only imports execute
// in the textual order they were written; confirmed empirically:
// bootstrap-datetimepicker's own invocation of its factory ended up
// emitted and executed BEFORE this function's own jQuery-globalizing
// assignment, even though the assignment was written first. Fixed (along
// with the esbuild-vs-plain-concatenation split explained in this file's
// header) by giving each entry its own independent piece and stitching
// the resulting strings together myself via plain concatenation, in
// registry order — exactly the same "just concatenate strings in a known
// order" mechanism the already-working, already-tested monolithic
// buildCoreWithPlugins() (packages/core/build/bundle.js) already relies
// on, rather than trusting esbuild's own cross-statement ordering for
// something that matters this much.
async function buildSelectedPluginsBundle(entries, projectRoot, opts) {
  if (entries.length === 0) return null;
  const parts = [];
  for (const entry of entries) {
    parts.push(await buildEntryPiece(entry));
  }
  const code = parts.join(";\n");
  // `lm build` ships it minified (V1's whole runtime incl. plugins was ~2 MB; unminified plugins alone were ~1.4 MB
  // on console.roxyon.com). Script-mode transform: top-level names the libraries share stay intact; license
  // comments are kept at the end. `lm serve` keeps it readable.
  if (opts && opts.minify) {
    return esbuild.transformSync(code, { minify: true, legalComments: "eof", target: ["es2019"] }).code;
  }
  return code;
}
exports.buildSelectedPluginsBundle = buildSelectedPluginsBundle;
