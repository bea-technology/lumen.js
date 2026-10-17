// Integration test: persistent layout widgets (_vt.Widgets, 2026-09-18) —
// generalizes V1's hardcoded hasNav/hasHeader/hasFooter (fixed 3-region
// layout) into any bare attribute a layout declares (e.g. <nav nav>), with
// the one thing V1 never had to solve: the region must NOT re-render on
// every SPA navigation the way [body] does, only when what should actually
// be there changes. See _re.js's `_vt.Widgets` declaration and
// renderView()'s layout branch for the design/implementation.
//
// Fixtures are real fcs.js parser output (getAllFiles()+annotateLayoutRegions()
// against real .view/.layout files under this directory), not hand-built —
// same established reasoning as every other *.integration.test.js in this
// suite: real parser output has repeatedly caught bugs a synthetic fixture
// would have hidden (see render-hooks.integration.test.js's own header for
// one concrete example). Regeneration recipe: scaffold a scratch project,
// copy widgets.layout to src/layouts/widgets.layout, widgets-nav.view to
// src/views/widgets/nav.view, widgets-{home,page2,page3}.view to
// src/views/*.view, then call
// fcs.getAllFiles(".../src/views/", {}, false, true) for widgets.views.hst.json
// and fcs.annotateLayoutRegions(fcs.getAllFiles(".../src/layouts/", {}, false, true))
// for widgets.layouts.hst.json.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const views = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/widgets.views.hst.json'), 'utf8'));
const layouts = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/widgets.layouts.hst.json'), 'utf8'));

