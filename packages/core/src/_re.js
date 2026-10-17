// `cl` is normally aliased in vendor/reconnecting-websocket.js (`var cl =
// console.log;`), but that file is concatenated AFTER this one (see
// build/bundle.js) — and this file's own Proxy traps below call `cl(e)` in
// their catch handlers. That's reachable before the vendor file ever runs:
// index-bootstrap.js (also after this file, before the vendor one) can
// trigger _x()'s `set` trap (e.g. `_vt.Global.vars["x"] = ...` from a
// compiled index.js) before any view exists, which throws internally
// (`_vt.View._re` is undefined) and get caught right here — if `cl` isn't
// defined yet at that point, the catch handler itself throws, aborting
// whatever script called it (found 2026-09-14 testing against a real
// running dev server). Harmless if vendor/reconnecting-websocket.js's own
// `var cl = console.log;` runs later too — same value, redeclaration is a
// no-op.
var cl = console.log;

// 2026-09-22: V1's own real mustache-rendering heuristic (SBEACDN/
// s.beacdn.com/beajs/re.js) — a rendered mustache value is treated as
// real HTML when it looks like a tag or a named/numeric entity. See
// _lm.prototype.applyTextEffect for where this is used.
var LumenJS_HTML_SNIFF_RE = /([&][a-zA-Z]*[;]+)|<\/?[a-z][\s\S]*>/im;

class _v {
    static name;
    static type;
    static vars;
    static fns;
    static rvs;
    static _pv;
    static mx;
    static views;
    static hst;
    static settings;
    constructor(obj) {
        this.name = obj.name ?? 'home';
        this.type = obj.type ?? 'main';
        this.hst = obj.hst ?? [];
        this.views = obj.views ?? [];
        this.vars = obj.vars ?? {};
        // 2026-09-17: per-instance event-handler functions (see walk.js's
        // matching addition, and lstnrs.js's evalEvAttr) — a subview's own
        // `function bump(){}` still becomes a real `window.bump` too (plain
        // <script>-tag semantics, unchanged), but multiple mounted
        // instances of the same subview file all define a same-named
        // function, so window.bump silently becomes whichever instance's
        // script ran last — every instance's @click ended up calling THAT
        // one instance's handler regardless of which was actually clicked.
        // .fns is this instance's own, unambiguous copy.
        this.fns = obj.fns ?? {};
        this.rvs = obj.rvs ?? {};
        this._pv = obj._pv ?? null;
        this.mx = obj.mx ?? [];
        this.settings = obj.settings ?? {
            layout: "default",
            requireAuth: false,
        };
    }
}

// Override console.log
const consoleLogOriginal = console.log;
console.log = function () {
    for (let i = 0; i < arguments.length; i++) {
        const arg = arguments[i];
        if (arg && arg.hasOwnProperty('__isProxy') || arg?.target) {
            arguments[i] = arguments[i].target;
        }
    }
    consoleLogOriginal.apply(console, arguments);
};

// ---- Central error reporting (2026-09-13) ----------------------------------
// Replaces scattered `catch(e){cl(e)}` sites that silently swallowed errors.
// Wired into a representative, developer-facing subset for now: expression
// evaluation (scopedEval/lookup/evalExp), the pre-rewrite validator in
// walk.js, and a compiled <script> block's own runtime errors. Not yet wired
// into every catch site in this file — that's a deliberate, incremental scope,
// not an oversight; the ones above are where a developer's own .view mistake
// actually surfaces, which is what this phase set out to fix.
//
// _lumenDevMode is a plain constant for now, not wired to a real build/env
// flag yet — flip it by hand until that decision is made.
var _lumenDevMode = true;
var _lumenErrorLog = [];
var _lumenLoggedExprs = {};

// 2026-09-21: every mounted subview's own engine instance (renderHST()'s
// 'sub' type — real view="..." mounts, NOT :for/:if "section" renders,
// which already propagate correctly via sbscrbs/subscribe()). Populated
// at mount time (see the 'sub' branch below, `el._re = _re;`), read by
// _dispatchVarsUpdate()'s Global-write branch — see that comment for the
// full story of why this exists: subviews turned out just as
// disconnected from ordinary update propagation as persistent widgets
// were, for the identical reason (renderHST() called with `_pv: null`).
// A plain array, not a WeakSet: iteration is the whole point here, and
// calling .update() on a since-unmounted instance's dead DOM is a
// harmless no-op (renderView()'s effects already tolerate disconnected
// nodes elsewhere in this file) — not worth the complexity of pruning
// entries on unmount for what's a rare, low-cost redundancy.
var _mountedSubviewEngines = [];

// HST wire-format version this runtime expects (2026-09-15) — must be
// bumped in lockstep with packages/cli/lib/fcs.js's HST_FORMAT_VERSION
// whenever this file's walk()/renderHST() changes what fields it reads
// from the parser's output. See renderView()'s version check and fcs.js's
// own HST_FORMAT_VERSION comment for the full rationale.
var EXPECTED_HST_FORMAT_VERSION = 3;
// v1 (script ESTree in `jst`) and v2 (script source in `content`) payloads still render. v3 adds `pre`: the script
// already rewritten by `lm build`, with `_vt.__LMROOT__` standing for the mount's scope path.
var _HST_FORMATS_ACCEPTED = [1, 2, 3];

// V1 let a pure dotted path address array items and digit-led keys: `{{rows.0.name}}`, `{{sections.x.specs.2.Value}}`.
// That is not valid JavaScript, so eval() threw a SyntaxError (dev mode logged it as an error) and only the
// dotted-path fallback in lookup() produced the value. Rewriting the digit-led segments makes eval succeed directly.
function _numericPathToBrackets(expr) {
    if (typeof expr !== 'string' || !/\.\d/.test(expr) || !/^\s*[A-Za-z_$][\w$]*(?:\.[\w$]+)+\s*$/.test(expr)) return expr;
    return expr.replace(/\.(\d[\w$]*)/g, "['$1']");
}

var _entityDecodeEl;
function decodeHtmlEntities(str) {
    if (!str || str.indexOf('&') === -1) return str;
    if (!_entityDecodeEl) _entityDecodeEl = document.createElement('textarea');
    _entityDecodeEl.innerHTML = str;
    return _entityDecodeEl.value;
}

// `_vt.View.vars["x"]` is what a runtime error will mention after the
// walk.js rewrite — this recovers the developer's original name `x` so the
// message reads the way the developer would expect, not the compiled form.
function _translateLumenError(message) {
    if (!message) return message;
    return message.replace(/_vt\.View\.vars\[["'`]([^"'`\]]+)["'`]\]/g, '$1');
}

function reportLumenError(info) {
    info = info || {};
    var rawMessage = info.message || (info.error && info.error.message) || 'Unknown error';
    var entry = {
        time: new Date().toISOString(),
        stage: info.stage || 'runtime',
        view: info.view || (typeof _vt !== 'undefined' && _vt.View ? _vt.View.name : undefined),
        expr: info.expr,
        message: _translateLumenError(rawMessage),
        hint: info.hint
    };
    _lumenErrorLog.push(entry);

    if (_lumenDevMode && entry.stage === 'expression') {
        // V1 rendered a path into not-yet-loaded data as blank, silently, and
        // real V1 pages rely on that while their async data arrives. Log each
        // distinct expression once; that "not loaded yet" shape as a warning.
        var dedupeKey = (entry.view || '') + '|' + (entry.expr || '') + '|' + rawMessage;
        if (_lumenLoggedExprs[dedupeKey]) return entry;
        _lumenLoggedExprs[dedupeKey] = true;
        if (/ is not defined$/.test(rawMessage)) {
            console.warn('[LumenJS] "' + (entry.view || 'unknown') + '" — {{' + entry.expr + '}}: ' + entry.message + ' anywhere in scope, so it is shown as literal text.');
            return entry;
        }
        if (/Cannot read propert(y|ies) of (undefined|null)/.test(rawMessage)) {
            console.warn('[LumenJS] "' + (entry.view || 'unknown') + '" — ' + entry.expr + ' is empty for now (' + entry.message + '). Fine if its data is still loading.');
            return entry;
        }
    }
    if (_lumenDevMode) {
        console.error(
            '[LumenJS] ' + entry.stage + ' error in "' + (entry.view || 'unknown') + '"' +
            (entry.expr ? ' — ' + entry.expr : '') +
            ': ' + entry.message +
            (entry.hint ? '\n  ' + entry.hint : '')
        );
    }
    // Production stays quiet on-screen by design (point 6: don't crash the
    // page the way V1's uncaught errors did) — the entry is still kept in
    // _lumenErrorLog for later inspection; no telemetry hook wired yet.
    return entry;
}


function _x(_x) {
    // Native array mutators (shift/splice/sort/...) perform many internal
    // writes; each proxy carries its OWN path, and a mutator runs as one
    // write that dispatches once, with the final state.
    const _ARRAY_MUTATORS = { push: 1, pop: 1, shift: 1, unshift: 1, splice: 1, sort: 1, reverse: 1, fill: 1, copyWithin: 1 };
    // 2026-09-17: generalized from a position-specific check
    // (`currPath[1] == "vars"`, only ever matched a flat `_vt.<root>.vars`
    // write) to a real owner-walk — needed for per-instance subview
    // scoping (`_vt.View.views[i].vars`, and its nested form
    // `_vt.View.views[0].views[2].vars`), where "vars" can sit at any
    // depth. `currPath` is the writing proxy's own path (captured when that proxy was created).
    // `Global` is a real special case, not a bug in this generalization:
    // it has no `._re` of its own (see the object literal below — just
    // `{vars:{}}`) since Global-var writes need to re-render whichever
    // view is *currently* looking at that value, exactly like the
    // pre-existing behavior this preserves. Everything else (View itself,
    // or any views[i]/views[i].views[j]/... chain) is walked against the
    // raw (non-proxied) tree — using the outer `_x` param directly, not
    // the `_vt` proxy — so this traversal itself can't re-enter these
    // traps.
    function _dispatchVarsUpdate(key, currPath) {
        // "vars" can be anywhere in currPath, not just at index 1 — find
        // it. The var name to update() is whatever comes right after it
        // in currPath (e.g. `_vt.View.vars["obj"].nested = x` — the write
        // itself is on "obj"'s own proxy, so `key` here is "nested", but
        // the reactive var is "obj", one segment before it in currPath);
        // if "vars" is the *last* segment, there's no next segment yet —
        // that means this write IS the var (`_vt.View.vars["x"] = ...`),
        // so `key` itself (the set() trap's own key) is the var name.
        let varsIdx = currPath.indexOf("vars");
        if (varsIdx === -1) return;
        let varName = varsIdx < currPath.length - 1 ? currPath[varsIdx + 1] : key;
        let rootPath = currPath.slice(0, varsIdx);

        // 2026-09-22: `watch` (V1's real, documented global object for
        // variable-change callbacks — `watch = { myVar: function(){...} }`)
        // was declared (`var watch = {};`, vendor/reconnecting-
        // websocket.js) but never actually consulted anywhere — a
        // genuinely unimplemented feature, not a regression. Doesn't need
        // to be a Proxy itself: it's a plain lookup table (name ->
        // callback), not a reactive value that needs its own change-
        // tracking — what it actually needs is for the EXISTING reactive
        // dispatch (this function, the one place every tracked var write
        // — View, Global, Widgets, subviews — passes through exactly
        // once, regardless of how many mounted instances subsequently
        // call their own .update()) to check it. Fires once per real
        // Proxy write, not once per mounted instance, so a Global var
        // watched from a page with several widgets/subviews doesn't
        // multi-fire the callback.
        try {
            if (typeof watch !== 'undefined' && watch && Object.prototype.hasOwnProperty.call(watch, varName) && typeof watch[varName] === 'function') {
                watch[varName]();
            }
        } catch (e) { cl(e); }
        // Global has no ._re of its own (see its plain {vars:{}} literal
        // below) — a Global write always re-renders whichever view is
        // currently looking at it, exactly like the pre-existing behavior
        // this preserves, for both the flat and nested-property case.
        if (rootPath[0] === "Global") {
            // 2026-09-18, real gap found and fixed: this file's own design
            // comment above _vt's declaration says a Global var should be
            // usable by "ordinary view code" just by referencing the
            // name — but nothing ever made that true for a VIEW's own
            // <script> statements (as opposed to mustaches/:if conditions,
            // which already fall back to _vt.Global.vars via getVal()/
            // evalExp()'s own merge). A view's compiled script only
            // rewrites references to names IT ITSELF declares — it has no
            // way to know index.js declared some other name as Global, so
            // a bare reference to it (e.g. `rx.post(...)` where `rx =
            // new RX(...)` was set in index.js's init()) resolved via the
            // real JS scope chain, which only ever finds a real `window.rx`
            // if something put it there — nothing did. Mirroring every
            // Global write onto `window[varName]` too makes plain bare-
            // identifier references resolve correctly and naturally,
            // with zero per-script rewriting needed.
            try {
                if (typeof window !== 'undefined') window[varName] = _x.Global.vars[varName];
            } catch (e) { }
            if (_vt.View._re) _vt.View._re.update(varName);
            // 2026-09-21, real gap found and fixed: this only ever
            // updated the main View's own engine instance. A persistent
            // layout widget (_vt.Widgets, 2026-09-18) gets its OWN
            // separate ._re from its own renderHST() call — fixed first,
            // below. Then found the identical gap applies to ordinary
            // SUBVIEWS too (view="..." mounts), corrected from this
            // comment's own earlier, wrong claim that subviews "share the
            // parent View's single ._re" — real V1 project testing proved
            // otherwise: a subview's mustache reading a Global var also
            // never updated. Root cause, traced to renderHST()'s real call
            // sites: BOTH the widget mount (line ~2835) and the real
            // subview mount (line ~2746) construct their _v with `_pv:
            // null` — the one thing that would make the pre-existing
            // `this.view._pv.subscribe(this.view)` auto-registration
            // (used only by :for/:if "section" renders, whose renderHST
            // call correctly passes the real parent) ever fire. So a
            // subview's own ._re is just as disconnected from update()'s
            // `this.sbscrbs` walk as a widget's — it's stored on the DOM
            // element itself (`el._re`, set in the subview-mounting code)
            // rather than a central registry the way _vt.Widgets is,
            // which is why this needs a real DOM query rather than a
            // plain object loop: subviews can nest arbitrarily deep, and
            // a query for every element carrying the real `view`
            // attribute finds all of them regardless of depth in one
            // pass, without needing update() to itself recurse into
            // nested subviews that have the identical _pv:null gap.
            for (const regionName in _vt.Widgets) {
                if (_vt.Widgets[regionName] && _vt.Widgets[regionName]._re) {
                    _vt.Widgets[regionName]._re.update(varName);
                }
            }
            // real DOM attribute — view="..." is intentionally stripped
            // from actual rendered output (same treatment as :if/:for,
            // see walk()'s attribute pass), confirmed empirically: a
            // querySelectorAll('[view]')-based first attempt at this fix
            // found zero elements. _mountedSubviewEngines (this file's own
            // declaration comment has the full story) is the real fix.
            //
            // 2026-09-21 (cont'd): real, confirmed performance bug — every
            // RE-MOUNT of the same logical subview slot (a `view=`
            // attribute re-firing) pushes a NEW entry here without
            // removing the old one (see the push site's own comment). At
            // real-world scale this array grows unbounded, and every
            // single Global var write walks the WHOLE thing — found on a
            // real page (loops.view) that had accumulated 94 entries,
            // most already orphaned, causing 925 update("globals") calls
            // and multi-second render times for a handful of real writes.
            // Self-cleaning here instead of changing the push site: an
            // entry whose own rendered DOM is no longer connected to the
            // document is definitively stale (the newer mount's `el.
            // innerHTML = ""` already wiped it) — skip AND remove it in
            // the same pass, walked backwards so splicing mid-loop is
            // safe. An entry with no DOM at all (an empty subview) can't
            // be judged this way and is left alone — a rare, harmless
            // edge case, not worth a separate tracking mechanism.
            for (let msi = _mountedSubviewEngines.length - 1; msi >= 0; msi--) {
                let sve = _mountedSubviewEngines[msi];
                let sveNode = sve._RealDOM && sve._RealDOM[0];
                if (sveNode && !sveNode.isConnected) {
                    _mountedSubviewEngines.splice(msi, 1);
                    continue;
                }
                sve.update(varName);
            }
            _updateReactiveEngines(varName);
            return;
        }
        let owner = _x;
        for (let i = 0; i < rootPath.length && owner; i++) {
            owner = owner[rootPath[i]];
        }
        if (owner && owner._re) owner._re.update(varName);
        // A sub-view reads its ancestors' variables by name (getVal() falls through to them), as V1 sub-views read
        // the page's globals. Re-render the sub-views mounted under the view that changed; each one only touches
        // effects / loops / conditions that actually read `varName`.
        for (let msi = _mountedSubviewEngines.length - 1; msi >= 0; msi--) {
            const sve = _mountedSubviewEngines[msi];
            if (!sve || sve === (owner && owner._re)) continue;
            const sveNode = sve._RealDOM && sve._RealDOM[0];
            if (sveNode && !sveNode.isConnected) { _mountedSubviewEngines.splice(msi, 1); continue; }
            const sp = sve.view && sve.view.scopePath;
            if (!sp || sp.length <= rootPath.length) continue;
            let under = true;
            for (let i = 0; i < rootPath.length; i++) if (String(sp[i]) !== String(rootPath[i])) { under = false; break; }
            if (under) sve.update(varName);
        }
        _updateReactiveEngines(varName);
    }
    // Decides without reading any property of `v` (a brand check via Symbol.toStringTag pokes foreign Proxy
    // traps with a Symbol key; the SDK's `cookies` proxy throws on that): arrays, plain objects and instances of
    // user classes are wrapped; anything whose prototype chain has a native constructor (Date, Promise, Map, DOM...) is not.
    function _isWrappable(v) {
        if (Array.isArray(v)) return true;
        try {
            for (let p = Object.getPrototypeOf(v); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
                const c = Object.prototype.hasOwnProperty.call(p, 'constructor') ? p.constructor : null;
                if (typeof c !== 'function') continue;
                if (c.name === 'Object') return true;
                if (/\[native code\]/.test(Function.prototype.toString.call(c))) return false;
            }
        } catch (e) { return false; }
        return true;
    }
    let _batch = 0;
    function makeHandler(path) {
        // One proxy per (child object, key): rebuilding a Proxy + handler on every read was the
        // dominant cost of reading reactive state, and made `rows === rows` false.
        const childProxies = new WeakMap();
        return {
            get(target, key, receiver) {
                if (key == "__isProxy") return true;
                if (typeof key === 'symbol') return target[key];
                if (_ARRAY_MUTATORS[key] === 1 && Array.isArray(target) && typeof target[key] === 'function') {
                    return function () {
                        let res;
                        _batch++;
                        try { res = Array.prototype[key].apply(target, arguments); } finally { _batch--; }
                        if (!_batch) {
                            try { _dispatchVarsUpdate(key, path); } catch (e) { cl(e); }
                        }
                        return res === target ? receiver : res;
                    };
                }
                const v = target[key];
                if (typeof v === 'object' && v !== null && key != "_re") {
                    const hit = childProxies.get(v);
                    if (hit && hit.key === key) return hit.proxy;
                    // Only plain objects/arrays are wrapped: methods of Promise/Date/Map/Set/RegExp/DOM nodes
                    // need their real object as `this` and throw "incompatible receiver" under a Proxy.
                    // The one exception is a subview host element (isSub): generated subview code writes its
                    // locals as `_vt.View.views[n].vars[x] = ...`, and that write is only observed through the proxy.
                    if (!_isWrappable(v) && v.isSub !== true) return v;
                    const proxy = new Proxy(v, makeHandler(path.concat(key)));
                    childProxies.set(v, { key, proxy });
                    return proxy;
                }
                return v ?? (key == 'target' ? target : undefined) ?? undefined;
            },
            set(target, key, value) {
                target[key] = value;
                if (!_batch) {
                    try {
                        // `_vt.View._re` genuinely doesn't exist yet during
                        // index.js's own bootstrap (before any view has mounted),
                        // so the dispatch guards for it rather than throwing.
                        _dispatchVarsUpdate(key, path);
                    } catch (e) {
                        cl(e);
                    }
                }
                return true;
            },
            deleteProperty(target, key) {
                if (!(key in target)) {
                    return false;
                }
                delete target[key];
                if (!_batch) {
                    try {
                        _dispatchVarsUpdate(key, path);
                    } catch (e) {
                        cl(e);
                    }
                }
                return true;
            },
            ownKeys(target) {
                return Reflect.ownKeys(target);
            },
            has(target, key) {
                return key in target;
            },
            defineProperty(target, key, descriptor) {
                if (descriptor && "value" in descriptor) {
                    target[key] = descriptor.value;
                }
                return target;
            },
            getOwnPropertyDescriptor(target, key) {
                // Proxy invariant: a non-configurable target property (an array's 'length') must be reported as it really is, or V8 throws.
                const real = Reflect.getOwnPropertyDescriptor(target, key);
                if (real && !real.configurable) return real;
                const value = target[key];
                return key in target
                    ? {
                        value,
                        enumerable: true,
                        configurable: true,
                    }
                    : undefined;
            },
        };
    }
    const handler = makeHandler([]);
    var x = new Proxy(_x, handler);
    return x;
}

// "Global" (2026-09-14): a second, permanent root next to "View" — unlike
// _vt.View (replaced wholesale by a fresh _v() on every main-view navigation,
// see _lm's constructor below), this object is never reassigned, so state
// written here survives navigation. This is the target walk.js now rewrites
// index.js's top-level vars into, since index.js runs once at bootstrap and
// its vars (V1's documented convention for app-wide state like `isAdmin`)
// need to outlive any single view. concatVarsAtLevel() below merges it into
// every scope lookup so ordinary view code can just reference the name.
// 2026-09-17, real bug found and fixed: `.fns` was missing here (only
// `.vars` existed) — `walk.js`'s `_fnRegisterStatement()` (added for
// per-instance subview scoping, see the per-instance-scoping work above)
// unconditionally builds `<targetRoot>.fns["name"] = name;` for EVERY
// top-level function declaration, regardless of target — including
// `targetKey: "Global"`, used to compile index.js/project scripts. Any
// real project with so much as one function declaration in index.js (an
// extremely common pattern) crashed with "Cannot set properties of
// undefined (setting '<fnName>')" the moment that line ran. Nearly
// invisible in `lm serve` dev mode — index-bootstrap.js's synchronous XHR
// fetch-and-eval of the compiled index.js is wrapped in a try/catch that
// only `console.log`s the failure (never `console.error`/throws), so nothing
// looked broken as long as the crash landed after anything load-bearing
// (Reactor()) in that same script. Fatal in a real `lm build` production
// bundle, where the compiled index.js is concatenated inline, unguarded —
// an uncaught exception there aborts every remaining statement in the
// whole bundle file, breaking the entire app on every real production
// site with this pattern. Found deploying lumenjs.com's own real build.
// "Widgets" (2026-09-18): a third permanent root, sibling of Global/View,
// generalizing V1's hardcoded hasNav/hasHeader/hasFooter widget-loading past
// its fixed 3-name list — see renderView()'s layout branch below for the
// resolve/mount/diff logic, and fcs.js's annotateLayoutRegions() for how a
// layout's own bare attributes (e.g. `<nav nav>`) become the region names
// used to key this object. Deliberately NOT an ancestor of View in the
// scope tree (widget regions and [body] are DOM SIBLINGS under the layout
// root, never one containing the other — unlike a subview's real, singular
// parent, there's no single unambiguous "the" widget a view could shadow
// into) — each entry gets its own real `._re` instead (see
// _dispatchVarsUpdate's generic owner-walk below, which already handles
// this with zero special-casing once an entry has `._re` set, same as any
// subview). Starts empty; populated lazily, one entry per declared region
// name, the first time a layout using that region is mounted.
let _vt = _x({
    "View": new _v({}),
    "Global": { "vars": {}, "fns": {} },
    "Widgets": {}
});

// 2026-09-21: real, confirmed gap found migrating a real V1 project — the
// reactive Proxy (_x()) only fires its update-dispatch on a direct write
// to a tracked variable itself (_vt.Global.vars["x"] = ...); a NESTED
// mutation on an object a tracked variable happens to hold
// (_vt.Global.vars["x"].y = ...., or the bare-identifier-mirrored
// equivalent x.y = ...) never triggers anything, because it's an ordinary
// property write on a plain object, not a write through the Proxy's own
// `set` trap. This is a genuinely common real pattern — BEA's own
// Locale.get()/Section.get() below do exactly this
// (globals["locale"] = {...}, globals["sections"] = {...}), and any
// hand-written index.js/view script doing the equivalent for its own data
// would hit the identical silent "renders once, never updates" symptom.
// touch(name) is the fix for that: reassigning a tracked var to itself is
// still a real write through the `set` trap (confirmed — same object
// reference, but the trap doesn't skip same-reference writes), so this
// forces exactly the re-check a real reassignment would have triggered,
// without needing to actually clone/rebuild the object. Deliberately NOT
// a deeper fix (making _x() recursively proxy every nested object it
// returns, so ANY nested mutation anywhere is caught automatically) — that
// changes the core reactivity model's semantics for everything already
// built on it (widgets, per-instance subview scoping, HST versioning),
// real architectural weight, not something to change incidentally while
// fixing BEA's two known call sites.
function touch(name) {
    if (_vt.Global.vars.hasOwnProperty(name)) {
        _vt.Global.vars[name] = _vt.Global.vars[name];
    }
}

// 2026-09-21 (cont'd): touch()/setGlobals() above fix EXPLICIT re-syncs,
// but real V1 code overwhelmingly mutates `globals` the OTHER way —
// `globals.Me = "1234"`, a bare nested write, with no setGlobals() call
// at all (confirmed: this is what a real user hit immediately after the
// setGlobals()/touch() fix shipped — "it doesn't change and rerender").
// `globals` itself is a plain top-level `var` in vendor/reconnecting-
// websocket.js (`var globals = clone(JSON.parse(localStorage.getItem(
// "globals")))`), never routed through _vt's reactive Proxy at all except
// at the exact moments setGlobals() runs — so an ordinary nested property
// write on it is just a plain JS object mutation, invisible to anything.
//
// _deepReactive(obj, onChange) is a small, SEPARATE reactive-Proxy
// mechanism from _x()/_vt's — deliberately not reusing it, because _x()'s
// update-dispatch was originally built on a single shared, mutable path
// array (since replaced by a per-proxy path), and `globals` is held onto as
// a long-lived reference (the bare identifier itself, and window.globals)
// mutated arbitrarily later. So this wraps any object/array recursively (memoized
// per underlying target via a WeakMap, so repeated reads of the same
// nested value return the same Proxy instance — real object-identity
// comparisons on a Global var's own sub-objects still work) and fires
// `onChange()` on ANY set/delete at ANY depth — coarse-grained on purpose,
// matching touch()'s own "did something in this var change" semantics,
// not fine-grained per-field tracking (the only real consumer is a full
// re-render of whatever currently reads the var as a whole).
var _deepReactiveCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function _deepReactive(obj, onChange) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (_deepReactiveCache && _deepReactiveCache.has(obj)) return _deepReactiveCache.get(obj);
    var proxy = new Proxy(obj, {
        get(target, key) {
            var v = target[key];
            if (v !== null && typeof v === 'object' && typeof key !== 'symbol') {
                return _deepReactive(v, onChange);
            }
            return v;
        },
        set(target, key, value) {
            target[key] = value;
            onChange();
            return true;
        },
        deleteProperty(target, key) {
            if (key in target) delete target[key];
            onChange();
            return true;
        }
    });
    if (_deepReactiveCache) _deepReactiveCache.set(obj, proxy);
    return proxy;
}

