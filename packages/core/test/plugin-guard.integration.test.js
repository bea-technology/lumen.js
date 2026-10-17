// Regression test for the 2026-09-26 unguarded-optional-plugin bug, found
// live in /BEACDN/_test.
//
// renderPlugins() (vendor/reconnecting-websocket.js) auto-initializes V1's
// declarative plugin attributes -- [numeric]/[integer]/[decimal], [sl],
// [slct], [tags], [sort], [drag], [drop], [color], [crslf], [crsl],
// [pinnable], [lazy]. Every one of those calls a third-party plugin method
// directly, and none of them was guarded on the plugin actually being
// loaded (only the CKEDITOR block was).
//
// That matters because a real V1 project can carry the attribute while the
// library is genuinely absent: the CLI's detectUsedPlugins() only regex-scans
// static project files, so markup that arrives at runtime -- BaaS content
// rendered through a raw-HTML mustache, for instance -- is invisible to it.
// Unguarded, the very first such call throws and aborts the ENTIRE REST of
// renderPlugins(). Confirmed in real Chrome: a single [numeric] input stopped
// the [pattern] -> data-pattern transfer that happens a few lines later, and
// checkFormInputs() reads exactly that data-pattern -- so form validation
// broke silently, with no error surfaced anywhere.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

const dom = new JSDOM(
    `<!doctype html><body><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19993/', runScripts: 'dangerously',
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
            window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
        }
    }
);
const win = dom.window;

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

setTimeout(() => {
    const document = win.document;
    const $ = win.$;

    check('jquery.numeric is genuinely NOT loaded (the precondition this test needs)',
        typeof $.fn.numeric !== 'function', 'typeof=' + typeof $.fn.numeric);

    // V1 markup for a plugin this project never selected, plus a [pattern]
    // input that renderPlugins() handles a few lines AFTER the [numeric] one.
    const host = document.createElement('div');
    host.innerHTML = '<input id="n1" numeric><input id="p1" pattern="[0-9]+">';
    document.body.appendChild(host);

    let threw = null;
    try { win.renderPlugins(); } catch (e) { threw = e.constructor.name + ': ' + e.message; }

    check('renderPlugins() does not throw on a [numeric] element when jquery.numeric is absent',
        threw === null, String(threw));

    const p1 = document.getElementById('p1');
    check('the [pattern] -> data-pattern transfer still runs (proves the pass was not aborted)',
        p1.getAttribute('pattern') === null && $(p1).data('pattern') === '[0-9]+',
        'pattern=' + p1.getAttribute('pattern') + ' data-pattern=' + $(p1).data('pattern'));

    // The attribute is deliberately left in place when the plugin is missing,
    // so a later pass can still initialize it if the library loads.
    check('a skipped [numeric] element keeps its attribute for a later pass',
        document.getElementById('n1').hasAttribute('numeric'));

    // Every other guarded attribute must be equally safe in one pass.
    const host2 = document.createElement('div');
    host2.innerHTML = '<select sl></select><select slct></select><input tags>'
        + '<div sort></div><div drag></div><div drop></div><input color>'
        + '<div pinnable></div><img lazy><div crsl></div><div crslf></div>';
    document.body.appendChild(host2);
    let threw2 = null;
    try { win.renderPlugins(); win.loadPics(); } catch (e) { threw2 = e.constructor.name + ': ' + e.message; }
    check('renderPlugins() + loadPics() survive every V1 plugin attribute with no plugins loaded',
        threw2 === null, String(threw2));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}, 400);
