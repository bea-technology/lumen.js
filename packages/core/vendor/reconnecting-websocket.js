!function (a, b) {
    "function" == typeof define && define.amd ? define([], b) : "undefined" != typeof module && module.exports ? module.exports = b() : a.ReconnectingWebSocket = b()
}(this, function () {
    function a(b, c, d) {
        function l(a, b) {
            var c = document.createEvent("CustomEvent");
            return c.initCustomEvent(a, !1, !1, b), c
        }
        var e = {
            debug: !1,
            automaticOpen: !0,
            reconnectInterval: 1e3,
            maxReconnectInterval: 3e4,
            reconnectDecay: 1,
            timeoutInterval: 3e3
        };
        d || (d = {});
        for (var f in e) this[f] = "undefined" != typeof d[f] ? d[f] : e[f];
        this.url = b, this.reconnectAttempts = 0, this.readyState = WebSocket.CONNECTING, this.protocol = null;
        var h, g = this,
            i = !1,
            j = !1,
            k = document.createElement("div");
        k.addEventListener("open", function (a) {
            g.onopen(a)
        }), k.addEventListener("close", function (a) {
            g.onclose(a)
        }), k.addEventListener("connecting", function (a) {
            g.onconnecting(a)
        }), k.addEventListener("message", function (a) {
            g.onmessage(a)
        }), k.addEventListener("error", function (a) {
            g.onerror(a)
        }), this.addEventListener = k.addEventListener.bind(k), this.removeEventListener = k.removeEventListener.bind(k), this.dispatchEvent = k.dispatchEvent.bind(k), this.open = function (b) {

            try {
                h = new WebSocket(g.url, c || []), b || k.dispatchEvent(l("connecting")), (g.debug || a.debugAll) && console.debug("ReconnectingWebSocket", "attempt-connect", g.url);
                var d = h,
                    e = setTimeout(function () {
                        (g.debug || a.debugAll) && console.debug("ReconnectingWebSocket", "connection-timeout", g.url), j = !0, j = !1;
                        if (d.readyState == 1) d.close();
                    }, g.timeoutInterval);
                h.onopen = function () {
                    clearTimeout(e), (g.debug || a.debugAll) && console.debug("ReconnectingWebSocket", "onopen", g.url), g.protocol = h.protocol, g.readyState = WebSocket.OPEN, g.reconnectAttempts = 0;
                    var d = l("open");
                    d.isReconnect = b, b = !1, k.dispatchEvent(d)
                }, h.onclose = function (c) {
                    if (clearTimeout(e), h = null, i) g.readyState = WebSocket.CLOSED, k.dispatchEvent(l("close"));
                    else {
                        g.readyState = WebSocket.CONNECTING;
                        var d = l("connecting");
                        d.code = c.code, d.reason = c.reason, d.wasClean = c.wasClean, k.dispatchEvent(d), b || j || ((g.debug || a.debugAll) && console.debug("ReconnectingWebSocket", "onclose", g.url), k.dispatchEvent(l("close")));
                        var e = g.reconnectInterval * Math.pow(g.reconnectDecay, g.reconnectAttempts);
                        setTimeout(function () {
                            g.reconnectAttempts++, g.open(!0)
                        }, e > g.maxReconnectInterval ? g.maxReconnectInterval : e)
                    }
                }, h.onmessage = function (b) {
                    (g.debug || a.debugAll) && console.debug("ReconnectingWebSocket", "onmessage", g.url, b.data);
                    var c = l("message");
                    c.data = b.data, k.dispatchEvent(c)
                }, h.onerror = function (b) {
                    (g.debug || a.debugAll) && console.debug("ReconnectingWebSocket", "onerror", g.url, b), k.dispatchEvent(l("error"))
                }

            } catch (error) {
                // Handle the WebSocket connection error here
                console.error('WebSocket connection error:', error);
            }
        }, 1 == this.automaticOpen && this.open(!1), this.send = function (b) {
            if (h) return (g.debug || a.debugAll) && console.debug("ReconnectingWebSocket", "send", g.url, b), h.send(b);
            throw "INVALID_STATE_ERR : Pausing to reconnect websocket"
        }, this.close = function (a, b) {
            "undefined" == typeof a && (a = 1e3), i = !0, h && h.close(a, b)
        }, this.refresh = function () {
            h && h.readyState == 1 && h.close()
        }
    }
    return a.prototype.onopen = function () { }, a.prototype.onclose = function () { }, a.prototype.onconnecting = function () { }, a.prototype.onmessage = function () { }, a.prototype.onerror = function () { }, a.debugAll = !1, a.CONNECTING = WebSocket.CONNECTING, a.OPEN = WebSocket.OPEN, a.CLOSING = WebSocket.CLOSING, a.CLOSED = WebSocket.CLOSED, a
});

let _isTipped = false;
var _debugMode = false;
var _initialized = null;
var _dbcrs = {};
var _dbcrsTime = 200;
var _tickTime = 20;
var _scW = 0;
var cl = console.log;
if (!_vcData) var _vcData = undefined;
if (!_beaTn) var _beaTn = undefined;
var beas;
var appSettings;
var execEl = "";
var currentlyValidTags = new Array();
// var _upwrk = new WebWorker('/js/wRaws/up.js');
var _upwrk = new WebWorker('_upw');
// var _csswrk = new WebWorker('/js/csswrk.js');
var _csswrk = new WebWorker('_cssw');
// var _jswacrk = new WebWorker('_jswac');
// _jswacrk.start();
// _upwrk.start();
_csswrk.start();
var _ups = [];

(function (e, t) {
    typeof module != "undefined" && module.exports
        ? (module.exports = t())
        : typeof define == "function" && define.amd
            ? define(t)
            : (this[e] = t());
})("bea", function () {
    function p(e, t) {
        for (var n = 0, i = e.length; n < i; ++n) if (!t(e[n])) return r;
        return 1;
    }
    function d(e, t) {
        p(e, function (e) {
            return t(e), 1;
        });
    }
    function v(e, t, n) {
        function g(e) {
            return e.call ? e() : u[e];
        }
        function y() {
            if (!--h) {
                (u[o] = 1), s && s();
                for (var e in f) p(e.split("|"), g) && !d(f[e], g) && (f[e] = []);
            }
        }
        e = e[i] ? e : [e];
        var r = t && t.call,
            s = r ? t : n,
            o = r ? e.join("") : t,
            h = e.length;
        return (
            setTimeout(function () {
                d(e, function t(e, n) {
                    if (e === null) return y();
                    /*!n &&
                      !/^https?:\/\//.test(e) &&
                      c &&
                      (e = e.indexOf(".js") === -1 ? c + e + ".js" : c + e);*/
                    if (l[e])
                        return (
                            o && (a[o] = 1),
                            l[e] == 2
                                ? y()
                                : setTimeout(function () {
                                    t(e, !0);
                                }, 0)
                        );
                    (l[e] = 1), o && (a[o] = 1), m(e, y);
                });
            }, 0),
            v
        );
    }
    function m(n, r) {
        var i = e.createElement("script"),
            u;
        (i.onload =
            i.onerror =
            i[o] =
            function () {
                if ((i[s] && !/^c|loade/.test(i[s])) || u) return;
                (i.onload = i[o] = null), (u = 1), (l[n] = 2), r();
            }),
            (i.async = 1),
            i.setAttribute("crossorigin", "anonymous"),
            i.setAttribute("data-permanent", 1),
            (i.src = h ? n + (n.indexOf("?") === -1 ? "?" : "&") + h : n),
            t.insertBefore(i, t.lastChild);
    }
    var e = document,
        t = e.getElementsByTagName("head")[0],
        n = "string",
        r = !1,
        i = "push",
        s = "readyState",
        o = "onreadystatechange",
        u = {},
        a = {},
        f = {},
        l = {},
        c,
        h;
    return (
        (v.get = m),
        (v.order = function (e, t, n) {
            (function r(i) {
                (i = e.shift()), e.length ? v(i, r) : v(i, t, n);
            })();
        }),
        (v.path = function (e) {
            c = e;
        }),
        (v.urlArgs = function (e) {
            h = e;
        }),
        (v.ready = function (e, t, n) {
            e = e[i] ? e : [e];
            var r = [];
            return (
                !d(e, function (e) {
                    u[e] || r[i](e);
                }) &&
                    p(e, function (e) {
                        return u[e];
                    })
                    ? t()
                    : !(function (e) {
                        (f[e] = f[e] || []), f[e][i](t), n && n(r);
                    })(e.join("|")),
                v
            );
        }),
        (v.done = function (e) {
            v([null], e);
        }),
        v
    );
});

(function (n, t) {
    this[n] = t();
})("sbea", function () {
    return function (x) {
        beas = x;
    };
});

(function (n, t) {
    this[n] = t();
})("Reactor", function () {
    return function (o) {
        appSettings = o;
        if (o.Base) beas = o.Base;
        else {
            var getUrl = window.location;
            var baseUrl = getUrl.protocol + "//" + getUrl.host + "/";
            if (o.subDirectory) baseUrl = baseUrl + o.subDirectory + "/";
            appSettings.Base = baseUrl;
        }
        if (o.App) execEl = o.App;
        if (o.Additional) {
            bea([o.Additional], "ready", function () { });
        }
        // 2026-09-18, real bug found and fixed: Reactor({init, tick, auth})
        // is documented (lumenjs-spec.md §3, llms.md §3) and real V1 projects
        // depend on it (app-wide bootstrap work in init() — auth/session
        // setup, an SDK instance like `rx = new RX(...)`/`bea = new BEA(...)`,
        // globals defaults; periodic work in tick(), e.g. re-highlighting
        // code blocks after every render) — but nothing in this whole
        // runtime ever read o.init/o.tick/o.auth at all. A real, unrelated-
        // looking function (setAppFuncs(), earlier in this same file) does
        // check appSettings.init — but is itself never called from
        // anywhere in the shipped runtime, dead code calling more dead
        // code. Confirmed via a real migrated V1 project end-to-end:
        // `init()`-set globals (`globals.Settings`, an `rx`/`bea` SDK
        // instance) were silently never set, with no error at all — every
        // reference to them elsewhere threw "not defined" instead, easy to
        // misdiagnose as an unrelated data/scoping bug (which is exactly
        // what this took real, extensive tracing to rule out).
        // init(): synchronous, called once, right here — Reactor(o) itself
        // is always the first thing a real index.js does, before whatever
        // triggers the first render (the ready-handler retry guard
        // elsewhere in this file already waits on appSettings.Base, set
        // just above, so no render can start before this function returns).
        if (o.init && typeof o.init === "function") o.init();
        // tick(): "after every re-render, anywhere" (documented) — hooked
        // into _lm.prototype.renderAll in _re.js instead of duplicated
        // here; see that file's own comment for why there, not here.
    };
});

var fullTB = [
    {
        items: [
            "Source",
            "-",
            "searchCode",
            "autoFormat",
            "CommentSelectedRange",
            "UncommentSelectedRange",
            "AutoComplete",
            "-",
            "Save",
            "NewPage",
            "Preview",
            "Print",
            "-",
            "Templates",
            "-",
            "Cut",
            "Copy",
            "Paste",
            "PasteText",
            "PasteFromWord",
            "PasteCode",
            "-",
            "Undo",
            "Redo",
            "-",
            "SelectAll",
            "-",
            "Find",
            "-",
            "Image",
            "CodeSnippet",
            "Flash",
            "Table",
            "HorizontalRule",
            "Smiley",
            "SpecialChar",
            "PageBreak",
            "Iframe",
            "VideoDetector",
            "-",
            "Blockquote",
            "CreateDiv",
            "simplebutton",
            "-",
            "Link",
            "Unlink",
            "Anchor",
            "-",
            "TextColor",
            "BGColor",
            "-",
            "Bold",
            "Italic",
            "Underline",
            "Strike",
            "Subscript",
            "Superscript",
            "-",
            "JustifyLeft",
            "JustifyCenter",
            "JustifyRight",
            "JustifyBlock",
            "-",
            "BidiLtr",
            "BidiRtl",
            "-",
            "NumberedList",
            "BulletedList",
            "-",
            "Outdent",
            "Indent",
            "-",
            "CopyFormatting",
            "RemoveFormat",
            "-",
            "lineheight",
            "letterspacing",
            "Styles",
            "Format",
            "Font",
            "FontSize",
            "-",
            "ShowBlocks",
        ],
    },
];

var normalTB = [
    {
        name: "basicstyles",
        groups: ["basicstyles", "cleanup"],
        items: [
            "Bold",
            "Italic",
            "Underline",
            "Strike",
            "Subscript",
            "Superscript",
            "-",
            "JustifyLeft",
            "JustifyCenter",
            "JustifyRight",
            "JustifyBlock",
            "-",
            "BidiLtr",
            "BidiRtl",
            "Language",
            "-",
            "Undo",
            "Redo",
            "-",
            "SelectAll",
            "-",
            "CopyFormatting",
            "RemoveFormat",
        ],
    },
    "/",
    {
        items: [
            "Find",
            "-",
            "Image",
            "Table",
            "HorizontalRule",
            "Smiley",
            "SpecialChar",
            "Iframe",
            "VideoDetector",
            "-",
            "Link",
            "Unlink",
            "Anchor",
        ],
    },
    {
        name: "paragraph",
        groups: ["list", "indent", "blocks", "align", "bidi"],
        items: [
            "TextColor",
            "BGColor",
            "-",
            "NumberedList",
            "BulletedList",
            "-",
            "Outdent",
            "Indent",
        ],
    },
    "/",
    {
        name: "styles",
        items: [
            "lineheight",
            "letterspacing",
            "Styles",
            "Format",
            "Font",
            "FontSize",
        ],
    },
];

var miniTB = [
    {
        name: "basicstyles",
        groups: ["basicstyles", "cleanup"],
        items: [
            "Bold",
            "Italic",
            "Underline",
            "Strike",
            "Subscript",
            "Superscript",
            "-",
            "JustifyLeft",
            "JustifyCenter",
            "JustifyRight",
            "JustifyBlock",
            "-",
            "BidiLtr",
            "BidiRtl",
            "Language",
            "-",
            "Link",
            "Unlink",
            "Anchor",
            "-",
            "CopyFormatting",
            "RemoveFormat",
        ],
    },
    "/",
    {
        name: "paragraph",
        groups: ["list", "indent", "blocks", "align", "bidi"],
        items: [
            "TextColor",
            "BGColor",
            "-",
            "NumberedList",
            "BulletedList",
            "-",
            "Outdent",
            "Indent",
        ],
    },
    { name: "styles", items: ["Styles", "Format", "Font", "FontSize"] },
];

(function (submit) {
    HTMLFormElement.prototype.submit = function (data) {
        $(this).submit();
        return false;
        // submit.call(this, data);
    };
})(HTMLFormElement.prototype.submit);

// `@event` attributes live on el.events, not in the DOM. SVG elements (inline icons, charts) need the same
// redirection as HTML ones, or `<circle @click="...">` loses its handler.
[HTMLElement, typeof SVGElement !== "undefined" ? SVGElement : null].forEach(function (Ctor) {
    if (!Ctor) return;
    var P = Ctor.prototype;
    P.setAttributeNative = P.setAttribute;
    P.removeAttributeNative = P.removeAttribute;
    P.getAttributeNative = P.getAttribute;
    // el.events only exists on elements the renderer built, so create it on first write: on any other element
    // (script-made, or the <svg> Iconify swaps in) the write used to throw into an empty catch and vanish.
    P.setAttribute = function (prop, val) {
        if (prop.substr(0, 1) == "@") {
            (this.events || (this.events = {}))[prop] = val;
        } else {
            this.setAttributeNative(prop, val);
        }
    };
    // Parsed HTML (jQuery .html() of a string) keeps @-attributes as real DOM attributes, so clear both.
    P.removeAttribute = function (prop, val) {
        if (prop.substr(0, 1) == "@" && this.events) delete this.events[prop];
        this.removeAttributeNative(prop, val);
    };
    P.getAttribute = function (prop, val) {
        if (prop.substr(0, 1) == "@" && this.events && Object.prototype.hasOwnProperty.call(this.events, prop)) {
            return this.events[prop];
        }
        return this.getAttributeNative(prop, val);
    };
});

// Iconify replaces `<span class="iconify" @click="...">` with a new <svg> (parentNode.replaceChild) and copies
// only real DOM attributes onto it. A template-rendered span keeps its @-events on el.events, so carry them over,
// or the icon's click handler is silently lost. Limited to Iconify's own <svg> so no other replacement is affected.
(function (replaceChild) {
    Node.prototype.replaceChild = function (newChild, oldChild) {
        if (oldChild && oldChild.events && typeof SVGElement !== "undefined" && newChild instanceof SVGElement
            && newChild.classList.contains("iconify")) {
            newChild.events = Object.assign({}, oldChild.events, newChild.events);
        }
        return replaceChild.call(this, newChild, oldChild);
    };
})(Node.prototype.replaceChild);

/*jolie */
// (function(){
//     // Store a reference to the original remove method.
//     var originalRemoveMethod = jQuery.fn.append;
//     // Define overriding method.
//     jQuery.fn.append = function(){
//         cl("arguments ",arguments)
//         // Execute the original method.
//         // originalRemoveMethod.apply( this, arguments);
//     }
// })();

var XHRs = new Array();
// 2026-10-08: where web storage is blocked (a sandboxed iframe such as lumenjs.com's playground or an embed,
// cookies disabled, some privacy modes) reading `localStorage` throws, and the line below used to stop the whole
// runtime before anything rendered. Fall back to in-memory storage for that page load instead: `globals` and the
// app's own storage calls keep working, they just aren't kept after a reload.
(function () {
    function memoryStorage() {
        var d = {};
        return {
            getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
            setItem: function (k, v) { d[k] = String(v); },
            removeItem: function (k) { delete d[k]; },
            clear: function () { d = {}; },
            key: function (i) { return Object.keys(d)[i] || null; },
            get length() { return Object.keys(d).length; }
        };
    }
    ["localStorage", "sessionStorage"].forEach(function (name) {
        try {
            var s = window[name];
            if (s) { s.getItem("globals"); return; }
        } catch (e) { }
        try { Object.defineProperty(window, name, { value: memoryStorage(), configurable: true }); } catch (e) { }
    });
})();
if (localStorage.getItem("globals") === null)
    localStorage.setItem("globals", JSON.stringify({}));
if (localStorage.getItem("_rx") === null)
    localStorage.setItem("_rx", JSON.stringify({}));
// 2026-09-21: globals is wrapped in _deepReactive() (see its own comment
// in _re.js) so ordinary nested mutations (globals.Me = "1234", the
// overwhelmingly common real V1 pattern, no setGlobals() call at all)
// trigger a re-render too, not just an explicit setGlobals() call.
//
// 2026-09-21 (cont'd): wrapping at the three FRAMEWORK assignment sites
// (here, updateLocalVariable(), setGlobals()) wasn't enough on its own —
// found on a real page where NOTHING updated at all, not even a single
// leaf value. Root cause: real project index.js code legitimately does
// its own bare reassignment, not through setGlobals() — e.g. a version-
// mismatch reset (`if (globals._version != CURRENT) globals = {
// _version };`), a completely reasonable pattern once you're migrating
// real V1 code, where ANY change to window.globals (by any means) was
// what the old polling model picked up. A bare `globals = {...}`
// reassignment replaces the deep-reactive-wrapped object with a fresh
// PLAIN one — permanently disconnecting it from the reactive system from
// that point on, since nothing about a plain variable reassignment can
// be intercepted by a Proxy; only property access on an object can.
//
// Fixed by making `globals` an ACCESSOR property on `window` instead of
// a plain `var` — this is the one thing that CAN intercept a bare
// reassignment from anywhere, including code this file has never seen
// (project index.js, a view's own script, future framework code). Every
// other reference to the bare `globals` identifier anywhere in this
// bundle continues to work completely unchanged: with no local `var`/
// `let`/`const globals` binding left anywhere (confirmed via a repo-wide
// grep before making this change), ordinary identifier resolution for a
// bare `globals` read/write falls through to `window.globals`, hitting
// this getter/setter exactly as if it were still a plain variable.
//
// The setter has one important guard: `v === _globalsBackingValue` is a
// no-op. Without it, this recurses infinitely — _onGlobalsDeepChange()
// (fired by either path: a nested mutation via the deep-reactive Proxy's
// own trap, OR a bare reassignment via this setter) writes into
// _vt.Global.vars.globals, which is a write through the PRIMARY reactive
// system's own Proxy — and _dispatchVarsUpdate()'s existing Global-write
// branch mirrors EVERY Global var back onto `window[varName]` (see that
// function's own comment), which for varName === "globals" means writing
// window.globals AGAIN — re-entering this very setter with the exact
// same (already-current) value. The identity check catches that second
// pass and stops there.
var _globalsBackingValue;
Object.defineProperty(window, 'globals', {
    configurable: true,
    enumerable: true,
    get: function () { return _globalsBackingValue; },
    set: function (v) {
        if (v === _globalsBackingValue) return;
        _globalsBackingValue = _deepReactive(v, _onGlobalsDeepChange);
        _onGlobalsDeepChange();
    }
});
function _onGlobalsDeepChange() {
    if (typeof _vt !== 'undefined' && _vt.Global && _vt.Global.vars) {
        _vt.Global.vars.globals = globals;
    }
    _scheduleGlobalsSave();
}
// V1 wrote `globals` to localStorage whenever it changed (its tick compared it with the last saved copy), so it
// survived reloads and reached other tabs. V2 had that save commented out. Save on change instead of polling;
// only a real difference is written, which also stops two tabs echoing each other's `storage` events.
var _globalsSaveQueued = false;
function _scheduleGlobalsSave() {
    if (_globalsSaveQueued) return;
    _globalsSaveQueued = true;
    setTimeout(function () {
        _globalsSaveQueued = false;
        try {
            var json = JSON.stringify(_globalsBackingValue === undefined ? {} : _globalsBackingValue);
            if (localStorage.getItem("globals") !== json) localStorage.setItem("globals", json);
        } catch (e) { /* storage full, blocked, or a value JSON cannot encode */ }
    }, 0);
}
globals = clone(JSON.parse(localStorage.getItem("globals")));
let _rx = clone(JSON.parse(localStorage.getItem("_rx")));
var watch = {};
var popups = {
    "modals": [],
    "react-modals": [],
};
var cntrlon = 0;
var _gn = 0,
    _worker;