// 2026-09-18: shared by getVal()/evalExp()/concatVarsAtLevel() below, so the
// "first-declared widget wins on a name collision" rule is defined exactly
// once. Object key iteration order for string keys is real insertion order,
// so this naturally checks widgets in the order they were first mounted —
// which, in practice, is document order (renderView()'s layout branch walks
// `hstL.regions`, itself built in document order by fcs.js's
// annotateLayoutRegions()).
function _lookupInWidgets(name) {
    for (const wname in _vt.Widgets) {
        if (_vt.Widgets[wname].vars.hasOwnProperty(name)) return _vt.Widgets[wname].vars[name];
    }
    return undefined;
}

// 2026-09-21: @click (and every other @-event handler, lstnrs.js's
// evalEvAttr()) has never actually been able to mutate a reactive var via
// an inline expression — @click="isLoggedIn = !isLoggedIn",
// @click="age++" — found testing real lumenjs.com guide content, whose
// own demo buttons do exactly this and silently did nothing on click, no
// console error at all. evalEvAttr()'s fallback for anything that isn't
// a real named function call was a completely bare `eval(_v)` — no
// scope/context injection whatsoever. This happened to work for NAMED
// FUNCTION calls (@click="bump", the only pattern
// click-events.integration.test.js ever exercised) because top-level
// function declarations stay real, window-attached globals by design
// (walk.js deliberately never rewrites those, so onclick="fn()"-style
// handlers keep working) — but a reactive var (declared with `var`,
// rewritten by walk.js into _vt.View.vars[...]/_vt.View.views[i]
// .vars[...]/_vt.Global.vars[...]) has no such real, bare identifier
// anywhere for a plain eval() to find, let alone write back to.
//
// Fixed with a scope-aware evaluator using `with` + a Proxy — the one
// mechanism that can make a bare identifier's READS *and* WRITES route
// through the reactive system, since `with` resolves each identifier via
// the object's own property traps (get/set/has), not real lexical scope.
// get()'s priority mirrors concatVarsAtLevel()'s existing read order
// (Global < Widgets < the triggering element's own owner view's vars);
// set() walks the SAME real _vt Proxy chain (via the owner's own
// scopePath, the exact mechanism renderView()/renderHST() already use to
// address a subview instance's nested vars) so a write actually triggers
// _dispatchVarsUpdate() and a real re-render, not a silent no-op on a
// detached plain object. has() only claims a name actually found in one
// of those three tiers — anything else (a real global function like
// `st`/`$`, a :for-loop-scoped `item`, ...) correctly falls through to
// the real enclosing scope, completely unaffected by this.
//
// `with` is otherwise forbidden in strict-mode code — confirmed safe
// here: nothing in this bundle's own top-level execution scope declares
// "use strict" (the one hit, vendor/astring.js, is scoped to its own
// IIFE and doesn't affect this file).
function _resolveScopePathTarget(scopePath) {
    let target = _vt;
    for (let i = 0; i < scopePath.length; i++) target = target[scopePath[i]];
    return target;
}
// `locals` are the handler's own arguments (ev, el, n, arg1..3). V1 eval'd inline handlers inside
// evalEvAttr(), so those names were in scope and shadowed any global of the same name.
function _evalEventScopedExpr(ownerRe, expr, locals) {
    locals = locals || {};
    let hasOwner = !!(ownerRe && ownerRe.view);
    // Every engine from the owner up (a :for row -> the view that holds the loop -> ...): a handler reads and writes
    // a name where it lives, so `@click="picked = r"` on a row reads the row's `r` and writes the view's `picked`.
    // A level that IS the view at its scopePath is read/written through the live _vt proxy, so nested writes
    // (`city.name = 'x'`, `list.push(1)`) re-render; a row's own scope is written in place and the row updated.
    let levels = [];
    for (let e = hasOwner ? ownerRe : null, n = 0; e && e.view && n < 50; e = e.view._pv, n++) {
        let live = null;
        if (e.view.scopePath) {
            try {
                let _sv = _resolveScopePathTarget(e.view.scopePath);
                if (_sv && _sv._re === e) live = _sv.vars;
            } catch (err) { live = null; }
        }
        levels.push({ re: e, vars: e.view.vars || {}, live: live });
    }
    function levelOf(key) {
        for (let i = 0; i < levels.length; i++) if (Object.prototype.hasOwnProperty.call(levels[i].vars, key)) return levels[i];
        return null;
    }
    let widgetsVars = hasOwner ? _mergedWidgetsVars() : {};
    // The owner's own functions (nearest view up the parent chain) win over window: with the same sub-view mounted
    // twice, `@click="inc()"` must call the clicked instance's inc, not whichever instance's script ran last.
    function ownFn(key) {
        for (let i = 0; i < levels.length; i++) {
            const fns = levels[i].re.view.fns;
            if (fns && Object.prototype.hasOwnProperty.call(fns, key) && typeof fns[key] === 'function') return fns[key];
        }
        return undefined;
    }
    // `ev` and `el` are the handler's documented locals. The others evalEvAttr passes (`n`, the event's name, and
    // `arg1`..`arg3`) are internal, so a page or loop variable with that name wins: `:for="names as n"` with
    // `@click="n = n + '!'"` used to read and write the event name instead of the row's `n` (2026-10-08).
    function isLocal(key) {
        if (!locals.hasOwnProperty(key)) return false;
        if (key === 'ev' || key === 'el' || key.indexOf('__lm') === 0 || !hasOwner) return true;
        return !(levelOf(key) || ownFn(key));
    }
    let scopeProxy = new Proxy({}, {
        has(target, key) {
            if (typeof key === 'symbol') return false;
            if (locals.hasOwnProperty(key)) return true;
            if (!hasOwner) return false;
            if (ownFn(key)) return true;
            return !!levelOf(key) || widgetsVars.hasOwnProperty(key) || _vt.Global.vars.hasOwnProperty(key);
        },
        get(target, key) {
            if (isLocal(key)) return locals[key];
            const f = ownFn(key);
            if (f) return f;
            const lv = levelOf(key);
            if (lv) return lv.live ? lv.live[key] : lv.vars[key];
            if (widgetsVars.hasOwnProperty(key)) {
                for (const wname in _vt.Widgets) if (_vt.Widgets[wname].vars.hasOwnProperty(key)) return _vt.Widgets[wname].vars[key];
            }
            return _vt.Global.vars[key];
        },
        set(target, key, value) {
            if (isLocal(key)) { locals[key] = value; return true; }
            try {
                const lv = levelOf(key);
                if (lv) {
                    if (lv.live) lv.live[key] = value;
                    else { lv.vars[key] = value; try { lv.re.update(key); } catch (e2) { cl(e2); } }
                } else if (widgetsVars.hasOwnProperty(key)) {
                    for (const wname in _vt.Widgets) {
                        if (_vt.Widgets[wname].vars.hasOwnProperty(key)) {
                            _vt.Widgets[wname].vars[key] = value;
                            break;
                        }
                    }
                } else {
                    _vt.Global.vars[key] = value;
                }
            } catch (e) { cl(e); }
            return true;
        }
    });
    function _runWithScope(expr) {
        with (scopeProxy) { return eval(expr); }
    }
    if (locals.__lmNoWriteBack) return _runWithScope(expr);
    let rows = _lmRowSnapshots(levels);
    let result = _runWithScope(expr);
    if (rows.length) {
        _lmRowWriteBack(rows);
        // `@click="save(t)"` with an async save(): changes made after its first await are saved when it settles.
        if (result && typeof result.then === 'function') result.then(function () { _lmRowWriteBack(rows); }, function () { _lmRowWriteBack(rows); });
    }
    return result;
}

// 2026-10-08: a :for row's variables are copies of the list's items (the loop renders from a clone, which its
// diff needs). `@click="t.done = !t.done"`, `@click="toggle(t)"` or, in a bare `:for="todos"`, `done = !done` used
// to change only that copy, so nothing happened. V1 behaved the same; V2 now saves the change into the real item,
// as a Vue developer would expect: after a row's handler runs, each property of the row's item (alias, or a spread
// key) that changed is written to `<list>[index].<prop>` in the scope that owns the list, which re-renders it.
// Only changed properties are written, so values a copy can't carry (Dates, class instances) stay intact. A list
// that isn't a plain variable path (`todos.filter(...)`, a number) can't be written to; a dev-mode warning says so.
var _lmRowPathRe = /^\s*[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*|\[\s*\d+\s*\])*\s*$/;
var _lmRowWarned = {};
function _lmRowJson(v) {
    try { return JSON.stringify(v === undefined ? null : v); } catch (e) { return null; }
}
function _lmRowSnapshots(levels) {
    let rows = [];
    for (let i = 0; i < levels.length; i++) {
        let re = levels[i].re, info = re && re._lmRow;
        if (!info) continue;
        let vars = levels[i].vars, forX = info.forX || {}, as = forX.as || {};
        let names = [];
        if (info.isObj) {
            let vName = as.v ? as.v : (as.k ? '' : 'value');
            if (vName) names.push({ name: vName, whole: true });
        } else {
            if (as.k) names.push({ name: as.k, whole: true });
            // The item's own keys are spread into the row's scope as well.
            let item = as.k ? vars[as.k] : null;
            let src = item && typeof item === 'object' && !Array.isArray(item) ? item : null;
            for (let k in vars) {
                if (!Object.prototype.hasOwnProperty.call(vars, k) || k === as.k || k === forX.dx || k === 'index' || k === 'key' || k === 'value') continue;
                if (src ? Object.prototype.hasOwnProperty.call(src, k) : !as.k) names.push({ name: k, whole: false });
            }
        }
        let snap = {};
        for (let n = 0; n < names.length; n++) snap[names[n].name] = _lmRowJson(vars[names[n].name]);
        rows.push({ re: re, vars: vars, info: info, names: names, snap: snap });
    }
    return rows;
}
function _lmRowWriteBack(rows) {
    for (let r = 0; r < rows.length; r++) {
        let row = rows[r], vars = row.vars, info = row.info, js = info.forX && info.forX.js;
        let owner = row.re.view && row.re.view._pv;
        let pos = info.isObj ? vars.key : vars.index;
        for (let n = 0; n < row.names.length; n++) {
            let name = row.names[n].name, now = _lmRowJson(vars[name]);
            if (now === row.snap[name]) continue;
            let before = row.snap[name];
            row.snap[name] = now;
            if (!owner || typeof js !== 'string' || !_lmRowPathRe.test(js) || pos === undefined) {
                if (_lumenDevMode && !_lmRowWarned[js]) {
                    _lmRowWarned[js] = true;
                    console.warn('[LumenJS] A change to a row of :for="' + js + '" was not saved: the list is not a variable. ' +
                        'Loop over a variable, or change the item in the list itself (list[i].prop = value).');
                }
                continue;
            }
            let value = vars[name];
            try {
                if (!row.names[n].whole) {
                    _evalEventScopedExpr(owner, '(' + js + ')[__lmPos][__lmProp] = __lmVal', { __lmPos: pos, __lmProp: name, __lmVal: clone(value), __lmNoWriteBack: true });
                } else if (value && typeof value === 'object' && !Array.isArray(value)) {
                    let old = null;
                    try { old = JSON.parse(before); } catch (e) { old = null; }
                    if (!old || typeof old !== 'object' || Array.isArray(old)) {
                        _evalEventScopedExpr(owner, '(' + js + ')[__lmPos] = __lmVal', { __lmPos: pos, __lmVal: clone(value), __lmNoWriteBack: true });
                        continue;
                    }
                    for (let k in value) {
                        if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
                        if (_lmRowJson(value[k]) === _lmRowJson(old[k])) continue;
                        _evalEventScopedExpr(owner, '(' + js + ')[__lmPos][__lmProp] = __lmVal', { __lmPos: pos, __lmProp: k, __lmVal: clone(value[k]), __lmNoWriteBack: true });
                    }
                    for (let k in old) {
                        if (Object.prototype.hasOwnProperty.call(old, k) && !Object.prototype.hasOwnProperty.call(value, k))
                            _evalEventScopedExpr(owner, 'delete (' + js + ')[__lmPos][__lmProp]', { __lmPos: pos, __lmProp: k, __lmNoWriteBack: true });
                    }
                } else {
                    _evalEventScopedExpr(owner, '(' + js + ')[__lmPos] = __lmVal', { __lmPos: pos, __lmVal: clone(value), __lmNoWriteBack: true });
                }
                _lmRowTouch(owner, js);
            } catch (e) { cl(e); }
        }
    }
}
// A nested write is re-rendered by the reactive proxy when the list lives in a view; a list held by an enclosing
// :for row (a nested loop) is a plain copy, so that row is told to update.
function _lmRowTouch(owner, js) {
    let root = /^\s*([A-Za-z_$][\w$]*)/.exec(js);
    if (!root) return;
    root = root[1];
    for (let e = owner, n = 0; e && e.view && n < 50; e = e.view._pv, n++) {
        if (!e.view.vars || !Object.prototype.hasOwnProperty.call(e.view.vars, root)) continue;
        if (e._lmRow) { try { e.update(root); } catch (err) { cl(err); } }
        return;
    }
}

// concatVarsAtLevel() below merges via object spread, not the loop-with-
// break shape _lookupInWidgets() uses — spread's "later wins" needs the
// widgets merged in REVERSE declaration order so the first-declared widget
// still wins a name collision, matching _lookupInWidgets()'s own semantics
// exactly (both must agree, since getVal()/evalExp() use one and
// concatVarsAtLevel()/lookup()/scopedEval() use the other for the same read).
var _scopedEvalFns = new Map();
var _SVG_NS = "http://www.w3.org/2000/svg";
// xlink:href / xmlns:* on an SVG element only take effect when set in their namespace.
function _lmSetAttr(el, name, val) {
    if (el && el.namespaceURI === _SVG_NS) {
        if (name.indexOf("xlink:") === 0) return el.setAttributeNS("http://www.w3.org/1999/xlink", name, val);
        if (name === "xmlns" || name.indexOf("xmlns:") === 0) return el.setAttributeNS("http://www.w3.org/2000/xmlns/", name, val);
    }
    el.setAttribute(name, val);
}
// Effect key for a mustache that reads no reactive variable ({{2+3}}, {{location.pathname}}): rendered once by
// renderAll(), never matched by update(k). Without it such a mustache had no effect at all and stayed blank.
var _CONST_EFFECT = "\u0000const";
function _mergedWidgetsVars() {
    let out = {};
    let widgets = _vt.Widgets;
    let names = Object.keys(widgets);
    for (let i = names.length - 1; i >= 0; i--) {
        Object.assign(out, widgets[names[i]].vars);
    }
    return out;
}

class _lm {
    _RealDOM = [];
    _effects = {};
    _cc = {};
    _jj = {};
    _ready = false;
    view = undefined;
    sbscrbs = [];
    reactiveVariables = [];
    vrs = {};
    _CXR = [];
    _LXR = [];

    constructor(view) {
        this.view = view;
        this.view._re = this;
        this.reactiveVariables = view?.rvs ?? {};
        this.init();
        if (this.view.type == "main") _vt.View = this.view;

        // this.reactiveVariables = this.view.vars ?? _vt.View.vars ?? [];

        if (this.view._pv) {
            // cl("Subscribing to " , this.view);
            this.view._pv.subscribe(this.view);
        }

        return this;
    }

    init() {
        var par = this;
        this.view.hst.forEach(function (doc) {
            par.walk(doc, null);
        });
    }

    subscribe(view) {
        this.sbscrbs.push(view);
    }

