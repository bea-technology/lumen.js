// Regression test for a real, confirmed bug (2026-09-22): cookies.
// removeItem("key") — the real, documented, no-extra-args call shape —
// silently never deleted anything. setItem() always defaults a missing
// sPath to "/" before writing the cookie, but removeItem() left a
// missing sPath out of its own expiring-cookie write entirely, which the
// browser then scopes to the CURRENT page's path — a different cookie
// scope from the real one (`path=/`) whenever the page isn't already at
// the site root. The expiring write silently created and discarded an
// unrelated cookie while the real one survived untouched. Found live,
// testing the real /guide/storage/cookies demo page: clicking "remove"
// left the cookie in document.cookie completely unchanged.
//
// This loads the real built bundle in jsdom (cookies is defined in
// vendor/reconnecting-websocket.js, using real document.cookie — jsdom
// implements this correctly) rather than reproducing the logic by hand.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

const dom = new JSDOM(
    `<!doctype html><body><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:19997/guide/storage/cookies', runScripts: 'dangerously',
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

// setItem(key, value) with no explicit path — the real, documented,
// common call shape (matching the real guide demo's own usage).
win.cookies.setItem('demoKey', 'TestName');
check('setItem() with no explicit path really sets the cookie', win.document.cookie.indexOf('demoKey=TestName') !== -1, win.document.cookie);
check('hasItem() sees it', win.cookies.hasItem('demoKey') === true);

win.cookies.removeItem('demoKey');
check('removeItem() with no explicit path (the real bug) actually removes the cookie', win.document.cookie.indexOf('demoKey=') === -1, win.document.cookie);
check('hasItem() no longer sees it after removal', win.cookies.hasItem('demoKey') === false);

// A second, unrelated cookie set at the same default path must survive
// an unrelated removeItem() call — proves the fix targets the right
// cookie, not a blanket path="" that would coincidentally also clear
// everything.
win.cookies.setItem('otherKey', 'stays');
win.cookies.removeItem('demoKeyThatWasNeverSet');
check('removeItem() on a key that was never set is a safe no-op', win.document.cookie.indexOf('otherKey=stays') !== -1, win.document.cookie);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
