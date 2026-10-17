// Inline <svg> in a view rendered invisible: every element was created with document.createElement (XHTML
// namespace, `viewBox` lowercased), so nothing drew. V1 inserted view HTML with jQuery .html(), which the browser
// parses into the SVG namespace. Elements inside <svg> are now created with createElementNS, <foreignObject>
// content is HTML again, xlink:/xmlns: attributes go into their namespaces, and @events work on SVG elements.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-svg-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<svg id="s" viewBox="0 0 100 100" xmlns:xlink="http://www.w3.org/1999/xlink">
<defs><linearGradient id="grad"><stop offset="0" stop-color="red"/></linearGradient></defs>
<g id="dots"><circle class="dot" :for="rs as r" cx="{{r * 10}}" cy="5" r="{{r}}" @click="picked = r"/></g>
<use id="u" xlink:href="#grad"/>
<rect id="box" width="{{w}}" height="10" fill="url(#grad)"/>
<foreignObject width="50" height="20"><div id="fo" class="h">html {{picked}}</div></foreignObject>
</svg>
<p id="plain">plain</p>
<script>
var rs = [1, 2, 3];
var w = 10;
var picked = 0;
window.grow = function () { w = 40; rs.push(4); };
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19995/', runScripts: 'dangerously',
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
    const SVG = 'http://www.w3.org/2000/svg', XHTML = 'http://www.w3.org/1999/xhtml', XLINK = 'http://www.w3.org/1999/xlink';
    await wait(600);
    check('<svg> is in the SVG namespace', $('#s') && $('#s').namespaceURI === SVG, $('#s') && $('#s').namespaceURI);
    check('viewBox keeps its case', $('#s').getAttribute('viewBox') === '0 0 100 100' && !$('#s').hasAttribute('viewbox'), $('#s').outerHTML.slice(0, 120));
    check('nested SVG elements (defs > linearGradient > stop) are SVG, camelCase tag kept', win.document.querySelector('linearGradient') && win.document.querySelector('linearGradient').namespaceURI === SVG, String(win.document.querySelector('lineargradient')));
    const dots = Array.from(win.document.querySelectorAll('#dots .dot'));
    check(':for rows inside <svg> are SVG elements with resolved attributes', dots.length === 3 && dots.every((d) => d.namespaceURI === SVG) && dots.map((d) => d.getAttribute('cx')).join() === '10,20,30', dots.length + ' ' + dots.map((d) => d.namespaceURI + ':' + d.getAttribute('cx')).join());
    check('xlink:href is set in the xlink namespace', $('#u').getAttributeNS(XLINK, 'href') === '#grad', String($('#u').getAttributeNS(XLINK, 'href')));
    check('<foreignObject> content is HTML again', $('#fo') && $('#fo').namespaceURI === XHTML && $('#fo').textContent === 'html 0', $('#fo') && ($('#fo').namespaceURI + ' ' + $('#fo').textContent));
    check('elements outside <svg> are unaffected', $('#plain').namespaceURI === XHTML);
    dots[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await wait(100);
    check('@click on an SVG element runs and re-renders', $('#fo').textContent === 'html 2', $('#fo').textContent);
    win.grow(); await wait(200);
    check('attribute mustache on an SVG element updates', $('#box').getAttribute('width') === '40', $('#box').getAttribute('width'));
    const dots2 = Array.from(win.document.querySelectorAll('#dots .dot'));
    check('a row added later inside <svg> is SVG too', dots2.length === 4 && dots2[3].namespaceURI === SVG, dots2.length + ' ' + (dots2[3] && dots2[3].namespaceURI));
    let pass = 0, fail = 0;
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
