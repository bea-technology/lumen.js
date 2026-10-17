// 2026-10-07: AI coding agents read AGENTS.md / CLAUDE.md from a project root. `lm create` seeds both and
// `lm update-core` adds them to older projects without touching a developer's own copy. `lm build` refuses a
// project runtime older than the CLI's HST version instead of shipping a broken site.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const fcs = require('../lib/fcs.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
const tpl = path.join(__dirname, '..', 'lib', 'files', 'project');
const agents = fs.readFileSync(path.join(tpl, 'AGENTS.md'), 'utf8');
check('the scaffold has AGENTS.md pointing at the reference', /https:\/\/lumenjs\.com\/llms\.txt/.test(agents) && /lm update-core/.test(agents));
check('the scaffold CLAUDE.md imports AGENTS.md', fs.readFileSync(path.join(tpl, 'CLAUDE.md'), 'utf8').trim() === '@AGENTS.md');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-agents-'));
fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'mine');
const log = console.log; console.log = () => {};
const added = fcs.addAgentFiles(root);
const again = fcs.addAgentFiles(root);
console.log = log;
check('missing AGENTS.md is added', added.join() === 'AGENTS.md' && fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8') === agents);
check("a developer's own CLAUDE.md is left alone", fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8') === 'mine');
check('a second run adds nothing', again.length === 0);

// lm build with an old runtime: exits non-zero, writes no dist/.
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-oldrt-'));
for (const d of ['src/js', 'src/views', 'src/tpls']) fs.mkdirSync(path.join(proj, d), { recursive: true });
fs.writeFileSync(path.join(proj, 'src/js/lm.js'), 'var EXPECTED_HST_FORMAT_VERSION=2;var _HST_FORMATS_ACCEPTED=[1, 2];');
fs.writeFileSync(path.join(proj, 'src/index.html'), '<html><body></body></html>');
fs.writeFileSync(path.join(proj, 'src/index.js'), '');
fs.writeFileSync(path.join(proj, 'config.json'), '{}');
const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'commands.js'), 'build'], { cwd: proj, encoding: 'utf8', timeout: 60000 });
const out = (res.stdout || '') + (res.stderr || '');
check('lm build refuses an older project runtime', res.status === 1 && /lm update-core/.test(out), 'status ' + res.status + ': ' + out.slice(-300));
check('and writes no dist/', !fs.existsSync(path.join(proj, 'dist')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
