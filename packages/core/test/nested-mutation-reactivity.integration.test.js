// Regression test, evolved across the 2026-09-21 fixes in order — kept
// as ONE file since each fix supersedes/extends the previous one's
// behavior for the exact same "globals" variable rather than being
// unrelated:
//
// Fix 1 (original version of this test): touch(name) + a fixed
// setGlobals(x) that also writes into _vt.Global.vars.globals — made
// EXPLICIT update patterns (a real setGlobals() call; reassigning a
// tracked var to itself) reactive. A raw nested mutation or a raw bare
// reassignment, with NEITHER of those called, still did nothing.
//
// Fix 2 (globals-deep-reactivity.integration.test.js): _deepReactive()
// wraps `globals` recursively, so a RAW nested mutation (globals.x = y,
// no setGlobals()/touch() at all) now auto-updates too — the
// overwhelmingly common real V1 pattern.
//
// Fix 3 (this update): found immediately after Fix 2 shipped, on a real
// page where NOTHING updated, not even once — a real project's index.js
// does `globals = { _version };` (a bare RE-ASSIGNMENT of the identifier
// itself, not a nested mutation, and not through setGlobals()) as a
// completely reasonable version-mismatch reset pattern. A bare
// reassignment can't be caught by wrapping the VALUE (Fix 2's approach)
// — only intercepting the ASSIGNMENT ITSELF works, which needs `globals`
// to be an accessor property on `window`, not a plain `var`. See that
// fix's own comment in vendor/reconnecting-websocket.js for the full
// design (including why the setter needs an identity-check guard against
// infinite recursion with _dispatchVarsUpdate's own window-mirroring).
//
// Net result as of Fix 3: raw nested mutations AND raw bare
// reassignments BOTH auto-update with zero calls to touch()/setGlobals()
// — this test's own assertions below were flipped from their original
// "does NOT auto-update" form to confirm that. touch()/setGlobals()
// remain valid, still-working, still-tested APIs (not superseded) —
// setGlobals() additionally persists to localStorage, which a bare
// reassignment deliberately does not (matching real V1 semantics: a
// bare window.globals mutation was never expected to survive a reload
// on its own).
//
// Fixture is real fcs.js parser output for a minimal
// {{globals.locale.link_guide[globals.Settings.Language]}} view, same
// established reasoning as every other *.integration.test.js in this
// suite.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const hst = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/nested-mutation.hst.json'), 'utf8'));

function freshDOM() {
    const dom = new JSDOM(
        `<!doctype html><body><div id="root"></div><script>${bundleSrc}</script></body>`,
        {
            url: 'http://127.0.0.1:19991/', runScripts: 'dangerously',
            beforeParse(window) {
                window.URL.createObjectURL = () => 'blob:test';
                window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
            }
        }
    );
    return dom;
}

let pass = 0, fail = 0;
function report(results) {
    for (const r of results) {
        if (r.cond) { pass++; console.log('PASS  ' + r.name); }
        else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
    }
}

