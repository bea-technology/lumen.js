// Built-in "a new version is available — Reload" (ported from console.roxyon.com). The page reads its own build
// stamp from <script src="/js/app.<ms>.js">, fetches a fresh index.html and compares stamps. Served over a real
// local HTTP server so document.currentScript.src and fetch() behave as in a built site.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const BUILD = 1790000000000;
// The server runs in its own process: on boot the runtime loads /index.js with a synchronous XHR, which jsdom
// performs by blocking this process on a child request — an in-process server could never answer it.
const { spawn } = require('child_process');
const serverSrc = `
const http = require('http'); const fs = require('fs');
const bundle = fs.readFileSync(process.argv[1], 'utf8'); let deployed = ${BUILD};
const page = (s) => '<!doctype html><html><head></head><body><div app></div><script src="/js/app.' + s + '.js"></script></body></html>';
http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/__deploy') { deployed = Number(req.url.split('=')[1]); res.writeHead(200); return res.end('ok'); }
  if (/^\\/js\\/(app\\.\\d+|lm)\\.js$/.test(u)) { res.writeHead(200, { 'content-type': 'application/javascript' }); return res.end(bundle); }
  if (u === '/dev') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><body><div app></div><script src="/js/lm.js"></script></body>'); }
  if (u === '/index.js') { res.writeHead(404); return res.end(''); }
  res.writeHead(200, { 'content-type': 'text/html' }); res.end(page(deployed));
}).listen(0, '127.0.0.1', function () { process.stdout.write(String(this.address().port) + '\\n'); });
`;
const bundlePath = process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js');
const child = spawn(process.execPath, ['-e', serverSrc, bundlePath], { stdio: ['ignore', 'pipe', 'inherit'] });
const portReady = new Promise((resolve) => child.stdout.once('data', (d) => resolve(Number(String(d).trim()))));
const deploy = (base, stamp) => fetch(base + '/__deploy?s=' + stamp).then((r) => r.text());

const results = [];
function check(name, cond, detail) { results.push({ name, cond: !!cond, detail }); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function open(url, settings) {
    return JSDOM.fromURL(url, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
            window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
            window.fetch = (u, o) => fetch(new URL(u, url).href, o).then((r) => ({ ok: r.ok, text: () => r.text() }));
        } }).then(async (d) => {
        for (let i = 0; i < 100 && typeof d.window.lmCheckForUpdate !== 'function'; i++) await wait(30);
        d.window.eval('appSettings = ' + (settings || '{}') + ';');
        return d;
    });
}

portReady.then(async (port) => {
    const base = 'http://127.0.0.1:' + port;
    try {
        let d = await open(base + '/');
        const w = d.window;
        check('LM_BUILD is read from the page\'s own /js/app.<stamp>.js', w.eval('LM_BUILD') === BUILD, String(w.eval('LM_BUILD')));
        check('LM_VERSION is the UTC build time', /^\d{4}\.\d\d\.\d\d\.\d{4}$/.test(w.eval('LM_VERSION')), w.eval('LM_VERSION'));
        check('no update yet: lmCheckForUpdate() resolves false and shows nothing', (await w.eval('lmCheckForUpdate()')) === false && !w.document.querySelector('.lm-update-bar'));
        await deploy(base, BUILD + 60000);
        check('after a deploy: lmCheckForUpdate() resolves true', (await w.eval('lmCheckForUpdate()')) === true);
        const bar = w.document.querySelector('.lm-update-bar');
        check('the built-in bar is shown with the default text and a Reload button', bar && /A new version is available\./.test(bar.textContent) && bar.querySelector('.lm-update-go').textContent === 'Reload', bar && bar.textContent);
        check('it is shown once, not again on the next check', (await w.eval('lmCheckForUpdate()')) === false && w.document.querySelectorAll('.lm-update-bar').length === 1);
        bar.querySelector('.lm-update-x').click();
        check('the dismiss button removes it', !w.document.querySelector('.lm-update-bar'));
        w.close();

        await deploy(base, BUILD);
        d = await open(base + '/', '{ updateCheck: { message: "Update ready <b>x</b>", buttonText: "Refresh" } }');
        await deploy(base, BUILD + 60000);
        await d.window.eval('lmCheckForUpdate()');
        const bar2 = d.window.document.querySelector('.lm-update-bar');
        check('custom message and button text (message is text, not HTML)', bar2 && bar2.querySelector('span').textContent === 'Update ready <b>x</b>' && !bar2.querySelector('b') && bar2.querySelector('.lm-update-go').textContent === 'Refresh', bar2 && bar2.innerHTML.slice(0, 160));
        d.window.close();

        await deploy(base, BUILD);
        d = await open(base + '/', '{ updateCheck: { onUpdate: function (i) { window.__info = i; } } }');
        await deploy(base, BUILD + 60000);
        await d.window.eval('lmCheckForUpdate()');
        const info = d.window.__info;
        check('onUpdate replaces the bar and gets { current, latest, reload }', info && info.current === BUILD && info.latest === BUILD + 60000 && typeof info.reload === 'function' && !d.window.document.querySelector('.lm-update-bar'), JSON.stringify(info));
        d.window.close();

        await deploy(base, BUILD);
        d = await open(base + '/', '{ updateCheck: false }');
        await deploy(base, BUILD + 60000);
        check('updateCheck: false turns it off', (await d.window.eval('lmCheckForUpdate()')) === false && !d.window.document.querySelector('.lm-update-bar'));
        d.window.close();

        d = await open(base + '/dev');
        check('under lm serve (/js/lm.js, no stamp) it is off', d.window.eval('LM_BUILD') === 0 && d.window.eval('LM_VERSION') === 'dev' && (await d.window.eval('lmCheckForUpdate()')) === false);
        d.window.close();
    } catch (e) {
        check('test ran to completion', false, e.stack);
    }
    child.kill();
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
});
