// LumenJS 2.7.0 (owner decisions D-20261028-10, D-20261029-03): a production build loads the common runtime from
// jsDelivr, cdn.jsdelivr.net/npm/@lmjs/core@<exact version>/cdn/ (the files ship inside the published @lmjs/core
// package, packages/core/build/cdn.js), with cdn.roxyon.com/lumenjs/<version>/ as the second host, and ships only the
// project's own code, with big views split out and loaded when first opened.
//
// - The runtime files on the CDN are exactly this CLI's own runtime (files/libs/lm.js): `lm.js` with the dev-only
//   part stripped (every view script precompiled), `lm.full.js` as is. `lm cdn-files <dir>` writes them for upload.
//   A project whose src/js/lm.js is not this CLI's runtime (patched, older) keeps its runtime inside app.js.
// - index.html: preconnect + `<script src=jsDelivr integrity=sha384 crossorigin>`; if it did not run, the same file
//   from cdn.roxyon.com (same SRI); if that did not run either, a same-origin copy (dist/js/lumenjs/<version>/), so a
//   CDN problem never breaks a site. (cdn.roxyon.com alone failed on a phone in Lebanon, 2026-10-29.)
// - When the views add up to >= SPLIT_APP_MIN gzipped, views of >= SPLIT_MIN gzipped (not widgets) go to
//   js/v/<name>.<hash>.js; the manifest `_vcLazy` in app.js tells the runtime where each one is and which sub-views it
//   uses (prefetched when it renders). index.html preloads the opened page's own file at once (routePreload).
// Off with `lm build --no-cdn` / `--no-split`, or config.json `"cdnRuntime": false` / `"splitViews": false`.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const JSDELIVR_ORIGIN = "https://cdn.jsdelivr.net";
const jsdelivrBase = (version) => JSDELIVR_ORIGIN + "/npm/@lmjs/core@" + version + "/cdn/";
const CDN_BASE = "https://cdn.roxyon.com/lumenjs/"; // the second host (the release uploads `lm cdn-files` there)

/** Removes the dev-only part of the runtime (the in-browser view-script compiler) when every view is precompiled. */
function stripDevOnlyRuntime(src) {
  const a = src.indexOf("var __lmDevOnlyStart__ = 1;");
  const b = src.indexOf("var __lmDevOnlyEnd__ = 1;");
  if (a < 0 || b < a) return src;
  return src.slice(0, a) + src.slice(b + "var __lmDevOnlyEnd__ = 1;".length);
}
// Splitting costs the opened page a request, so only apps whose views are big enough to matter are split (measured
// 2026-10-28: a 4-view shop got slower to first paint; a 46-view site and a 14-view store got much faster), and only
// views worth a request: sizes are gzipped, as they travel.
const SPLIT_MIN = 8 * 1024;
const SPLIT_APP_MIN = 48 * 1024;
const gz = (s) => require("zlib").gzipSync(s, { level: 6 }).length;

function cliVersion() {
  const up = path.join(__dirname, "..", "..", "package.json");
  const p = fs.existsSync(up) && require(up).name === "@lmjs/cli" ? up : path.join(__dirname, "..", "package.json");
  return require(p).version;
}

function seedRuntime() {
  return fs.readFileSync(path.join(__dirname, "files", "libs", "lm.js"), "utf8");
}

/** The runtime files of this version (in @lmjs/core's cdn/ and on cdn.roxyon.com/lumenjs/<version>/). */
function runtimeFiles(strip = stripDevOnlyRuntime, seed = seedRuntime()) {
  return { "lm.js": strip(seed), "lm.full.js": seed };
}

function sri(code) {
  return "sha384-" + crypto.createHash("sha384").update(code, "utf8").digest("base64");
}

function shortHash(code) {
  return crypto.createHash("sha256").update(code, "utf8").digest("hex").slice(0, 10);
}

function flagOff(cmds, config, flag, key) {
  return (cmds || []).indexOf(flag) >= 0 || (config && config[key] === false);
}

/**
 * Decide whether this build loads its runtime from the CDN.
 * Returns null (keep the runtime in app.js) or { version, file, url, integrity, code }.
 */
function planRuntime(opts) {
  if (flagOff(opts.cmds, opts.config, "--no-cdn", "cdnRuntime")) return null;
  if (opts.ownRuntime !== seedRuntime()) return { skipped: "src/js/lm.js is not this CLI's runtime (run lm update-core to use the CDN runtime)" };
  const files = runtimeFiles(opts.stripDevOnlyRuntime || stripDevOnlyRuntime);
  const file = opts.precompiled ? "lm.js" : "lm.full.js";
  const code = files[file];
  const version = cliVersion();
  return { version, file, url: jsdelivrBase(version) + file, fallbackUrl: CDN_BASE + version + "/" + file, integrity: sri(code), code };
}

/** The script tags that replace <script src="/js/lm.js"></script> in index.html. */
function runtimeTags(plan, tokenJs, appSrc) {
  const local = "/js/lumenjs/" + plan.version + "/" + plan.file;
  // The runtime defines renderView(); each next source loads only if the one before did not run (blocked, down,
  // SRI mismatch). document.write keeps the order: app.js always runs after the runtime.
  const next = (tag) => "    <script>typeof renderView === 'function' || document.write('" + tag + "')</script>\n";
  return (
    "<script>" + tokenJs.trim() + "</script>\n" +
    '    <script src="' + plan.url + '" integrity="' + plan.integrity + '" crossorigin="anonymous"></script>\n' +
    next('<script src=\"' + plan.fallbackUrl + '\" integrity=\"' + plan.integrity + '\" crossorigin=\"anonymous\"><\\/script>') +
    next('<script src=\"' + local + '\"><\\/script>') +
    '    <script src="' + appSrc + '" type="text/javascript"></script>'
  );
}

