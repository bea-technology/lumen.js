// Lumen Copilot milestone 1 (2026-10-18): the dev-server half. `lm serve` only — `lm build` never loads this file
// and never calls sendIndexHtml(), so nothing here can reach a production build (test/copilot.test.js checks dist/).
//
// Browser panel (/__lm/copilot.js) -> this dev server (/__lm/copilot/*) -> Roxyon console (POST /copilot/v1/turn).
// The Roxyon token stays in this process; the page never sees it.
//
// Writes are the dangerous part, so /apply and /undo are guarded:
//  - a random per-run token (inline in the served index.html, never in a script a foreign page could load),
//  - the request must come from this machine, to a loopback Host on this server's port, with Origin = that host
//    (another website's page, or a DNS-rebinding name, can't POST to it),
//  - every path must resolve (realpath) inside the project's src/, not a hidden/config/.env/*.local/node_modules/dist
//    file, with an allowed extension,
//  - the file must still be exactly what it was when the answer was made (sha1), or nothing is written,
//  - the old content is kept in .lumen/copilot-undo/<applyId>/ and Undo puts it back.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const fetch = require("node-fetch");
const auth = require("./auth.js");

const MAX_FILES_BYTES = 60 * 1024;
const MAX_TREE = 200;
const MAX_EDIT_BYTES = 200 * 1024;
const MAX_ANSWERS = 30;
const EDIT_EXTS = [".view", ".layout", ".js", ".css", ".less", ".html", ".json", ".md", ".svg", ".txt", ".tpl"];
const TOPUP_URL = "https://console.roxyon.com/account/billing?topup=1";

function sha1(s) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