    scopedEval(context, expr, kk) {
        // cl("Cleaning", expr, kk, context);
        // 2026-09-14: `ctx` was read/deleted here before its own `let ctx =`
        // declaration a few lines down — a real TDZ bug (ReferenceError:
        // Cannot access 'ctx' before initialization), not something either
        // of us introduced. Only triggers on the TypeError-retry path (a
        // failed eval retrying with the offending property stripped), which
        // is common enough — any expression touching a property of
        // something momentarily undefined hits it. Fixed by computing `ctx`
        // first, same effect, no TDZ violation.
        let ctx = this.concatVarsAtLevel(context, this);
        expr = _numericPathToBrackets(expr);
        if (kk) {
            if (!ctx.hasOwnProperty(kk)) return undefined;
            delete ctx[kk];
        }
        // cl("CONTEXT");
        // cl(context);
        // cl(ctx);
        try {
            // cl(["LopIsMissing???", context, expr]);
            const ctxKeys = Object.keys(ctx);
            // Compiling a fresh Function for every mustache of every row dominated render time;
            // the compiled function depends only on the parameter names, so reuse it.
            const evalKey = ctxKeys.join("\u0001");
            let evaluator = _scopedEvalFns.get(evalKey);
            if (!evaluator) {
                evaluator = Function.apply(null, [...ctxKeys, "expr", "return eval(expr)"]);
                if (_scopedEvalFns.size >= 500) _scopedEvalFns.clear();
                _scopedEvalFns.set(evalKey, evaluator);
            }
            // cl(evaluator.apply(null, [...Object.values(context), expr]));
            // if(expr=="patientProfile['Gender']") alert([evaluator.apply(null, [...Object.values(context), expr]), expr, Object.keys(context), context['patientProfile'], Object.keys(context.patientProfile)]);
            return evaluator.apply(null, [...Object.values(ctx), expr]);
        } catch (e) {
            // if (_debugMode)
            // cl([expr, context, e]);
            // 2026-09-21, real bug found and fixed: `e.message.split(" ")
            // [0]` was meant to extract the ctx key responsible, but this
            // branch only ever catches TypeError — whose real V8 message
            // is "Cannot read properties of undefined (reading 'Y')". Its
            // first word is always literally "Cannot", never a real ctx
            // key, so `!ctx.hasOwnProperty(kk)` was always true and this
            // returned undefined immediately on the very next call —
            // never an actual, working retry, for any realistic TypeError
            // (confirmed real: an unset Global var like `globals`, passed
            // to the evaluator as an explicit `undefined` parameter,
            // SHADOWS the real, correctly-populated value already sitting
            // in the true enclosing scope — see getVal()'s own 2026-09-21
            // fix for the fuller story of how a name ends up in `ctx` as
            // undefined in the first place). Real fix: on a TypeError,
            // strip every ctx key whose OWN value is undefined/null and
            // retry ONCE (not recursively — the key set only shrinks, and
            // one retry already covers this and any similar future case
            // without risking a loop) — this lets an unset name fall
            // through to real JS scope resolution, which is what should
            // happen when a value genuinely isn't known here.
            if (e instanceof TypeError && !kk) {
                let hadUndefined = false;
                let strippedCtx = {};
                for (const k2 in ctx) {
                    if (ctx[k2] === undefined || ctx[k2] === null) { hadUndefined = true; continue; }
                    strippedCtx[k2] = ctx[k2];
                }
                if (hadUndefined) {
                    try {
                        const evaluator2 = Function.apply(null, [
                            ...Object.keys(strippedCtx),
                            "expr",
                            "return eval(expr)",
                        ]);
                        return evaluator2.apply(null, [...Object.values(strippedCtx), expr]);
                    } catch (e2) {
                        // The retry dropped every null/undefined name, so a ReferenceError naming a key
                        // that IS in this scope means "declared but currently empty" (`items = undefined`,
                        // then `{{items.length}}`): blank like V1, not "exists nowhere" (literal text).
                        const m2 = e2 instanceof ReferenceError && /^([\w$]+) is not defined$/.exec(e2.message);
                        if (m2 && Object.prototype.hasOwnProperty.call(ctx, m2[1])) {
                            reportLumenError({ stage: 'expression', expr: expr, error: e });
                            return undefined;
                        }
                        if (e2 instanceof ReferenceError) this._lastUnresolved = true;
                        reportLumenError({ stage: 'expression', expr: expr, error: e2 });
                        return undefined;
                    }
                }
            }
            if (e instanceof ReferenceError) this._lastUnresolved = true;
            reportLumenError({ stage: 'expression', expr: expr, error: e });
            return undefined;
        }
    }

    // A text mustache naming something that exists nowhere (not loading
    // data — a ReferenceError) stays literal, as V1 left any mustache
    // outside its bind= list: real V1 prose/code samples rely on that.
    _inForRow() {
        for (let r = this, n = 0; r && n < 50; r = r.view && r.view._pv, n++) {
            if (r._blankUnresolved) return true;
            if (r.vrs && Object.keys(r.vrs).length) return true;
            let v = r.view;
            if (v && v.type === 'section' && v.vars && Object.keys(v.vars).length) return true;
        }
        return false;
    }

    _textMustache(content) {
        this._lastUnresolved = false;
        let v = this.getVal(content);
        let unresolved = this._lastUnresolved && (v === undefined || v === null || v === '');
        this._lastUnresolved = false;
        if (!unresolved) return v;
        // Inside a :for row V1 always rendered an unresolvable mustache blank (rows only existed inside bind= lists,
        // which evaluate in a try/catch that falls back to ""): an item lacking a field must not show raw `{{field}}`.
        if (this._inForRow()) return v;
        let raw = String(content);
        return /^\s*\{\{[\s\S]*\}\}\s*$/.test(raw) ? raw : '{{' + raw + '}}';
    }

    getVals(effect) {
        let val = '';
        // let mss = [];
        if (effect.type == "text") {
            if (!effect.isSplit) {
                for (let i = 0; i < effect.splits.length; i++) {
                    let split = effect.splits[i];
                    if (split.type == 'mustache') {
                        val += this._textMustache(split.content);
                    } else {
                        val += split.content;
                    }
                }
            } else {
                val = this._textMustache(effect.content);
            }
        } else if (effect.type == "attr" || effect.type == "event") {
            for (let i = 0; i < effect.splits.length; i++) {
                let split = effect.splits[i];
                if (split.type == 'mustache') {
                    val += this.getVal(split.content);
                } else {
                    val += split.content;
                }
            }
            // mss = effect.mss[effect.name];
        }

        // for (let i = 0; i < mss.length; i++) {
        // const ms = "{{" + mss[i] + "}}";
        // cl(ms, this.getVal(ms, _.cloneDeep(_vt.View.vars)));
        // val = val.split(ms).join(this.getVal(ms, _.cloneDeep(this.reactiveVariables)));
        // }

        return val;
    }

    renderAll() {
        if (this._ready) return; //CHECK APPLICABILITY
        this._ready = true;


        for (const rv in this._effects) {
            if (Object.prototype.hasOwnProperty.call(this._effects, rv)) {
                const effects = this._effects[rv];
                for (let ei = 0; ei < effects.length; ei++) {
                    const effect = effects[ei];
                    // cl("Effect for " + rv, effect);
                    // effect.nd.textContent = "1234";

                    if (!effect.nd) continue;
                    // if (!effect.nd.isConnected) continue;
                    try {
                        if (effect.type == "text") {
                            // cl(k, effect);
                            this.applyTextEffect(effect);
                        } else if (effect.type == "attr") {
                            // cl("Setting Attr", k, effect, effect.name, this.render(effect));
                            if (effect.name == "value") {
                                effect.nd.value = this.render(effect);
                            } else {
                                _lmSetAttr(effect.nd, effect.name, this.render(effect));
                                if (effect.name == "view") {
                                    effect.nd.subPath = this.render(effect);
                                    renderView(this.render(effect), true, {});
                                }
                            }
                        } else if (effect.type == "event") {
                            effect.nd.events[effect.name] = this.render(effect);
                        }
                    } catch (e) {
                        cl("Eeeeee", e);
                    }
                }
            }
        }


        this.updateCXRs();
        this.updateLXRs();
        this.updateVXRs();

        // 2026-09-18: same Reactor({tick}) fix as update() below — also
        // fired on the very first render (not just subsequent reactive
        // updates), since a real tick() use (e.g. hljs.highlightAll())
        // needs to run on initial content too, not just after the first
        // change.
        if (typeof appSettings !== 'undefined' && appSettings && typeof appSettings.tick === 'function') {
            try {
                appSettings.tick();
            } catch (e) {
                cl(e);
            }
        }
    }

    chainConnected(cx) {
        for (let i = cx.chain.length - 1; i >= 0; i--) {
            const cxs = cx.chain[i];
            if (cxs.ref.isPreConnected) {
                return true;
            }
        }
        return false;
    }

    async updateVXRs(k) {
        let subsNames = [];
        for (let i = 0; i < this.view.views.length; i++) {
            const _view = this.view.views[i];
            if (!subsNames.includes(_view.subPath)) subsNames.push(_view.subPath);
        }
        if (!subsNames.length) return;
        // A view's <script> only runs once its DOM is inserted into the
        // document. When this engine's own DOM is still detached (a subview
        // nested inside another subview mid-construction), mounting children
        // now would render them before the parent script declared the data
        // they read. Wait until it's connected, bounded (~2s) so an orphaned
        // engine doesn't retry forever.
        if (this._RealDOM && this._RealDOM.length && !this._RealDOM.some(function (nd) { return nd && nd.isConnected; })) {
            this._vxrWaits = (this._vxrWaits || 0) + 1;
            if (this._vxrWaits <= 200) setTimeout(() => this.updateVXRs(k), 10);
            return;
        }
        this._vxrWaits = 0;
        // cl(subsNames);
        // 2026-09-17: real bug found and fixed — this used to always call
        // the plain, no-args renderView(n, true, {}), which only ever
        // searches _vt.View.views (the MAIN view's own array). That's
        // correct when `this` IS the main view, but updateVXRs() also
        // runs on every SUBVIEW instance's own _re (renderAll() calls it
        // unconditionally) — for a subview that itself hosts further
        // subviews, `this.view.views` holds THOSE, not the main view's,
        // so the old call could never find them: nested subviews never
        // rendered at all. Passing this.view.views + this.view.scopePath
        // (set once, in renderHST(), when this instance itself was
        // rendered — ["View"] for the main view, unchanged) lets
        // renderView() search the RIGHT array and address the RIGHT
        // nested scope regardless of how deep this instance is.
        for (let i = 0; i < subsNames.length; i++) {
            const n = subsNames[i];
            renderView(n, true, {}, 'views', this.view.views, this.view.scopePath || ["View"]);
        }
    }

    // V1 rule, kept for V1 sites: a leading '!' negates the WHOLE rest of the condition (`!a == 'x'` is
    // `!(a == 'x')`, not JS's `(!a) == 'x'`), and a condition that throws counts as false before the
    // negation, so `!list[0].hasOwnProperty('id')` is true while `list` is still empty.
    _evalCondition(expr) {
        if (typeof expr === 'string' && expr.charAt(0) === '!') {
            return !this.evalExp(expr.substring(1), this.reactiveVariables);
        }
        return this.evalExp(expr, this.reactiveVariables);
    }

    async updateCXRs(k) {
        for (let i = 0; i < this._CXR.length; i++) {
            const cx = this._CXR[i];
            if (cx.name == "if") {
                let isTrue = this._evalCondition(cx.content);
                // cl("IF", isTrue, cx.content, this.reactiveVariables, cx);
                if (isTrue) {
                    await this.showSectionCX(cx, k);
                } else {
                    await this.hideSectionCX(cx);
                }
            } else if (cx.name == "else-if") {
                if (!this.chainConnected(cx)) {
                    let isTrue = this._evalCondition(cx.content);
                    // cl("ELSE-IF", isTrue, cx.content, this.reactiveVariables, cx);
                    if (isTrue) {
                        await this.showSectionCX(cx, k);
                    } else {
                        await this.hideSectionCX(cx);
                    }
                } else {
                    await this.hideSectionCX(cx);
                }
            } else if (cx.name == "else") {
                // cl("ELSE", !this.chainConnected(cx), cx);
                if (!this.chainConnected(cx)) {
                    await this.showSectionCX(cx, k);
                } else {
                    await this.hideSectionCX(cx);
                }
            }

        }
    }

    // @before-render / @after-render for :if/:else-if/:else (2026-09-14) —
    // shared by all three updateCXRs() branches above. This runs on EVERY
    // reactive update those branches are eligible for, not just when the
    // condition actually flips — `cx.ref.node.isConnected` (a real, always-
    // accurate DOM property) is what gates hook firing to genuine
    // hidden->visible / visible->hidden transitions, not `isPreConnected`
    // (an internal bookkeeping flag with more edge cases across the
    // if/else-if/else chain than is worth relying on here).
    async showSectionCX(cx, k) {
        let wasConnected = cx.ref.node.isConnected;
        cx.ref.isPreConnected = true;
        await renderSection(cx.ref, cx.doc, this, k);
        if (!wasConnected) await fireRenderHook(cx, 'after-render', cx.ref.node, { visible: true });
    }

    async hideSectionCX(cx) {
        if (cx.ref.node.isConnected) await fireRenderHook(cx, 'before-render', cx.ref.node, { visible: false });
        cx.ref.isPreConnected = false;
        cx.ref.node.replaceWith(cx.ref);
    }

    render(effect) {
        let x = "";

        try {
            if (effect.type == "text" || effect.type == "attr" || effect.type == "event") {
                x = this.getVals(effect);
            }
        } catch (e) {
            cl(e);
        }

        return x;
    }

    // 2026-09-22: real V1-vs-V2 behavior difference, confirmed by reading
    // V1's own real source directly (SBEACDN/s.beacdn.com/beajs/re.js) —
    // a mustache whose rendered value looks like real HTML markup or a
    // named/numeric entity gets rendered as actual parsed markup (matching
    // V1's own real heuristic and clone-element approach exactly, not a
    // blanket unconditional innerHTML — that would be needlessly unsafe
    // for the overwhelming majority of mustaches, which are plain text).
    // A bare Text node (effect.nd) has no .innerHTML, so the HTML case
    // renders into a small sibling <span> positioned right before the
    // anchor node instead, matching V1's own real "clone" element
    // approach; the anchor's own text content is cleared to "" so it
    // doesn't duplicate the content. The clone is reused across updates
    // when the value stays HTML-shaped, and removed the moment a value
    // stops being HTML-shaped (falls back to plain, safe textContent).
    applyTextEffect(effect) {
        // 2026-09-22, real bug found and fixed testing this same feature:
        // a single mustache effect object is pushed into this._effects
        // under EVERY reactive var name its expression references (e.g.
        // `{{result[index]}}` registers under both "result" and "index")
        // — renderAll()/update() then process that SAME effect object
        // once per key it's registered under. Using `_htmlClone.
        // isConnected` to decide "do I already have a real clone"
        // doesn't work during the INITIAL render pass: the whole subtree
        // is still detached from `document` at that point (not yet
        // appended by the caller), so `.isConnected` is false for a
        // clone this function itself already inserted moments ago on the
        // first of these repeat calls — creating a second, duplicate
        // clone. A plain existence check is correct: once a clone
        // exists, reuse it regardless of live-document attachment state.
        // 2026-10-03: the clone is also remembered on the text node itself.
        // The same node can be driven by more than one effect object (a
        // nested view rendered by more than one engine, e.g.
        // console.roxyon.com's overview tab), and each one used to create its
        // own <span>: the quota donuts were drawn twice, side by side. V1 has
        // exactly one clone per mustache.
        let val = this.render(effect);
        let nd = effect.nd;
        let clone = effect._htmlClone || nd._lmHtmlClone || null;
        if (LumenJS_HTML_SNIFF_RE.test(val)) {
            nd.textContent = "";
            if (!clone) {
                clone = document.createElement("span");
                nd.before(clone);
            }
            effect._htmlClone = nd._lmHtmlClone = clone;
            clone.innerHTML = val;
        } else {
            if (clone) {
                clone.remove();
                effect._htmlClone = nd._lmHtmlClone = null;
            }
            nd.textContent = val;
        }
    }

    update(k) {
        if (!this._ready) return;
        // cl("Hello", k);


        // cl(k, this._effects.hasOwnProperty(k));

        if (this._effects.hasOwnProperty(k)) {
            const effects = this._effects[k];
            // cl(effects);
            for (let ei = 0; ei < effects.length; ei++) {
                const effect = effects[ei];
                // cl("Effect for " + k, effect);
                // effect.nd.textContent = "1234";

                if (!effect.nd) continue;
                // if (!effect.nd.isConnected) continue;
                try {
                    if (effect.type == "text") {
                        // cl(k, effect);
                        this.applyTextEffect(effect);
                    } else if (effect.type == "attr") {
                        // cl("Setting Attr", k, effect, effect.name, this.render(effect));
                        if (effect.name == "value") {
                            effect.nd.value = this.render(effect);
                        } else {
                            _lmSetAttr(effect.nd, effect.name, this.render(effect));
                            if (effect.name == "view") {
                                effect.nd.subPath = this.render(effect);
                                renderView(this.render(effect), true, {});
                            }
                        }
                    } else if (effect.type == "event") {
                        effect.nd.events[effect.name] = this.render(effect);
                    }
                } catch (e) {
                    cl("Eeeeee", e);
                }
            }
        }

        this.updateCXRs(k);
        this.updateLXRs(k);
        for (let sbscsi = 0; sbscsi < this.sbscrbs.length; sbscsi++) {
            const sbscr = this.sbscrbs[sbscsi];
            sbscr._re.update(k);
        }

        // 2026-09-18: Reactor({tick}) — documented ("runs after every
        // re-render, anywhere", lumenjs-spec.md §5.4/llms.md §3) but never
        // actually called anywhere in this runtime — see this fix's fuller
        // comment at Reactor()'s own definition (vendor/reconnecting-
        // websocket.js) for how this was found. update() is the real
        // per-reactive-change render point (unlike renderAll(), which only
        // ever runs once per _lm instance, at initial mount) — this is
        // where "after every re-render, anywhere" actually lives. Guarded
        // on appSettings existing since update() can fire during index.js's
        // own bootstrap, before Reactor() has run.
        if (typeof appSettings !== 'undefined' && appSettings && typeof appSettings.tick === 'function') {
            try {
                appSettings.tick();
            } catch (e) {
                cl(e);
            }
        }
    }

    // True when this loop's source expression reads the reactive variable `k`: the whole expression
    // (`rows`), a dotted path (`data.items`, `g.items`) or any expression using it (`rows.filter(...)`).
    // Matching only the exact text left every non-bare loop stale. Cached per loop and name.
    _forReads(cx, k) {
        const js = cx.forX['js'];
        if (js === k) return true;
        const cache = cx._reads || (cx._reads = {});
        if (k in cache) return cache[k];
        let hit = false;
        if (typeof k === 'string' && k !== '') {
            // :for-limit / :for-offset / :for-if can read view vars too (`:for-offset="{{(page-1) * 15}}"`).
            const src = [js, cx.limit, cx.offset, cx.cond].filter((s) => typeof s === 'string').join('\n');
            hit = new RegExp('(^|[^\\w$.])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w$])').test(src);
        }
        return (cache[k] = hit);
    }

    // V1 rendered attribute mustaches before reading :for-limit / :for-offset, so `{{(current - 1) * 15}}`
    // arrived as a number. Resolve them here; a value without mustaches is returned unchanged.
    _forNum(raw) {
        if (typeof raw !== 'string' || raw.indexOf('{') === -1) return raw;
        const self = this;
        return raw.replace(/\{\s*\{\s*([\s\S]*?)\s*\}\s*\}/g, function (_, expr) {
            let v;
            try { v = self.getVal(expr, ""); } catch (e) { v = ""; }
            return v === undefined || v === null ? "" : String(v);
        }).trim();
    }

