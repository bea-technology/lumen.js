// V1 parity: dynamic `[reactive]` rendering.
//
// V1 processed every `[reactive]:not(.binded)` element that appeared in the page, whenever it appeared: it
// added class `binded` and rendered the element's markup (`:for`, `:if`/`:else`, `{{mustache}}`, `@events`)
// with its RenderEngine. Code that builds HTML strings at runtime (`$(el).append('<div reactive>...')`, DataTable
// column renderers, "load more" lists) depends on it. V2 compiles views to a syntax tree on the server, so a
// runtime-inserted string was never compiled and stayed raw. This file compiles such a host's DOM into the same
// tree shape the server produces (see `class hst` in packages/cli/lib/fcs.js) and renders it with the normal engine.
//
// Rules kept from V1: only elements the engine did NOT create are candidates (static `reactive` markup inside a
// view is already compiled with it); the host is processed once (class `binded`); a mustache that cannot be
// resolved renders blank; a broken chunk never throws into the page.

var _reactiveEngines = [];

var _rxMoustache = /\{\s*\{\s*([\s\S]*?)\s*\}\s*\}/g;
var _rxVoid = { area: 1, base: 1, basefont: 1, bgsound: 1, br: 1, col: 1, command: 1, embed: 1, frame: 1, hr: 1, image: 1, img: 1, input: 1, isindex: 1, keygen: 1, link: 1, menuitem: 1, meta: 1, nextid: 1, param: 1, source: 1, track: 1, wbr: 1 };
var _rxSkip = {};
("break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield await async of static get set null true false undefined NaN Infinity " +
    "Object Function Boolean Symbol Error Number BigInt Math Date String RegExp Array Map Set WeakMap WeakSet Promise Reflect Proxy Intl JSON console window document navigator location localStorage sessionStorage " +
    "fetch setTimeout clearTimeout setInterval clearInterval parseInt parseFloat isFinite isNaN encodeURI decodeURI encodeURIComponent decodeURIComponent escape unescape globalThis").split(" ").forEach(function (w) { _rxSkip[w] = 1; });
var _rxExprCache = new Map();

function _rxKeepOneSpace(t) {
    t = t.replace(/\s\s/gm, " ");
    if (/\s\s/gm.test(t)) return _rxKeepOneSpace(t);
    return t;
}
function _rxClean(t) {
    t = t.replace(/(\r?\n|\r)/gm, "");
    t = t.replace(/(\t)/gm, "");
    t = _rxKeepOneSpace(t);
    return t.replace(/^(?:\s*\t*\r*\n*\{*)+|(?:\s*\t*\r*\n*\})+$/g, "").trim();
}

