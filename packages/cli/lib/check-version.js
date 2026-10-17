#!/usr/bin/env node
const semver = require('semver');
const m = process.version.match(/(\d+)\.(\d+)\.(\d+)/);
// 2026-09-16: bumped from >=12 to >=18 — esbuild (npm-in-project support,
// see npm-bundle.js) doesn't run on anything older, and an outdated Node
// passing this check only to fail confusingly later at the esbuild step is
// worse than failing clearly here.
if (!semver.satisfies(m[0].toString(), '>=18')) {
    console.log("Node version should be minimum 18.0.0");
    process.exit(1);
}
// 2026-09-14: this used to also unconditionally fetch
// https://lmjs.beacdn.com/latest (V1's CDN, not even a V2 endpoint) on every
// `npm install` via postinstall, and overwrite lib/files/libs/lm.js with
// whatever came back — no validation that the response was actually JS, no
// check the request even succeeded. In an environment where that host isn't
// cleanly reachable, this silently overwrote the real bundled runtime with
// an HTML error page while logging "Successfully Purged!". Confirmed by
// hitting it directly while promoting this package. Removed rather than
// patched: there's no real V2 CDN endpoint to fetch from yet (see
// PROVENANCE.md), so there's nothing correct for this to do right now.
// `lm purge` (lib/fcs.js) has the same unconditional-overwrite shape and
// needs the same fix before it's safe to use.