    async updateLXRs(k) {
        for (let i = 0; i < this._LXR.length; i++) {
            var cx = this._LXR[i];

            var forX = cx.forX;

            if (k && !this._forReads(cx, k)) continue;

            // 2026-09-21: real bug found and fixed — updateLXRs is async
            // and does `await this.createSection(...)` per item inside its
            // own "add" loop below. On a page with many cascading reactive
            // updates (confirmed via direct tracing on a real page: up to
            // hundreds of update() calls firing within a few seconds), a
            // SECOND, overlapping call for the SAME cx can start while the
            // FIRST is still mid-await. Both then read the same stale
            // cx.atr, both independently compute "add" actions for the
            // same items, and both concurrently insert DOM nodes and write
            // into cx.ref.nodes[keyed] — corrupting which node is tracked
            // for which key and silently losing earlier items entirely.
            // Found on a real :for="3" demo that only ever rendered 2 of 3
            // items. A simple per-cx re-entrancy guard: if this cx is
            // already being processed by an in-flight call, skip it for
            // THIS call — the in-flight call finishes processing the
            // CURRENT data itself; anything that changed meanwhile is
            // picked up by the next real update() call regardless.
            // A change arriving mid-pass is remembered and re-run once the
            // pass finishes — nothing guarantees another update() comes
            // (e.g. `items = data; items[i].x = y` in one tick).
            if (cx._updating) { cx._dirty = true; continue; }
            cx._updating = true;
            try {

            var val = this.getVal(forX['js'], "");

            // cl("FORR", cx, val);

            var tempVal = [];
            if (this.typeStr(val) == "number") {
                for (let i = 0; i < val; i++) {
                    tempVal.push(i);
                }
                val = tempVal;
            }


            let vals = [];
            let isObj = false;
            if (this.typeStr(val) == "object") {
                isObj = true;

                for (const oKey in val) {
                    if (Object.hasOwnProperty.call(val, oKey)) {
                        const item = val[oKey];
                        let objj = {
                            key: oKey,
                            value: item,
                        };
                        vals.push(objj);
                    }
                }
            } else vals = clone(val);

            // An empty (or non-array) value must still run the diff below so the rows rendered
            // by the previous pass are removed; it used to be skipped, leaving stale rows forever.
            if (this.typeStr(vals) != "array") vals = [];
            {
                // cl("ARRAY", cx.ref, vals);
                let forIf = cx.cond;
                let limit = vals.length;
                let offset = 0;
                const cxLimit = this._forNum(cx.limit);
                const cxOffset = this._forNum(cx.offset);
                if (cxLimit) limit = (isNaN(cxLimit) ? cxLimit : limit) > vals.length ? vals.length : cxLimit * 1;
                if (cxOffset) offset = (isNaN(cxOffset) ? cxOffset : offset) < 0 ? 0 : cxOffset * 1;


                let marray = [];
                if (forIf) {
                    marray = vals.slice(offset * 1, vals.length);
                } else {
                    marray = vals.slice(offset * 1, limit * 1 + offset * 1);
                }

                // cl(cx, vals, limit, offset, forIf, marray);

                let myLimit = 0;
                // let myClones = [];

                let arrayToRender = [];
                let arrayToRenderVXs = [];

                for (var index = 0; index < marray.length; index++) {
                    if (myLimit == limit * 1) break;
                    try {
                        let vx = {}; //clone(_vt.View.vars);
                        // 2026-10-08: the row index is the item's position in the array (plus :for-offset), as in
                        // V1 — not its position among the rows shown. With :for-if / :for + :if filtering rows out,
                        // `items[i]` in a handler used to address a different item than the row clicked.
                        vx['index'] = offset * 1 + index * 1;
                        if (forX['dx'] != "") vx[forX['dx']] = offset * 1 + index * 1;
                        if (isObj) {
                            if (forX['as']['v'] != "") {
                                if (forX['as']['k']) vx[forX['as']['k']] = marray[index]['key'];
                                if (forX['as']['v']) vx[forX['as']['v']] = marray[index]['value'];
                            } else {
                                if (forX['as']['k']) vx[forX['as']['k']] = marray[index];
                            }
                            vx['key'] = marray[index]['key'];
                            vx['value'] = marray[index]['value'];
                        } else {
                            if (forX['as']['k']) vx[forX['as']['k']] = marray[index];
                            // 2026-10-02: V1's createClone() spread an object item's own keys into the row scope
                            // ALWAYS — with or without `as alias`, after the alias — so `:for="sectors as sector"`
                            // with `{{Text}}` / `{{Category}}` in the template rendered the item's fields (dv2). V2
                            // only spread for the bare form; `{{Text}}` then fell through to the DOM's Text constructor.
                            // 2026-09-17, real bug found and fixed: a bare
                            // `:for="items"` (no `as item` alias) is
                            // documented — and was V1's real, working
                            // behavior — to spread each item's own object
                            // keys directly into loop scope, so
                            // `items = [{number:1}]` lets a mustache read
                            // `{{number}}` with no alias at all. Nothing in
                            // this branch ever did that spread — `vx` had
                            // no alias key AND no spread keys, so a bare
                            // mustache like this always evaluated as an
                            // undefined identifier and silently rendered
                            // blank. Only spread for a plain-object item —
                            // a primitive (string/number) array item has no
                            // keys to spread and is read via the untouched
                            // alias path instead.
                            if (marray[index] && typeof marray[index] === 'object' && !Array.isArray(marray[index])) {
                                for (const k2 in marray[index]) {
                                    if (Object.prototype.hasOwnProperty.call(marray[index], k2)) {
                                        vx[k2] = marray[index][k2];
                                    }
                                }
                            }
                        }
                        // cl(forX, vx);
                        // cl("VXXXX", vx, this);

                        if (forIf) {
                            // 2026-09-17, real bug found and fixed:
                            // evalExp()'s 2nd param is a NAMES array to
                            // look up in _vt.View.vars/_vt.Global.vars (see
                            // its other real call site, `this.evalExp(cx.content,
                            // this.reactiveVariables)`) — but `vx` here is
                            // a VALUES object (the just-built loop-item
                            // scope), not a names array. `vars.length` on a
                            // plain object is undefined, so evalExp's own
                            // `for (i=0; i<vars.length; i++)` loop never
                            // ran even once — every `:for-if` condition
                            // referencing the loop item (`item.value > 10`,
                            // the exact documented example) always
                            // evaluated against an empty scope and either
                            // threw (caught, filtered out) or read
                            // `undefined`. evalExp() already has a real,
                            // working mechanism for exactly this — it
                            // merges `this.vrs` (the loop-scope override
                            // object) at the highest priority — so route
                            // through that instead of a second, broken
                            // parameter shape.
                            let _prevVrs = this.vrs;
                            this.vrs = vx;
                            let isTrue;
                            try {
                                isTrue = this.evalExp(forIf, []);
                            } finally {
                                this.vrs = _prevVrs;
                            }
                            if (!isTrue) continue;
                        }

                        let miIndexx = offset * 1 + index * 1;


                        // let cln = this.createSection(cx, vx, forX, k);
                        arrayToRender.push(marray[index]);
                        arrayToRenderVXs.push(vx);
                        // let basket = await renderSection(cx.ref, cx.doc, this, k, {
                        //     cx, vx, forX, miIndexx
                        // });
                        // cl(basket);
                        // cl([
                        //     cx.ref.isConnected,
                        //     cx.ref.node.isConnected,
                        //     cx,
                        //     "REAL INDEX: " + myLimit,
                        //     miIndexx,
                        //     forIf,
                        //     isObj,
                        //     forX,
                        //     vx
                        // ]);
                        myLimit++;
                    } catch (e) {
                        cl(e);
                    }
                }

                // cl("ATR", arrayToRender);
                let oldATR = cx.atr;
                // 2026-09-17, real bug found and fixed: cx.atr used to
                // store a reference to arrayToRender's own item objects,
                // not an independent snapshot — arrayToRender's items are
                // the actual current elements of the reactive array (e.g.
                // _vt.View.vars["features"]), so a completely ordinary
                // update pattern (mutate an item in place inside .map(),
                // return the same reference — `f.done = !f.done; return
                // f;`, not "rebuild a new object") left oldATR and the
                // next render's arrayToRender pointing at the exact same,
                // already-mutated objects by the time compareArrays()
                // ran. deepCompare()'s JSON.stringify comparison was
                // never wrong — it was comparing an object against
                // itself, so every 'update' action was silently lost and
                // the DOM never re-rendered. clone() (already used a few
                // lines above for `vals`) gives cx.atr a true independent
                // snapshot instead. Found clicking a real @click-toggled
                // :for item on lumenjs.com's own real V2 homepage — no
                // existing test used an in-place item mutation, only
                // whole-array reassignment with new items (see render-
                // hooks.integration.test.js's `images = [...,'c']`),
                // which never exposed this since a length change always
                // hits compareArrays()'s add/remove branches regardless.
                cx.atr = clone(arrayToRender);
                // cl(oldATR, arrayToRender);

                const actions = this.compareArrays(oldATR, arrayToRender);
                // cl("ACTNS", actions);

                // @before-render / @after-render (2026-09-14) — lets a
                // developer tear down and re-initialize a DOM-owning plugin
                // (a slider, for instance) around this :for loop's own
                // diff-and-patch pass, instead of it silently breaking the
                // next time the underlying data changes. Skipped entirely
                // when nothing actually changed. Fires on the very first
                // render too (`actions` is all "add" then), so one
                // @after-render handler covers both "initialize" and
                // "re-initialize after data changed" — no separate manual
                // bootstrap call needed. See fireRenderHook()'s own comment.
                if (actions.length) await fireRenderHook(cx, 'before-render', cx.ref.parentElement, { items: arrayToRender, actions });

                // 2026-09-21 (cont'd): real, confirmed performance fix —
                // every "add" action's createSection() call used to be
                // awaited SEQUENTIALLY, one item at a time, inside this
                // same loop. createSection() -> renderSection() ->
                // renderHST() does a real async round trip through the
                // CSS worker whenever the section carries scoped CSS
                // (postMessage out, wait, postMessage back) — for N new
                // items that's N sequential worker round trips at
                // minimum, not one batched pass. A nested :for compounds
                // this multiplicatively (M outer items x N inner items =
                // M*N sequential round trips), matching a real reported
                // symptom: nested :for loops taking noticeably longer
                // than flat ones. Fixed by creating every "add" section
                // for this pass IN PARALLEL (Promise.all), then inserting
                // the results in the same relative order the sequential
                // loop already produced — .before(cx.ref) in iteration
                // order yields the identical final DOM order either way,
                // since each insertion lands immediately before the
                // stable anchor (pushing earlier insertions left, exactly
                // as the old one-at-a-time loop did). "remove"/"update"
                // actions stay in their own sequential pass below,
                // unaffected — neither does any async section-creation
                // work, so there was nothing to parallelize there, and
                // neither depends on where "add" happens to run relative
                // to them (all three action kinds operate on independent,
                // already-keyed DOM, never on each other's output).
                let addActions = [];
                let otherActions = [];
                for (let ai = 0; ai < actions.length; ai++) {
                    (actions[ai].action == 'add' ? addActions : otherActions).push(actions[ai]);
                }

                if (addActions.length) {
                    let createdSections = await Promise.all(addActions.map((actn) => {
                        let vx = arrayToRenderVXs[actn.index];
                        return this.createSection(cx, vx, isObj, forX, actn.index);
                    }));
                    for (let ci = 0; ci < createdSections.length; ci++) {
                        let cln = createdSections[ci];
                        cx.ref.before(cln);
                        cln.replaceWith(cln.node);
                    }
                }

                for (let ai = 0; ai < otherActions.length; ai++) {
                    const actn = otherActions[ai];
                    if (actn.action == 'remove') {

                        // cl("Remove", actn);
                        // let vx = arrayToRenderVXs[actn.index];
                        // let cln = await this.createSection(cx, vx);
                        // cx.ref.before(cln);

                        var keyed = cx.key + '_' + actn.index;

                        let tx = cx.ref?.nodes[keyed];

                        if (tx) {
                            tx.remove();
                            tx.node.remove();
                            delete cx.ref.nodes[keyed];
                            // if(ref.isConnected){
                            // } else if(ref.node.isConnected){

                            // }
                        }

                        // cln.replaceWith(cln.node);
                        // cln.node.innerHTML = "";
                        // cln.node.append(...cln._re._RealDOM);
                        // cl(cln);
                    } else {
                        // let vx = arrayToRenderVXs[actn.index];
                        // let cln = await this.createSection(cx, vx);
                        // cx.ref.before(cln);

                        var keyed = cx.key + '_' + actn.index;

                        let tx = cx.ref?.nodes[keyed];

                        let vx = arrayToRenderVXs[actn.index];
                        if (tx) {
                            // tx._re.reactiveVariables = [...tx._re.reactiveVariables, ...Object.keys(vx)];
                            // cl("UPDATE", [tx], vx, tx._re);
                            tx._re.vrs = vx;
                            // view.vars is the creation-time vx and outranks vrs in getVal(); refresh it in place or it shadows the new item forever.
                            let _rowVars = tx._re.view && tx._re.view.vars;
                            if (_rowVars && _rowVars !== vx) {
                                for (const _rk in _rowVars) if (!(_rk in vx)) delete _rowVars[_rk];
                                Object.assign(_rowVars, vx);
                            }
                            if (tx.isObj) {
                                if (tx.forX.as['k'] != "") tx._re.update(tx.forX.as['k']);
                                else tx._re.update(tx.forX.js);
                                if (tx.forX.as['v'] != "") tx._re.update(tx.forX.as['v']);
                                // cl("Updating", tx.forX.as['k'], tx.forX.as['v']);
                                for (let actnsi = 0; actnsi < actn.updates.length; actnsi++) {
                                    const actnu = actn.updates[actnsi];
                                    tx._re.update(actnu.property);
                                }
                            } else {
                                if (tx.forX.as['k'] != "") tx._re.update(tx.forX.as['k']);
                                else tx._re.update(tx.forX.js);
                                // Each item's own keys are spread into the row's scope (bare and aliased loops alike,
                                // as V1 did), so the row's mustaches can be keyed by those names: a key added or
                                // changed later ({{dateLeft}}) needs its own refresh.
                                for (const ik in vx) {
                                    if (Object.prototype.hasOwnProperty.call(vx, ik) && ik !== tx.forX.js && ik !== tx.forX.as['k']) tx._re.update(ik);
                                }
                                // cl("Updating", tx.forX);
                            }

                            // tx._re.renderAll();
                            // if(ref.isConnected){
                            // } else if(ref.node.isConnected){

                            // }
                        }

                        // cln.replaceWith(cln.node);

                    }
                }

                if (actions.length) await fireRenderHook(cx, 'after-render', cx.ref.parentElement, { items: arrayToRender, actions });

            }
            // if (cx.name == "if") {
            //     let isTrue = this.evalExp(cx.value, this.reactiveVariables);
            //     if (isTrue) {
            //         await renderSection(cx.ref, cx.doc, this, k);
            //     } else {
            //         cx.ref.node.replaceWith(cx.ref);
            //     }
            // }

            } finally {
                cx._updating = false;
                if (cx._dirty) {
                    cx._dirty = false;
                    Promise.resolve().then(() => this.updateLXRs(k));
                }
            }
        }
    }


    compareLogic(array1, array2) {
        if (array1.length === array2.length) {
            // Perform update-only algorithm when arrays have the same length
            // ...
            return 1;
        } else {
            if (array1.length > array2.length) {
                // Array1 has more elements, indicating there are deleted items
                // Use two-way comparison to find deleted indexes
                // If successful, perform the necessary removals
                // Otherwise, proceed with update and removal comparisons
                // ...
                return 2;
            } else {
                // Array2 has more elements, indicating there are added items
                // Use two-way comparison to find added indexes
                // If successful, perform the necessary additions
                // Otherwise, proceed with update and addition comparisons
                // ...
                return 3;
            }
        }
    }

    compareArrays(array1, array2) {
        const actions = [];
        // let cpl = this.compareLogic(array1, array2);

        // if (cpl == 2) {
        //     cl("Deleted", this.findDeletedIndexes(array1, array2));
        // } else if (cpl == 3) {
        //     cl("Added", this.findAddedIndexes(array1, array2));
        // }

        const maxLength = Math.max(array1.length, array2.length);
        for (let i = 0; i < maxLength; i++) {
            const element1 = array1[i];
            const element2 = array2[i];

            // 2026-09-21, real bug found and fixed: `!element2`/`!element1`
            // check TRUTHINESS, not presence — a genuinely falsy-but-real
            // item value (0, "", false, null) at this index was
            // misclassified as "missing", producing a spurious "remove"
            // for a slot that actually needs "add" (or vice versa). Hits
            // every number-based `:for="N"` loop (V1's real, documented
            // "loop N times" pattern, rewritten earlier in this same
            // function into a plain [0, 1, 2, ...] array) — index 0's
            // value is the number 0, so it silently never rendered, on
            // every page using this pattern. Array-based `:for` loops
            // (objects, non-empty strings) never hit this, since real
            // item values there are always truthy — this bug was
            // invisible to every existing test, which only ever used
            // object/string items. Fixed with strict `undefined` checks,
            // the only thing that actually means "this index doesn't
            // exist in this array" — a real `null` item is intentionally
            // still treated as present, not missing, by the same logic.
            if (element2 === undefined) {
                actions.push({
                    action: 'remove',
                    index: i
                });
            } else if (element1 === undefined) {
                actions.push({
                    action: 'add',
                    index: i,
                    element: element2
                });
            } else if (!this.deepCompare(element1, element2)) {
                actions.push({
                    action: 'update',
                    index: i,
                    updates: this.getUpdates(element1, element2)
                });
            }
        }

        return actions;
    }

    findDeletedIndexes(array1, array2) {
        const deletedIndexes = [];
        let par = this;

        array1.forEach((item, index) => {
            const foundIndex = array2.findIndex((el) => par.deepCompare(el, item));
            if (foundIndex === -1) {
                deletedIndexes.push(index);
            }
        });

        return deletedIndexes;
    }

    findAddedIndexes(array1, array2) {
        const addedIndexes = [];
        let par = this;

        array2.forEach((item, index) => {
            const foundIndex = array1.findIndex((el) => par.deepCompare(el, item));
            if (foundIndex === -1) {
                addedIndexes.push(index);
            }
        });

        return addedIndexes;
    }

    deepCompare(obj1, obj2) {
        // Compare objects by stringifying and comparing their JSON representation
        return JSON.stringify(obj1) === JSON.stringify(obj2);
    }

    getUpdates(oldObj, newObj) {
        const updates = [];
        for (const key in newObj) {
            if (newObj.hasOwnProperty(key) && newObj[key] !== oldObj[key]) {
                updates.push({ property: key, value: newObj[key] });
            }
        }
        return updates;
    }


    getVal(mo, indexName) {
        let vars = {};
        try {
            for (let i = 0; i < this.reactiveVariables.length; i++) {
                // 2026-09-14: fall back to _vt.Global.vars when a view
                // doesn't declare this var itself — the real-world case of
                // a mustache/:if referencing an index.js global (e.g.
                // `isAdmin`) that this view's own script never assigns.
                // concatVarsAtLevel() already does this merge for
                // lookup()/scopedEval(); getVal() (what mustache text nodes
                // actually call) had its own separate, unmerged read here
                // and was silently rendering these as empty.
                // 2026-09-18: inserted a middle tier — _lookupInWidgets()
                // (all currently-mounted widgets' vars, first-declared
                // wins) — between View and Global, per this session's
                // agreed read-fallback order.
                let __name = this.reactiveVariables[i];
                if (_vt.View.vars.hasOwnProperty(__name)) {
                    vars[__name] = _vt.View.vars[__name];
                } else {
                    let _wv = _lookupInWidgets(__name);
                    let _gv = _wv !== undefined ? _wv : _vt.Global.vars[__name];
                    // 2026-09-21, real bug found and fixed: this used to
                    // set vars[__name] = _gv unconditionally, even when
                    // _gv is undefined (the name was detected as
                    // referenced — e.g. a bare `globals.Me` in a
                    // mustache — but never actually written through
                    // _vt.Global.vars, only mutated on the bare
                    // identifier directly, a real and common pattern).
                    // That turns "this name has no known value" into an
                    // explicit `vars.globals = undefined` KEY — which,
                    // once this object reaches scopedEval()'s dynamic
                    // Function() construction, becomes a real parameter
                    // that SHADOWS whatever `globals` actually resolves
                    // to in the true enclosing scope (the same object,
                    // correctly populated). Only assigning when a real
                    // value was actually found lets an unset name fall
                    // through to normal JS scope resolution instead,
                    // exactly like concatVarsAtLevel()'s own object-
                    // spread already does for the same case (spreading
                    // an object with no such key never introduces one).
                    if (_gv !== undefined) vars[__name] = _gv;
                }
            }
            for (const ky in this.vrs) {
                if (Object.prototype.hasOwnProperty.call(this.vrs, ky)) {
                    vars[ky] = this.vrs[ky]
                }
            }
            // 2026-09-17: per-instance subview scoping — a subview's own
            // declared vars live on `this.view.vars` (wired up in
            // renderHST()/renderView() to be the SAME object its compiled
            // script's `_vt.View.views[i].vars[...]` writes reach), not
            // in the flat `_vt.View.vars` checked above (that's still
            // only ever the MAIN view). Checked last/highest-priority,
            // same shadowing shape as the `this.vrs` merge just above —
            // an instance's own var wins over anything it inherited.
            if (this.view && this.view.vars) {
                for (const ky in this.view.vars) {
                    if (Object.prototype.hasOwnProperty.call(this.view.vars, ky)) {
                        vars[ky] = this.view.vars[ky];
                    }
                }
            }
        } catch (e) {
            cl(e);
        }

        mo = (mo).trim();
        // cl(["getVal", mo, vars, indexName]);
        // if (mo == "patientProfile['Gender']") {
        //   cl(["getVal", mo, vars, indexName]);
        // }
        if (mo.slice(0, 2) == "{{") {
            mo = mo.slice(2, -2);
        }
        // if (mo == 'new Date(article.createdAt.split("T")[0]).getDate()')
        // if(mo=="genders[`patientProfile['Gender']`]") cl(["getVal", mo, vars, indexName]);
        let value = "";
        let _mo = mo;

        if (mo.indexOf("`") > -1) {
            var matchesVal = _mo.match(/\.`[\s\S]*?`/g);
            // cl(["shuuuu", matchesVal, _mo]);
            if (matchesVal)
                for (var y = 0; y < matchesVal.length; y++) {
                    _mo = _mo
                        .split(matchesVal[y])
                        .join(
                            "." +
                            this.getVal(
                                matchesVal[y].substr(1).slice(1, -1),
                                indexName
                            )
                        );
                }

            var matchesVal = _mo.match(/`[\s\S]*?`/g);
            // cl(["suuuu", matchesVal, _mo]);
            if (matchesVal)
                for (var y = 0; y < matchesVal.length; y++) {
                    // cl([
                    //   "3uuu",
                    //   this.getVal(matchesVal[y].slice(1, -1), vars, indexName),
                    //   matchesVal,
                    //   y,
                    //   matchesVal[y].slice(1, -1),
                    //   vars,
                    //   indexName,
                    // ]);
                    _mo = _mo
                        .split(matchesVal[y])
                        .join(
                            "'" +
                            this.getVal(matchesVal[y].slice(1, -1), indexName) +
                            "'"
                        );
                }

            // cl([this.getVal(_mo, vars, indexName), "kuuuuk", _mo, vars, indexName]);
            return this.getVal(_mo, indexName);
        }

        if (mo.indexOf(";") > -1) {
            let zxx = mo.split(";");
            mo = $.trim(zxx[0]);
        }

        if (mo.indexOf(" as ") > -1) {
            mo = mo.split(" as ");
            return this.getVal(mo[0], indexName);
        }

        if (indexName) {
            indexName = indexName.toString();
            if (
                mo.indexOf(indexName) > -1 &&
                mo != indexName &&
                vars.hasOwnProperty(indexName) &&
                mo != "index"
            ) {
                mo = mo.split(indexName).join(vars[indexName]);
                return this.getVal(mo, indexName);
            }
        }

        var Ondex = mo.match(/\bindex\b/g);
        if (Ondex && mo != "index" && vars.hasOwnProperty("index")) {
            _mo = mo.replace(/\bindex\b/g, vars["index"]);
            // cl(["Hassss",mo,vars["index"], vars, this.getVal(_mo, vars, indexName)]);
            return this.getVal(_mo, indexName);
        }

        // if (this.isJS(mo, vars)) {
        // cl("get",mo);
        value = this.lookup(mo, vars);
        // } else {
        //     value = this.lookup(mo, vars);
        //     // if (mo == "index") cl("kiki", value);
        // }

        // cl(["VALZZZZZZZZ", mo, vars, value, value ?? ""]);
        return value ?? "";
    }

