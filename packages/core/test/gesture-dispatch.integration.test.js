// Regression test for the 2026-09-22 gesture-dispatch mechanism — a
// real, previously-unimplemented feature: tap/doubletap/singletap/
// taphold/clickhold/tapstart/tapend/tapmove/swipe(+4 directions)/
// swipeend/tap2/tap2hold. Every one of lstnrs.js's own real bindings for
// these was already correctly wired (single-name delegated selectors,
// fixed 2026-09-16) but listened for event TYPES that nothing anywhere
// in this runtime ever actually dispatched — V1 almost certainly relied
// on a bundled external gesture library for this. This is a real,
// global Pointer-Events-based dispatcher (vendor/reconnecting-
// websocket.js) that synthesizes and dispatches these as real, bubbling
// CustomEvents on the real target, so the existing delegated bindings
// pick them up with zero changes needed there.
//
// jsdom has no native PointerEvent class, so this dispatches plain
// Event objects with the same properties (clientX/clientY/pointerId/
// isPrimary) the dispatcher's own handlers actually read — this tests
// the real state-machine logic (the thing that was never implemented at
// all), not hardware-level pointer capture, which is out of jsdom's
// reach regardless of technique.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(process.env.LM_TEST_RUNTIME || path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

function freshDOM() {
    const dom = new JSDOM(
        `<!doctype html><body><div id="target"></div><script>${bundleSrc}</script></body>`,
        {
            url: 'http://127.0.0.1:19994/', runScripts: 'dangerously',
            beforeParse(window) {
                window.URL.createObjectURL = () => 'blob:test';
                window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
                window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
            }
        }
    );
    return dom.window;
}

