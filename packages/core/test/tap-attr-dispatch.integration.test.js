// Regression test for a real, pre-existing bug found 2026-09-22 while
// live-verifying the gesture-dispatch mechanism against a real guide page:
// lstnrs.js's own @tap binding
//   $("body").on("tap", "[\@tap]", function (ev) { processEv(ev, $(this), "click touch"); });
// passed the literal string "click touch" as processEv's `n` parameter —
// every other gesture binding in the same file passes a name matching its
// own selector's attribute suffix (e.g. @dbltap passes "dbltap"). processEv
// then checks `el.hasAttr("@" + n)`, i.e. `el.hasAttr("@click touch")` (a
// nonexistent attribute, note the literal space) — always false — and
// returns without ever calling evalEvAttr. So a real @tap="..." handler
// never ran, in any environment, silently (no error, no console output).
// This was invisible to click-events.integration.test.js (only tests
// @click, which passes n="click" correctly) and to
// gesture-dispatch.integration.test.js (only tests the raw CustomEvent
// dispatch mechanism itself, via directly-bound listeners — it never drove
// the actual lstnrs.js @tap delegated binding end-to-end). Only surfaced
// live-testing a real page's real @tap="handleButtonClick" button in real
// Chrome and finding no alert fired despite the underlying "tap" CustomEvent
// genuinely dispatching and bubbling correctly.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

const dom = new JSDOM(
    `<!doctype html><body><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:3000/', runScripts: 'dangerously',
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
            window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
        }
    }
);
const win = dom.window;

setTimeout(() => {
    const document = win.document;
    let pass = 0, fail = 0;
    function check(name, cond, detail) {
        if (cond) { pass++; console.log('PASS  ' + name); }
        else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
    }

    win.bumpTap = function () { win.__tapFired = (win.__tapFired || 0) + 1; };

    const btn = document.createElement('button');
    btn.textContent = 'Tap me!';
    // The framework's own setAttribute patch (vendor/reconnecting-
    // websocket.js) redirects an @-prefixed write to el.events, matching
    // how compiled markup really carries it — not a plain DOM attribute.
    // The patch silently no-ops (empty catch) if el.events doesn't exist
    // yet — real compiled markup gets this from the framework's own
    // createEl(); a plain document.createElement() needs it seeded by hand.
    btn.events = {};
    btn.setAttribute('@tap', 'bumpTap()');
    document.body.appendChild(btn);

    check('the @tap attribute is redirected (not a real DOM attribute)', btn.getAttribute('@tap') === 'bumpTap()' && !btn.hasAttribute('@tap'), 'getAttribute=' + btn.getAttribute('@tap') + ' hasAttribute=' + btn.hasAttribute('@tap'));

    // Real gesture dispatch: a quick pointerdown+pointerup fires a real,
    // bubbling "tap" CustomEvent on the button (the gesture-dispatch
    // mechanism itself, already covered by gesture-dispatch.integration.
    // test.js) — this test's real target is whether lstnrs.js's delegated
    // "[\@tap]" listener correctly routes it through to evalEvAttr.
    // jsdom's plain Event has no pointerId/isPrimary/clientX/clientY by
    // default; set them directly, matching gesture-dispatch.integration.
    // test.js's own pointerEvent() helper convention.
    function pointerEvent(type, x, y) {
        const e = new win.Event(type, { bubbles: true, cancelable: true });
        e.clientX = x; e.clientY = y; e.pointerId = 1; e.isPrimary = true;
        return e;
    }
    btn.dispatchEvent(pointerEvent('pointerdown', 10, 10));
    btn.dispatchEvent(pointerEvent('pointerup', 10, 10));

    setTimeout(() => {
        check('a real @tap="..." handler actually fires through lstnrs.js\'s delegated binding (the real bug)', win.__tapFired === 1, 'fired=' + win.__tapFired);

        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail === 0 ? 0 : 1);
    }, 200);
}, 300);
