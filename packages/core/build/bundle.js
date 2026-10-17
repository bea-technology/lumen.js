#!/usr/bin/env node
// V2's own build pipeline — isolated from V1's index.php entirely, per the
// working-session decision (2026-09-13) to keep V2 fully separate rather
// than editing the live PHP CDN pipeline.
//
// Produces one bundle:
//   - dist/lumenjs-core.js — dom-shim.js (a minimal jQuery-compatible
//     layer) + the css/up workers + walk.js + _re.js + vendor/
//     reconnecting-websocket.js + index-bootstrap.js + ws.js + lstnrs.js.
//     No real jQuery, no plugins. This is the default every LumenJS V2
//     page gets.
//
// 2026-09-19: this file used to also produce a second, monolithic
// dist/lumenjs-core-with-plugins.js (+ dist/lumenjs-plugins.css) — real
// jQuery + all 18 registry libraries baked into one file. Removed: proven
// functionally redundant with packages/cli's per-project selective plugin
// bundling (a project lists exact registry keys in its own package.json
// dependencies) — both ultimately produce [some real-jQuery-based plugin
// set] + the exact same buildCommonTail() engine code below; the only real
// difference was one combined file vs. two. See PROVENANCE.md and
// build/plugins-registry.js (kept — still the shared source of truth the
// selective mechanism in packages/cli reads from) for the full per-library
// sourcing trail, which is still accurate and still load-bearing.

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const SRC = path.join(__dirname, '..', 'src');
const VENDOR = path.join(__dirname, '..', 'vendor');
const OUT_DIR = path.join(__dirname, '..', 'dist');

// 2026-09-16: this codebase's own source comments are deliberately
// detailed — they're the record of every real bug found this session
// (dated, narrative, sometimes referencing internal systems like
// console.roxyon.com) — genuinely valuable for maintaining THIS repo, but
// not appropriate to ship verbatim in a published npm package (this
// project has no other build/minify step, so without this, dist/*.js
// would carry every one of those comments as-is). esbuild's default
// transform (no minification flags at all) does NOT reliably strip every
// comment — confirmed empirically: a comment directly attached to a
// class method survives regardless of the `legalComments` setting
// (esbuild's printer treats it like retained method documentation).
// minifyWhitespace does reliably remove it (comments are folded into the
// same "removable formatting" pass as whitespace) — used here with
// minifyIdentifiers/minifySyntax left off, so real names stay readable
// for debugging; only formatting and comments are stripped. dist/*.js is
// already a generated, do-not-edit-directly build artifact, not
// something anyone reads directly, so the more compact output is a real
// bonus (smaller browser-shipped bundle) rather than a readability loss.
//
// Deliberately NOT applied inside read()/readVendor() themselves: the
// workers (workers/css.js, workers/up.js) are read as pre-escaped string
// PAYLOADS meant for embedding inside a template literal
// (`var _cssw = \`${read(...)}\`;`), not standalone parseable JS on their
// own — running them through a real JS parser fails outright (confirmed
// empirically: "Syntax error" on their own escaped backslash sequences).
// astring.js is already a minified third-party build with nothing to
// gain from re-stripping. Applied explicitly at each call site below
// instead, only for files that really are directly-concatenated,
// standalone top-level JS.
function stripComments(src) {
    return esbuild.transformSync(src, {
        loader: 'js',
        minifyWhitespace: true,
        minifyIdentifiers: false,
        minifySyntax: false,
    }).code;
}

function read(relPath) {
    return fs.readFileSync(path.join(SRC, relPath), 'utf8');
}

function readVendor(relPath) {
    return fs.readFileSync(path.join(VENDOR, relPath), 'utf8');
}