    concatVarsAtLevel(levelVars, parent) {

        if (!parent.view._pv) {
            var concatenatedVars = { ...levelVars };
            if (parent.view.vars) {
                // Global vars (index.js's top-level state, see _vt.Global
                // above) sit at the lowest priority here — a view or a
                // narrower scope declaring the same name shadows it, same
                // as real JS scoping would. 2026-09-18: widgets' vars sit
                // one tier above Global, below the view's own — see
                // _mergedWidgetsVars()'s comment for the ordering rationale.
                concatenatedVars = { ..._vt.Global.vars, ..._mergedWidgetsVars(), ...parent.view.vars, ...concatenatedVars };
            }
            return concatenatedVars;
        }

        var concatenatedVars = { ...levelVars };
        if (parent.view.vars) {
            // Object.assign(concatenatedVars, parent.view.vars);
            concatenatedVars = { ...parent.view.vars, ...concatenatedVars };
        }

        return this.concatVarsAtLevel(concatenatedVars, parent.view._pv);
    }

    lookup(name, vaz) {

        // for (const key in _vt.View.vars) {
        //     if (Object.prototype.hasOwnProperty.call(_vt.View.vars, key)) {
        //         vaz[key] = _vt.View.vars[key];
        //     }
        // }
        // if(name == '{{new Date(article.createdAt.split("T")[0]).getDate()}}') 
        // cl(["lookup", name, vaz]);
        // cl(vaz);
        // cl(this.concatVarsAtLevel(vaz, this));

        let vars = this.concatVarsAtLevel(vaz, this);
        // cl("VAAZZZ");
        // cl(vaz);
        // cl(vars);

        try {
            var value;
            var names,
                index,
                lookupHit = false;

            if (this.hasProperty(vars, name)) {
                value = vars[name];
                // cl(["luuuu", vars, name, value]);
            } else if (name.indexOf(".") > -1 && name.indexOf("[") == -1) {
                // cl(["laaaaaa", vars, name, value]);
                var value = this.scopedEval(vars, name);
                // cl(["liiii", vars, name, value]);
                if (!(value || value == 0)) {
                    value = vars;
                    names = name.split(".");
                    index = 0;
                    while (value != null && index < names.length) {
                        if (index === names.length - 1)
                            lookupHit = this.hasProperty(value, names[index]);
                        value = value[names[index++]];
                        //{{v.0.kuku}} v then v.0 then v.0.kuku ...... iterate through nested chains
                    }
                }
            } else {
                var value = this.scopedEval(vars, name);
                // if (name == "patientProfile['Gender']") {
                // cl(["==zzzzzlookup", name, vaz, value, vars, name]);
                // }
                // if (name == 'new Date(article.createdAt.split("T")[0]).getDate()') cl(["laaa", vars, name, value]);
                if (!(value || value == 0)) {
                    if (name.indexOf(".") == -1 && name.indexOf("[") > -1) {
                        let _name = name;
                        var matchesVal = _name.match(/\[[\s\S]*?\]/g);
                        for (var y = 0; y < matchesVal.length; y++) {
                            if (
                                matchesVal[y].indexOf("'") == -1 &&
                                matchesVal[y].indexOf('"') == -1
                            )
                                _name = _name
                                    .split(matchesVal[y])
                                    .join("['" + matchesVal[y].slice(1, -1) + "']");
                        }
                        var value = this.scopedEval(vars, _name);
                    }
                }
            }

            if (this.isFunction(value)) value = value.call(value);

            // if (name == "patientProfile['Gender']") {
            // cl(["===========lookup", name, vaz, value]);
            // }

            // if (name == 'new Date(article.createdAt.split("T")[0]).getDate()') cl(["lookup", name, vaz, value]);

            // if (value || value==0) return value;

            // else {
            //     value = this.scopedEval(vars, name);
            // }

            // cl("n: ",name," val: ",value," v: ",vaz)
        } catch (e) {
            reportLumenError({ stage: 'lookup', expr: name, error: e });
            return "";
        }
        // if (name == 'new Date(article.createdAt.split("T")[0]).getDate()') cl("halaaaaaa", value);
        // cl("halaaaaaa", value);
        return value;
    }


    objectToString = Object.prototype.toString;
    isArray =
        Array.isArray ||
        function isArrayPolyfill(object) {
            return objectToString.call(object) === "[object Array]";
        };
    isFunction(object) {
        return typeof object === "function";
    }
    typeStr(obj) {
        return this.isArray(obj) ? "array" : typeof obj;
    }
    hasProperty(obj, propName) {
        return obj != null && typeof obj === "object" && propName in obj;
    }

    createEl(tag, attrs, children, events, doc) {
        // doc.svg: marked by the compiler for <svg> and its descendants (not <foreignObject> content).
        const _el = (doc && doc.svg) ? document.createElementNS(_SVG_NS, tag) : document.createElement(tag);

        // 2026-09-17: every element knows which _lm instance rendered it —
        // needed so a click on it can resolve its @click handler against
        // the RIGHT instance's own .fns (see lstnrs.js's evalEvAttr), and
        // (below) so an @init handler on a subview mount resolves against
        // ITS creator's own functions/scope, not window. Stamped before
        // anything below that might need it. Non-enumerable: real bug
        // found and fixed — an ordinary DOM element has no own enumerable
        // properties by default, so JSON.stringify(someElement) safely
        // produced "{}" everywhere this codebase already did that (e.g. a
        // real test asserting on JSON.stringify(view._slots), real DOM
        // nodes). An ENUMERABLE back-reference here closes a genuine
        // cycle (element -> _ownerRe -> that instance's own _RealDOM ->
        // the same element) and breaks every one of those call sites. Defined this way
        // instead of a plain `=` assignment so it's reachable
        // (`el._ownerRe`) but invisible to JSON.stringify/for-in/
        // Object.keys, matching how a parent-pointer is normally done.
        Object.defineProperty(_el, '_ownerRe', { value: this, enumerable: false, configurable: true, writable: true });

        _el.isSub = false;
        if (attrs.hasOwnProperty('view')) {
            _el.isSub = true;
            _el.subPath = attrs['view'];
            // 2026-09-17: per-instance subview scoping. `views[]` used to
            // hold just the raw element — every instance of the same
            // subview file shared one flat _vt.View.vars, so two mounts of
            // the same .view file collided on the same variable slots (a
            // real, confirmed bug — clicking one instance changed a value
            // neither instance's DOM reflected). DOM elements already
            // carry arbitrary extra JS properties throughout this file
            // (.isSub, .subPath, .events) — .vars/.views here follow that
            // same convention rather than a new parallel structure. .vars
            // is this instance's own scope, addressed at
            // _vt.View.views[i].vars once renderHST() wires up the path
            // (see renderView()); .views lets this instance itself host
            // further nested subviews the same way.
            _el.vars = {};
            _el.views = [];
            _el.fns = {};
            // 2026-09-17: `@init="fn"` — the actual, decided mechanism
            // for giving a subview mount its own data at creation time
            // (replaces an earlier, narrower `:data="name"` attempt —
            // reusing the existing @before-render/@after-render hook
            // machinery instead of a bespoke attribute, per real
            // discussion of real use cases: a subview file mounted
            // multiple times needing distinct config per instance — the
            // same widget showing a different crypto coin per mount, or
            // a :for item needing its own data slice). `fn`'s return
            // value (a plain object) is merged into this instance's own
            // `.vars`, so it can hand over multiple named values at once
            // — not tied to matching a parent variable's name the way
            // `:data` was. Reads an ancestor's own variable by name
            // still needs no special syntax at all (getVal()/evalExp()'s
            // existing fallthrough already covers that); @init is for
            // data that's computed/selected specifically for this one
            // mount. fireRenderHook() needed a real fix first (used to
            // discard its handler's return value entirely) — see its own
            // comment. Deliberately one-way — a subview writing back to
            // a PARENT variable (a steps-form wizard sharing accumulated
            // state across steps, for instance) is a real, different,
            // not-yet-designed mechanism, not what this covers.
            //
            // Calls evalEvAttr() directly rather than fireRenderHook()
            // (which every other @before-render/@after-render call site
            // uses): createEl() itself isn't async, and this result has
            // to be ready synchronously, before the subview actually
            // renders (a later, separate, real async call). An @init
            // handler that returns a Promise can't be awaited here —
            // deliberately unsupported for now, not silently broken:
            // only a plain object return is used.
            if (doc && doc.evs && doc.evs.hasOwnProperty('@init')) {
                let _initAttr = doc.evs['@init'];
                if (_initAttr) {
                    // 3rd arg: the CALLING scope's own loop-local bindings
                    // (e.g. `item` from `:for="items as item"`) — these
                    // aren't real JS variables an @init handler could
                    // otherwise close over (it's an ordinary top-level
                    // function, not defined inside the loop), so without
                    // this there'd be no way for it to know which
                    // iteration it's being called for at all.
                    // A :for row keeps its alias/index on its section view's vars (vrs is still empty while the
                    // row's own elements are being created), so hand over both.
                    let _rowScope = Object.assign({}, (this.view && this.view.type === 'section' && this.view.vars) || {}, this.vrs || {});
                    let _initResult = evalEvAttr(_initAttr, { cType: 'init' }, $(_el), 'init', _rowScope);
                    if (_initResult && typeof _initResult === 'object' && typeof _initResult.then !== 'function') {
                        Object.assign(_el.vars, _initResult);
                    }
                }
            }
            this.view.views.push(_el);
        }

        _el.events = {};
        for (const prop in attrs) {
            if (prop == "view" || prop == ":data" || prop == ":if" || prop == ":else-if" || prop == ":else" || prop == ":for" || prop == ":for-limit" || prop == ":for-offset" || prop == ":for-if") continue;
            try {
                // cl("DD", doc);
                let val = (doc && doc.ax.hasOwnProperty(prop)) ? "" : attrs[prop];
                if (prop == "value" && !(doc && doc.svg)) {
                    _el.value = val;
                } else _lmSetAttr(_el, prop, val);
            } catch (e) {
                cl(e);
            }
        }
        for (const prop in events) {
            try {
                _el.events[prop] = events[prop];
                if (typeof _lmIndexAtEl === 'function') _lmIndexAtEl(_el, prop);
            } catch (e) {
                cl(e);
            }
        }
        if (children.length) _el.append(...children);

        // 2026-09-16: @after-render generalized to fire on MOUNT for every
        // element, not just :for items / :if sections. Those two already
        // get their own batch-level hook fired elsewhere (updateLXRs() /
        // showSectionCX() / hideSectionCX()) — with :items/:visible extra
        // data a per-element mount fire here can't provide, and firing
        // both would double-fire for them — so they're explicitly
        // excluded here via the same directive-attribute check createEl()
        // already does above. No @before-render equivalent for a generic
        // mount: there's no prior DOM state to act on before an element
        // exists for the first time (unlike :for/:if's before-render,
        // which runs against DOM that's already connected).
        if (events && events['@after-render'] && !(attrs && (attrs.hasOwnProperty(':for') || attrs.hasOwnProperty(':if') || attrs.hasOwnProperty(':else-if') || attrs.hasOwnProperty(':else')))) {
            _queueMountHook(doc, _el);
        }

        // 2026-09-16: V1's real automatic plugin-init pass, ported
        // faithfully from bea.js's own renderPlugins()/dtp() (real source:
        // SBEACDN/s.beacdn.com/beajs/core.js, not reverse-engineered from
        // minified code) — [sl]/[color]/[time]/[date]/[datetime] elements
        // become their respective widgets on mount, no explicit script
        // call needed, matching V1's documented behavior (lumenjs-
        // spec.md §5.6/§6.7). Built into core directly, always available
        // (explicit choice, 2026-09-16) — autoInitPlugins() itself guards
        // every call on the matching $.fn.* method actually existing, so a
        // plain project with no plugins selected silently no-ops instead
        // of throwing when it encounters one of these attributes.
        autoInitPlugins(_el, attrs);

        return _el;
    }

    // processAttr(n, v, res) {
    //     if (n == 'scoped') {

    //     } else if (n == 'binds') {
    //         res.domNode.mxs = v.split(",").map((s) => s.trim());
    //     } else {
    //         if (n.substr(0, 1) == "@") {
    //             res.domNode.setAttribute(n.substr(0,1), v);
    //         } else res.domNode.setAttribute(n, v);
    //     }
    // }

    // getPVsScope(par) {
    //     let _vz = {};

    //     if (par) {
    //         cl("VZZZZ", par.view.vars);
    //         _vz = this.getPVsScope(par.view._pv);
    //     }

    //     return _vz;
    // }

    // getScope() {
    //     let vz = clone(_vt.View.vars) ?? {};
    //     let _vz = this.getPVsScope(this.view._pv);
    //     cl("VXXXX", vz, _vz);

    //     return vz;
    // }

    evalExp(expr, vars) {
        // let svs = this.getScope();
        // cl("SVS", svs);
        // cl("SVS", expr, vars);
        let rvars = {};
        try {
            for (let i = 0; i < vars.length; i++) {
                // 2026-09-14: same Global-vars fallback as getVal() above —
                // without it this object always carries an explicit
                // `name: undefined` for anything index.js declares (since
                // it's never in _vt.View.vars), and because it's spread
                // LAST in concatVarsAtLevel()'s merge (highest priority),
                // that explicit undefined would silently clobber the real
                // value scopedEval() would otherwise have found in
                // _vt.Global.vars — breaking :if/:for conditions on any
                // index.js-declared var, not just mustache text (getVal()).
                // 2026-09-18: same middle tier as getVal() — see its
                // matching comment.
                let __name = vars[i];
                if (_vt.View.vars.hasOwnProperty(__name)) {
                    rvars[__name] = _vt.View.vars[__name];
                } else {
                    let _wv = _lookupInWidgets(__name);
                    rvars[__name] = _wv !== undefined ? _wv : _vt.Global.vars[__name];
                }
            }
            // 2026-09-17, real bug found and fixed: getVal() (mustache
            // text, e.g. {{f.name}}) has always merged this.vrs in after
            // the View/Global loop above — the local :for-loop-scoped
            // binding (f, k, v, index — set via tx._re.vrs = vx, see the
            // :for update path above) correctly shadows/supplies names a
            // view's own script never declares. evalExp() (used for
            // :if="f.done"/:else-if conditions) never had the same merge
            // — any :if/:else-if condition referencing a :for loop
            // variable's property could never evaluate correctly, in any
            // LumenJS V2 project, not just this page. It "looked" correct
            // on first render only by coincidence: :else isn't gated by
            // evalExp at all, so an all-false-by-default loop (every item
            // starting unchecked) rendered the same whether the condition
            // genuinely evaluated false or silently threw and was caught
            // below. Found clicking a real @click-toggled :for item on
            // lumenjs.com's own real V2 homepage.
            for (const ky in this.vrs) {
                if (Object.prototype.hasOwnProperty.call(this.vrs, ky)) {
                    rvars[ky] = this.vrs[ky];
                }
            }
            // 2026-09-17: same per-instance subview merge as getVal()
            // above — a subview's own vars live on this.view.vars, not
            // the flat _vt.View.vars checked above (always the main
            // view). See getVal()'s matching comment for the full
            // rationale.
            if (this.view && this.view.vars) {
                for (const ky in this.view.vars) {
                    if (Object.prototype.hasOwnProperty.call(this.view.vars, ky)) {
                        rvars[ky] = this.view.vars[ky];
                    }
                }
            }
        } catch (e) {
            cl(e);
        }
        //If Lookaup
        // let value = this.lookup(expr, vars);
        // if (value || value == 0) return false;
        try {
            var value = this.scopedEval(rvars, expr);
            // cl("VV", value);
            if (value && value != 0) return true;
        } catch (e) {
            reportLumenError({ stage: 'condition', expr: expr, error: e });
            return false;
        }
        return false;
    }

    splitTextWithMustaches(text, mustaches) {
        // Sort mustaches by start index to process in order
        mustaches.sort((a, b) => a.start - b.start);

        const elements = [];
        let currentIndex = 0;

        for (const mustache of mustaches) {
            // Add static text before mustache if any
            if (currentIndex < mustache.start) {
                elements.push({
                    type: 'static',
                    content: text.substring(currentIndex, mustache.start)
                });
            }

            // Add the mustache
            elements.push({
                type: 'mustache',
                jst: mustache.jst,
                rvs: mustache.rvs,
                content: text.substring(mustache.start, mustache.end)
            });

            // Update current index
            currentIndex = mustache.end;
        }

        // Add any remaining static text after the last mustache
        if (currentIndex < text.length) {
            elements.push({
                type: 'static',
                content: text.substring(currentIndex)
            });
        }

        return elements;
    }


