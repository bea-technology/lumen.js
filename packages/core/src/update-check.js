// "A new version is available — Reload" for built apps (ported from console.roxyon.com, 2026-10-02).
// `lm build` fingerprints the bundle as /js/app.<ms-epoch>.js in index.html. The running page reads its own stamp
// from its <script src>, then periodically fetches a fresh index.html and compares: a newer stamp means a deploy
// happened since this tab loaded. Off under `lm serve` (the runtime is /js/lm.js there: no stamp).
//
// Reactor({ updateCheck: false })                 turn it off
// Reactor({ updateCheck: {
//     interval: 300000,                           ms between checks (also checks 15s after load and on tab focus)
//     firstCheckMs: 15000,                        ms before the first check (tests / very fast apps)
//     message: "A new version is available.",
//     buttonText: "Reload",
//     url: "/",                                   page whose HTML carries the current stamp
//     onUpdate: function (info) { ... }           replaces the built-in bar: info = { current, latest, reload() }
// } })
// Globals: LM_BUILD (this page's stamp, 0 in dev), LM_VERSION ("YYYY.MM.DD.HHMM" UTC, "dev"), lmBuildStamp(),
// lmCheckForUpdate().
//
// 2026-11-07 (2.8.1): 2.8.0 loads the runtime from the CDN *before* <script src="/js/app.<stamp>.js"> is parsed, so
// document.currentScript is lm.js and no app script is in the DOM yet. Reading the stamp once at load therefore gave
// LM_BUILD = 0 on every built site, and the old scheduler's `if (!LM_BUILD) return` switched the check off for good —
// "new version available" never appeared anywhere. The stamp is now read lazily (cached once found, LM_BUILD/LM_VERSION
// set on that first successful read) and the scheduler starts on DOMContentLoaded/load regardless of what is known then,
// retrying a few ticks while the app script is still missing and stopping quietly on dev pages (`lm serve`, no stamp).
var LM_BUILD = 0;
var LM_VERSION = 'dev';
var _lmBuildCache = 0;

function _lmVersionOf(build) {
    var d = new Date(build);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '.' + p(d.getUTCMonth() + 1) + '.' + p(d.getUTCDate()) + '.' + p(d.getUTCHours()) + p(d.getUTCMinutes());
}

/** This page's build stamp, read from its own /js/app.<stamp>.js; 0 until that script tag exists (then cached). */
function lmBuildStamp() {
    if (_lmBuildCache) return _lmBuildCache;
    try {
        var m = /\/js\/app\.(\d+)\.js/.exec(
            (document.currentScript && document.currentScript.src) ||
            (function () {
                var s = document.querySelectorAll('script[src*="/js/app."]');
                return s.length ? s[s.length - 1].src : '';
            })()
        );
        _lmBuildCache = (m && parseInt(m[1], 10)) || 0;
    } catch (e) { _lmBuildCache = 0; }
    if (_lmBuildCache) {
        LM_BUILD = _lmBuildCache;
        LM_VERSION = _lmVersionOf(_lmBuildCache);
    }
    return _lmBuildCache;
}

var _lmUpdateShown = false;

function _lmUpdateOpts() {
    var o = (typeof appSettings !== 'undefined' && appSettings) ? appSettings.updateCheck : undefined;
    if (o === false) return null;
    return (o && typeof o === 'object') ? o : {};
}

