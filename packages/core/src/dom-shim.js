// dom-shim.js — a minimal jQuery-compatible layer.
//
// Scope, deliberately narrow: covers exactly the surface LumenJS's own core
// (_re.js, walk.js, ws.js, lstnrs.js) uses internally, plus the documented
// app-facing API (el.css/.data/.val/.attr, el[0], .trigger) from
// lumenjs-spec.md §6.3/§10. Scoped by grepping actual usage across the core
// files, not guessed.
//
// This is NOT a jQuery replacement for everything — optional plugins
// (Select2, Flickity, the colorpicker, etc.) stay on real jQuery when a page
// opts into them, since they're third-party code written against jQuery's
// actual $.fn plugin architecture. This shim only has to satisfy the core
// runtime, which is what makes it small.
(function (global) {
    function toArray(x) {
        if (x == null) return [];
        if (typeof NodeList !== 'undefined' && x instanceof NodeList) return Array.prototype.slice.call(x);
        if (typeof HTMLCollection !== 'undefined' && x instanceof HTMLCollection) return Array.prototype.slice.call(x);
        if (Array.isArray(x)) return x;
        if (x instanceof $) return Array.prototype.slice.call(x);
        return [x];
    }

    // jQuery-only selector extensions real V1 code uses (native
    // querySelectorAll throws on these): the positional :first/:last/
    // :eq(n)/:gt(n)/:lt(n)/:even/:odd filter the set matched so far; the
    // type/state ones map onto real CSS.
    var JQ_POSITIONAL = /:(first|last|even|odd|eq\((-?\d+)\)|gt\((-?\d+)\)|lt\((-?\d+)\))(?![-\w])/;
    var JQ_REWRITES = [
        [/:checkbox(?![-\w])/g, '[type="checkbox"]'], [/:radio(?![-\w])/g, '[type="radio"]'],
        [/:selected(?![-\w])/g, ':checked'], [/:password(?![-\w])/g, '[type="password"]'],
        [/:text(?![-\w])/g, '[type="text"]'], [/:submit(?![-\w])/g, '[type="submit"]'],
        [/:file(?![-\w])/g, '[type="file"]'], [/:button(?![-\w])/g, 'button'],
    ];
    function _splitTopLevel(sel, ch) {
        var out = [], depth = 0, quote = null, cur = '';
        for (var i = 0; i < sel.length; i++) {
            var c = sel[i];
            if (quote) { if (c === quote) quote = null; cur += c; continue; }
            if (c === '"' || c === "'") { quote = c; cur += c; continue; }
            if (c === '(' || c === '[') depth++;
            else if (c === ')' || c === ']') depth--;
            if (c === ch && depth === 0) { out.push(cur); cur = ''; continue; }
            cur += c;
        }
        out.push(cur);
        return out;
    }
    function _applyPositional(els, m) {
        var n = els.length;
        if (m[1] === 'first') return els.slice(0, 1);
        if (m[1] === 'last') return n ? els.slice(n - 1) : [];
        if (m[1] === 'even') return els.filter(function (_, i) { return i % 2 === 0; });
        if (m[1] === 'odd') return els.filter(function (_, i) { return i % 2 === 1; });
        if (m[2] !== undefined) { var i = +m[2]; if (i < 0) i += n; return els[i] ? [els[i]] : []; }
        if (m[3] !== undefined) { var g = +m[3]; if (g < 0) g += n; return els.slice(g + 1); }
        var l = +m[4]; if (l < 0) l += n; return els.slice(0, Math.max(0, l));
    }
    function _jqSelect(root, selector) {
        var sel = selector;
        for (var r = 0; r < JQ_REWRITES.length; r++) sel = sel.replace(JQ_REWRITES[r][0], JQ_REWRITES[r][1]);
        if (!JQ_POSITIONAL.test(sel)) return toArray(root.querySelectorAll(sel));
        var out = [];
        _splitTopLevel(sel, ',').forEach(function (part) {
            var rest = part.trim(), current = null;
            while (rest.length) {
                var m = JQ_POSITIONAL.exec(rest);
                var css = m ? rest.slice(0, m.index) : rest;
                if (css.trim()) {
                    if (current === null) current = toArray(root.querySelectorAll(css));
                    else {
                        var next = [];
                        var scoped = /^\s*[>+~]/.test(css) ? ':scope' + css : ':scope ' + css.replace(/^\s+/, '');
                        current.forEach(function (el) {
                            toArray(el.querySelectorAll(scoped)).forEach(function (x) { if (next.indexOf(x) === -1) next.push(x); });
                        });
                        current = next;
                    }
                } else if (current === null) current = toArray(root.querySelectorAll('*'));
                if (!m) break;
                current = _applyPositional(current, m);
                rest = rest.slice(m.index + m[0].length);
            }
            (current || []).forEach(function (x) { if (out.indexOf(x) === -1) out.push(x); });
        });
        return out;
    }

    function $(selector, context) {
        if (!(this instanceof $)) return new $(selector, context);
        if (typeof selector === 'function') return $(document).ready(selector);

        var els = [];
        var sel = undefined;
        if (!selector) {
            els = [];
        } else if (typeof selector === 'string') {
            var trimmed = selector.trim();
            if (trimmed[0] === '<') {
                var tpl = document.createElement('template');
                tpl.innerHTML = trimmed;
                els = toArray(tpl.content.childNodes).filter(function (n) { return n.nodeType === 1; });
            } else {
                sel = selector;
                var root = context ? (context instanceof $ ? context[0] : context) : document;
                // 2026-09-22, real bug found and fixed: a selector made
                // ENTIRELY of comma-separated [\@name]-shaped tokens (real
                // usage: applyTriggers()'s
                // "[\@scroll],[\@scroll-start],[\@scroll-end],...") can
                // never match anything through native querySelectorAll —
                // same root cause as $.fn.on's own AT_ATTR_SELECTOR case
                // (an `@`-prefixed write is redirected to el.events[name],
                // never landing in the real attribute store an engine-
                // level selector can see) — but this is the CONSTRUCTOR
                // finding the initial element set, a different call shape
                // from .on()'s delegated-selector case, so that existing
                // fix doesn't cover it. Found as the real reason
                // @scroll/@scroll-start/@scroll-end/... listeners were
                // never actually attached to anything, even after
                // globalWatch() itself started running for the first time
                // this session. Falls back to a real DOM-wide scan +
                // patch-aware getAttribute() check only when every
                // comma-separated part matches this exact shape — every
                // other selector (the overwhelming majority of real calls)
                // stays on the fast native path.
                var atParts = selector.split(',').map(function (s) { return s.trim(); });
                var isAllAtAttrs = atParts.length > 0 && atParts.every(function (p) { return /^\[\\@[\w-]+\]$/.test(p); });
                if (isAllAtAttrs) {
                    var names = atParts.map(function (p) { return '@' + /^\[\\@([\w-]+)\]$/.exec(p)[1]; });
                    var all = root ? toArray(root.querySelectorAll('*')) : [];
                    els = all.filter(function (el) {
                        return names.some(function (n) { return el.getAttribute(n) != null; });
                    });
                } else {
                    els = root ? _jqSelect(root, selector) : [];
                }
            }
        } else {
            els = toArray(selector);
        }

        for (var i = 0; i < els.length; i++) this[i] = els[i];
        this.length = els.length;
        this.selector = sel;
        return this;
    }

    $.fn = $.prototype;
    $.fn.jquery = 'lumenjs-shim';

    $.fn.extend = function (methods) {
        for (var k in methods) if (Object.prototype.hasOwnProperty.call(methods, k)) $.fn[k] = methods[k];
        return $;
    };
    $.extend = function (target) {
        for (var i = 1; i < arguments.length; i++) {
            var src = arguments[i];
            for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
        }
        return target;
    };

    // jQuery's own Event wrapper — used internally by the vendored WebWorker
    // helper (`new $.Event(type)`, then it assigns custom properties onto
    // the result). A plain native Event supports arbitrary property
    // assignment already, so this just needs to exist as a constructor.
    $.Event = function (type, props) {
        var e = typeof type === 'string' ? new Event(type, { bubbles: true, cancelable: true }) : type;
        if (props) for (var k in props) e[k] = props[k];
        return e;
    };

    $.proxy = function (fn, context) { return fn.bind(context); };
    $.trim = function (s) { return (s == null ? '' : String(s)).trim(); };
    $.inArray = function (val, arr) { return Array.prototype.indexOf.call(arr, val); };
    // 2026-09-22, real bug found and fixed: this only special-cased a real
    // Array/$ set for the numeric-index loop — anything else (including a
    // real NamedNodeMap, e.g. `$.each(el[0].attributes, ...)`, the real
    // vendor code's own modal-open click handler) fell through to a plain
    // `for...in`. A NamedNodeMap's `.length` property IS enumerable via
    // `for...in` in real Chrome (confirmed directly, not assumed) — so the
    // fallback loop ran the callback one extra time with `this` bound to
    // the raw NUMBER `.length` value (`k = "length"`, `arr[k] = 4`), which
    // has no `.value`/`.name`, breaking any callback that reads either
    // (the real modal click handler reads `this.value.toLowerCase()`,
    // throwing `Cannot read properties of undefined`). Real jQuery's own
    // $.each treats anything array-like (a numeric `.length`, with
    // `length-1` a valid index or length===0) via the numeric loop —
    // matching that here closes this for every array-like caller, not
    // just NamedNodeMap specifically.
    function isArrayLike(obj) {
        if (Array.isArray(obj) || obj instanceof $) return true;
        var length = obj && typeof obj === 'object' && obj.length;
        return typeof length === 'number' && (length === 0 || (length - 1) in obj);
    }
    $.each = function (arr, fn) {
        if (isArrayLike(arr)) {
            for (var i = 0; i < arr.length; i++) if (fn.call(arr[i], i, arr[i]) === false) break;
        } else {
            for (var k in arr) if (fn.call(arr[k], k, arr[k]) === false) break;
        }
        return arr;
    };
    // 2026-09-22, real bug found and fixed: getFormData() (vendor/
    // reconnecting-websocket.js, the one real caller) calls $.map() on a
    // real form's serialized field array — genuinely missing, not just
    // untested, so EVERY form submission going through this path (the
    // "local"/non-o-sub ajaxForm branch used by every plain <form
    // action=...> and every b-sub form) threw inside a try/catch that
    // silently swallowed it (cl(e)), leaving the form looking like it
    // just did nothing. Real jQuery semantics: like $.each but collects
    // the callback's return values into a new flat array, dropping
    // null/undefined results (jQuery's actual documented behavior, not
    // just "no-op skip") and flattening any array a callback returns.
    $.map = function (arr, fn) {
        var out = [];
        var src = Array.isArray(arr) || arr instanceof $ ? arr : Object.keys(arr || {}).map(function (k) { return arr[k]; });
        for (var i = 0; i < src.length; i++) {
            var r = fn(src[i], i);
            if (r === null || r === undefined) continue;
            if (Array.isArray(r)) out.push.apply(out, r);
            else out.push(r);
        }
        return out;
    };
    // Minimal fetch-based $.ajax — covers ws.js's one call site (a plain
    // GET/POST with success/error callbacks), not jQuery's full option set.
    // Fires the global ajaxStart/ajaxStop events real jQuery provides for a
    // loading-indicator pattern (`$(document).ajaxStart(...)`) — used at
    // _re.js's top level.
    var _ajaxActive = 0;
    // jQuery's default encoding for object data: application/x-www-form-urlencoded
    // (nested objects/arrays as a[b]=c / a[]=1), appended to the URL for GET.
    $.param = function (obj) {
        var parts = [];
        function add(k, v) {
            if (v && typeof v === 'object') {
                for (var kk in v) if (Object.prototype.hasOwnProperty.call(v, kk)) add(k + '[' + (Array.isArray(v) ? '' : kk) + ']', v[kk]);
            } else parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v == null ? '' : v));
        }
        for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) add(k, obj[k]);
        return parts.join('&');
    };
    $.ajax = function (url, opts) {
        if (typeof url === 'object') { opts = url; url = opts.url; }
        opts = opts || {};
        var method = (opts.method || opts.type || 'GET').toUpperCase();
        var headers = Object.assign({}, opts.headers || {});
        var init = { method: method, headers: headers };
        var data = opts.data;
        var isJson = /json/i.test(opts.contentType || '');
        if (data != null && method === 'GET') {
            var qs = typeof data === 'string' ? data : $.param(data);
            if (qs) url += (url.indexOf('?') === -1 ? '?' : '&') + qs;
        } else if (data != null) {
            if (typeof data === 'string' || (typeof FormData !== 'undefined' && data instanceof FormData)) init.body = data;
            else if (isJson) init.body = JSON.stringify(data);
            else { init.body = $.param(data); if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; }
            if (isJson && !headers['Content-Type']) headers['Content-Type'] = opts.contentType;
        }
        if (_ajaxActive === 0) $(document).trigger('ajaxStart');
        _ajaxActive++;
        $(document).trigger('ajaxSend');
        var p = fetch(url, init)
            .then(function (res) {
                var ct = res.headers.get('content-type') || '';
                return ct.indexOf('json') > -1 ? res.json() : res.text();
            })
            .then(function (data) {
                opts.success && opts.success(data);
                $(document).trigger('ajaxSuccess');
                return data;
            })
            .catch(function (err) {
                opts.error && opts.error(err);
                $(document).trigger('ajaxError');
                throw err;
            })
            .finally(function () {
                _ajaxActive--;
                $(document).trigger('ajaxComplete');
                if (_ajaxActive === 0) $(document).trigger('ajaxStop');
            });
        // jqXHR-style chaining; the rejection is consumed only via these.
        p.done = function (fn) { p.then(fn, function () { }); return p; };
        p.fail = function (fn) { p.catch(fn); return p; };
        p.always = function (fn) { p.then(fn, fn); return p; };
        return p;
    };
    function _shorthand(method) {
        return function (url, data, success, dataType) {
            if (typeof data === 'function') { dataType = success; success = data; data = undefined; }
            return $.ajax({ url: url, method: method, data: data, success: success, dataType: dataType });
        };
    }
    $.get = _shorthand('GET');
    $.post = _shorthand('POST');
    $.getJSON = function (url, data, success) { return $.get(url, data, success, 'json'); };
    $.parseJSON = function (s) { return JSON.parse(s); };
    $.isArray = Array.isArray;
    $.isFunction = function (f) { return typeof f === 'function'; };
    $.noop = function () { };

    $.fn.each = function (fn) {
        for (var i = 0; i < this.length; i++) if (fn.call(this[i], i, this[i]) === false) break;
        return this;
    };
    $.fn.get = function (i) { return i === undefined ? toArray(this) : this[i]; };
    // 2026-09-17, found alongside .find()/.is() (same real bug's radio-
    // group branch in checkFormInputs()) — excludes elements matching a
    // raw DOM node, an array of nodes, or a $()-wrapped set; jQuery also
    // supports a selector string here, not needed by anything in this
    // codebase's actual usage (grepped), so not implemented.
    $.fn.not = function (exclude) {
        var excludeArr = exclude instanceof $ ? toArray(exclude) : (Array.isArray(exclude) ? exclude : [exclude]);
        var out = [];
        this.each(function () { if (excludeArr.indexOf(this) === -1) out.push(this); });
        return $(out);
    };

    $.fn.attr = function (name, value) {
        if (value === undefined) return this[0] ? this[0].getAttribute(name) : undefined;
        return this.each(function () { this.setAttribute(name, value); });
    };
    // 2026-09-17, found in the same real-page click test as .find()/.is()/
    // .not() above — real jQuery distinguishes .prop() (a direct DOM
    // property, e.g. .checked/.disabled/.scrollHeight) from .attr() (the
    // HTML attribute string); the two diverge for exactly the boolean
    // properties this codebase's real usage needs (checkFormInputs()'s
    // "disabled", the vendored search-widget's "disabled", scroll
    // measurements) — grepped actual call sites, not guessed.
    $.fn.prop = function (name, value) {
        if (value === undefined) return this[0] ? this[0][name] : undefined;
        return this.each(function () { this[name] = value; });
    };
    $.fn.removeAttr = function (name) {
        return this.each(function () { this.removeAttribute(name); });
    };
    // Not a real jQuery method — LumenJS's own $.fn.extend addition
    // (lstnrs.js), kept here since the core relies on it directly.
    //
    // 2026-09-16, real bug found and fixed: native `hasAttribute` can never
    // see a `@`-prefixed name (`@click`, `@sort`, ...) — vendor/
    // reconnecting-websocket.js monkey-patches HTMLElement.prototype.
    // setAttribute/getAttribute/removeAttribute so any `@`-prefixed write
    // is redirected to `el.events[name]` instead of the real attribute
    // store (deliberate, real V2 framework behavior, not something this
    // shim invented — see that file). Native `hasAttribute` was never part
    // of that patch, so it always returned false for these, and lstnrs.js's
    // processEv() bails immediately on `!el.hasAttr("@" + n)` — meaning
    // every `@`-event handler's before/after-guard and payload lookup was
    // unreachable. `getAttribute` *is* patch-aware, so route through that
    // instead — correct for both real attributes (native getAttribute
    // returns null when absent) and `@`-prefixed ones.
    $.fn.hasAttr = function (name) {
        return !!(this[0] && this[0].getAttribute(name) != null);
    };
    // jQuery keeps .data() values in an internal cache (objects keep their
    // identity; plugin instances, engines and cyclic structures are fine) and
    // falls back to data-* attributes on read. Primitives are also mirrored to
    // the attribute, which existing code reads back.
    var _dataCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    function _dataStore(el, create) {
        if (!_dataCache || !el || typeof el !== 'object') return null;
        var s = _dataCache.get(el);
        if (!s && create) { s = {}; _dataCache.set(el, s); }
        return s;
    }
    function _camel(k) { return String(k).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); }
    function _parseDataAttr(v) {
        if (v === undefined) return undefined;
        if (v === 'true') return true;
        if (v === 'false') return false;
        if (v === 'null') return null;
        if (v !== '' && !isNaN(v) && String(+v) === v) return +v;
        if (/^[\[{]/.test(v)) { try { return JSON.parse(v); } catch (e) { } }
        return v;
    }
    $.fn.data = function (key, value) {
        if (key && typeof key === 'object') {
            var obj = key;
            return this.each(function () { for (var k in obj) $(this).data(k, obj[k]); });
        }
        if (value === undefined) {
            var el = this[0];
            if (!el) return undefined;
            var store = _dataStore(el, false);
            var ds = el.dataset || {};
            if (key === undefined) {
                var all = {};
                for (var dk in ds) all[dk] = _parseDataAttr(ds[dk]);
                return Object.assign(all, store || {});
            }
            if (store && Object.prototype.hasOwnProperty.call(store, key)) return store[key];
            var ck = _camel(key);
            if (store && Object.prototype.hasOwnProperty.call(store, ck)) return store[ck];
            return _parseDataAttr(ds[ck]);
        }
        return this.each(function () {
            var s = _dataStore(this, true);
            if (s) s[key] = value;
            if (this.dataset && (value === null || typeof value !== 'object') && typeof value !== 'function') {
                try { this.dataset[_camel(key)] = String(value); } catch (e) { }
            }
        });
    };
    $.fn.removeData = function (key) {
        return this.each(function () {
            var s = _dataStore(this, false);
            var keys = key === undefined ? (s ? Object.keys(s) : []) : String(key).split(/\s+/);
            for (var i = 0; i < keys.length; i++) {
                if (s) { delete s[keys[i]]; delete s[_camel(keys[i])]; }
                if (this.dataset) { try { delete this.dataset[_camel(keys[i])]; } catch (e) { } }
            }
        });
    };
    $.fn.val = function (value) {
        if (value === undefined) return this[0] ? this[0].value : undefined;
        return this.each(function () { this.value = value; });
    };
    $.fn.html = function (value) {
        if (value === undefined) return this[0] ? this[0].innerHTML : undefined;
        // 2026-09-14, real bug found alongside .append()'s: _re.js calls
        // `.html(_rel._RealDOM)` (an array of real Nodes, e.g. for a
        // rendered layout/view) and `.html(_re._RealDOM)` for the view
        // itself — a bare string assignment (`this.innerHTML = value`)
        // coerces an array via toString(), producing garbage text like
        // "[object HTMLDivElement]" instead of actually inserting the
        // rendered content. Route anything non-string through the same
        // append() normalization instead.
        if (typeof value !== 'string') {
            var nodes = _normalizeAppendable([value]);
            return this.each(function () {
                this.innerHTML = '';
                var self = this;
                nodes.forEach(function (n) { self.appendChild(n); });
            });
        }
        return this.each(function () { this.innerHTML = value; });
    };
    // 2026-09-17, found alongside .find()/.is()/.not()/.prop() above —
    // checkFormInputs()'s "data-into" error-message branch calls
    // into.text(...). Not hit by the specific real page that surfaced
    // the others (this codebase's checkbox demo has no data-into), added
    // proactively rather than waiting for a second real crash to find it.
    $.fn.text = function (value) {
        if (value === undefined) return this[0] ? this[0].textContent : '';
        return this.each(function () { this.textContent = value; });
    };
    $.fn.css = function (name, value) {
        if (typeof name === 'object') {
            return this.each(function () {
                var el = this;
                for (var k in name) el.style[k] = name[k];
            });
        }
        if (value === undefined) return this[0] ? getComputedStyle(this[0])[name] : undefined;
        return this.each(function () { this.style[name] = value; });
    };
    $.fn.addClass = function (cls) {
        var list = cls.split(/\s+/).filter(Boolean);
        return this.each(function () { this.classList.add.apply(this.classList, list); });
    };
    $.fn.removeClass = function (cls) {
        var list = cls.split(/\s+/).filter(Boolean);
        return this.each(function () { this.classList.remove.apply(this.classList, list); });
    };
    $.fn.hasClass = function (cls) { return !!(this[0] && this[0].classList.contains(cls)); };
    $.fn.toggleClass = function (cls, force) {
        var list = cls.split(/\s+/).filter(Boolean);
        return this.each(function () {
            var el = this;
            list.forEach(function (c) { el.classList.toggle(c, force); });
        });
    };
    $.fn.remove = function () {
        return this.each(function () { this.parentNode && this.parentNode.removeChild(this); });
    };
    // Flattens real jQuery's .append()/.prepend() calling convention — any
    // number of arguments, each a string, a real Node, a $-wrapped
    // element, or an array of any of those — into a flat list of real
    // Nodes. Anything else (a plain object, a number, etc.) is silently
    // dropped, matching real jQuery's tolerance for garbage input.
    //
    // 2026-09-14, real bug found testing a real project against a real dev
    // server: this file's old `.append(content)` only ever looked at its
    // FIRST argument and assumed it was a string, a Node, or $-wrapped —
    // `_re.js`'s `el.append(..._re._RealDOM)` (spreading a Node array) hit
    // this whenever _RealDOM had zero or more-than-one entries, and a
    // pre-existing, vestigial `$("body").append({beajs:true, ...})` call
    // in vendor/reconnecting-websocket.js (a plain object, not a Node —
    // dead/legacy code, evidenced by the commented-out line right above
    // it) crashed outright instead of being silently ignored the way real
    // jQuery would have.
    function _normalizeAppendable(args) {
        var out = [];
        function add(item) {
            if (item == null) return;
            if (Array.isArray(item)) { item.forEach(add); return; }
            if (item instanceof $) { for (var i = 0; i < item.length; i++) add(item[i]); return; }
            if (typeof item === 'string') {
                var tpl = document.createElement('template');
                tpl.innerHTML = item;
                while (tpl.content.firstChild) out.push(tpl.content.removeChild(tpl.content.firstChild));
                return;
            }
            if (item instanceof Node) { out.push(item); return; }
        }
        for (var i = 0; i < args.length; i++) add(args[i]);
        return out;
    }
    $.fn.append = function () {
        if (arguments.length === 1 && typeof arguments[0] === 'string') {
            var html = arguments[0];
            return this.each(function () { this.insertAdjacentHTML('beforeend', html); });
        }
        var nodes = _normalizeAppendable(arguments);
        return this.each(function () {
            var self = this;
            nodes.forEach(function (n) { self.appendChild(n); });
        });
    };
    $.fn.prepend = function () {
        if (arguments.length === 1 && typeof arguments[0] === 'string') {
            var html = arguments[0];
            return this.each(function () { this.insertAdjacentHTML('afterbegin', html); });
        }
        var nodes = _normalizeAppendable(arguments);
        return this.each(function () {
            var self = this;
            var ref = self.firstChild;
            nodes.forEach(function (n) { self.insertBefore(n, ref); });
        });
    };
    $.fn.after = function (content) {
        return this.each(function () {
            if (typeof content === 'string') this.insertAdjacentHTML('afterend', content);
            else this.parentNode.insertBefore(content instanceof $ ? content[0] : content, this.nextSibling);
        });
    };
    $.fn.appendTo = function (target) { $(target).append(this); return this; };
    // Real layout metrics (jsdom has no rendering engine, so these will
    // read 0 here — harmless for anything that isn't actually testing
    // pixel measurements, which nothing in this codebase's core does).
    $.fn.width = function () { return this[0] ? this[0].offsetWidth : 0; };
    $.fn.height = function () { return this[0] ? this[0].offsetHeight : 0; };
    // 2026-09-22, found alongside the globalWatch() dead-code fix: real,
    // live vendor code (applyTriggers()'s @scroll-left/@scroll-right/
    // @scroll-top/@scroll-bottom edge detection) calls these — genuinely
    // missing, not just untested.
    $.fn.innerHeight = function () { return this[0] ? this[0].clientHeight : 0; };
    $.fn.innerWidth = function () { return this[0] ? this[0].clientWidth : 0; };
    $.fn.scrollLeft = function (value) {
        if (!this[0]) return value === undefined ? 0 : this;
        if (value === undefined) return this[0] === window ? window.scrollX : this[0].scrollLeft;
        return this.each(function () { if (this === window) window.scrollTo(value, window.scrollY); else this.scrollLeft = value; });
    };
    $.fn.scrollTop = function (value) {
        if (!this[0]) return value === undefined ? 0 : this;
        if (value === undefined) return this[0] === window ? window.scrollY : this[0].scrollTop;
        return this.each(function () { if (this === window) window.scrollTo(window.scrollX, value); else this.scrollTop = value; });
    };
    $.fn.outerWidth = function (includeMargin) {
        if (!this[0]) return 0;
        var w = this[0].offsetWidth;
        if (includeMargin) {
            var s = getComputedStyle(this[0]);
            w += parseFloat(s.marginLeft || 0) + parseFloat(s.marginRight || 0);
        }
        return w;
    };
    $.fn.outerHeight = function (includeMargin) {
        if (!this[0]) return 0;
        var h = this[0].offsetHeight;
        if (includeMargin) {
            var s = getComputedStyle(this[0]);
            h += parseFloat(s.marginTop || 0) + parseFloat(s.marginBottom || 0);
        }
        return h;
    };
    // 2026-09-21, real bug found and fixed: never implemented at all —
    // a real V1 page's own scroll-spy code (`$(this).offset().top -
    // window.pageYOffset`, comparing each <section>'s position against
    // the viewport) crashed outright the moment it ran. Real jQuery's own
    // implementation (getBoundingClientRect() + the page's scroll offset,
    // adjusted for a nonzero <html> border/margin via clientTop/Left).
    $.fn.offset = function () {
        if (!this[0]) return null;
        var rect = this[0].getBoundingClientRect();
        var docEl = document.documentElement;
        return {
            top: rect.top + (window.pageYOffset || docEl.scrollTop) - (docEl.clientTop || 0),
            left: rect.left + (window.pageXOffset || docEl.scrollLeft) - (docEl.clientLeft || 0)
        };
    };
    $.fn.parent = function () { return $(this[0] ? this[0].parentElement : null); };
    $.fn.next = function () { return $(this[0] ? this[0].nextElementSibling : null); };
    $.fn.closest = function (sel) { return $(this[0] ? this[0].closest(sel) : null); };
    // 2026-09-17, real bug found and fixed: never implemented at all —
    // vendor/reconnecting-websocket.js's ported V1 form-validation code
    // (checkFormInputs()) calls f.find(...) on the result of .closest(
    // "form"), and .closest() legitimately returns an empty $() when
    // there's no enclosing form (a completely normal case — a single
    // checkbox/input outside a <form>). With .find() missing, that threw
    // "f.find is not a function" the moment ANY input/textarea/select
    // fired a "change" event anywhere on the page, form or no form —
    // found clicking a plain checkbox on lumenjs.com's own real V2
    // homepage. Real jQuery .find() semantics: search descendants of
    // each matched element, union the results (safe/empty on an empty
    // set, exactly what's needed here).
    $.fn.find = function (sel) {
        var out = [];
        if (sel && typeof sel === 'object') {
            var cands = toArray(sel instanceof $ ? sel : [sel]);
            var self = toArray(this);
            return $(cands.filter(function (c) { return self.some(function (p) { return p !== c && p.contains(c); }); }));
        }
        this.each(function () {
            var found = _jqSelect(this, sel);
            for (var i = 0; i < found.length; i++) if (out.indexOf(found[i]) === -1) out.push(found[i]);
        });
        return $(out);
    };
    // 2026-09-17, found alongside .find() (same crash, next line of the
    // same real bug): checkFormInputs() also calls el.is(":checkbox")/
    // ":radio"/":checked" — real CSS pseudo-classes for the former two
    // don't exist (native .matches(":checkbox") throws a SyntaxError,
    // it's a jQuery-only pseudo-selector), so a short, explicit table for
    // the handful actually used across the vendored code (grepped, not
    // guessed) plus a native .matches() fallback for everything else
    // (tag names, real attribute selectors like "[dp0]") — safely false
    // rather than throwing if a selector native matches() can't parse.
    var JQUERY_PSEUDOS = {
        ':checkbox': function (el) { return el.tagName === 'INPUT' && el.type === 'checkbox'; },
        ':radio': function (el) { return el.tagName === 'INPUT' && el.type === 'radio'; },
        ':checked': function (el) { return !!el.checked; },
    };
    JQUERY_PSEUDOS[':selected'] = function (el) { return !!el.selected; };
    JQUERY_PSEUDOS[':visible'] = function (el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); };
    JQUERY_PSEUDOS[':hidden'] = function (el) { return !JQUERY_PSEUDOS[':visible'](el); };
    $.fn.is = function (sel) {
        if (!this[0]) return false;
        if (typeof sel === 'function') { var s = this; return toArray(this).some(function (el, i) { return sel.call(el, i, el); }); }
        if (sel && typeof sel === 'object') { var set = toArray(sel instanceof $ ? sel : [sel]); return toArray(this).some(function (el) { return set.indexOf(el) !== -1; }); }
        if (JQUERY_PSEUDOS[sel]) return JQUERY_PSEUDOS[sel](this[0]);
        var rewritten = sel;
        for (var r = 0; r < JQ_REWRITES.length; r++) rewritten = rewritten.replace(JQ_REWRITES[r][0], JQ_REWRITES[r][1]);
        try { return this[0].matches(rewritten); } catch (e) { return false; }
    };
    $.fn.ready = function (fn) {
        if (document.readyState !== 'loading') fn($);
        else document.addEventListener('DOMContentLoaded', function () { fn($); });
        return this;
    };

    // ---- Traversal ----
    function _filterBySel(els, sel) {
        if (!sel) return els;
        return els.filter(function (el) { return $(el).is(sel); });
    }
    $.fn.eq = function (i) { i = +i; if (i < 0) i += this.length; return $(this[i] ? [this[i]] : []); };
    $.fn.first = function () { return this.eq(0); };
    $.fn.last = function () { return this.eq(-1); };
    $.fn.index = function (target) {
        if (target === undefined) {
            var el = this[0];
            if (!el || !el.parentElement) return -1;
            return toArray(el.parentElement.children).indexOf(el);
        }
        var node = target instanceof $ ? target[0] : (typeof target === 'string' ? null : target);
        if (typeof target === 'string') return toArray($(target)).indexOf(this[0]);
        return toArray(this).indexOf(node);
    };
    $.fn.add = function (sel, ctx) {
        var out = toArray(this);
        toArray(typeof sel === 'string' && sel.trim()[0] !== '<' ? $(sel, ctx) : $(sel)).forEach(function (x) { if (out.indexOf(x) === -1) out.push(x); });
        return $(out);
    };
    $.fn.children = function (sel) {
        var out = [];
        this.each(function () { out.push.apply(out, toArray(this.children || [])); });
        return $(_filterBySel(out, sel));
    };
    $.fn.contents = function () {
        var out = [];
        this.each(function () { out.push.apply(out, toArray(this.childNodes || [])); });
        return $(out);
    };
    $.fn.siblings = function (sel) {
        var out = [];
        this.each(function () {
            var me = this;
            if (!me.parentElement) return;
            toArray(me.parentElement.children).forEach(function (c) { if (c !== me && out.indexOf(c) === -1) out.push(c); });
        });
        return $(_filterBySel(out, sel));
    };
    $.fn.prev = function (sel) {
        var out = [];
        this.each(function () { var p = this.previousElementSibling; if (p) out.push(p); });
        return $(_filterBySel(out, sel));
    };
    $.fn.prevAll = function (sel) {
        var out = [];
        this.each(function () { var p = this.previousElementSibling; while (p) { if (out.indexOf(p) === -1) out.push(p); p = p.previousElementSibling; } });
        return $(_filterBySel(out, sel));
    };
    $.fn.nextAll = function (sel) {
        var out = [];
        this.each(function () { var n = this.nextElementSibling; while (n) { if (out.indexOf(n) === -1) out.push(n); n = n.nextElementSibling; } });
        return $(_filterBySel(out, sel));
    };
    $.fn.parents = function (sel) {
        var out = [];
        this.each(function () { var p = this.parentElement; while (p) { if (out.indexOf(p) === -1) out.push(p); p = p.parentElement; } });
        return $(_filterBySel(out, sel));
    };
    $.fn.filter = function (sel) {
        var els = toArray(this);
        if (typeof sel === 'function') return $(els.filter(function (el, i) { return sel.call(el, i, el); }));
        return $(_filterBySel(els, sel));
    };
    $.fn.has = function (sel) {
        return $(toArray(this).filter(function (el) { return $(el).find(sel).length > 0; }));
    };
    $.fn.map = function (fn) {
        var out = [];
        this.each(function (i, el) { var r = fn.call(el, i, el); if (r != null) Array.isArray(r) ? out.push.apply(out, r) : out.push(r); });
        return $(out);
    };
    $.fn.toArray = function () { return toArray(this); };

    // ---- Visibility (display toggles; timed variants call back after) ----
    function _isHidden(el) {
        return el.style.display === 'none' || (window.getComputedStyle && getComputedStyle(el).display === 'none');
    }
    function _show(el) {
        if (el.style.display === 'none') el.style.display = el._lmOldDisplay || '';
        if (window.getComputedStyle && getComputedStyle(el).display === 'none') el.style.display = el._lmOldDisplay || 'block';
    }
    function _hide(el) {
        if (el.style.display && el.style.display !== 'none') el._lmOldDisplay = el.style.display;
        el.style.display = 'none';
    }
    function _timedArgs(a, b, c) {
        var cb = [a, b, c].filter(function (x) { return typeof x === 'function'; })[0];
        var ms = typeof a === 'number' ? a : (a === 'slow' ? 600 : a === 'fast' ? 200 : (a && typeof a === 'object' && a.duration) || 0);
        return { ms: ms, cb: cb };
    }
    function _visibilityMethod(apply) {
        return function (a, b, c) {
            var t = _timedArgs(a, b, c), self = this;
            this.each(function () { apply(this); });
            if (t.cb) setTimeout(function () { self.each(function () { t.cb.call(this); }); }, t.ms);
            return this;
        };
    }
    $.fn.show = _visibilityMethod(_show);
    $.fn.hide = _visibilityMethod(_hide);
    $.fn.fadeIn = $.fn.show;
    $.fn.fadeOut = $.fn.hide;
    $.fn.slideDown = $.fn.show;
    $.fn.slideUp = $.fn.hide;
    $.fn.toggle = function (state) {
        if (typeof state === 'boolean') return state ? this.show() : this.hide();
        var t = _timedArgs.apply(null, arguments), self = this;
        this.each(function () { _isHidden(this) ? _show(this) : _hide(this); });
        if (t.cb) setTimeout(function () { self.each(function () { t.cb.call(this); }); }, t.ms);
        return this;
    };
    $.fn.fadeToggle = $.fn.toggle;
    $.fn.slideToggle = $.fn.toggle;

    // ---- Manipulation ----
    $.fn.empty = function () { return this.each(function () { while (this.firstChild) this.removeChild(this.firstChild); }); };
    $.fn.before = function (content) {
        return this.each(function () { var t = this; _normalizeAppendable([content]).forEach(function (n) { t.parentNode && t.parentNode.insertBefore(n, t); }); });
    };
    $.fn.wrap = function (wrapper) {
        return this.each(function () {
            var w = _normalizeAppendable([wrapper]).filter(function (n) { return n.nodeType === 1; })[0];
            if (!w || !this.parentNode) return;
            w = w.cloneNode(true);
            this.parentNode.insertBefore(w, this);
            var inner = w; while (inner.firstElementChild) inner = inner.firstElementChild;
            inner.appendChild(this);
        });
    };
    $.fn.unwrap = function () {
        var parents = [];
        this.each(function () { var p = this.parentElement; if (p && p !== document.body && parents.indexOf(p) === -1) parents.push(p); });
        parents.forEach(function (p) { while (p.firstChild) p.parentNode.insertBefore(p.firstChild, p); p.parentNode.removeChild(p); });
        return this;
    };
    $.fn.clone = function () { return $(toArray(this).map(function (el) { return el.cloneNode(true); })); };
    $.fn.position = function () {
        var el = this[0];
        if (!el) return undefined;
        return { top: el.offsetTop, left: el.offsetLeft };
    };
    // jQuery's full family of global ajax events — all just named events on
    // document under the hood, registered/fired the same way.
    ['ajaxStart', 'ajaxStop', 'ajaxSend', 'ajaxSuccess', 'ajaxError', 'ajaxComplete'].forEach(function (name) {
        $.fn[name] = function (fn) { return this.on(name, fn); };
    });

    // ---- Events ----
    // A handful of event names need translating for delegation to actually
    // work — left as-is, these would silently never fire, exactly the class
    // of bug point 6 exists to stop happening. `focus`/`blur` are real, but don't bubble, so
    // delegating them from `document`/`body` (lstnrs.js's whole pattern)
    // requires their bubbling equivalents instead — this is what real
    // jQuery does internally for the same reason.
    // `touch` is NOT mapped (2026-10-08). It isn't a DOM event, so under V1's jQuery `.on("click touch")` only ever
    // fired on click. Mapping it to touchstart made every "click touch" handler (@click, links, .navTgl, [tgl],
    // [modal], ...) run twice on a phone: once on touchstart, again on the click the browser sends after it.
    var EVENT_NAME_MAP = { focus: 'focusin', blur: 'focusout' };

    // jQuery lets you `.on()`/`.trigger()` an arbitrary plain object, not
    // just DOM nodes — real jQuery keeps its own event table for that case.
    // Needed here: the vendored WebWorker helper wraps itself (`$(this)`)
    // and uses `.on()`/`.trigger()` purely as a pub/sub bus, never touching
    // the DOM. Bridge non-Node targets to a real EventTarget instead of
    // assuming addEventListener always exists.
    var _eventBuses = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    function _isNode(x) {
        return x === window || x === document || (typeof Node !== 'undefined' && x instanceof Node);
    }
    // 2026-09-14, real bug found testing a real project end-to-end: the
    // same WebWorker helper ALSO does `$(this.getNativeWorker()).on(
    // "message", ...)` to receive real messages posted FROM the actual
    // worker thread. A native `Worker` isn't a DOM Node, so `_isNode` was
    // false and this got routed through the fake WeakMap-bridged
    // EventTarget below instead of the real Worker instance's own native
    // event system — meaning real `message` events the browser itself
    // dispatches on the Worker never reached it, and the worker's
    // load/start handshake (which is entirely message-driven) silently
    // stalled forever. Any object that's already a genuine EventTarget
    // (Worker, WebSocket, XMLHttpRequest, ...) should be used directly,
    // not bridged.
    function _isRealEventTarget(x) {
        return x != null && typeof x.addEventListener === 'function' && typeof x.dispatchEvent === 'function';
    }
    function _eventTargetFor(x) {
        if (_isNode(x) || _isRealEventTarget(x)) return x;
        if (!_eventBuses.has(x)) _eventBuses.set(x, new EventTarget());
        return _eventBuses.get(x);
    }

    // 2026-09-16, real bug found and fixed: lstnrs.js delegates every
    // @click/@sort/@drag/... binding via `$("body").on(evt, "[\\@name]",
    // handler)` — 34 call sites, all this exact single-attribute-presence
    // shape. Native `Element.prototype.closest()` (used below for every
    // other selector) matches against the browser's real internal
    // attribute storage, which can never see the `@`-prefixed redirect
    // described in $.fn.hasAttr's comment above — so a delegated `@`-event
    // listener could never fire at all, in any environment, real browser
    // included (confirmed against an actual `lm build` output driven by
    // real Chrome, not just jsdom). Detect that exact selector shape and
    // walk up manually using `getAttribute` (patch-aware) instead of
    // native closest(); every other selector (e.g. lstnrs.js's own
    // "[up] [browse]") is untouched, still native.
    var AT_ATTR_SELECTOR = /^\[\\@([\w-]+)\]$/;
    // jQuery passes .trigger(name, extraParams) on to handlers as extra
    // arguments (an array is spread). Carried on a private property, not
    // ev.detail — a native click's detail is its click count.
    function _callHandler(handler, ctx, e) {
        var extra = e.__lmArgs;
        if (extra === undefined) return handler.call(ctx, e);
        return handler.apply(ctx, [e].concat(Array.isArray(extra) ? extra : [extra]));
    }

    $.fn.on = function (events, selector, data, handler) {
        if (typeof selector === 'function') { handler = selector; selector = null; }
        else if (typeof data === 'function' && handler === undefined) { handler = data; }
        else if (typeof handler !== 'function' && typeof data === 'function') { handler = data; }
        if (typeof selector !== 'string') selector = null;
        if (typeof handler !== 'function') return this;
        var evts = String(events).split(/\s+/).filter(Boolean);
        // A comma list of [\\@name] parts ("[\\@input],[\\@change],...",
        // "[\\@swipe],[\\@swipe-up],...") is the same case — native
        // closest() can't match any part of it either.
        var atParts = selector ? selector.split(',').map(function (p) { return p.trim(); }) : [];
        var atAttrs = atParts.length && atParts.every(function (p) { return AT_ATTR_SELECTOR.test(p); })
            ? atParts.map(function (p) { return '@' + AT_ATTR_SELECTOR.exec(p)[1]; })
            : null;
        var atAttr = !!atAttrs;
        function _hasAnyAt(el) {
            for (var i = 0; i < atAttrs.length; i++) if (el.getAttribute(atAttrs[i]) != null) return true;
            return false;
        }
        return this.each(function () {
            var node = this;
            var bus = _eventTargetFor(node);
            evts.forEach(function (evtFull) {
                // "click.myns": jQuery namespaces only scope .off(); the
                // real event is the part before the first dot.
                var dot = evtFull.indexOf('.');
                var evt = dot === -1 ? evtFull : evtFull.slice(0, dot);
                var ns = dot === -1 ? '' : evtFull.slice(dot + 1);
                if (!evt) return;
                function listen(realName, wrapper) {
                    bus.addEventListener(realName, wrapper);
                    _recordListener(bus, { type: evt, ns: ns, selector: selector, handler: handler, real: realName, wrapper: wrapper });
                }
                // 2026-09-22, real bug found and fixed: mouseenter/
                // mouseleave are real DOM events, but — unlike click,
                // change, etc. — they never bubble at all (only their
                // mouseover/mouseout equivalents do), so a body-delegated
                // listener bound directly to "mouseenter"/"mouseleave"
                // structurally can never see one fired on a descendant,
                // in any environment. Real jQuery handles this internally
                // by listening for the bubbling mouseover/mouseout and
                // checking relatedTarget (where the pointer came from/is
                // going to) to recognize a genuine boundary crossing —
                // same technique here. This needed real runtime logic,
                // not just a name swap (EVENT_NAME_MAP, used for focus/
                // blur -> focusin/focusout, only works for a same-shape
                // 1:1 rename).
                if (evt === 'mouseenter' || evt === 'mouseleave') {
                    var realType = evt === 'mouseenter' ? 'mouseover' : 'mouseout';
                    listen(realType, function (e) {
                        var related = e.relatedTarget;
                        if (atAttr) {
                            var el = e.target;
                            var match = null;
                            while (el && el.nodeType === 1) {
                                if (_hasAnyAt(el)) { match = el; break; }
                                el = el.parentElement;
                            }
                            if (match && node.contains(match) && !(related && match.contains(related))) {
                                _callHandler(handler, match, e);
                            }
                        } else if (selector && _isNode(node)) {
                            var match2 = e.target.closest(selector);
                            if (match2 && node.contains(match2) && !(related && match2.contains(related))) {
                                _callHandler(handler, match2, e);
                            }
                        } else if (!(related && node.contains(related))) {
                            _callHandler(handler, node, e);
                        }
                    });
                    return;
                }
                var real = EVENT_NAME_MAP[evt] || evt;
                listen(real, function (e) {
                    // Like jQuery (which V1 always ran on): a delegated handler fires for EVERY matching element
                    // from the target up, nearest first, until one stops propagation or returns false — not just
                    // the nearest match, which silently dropped a parent's @click inside a clickable child.
                    if (atAttr || (selector && _isNode(node))) {
                        for (var el = e.target; el && el.nodeType === 1 && node.contains(el); el = el.parentElement) {
                            var hit = atAttr ? _hasAnyAt(el) : (el.matches && el.matches(selector));
                            if (!hit) continue;
                            var ret = _callHandler(handler, el, e);
                            if (ret === false) { e.preventDefault(); e.stopPropagation(); }
                            if (e.cancelBubble) break;
                        }
                    } else {
                        _callHandler(handler, node, e);
                    }
                });
            });
        });
    };
    // Real V1 project code (view/tpl scripts) still uses the pre-1.9
    // jQuery .live(): a document-level delegated binding on this set's
    // own selector.
    $.fn.live = function (events, data, handler) {
        if (this.selector && typeof this.selector === 'string') $(document).on(events, this.selector, data, handler);
        else this.on(events, data, handler);
        return this;
    };
    $.fn.click = function (handler) { return handler ? this.on('click', handler) : this.trigger('click'); };
    $.fn.keydown = function (handler) { return handler ? this.on('keydown', handler) : this.trigger('keydown'); };
    $.fn.trigger = function (type, data) {
        return this.each(function () {
            var bus = _eventTargetFor(this);
            var ev;
            if (type instanceof Event) {
                // 2026-09-14, real bug found testing a real project end-to-
                // end: the vendored WebWorker helper (vendor/webworker-
                // helper.js) builds `$.Event(name)` — a real Event — then
                // assigns custom properties onto it (e.g. `.worker`) and
                // triggers with THAT OBJECT, not a name string. The old
                // code here did `new Event(type, ...)` regardless, so
                // passing an Event object as `type` got silently coerced
                // to garbage like "[object Event]" by the native Event
                // constructor — no error, just an event nothing ever
                // matched, which is why _csswrk (the scoped-CSS worker,
                // gating renderView() itself) never got past its
                // INITIALIZED state: its own start()/load() sequence is
                // entirely driven by trigger()ing exactly this pattern.
                // Dispatch the existing Event as-is so its custom
                // properties survive.
                ev = type;
            } else if (type && typeof type === 'object' && typeof type.type === 'string') {
                ev = new Event(type.type, { bubbles: _isNode(this) });
                for (var k in type) {
                    if (k !== 'type' && Object.prototype.hasOwnProperty.call(type, k)) {
                        try { ev[k] = type[k]; } catch (e) { /* read-only Event own-property, e.g. `target` */ }
                    }
                }
            } else {
                ev = new Event(type, { bubbles: _isNode(this) });
            }
            if (data !== undefined) {
                ev.__lmArgs = data;
                try { if (ev.detail === undefined || ev.detail === null) ev.detail = data; } catch (e) { }
            }
            bus.dispatchEvent(ev);
        });
    };
    var _listenerRegistry = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    function _recordListener(bus, rec) {
        if (!_listenerRegistry) return;
        var list = _listenerRegistry.get(bus);
        if (!list) { list = []; _listenerRegistry.set(bus, list); }
        list.push(rec);
    }
    $.fn.off = function (events, selector, handler) {
        if (typeof selector === 'function') { handler = selector; selector = undefined; }
        var specs = events === undefined ? [{ type: '', ns: '' }] : String(events).split(/\s+/).filter(Boolean).map(function (e) {
            var d = e.indexOf('.');
            return { type: d === -1 ? e : e.slice(0, d), ns: d === -1 ? '' : e.slice(d + 1) };
        });
        return this.each(function () {
            if (!_listenerRegistry) return;
            var bus = _eventTargetFor(this);
            var list = _listenerRegistry.get(bus);
            if (!list) return;
            for (var i = list.length - 1; i >= 0; i--) {
                var r = list[i];
                var hit = specs.some(function (sp) {
                    return (!sp.type || sp.type === r.type) && (!sp.ns || sp.ns === r.ns);
                });
                if (!hit) continue;
                if (selector !== undefined && selector !== '**' && r.selector !== selector) continue;
                if (handler && r.handler !== handler) continue;
                bus.removeEventListener(r.real, r.wrapper);
                list.splice(i, 1);
            }
        });
    };
    $.fn.unbind = function (events, handler) { return this.off(events, handler); };
    $.fn.bind = function (events, data, handler) { return this.on(events, null, data, handler); };
    $.fn.one = function (events, selector, data, handler) {
        var args = [].slice.call(arguments), fn = null, idx = -1;
        for (var i = args.length - 1; i >= 0; i--) if (typeof args[i] === 'function') { fn = args[i]; idx = i; break; }
        if (!fn) return this;
        var self = this;
        args[idx] = function once(e) { self.off(events, once); return fn.apply(this, arguments); };
        return this.on.apply(this, args);
    };
    $.fn.die = function (events, handler) {
        if (this.selector && typeof this.selector === 'string') $(document).off(events, this.selector, handler);
        return this;
    };

    // jQuery's shorthand event methods (2026-09-14, real gap found testing
    // a real project's vendor code end-to-end — `$(el).keyup(...)` threw
    // "not a function", never caught before because nothing had exercised
    // this vendor code path this far). `.eventname(handler)` binds,
    // `.eventname()` triggers — matching real jQuery exactly.
    ["click", "dblclick", "keyup", "keydown", "keypress", "focus", "blur",
        "change", "submit", "focusin", "focusout", "mouseenter", "mouseleave",
        "mouseover", "mouseout", "mousedown", "mouseup", "mousemove",
        "resize", "scroll", "load", "select"].forEach(function (name) {
            $.fn[name] = function (handler) {
                return handler ? this.on(name, handler) : this.trigger(name);
            };
        });
    $.fn.hover = function (enter, leave) {
        this.on('mouseenter', enter);
        this.on('mouseleave', leave || enter);
        return this;
    };

    // 2026-09-18, real gap found testing a real migrated V1 project end-to-
    // end: `st()` (vendor/reconnecting-websocket.js's own real, shipped
    // scroll-to helper — not project code, framework code) does
    // `$("html,body").stop().animate({scrollTop: x}, {duration: 400})` —
    // a very common pattern across real V1 pages (called at the top of
    // most real view scripts for smooth-scroll navigation). Neither
    // method existed in the shim at all, throwing "not a function" and
    // aborting the rest of that script on every real page that called it.
    // `scrollTop`/`scrollLeft` are DOM properties, not CSS ones — handled
    // as a special case, matching real jQuery's own animate() behavior;
    // any other property is treated as a numeric CSS property (adding
    // "px" unless it's already a bare number-only string/value, matching
    // jQuery's own unit-inference for a plain number).
    var _animTimers = new WeakMap();
    function _animGetScroll(el, prop) {
        if (el === window) return prop === 'scrollLeft' ? window.pageXOffset : window.pageYOffset;
        return el[prop];
    }
    function _animSetScroll(el, prop, val) {
        if (el === window) {
            if (prop === 'scrollLeft') window.scrollTo(val, window.pageYOffset);
            else window.scrollTo(window.pageXOffset, val);
        } else {
            el[prop] = val;
        }
    }
    // Real jQuery's own cssNumber list — these CSS properties take a bare
    // unitless number, not "Npx" (opacity: "0.5px" is simply invalid and
    // silently ignored by the browser, which is exactly what broke the
    // very first real-content test of this: an opacity fade never moved).
    var _cssNumberProps = { opacity: 1, zIndex: 1, zoom: 1, fontWeight: 1, lineHeight: 1, columnCount: 1, flexGrow: 1, flexShrink: 1, order: 1, widows: 1, orphans: 1 };
    function _animSetStyle(el, prop, val) {
        el.style[prop] = _cssNumberProps[prop] ? val : (val + 'px');
    }
    $.fn.animate = function (props, options) {
        var opts = typeof options === 'number' ? { duration: options } : (options || {});
        var duration = opts.duration == null ? 400 : opts.duration;
        this.each(function () {
            var el = this;
            var isWindowScroll = (el === document.documentElement || el === document.body);
            var target = isWindowScroll ? window : el;
            var start = {};
            var isScrollProp = {};
            for (var prop in props) {
                if (!Object.prototype.hasOwnProperty.call(props, prop)) continue;
                isScrollProp[prop] = (prop === 'scrollTop' || prop === 'scrollLeft');
                if (isScrollProp[prop]) {
                    start[prop] = _animGetScroll(isWindowScroll ? window : el, prop);
                } else {
                    start[prop] = parseFloat(getComputedStyle(el)[prop]) || 0;
                }
            }
            var existing = _animTimers.get(el);
            if (existing) cancelAnimationFrame(existing);
            if (duration === 0) {
                for (var p in props) {
                    var v = parseFloat(props[p]);
                    if (isScrollProp[p]) _animSetScroll(isWindowScroll ? window : el, p, v);
                    else _animSetStyle(el, p, v);
                }
                if (opts.complete) opts.complete.call(el);
                return;
            }
            var startTime = null;
            function step(ts) {
                if (startTime === null) startTime = ts;
                var elapsed = ts - startTime;
                var t = Math.min(1, elapsed / duration);
                for (var p in props) {
                    if (!Object.prototype.hasOwnProperty.call(props, p)) continue;
                    var end = parseFloat(props[p]);
                    var val = start[p] + (end - start[p]) * t;
                    if (isScrollProp[p]) _animSetScroll(isWindowScroll ? window : el, p, val);
                    else _animSetStyle(el, p, val);
                }
                if (t < 1) {
                    _animTimers.set(el, requestAnimationFrame(step));
                } else {
                    _animTimers.delete(el);
                    if (opts.complete) opts.complete.call(el);
                }
            }
            _animTimers.set(el, requestAnimationFrame(step));
        });
        return this;
    };
    $.fn.stop = function () {
        this.each(function () {
            var id = _animTimers.get(this);
            if (id) {
                cancelAnimationFrame(id);
                _animTimers.delete(this);
            }
        });
        return this;
    };

    // 2026-09-22, real bug found and fixed: never implemented at all —
    // the real modal open/close code (lstnrs.js, 3 real call sites, all
    // the same `.delay(ms).queue(function(next){...;next();})` idiom)
    // depends on jQuery's real per-element effects queue. Minimal, faithful
    // subset: a real FIFO queue per element (default "fx" queue, matching
    // real jQuery — nothing in this codebase's real usage names a queue
    // explicitly, so a second name is accepted but untested), processed
    // one entry at a time; each queued function receives a real `next()`
    // it must call to advance, exactly like real jQuery.
    var _queues = new WeakMap();
    function _getQueue(el, name) {
        var byName = _queues.get(el);
        if (!byName) { byName = {}; _queues.set(el, byName); }
        if (!byName[name]) byName[name] = { items: [], running: false };
        return byName[name];
    }
    function _dequeue(el, name) {
        var q = _getQueue(el, name);
        if (q.running) return;
        var next = q.items.shift();
        if (!next) return;
        q.running = true;
        next.call(el, function () {
            q.running = false;
            _dequeue(el, name);
        });
    }
    $.fn.queue = function (name, fn) {
        if (typeof name === 'function') { fn = name; name = 'fx'; }
        name = name || 'fx';
        if (fn === undefined) return _getQueue(this[0], name).items;
        return this.each(function () {
            _getQueue(this, name).items.push(fn);
            _dequeue(this, name);
        });
    };
    $.fn.dequeue = function (name) {
        return this.each(function () { _dequeue(this, name || 'fx'); });
    };
    $.fn.delay = function (ms, name) {
        name = name || 'fx';
        return this.each(function () {
            _getQueue(this, name).items.push(function (next) { setTimeout(next, ms); });
            _dequeue(this, name);
        });
    };

    // 2026-09-22, real bug found and fixed: never implemented at all —
    // vendor/reconnecting-websocket.js's real, live form-handling code
    // (every plain <form> without `norm`, and every `o-sub`/`b-sub` form)
    // is built entirely on jQuery.form's serializeArray()/ajaxForm(), two
    // real plugin methods this lightweight runtime never provided. The
    // DEFAULT (non--with-plugins-selected) runtime is what most real
    // projects actually ship on now (--with-plugins itself was removed
    // 2026-09-19) — meaning EVERY form on EVERY such project has always
    // silently fallen through to a raw native browser submission (a full
    // page reload) instead of LumenJS's intended pushURL()-based SPA
    // navigation, with o-sub/b-sub handlers never firing at all. Found
    // testing the real /guide/routing/form page: a form with `o-sub`
    // and no `action` submitted natively to the CURRENT page's URL
    // instead of navigating to the target view at all — exactly matching
    // a real user report ("form data is not sent to the next view").
    //
    // serializeArray(): real jQuery-core semantics — successful form
    // controls only (named, not disabled; checkboxes/radios only when
    // checked; submit/button/reset excluded). File inputs are included
    // (unlike real jQuery core's own serializeArray, which drops them
    // entirely) because getFormData() — the one real caller — explicitly
    // branches on `x.type == "file"`, so dropping them silently would
    // just move the gap rather than close it.
    $.fn.serializeArray = function () {
        var result = [];
        this.each(function () {
            if (this.tagName !== 'FORM') return;
            var elements = this.elements ? Array.prototype.slice.call(this.elements) : [];
            elements.forEach(function (field) {
                if (!field.name || field.disabled) return;
                var tag = field.tagName.toLowerCase();
                var type = (field.type || tag).toLowerCase();
                if (type === 'submit' || type === 'button' || type === 'reset' || type === 'fieldset') return;
                if ((type === 'checkbox' || type === 'radio') && !field.checked) return;
                if (type === 'file') {
                    var files = field.files ? Array.prototype.map.call(field.files, function (f) { return f.name; }) : [];
                    result.push({ name: field.name, value: files, type: type });
                    return;
                }
                if (tag === 'select' && field.multiple) {
                    Array.prototype.forEach.call(field.selectedOptions || [], function (opt) {
                        result.push({ name: field.name, value: opt.value, type: type });
                    });
                    return;
                }
                result.push({ name: field.name, value: field.value, type: type });
            });
        });
        return result;
    };
    // ajaxForm(options): a deliberate SUBSET of real jQuery.form, scoped
    // to exactly the one shape every real call site in this codebase
    // actually uses — bind a submit interceptor, hand the real, live
    // caller `options.beforeSubmit(formData, $form, options)`. Every real
    // beforeSubmit in vendor/reconnecting-websocket.js unconditionally
    // returns `false` at its end (it always does its own pushURL()-based
    // navigation instead of a real AJAX submit) — so a real AJAX
    // submission path (multipart encoding, XHR/iframe fallback for file
    // uploads, success/error callbacks) is never actually reached in
    // practice and is intentionally NOT implemented here. The native
    // submit is always prevented; if a future beforeSubmit legitimately
    // wants the real jQuery.form AJAX-submit behavior instead of
    // cancelling, that's a real, separate feature to add then, not
    // silently guessed at now.
    $.fn.ajaxForm = function (options) {
        options = options || {};
        return this.each(function () {
            var formEl = this;
            var $form = $(formEl);
            formEl.addEventListener('submit', function (ev) {
                ev.preventDefault();
                var formData = $form.serializeArray();
                if (typeof options.beforeSubmit === 'function') {
                    options.beforeSubmit(formData, $form, options);
                }
            });
        });
    };

    // 2026-09-22, real bug found and fixed: this used to assign
    // unconditionally. The selective-plugin-bundling mechanism
    // (packages/cli's plugins-esbuild-plugin.js) builds a real jQuery
    // (+ jQuery UI etc.) bundle and ALSO unconditionally assigns
    // `window.jQuery = window.$`, deliberately — the two are meant to
    // compose as "whichever loads later wins." But both this repo's own
    // default project scaffold (lib/files/project/src/index.html) and a
    // real migrated V1 project put `lm.js` (this file) at the BOTTOM of
    // <body>, while the plugins bundle's own <script> tag gets inserted
    // into <head> — meaning `lm.js` always loads LAST in the normal
    // case, and this unconditional assignment was silently clobbering a
    // real, already-loaded jQuery UI back down to the lightweight shim
    // every time, regardless of script order. Confirmed live: a real
    // project with jquery-ui-dist selected still threw
    // "t2.draggable is not a function" until this was made conditional.
    // Only assign when nothing has already claimed these globals as a
    // real jQuery — a project's own selected plugin bundle, loaded in
    // either order, always wins over this shim.
    if (!global.jQuery || !global.jQuery.fn || global.jQuery.fn.jquery === 'lumenjs-shim') {
        global.$ = $;
        global.jQuery = $;
    }
})(typeof window !== 'undefined' ? window : globalThis);