function pointerEvent(win, type, opts) {
    const e = new win.Event(type, { bubbles: true, cancelable: true });
    e.clientX = opts.x || 0;
    e.clientY = opts.y || 0;
    e.pointerId = opts.id !== undefined ? opts.id : 1;
    e.isPrimary = opts.primary !== false;
    return e;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

async function main() {
    // ---- tap ----
    {
        const win = freshDOM();
        await new Promise(r => setTimeout(r, 50));
        const target = win.document.getElementById('target');
        const log = [];
        ['tap', 'tapstart', 'tapend', 'singletap', 'doubletap'].forEach(t => target.addEventListener(t, () => log.push(t)));

        target.dispatchEvent(pointerEvent(win, 'pointerdown', { x: 10, y: 10 }));
        target.dispatchEvent(pointerEvent(win, 'pointerup', { x: 10, y: 10 }));
        check('a quick down+up fires tapstart, tap, tapend', log.includes('tap') && log.includes('tapstart') && log.includes('tapend'), JSON.stringify(log));

        await new Promise(r => setTimeout(r, 500));
        check('a single tap with no follow-up fires singletap after the double-tap window', log.includes('singletap'), JSON.stringify(log));
        check('a single tap never fires doubletap', !log.includes('doubletap'), JSON.stringify(log));
    }

    // ---- doubletap ----
    {
        const win = freshDOM();
        await new Promise(r => setTimeout(r, 50));
        const target = win.document.getElementById('target');
        const log = [];
        ['tap', 'singletap', 'doubletap'].forEach(t => target.addEventListener(t, () => log.push(t)));

        target.dispatchEvent(pointerEvent(win, 'pointerdown', { x: 10, y: 10 }));
        target.dispatchEvent(pointerEvent(win, 'pointerup', { x: 10, y: 10 }));
        target.dispatchEvent(pointerEvent(win, 'pointerdown', { x: 10, y: 10 }));
        target.dispatchEvent(pointerEvent(win, 'pointerup', { x: 10, y: 10 }));
        await new Promise(r => setTimeout(r, 500));
        check('two quick taps on the same element fire doubletap', log.includes('doubletap'), JSON.stringify(log));
        check('two quick taps never fire singletap (the pending one is cancelled)', !log.includes('singletap'), JSON.stringify(log));
    }

    // ---- doubletap right after a tap on ANOTHER element ----
    // The other element's pending-singletap timer used to run on and clear this element's pending tap, so a
    // double-tap started ~300ms after tapping elsewhere was lost.
    {
        const win = freshDOM();
        await new Promise(r => setTimeout(r, 50));
        const target = win.document.getElementById('target');
        target.insertAdjacentHTML('afterend', '<div id="other"></div>');
        const other = win.document.getElementById('other');
        const log = [];
        ['singletap', 'doubletap'].forEach(t => {
            target.addEventListener(t, () => log.push('target:' + t));
            other.addEventListener(t, () => log.push('other:' + t));
        });
        const tap = (el) => { el.dispatchEvent(pointerEvent(win, 'pointerdown', { x: 10, y: 10 })); el.dispatchEvent(pointerEvent(win, 'pointerup', { x: 10, y: 10 })); };
        tap(other);
        await new Promise(r => setTimeout(r, 300));
        tap(target);
        await new Promise(r => setTimeout(r, 130));
        tap(target);
        await new Promise(r => setTimeout(r, 500));
        check('a double-tap ~300ms after tapping another element still fires doubletap', log.includes('target:doubletap'), JSON.stringify(log));
        check('the other element still gets exactly one singletap', log.filter((x) => x === 'other:singletap').length === 1, JSON.stringify(log));
        check('the double-tapped element gets no singletap', !log.includes('target:singletap'), JSON.stringify(log));
    }

    // ---- taphold / clickhold ----
    {
        const win = freshDOM();
        await new Promise(r => setTimeout(r, 50));
        const target = win.document.getElementById('target');
        const log = [];
        ['taphold', 'clickhold', 'tap'].forEach(t => target.addEventListener(t, () => log.push(t)));

        target.dispatchEvent(pointerEvent(win, 'pointerdown', { x: 10, y: 10 }));
        await new Promise(r => setTimeout(r, 600));
        target.dispatchEvent(pointerEvent(win, 'pointerup', { x: 10, y: 10 }));
        check('holding without moving fires taphold', log.includes('taphold'), JSON.stringify(log));
        check('holding without moving also fires clickhold (the real V1 alias)', log.includes('clickhold'), JSON.stringify(log));
        check('a real hold does not also fire a plain tap', !log.includes('tap'), JSON.stringify(log));
    }

    // ---- swipe ----
    {
        const win = freshDOM();
        await new Promise(r => setTimeout(r, 50));
        const target = win.document.getElementById('target');
        const log = [];
        ['swipe', 'swiperight', 'swipeleft', 'swipeend', 'tap'].forEach(t => target.addEventListener(t, () => log.push(t)));

        target.dispatchEvent(pointerEvent(win, 'pointerdown', { x: 10, y: 10 }));
        target.dispatchEvent(pointerEvent(win, 'pointermove', { x: 100, y: 10 }));
        target.dispatchEvent(pointerEvent(win, 'pointerup', { x: 100, y: 10 }));
        check('a fast rightward drag fires swipe + swiperight + swipeend', log.includes('swipe') && log.includes('swiperight') && log.includes('swipeend'), JSON.stringify(log));
        check('a real swipe does not fire the wrong direction', !log.includes('swipeleft'), JSON.stringify(log));
        check('a real swipe does not also fire tap (real movement happened)', !log.includes('tap'), JSON.stringify(log));
    }

    // ---- tap2 / two simultaneous pointers ----
    {
        const win = freshDOM();
        await new Promise(r => setTimeout(r, 50));
        const target = win.document.getElementById('target');
        const log = [];
        ['tap2', 'tap'].forEach(t => target.addEventListener(t, () => log.push(t)));

        target.dispatchEvent(pointerEvent(win, 'pointerdown', { x: 10, y: 10, id: 1, primary: true }));
        target.dispatchEvent(pointerEvent(win, 'pointerdown', { x: 50, y: 10, id: 2, primary: false }));
        target.dispatchEvent(pointerEvent(win, 'pointerup', { x: 10, y: 10, id: 1 }));
        target.dispatchEvent(pointerEvent(win, 'pointerup', { x: 50, y: 10, id: 2 }));
        check('two simultaneous quick taps fire tap2, not a plain tap', log.includes('tap2') && !log.includes('tap'), JSON.stringify(log));
    }

    // ---- @orientationchange re-dispatch (real event only fires on window) ----
    {
        const win = freshDOM();
        await new Promise(r => setTimeout(r, 50));
        const log = [];
        win.document.body.addEventListener('orientationchange', () => log.push('fired'));
        win.dispatchEvent(new win.Event('orientationchange'));
        check('a real window-level orientationchange re-dispatches on document.body', log.includes('fired'), JSON.stringify(log));
    }

    // ---- _findByAtAttrNames: real bug found and fixed alongside the
    // gesture dispatcher — a raw $(selector) call made entirely of
    // comma-separated [\@name] tokens only ever matched anything when
    // dom-shim.js's OWN $ constructor (its own earlier fix, same
    // session) was the active one. Once a project selects a real jQuery
    // (e.g. via jquery-ui-dist, now that the conditional-assignment fix
    // lets a real jQuery actually stay active), that real jQuery's own
    // constructor takes the fast native querySelectorAll path for
    // anything that LOOKS like valid CSS (which [\@name] does,
    // syntactically) — and native querySelectorAll can never see an
    // @-prefixed name at all. Confirmed live: this silently broke
    // @scroll-start/@scroll-end/etc. (and was a real, latent regression
    // risk for the plain @scroll case too) the moment a real jQuery
    // became active. _findByAtAttrNames() is a real, $-implementation-
    // agnostic replacement, used by applyTriggers()'s own scroll
    // binding and the scroll-start/end synthesis installer.
    {
        const win = freshDOM();
        await new Promise(r => setTimeout(r, 50));
        win.document.body.insertAdjacentHTML('beforeend', '<div id="a"></div><div id="b"></div><div id="c"></div>');
        // Engine-created elements carry @-events on el.events and are indexed by createEl() (_lmIndexAtEl) —
        // replicated directly here.
        const a = win.document.getElementById('a'); a.events = { '@scroll-start': 'x' }; win._lmIndexAtEl(a, '@scroll-start');
        const b = win.document.getElementById('b'); b.events = { '@scroll-end': 'y' }; win._lmIndexAtEl(b, '@scroll-end');
        // #c deliberately has neither — must not match.
        const found = win._findByAtAttrNames(['@scroll-start', '@scroll-end']);
        check('_findByAtAttrNames finds every engine element carrying those @-events', found.length === 2, 'found ' + found.length);
        check('_findByAtAttrNames finds the right elements', found.includes(a) && found.includes(b) && !found.includes(win.document.getElementById('c')));
        // Raw HTML (not engine-created) with a REAL @ attribute is found by one native selector query.
        win.document.body.insertAdjacentHTML('beforeend', '<div id="d" @scroll-end="w"></div>');
        const d = win.document.getElementById('d');
        check('raw HTML with a real @scroll-end attribute is found too', win._findByAtAttrNames(['@scroll-start', '@scroll-end']).includes(d));
        // A detached element is skipped but kept, so re-attaching it (a persistent widget's DOM) finds it again.
        a.remove();
        check('a detached element is skipped', !win._findByAtAttrNames(['@scroll-start']).includes(a));
        win.document.body.appendChild(a);
        check('...and found again once re-attached', win._findByAtAttrNames(['@scroll-start']).includes(a));
        // 2026-10-03 perf: no full-document attribute scan — a big page must cost nothing per element.
        let getAttrCalls = 0;
        const big = win.document.createElement('div');
        for (let i = 0; i < 3000; i++) big.appendChild(win.document.createElement('span'));
        win.document.body.appendChild(big);
        const P = win.HTMLElement.prototype, origGA = P.getAttribute;
        P.getAttribute = function () { getAttrCalls++; return origGA.apply(this, arguments); };
        win._findByAtAttrNames(['@scroll', '@scroll-start', '@scroll-end', '@scroll-left', '@scroll-right', '@scroll-top', '@scroll-bottom']);
        P.getAttribute = origGA;
        check('no per-element attribute scan on a 3000-element page', getAttrCalls === 0, 'getAttribute calls: ' + getAttrCalls);
        big.remove();

        // Confirms applyTriggers() itself uses _findByAtAttrNames (not a
        // raw $(commaSelector) call) for its real scroll-element lookup
        // — the actual call site this whole fix targets. Spying instead
        // of replacing window.$ entirely: a fake "real jQuery" minimal
        // enough to not throw would defeat the point (applyTriggers()
        // calls $() many times for unrelated things too), and isn't
        // needed — _findByAtAttrNames() itself already uses raw
        // querySelectorAll, proven not to depend on $ at all above; this
        // only needs to confirm the real call site actually reaches it.
        win.document.body.insertAdjacentHTML('beforeend', '<div id="scrollel"></div>');
        const scrollEl = win.document.getElementById('scrollel');
        scrollEl.events = { '@scroll-start': 'z' };
        win._lmIndexAtEl(scrollEl, '@scroll-start');
        let calledWith = null;
        const origFind = win._findByAtAttrNames;
        win._findByAtAttrNames = function (names) { calledWith = names; return origFind(names); };
        win.applyTriggers();
        check('applyTriggers() calls _findByAtAttrNames with the real scroll attribute names', Array.isArray(calledWith) && calledWith.includes('@scroll') && calledWith.includes('@scroll-start'), JSON.stringify(calledWith));
        check('the real scroll-start/end synthesis is installed on the real matched element', !!scrollEl._lumenScrollSynthInstalled);
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}

main();