function _lmShowUpdateBar(opts, latest) {
    if (_lmUpdateShown) return;
    _lmUpdateShown = true;
    // A plain location.reload() can bring the old page back: the browser revalidates index.html and a server whose
    // ETag/Last-Modified didn't change (e.g. files unpacked with a fixed 1970 mtime and the same size) answers 304,
    // so the cached page with the old app.<stamp>.js loads again and this bar reappears (only Ctrl+Shift+R helped).
    // Fetch the page with cache:'reload' first: it always goes to the network and overwrites the cached copy, then
    // reload. Capped at 4 s so a slow network still reloads.
    var reload = function () {
        var done = false;
        var go = function () { if (!done) { done = true; location.reload(); } };
        setTimeout(go, 4000);
        try {
            fetch(location.href, { cache: 'reload', credentials: 'same-origin' }).then(go, go);
        } catch (e) { go(); }
    };
    if (typeof opts.onUpdate === 'function') {
        try { opts.onUpdate({ current: lmBuildStamp(), latest: latest, reload: reload }); } catch (e) { cl(e); }
        return;
    }
    if (!document.getElementById('lm-update-style')) {
        var st = document.createElement('style');
        st.id = 'lm-update-style';
        st.textContent =
            '.lm-update-bar{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:100001;display:flex;' +
            'align-items:center;gap:14px;max-width:calc(100vw - 32px);padding:10px 12px 10px 18px;' +
            'background:var(--color-card-background,#1c1c1e);border:1px solid var(--color-border--dark,#333);border-radius:12px;' +
            'box-shadow:0 16px 40px -10px rgba(0,0,0,.55);color:var(--color-text,#e8e8e8);font-size:13px;font-family:inherit}' +
            '.lm-update-go{background:#e5484d;color:#fff;border:0;border-radius:8px;padding:6px 14px;font-weight:700;cursor:pointer;font-size:13px}' +
            '.lm-update-x{background:none;border:0;color:#8a8a8a;font-size:18px;line-height:1;cursor:pointer;padding:2px 4px}' +
            '.lm-update-x:hover{color:var(--color-text,#e8e8e8)}';
        document.head.appendChild(st);
    }
    var bar = document.createElement('div');
    bar.className = 'lm-update-bar';
    bar.setAttribute('role', 'status');
    var msg = document.createElement('span');
    msg.textContent = opts.message || 'A new version is available.';
    var go = document.createElement('button');
    go.type = 'button';
    go.className = 'lm-update-go';
    go.textContent = opts.buttonText || 'Reload';
    go.onclick = reload;
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'lm-update-x';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '×';
    x.onclick = function () { if (bar.parentNode) bar.parentNode.removeChild(bar); };
    bar.appendChild(msg); bar.appendChild(go); bar.appendChild(x);
    document.body.appendChild(bar);
}

// What a deploy can change in index.html besides the app.<stamp>: the page's own scripts/styles (a side file
// deployed as `core.js?v=6` instead of `?v=5`) and an optional <meta name="lm-build" content="…"> a deploy may bump
// when it ships files the HTML doesn't name (2.6.2: the console's side-file deploys never showed the bar).
function _lmAssetSig(html) {
    var out = [];
    var re = /<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi, m;
    while ((m = re.exec(html || ''))) {
        var u = m[1];
        if (/^(?:https?:)?\/\//i.test(u) || /^(?:data|blob|mailto):/i.test(u)) continue;   // other sites: not ours to track
        if (/\.(?:js|mjs|css)(?:[?#]|$)/i.test(u)) out.push(u);
    }
    var b = /<meta\b[^>]*name\s*=\s*["']lm-build["'][^>]*content\s*=\s*["']([^"']*)["']/i.exec(html || '')
        || /<meta\b[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']lm-build["']/i.exec(html || '');
    if (b) out.push('lm-build=' + b[1]);
    return out.sort().join('|');
}
var _lmBaseSig = null;   // the signature of the HTML this tab was built from (first check that saw the same stamp)

function lmCheckForUpdate() {
    var build = lmBuildStamp();
    var opts = _lmUpdateOpts();
    if (!opts || !build || _lmUpdateShown || typeof fetch !== 'function') return Promise.resolve(false);
    var url = opts.url || '/';
    return fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + '_v=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (html) {
            if (!html) return false;
            var m = /\/js\/app\.(\d+)\.js/.exec(html);
            var latest = m ? parseInt(m[1], 10) : 0;
            if (latest > build) { _lmShowUpdateBar(opts, latest); return true; }
            var sig = _lmAssetSig(html);
            // Baseline = the first fetch with this tab's stamp (not the live DOM: the runtime adds tags to it).
            // Only a side deploy inside the first ~15 s after load goes unnoticed.
            if (_lmBaseSig === null) _lmBaseSig = sig;
            if (latest === build && sig !== _lmBaseSig) { _lmShowUpdateBar(opts, latest); return true; }
            return false;
        })
        .catch(function () { return false; });
}

(function () {
    function start() {
        // The app script tag is in the DOM by now even in the 2.8.0 CDN order, so read the stamp once here: LM_BUILD /
        // LM_VERSION are correct as early as they can be, and the tick below only re-reads when that was still too early.
        lmBuildStamp();
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') lmCheckForUpdate();
        });
        var opts = _lmUpdateOpts();
        if (!opts) return;   // updateCheck: false
        var first = opts.firstCheckMs > 0 ? opts.firstCheckMs : 15000;
        var tries = 0;
        function tick() {
            var o = _lmUpdateOpts();
            if (!o) return;
            if (!lmBuildStamp()) {
                // The CDN runtime runs before the app script tag exists; retry a little, then stop quietly (lm serve).
                tries += 1;
                if (tries < 20) setTimeout(tick, first);
                return;
            }
            lmCheckForUpdate();
            var every = o.interval > 0 ? o.interval : 5 * 60 * 1000;
            setInterval(lmCheckForUpdate, every);
        }
        setTimeout(tick, first);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