// A real project's index.html always ships a pre-seeded <div app></div> —
// renderView()'s "no [app] container exists yet" cold-start branch (which
// splices the raw appSelector string, brackets included, straight into an
// HTML string — a real, pre-existing, unrelated bug: "[app]" becomes a
// literal attribute name "[app]" instead of "app") is effectively dead code
// in practice. Match real usage rather than exercising that branch.
// 2026-09-18, real root cause found and worth recording: every OTHER
// *.integration.test.js in this suite uses http://127.0.0.1:3000/ too —
// harmless for them since they either bypass renderView() entirely
// (construct _v/_lm directly) or hit an early return before the bundle's
// own always-on WebSocket client (Nuke/_Live, in ws.js, opened
// unconditionally at bundle load, not gated on Reactor()) matters. This
// test drives renderView()'s real navigation path deeply enough that it
// does matter — and 127.0.0.1:3000 is exactly the port this whole
// session's own `lm serve` dev server conventionally runs on. If one
// happens to be running on the same machine during a test run (a real,
// reproduced case, not hypothetical), this test's bundle-internal
// WebSocket client connects to that REAL, unrelated, live server instead
// of failing closed — causing genuinely unpredictable interference that
// looked, for a long stretch of debugging, exactly like environment/timer
// flakiness. A guaranteed-unused port avoids this outright (real
// ECONNREFUSED, the actually-safe, inert outcome) rather than depending on
// no dev server happening to be running. Worth fixing repo-wide in the
// other test files too at some point — not done here, out of scope for
// this feature.
const dom = new JSDOM(
    `<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19999/', runScripts: 'dangerously',
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
            // jsdom doesn't implement the Web Audio API — lstnrs.js's own
            // global "click touch tap" listener references it unconditionally
            // to lazily unlock audio playback on first interaction. Same
            // stub as click-events.integration.test.js.
            window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
        }
    }
);
const win = dom.window;

const mainScript = `
window.__results = [];
function check(name, cond, detail) { window.__results.push({ name, cond: !!cond, detail }); }

_vcD = { hstFormatVersion: ${JSON.stringify(1)}, views: ${JSON.stringify(views)}, layouts: ${JSON.stringify(layouts)} };
// renderView() gates on _csswrk.isStarted() (the scoped-CSS WebWorker) —
// jsdom's Worker stub (provided above, via beforeParse) is too inert to
// ever really reach STARTED (documented, established gap — see this
// session's own history on the first real lm-serve smoke test). Every
// OTHER integration test that touches renderView() sidesteps this by
// returning early before that gate (e.g. hst-version's deliberate version
// mismatch) or never calls renderView() at all (constructs _v/_lm
// directly). This test's whole point IS renderView()'s layout branch, so
// stub the one thing genuinely irrelevant to what's under test.
_csswrk.isStarted = function () { return true; };

// 2026-09-18, real thing found and worth recording: vendor/reconnecting-
// websocket.js registers \`$(document).ready(_lumenReadyHandler)\`
// UNCONDITIONALLY at bundle load — NOT gated on Reactor() ever having been
// called. The moment \`appSettings\` becomes truthy, _lumenReadyHandler sets
// \`_initialized = true\` (itself, if it was null) and calls goToNode(),
// which calls renderView(appSettings.defaultView ?? "home", null, d)
// completely automatically. Since this test also needs to call
// renderView('home', ...) itself (matching every other renderView()-
// driving test in this suite — hst-version.integration.test.js etc. — a
// simple, already-reliable pattern), TWO concurrent callers would race for
// the same view unless kept apart: pointing defaultView at a name with no
// corresponding fixture makes the auto-navigation's own gate check
// (_payload.views.hasOwnProperty(...)) permanently false, so it retries
// harmlessly in the background forever without ever touching the DOM —
// fully decoupled from this test's own explicit calls below.
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__" };

function run() {
    return renderView('home', false, {})
        .then(function () {
            check('home view rendered', document.getElementById('e2e-home') && document.getElementById('e2e-home').textContent.trim() === 'Home page');
            var navEl = document.querySelector('[nav]');
            check('nav widget region exists in the mounted layout', !!navEl);
            check('nav widget mounted with its own initial reactive state (count: 0)', document.getElementById('e2e-nav-count').textContent.trim() === '0', document.getElementById('e2e-nav-count') && document.getElementById('e2e-nav-count').textContent);

            window.__navRootFirst = document.getElementById('e2e-nav');
            check('_vt.Widgets.nav got a real, live engine instance (._re)', !!(_vt.Widgets.nav && _vt.Widgets.nav._re));

            var btn = document.getElementById('e2e-nav-bump');
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            return new Promise(function (resolve) { setTimeout(resolve, 200); });
        })
        .then(function () {
            check('clicking the widget\\'s own @click-bound button updated its own reactive var (count: 0 -> 1)', document.getElementById('e2e-nav-count').textContent.trim() === '1', document.getElementById('e2e-nav-count').textContent);

            // Navigate to a DIFFERENT main view under the SAME layout, with
            // the SAME (default true) hasNav resolution — the whole point
            // of this feature: the nav widget's DOM/state must be left
            // completely untouched, not re-rendered/reset.
            return renderView('page2', false, {});
        })
        .then(function () {
            check('page2 view rendered', document.getElementById('e2e-page2'));
            check('the SAME nav widget DOM node (identity, not just visual sameness) survived the navigation — proves it was NOT re-rendered', document.getElementById('e2e-nav') === window.__navRootFirst);
            check('the nav widget\\'s bumped state (count: 1) survived the navigation too', document.getElementById('e2e-nav-count').textContent.trim() === '1', document.getElementById('e2e-nav-count').textContent);
            check('a view that never declares "count" itself can still read the widget\\'s var via the read-fallback tier (getVal -> _lookupInWidgets)', document.getElementById('e2e-page2-count').textContent.trim() === '1', document.getElementById('e2e-page2-count') && document.getElementById('e2e-page2-count').textContent);

            // Navigate to a view with hasNav: false — the region must clear.
            return renderView('page3', false, {});
        })
        .then(function () {
            check('page3 view rendered', document.getElementById('e2e-page3'));
            var navEl = document.querySelector('[nav]');
            check('hasNav: false clears the nav widget region', navEl && navEl.innerHTML.trim() === '', navEl && navEl.innerHTML);

            // Navigate back to a view with hasNav defaulting true again —
            // resolution changed (null -> "nav"), a legitimate fresh mount,
            // so a reset count is expected here (state didn't need to be
            // preserved across an explicit false -> true transition).
            return renderView('home', false, {});
        })
        .then(function () {
            var navEl = document.querySelector('[nav]');
            check('nav widget re-mounts once hasNav becomes true again', navEl && navEl.innerHTML.trim() !== '', navEl && navEl.innerHTML);
            check('re-mounted nav widget starts fresh (count: 0) — this is a genuine resolution change, not a no-op case', document.getElementById('e2e-nav-count').textContent.trim() === '0', document.getElementById('e2e-nav-count').textContent);

            // 2026-09-20 regression: a widget mount that can't find its own
            // HST (a real race — the very first renderView() after a fresh
            // page load/reconnect can run before the dev WS's getfiles
            // fetch has populated _payload) used to mark itself "resolved"
            // anyway, so it would NEVER retry once the data actually
            // arrived — the region stayed empty until a hard refresh
            // happened to win the race instead. Simulate exactly that:
            // clear the resolution as if freshly unmounted (what the
            // matching ws.js hot-reload fix does on a real widget-file
            // change too), hide the widget's own HST entry, render, and
            // confirm the region is honestly left unresolved rather than
            // falsely marked done — then restore the entry and render
            // again, confirming the very next render recovers on its own.
            var navKey = btoa('src/views/widgets/nav.view');
            var savedHst = _vcD.views[navKey];
            delete _vcD.views[navKey];
            _vt.Widgets.nav._resolvedFile = undefined;
            _vt.Widgets.nav._re = null;

            return renderView('home', false, {}).then(function () {
                check('a widget mount with no HST data available does not falsely mark itself resolved', _vt.Widgets.nav._resolvedFile === undefined, _vt.Widgets.nav._resolvedFile);

                _vcD.views[navKey] = savedHst;
                return renderView('home', false, {});
            });
        })
        .then(function () {
            check('once the data is available again, the very next render retries and mounts successfully', document.getElementById('e2e-nav-count') && document.getElementById('e2e-nav-count').textContent.trim() === '0', document.getElementById('e2e-nav-count') && document.getElementById('e2e-nav-count').textContent);

            window.__done = true;
        });
}

try {
    run().catch(function (e) {
        window.__results.push({ name: 'test script ran to completion', cond: false, detail: e.message + '\\n' + e.stack });
        window.__done = true;
    });
} catch (e) {
    window.__results.push({ name: 'test script ran to completion (sync)', cond: false, detail: e.message + '\\n' + e.stack });
    window.__done = true;
}
`;

setTimeout(() => {
    const script = win.document.createElement('script');
    script.textContent = mainScript;
    win.document.body.appendChild(script);

    const deadline = Date.now() + 20000;
    (function poll() {
        if (win.__done || Date.now() > deadline) {
            let pass = 0, fail = 0;
            for (const r of (win.__results || [])) {
                if (r.cond) { pass++; console.log('PASS  ' + r.name); }
                else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
            }
            console.log(`\n${pass} passed, ${fail} failed`);
            process.exit(fail === 0 ? 0 : 1);
        } else {
            setTimeout(poll, 50);
        }
    })();
}, 300);
