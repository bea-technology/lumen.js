#!/usr/bin/env node
// Builds the in-browser view compiler (2026-10-07): lib/hst.js — the exact parser `lm build` / `lm serve` use —
// bundled for the browser as `window.LumenCompiler`. lumenjs.com's playground compiles a visitor's .view with it
// and renders the result with the full (dev) runtime, which still parses view <script>s itself.
//   node build/browser-compiler.js [outFile]   (default: dist/browser/lumenjs-compiler.js)
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist', 'browser', 'lumenjs-compiler.js'));
const entry = `
var h = require(${JSON.stringify(path.join(__dirname, '..', 'lib', 'hst.js'))});
module.exports = {
  // { hst, reactiveVars } for one .view/.tpl source — the same object getAllFiles() stores per file.
  compile: function (source) { return h._hst(String(source)); },
  // Same as compile(), plus the widget regions a layout declares (what lm build adds to every layout).
  compileLayout: function (source) { var o = {}; o.l = h._hst(String(source)); h.annotateLayoutRegions(o); return o.l; },
  hstFormatVersion: 2
};`;
fs.mkdirSync(path.dirname(out), { recursive: true });
esbuild.buildSync({
  stdin: { contents: entry, resolveDir: path.join(__dirname, '..'), sourcefile: 'lumenjs-compiler-entry.js' },
  bundle: true, platform: 'browser', format: 'iife', globalName: 'LumenCompiler', minify: true,
  legalComments: 'none', outfile: out, target: ['es2019'],
});
console.log('Wrote ' + out + ' (' + fs.statSync(out).size + ' bytes)');