// The part of the bundle that's identical regardless of which jQuery layer
// sits underneath it — dom-shim.js here; a project's own selective plugin
// bundle (packages/cli) can layer real jQuery on top of this same output
// as a separate, later <script>. Takes the already-built jQuery layer as a
// string and appends everything else after it.
function buildCommonTail() {
    const parts = [];

    // WebWorker helper — a genuine small dependency, not jQuery-replaceable
    // weight: lstnrs.js unconditionally does `new WebWorker('_cssw')` /
    // `new WebWorker('_upw')` at load time. Depends on jQuery/our shim
    // being defined already (its own IIFE takes it as an argument).
    // Already minified third-party code — nothing to strip.
    parts.push(readVendor('webworker-helper.js'));
    // _re.js's walk() uses md5() to generate unique keys for :if/:for
    // sections — a small, unrelated-to-jQuery utility, genuinely needed.
    // Already minified third-party code — nothing to strip.
    parts.push(readVendor('md5.js'));

    // Workers are string payloads, not standalone JS — wrap exactly like
    // production's index.php does (see PROVENANCE.md's wrapper note). Not
    // run through stripComments(): these are pre-escaped string content
    // meant for template-literal embedding, not directly-parseable JS on
    // their own.
    parts.push('var _cssw = `' + read('workers/css.js') + '`;');
    parts.push('var _upw = `' + read('workers/up.js') + '`;');

    // astring (2026-09-14, real bug fix): walk.js's getWatcher() calls
    // astring.generate() to turn a rewritten AST back into source — but
    // nothing was ever putting `astring` in scope for the shipped bundle
    // (it's a plain npm package, referenced as a bare global, not
    // require()'d). Any real .view <script> block would have hit
    // "ReferenceError: astring is not defined" the moment it rendered.
    // Vendored build (UMD, attaches `globalThis.astring`) from
    // node_modules/astring/dist/astring.min.js — see PROVENANCE.md.
    // Already minified third-party code — nothing to strip.
    // Dev-only block (2026-10-03): astring + acorn + walk.js exist only to rewrite view <script>s in the browser.
    // `lm build` precompiles every script (HST v3 `pre`) and cuts this block out of the runtime it ships
    // (fcs.js stripDevOnlyRuntime); `lm serve` keeps it for hot reload. Markers are plain statements so they
    // survive minification and can be found textually.
    parts.push('var __lmDevOnlyStart__ = 1;');
    parts.push(readVendor('astring.js'));
    // acorn (2026-10-03): view <script> blocks now ship as source and are parsed at mount time, instead of shipping
    // their ESTree in the bundle (the trees were ~5x the source and most of a built app.js). Minified UMD build of
    // acorn 8.18.0 — the same parser and options the CLI uses — attaching `globalThis.acorn`.
    parts.push(readVendor('acorn.js'));

    parts.push(stripComments(read('walk.js')));
    parts.push('var __lmDevOnlyEnd__ = 1;');
    parts.push(stripComments(read('_re.js')));
    parts.push(stripComments(read('reactive.js')));
    parts.push(stripComments(read('update-check.js')));

    // ws.js's `_Live` class needs ReconnectingWebSocket — a genuine small
    // vendor dependency (not jQuery-related, nothing to shim), vendored
    // locally so this build has no dependency on the old V1 mirror at all.
    // This file is itself part-third-party (the real ReconnectingWebSocket,
    // already minified with no comments) and part our own framework code
    // (Reactor(), the setAttribute/getAttribute/removeAttribute patch,
    // ... — see PROVENANCE.md) — stripComments() is safe here since the
    // third-party portion has no comments to lose in the first place.
    parts.push(stripComments(readVendor('reconnecting-websocket.js')));

    parts.push(stripComments(read('ws.js')));
    parts.push(stripComments(read('lstnrs.js')));

    // index-bootstrap.js runs here — after the vendor file AND ws.js/
    // lstnrs.js, not spliced into the middle of the vendor file (tried
    // that first, 2026-09-14 — see git history if curious). Used to sit
    // directly after the vendor file, before ws.js/lstnrs.js — see the
    // comment that used to be here. **Real bug found 2026-09-20, migrating
    // a real V1 project**: index-bootstrap.js runs index.js's compiled
    // code via a SYNCHRONOUS XHR + eval (see that file's own comment for
    // why synchronous) — meaning it executes fully, inline, before any
    // bundle code positioned after it ever runs. A real index.js using the
    // legacy BEA SDK (`bea = new BEA({...})`, still real/ported/working —
    // see vendor/reconnecting-websocket.js's own BEA class) crashed with
    // "Cannot read properties of undefined (reading 'req')": BEA.request()
    // calls the global `API` object, defined in ws.js — which, at the old
    // position, hadn't executed yet. `var` hoisting only guarantees the
    // *declaration* exists, not the assignment. Moving index-bootstrap.js
    // to run after ws.js/lstnrs.js instead fixes this generally (any real
    // index.js code depending on `API`, or anything else those two files
    // define) without reintroducing the original splice problem — nothing
    // in ws.js/lstnrs.js's own top-level code depends on index.js having
    // already run, only the vendor file's `$(document).ready()` handler
    // does, and that's still satisfied (it's guarded to wait for
    // `appSettings` regardless of ordering, per the constraint below).
    // `Reactor` (defined early in the vendor file) and other framework
    // globals real index.js scripts commonly reference (`cookies`,
    // `session`, .... defined later in that same file) are both still
    // satisfied by running after the WHOLE vendor file, same as before.
    parts.push(stripComments(read('index-bootstrap.js')));

    return parts.join('\n');
}

function buildCore() {
    const parts = [];
    parts.push('/* LumenJS V2 core — generated by packages/core/build/bundle.js, do not edit directly */');
    parts.push(stripComments(read('dom-shim.js')));
    parts.push(buildCommonTail());
    return parts.join('\n');
}

async function main() {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    const core = buildCore();
    const outPath = path.join(OUT_DIR, 'lumenjs-core.js');
    fs.writeFileSync(outPath, core);
    console.log('Wrote ' + outPath + ' (' + core.length + ' bytes)');
    checkSyntax(core, outPath);
}

function checkSyntax(code, outPath) {
    // Fail loudly rather than ship something broken.
    try {
        new (require('vm').Script)(code, { filename: outPath });
        console.log('Syntax check: OK');
    } catch (e) {
        console.error('Syntax check FAILED:', e.message);
        process.exit(1);
    }
}

main();
