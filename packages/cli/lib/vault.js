// LumenJS vault ("lm login" + "lm api set/get/update/list/remove",
// 2026-09-17) — lets a project register third-party API credentials
// (Stripe keys, Firebase config, anything a developer wants proxied
// through the existing config.json `apis[]` -> /1/beajs -> _beaTn -> WS
// `uniquer` runtime path, see ws.js) WITHOUT ever writing the raw secret
// to a local file. Secrets live server-side, in one shared Roxyon-owned
// BaaS app's /Secrets class, reached via the new /1/_lumen_secrets/*
// route (libs/BEA_API_VZ_8.4.php, app-x/baas). Authenticated by a
// Personal Access Token ("roxp_...") — the exact same ROXYON_TOKEN the
// `roxyon` CLI already uses for `roxyon deploy`/`roxyon env`, per the
// project's own `.roxyon-token.local` convention. OTP only ever happens
// once, at the moment that PAT is minted (via `roxyon login`) — this
// file deliberately does NOT reimplement that login/OTP flow itself: it
// requires real email+password (+ a device-recognition OTP step-up) and
// mints via a session-token-gated Console endpoint, exactly what
// `roxyon login` already does. Every vault action here authenticates
// with the PAT alone, no re-verification per call — see the plan's
// "Context" section for why (an AI agent driving `lm api set` has no
// inbox to check on every call).
// 2026-10-18: `lm login` no longer shells out to `roxyon login`; it is its
// own OAuth sign-in (lib/copilot/auth.js) and the token is read from
// ~/.roxyon/config.json as well.
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const fetch = require("node-fetch");

const LUMEN_SECRETS_BASE = "https://www.beaapis.com/1/_lumen_secrets";
const TOKEN_FILE_NAME = ".roxyon-token.local";
const VAULT_FILE_NAME = ".lumen-vault.local";

function tokenFilePath(projectRoot) {
  return path.join(projectRoot, TOKEN_FILE_NAME);
}

function vaultFilePath(projectRoot) {
  return path.join(projectRoot, VAULT_FILE_NAME);
}

// Env var first, then the gitignored project-local file (the `roxyon` CLI's PAT convention), then the sign-in stored
// in ~/.roxyon/config.json by `lm login` (or a PAT `roxyon` stored there).
// 2026-10-18 fix: this used to stop after the project file, and `lm login` shelled out to `roxyon login`, which only
// ever writes ~/.roxyon/config.json, so `lm login` could never find the token it had just created.
function getStoredToken(projectRoot) {
  if (process.env.ROXYON_TOKEN) return process.env.ROXYON_TOKEN.trim();
  const p = tokenFilePath(projectRoot);
  if (fs.existsSync(p)) {
    const t = fs.readFileSync(p, "utf8").trim();
    if (t) return t;
  }
  return _auth().storedPat();
}

// Same, but refreshes an expired `lm login` access token first (they last 1 h).
async function getToken(projectRoot) {
  const t = getStoredToken(projectRoot);
  if (t) return t;
  return _auth().freshPat();
}

function _auth() {
  return require(path.join(__dirname, "copilot", "auth.js"));
}

async function login() {
  const projectRoot = process.cwd();
  const existing = await getToken(projectRoot);
  if (existing) return existing;
  console.log("Not signed in to Roxyon yet. Starting `lm login`...");
  try {
    await _auth().login({ argv: process.argv.slice(3) });
  } catch (e) {
    console.log("lm login failed: " + e.message);
    return null;
  }
  const after = await getToken(projectRoot);
  if (!after) console.log("Sign-in did not complete. Run `lm login` and try again.");
  return after;
}
exports.login = login;
exports.getStoredToken = getStoredToken;

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function promptHeaders() {
  const headers = {};
  console.log("Enter headers one at a time as `Name: value` (blank line to finish):");
  for (;;) {
    const line = (await prompt("  header: ")).trim();
    if (line === "") break;
    const idx = line.indexOf(":");
    if (idx === -1) {
      console.log("  (expected `Name: value`, skipped)");
      continue;
    }
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return headers;
}

async function lumenSecretsCall(pathSeg, method, token, body, query) {
  let url = LUMEN_SECRETS_BASE + "/" + pathSeg;
  if (query) {
    const qs = Object.keys(query).map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(query[k])).join("&");
    if (qs) url += "?" + qs;
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "non-JSON response: " + text.slice(0, 200) };
  }
}

