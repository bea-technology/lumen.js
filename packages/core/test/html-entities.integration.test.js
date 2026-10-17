// Regression test for the 2026-09-20 fix: static text content in .view
// files can contain real HTML entities (&nbsp;, &amp;, &copy;, numeric
// entities, ...) — real content found migrating V1 sites. document.
// createTextNode()/.textContent never parse their argument as HTML, so
// entities used to land in the DOM as literal characters. Fixed via
// decodeHtmlEntities() in _re.js, applied at both static-text
// createTextNode() call sites (the split/mustache path and the
// no-mustache path). Uses a real, minimal HST fixture (mirrors the
// established pattern in this suite — real fcs.js parser output, not a
// hand-built object) rather than calling decodeHtmlEntities() directly,
// so this actually proves entities decode end-to-end through rendering.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

const dom = new JSDOM(
    `<!doctype html><body><div id="root"></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19998/', runScripts: 'dangerously',
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
            window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
        }
    }
);
const win = dom.window;

const mainScript = `
window.__results = [];
function check(name, cond, detail) { window.__results.push({ name, cond: !!cond, detail }); }
try {

check('decodeHtmlEntities is exposed', typeof decodeHtmlEntities === 'function');
check('&nbsp; decodes to a real non-breaking space', decodeHtmlEntities('A&nbsp;B') === 'A\\u00a0B', decodeHtmlEntities('A&nbsp;B'));
check('&amp; decodes correctly', decodeHtmlEntities('&amp;') === '&');
check('numeric + hex entities decode correctly', decodeHtmlEntities('&#65;&#x42;') === 'AB');
check('a string with no "&" is returned unchanged, not touched', decodeHtmlEntities('plain text') === 'plain text');

// End-to-end: a real HST 'tag' node whose only child is a plain-text node
// (type 'text', no mustaches — mss: [], the "else" branch in walk()'s text
// handling) carrying literal entities, exactly the shape fcs.js's real
// parser produces for a .view file containing "A&nbsp;B &amp; &copy;". API
// mirrors core-bundle.integration.test.js exactly (new _v(...) then
// new _lm(view), the established pattern for driving walk() directly).
var docTree = {
    type: 'tag', name: 'div', attrs: {}, evs: {}, ax: {}, ex: {}, isV: false,
    children: [{
        type: 'text', tag: 'div', content: 'A&nbsp;B &amp; &copy;', mss: []
    }]
};
var view = new _v({ name: 'entities-test', type: 'main', hst: [docTree], vars: {}, rvs: [] });
var engine = new _lm(view);
_vt.View = view;
engine.renderAll();

var root = document.getElementById('root');
root.append.apply(root, engine._RealDOM);
var textNode = root.querySelector('div');

check('rendered text has no literal "&nbsp;" left in it', textNode.textContent.indexOf('&nbsp;') === -1, textNode.textContent);
check('rendered text has a real decoded non-breaking space', textNode.textContent.indexOf('\\u00a0') > -1, JSON.stringify(textNode.textContent));
check('rendered text has no literal "&amp;"/"&copy;" left in it', textNode.textContent.indexOf('&amp;') === -1 && textNode.textContent.indexOf('&copy;') === -1, textNode.textContent);
} catch (e) {
    window.__results.push({ name: 'no uncaught error', cond: false, detail: (e && e.stack) || String(e) });
}
`;

const scriptEl = win.document.createElement('script');
scriptEl.textContent = mainScript;
win.document.body.appendChild(scriptEl);

let pass = 0, fail = 0;
setTimeout(() => {
    const results = win.__results || [];
    if (results.length === 0) {
        fail++;
        console.log('FAIL  test script never ran (window.__results missing)');
    }
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail === 0 ? 0 : 1);
}, 200);
