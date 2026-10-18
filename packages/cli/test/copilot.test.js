// Lumen Copilot milestone 1 (2026-10-18): the dev-server guards, the panel injection, turn/apply/undo against a fake
// Roxyon console, `lm login` (OAuth PKCE loopback) against a fake authorization server, the vault token-path fix, and
// that nothing of Copilot reaches `lm build` output.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const CLI = path.join(__dirname, '..');
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-copilot-')));
const credsFile = path.join(tmp, 'roxyon', 'config.json');
process.env.LM_ROXYON_CONFIG = credsFile;
delete process.env.ROXYON_TOKEN;

const copilot = require('../lib/copilot/server.js');
const auth = require('../lib/copilot/auth.js');
const vault = require('../lib/vault.js');

function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex'); }

function makeProject(dir) {
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(path.join(CLI, 'lib', 'files', 'project'), dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'js'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src', 'css'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'css', 'styles.css'), 'body{margin:0}');
    fs.copyFileSync(path.join(CLI, 'lib', 'files', 'libs', 'lm.js'), path.join(dir, 'src', 'js', 'lm.js'));
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
    cfg.server = Object.assign({}, cfg.server, { host: '127.0.0.1', port: '0' });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg, null, 2));
    return dir;
}

function listenServer(handler) {
    return new Promise((resolve) => {
        const s = http.createServer(handler);
        s.listen(0, '127.0.0.1', () => resolve(s));
    });
}
function readBody(req) {
    return new Promise((resolve) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => resolve(b)); });
}
function request(port, method, p, headers, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: headers || {} }, (res) => {
            let b = ''; res.on('data', (c) => b += c);
            res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { } resolve({ status: res.statusCode, body: b, json: j, headers: res.headers }); });
        });
        req.on('error', reject);
        if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

