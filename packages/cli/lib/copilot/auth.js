// Lumen Copilot milestone 1 (2026-10-18): Roxyon sign-in for the `lm` CLI.
//
// `lm login` is an OAuth 2.1 authorization-code + PKCE flow against the console's own authorization server
// (console.roxyon.com/oauth/*, _configs app-x/console libs/OAuthServer.php) with a loopback redirect
// (http://127.0.0.1:<port>/callback, RFC 8252). The browser does the sign-in (email code; a new email creates the
// account), the CLI gets a short-lived `roxp_` access token (1 h) + a rotating refresh token, scopes
// "read deploy copilot".
//
// Where it is stored: ~/.roxyon/config.json (0600), the file `roxyon login` and the Roxyon MCP server already share.
// lm's own copy lives under the `lumen` key so it never clobbers a `roxyon login` session; only when that file has no
// session at all does lm also fill the top-level fields (`kind: "pat"`), so `roxyon` can use the same sign-in.
//
// This also fixes the old `lm login` bug: it shelled out to `roxyon login` and then looked for ROXYON_TOKEN /
// .roxyon-token.local, which `roxyon login` never writes (it writes ~/.roxyon/config.json), so it could not succeed.
//
// The access token never reaches a browser: `lm serve` reads it here and calls the console itself.
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
const fetch = require("node-fetch");

const DEFAULT_CONSOLE_URL = "https://console.roxyon.com";
const SCOPE = "read deploy copilot";
const CLIENT_NAME = "LumenJS CLI (lm)";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

function consoleUrl() {
  return (process.env.ROXYON_CONSOLE_URL || DEFAULT_CONSOLE_URL).replace(/\/+$/, "");
}
// RFC 8707 resource the token is bound to: the console API itself (not the MCP server).
function oauthResource() {
  return process.env.ROXYON_OAUTH_RESOURCE || DEFAULT_CONSOLE_URL;
}

function credentialsPath() {
  // LM_ROXYON_CONFIG: tests (and anyone who wants a separate login) point lm at another file.
  if (process.env.LM_ROXYON_CONFIG) return process.env.LM_ROXYON_CONFIG;
  return path.join(os.homedir(), ".roxyon", "config.json");
}

function readCredentials() {
  try {
    const c = JSON.parse(fs.readFileSync(credentialsPath(), "utf8"));
    return c && typeof c === "object" ? c : null;
  } catch (e) {
    return null;
  }
}

function writeCredentials(creds) {
  const p = credentialsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  fs.writeFileSync(p, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
  try { fs.chmodSync(p, 0o600); } catch (e) { }
  return p;
}

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pkcePair() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function hasScope(scope, s) {
  return String(scope || "").split(/\s+/).indexOf(s) !== -1;
}

function lmVersion() {
  for (const p of [path.join(__dirname, "..", "..", "package.json"), path.join(__dirname, "..", "..", "..", "package.json")]) {
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      if (j.name === "@lmjs/cli") return j.version;
    } catch (e) { }
  }
  return "0.0.0";
}
function clientHeader() {
  return "lm/" + lmVersion();
}

async function postForm(url, fields) {
  const body = Object.keys(fields)
    .filter((k) => fields[k] !== undefined && fields[k] !== null)
    .map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(fields[k]))
    .join("&");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-roxyon-client": clientHeader() },
    body,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { }
  return { status: res.status, json: json || {} };
}

// --- refresh -------------------------------------------------------------------------------------------------------

let _refreshing = null; // one refresh at a time per process: a rotated refresh token used twice revokes the family

