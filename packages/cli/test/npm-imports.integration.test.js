// Integration test: npm-in-project support (2026-09-16) — a project's own
// index.js / src/js/*.js files can `import` a real npm dependency, resolved
// via esbuild, while staying compatible with the existing, UNCHANGED
// reactive-var rewrite (compileProjectScript()/walk.js in packages/core).
// See npm-bundle.js's own header comment for the full "why not just
// esbuild-bundle the whole file" story — this test is the permanent
// regression guard for exactly the two failure modes found and fixed
// while designing this: dependency-internal names leaking into
// _vt.Global.vars, and the developer's own vars getting tree-shaken away
// because nothing in the SAME file references them (the real-world case:
// only a view template, invisible to esbuild, reads them).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const fcs = require('../lib/fcs.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// create()/_bp() are async off dns.resolve()/an ora() dynamic import — a
// blocking execSync('sleep N') freezes the whole JS thread (spawnSync
// under the hood), which does NOT let those pending callbacks run; a real
// awaited setTimeout does.
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function main() {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lumenjs-npm-imports-'));

    try {
        // --- 1. hasOwnDependencies() ---
        const noDepsProj = path.join(tmpRoot, 'no-deps');
        fs.mkdirSync(noDepsProj);
        fs.writeFileSync(path.join(noDepsProj, 'package.json'), JSON.stringify({ name: 'x', dependencies: {} }));
        check('hasOwnDependencies() is false for empty dependencies', fcs.hasOwnDependencies(noDepsProj) === false);
        check('hasOwnDependencies() is false when package.json is missing entirely', fcs.hasOwnDependencies(path.join(tmpRoot, 'does-not-exist')) === false);

        const withDepsProj = path.join(tmpRoot, 'with-deps');
        fs.mkdirSync(withDepsProj);
        fs.writeFileSync(path.join(withDepsProj, 'package.json'), JSON.stringify({ name: 'x', dependencies: { nanoid: '^5.0.0' } }));
        check('hasOwnDependencies() is true when dependencies is non-empty', fcs.hasOwnDependencies(withDepsProj) === true);

        check('hasOwnDependencies() never throws on malformed package.json', (() => {
            const badProj = path.join(tmpRoot, 'malformed');
            fs.mkdirSync(badProj);
            fs.writeFileSync(path.join(badProj, 'package.json'), '{ not valid json');
            try { return fcs.hasOwnDependencies(badProj) === false; } catch (e) { return false; }
        })());

        // --- 2. real end-to-end: scaffold a project, add a real npm dependency, build it ---
        const projName = 'npmimporttest';
        const projPath = path.join(tmpRoot, projName);
        fs.mkdirSync(projPath);
        process.chdir(projPath);
        fcs.create({ type: 'p', name: [projName] });
        await sleep(2000);

        check('scaffolded project has a package.json', fs.existsSync(path.join(projPath, 'package.json')));

        const pkg = JSON.parse(fs.readFileSync(path.join(projPath, 'package.json'), 'utf8'));
        pkg.dependencies = { nanoid: '^5.0.0' };
        fs.writeFileSync(path.join(projPath, 'package.json'), JSON.stringify(pkg, null, 2));
        execSync('npm install --no-audit --no-fund', { cwd: projPath, stdio: 'pipe' });

        fs.writeFileSync(
            path.join(projPath, 'src', 'index.js'),
            `import { nanoid } from 'nanoid';\nvar id = nanoid();\nvar appName = "npm-import-test";\n\nReactor({\n    "App": "[app]",\n    "defaultView": "home",\n    "init": function(){},\n    "tick": function(){},\n    "auth": function(){ return false; }\n});\n`
        );

        // --- 2a. buildEntryWithImports() directly against the real file ---
        const bundled = fcs.buildEntryWithImports(path.join(projPath, 'src', 'index.js'), projPath);
        check('bundled output has no import/export syntax left (parseable as sourceType:"script")', (() => {
            try { require('acorn').parse(bundled, { ecmaVersion: 'latest', sourceType: 'script' }); return true; }
            catch (e) { return false; }
        })());
        const compiled = fcs.compileProjectScript(bundled, 'index');
        check('developer\'s own top-level var became reactive (_vt.Global.vars["id"])', compiled.includes('_vt.Global.vars["id"]'), compiled.slice(0, 300));
        check('developer\'s own second top-level var also became reactive (_vt.Global.vars["appName"])', compiled.includes('_vt.Global.vars["appName"]'));
        check('nanoid\'s real source actually got resolved and included (not a stub)', /urlAlphabet|customAlphabet|getRandomValues/.test(compiled));
        check('nanoid\'s own internal top-level names did NOT leak into _vt.Global.vars (no cross-package collision)', !/_vt\.Global\.vars\["urlAlphabet"\]/.test(compiled) && !/_vt\.Global\.vars\["customRandom"\]/.test(compiled));

        // --- 2b. full real lm build (_bp()), mocked network call, matching this session's established safe-testing pattern ---
        fcs.API.post = async () => ({ token: 'FAKE_TOKEN_FOR_NPM_IMPORTS_TEST' });
        fcs.processCommand('build');
        await sleep(3000);

        const distJsDir = path.join(projPath, 'dist', 'js');
        check('lm build produced a dist/js output', fs.existsSync(distJsDir) && fs.readdirSync(distJsDir).some((f) => f.startsWith('app.')));
        if (fs.existsSync(distJsDir)) {
            const bundleFile = fs.readdirSync(distJsDir).find((f) => f.startsWith('app.'));
            if (bundleFile) {
                const bundleContent = fs.readFileSync(path.join(distJsDir, bundleFile), 'utf8');
                check('real lm build output contains the reactive-rewritten id var', bundleContent.includes('_vt.Global.vars["id"]'));
                check('real lm build output contains the reactive-rewritten appName var', bundleContent.includes('_vt.Global.vars["appName"]'));
                check('real lm build output does not leak nanoid internals into _vt.Global.vars', !/_vt\.Global\.vars\["urlAlphabet"\]/.test(bundleContent));
                try { require('child_process').execFileSync(process.execPath, ['--check', path.join(distJsDir, bundleFile)]); check('real lm build output is syntactically valid JS', true); }
                catch (e) { check('real lm build output is syntactically valid JS', false, e.message); }
            }
        }

        // --- 3. zero-cost guarantee: a project with no deps produces unchanged (raw-passthrough) compiled output ---
        const plainProjName = 'plainnodeps';
        const plainProjPath = path.join(tmpRoot, plainProjName);
        fs.mkdirSync(plainProjPath);
        process.chdir(plainProjPath);
        fcs.create({ type: 'p', name: [plainProjName] });
        await sleep(2000);
        // 2026-09-19: the scaffold's own default package.json now legitimately
        // declares @iconify/iconify (so a fresh `lm create` gets working
        // icons out of the box — see fcs.create()'s own default-icons fix) —
        // so create()'s raw output is no longer itself an empty-deps project.
        // This check's actual intent is "a project with NO selected npm
        // imports never invokes the esbuild path," which still needs
        // covering on its own merits; construct that case explicitly rather
        // than relying on the scaffold's default happening to be empty.
        fs.writeFileSync(path.join(plainProjPath, 'package.json'), JSON.stringify({ name: plainProjName, version: '0.0.0', private: true, dependencies: {} }, null, 4));
        check('a project with empty dependencies never invokes the esbuild path (hasOwnDependencies is false)', fcs.hasOwnDependencies(plainProjPath) === false);
        const rawIndexJs = fs.readFileSync(path.join(plainProjPath, 'src', 'index.js'), 'utf8');
        const rawCompiled = fcs.compileProjectScript(rawIndexJs, 'index');
        check('raw (no-deps) project\'s index.js still compiles correctly, unaffected by this feature', rawCompiled.includes('Reactor('));
    } finally {
        process.chdir(os.tmpdir());
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}

main();