// Names an expression reads (a superset is harmless: a name that resolves nowhere never becomes a parameter of
// the evaluator, see getVal()). Skips strings, comments, property names after `.`, and object-literal keys.
function _rxIdents(src, out) {
    var i = 0, n = src.length, prev = "";
    function skipTemplate() {
        i++;
        while (i < n) {
            var c = src[i];
            if (c === "\\") { i += 2; continue; }
            if (c === "`") { i++; return; }
            if (c === "$" && src[i + 1] === "{") {
                i += 2;
                var depth = 1, start = i;
                while (i < n && depth) {
                    var d = src[i];
                    if (d === "`") { var s = i; skipTemplate(); continue; }
                    if (d === "{") depth++;
                    else if (d === "}") { depth--; if (!depth) break; }
                    else if (d === "'" || d === '"') { var q = d; i++; while (i < n && src[i] !== q) { if (src[i] === "\\") i++; i++; } }
                    i++;
                }
                _rxIdents(src.slice(start, i), out);
                i++;
                continue;
            }
            i++;
        }
    }
    while (i < n) {
        var ch = src[i];
        if (ch === "'" || ch === '"') {
            i++;
            while (i < n && src[i] !== ch) { if (src[i] === "\\") i++; i++; }
            i++; prev = "s"; continue;
        }
        if (ch === "`") { skipTemplate(); prev = "s"; continue; }
        if (ch === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
        if (ch === "/" && src[i + 1] === "*") { var e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
        if (/\s/.test(ch)) { i++; continue; }
        if (/[0-9]/.test(ch)) { while (i < n && /[\w.]/.test(src[i])) i++; prev = "n"; continue; }
        if (/[A-Za-z_$]/.test(ch)) {
            var st = i;
            while (i < n && /[\w$]/.test(src[i])) i++;
            var id = src.slice(st, i);
            var j = i;
            while (j < n && /\s/.test(src[j])) j++;
            var isKey = src[j] === ":" && (prev === "{" || prev === ",");
            if (prev !== "." && !isKey && !_rxSkip[id] && out.indexOf(id) === -1) out.push(id);
            prev = "i"; continue;
        }
        prev = ch; i++;
    }
    return out;
}

function _rxExpr(mux) {
    var hit = _rxExprCache.get(mux);
    if (hit) return hit;
    var rv = null;
    try { new Function(mux); rv = _rxIdents(mux, []); } catch (e) { rv = null; }
    if (_rxExprCache.size > 2000) _rxExprCache.clear();
    _rxExprCache.set(mux, rv);
    return rv;
}

function _rxEscape(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// text -> { content, mss } exactly like hst._getMs2(); a mustache holding invalid JS is left as literal text.
function _rxMustaches(text, escapeStatic, rvSet) {
    var found = [], m, last = 0;
    _rxMoustache.lastIndex = 0;
    while ((m = _rxMoustache.exec(text)) != null) {
        var mux = _rxClean(m[0]);
        var rvs = _rxExpr(mux);
        if (rvs) found.push({ index: m.index, len: m[0].length, mux: mux, rvs: rvs });
    }
    if (!found.length) return { content: escapeStatic ? _rxEscape(text) : text, mss: [] };
    var esc = escapeStatic ? _rxEscape : function (s) { return s; };
    var content = "", mss = [];
    for (var k = 0; k < found.length; k++) {
        var f = found[k];
        content += esc(text.substring(last, f.index));
        var start = content.length;
        content += "{{" + f.mux + "}}";
        mss.push({ mus: f.mux, jst: null, rvs: f.rvs.slice(), start: start, end: content.length });
        for (var r = 0; r < f.rvs.length; r++) rvSet[f.rvs[r]] = 1;
        last = f.index + f.len;
    }
    content += esc(text.substring(last));
    return { content: content, mss: mss };
}

function _rxForX(val) {
    var forX = { js: "", as: { k: "", v: "" }, dx: "" };
    val = val.trim();
    if (val.indexOf(";") > -1) { var zxx = val.split(";"); forX.dx = zxx[1].trim(); val = zxx[0].trim(); }
    if (val.indexOf(" as ") > -1) {
        var arr2 = val.split(" as ");
        var arr3 = arr2[1].split(" ").join("").split(",");
        forX.as.k = arr3[0].trim();
        if (arr3.length > 1) forX.as.v = arr3[1].trim();
        val = arr2[0].trim();
    }
    forX.js = val.trim();
    return forX;
}

function _rxCompileNode(n, ptag, rvSet) {
    if (n.nodeType === 3) {
        var t = n.nodeValue;
        var mm = _rxMustaches(t, ptag !== "style", rvSet);
        if (ptag === "textarea" && mm.mss.length) mm = _rxMustaches(t, false, rvSet);
        return { type: "text", content: mm.content, mss: mm.mss, tag: ptag };
    }
    if (n.nodeType !== 1) return null;
    var name = n.localName;
    if (name === "script") return null;
    var res = { type: "tag", name: name, isV: !!_rxVoid[name], attrs: {}, ax: {}, evs: {}, ex: {}, children: [] };
    // The browser already parsed SVG into its namespace; keep that for createEl() (same flag as fcs.js sets).
    if (n.namespaceURI === "http://www.w3.org/2000/svg") res.svg = true;
    var attrs = n.attributes;
    for (var a = 0; a < attrs.length; a++) {
        var an = attrs[a].name, av = attrs[a].value;
        if (an === ":else") { res.type = "section"; res.cond = ""; }
        else if (an === ":if" || an === ":else-if") {
            res.type = "section"; res.cond = av;
            _rxIdents(av, []).forEach(function (id) { rvSet[id] = 1; });
        } else if (an === ":for") {
            res.type = "sections"; res.content = av; res.forX = _rxForX(av);
            if (res.forX.js) _rxIdents(res.forX.js, []).forEach(function (id) { rvSet[id] = 1; });
        }
        // Same "`{{expr}}`" backtick rule as the server compiler (fcs.js), attributes only.
        var ms = _rxMustaches(an.charAt(0) === "@" ? av : av.replace(/`(\{\s*\{[\s\S]*?\}\s*\})`/g, "$1"), false, rvSet);
        if (an.charAt(0) === "@") {
            res.evs[an] = ms.content;
            if (ms.mss.length) res.ex[an] = ms.mss;
        } else {
            res.attrs[an] = ms.content;
            if (ms.mss.length) res.ax[an] = ms.mss;
        }
    }
    _rxOrderIfFor(res);
    if (!res.isV) {
        var kids = n.childNodes;
        for (var c = 0; c < kids.length; c++) {
            var ch = _rxCompileNode(kids[c], name, rvSet);
            if (ch) res.children.push(ch);
        }
        if (name === "style" && !res.children.length) res.children.push({ type: "text", content: "", mss: [], tag: "style" });
    }
    return res;
}

// Same rule as the server compiler (fcs.js hst_orderIfFor): `:if` and `:for` on one element apply in written
// order — `:if` first gates the whole loop, `:for` first makes the `:if` a per-row condition.
function _rxOrderIfFor(res) {
    if (!res || !res.attrs || !res.forX || !Object.prototype.hasOwnProperty.call(res.attrs, ":if")) return;
    var keys = Object.keys(res.attrs);
    var cond = String(res.attrs[":if"]);
    if (keys.indexOf(":if") < keys.indexOf(":for")) res.forX.js = "(" + cond + ") ? (" + res.forX.js + ") : []";
    else res.attrs[":for-if"] = res.attrs[":for-if"] ? "(" + res.attrs[":for-if"] + ") && (" + cond + ")" : cond;
    res.type = "sections";
    delete res.cond;
    delete res.attrs[":if"];
    if (res.ax) delete res.ax[":if"];
}

function _rxCompileHost(host) {
    var rvSet = {}, hst = [], kids = host.childNodes;
    for (var i = 0; i < kids.length; i++) {
        var c = _rxCompileNode(kids[i], host.localName, rvSet);
        if (c) hst.push(c);
    }
    return { hst: hst, reactiveVars: Object.keys(rvSet) };
}

async function _rxRender(host) {
    host.classList.add("binded");
    var compiled = _rxCompileHost(host);
    var sub = null;
    for (var p = host.parentNode; p; p = p.parentNode) { if (p.isSub === true) { sub = p; break; } }
    var _re = await renderHST(compiled, "reactive", "section", undefined, null, ["View"], sub ? sub.vars : undefined, sub ? sub.fns : undefined);
    _re._blankUnresolved = true;

    // `bind="a, b as c"` on the closest ancestor: only the `as` aliases need work, every plain name already resolves
    // through the view/global scope the engine reads from.
    var bindEl = host.closest("[bind]");
    if (bindEl) {
        String(bindEl.getAttribute("bind") || "").split(",").forEach(function (v) {
            var parts = v.trim().split(" as ");
            if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
                try { _re.vrs[parts[1].trim()] = _re.scopedEval(_re.reactiveVariables, parts[0].trim()); } catch (e) { }
            }
        });
    }

    host.textContent = "";
    host.append.apply(host, _re._RealDOM);
    _re._rxHost = host;
    _reactiveEngines.push(_re);
    _re.renderAll("section");
}

function _updateReactiveEngines(varName) {
    for (var i = _reactiveEngines.length - 1; i >= 0; i--) {
        var re = _reactiveEngines[i];
        if (!re._rxHost || !re._rxHost.isConnected) { _reactiveEngines.splice(i, 1); continue; }
        try { re.update(varName); } catch (e) { cl(e); }
    }
}

(function () {
    if (typeof MutationObserver === "undefined" || typeof document === "undefined" || !document.documentElement) return;
    var pending = [], running = false;

    function consider(node) {
        if (!node || node.nodeType !== 1 || node._ownerRe) return;
        if (node.hasAttribute("reactive")) pending.push(node);
        if (node.firstElementChild) {
            var found = node.querySelectorAll("[reactive]");
            for (var i = 0; i < found.length; i++) pending.push(found[i]);
        }
    }

    async function drain() {
        if (running) return;
        running = true;
        var rendered = 0;
        try {
            while (pending.length) {
                var h = pending.shift();
                if (!h.isConnected || h._ownerRe || h.classList.contains("binded")) continue;
                try { await _rxRender(h); rendered++; } catch (e) { reportLumenError({ stage: "reactive", error: e }); }
            }
        } finally { running = false; }
        // V1 rendered [reactive] chunks inside globalWatch(), so the same pass initialized the plugins in them
        // ([sl], [up], [date], forms, ...). Do one globalWatch() per batch of rendered chunks.
        if (rendered && typeof globalWatch === "function") {
            try { globalWatch(); } catch (e) { reportLumenError({ stage: "reactive", error: e }); }
        }
    }

    new MutationObserver(function (records) {
        for (var r = 0; r < records.length; r++) {
            var added = records[r].addedNodes;
            for (var k = 0; k < added.length; k++) consider(added[k]);
        }
        if (pending.length) drain();
    }).observe(document.documentElement, { childList: true, subtree: true });

    function scan() { consider(document.documentElement); if (pending.length) drain(); }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
    else setTimeout(scan, 0);
})();