    walk(doc, parent) {
        var par = this;
        var tx, el;
        switch (doc.type) {
            case 'text':

                if (doc.mss.length) {

                    let splitIt = true;

                    if (doc.tag == "textarea") {
                        splitIt = false;
                    }

                    if (splitIt) {
                        let splits = this.splitTextWithMustaches(doc.content, doc.mss);
                        // cl(splits);
                        for (let si = 0; si < splits.length; si++) {
                            const split = splits[si];
                            if (split.type == 'static') {
                                let txnd = document.createTextNode(decodeHtmlEntities(split.content));
                                if (!parent) par._RealDOM.push(txnd);
                                (tx ?? (tx = [])).push(txnd);
                            } else {
                                let txnd = document.createTextNode("");
                                const _keys = split.rvs.length ? split.rvs : [_CONST_EFFECT];
                                for (let ri = 0; ri < _keys.length; ri++) {
                                    const element = _keys[ri];
                                    (this._effects[element] ?? (this._effects[element] = [])).push({
                                        "type": "text",
                                        "content": split.content,
                                        "jst": split.jst,
                                        "rvs": split.rvs,
                                        "isSplit": true,
                                        "nd": txnd,
                                        "tag": doc.tag
                                    });
                                }
                                if (!parent) par._RealDOM.push(txnd);
                                (tx ?? (tx = [])).push(txnd);
                            }
                        }
                        return tx;
                    } else {
                        tx = document.createTextNode("");
                        const _anyRv = doc.mss.some((m) => m.rvs.length);
                        for (let mui = 0; mui < doc.mss.length; mui++) {
                            const mus = doc.mss[mui];
                            const _keys = mus.rvs.length ? mus.rvs : (!_anyRv && mui === 0 ? [_CONST_EFFECT] : []);
                            for (let ri = 0; ri < _keys.length; ri++) {
                                const element = _keys[ri];
                                (this._effects[element] ?? (this._effects[element] = [])).push({
                                    "type": "text",
                                    "content": doc.content,
                                    "splits": this.splitTextWithMustaches(doc.content, doc.mss),
                                    "jst": mus.jst,
                                    "rvs": mus.rvs,
                                    "isSplit": false,
                                    "nd": tx,
                                    "tag": doc.tag
                                });
                            }
                        }

                        if (!parent) par._RealDOM.push(tx);
                        return tx;
                    }


                } else {
                    tx = document.createTextNode(decodeHtmlEntities(doc.content));
                    if (!parent) par._RealDOM.push(tx);
                    return tx;
                }
                break;
            case 'sections':
            case 'section':
                var _dd = md5(new Date().getTime() / 1000 + "::" + Math.random());
                tx = document.createTextNode("");
                var typeN = null;
                if (doc.attrs.hasOwnProperty(":else")) typeN = "else";
                else if (doc.attrs.hasOwnProperty(":else-if")) typeN = "else-if";
                else if (doc.attrs.hasOwnProperty(":if")) typeN = "if";
                else typeN = 'for';

                if (doc.type == "section") {

                    var chain = [];
                    if (typeN == "else-if" || typeN == "else") {
                        try {
                            let lastInChain = this._CXR.at(-1);
                            if (lastInChain) {
                                _dd = lastInChain.key;
                                chain.push(...lastInChain.chain, lastInChain);
                            }
                        } catch (e) {

                        }
                    }

                    el = par.createEl(doc.name, doc.attrs, [], doc.evs, doc);
                    tx.node = el;

                    // cl("SECCCCC", doc);
                    // return;
                    this._CXR.push({
                        "type": "section",
                        "name": typeN,
                        "content": doc.cond,
                        "doc": doc,
                        "key": _dd,
                        "chain": chain,
                        "ref": tx
                    });

                    this.setEffects(doc, el);

                } else if (doc.type == "sections") {

                    tx.key = _dd;
                    tx.node = null;
                    tx.nodes = {};

                    let docRaw = doc;
                    // delete docRaw.attrs[':for'];
                    // delete docRaw.attrs[':for-limit'];
                    // delete docRaw.attrs[':for-if'];
                    // delete docRaw.attrs[':for-offset'];
                    // docRaw.type = 'tag';

                    // cl("SECCCCCSSS", doc);
                    // return;

                    this._LXR.push({
                        "type": "sections",
                        "name": typeN,
                        "cond": doc.attrs.hasOwnProperty(":for-if") ? doc.attrs[':for-if'] : null,
                        "limit": doc.attrs.hasOwnProperty(":for-limit") ? doc.attrs[':for-limit'] : 0,
                        "offset": doc.attrs.hasOwnProperty(":for-offset") ? doc.attrs[':for-offset'] : 0,
                        "content": doc.content,
                        "forX": doc.forX,
                        "doc": docRaw,
                        "key": _dd,
                        "atr": [],
                        "ref": tx
                    });

                    // cl(tx, doc);
                }


                if (!parent) par._RealDOM.push(tx);
                return tx;
                break;
            case 'tag':
                var _dd = md5(new Date().getTime() / 1000 + "::" + Math.random());

                // cl("DOC", doc);

                if (doc.name.toLowerCase() == "settings") {
                    if (par.view.type == "main") {
                        var defaultSettings = {
                            layout: "default",
                            requireAuth: false,
                        };
                        try {
                            let settingsC = doc.children[0].content;
                            let settings = {};
                            eval("settings = " + settingsC + ";");
                            if (settings) {
                                if (settings.layout == null) settings.layout = "default";
                                if (settings.requireAuth == null) settings.requireAuth = false;
                                par.view.settings = settings;
                            } else {
                                par.view.settings = defaultSettings;
                            }

                        } catch (e) {
                            setError(e, "Error in your settings tag inside the '" + par.view.name.toLowerCase() + "' main view!");
                            par.view.settings = defaultSettings;
                        }
                    }
                } else if (doc.name.toLowerCase() == "script" || doc.name.toLowerCase() == "js") {
                    let child = doc.children[0] || {};
                    let js = child.content;
                    let jst = child.jst;
                    // The compiler ships a script as source (`content`) and only keeps an AST (`jst`) for a script
                    // that needed the lenient parser; the source is parsed when the view mounts (see below).
                    let isScoped = false;
                    if (doc.attrs.hasOwnProperty('scoped')) {
                        delete doc.attrs['scoped'];
                        isScoped = true;
                    }
                    el = par.createEl("script", doc.attrs, [], doc.evs, doc);
                    el._sc = isScoped;
                    el._dd = _dd;
                    // el._js = js;
                    el._jst = jst;
                    el._js = js;
                    el._pre = child.pre;
                    // cl(child);
                    // _jswacrk.trigger('msg', {
                    //     "code": js,
                    //     "type": par.view.type,
                    //     "key": _dd
                    // });
                    // _jsuid[_dd] = el;
                    (par._jj[_dd] ?? (par._jj[_dd] = [])).push({
                        "nd": el,
                    });

                } else if (doc.name.toLowerCase() == "style") {
                    let css = doc.children[0].content;
                    let isScoped = false;

                    el = par.createEl("style", {}, [], doc.evs, doc);

                    if (doc.attrs.hasOwnProperty('scoped')) {
                        if (!parent) {
                            if (par.view._dd) _dd = par.view._dd;
                            else {
                                par.view._dd = _dd;
                                if (par.view.type == "main") $('[body]')[0].setAttribute('vuid', _dd);
                            }
                        } else {
                            if (parent._dd) _dd = parent._dd;
                            else {
                                parent._dd = _dd;
                                parent.setAttribute('vuid', _dd);
                            }
                        }
                        delete doc.attrs['scoped'];
                        isScoped = true;
                        el._sc = isScoped;
                        el._dd = _dd;
                        el._css = css;
                        (par._cc[_dd] ?? (par._cc[_dd] = [])).push({
                            "nd": el,
                            "_css": css
                        });
                    } else {
                        el._sc = isScoped;
                        el._dd = _dd;
                        el.textContent = css;
                    }


                    for (const prop in doc.attrs) {
                        try {
                            _el.setAttribute(prop, doc.attrs[prop]);
                        } catch (e) {
                            cl(e);
                        }
                    }
                } else if (doc.name.toLowerCase() == "icon") {
                    let child = par.createEl("span", {
                        "class": "iconify",
                        "data-icon": doc?.icon ?? "mdi:home"
                    }, [], {}, null);

                    el = par.createEl("span", doc.attrs, [child], doc.evs, doc);

                } else if (doc.name.toLowerCase() == "slot") {
                    // Layout slot content (2026-09-15) — a view wraps
                    // content meant for a named layout region (anything
                    // other than the default `[body]` target) in
                    // <slot name="...">...</slot>. Collected onto
                    // par.view._slots[name] (an array of real, walked DOM
                    // nodes) instead of being pushed into _RealDOM —
                    // renderView() injects each populated slot into its
                    // matching `[slot="name"]` layout element, after the
                    // default content. Same non-participating-in-_RealDOM
                    // shape as the `settings` branch above (no `el` gets
                    // set here either) — but slot content needs to be
                    // walked/rendered, unlike settings' raw config text, so
                    // this uses a throwaway wrapper purely as a real DOM
                    // parent for that walk; it's never attached anywhere.
                    let slotName = doc.attrs && doc.attrs.name;
                    if (slotName) {
                        let tempWrapper = document.createElement('div');
                        let childs = [];
                        for (let i = 0; i < doc.children.length; i++) {
                            const dc = doc.children[i];
                            let chils = par.walk(dc, tempWrapper);
                            if (chils) {
                                if (Array.isArray(chils)) {
                                    if (chils.length) childs = [...childs, ...chils];
                                } else {
                                    childs.push(chils);
                                }
                            }
                        }
                        (par.view._slots ?? (par.view._slots = {}))[slotName] = childs;
                    }
                } else if (doc.attrs && (doc.attrs.hasOwnProperty('tpl') || doc.attrs.hasOwnProperty('comp'))) {
                    // tpl= only works on a :for loop element (decided 2026-10-02); comp= is removed. Render the
                    // element itself, without template content, and say exactly what to change.
                    let _elAttrs = Object.assign({}, doc.attrs);
                    delete _elAttrs['tpl']; delete _elAttrs['comp']; delete _elAttrs[':data'];
                    el = par.createEl(doc.name, _elAttrs, [], doc.evs, doc);
                    _reportTplMisuse(doc, par);
                } else {
                    el = par.createEl(doc.name, doc.attrs, [], doc.evs, doc);

                    if (!doc.isV && !el.isSub) {
                        let childs = [];
                        for (let i = 0; i < doc.children.length; i++) {
                            const dc = doc.children[i];
                            let chils = par.walk(dc, el);
                            if (chils) {
                                if (Array.isArray(chils)) {
                                    if (chils.length) childs = [...childs, ...chils];
                                } else {
                                    childs.push(chils);
                                }
                            }
                        }
                        childs.length ? el.append(...childs) : null;
                    }
                }

                this.setEffects(doc, el);

                if (el) {
                    if (!parent) par._RealDOM.push(el);
                }
                return el;

                break;
            case 'comment':

                break;
            default:
                break;
        }
    }

    setEffects(doc, el) {
        let rvs = [];
        if (Object.keys(doc.ax).length) {
            for (const attrName in doc.ax) {
                if (Object.hasOwnProperty.call(doc.ax, attrName)) {
                    const attrMustaches = doc.ax[attrName];
                    const _anyRv = attrMustaches.some((m) => m.rvs.length);
                    for (let i = 0; i < attrMustaches.length; i++) {
                        const mus = attrMustaches[i];
                        const _keys = mus.rvs.length ? mus.rvs : (!_anyRv && i === 0 ? [_CONST_EFFECT] : []);
                        for (let ri = 0; ri < _keys.length; ri++) {
                            const element = _keys[ri];
                            if (element !== _CONST_EFFECT) rvs.push(element);
                            (this._effects[element] ?? (this._effects[element] = [])).push({
                                "type": "attr",
                                "name": attrName,
                                "content": doc.attrs[attrName],
                                "splits": this.splitTextWithMustaches(doc.attrs[attrName], doc.ax[attrName]),
                                "jst": mus.jst,
                                "rvs": mus.rvs,
                                "nd": el
                            });
                        }
                    }
                }
            }
        }

        if (Object.keys(doc.ex).length) {
            for (const ky in doc.ex) {
                if (Object.hasOwnProperty.call(doc.ex, ky)) {
                    const mss = doc.ex[ky];
                    for (let i = 0; i < mss.length; i++) {
                        const mus = mss[i];
                        for (let ri = 0; ri < mus.rvs.length; ri++) {
                            const element = mus.rvs[ri];
                            rvs.push(element);
                            (this._effects[element] ?? (this._effects[element] = [])).push({
                                "type": "event",
                                "name": ky,
                                "content": doc.evs[ky],
                                "splits": this.splitTextWithMustaches(doc.evs[ky], doc.ex[ky]),
                                "jst": mus.jst,
                                "rvs": mus.rvs,
                                "nd": el
                            });
                        }
                    }
                }
            }
        }

        return rvs.filter((value, index, self) => {
            return self.indexOf(value) === index;
        });
    }

    async createSection(cx, vx, isObj, forX, pos) {
        // A row's DOM key is its position among the rows rendered (what the remove/update actions use), which differs
        // from vx.index (the item's array position) when :for-if / :for-offset skip items.
        var keyed = cx.key + '_' + (pos !== undefined ? pos : vx.index);
        // cl("DD", cx, vx, keyed);
        var tx = document.createTextNode("");
        var typeN = null;
        if (cx.doc.attrs.hasOwnProperty(":else")) typeN = "else";
        else if (cx.doc.attrs.hasOwnProperty(":else-if")) typeN = "else-if";
        else if (cx.doc.attrs.hasOwnProperty(":if")) typeN = "if";
        else typeN = 'for';

        // cl("CREATE", cx.doc.name, cx.doc.attrs, [], cx.doc.evs, cx.doc);

        // The row element itself is created by the loop's owner, before the row has its own engine: expose this
        // row's scope (alias, index) for the duration of the synchronous createEl(), so `@init` on a
        // `view=` row receives it like any other row-level code.
        let _ownerVrs = this.vrs;
        this.vrs = Object.assign({}, _ownerVrs || {}, vx || {});
        let el;
        try {
            el = this.createEl(cx.doc.name, cx.doc.attrs, [], cx.doc.evs, cx.doc);
        } finally {
            this.vrs = _ownerVrs;
        }
        tx.node = el;
        tx.key = cx.key;
        tx.keyed = keyed;
        tx.isObj = isObj;
        tx.forX = forX;
        tx.vx = vx;

        // cl("RENDERSECTION", tx, cx.doc, this, cx.key);

        // this._CXR.push({
        //     "type": "section",
        //     "name": typeN,
        //     "value": doc.cond,
        //     "doc": doc,
        //     "key": _dd,
        //     "chain": chain,
        //     "ref": tx
        // });


        let scsc = await renderSection(tx, cx.doc, this, cx.key);
        // The row element was created by the loop's owner (above); its @-handlers must resolve against THIS row's
        // engine (row alias, index) and fall back to the enclosing view through the engine chain.
        if (el && scsc) Object.defineProperty(el, '_ownerRe', { value: scsc, enumerable: false, configurable: true, writable: true });
        // Which list this row comes from, so a handler's change to the row's copy is saved into it (_lmRowWriteBack).
        if (scsc && typeN === 'for' && forX) scsc._lmRow = { forX: forX, isObj: isObj };
        // cl(23);
        // cl(scsc);
        scsc._re = scsc;



        // let rvs = scsc._re.setEffects(cx.doc, el);
        // // scsc._re.rvs = _vt.View.vars;
        // // scsc._re.reactiveVariables = rvs;

        // scsc._re.renderAll('sections');

        cx.ref.nodes[keyed] = tx;


        return tx;
    }


    attrString(attrs) {
        var buff = [];
        for (var key in attrs) {
            // if(key != "@click") 
            buff.push(key + '="' + attrs[key] + '"');
        }
        if (!buff.length) return '';
        return ' ' + buff.join(' ');
    }
    _stringify(buff, doc) {
        var par = this;
        switch (doc.type) {
            case 'text':
                return buff + doc.content;
            case 'tag':
                buff += '<' + doc.name + (doc.attrs ? par.attrString(doc.attrs) : '') + (doc.isV ? '/>' : '>');
                if (doc.isV) return buff;
                for (let i = 0; i < doc.children.length; i++) {
                    const dc = doc.children[i];
                    buff = buff + (par._stringify('', dc));
                }
                return buff + '</' + doc.name + '>';
            case 'comment':
                // buff += '<!--' + doc.comment + '-->';
                return buff;
            default:
                return '';
        }
    }
    stringify(doc) {
        var par = this;
        return doc.reduce(function (token, rootEl) {
            return token + par._stringify('', rootEl);
        }, '');
    };
}


// 2026-09-17: `scopePath` (new) — where in the _vt tree THIS render's own
// compiled <script> should write/read its reactive vars. Defaults to
// ["View"] (the main view, unchanged behavior for every existing caller).
// A subview mount passes its own ["View","views",i] (or the nested form
// for a subview hosting a subview) — see renderView()'s isSub branch.
// `ownVars`/`ownFns`/`ownViews` (new): for a subview render, the SAME
// objects the mount element's `.vars`/`.fns`/`.views` already point to
// (not fresh `{}`/`[]`s) — so a write through the compiled script's
// `_vt.View.views[i].vars[...]`/`.fns[...]` path (which resolves to that
// element's `.vars`/`.fns`) and a read through this instance's own
// `getVal()`/`evalExp()` (`this.view.vars`) or `evalEvAttr()`
// (`this.view.fns`) see the exact same data. `ownViews` matters for
// NESTED subviews specifically: createEl() pushes onto `this.view.views`
// while THIS instance is rendering — without linking that to the mount
// element's own `.views`, a subview hosting further subviews pushed them
// into a freshly-constructed, orphaned array nothing else could ever
// find (real bug found testing exactly this — nested subviews mounted
// and rendered their own content correctly, but their OWN vars/state
// were unreachable from outside, landing in a throwaway array).
async function renderHST(hst, n, type = 'main', tx, _pv = null, scopePath = ["View"], ownVars, ownFns, ownViews) {

    var reactiveVariables = hst.reactiveVars;
    hst = hst.hst;

    let _re = new _lm(new _v({
        "name": n,
        "type": type,
        "hst": hst,
        "vars": ownVars ?? tx?.vx,
        "fns": ownFns,
        "views": ownViews,
        "rvs": reactiveVariables,
        "_pv": _pv
    }));
    // 2026-09-17: persisted so THIS instance can later render ITS OWN
    // subviews (updateVXRs() -> renderView()) at the right nested path —
    // see both of those for the other half of this.
    _re.view.scopePath = scopePath;

    if (Object.keys(_re._cc).length) {

        // let cssObjs = {};
        // for (const ky in _re._cc) {
        //     if (Object.hasOwnProperty.call(_re._cc, ky)) {
        //         const csses = _re._cc[ky];
        //         for (let inde = 0; inde < csses.length; inde++) {
        //             const css = csses[inde];
        //             let myKey = ky + "_::" + inde;
        //             cssObjs[myKey] = css._css;
        //         }
        //     }
        // }




        for (const ky in _re._cc) {
            if (Object.hasOwnProperty.call(_re._cc, ky)) {
                const csses = _re._cc[ky];
                for (let inde = 0; inde < csses.length; inde++) {
                    let prom = new defer();
                    const css = csses[inde];
                    _csswrk.trigger('css-ready', {
                        "csses": [css._css],
                        "pre": "[vuid='" + ky + "']",
                        "key": ky
                    });
                    _vuid[ky] = prom;
                    let _csses = await prom;
                    css.nd.textContent = _csses[0];

                    // _jsuid[_dd] = el;
                    // prom
                }
            }
        }



        // let prom = new defer();
        // var _dd = md5(new Date().getTime() / 1000 + "::" + Math.random());
        // _csswrk.trigger('css-ready', {
        //     "csses": cssObjs,
        //     "key": _dd,
        //     "pre": _dd
        // });
        // _vuid[_dd] = prom;
        // let _csses = await prom;

        // cl(_csses);

        // for (const ky in _re._cc) {
        //     if (Object.hasOwnProperty.call(_re._cc, ky)) {
        //         const csses = _re._cc[ky];
        //         for (let inde = 0; inde < csses.length; inde++) {
        //             const css = csses[inde];
        //             let myKey = ky + "_::" + inde;
        //             css.nd.textContent = _csses[myKey];
        //         }
        //     }
        // }

    }

    if (Object.keys(_re._jj).length) {
        for (const ky in _re._jj) {
            if (Object.hasOwnProperty.call(_re._jj, ky)) {
                const jses = _re._jj[ky];
                for (let inde = 0; inde < jses.length; inde++) {
                    const nd = jses[inde].nd;
                    let code = _lmScriptCode(nd, _re.view, reactiveVariables, scopePath);
                    if (code === null) continue;
                    code = `try { _lmSetViewVar(document.currentScript); ` + code + ` } catch (e) { reportLumenError({ stage: 'script', error: e }); }`;
                    // sourceURL: DevTools shows this <script>'s errors against
                    // "<viewname>.view" instead of an anonymous VM context.
                    // 2026-09-14, real bug found testing a real project
                    // end-to-end: this used to be appended BEFORE the
                    // try/catch wrap above, landing the comment — and
                    // everything after it on the same line, including the
                    // wrap's own closing brace and catch clause — inside
                    // the try block. A `//` comment eats the rest of its
                    // line, so that silently commented out the catch
                    // entirely and left an unterminated `try`, throwing
                    // "Unexpected end of input" the moment any real
                    // <script> block actually ran (about.view's real
                    // script on roxyon.com, in this case). Must come after
                    // the wrap, on its own trailing line.
                    code = code + `\n//# sourceURL=` + (_re.view?.name || 'view') + `.view.generated.js`;
                    nd.textContent = code;
                }
            }
        }
    }

    return _re;
}

// @before-render / @after-render (2026-09-14) — a developer-facing
// lifecycle hook fired around a :for loop's diff-and-patch pass
// (updateLXRs) or a :if/:else-if/:else section's show/hide transition
// (updateCXRs' showSectionCX/hideSectionCX), letting a DOM-owning plugin
// (a slider, for instance) safely tear down before its content is
// replaced and re-initialize once it's settled — instead of silently
// breaking the next time the underlying data or condition changes.
// Reuses lstnrs.js's own evalEvAttr() — the same handler-resolution logic
// every other @-attribute already goes through (@click, @sl-select, ...:
// a plain function name calls window[name](ev, el, ...), anything else is
// eval'd as an inline expression) — rather than inventing a second one;
// the only new part is WHEN this gets called. Errors inside the handler
// itself are already swallowed by evalEvAttr — matches the established,
// silent-on-error precedent every other @-attribute handler already has;
// not changed here to keep this hook's error behavior consistent with them.
async function fireRenderHook(cx, n, containerEl, extra) {
    if (!containerEl) return;
    let attrKey = '@' + n;
    // The parser lifts @-prefixed attributes into `doc.evs` (its events
    // map) at compile time, same as @click/@sl-select/etc — NOT into
    // `doc.attrs` alongside plain attributes like :for/:if. Verified
    // against real parser output (fcs.js's getAllFiles), not assumed.
    if (!cx.doc || !cx.doc.evs || !cx.doc.evs.hasOwnProperty(attrKey)) return;
    let attrVal = cx.doc.evs[attrKey];
    if (!attrVal) return;
    let ev = Object.assign({ cType: n }, extra || {});
    let result = evalEvAttr(attrVal, ev, $(containerEl), n);
    if (result && typeof result.then === 'function') {
        // 2026-09-17: this used to just await-and-discard. @init (new,
        // subview mounts) needs the handler's actual return value — its
        // whole purpose is "compute this instance's own initial data" —
        // so a Promise result is now awaited AND returned, not thrown
        // away. Every existing @before-render/@after-render caller
        // already ignores this function's return value (none of them
        // needed it), so this is additive, not a behavior change for them.
        try { return await result; } catch (e) { return undefined; }
    }
    return result;
}

