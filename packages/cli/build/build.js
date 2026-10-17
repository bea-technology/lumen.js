#!/usr/bin/env node
// packages/cli's own build step (2026-09-16) — didn't exist before today;
// lib/ and bin/ shipped to npm completely unmodified. This repo's own
// source comments are deliberately detailed (the record of every real
// bug found across this whole session, sometimes dated and referencing
// internal systems like console.roxyon.com) — genuinely valuable for
// maintaining this repo, not appropriate to ship verbatim in a published
// npm package. Copies bin/ + lib/ into dist/ (gitignored, matching
// packages/core's own dist/ convention), stripping comments from every
// .js file along the way and copying everything else (project scaffold
// templates — .view/.layout/.html/.json/.css/.gitignore, the cached
// packages/core bundle copies under lib/files/libs/) byte-for-byte
// unchanged. package.json's "files"/"bin" point at dist/ instead of
// bin/+lib/ directly — see that file.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');

// Same approach as packages/core/build/bundle.js's own stripComments():
// esbuild's default transform doesn't reliably strip EVERY comment (one
// attached directly to a class method survives regardless of the
// legalComments setting — esbuild's printer treats it like retained
// method documentation, confirmed empirically there). minifyWhitespace
// does remove it reliably; minifyIdentifiers/minifySyntax stay off so
// real names/control flow stay exactly as written, for anyone debugging
// an installed @lmjs/cli — only formatting and comments are stripped,
// not a real minification pass.
function stripComments(src) {
    return esbuild.transformSync(src, {
        loader: 'js',
        minifyWhitespace: true,
        minifyIdentifiers: false,
        minifySyntax: false,
    }).code;
}

// 2026-09-26: lib/files/libs/ holds already-built packages/core bundles
// (lm.js), not this package's own source. The header above always said those
// were copied byte-for-byte, but copyTree() matched every .js and ran them
// through stripComments() too. Re-printing an already-built bundle through
// esbuild triggers its collision-avoidance renaming even with
// minifyIdentifiers:false -- the published lm.js had `toArray(x2)` where
// core's dist has `toArray(x)`, 872 renamed identifiers against core's 346,
// core's own provenance header stripped, and ~4KB ADDED rather than removed.
// That is the "published bundle has renamed variables that our build scripts
// explicitly disable" discrepancy flagged as unexplained on 2026-09-21. These
// files are already comment-stripped by packages/core's own build, so there
// is nothing to strip and every reason to ship exactly what was tested.
function isPrebuiltBundle(srcPath) {
    return path.relative(ROOT, srcPath).split(path.sep).join('/').startsWith('lib/files/libs/');
}

function copyTree(srcDir, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            copyTree(srcPath, destPath);
        } else if (entry.name.endsWith('.js') && !isPrebuiltBundle(srcPath)) {
            const src = fs.readFileSync(srcPath, 'utf8');
            fs.writeFileSync(destPath, stripComments(src));
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
copyTree(path.join(ROOT, 'bin'), path.join(OUT_DIR, 'bin'));
copyTree(path.join(ROOT, 'lib'), path.join(OUT_DIR, 'lib'));

// commands.js's shebang line must stay first-byte-of-file for npm's own
// bin-linking (chmod +x symlink) to work — confirm stripComments()
// preserved it rather than assume.
const commandsPath = path.join(OUT_DIR, 'bin', 'commands.js');
const commandsContent = fs.readFileSync(commandsPath, 'utf8');
if (!commandsContent.startsWith('#!/usr/bin/env node')) {
    throw new Error('build.js: bin/commands.js lost its shebang line during comment-stripping — fix before publishing.');
}
fs.chmodSync(commandsPath, 0o755);

console.log('Wrote ' + OUT_DIR + ' (bin/ + lib/, comments stripped)');