var nodes = [];
var historyStack = [];

var _jsuid = {};
// 'use strict';


// _jswacrk.on('msg', function (e) {
//     let data = e.originalEvent.data;
//     _vuid[data.key].resolve(data);
// });


function clone(item) {
    if (!item) {
        return item;
    }

    var types = [Number, String, Boolean],
        result;

    types.forEach(function (type) {
        if (item instanceof type) {
            result = type(item);
        }
    });

    if (typeof result == "undefined") {
        if (Object.prototype.toString.call(item) === "[object Array]") {
            result = [];
            item.forEach(function (child, index, array) {
                result[index] = clone(child);
            });
        } else if (typeof item == "object") {
            if (item.nodeType && typeof item.cloneNode == "function") {
                result = item.cloneNode(true);
            } else if (!item.prototype) {
                if (item instanceof Date) {
                    result = new Date(item);
                } else {
                    result = {};
                    for (var i in item) {
                        result[i] = clone(item[i]);
                    }
                }
            } else {
                if (false && item.constructor) {
                    result = new item.constructor();
                } else {
                    result = item;
                }
            }
        } else {
            result = item;
        }
    }

    return result;
}

function isInput(o) {
    if (
        o.is(":checkbox") ||
        o.is("input") ||
        o.is("textarea") ||
        o.is(":radio") ||
        o.is("select")
    )
        return true;
    return false;
}

function getVal(o) {
    if (isInput(o)) {
        return $.trim(o.val());
    }
    return o.html();
}

function setVal(o, v) {
    if (isInput(o)) {
        o.val(v);
    } else o.html(v);
}

function iterateConditions(text) {
    var results = [];
    var opts = text.split("##");
    var iff = opts.shift();
    opts = opts.join("##");
    if (opts.indexOf("#else#") > -1) var hasElse = true;
    if (opts.indexOf("#elseif#") > -1) var hasElseIfs = true;
    if (hasElse) {
        opts = opts.split("#else#");
        var elsee = opts.pop();
        opts = opts.join("");
    }
    if (hasElseIfs) {
        results["elseif"] = [];
        var elseifs = opts.split("#elseif#");
        var ifOpts = elseifs.shift();
        results["if"] = { cond: iff, val: ifOpts };
        for (var index = 0; index < elseifs.length; index++) {
            var elf = elseifs[index].split("##");
            results["elseif"].push({ cond: elf[0], val: elf[1] });
        }
        if (hasElse) results["else"] = elsee;
    } else if (hasElse) {
        results["if"] = { cond: iff, val: opts };
        if (hasElse) results["else"] = elsee;
    } else {
        results["if"] = { cond: iff, val: opts };
    }
    return results;
}

// Pause / resume rendering only. The loader is the developer's to show (`_loader.show()`), never implied here
// (decided 2026-10-02; canonical V1 core.js does the same — only a 2023 V1 variant showed it).
function wait() {
    _initialized = false;
}
function resume() {
    _initialized = true;
}

const pause = (msec) => new Promise((resolve, _) => {
    setTimeout(resolve, msec);
});

// 2026-09-14: guarded against firing before Reactor() has run (which sets
// appSettings, read by getURLNodes() below) — found testing a real project
// end-to-end. $(document).ready() fires SYNCHRONOUSLY, at registration
// time, whenever the document is already non-"loading" by the time this
// line runs, which this framework's own single, large concatenated bundle
// reliably triggers in practice. index.js (the only thing that calls
// Reactor()) is loaded and run separately — see index-bootstrap.js — and
// there's no ordering guarantee between that and this registration.
// Retries on a short timer instead, matching the same "hasn't loaded yet"
// pattern renderView() already uses elsewhere in this codebase.
function _lumenReadyHandler() {
    if (typeof appSettings === 'undefined' || !appSettings) {
        setTimeout(_lumenReadyHandler, 10);
        return;
    }
    nodes = getURLNodes();

    if (_initialized == null) _initialized = true;
    $("html").removeClass("no_js");
    // $('script:not("[tpl],[type="beajs"],[_dd]")').remove();
    if (!$("[exec]").length)
        $("body").append({ beajs: true, body: "<div exec class=h></div>" });
    $(document).keyup(function (e) {
        cntrlon = 0;
    });
    $(document).keydown(function (e) {
        if (e.ctrlKey || e.metaKey) {
            cntrlon = 1;
        }
    });
    goToNode();
}
$(document).ready(_lumenReadyHandler);

function updateLocalVariable(k) {
    if (k == "_rx") _rx = clone(JSON.parse(localStorage.getItem("_rx")));
    // Plain reassignment — the window.globals accessor (defined above)
    // wraps it and fires the reactive dispatch automatically. No need to
    // call _deepReactive()/sync _vt.Global.vars.globals by hand here.
    else globals = clone(JSON.parse(localStorage.getItem("globals")));
}

function setGlobals(x) {
    localStorage.setItem("globals", JSON.stringify(x));
    // Plain reassignment — same as updateLocalVariable() above, the
    // window.globals accessor handles wrapping + the reactive dispatch.
    globals = clone(JSON.parse(localStorage.getItem("globals")));
}

function setRX(x) {
    localStorage.setItem("_rx", JSON.stringify(x));
    _rx = clone(JSON.parse(localStorage.getItem("_rx")));
}

$(window).on("storage", function (e) {
    if (e.originalEvent.key == "globals") {
        if (localStorage.getItem("globals") != null) updateLocalVariable();
        else setGlobals(globals);
    } else if (e.originalEvent.key == "_rx") {
        if (localStorage.getItem("_rx") != null) updateLocalVariable("_rx");
        else setRX(_rx);
    }
});

var _work = function () {
    if (!$(".prog").length)
        $("body").append(
            '<div class="prog"><div class=bar role=bar></div><div class=spinner role=spinner><div class="spinner-icon"></div></div></div>'
        );
    _worker = setTimeout(function () {
        _gn = incri(_gn);
        barSet(_gn, 200);
        _work();
    }, 200);
};

$(document)
    .ajaxStart(function () {
        _gn = 0;
        _work();
        if (typeof heartbeat === "function") heartbeat();
    })
    .ajaxStop(function () {
        _gn = 0;
        barSet(1, 200);
        if (typeof heartbeat === "function") heartbeat();
        globalWatch();
    })
    .ajaxError(function (e, xhr, opt) {
        if (xhr.statusText == "error") {
            if (xhr.status == "422") $("[exec]").html(xhr.responseText);
            else if (xhr.status == "0") {
                $("[dropzone].pending").removeClass("pending").addClass("error");
                $("body").addClass("no-internet-connection");
            }
        }
        if (typeof heartbeat === "function") heartbeat();
        globalWatch();
        _gn = 0;
        barSet(1, 200);
    });

(function ($) {
    $.extend({
        inArrayIn: function (elem, arr, i) {
            if (typeof elem !== "string") {
                return $.inArray.apply(this, arguments);
            }
            if (arr) {
                var len = arr.length;
                i = i ? (i < 0 ? Math.max(0, len + i) : i) : 0;
                elem = elem.toLowerCase();
                for (; i < len; i++) {
                    if (i in arr && arr[i].toLowerCase() == elem) {
                        return i;
                    }
                }
            }
            return -1;
        },
    });
})(jQuery);

$.fn.priorityOn = function (type, selector, data, fn) {
    this.each(function () {
        var $this = $(this);

        var types = type.split(" ");

        for (var t in types) {
            $this.on(types[t], selector, data, fn);

            // Reordering needs real jQuery's private event table; the
            // lightweight shim has none, so there it's a plain .on().
            if (typeof $._data !== "function") continue;
            var currentBindings = ($._data(this, "events") || {})[types[t]];
            if ($.isArray(currentBindings)) {
                currentBindings.unshift(currentBindings.pop());
            }
        }
    });
    return this;
};

$.fn.lock = function () {
    if ($(this).is('form')) {
        $(this).find('[type="submit"]').attr('disabled', 'disabled');
        $(this).find('button:not([type])').attr('disabled', 'disabled');
    }
    return this;
};

$.fn.unlock = function () {
    if ($(this).is('form')) {
        $(this).find('[type="submit"]').removeAttr('disabled');
        $(this).find('button:not([type])').removeAttr('disabled');
    }
    return this;
};

$.fn.onClose = function (selector, data, fn) {
    this.each(function () {
        var el = $(this);
        var types = ["close"];
        for (var t in types) {
            el.on(types[t], selector, data, fn);
        }
    });
    return this;
};

$.fn.attach = function (type, selector, data, fn) {
    var el = $(this);
    var types = type.split(" ");
    for (var t in types) {
        var lu =
            "$.fn.on" +
            types[t] +
            " = function (selector, data, fn) {" +
            "" +
            "                    var el = $(this);" +
            '                    var types = ["' +
            types[t] +
            '"];' +
            "                    for (var t in types) {" +
            "                        el.live(types[t], selector, data, fn);" +
            "                    }" +
            "                return this;" +
            "};";
        try {
            eval(lu);
        } catch (e) { }
    }
    return this;
};

// 2026-09-22, real, severe bug found and fixed: this redefinition
// OVERWROTE dom-shim.js's own correct $.fn.hasAttr (this file loads
// after dom-shim.js in the bundle) with a broken one — this.attr(k)
// (dom-shim's $.fn.attr) returns `null`, matching real getAttribute()
// semantics, for a genuinely absent attribute, never `undefined` (that
// only happens when there's no element at all). `null !== undefined` is
// always true, so this made hasAttr() return TRUE for essentially any
// attribute name on any real element, present or not — masked for
// `@`-prefixed names specifically by an unrelated coincidence (the
// getAttribute monkey-patch above returns real `undefined` for those),
// which is why @-event guards kept working while ~40 other real call
// sites across this file and lstnrs.js (stop/confirm/econfirm/reset/
// o-sub/b-sub/:required/n0-n9 nav-highlighting/data-into/...) did not.
// Found chasing applyTriggers() crashing on a real page — n9.hasAttr()
// returning true for an element that only has n1/n2 was the exact,
// confirmed repro. Matches dom-shim.js's own already-correct
// implementation now.
$.fn.hasAttr = function (k) {
    return !!(this[0] && this[0].getAttribute(k) != null);
};

$.fn.hasKey = function (k) {
    return typeof this.data(k) !== "undefined";
};

function dotsIntoObjs(keys, value) {
    var tempObject = {};
    var container = tempObject;
    keys.split(".").map((k, i, values) => {
        container = container[k] = i == values.length - 1 ? value : {};
    });
    return tempObject;
}

$.fn.set = function (name, value) {
    var splitter = name.split(".");
    if (splitter.length > 1) {
        var key = splitter.shift();
        return this.data(key, dotsIntoObjs(splitter.join("."), value));
    }
    return this.data(name, value);
};

$.fn.props = function () {
    return this.data("props");
};

$.fn.scope = function (_sview) {
    var _scopedVariables = _sview(this, this.data("props") ?? {}) ?? {};
    for (var x = 0; x < Object.keys(_scopedVariables).length; x++) {
        var _key = Object.keys(_scopedVariables)[x];
        var val = _scopedVariables[_key];
        this.set(_key, val);
    }
};

$.fn.isOverflown = function () {
    return (
        $(this)[0].scrollHeight > $(this)[0].clientHeight ||
        $(this)[0].scrollWidth > $(this)[0].clientWidth
    );
};

function removeEmptyElement(arr) {
    var filtered = arr.filter(function (el) {
        return el;
    });
    return filtered;
}

function findInObject(object, property, value) {
    for (var i = 0; i < object.length; i += 1) {
        if (object[i][property] === value) {
            return i;
        }
    }
}

function compareUs(object1, object2) {
    var areObjects = isObject(object1) && isObject(object2);
    if (!areObjects) {
        if (typeof object1 == "number" && typeof object2 == "number") {
            if (isNaN(object1) && isNaN(object2)) return true;
        }
        return object1 == object2;
    }
    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);
    if (keys1.length !== keys2.length) {
        return false;
    }
    // cl("compareUs", object1, object2);
    for (const key of keys1) {
        const val1 = object1[key];
        const val2 = object2[key];
        const areObjects = isObject(val1) && isObject(val2);
        // cl("Aree", areObjects, val1, val2, compareUs(val1, val2));
        if (
            (areObjects && !compareUs(val1, val2)) ||
            (!areObjects && val1 !== val2)
        ) {
            return false;
        }
    }
    return true;
}

function deepCompare(object1, object2, path = '') {
    const areObjects = isObject(object1) && isObject(object2);

    if (!areObjects) {
        if (typeof object1 === "number" && typeof object2 === "number") {
            if (isNaN(object1) && isNaN(object2)) {
                return true;
            }
        }

        if (object1 !== object2) {
            // cl(`Difference at ${path}:`);
            // cl(`   - ${path}: ${object1}`);
            // cl(`   + ${path}: ${object2}`);
            return false;
        }

        return true;
    }

    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);

    if (keys1.length !== keys2.length) {
        // cl(`Difference at ${path}:`);
        // cl(`   - ${path}: ${keys1.length} keys`);
        // cl(`   + ${path}: ${keys2.length} keys`);
        return false;
    }

    for (const key of keys1) {
        const newPath = path ? `${path}.${key}` : key;
        const val1 = object1[key];
        const val2 = object2[key];
        const areNestedObjects = isObject(val1) && isObject(val2);

        if (!deepCompare(val1, val2, newPath)) {
            return false;
        }
    }

    return true;
}

function isObject(object) {
    return object != null && typeof object === "object";
}

(function (old) {
    $.fn.attr = function () {
        if (arguments.length === 0) {
            if (this.length === 0) {
                return null;
            }

            var obj = {};
            $.each(this[0].attributes, function () {
                if (this.specified) {
                    obj[this.name] = this.value;
                }
            });
            return obj;
        }

        return old.apply(this, arguments);
    };
})($.fn.attr);

function st(b) {
    if (!isNaN(b))
        $("html,body")
            .stop()
            .animate({ scrollTop: b + "px" }, { duration: 400 });
    else
        $("html,body")
            .stop()
            .animate({ scrollTop: $(b).offset().top + "px" }, { duration: 400 });
}

function pushURL(url, d) {
    // url = url.toLowerCase();
    if (url || url == "") {
        if (history && history.pushState) {
            history.pushState(
                {},
                "",
                appSettings.Base + "/" + url.replace(new RegExp("^[" + "/" + "]+"), "")
            );
            goToNode(d);
        } else {
            parent.location.href = url;
        }
    } else {
        alert(url);
    }
}

