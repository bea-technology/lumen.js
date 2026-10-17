// Regression test for the 2026-09-26 swipe-threshold work. The parity audit
// flagged "V1's per-element swipe threshold override not replicated"; reading
// V1's real ttsh.js turned up three separate mismatches, all fixed here:
//
//  1. V1's defaults are swipe_h_threshold / swipe_v_threshold = 50px PER AXIS.
//     V2 used a single combined SWIPE_MIN_PX = 30, so a 30-49px drag fired a
//     swipe on V2 that V1 would have ignored.
//  2. V1 honours data-xthreshold / data-ythreshold per element, and gives the
//     PARENT's value precedence over the element's own (that is how a
//     swipeable list sets one threshold for all of its rows).
//  3. V1 picks direction by testing up, right, down, left in that order with
//     each test overwriting the last, so on a diagonal the later test wins.
//     V2 picked the dominant axis instead, which can disagree with V1.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

function freshDOM() {
    const dom = new JSDOM(
        `<!doctype html><body><div id="parent"><div id="target"></div></div><script>${bundleSrc}</script></body>`,
        {
            url: 'http://127.0.0.1:19992/', runScripts: 'dangerously',
            beforeParse(window) {
                window.URL.createObjectURL = () => 'blob:test';
                window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
                window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
            }
        }
    );
    return dom.window;
}

function pointerEvent(win, type, x, y) {
    const e = new win.Event(type, { bubbles: true, cancelable: true });
    e.clientX = x; e.clientY = y; e.pointerId = 1; e.isPrimary = true;
    return e;
}

// Drags from (0,0) by (dx,dy) on #target and returns which swipe events fired.
function drag(win, dx, dy) {
    const el = win.document.getElementById('target');
    const fired = [];
    ['swipe', 'swipeleft', 'swiperight', 'swipeup', 'swipedown', 'swipeend']
        .forEach(t => el.addEventListener(t, () => fired.push(t)));
    el.dispatchEvent(pointerEvent(win, 'pointerdown', 0, 0));
    el.dispatchEvent(pointerEvent(win, 'pointermove', dx, dy));
    el.dispatchEvent(pointerEvent(win, 'pointerup', dx, dy));
    return fired;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

setTimeout(() => {
    // --- default per-axis threshold is V1's 50, not V2's old 30 ---
    {
        const win = freshDOM();
        const fired = drag(win, 60, 0);
        check('a 60px horizontal drag fires swipe + swiperight (over V1\'s 50px default)',
            fired.includes('swipe') && fired.includes('swiperight'), JSON.stringify(fired));
    }
    {
        const win = freshDOM();
        const fired = drag(win, 40, 0);
        check('a 40px horizontal drag fires NO swipe (V1 ignores under-50; V2\'s old 30px default fired here)',
            fired.length === 0, JSON.stringify(fired));
    }
    {
        const win = freshDOM();
        const fired = drag(win, 0, -60);
        check('a 60px upward drag fires swipeup', fired.includes('swipeup'), JSON.stringify(fired));
    }

    // --- per-element data-xthreshold override ---
    {
        const win = freshDOM();
        win.document.getElementById('target').setAttribute('data-xthreshold', '100');
        const fired = drag(win, 60, 0);
        check('data-xthreshold="100" suppresses a 60px drag', fired.length === 0, JSON.stringify(fired));
    }
    {
        const win = freshDOM();
        win.document.getElementById('target').setAttribute('data-xthreshold', '100');
        const fired = drag(win, 130, 0);
        check('data-xthreshold="100" still allows a 130px drag',
            fired.includes('swiperight'), JSON.stringify(fired));
    }

    // --- parent's value wins over the element's own (V1's exact rule) ---
    {
        const win = freshDOM();
        win.document.getElementById('parent').setAttribute('data-xthreshold', '200');
        win.document.getElementById('target').setAttribute('data-xthreshold', '10');
        const fired = drag(win, 130, 0);
        check('the PARENT\'s data-xthreshold takes precedence over the element\'s own',
            fired.length === 0, JSON.stringify(fired));
    }
    {
        const win = freshDOM();
        win.document.getElementById('parent').setAttribute('data-ythreshold', '150');
        const fired = drag(win, 0, 200);
        check('parent data-ythreshold applies to the vertical axis independently',
            fired.includes('swipedown'), JSON.stringify(fired));
    }

    // --- a non-numeric / zero override falls back to the default, per V1 ---
    {
        const win = freshDOM();
        win.document.getElementById('target').setAttribute('data-xthreshold', 'abc');
        const fired = drag(win, 60, 0);
        check('a non-numeric data-xthreshold falls back to the 50px default',
            fired.includes('swiperight'), JSON.stringify(fired));
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}, 400);
