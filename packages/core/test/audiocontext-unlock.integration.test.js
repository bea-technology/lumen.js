// Covers the "AudioContext mobile-autoplay unlock" parity item (present in V2
// as a byte-identical port of V1, but never individually tested).
//
// A suspended AudioContext may only be resumed from a real user gesture, so
// V1 unlocked one on the first click/touch/tap. V1 called `new AudioContext()`
// bare; since this handler runs on EVERY click, any environment without the
// unprefixed constructor threw on every click of the page's life. Guarded
// 2026-09-26, with the webkitAudioContext fallback V1 never had.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

function freshDOM(installAudio) {
    const dom = new JSDOM(
        `<!doctype html><body><button id="b">go</button><script>${bundleSrc}</script></body>`,
        {
            url: 'http://127.0.0.1:19990/', runScripts: 'dangerously',
            beforeParse(window) {
                window.URL.createObjectURL = () => 'blob:test';
                window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
                installAudio(window);
            }
        }
    );
    return dom.window;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

setTimeout(() => {
    // --- normal case: a suspended context gets resumed on first click ---
    {
        const state = { made: 0, resumed: 0 };
        const win = freshDOM((w) => {
            w.AudioContext = function () {
                state.made++;
                this.state = 'suspended';
                this.resume = () => { state.resumed++; this.state = 'running'; return Promise.resolve(); };
            };
        });
        const btn = win.document.getElementById('b');
        btn.dispatchEvent(new win.Event('click', { bubbles: true }));
        check('a real click constructs an AudioContext', state.made === 1, 'made=' + state.made);
        check('a suspended AudioContext is resumed from that gesture', state.resumed === 1, 'resumed=' + state.resumed);

        btn.dispatchEvent(new win.Event('click', { bubbles: true }));
        check('a second click reuses the same context rather than constructing another',
            state.made === 1, 'made=' + state.made);
    }

    // --- webkit-only environment (older Safari) ---
    {
        const state = { made: 0 };
        const win = freshDOM((w) => {
            delete w.AudioContext;
            w.webkitAudioContext = function () { state.made++; this.state = 'running'; this.resume = () => Promise.resolve(); };
        });
        let threw = null;
        try {
            win.document.getElementById('b').dispatchEvent(new win.Event('click', { bubbles: true }));
        } catch (e) { threw = e.message; }
        check('a webkit-only environment falls back to webkitAudioContext', state.made === 1, 'made=' + state.made);
        check('and does not throw', threw === null, String(threw));
    }

    // --- neither constructor available: must be a silent no-op, not a throw ---
    {
        const win = freshDOM((w) => { delete w.AudioContext; delete w.webkitAudioContext; });
        const errs = [];
        win.addEventListener('error', (e) => errs.push(e.message));
        let threw = null;
        try {
            win.document.getElementById('b').dispatchEvent(new win.Event('click', { bubbles: true }));
        } catch (e) { threw = e.message; }
        check('with no AudioContext at all, a click is a silent no-op instead of throwing (V1 threw here)',
            threw === null && errs.length === 0, String(threw) + ' ' + JSON.stringify(errs));
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}, 400);
