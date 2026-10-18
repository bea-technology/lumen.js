const fetch = require('node-fetch');
const path = require("path");
const fs = require("fs");
const nodemon = require("nodemon");
var _acorn = require("acorn");
var acorn = require("acorn-loose");

// The view parser lives in hst.js (2026-10-07) so the browser playground compiles with the exact same code.
const _hstLib = require("./hst.js");
const { parseScriptJs, scriptPayload, stripAstPositions, annotateLayoutRegions, hst_markSvg, hst_orderIfFor, _hst } = _hstLib;
exports.scriptPayload = scriptPayload;
exports.stripAstPositions = stripAstPositions;
exports.annotateLayoutRegions = annotateLayoutRegions;
exports.hst_orderIfFor = hst_orderIfFor;


// Production ships view scripts already rewritten ("parsed and DOM-ready"): the same getWatcher() rewrite the browser
// used to run at every mount, done once here with a placeholder root (`_vt.__LMROOT__`) that the runtime replaces
// with the mount's real scope path (_re.js _lmScriptCode). The variable list mirrors the runtime exactly: a script
// at a view/layout's top level uses that file's reactiveVars; a script inside an :if/:for section or a tpl row
// template runs in a section engine, which has none. Returns how many scripts could NOT be precompiled.
function precompileViewScripts(groups) {
  let failed = 0;
  function visit(nodes, vars, inSection, file) {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || n.type === "text") continue;
      const sectioned = inSection || n.type === "section" || n.type === "sections";
      const nm = String(n.name || "").toLowerCase();
      if ((nm === "script" || nm === "js") && Array.isArray(n.children) && n.children[0] && n.children[0].type === "text") {
        const t = n.children[0];
        if (t.content || t.jst) {
          try {
            const ast = t.jst || _acorn.parse(t.content, { ecmaVersion: "latest", sourceType: "script" });
            const code = _walk.getWatcher(ast, { name: file }, sectioned ? undefined : (vars || []).slice(), ["__LMROOT__"]).code;
            new Function(code);
            t.pre = code;
            delete t.content;
            delete t.jst;
          } catch (e) {
            failed++;
            console.warn("\x1b[33mLumenJS: could not precompile a <script> in " + file + ": " + (e && e.message) + " (it will be compiled in the browser)\x1b[0m");
          }
        }
      }
      visit(n.children, vars, sectioned, file);
    }
  }
  for (const group of groups) {
    const isTpl = group.kind === "tpls";
    for (const key in group.files) {
      const entry = group.files[key];
      if (!entry || !Array.isArray(entry.hst)) continue;
      const file = Buffer.from(key, "base64").toString().split(/[\\/]/).slice(-2).join("/");
      visit(entry.hst, entry.reactiveVars, isTpl, file);
    }
  }
  return failed;
}
exports.precompileViewScripts = precompileViewScripts;

// Cut the dev-only block (astring + acorn + walk.js, ~175 KB) out of the runtime `lm build` ships. Only safe when
// every script was precompiled; an older runtime without the markers is returned unchanged.
function stripDevOnlyRuntime(src) {
  const a = src.indexOf("var __lmDevOnlyStart__ = 1;");
  const b = src.indexOf("var __lmDevOnlyEnd__ = 1;");
  if (a < 0 || b < a) return src;
  return src.slice(0, a) + src.slice(b + "var __lmDevOnlyEnd__ = 1;".length);
}
exports.stripDevOnlyRuntime = stripDevOnlyRuntime;