// 2026-10-08: a mount `@after-render` used to fire inside createEl(), while the element was still detached and
// before the view's own <script> had run, so `@after-render="setup"` found no `setup` and was silently skipped (and
// `el.offsetWidth`, a chart or a slider saw a detached node). It now fires once the element is in the document and,
// for a plain function name, once that function exists: checked on the next tasks, for up to ~2s.
var _pendingMountHooks = [];
var _mountHookTimer = null;
function _mountHookReady(doc, el) {
    if (!el.isConnected) return false;
    let v = doc && doc.evs && doc.evs['@after-render'];
    if (typeof v !== 'string' || !/^\s*[A-Za-z_$][\w$]*\s*$/.test(v)) return true;
    v = v.trim();
    if (typeof window[v] === 'function') return true;
    for (let e = el._ownerRe, n = 0; e && e.view && n < 50; e = e.view._pv, n++) {
        if (e.view.fns && typeof e.view.fns[v] === 'function') return true;
    }
    return false;
}
function _queueMountHook(doc, el) {
    _pendingMountHooks.push([doc, el, 0]);
    if (!_mountHookTimer) _mountHookTimer = setTimeout(_flushMountHooks, 0);
}
function _flushMountHooks() {
    _mountHookTimer = null;
    let waiting = [];
    let due = _pendingMountHooks;
    _pendingMountHooks = [];
    for (let i = 0; i < due.length; i++) {
        let doc = due[i][0], el = due[i][1], tries = due[i][2];
        if (_mountHookReady(doc, el)) fireRenderHook({ doc: doc }, 'after-render', el, {});
        else if (tries < 40) waiting.push([doc, el, tries + 1]);
        // Still not ready after ~2s: connected means the name is not a function (fire, so the usual error shows);
        // detached means the element was thrown away before it was ever shown.
        else if (el.isConnected) fireRenderHook({ doc: doc }, 'after-render', el, {});
    }
    for (let i = 0; i < waiting.length; i++) _pendingMountHooks.push(waiting[i]);
    if (_pendingMountHooks.length && !_mountHookTimer) _mountHookTimer = setTimeout(_flushMountHooks, waiting.length === _pendingMountHooks.length ? 50 : 0);
}

// 2026-09-16: V1's real automatic plugin-init pass — [sl] (Select2),
// [color] (bootstrap-colorpicker), [time]/[date]/[datetime]
// (bootstrap-datetimepicker via dtp()) — ported faithfully from bea.js's
// own real, un-minified renderPlugins()/dtp() source
// (SBEACDN/s.beacdn.com/beajs/core.js:2846/3834, confirmed against the
// real V1 build root this session already located, not reverse-engineered
// from minified code). Called from createEl() on every element's mount.
// Deliberately built into packages/core's own engine, always available —
// every call below is guarded on the matching $.fn.* method actually
// existing, so a plain project (dom-shim-based, none of these libraries
// loaded) safely no-ops instead of throwing when a view happens to use one
// of these attributes.
// 2026-10-03: createEl() calls autoInitPlugins() BEFORE its caller attaches
// the element to the document. Select2 (like the colorpicker/datetimepicker)
// inserts its visible UI as a sibling ($el.after(container)), which is a
// silent no-op on a parentless node: the <select> was hidden
// (select2-hidden-accessible) and its dropdown never appeared, and the
// "already initialised" guard then skipped it forever. Found on
// console.roxyon.com, where every [sl] select in modals and forms vanished.
// Defer until the element is connected; the render pass attaches it right
// after, so a few short retries cover both sync and async renders.
var _pendingPluginEls = [];
var _pluginFlushTimer = null;
function _flushPendingPlugins(tries) {
    _pluginFlushTimer = null;
    var waiting = [];
    for (var i = 0; i < _pendingPluginEls.length; i++) {
        var p = _pendingPluginEls[i];
        if (p[0].isConnected) autoInitPlugins(p[0], p[1]);
        else waiting.push(p);
    }
    _pendingPluginEls = waiting;
    // Elements still detached after ~2s were discarded before mounting.
    if (waiting.length && tries < 40) {
        _pluginFlushTimer = setTimeout(function () { _flushPendingPlugins(tries + 1); }, 50);
    } else {
        _pendingPluginEls = [];
    }
}
function _queuePluginInit(el, attrs) {
    _pendingPluginEls.push([el, attrs]);
    if (_pluginFlushTimer === null) {
        _pluginFlushTimer = setTimeout(function () { _flushPendingPlugins(0); }, 0);
    }
}

function autoInitPlugins(el, attrs) {
    if (!attrs) return;
    if (el && el.isConnected === false &&
        (attrs.hasOwnProperty('sl') || attrs.hasOwnProperty('color') ||
         attrs.hasOwnProperty('time') || attrs.hasOwnProperty('date') || attrs.hasOwnProperty('datetime'))) {
        _queuePluginInit(el, attrs);
        return;
    }
    try {
        if (attrs.hasOwnProperty('sl') && typeof $.fn.select2 === 'function') {
            initSl($(el));
        }
        if (attrs.hasOwnProperty('color') && typeof $.fn.colorpicker === 'function') {
            $(el).removeAttr('color').colorpicker({ format: 'rgba' });
        }
        if (typeof $.fn.datetimepicker === 'function') {
            if (attrs.hasOwnProperty('time')) dtp($(el), 'time');
            if (attrs.hasOwnProperty('date')) dtp($(el), 'date');
            if (attrs.hasOwnProperty('datetime')) dtp($(el), 'datetime');
        }
    } catch (e) { cl(e); }
}

// Real V1 source, ported as-is (SBEACDN core.js:3404-3518) — the `sl-*`
// attribute family is documented in lumenjs-spec.md §6.7. `:not(.select2-
// hidden-accessible)`-equivalent guard kept even though this only ever
// runs once per element (on mount, never re-checked) — matches V1's own
// idempotency guard exactly, cheap insurance if this is ever called from
// anywhere else in the future.
function initSl(t) {
    if (t.hasClass('select2-hidden-accessible')) return;
    try {
        var plchldr = t.attr("placeholder") ? t.attr("placeholder") : "";
        var dir = $("body").hasClass("rtl") ? "rtl" : "ltr";
        var nr = t.attr("sl-nrmsg") ? t.attr("sl-nrmsg") : "No results found";
        var minResultsForSearch = t.attr("sl-mins") ? t.attr("sl-mins") : 10;
        var allowNewTags = t.attr("sl-ntgs") ? true : false;
        var dropdownParent = t.attr("sl-prt") ? t.attr("sl-prt") : "body";
        if (dropdownParent == "self") dropdownParent = t.parent();
        else dropdownParent = $(dropdownParent);

        var query = t.attr("sl-query") ? t.attr("sl-query") : null;
        var uniquer = Date.now();

        if (typeof window[query] === "function") {
            t.select2.amd.define(
                "adapt_" + uniquer,
                ["select2/data/array", "select2/utils"],
                function (ArrayAdapter, Utils) {
                    function CustomDataAdapter($element, options) {
                        CustomDataAdapter.__super__.constructor.call(this, $element, options);
                    }
                    Utils.Extend(CustomDataAdapter, ArrayAdapter);
                    CustomDataAdapter.prototype.query = function (params, callback) {
                        clearTimeout(_dbcrs[uniquer]);
                        let _t = t;
                        _dbcrs[uniquer] = setTimeout(function () {
                            window[query](params, callback, _t);
                        }, !_dbcrs.hasOwnProperty(uniquer) ? 0 : _dbcrsTime);
                    };
                    return CustomDataAdapter;
                }
            );

            t.select2({
                dropdownParent: dropdownParent,
                minimumResultsForSearch: minResultsForSearch,
                placeholder: plchldr,
                dir: dir,
                tags: allowNewTags,
                allowClear: true,
                language: { noResults: function () { return nr; } },
                ...(t.select2.amd.require("adapt_" + uniquer)
                    ? { ajax: {}, dataAdapter: t.select2.amd.require("adapt_" + uniquer) }
                    : {}),
            });
        } else {
            t.select2({
                dropdownParent: dropdownParent,
                minimumResultsForSearch: minResultsForSearch,
                placeholder: plchldr,
                dir: dir,
                tags: allowNewTags,
                allowClear: true,
                language: { noResults: function () { return nr; } },
            });
        }

        if (t.attr("sl-nosrch"))
            t.on("select2:opening select2:closing", function (event) {
                $(this).parent().find(".select2-search__field").prop("disabled", true);
            });
        if (t.attr("sl-class")) {
            t.on("select2:opening", function (event) { dropdownParent.addClass(t.attr("sl-class")); });
            t.on("select2:closing", function (event) { dropdownParent.removeClass(t.attr("sl-class")); });
        }

        if (t.attr("sl-id") || t.attr("sl-text")) {
            let text = t.attr("sl-text");
            let id = t.attr("sl-id");
            if (!text) text = id;
            if (!id) id = text;
            let newOption = new Option(text, id, true, true);
            t.append(newOption).trigger('select');
        } else {
            t.select2("val", "");
        }

        if (t.attr("sl-value")) t.val(t.attr("sl-value")).trigger('change');
    } catch (e) { cl(e); }
}
var _dbcrs = {};
var _dbcrsTime = 250;

// Real V1 source, ported as-is (SBEACDN core.js:3834-3891) — bootstrap-
// datetimepicker option builder + optional start/end date-linking. Not
// documented in lumenjs-spec.md (see PROVENANCE.md's plugins section);
// this exact option shape was confirmed directly against V1's real source
// once it was located this session, not reverse-engineered.
function dtp(el, t) {
    el.removeAttr(t);
    let opts = {
        format: t == "date" ? "yyyy-mm-dd" : t == "time" ? "hh:ii" : "yyyy-mm-dd hh:ii",
        weekStart: el.attr("date-week-start") ?? 1,
        startView: t == "time" ? 1 : (el.attr("startview") ? el.attr("startview") : 2),
        minView: el.attr("minview") ? el.attr("minview") : t == "time" ? 0 : t == "datetime" ? 0 : 2,
        maxView: el.attr("maxview") ? el.attr("maxview") : t == "time" ? 1 : 4,
        todayBtn: t == "time" ? 0 : el.attr("date-today") == "false" ? 0 : 1,
        todayHighlight: t == "time" ? 0 : el.attr("date-today") == "false" ? 0 : 1,
        language: el.attr("date-lang") ?? "en",
        minuteStep: el.attr("date-minute-step") ?? 5,
        pickerPosition: el.attr("date-position") ?? "top-right",
        autoclose: 1,
        showMeridian: false,
    };
    if (el.attr("date-start")) opts["startDate"] = el.attr("date-start");
    if (el.attr("date-end")) opts["endDate"] = el.attr("date-end");
    if (el.attr("date-value")) opts["date"] = el.attr("date-value");

    el.datetimepicker(opts);

    if (t == "time") {
        el.on("show", function (ev) {
            $(".table-condensed > thead, .table-condensed > thead > tr > th, .table-condensed > thead > tr > th > i")
                .attr("style", "visibility: hidden; font-size:0px !important; overflow: hidden; height: 0px;");
        }).on("hide", function (ev) {
            $(".table-condensed > thead, .table-condensed > thead > tr > th, .table-condensed > thead > tr > th > i")
                .attr("style", "visibility: visible;");
        });
    }
    if (el.attr("date-link-start")) {
        el.on("change", function (e) {
            let dp1 = el.data("datetimepicker");
            let dp2 = $(el.attr("date-link-start")).data("datetimepicker");
            dp2.setStartDate(dp1.getFormattedDate());
            if (dp2.getFormattedDate() < dp1.getFormattedDate() || dp2.getFormattedDate() == "")
                $(el.attr("date-link-start")).val(dp1.getFormattedDate());
        });
    } else if (el.attr("date-link-end")) {
        el.on("change", function (e) {
            let dp1 = $(el.attr("date-link-end")).data("datetimepicker");
            let dp2 = el.data("datetimepicker");
            dp1.setEndDate(dp2.getFormattedDate());
        });
        opts["useCurrent"] = false;
    }
}

// Same region order V1's own auto-injection used (core.js ~L1840).
const _V1_DEFAULT_LAYOUT = {
    hst: ['nav', 'header', 'body', 'footer'].map(function (r) {
        let attrs = {}; attrs[r] = "";
        return { type: "tag", name: "div", isV: false, attrs: attrs, ax: {}, evs: {}, ex: {}, children: [] };
    }),
    reactiveVars: [],
    regions: ['nav', 'header', 'footer'],
};

// V1's tpl="name" / comp="name" includes (src/tpls/*.tpl, src/comps/*.tpl).
// Real V1 content uses both interchangeably, sometimes with a leading "/",
// so each attribute checks its own folder first and the other as fallback.
function _resolveTemplateEntry(attrs) {
    let _payload = (typeof _vcD !== 'undefined' && _vcD) || (typeof _vcData !== 'undefined' ? _vcData : undefined);
    let name = String(attrs['tpl']).replace(/^\/+/, '');
    let bucket = _payload && _payload.tpls;
    // src/tpls/ first; src/comps/ still holds templates in V1 projects, so a tpl= name may live there.
    for (const f of ['tpls', 'comps']) {
        let entry = bucket && bucket[btoa("src/" + f + "/" + name + ".tpl")];
        if (entry) return entry;
    }
    reportLumenError({
        stage: 'tpl',
        error: new Error('tpl="' + name + '" — no such file at src/tpls/' + name + '.tpl'),
    });
    return null;
}

// tpl= renders a template once per :for row, in the row's scope: `<li :for="items as item" tpl="row"></li>`.
// Anywhere else it renders nothing (V1 also allowed it on plain elements and had comp=; both removed in V2,
// decided 2026-10-02). Reported once per element so a migrating site sees exactly which markup to change.
function _reportTplMisuse(doc, par) {
    if (doc._tplReported) return;
    try { Object.defineProperty(doc, '_tplReported', { value: true, enumerable: false }); } catch (e) { }
    let view = (par && par.view && par.view.name) ? ' in "' + par.view.name + '"' : '';
    let msg;
    if (doc.attrs.hasOwnProperty('comp')) {
        msg = 'comp="' + doc.attrs['comp'] + '"' + view + ' is no longer supported. Put the :for on the element and use tpl=, e.g. <' + doc.name + ' :for="items as item" tpl="' + String(doc.attrs['comp']).replace(/^\/+/, '') + '">, and move the template\'s own :for out of the .tpl file.';
    } else {
        msg = 'tpl="' + doc.attrs['tpl'] + '"' + view + ' only works on a :for loop element, e.g. <' + doc.name + ' :for="items as item" tpl="' + String(doc.attrs['tpl']).replace(/^\/+/, '') + '">. It was ignored on this <' + doc.name + '>; move the template\'s :for onto this element.';
    }
    reportLumenError({ stage: 'tpl', error: new Error(msg) });
}

async function renderSection(tx, doc, par, k, sectionsData) {
    if (tx.node.isConnected) {
        if (k) {
            tx._re.update(k);
        }
        return tx._re;
    }


    var hst = doc.children;

    // 2026-09-17: `tpl="name"` on a :for element (`<li :for="items as
    // item" tpl="row"></li>`, the real, documented — lumenjs-spec.md
    // §4.3 — shape; never built in V2 until now). A :for element's own
    // `doc.children` is empty (there's nothing between its tags in the
    // source), which is exactly what's rendered per item above — so
    // this substitutes the template file's own HST as this section's
    // children instead, walked by the SAME engine instance rendering
    // everything else here (this section already has its own vx/vrs —
    // no separate scope, no isolated instance, just this item's content).
    if (doc.attrs && (doc.attrs.hasOwnProperty('tpl') || doc.attrs.hasOwnProperty('comp'))) {
        if (doc.type === 'sections' && doc.attrs.hasOwnProperty('tpl') && !doc.attrs.hasOwnProperty('comp')) {
            let _tplEntry = _resolveTemplateEntry(doc.attrs);
            if (_tplEntry) hst = _tplEntry.hst;
        } else {
            _reportTplMisuse(doc, par);
        }
    }

    // 2026-09-17: real bug found and fixed — a subview mounted INSIDE a
    // :for item (e.g. <div :for="items as item"><div view="widgets/
    // card"></div></div>) never worked at all: renderHST() used to always
    // build a fresh, empty `.views` array for whatever it constructs
    // (see _v's constructor), so createEl() calls made while rendering
    // THIS item's own content pushed the subview's mount element onto a
    // throwaway array nothing else could ever find — renderView()'s
    // isSub search only ever looks at the ENCLOSING view's real `.views`
    // (or a nested subview's own, itself wired the same way). Passing
    // par's own `.view.views`/`.scopePath` through here makes every
    // loop item share the SAME real registry as its enclosing view, so
    // subview mounts inside a loop accumulate into one addressable array
    // (sequential index, in render order) exactly like a static mount —
    // same mechanism either way, just a dynamically-arriving index.
    let _re = await renderHST({ hst, mxes: [] }, tx.key, 'section', tx, par, par?.view?.scopePath || ["View"], undefined, undefined, par?.view?.views);
    // if(par) {
    //     _re.reactiveVariables = par.reactiveVariables;
    // }
    tx._re = _re;

    // if (doc.type == "sections") {

    //     return _re;
    // }
    // cl(tx.key);
    // cl(par);
    // cl(hst);
    // cl(tx);
    // cl(doc);
    // cl(_re);

    // cl("section", _re, par);

    if (tx.node) {
        tx.replaceWith(tx.node);
        tx.node.innerHTML = "";
        tx.node.append(..._re._RealDOM);

        _re.setEffects(doc, tx.node);

        _re.renderAll('section');
    }
    return _re;
}

// `viewsArr`/`scopeBase` (2026-09-17): which subview registry to search
// and which scope path to address matches under — default to the main
// view's own (_vt.View.views / ["View"]) for the top-level, non-recursive
// caller (ws.js's real navigation, index-bootstrap.js, etc. — all
// unaffected, still work exactly as before). A subview instance rendering
// ITS OWN subviews (updateVXRs(), above) passes its own `.views`/
// `.scopePath` instead, so nested subviews resolve against the RIGHT
// array at the RIGHT nested address instead of always the main view's.
// 2026-09-22, real bug found and fixed — see the isSub branch below for
// the full trace. `force` (new, defaults false, appended so every
// existing positional call site is unaffected) lets a genuine "this
// subview's own file content changed" caller (ws.js's hot-reload) bypass
// the new already-mounted skip-gate; every routine caller (updateVXRs())
// leaves it off and gets the gate.
// `modal="some/view"` (lstnrs.js) builds its popup as raw HTML at click time, so no parse-time createEl() ever
// registered the `<div view>` inside it and nothing would render it. Register it the way createEl() registers a
// `view=` element (scope slots + an entry in the main view's `views`), then render it.
// V1 gave every view-mounted (`view="..."`) view's <script> a global `view`: the jQuery-wrapped host element
// (`view.scope(fn)`, `view.set()`, `view.props()`). A route's own script never had one, so only a subview host counts.
// `lm build` omits empty HST fields (fcs.js compactHstReplacer); walk() and every effect reads them unconditionally,
// so restore them once per payload, in place: attrs/ax/evs/ex {}, isV false, children [] on element/section nodes,
// mss [] on text nodes.
function _lmHstDefaults(payload) {
    function fix(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { for (let i = 0; i < n.length; i++) fix(n[i]); return; }
        if (n.type === 'text') { if (!n.mss) n.mss = []; return; }
        if (n.type === 'tag' || n.type === 'section' || n.type === 'sections') {
            if (!n.attrs) n.attrs = {};
            if (!n.ax) n.ax = {};
            if (!n.evs) n.evs = {};
            if (!n.ex) n.ex = {};
            if (n.isV === undefined) n.isV = false;
            if (!n.children) n.children = [];
            fix(n.children);
        }
    }
    for (const sec of ['views', 'layouts', 'tpls']) {
        const group = payload[sec];
        if (!group) continue;
        for (const k in group) if (group[k] && group[k].hst) fix(group[k].hst);
    }
}

// The rewritten code of a view <script> depends only on its source (or shipped AST), the engine's reactive-variable
// names and its scope path — so every :for row, sub-view instance and re-mount of the same view gets the same text.
// Rewriting it each time (parse + deep clone + validate + rewrite + generate) dominated heavy pages
// (console.roxyon.com advanced/php: hundreds of rows). Cache the generated code; the first build of each key still
// validates and reports errors exactly as before.
var _lmScriptCodeBySrc = new Map();
var _lmScriptCodeByAst = new WeakMap();
function _lmScopeExpr(scopePath) {
    let segs = Array.isArray(scopePath) ? scopePath : [scopePath];
    let e = '_vt';
    for (let i = 0; i < segs.length; i++) e += typeof segs[i] === 'number' ? '[' + segs[i] + ']' : '.' + segs[i];
    return e;
}
function _lmScriptCode(nd, view, reactiveVariables, scopePath) {
    // Built by `lm build` (HST v3): only the mount's scope path is left to fill in — no parse, no rewrite.
    if (typeof nd._pre === 'string') return nd._pre.split('_vt.__LMROOT__').join(_lmScopeExpr(scopePath));
    if (typeof getWatcher !== 'function' || typeof acorn === 'undefined') {
        reportLumenError({ stage: 'script', error: new Error('this view script was not precompiled by lm build and this production runtime cannot compile scripts — rebuild with a matching @lmjs/cli') });
        return null;
    }
    let rv = Array.isArray(reactiveVariables) ? reactiveVariables.join(',') : Object.keys(reactiveVariables || {}).join(',');
    let subKey = rv + '\u0001' + (Array.isArray(scopePath) ? scopePath.join('\u0002') : String(scopePath));
    let bucket;
    if (nd._jst !== undefined) {
        if (!nd._jst || typeof nd._jst !== 'object') return null;
        bucket = _lmScriptCodeByAst.get(nd._jst);
        if (!bucket) { bucket = new Map(); _lmScriptCodeByAst.set(nd._jst, bucket); }
        if (bucket.has(subKey)) return bucket.get(subKey);
        let code = getWatcher(nd._jst, view, reactiveVariables, scopePath).code;
        bucket.set(subKey, code);
        return code;
    }
    if (!nd._js || !String(nd._js).trim()) return null;
    let key = nd._js + '\u0000' + subKey;
    if (_lmScriptCodeBySrc.has(key)) return _lmScriptCodeBySrc.get(key);
    let ast;
    try {
        ast = acorn.parse(nd._js, { ecmaVersion: "latest", sourceType: "script" });
    } catch (e) {
        reportLumenError({ stage: 'script', error: e });
        return null;
    }
    let code = getWatcher(ast, view, reactiveVariables, scopePath).code;
    if (_lmScriptCodeBySrc.size >= 1000) _lmScriptCodeBySrc.clear();
    _lmScriptCodeBySrc.set(key, code);
    return code;
}