/** Is Copilot on for this run? Off: LM_COPILOT=0, config.json "copilot": false, CI, or no TTY (unless LM_COPILOT=1). */
function isEnabled(config) {
  const v = String(process.env.LM_COPILOT || "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  if (config && config.copilot === false) return false;
  if (v === "1" || v === "true" || v === "on") return true;
  // `lm serve` runs this server under nodemon; the parent decided TTY/CI before spawning (fcs.js startServer).
  if (process.env.LM_COPILOT_AUTO === "0") return false;
  if (process.env.LM_COPILOT_AUTO === "1") return true;
  if (process.env.CI) return false;
  return !!process.stdout.isTTY;
}

// --- request guards -------------------------------------------------------------------------------------------------

const LOOPBACK_NAMES = ["127.0.0.1", "localhost", "[::1]"];

function isLoopbackAddr(a) {
  a = String(a || "");
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

/** Host header -> its "name:port" if it is a loopback name on our port, else null. */
function loopbackHost(hostHeader, port) {
  const h = String(hostHeader || "").toLowerCase();
  const m = /^(\[::1\]|127\.0\.0\.1|localhost):(\d+)$/.exec(h);
  if (!m || LOOPBACK_NAMES.indexOf(m[1]) === -1) return null;
  if (port && Number(m[2]) !== Number(port)) return null;
  return h;
}

function tokenOk(given, token) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(String(token || ""));
  return a.length === b.length && b.length > 0 && crypto.timingSafeEqual(a, b);
}

/**
 * The guard for every /__lm/copilot/* call. Returns null when OK, or a reason string.
 * `needOrigin`: POSTs must carry Origin (browsers always send it on POST); a same-origin GET may omit it.
 */
function checkRequest(req, token, port, needOrigin) {
  const remote = req.socket && req.socket.remoteAddress;
  if (!isLoopbackAddr(remote)) return "not from this computer";
  const host = loopbackHost(req.headers.host, port);
  if (!host) return "bad host";
  const origin = req.headers.origin;
  if (origin !== undefined || needOrigin) {
    if (origin !== "http://" + host) return "bad origin";
  }
  const site = req.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin") return "not same-origin";
  if (!tokenOk(req.headers["x-lm-copilot"], token)) return "bad token";
  return null;
}

// --- paths ------------------------------------------------------------------------------------------------------------

/**
 * A project-relative path an edit wants to write -> its absolute path, or null if it is not allowed.
 * Allowed: inside <root>/src/ (after resolving symlinks), no hidden segment, not config.json / .env* / *.local /
 * node_modules / dist, allowed extension.
 */
function resolveEditPath(root, rel) {
  if (typeof rel !== "string" || rel === "" || rel.length > 240) return null;
  if (/[\0\\]/.test(rel) || path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) return null;
  const norm = path.posix.normalize(rel.replace(/^\.\//, ""));
  if (norm !== rel.replace(/^\.\//, "")) return null; // no "a//b", "a/./b", trailing junk
  const segs = norm.split("/");
  if (segs[0] !== "src" || segs.length < 2) return null;
  for (const s of segs) {
    if (s === "" || s === "." || s === ".." || s[0] === ".") return null;
    const l = s.toLowerCase();
    if (l === "node_modules" || l === "dist" || l === "config.json" || l.endsWith(".local") || l.startsWith(".env")) return null;
  }
  if (EDIT_EXTS.indexOf(path.posix.extname(norm).toLowerCase()) === -1) return null;
  if (norm === "src/js/lm.js") return null; // the framework runtime, managed by `lm update-core`

  let srcReal;
  try { srcReal = fs.realpathSync(path.join(root, "src")); } catch (e) { return null; }
  const abs = path.join(root, ...segs);
  // Nearest existing ancestor (or the file itself) must really be inside src/.
  let p = abs;
  while (!fs.existsSync(p)) {
    const up = path.dirname(p);
    if (up === p) return null;
    p = up;
  }
  let real;
  try { real = fs.realpathSync(p); } catch (e) { return null; }
  if (real !== srcReal && real.indexOf(srcReal + path.sep) !== 0) return null;
  if (fs.existsSync(abs)) {
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink() || !st.isFile()) return null;
  }
  return abs;
}

function readIf(abs) {
  try { return fs.readFileSync(abs, "utf8"); } catch (e) { return null; }
}

// --- project context sent with a turn ---------------------------------------------------------------------------------

function listTree(root) {
  const out = [];
  const src = path.join(root, "src");
  (function walk(dir, rel) {
    if (out.length >= MAX_TREE) return;
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    ents.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of ents) {
      if (out.length >= MAX_TREE) return;
      if (e.name[0] === "." || e.name === "node_modules") continue;
      const r = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out.push("src/" + r);
    }
  })(src, "");
  return out;
}

function defaultView(root) {
  const idx = readIf(path.join(root, "src", "index.js")) || "";
  const m = /["']?defaultView["']?\s*:\s*["']([\w\/-]+)["']/.exec(idx);
  return m ? m[1] : "home";
}

/** Files to send: the ones most likely to matter first, whole files only, within MAX_FILES_BYTES. */
function pickFiles(root, wanted) {
  const files = [];
  let total = 0;
  const seen = {};
  for (const rel of wanted) {
    if (!rel || seen[rel] || rel === "src/js/lm.js") continue;
    seen[rel] = 1;
    const abs = path.join(root, ...rel.split("/"));
    const c = readIf(abs);
    if (c == null) continue;
    const n = Buffer.byteLength(c);
    if (total + n > MAX_FILES_BYTES) continue;
    total += n;
    files.push({ path: rel, content: c });
  }
  return files;
}

function viewsFromText(text, tree) {
  const out = [];
  const views = tree.filter((t) => /^src\/(views|layouts|tpls|comps)\//.test(t));
  for (const v of views) {
    const name = v.replace(/^src\/(views|layouts|tpls|comps)\//, "").replace(/\.(view|layout|tpl)$/, "");
    if (name && new RegExp("(^|[^\\w-])" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^\\w-]|$)").test(text)) out.push(v);
  }
  return out;
}

function routeView(root, route, tree) {
  let seg = String(route || "/").split("?")[0].split("#")[0].replace(/^\/+/, "").split("/")[0];
  if (!seg || seg === "index.html") seg = defaultView(root);
  const v = "src/views/" + seg + ".view";
  return tree.indexOf(v) !== -1 ? v : null;
}

function buildContext(root, body, serverErrors) {
  const tree = listTree(root);
  const wanted = [];
  if (body.mode === "explain") {
    const e = body.error || {};
    const text = [e.message, e.stack, e.source].join("\n");
    const rv = routeView(root, e.route, tree);
    if (rv) wanted.push(rv);
    wanted.push(...viewsFromText(text, tree));
    // Stack frames that point at served project files (http://127.0.0.1:3000/js/x.js:10:5).
    const re = /https?:\/\/[^/\s)]+\/([^\s):?#]+\.js)/g;
    let m;
    while ((m = re.exec(text))) {
      const rel = "src/" + m[1];
      if (tree.indexOf(rel) !== -1) wanted.push(rel);
    }
    wanted.push("src/index.js");
    wanted.push(...tree.filter((t) => /^src\/layouts\//.test(t)));
  } else {
    const name = sanitizeName(body.name);
    if (name) wanted.push("src/views/" + name + ".view");
    wanted.push("src/index.js");
    wanted.push(...tree.filter((t) => /^src\/layouts\//.test(t)));
    // A couple of the project's own views as style examples (smallest first).
    const views = tree.filter((t) => /^src\/views\/[^/]+\.view$/.test(t))
      .map((t) => ({ t, n: (readIf(path.join(root, ...t.split("/"))) || "").length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => a.n - b.n)
      .slice(0, 2)
      .map((x) => x.t);
    wanted.push(...views);
  }
  return { tree, files: pickFiles(root, wanted), serverErrors: (serverErrors || []).slice(-5) };
}

function sanitizeName(n) {
  n = String(n || "").trim().toLowerCase().replace(/\.view$/, "");
  return /^[a-z][a-z0-9_-]{0,40}$/.test(n) ? n : "";
}

// --- diff (for display only) -------------------------------------------------------------------------------------------

/** A small unified diff (3 lines of context). Very large files fall back to "replace everything". */
function unifiedDiff(before, after, file) {
  // The final newline is not a line of its own.
  const a = before == null ? [] : before.replace(/\n$/, "").split("\n");
  const b = after.replace(/\n$/, "").split("\n");
  const head = "--- " + (before == null ? "/dev/null" : "a/" + file) + "\n+++ b/" + file + "\n";
  if (a.length * b.length > 4000000) {
    return head + "@@ -1," + a.length + " +1," + b.length + " @@\n" + a.map((l) => "-" + l).join("\n") + (a.length ? "\n" : "") + b.map((l) => "+" + l).join("\n") + "\n";
  }
  // LCS table (from the end) -> edit script.
  const n = a.length, m = b.length;
  const dp = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { ops.push([" ", a[i], i, j]); i++; j++; }
    else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) { ops.push(["-", a[i], i, j]); i++; }
    else { ops.push(["+", b[j], i, j]); j++; }
  }
  const changed = ops.map((o) => o[0] !== " ");
  if (changed.indexOf(true) === -1) return "";
  let out = head;
  let k = 0;
  while (k < ops.length) {
    if (!changed[k]) { k++; continue; }
    const start = Math.max(0, k - 3);
    // One hunk while changes are within 6 lines of each other (so hunks never overlap).
    let last = k;
    for (let x = k; x < ops.length; x++) {
      if (changed[x]) last = x;
      else if (x - last > 6) break;
    }
    const end = Math.min(ops.length - 1, last + 3);
    const hunk = ops.slice(start, end + 1);
    const aStart = hunk[0][2] + 1, bStart = hunk[0][3] + 1;
    const aLen = hunk.filter((o) => o[0] !== "+").length;
    const bLen = hunk.filter((o) => o[0] !== "-").length;
    out += "@@ -" + (aLen ? aStart : 0) + "," + aLen + " +" + (bLen ? bStart : 0) + "," + bLen + " @@\n";
    out += hunk.map((o) => o[0] + o[1]).join("\n") + "\n";
    k = end + 1;
  }
  return out;
}

// --- the Express routes --------------------------------------------------------------------------------------------------

/**
 * mount(app, { root, token, getPort, fetch?, consoleUrl? })
 * Returns { inject(html, req), noteServerError(msg) }.
 */
function mount(app, opts) {
  const express = require("express");
  const root = fs.realpathSync(opts.root);
  const token = opts.token;
  const getPort = opts.getPort || (() => 0);
  const doFetch = opts.fetch || fetch;
  const answers = new Map(); // id -> { edits:[{path, abs, before_sha1, content}], createdAt }
  const serverErrors = [];
  const json = express.json({ limit: "1mb" });

  function guard(needOrigin) {
    return function (req, res, next) {
      const why = checkRequest(req, token, getPort(), needOrigin);
      if (why) { res.status(403).json({ ok: false, error: "Lumen Copilot refused this request (" + why + ")." }); return; }
      next();
    };
  }

  app.get("/__lm/copilot.js", function (req, res) {
    res.set("Cache-Control", "no-store");
    res.type("application/javascript").sendFile(path.join(__dirname, "widget.js"));
  });

  app.get("/__lm/copilot/status", guard(false), async function (req, res) {
    const a = await auth.getAuth().catch(() => null);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, signedIn: !!a, email: (a && a.email) || "", serverErrors: serverErrors.slice(-10), lmVersion: auth.lmVersion() });
  });

  app.post("/__lm/copilot/turn", guard(true), json, async function (req, res) {
    const b = req.body || {};
    const mode = b.mode === "create" ? "create" : b.mode === "explain" ? "explain" : null;
    const prompt = String(b.prompt || "").slice(0, 4000);
    if (!mode) return res.status(400).json({ ok: false, error: "mode must be explain or create" });
    if (mode === "create" && !prompt.trim()) return res.status(400).json({ ok: false, error: "Describe the view you want." });
    const a = await auth.getAuth().catch(() => null);
    if (!a) return res.json({ ok: false, signin: true, error: "Sign in to use Lumen Copilot: run `lm login` in a terminal." });

    const error = mode === "explain" ? {
      message: String((b.error && b.error.message) || "").slice(0, 4000),
      stack: String((b.error && b.error.stack) || "").slice(0, 8000),
      route: String((b.error && b.error.route) || "").slice(0, 300),
      source: String((b.error && b.error.source) || "").slice(0, 300),
    } : undefined;
    const ctx = buildContext(root, { mode, error, name: b.name }, serverErrors);
    const payload = {
      mode,
      prompt,
      name: sanitizeName(b.name) || undefined,
      think: !!b.think,
      error,
      files: ctx.files,
      tree: ctx.tree,
      serverErrors: ctx.serverErrors,
      lmVersion: auth.lmVersion(),
    };

    let r, j;
    try {
      r = await doFetch((opts.consoleUrl || auth.consoleUrl()) + "/copilot/v1/turn", {
        method: "POST",
        headers: Object.assign({ "content-type": "application/json", "x-roxyon-client": auth.clientHeader() }, a.headers),
        body: JSON.stringify(payload),
        timeout: 180000,
      });
      j = await r.json().catch(() => null);
    } catch (e) {
      return res.json({ ok: false, error: "Could not reach Roxyon (" + e.message + "). Check your connection and try again." });
    }
    if (!r || !j) return res.json({ ok: false, error: "Roxyon answered with something unexpected (HTTP " + (r && r.status) + "). Try again." });
    if (r.status === 401) return res.json({ ok: false, signin: true, error: "Your Roxyon sign-in has expired. Run `lm login` again." });
    if (r.status === 402 || j.code === "insufficient_funds") {
      return res.json({ ok: false, topup: j.topupUrl || TOPUP_URL, error: j.error || "Your Roxyon wallet is empty. Add funds to keep using Lumen Copilot.", usage: j.usage || null });
    }
    if (!j.ok) return res.json({ ok: false, error: j.error || "Lumen Copilot could not answer (HTTP " + r.status + ").", usage: j.usage || null });

    // Keep only edits we would accept, and remember what each file looked like right now.
    const edits = [];
    const dropped = [];
    for (const e of Array.isArray(j.edits) ? j.edits.slice(0, 10) : []) {
      const rel = e && typeof e.path === "string" ? e.path : "";
      const content = e && typeof e.content === "string" ? e.content : null;
      const abs = resolveEditPath(root, rel);
      if (!abs || content == null || Buffer.byteLength(content) > MAX_EDIT_BYTES) { dropped.push(rel || "(no path)"); continue; }
      const before = readIf(abs);
      if (before === content) continue;
      edits.push({ path: rel, abs, content, before_sha1: before == null ? null : sha1(before), isNew: before == null, diff: unifiedDiff(before, content, rel) });
    }
    const id = crypto.randomBytes(9).toString("hex");
    if (edits.length) {
      answers.set(id, { edits, createdAt: Date.now() });
      while (answers.size > MAX_ANSWERS) answers.delete(answers.keys().next().value);
    }
    res.json({
      ok: true,
      id: edits.length ? id : null,
      text: String(j.text || ""),
      edits: edits.map((e) => ({ path: e.path, isNew: e.isNew, diff: e.diff })),
      dropped,
      hint: j.hint || "",
      usage: j.usage || null,
    });
  });

  app.post("/__lm/copilot/apply", guard(true), json, function (req, res) {
    const ans = answers.get(String((req.body && req.body.id) || ""));
    if (!ans) return res.status(404).json({ ok: false, error: "That answer is no longer available (the dev server restarted?). Ask again." });
    // Check everything before writing anything.
    for (const e of ans.edits) {
      const abs = resolveEditPath(root, e.path);
      if (!abs || abs !== e.abs) return res.status(403).json({ ok: false, error: "Refused to write " + e.path + "." });
      const now = readIf(abs);
      const nowSha = now == null ? null : sha1(now);
      if (nowSha !== e.before_sha1) {
        return res.status(409).json({ ok: false, error: e.path + " changed since this answer was made. Nothing was written; ask again." });
      }
    }
    const applyId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomBytes(3).toString("hex");
    const dir = path.join(root, ".lumen", "copilot-undo", applyId);
    fs.mkdirSync(dir, { recursive: true });
    const manifest = { applyId, answerId: req.body.id, at: new Date().toISOString(), files: [] };
    ans.edits.forEach((e, i) => {
      const before = readIf(e.abs);
      const entry = { path: e.path, existed: before != null, after_sha1: sha1(e.content) };
      if (before != null) {
        entry.backup = "f" + i;
        fs.writeFileSync(path.join(dir, entry.backup), before);
      }
      manifest.files.push(entry);
    });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
    for (const e of ans.edits) {
      fs.mkdirSync(path.dirname(e.abs), { recursive: true });
      fs.writeFileSync(e.abs, e.content);
    }
    answers.delete(req.body.id);
    res.json({ ok: true, applyId, files: ans.edits.map((e) => e.path) });
  });

  app.post("/__lm/copilot/undo", guard(true), json, function (req, res) {
    const applyId = String((req.body && req.body.applyId) || "");
    if (!/^[\w-]{10,80}$/.test(applyId)) return res.status(400).json({ ok: false, error: "bad applyId" });
    const dir = path.join(root, ".lumen", "copilot-undo", applyId);
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")); } catch (e) {
      return res.status(404).json({ ok: false, error: "Nothing to undo for that change." });
    }
    if (manifest.undone) return res.json({ ok: true, files: [], already: true });
    for (const f of manifest.files) {
      const abs = resolveEditPath(root, f.path);
      const now = abs ? readIf(abs) : null;
      if (!abs || now == null || sha1(now) !== f.after_sha1) {
        return res.status(409).json({ ok: false, error: f.path + " was changed after Copilot wrote it, so Undo was not done. Its old version is in .lumen/copilot-undo/" + applyId + "/." });
      }
    }
    for (const f of manifest.files) {
      const abs = resolveEditPath(root, f.path);
      if (f.existed) fs.writeFileSync(abs, fs.readFileSync(path.join(dir, f.backup)));
      else fs.unlinkSync(abs);
    }
    manifest.undone = new Date().toISOString();
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
    res.json({ ok: true, files: manifest.files.map((f) => f.path) });
  });

  return {
    /** Add the panel to the served index.html: right after <head> so its error hooks run before the app's scripts. */
    inject(html, req) {
      if (!req || !isLoopbackAddr(req.socket && req.socket.remoteAddress) || !loopbackHost(req.headers.host, getPort())) return html;
      if (!auth.hasCredentials()) return html;
      const tags = `<script>window.__lmCopilot=${JSON.stringify({ t: token })};</script>` +
        `<script src="/__lm/copilot.js"></script>`;
      const m = /<head(\s[^>]*)?>/i.exec(html);
      if (m) return html.slice(0, m.index + m[0].length) + tags + html.slice(m.index + m[0].length);
      return tags + html;
    },
    noteServerError(msg) {
      serverErrors.push({ message: String(msg).slice(0, 2000), at: Date.now() });
      if (serverErrors.length > 20) serverErrors.shift();
    },
  };
}

module.exports = { isEnabled, mount, checkRequest, resolveEditPath, unifiedDiff, buildContext, loopbackHost, sha1, sanitizeName };