// The built payload omits HST fields that are empty — "attrs":{}, "ax":{}, "evs":{}, "ex":{}, "isV":false, "mss":[],
// "children":[] repeated on every node were ~13% of console.roxyon.com's views. The runtime restores the defaults once
// per payload (_re.js _lmHstDefaults). Used as a JSON.stringify replacer, so the compiler's own trees are untouched.
const _HST_EMPTY_OBJ = { attrs: 1, ax: 1, evs: 1, ex: 1 };
function compactHstReplacer(key, value) {
  if (_HST_EMPTY_OBJ[key] === 1 && value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return undefined;
  if (key === "isV" && value === false) return undefined;
  if ((key === "mss" || key === "children") && Array.isArray(value) && value.length === 0) return undefined;
  return value;
}
exports.compactHstReplacer = compactHstReplacer;



var _min = require("html-minifier").minify;
var he = require("he");

const _FD = require("ftp-deploy");
const _fD = new _FD();

// index.js / project-scripts reactive-global compiler (2026-09-14) — reuses
// packages/core's own walk.js rewrite (`_vt.Global.vars[...]`, see that
// file and _re.js's `_vt.Global`) instead of re-implementing it, so both
// the browser-side .view <script> rewrite and this server-side one stay in
// exact sync. walk.js references `astring` as a bare global (it's meant to
// be concatenated into a browser bundle where a vendored astring build
// already put it in scope — see packages/core/build/bundle.js) so it has to
// be put in scope here the same way before requiring it.
global.astring = global.astring || require("astring");
// 2026-09-16, real bug found and fixed while preparing to actually publish
// @lmjs/cli: this used to be a hardcoded relative path
// (path.join(__dirname, "..", "..", "core", "src", "walk.js")), which
// only resolves inside this monorepo's own directory layout (packages/
// cli sitting next to packages/core). Once @lmjs/cli is published and
// installed standalone, @lmjs/core lives in node_modules, not two
// directories up — the hardcoded path would have thrown
// "Cannot find module" on every single `lm` command. require.resolve()
// finds @lmjs/core's real, installed location either way (a pnpm
// workspace symlink here, a real npm install once published) — @lmjs/
// core is declared as a real "workspace:*" dependency in package.json.
const _corePackageDir = path.dirname(require.resolve("@lmjs/core/package.json"));
const _walk = require(path.join(_corePackageDir, "src", "walk.js"));

// npm-in-project support (2026-09-16) — lets a project's own index.js /
// src/js/*.js files use real npm dependencies. See npm-bundle.js's own
// header comment for why this needs a synthetic-shim approach rather than
// just handing the whole esbuild-bundled file to compileProjectScript().
const _npmBundle = require(path.join(__dirname, "npm-bundle.js"));
exports.hasOwnDependencies = _npmBundle.hasOwnDependencies;
exports.buildEntryWithImports = _npmBundle.buildEntryWithImports;

// Per-project selective plugin bundling (2026-09-16) — see
// plugins-esbuild-plugin.js's own header comment.
const _pluginsBundle = require(path.join(__dirname, "plugins-esbuild-plugin.js"));

// LumenJS vault (2026-09-17) — see vault.js's own header comment for the
// full design. exports.login/apiSet/... are wired into processCommands()
// below; resolveVaultApis() is called from _bp() to merge vault-managed
// apis[] entries in at build time, alongside whatever config.json's own
// apis[] already has (additive, not a replacement).
const _vault = require(path.join(__dirname, "vault.js"));
exports.login = _vault.login;
exports.apiSet = _vault.apiSet;
exports.apiUpdate = _vault.apiUpdate;
exports.apiGet = _vault.apiGet;
exports.apiList = _vault.apiList;
exports.apiRemove = _vault.apiRemove;

// Reads a project's own package.json dependencies and returns the
// registry entries it selects (empty array if none match, or if there's
// no package.json at all) — the single check both _bp() and app.js use to
// decide whether to build/inject the selective plugins bundle at all.
function selectedProjectPlugins(projectRoot) {
  try {
    let deps = {};
    const pkgPath = path.join(projectRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      Object.assign(deps, pkg.dependencies || {});
    }
    // V1's bea.js always shipped all of these, so real V1 code just calls
    // them. Add whatever the project's own source visibly uses.
    for (const key of detectUsedPlugins(projectRoot)) if (!deps.hasOwnProperty(key)) deps[key] = "*";
    if (!Object.keys(deps).length) return [];
    return _pluginsBundle.selectedRegistryEntries(deps);
  } catch (e) {
    return [];
  }
}
exports.selectedProjectPlugins = selectedProjectPlugins;

// Usage signatures per plugin registry key — calls/globals in scripts plus
// the declarative attributes V1's renderPlugins() auto-initialized.
const PLUGIN_SIGNATURES = {
  "select2": [/\.select2\s*\(/, /<[a-z][^>]*\s(?:sl|slct)(?=[\s>=\/])/i],
  "flickity": [/\.flickity\s*\(/, /\bFlickity\b/, /<[a-z][^>]*\scrslf(?=[\s>=\/])/i],
  "bootstrap-colorpicker": [/\.colorpicker\s*\(/, /<input[^>]*\scolor(?=[\s>=\/])/i],
  "bootstrap-datetimepicker": [/\.datetimepicker\s*\(/, /<input[^>]*\s(?:date|time|datetime)(?=[\s>=\/])/i],
  "jquery-ui-dist": [/\.(?:sortable|draggable|droppable|resizable|datepicker|autocomplete|slider|accordion)\s*\(/, /<[a-z][^>]*\s(?:sort|drag|drop)(?=[\s>=\/])/i],
  "jquery.easing": [/\beas(?:e|ing)(?:In|Out)[A-Z]\w*/],
  "nestedSortable": [/\.nestedSortable\s*\(/],
  "jquery.numeric": [/\.numeric\s*\(/, /<input[^>]*\s(?:numeric|integer|decimal)(?=[\s>=\/])/i],
  "timeago": [/\.timeago\s*\(/, /\$\.timeago\b/],
  "slick-carousel": [/\.(?:crsl|slick)\s*\(/, /<[a-z][^>]*\scrsl(?=[\s>=\/])/i],
  "@iconify/iconify": [/class=["'][^"']*\biconify\b/, /\bIconify\./],
  "rellax": [/\bRellax\b/],
  "headroom.js": [/\bHeadroom\b/, /<[a-z][^>]*\spinnable(?=[\s>=\/])/i],
  "in-view": [/\binView\b/],
  "gsap": [/\bgsap\b/, /\bTween(?:Max|Lite)\b/, /\bTimeline(?:Max|Lite)\b/],
  "jquery.caret": [/\.caret\s*\(/],
  "jquery-tageditor": [/\.tagEditor\s*\(/, /<[a-z][^>]*\stags(?=[\s>=\/])/i],
  "jquery-lazy": [/\.lazy\s*\(/, /<img[^>]*\slazy(?=[\s>=\/])/i],
};

function detectUsedPlugins(projectRoot) {
  const src = path.join(projectRoot, "src");
  if (!fs.existsSync(src)) return [];
  let indexHtml = "";
  try { indexHtml = fs.readFileSync(path.join(src, "index.html"), "utf8"); } catch (e) { }
  const texts = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "js" || e.name === "css" || e.name === "images") continue;
        walk(p);
      } else if (/\.(view|tpl|layout)$/.test(e.name)) {
        try { texts.push(fs.readFileSync(p, "utf8")); } catch (x) { }
      }
    }
  })(src);
  try { texts.push(fs.readFileSync(path.join(src, "index.js"), "utf8")); } catch (e) { }
  for (const s of detectLocalProjectScripts(indexHtml)) {
    try { texts.push(fs.readFileSync(path.join(src, s.replace(/^\//, "")), "utf8")); } catch (e) { }
  }
  const all = texts.join("\n");
  // A library the page already loads itself (CDN <script>) must not be
  // bundled a second time.
  const loadedByPage = (key) => new RegExp("<script[^>]+src=[\"'][^\"']*" + key.replace(/^@[^/]+\//, "").replace(/\.js$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(indexHtml);
  const found = [];
  for (const key in PLUGIN_SIGNATURES) {
    if (loadedByPage(key)) continue;
    if (PLUGIN_SIGNATURES[key].some((re) => re.test(all))) found.push(key);
  }
  return found;
}
exports.detectUsedPlugins = detectUsedPlugins;

// Compiles a standalone JS file (index.js, or any project /js/*.js file a
// developer's index.html references) the same way a .view's <script> block
// gets compiled: every top-level var/let/const becomes reactive, rewritten
// to target `_vt.Global.vars` (not `_vt.View.vars` — this code runs once,
// outside of any one view, and needs to outlive navigation). Top-level
// `function` declarations are deliberately left alone, matching walk.js's
// existing behavior for view scripts — they stay real global functions,
// callable the same way V1 apps already rely on (e.g. inline `onclick=`).
function compileProjectScript(source, name) {
  let ast = _acorn.parse(source, { ecmaVersion: "latest", sourceType: "script" });
  let topLevelNames = [];
  for (const stmt of ast.body) {
    if (stmt.type === "VariableDeclaration") {
      for (const d of stmt.declarations) {
        if (d.id && d.id.type === "Identifier") topLevelNames.push(d.id.name);
      }
    }
  }
  return _walk.getWatcher(ast, { name: name || "script" }, topLevelNames, "Global").code;
}
exports.compileProjectScript = compileProjectScript;

// Scans a project's index.html for local <script src="..."> tags a
// developer added themselves (their existing V1 workflow — a /js/ folder
// referenced straight from index.html, unchanged by any of this) so each
// one can be transparently compiled the same way as index.js instead of
// loaded raw. Deliberately excludes: remote/absolute URLs (anything not
// starting with "/" — e.g. the rx.js CDN tag), the core runtime itself
// (/js/lm.js), and /index.js (handled unconditionally, never needs a tag
// at all — see app.js / _bp()).
// The plugin stylesheet goes BEFORE the project's first local /css/ stylesheet, so the project's own styling of
// select2/datepicker/etc. wins, as in V1 (plugin CSS was part of the base runtime CSS, loaded first). Fallback:
// just before </head>. Shared by `lm build` and `lm serve` so dev matches production.
function placePluginsCss(html, cssTag) {
  html = String(html);
  let at = html.search(/<link\b[^>]*href=["']\/css\//i);
  return at >= 0
    ? html.slice(0, at) + cssTag + "\n    " + html.slice(at)
    : html.split("</head>").join("    " + cssTag + "\n</head>");
}
exports.placePluginsCss = placePluginsCss;

function detectLocalProjectScripts(indexHtmlSource) {
  let found = [];
  let re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  // A commented-out tag is not loaded by the browser (or by V1), so it must not be compiled into the bundle.
  indexHtmlSource = String(indexHtmlSource).replace(/<!--[\s\S]*?-->/g, "");
  while ((m = re.exec(indexHtmlSource))) {
    let src = m[1];
    if (src.indexOf("/") !== 0) continue; // remote/absolute — leave native
    if (src === "/js/lm.js" || src === "/index.js") continue;
    // V1's own runtime — replaced by /js/lm.js (see v1CompatIndexHtml()).
    if (/^\/js\/bea\.js(\?|$)/.test(src)) continue;
    found.push(src);
  }
  return found;
}
exports.detectLocalProjectScripts = detectLocalProjectScripts;

const CORE_Libs = {
  BEACSS: "https://s.beacdn.com/beacss/latest",
  COREJS: "https://lmjs.beacdn.com/latest",
};

// HST wire-format version (2026-09-15) — a flat integer, not semver and not
// a content hash. There's no meaningful "minor, compatible" HST change in
// practice: _re.js's walk() (packages/core/src/_re.js) reads every field
// positionally with zero optional-field tolerance, so from the runtime's
// point of view any shape change is effectively breaking. Bump this by
// hand whenever this file's HST-producing code (getAllFiles/class hst)
// changes what fields it emits, AND bump EXPECTED_HST_FORMAT_VERSION in
// _re.js's renderHST() to match, in the same change. This is a real,
// already-hit failure mode, not speculative: the @before-render/
// @after-render feature's first implementation silently never fired
// because it read @-attributes from the wrong place (doc.attrs instead of
// doc.evs) — a version check wouldn't have prevented that specific typo,
// but it's exactly the class of "producer and consumer's shared
// assumptions drifted" bug a version mismatch check exists to catch
// loudly instead of silently, e.g. across independent @lmjs/cli and
// @lmjs/core upgrades once those are ever published as separate packages.
// v2 (2026-10-03): view <script> ships as source (`content`) instead of an ESTree (`jst`), and mustache entries
// no longer carry `jst`. A v2-aware runtime still accepts v1 payloads.
// v3 (2026-10-03): `lm build` ships each view <script> already rewritten (`pre`, see precompileViewScripts).
const HST_FORMAT_VERSION = 3;
exports.HST_FORMAT_VERSION = HST_FORMAT_VERSION;

// A project builds with ITS OWN src/js/lm.js (copied at `lm create`). One older than this compiler cannot run its
// output (a pre-v2 runtime would skip every view script): say so before building/serving.
function checkProjectRuntime(projectPath) {
  try {
    let lm = fs.readFileSync(path.join(projectPath, "src", "js", "lm.js"), "utf8");
    let m = /EXPECTED_HST_FORMAT_VERSION\s*=\s*(\d+)/.exec(lm);
    let accepts = /_HST_FORMATS_ACCEPTED\s*=\s*\[([\d,\s]+)\]/.exec(lm);
    let ok = accepts ? accepts[1].split(",").map(Number).indexOf(HST_FORMAT_VERSION) > -1 : (m && Number(m[1]) === HST_FORMAT_VERSION);
    if (m && !ok) {
      console.warn("\n\x1b[33mLumenJS: src/js/lm.js is older than this CLI (it expects HST v" + m[1] + ", this CLI emits v" +
        HST_FORMAT_VERSION + "). Run `lm update-core` to update the project's runtime.\x1b[0m\n");
      return false;
    }
  } catch (e) { }
  return true;
}
exports.checkProjectRuntime = checkProjectRuntime;

exports.getAllFiles = getAllFiles;
exports.ucwords = ucwords;

exports.fetch = fetch;
exports.getConfig = getConfig;
function getConfig() {
  config = {
    version: "1.0.0.1",
    server: {
      host: "127.0.0.1",
      port: "3000",
      ssl: {
        enabled: false,
        key: "/key.pem",
        cert: "/certificate.cer",
      },
    },
    apis: [
      {
        baseURL: "https://www.beaapis.com/1",
        headers: {
          "X-BEA-Application-ID": "YOUR_APPLICATION_ID",
          "X-BEA-Authorization": "YOUR_REST_API_KEY",
        },
      },
    ],
    ftp: {
      host: "ftp_host",
      username: "ftp_username",
      password: "ftp_password",
      remotePath: "/",
      concurrency: 4,
      protocol: "ftp",
      port: 21,
      ignore: [],
      syncOption: {
        delete: false,
        ignoreExisting: false,
        skipCreate: false,
        update: true,
      },
      connectTimeout: 30000,
    },
  };
  let configPath = process.cwd() + path.sep + `config.json`;
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, { encoding: "utf8" }));
  }
  return config;
}

var config = getConfig();

function ucwords(str) {
  return (str + "").replace(/^([a-z])|\s+([a-z])/g, function ($1) {
    return $1.toUpperCase();
  });
}
function lw(s) {
  return s.toString().toLowerCase();
}
exports.lw = lw;

function cd(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d);
}
exports.cd = cd;

function rd(d) {
  if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
}
exports.rd = rd;

function create(conf) {
  let t =
    conf.type == "v" || conf.type == "s" || conf.type == "t" ? conf.type : "p";
  let n =
    conf.type == "v" || conf.type == "s" || conf.type == "t"
      ? lw(conf.name[0])
      : conf.name.join(" ");
  if (t == "p") {
    var libsPath = `${__dirname}` + path.sep + `files` + path.sep + `libs`;
    var getLibs = false;
    var _beacssMissing = false;
    var _lmMissing = false;
    require("dns").resolve("www.google.com", function (err) {
      if (!err) {
        // 2026-09-18, real bug found and fixed: this used to only check
        // lm.js's existence — once that got committed/cached (real V2
        // runtime, seeded this session), getLibs stayed false forever,
        // even though mobius.css's OWN cached copy was a genuinely empty
        // placeholder (0 bytes, never actually fetched by anything).
        // Every project scaffolded via `lm create` since then shipped
        // with zero MobiusCSS — every utility class (l/r/vm/fs14/g_nm/
        // flexi/tbl/cl/...) silently did nothing, no error, just an
        // empty stylesheet. Check mobius.css's own existence *and* that it
        // isn't empty, independently of lm.js.
        var _mobiuscssPath = libsPath + path.sep + "mobius.css";
        _beacssMissing = !fs.existsSync(_mobiuscssPath) || fs.statSync(_mobiuscssPath).size === 0;
        _lmMissing = !fs.existsSync(libsPath + path.sep + "lm.js");
        if (_lmMissing || _beacssMissing) getLibs = true;
      }
      if (getLibs) {
        API
          .get(CORE_Libs.COREJS, {})
          .then((corejs) => {
            API.get(CORE_Libs.BEACSS, {}).then((mobiuscss) => {
              var libsPath =
                `${__dirname}` + path.sep + `files` + path.sep + `libs`;
              cd(libsPath);
              // 2026-09-18: only overwrite each cached file if IT was
              // actually the reason getLibs fired — CORE_Libs.COREJS
              // still points at V1's stale CDN (lmjs.beacdn.com), not
              // V2's own build; the cached lm.js here is already the
              // correct, hand-seeded V2 runtime, so a mobius.css-only gap
              // (the real bug fixed above) must never let this branch
              // clobber it with V1's wrong runtime.
              if (_lmMissing) {
                fs.writeFileSync(
                  libsPath + path.sep + "lm.js",
                  String(corejs)
                );
              }
              if (_beacssMissing) {
                fs.writeFileSync(
                  libsPath + path.sep + "mobius.css",
                  String(mobiuscss)
                );
              }

              var filePath = `${process.cwd()}` + path.sep;
              copyDir(
                `${__dirname}` + path.sep + `files` + path.sep + `project`,
                filePath,
                n
              );
              cd(filePath + path.sep + "src");
              cd(filePath + path.sep + "src" + path.sep + "css");
              cd(filePath + path.sep + "src" + path.sep + "images");
              cd(filePath + path.sep + "src" + path.sep + "js");
              let stylesFile =
                filePath +
                path.sep +
                "src" +
                path.sep +
                "css" +
                path.sep +
                `styles.css`;
              let faviconFile =
                filePath + path.sep + "src" + path.sep + `favicon.ico`;
              if (!fs.existsSync(stylesFile))
                fs.writeFileSync(stylesFile, String(""));
              if (!fs.existsSync(faviconFile))
                fs.writeFileSync(faviconFile, String(""));

              fs.writeFileSync(
                filePath +
                path.sep +
                "src" +
                path.sep +
                "js" +
                path.sep +
                "lm.js",
                String(corejs)
              );
              fs.writeFileSync(
                filePath +
                path.sep +
                "src" +
                path.sep +
                "css" +
                path.sep +
                "mobius.css",
                String(mobiuscss)
              );
            });
          })
          .catch((err) => {
            // Handle error
          });
      } else {
        var filePath = `${process.cwd()}` + path.sep;
        copyDir(
          `${__dirname}` + path.sep + `files` + path.sep + `project`,
          filePath,
          n
        );
        cd(filePath + path.sep + "src");
        cd(filePath + path.sep + "src" + path.sep + "css");
        cd(filePath + path.sep + "src" + path.sep + "images");
        cd(filePath + path.sep + "src" + path.sep + "js");
        let stylesFile =
          filePath +
          path.sep +
          "src" +
          path.sep +
          "css" +
          path.sep +
          `styles.css`;
        let faviconFile =
          filePath + path.sep + "src" + path.sep + `favicon.ico`;
        if (!fs.existsSync(stylesFile))
          fs.writeFileSync(stylesFile, String(""));
        if (!fs.existsSync(faviconFile))
          fs.writeFileSync(faviconFile, String(""));

        let corejs = Buffer.from(
          fs.readFileSync(libsPath + path.sep + "lm.js").toString()
        );
        let mobiuscss = Buffer.from(
          fs.readFileSync(libsPath + path.sep + "mobius.css").toString()
        );

        fs.writeFileSync(
          filePath + path.sep + "src" + path.sep + "js" + path.sep + "lm.js",
          String(corejs)
        );
        fs.writeFileSync(
          filePath + path.sep + "src" + path.sep + "css" + path.sep + "mobius.css",
          String(mobiuscss)
        );
      }
    });
  } else {
    let file = t == "s" ? "sub_view.view" : t == "t" ? "layout.layout" : "view.view";
    let ident = t == "s" ? "SubView" : t == "t" ? "Template" : "View";
    let dir = t == "t" ? "layouts" : "views";
    let ext = t == "t" ? "layout" : "view";
    let html5 = Buffer.from(
      fs
        .readFileSync(`${__dirname}` + path.sep + `files` + path.sep + file)
        .toString()
        .split("[" + ident + "Name" + "]")
        .join(ucwords(n))
    );
    var filePath =
      `${process.cwd()}` +
      path.sep +
      `src` +
      path.sep +
      dir +
      path.sep +
      `${n}.${ext}`;
    if (fs.existsSync(filePath)) {
      console.log(ident + " already exists:", filePath);
    } else {
      fs.writeFileSync(filePath, html5);
    }
  }
}

function getAllFiles(dirPath, arrayOfFiles = {}, mini = false, hst = true) {
  files = fs.readdirSync(dirPath);
  files.forEach(function (file) {
    if (fs.statSync(dirPath + path.sep + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + path.sep + file, arrayOfFiles, mini, hst);
    } else {
      let filePath = path.join(dirPath, path.sep, file);
      let fileKey = Buffer.from(
        filePath
          .split(`${process.cwd()}` + path.sep)
          .join("")
          .split("\\")
          .join("/")
      ).toString("base64");
      if (mini) {
        var result = _min(fs.readFileSync(filePath, { encoding: "utf8" }), {
          removeAttributeQuotes: false,
          caseSensitive: true,
          collapseWhitespace: true,
          collapseInlineTagWhitespace: true,
          conservativeCollapse: true,
          removeComments: true,
          minifyJS: false,
          minifyCSS: false,
          processConditionalComments: true,
          collapseBooleanAttributes: false,
          decodeEntities: false,
          html5: true,
          includeAutoGeneratedTags: true,
          keepClosingSlash: true,
          maxLineLength: null,
          minifyURLs: false,
          preserveLineBreaks: false,
          preventAttributesEscaping: false,
          processScripts: ["text/html"],
          quoteCharacter: "",
          removeEmptyAttributes: true,
          removeEmptyElements: false,
          removeOptionalTags: true,
          removeRedundantAttributes: true,
          removeScriptTypeAttributes: false,
          removeStyleLinkTypeAttributes: true,
          removeTagWhitespace: false,
          sortAttributes: false,
          sortClassName: false,
          trimCustomFragments: true,
          useShortDoctype: true,
          continueOnParseError: true
        });
      } else if (hst) {
        var result = _hst(fs.readFileSync(filePath, { encoding: "utf8" }));
      } else {
        var result = fs.readFileSync(filePath, { encoding: "utf8" });
      }
      arrayOfFiles[fileKey] = result;
    }
  });
  return arrayOfFiles;
}


// A V1 index.html loads the V1 runtime (/js/bea.js) and index.js directly.
// V2 serves its runtime at /js/lm.js and runs index.js itself (compiled),
// so a raw index.js tag would execute it a second time, uncompiled.
function v1CompatIndexHtml(html) {
  return String(html)
    .replace(/(<script\b[^>]*\bsrc=["'])\/?js\/bea\.js(?:\?[^"']*)?(["'])/gi, "$1/js/lm.js$2")
    .replace(/<script\b[^>]*\bsrc=["']\/?index\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>\s*/gi, "")
    // Many V1 pages ALSO pull the V1 runtime from its CDN, which would
    // load on top of V2 and overwrite its globals.
    .replace(/<script\b[^>]*\bsrc=["'](?:https?:)?\/\/(?:s\.|www\.)?beacdn\.com\/beajs\/[^"']*["'][^>]*>\s*<\/script>\s*/gi, "")
    .replace(/<script\b[^>]*\bsrc=["'](?:https?:)?\/\/lmjs\.beacdn\.com\/[^"']*["'][^>]*>\s*<\/script>\s*/gi, "");
}
exports.v1CompatIndexHtml = v1CompatIndexHtml;

// src/tpls/*.tpl and src/comps/*.tpl, one bucket (keys keep their real
// relative path, so _re.js can tell the two folders apart). Either folder
// may be absent — most projects have neither.
function readTemplates(root) {
  let out = {};
  for (const folder of ["tpls", "comps"]) {
    let dir = root + path.sep + "src" + path.sep + folder + path.sep;
    if (fs.existsSync(dir)) Object.assign(out, getAllFiles(dir, {}, false, true));
  }
  return out;
}
exports.readTemplates = readTemplates;

// A `:for` row template (`<li :for="items as it" tpl="row">`) renders in the host view's own engine, but the
// compiler only marks a name reactive when the host's OWN template reads it — a name used only inside the template
// would stay a plain var and never re-render. Unions each referenced template's reactiveVars into the host's.
function linkTemplateReactiveVars(files, templates) {
  function templateFor(attrs) {
    let name = String(attrs.tpl).replace(/^\/+/, "");
    for (const f of ["tpls", "comps"]) {
      let key = Buffer.from("src/" + f + "/" + name + ".tpl").toString("base64");
      if (templates[key]) return templates[key];
    }
    return null;
  }
  function scan(nodes, add) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node) continue;
      let a = node.attrs;
      // tpl= only renders on a :for loop element (comp= and plain-element tpl= were removed, 2026-10-02): the
      // template's names must be reactive in the host so the rows refresh.
      if (a && node.type === "sections" && a.hasOwnProperty("tpl")) {
        let t = templateFor(a);
        if (t) (t.reactiveVars || []).forEach(add);
      }
      // A static `view="parts/child"` sub-view reads its host's variables by name (V1 sub-views read the page's
      // globals), so a name only the sub-view displays must be reactive in the host, or the host's writes to it
      // never re-render the sub-view. (`:data` is not a sub-view mechanism: `@init` replaced it.)
      if (a && a.hasOwnProperty("view")) {
        let sv = viewFor(a.view);
        if (sv) (sv.reactiveVars || []).forEach(add);
      }
      if (node.children) scan(node.children, add);
      if (Array.isArray(node.content)) scan(node.content, add);
    }
  }
  // Keys are base64 file paths (relative or absolute): match a sub-view by its path under views/.
  let viewByPath = {};
  for (const key in files) {
    let p = Buffer.from(key, "base64").toString().replace(/\\/g, "/");
    let m = p.match(/(?:^|\/)views\/(.+)\.view$/);
    if (m) viewByPath[m[1]] = files[key];
  }
  function viewFor(v) {
    let p = String(v).trim().replace(/^\/+/, "").replace(/\.view$/, "");
    if (!p || /\{\{/.test(p)) return null;
    return viewByPath[p] || null;
  }
  // Repeat until stable so a grand-child's names reach the page through the child.
  for (let pass = 0; pass < 10; pass++) {
    let grew = false;
    for (const key in files) {
      let entry = files[key];
      if (!entry || !Array.isArray(entry.hst)) continue;
      if (!Array.isArray(entry.reactiveVars)) entry.reactiveVars = [];
      scan(entry.hst, function (n) { if (entry.reactiveVars.indexOf(n) === -1) { entry.reactiveVars.push(n); grew = true; } });
    }
    if (!grew) break;
  }
  for (const key in files) {
    let entry = files[key];
    if (!entry || !Array.isArray(entry.hst)) continue;
    if (!Array.isArray(entry.reactiveVars)) entry.reactiveVars = [];
    scan(entry.hst, function (n) { if (entry.reactiveVars.indexOf(n) === -1) entry.reactiveVars.push(n); });
  }
  return files;
}
exports.linkTemplateReactiveVars = linkTemplateReactiveVars;


function copyDir(src, dest, projectName) {
  try {
    const entries = fs.readdirSync(src, {
      encoding: "utf8",
      withFileTypes: true,
    });

    cd(dest);

    for (let entry of entries) {
      const srcPath = path.join(src.toString(), entry.name.toString());
      const destPath = path.join(dest.toString(), entry.name.toString());
      if (entry.isDirectory()) {
        if (projectName == "_beajsBuild") {
          if (
            entry.name != "layouts" &&
            entry.name != "views" &&
            entry.name != "css" &&
            entry.name != "js"
          )
            copyDir(srcPath, destPath, projectName);
        } else copyDir(srcPath, destPath, projectName);
      } else {
        if (projectName == "_beajsBuild") {
          if (
            projectName == "_beajsBuild" &&
            entry.name != "index.js" &&
            entry.name != "index.html"
          )
            fs.copyFileSync(srcPath, destPath);
        } else {
          if (!fs.existsSync(destPath)) {
            if (projectName) {
              if (entry.name == "index.html") {
                let html5 = Buffer.from(
                  fs
                    .readFileSync(srcPath)
                    .toString()
                    .split("[ProjectName]")
                    .join(ucwords(projectName))
                );
                fs.writeFileSync(destPath, html5);
              } else if (entry.name == "package.json") {
                // npm package names must be lowercase with no spaces/most
                // special chars — unlike index.html's [ProjectName] token
                // (free-form display text), this needs a real slug.
                let slug = lw(projectName)
                  .replace(/[^a-z0-9._-]+/g, "-")
                  .replace(/^[-.]+|[-.]+$/g, "") || "lumenjs-project";
                let pkgJson = Buffer.from(
                  fs
                    .readFileSync(srcPath)
                    .toString()
                    .split("[ProjectName]")
                    .join(slug)
                );
                fs.writeFileSync(destPath, pkgJson);
              } else fs.copyFileSync(srcPath, destPath);
            } else fs.copyFileSync(srcPath, destPath);
          } else {
            console.log("File already exists:", destPath);
          }
        }
      }
    }
  } catch (e) {
    console.log(e);
  }
}
exports.copyDir = copyDir;

function validURL(string) {
  let url;
  try {
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

exports.validURL = validURL;

let getPairs = (obj, keys = []) =>
  Object.entries(obj).reduce((pairs, [key, value]) => {
    if (typeof value === 'object')
      pairs.push(...getPairs(value, [...keys, key]));
    else
      pairs.push([[...keys, key], value]);
    return pairs;
  }, []);

function pairIt(obj) {
  return getPairs(obj).map(([[key0, ...keysRest], value]) =>
    `${key0}${keysRest.map(a => `[${a}]`).join('')}=${value}`)
    .join('&');
}

var API = {
  get: async function (u, d, h, a) {
    return await this.req(u, d, h, "GET", a);
  },
  put: async function (u, d, h, a) {
    return await this.req(u, d, h, "PUT", a);
  },
  post: async function (u, d, h, a) {
    return await this.req(u, d, h, "POST", a);
  },
  delete: async function (u, d, h, a) {
    return await this.req(u, d, h, "DELETE", a);
  },
  patch: async function (u, d, h, a) {
    return await this.req(u, d, h, "PATCH", a);
  },
  req: async function (u, d, h, m, a, f) {

    var urled = validURL(u) ? u : config.apis[a ?? 0].baseURL + u;
    if (m.toString().toLowerCase() == 'get') {
      if (urled.indexOf('?') > -1) urled = urled + "&" + pairIt(d ?? {});
      else urled = urled + "?" + pairIt(d ?? {});
    }
    let resa = await fetch(urled, {
      method: m.toString().toLowerCase(),
      body: m.toString().toLowerCase() == 'get' ? null : JSON.stringify(d ?? {}),
      headers: h ?? config.apis[a ?? 0].headers,
    });

    if (f) return resa;
    let res = await resa.text();
    try {
      return JSON.parse(res);
    } catch (e) {
      return res;
    }
  },
};
exports.API = API;

// 2026-09-21: real, confirmed gap — a project's runtime (src/js/lm.js,
// src/css/mobius.css) is copied ONCE, at `lm create` time, and nothing
// ever re-syncs it afterward. Updating the global @lmjs/cli install (a
// real published npm package now, see the 2026-09-16/2026-09-20/-21
// entries in this repo's own CLAUDE.md) fixes bugs in *that install's
// own* bundled copy — an already-scaffolded project's copy stays exactly
// as stale as it was, silently. Hit for real: `Arr2Obj` (added in
// @lmjs/core 2.1.4) reported `ReferenceError: Arr2Obj is not defined` in
// a real project that had updated the CLI but never re-copied its own
// runtime file. `lm purge` used to exist for this, but fetched from V1's
// CDN (CORE_Libs.COREJS/BEACSS, https://lmjs.beacdn.com) — the wrong
// source entirely for V2 (this exact class of bug — trusting a network
// fetch without validating it actually returned the real thing — is what
// the 2026-09-14 fix to this same command was about; the *source* itself
// being wrong was never addressed until now). The real, correct source is
// simply the already-installed @lmjs/cli package's own bundled copy
// (files/libs/lm.js — already correct the moment `npm install -g
// @lmjs/cli@latest` finishes) — no network call needed at all.
function updateCore() {
  var libsPath = `${__dirname}` + path.sep + `files` + path.sep + `libs`;
  var projectJsPath = process.cwd() + path.sep + "src" + path.sep + "js" + path.sep + "lm.js";
  var projectCssPath = process.cwd() + path.sep + "src" + path.sep + "css" + path.sep + "mobius.css";

  if (!fs.existsSync(process.cwd() + path.sep + "config.json") || !fs.existsSync(process.cwd() + path.sep + "src")) {
    console.log("This doesn't look like a LumenJS project (no config.json/src here) — run this from your project's root.");
    return;
  }
  if (!fs.existsSync(libsPath + path.sep + "lm.js")) {
    console.log("This CLI install has no bundled runtime to copy from — reinstall @lmjs/cli.");
    return;
  }

  addAgentFiles(process.cwd());

  var oldSize = fs.existsSync(projectJsPath) ? fs.statSync(projectJsPath).size : null;
  var newJs = fs.readFileSync(libsPath + path.sep + "lm.js");
  var newSize = newJs.length;

  if (oldSize === newSize) {
    console.log("Already up to date — this project's src/js/lm.js already matches the installed @lmjs/cli's runtime (" + newSize + " bytes). Nothing to do.");
    return;
  }

  fs.writeFileSync(projectJsPath, newJs);
  if (fs.existsSync(libsPath + path.sep + "mobius.css")) {
    fs.writeFileSync(projectCssPath, fs.readFileSync(libsPath + path.sep + "mobius.css"));
  }

  console.log(
    "Updated src/js/lm.js" +
    (oldSize !== null ? " (was " + oldSize + " bytes, now " + newSize + " bytes)" : " (was missing, now " + newSize + " bytes)") +
    " — matches the currently installed @lmjs/cli."
  );
}
exports.updateCore = updateCore;

// 2026-10-07: AI coding agents (Claude Code, Cursor, Codex) read AGENTS.md / CLAUDE.md from a project's root on their
// own; nothing else tells them a project is LumenJS. `lm create` copies both from files/project/; this adds them to
// projects made before 2.5.3. A file the developer already has is never touched.
function addAgentFiles(projectPath) {
  var tplDir = path.join(__dirname, "files", "project");
  var added = [];
  ["AGENTS.md", "CLAUDE.md"].forEach(function (f) {
    var dest = path.join(projectPath, f);
    if (!fs.existsSync(dest) && fs.existsSync(path.join(tplDir, f))) {
      fs.copyFileSync(path.join(tplDir, f), dest);
      added.push(f);
    }
  });
  if (added.length) console.log("Added " + added.join(" + ") + " (points AI coding agents at the LumenJS reference).");
  return added;
}
exports.addAgentFiles = addAgentFiles;

exports.processCommand = processCommands;
exports.startServer = startServer;
exports.create = create;

function processCommands(cmd) {
  var command = cmd ? cmd : process.argv[2];
  if (command == "run" || command == "serve") {
    startServer();
  } else if (command == "create" || command == "update") {
    let c = process.argv.slice(3, process.argv.length);
    let t = lw(c[0]);
    create({
      type: t[0] == "-" ? t.split("-").join("") : t,
      name: t[0] == "-" ? c.slice(1, c.length) : c,
    });
  } else if (command == "update-core") {
    updateCore();
  } else if (command == "purge") {
    // Kept as a backward-compatible alias — same real fix as
    // "update-core" above, not the old CDN-fetch behavior. See that
    // command's own comment for why the source changed.
    console.log("(lm purge now does the same thing as `lm update-core` — prefer that name going forward.)");
    updateCore();
  } else if (command == "build") {
    let cmds = process.argv;
    _bp(cmds);
  } else if (command == "login") {
    // 2026-10-18: OAuth sign-in to Roxyon (lib/copilot/auth.js); replaces the `roxyon login` shell-out, whose token
    // lm then looked for in the wrong place.
    require(path.join(__dirname, "copilot", "auth.js")).loginCommand(process.argv.slice(3));
  } else if (command == "logout") {
    require(path.join(__dirname, "copilot", "auth.js")).logout();
  } else if (command == "api") {
    let sub = process.argv[3];
    let name = process.argv[4];
    if (sub == "set") _vault.apiSet(name);
    else if (sub == "update") _vault.apiUpdate(name);
    else if (sub == "get") _vault.apiGet(name);
    else if (sub == "list") _vault.apiList();
    else if (sub == "remove") _vault.apiRemove(name);
    else console.log("Usage: lm api <set|get|update|list|remove> [name]");
  } else if (command == "-v" || command == "-version") {
    // 2026-09-16, real bug found on the actual first real-npm-install test
    // of the published package: this file lives at packages/cli/lib/
    // fcs.js in this repo's own source (one directory below the package
    // root, where '../package.json' correctly resolves) but at
    // packages/cli/dist/lib/fcs.js once built for publishing (build/
    // build.js copies lib/ into dist/lib/ verbatim, comments stripped —
    // TWO directories below the package root there) — a single hardcoded
    // relative path can't be correct in both locations at once. Tries the
    // built-package location first (the common case for anyone actually
    // running `lm -v`), falls back to the in-repo source location.
    let _pkgJsonPath = fs.existsSync(path.join(__dirname, "..", "..", "package.json"))
      ? path.join(__dirname, "..", "..", "package.json")
      : path.join(__dirname, "..", "package.json");
    console.log("LumenJS version " + require(_pkgJsonPath).version);
  } else {
    console.log("LumenJS CLI's command not found!");
  }
}

async function _bp(cmds) {
  import("ora").then(async ({ default: ora, oraPromise: oraPromise }) => {
    const spinner = ora({
      color: "green",
    });

    spinner
      .succeed("Started Building Project For Production")
      .start("Gathering Required Resources..");

    var projectPath = `${process.cwd()}`;
    // 2026-10-07: refuse rather than warn. The build's output needs a runtime that reads this CLI's HST version;
    // an older src/js/lm.js renders a broken site (hit for real after 2.5.1).
    if (!checkProjectRuntime(projectPath)) {
      spinner.fail("Build stopped: run `lm update-core` first, then build again.");
      process.exit(1);
    }
    var dest = projectPath + path.sep + "dist";

    let _views = getAllFiles(
      `${process.cwd()}` + path.sep + `src` + path.sep + `views` + path.sep,
      {},
      false,
      true
    );
    // 2026-09-18, real bug found and fixed: unguarded like tpls/ used to
    // be — a real migrated V1 project has no src/layouts/ dir at all (V1
    // never had this concept), and this threw a real, uncaught ENOENT
    // that aborted the entire production build, not just a warning.
    let _layoutsDir = `${process.cwd()}` + path.sep + `src` + path.sep + `layouts` + path.sep;
    let _layouts = fs.existsSync(_layoutsDir) ? annotateLayoutRegions(getAllFiles(_layoutsDir, {}, false, true)) : {};

    let _tpls = readTemplates(`${process.cwd()}`);
    linkTemplateReactiveVars(_views, _tpls);
    linkTemplateReactiveVars(_layouts, _tpls);

    var indexCode = fs.readFileSync(
      projectPath + path.sep + `src` + path.sep + "index.html",
      "utf8"
    );

    // V2 projects ship src/css/mobius.css; V1 projects ship src/css/bea.css.
    let _cssDir = projectPath + path.sep + `src` + path.sep + "css" + path.sep;
    let _mainCssName = ["mobius.css", "bea.css"].find((f) => fs.existsSync(_cssDir + f)) || null;
    var beaCSSCode = _mainCssName ? fs.readFileSync(_cssDir + _mainCssName, "utf8") : "";
    var indexJs = fs.readFileSync(
      projectPath + path.sep + `src` + path.sep + "index.js",
      "utf8"
    );

    // 2026-09-14: index.js (and any /js/*.js file the developer's own
    // index.html references — their existing V1 workflow, untouched) used
    // to be concatenated in RAW. That meant top-level `var`s declared there
    // — V1's documented convention for app-wide state like `isAdmin` — were
    // never wired into the reactive system at all: this codebase's own
    // rewrite (walk.js) only ever touched .view <script> blocks. Compile
    // them the same way now, targeting _vt.Global (survives navigation,
    // unlike _vt.View — see _re.js), so this state is reactive again. The
    // tags for detected local scripts get stripped below since their code
    // is now baked directly into this same bundle instead of being
    // separately requested.
    // npm-in-project support (2026-09-16): only engaged if this project
    // actually declared a real dependency — see npm-bundle.js's
    // hasOwnDependencies(). A project with none takes the `raw` path
    // below unconditionally, byte-identical to before this feature existed.
    let _hasOwnDeps = _npmBundle.hasOwnDependencies(projectPath);

    let _localScriptSrcs = detectLocalProjectScripts(String(indexCode));
    let _compiledScripts = "";
    for (const src of _localScriptSrcs) {
      let scriptPath = projectPath + path.sep + "src" + path.sep + src.split("/").join(path.sep).replace(/^\\|^\//, "");
      try {
        let raw = _hasOwnDeps ? _npmBundle.buildEntryWithImports(scriptPath, projectPath) : fs.readFileSync(scriptPath, "utf8");
        _compiledScripts += "\n" + compileProjectScript(raw, src);
        indexCode = indexCode.split(
          new RegExp('<script\\b[^>]*\\bsrc\\s*=\\s*["\']' + src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'][^>]*>\\s*<\\/script>', 'i')
        ).join("");
      } catch (e) {
        // Referenced in index.html but missing on disk (or a genuine
        // esbuild/compile failure) — leave the tag as native so the
        // developer gets the browser's own 404 / a clear console error,
        // not a silent drop.
      }
    }

    let _uncompiledScripts = precompileViewScripts([{ kind: "views", files: _views }, { kind: "layouts", files: _layouts }, { kind: "tpls", files: _tpls }]);

    let vt =
      `
var _vcData = {
"hstFormatVersion": ` +
      HST_FORMAT_VERSION +
      `,
"views": ` +
      JSON.stringify(_views, compactHstReplacer) +
      `,
"layouts": ` +
      JSON.stringify(_layouts, compactHstReplacer) +
      `,
"tpls": ` +
      JSON.stringify(_tpls, compactHstReplacer) +
      `
};
`;
    // 2026-09-16: this index.js compile call used to be the one spot in
    // this function NOT wrapped in try/catch — an index.js with a real
    // syntax error (or, now, an npm import esbuild can't resolve) would
    // throw uncaught here and abort the whole build with an opaque stack
    // trace instead of a clear, actionable failure.
    try {
      let _indexJsSrc = _hasOwnDeps
        ? _npmBundle.buildEntryWithImports(projectPath + path.sep + "src" + path.sep + "index.js", projectPath)
        : String(indexJs);
      vt += _compiledScripts + "\n" + compileProjectScript(_indexJsSrc, "index");
    } catch (e) {
      spinner.fail("Error compiling index.js: " + (e && e.message ? e.message : e));
      spinner.fail("Build Failed! Fix index.js and try again.");
      return;
    }
    indexCode = v1CompatIndexHtml(indexCode);

    spinner
      .succeed("Gathering Required Resources")
      .start("Signing & Securing App..");

    // 2026-09-18, real bug found and fixed — the note this replaces
    // ("still sending vt here is harmless") was wrong, confirmed by
    // reading the real server code directly: inside `if ($data['apis'])`,
    // the server does `$f2 = file_get_contents("https://s.beacdn.com/beajs/f2")`
    // (an external fetch, unconditional) and then
    // `replaceKeys($f2 . " " . $data['js'])`, whose only real (non-
    // commented-out) work is `jsMinify($js)` over that WHOLE combined
    // string — server-side, real-world PHP JS-minification of a multi-
    // megabyte string, proportional to whatever `vt` we send, for a
    // return value (`result.js`) this file has never used since the fix
    // above (2026-09-16, see this repo's CLAUDE.md for the fuller story —
    // `packages/core`'s own V2 runtime is what actually ships, from this
    // project's own src/js/lm.js). A real migrated V1 project's `vt`
    // (23+ real views, real markup) was ~2.7MB — combined with the
    // server's own ~173KB f2, that consistently caused `ECONNRESET`
    // (reproduced 3 times in a row) most likely from a reverse-proxy/
    // timeout in front of the BaaS giving up while PHP was still
    // minifying. `data.apis` is the only thing the token actually
    // depends on server-side (`$result['token'] =
    // $enc->encode($data['apis'])`) — `js` is dropped from the request
    // entirely now; a build with a large `vt` (any real project with
    // meaningfully more content than this session's earlier, much
    // smaller test projects) no longer risks the request itself
    // timing out.
    // 2026-09-17: vault-managed apis[] entries (lm api set) are merged in
    // here, resolved fresh from the vault at build time — config.json's
    // own apis[] (today's raw-headers shape) is untouched and still works
    // unchanged; this is purely additive. See vault.js's resolveVaultApis().
    let vaultApis = await _vault.resolveVaultApis(projectPath);
    let effectiveApis = (config.apis || []).concat(vaultApis);

    // 2026-09-17, real bug found and fixed: this internal call used to send
    // `h ?? config.apis[a ?? 0].headers` (API.req()'s own default) — i.e.
    // whatever headers happen to sit on the FIRST configured api, which is
    // a developer-facing slot that can legitimately be a Stripe/Firebase/
    // anything-else API, or a Roxyon entry using a stale/wrong header name
    // (e.g. a V1-era `X-BEA-JavaScript-Key` instead of the real REST key
    // header `X-BEA-Authorization`). A wrong/rejected auth header here
    // resolved as a normal (non-throwing) fetch, `r.token` came back
    // `undefined`, and the old `token_ == ""` check didn't catch that —
    // `_beaTn` got the literal string `"undefined"` baked in while the
    // build still reported success (the real roxyon.com white-page
    // incident this file's own history section documents). Fixed by
    // locating the actual Roxyon BaaS entry by its baseURL (not position),
    // requiring the two real header names explicitly, and failing the
    // build loudly on a non-OK response or a missing/falsy token instead
    // of silently continuing.
    let baasEntry = (config.apis || []).find(
      (a) => a && typeof a.baseURL === "string" && a.baseURL.indexOf("beaapis.com") > -1
    );
    let beajsAppId = baasEntry && baasEntry.headers && baasEntry.headers["X-BEA-Application-ID"];
    let beajsAuth = baasEntry && baasEntry.headers && baasEntry.headers["X-BEA-Authorization"];
    // 2026-10-17: a fresh `lm create` project has placeholder keys (YOUR_APP_ID / YOUR_REST_KEY) and its first
    // `lm build` failed with "HTTP 401 ... Try again later". The token only signs the app's Roxyon BaaS calls, so
    // with no real keys the build now completes without one (static SPA) and says how to add the backend.
    // Real keys that the BaaS rejects still fail the build loudly, as before.
    const keyUnset = (v) => !v || /^YOUR_/i.test(String(v).trim());
    let token_ = "";
    if (!baasEntry || keyUnset(beajsAppId) || keyUnset(beajsAuth)) {
      spinner.warn(
        "No Roxyon BaaS keys in config.json, so this build has no backend token. The app works as a static site; " +
          "to use the Roxyon BaaS (data, auth, files), add your app's keys from https://console.roxyon.com to " +
          "config.json's apis[] and build again."
      );
      spinner.start("Signing & Securing App..");
    } else {
      // 2026-09-18: was an unguarded `await` — a network failure here
      // (confirmed real: ECONNRESET) crashed the CLI with a raw stack trace instead of "Build Failed".
      let beajsRawRes;
      try {
        beajsRawRes = await API.req(
          "https://www.beaapis.com/1/beajs",
          { data: { apis: JSON.stringify(effectiveApis) } },
          { "X-BEA-Application-ID": beajsAppId, "X-BEA-Authorization": beajsAuth },
          "POST",
          undefined,
          true
        );
      } catch (e) {
        spinner.fail("Error getting a unique token for production! " + (e && e.message ? e.message : e));
        spinner.fail("Build Failed! Try again later.");
        return;
      }
      if (!beajsRawRes.ok) {
        spinner.fail(
          "Error getting a unique token for production! HTTP " + beajsRawRes.status +
            (beajsRawRes.status === 401 || beajsRawRes.status === 403
              ? " (the Roxyon BaaS keys in config.json were rejected: check them in https://console.roxyon.com)"
              : "")
        );
        spinner.fail("Build Failed!");
        return;
      }
      let r = {};
      try {
        r = JSON.parse(await beajsRawRes.text());
      } catch (e) {
        r = {};
      }
      token_ = r.token;
      // 2026-09-17: `!token_` catches undefined/null/"" — a missing token used to be baked in as "undefined".
      if (!token_) {
        spinner.fail("Error getting a unique token for production!");
        spinner.fail("Build Failed! Try again later.");
        return;
      }
    }
    let js_ = "";


    // Node-server build mode removed 2026-09-13 (V2): unused in practice —
    // every real project shipped --serverless, and the one case needing a
    // real backend (Console) built its own Swoole stack instead of reaching
    // for this. Serverless is now the only build output; see PROVENANCE.md
    // for the fuller reasoning.
    js_ +=
      `
var _beaTn = "` +
      token_ +
      `";
` + (token_ ? "" : "var _lmStatic = true;\n");

    // A migrated V1 project has no src/js/lm.js yet — use this CLI's own.
    let _projectRuntime = projectPath + path.sep + "src" + path.sep + "js" + path.sep + "lm.js";
    let ownRuntime = fs.readFileSync(
      fs.existsSync(_projectRuntime) ? _projectRuntime : path.join(__dirname, "files", "libs", "lm.js"),
      "utf8"
    );
    js_ += (_uncompiledScripts === 0 ? stripDevOnlyRuntime(ownRuntime) : ownRuntime) + "\n" + vt;

    spinner.succeed("Signing & Securing App").start("Packing & Cleaning...");
    rd(dest);

    spinner.succeed("Packing & Cleaning").start("Writing Files...");
    // Always the serverless build now — see the removal note above.
    let buildPath = `build_serverless`;

    copyDir(`${__dirname}` + path.sep + `files` + path.sep + buildPath, dest);
    copyDir(projectPath + path.sep + "src", dest, "_beajsBuild");
    cd(dest + path.sep + "js");
    cd(dest + path.sep + "css");
    cd(dest + path.sep + "images");

    copyDir(
      projectPath + path.sep + "src" + path.sep + "js",
      dest + path.sep + "js",
      "_beajsBuild"
    );
    copyDir(
      projectPath + path.sep + "src" + path.sep + "css",
      dest + path.sep + "css",
      "_beajsBuild"
    );
    copyDir(
      projectPath + path.sep + "src" + path.sep + "images",
      dest + path.sep + "images",
      "_beajsBuild"
    );

    fs.writeFileSync(
      dest + path.sep + "js" + path.sep + "lm.js",
      String(js_)
    );
    let _dT = new Date().getTime();
    fs.renameSync(
      dest + path.sep + "js" + path.sep + "lm.js",
      dest + path.sep + "js" + path.sep + "app." + _dT + ".js"
    );
    if (!fs.existsSync(dest + path.sep + "css")) fs.mkdirSync(dest + path.sep + "css", { recursive: true });
    if (_mainCssName) {
      let _copied = dest + path.sep + "css" + path.sep + _mainCssName;
      if (fs.existsSync(_copied)) fs.unlinkSync(_copied);
      fs.writeFileSync(dest + path.sep + "css" + path.sep + "app." + _dT + ".css", String(beaCSSCode));
    }
    let _hasStyles = fs.existsSync(dest + path.sep + "css" + path.sep + "styles.css");
    if (_hasStyles) {
      fs.renameSync(
        dest + path.sep + "css" + path.sep + "styles.css",
        dest + path.sep + "css" + path.sep + "styles." + _dT + ".css"
      );
    }

    // Per-project selective plugin bundling (2026-09-16) — only engaged if
    // the project's own package.json actually declares a dependency
    // matching one of plugins-registry.js's real npm package names — see
    // selectedProjectPlugins()/plugins-esbuild-plugin.js. A project using
    // none of this pays nothing extra here.
    let _selectedPlugins = selectedProjectPlugins(projectPath);
    let _pluginsTags = "";
    let _pluginsCssTag = "";
    if (_selectedPlugins.length) {
      let _pluginsJs = await _pluginsBundle.buildSelectedPluginsBundle(_selectedPlugins, projectPath, { minify: true });
      let _pluginsCss = await _pluginsBundle.buildSelectedCss(_selectedPlugins, projectPath + path.sep + "node_modules");
      fs.writeFileSync(dest + path.sep + "js" + path.sep + "plugins." + _dT + ".js", String(_pluginsJs));
      _pluginsTags += `\n    <script src="/js/plugins.` + _dT + `.js" type="text/javascript"></script>`;
      if (_pluginsCss && _pluginsCss.trim() != "") {
        fs.writeFileSync(dest + path.sep + "css" + path.sep + "plugins." + _dT + ".css", String(_pluginsCss));
        _pluginsCssTag = `<link href="/css/plugins.` + _dT + `.css" rel="stylesheet" type="text/css" />`;
      }
    }

    let _indexOut = String(indexCode)
        .split("/js/lm.js")
        .join("/js/app." + _dT + ".js")
        .split("/css/styles.css")
        .join(_hasStyles ? "/css/styles." + _dT + ".css" : "/css/styles.css")
        .split("/css/" + (_mainCssName || "mobius.css"))
        .join(_mainCssName ? "/css/app." + _dT + ".css" : "/css/mobius.css")
        .split("</head>")
        .join(_pluginsTags + "\n</head>");
    // 2026-10-03: plugin CSS goes BEFORE the project's own stylesheets, so the
    // project's styling of select2/datepicker/etc. wins, as it did in V1 (where
    // the plugin CSS was part of the base runtime CSS loaded first). Appended
    // last, stock select2 CSS overrode console.roxyon.com's selects (a second
    // native-looking arrow next to its own chevron).
    if (_pluginsCssTag) _indexOut = placePluginsCss(_indexOut, _pluginsCssTag);
    fs.writeFileSync(dest + path.sep + "index.html", _indexOut);

    if (cmds.indexOf("--deploy") >= 0) {
      spinner.succeed("Writing Files").start("Uploading To Server..");
      const _config = {
        user: config.ftp.username,
        // Password optional, prompted if none given
        password: config.ftp.password,
        host: config.ftp.host,
        port: config.ftp.port,
        localRoot: dest,
        remoteRoot: config.ftp.remotePath,
        include: ["*", "**/*", ".*"], // this would upload everything except dot files
        // include: ["*.js", "dist/*", ".*"],
        // e.g. exclude sourcemaps, and ALL files in node_modules (including dot files)
        exclude: config.ftp.ignore,
        // delete ALL existing files at destination before uploading, if true
        deleteRemote: false,
        // Passive mode is forced (EPSV command is not sent)
        forcePasv: true,
        // use sftp or ftp
        sftp: config.ftp.protocol == 'sftp' ? true : false,
      };
      // console.log(_config);

      _fD.deploy(_config, function (err, res) {
        if (err) {
          console.log(err);
        } else {
          spinner.succeed("Finished Uploading To Server");
          spinner.succeed("Done");
        }
      });
      _fD.on("uploading", function (data) {
        spinner.start(
          parseFloat(
            ((data.transferredFileCount * 100) / data.totalFilesCount).toFixed(
              2
            )
          ) +
          "% " +
          "Uploading " +
          data.filename +
          " "
        );
      });
      // _fD.on("uploaded", function (data) {
      //   console.log(data); // same data as uploading event
      // });
      // _fD.on("log", function (data) {
      //   console.log(data); // same data as uploading event
      // });
      // _fD.on("upload-error", function (data) {
      //   console.log(data.err); // data will also include filename, relativePath, and other goodies
      // });
    } else spinner.succeed("Writing Files").succeed("Done");
  });
}

function clear(isSoft) {
  process.stdout.write(isSoft ? "\x1B[H\x1B[2J" : "\x1B[2J\x1B[3J\x1B[H\x1Bc");
}

function startServer() {
  clear();
  // Lumen Copilot (2026-10-18): decided here, in the process that owns the terminal, because the dev server runs
  // under nodemon. The per-run token survives nodemon restarts so an open page keeps working after a save.
  if (!process.env.LM_COPILOT_TOKEN) process.env.LM_COPILOT_TOKEN = require("crypto").randomBytes(24).toString("hex");
  if (!process.env.LM_COPILOT_AUTO) process.env.LM_COPILOT_AUTO = process.stdout.isTTY && !process.env.CI ? "1" : "0";
  nodemon({
    script: path.join(__dirname.toString(), "app.js"),
    ext: "view,js,css,json,layout,html",
    watch: ["src/", "config.json"],
    // views/ and layouts/ changes are handled in-process by chokidar inside
    // app.js now (2026-09-14) — no restart, no dropped connections, just the
    // one changed file. Excluded here so they don't ALSO trigger a full
    // restart on top of that faster path.
    ignore: ["src/views/**", "src/layouts/**"],
  });
  nodemon.on("restart", (files) => {
    console.log(files);
  });
}
