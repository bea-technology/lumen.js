#!/usr/bin/env node
// cdn/ inside the published @lmjs/core (D-20261029-03): jsDelivr serves it at
// https://cdn.jsdelivr.net/npm/@lmjs/core@<version>/cdn/lm.js the moment the version is public, and `lm build` of the
// same @lmjs/cli version loads it with an SRI hash. The files are made from the CLI's own runtime seed
// (packages/cli/lib/files/libs/lm.js), byte for byte what the CLI hashes, and the two packages must have the same version.
const fs = require("fs");
const path = require("path");
const rt = require("../../cli/lib/cdn-runtime.js");

const core = require("../package.json");
const cli = require("../../cli/package.json");
if (core.version !== cli.version) {
  console.error("@lmjs/core " + core.version + " and @lmjs/cli " + cli.version + " differ: the CLI would load a runtime that is not in this package.");
  process.exit(1);
}
const out = path.join(__dirname, "..", "cdn");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const files = rt.runtimeFiles();
const integrity = {};
for (const name of Object.keys(files)) {
  fs.writeFileSync(path.join(out, name), files[name]);
  integrity[name] = rt.sri(files[name]);
}
fs.writeFileSync(path.join(out, "integrity.json"), JSON.stringify({ version: core.version, files: integrity }, null, 2) + "\n");
console.log("cdn/ for " + rt.jsdelivrBase(core.version));
for (const n of Object.keys(integrity)) console.log("  " + n + "  " + integrity[n]);