function runPart1(done) {
    const dom = freshDOM();
    const win = dom.window;
    win.__hst = hst;

    const mainScript = `
    window.__results = [];
    function check(name, cond, detail) { window.__results.push({ name, cond: !!cond, detail }); }
    try {

    // Plain object literal, matching how real bootstrap actually assigns
    // globals (clone(JSON.parse(...))) -- goes through the real
    // window.globals accessor (vendor/reconnecting-websocket.js), which
    // wraps it via _deepReactive() and syncs _vt.Global.vars.globals
    // automatically. NOT read back through the _vt Proxy chain here (that
    // would double-wrap it in an unrelated, unnecessary proxy layer).
    globals = { Settings: { Language: "en" }, locale: {} };

    var view = new _v({ name: "test", type: "main", hst: window.__hst, vars: {}, rvs: ["globals"] });
    var engine = new _lm(view);
    _vt.View = view;
    engine.reactiveVariables = ["globals"];
    engine.renderAll();
    var root = document.getElementById("root");
    root.append.apply(root, engine._RealDOM);
    var textNode = document.getElementById("target");

    check("initial render is empty (data not loaded yet)", textNode.textContent.trim() === "", textNode.textContent);

    // 1. A raw nested mutation, with no touch()/setGlobals() call at all,
    // now auto-updates (Fix 2, _deepReactive()).
    globals["locale"] = { link_guide: { en: "RAW MUTATION" } };
    check("a raw nested mutation alone DOES auto-update the DOM", textNode.textContent.trim() === "RAW MUTATION", textNode.textContent);

    // 2. touch() remains a valid, still-working API (not superseded) --
    // just no longer strictly necessary for this case.
    touch("globals");
    check("touch() after an already-applied mutation is a harmless no-op (still no error, same value)", textNode.textContent.trim() === "RAW MUTATION", textNode.textContent);

    // 3. A raw BARE REASSIGNMENT (globals = {...}, not a nested mutation,
    // no setGlobals() call) now ALSO auto-updates (Fix 3, the
    // window.globals accessor property) -- this is the real pattern a
    // real project's index.js legitimately does for a version-mismatch
    // reset, and is what neither Fix 1 nor Fix 2 covered on its own.
    globals = { Settings: { Language: "en" }, locale: { link_guide: { en: "BARE REASSIGN" } } };
    check("a raw bare reassignment alone DOES auto-update the DOM", textNode.textContent.trim() === "BARE REASSIGN", textNode.textContent);
    check("that bare reassignment did NOT itself persist to localStorage (matches real V1 semantics -- only setGlobals() persists)", localStorage.getItem("globals") === null || JSON.parse(localStorage.getItem("globals")).locale?.link_guide?.en !== "BARE REASSIGN", localStorage.getItem("globals"));

    // 4. setGlobals() still works exactly as before, AND is still the
    // one that persists to localStorage.
    localStorage.removeItem("globals");
    setGlobals({ Settings: { Language: "en" }, locale: { link_guide: { en: "Via setGlobals" } } });
    check("setGlobals() updates the DOM too", textNode.textContent.trim() === "Via setGlobals", textNode.textContent);
    check("setGlobals() actually persists to localStorage", JSON.parse(localStorage.getItem("globals")).locale.link_guide.en === "Via setGlobals");

    // 5. Real end-to-end path: the actual BEA Locale class, not just a
    // hand-called fix.
    var loc = new Locale({ l: "en" });
    loc.tsdk = { l: "en", request: function () { return Promise.resolve({ results: [{ Key: "link_guide", en: "Via real Locale.get()" }] }); } };
    loc.get();

    } catch (e) {
        window.__results.push({ name: 'no uncaught error', cond: false, detail: (e && e.stack) || String(e) });
    }
    `;
    const scriptEl = win.document.createElement('script');
    scriptEl.textContent = mainScript;
    win.document.body.appendChild(scriptEl);

    setTimeout(() => {
        const followUp = `
        try {
            var textNode = document.getElementById("target");
            check("the real Locale class's own async resolution updates the DOM too", textNode.textContent.trim() === "Via real Locale.get()", textNode.textContent);
            check("Locale.get() also preserved the OTHER existing globals key (Settings) rather than wiping it", globals.Settings && globals.Settings.Language === "en", JSON.stringify(globals));
        } catch (e) {
            window.__results.push({ name: 'no uncaught error (follow-up)', cond: false, detail: (e && e.stack) || String(e) });
        }
        `;
        const followUpEl = win.document.createElement('script');
        followUpEl.textContent = followUp;
        win.document.body.appendChild(followUpEl);

        setTimeout(() => {
            report(win.__results || []);
            done();
        }, 200);
    }, 200);
}

runPart1(() => {
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail === 0 ? 0 : 1);
});
