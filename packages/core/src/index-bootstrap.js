// index.js bootstrap (2026-09-14). index.js no longer has a <script> tag
// in index.html (see packages/cli's scaffold + dev-server middleware); its
// top-level vars are compiled server-side into _vt.Global.vars (walk.js /
// _re.js), and this is what actually fetches and runs that compiled code
// in dev.
//
// Placement (see build/bundle.js): concatenated right after the WHOLE
// vendor/reconnecting-websocket.js file, which is where `Reactor` comes
// from (index.js's compiled code calls it as its last line) — but also
// where real index.js scripts commonly reference other framework globals
// defined much later in that same file (`cookies`, `session`, ...), so
// running only after `Reactor` specifically isn't enough (tried that
// first, 2026-09-14 — see git history). That vendor file's own
// $(document).ready(...) handler, which needs Reactor() to have already
// run (it reads appSettings.Base), is guarded to retry instead of
// assuming this file has already run by the time it fires — see
// `_lumenReadyHandler` in that file's own comment for why that guarantee
// doesn't actually hold (jQuery's ready() can fire synchronously, at
// registration time, before this file gets a chance to run).
//
// Uses console.log directly, not `cl` — this runs after _re.js's own
// `var cl = console.log;`, so `cl` would work too, but there's no reason
// to depend on that when a bare console.log is just as simple.
// A build without Roxyon BaaS keys has no _beaTn but sets _lmStatic (2.5.9): it is production too.
if ((typeof _beaTn === 'undefined' || !_beaTn) && typeof _lmStatic === 'undefined') {
    if (typeof XMLHttpRequest === 'function') {
        try {
            var _idxXhr = new XMLHttpRequest();
            _idxXhr.open('GET', '/index.js', false); // synchronous — see comment above
            _idxXhr.send(null);
            if (_idxXhr.status >= 200 && _idxXhr.status < 300) {
                // Indirect eval (the comma-expression form), not `new
                // Function`: a `function` executes in its OWN fresh scope,
                // so a top-level `function greet(){}` inside it would
                // become a local variable of that wrapper, not a real
                // global — breaking the documented V1 pattern of calling
                // index.js-declared functions straight from view markup
                // (e.g. `onclick="greet()"`, resolved against window).
                // Indirect eval runs in true global scope instead.
                (0, eval)(_idxXhr.responseText);
            } else {
                console.log('Failed to load index.js: HTTP ' + _idxXhr.status);
            }
        } catch (e) {
            // 2026-09-17: was console.log — a real exception partway through
            // index.js (e.g. the _vt.Global.fns crash this session found and
            // fixed) silently looked like nothing happened at all in dev
            // mode, while the same bug was fatal in a real production
            // build (index.js runs inline there, unguarded). A real error
            // here should be as visible as reportLumenError()'s.
            console.error('Failed to load index.js: ', e);
        }
    }
}