function _lmSetViewVar(script) {
    for (let n = script && script.parentNode; n; n = n.parentNode) {
        if (n.isSub === true) { window.view = $(n); return; }
    }
}

function mountModalView(el, name) {
    if (!el || !name) return Promise.resolve();
    el.isSub = true;
    el.subPath = prepareNode(name).split("?")[0];
    el.vars = {};
    el.views = [];
    el.fns = {};
    _vt.View.views.push(el);
    return renderView(name, true, {});
}

// What a compiled script's `_vt.<path>` currently points at, proxies
// unwrapped; undefined if any step is missing.
function _lmResolveScope(path) {
    let o = typeof _vt !== 'undefined' ? _vt : undefined;
    for (let i = 0; i < path.length && o != null; i++) {
        o = o[path[i]];
        if (o && o.__isProxy) o = o.target;
    }
    return o;
}

// 2026-10-14: a page render claims `_vt.View` as soon as it starts (the _lm constructor), then awaits the CSS worker
// for its layout, widgets and scoped styles. A second navigation in that window starts a newer page render, which
// claims `_vt.View` in turn; the older render must not mount anything after its awaits (console.roxyon.com sign-in on
// 2.5.7: auth finished after the dashboard had started, mounted, and its `_auth/email` sub-view's script read the
// dashboard's `_vt.View.views[0]`). These say whether a page, or the page an element belongs to, is still current.
function _lmUnwrap(o) { return o && o.__isProxy ? o.target : o; }
function _lmPageIsCurrent(view) {
    return typeof _vt === 'undefined' || _lmUnwrap(_vt.View) === _lmUnwrap(view);
}
// The page view an element was rendered into: up through :if/:for sections (`view._pv`) and sub-views (the element
// each sub-view engine is mounted in). null for layouts and widgets, which outlive a page.
function _lmPageOf(el) {
    let re = el && el._ownerRe;
    for (let i = 0; re && re.view && i < 100; i++) {
        const v = re.view;
        if (v.type === 'main') return v;
        if (v.type === 'section') re = v._pv;
        else if (v.type === 'sub') re = re._lmHost && re._lmHost._ownerRe;
        else return null;
    }
    return null;
}

async function renderView(n, isSub, d, type = 'views', viewsArr, scopeBase = ["View"], force = false) {
    let filePath = "src/views/" + n + ".view"
    if (type == 'layouts') filePath = "src/layouts/" + n + ".layout";

    let fileKey = btoa(filePath);
    if (!isSub) {
        View.props = d ?? {};
        var _queryParams = window.location.href.split("#")[0].split("?");
        var nn = _queryParams.shift();
        View.params = paraToObj(_queryParams) ?? {};
    }
    n = prepareNode(n);
    var _queryParams = n.split("?");
    n = _queryParams.shift();

    // 2026-09-15, real bug found implementing HST versioning: `_vcD` is
    // only ever assigned by ws.js's syncViewFiles() (dev-only, gated on
    // `!_beaTn`) — production never runs that, so `_vcD` itself stays
    // undefined forever in a real prod build, even though the SAME data
    // (views/layouts) is already sitting in the embedded `_vcData` global
    // (baked directly into the bundle at build time — see fcs.js's `vt`).
    // Resolved fresh on every call, not cached at module-load time: fcs.js
    // hands `vt` (which declares `_vcData`) to a remote endpoint that
    // weaves it into the final bundle at a position this code can't see or
    // control, so there's no reliable "by now it's definitely defined"
    // point earlier than an actual function call like this one — by the
    // time any event-driven code (this function) runs, all synchronous
    // top-level script content, wherever the remote endpoint placed it,
    // has already executed.
    let _payload = _vcD || (typeof _vcData !== 'undefined' ? _vcData : undefined);

    // HST wire-format version check (2026-09-15) — see fcs.js's own
    // HST_FORMAT_VERSION comment for the full rationale. Checked once per
    // payload object (not once per call) via a property stamped directly
    // onto it, so a hot-reloaded payload during dev gets re-checked too.
    if (_payload && !_payload.__hstVersionChecked) {
        _payload.__hstVersionChecked = true;
        _lmHstDefaults(_payload);
        if (_payload.hstFormatVersion !== undefined && _HST_FORMATS_ACCEPTED.indexOf(_payload.hstFormatVersion) === -1) {
            reportLumenError({
                stage: 'hst-version-mismatch',
                error: new Error('This project was compiled for HST format v' + _payload.hstFormatVersion + ', but this LumenJS runtime expects v' + EXPECTED_HST_FORMAT_VERSION + '. @lmjs/cli and @lmjs/core are out of sync — reinstall/upgrade both together.'),
            });
            return;
        }
    }

    if ((_payload && _payload[type].hasOwnProperty(fileKey)) /*&& _jswacrk.isStarted()*/ && _csswrk.isStarted()) {
        if (isSub) cl("Rendering", n, fileKey);
        var hst = _payload[type][fileKey];
        // var mxes = hst.mxes;
        // hst = hst.hst;
        // cl("HHHSSSTTT", hst);
        // return;

        if (isSub) {
            // 2026-09-17: per-instance subview scoping — each matched
            // element needs ITS OWN index within the search array (not its
            // position in this filtered-by-subPath list) so its compiled
            // script rewrites into `<scopeBase>.views[<that exact index>].vars`,
            // not the flat `_vt.View.vars` every subview used to collide on.
            // Searches viewsArr (this main view's _vt.View.views by
            // default — unchanged for the top-level caller) or, when
            // called recursively from a subview instance's own
            // updateVXRs(), THAT instance's own `.views` — see
            // updateVXRs() for why nested subviews need this.
            let searchArr = viewsArr || _vt.View.views;
            let els = [];
            for (let i = 0; i < searchArr.length; i++) {
                let _el = searchArr[i];
                if (_el.__isProxy) _el = _el.target;
                if (_el.subPath == n) els.push({ el: _el, viewsIndex: i });
            }
            if (els.length) {
                // cl(els);
                for (let i = 0; i < els.length; i++) {
                    const { el, viewsIndex } = els[i];

                    // 2026-09-22, real bug found and fixed: this whole
                    // block used to run UNCONDITIONALLY on every single
                    // call — and updateVXRs() calls renderView() for
                    // EVERY tracked subview on EVERY renderAll()/update()
                    // of ANY ancestor _lm instance (its own doc comment
                    // never claimed otherwise; nothing gated it). Real
                    // impact, confirmed live on a real guide page: 48
                    // renderView("_guide/footer", ...) calls from a
                    // single page load, each one doing a full
                    // renderHST() + el.innerHTML = "" + re-append + a
                    // fresh renderAll() — a subview's own reactive
                    // updates already propagate correctly without this
                    // (via _mountedSubviewEngines / the widget/subview
                    // walk in _dispatchVarsUpdate()), so every one of
                    // these rebuilds was pure waste, and each one also
                    // pushed a NEW entry into both _mountedSubviewEngines
                    // and this.view.views without ever removing the OLD
                    // one — the real, confirmed root cause of the
                    // "_guide/footer double-mount" finding (a stale,
                    // disconnected leftover entry, not two simultaneously
                    // visible copies). Skip the rebuild when this exact
                    // element is already correctly mounted for this exact
                    // resolved name and its DOM is still live — matching
                    // the widget system's own established
                    // `resolvedFile !== w._resolvedFile` gate. `force`
                    // (ws.js's real hot-reload call, when the subview
                    // FILE's own content genuinely changed) bypasses this,
                    // same shape as ws.js's widget hot-reload fix.
                    if (!force && el._mountedSubPath === n && el._re &&
                        el._re._RealDOM && el._re._RealDOM.some(nd => nd.isConnected)) {
                        continue;
                    }

                    // 2026-09-22, a second real bug found digging further
                    // into the same issue, on top of the gate above: the
                    // gate stops a LIVE, correctly-mounted entry from
                    // being needlessly rebuilt, but a STALE duplicate
                    // (created when this element's own containing view
                    // legitimately re-rendered once — e.g. guide.view's
                    // dynamic `view="_guide/{{nodes[1]}}/{{nodes[2]}}"`
                    // resolving in two passes as `nodes` becomes
                    // available — leaves an ORPHANED older mount element
                    // behind) never satisfies that gate (it's genuinely
                    // disconnected) and was getting a real, full rebuild
                    // attempt on every single one of the ~50 downstream
                    // updateVXRs() calls that share the same searchArr —
                    // confirmed live: this was the actual source of most
                    // of the remaining redundant renderHST() calls after
                    // the gate above, not new distinct elements. The
                    // distinction that makes this safe to skip
                    // permanently, unlike the earlier reverted fix
                    // attempt (which conflated "not yet connected because
                    // still under construction" with "genuinely
                    // orphaned"): el._mountedSubPath is only ever set
                    // AFTER a real, successful mount below — a freshly
                    // created element mid-construction (this pass's own
                    // work, not yet appended by its own caller) has never
                    // had that happen, so it's never affected by this
                    // check. An element that already has it set, and is
                    // STILL disconnected now, unambiguously had a real
                    // mount that was later ripped out from under it by an
                    // unrelated rebuild elsewhere — nothing will ever
                    // reattach it, so retrying is pure waste, forever.
                    if (!force && el._mountedSubPath !== undefined && !el.isConnected) {
                        continue;
                    }

                    // Create/reuse el.vars BEFORE rendering, so the fresh
                    // _v instance renderHST() constructs uses this EXACT
                    // object as its own .vars — see renderHST()'s ownVars
                    // param comment for why that identity matters.
                    el.vars = el.vars || {};
                    el.views = el.views || [];
                    el.fns = el.fns || {};
                    // 2026-10-12: renderHST() awaits (CSS worker), and a
                    // route change in that window makes a NEW main view
                    // `_vt.View`. The sub-view's compiled script addresses
                    // its state through `_vt.<scopePath>` (e.g.
                    // `_vt.View.views[0].vars`), so mounting it now throws
                    // "reading 'vars'" under the new view's name (seen on
                    // console.roxyon.com: /auth -> OTP verify -> pushURL('/')).
                    // If that path resolved to this element before the
                    // await and no longer does, its owner is gone: skip.
                    // Paths that never resolved (e.g. a layout's own
                    // sub-views) keep their old behaviour.
                    const _subPath = scopeBase.concat(["views", viewsIndex]);
                    // 2026-10-14: the element's page can already be gone when this render STARTS (a newer page
                    // render claimed `_vt.View` first), so `_ownedBefore` alone misses it; check the page too.
                    const _page = _lmPageOf(el);
                    if (_page && !_lmPageIsCurrent(_page)) continue;
                    const _ownedBefore = _lmResolveScope(_subPath) === el;
                    let _re = await renderHST(hst, n, 'sub', undefined, null, _subPath, el.vars, el.fns, el.views);
                    if (_ownedBefore && _lmResolveScope(_subPath) !== el) continue;
                    if (_page && !_lmPageIsCurrent(_page)) continue;
                    Object.defineProperty(_re, '_lmHost', { value: el, enumerable: false, configurable: true, writable: true });
                    el._re = _re;
                    el._mountedSubPath = n;
                    _mountedSubviewEngines.push(_re);
                    el.innerHTML = "";
                    // cl(el);
                    el.append(..._re._RealDOM);
                    _re.renderAll();

                    // 2026-09-22: same globalWatch() wiring gap as the
                    // main-view renderView() branch below — real page
                    // content (forms, @scroll-* listeners, lazy images)
                    // frequently lives inside a view="..." subview mount
                    // (e.g. the guide pages' own routing dispatcher),
                    // which renders AFTER and separately from the
                    // top-level page — a call only at the outer level
                    // would already be too early for this content.
                    if (typeof globalWatch === 'function') {
                        try { globalWatch(); } catch (e) { cl(e); }
                    }
                }
                // _re._RealDOM.forEach(_el => el[0].appendChild(_el))
                // cl(_re);
            }
        } else {
            if (type == 'layouts') {
                let appSelector = appSettings.App ?? "[app]";
                var appContainer = $(appSelector);
                if (appContainer.length) {
                    let _rel = await renderHST(hst, n, 'layout');
                    appContainer.data('layout', n).html(_rel._RealDOM);
                    _rel.renderAll();
                    goToNode();
                }
            } else {
                let _re = await renderHST(hst, n, 'main');
                // cl("RRR", _re);

                // V1's per-view auth gate (core.js renderView): a view whose
                // <settings> has requireAuth: true only mounts when
                // Reactor({auth}) (or a global Auth()) returns truthy;
                // otherwise it hands off to appSettings.authView (or the
                // default view) with {redirect, data}. Nothing is mounted
                // yet at this point, so bailing out leaves the page as-is.
                if (_re.view.settings && _re.view.settings.requireAuth) {
                    let authFunc = appSettings.auth && typeof appSettings.auth === "function"
                        ? appSettings.auth
                        : (typeof Auth === "function" ? Auth : null);
                    if (typeof authFunc !== "function") {
                        setError(null, "No Reactor.auth() function detected! Please add one");
                        return;
                    }
                    if (!authFunc()) {
                        let fallback = (appSettings.authView || appSettings.defaultView || "home").toLowerCase();
                        if (fallback == n.toLowerCase()) {
                            setError(null, "The auth view '" + n + "' itself has requireAuth: true — it can never render");
                            return;
                        }
                        return renderView(fallback, null, { redirect: n.toLowerCase(), data: clone(View.props) });
                    }
                }

                let layout = _re.view.settings.layout;

                let filePathL = "src/layouts/" + layout + ".layout";
                let fileKeyL = btoa(filePathL);
                let hstL = _payload['layouts'] && _payload['layouts'][fileKeyL];
                if (!hstL) {
                    // V1 had no layout files — it injected nav/header/body/
                    // footer regions itself. A migrated V1 project (no
                    // src/layouts/ at all) gets that same built-in shape.
                    if (layout && layout !== 'default') {
                        reportLumenError({ stage: 'layout', error: new Error('layout "' + layout + '" not found at ' + filePathL + ' — using the built-in default layout') });
                    }
                    hstL = JSON.parse(JSON.stringify(_V1_DEFAULT_LAYOUT));
                }
                // cl(_rel);


                let appSelector = appSettings.App ?? "[app]";
                var appContainer = $(appSelector);
                // 2026-09-18: whether THIS call just replaced the layout's
                // own DOM wholesale — needed below by the widget
                // resolve/mount/diff pass, since a widget whose resolution
                // hasn't changed still needs its already-rendered nodes
                // reattached to the fresh layout element (the old one they
                // were living in is gone), even though nothing about the
                // widget itself needs re-rendering.
                let layoutJustSwapped = false;
                if (appContainer.length) {
                    let currentLayout = $(appSelector).data('layout');
                    if (currentLayout != layout) {
                        let _rel = await renderHST(hstL, layout, 'layout');
                        if (!_lmPageIsCurrent(_re.view)) return; // a newer page render owns the screen
                        appContainer.data('layout', layout).html(_rel._RealDOM);
                        _rel.renderAll();
                        layoutJustSwapped = true;
                    } else {
                        // cl("Same Layout");
                    }
                } else {
                    $("body").prepend("<div " + (appSelector) + "></div>");
                    let _rel = await renderHST(hstL, layout, 'layout');
                    if (!_lmPageIsCurrent(_re.view)) return;
                    appContainer = $(appSelector);
                    appContainer.data('layout', layout).html(_rel._RealDOM);
                    _rel.renderAll();
                    layoutJustSwapped = true;
                }

                // Persistent layout widgets (_vt.Widgets, 2026-09-18) — see
                // that object's own declaration comment for the design.
                // Runs on EVERY navigation, not gated on layoutJustSwapped:
                // a view's own settings (hasNav: false, hasNav: "nav2", ...)
                // can change what belongs in a region even when the layout
                // itself didn't change at all. hstL.regions is precomputed
                // build-time by fcs.js's annotateLayoutRegions() — the bare
                // (valueless) attribute names the CURRENTLY MOUNTED layout
                // itself declares (e.g. ["header","nav","footer"] for
                // `<header header>`/`<nav nav>`/`<footer footer>`).
                let declaredRegions = (hstL && hstL.regions) || [];
                for (const regionName of declaredRegions) {
                    let settingsKey = "has" + regionName[0].toUpperCase() + regionName.slice(1);
                    let want = _re.view.settings.hasOwnProperty(settingsKey) ? _re.view.settings[settingsKey] : true;
                    let resolvedFile = want === false ? null : (want === true ? regionName : want);

                    let w = _vt.Widgets[regionName] || (_vt.Widgets[regionName] = { vars: {}, fns: {}, views: [], _re: null, _resolvedFile: undefined });

                    if (resolvedFile !== w._resolvedFile) {
                        // Resolution genuinely changed since the last time
                        // this region was resolved — mount fresh, or clear.
                        if (resolvedFile === null) {
                            $('[' + regionName + ']').html('');
                            w._re = null;
                            w._resolvedFile = resolvedFile;
                        } else {
                            let wFilePath = "src/views/widgets/" + resolvedFile + ".view";
                            let wHst = _payload['views'][btoa(wFilePath)];
                            if (wHst) {
                                let _rew = await renderHST(wHst, resolvedFile, 'widget', undefined, null, ["Widgets", regionName], w.vars, w.fns, w.views);
                                if (!_lmPageIsCurrent(_re.view)) return;
                                w._re = _rew;
                                $('[' + regionName + ']').html(_rew._RealDOM);
                                _rew.renderAll();
                                // 2026-09-20 fix: only mark resolved on an
                                // actual successful mount. This used to run
                                // unconditionally (even when wHst wasn't
                                // found), which permanently "resolved" a
                                // widget that never actually mounted — a real
                                // page-load race (the first renderView() call
                                // can run before the dev WS's getfiles fetch
                                // has populated _payload) left nav/footer
                                // empty until a hard refresh happened to win
                                // the race. Leaving w._resolvedFile unset on
                                // a failed mount lets the next renderView()
                                // call retry once the data is really there.
                                w._resolvedFile = resolvedFile;
                            }
                        }
                    } else if (layoutJustSwapped && w._re) {
                        // Same widget as before, but the layout element it
                        // lives in was just replaced wholesale — reattach
                        // the EXISTING rendered nodes (.html() moves real
                        // node references, same as [body]/[slot] below,
                        // it doesn't clone) rather than re-rendering. The
                        // widget's own state (w.vars/.fns/.views) never
                        // lived on the old DOM to begin with, so nothing
                        // was lost — only the attachment point needed
                        // fixing up.
                        $('[' + regionName + ']').html(w._re._RealDOM);
                    }
                    // else: nothing changed and the layout didn't just
                    // swap — this region's DOM/state is left completely
                    // untouched, on purpose (the whole point of this).
                }

                // return;
                // setLayout();
                if (!_lmPageIsCurrent(_re.view)) return;
                $('[body]').html(_re._RealDOM);

                // Layout slots (2026-09-15) — see walk()'s "slot" branch
                // above for how _re.view._slots gets populated. Injected
                // the same way [body] is, right above — .html() moves the
                // already-walked real DOM nodes (doesn't clone them), so
                // this can run before or after renderAll() without
                // affecting which node each reactive effect targets;
                // matching [body]'s own ordering here just for consistency.
                // A view targeting a slot name no loaded layout declares
                // is a legitimate, silent no-op (the layout may simply not
                // have that optional region) — $('[slot="x"]') matching
                // nothing is real jQuery/dom-shim behavior already, not a
                // new case to handle.
                if (_re.view._slots) {
                    for (const slotName in _re.view._slots) {
                        if (Object.prototype.hasOwnProperty.call(_re.view._slots, slotName)) {
                            $('[slot="' + slotName + '"]').html(_re.view._slots[slotName]);
                        }
                    }
                }

                _re.renderAll();

                // 2026-09-22, real bug found and fixed: nothing in the
                // real render pipeline ever called globalWatch() (the
                // function that actually binds forms/o-sub/b-sub via
                // renderPlugins(), lazy images via loadPics(), and
                // @scroll-*/carousel-refresh via reloads()->
                // applyTriggers()) after an ordinary navigation —
                // grepped every real call site, and all of them are
                // gated behind unrelated events (a modal-open click, a
                // real AJAX request completing) that most page loads
                // never trigger at all. This is on top of, and separate
                // from, the dead-code `return;` globalWatch() itself
                // had (also fixed this session) — even with that fixed,
                // nothing was ever calling it. Found chasing a real user
                // report of form data "not being sent to the next view"
                // on a page that never triggers any AJAX activity or
                // opens a modal.
                if (typeof globalWatch === 'function') {
                    try { globalWatch(); } catch (e) { cl(e); }
                }

                // 2026-09-23: V1's real renderView() (core.js:1945) calls
                // View.onAfterMount() here, if defined, once the main
                // view's HTML is actually mounted into [body] — a
                // per-navigation hook, distinct from appSettings.tick()
                // (already ported, fires after EVERY re-render anywhere,
                // not just a real navigation). Confirmed genuinely absent
                // from V2 (grepped both src/ and vendor/) via the V1-vs-V2
                // parity dashboard audit. Ported at the same real position
                // V1 used it, guarded the same defensive way globalWatch()
                // is right above.
                if (typeof View !== 'undefined' && View && typeof View.onAfterMount === 'function') {
                    try { View.onAfterMount(); } catch (e) { cl(e); }
                }
            }
        }
    } else {
        setTimeout(() => {
            renderView(n, isSub, d);
        }, 10);
    }
}
