// Integration test: V1's real automatic plugin-init pass ([sl]/[color]/
// [date] elements becoming their respective widgets on mount, no explicit
// script call needed) and @after-render generalized to fire on mount for
// ANY element, not just :for items / :if sections (2026-09-16). See
// _re.js's autoInitPlugins()/initSl()/dtp() (ported faithfully from
// bea.js's real, un-minified renderPlugins()/dtp() source,
// SBEACDN/s.beacdn.com/beajs/core.js) and createEl()'s two new call sites.
//
// Runs against the real jQuery + Select2 + bootstrap-colorpicker +
// bootstrap-datetimepicker (since autoInitPlugins() guards every call on
// the matching $.fn.* method actually existing) — the plain bundle is
// covered separately below, confirming it does NOT throw on the exact same
// view (no plugins loaded, every guard should no-op).
//
// 2026-09-19: the "real plugins" half used to load the monolithic
// --with-plugins bundle (dist/lumenjs-core-with-plugins.js) — removed,
// confirmed functionally redundant with the per-project selective plugin
// bundling mechanism. Now built as dist/lumenjs-core.js (the real engine,
// unchanged) + a selective bundle selecting exactly the three plugins this
// test needs, concatenated in the same order a real project would load
// them as two separate <script> tags (default runtime, then the selective
// plugins bundle) — confirmed elsewhere in this suite that loading order
// is exactly what makes this safe (no double-jQuery, no internal $
// reference captured early).
//
// Fixture generation recipe is in plugin-autoinit.view's own header
// comment, same convention as click-events.integration.test.js's fixture.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const pluginsEsbuild = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'plugins-esbuild-plugin.js'));
const projectRoot = path.join(__dirname, '..');

const hst = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/plugin-autoinit.hst.json'), 'utf8'));

function runAgainst(bundleSrc, label, extraPolyfills) {
    const dom = new JSDOM(
        `<!doctype html><body><script>${bundleSrc}</script></body>`,
        {
            url: 'http://127.0.0.1:3000/', runScripts: 'dangerously',
            beforeParse(window) {
                window.URL.createObjectURL = () => 'blob:test';
                window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
                window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
                window.requestAnimationFrame = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
                window.cancelAnimationFrame = window.cancelAnimationFrame || function (id) { clearTimeout(id); };
                if (extraPolyfills) extraPolyfills(window);
            }
        }
    );
    const win = dom.window;

    const mainScript = `
window.__results = [];
function check(name, cond, detail) { window.__results.push({ name, cond: !!cond, detail }); }
window.__afterRenderCalls = 0;
function onPlainAfterRender(ev, el) { window.__afterRenderCalls++; }

try {
    var hst = ${JSON.stringify(hst)};
    var view = new _v({ name: 'home', type: 'main', hst: hst, vars: {}, rvs: [] });
    var engine = new _lm(view);
    engine.reactiveVariables = [];
    engine.renderAll();
    document.body.append.apply(document.body, engine._RealDOM);

    check('rendering a real view with [sl]/[color]/[date]/@after-render did not throw', true);
    // A mount @after-render waits until the element is attached and its handler exists (2026-10-08).
    check('@after-render has not fired while the element is still being created', window.__afterRenderCalls === 0, 'calls=' + window.__afterRenderCalls);
} catch (e) {
    window.__results.push({ name: 'test script ran to completion', cond: false, detail: e.message + '\\n' + e.stack });
}
// Plugin init waits until the element is attached (select2 & co. insert their UI as a sibling, a no-op on a
// detached node — 2026-10-03), so the checks below run once the deferred init has had a tick.
setTimeout(function () {
try {
    check('@after-render fired on mount for a PLAIN element (not :for/:if), once attached', window.__afterRenderCalls === 1, 'calls=' + window.__afterRenderCalls);

    var sl = document.getElementById('e2e-sl');
    var hasSelect2 = typeof jQuery !== 'undefined' && typeof jQuery.fn.select2 === 'function';
    check('[sl] auto-init: ' + (hasSelect2 ? 'select2 actually initialized' : 'no select2 loaded, correctly left as a plain <select> (no throw)'),
        hasSelect2 ? sl.classList.contains('select2-hidden-accessible') : !sl.classList.contains('select2-hidden-accessible'),
        sl.outerHTML.slice(0, 120));

    var colorEl = document.getElementById('e2e-color');
    var hasColorpicker = typeof jQuery !== 'undefined' && typeof jQuery.fn.colorpicker === 'function';
    check('[color] auto-init: ' + (hasColorpicker ? 'colorpicker actually initialized, attribute removed' : 'no colorpicker loaded, attribute left as-is (no throw)'),
        hasColorpicker ? !colorEl.hasAttribute('color') : colorEl.hasAttribute('color'),
        colorEl.outerHTML);

    var dateEl = document.getElementById('e2e-date');
    var hasDatetimepicker = typeof jQuery !== 'undefined' && typeof jQuery.fn.datetimepicker === 'function';
    check('[date] auto-init: ' + (hasDatetimepicker ? 'datetimepicker actually initialized, attribute removed' : 'no datetimepicker loaded, attribute left as-is (no throw)'),
        hasDatetimepicker ? !dateEl.hasAttribute('date') : dateEl.hasAttribute('date'),
        dateEl.outerHTML);
} catch (e) {
    window.__results.push({ name: 'test script ran to completion', cond: false, detail: e.message + '\\n' + e.stack });
}
}, 120);
`;

    setTimeout(() => {
        const script = win.document.createElement('script');
        script.textContent = mainScript;
        win.document.body.appendChild(script);

        setTimeout(() => {
            console.log(`\n--- ${label} ---`);
            let pass = 0, fail = 0;
            for (const r of (win.__results || [])) {
                if (r.cond) { pass++; console.log('PASS  ' + r.name); }
                else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
            }
            global.__totalPass = (global.__totalPass || 0) + pass;
            global.__totalFail = (global.__totalFail || 0) + fail;
            if (global.__pending) global.__pending--;
            if (global.__pending === 0) {
                console.log(`\n${global.__totalPass} passed, ${global.__totalFail} failed`);
                process.exit(global.__totalFail === 0 ? 0 : 1);
            }
        }, 400);
    }, 300);
}

async function main() {
    const coreSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

    const selected = pluginsEsbuild.selectedRegistryEntries({ select2: '*', 'bootstrap-colorpicker': '*', 'bootstrap-datetimepicker': '*' });
    const pluginsSrc = await pluginsEsbuild.buildSelectedPluginsBundle(selected, projectRoot);

    global.__pending = 2;
    runAgainst(coreSrc + '\n' + pluginsSrc, 'selective bundle (real Select2/colorpicker/datetimepicker)');
    runAgainst(coreSrc, 'plain bundle (no plugins loaded — must not throw)');
}

main();