function formatBytes(bytes, decimals) {
    if (bytes == 0) return "0 Bytes";
    var k = 1024,
        dm = decimals <= 0 ? 0 : decimals || 2,
        sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function passwordContainsSymbol(value) {
    var containsSymbol = false,
        symbols = "-!§$%&/()=?.:,~;'#+*-/\\|{}[]_<>\"".split("");

    $.each(symbols, function (index, symbol) {
        if (value.indexOf(symbol) > -1) {
            containsSymbol = true;

            return false;
        }
    });

    return containsSymbol;
}

function passwordStrength(pass) {
    var s = 0,
        n;

    if (pass.length > 5) s += 10;
    if (/[a-z]/.test(pass)) s += 1;
    if (/[A-Z]/.test(pass)) s += 1;
    if (/[0-9]/.test(pass)) s += 1;
    if (passwordContainsSymbol(pass)) s += 1;

    if (s == 14) n = "very-strong";
    else if (s == 13) n = "strong";
    else if (s == 12) n = "medium";
    else if (s == 11) n = "weak";
    else n = "";
    if (/\s/g.test(pass)) n = "has-spaces";

    return n;
}

function passwordValid(pass) {
    var n = passwordStrength(pass);
    if (n == "strong" || n == "very-strong") return true;
    return false;
}

function incri(n) {
    var amount;
    if (n > 1) {
        return 0.994;
    } else {
        if (n >= 0 && n < 0.2) {
            amount = 0.1;
        } else if (n >= 0.2 && n < 0.5) {
            amount = 0.04;
        } else if (n >= 0.5 && n < 0.8) {
            amount = 0.02;
        } else if (n >= 0.8 && n < 0.99) {
            amount = 0.005;
        } else {
            amount = 0.0005;
        }

        n = n + amount;
        if (n < 0.08) n = 0.08;
        else if (n > 0.994) n = 0.994;
        return n;
    }
}

function barSet(n, speed) {
    clearTimeout(_worker);
    if (n < 0.08) n = 0.08;
    else if (n > 1) n = 1;
    // cl(n);
    var bar = $('.bar[role="bar"]');
    // bar.css("margin-left");
    bar.css({
        transition: "all " + speed + "ms linear",
        "-webkit-transition": "all " + speed + "ms linear",
        "-moz-transition": "all " + speed + "ms linear",
        "-o-transition": "all " + speed + "ms linear",
    });
    if ($("body").hasClass("rtl"))
        bar.css({
            "margin-right": -100 + n * 100 + "%",
        });
    else
        bar.css({
            "margin-left": -100 + n * 100 + "%",
        });

    if (n == 1) {
        _worker = setTimeout(function () {
            $(".prog").animate(
                { opacity: 0 },
                {
                    duration: speed,
                    complete: function () {
                        $(".prog").remove();
                    },
                }
            );
        }, speed);
    }
}

function getFormData(form) {
    var unindexed_array = form.serializeArray();
    var indexed_array = {};
    $.map(unindexed_array, function (n, i) {
        if (n["name"].includes("[]")) {
            var key = n["name"].split("[]")[0];
            if (!indexed_array.hasOwnProperty(key)) indexed_array[key] = [];
            indexed_array[key].push(n["value"]);
        } else {
            indexed_array[n["name"]] = n["value"];
        }
    });
    return indexed_array;
}

// 2026-10-08: a URL's #fragment is not part of the route. `/page#part` renders
// `page`, and once it has rendered the browser is asked to scroll to `#part`.
// A popstate that changes only the fragment (an in-page anchor, or Back to
// one) leaves the view alone, as a normal web page would, instead of
// re-rendering it from scratch. V1 read the fragment as part of the view name.
var _lumenRouteKey = null;
function _lumenScrollToHash() {
    var h = location.hash;
    if (!h || h.length < 2) return;
    var id;
    try { id = decodeURIComponent(h.slice(1)); } catch (e) { id = h.slice(1); }
    var tries = 0;
    (function go() {
        var t = document.getElementById(id) || document.getElementsByName(id)[0];
        if (t) t.scrollIntoView();
        else if (++tries < 40) setTimeout(go, 50);
    })();
}
$(window).on("popstate", function () {
    if (!(history && history.pushState)) return;
    if (_lumenRouteKey !== null && location.pathname + location.search === _lumenRouteKey) {
        _lumenScrollToHash();
        return;
    }
    goToNode();
});

var getLocation = function (href) {
    var l = document.createElement("a");
    l.href = href;
    return l;
};

function getURLNodes() {
    appSettings.Base = appSettings.Base.replace(
        new RegExp("[" + "/" + "]+$"),
        ""
    );
    var base = getLocation(appSettings.Base);
    if (base.origin != window.location.origin) {
        appSettings.Base = window.location.origin + base.pathname;
        var base = getLocation(appSettings.Base);
    }
    var _nodes =
        base.pathname != "/"
            ? window.location.pathname
                .split(base.pathname)
                .join("")
                .replace(new RegExp("^[" + "/" + "]+"), "")
                .split("/")
            : location.href
                .split(appSettings.Base)
                .join("")
                .replace(new RegExp("^[" + "/" + "]+"), "")
                .split("#")[0]
                .split("?")[0]
                .split("/");

    // let authFunc = (appSettings.auth && typeof appSettings.auth === "function") ? appSettings.auth : (typeof Auth === "function" ? Auth : null);
    // if (typeof authFunc === 'function') authFunc();
    if (!_nodes[0]) _nodes[0] = appSettings.defaultView ?? "home";
    _lumenRouteKey = location.pathname + location.search;

    if (historyStack[historyStack.length - 1]?.url != window.location.href)
        historyStack.push({
            "nodes": _nodes,
            "params": paramsToObj(window.location.href),
            "url": window.location.href
        });

    return _nodes;
}
var prevNodes = [];
function goToNode(d) {
    if (_initialized) {
        prevNodes = clone(nodes);
        nodes = getURLNodes();
        Promise.resolve(renderView(nodes[0], null, d)).then(_lumenScrollToHash);
    } else {
        setTimeout(function () {
            goToNode(d);
        }, 100);
    }
}
var View = {};

function setError(e, t) {
    if (!e) {
        console.warn(t);
        return;
    }
    console.warn(t, e.message);
}

function renderTpl(el, n, vars) {
    if (!el.length) return;
    if (el.data("_status") == "error") return;
    if (!el.hasKey("_re")) {
        if (el.data("_status") == "pending") {
            getTpl(n, el, vars);
        }
        setTimeout(function () {
            renderTpl(el, n, vars);
        }, _tickTime);
    }
}

function prepareNode(n, rep) {
    var _arr = n.split("/");
    if (_arr.length > 1) {
        for (var i = _arr.length - 1; i >= _arr.length - 1; i--)
            _arr[i] = _arr[i];//.toLowerCase();
        n = _arr.join("/");
    } else n = n;//.toLowerCase();
    return rep ? n.replace(new RegExp("^[" + "/" + "]+"), "") : n;
}

var _esps = {};
var _Views = {};
function setAppFuncs() {
    let initFunc =
        appSettings.init && typeof appSettings.init === "function"
            ? appSettings.init
            : typeof init === "function"
                ? init
                : null;
    if (typeof initFunc === "function") initFunc();
}


function getView(n, el, d) {
    let filePath = "src/views/" + n + ".view";
    let fileKey = btoa(filePath);
    if ($("body").hasKey("view_" + fileKey)) {
        renderView(n, el, d, true);
    } else {
        if (_vcData && _vcData["views"].hasOwnProperty(fileKey)) {
            $("body").data("view_" + fileKey, _vcData["views"][fileKey]);
            renderView(n, el, d, true);
            return;
        }
        if (Nuke && Nuke._ws && Nuke._ws.readyState) {
            Nuke.emit("getview", fileKey, function (e) {
                var r = e.data;
                $("body").data("view_" + fileKey, r);
                renderView(n, el, d, true);
            });
        } else {
            setTimeout(() => {
                getView(n, el, d);
            }, _tickTime);
            // prom.reject();
        }
    }
}

// function getWidgets(settings, getWidgetsFiles, render) {
//     let count = 0,
//         promed = 0;
//     if (settings.hasFooter) {
//         count++;
//         var fileName = settings.hasFooter == true ? "footer" : settings.hasFooter;
//         if (render) renderWidget(fileName, "footer");
//         else {
//             var prom = defer();
//             getWidget(fileName, "footer", prom);
//             prom
//                 .then(function (val) {
//                     promed++;
//                     if (promed == count) getWidgetsFiles.resolve();
//                 })
//                 .catch((reason) => {
//                     promed++;
//                     if (promed == count) getWidgetsFiles.resolve();
//                 });
//         }
//     } else {
//         $("[footer]").html("");
//     }
//     if (settings.hasNav) {
//         count++;
//         var fileName = settings.hasNav == true ? "nav" : settings.hasNav;
//         if (render) renderWidget(fileName, "nav");
//         else {
//             var prom = defer();
//             getWidget(fileName, "nav", prom);
//             prom
//                 .then(function (val) {
//                     promed++;
//                     if (promed == count) getWidgetsFiles.resolve();
//                 })
//                 .catch((reason) => {
//                     promed++;
//                     if (promed == count) getWidgetsFiles.resolve();
//                 });
//         }
//     } else {
//         $("[nav]").html("");
//     }
//     if (settings.hasHeader) {
//         count++;
//         var fileName = settings.hasHeader == true ? "header" : settings.hasHeader;
//         if (render) renderWidget(fileName, "header");
//         else {
//             var prom = defer();
//             getWidget(fileName, "header", prom);
//             prom
//                 .then(function (val) {
//                     promed++;
//                     if (promed == count) getWidgetsFiles.resolve();
//                 })
//                 .catch((reason) => {
//                     promed++;
//                     if (promed == count) getWidgetsFiles.resolve();
//                 });
//         }
//     } else {
//         $("[header]").html("");
//     }
//     if (!count) getWidgetsFiles.resolve();
// }

// function renderWidget(n, b) {
//     let filePath = "src/views/widgets/" + n + ".view";
//     let fileKey = btoa(filePath);
//     if ($("body").hasKey("view_" + fileKey)) {
//         var widget = $("body").data("view_" + fileKey);
//         if (
//             $("[" + b + "]").attr("kd") != fileKey ||
//             $("[" + b + "]").html() == "" ||
//             $("[" + b + "]").hasClass("_render")
//         )
//             $("[" + b + "]")
//                 .removeClass("_render")
//                 .html(widget)
//                 .attr("kd", fileKey);
//     } else {
//         cl("noooo", "view_" + fileKey);
//     }
// }

// function getWidget(n, b, prom) {
//     let filePath = "src/views/widgets/" + n + ".view";
//     let fileKey = btoa(filePath);
//     if ($("body").hasKey("view_" + fileKey)) {
//         prom.resolve();
//     } else {
//         if (_vcData && _vcData["views"].hasOwnProperty(fileKey)) {
//             $("body").data("view_" + fileKey, _vcData["views"][fileKey]);
//             prom.resolve();
//             return;
//         }
//         if (Nuke && Nuke._ws && Nuke._ws.readyState) {
//             Nuke.emit("getview", fileKey, function (e) {
//                 var r = e.data;
//                 $("body").data("view_" + fileKey, r);
//                 prom.resolve();
//             });
//         } else {
//             setTimeout(() => {
//                 getWidget(n, b, prom);
//             }, _tickTime);
//             // prom.reject();
//         }
//     }
// }

function fileToDataURL(file) {
    var reader = new FileReader();
    return new Promise(function (resolve, reject) {
        reader.onload = function (event) {
            resolve(event.target.result);
        };
        reader.readAsDataURL(file);
    });
}

function readFilesAsDataURL(files) {
    return Promise.all(files.map(fileToDataURL));
}

function defer() {
    var res, rej;
    var promise = new Promise((resolve, reject) => {
        res = resolve;
        rej = reject;
    });
    promise.resolve = res;
    promise.reject = rej;
    promise.success = res;
    promise.failed = rej;
    return promise;
}

function getTpl(n, el, vaz) {
    // cl([n, el, vaz]);
    let filePath = "src/tpls/" + n + ".tpl";
    let fileKey = btoa(filePath);
    if (el.data("_status") != "pending") return;
    el.data("_status", "getting");
    if ($("body").hasKey("tpl_" + fileKey)) {
        let r = $("body").data("tpl_" + fileKey);
        el.html(r);
        if (!setRe(el, vaz)) setError(null, "Error in rendering template " + n);
    } else {
        if (_vcData && _vcData["tpls"].hasOwnProperty(fileKey)) {
            $("body").data("tpl_" + fileKey, _vcData["tpls"][fileKey]);
            el.html(_vcData["tpls"][fileKey]);
            if (!setRe(el, vaz)) setError(null, "Error in rendering template " + n);
            return;
        }
        if (Nuke && Nuke._ws && Nuke._ws.readyState) {
            Nuke.emit("gettpl", fileKey, function (e) {
                var r = e.data;
                $("body").data("tpl_" + fileKey, r);
                el.html(r);
                if (!setRe(el, vaz)) setError(null, "Error in rendering template " + n);
            });
        } else {
            setTimeout(() => {
                getTpl(n, el, vaz);
            }, _tickTime);
            // prom.reject();
        }
    }
}

function setRe(_el, vaz) {
    try {
        if (!_el.hasKey("_vars")) {
            if (_debugMode) cl("The Data Arrived", vaz);
            let data = {};
            let vars = vaz.split(",");
            vars = vars.map((s) => s.trim());

            let binds = [];
            let dataNamesValues = [];

            var _subView = _el.closest("[view]");

            for (let x = 0; x < vars.length; x++) {
                if (vars[x] != "") {
                    try {
                        let varName = vars[x];
                        let varValue = vars[x];
                        let NameAs = null;

                        if (varName.indexOf(" as ") !== -1) {
                            varName = varName.split(" as ");
                            varValue = varName[0];
                            varName = varName[1];
                            NameAs = vars[x];
                        }

                        let val = "";
                        if (_subView.length) {
                            val = _subView.hasKey(varValue)
                                ? _subView.data(varValue)
                                : eval(varValue);
                        } else val = eval(varValue);
                        dataNamesValues.push({
                            Name: varName,
                            NameAs: NameAs,
                            Value: val,
                        });
                    } catch (e) {
                        let varName = vars[x];
                        let varValue = vars[x];
                        let NameAs = null;

                        if (varName.indexOf(" as ") !== -1) {
                            varName = varName.split(" as ");
                            varValue = varName[0];
                            varName = varName[1];
                            NameAs = vars[x];
                        }

                        dataNamesValues.push({
                            Name: varName,
                            NameAs: NameAs,
                            Value: undefined,
                        });
                        setError(e, "Error in bind variables for " + vars[x]);
                    }
                }
            }

            for (let x = 0; x < dataNamesValues.length; x++) {
                let dn = dataNamesValues[x];
                binds.push({
                    dataName: dn["Name"],
                    dataNameAs: dn["NameAs"],
                    dataValue: clone(dn["Value"]),
                });
                data[dn["Name"]] = dn["Value"];
            }
            if (_debugMode) cl(["The Data Set", data, binds]);
            if (
                appSettings.beforetick &&
                typeof appSettings.beforetick === "function"
            )
                appSettings.beforetick();
            _el.data("_vars", binds).data("_re", new RenderEngine(_el, data));
            globalWatch();
        }
        _el.data("_status", "complete");
        return true;
    } catch (e) {
        _el.data("_status", "error");
        return false;
    }
    return false;
}

function parseFromString(html) {
    return doc = new DOMParser().parseFromString(html, "text/html");
}
// function htmlDecode(input) {
//   var doc = new DOMParser().parseFromString(input, "text/html");
//   return doc.documentElement.textContent;
// }

var _binds = {};
let _oldGlobals = clone(globals);
let _oldRX = clone(_rx);
let _watch = clone($("body").data("_watch"));

$("body").data("_watch", {
    old: {},
    list: [],
});

//NNNNNEEEEDDDD TO TURN ON
// setInterval(function () {
//     if (!compareUs(_oldGlobals, globals)) {
//         _oldGlobals = clone(globals);
//         localStorage.setItem("globals", JSON.stringify(_oldGlobals));
//     }
//     if (!compareUs(_oldRX, _rx)) {
//         _oldRX = clone(_rx);
//         localStorage.setItem("_rx", JSON.stringify(_oldRX));
//     }
// }, _tickTime);

function reloads() {
    $("[crslf].flickity-enabled.reload-on-bind").each(function () {
        var el = $(this);
        el.flickity("destroy");
        var opts = el.attr("crslf-opts");
        if (!opts) opts = {};
        else opts = JSON.parse(opts);
        el.flickity(opts);
        var flkty = el.data("flickity");
        flkty.on("dragStart", () =>
            flkty.slider.childNodes.forEach(
                (slide) => (slide.style.pointerEvents = "none")
            )
        );
        flkty.on("dragEnd", () =>
            flkty.slider.childNodes.forEach(
                (slide) => (slide.style.pointerEvents = "all")
            )
        );
    });
    $("[crsl].crsl-initialized").each(function () {
        $(this).crsl("refresh");
    });
    let tickFunc =
        appSettings.tick && typeof appSettings.tick === "function"
            ? appSettings.tick
            : typeof tick === "function"
                ? tick
                : null;
    if (typeof tickFunc === "function") tickFunc();

    // 2026-09-22: scsc/dgsc (scroll-scope/drag-scope reset helpers) are
    // referenced here but never defined anywhere in this codebase — real,
    // pre-existing V1 references to some scroll/drag-effect library that
    // was apparently never ported. Guarded rather than reproduced (out of
    // scope here) so this function's real, needed work — applyTriggers(),
    // the actual bind site for @scroll/@scroll-start/@scroll-end/etc. —
    // isn't blocked by an unrelated, longstanding gap.
    if (typeof scsc !== "undefined") scsc.reset();
    if (typeof dgsc !== "undefined") dgsc.reset();
    applyTriggers();
    setTimeout(() => {
        if (typeof scsc !== "undefined") scsc.reset();
        if (typeof dgsc !== "undefined") dgsc.reset();
        applyTriggers();
    }, _tickTime * 2);
}

function renderViewsTpls() {


    $("[view]").each(function (i) {
        var el = $(this);

        if (
            el.data("_status") != "pending" &&
            el.data("_status") != "error" &&
            el.data("_status") != "getting" &&
            el.data("_status") != "complete"
        ) {
            var modal = el.closest("popup");
            var n = el.attr("view");
            var _props = el.attr(":props") ?? null;
            var _binds = el.attr(":props-bind") ?? null;
            el.data("_status", "pending");

            let nn = n;
            var _arr = nn.split("/");
            if (_arr.length > 1) {
                for (var i = _arr.length - 1; i >= _arr.length - 1; i--) {
                    _arr[i] = _arr[i].toLowerCase();
                }
                nn = _arr.join("/");
            } else {
                nn = nn.toLowerCase();
            }

            var _queryParams = nn.split("?");
            nn = _queryParams.shift();





            if (el.attr(":data")) {
                let vaz = el.attr(":data");
                let data = {};
                let vars = vaz.split(",");
                let dataNamesValues = [];
                let binds = [];
                vars = vars.map((s) => s.trim());
                for (let x = 0; x < vars.length; x++) {
                    if (vars[x] != "") {
                        try {
                            let varName = vars[x];
                            let varValue = vars[x];
                            let NameAs = null;

                            if (varName.indexOf(" as ") !== -1) {
                                varName = varName.split(" as ");
                                varValue = varName[0];
                                varName = varName[1];
                                NameAs = vars[x];
                            }

                            let val = "";
                            val = eval(varValue);
                            dataNamesValues.push({
                                Name: varName,
                                NameAs: NameAs,
                                Value: val,
                            });
                        } catch (e) {
                            cl(e);
                            let varName = vars[x];
                            let varValue = vars[x];
                            let NameAs = null;

                            if (varName.indexOf(" as ") !== -1) {
                                varName = varName.split(" as ");
                                varValue = varName[0];
                                varName = varName[1];
                                NameAs = vars[x];
                            }

                            dataNamesValues.push({
                                Name: varName,
                                NameAs: NameAs,
                                Value: undefined,
                            });
                            setError(e, "Error in bind variables for " + vars[x]);
                        }
                    }
                }

                for (let x = 0; x < dataNamesValues.length; x++) {
                    let dn = dataNamesValues[x];
                    binds.push({
                        dataName: dn["Name"],
                        dataNameAs: dn["NameAs"],
                        dataValue: clone(dn["Value"]),
                    });
                    data[dn["Name"]] = dn["Value"];
                }

                el.data("props", data);





            } else {
                var _d = paraToObj(getBind(_binds, _props));

                el.data("params", paraToObj(_queryParams));
                if (modal.length) _d["modal"] = modal.data("props");
                el.data("props", _d);
            }

            if (n == "" || !n || n.split("/").slice(-1) == "") {
                el.data("_status", "error");
            } else {
                renderView(n, el, _d);
            }
        }
    });

    // $("[tpl],[comp]").each(function () {
    //     let el = $(this);
    //     if (
    //         el.data("_status") != "pending" &&
    //         el.data("_status") != "error" &&
    //         el.data("_status") != "getting" &&
    //         el.data("_status") != "complete"
    //     ) {
    //         var modal = el.closest("modal");
    //         if (!modal.length) {
    //             let n = el.attr("tpl") ?? el.attr("comp");
    //             el.data("_status", "pending");
    //             if (n == "" || !n || n.split("/").slice(-1) == "") {
    //                 el.data("_status", "error");
    //             } else renderTpl(el, n, el.attr(":data") ?? "");
    //         }
    //     }
    // });
}


// 2026-09-26: every optional-plugin call below is guarded on the plugin
// actually being loaded. A V1 project can legitimately carry the attribute
// while the library is not bundled: the CLI's detectUsedPlugins() only scans
// static project files, so markup arriving at runtime (BaaS data rendered
// through a raw-HTML mustache, for instance) is invisible to it. Unguarded,
// the call throws and aborts the REST of this pass -- confirmed live in
// /BEACDN/_test: one [numeric] input stopped the [pattern] -> data-pattern
// transfer that checkFormInputs() depends on, so form validation broke with
// no error anywhere. Same failure shape as the old CKEDITOR throw. Matches
// the guard convention autoInitPlugins() (src/_re.js) already uses.
function renderPlugins() {
    $(
        "[crslf]:not(.flickity-enabled,[comp],[tpl],[view]),[crslf][comp]:not(.flickity-enabled),[crslf][tpl]:not(.flickity-enabled),[crslf][view]:not(.flickity-enabled)"
    ).each(function () {
        if (typeof $.fn.flickity !== "function") return;
        var el = $(this);

        if (el.hasAttr("[tpl]") || el.hasAttr("[comp]") || el.hasAttr("[view]")) {
            if (el.data("_status") != "complete") return;
        }

        var opts = el.attr("crslf-opts");
        if (!opts) opts = {};
        else opts = JSON.parse(opts);
        el.flickity(opts);
        var flkty = el.data("flickity");
        flkty.on("dragStart", () =>
            flkty.slider.childNodes.forEach(
                (slide) => (slide.style.pointerEvents = "none")
            )
        );
        flkty.on("dragEnd", () =>
            flkty.slider.childNodes.forEach(
                (slide) => (slide.style.pointerEvents = "all")
            )
        );
        setTimeout(function () {
            globalWatch();
        }, 600);
    });
    $(
        "[crsl]:not(.crsl-initialized,[comp],[tpl],[view]),[crsl][comp]:not(.crsl-initialized),[crsl][tpl]:not(.crsl-initialized),[crsl][view]:not(.crsl-initialized)"
    ).each(function () {
        if (typeof $.fn.crsl !== "function") return;
        var el = $(this);
        if (el.hasAttr("[tpl]") || el.hasAttr("[comp]") || el.hasAttr("[view]")) {
            if (el.data("_status") != "complete") return;
        }

        el.crsl();
        el.on(
            "setPosition beforeChange",
            function (event, slick, currentSlide, nextSlide) {
                $(window).trigger("scroll.scsc");
                $(window).trigger("resize");
            }
        );
    });

    $("[up]:not([upid])").each(function () {
        var u = _ups.length;
        var t = $(this);
        var mxf = t.attr('data-mxf') ? t.attr('data-mxf') : 10;
        if (!t.hasAttr("upid")) {
            var sl = "up_" + u;
            t.attr("upid", sl);
            t.prepend(`<input ` + (mxf > 1 ? 'multiple' : '') + ` type="file" ` + "" + ` files style="display:none;" />`);
            _ups.push(t);
            // Start the upload worker as soon as the page has an uploader (V1 started it at boot), so the first
            // files-added is not delayed by the worker loading.
            if (typeof _upwrkStarted === "function") _upwrkStarted();
        }
    });

    $("form:not(.binded,[norm])").each(function () {
        var el = $(this);
        var reset = false;
        if (el.hasAttr("reset")) reset = true;
        var actn = el.attr("action") ?? "";
        var local = false;
        el.addClass("binded");

        if (actn == "") {
            actn = getURLNodes().join("/");
            local = true;
        } else local = isPathLocal(actn);

        if (el.hasAttr("o-sub")) {
            el.ajaxForm({
                beforeSubmit: function (formData, f, options) {
                    // options["url"] = beas + "a" + f.attr('action');
                    let formDataMapped = {};
                    let formDataMappedAdditionals = {};
                    formDataMapped = Object.assign(
                        {},
                        ...formData.map((x) => {
                            if (x.type == "file") {
                                if (!formDataMappedAdditionals.hasOwnProperty(x.name))
                                    formDataMappedAdditionals[x.name] = [];
                                formDataMappedAdditionals[x.name].push(x["value"]);

                                return undefined;
                            }
                            if (x["name"].includes("[]")) {
                                var key = x["name"].split("[]").join("");
                                if (!formDataMappedAdditionals.hasOwnProperty(key))
                                    formDataMappedAdditionals[key] = [];
                                formDataMappedAdditionals[key].push(x["value"]);
                                return undefined;
                            }

                            return { [x.name]: x.value };
                        })
                    );

                    formDataMapped = { ...formDataMapped, ...formDataMappedAdditionals };

                    // var d = getFormData(f);
                    if (f.hasAttr("b-sub")) {
                        var bfs = f.attr("b-sub");
                        if (typeof window[bfs] === "function") {
                            checkFormInputs(f);
                            if (window[bfs](f, formDataMapped) === false) return false;
                        }
                    }
                    if (!checkFormInputs(f)) return false;
                    if (f.hasAttr("o-sub")) {
                        var ofs = f.attr("o-sub");
                        if (typeof window[ofs] === "function") {
                            window[ofs](f, formDataMapped);
                        }
                    }
                    return false;
                },
                clearForm: reset,
                resetForm: reset,
                success: function (responseText, statusText, xhr, f) { },
                timeout: 300000,
                error: function (xhr, textStatus, errorThrown) { },
            });

            // el.attr('onsubmit','return false;');
            // el.on('submit',function(ev){
            //     ev.preventDefault();
            //     ev.stopPropagation();

            //     if(!checkFormInputs(el)) return false;

            //     var d = getFormData(el);
            //     if (el.hasAttr('b-sub')) {
            //         var bfs = el.attr('b-sub');
            //         if (typeof window[bfs] === "function") {
            //             if (window[bfs](el,d) === false) return false;
            //         }
            //     }
            //     if (el.hasAttr('o-sub')) {
            //         var ofs = el.attr('o-sub');
            //         if (typeof window[ofs] === "function") {
            //             window[ofs](el,d);
            //         }
            //     }
            // });
        } else {
            if (local) {
                el.ajaxForm({
                    beforeSubmit: function (formData, f, options) {
                        // options["url"] = beas + "a" + f.attr('action');
                        if (!checkFormInputs(f)) return false;
                        let formDataMapped = {};
                        let formDataMappedAdditionals = {};
                        formDataMapped = Object.assign(
                            {},
                            ...formData.map((x) => {
                                if (x.type == "file") {
                                    if (!formDataMappedAdditionals.hasOwnProperty(x.name))
                                        formDataMappedAdditionals[x.name] = [];
                                    formDataMappedAdditionals[x.name].push(x["value"]);

                                    return undefined;
                                }
                                if (x["name"].includes("[]")) {
                                    var key = x["name"].split("[]").join("");
                                    if (!formDataMappedAdditionals.hasOwnProperty(key))
                                        formDataMappedAdditionals[key] = [];
                                    formDataMappedAdditionals[key].push(x["value"]);
                                    return undefined;
                                }

                                return { [x.name]: x.value };
                            })
                        );

                        formDataMapped = {
                            ...formDataMapped,
                            ...formDataMappedAdditionals,
                        };
                        try {
                            // var d = getFormData(f);
                            if (f.hasAttr("b-sub")) {
                                var bfs = f.attr("b-sub");
                                if (typeof window[bfs] === "function") {
                                    if (window[bfs](f, formDataMapped) === false) return false;
                                }
                            }
                            var actn = f.attr("action") ?? "";
                            if (actn == "") {
                                actn = getURLNodes().join("/");
                            }
                            if (validateInputs(f)) {
                                var d = getFormData(f);
                                if (f.attr("method")?.toLowerCase() == "get") {
                                    actn = addOrChangeParameters(actn, d);
                                }
                                pushURL(actn, d);
                            }
                        } catch (e) {
                            cl(e);
                        }
                        return false;
                    },
                    clearForm: reset,
                    resetForm: reset,
                    success: function (responseText, statusText, xhr, f) { },
                    timeout: 300000,
                    error: function (xhr, textStatus, errorThrown) { },
                });

                // el.attr('onsubmit','return false;');
                // el.on('submit',function(ev){
                //     ev.preventDefault();
                //     ev.stopPropagation();

                //     if(!checkFormInputs(el)) return false;
                //     try{
                //         var d = getFormData(el);
                //         if (el.hasAttr('b-sub')) {
                //             var bfs = el.attr('b-sub');
                //             if (typeof window[bfs] === "function") {
                //                 if (window[bfs](el,d) === false) return false;
                //             }
                //         }
                //         var actn = el.attr('action')??"";
                //         if(actn==""){
                //             actn = getURLNodes().join("/");
                //         }
                //         if(validateInputs(el)){
                //             if(el.attr('method')?.toLowerCase()=="get"){
                //                 var d = getFormData(el);
                //                 actn = addOrChangeParameters(actn, d);
                //             }
                //             pushURL(actn,d);
                //         }
                //     } catch(e){
                //         cl(e);
                //     }
                // });
            }
        }
    });

    $("[editor]").each(function (i) {
        var editor = $(this);
        editor.removeAttr("editor");
        var TB = normalTB;
        if (editor.is("[mini]")) TB = miniTB;
        else if (editor.is("[full]")) TB = fullTB;

        if (typeof CKEDITOR !== "undefined") {
            /*CKEDITOR.plugins.addExternal( 'autocomplete', 'https://s.beacdn.com/j/autocomplete/plugin.js' );*/
            CKEDITOR.replace(this, {
                uiColor: "#ffffff",
                language: $("html").attr("lang"),
                allowedContent: true,
                //extraPlugins: 'autocomplete',
                enterMode: CKEDITOR.ENTER_BR,
                toolbar: TB,
                on: {
                    instanceReady: function (evt) {
                        var itemTemplate =
                            '<li class="l" data-id="{id}">' +
                            '<div><strong class="item-title">{name}</strong></div>' +
                            "<div><i>{description}</i></div>" +
                            "</li>",
                            outputTemplate = "<span class=hash>{linked}</span>&nbsp;";

                        var autocomplete = new CKEDITOR.plugins.autocomplete(evt.editor, {
                            textTestCallback: function (range) {
                                if (!range.collapsed) {
                                    return null;
                                }
                                //cl(range);

                                //var range = new CKEDITOR.dom.range( evt.editor.document );
                                //cl(range);

                                return CKEDITOR.plugins.textMatch.match(
                                    range,
                                    function (text, offset) {
                                        var left = text.slice(0, offset);
                                        var matchHash = left.match(/#\d*$/);
                                        var matchAt = left.match(
                                            /(@)[A-Za-z]+(?!\.)(?!.*\.$)(?!.*?\.\.)[a-zA-Z0-9.]+[A-Za-z0-9]{6,30}$/
                                        );

                                        if (
                                            (!matchHash || matchHash == "#") &&
                                            (!matchAt || matchAt == "@")
                                        ) {
                                            return null;
                                        }
                                        var match = matchHash;
                                        if (!match) match = matchAt;

                                        return { start: match.index, end: offset };
                                    }
                                );
                            },
                            dataCallback: function (matchInfo, callback) {
                                var query = matchInfo.query;

                                if (myR["[ck]"]) myR["[ck]"].abort();

                                clearTimeout(debounceTimeout["[ck]"]);
                                debounceTimeout["[ck]"] = setTimeout(function () {
                                    myR["[ck]"] = $.post(
                                        beas + "a" + "/hashes/get",
                                        { id: query },
                                        function (result) {
                                            if (result) {
                                                result = $.parseJSON(result);
                                                var suggestions = result.filter(function (item) {
                                                    return (
                                                        String(item.name).indexOf(query.substring(1)) == 0
                                                    );
                                                });
                                                callback(suggestions);
                                            }
                                        }
                                    );
                                }, 500);
                            },
                            itemTemplate: itemTemplate,
                            outputTemplate: outputTemplate,
                            throttle: 100,
                        });

                        autocomplete.getHtmlToInsert = function (item) {
                            return this.outputTemplate.output(item);
                        };
                    },
                    change: function (ev) {
                        if ($.trim(ev.editor.getData()).length == 0)
                            editor
                                .closest(".fields")
                                .addClass("is-empty")
                                .removeClass("is-not-empty");
                        else
                            editor
                                .closest(".fields")
                                .removeClass("is-empty error")
                                .addClass("is-not-empty");
                        editor.val(ev.editor.getData()).trigger("change");
                    },
                    focus: function (ev) {
                        editor.closest(".fields").addClass("focused");
                        if ($.trim(ev.editor.getData()).length == 0)
                            editor
                                .closest(".fields")
                                .addClass("is-empty")
                                .removeClass("is-not-empty");
                        else
                            editor
                                .closest(".fields")
                                .removeClass("is-empty error")
                                .addClass("is-not-empty");
                    },
                    blur: function (ev) {
                        editor.closest(".fields").removeClass("focused");
                        if ($.trim(ev.editor.getData()).length == 0)
                            editor
                                .closest(".fields")
                                .addClass("is-empty")
                                .removeClass("is-not-empty");
                        else
                            editor
                                .closest(".fields")
                                .removeClass("is-empty error")
                                .addClass("is-not-empty");
                    },
                },
            });
        }
    });

    $(".cke_autocomplete_panel").each(function () {
        if ($(this).html() == "") $(this).remove();
    });

    $("[tags]:not(.tag-editor-hidden-src)").each(function () {
        if (typeof $.fn.tagEditor !== "function") return;
        var t = $(this);

        var u = currentlyValidTags.length;
        t.attr("data-u", u);
        var del = t.attr("dl") ? t.attr("dl") : ", ";
        var maxTags = t.attr("mt") ? t.attr("mt") : 50;
        var maxLength = t.attr("ml") ? t.attr("ml") : 100;
        var plchldr = t.attr("placeholder") ? t.attr("placeholder") : "";
        var tagslower = t.attr("tags-lower") ? true : false;
        var autocomplete = t.attr("acs")
            ? {
                delay: 250,
                autoFocus: true,
                position: { collision: "flip" },
                source: function (request, response) {
                    $.post(beas + "a" + t.attr("acs"), request, response);
                },
                minLength: 1,
                select: function (event, ui) {
                    /*t.trigger('change');*/
                    // cl(ui);
                    if (ui.item == null) {
                        t.val("");
                        /*t.focus();*/
                    }
                },
                change: function (event, ui) {
                    if (ui.item == null) {
                        t.val("");
                        /*t.focus();*/
                    }
                },
            }
            : null;
        t.tagEditor({
            autocomplete: autocomplete,
            delimiter: del,
            removeDuplicates: true,
            forceLowercase: tagslower,
            placeholder: plchldr,
            animateDelete: 50,
            maxLength: maxLength,
            maxTags: maxTags,
            onChange: function (field, editor, tags) {
                field.trigger("change");
            },
            beforeTagSave: function (field, editor, tags, tag, val) {
                if (!t.attr("sts")) {
                    if ($.inArrayIn(val, tags) !== -1) {
                        return false;
                    }
                } else {
                    if ($.inArray(tag, currentlyValidTags[u][tags]) == -1) {
                        return false;
                    }
                }

                if (t.attr("tags-before")) {
                    var bfs = t.attr("tags-before");
                    if (typeof window[bfs] === "function") {
                        if (window[bfs](t, field, editor, tags, tag, val) === false)
                            return false;
                    }
                }
            },
        });
        currentlyValidTags.push(t);
    });

    $("[slct]:not(.select2-hidden-accessible)").each(function () {
        if (typeof $.fn.select2 !== "function") return;
        var t = $(this);
        var plchldr = t.attr("placeholder") ? t.attr("placeholder") : "";
        var dropdownParent = t.attr("prnt") ? t.attr("prnt") : "body";
        var tpl = t.attr("slct-tpl") ? t.attr("slct-tpl") : null;
        var dir = t.attr("slct-dir") ? t.attr("slct-dir") : "ltr";
        // var lang = t.attr('slct-lang') ? t.attr('slct-lang') : 'en';
        var minResultsForSearch = t.attr("mins") ? t.attr("mins") : "";
        if (dropdownParent == "self") dropdownParent = t.parent();
        else dropdownParent = $(dropdownParent);
        var allowNewTags = t.attr("ntgs") ? true : false;
        var ax = t.attr("axs")
            ? {
                url: t.attr("axs"),
                dataType: "json",
                delay: 250,
            }
            : null;
        t.select2({
            dropdownParent: dropdownParent,
            placeholder: plchldr,
            dir: dir,
            // language: lang,
            allowClear: false,
            tags: allowNewTags,
            ajax: ax,
            minimumResultsForSearch: minResultsForSearch,
            templateSelection: function (data, container) {
                /*if(data.newTag) {
                    	
                        }*/
                /*$(data.element).attr('data-custom-attribute', data.customValue);*/

                if (data.newTag) {
                    /*alert(data.text);
                              var new_state = $(data.text).text();
                              alert(new_state);*/
                    if (allowNewTags && t.attr("ntgs") != "true") {
                        var tag = data.text;
                        var id = data.id;
                        $.post(beas + "a" + t.attr("ntgs"), { tag: tag }, function (r) {
                            if (r == "true") {
                                var newOption = new Option(tag, id, true, true);
                                t.append(newOption).trigger("change");
                            } else {
                                alert("Error adding tag! Please Try again.");
                                t.val(null).trigger("change");
                            }
                        });
                        return data.text;
                    } else {
                        return data.text;
                    }
                } else {
                    return data.text;
                }
            },
            templateResult: function (state) {
                /*if (!state.id) {
                            return state.text;
                        }*/
                if (tpl) {
                    if (typeof window[tpl] === "function") return window[tpl](state);
                }
                if (state.newTag) {
                    if (allowNewTags && t.attr("ntgs") != "true") {
                        var new_state = $("<span>+ Add <b>" + state.text + "</b></span>");

                        return new_state;
                    }
                    return state.text;
                } else return state.text;

                /*return state.text;*/
            },
            tokenSeparators: [","] /*[',', ' ']*/,
            createTag: function (params) {
                var term = $.trim(params.term);

                if (term === "") {
                    return null;
                }

                return {
                    id: term,
                    text: term,
                    newTag: true,
                };
            },
            insertTag: function (data, tag) {
                /* Insert the tag at the end of the results */
                data.push(tag);
            },
        });

        if (t.attr("nosearch"))
            t.on("select2:opening select2:closing", function (event) {
                var searchfield = $(this).parent().find(".select2-search__field");
                searchfield.prop("disabled", true);
            });
    });

    $("[sl]:not(.select2-hidden-accessible)").each(function () {
        if (typeof $.fn.select2 !== "function") return;
        var t = $(this);
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
                let dbcrID = "dbcr_" + (Object.keys(_dbcrs).length + 1);

                t.select2.amd.define(
                    "adapt_" + uniquer,
                    ["select2/data/array", "select2/utils"],
                    function (ArrayAdapter, Utils) {
                        function CustomDataAdapter($element, options) {
                            CustomDataAdapter.__super__.constructor.call(
                                this,
                                $element,
                                options
                            );
                        }
                        Utils.Extend(CustomDataAdapter, ArrayAdapter);
                        CustomDataAdapter.prototype.query = function (params, callback) {
                            clearTimeout(_dbcrs[dbcrID]);
                            let _t = t;
                            _dbcrs[dbcrID] = setTimeout(
                                function () {
                                    window[query](params, callback, _t);
                                },
                                !_dbcrs.hasOwnProperty(dbcrID) ? 0 : _dbcrsTime
                            );
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
                    allowClear: false,
                    language: {
                        noResults: function () {
                            return nr;
                        },
                    },
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
                    allowClear: false,
                    language: {
                        noResults: function () {
                            return nr;
                        },
                    },
                });
            }

            if (t.attr("sl-nosrch"))
                t.on("select2:opening select2:closing", function (event) {
                    var searchfield = $(this).parent().find(".select2-search__field");
                    searchfield.prop("disabled", true);
                });
            if (t.attr("sl-class")) {
                t.on("select2:opening", function (event) {
                    dropdownParent.addClass(t.attr("sl-class"));
                });
                t.on("select2:closing", function (event) {
                    dropdownParent.removeClass(t.attr("sl-class"));
                });
            }

        } catch (e) {
            cl(e);
        }
        // t.empty().trigger('change');
    });

    $("[pinnable]:not(.pinnable)").each(function () {
        if (typeof Headroom === "undefined") return;
        var t = $(this);
        var offsetU = t.attr("pinnable-offset-up") ?? 100;
        var offsetD = t.attr("pinnable-offset-down") ?? 50;
        var options = {
            // vertical offset in px before element is first unpinned
            offset: 0,
            // or you can specify offset individually for up/down scroll
            offset: {
                up: offsetU,
                down: offsetD,
            },
            // scroll tolerance in px before state changes
            tolerance: 0,
            // or you can specify tolerance individually for up/down scroll
            tolerance: {
                up: 5,
                down: 0,
            },
            // css classes to apply
            classes: {
                // when element is initialised
                initial: "pinnable",
                // when scrolling up
                pinned: "pinnable--pinned",
                // when scrolling down
                unpinned: "pinnable--unpinned",
                // when above offset
                top: "pinnable--top",
                // when below offset
                notTop: "pinnable--not-top",
                // when at bottom of scroll area
                bottom: "pinnable--bottom",
                // when not at bottom of scroll area
                notBottom: "pinnable--not-bottom",
                // when frozen method has been called
                frozen: "pinnable--frozen",
                // multiple classes are also supported with a space-separated list
                pinned: "pinnable--pinned",
            },
            // element to listen to scroll events on, defaults to `window`
            // scroller: `window`,
            // callback when pinned, `this` is pinnable object
            onPin: function () { },
            // callback when unpinned, `this` is pinnable object
            onUnpin: function () { },
            // callback when above offset, `this` is pinnable object
            onTop: function () { },
            // callback when below offset, `this` is pinnable object
            onNotTop: function () { },
            // callback when at bottom of page, `this` is pinnable object
            onBottom: function () { },
            // callback when moving away from bottom of page, `this` is pinnable object
            onNotBottom: function () { },
        };
        var pinnable = new Headroom(t[0], options);
        pinnable.init();
    });

    $("[sort]").each(function (e) {
        if (typeof $.fn.sortable !== "function") return;
        let t = $(this);
        if (t.hasClass("ui-sortable")) return;
        let opts = {
            delay: 50,
            placeholder: "g_rows_helper",
            scrollSpeed: 40,
            opacity: 1,
        };
        opts = avc(t, "sort-axis", opts);
        opts = avc(t, "sort-handle", opts);
        opts = avc(t, "sort-cancel", opts);
        opts = avc(t, "sort-cursor", opts, "grabbing");
        opts = avc(t, "sort-helper", opts, "clone");
        if (opts.hasOwnProperty("helper") && opts["helper"] != "clone") {
            if (typeof window[opts["helper"]] === "function")
                opts["helper"] = window[opts["helper"]];
        }
        opts = avc(t, "sort-placeholder", opts);
        opts = avc(t, "sort-opacity", opts);
        opts = avc(t, "sort-items", opts);
        opts = avc(t, "sort-tolerance", opts, "pointer");
        opts = avc(t, "sort-revert", opts, false);
        opts = avc(t, "sort-forcePlaceholderSize", opts);
        opts = avc(t, "sort-containment", opts, "parent");
        opts = avc(t, "sort-connectWith", opts);
        if (opts.hasOwnProperty("forceplaceholdersize")) {
            opts["forcePlaceholderSize"] = opts["forceplaceholdersize"];
            delete opts["forceplaceholdersize"];
        }
        // cl(opts);
        t.sortable(opts);
    });

    $("[drag]").each(function (e) {
        if (typeof $.fn.draggable !== "function") return;
        let t = $(this);
        let opts = {
            // delay: 50,
            // placeholder: "g_rows_helper",
            // scrollSpeed: 40,
            // opacity: 1,
        };
        // opts = avc(t, 'axis', opts);
        // opts = avc(t, 'handle', opts);
        // opts = avc(t, 'cancel', opts);
        // opts = avc(t, 'cursor', opts, 'grabbing');
        // opts = avc(t, 'helper', opts, 'clone');
        // opts = avc(t, 'placeholder', opts);
        opts = avc(t, "drag-connectToSortable", opts);
        opts = avc(t, "drag-scroll", opts, true);
        opts = avc(t, "drag-revert", opts, true);
        opts = avc(t, "drag-helper", opts, "clone");
        opts = avc(t, "drag-containment", opts, false);
        opts = avc(t, "drag-cursor", opts, "auto");
        opts = avc(t, "drag-appendTo", opts, "parent");
        opts = avc(t, "drag-disabled", opts, false);

        if (opts.disabled == "false") delete opts.disabled;
        if (opts.hasOwnProperty("appendto")) {
            opts.appendTo = opts["appendto"];
            delete opts["appendto"];
        }

        if (opts.hasOwnProperty("helper") && opts["helper"] != "clone") {
            if (typeof window[opts["helper"]] === "function")
                opts["helper"] = window[opts["helper"]];
        }
        if (opts.hasOwnProperty("connecttosortable")) {
            opts["connectToSortable"] = opts["connecttosortable"];
            delete opts["connecttosortable"];
        }
        // opts = avc(t, 'containment', opts, 'parent');
        // opts = avc(t, 'connectWith', opts);
        t.draggable(opts);
    });


    $("[drop]").each(function (e) {
        if (typeof $.fn.droppable !== "function") return;
        let t = $(this);
        let opts = {};

        opts = avc(t, "drop-accept", opts);
        opts = avc(t, "drop-greedy", opts);
        opts = avc(t, "drop-hoverClass", opts);
        opts = avc(t, "drop-disabled", opts, false);

        if (opts.disabled == "false") delete opts.disabled;

        if (opts.hasOwnProperty("hoverclass")) {
            opts.hoverClass = opts["hoverclass"];
            delete opts["hoverclass"];
        }

        t.droppable(opts);
    });

    $("body").on("touchstart mouseover", function (e) {
        let isTippedOe = true;
        if ($(e.target).closest(".oe").length) {
            let oe = $(e.target).closest(".oe");
            if (
                (oe.find("[tip]").length || oe.hasAttr("tip")) &&
                oe.isOverflown() &&
                $(window).width() > 480
            ) {
                isTippedOe = true;
            } else isTippedOe = false;
        }
        if ($(e.target).closest("[tip]").length && isTippedOe) {
            var target = $(e.target).closest("[tip]");
            var tip = `<tip class="pa ${target.attr(
                "tip-class"
            )}"><div class="pa [[P]]"><span>[[T]]</span></div></tip>`;
            if (target.find("droplet").length == 0) {
                var t = target.attr("tip");
                var p = target.attr("tip-pos");
                if (!p) p = "";
                $("tip").remove();
                $("body").append(tip.replace("[[T]]", t).replace("[[P]]", p));
                _isTipped = true;
                let _tipSc = target;
                while (true) {
                    if (_isScrollable(_tipSc) || _tipSc[0] == $("body")[0]) break;
                    _tipSc = _tipSc.parent();
                }
                var self = target;
                _setPos(self, p, _tipSc);
                _setPos(self, p, _tipSc);
                target.data("_tipSc", _tipSc);
                _tipSc.unbind("scroll.kuku").bind("scroll.kuku", function () {
                    _setPos(self, p, _tipSc);
                });
            } else {
                $("tip").remove();
                _isTipped = false;
            }
        } else {
            $("body").unbind("scroll.kuku");
            $("tip").remove();
            _isTipped = false;
        }
    });

    $("[numeric]").each(function () {
        if (typeof $.fn.numeric !== "function") return;
        $(this).removeAttr("numeric").numeric();
    });

    $("[pattern]").each(function () {
        $(this).data("pattern", $(this).attr("pattern")).removeAttr("pattern");
    });

    $("[integer]:not([pve])").each(function () {
        if (typeof $.fn.numeric !== "function") return;
        $(this).removeAttr("integer").numeric(
            {
                decimal: false,
            } /*, function () { alert("Integers only!"); this.value = ""; this.focus(); }*/
        );
    });
    $("[integer][pve]").each(function () {
        if (typeof $.fn.numeric !== "function") return;
        $(this).removeAttr("integer").numeric(
            {
                decimal: false,
                negative: false,
            } /*, function () { alert("Positive integers only!"); this.value = ""; this.focus(); }*/
        );
    });
    $("[decimal]:not([pve])").each(function () {
        if (typeof $.fn.numeric !== "function") return;
        var places = -1;
        if ($(this).is("[dp0]")) places = 0;
        else if ($(this).is("[dp1]")) places = 1;
        else if ($(this).is("[dp2]")) places = 2;
        else if ($(this).is("[dp3]")) places = 3;
        else if ($(this).is("[dp4]")) places = 4;
        if (places >= 0)
            $(this)
                .removeAttr("decimal")
                .numeric(
                    {
                        decimalPlaces: places,
                        decimal: places == 0 ? false : ".",
                    } /*, function () { alert("Decimals Only!"); this.value = ""; this.focus(); }*/
                );
        else
            $(this)
                .removeAttr("decimal")
                .numeric(
                    {} /*, function () { alert("Decimals Only!"); this.value = ""; this.focus(); }*/
                );
    });
    $("[decimal][pve]").each(function () {
        if (typeof $.fn.numeric !== "function") return;
        var places = -1;
        if ($(this).is("[dp0]")) places = 0;
        else if ($(this).is("[dp1]")) places = 1;
        else if ($(this).is("[dp2]")) places = 2;
        else if ($(this).is("[dp3]")) places = 3;
        else if ($(this).is("[dp4]")) places = 4;
        if (places >= 0)
            $(this)
                .removeAttr("decimal")
                .numeric(
                    {
                        negative: false,
                        decimalPlaces: places,
                        decimal: places == 0 ? false : ".",
                    } /*, function () { alert("Positive Decimals Only!"); this.value = ""; this.focus(); }*/
                );
        else
            $(this).removeAttr("decimal").numeric(
                {
                    negative: false,
                } /*, function () { alert("Positive Decimals Only!"); this.value = ""; this.focus(); }*/
            );
    });

    $("[time]").each(function () {
        dtp($(this), "time");
    });
    $("[date]").each(function () {
        dtp($(this), "date");
    });
    $("[datetime]").each(function () {
        dtp($(this), "datetime");
    });

    $("[color]").each(function () {
        if (typeof $.fn.colorpicker !== "function") return;
        $(this).removeAttr("color").colorpicker({
            format: "rgba",
        });
    });

    $('lmlst:not(.binded)').each(function () {
        var el = $(this);
        el.addClass('binded');
        let _conf = el.attr(':config');
        let conf = null;
        if (_conf) {
            // V1 eval'd this globally; V2 view vars live in the reactive
            // scope, so resolve it the way @-handler expressions are.
            try {
                conf = (typeof _evalEventScopedExpr === 'function')
                    ? _evalEventScopedExpr(el[0]._ownerRe, _conf)
                    : eval(_conf);
            } catch (x) {
                conf = null;
            }
        }
        el[0].list = new __myList(el, conf || {});
    });
}

function dtp(el, t) {
    el.removeAttr(t);
    let opts = {
        format:
            t == "date" ? "yyyy-mm-dd" : t == "time" ? "hh:ii" : "yyyy-mm-dd hh:ii",
        weekStart: el.attr("date-week-start") ?? 1,
        startView: t == "time" ? 1 : 2,
        minView: el.attr("minview") ? el.attr("minview") : t == "time" ? 0 : t == "datetime" ? 0 : 2,
        maxView: el.attr("maxview") ? el.attr("maxview") : t == "time" ? 1 : 4,
        todayBtn: t == "time" ? 0 : el.attr("date-today") == "false" ? 0 : 1,
        todayHighlight: t == "time" ? 0 : el.attr("date-today") == "false" ? 0 : 1,
        language: el.attr("date-lang") ?? "en",
        minuteStep: el.attr("date-minute-step") ?? 5,
        pickerPosition: "top-right",
        autoclose: 1,
        showMeridian: false,
    };
    if (el.attr("date-start")) opts["startDate"] = el.attr("date-start");
    if (el.attr("date-end")) opts["endDate"] = el.attr("date-end");
    if (el.attr("date-value")) opts["date"] = el.attr("date-value");

    el.datetimepicker(opts);

    if (t == "time") {
        el.on("show", function (ev) {
            $(
                ".table-condensed > thead, .table-condensed > thead > tr > th, .table-condensed > thead > tr > th > i"
            ).attr(
                "style",
                "visibility: hidden; font-size:0px !Important; overflow: hidden; height: 0px;"
            );
        }).on("hide", function (ev) {
            $(
                ".table-condensed > thead, .table-condensed > thead > tr > th, .table-condensed > thead > tr > th > i"
            ).attr("style", "visibility: visible;");
        });
    }
    if (el.attr("date-link-start")) {
        el.on("change", function (e) {
            let dp1 = el.data("datetimepicker");
            let dp2 = $(el.attr("date-link-start")).data("datetimepicker");
            dp2.setStartDate(dp1.getFormattedDate());
            if (
                dp2.getFormattedDate() < dp1.getFormattedDate() ||
                dp2.getFormattedDate() == ""
            )
                $(el.attr("date-link-start")).val(dp1.getFormattedDate());
        });
    } else if (el.attr("date-link-end")) {
        el.on("change", function (e) {
            let dp1 = $(el.attr("date-link-end")).data("datetimepicker");
            let dp2 = el.data("datetimepicker");
            dp1.setEndDate(dp2.getFormattedDate());
            // if(dp2.getFormattedDate()<dp1.getFormattedDate() || dp2.getFormattedDate()=='') $(el.attr('date-link-start')).val(dp1.getFormattedDate());
        });
        opts["useCurrent"] = false;
    }
}

function avc(t, n, o, d = null) {
    if (t.attr(n.toLowerCase()))
        o[n.toLowerCase().split("sort-").join("").split("drop-").join("").split("drag-").join("")] = t.attr(
            n.toLowerCase()
        );
    else if (d != null)
        o[n.toLowerCase().split("sort-").join("").split("drop-").join("").split("drag-").join("")] = d;
    return o;
}

// 2026-09-22, real bug found and fixed: a raw `$(selector)` CALL (not a
// delegated `.on(event, selector, handler)` — that case already goes
// through real jQuery's own internal getAttribute-based Sizzle matching
// correctly, confirmed live) made ENTIRELY of comma-separated
// `[\@name]` tokens only matches anything when dom-shim.js's OWN `$`
// constructor is the active one (its own fix, earlier this session).
// Once a project selects a real jQuery via the selective-plugin
// mechanism (e.g. jquery-ui-dist, which requires jquery) — a real,
// common, newly-relevant case now that dom-shim.js's conditional
// jQuery-assignment fix lets a real jQuery actually stay active — REAL
// jQuery's own constructor takes the fast native querySelectorAll path
// for anything that LOOKS like valid CSS syntax (which `[\@name]` does,
// syntactically), and native querySelectorAll can never see an
// `@`-prefixed name at all (redirected to el.events[name] by design).
// This function is a real, $-implementation-agnostic replacement for
// exactly this one call shape — used by applyTriggers()'s real
// @scroll-*/carousel-refresh binding and the scroll-start/end synthesis
// installer right below it, both of which use this exact selector
// shape. Confirmed live: this call previously returned zero matches
// under a real jQuery, silently breaking @scroll-start/@scroll-end/
// @scroll-left/@scroll-right/@scroll-top/@scroll-bottom (and, since
// real jQuery only becomes active once a project selects ANY real
// plugin, this was a real, latent regression risk for the plain
// @scroll case too, the moment such a project selected one).
// 2026-10-03: no more full-document scan. It read every element's attributes (7 patched getAttribute calls per
// element) on every globalWatch()/reloads() — about half of all script time on a big console.roxyon.com page.
// Engine-created elements are indexed by @-name when createEl() wires their events (_lmIndexAtEl); raw HTML that
// carries real @ attributes is found with one native selector query.
var _lmAtIndex = new Map();
function _lmIndexAtEl(el, name) {
    var set = _lmAtIndex.get(name);
    if (!set) { set = new Set(); _lmAtIndex.set(name, set); }
    set.add(el);
    // Detached elements are kept (a persistent widget's DOM can be re-attached); prune only if the set grows large.
    if (set.size > 5000) set.forEach(function (e) { if (!e.isConnected) set.delete(e); });
}
function _findByAtAttrNames(names) {
    var out = [];
    var seen = new Set();
    for (var j = 0; j < names.length; j++) {
        var set = _lmAtIndex.get(names[j]);
        if (!set) continue;
        set.forEach(function (el) {
            if (seen.has(el) || !el.isConnected) return;
            if (el.events && el.events[names[j]] != null) { seen.add(el); out.push(el); }
        });
    }
    try {
        var sel = names.map(function (n) { return "[\\" + n + "]"; }).join(",");
        var raw = document.querySelectorAll(sel);
        for (var i = 0; i < raw.length; i++) if (!seen.has(raw[i])) { seen.add(raw[i]); out.push(raw[i]); }
    } catch (e) { }
    return out;
}

// 2026-09-22: real "scroll" starting/settling, synthesized as real
// "scrollstart"/"scrollend" events on the element itself — see
// applyTriggers()'s own comment at its real call site for why this is
// needed. Idempotent per real element (a plain flag, not relying on
// dom-shim's $.fn.unbind(), which is a documented no-op) — applyTriggers()
// runs on every render pass, and this must not stack up a new listener
// each time.
function _installScrollStartEndSynthesis(el) {
    if (el._lumenScrollSynthInstalled) return;
    el._lumenScrollSynthInstalled = true;
    var scrolling = false;
    var settleTimer = null;
    el.addEventListener("scroll", function () {
        if (!scrolling) {
            scrolling = true;
            el.dispatchEvent(new Event("scrollstart"));
        }
        clearTimeout(settleTimer);
        settleTimer = setTimeout(function () {
            scrolling = false;
            el.dispatchEvent(new Event("scrollend"));
        }, 150);
    }, { passive: true });
}

function applyTriggers() {
    $("[click]").each(function () {
        $(this).trigger("click").removeAttr("click");
    });
    $("[focus]").each(function () {
        $(this).trigger("focus").removeAttr("focus");
    });

    let _Ns = [];
    for (let x = 9; x >= 0; x--) {
        let _els = $("[n" + x + "]");
        _els.each(function () {
            let _el = $(this);
            // if (!_el.data('_Ns')) {
            let _d = {};
            for (let y = 9; y >= 0; y--) {
                if (_el.hasAttr("n" + y)) {
                    _d["n" + y] = _el.attr("n" + y).split(",");
                }
            }
            _el.data('_Ns', _d);
            _Ns.push(_el);
            // _el.removeClass("active");
            // }
        });
    }

    for (let i = 0; i < _Ns.length; i++) {
        const _n = _Ns[i];
        let _act = [];
        let attrs = _n.data('_Ns');

        for (const nK in attrs) {
            if (Object.hasOwnProperty.call(attrs, nK)) {
                const nV = attrs[nK];
                let index = nK.slice(1);
                if (nV.indexOf(nodes[index]) != -1) {
                    _act.push(true);
                } else {
                    _act.push(false);
                    break;
                }
            }
        }
        setTimeout(() => {
            if (_act.indexOf(false) != -1) _n.removeClass("active");
            else _n.addClass("active");
        });
    }


    // if (nodes[x]) {
    //   $("[n" + x + "]").each(function () {
    //     let attr = $(this)
    //       .attr("n" + x)
    //       .split(",");
    //     for (let index = 0; index < attr.length; index++) {
    //       if (attr[index] == nodes[x]) {
    //         $(this).addClass("active");
    //       }
    //     }
    //   });
    // }


    if (typeof viewLoaded === "function" && !_viewLoaded) {
        _viewLoaded = true;
        viewLoaded();
    }
    // 2026-09-22, real bug found and fixed: @scroll-start/@scroll-end/
    // @scroll-left/@scroll-right/@scroll-top/@scroll-bottom all bind
    // correctly (confirmed — the dom-shim $ constructor's comma-@-
    // selector fix from earlier this session covers this), but the real
    // "scrollstart"/"scrollend" DOM events they (and, transitively, the
    // four edge-detection ones, which are only evaluated when
    // ev.type=="scrollend" above) depend on are not reliable, universal
    // platform events — "scrollstart" was never standardized anywhere,
    // and "scrollend" only exists in newer browsers. Synthesized here,
    // directly on each matched scrollable element (not through the
    // gesture dispatcher below, since this is element-scoped debounce
    // state, not a global pointer-tracking concern) — real "scroll"
    // starting/settling, not an approximation.
    var _scrollAttrEls = _findByAtAttrNames(["@scroll", "@scroll-start", "@scroll-end", "@scroll-left", "@scroll-right", "@scroll-top", "@scroll-bottom"]);
    for (var _sei = 0; _sei < _scrollAttrEls.length; _sei++) {
        _installScrollStartEndSynthesis(_scrollAttrEls[_sei]);
    }
    $(_scrollAttrEls)
        .unbind("scroll touchmove scrollstart scrollend")
        .on("scroll touchmove scrollstart scrollend", function (ev) {
            let el = $(this);
            if (ev.type == "scrollend") {
                var newScrollLeft = el.scrollLeft(),
                    newScrollTop = el.scrollTop(),
                    width = el.width(),
                    scrollWidth = el.get(0).scrollWidth,
                    scrollHeight = el.get(0).scrollHeight;

                var hasScX = el.prop("scrollWidth") > el.width();
                var hasScY = el.prop("scrollHeight") > el.height();

                if (newScrollLeft == 0) {
                    processEv(ev, el, "scroll-left");
                } else if (
                    Math.round(
                        scrollWidth - newScrollLeft - width - (hasScY ? -_scW : 0)
                    ) == 0
                ) {
                    processEv(ev, el, "scroll-right");
                }
                if (newScrollTop == 0) {
                    processEv(ev, el, "scroll-top");
                } else if (
                    newScrollTop + el.innerHeight() >=
                    scrollHeight - (hasScX ? -_scW : 0)
                ) {
                    processEv(ev, el, "scroll-bottom");
                }
            }
            processEv(
                ev,
                el,
                ev.type.length == 6 ? "scroll" : ev.type.split("scroll").join("scroll-")
            );
        });
}

_viewLoaded = false;
function globalWatch() {
    if (!_initialized) return;

    // 2026-09-22, real bug found and fixed: this function used to
    // unconditionally `return;` right here, making EVERYTHING below —
    // renderPlugins() (all of: form-binding/ajaxForm/o-sub/b-sub, [crsl]
    // carousel auto-init, [up] file-upload widget setup), loadPics()
    // ([lazy] image loading), and reloads() (which calls applyTriggers(),
    // the real bind site for @scroll/@scroll-start/@scroll-end/etc. event
    // listeners) — permanently dead code, never once executed by any real
    // V2 app. Found chasing a real user report ("form data is not sent to
    // the next view" on a plain o-sub form with no real error at all) —
    // traced to el.ajaxForm() throwing silently inside this dead branch,
    // which led here. The early return also disabled real, unrelated
    // functionality (scroll-triggered events, lazy image loading, live
    // carousel refresh) with no error anywhere, since dead code throws
    // nothing.
    //
    // The `[bind]:not(.binded)` block right below (V1's legacy per-element
    // data-binding convention, `setRe()`) stays intentionally skipped —
    // `bind=` is a confirmed-inert V1 authoring leftover in V2 (real
    // migrated content still carries bind="..." attributes on real
    // elements; V1's own setRe() binding mechanism was never designed to
    // coexist with V2's reactive Proxy system, so re-enabling it here
    // would be a real, separate, unreviewed behavior change, not a return
    // to "how it always worked"). Skipping it does not skip the real,
    // still-needed calls below — bindsCount staying 0 already makes the
    // `if (bindsCount == 0) prom.resolve();` line further down resolve the
    // promise chain that leads to them.
    // 2026-09-22: unquoted attribute selector — invalid CSS, throws a
    // SyntaxError from querySelectorAll (not just jQuery-specific; real
    // browsers reject an unquoted value starting with a digit). This was
    // masked for as long as the early `return;` above existed; fixing
    // that alone would have just traded one silent no-op for a crash
    // here without this.
    $('[beajs="1"]').remove();
    $('script[type="beajs"]').each(function () {
        var html = $(this).html();
        $(this).remove();
        var myScript = document.createElement("script");
        myScript.setAttribute("beajs", "1");
        myScript.textContent = html;
        document.body.appendChild(myScript);
    });
    let bindsCount = 0;
    let prom = defer();
    prom
        .then(function (val) {
            // 2026-09-22: renderViewsTpls() deliberately NOT re-enabled
            // here — real, confirmed regression found testing this fix:
            // [view] attributes DO survive into real rendered DOM
            // (verified directly; an earlier session note claiming they
            // never do was true for a different, narrower case, not
            // universally), and this function's own V1-era "_status"
            // dedup (el.data("_status")) doesn't reliably stop it from
            // re-triggering renderView() on the same element once a
            // PARENT view has re-rendered and produced a fresh, dataset-
            // less [view] element — causing a real, observed render
            // cascade (repeated "Rendering ..." log spam) once
            // globalWatch() actually started running. V2's own subview
            // mount path (renderView()'s isSub branch, _re.js) already
            // handles every real view="..." mount correctly and is the
            // one this whole codebase actually relies on — this function
            // is legacy V1 plumbing for a mounting mechanism V2 replaced,
            // same category as the [bind] loop already skipped above.
            renderPlugins();
            loadPics();
            reloads();
            let tickFunc =
                appSettings.tick && typeof appSettings.tick === "function"
                    ? appSettings.tick
                    : typeof tick === "function"
                        ? tick
                        : null;
            if (typeof tickFunc === "function") tickFunc();
        })
        .catch((reason) => {
            renderPlugins();
            loadPics();
            reloads();
            let tickFunc =
                appSettings.tick && typeof appSettings.tick === "function"
                    ? appSettings.tick
                    : typeof tick === "function"
                        ? tick
                        : null;
            if (typeof tickFunc === "function") tickFunc();
        });
    if (bindsCount == 0) {
        prom.resolve();
    }
    reloads();
    let tickFunc =
        appSettings.tick && typeof appSettings.tick === "function"
            ? appSettings.tick
            : typeof tick === "function"
                ? tick
                : null;
    if (typeof tickFunc === "function") tickFunc();
}

function loadPics() {
    $("[lazy]").each(function () {
        if (typeof $.fn.lazy !== "function") return;
        let _el = $(this);
        _el.lazy({
            effect: "show",
            bind: "event",
            // effectTime: 200,
            threshold: 200 /*Amount of pixels below the viewport, in which all images gets loaded before the user sees them.*/,
            visibleOnly: false /*Determine if only visible elements should be load.*/,
            beforeLoad: function (element) {
                /*alert('before loading ' + element.attr('data-src'));*/
                _el.removeAttr("lazy");
            },
            afterLoad: function (element) {
                /*alert('after loading ' + element.attr('data-src'));*/
            },
            onError: function (element) {
                /*alert('error loading ' + element.attr('data-src'));*/
                cl("error loading " + _el.attr("data-src"));
            },
            onFinishedAll: function () {
                /*alert('finish all');*/
            },
        });
    });
}

function paraToObj(para) {
    if (para == "") return JSON.parse("{}");
    return JSON.parse(
        '{"' +
        decodeURI(para)
            .replace(/"/g, '\\"')
            .replace(/&/g, '","')
            .replace(/=/g, '":"') +
        '"}'
    );
}

function getBind(b, d) {
    d = d ? d.split("&") : new Array();
    if (b) {
        var binder = b.split(",");
        for (var x = 0; x < binder.length; x++) {
            var finder = binder[x].split(" as ");
            if (finder[0].indexOf(" attr ") !== -1) {
                var findz = finder[0].split(" attr ");
                d.push(finder[1] + "=" + $.trim($(findz[0]).attr(findz[1])));
            } else if (finder[0].indexOf(" find ") !== -1) {
                var findz = finder[0].split(" find ");
                var val = getVal($(findz[0]).find(findz[1]));
                d.push(finder[1] + "=" + $.trim(val));
            } else if (finder[0].indexOf(" from ") !== -1) {
                var findz = finder[0].split(" from ");
                if (findz[1].toLowerCase() == "ls") {
                    d.push(finder[1] + "=" + localStorage.getItem(findz[0]));
                } else {
                    d.push(finder[1] + "=" + findz[0]);
                }
            } else d.push(finder[1] + "=" + getVal($(finder[0])));
        }
    }
    d = d.join("&");
    return d;
}

function isPathLocal(path) {
    var local = false;
    var l = getLocation(path);
    var l2 = getLocation(appSettings.Base);
    var url = "home";
    local = l.hostname == l2.hostname;
    return local;
}

function checkFormInputs(f, inp, classesOnly) {
    var inputs = inp ? [inp] : f.find("[\\:required]:not([disabled])");
    for (var i = 0; i < inputs.length; i++) {
        let el = $(inputs[i]);
        let pat = el.data("pattern");
        let req = el.hasAttr(":required");
        let lbl = el.closest("label");
        let fs = el.closest("fieldset");
        let max = el.attr("max");
        let max_num = el.attr("max-num");
        let min_num = el.attr("min-num");
        let v = el.val();
        var or = el.attr("or");
        if (or != "") {
            var or = f.find("[name='" + or + "']");
        }
        var into;
        let allCls =
            "is-not-checked is-checked is-valid is-not-empty is-empty is-invalid error success not-4-chars not-on-pattern";
        el.removeClass(allCls);
        el.parent().removeClass(allCls);
        if (lbl.length) lbl.removeClass(allCls);
        if (fs.length) fs.removeClass(allCls);
        if (el.is(":checkbox") || el.is(":radio")) {
            var isCheck = "is-not-checked" + (req ? " is-invalid" : "");
            if (el.is(":checked")) {
                isCheck = "is-checked" + (req ? " is-valid" : "");
            } else {
                if (or.length) {
                    if (or.is(":checked")) {
                        isCheck = "is-checked" + (req ? " is-valid" : "");
                    }
                }
            }
            if (el.is(":radio")) {
                f.find("[name='" + el.attr("Name") + "']:radio")
                    .not(el[0])
                    .each(function () {
                        let _el = $(this);
                        let _req = _el.hasAttr(":required");
                        var _isCheck = "is-not-checked" + (_req ? " is-invalid" : "");
                        var _or = _el.attr("or");
                        let _lbl = _el.closest("label");
                        // let _fs = _el.closest("fieldset");
                        _el.removeClass(allCls);
                        _el.parent().removeClass(allCls);
                        if (_lbl.length) _lbl.removeClass(allCls);
                        // if (_fs.length) _fs.removeClass(allCls);
                        if (_or != "") {
                            var _or = f.find("[name='" + _or + "']");
                        }
                        if (_el.is(":checked")) {
                            _isCheck = "is-checked" + (_req ? " is-valid" : "");
                        } else {
                            if (_or.length) {
                                if (_or.is(":checked")) {
                                    _isCheck = "is-checked" + (_req ? " is-valid" : "");
                                }
                            }
                        }
                        if (_el.parent().prop("nodeName") != "FORM")
                            _el.parent().addClass(_isCheck);
                        if (_lbl.length) _lbl.addClass(_isCheck);
                        // if (_fs.length) _fs.addClass(_isCheck);
                        _el.addClass(_isCheck);
                    });
            }

            if (el.parent().prop("nodeName") != "FORM") el.parent().addClass(isCheck);
            if (lbl.length) lbl.addClass(isCheck);
            // if (fs.length) fs.addClass(isCheck);
            el.addClass(isCheck);
        } else {
            var isV = "is-empty" + (req ? " is-invalid" : "");
            if (el.is("[username]")) {
                if (v.length && v.length < 4) {
                    isV = "not-4-chars is-not-empty" + (req ? " is-invalid" : "");
                } else {
                    let vld = true;
                    var k = v.match(/[a-z]+(?!\.)(?!.*\.$)(?!.*?\_\_)[a-z0-9_]+[a-z0-9]/);
                    if (!k) {
                        vld = false;
                    } else {
                        if (k.input != k[0]) {
                            vld = false;
                        }
                    }
                    if (vld) isV = "is-not-empty" + (req ? " is-valid" : "");
                    else isV = "not-on-pattern is-not-empty" + (req ? " is-invalid" : "");
                }
            } else if (el.is("[password]")) {
                if (!passwordValid(v)) {
                    isV = "is-not-empty" + (req ? " is-invalid" : "");
                } else {
                    isV = "is-not-empty" + (req ? " is-valid" : "");
                }
            } else if (el.is("[rpassword]")) {
                if ($.trim(v) != $.trim(f.find("[password]").val())) {
                    isV = "is-not-empty" + (req ? " is-invalid" : "");
                } else {
                    isV = "is-not-empty" + (req ? " is-valid" : "");
                }
            } else {
                if ($.trim(v).length != 0) {
                    // 2026-09-22: same real bug as the `pat` fix below,
                    // applied here too — `max`/`min_num`/`max_num` come
                    // from `el.attr(...)`, which returns `null` for any
                    // missing attribute (the overwhelming majority of
                    // real inputs have none of these). The old checks
                    // (`x != "" && !isNaN(x)`) were both TRUE for
                    // `null` — `null != ""` is true, and `isNaN(null)`
                    // is FALSE since `Number(null) === 0`, not NaN — so
                    // every one of these validation branches ran
                    // unconditionally on every plain input too, on top
                    // of the pattern bug. A real truthy check is what
                    // was actually intended: only validate when the
                    // attribute genuinely exists.
                    if (max && !isNaN(max)) {
                        if ($.trim(v).length > max) {
                            el.val($.trim($.trim(v).substr(0, max)));
                        }
                    }
                    if (min_num && !isNaN(min_num)) {
                        if (!isNaN($.trim(v))) {
                            if (parseFloat($.trim(v)) < parseFloat(min_num))
                                el.val($.trim(min_num));
                        } else {
                            el.val(min_num);
                        }
                    }

                    if (max_num && !isNaN(max_num)) {
                        if (!isNaN($.trim(v))) {
                            if (parseFloat($.trim(v)) > parseFloat(max_num))
                                el.val($.trim(max_num));
                        } else {
                            if (min_num && !isNaN(min_num)) el.val($.trim(min_num));
                            else el.val("0");
                        }
                    }
                    isV = "is-not-empty";
                    // 2026-09-22: real, severe bug found and fixed —
                    // `pat` is `el.data("pattern")`, which is `undefined`
                    // for any input with no `data-pattern` attribute at
                    // all (the overwhelming majority of real inputs).
                    // `pat != ""` is TRUE for `undefined` (loose
                    // inequality never made `undefined` equal `""`), so
                    // this branch ran unconditionally for every plain
                    // input on every keystroke. `new RegExp(undefined)`
                    // then builds a regex that literally matches the
                    // word "undefined" — never a real typed value — so
                    // validation always "failed" and `el.val("")` wiped
                    // the field on every single keyup/change event.
                    // Found on a real guide page: typing into any plain
                    // text input cleared it immediately after every
                    // character, making every form on the site
                    // unusable. Fixed with a real truthy check — only
                    // run pattern validation when a pattern genuinely
                    // exists.
                    if (pat) {
                        pat = new RegExp(pat);
                        if (pat.test($.trim(v))) {
                            isV += req ? " is-valid" : "";
                        } else {
                            isV += req ? " is-invalid" : "";
                            el.val("");
                        }
                    } else isV += req ? " is-valid" : "";
                } else {
                    if (or.length) {
                        if ($.trim(or.val()).length != 0) {
                            isV = "is-not-empty" + (req ? " is-valid" : "");
                        }
                    }
                }
            }
            if (el.parent().prop("nodeName") != "FORM") el.parent().addClass(isV);
            if (lbl.length) lbl.addClass(isV);
            // if (fs.length) fs.addClass(isV);
            el.addClass(isV);
        }

        var isRadioChecked = false;
        if (el.is(":radio")) {
            if (el.hasClass("is-invalid")) {
                f.find("[name='" + el.attr("Name") + "']:radio")
                    .not(el[0])
                    .each(function () {
                        if ($(this).hasClass("is-valid")) {
                            isRadioChecked = true;
                        }
                    });
            } else {
                isRadioChecked = true;
            }
        }

        if (el.hasClass("is-invalid") || (el.is(":radio") && !isRadioChecked)) {
            if (el.hasAttr("data-into")) {
                let intoTxt = el.data("into");
                if (lbl.length) into = lbl.find(intoTxt);
                if (!into) if (fs.length) into = fs.find(intoTxt);
                if (!into) into = $(intoTxt);
                if (into.length) {
                    if (el.is("[password]")) {
                        if ($.trim(v).length == 0) into.text(el.attr("data-empty"));
                        else if (el.hasAttr("data-wpm")) into.text(el.attr("data-wpm"));
                        let rpass = f.find("[rpassword]");
                        if (rpass.length)
                            if ($.trim(rpass.val()).length != 0)
                                checkFormInputs(f, rpass, true);
                    } else if (el.is("[rpassword]")) {
                        if ($.trim(v).length == 0) into.text(el.attr("data-empty"));
                        else if (el.hasAttr("data-pnm")) into.text(el.attr("data-pnm"));
                    } else if (el.is("[username]")) {
                        let txt = el.hasAttr("data-empty")
                            ? el.attr("data-empty")
                            : el.attr("placeholder");
                        if ($.trim(v).length == 0) into.text(txt);
                        else {
                            if (el.hasClass("not-4-chars")) {
                                if (el.hasAttr("data-4-chars")) txt = el.attr("data-4-chars");
                            } else if (el.hasClass("not-on-pattern")) {
                                if (el.hasAttr("data-chars-not-allowed"))
                                    txt = el.attr("data-chars-not-allowed");
                            }
                            into.text(txt);
                        }
                    } else if (el.hasAttr("data-empty")) {
                        into.text(el.attr("data-empty"));
                    } else {
                        if (el.is(":checkbox") || el.is(":radio")) {
                            // alert("checkbox or radio don't have data-empty attribute");
                            into.text(el.attr("placeholder"));
                        } else {
                            into.text(el.attr("placeholder"));
                        }
                    }
                }
            }
            if (!classesOnly) {
                if (el.is(":radio")) {
                    if (!isRadioChecked) {
                        if (fs.length) fs.addClass(isCheck);
                        el.focus();
                        return false;
                    }
                } else {
                    if (fs.length) fs.addClass(isV);
                    el.focus();
                    return false;
                }
            } else {
                if (el.is(":radio")) {
                    if (!isRadioChecked) {
                        if (fs.length) fs.addClass(isCheck);
                    }
                } else {
                    if (fs.length) fs.addClass(isV);
                }
            }
        } else if (el.hasClass("is-valid")) {
            if (el.hasAttr("data-into")) {
                let intoTxt = el.data("into");
                if (lbl.length) into = lbl.find(intoTxt);
                if (fs.length) into = fs.find(intoTxt);
                if (!into) into = $(intoTxt);
                if (into.length) {
                    into.text("");
                }
            }
        }
    }

    return true;
}
function validateInputs(f) {
    if (f.hasAttr("ax-before")) {
        var bfs = f.attr("ax-before");
        if (typeof window[bfs] === "function") {
            if (window[bfs](f) === false) return false;
        }
    }

    var inps = [];
    f.find("input.required,select.required,textarea.required").each(function () {
        inps.push($(this).attr("name"));
    });
    for (var i = 0; i < inps.length; i++) {
        var inp = f.find("input[name='" + inps[i] + "']");
        var sel = f.find('select[name="' + inps[i] + '"]');
        var txt = f.find('textarea[name="' + inps[i] + '"]');
        var e = inp;
        if (!e.length) e = sel;
        if (!e.length) e = txt;
        var or = e.attr("or");

        if (or != "") {
            var inp2 = f.find("input[name='" + or + "']");
            var sel2 = f.find('select[name="' + or + '"]');
            var txt2 = f.find('textarea[name="' + or + '"]');
            var or = inp2;
            if (!or.length) or = sel2;
            if (!or.length) or = txt2;
        }

        if (e.is(":checkbox") || e.is(":radio")) {
            if (!e.is(":checked")) {
                if (or.length) {
                    if (!or.is(":checked")) {
                        alert(e.attr("placeholder") + " or " + or.attr("placeholder"));
                        e.addClass("error");
                        e.focus();
                        return false;
                    }
                } else {
                    alert(e.attr("placeholder"));
                    e.addClass("error");
                    e.focus();
                    return false;
                }
            }
        } else {
            if ($.trim(e.val()).length == 0) {
                if (or.length) {
                    if ($.trim(or.val()).length == 0) {
                        alert(e.attr("placeholder") + " or " + or.attr("placeholder"));
                        e.addClass("error");
                        e.focus();
                        return false;
                    }
                } else {
                    alert(e.attr("placeholder"));
                    e.addClass("error");
                    e.focus();
                    return false;
                }
            }

            if (e.is("[password]")) {
                if (!passwordValid(e.val())) {
                    alert(e.attr("data-wpm"));
                    e.addClass("error");
                    e.focus();
                    return false;
                }
            }
            if (e.is("[rpassword]")) {
                if (
                    $.trim(e.val()) != $.trim(e.closest("form").find("[password]").val())
                ) {
                    e.addClass("error");
                    alert(e.attr("data-pnm"));
                    e.focus();
                    return false;
                }
                e.removeClass("error");
                $(".passStrength").remove();
            }
        }
    }

    return true;
}


let _cookies = {
    getItem: function (sKey) {
        if (!sKey) { return null; }
        return decodeURIComponent(document.cookie.replace(new RegExp("(?:(?:^|.*;)\\s*" + encodeURIComponent(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=\\s*([^;]*).*$)|^.*$"), "$1")) || null;
    },
    setItem: function (sKey, sValue, vEnd, sPath, sDomain, bSecure) {
        if (!sKey || /^(?:expires|max\-age|path|domain|secure)$/i.test(sKey)) { return false; }
        var sExpires = "";
        if (vEnd) {
            switch (vEnd.constructor) {
                case Number:
                    sExpires = vEnd === Infinity ? "; expires=Fri, 31 Dec 9999 23:59:59 GMT" : "; max-age=" + vEnd;
                    break;
                case String:
                    sExpires = "; expires=" + vEnd;
                    break;
                case Date:
                    sExpires = "; expires=" + vEnd.toUTCString();
                    break;
            }
        }
        if (!sPath) sPath = "/";
        document.cookie = encodeURIComponent(sKey) + "=" + encodeURIComponent(sValue) + sExpires + (sDomain ? "; domain=" + sDomain : "") + (sPath ? "; path=" + sPath : "") + (bSecure ? "; secure" : "");
        return true;
    },
    // 2026-09-22, real bug found and fixed: removeItem("key") (the
    // documented, real usage shape — see lumenjs-spec.md's own example,
    // no explicit sPath) silently never deleted anything. setItem()
    // always defaults a missing sPath to "/" before writing the cookie,
    // but removeItem() left a missing sPath out of the expiring cookie
    // string entirely — the browser then scopes that expiring write to
    // the CURRENT page's own path (real cookie-scoping rules: cookies
    // with a different `path` are entirely separate cookies), which
    // never matches the real cookie's actual `path=/` unless the caller
    // happens to be on the site's root page. The expiring write silently
    // creates and immediately discards an unrelated cookie while the
    // real one survives untouched — confirmed directly: document.cookie
    // still contained the real cookie after a real removeItem() call.
    // Defaulting sPath the same way setItem() does closes this for the
    // real, common no-path call shape.
    removeItem: function (sKey, sPath, sDomain) {
        if (!this.hasItem(sKey)) { return false; }
        if (!sPath) sPath = "/";
        document.cookie = encodeURIComponent(sKey) + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT" + (sDomain ? "; domain=" + sDomain : "") + "; path=" + sPath;
        return true;
    },
    hasItem: function (sKey) {
        if (!sKey) { return false; }
        return (new RegExp("(?:^|;\\s*)" + encodeURIComponent(sKey).replace(/[\-\.\+\*]/g, "\\$&") + "\\s*\\=")).test(document.cookie);
    },
    keys: function () {
        var aKeys = document.cookie.replace(/((?:^|\s*;)[^\=]+)(?=;|$)|^\s*|\s*(?:\=[^;]*)?(?:\1|$)/g, "").split(/\s*(?:\=[^;]*)?;\s*/);
        for (var nLen = aKeys.length, nIdx = 0; nIdx < nLen; nIdx++) { aKeys[nIdx] = decodeURIComponent(aKeys[nIdx]); }
        return aKeys;
    }
};
var cookies = new Proxy(_cookies, {
    get(target, key) {
        return target[key] ?? target.getItem(key) ?? undefined;
    },
    set(target, key, value) {
        if (key in target) {
            return false;
        }
        return target.setItem(key, value);
    },
    deleteProperty(target, key) {
        if (!(key in target)) {
            return false;
        }
        return target.removeItem(key);
    },
    ownKeys(target) {
        return target.keys();
    },
    has(target, key) {
        return key in target || target.hasItem(key);
    },
    defineProperty(target, key, descriptor) {
        if (descriptor && "value" in descriptor) {
            target.setItem(key, descriptor.value);
        }
        return target;
    },
    getOwnPropertyDescriptor(target, key) {
        const value = target.getItem(key);
        return value
            ? {
                value,
                enumerable: true,
                configurable: true,
            }
            : undefined;
    },
});

function getCookie(n) {
    return cookies[n];
}

function setCookie(n, v, d, p, e) {
    var now = new Date();
    var time = now.getTime();
    if (!e) e = time + 24 * 60 * 60 * 1000 * 365;
    else e = time + e;
    if (!d) d = window.location.hostname;
    if (!p) p = "/";
    now.setTime(e);
    return cookies.setItem(n, v, now.toGMTString(), p, d, true);
}

function getComData(c, fromHTML) {
    if (fromHTML) {
        try {
            var el = $("<div></div>");
            el.html(c.html());
            var k = {};

            var mtitle = $("modal-title", el).html();
            if (!mtitle) mtitle = "";

            var mbody = $("modal-body", el).html();
            if (!mbody) mbody = "";

            var mdesc = $("modal-description", el).html();
            if (!mdesc) mdesc = "";

            var mfoot = $("modal-footer", el).html();
            if (!mfoot) mfoot = "";

            k.Title = mtitle;
            k.Body = mbody;
            k.Description = mdesc;
            k.Footer = mfoot;
            c = k;
            return c;
        } catch (e) {
            return false;
        }

        return false;
    }
    try {
        c = c
            .contents()
            .filter(function () {
                return this.nodeType === 8;
            })
            .get(0);

        if (c.nodeValue == "") return false;
        try {
            c = JSON.parse(c.nodeValue);
        } catch (e) {
            try {
                c = JSON.parse(atob(c.nodeValue));
            } catch (e) {
                try {
                    var el = $("<div></div>");
                    el.html(c.nodeValue);
                    var k = {};

                    var mtitle = $("modal-title", el).html();
                    if (!mtitle) mtitle = "";

                    var mbody = $("modal-body", el).html();
                    if (!mbody) mbody = "";

                    var mdesc = $("modal-description", el).html();
                    if (!mdesc) mdesc = "";

                    var mfoot = $("modal-footer", el).html();
                    if (!mfoot) mfoot = "";

                    k.Title = mtitle;
                    k.Body = mbody;
                    k.Description = mdesc;
                    k.Footer = mfoot;
                    c = k;
                } catch (e) {
                    return false;
                }
            }
        }
        return c;
    } catch (e) {
        return false;
    }
}

function addOrChangeParameters(url, params) {
    let splitParams = {};
    let splitPath = /(.*)[?](.*)/.exec(url);
    if (splitPath && splitPath[2])
        splitPath[2].split("&").forEach((k) => {
            let d = k.split("=");
            splitParams[d[0]] = d[1];
        });
    let newParams = Object.assign(splitParams, params);
    let finalParams = Object.keys(newParams)
        .map((a) => a + "=" + newParams[a])
        .join("&");
    return splitPath ? splitPath[1] + "?" + finalParams : url + "?" + finalParams;
}

//class SDK//
class BEA {
    Cart = null;
    Products = null;
    Authorize = null;
    Pay = null;
    localCache = true;
    _prom = null;
    proms = [];
    l = "En";
    fields = {
        Section: "Section,Title,Text",
        Product: "Name,Price,Quantity",
    };
    constructor(options) {
        if (options === undefined) options = {};
        if (!Object.keys(options).length == 0) {
            if (options.hasOwnProperty("fields")) {
                for (var i in options["fields"]) {
                    this.fields[i] = options["fields"][i];
                }
            }
            if (options.hasOwnProperty("localisation")) this.l = options.localisation;
            if (options.hasOwnProperty("locale") && options.locale === true) {
                this.getLocale();
            }
            if (options.hasOwnProperty("sections") && options.sections === true) {
                this.getSections();
            }
            if (
                options.hasOwnProperty("localCache") &&
                options.localCache === false
            ) {
                this.localCache = false;
            }
        }
        this.Cart = new Cart(this);
        this.Products = new Products(this);
        this.Authorize = new Authorize(this);
        this.Pay = new Pay(this);
        this._prom = Promise.all(this.proms);
    }

    request(className, data, async, type, a) {
        var prom = defer();
        var x;
        API.req(className, data, null, type, a ?? 0).then((r) => {
            if (async) {
                prom.resolve(r);
            } else {
                x = r.results;
            }
        });
        if (async) return prom;
        return x;
    }

    getSections() {
        var sec = new Section(this);
        this.proms.push(sec._prom);
        return sec.get();
    }

    getLocale() {
        var loc = new Locale(this);
        this.proms.push(loc._prom);
        return loc.get();
    }

    order() {
        let prom = defer();
        var ids = "";
        var productsInfo;
        var user;
        var orderData = {
            User: "",
            productItems: [],
            Amount: 0,
        };

        user = this.Authorize.me();
        orderData.User = user.objectId;

        $.each(this.Cart.cartData, function (key, value) {
            ids = ids + value.P + ",";
        });

        this.Products.get(
            {
                fields: "Name,Price,Quantity",
                media: "images",
                crops: "ax200,ax600,ax700,200x200,ax300",
            },
            { ids: ids },
            true
        ).then((res) => {
            let productsInfo = res.results;
            var productsDB = Object.assign(
                {},
                ...productsInfo.map((x) => ({ [x.objectId]: x }))
            );

            $.each(this.Cart.cartData, function (key, value) {
                orderData.productItems.push({
                    Qty: value.Q,
                    Product: value.P,
                    productData: JSON.stringify(productsDB[value.P]),
                    Price: productsDB[value.P].Price,
                });
                orderData.Amount += value.Q * productsDB[value.P].Price;
            });

            this.request(
                "/Order",
                { User: orderData.User, Amount: orderData.Amount },
                true,
                "POST"
            ).then((res) => {
                let orderId = res.results;
                for (var i = 0; i < orderData.productItems.length; i++) {
                    orderData.productItems[i]["Order"] = orderId[0].objectId;
                    this.request("/orderItems	", orderData.productItems[i], true, "POST");
                }
                prom.resolve(orderId);
            });
        });
        return prom;
    }

    sendEmail(data) {
        let prom = defer();
        this.request("/_Emails/send", data, true, "POST").then((res) => {
            prom.resolve(r);
        });
    }

    batch(data) {
        return this.request("/batch", data, true, "POST");
    }

    query(className, data) {
        return this.request(className, data, true, "GET");
    }

    get(className, data, options = true) {
        return this.request(className, data, options, "GET");
    }

    post(className, data, options = true) {
        return this.request(className, data, options, "POST");
    }

    put(className, data, options = true) {
        return this.request(className, data, options, "PUT");
    }

    delete(className, options = true) {
        return this.request(className, "", options, "DELETE");
    }
}
//end SDK//

//class pay//
class Pay {
    tsdk = null;
    object = {};
    constructor(tsdk) {
        this.tsdk = tsdk;
        let self = this;
        $(window)
            .unbind("message")
            .on("message", function (e) {
                let dd = $("#gosell-gateway")[0].contentWindow;
                if (e.originalEvent.source === dd && e.originalEvent.data == "close") {
                    $(".gosell-gateway").remove();
                    self.onClose();
                }
            });
    }

    create(data) {
        let prom = defer();
        API.post("https://pay.bea.com.lb/create", data, {}, 666)
            .then((d) => {
                this.object = d;
                cl(d);
                this.process(
                    this.object.transaction.url.replace("mode=page", "mode=popup")
                );
                prom.resolve(this.object.id);
            })
            .catch((err) => {
                cl(err);
            });
        return prom;
    }

    process(link) {
        var d = `
        <div class="gosell-gateway" reactive>
            <div style="position: fixed;left: 0;right: 0;top: 0;bottom: 0;z-index: 9999;background-color: rgb(0,0,0,0.2);">
                <iframe id="gosell-gateway"
                src="${link}" width="100%"
                height="100%"
                style="display: block; position: absolute; inset: 0px; margin: auto; border: 0px; z-index: 2147483647;"></iframe>
            </div>
        </div>
        `;
        $("body").append(d);
    }

    retrieve(id) {
        let prom = defer();
        this.tsdk
            .request("https://pay.bea.com.lb/?tap_id=" + id, {}, true, "GET")
            .then((d) => {
                prom.resolve(d);
            })
            .catch((err) => {
                cl(err);
            });

        return prom;
    }

    onClose() { }
}
//end pay//

//class section//
class Section {
    tsdk = null;
    _prom = defer();
    constructor(tsdk) {
        this.tsdk = tsdk;
    }

    get() {
        var d = {
            fields: this.tsdk.fields.Section,
            limit: -1,
            locale: this.tsdk.l,
            media: "images",
            crops: "ax200,ax600,ax700,200x200,ax300",
        };
        this.tsdk.request("/Sections", d, true, "GET").then((r) => {
            cl("HEiii", r);
            if (r.results) {
                // 2026-09-21 fix: this used to mutate globals["sections"]
                // directly — a nested mutation, invisible to the reactive
                // Proxy (only a write to the tracked slot itself,
                // _vt.Global.vars.globals, triggers anything — see that
                // fix's own comment in setGlobals() below). Routing
                // through the real, documented setGlobals() instead of a
                // direct mutation fixes reactivity AND correctly persists
                // to localStorage, matching what globals' own design
                // already intends — a plain direct mutation never did
                // either. Merges onto the current globals rather than
                // replacing it outright, since setGlobals() overwrites
                // the whole object.
                setGlobals(Object.assign({}, globals, {
                    sections: Object.assign(
                        {},
                        ...r.results.map((x) => ({ [x?.Section]: x }))
                    )
                }));
            } else cl("Sections", r);
            this._prom.resolve(r);
        });
        return globals["sections"];
    }
}
//end section//

//class locale//
class Locale {
    tsdk = null;
    _prom = defer();
    constructor(tsdk) {
        this.tsdk = tsdk;
    }

    get() {
        var d = { fields: "Key," + this.tsdk.l, limit: -1 };
        this.tsdk.request("/_Locale", d, true, "GET").then((r) => {
            if (r.results) {
                // 2026-09-21 fix — see the identical comment in
                // Section.get() just above; same nested-mutation gap,
                // same setGlobals()-routed fix.
                setGlobals(Object.assign({}, globals, {
                    locale: Object.assign(
                        {},
                        ...r.results.map((x) => ({ [x?.Key]: x }))
                    )
                }));
            } else cl("_Locale", r);
            this._prom.resolve(r);
        });
        return globals["locale"];
    }
}
//end locale//

//class products//
class Products {
    tsdk = null;
    constructor(tsdk) {
        this.tsdk = tsdk;
    }
    get(data, options, async = true) {
        var d = data;
        if (options.hasOwnProperty("limit")) {
            d["limit"] = options.limit;
        }

        if (options.hasOwnProperty("key")) {
            if (!d.hasOwnProperty("where")) d["where"] = {};
            d.where["Name"] = { startswith: options.key };
        }

        if (options.hasOwnProperty("ids")) {
            if (!d.hasOwnProperty("where")) d["where"] = {};
            d.where["objectId"] = {
                in: [...new Set(options.ids.split(","))],
            };
        }

        if (options.hasOwnProperty("page")) {
            d["limit"] = options.limits ?? "15";
            d["offset"] = (options.page - 1) * d["limit"];
        }
        return this.tsdk.request("/Products", d, async, "GET");
    }
}
//end products//

//class cart//
class Cart {
    tsdk = null;
    cartData = {};
    constructor(tsdk) {
        this.tsdk = tsdk;
        try {
            if (getCookie("_cd") != undefined) {
                try {
                    this.cartData = JSON.parse(getCookie("_cd"));
                } catch (e) {

                }
            }
        } catch (e) {
            this.cartData = JSON.parse("{}");
        }
    }
    add(id, v, q) {
        var key = btoa(id + "::" + v);
        if (this.cartData.hasOwnProperty(key)) {
            this.cartData[key].Q += q;
        } else {
            this.cartData[key] = {
                P: id,
                Q: q,
                V: v,
            };
        }
        setCookie("_cd", JSON.stringify(this.cartData));
    }
    set(id, v, q) {
        var key = btoa(id + "::" + v);
        if (this.cartData.hasOwnProperty(key)) {
            this.cartData[key].Q = q;
        } else {
            this.cartData[key] = {
                P: id,
                Q: q,
                V: v,
            };
        }
        setCookie("_cd", JSON.stringify(this.cartData));
    }
    remove(id) {
        delete this.cartData[id];
        setCookie("_cd", JSON.stringify(this.cartData));
    }
    empty() {
        this.cartData = {};
        setCookie("_cd", JSON.stringify(this.cartData));
    }
    getCart() {
        return this.cartData;
    }

    getProductCart(d) {
        var ids = "";
        $.each(this.cartData, function (key, value) {
            ids = ids + value.P + ",";
        });
        var req = this.tsdk.Products.get(d, { ids: ids });
        return req;
    }
}
//end cart//

//class auth//
class Authorize {
    tsdk = null;
    constructor(tsdk) {
        this.tsdk = tsdk;
    }

    login(data, options = true) {
        var prom = defer();
        this.tsdk.request("/Users", data, options, "GET").then((res) => {
            let req = res.results;

            // if (!options) {
            globals["UserInfo"] = req[0];
            let x = window.btoa(JSON.stringify(globals.UserInfo));
            setCookie("U_USER", x);
            // } else {
            //     req.then((r) => {
            //         globals['UserInfo'] = r.results[0];
            //         let x = window.btoa(JSON.stringify(globals.UserInfo))
            //         setCookie("U_USER", x)
            //     })
            //         .catch((err) => {
            //             cl(err)
            //         })
            // }
            prom.resolve(res);
        });
        return prom;
    }

    register(data, options = true) {
        var prom = defer();
        this.tsdk.request("/Users", data, options, "POST").then((res) => {
            let req = res.results;
            // if (!options) {
            data["objectId"] = req[0].objectId;
            globals["UserInfo"] = data;
            let x = window.btoa(JSON.stringify(globals.UserInfo));
            setCookie("U_USER", x);
            // } else {
            //     req.then((r) => {
            //         data['objectId'] = r.results[0].objectId
            //         globals['UserInfo'] = data;
            //         let x = window.btoa(JSON.stringify(globals.UserInfo))
            //         setCookie("U_USER", x)
            //     })
            //         .catch((err) => {
            //             cl(err)
            //         })
            // }
            prom.resolve(res);
        });
        return prom;
    }

    me() {
        var cookie = undefined;
        try {
            var cookie = JSON.parse(window.atob(getCookie("U_USER")));
        } catch (e) {

        }
        return cookie;
    }

    isLoggedIn() {
        var result = false;
        if (getCookie("U_USER") != undefined) result = true;
        return result;
    }
}
//end auth//

function generate() {
    let length = 10;
    const characters = "abcdefghijklmnopqrstuvwxyz1234567890";
    let result = "";
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function getScrollBarWidth() {
    var $outer = $("<div>")
        .css({ visibility: "hidden", width: 100, overflow: "scroll" })
        .appendTo("body"),
        widthWithScroll = $("<div>")
            .css({ width: "100%" })
            .appendTo($outer)
            .outerWidth();
    $outer.remove();
    return (100 - widthWithScroll) * 2;
}
_scW = getScrollBarWidth();

function daysBetween(date_1, date_2) {
    let difference = date_1.getTime() - date_2.getTime();
    let TotalDays = Math.ceil(difference / (1000 * 3600 * 24));
    return TotalDays < 0 ? TotalDays * -1 : TotalDays;
}

function notify(ti, tx, i, ty, al, rtl) {
    var notify =
        `<div class="notify {{Type}} nw sh20 h ` +
        (rtl ? "rtl" : "") +
        `">
    <div class="ov10 ra dash round3x bgb20 p2"></div>
    <div class="ov ra icon"><span class="cc mdi fs24 mdi-{{Icon}}"></span></div>
    <div class="ov la pointer" close-notify><span class="cc mdi fs18 mdi-close"></span></div>
    {{Title}}
    {{Text}}
</div>`;
    if (!al) al = "topCenter";
    if (!ty) ty = "";
    if (!$("[notify]").length)
        $("body").append("<div notify class='" + al + "'></div>");
    else $("[notify]").attr("class", "").addClass(al);
    $("[notify]").prepend(
        notify
            .split("{{Title}}")
            .join(ti != "" ? "<h5>" + ti + "</h5>" : "")
            .split("{{Icon}}")
            .join(i)
            .split("{{Text}}")
            .join(tx)
            .split("{{Type}}")
            .join(ty)
            .split("{{Type}}")
            .join(ti)
            .split("{{Type}}")
            .join(ti)
    );
    $(".notify").fadeIn();
    setTimeout(function () {
        $("[close-notify]:last").click();
    }, 5000);
}

function _isScrollable(el) {
    let o1 =
        el.css("overflow-y") == "scroll" ||
        (el.css("overflow-y") == "auto" && el[0].scrollHeight > el.height() + 15);
    let o2 =
        el.css("overflow-x") == "scroll" ||
        (el.css("overflow-x") == "auto" && el[0].scrollWidth > el.width() + 15);
    return o1 || o2;
}

function _setPos(self, p, el) {
    var left = self.offset().left;
    var top = self.offset().top;
    if (p == "" || p == "bottom") {
        left += self.innerWidth() / 2;
        top += self.innerHeight();
    } else if (p == "left") {
        top += self.innerHeight() / 2;
    } else if (p == "top") {
        left += self.innerWidth() / 2;
    } else {
        left += self.innerWidth();
        top += self.innerHeight() / 2;
    }
    $("tip").css({ left: left, top: top, right: "unset", bottom: "unset" });
    if (
        top + 15 < el.offset().top ||
        top > el.offset().top + el.height() + 10 ||
        left + 15 < el.offset().left ||
        left > el.offset().left + el.width() + 10
    )
        $("tip").hide();
    else $("tip").show();
}

String.prototype.rtrim = function (s) {
    if (s == undefined) s = "\\s";
    try {
        return this.replace(new RegExp("[" + s + "]+$"), "");
    } catch {
        return this.replace(new RegExp("[" + "\\" + s + "]+$"), "");
    }
};

String.prototype.ltrim = function (s) {
    if (s == undefined) s = "\\s";
    try {
        return this.replace(new RegExp("^[" + s + "]+"), "");
    } catch {
        return this.replace(new RegExp("^[" + "\\" + s + "]+"), "");
    }
};

// 2026-09-21: three real V1 global utilities (beajs/core.js), confirmed
// missing here while migrating a real V1 project (Arr2Obj is actively used
// in that project's own index.js) — a full audit against every one of
// core.js's other 61 top-level functions (plus re.js/listeners.js) found
// no other gaps; everything else was already ported or is V1 engine-
// internal code V2's own rewritten engine already supersedes.
function paramsToObj(url) {
    try {
        var entries = new URL(url).searchParams.entries();
        const result = {}
        for (const [key, value] of entries) {
            result[key] = value;
        }
        return result;
    } catch (x) {
        return {};
    }
}

function Arr2Obj(arr, key) {
    // Real improvement over the V1 original, which threw on anything but
    // a real array (arr.map on undefined/null/a single object) — every
    // other small utility in this immediate area (paramsToObj/ObjFromArr
    // above/below) already fails safe to {} the same way; this one just
    // hadn't caught up. Observable behavior for any already-correct V1
    // call site is unchanged.
    if (!Array.isArray(arr)) return {};
    return Object.assign(
        {},
        ...arr.map((x) => ({ [x[key]]: x }))
    );
}

function ObjFromArr(a, v, k = 'objectId') {
    let obj;
    try {
        obj = a.find((x) => x[k] == v);
    } catch (e) {
        obj = {};
    }
    return obj;
}

// V1's <lmlst :config="..." @query="..."> data table/grid component
// (core.js:5302-5717), ported verbatim. Initialized by renderPlugins().
class __myList {
  el = null;
  data = [];
  config = {
    viewType: 'dataTable',
    show: 10,
    page: 1,
    order: {
      column: null,
      order: "asc",
    },
    columns: {},
    total: 0,
    pagination: {
      middle: "",
    },
    itemRender: function (k, obj) {
      let val = "";
      if (obj.hasOwnProperty(k)) val = obj[k];
      return val;
    },
    gridRender: function (obj) {
      return obj;
    },
    gridPlaceholder: function () {
      return "---";
    },
    itemPlaceholder: function (k) {
      return "---";
    },
    rowClassRender: function (obj) {
      return "";
    },
    gridClassRender: function (obj) {
      return "";
    },
    emptyRender: function (obj) {
      return `<div class="ov bgb5 op60"><span class="fs26 cc cb pb120">No Data!</span></div>`;
    }
  };
  state = 'loading';

  constructor(el, config) {
    this.el = el;
    if (config && typeof config === "object") this.config = { ...this.config, ...config };
    this.el.trigger("query-list", [this, this.config, "initiated"]);
    this.render();
  }

  render() {
    let self = this;
    var html = ``;
    if (this.el) {
      html = ``;

      if (this.config.viewType.toLowerCase() == 'datagrid') {
        this.el.removeClass('dataTable').addClass('dataGrid');
        html +=
          `
        <lmlst-body>
        `;

        // cl(this.state);
        if (this.state == 'empty') {
          html += self.config.emptyRender();
        } else if (this.state == 'loading') {
          for (let i = 0; i < this.config.show; i++) {
            html += self.config.gridPlaceholder();
          }
        } else {
          for (let i = 0; i < (this.data.length <= this.config.show ? this.data.length : this.config.show); i++) {
            const data = this.data[i];
            html += self.config.gridRender(data);
          }
        }
        html +=
          `
        </lmlst-body>
        `;

        if (this.state != 'empty') {
          html += `
  <lmlst-footer class="lh36 r ez-f">
      <ul style="list-style-type: none;">
          `;

          const pagings = this.pagination(this.config.page);






          if (pagings.hasStart) {
            if (self.config.page > 1) html += `<li page="1"><span class='iconify cc fs14' data-icon='fa-solid:angle-double-left'></span></li>`;
            else html += `<li><span class='iconify cc fs14' data-icon='fa-solid:angle-double-left'></span></li>`;
          }
          if (pagings.hasPrev) {
            if (self.config.page > 1) html += `<li page="` + (pagings.current - 1 > 0 ? pagings.current - 1 : 1) + `"><span class='iconify cc fs14' data-icon='fa-solid:angle-left'></span></li>`;
            else html += `<li><span class='iconify cc fs14' data-icon='fa-solid:angle-left'></span></li>`;
          }



          // if (pagings.hasStart && self.config.page > 2) html += `<li page="1"><span class='iconify cc fs14' data-icon='fa-solid:angle-double-left'></span></li>`;
          // if (pagings.hasPrev && self.config.page > 2) html += `<li page="` + (pagings.current - 1 > 0 ? pagings.current - 1 : 1) + `"><span class='iconify cc fs14' data-icon='fa-solid:angle-left'></span></li>`;

          if (pagings.totalpages > 1) pagings.first.forEach(function (page) {
            html += `<li class='pointer ` + (self.config.page == page ? 'active' : '') + `' page="` + page + `">` + page + `</li>`
          });

          html += (pagings.totalpages > 5 ? `<li>` + pagings.middle + `</li>` : '');

          if (pagings.totalpages > 1) pagings.last.forEach(function (page) {
            html += `<li class='pointer ` + (self.config.page == page ? 'active' : '') + `' page="` + page + `">` + page + `</li>`
          });



          if (pagings.hasNext) {
            if (self.config.page != pagings.totalpages) html += `<li page="` + (pagings.current * 1 + 1 < pagings.totalpages ? pagings.current * 1 + 1 : pagings.totalpages) + `"><span class='iconify cc fs14' data-icon='fa-solid:angle-right'></span></li>`;
            else html += `<li><span class='iconify cc fs14' data-icon='fa-solid:angle-right'></span></li>`;
          }
          if (pagings.hasEnd) {
            if (self.config.page != pagings.totalpages)
              html += `<li page="` + pagings.totalpages + `"><span class='iconify cc fs14' data-icon='fa-solid:angle-double-right'></span></li>`;
            else html += `<li><span class='iconify cc fs14' data-icon='fa-solid:angle-double-right'></span></li>`;
          }
          // if (pagings.hasNext && self.config.page < pagings.totalpages - 2) html += `<li page="` + (pagings.current * 1 + 1 < pagings.totalpages ? pagings.current * 1 + 1 : pagings.totalpages) + `"><span class='iconify cc fs14' data-icon='fa-solid:angle-right'></span></li>`;
          // if (pagings.hasEnd && self.config.page < pagings.totalpages - 2) html += `<li page="` + pagings.totalpages + `"><span class='iconify cc fs14' data-icon='fa-solid:angle-double-right'></span></li>`;


          html += `</ul>`;
          html +=
            `
  </lmlst-footer>
              `
            ;
        }
      } else {
        this.el.removeClass('dataGrid').addClass('dataTable');
        html +=
          `
        <lmlst-header class="ps ez-f" wrapper>
          <div scsc="list" dgsc class="grab">
            <ul class="b p0">
                <li>
                  <div class="tsh ez-f">
                      <div></div>
  `;
        for (const k in this.config.columns) {
          const col = this.config.columns[k];
          if (!isObject(col)) continue;
          if (col?.hide) continue;

          html +=
            `
                  <div class="`+ (col.mini ? 'mini' : '') + `"><span class=vm>` + col.title + ` </span>` + (col?.sort ? `<span ` + 'order="' + (this.config.order.order == 'asc' ? 'desc' : 'asc') + '" column="' + k + '"' + ` class="iconify vm" ` + (k == this.config.order.column ?
              (this.config.order.order == 'asc'
                ? ` data-icon="fluent:arrow-up-24-regular" `
                : ' data-icon="fluent:arrow-down-24-regular" ')
              : ` data-icon="fluent:arrow-sort-24-regular" `) + `></span>` : ``) + `</div>
  `;
        }
        html +=
          `
                      <div></div>
                    </div>
                  </li>
              </ul>
            </div>
          </lmlst-header>
          <lmlst-body scsc="list" dgsc class="`+ (this.state != 'empty' ? 'grab' : '') + `">
  `;

        // cl(this.state);
        if (this.state == 'empty') {
          html += self.config.emptyRender();
        } else if (this.state == 'loading') {

          for (let i = 0; i < this.config.show; i++) {
            html +=
              `
          <ul class="shimmer">
              <li>
                <div class="bgw80 round sh tsh ez-f ` + self.config.rowClassRender({}) + `">
                    <div></div>
  `;

            for (const k in this.config.columns) {
              if (!isObject(this.config.columns[k])) continue;
              if (this.config.columns[k]?.hide) continue;
              html += `<div class="` + (this.config.columns[k].mini ? 'mini' : '') + `">` + self.config.itemPlaceholder(k) + `</div>`;
            }

            html +=
              `
                    <div>
                    <div></div>

                </div>
              </li>
          </ul>
  `;
          }
        } else {

          for (let i = 0; i < (this.data.length <= this.config.show ? this.data.length : this.config.show); i++) {
            const data = this.data[i];

            html +=
              `
          <ul class="p0">
              <li>
                <div class="bgw80 round sh tsh ez-f ` + self.config.rowClassRender(data) + `">
                  <div></div>
  `;

            for (const k in this.config.columns) {
              const col = this.config.columns[k];
              if (!isObject(col)) continue;
              if (col?.hide) continue;

              html +=
                `
                  <div class="`+ (col.mini ? 'mini' : '') + `">` + self.config.itemRender(k, data) + `</div>
  `;
            }

            html +=
              `
                    <div></div>
                  </div>
              </li>
          </ul>
  `;
          }
        }
        html +=
          `
              </div>
      </div>
  </lmlst-body>
  `;
        if (this.state != 'empty') {
          html += `
  <lmlst-footer class="ov pf bgw ta sh50 lh36 r z100 ez-f">
      <ul style="list-style-type: none;">
          `;

          const pagings = this.pagination(this.config.page);

          if (pagings.hasStart) {
            if (self.config.page > 2) html += `<li page="1"><svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="0.88em" height="1em" viewBox="0 0 448 512" class="vm"><path fill="currentColor" d="m224.3 273l-136 136c-9.4 9.4-24.6 9.4-33.9 0l-22.6-22.6c-9.4-9.4-9.4-24.6 0-33.9l96.4-96.4l-96.4-96.4c-9.4-9.4-9.4-24.6 0-33.9L54.3 103c9.4-9.4 24.6-9.4 33.9 0l136 136c9.5 9.4 9.5 24.6.1 34m192-34l-136-136c-9.4-9.4-24.6-9.4-33.9 0l-22.6 22.6c-9.4 9.4-9.4 24.6 0 33.9l96.4 96.4l-96.4 96.4c-9.4 9.4-9.4 24.6 0 33.9l22.6 22.6c9.4 9.4 24.6 9.4 33.9 0l136-136c9.4-9.2 9.4-24.4 0-33.8"></path></svg></li>`;
            else html += `<li><svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="0.88em" height="1em" viewBox="0 0 448 512" class="op40 vm"><path fill="currentColor" d="m224.3 273l-136 136c-9.4 9.4-24.6 9.4-33.9 0l-22.6-22.6c-9.4-9.4-9.4-24.6 0-33.9l96.4-96.4l-96.4-96.4c-9.4-9.4-9.4-24.6 0-33.9L54.3 103c9.4-9.4 24.6-9.4 33.9 0l136 136c9.5 9.4 9.5 24.6.1 34m192-34l-136-136c-9.4-9.4-24.6-9.4-33.9 0l-22.6 22.6c-9.4 9.4-9.4 24.6 0 33.9l96.4 96.4l-96.4 96.4c-9.4 9.4-9.4 24.6 0 33.9l22.6 22.6c9.4 9.4 24.6 9.4 33.9 0l136-136c9.4-9.2 9.4-24.4 0-33.8"></path></svg></li>`;
          }
          if (pagings.hasPrev) {
            if (self.config.page > 1) html += `<li page="` + (pagings.current - 1 > 0 ? pagings.current - 1 : 1) + `"><svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="0.5em" height="1em" viewBox="0 0 256 512" class="vm"><path fill="currentColor" d="m224.3 273l-136 136c-9.4 9.4-24.6 9.4-33.9 0l-22.6-22.6c-9.4-9.4-9.4-24.6 0-33.9l96.4-96.4l-96.4-96.4c-9.4-9.4-9.4-24.6 0-33.9L54.3 103c9.4-9.4 24.6-9.4 33.9 0l136 136c9.5 9.4 9.5 24.6.1 34"></path></svg></li>`;
            else html += `<li><svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="0.5em" height="1em" viewBox="0 0 256 512" class="op40 vm"><path fill="currentColor" d="m224.3 273l-136 136c-9.4 9.4-24.6 9.4-33.9 0l-22.6-22.6c-9.4-9.4-9.4-24.6 0-33.9l96.4-96.4l-96.4-96.4c-9.4-9.4-9.4-24.6 0-33.9L54.3 103c9.4-9.4 24.6-9.4 33.9 0l136 136c9.5 9.4 9.5 24.6.1 34"></path></svg></li>`;
          }

          if (pagings.totalpages > 1) pagings.first.forEach(function (page) {
            html += `<li class='pointer ` + (self.config.page == page ? 'active' : '') + `' page="` + page + `">` + page + `</li>`
          });

          if (pagings.totalpages > 5) html += `<li>` + pagings.middle + `</li>`;

          if (pagings.totalpages > 1) pagings.last.forEach(function (page) {
            html += `<li class='pointer ` + (self.config.page == page ? 'active' : '') + `' page="` + page + `">` + page + `</li>`
          });


          if (pagings.hasNext) {
            if (self.config.page != pagings.totalpages) html += `<li page="` + (pagings.current * 1 + 1 < pagings.totalpages ? pagings.current * 1 + 1 : pagings.totalpages) + `"><svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="0.5em" height="1em" viewBox="0 0 256 512" class="vm"><path fill="currentColor" d="m31.7 239l136-136c9.4-9.4 24.6-9.4 33.9 0l22.6 22.6c9.4 9.4 9.4 24.6 0 33.9L127.9 256l96.4 96.4c9.4 9.4 9.4 24.6 0 33.9L201.7 409c-9.4 9.4-24.6 9.4-33.9 0l-136-136c-9.5-9.4-9.5-24.6-.1-34"></path></svg></li>`;
            else html += `<li><svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="0.5em" height="1em" viewBox="0 0 256 512" class="op40 vm"><path fill="currentColor" d="m31.7 239l136-136c9.4-9.4 24.6-9.4 33.9 0l22.6 22.6c9.4 9.4 9.4 24.6 0 33.9L127.9 256l96.4 96.4c9.4 9.4 9.4 24.6 0 33.9L201.7 409c-9.4 9.4-24.6 9.4-33.9 0l-136-136c-9.5-9.4-9.5-24.6-.1-34"></path></svg></li>`;
          }
          if (pagings.hasEnd) {
            if (self.config.page != pagings.totalpages)
              html += `<li page="` + pagings.totalpages + `"><svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="0.88em" height="1em" viewBox="0 0 448 512" class="vm"><path fill="currentColor" d="m223.7 239l136-136c9.4-9.4 24.6-9.4 33.9 0l22.6 22.6c9.4 9.4 9.4 24.6 0 33.9L319.9 256l96.4 96.4c9.4 9.4 9.4 24.6 0 33.9L393.7 409c-9.4 9.4-24.6 9.4-33.9 0l-136-136c-9.5-9.4-9.5-24.6-.1-34m-192 34l136 136c9.4 9.4 24.6 9.4 33.9 0l22.6-22.6c9.4-9.4 9.4-24.6 0-33.9L127.9 256l96.4-96.4c9.4-9.4 9.4-24.6 0-33.9L201.7 103c-9.4-9.4-24.6-9.4-33.9 0l-136 136c-9.5 9.4-9.5 24.6-.1 34"></path></svg></li>`;
            else html += `<li><svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="0.88em" height="1em" viewBox="0 0 448 512" class="op40 vm"><path fill="currentColor" d="m223.7 239l136-136c9.4-9.4 24.6-9.4 33.9 0l22.6 22.6c9.4 9.4 9.4 24.6 0 33.9L319.9 256l96.4 96.4c9.4 9.4 9.4 24.6 0 33.9L393.7 409c-9.4 9.4-24.6 9.4-33.9 0l-136-136c-9.5-9.4-9.5-24.6-.1-34m-192 34l136 136c9.4 9.4 24.6 9.4 33.9 0l22.6-22.6c9.4-9.4 9.4-24.6 0-33.9L127.9 256l96.4-96.4c9.4-9.4 9.4-24.6 0-33.9L201.7 103c-9.4-9.4-24.6-9.4-33.9 0l-136 136c-9.5 9.4-9.5 24.6-.1 34"></path></svg></li>`;
          }


          html += `</ul>`;
          html +=
            `
  </lmlst-footer>
              `
            ;
        }
      }

      this.el.html(html);
      globalWatch();
    }
  }

  refresh() {
    this.el.trigger("query-list", [this, this.config, "refresh"]);
  }

  setPage(p) {
    this.config.page = p;
  }
  setOrder(o) {
    this.config.order = o;
  }
  setLoading() {
    this.state = 'loading';
    this.render();
  }
  setData(data) {
    this.data = data;
    if (data.length) this.state = 'loaded';
    else this.state = 'empty';
    this.render();
  }

  pagination(currPage) {
    var show = this.config.show;
    var total = this.config.total;
    var totalpages = Math.ceil((total) / show);

    if (currPage > totalpages) currPage = totalpages;
    if (currPage <= 0) currPage = 1;
    if (currPage > totalpages) currPage = totalpages;
    var previousPage = currPage - 1;
    var nextPage = currPage * 1 + 1;
    let weight = currPage <= totalpages / 2 ? "left" : "right";

    var result = {
      hasStart: false,
      hasEnd: false,
      first: [],
      totalpages: totalpages,
      middle: this.config.pagination.middle,
      last: [],
      weight: weight,
      current: currPage,
    };

    if (totalpages > 5) {
      result.hasEnd = true;
      result.hasStart = true;
      result.hasPrev = true;
      result.hasNext = true;
      if (currPage < totalpages * 1 - 2) {
        if (currPage > 1) {
          result.first = [previousPage, currPage, nextPage];
          result.last = [totalpages * 1 - 1, totalpages];
        } else {
          result.first = [currPage, nextPage, nextPage * 1 + 1];
          result.last = [totalpages * 1 - 1, totalpages];
        }
      } else {
        if (currPage >= totalpages) {
          result.first = [1, 2];
          result.last = [previousPage * 1 - 1, previousPage, currPage];
        }
        else if (currPage == totalpages * 1 - 2) {
          result.first = [1, 2];
          result.last = [previousPage, currPage, nextPage, totalpages];
        } else {
          result.first = [1, 2];
          result.last = [previousPage, currPage, nextPage];
        }
      }
    } else if (totalpages > 0 && totalpages <= 5) {
      for (var i = 0; i < totalpages; i++) {
        if (
          weight == "left" &&
          result.first.length < Math.trunc(totalpages / 2) + 1
        ) {
          result.first.push(i * 1 + 1);
        } else if (
          weight == "right" &&
          result.first.length < Math.trunc(totalpages / 2)
        ) {
          result.first.push(i * 1 + 1);
        } else {
          result.last.push(i * 1 + 1);
        }
      }
    }
    return result;

  }

}

$("body").on("query-list", "lmlst", function (ev, list, config, type) {
  processEv(ev, $(this), "query", list, config, type);
});

$("body").on("click touch", "[page]", function (ev) {
  let el = $(this);
  let host = el.closest("lmlst")[0];
  if (!host || !host.list) return;
  let list = host.list;
  list.setPage(el.attr("page"));
  list.setLoading();
  list.el.trigger("query-list", [list, list.config, "page-changed"]);
});

$("body").on("click touch", "[order]", function (ev) {
  let el = $(this);
  let host = el.closest("lmlst")[0];
  if (!host || !host.list) return;
  let list = host.list;
  list.setPage(1);
  list.setOrder({
    column: el.attr("column") ?? null,
    order:
      list.config.order.column != el.attr("column")
        ? "asc"
        : el.attr("order") ?? "asc",
  });
  list.setLoading();
  list.el.trigger("query-list", [list, list.config, "order-changed"]);
});

// 2026-09-22: the real gesture-dispatch mechanism — tap/doubletap/
// singletap/taphold/clickhold/tap2/tap2hold/tapstart/tapend/tapmove/
// swipe(+4 directions)/swipeend. Every one of lstnrs.js's own real
// bindings for these (`$("body").on("doubletap", "[\@dbltap]", ...)`
// etc — confirmed correctly wired, single-name delegated selectors,
// already fixed earlier this session) was listening for event TYPES
// that nothing anywhere in this runtime ever actually dispatched — V1
// almost certainly relied on a bundled external gesture library (real
// tap/doubletap/singletap/taphold/swipe were jQuery-Mobile-era virtual
// events, never real browser-native ones) for this. This is a from-
// scratch, native implementation using real Pointer Events (covers
// mouse, touch, and pen uniformly, unlike separately handling mouse vs
// touch) — global, document-level listeners installed exactly ONCE at
// load, dispatching real, bubbling CustomEvents on the real target
// element so the EXISTING, already-correct delegated bindings in
// lstnrs.js pick them up with zero changes needed there.
(function () {
    var TAP_MAX_MS = 400;           // max down->up time to still count as a tap
    var TAP_MOVE_PX = 12;           // max movement to still count as a tap (not a drag/swipe)
    var DOUBLE_TAP_WINDOW_MS = 350; // max gap between two taps to count as a double-tap
    var HOLD_MS = 500;              // held this long without moving/releasing = a hold
    // V1's real defaults, read straight from ttsh.js's own options object
    // (swipe_h_threshold / swipe_v_threshold): 50px PER AXIS, not one
    // combined minimum. V2 previously used a single 30px for both.
    var SWIPE_H_THRESHOLD = 50;
    var SWIPE_V_THRESHOLD = 50;
    var SWIPE_MAX_MS = 1000;        // swipes slower than this don't count (a drag, not a swipe)

    // 2026-09-26: V1 lets a page override the swipe distance per element via
    // data-xthreshold / data-ythreshold, and gives the PARENT's value
    // precedence over the element's own -- ttsh.js does
    // `s.parent().data("xthreshold") ? s.parent()... : s.data(...)`, which is
    // how a swipeable list sets one threshold for all its rows. A value that
    // parseInt()s to 0/NaN falls back to the default, matching V1's own
    // `parseInt(c) ? parseInt(c) : default` test.
    function swipeThreshold(target, attr, dflt) {
        try {
            var el = $(target);
            var raw = el.parent().data(attr);
            if (!raw) raw = el.data(attr);
            var n = parseInt(raw, 10);
            return n ? n : dflt;
        } catch (e) {
            return dflt;
        }
    }

    var active = {};        // pointerId -> tracking state, for tap/hold/swipe
    var activeCount = 0;    // real simultaneous-pointer count, for tap2/tap2hold
    var pendingSingleTap = null; // {target, timer}, awaiting the double-tap window

    function fire(target, type) {
        target.dispatchEvent(new CustomEvent(type, { bubbles: true, cancelable: true }));
    }

    function onPointerDown(e) {
        activeCount++;
        var state = {
            startX: e.clientX, startY: e.clientY,
            startTime: Date.now(),
            target: e.target,
            moved: false,
            holdFired: false,
            wasMultiTouch: activeCount >= 2,
        };
        active[e.pointerId] = state;
        state.holdTimer = setTimeout(function () {
            if (state.moved) return;
            state.holdFired = true;
            if (state.wasMultiTouch) {
                fire(state.target, "tap2hold");
            } else {
                fire(state.target, "taphold");
                fire(state.target, "clickhold"); // real V1 alias — lstnrs.js binds both to the same event name
            }
        }, HOLD_MS);
        fire(e.target, "tapstart");
    }

    function onPointerMove(e) {
        var state = active[e.pointerId];
        if (!state) return;
        var dx = e.clientX - state.startX, dy = e.clientY - state.startY;
        if (!state.moved && Math.sqrt(dx * dx + dy * dy) > TAP_MOVE_PX) state.moved = true;
        fire(e.target, "tapmove");
    }

    function endPointer(e) {
        var state = active[e.pointerId];
        if (!state) return;
        clearTimeout(state.holdTimer);
        // A genuine two-finger gesture has both pointers down TOGETHER at
        // some point — checking only at press time misses the first
        // finger of a real, realistic two-finger tap (it's alone the
        // instant IT goes down, since the second finger hasn't landed
        // yet). Re-checked here, at release, before the count drops —
        // whichever finger releases while the other is still active is
        // just as much a real part of the same two-finger gesture.
        state.wasMultiTouch = state.wasMultiTouch || activeCount >= 2;
        delete active[e.pointerId];
        activeCount = Math.max(0, activeCount - 1);
        return state;
    }

    function onPointerUp(e) {
        var state = endPointer(e);
        if (!state) return;
        fire(e.target, "tapend");

        var dt = Date.now() - state.startTime;
        var dx = e.clientX - state.startX, dy = e.clientY - state.startY;

        if (!state.moved && !state.holdFired && dt < TAP_MAX_MS) {
            if (state.wasMultiTouch) {
                fire(state.target, "tap2");
            } else {
                fire(state.target, "tap");
                if (pendingSingleTap && pendingSingleTap.target === state.target) {
                    clearTimeout(pendingSingleTap.timer);
                    pendingSingleTap = null;
                    fire(state.target, "doubletap");
                } else {
                    // A tap on a different element settles the previous one now (it was a single tap). Leaving its
                    // timer running let it clear THIS pending tap later, losing this element's double-tap.
                    if (pendingSingleTap) {
                        clearTimeout(pendingSingleTap.timer);
                        fire(pendingSingleTap.target, "singletap");
                    }
                    var pending = {
                        target: state.target,
                        timer: setTimeout(function () {
                            fire(pending.target, "singletap");
                            if (pendingSingleTap === pending) pendingSingleTap = null;
                        }, DOUBLE_TAP_WINDOW_MS),
                    };
                    pendingSingleTap = pending;
                }
            }
            return;
        }

        if (state.moved && !state.holdFired && dt < SWIPE_MAX_MS) {
            var hT = swipeThreshold(state.target, "xthreshold", SWIPE_H_THRESHOLD);
            var vT = swipeThreshold(state.target, "ythreshold", SWIPE_V_THRESHOLD);
            // V1's own order and precedence (ttsh.js): up, right, down, left,
            // each overwriting the last, so on a diagonal the later test wins.
            // Deliberately kept rather than V2's old dominant-axis choice, so a
            // real V1 page gets the direction it has always gotten.
            var dir;
            if (dy < 0 && -dy > vT) dir = "swipeup";
            if (dx > 0 && dx > hT) dir = "swiperight";
            if (dy > 0 && dy > vT) dir = "swipedown";
            if (dx < 0 && -dx > hT) dir = "swipeleft";
            if (dir) {
                fire(state.target, "swipe");
                fire(state.target, dir);
                fire(state.target, "swipeend");
            }
        }
    }

    function onPointerCancel(e) {
        endPointer(e);
    }

    if (typeof document !== "undefined" && document.addEventListener) {
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("pointermove", onPointerMove, true);
        document.addEventListener("pointerup", onPointerUp, true);
        document.addEventListener("pointercancel", onPointerCancel, true);
    }

    // @orientationchange (lstnrs.js binds it delegated on "body", but
    // the real event only ever fires on `window` — can never reach a
    // body-delegated listener without this re-dispatch).
    if (typeof window !== "undefined" && window.addEventListener) {
        window.addEventListener("orientationchange", function () {
            if (typeof document !== "undefined" && document.body) {
                fire(document.body, "orientationchange");
            }
        });
    }
})();