async function refreshLumen() {
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    const creds = readCredentials();
    const l = creds && creds.lumen;
    if (!l || !l.refreshToken) return null;
    // Another process may have refreshed already.
    if (l.accessToken && Number(l.expiresAt || 0) > Date.now() + 60000) return l;
    const r = await postForm(consoleUrl() + "/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: l.refreshToken,
      client_id: l.clientId,
    });
    if (r.status !== 200 || !r.json.access_token) {
      // invalid_grant = revoked / expired / reused: the sign-in is gone. Keep the file, drop the dead tokens.
      if (r.status === 400) {
        const fresh = readCredentials() || {};
        if (fresh.lumen) {
          delete fresh.lumen.accessToken;
          delete fresh.lumen.refreshToken;
          writeCredentials(fresh);
        }
      }
      return null;
    }
    const fresh = readCredentials() || {};
    const wasTopLevel = fresh.kind === "pat" && fresh.lumen && fresh.sessionToken === fresh.lumen.accessToken;
    fresh.lumen = Object.assign({}, fresh.lumen || {}, {
      accessToken: r.json.access_token,
      refreshToken: r.json.refresh_token || l.refreshToken,
      expiresAt: Date.now() + Number(r.json.expires_in || 3600) * 1000,
      scope: r.json.scope || l.scope,
    });
    if (wasTopLevel) fresh.sessionToken = fresh.lumen.accessToken;
    writeCredentials(fresh);
    return fresh.lumen;
  })();
  try {
    return await _refreshing;
  } finally {
    _refreshing = null;
  }
}

/**
 * How to call the console as the signed-in developer, or null.
 * Order: ROXYON_TOKEN (CI), lm's own OAuth sign-in (refreshed when needed), then a `roxyon login` session.
 * Returns { headers, source, email, scope }.
 */
async function getAuth() {
  const env = (process.env.ROXYON_TOKEN || "").trim();
  if (env) return authFromToken(env, "ROXYON_TOKEN");
  const creds = readCredentials();
  if (!creds) return null;
  let l = creds.lumen;
  if (l && (l.accessToken || l.refreshToken)) {
    if (!l.accessToken || Number(l.expiresAt || 0) <= Date.now() + 60000) {
      try { l = await refreshLumen(); } catch (e) { l = null; }
    }
    if (l && l.accessToken) {
      return { headers: { authorization: "Bearer " + l.accessToken }, source: "lm login", email: l.email || "", scope: l.scope || "" };
    }
  }
  if (creds.sessionToken && creds.kind !== "pat") {
    const a = authFromToken(String(creds.sessionToken), "roxyon login");
    a.email = creds.email || "";
    return a;
  }
  return null;
}

function authFromToken(tok, source) {
  if (tok.indexOf("roxp_") === 0) return { headers: { authorization: "Bearer " + tok }, source, email: "", scope: "" };
  // A console/BaaS session token (`roxyon login`): full access as that user.
  return { headers: { "x-bea-session-token": tok }, source, email: "", scope: "*" };
}

/** Cheap, synchronous "is anyone signed in" check (no network), for deciding whether to show the panel. */
function hasCredentials() {
  if ((process.env.ROXYON_TOKEN || "").trim()) return true;
  const c = readCredentials();
  if (!c) return false;
  if (c.lumen && (c.lumen.refreshToken || c.lumen.accessToken)) return true;
  return !!(c.sessionToken && c.kind !== "pat");
}

/** A PAT for the vault (`lm api ...`), synchronous: env, project file, then the stored sign-in if still valid. */
function storedPat() {
  const c = readCredentials();
  if (!c) return null;
  if (c.lumen && c.lumen.accessToken && Number(c.lumen.expiresAt || 0) > Date.now() + 60000) return c.lumen.accessToken;
  if (typeof c.sessionToken === "string" && c.sessionToken.indexOf("roxp_") === 0) return c.sessionToken;
  return null;
}
async function freshPat() {
  const c = readCredentials();
  if (c && c.lumen && c.lumen.refreshToken && !(Number(c.lumen.expiresAt || 0) > Date.now() + 60000)) {
    try { await refreshLumen(); } catch (e) { }
  }
  return storedPat();
}

