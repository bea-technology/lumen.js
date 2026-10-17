// Runs every *.test.js in this directory as a child process (each test file
// prints its own PASS/FAIL lines and exits non-zero on failure) and
// aggregates the exit codes. Mirrors packages/core/test/run.js's exact
// convention — kept deliberately simple, no test framework dependency.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort();

let failed = false;
for (const file of files) {
    console.log(`\n--- ${file} ---`);
    const res = spawnSync(process.execPath, [path.join(dir, file)], { stdio: 'inherit' });
    if (res.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