async function main() {
    // ---- 1. path guard ----------------------------------------------------------------------------------------
    const proj = makeProject(path.join(tmp, 'proj'));
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(proj, 'src', 'escape'));
    const ok = (rel) => copilot.resolveEditPath(proj, rel);
    check('allows a new view under src/views', ok('src/views/pricing.view') === path.join(proj, 'src', 'views', 'pricing.view'));
    check('allows an existing layout and src/index.js', !!ok('src/layouts/main.layout') && !!ok('src/index.js'));
    const refused = ['../evil.view', 'src/../config.json', 'config.json', '/etc/passwd', 'src/.env', 'src/.env.local', 'src/keys.local',
        'src/node_modules/x.js', 'dist/index.html', 'src/dist/a.js', 'src/js/lm.js', 'src/views/a.exe', 'src\\views\\a.view',
        'src/escape/x.view', 'src//views/a.view', 'src/./views/a.view', 'index.js', 'src/views/.hidden.view', 'src/config.json'];
    const leaked = refused.filter((r) => ok(r) !== null);
    check('refuses paths outside src/, config, env, *.local, node_modules, dist, runtime, symlink escape', leaked.length === 0, 'allowed: ' + leaked.join(', '));

    // ---- 2. request guard -------------------------------------------------------------------------------------
    const T = 'a'.repeat(48);
    const req = (o) => ({ socket: { remoteAddress: o.remote || '127.0.0.1' }, headers: Object.assign({ host: '127.0.0.1:4100', origin: 'http://127.0.0.1:4100', 'x-lm-copilot': T }, o.h || {}) });
    check('a same-origin POST with the token passes', copilot.checkRequest(req({}), T, 4100, true) === null);
    check('wrong token is refused', copilot.checkRequest(req({ h: { 'x-lm-copilot': 'b'.repeat(48) } }), T, 4100, true) === 'bad token');
    check('another website (Origin) is refused', copilot.checkRequest(req({ h: { origin: 'https://evil.example' } }), T, 4100, true) === 'bad origin');
    check('a POST without Origin is refused', copilot.checkRequest(req({ h: { origin: undefined } }), T, 4100, true) === 'bad origin');
    check('a DNS-rebinding Host is refused', copilot.checkRequest(req({ h: { host: 'evil.example:4100', origin: 'http://evil.example:4100' } }), T, 4100, true) === 'bad host');
    check('another port on localhost is refused', copilot.checkRequest(req({ h: { host: '127.0.0.1:9999', origin: 'http://127.0.0.1:9999' } }), T, 4100, true) === 'bad host');
    check('a request from another machine is refused', copilot.checkRequest(req({ remote: '192.168.1.20' }), T, 4100, true) === 'not from this computer');
    check('a cross-site fetch (Sec-Fetch-Site) is refused', copilot.checkRequest(req({ h: { 'sec-fetch-site': 'cross-site' } }), T, 4100, true) === 'not same-origin');

    // ---- 3. diff + enable switch ------------------------------------------------------------------------------
    const d = copilot.unifiedDiff('a\nb\nc\n', 'a\nB\nc\n', 'src/x.view');
    check('unified diff shows the changed line', /\n-b\n\+B\n/.test(d) && d.indexOf('--- a/src/x.view') === 0);
    check('a new file diffs against /dev/null', copilot.unifiedDiff(null, 'x\n', 'src/n.view').indexOf('--- /dev/null') === 0);
    const env0 = Object.assign({}, process.env);
    process.env.LM_COPILOT = '0'; const off0 = copilot.isEnabled({});
    process.env.LM_COPILOT = '1'; const on1 = copilot.isEnabled({}); const offCfg = copilot.isEnabled({ copilot: false });
    delete process.env.LM_COPILOT; process.env.LM_COPILOT_AUTO = '0'; const offAuto = copilot.isEnabled({});
    delete process.env.LM_COPILOT_AUTO; process.env.CI = 'true'; const offCi = copilot.isEnabled({});
    process.env = env0;
    check('LM_COPILOT=0 / config "copilot": false / no TTY / CI turn it off; LM_COPILOT=1 turns it on', !off0 && on1 && !offCfg && !offAuto && !offCi);

    // ---- 4. lm login against a fake OAuth server ----------------------------------------------------------------
    const oauth = { challenge: null, codes: {}, refreshUsed: {}, registered: [], tokenCalls: [] };
    const fakeConsole = await listenServer(async (rq, rs) => {
        const u = new URL(rq.url, 'http://x');
        const send = (code, obj) => { rs.writeHead(code, { 'content-type': 'application/json' }); rs.end(JSON.stringify(obj)); };
        if (u.pathname === '/oauth/register') {
            const b = JSON.parse(await readBody(rq));
            oauth.registered.push(b);
            return send(201, { client_id: 'rxc_test', redirect_uris: b.redirect_uris, scope: b.scope });
        }
        if (u.pathname === '/oauth/authorize') {
            const q = u.searchParams;
            oauth.authorizeQuery = Object.fromEntries(q.entries());
            const code = 'code_' + crypto.randomBytes(4).toString('hex');
            oauth.codes[code] = q.get('code_challenge');
            rs.writeHead(302, { location: q.get('redirect_uri') + '?code=' + code + '&state=' + encodeURIComponent(q.get('state')) });
            return rs.end();
        }
        if (u.pathname === '/oauth/token') {
            const p = new URLSearchParams(await readBody(rq));
            oauth.tokenCalls.push(Object.fromEntries(p.entries()));
            if (p.get('grant_type') === 'authorization_code') {
                const cc = oauth.codes[p.get('code')];
                const want = crypto.createHash('sha256').update(p.get('code_verifier') || '').digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                if (!cc || cc !== want) return send(400, { error: 'invalid_grant' });
                return send(200, { access_token: 'roxp_' + 'a'.repeat(40), refresh_token: 'roxr_one', expires_in: 3600, scope: 'read deploy copilot' });
            }
            if (p.get('grant_type') === 'refresh_token') {
                if (oauth.refreshUsed[p.get('refresh_token')]) return send(400, { error: 'invalid_grant' });
                oauth.refreshUsed[p.get('refresh_token')] = 1;
                return send(200, { access_token: 'roxp_' + 'b'.repeat(40), refresh_token: 'roxr_two', expires_in: 3600, scope: 'read deploy copilot' });
            }
            return send(400, { error: 'unsupported_grant_type' });
        }
        if (u.pathname === '/account/context') {
            if (!/^Bearer roxp_/.test(rq.headers.authorization || '')) return send(401, { error: 'no' });
            return send(200, { ok: true, user: { objectId: 'U123', Email: 'dev@example.com' } });
        }
        if (u.pathname === '/oauth/revoke') return send(200, {});
        if (u.pathname === '/copilot/v1/turn') return fakeConsole.onTurn(rq, rs, send);
        send(404, {});
    });
    const consoleUrl = 'http://127.0.0.1:' + fakeConsole.address().port;
    process.env.ROXYON_CONSOLE_URL = consoleUrl;

    const logs = [];
    const lumen = await auth.login({
        argv: [], log: (m) => logs.push(m), timeoutMs: 10000,
        open: (url) => {
            // Play the browser: follow the authorize redirect to the CLI's loopback callback.
            http.get(url, (r) => { r.resume(); if (r.headers.location) http.get(r.headers.location, (r2) => r2.resume()); });
            return true;
        },
    });
    const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
    const q = oauth.authorizeQuery || {};
    check('lm login registers a public loopback client with the copilot scope', oauth.registered.length === 1 && /^http:\/\/127\.0\.0\.1:\d+\/callback$/.test(oauth.registered[0].redirect_uris[0]) && /copilot/.test(oauth.registered[0].scope) && oauth.registered[0].token_endpoint_auth_method === 'none');
    check('the authorize request uses PKCE S256, a state, and the console as resource', q.code_challenge_method === 'S256' && q.code_challenge && q.state && q.resource === 'https://console.roxyon.com' && /copilot/.test(q.scope));
    check('lm login stores the tokens in ~/.roxyon/config.json (lumen block + top-level when no roxyon session)',
        lumen && creds.lumen && creds.lumen.accessToken === 'roxp_' + 'a'.repeat(40) && creds.lumen.refreshToken === 'roxr_one' && creds.lumen.email === 'dev@example.com' && creds.kind === 'pat' && creds.sessionToken === creds.lumen.accessToken);
    check('the credentials file is private (0600)', process.platform === 'win32' || (fs.statSync(credsFile).mode & 0o777) === 0o600);
    check('vault: getStoredToken finds the lm login token (the old token-path bug)', vault.getStoredToken(proj) === 'roxp_' + 'a'.repeat(40));

    // A `roxyon login` session already there is never overwritten.
    fs.writeFileSync(credsFile, JSON.stringify({ sessionToken: 'r:session', userId: 'U1', email: 'x@y', savedAt: 'now', lumen: creds.lumen }));
    await auth.login({ argv: ['--force'], log: () => { }, timeoutMs: 10000, open: (url) => { http.get(url, (r) => { r.resume(); http.get(r.headers.location, (r2) => r2.resume()); }); return true; } });
    const c2 = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
    check("lm login keeps an existing `roxyon login` session and reuses the registered client", c2.sessionToken === 'r:session' && !c2.kind && c2.lumen.accessToken && oauth.registered.length === 1);

    // Refresh when expired.
    c2.lumen.expiresAt = Date.now() - 1000;
    fs.writeFileSync(credsFile, JSON.stringify(c2));
    const a1 = await auth.getAuth();
    const c3 = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
    check('an expired access token is refreshed once and the rotated refresh token saved', a1 && a1.headers.authorization === 'Bearer roxp_' + 'b'.repeat(40) && c3.lumen.refreshToken === 'roxr_two' && c3.sessionToken === 'r:session');

    // ---- 5. the dev server: injection, turn, apply, undo ----------------------------------------------------------
    const TOKEN = crypto.randomBytes(24).toString('hex');
    let lastTurn = null;
    let turnReply = null;
    fakeConsole.onTurn = async (rq, rs, send) => {
        lastTurn = { headers: rq.headers, body: JSON.parse(await readBody(rq)) };
        const r = turnReply(lastTurn.body);
        send(r[0], r[1]);
    };
    const child = spawn(process.execPath, [path.join(CLI, 'lib', 'app.js')], {
        cwd: proj,
        env: Object.assign({}, process.env, { LM_COPILOT: '1', LM_COPILOT_TOKEN: TOKEN, LM_ROXYON_CONFIG: credsFile, ROXYON_CONSOLE_URL: consoleUrl }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const port = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('dev server did not start: ' + out)), 20000);
        const on = (c) => { out += c; const m = /running at http:\/\/127\.0\.0\.1:(\d+)\//.exec(out); if (m) { clearTimeout(t); resolve(Number(m[1])); } };
        child.stdout.on('data', on); child.stderr.on('data', on);
    });
    try {
        const H = { host: '127.0.0.1:' + port, origin: 'http://127.0.0.1:' + port, 'x-lm-copilot': TOKEN, 'content-type': 'application/json' };
        const page = await request(port, 'GET', '/', { host: '127.0.0.1:' + port });
        check('lm serve injects the panel + per-run token right after <head>', /<head>\s*<script>window\.__lmCopilot=\{"t":"[0-9a-f]+"\};<\/script><script src="\/__lm\/copilot\.js"><\/script>/.test(page.body) && page.body.indexOf(TOKEN) !== -1);
        const foreign = await request(port, 'GET', '/', { host: 'evil.example:' + port });
        check('the token is not injected for a non-loopback Host (DNS rebinding)', foreign.body.indexOf(TOKEN) === -1);
        const js = await request(port, 'GET', '/__lm/copilot.js', { host: '127.0.0.1:' + port });
        check('the widget script is served and holds no token', js.status === 200 && /attachShadow/.test(js.body) && js.body.indexOf(TOKEN) === -1);

        const noTok = await request(port, 'POST', '/__lm/copilot/turn', Object.assign({}, H, { 'x-lm-copilot': '' }), { mode: 'create', prompt: 'x' });
        const badOrigin = await request(port, 'POST', '/__lm/copilot/turn', Object.assign({}, H, { origin: 'https://evil.example' }), { mode: 'create', prompt: 'x' });
        check('turn without the token / from another origin is refused (403)', noTok.status === 403 && badOrigin.status === 403 && lastTurn === null);

        turnReply = () => [200, { ok: true, text: 'Here is your view.', edits: [
            { path: 'src/views/pricing.view', content: '<div>Pricing</div>\n' },
            { path: '../evil.js', content: 'x' },
            { path: 'config.json', content: '{}' },
        ], usage: { model: 'deepseek-flash', chargeUSD: 0.0051, walletUSD: 0.49 } }];
        const t1 = await request(port, 'POST', '/__lm/copilot/turn', H, { mode: 'create', prompt: 'a pricing page', name: 'pricing' });
        check('turn calls the console with the PAT (never sent to the browser) and the lm client header',
            lastTurn && lastTurn.headers.authorization === 'Bearer roxp_' + 'b'.repeat(40) && /^lm\//.test(lastTurn.headers['x-roxyon-client']) && t1.body.indexOf('roxp_') === -1);
        const sent = lastTurn.body;
        const bytes = sent.files.reduce((n, f) => n + Buffer.byteLength(f.content), 0);
        check('turn sends the mode, prompt, project files (<= 60 KB, no runtime) and tree (<= 200)',
            sent.mode === 'create' && sent.prompt === 'a pricing page' && sent.files.some((f) => f.path === 'src/index.js') && bytes <= 60 * 1024 && !sent.files.some((f) => f.path === 'src/js/lm.js') && sent.tree.length > 0 && sent.tree.length <= 200);
        check('the answer keeps only allowed edits, with a diff and the price', t1.json && t1.json.ok && t1.json.edits.length === 1 && t1.json.edits[0].path === 'src/views/pricing.view' && t1.json.edits[0].isNew && /\+<div>Pricing<\/div>/.test(t1.json.edits[0].diff) && t1.json.dropped.length === 2 && t1.json.usage.chargeUSD === 0.0051);
        check('nothing is written before Apply', !fs.existsSync(path.join(proj, 'src', 'views', 'pricing.view')));

        const ap = await request(port, 'POST', '/__lm/copilot/apply', H, { id: t1.json.id });
        const written = path.join(proj, 'src', 'views', 'pricing.view');
        check('Apply writes the file and keeps an undo manifest in .lumen/copilot-undo', ap.json && ap.json.ok && fs.readFileSync(written, 'utf8') === '<div>Pricing</div>\n' && fs.existsSync(path.join(proj, '.lumen', 'copilot-undo', ap.json.applyId, 'manifest.json')));
        const again = await request(port, 'POST', '/__lm/copilot/apply', H, { id: t1.json.id });
        check('an answer can be applied once', again.status === 404);
        const un = await request(port, 'POST', '/__lm/copilot/undo', H, { applyId: ap.json.applyId });
        check('Undo removes a file Copilot created', un.json && un.json.ok && !fs.existsSync(written));

        // Edit an existing file, then change it on disk before Apply: nothing may be written.
        const homePath = path.join(proj, 'src', 'views', 'home.view');
        const homeBefore = fs.readFileSync(homePath, 'utf8');
        turnReply = () => [200, { ok: true, text: 'Fixed.', edits: [{ path: 'src/views/home.view', content: homeBefore + '\n<p>fixed</p>\n' }], usage: { chargeUSD: 0.004, walletUSD: 0.48 } }];
        const t2 = await request(port, 'POST', '/__lm/copilot/turn', H, { mode: 'explain', error: { message: 'script error in home: x is not defined', stack: '', route: '/' } });
        check('explain sends the error and the view on the route', lastTurn.body.mode === 'explain' && /x is not defined/.test(lastTurn.body.error.message) && lastTurn.body.files[0].path === 'src/views/home.view');
        fs.writeFileSync(homePath, homeBefore + '\n<!-- edited by the developer -->\n');
        const stale = await request(port, 'POST', '/__lm/copilot/apply', H, { id: t2.json.id });
        check('Apply refuses a file that changed since the answer (409) and writes nothing', stale.status === 409 && /changed since/.test(stale.json.error) && /edited by the developer/.test(fs.readFileSync(homePath, 'utf8')));

        // Apply + undo an edit of an existing file.
        fs.writeFileSync(homePath, homeBefore);
        const t3 = await request(port, 'POST', '/__lm/copilot/turn', H, { mode: 'explain', error: { message: 'boom', route: '/' } });
        const ap3 = await request(port, 'POST', '/__lm/copilot/apply', H, { id: t3.json.id });
        const afterApply = fs.readFileSync(homePath, 'utf8');
        const un3 = await request(port, 'POST', '/__lm/copilot/undo', H, { applyId: ap3.json.applyId });
        check('Apply then Undo of an existing file restores it byte for byte', ap3.json.ok && /<p>fixed<\/p>/.test(afterApply) && un3.json.ok && fs.readFileSync(homePath, 'utf8') === homeBefore);

        turnReply = () => [402, { ok: false, code: 'insufficient_funds', error: 'Your Roxyon wallet is empty.', topupUrl: 'https://console.roxyon.com/account/billing?topup=1' }];
        const t4 = await request(port, 'POST', '/__lm/copilot/turn', H, { mode: 'create', prompt: 'x' });
        check('an empty wallet comes back as an add-funds answer with the top-up link', t4.json && !t4.json.ok && /topup=1/.test(t4.json.topup));

        // Signed out: no panel, and a turn says to sign in.
        fs.unlinkSync(credsFile);
        const page2 = await request(port, 'GET', '/', { host: '127.0.0.1:' + port });
        const t5 = await request(port, 'POST', '/__lm/copilot/turn', H, { mode: 'create', prompt: 'x' });
        check('signed out: no panel is injected and a turn asks for `lm login`', page2.body.indexOf('__lmCopilot') === -1 && t5.json && t5.json.signin === true);
    } finally {
        child.kill();
        fakeConsole.close();
    }

    // ---- 6. lm build output has no Copilot ---------------------------------------------------------------------------
    fs.writeFileSync(credsFile, JSON.stringify({ lumen: { accessToken: 'roxp_' + 'c'.repeat(40), refreshToken: 'r', expiresAt: Date.now() + 3600e3 } }));
    fs.unlinkSync(path.join(proj, 'src', 'escape'));
    const b = spawnSync(process.execPath, [path.join(CLI, 'bin', 'commands.js'), 'build'], {
        cwd: proj, encoding: 'utf8', timeout: 120000,
        env: Object.assign({}, process.env, { LM_COPILOT: '1', LM_ROXYON_CONFIG: credsFile }),
    });
    const dist = path.join(proj, 'dist');
    const hits = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (/__lm\/copilot|__lmCopilot|Lumen Copilot|x-lm-copilot/.test(fs.readFileSync(p, 'latin1'))) hits.push(path.relative(dist, p));
        }
    })(fs.existsSync(dist) ? dist : tmp + '/none');
    check('lm build (signed in, LM_COPILOT=1) produced dist/ with no Copilot code in it', b.status === 0 && fs.existsSync(path.join(dist, 'index.html')) && hits.length === 0, 'status ' + b.status + ' hits ' + hits.join(','));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.log('FAIL  copilot test crashed — ' + (e && e.stack)); process.exit(1); });