// --- lm login ------------------------------------------------------------------------------------------------------

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const p = spawn(cmd, args, { stdio: "ignore", detached: true });
    p.on("error", () => { });
    p.unref();
    return true;
  } catch (e) {
    return false;
  }
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.once("error", reject);
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

function page(title, body) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<body style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;background:#0f0f10;color:#e6e6e6;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center">` +
    `<div style="max-width:420px;padding:32px;background:#1a1a1c;border:1px solid #2a2a2e;border-radius:14px"><h1 style="font-size:18px;margin:0 0 10px">${esc(title)}</h1><p>${esc(body)}</p></div>`;
}

async function registerClient(redirectUri) {
  const res = await fetch(consoleUrl() + "/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-roxyon-client": clientHeader() },
    body: JSON.stringify({
      client_name: CLIENT_NAME,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
      software_id: "lmjs-cli",
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (res.status !== 201 || !j.client_id) throw new Error("could not register with " + consoleUrl() + " (" + res.status + " " + (j.error_description || j.error || "") + ")");
  return j.client_id;
}

/**
 * `lm login [--force] [--no-browser]`. Returns the saved `lumen` block, or null.
 * opts.log: printer; opts.open: browser opener (tests); opts.timeoutMs.
 */
async function login(opts) {
  opts = opts || {};
  const log = opts.log || console.log;
  const argv = opts.argv || [];
  const force = argv.indexOf("--force") !== -1;
  const noBrowser = argv.indexOf("--no-browser") !== -1;

  if (!force) {
    const existing = readCredentials();
    if (existing && existing.lumen && existing.lumen.refreshToken) {
      const l = Number(existing.lumen.expiresAt || 0) > Date.now() + 60000 ? existing.lumen : await refreshLumen().catch(() => null);
      if (l && l.accessToken) {
        log("Already signed in to Roxyon" + (l.email ? " as " + l.email : "") + ". (`lm login --force` signs in again, `lm logout` signs out.)");
        if (!hasScope(l.scope, "copilot")) log("This sign-in has no Copilot access yet; run `lm login --force`.");
        return l;
      }
    }
  }

  const prev = (readCredentials() || {}).lumen || {};
  // Reuse the registered client when its loopback port is free again; otherwise register for a new port.
  let srv = null;
  if (prev.clientId && prev.redirectUri) {
    const m = /^http:\/\/127\.0\.0\.1:(\d+)\/callback$/.exec(prev.redirectUri);
    if (m) { try { srv = await listen(Number(m[1])); } catch (e) { srv = null; } }
  }
  let clientId = prev.clientId;
  let redirectUri = prev.redirectUri;
  if (!srv) {
    srv = await listen(0);
    redirectUri = "http://127.0.0.1:" + srv.address().port + "/callback";
    clientId = null;
  }

  try {
    if (!clientId) clientId = await registerClient(redirectUri);

    const { verifier, challenge } = pkcePair();
    const state = b64url(crypto.randomBytes(16));
    const q = {
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: oauthResource(),
    };
    const url = consoleUrl() + "/oauth/authorize?" + Object.keys(q).map((k) => k + "=" + encodeURIComponent(q[k])).join("&");

    const codeP = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for the browser sign-in")), opts.timeoutMs || LOGIN_TIMEOUT_MS);
      srv.on("request", (req, res) => {
        const u = new URL(req.url, "http://127.0.0.1");
        if (u.pathname !== "/callback") { res.writeHead(404); res.end(); return; }
        const p = u.searchParams;
        if (p.get("state") !== state) {
          res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
          res.end(page("Sign-in failed", "This sign-in link does not match the one lm started. Run lm login again."));
          return;
        }
        clearTimeout(timer);
        if (p.get("error")) {
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(page("Not signed in", "Access was not granted (" + p.get("error") + "). You can close this tab."));
          reject(new Error("access was not granted (" + p.get("error") + ")"));
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(page("Signed in", "LumenJS is now connected to your Roxyon account. You can close this tab and go back to the terminal."));
        resolve(p.get("code"));
      });
    });

    log("Sign in to Roxyon (free; new accounts get $0.50 of Copilot credit).");
    const opener = opts.open || openBrowser;
    if (noBrowser || !opener(url)) log("Open this link in a browser on this computer:\n  " + url);
    else log("Opening your browser... If it did not open, use this link:\n  " + url);

    const code = await codeP;
    const tok = await postForm(consoleUrl() + "/oauth/token", {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
      resource: oauthResource(),
    });
    if (tok.status !== 200 || !tok.json.access_token) {
      throw new Error("token exchange failed (" + tok.status + " " + (tok.json.error_description || tok.json.error || "") + ")");
    }

    // Who is this (scope read).
    let userId = "", email = "";
    try {
      const me = await fetch(consoleUrl() + "/account/context", {
        headers: { authorization: "Bearer " + tok.json.access_token, "x-roxyon-client": clientHeader() },
      });
      const j = await me.json();
      const u = (j && (j.user || (j.data && j.data.user))) || {};
      userId = String(u.objectId || u.id || "");
      email = String(u.Email || u.email || "");
    } catch (e) { }

    const lumen = {
      accessToken: tok.json.access_token,
      refreshToken: tok.json.refresh_token,
      expiresAt: Date.now() + Number(tok.json.expires_in || 3600) * 1000,
      scope: tok.json.scope || "",
      clientId,
      redirectUri,
      userId,
      email,
      savedAt: new Date().toISOString(),
    };
    const creds = readCredentials() || {};
    creds.lumen = lumen;
    if (!creds.sessionToken || creds.kind === "pat") {
      // No `roxyon login` session here: let `roxyon` use this sign-in too (until its 1 h token expires).
      creds.sessionToken = lumen.accessToken;
      creds.kind = "pat";
      creds.userId = userId;
      creds.email = email;
      creds.savedAt = lumen.savedAt;
    }
    const where = writeCredentials(creds);
    log("Signed in" + (email ? " as " + email : "") + ". Saved to " + where + ".");
    if (!hasScope(lumen.scope, "copilot")) {
      log("Note: the Roxyon console did not grant the copilot scope (granted: " + (lumen.scope || "none") + "). Lumen Copilot will not work until it does.");
    } else {
      log("Lumen Copilot is on: run `lm serve` and open the Copilot button on the page.");
    }
    return lumen;
  } finally {
    try { srv.close(); } catch (e) { }
  }
}

async function loginCommand(argv) {
  try {
    const r = await login({ argv: argv || [] });
    if (!r) process.exitCode = 1;
  } catch (e) {
    console.log("lm login failed: " + e.message);
    process.exitCode = 1;
  }
}

async function logout() {
  const creds = readCredentials();
  if (!creds || !creds.lumen) {
    console.log("Not signed in with lm.");
    return;
  }
  for (const t of [creds.lumen.refreshToken, creds.lumen.accessToken]) {
    if (!t) continue;
    try { await postForm(consoleUrl() + "/oauth/revoke", { token: t }); } catch (e) { }
  }
  const keepClient = { clientId: creds.lumen.clientId, redirectUri: creds.lumen.redirectUri };
  if (creds.kind === "pat" && creds.sessionToken === creds.lumen.accessToken) {
    delete creds.sessionToken; delete creds.kind; delete creds.userId; delete creds.email; delete creds.savedAt;
  }
  creds.lumen = keepClient;
  writeCredentials(creds);
  console.log("Signed out.");
}

module.exports = {
  consoleUrl,
  credentialsPath,
  readCredentials,
  writeCredentials,
  getAuth,
  hasCredentials,
  storedPat,
  freshPat,
  login,
  loginCommand,
  logout,
  pkcePair,
  clientHeader,
  lmVersion,
  _refreshLumen: refreshLumen,
};
