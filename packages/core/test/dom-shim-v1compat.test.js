// The jQuery surface real V1 project code uses that the shim previously
// lacked — scoped by scanning every .view/.tpl/index.js across BEACDN
// (2,615 files): .eq/.show/.prev/.hide/.children/.first/.off/.siblings/
// .position/.empty/.last/.index/.add/.toggle/.fade*/.slide*/.wrap/.unwrap/
// .contents/.removeData/.die/.live/.bind/.one, the jQuery-only selector
// extensions (:last 522 uses, :first, :eq(n), :selected, :checkbox),
// namespaced events, trigger() extra-args, $(fn), and object-valued .data().
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const shimSrc = fs.readFileSync(path.join(__dirname, '../src/dom-shim.js'), 'utf8');

function freshDOM() {
    return new JSDOM(`<!doctype html><body>
        <ul id="list"><li class="i">a</li><li class="i">b</li><li class="i" id="c">c</li><li class="i">d</li></ul>
        <div id="box" style="display:block">box</div>
        <select id="sel"><option value="1">1</option><option value="2" selected>2</option></select>
        <input id="cb" type="checkbox" checked>
        <form id="f"><button type="submit" id="sb">go</button><button id="plain">x</button></form>
        <script>${shimSrc}</script>
    </body>`, { url: 'https://example.test/', runScripts: 'dangerously' }).window;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
const txt = ($set) => [].slice.call($set).map(e => e.textContent).join(',');

{
    const { $ } = freshDOM();
    check('$("li:last")', txt($('#list li:last')) === 'd', txt($('#list li:last')));
    check('$("li:first")', txt($('#list li:first')) === 'a');
    check('$("li:eq(1)")', txt($('#list li:eq(1)')) === 'b');
    check('$("li:gt(1)")', txt($('#list li:gt(1)')) === 'c,d');
    check('$("li:lt(2)")', txt($('#list li:lt(2)')) === 'a,b');
    check('positional then descendant: "#list:first li:last"', txt($('#list:first li:last')) === 'd');
    check('comma list with positional parts', txt($('#list li:first, #list li:last')) === 'a,d');
    check('"option:selected"', $('#sel option:selected').length === 1 && $('#sel option:selected')[0].value === '2');
    check('"input:checkbox:checked"', $('input:checkbox:checked').length === 1);
    check('.find() supports positional pseudos', txt($('#list').find('li:last')) === 'd');
    check('.is(":selected")/.is(":visible") do not throw', $('#sel option').eq(1).is(':selected') === true);
}

{
    const { $ } = freshDOM();
    const li = $('#list li');
    check('.eq(2)', txt(li.eq(2)) === 'c');
    check('.eq(-1)', txt(li.eq(-1)) === 'd');
    check('.first()/.last()', txt(li.first()) === 'a' && txt(li.last()) === 'd');
    check('.index()', $('#c').index() === 2);
    check('.prev()', txt($('#c').prev()) === 'b');
    check('.siblings()', txt($('#c').siblings()) === 'a,b,d');
    check('.children()', $('#list').children().length === 4);
    check('.children(sel)', $('#list').children('#c').length === 1);
    check('.add()', $('#c').add('#box').length === 2);
    check('.filter(sel)', li.filter('#c').length === 1);
    check('.parents()', $('#c').parents('ul').length === 1);
}

{
    const { $ } = freshDOM();
    const box = $('#box');
    box.hide();
    check('.hide()', box[0].style.display === 'none');
    box.show();
    check('.show() restores the previous display', box[0].style.display === 'block', box[0].style.display);
    box.toggle();
    check('.toggle() hides a visible element', box[0].style.display === 'none');
    box.toggle(true);
    check('.toggle(true) shows', box[0].style.display !== 'none');
    check('.fadeOut/.slideUp/.slideToggle exist', typeof box.fadeOut === 'function' && typeof box.slideUp === 'function' && typeof box.slideToggle === 'function');
    $('#list').empty();
    check('.empty()', $('#list').children().length === 0);
}

{
    const w = freshDOM(); const { $ } = w;
    $('#box').wrap('<section class="wrapper"></section>');
    check('.wrap()', w.document.querySelector('section.wrapper > #box') !== null);
    $('#box').unwrap();
    check('.unwrap()', w.document.querySelector('section.wrapper') === null && w.document.getElementById('box') !== null);
}

{
    const { $, document } = freshDOM();
    let calls = 0;
    const h = () => calls++;
    $('#box').on('click.ns', h);
    document.getElementById('box').click();
    check('namespaced .on("click.ns") fires on a real click', calls === 1);
    $('#box').off('click.ns');
    document.getElementById('box').click();
    check('.off("click.ns") really removes it', calls === 1, 'calls=' + calls);
    $('#box').on('click', h).off('click').on('click', h);
    document.getElementById('box').click();
    check('.off("click").on("click", fn) does not stack duplicates', calls === 2, 'calls=' + calls);
    let once = 0;
    $('#box').one('click', () => once++);
    document.getElementById('box').click(); document.getElementById('box').click();
    check('.one() fires exactly once', once === 1, 'once=' + once);
    let bound = 0;
    $('#box').bind('mouseup', () => bound++);
    document.getElementById('box').dispatchEvent(new document.defaultView.MouseEvent('mouseup'));
    check('.bind()', bound === 1);
}

{
    const { $, document } = freshDOM();
    let got = null;
    $('body').on('custom-evt', '#box', function (ev, a, b) { got = [a, b]; });
    $('#box').trigger('custom-evt', [{ x: 1 }, 'two']);
    check('.trigger(name, [a, b]) spreads extra params into the handler', got && got[0].x === 1 && got[1] === 'two', JSON.stringify(got));
    let clickArgs = null;
    $('#box').on('click', function () { clickArgs = arguments.length; });
    document.getElementById('box').click();
    check('native events pass only the event (no stray detail arg)', clickArgs === 1, 'args=' + clickArgs);
}

{
    const { $, document } = freshDOM();
    let n = 0;
    $('.i').live('click', () => n++);
    const li = document.createElement('li'); li.className = 'i'; document.getElementById('list').appendChild(li);
    li.click();
    check('.live() delegates to elements added later', n === 1, 'n=' + n);
    $('.i').die('click');
    li.click();
    check('.die() removes the .live() binding', n === 1, 'n=' + n);
}

{
    const { $ } = freshDOM();
    const obj = { self: null, n: 5 }; obj.self = obj;
    $('#box').data('engine', obj);
    check('.data(key, object) keeps object identity (cyclic ok)', $('#box').data('engine') === obj);
    $('#box').data('count', 3);
    check('.data(key, primitive) still mirrors to data-* attribute', $('#box').attr('data-count') === '3' && $('#box').data('count') === 3);
    $('#box').removeData('engine');
    check('.removeData()', $('#box').data('engine') === undefined);
}

{
    // The production API path (ws.js) posts nested object data; V1 sent it
    // via real jQuery, form-encoded. The shim must produce the same bytes.
    const { $ } = freshDOM();
    const jq = fs.readFileSync(require.resolve('jquery/dist/jquery.min.js'), 'utf8');
    const realJq = new JSDOM(`<body><script>${jq}</script>`, { runScripts: 'dangerously' }).window.jQuery;
    const payload = { body: { method: 'GET', path: '/Sections', api: 0, headers: { 'X-A': '1' }, full: false }, uniquer: 'u1', _beaTn: 'TOK', data: { fields: 'Section,Title', limit: -1, where: { Country: 'lb', n: { in: 'a,b' } }, ids: [1, 2], flag: true, none: null } };
    check('$.param() is byte-identical to real jQuery.param() for the production payload shape', $.param(payload) === realJq.param(payload));
    check('$.get/$.post/$.getJSON/$.parseJSON exist', ['get', 'post', 'getJSON', 'parseJSON'].every(k => typeof $[k] === 'function'));
}

{
    const { $ } = freshDOM();
    $('#f').lock && $('#f').lock();
    let ran = false;
    $(function () { ran = true; });
    check('.position() returns {top,left}', typeof $('#box').position().top === 'number');
    setTimeout(function () {
        check('$(fn) runs as a ready handler (deferred to DOMContentLoaded, like jQuery)', ran === true);
        console.log('\n' + pass + ' passed, ' + fail + ' failed');
        process.exit(fail === 0 ? 0 : 1);
    }, 50);
}
