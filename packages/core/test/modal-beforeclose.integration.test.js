// Regression test for the 2026-09-23 fix: @modal-beforeclose's real,
// active handler (lstnrs.js's [close-modal] click handler) only ever
// checked `typeof window[_bv] === "function"` where `_bv` is the RAW
// attribute value including any "(...)" — so it only worked for a bare
// function name (`@modal-beforeclose="myVeto"`), and had NO else branch
// at all for the parameterized-call form (`@modal-beforeclose=
// "myVeto()"`) that's the normal convention used by every other
// @-attribute in this codebase (@click="fn()", @sort-stop="fn()", ...).
// That form was silently never evaluated at all — the modal just closed
// unconditionally, no error, no veto. Also had 5 leftover debug cl()
// calls (cl("kuku")/cl("sasha")/etc.) from whatever earlier session
// wrote it. Found via the V1-vs-V2 parity dashboard audit (item
// @modal-beforeclose was flagged "missing" by that pass, but the real
// finding on inspection was "present but broken for the common call
// shape", not absent).
//
// Fixed by routing through evalEvAttr() — the real, established
// handler-resolution mechanism every other @-attribute already uses —
// instead of perpetuating the old hand-rolled, half-implemented version.
//
// Fixture: a minimal real DOM structure matching what the [close-modal]
// handler actually reads (el.closest("popup") -> its id -> the real
// [modal][data-modal=id] owner element) — doesn't need the full
// open-modal templating flow, since [close-modal]'s own handler never
// touches it.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

function buildDom(ownerAttrs) {
    return new JSDOM(
        `<!doctype html><body>
            <div modal data-modal="m1" id="opener" ${ownerAttrs}></div>
            <popup id="m1"><button close-modal>Close</button></popup>
            <script>${bundleSrc}</script>
        </body>`,
        {
            url: 'http://127.0.0.1:19995/', runScripts: 'dangerously',
            beforeParse(window) {
                window.URL.createObjectURL = () => 'blob:test';
                window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
                window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
            }
        }
    );
}

const results = [];
function check(name, cond, detail) { results.push({ name, cond: !!cond, detail }); }

function clickCloseAndCheck(dom, setupScript, expectClosed, label) {
    const win = dom.window;
    // The real removal (data-modal stripped, popup element removed) is
    // gated on `index > -1` in popups.modals — only ever populated by
    // the real open-modal flow (lstnrs.js ~L403), which this fixture
    // deliberately skips (the [close-modal] handler itself never reads
    // anything the open flow set up besides this array and the DOM
    // structure already built into the fixture). Simulate "already open".
    win.popups.modals.push(win.document.getElementById('m1'));
    win.eval(setupScript);
    const btn = win.document.querySelector('[close-modal]');
    btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const opener = win.document.getElementById('opener');
    const stillOpen = opener.getAttribute('data-modal') === 'm1';
    check(label, expectClosed ? !stillOpen : stillOpen, 'data-modal after click = ' + JSON.stringify(opener.getAttribute('data-modal')));
}

// 1. Parameterized-call form (the actual bug) — vetoing (returns false)
{
    const dom = buildDom('@modal-beforeclose="vetoClose()"');
    clickCloseAndCheck(dom, `window.__vetoCalls = 0; window.vetoClose = function () { window.__vetoCalls++; return false; };`, false,
        'parameterized @modal-beforeclose="vetoClose()" — a real veto (returns false) blocks the close');
    check('the veto function was actually called', dom.window.__vetoCalls === 1, 'calls=' + dom.window.__vetoCalls);
}

// 2. Parameterized-call form, allowing the close (returns non-false)
{
    const dom = buildDom('@modal-beforeclose="allowClose()"');
    clickCloseAndCheck(dom, `window.allowClose = function () { return true; };`, true,
        'parameterized @modal-beforeclose="allowClose()" — a non-veto (returns true) lets the modal close');
}

// 3. Bare function-name form — confirm it still works (no regression)
{
    const dom = buildDom('@modal-beforeclose="vetoCloseBare"');
    clickCloseAndCheck(dom, `window.vetoCloseBare = function (ev, el, owner) { return false; };`, false,
        'bare-name @modal-beforeclose="vetoCloseBare" (the form that already worked pre-fix) still vetoes correctly');
}

// 4. No @modal-beforeclose attribute at all — modal closes normally
{
    const dom = buildDom('');
    clickCloseAndCheck(dom, ``, true,
        'no @modal-beforeclose attribute — modal closes normally, unaffected');
}

let pass = 0, fail = 0;
for (const r of results) {
    if (r.cond) { pass++; console.log('PASS  ' + r.name); }
    else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
