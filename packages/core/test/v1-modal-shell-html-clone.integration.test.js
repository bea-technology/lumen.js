// V1 parity, found by mac-beacdn on console.roxyon.com (2026-10-03):
// (1) the modal shell must be V1's markup (core-v1 listeners.js): <popup class="ov df pf … oya [ov]"><div pop-c …>
//     <flx pop-h …><flx class="f1 fc as"><div pop-t><div pop-d></flx><div pop-x …><span class="… iconify"
//     data-icon="mdi:close"></span></div></flx><div pop-b><div pop-f …></div></popup>, padding default "" and
//     modal-icon support. V2's <pop-o>/<tbl_nm>/<cl>/<pop-c> TAGS activated sites' tag-selector CSS that is dormant
//     under V1, so every console modal changed width/position/header.
// (2) a raw-HTML mustache keeps exactly ONE <span> clone per text node even when more than one effect drives that
//     node (a nested view rendered by more than one engine) — console's quota donuts were drawn twice.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-v1shell-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<button id="open" modal="" modal-title="Policy" modal-description="Read it">open</button>
<button id="open2" modal="" modal-title="Two" modal-icon="mdi:arrow-left" modal-spacing="p30">open2</button>
<p id="h">{{donut}}</p>
<script>
var donut = '<svg class="d"></svg>';
window.setDonut = function (v) { donut = v; };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19983/', runScripts: 'dangerously',
    beforeParse(window) {
        window.URL.createObjectURL = () => 'blob:test';
        window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
        window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
    }
});
const win = dom.window;
win.__payload = { hstFormatVersion: 1, views, layouts: {}, tpls: {} };
win.eval(`
_vcD = window.__payload;
_csswrk.isStarted = function () { return true; };
_initialized = true;
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__" };
renderView('home', false, {});
`);

const results = [];
function check(name, cond, detail) { results.push({ name, cond: !!cond, detail }); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s) => win.document.querySelector(s);
const log = () => win.eval('log.join()');
const reset = () => win.eval('log.length = 0');

(async () => {
    await wait(500);
    $('#open').click(); await wait(200);
    const p = $('popup#modals_0');
    check('popup created', !!p, win.document.body.innerHTML.slice(-300));
    check('V1 popup classes', p && ['ov', 'df', 'pf', 'z10000', 'oya', 'bgb20'].every((c) => p.classList.contains(c)), p && p.className);
    check('no V2-only shell tags', p && !p.querySelector('pop-o, tbl_nm, cl, pop-c, pop-h, pop-t, pop-x'), p && p.innerHTML.slice(0, 200));
    const c = p && p.querySelector(':scope > div[pop-c]');
    check('div[pop-c] with V1 classes and no default padding class', c && c.classList.contains('ma') && c.classList.contains('w100') && !c.classList.contains('p10'), c && c.className);
    const hdr = c && c.querySelector(':scope > flx[pop-h]');
    check('flx[pop-h] header holding div[pop-t] / div[pop-d] and div[pop-x]', !!hdr && !!hdr.querySelector('div[pop-t]') && hdr.querySelector('div[pop-t]').textContent === 'Policy' && hdr.querySelector('div[pop-d]').textContent === 'Read it' && !!hdr.querySelector(':scope > div[pop-x][close-modal]'), hdr && hdr.outerHTML.slice(0, 300));
    const icon = hdr && hdr.querySelector('div[pop-x] span');
    check('close icon is an iconify mdi:close by default', icon && icon.classList.contains('iconify') && icon.getAttribute('data-icon') === 'mdi:close', icon && icon.outerHTML);
    check('div[pop-b] and div[pop-f] follow', !!c && !!c.querySelector(':scope > div[pop-b]') && !!c.querySelector(':scope > div[pop-f].ps.b0'), c && c.innerHTML.slice(-200));
    $('#open2').click(); await wait(200);
    const p2 = $('popup#modals_1');
    const ic2 = p2 && p2.querySelector('div[pop-x] span'), c2 = p2 && p2.querySelector('div[pop-c]');
    check('modal-icon and modal-spacing are applied', ic2 && ic2.getAttribute('data-icon') === 'mdi:arrow-left' && c2 && c2.classList.contains('p30'), p2 && p2.innerHTML.slice(0, 200));

    const spans = () => win.document.querySelectorAll('#h svg.d').length;
    check('raw-HTML mustache renders once', spans() === 1, $('#h').innerHTML);
    win.eval(`(function () {
        var re = _vt.View._re, effs = re._effects['donut'] || [];
        var e = effs.filter(function (x) { return x.type === 'text'; })[0];
        var twin = Object.assign({}, e); delete twin._htmlClone;
        re.applyTextEffect(twin); re.applyTextEffect(e);
    })()`);
    check('a second effect on the same text node reuses the clone (still one)', spans() === 1, $('#h').innerHTML);
    win.setDonut('<svg class="d"></svg><svg class="d"></svg>'); await wait(150);
    check('re-render replaces the content in place', spans() === 2 && $('#h').querySelectorAll('span').length === 1, $('#h').innerHTML);
    win.setDonut('plain'); await wait(150);
    check('switching to plain text removes the clone', !$('#h span') && $('#h').textContent.trim() === 'plain', $('#h').innerHTML);
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
