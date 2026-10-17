const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const shimSrc = fs.readFileSync(path.join(__dirname, '../src/dom-shim.js'), 'utf8');

function freshDOM() {
    const dom = new JSDOM(`<!doctype html><body>
        <div id="root" class="a b" data-foo="bar" up upid="1">
            <span class="child">hi</span>
        </div>
        <input id="pw" password type="text" />
        <button id="btn" tgl>go</button>
        <script>${shimSrc}</script>
    </body>`, { url: 'https://example.test/', runScripts: 'dangerously' });
    return dom.window;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- selection, [0], length ----
{
    const { $ } = freshDOM();
    const el = $('#root');
    check('select by id, length', el.length === 1, 'length=' + el.length);
    check('el[0] is raw DOM node', el[0] && el[0].nodeType === 1);
    check('el[0].tagName', el[0].tagName === 'DIV');
}

// ---- attr / removeAttr / hasAttr ----
{
    const { $ } = freshDOM();
    const el = $('#root');
    check('attr get', el.attr('data-foo') === 'bar');
    el.attr('data-foo', 'baz');
    check('attr set', el.attr('data-foo') === 'baz');
    check('hasAttr true', el.hasAttr('up') === true);
    check('hasAttr false', el.hasAttr('nope') === false);
    el.removeAttr('data-foo');
    check('removeAttr', el.attr('data-foo') === null);
}

// ---- classes ----
{
    const { $ } = freshDOM();
    const el = $('#root');
    check('hasClass true', el.hasClass('a') === true);
    el.addClass('c d');
    check('addClass multi', el[0].className.includes('c') && el[0].className.includes('d'));
    el.removeClass('a b');
    check('removeClass multi', !el[0].className.includes('a') && !el[0].className.includes('b'));
}

// ---- val / html / css ----
{
    const { $ } = freshDOM();
    const input = $('#pw');
    input.val('secret');
    check('val get/set', input.val() === 'secret');

    const el = $('#root');
    el.html('<b>x</b>');
    check('html set', el[0].innerHTML === '<b>x</b>');

    el.css('color', 'red');
    check('css set', el[0].style.color === 'red');
    el.css({ fontSize: '12px', display: 'block' });
    check('css set object', el[0].style.fontSize === '12px' && el[0].style.display === 'block');
}

// ---- data (JSON-parse convention) ----
{
    const { $ } = freshDOM();
    const el = $('#root');
    el.attr('data-count', '42');
    check('data auto-parses numeric-looking string', el.data('count') === 42, 'got ' + JSON.stringify(el.data('count')));
}

// ---- DOM mutation: append/prepend/after/remove ----
{
    const { $ } = freshDOM();
    const el = $('#root');
    el.append('<i class="added-after"></i>');
    check('append html string', el[0].querySelector('.added-after') !== null);
    el.prepend('<i class="added-before"></i>');
    check('prepend html string', el[0].firstElementChild.className === 'added-before');
    const child = $('.child');
    child.remove();
    check('remove', el[0].querySelector('.child') === null);
}

// ---- parent / next / closest ----
{
    const { $ } = freshDOM();
    const child = $('.child');
    check('parent', child.parent()[0].id === 'root');
    check('closest', child.closest('#root')[0].id === 'root');
}

// ---- offset (2026-09-21, real bug found in a real V1 scroll-spy) ----
{
    const { $ } = freshDOM();
    const result = $('.child').offset();
    // jsdom has no real layout engine (see this method's own comment) —
    // real pixel values aren't meaningful here, only that the method
    // exists, doesn't throw, and returns the real jQuery shape.
    check('offset exists and returns an object with numeric top/left', result && typeof result.top === 'number' && typeof result.left === 'number', JSON.stringify(result));
    check('offset on an empty selection returns null instead of throwing', $('.nope-does-not-exist').offset() === null);
}

// ---- events: .on with delegation ----
{
    const { $, document } = freshDOM();
    let clicked = null;
    $(document.body).on('click', '#btn', function (e) { clicked = this.id; });
    const btn = document.getElementById('btn');
    btn.dispatchEvent(new (freshDOM().Event || Event)('click', { bubbles: true }));
    // re-dispatch on the SAME window's real Event constructor:
}
{
    const win = freshDOM();
    const { $, document, Event } = win;
    let clickedId = null;
    $(document.body).on('click', '#btn', function () { clickedId = this.id; });
    document.getElementById('btn').dispatchEvent(new Event('click', { bubbles: true }));
    check('delegated .on(event, selector, handler) fires with correct `this`', clickedId === 'btn', 'got ' + clickedId);
}

// ---- .live() — the framework's own code uses $("body").on(...), but
// real V1 project code still calls .live() ----
{
    const { $ } = freshDOM();
    // Reversed 2026-09-25: real V1 project code (57 files across BEACDN)
    // still calls .live(); covered in dom-shim-v1compat.test.js.
    check('.live() exists for V1 project code', typeof $.fn.live === 'function');
}

// ---- focus/blur delegation — these don't bubble natively, must map to
// focusin/focusout for $("body").on("focus", selector, handler) to work ----
{
    const win = freshDOM();
    const { $, document, Event } = win;
    let focusedId = null;
    $(document.body).on('focus', '#pw', function () { focusedId = this.id; });
    document.getElementById('pw').dispatchEvent(new Event('focusin', { bubbles: true }));
    check('delegated "focus" actually listens via focusin', focusedId === 'pw', 'got ' + focusedId);
}

// ---- toggleClass ----
{
    const { $ } = freshDOM();
    const el = $('#root');
    el.toggleClass('toggled');
    check('toggleClass adds when absent', el.hasClass('toggled') === true);
    el.toggleClass('toggled');
    check('toggleClass removes when present', el.hasClass('toggled') === false);
    el.toggleClass('forced', true);
    check('toggleClass respects force=true', el.hasClass('forced') === true);
}

// ---- .trigger() ----
{
    const win = freshDOM();
    const { $, document, Event } = win;
    let seen = false;
    document.getElementById('btn').addEventListener('click', () => { seen = true; });
    $('#btn').trigger('click');
    check('.trigger() dispatches a real event', seen === true);
}

// ---- $.fn.extend (used by lstnrs.js to add hasAttr/upload methods) ----
{
    const { $ } = freshDOM();
    $.fn.extend({ shout: function () { return this[0].id.toUpperCase(); } });
    check('$.fn.extend adds a usable instance method', $('#root').shout() === 'ROOT');
}

// ---- $.trim / $.inArray / $.each ----
{
    const { $ } = freshDOM();
    check('$.trim', $.trim('  hi  ') === 'hi');
    check('$.inArray found', $.inArray(2, [1, 2, 3]) === 1);
    check('$.inArray not found', $.inArray(9, [1, 2, 3]) === -1);
    let sum = 0;
    $.each([1, 2, 3], function (i, v) { sum += v; });
    check('$.each', sum === 6);
}

// ---- .trigger() with an already-constructed Event object ----
// 2026-09-14: the vendored WebWorker helper builds `$.Event(name)`, assigns
// custom properties onto the resulting real Event, then triggers with that
// OBJECT rather than a name string. The old .trigger() unconditionally did
// `new Event(type, ...)`, silently coercing the object to a garbage type
// string ("[object Event]") that no listener ever matched — no error, just
// nothing happening. This is what blocked _csswrk (the scoped-CSS worker
// that gates all view rendering) from ever starting, found only by testing
// a real project end-to-end.
{
    const win = freshDOM();
    const { $ } = win;
    let seen = null;
    const target = {};
    $(target).on('custom-thing', function (e) { seen = e.extra; });
    const ev = $.Event('custom-thing');
    ev.extra = 'payload';
    $(target).trigger(ev);
    check('.trigger(eventObject) dispatches with the real type, not a coerced one', seen === 'payload', 'seen=' + JSON.stringify(seen));
}

// ---- .append()/.html() with a real Node array (what _re.js's _RealDOM is) ----
{
    const { $, document } = freshDOM();
    const a = document.createElement('span'); a.textContent = 'a';
    const b = document.createElement('span'); b.textContent = 'b';
    $('#root').append([a, b]);
    check('append() accepts an array of Nodes (_re.js spreads _RealDOM into this)', $('#root')[0].textContent.indexOf('ab') > -1, 'html=' + $('#root')[0].innerHTML);
}
{
    const { $, document } = freshDOM();
    const a = document.createElement('span'); a.textContent = 'x';
    $('#root').html([a]);
    check('html() with a Node array inserts real nodes, not "[object HTMLSpanElement]" text', $('#root')[0].textContent === 'x', 'text=' + $('#root')[0].textContent);
}
{
    // el.append(..._re._RealDOM) becomes el.append() when _RealDOM is empty
    // — must not throw (real jQuery no-ops on empty content).
    const { $ } = freshDOM();
    let threw = false;
    try { $('#root').append(); } catch (e) { threw = true; }
    check('append() with zero arguments does not throw', threw === false);
}

// ---- jQuery event shorthands (2026-09-14: none of these existed at all) ----
{
    const { $ } = freshDOM();
    let clicked = false;
    $('#btn').keyup(function () { clicked = true; });
    $('#btn').keyup();
    check('.keyup(handler) binds, .keyup() triggers', clicked === true);
}

// ---- .animate()/.stop() (2026-09-18: neither existed — st(), a real
// framework helper in vendor/reconnecting-websocket.js used across most
// real V1 pages, does $("html,body").stop().animate({scrollTop:x},...)
// and threw "not a function", aborting the rest of that page's script) ----
{
    const { $, document } = freshDOM();
    let completed = false;
    // duration: 0 exercises the synchronous path (no requestAnimationFrame
    // needed, which jsdom doesn't implement) — the real rAF-driven path is
    // covered by testing against a real V1 project in real Chrome, not
    // duplicated here.
    $('#root').animate({ opacity: 0.5 }, { duration: 0, complete: function () { completed = true; } });
    check('.animate() with duration:0 applies synchronously and calls complete()', completed === true && document.getElementById('root').style.opacity === '0.5', 'opacity=' + document.getElementById('root').style.opacity);
}
{
    const { $ } = freshDOM();
    let threw = false;
    try {
        $('#root').stop().animate({ scrollTop: 100 }, { duration: 0 });
    } catch (e) { threw = true; }
    check('.stop() is chainable and callable before .animate() (the real st() pattern)', threw === false);
}

// ---- $.map, .serializeArray(), .ajaxForm() (2026-09-22: real, severe bug
// — every plain <form>/o-sub/b-sub form submission on the DEFAULT runtime
// depended on real jQuery.form's ajaxForm()/serializeArray(), neither of
// which this shim ever provided, and getFormData()'s own $.map() call was
// ALSO missing — found chasing a real "form data not sent" user report) ----
{
    const { $, document, Event } = freshDOM();
    document.body.insertAdjacentHTML('beforeend', `
        <form id="f1">
            <input type="text" name="username" value="abdul">
            <input type="checkbox" name="agree" checked>
            <input type="checkbox" name="skip">
            <input type="submit" value="go">
        </form>
    `);
    const data = $('#f1').serializeArray();
    check('.serializeArray() includes a named text input', data.some(d => d.name === 'username' && d.value === 'abdul'), JSON.stringify(data));
    check('.serializeArray() includes a checked checkbox', data.some(d => d.name === 'agree'), JSON.stringify(data));
    check('.serializeArray() excludes an unchecked checkbox', !data.some(d => d.name === 'skip'), JSON.stringify(data));
    check('.serializeArray() excludes the submit button', !data.some(d => d.value === 'go'), JSON.stringify(data));

    let capturedFormData = null;
    $('#f1').ajaxForm({
        beforeSubmit: function (formData, f, options) {
            capturedFormData = formData;
            return false;
        }
    });
    const submitEvent = new Event('submit', { cancelable: true });
    document.getElementById('f1').dispatchEvent(submitEvent);
    check('.ajaxForm() calls beforeSubmit with real serialized form data', capturedFormData && capturedFormData.some(d => d.name === 'username'), JSON.stringify(capturedFormData));
    check('.ajaxForm() prevents the real native form submission', submitEvent.defaultPrevented === true);
}
{
    const { $ } = freshDOM();
    const mapped = $.map([1, 2, 3], function (n) { return n * 2; });
    check('$.map doubles a plain array', JSON.stringify(mapped) === '[2,4,6]', JSON.stringify(mapped));
    const filtered = $.map([1, 2, 3], function (n) { return n === 2 ? undefined : n; });
    check('$.map drops undefined callback results (real jQuery semantics)', JSON.stringify(filtered) === '[1,3]', JSON.stringify(filtered));
}

// ---- .innerHeight()/.innerWidth()/.scrollLeft()/.scrollTop() (2026-09-22,
// found alongside the globalWatch() fix — applyTriggers()'s real
// @scroll-left/@scroll-right/@scroll-top/@scroll-bottom edge detection
// calls all four, genuinely missing) ----
{
    const { $ } = freshDOM();
    check('.innerHeight() does not throw and returns a number', typeof $('#root').innerHeight() === 'number');
    check('.innerWidth() does not throw and returns a number', typeof $('#root').innerWidth() === 'number');
    check('.scrollTop() getter does not throw', typeof $('#root').scrollTop() === 'number');
    check('.scrollLeft() getter does not throw', typeof $('#root').scrollLeft() === 'number');
    let threw = false;
    try { $('#root').scrollTop(10).scrollLeft(5); } catch (e) { threw = true; }
    check('.scrollTop()/.scrollLeft() setters are chainable and do not throw', threw === false);
}

// ---- $("[\@a],[\@b],...") comma-separated @-attribute selector
// (2026-09-22: applyTriggers()'s real @scroll/@scroll-start/@scroll-end/
// etc. binding used exactly this selector shape — native querySelectorAll
// can never see an `@`-prefixed name at all, since it's redirected to
// el.events[name], not the real attribute store, so this selector matched
// NOTHING and no scroll listener was ever actually attached) ----
{
    const { $, document } = freshDOM();
    document.body.insertAdjacentHTML('beforeend', '<div id="sc1"></div><div id="sc2"></div><div id="sc3"></div>');
    // This unit test loads dom-shim.js alone, not vendor/reconnecting-
    // websocket.js's real @-prefixed setAttribute monkey-patch — so
    // .events is set directly here, matching what that patch would have
    // produced, rather than calling the real (unpatched, here) setAttribute.
    document.getElementById('sc1').events = { '@scroll': 'foo' };
    document.getElementById('sc2').events = { '@scroll-start': 'bar' };
    document.getElementById('sc1').getAttribute = function (n) { return n === '@scroll' ? 'foo' : null; };
    document.getElementById('sc2').getAttribute = function (n) { return n === '@scroll-start' ? 'bar' : null; };
    // sc3 has neither — must not match
    const matched = $('[\\@scroll],[\\@scroll-start]');
    check('comma-separated @-attr selector finds every real match', matched.length === 2, 'length=' + matched.length);
    const ids = matched.get().map(el => el.id).sort();
    check('comma-separated @-attr selector finds the right elements', JSON.stringify(ids) === '["sc1","sc2"]', JSON.stringify(ids));
}

// ---- $.each on a real NamedNodeMap (2026-09-22, real bug found and
// fixed testing the real modal-open flow: `.length` is enumerable via
// for...in on a real NamedNodeMap in real Chrome, so $.each's old
// fallback ran the callback one extra time with `this` bound to the raw
// number 4 (the length value itself), breaking the real modal click
// handler's `this.value.toLowerCase()`) ----
{
    const { $, document } = freshDOM();
    document.body.insertAdjacentHTML('beforeend', '<div id="nn" data-x="1" data-y="2" data-z="3"></div>');
    const calls = [];
    $.each(document.getElementById('nn').attributes, function () { calls.push({ name: this.name, value: this.value }); });
    check('$.each over a real NamedNodeMap visits exactly its real attributes, not .length', calls.length === 4, JSON.stringify(calls));
    check('$.each over a real NamedNodeMap never calls back with a bare number (the real bug)', calls.every(c => typeof c.name === 'string' && typeof c.value === 'string'), JSON.stringify(calls));
}

// ---- .delay()/.queue() (2026-09-22, real bug found and fixed: never
// implemented at all — the real modal open/close code depends on this
// exact `.delay(ms).queue(function(next){...;next();})` idiom, 3 real
// call sites, all the same shape) — async, so the summary print/exit
// below waits for it via the wrapping IIFE ----
async function runDelayQueueTest() {
    const { $ } = freshDOM();
    let order = [];
    await new Promise(resolve => {
        $('#root')
            .delay(5)
            .queue(function (next) {
                order.push('first');
                next();
            })
            .queue(function (next) {
                order.push('second');
                resolve();
                next();
            });
    });
    check('.delay().queue() runs queued functions in order, each waiting for next()', JSON.stringify(order) === '["first","second"]', JSON.stringify(order));
}

// ---- dom-shim.js must not clobber a real jQuery that already claimed
// window.jQuery/$ before it loads (2026-09-22, real bug found and
// fixed) — this repo's own default project scaffold AND a real migrated
// V1 project both put the core runtime's own <script> tag at the BOTTOM
// of <body>, while the selective-plugin-bundling mechanism's own
// <script> tag gets inserted into <head> — meaning the core runtime
// (and this shim inside it) almost always loads LAST in practice. The
// selective plugins bundle unconditionally sets window.jQuery = window.
// $ = <the real jQuery>, deliberately (so it always wins over a shim
// that loaded BEFORE it) — but this shim used to ALSO assign
// unconditionally, so loading second (the common case) silently
// downgraded a real, already-loaded jQuery UI back to the lightweight
// shim, with no error anywhere. Confirmed live: a real project with
// jquery-ui-dist selected still threw "t2.draggable is not a function"
// until this was fixed.
{
    const dom = new JSDOM(`<!doctype html><body>
        <script>
            function FakeRealJQuery(s) { return { fake: true }; }
            FakeRealJQuery.fn = { jquery: '3.7.1', draggable: function () { return this; } };
            window.jQuery = window.$ = FakeRealJQuery;
        </script>
        <script>${shimSrc}</script>
    </body>`, { url: 'https://example.test/', runScripts: 'dangerously' });
    const win = dom.window;
    check('a real jQuery that loaded BEFORE this shim is not overwritten', win.jQuery.fn && win.jQuery.fn.jquery === '3.7.1', win.jQuery.fn && win.jQuery.fn.jquery);
    check('the real jQuery\'s own methods (e.g. .draggable) survive', typeof win.$.fn.draggable === 'function');
}
{
    // The normal case (no real jQuery ever loads) must be unaffected —
    // the shim still installs itself correctly.
    const { $ } = freshDOM();
    check('with no real jQuery ever present, the shim installs itself as usual', $.fn.jquery === 'lumenjs-shim', $.fn.jquery);
}

// ---- delegated mouseenter/mouseleave (2026-09-22, real bug found and
// fixed: mouseenter/mouseleave are real DOM events but never bubble at
// all, so a body-delegated listener structurally can never see one
// fired on a descendant without translating through mouseover/mouseout
// + relatedTarget, exactly like real jQuery does internally) ----
{
    const { $, document } = freshDOM();
    document.body.insertAdjacentHTML('beforeend', '<div id="outer"><div id="inner"><span id="innermost">x</span></div></div>');
    const enters = [], leaves = [];
    $('body').on('mouseenter', '#inner', function () { enters.push('inner'); });
    $('body').on('mouseleave', '#inner', function () { leaves.push('inner'); });

    const outer = document.getElementById('outer');
    const inner = document.getElementById('inner');
    const innermost = document.getElementById('innermost');

    // A real mouseenter/mouseleave delegated via body only listens for
    // the bubbling mouseover/mouseout equivalents — dispatch those
    // directly here (jsdom has no real pointer hardware to simulate).
    function moveInto(target, from) {
        const ev = new document.defaultView.Event('mouseover', { bubbles: true });
        ev.relatedTarget = from;
        target.dispatchEvent(ev);
    }
    function moveOutOf(target, to) {
        const ev = new document.defaultView.Event('mouseout', { bubbles: true });
        ev.relatedTarget = to;
        target.dispatchEvent(ev);
    }

    moveInto(inner, outer);
    check('moving from outside into the delegated target fires mouseenter once', enters.length === 1, JSON.stringify(enters));

    moveInto(innermost, inner);
    check('moving between the target\'s own children does NOT re-fire mouseenter (real boundary-crossing semantics, not just bubbling)', enters.length === 1, JSON.stringify(enters));

    moveOutOf(innermost, inner);
    check('moving between the target\'s own children does NOT fire mouseleave either', leaves.length === 0, JSON.stringify(leaves));

    moveOutOf(inner, outer);
    check('moving genuinely outside the delegated target fires mouseleave once', leaves.length === 1, JSON.stringify(leaves));
}

runDelayQueueTest().then(() => {
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail === 0 ? 0 : 1);
});