function readVaultFile(projectRoot) {
  const p = vaultFilePath(projectRoot);
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeVaultFile(projectRoot, entries) {
  fs.writeFileSync(vaultFilePath(projectRoot), JSON.stringify(entries, null, 2) + "\n");
}

async function apiSet(name) {
  const projectRoot = process.cwd();
  const token = await login();
  if (!token) return;
  if (!name) {
    name = (await prompt("name: ")).trim();
    if (!name) return console.log("A name is required.");
  }
  const url = (await prompt("url: ")).trim();
  const headers = await promptHeaders();
  const service = (await prompt("service (optional, e.g. \"stripe\"): ")).trim();
  const notes = (await prompt("notes (optional): ")).trim();

  const r = await lumenSecretsCall("set", "POST", token, {
    name,
    service,
    label: name,
    value: JSON.stringify({ url, headers }),
    notes,
  });
  if (!r.ok) {
    console.log("Failed: " + (r.error || "unknown error"));
    return;
  }
  const entries = readVaultFile(projectRoot).filter((e) => e.name !== name);
  entries.push({ name, objectId: r.objectId });
  writeVaultFile(projectRoot, entries);
  console.log(`Saved "${name}" to the vault (api_index ${entries.length - 1}). Nothing sensitive was written to config.json.`);
}
exports.apiSet = apiSet;

async function apiUpdate(name) {
  const projectRoot = process.cwd();
  const token = await login();
  if (!token) return;
  if (!name) {
    name = (await prompt("name: ")).trim();
  }
  const entries = readVaultFile(projectRoot);
  const entry = entries.find((e) => e.name === name);
  if (!entry) {
    console.log(`No vault entry named "${name}" in this project.`);
    return;
  }
  const url = (await prompt("new url (blank to keep current): ")).trim();
  const changeHeaders = (await prompt("update headers? (y/N): ")).trim().toLowerCase() === "y";
  const headers = changeHeaders ? await promptHeaders() : undefined;
  if (!url && !changeHeaders) {
    console.log("Nothing to update.");
    return;
  }
  // Need the current value to merge a partial change — resolve first.
  const current = await lumenSecretsCall("resolve", "GET", token, null, { id: entry.objectId });
  if (!current.ok) {
    console.log("Could not read the current value: " + (current.error || "unknown error"));
    return;
  }
  let currentParsed;
  try {
    currentParsed = JSON.parse(current.value);
  } catch (e) {
    currentParsed = { url: "", headers: {} };
  }
  const merged = {
    url: url || currentParsed.url,
    headers: headers || currentParsed.headers,
  };
  const r = await lumenSecretsCall("update", "POST", token, {
    objectId: entry.objectId,
    value: JSON.stringify(merged),
  });
  console.log(r.ok ? `Updated "${name}".` : "Failed: " + (r.error || "unknown error"));
}
exports.apiUpdate = apiUpdate;

async function apiGet(name) {
  const projectRoot = process.cwd();
  const token = await login();
  if (!token) return;
  if (!name) name = (await prompt("name: ")).trim();
  const entries = readVaultFile(projectRoot);
  const entry = entries.find((e) => e.name === name);
  if (!entry) {
    console.log(`No vault entry named "${name}" in this project.`);
    return;
  }
  const r = await lumenSecretsCall("resolve", "GET", token, null, { id: entry.objectId });
  if (!r.ok) {
    console.log("Failed: " + (r.error || "unknown error"));
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(r.value);
  } catch (e) {
    parsed = { url: r.value, headers: {} };
  }
  console.log(JSON.stringify({ name, url: parsed.url, headers: parsed.headers }, null, 2));
}
exports.apiGet = apiGet;

async function apiList() {
  const projectRoot = process.cwd();
  const token = await login();
  if (!token) return;
  const entries = readVaultFile(projectRoot);
  if (entries.length === 0) {
    console.log("No vault-managed APIs in this project yet — try `lm api set`.");
    return;
  }
  entries.forEach((e, i) => console.log(`${i}: ${e.name}  (${e.objectId})`));
}
exports.apiList = apiList;

async function apiRemove(name) {
  const projectRoot = process.cwd();
  const token = await login();
  if (!token) return;
  if (!name) name = (await prompt("name: ")).trim();
  const entries = readVaultFile(projectRoot);
  const entry = entries.find((e) => e.name === name);
  if (!entry) {
    console.log(`No vault entry named "${name}" in this project.`);
    return;
  }
  const r = await lumenSecretsCall("remove", "POST", token, { objectId: entry.objectId });
  if (!r.ok) {
    console.log("Failed: " + (r.error || "unknown error"));
    return;
  }
  writeVaultFile(projectRoot, entries.filter((e) => e.name !== name));
  console.log(`Removed "${name}".`);
}
exports.apiRemove = apiRemove;

// Called from _bp()/app.js at build/serve time — resolves every vault
// entry into the same {baseURL, headers} shape config.json's own apis[]
// entries already use, in file order (array position = api_index,
// matching API.get(..., api_index)'s existing addressing). In-memory
// only, never written back to disk. Returns [] (not a throw) on any
// failure — a build should degrade to config.json's own apis[] rather
// than hard-fail because the vault was briefly unreachable, matching
// this codebase's established "degrade gracefully, log clearly" pattern.
async function resolveVaultApis(projectRoot) {
  const entries = readVaultFile(projectRoot);
  if (entries.length === 0) return [];
  const token = await getToken(projectRoot);
  if (!token) {
    console.log("Vault entries exist but no ROXYON_TOKEN is available — run `lm login`. Skipping vault-managed APIs for this build.");
    return [];
  }
  const resolved = [];
  for (const entry of entries) {
    try {
      const r = await lumenSecretsCall("resolve", "GET", token, null, { id: entry.objectId });
      if (!r.ok) {
        console.log(`Could not resolve vault entry "${entry.name}": ${r.error || "unknown error"} — skipping it for this build.`);
        continue;
      }
      const parsed = JSON.parse(r.value);
      resolved.push({ baseURL: parsed.url, headers: parsed.headers });
    } catch (e) {
      console.log(`Could not resolve vault entry "${entry.name}": ${e.message} — skipping it for this build.`);
    }
  }
  return resolved;
}
exports.resolveVaultApis = resolveVaultApis;