/** index.html: preload the opened page's view file at once, in parallel with the runtime (no extra round trip). */
function routePreload(routes) {
  if (!routes || !Object.keys(routes).length) return "";
  return (
    "<script>(function(m){var s=location.pathname.split('/')[1]||'home';var u=m[s];if(!u)return;" +
    "var l=document.createElement('link');l.rel='preload';l.as='script';l.href=u;document.head.appendChild(l)})(" +
    JSON.stringify(routes) + ")</script>"
  );
}

function preconnectTag() {
  return '<link rel="preconnect" href="' + JSDELIVR_ORIGIN + '" crossorigin />';
}

function viewKey(name) {
  return Buffer.from("src/views/" + name + ".view").toString("base64");
}

/** Static sub-views a view mounts (view="parts/x"), as file keys. Dynamic ones ({{...}}) are left to load on use. */
function subViewKeys(entry) {
  const out = new Set();
  (function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const v = n.attrs && n.attrs.view;
      if (typeof v === "string" && v && v.indexOf("{{") < 0) out.add(viewKey(v.replace(/^\/+/, "").replace(/\.view$/, "")));
      walk(n.children);
    }
  })(entry && entry.hst);
  return [...out];
}

/**
 * Split big views out of the payload. Mutates `views` (removes the split ones) and returns
 * { files: {relPath: code}, manifestJs } or null when nothing is split.
 */
function splitViews(views, replacer, opts) {
  if (flagOff(opts.cmds, opts.config, "--no-split", "splitViews")) return null;
  if (!opts.runtimeSupportsLazy) return null;
  const files = {};
  const lazy = {};
  const subs = {};
  const keys = Object.keys(views);
  const decoded = (k) => Buffer.from(k, "base64").toString("utf8");
  const sizes = {};
  let total = 0;
  for (const k of keys) total += sizes[k] = gz(JSON.stringify(views[k], replacer));
  if (total < SPLIT_APP_MIN) return null;
  const routes = {};
  for (const k of keys) {
    const file = decoded(k);
    if (!/^src\/views\//.test(file) || /^src\/views\/widgets\//.test(file)) continue;
    if (sizes[k] < SPLIT_MIN) continue;
    const json = JSON.stringify(views[k], replacer);
    const name = file.replace(/^src\/views\//, "").replace(/\.view$/, "").replace(/[^A-Za-z0-9_-]+/g, "-");
    const code = "_lmViewLoaded(" + JSON.stringify(k) + "," + json + ");\n";
    const rel = "js/v/" + name + "." + shortHash(code) + ".js";
    files[rel] = code;
    lazy[k] = ["/" + rel, []];
    // a page view (src/views/<name>.view): the URL's first segment opens it
    const page = /^src\/views\/([^/]+)\.view$/.exec(file);
    if (page) routes[page[1]] = "/" + rel;
  }
  if (!Object.keys(lazy).length) return null;
  for (const k of keys) {
    const s = subViewKeys(views[k]).filter((x) => lazy[x] && x !== k);
    if (!s.length) continue;
    if (lazy[k]) lazy[k][1] = s;
    else subs[k] = s;
  }
  for (const k in lazy) delete views[k];
  const manifestJs = "\nvar _vcLazy = " + JSON.stringify(lazy) + ";\nvar _vcSubs = " + JSON.stringify(subs) + ";\n";
  return { files, manifestJs, routes };
}

/**
 * `lm cdn-files [dir]`: this CLI's runtime files as published on the CDN, in <dir>/lumenjs/<version>/, with their SRI
 * hashes (integrity.json) and the headers the CDN must send (README.txt). The release uploads the folder; files are
 * never changed once published (a fix is a new version).
 */
function writeCdnFiles(dir, strip = stripDevOnlyRuntime) {
  const version = cliVersion();
  const out = path.join(dir, "lumenjs", version);
  fs.mkdirSync(out, { recursive: true });
  const files = runtimeFiles(strip);
  const integrity = {};
  for (const name of Object.keys(files)) {
    fs.writeFileSync(path.join(out, name), files[name]);
    integrity[name] = sri(files[name]);
  }
  fs.writeFileSync(path.join(out, "integrity.json"), JSON.stringify({ version, files: integrity }, null, 2) + "\n");
  fs.writeFileSync(
    path.join(out, "README.txt"),
    "LumenJS " + version + " runtime for " + CDN_BASE + version + "/ (the second host; the first is " + jsdelivrBase(version) + ", from the npm package)\n\n" +
      "Serve these files exactly as they are, forever (never edit or replace them; a fix is a new version), with:\n" +
      "  Content-Type: application/javascript; charset=utf-8\n" +
      "  Cache-Control: public, max-age=31536000, immutable   (one header, nothing else)\n" +
      "  Access-Control-Allow-Origin: *                       (pages load them with SRI + crossorigin)\n" +
      "  gzip and brotli\n"
  );
  console.log("Wrote " + Object.keys(files).length + " runtime files for " + CDN_BASE + version + "/ to " + out);
  for (const n of Object.keys(integrity)) console.log("  " + n + "  " + integrity[n]);
  return { dir: out, integrity };
}

module.exports = { routePreload, writeCdnFiles, CDN_BASE, jsdelivrBase, stripDevOnlyRuntime, SPLIT_MIN, cliVersion, runtimeFiles, sri, shortHash, planRuntime, runtimeTags, preconnectTag, splitViews, subViewKeys, viewKey };
