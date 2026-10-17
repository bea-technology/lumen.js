// V1's declarative click directives, auto-triggers, nav highlighting and
// utility globals, driven through the real built bundle — the dashboard
// had these as "present but never exercised". h/s and close-notify in
// particular depend on .show()/.hide()/.fadeOut(), which the shim only
// gained on 2026-09-25.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

const dom = new JSDOM(`<!doctype html><body>
    <div id="panelA">A</div><div id="panelB" style="display:none">B</div>
    <button id="hs" h="#panelA" s="#panelB">swap</button>
    <input id="inp" value="typed"><div id="box"><i>x</i></div>
    <button id="eInp" e="#inp">clear input</button>
    <button id="eBox" e="#box">clear box</button>
    <button id="ff" f="#inp">focus</button>
    <button id="tg" tgl="open">tgl</button>
    <div id="menu"></div><button id="tt" t="#menu" tcn="shown">t</button>
    <ul><li class="tab" id="tab1" actv=".tab">1</li><li class="tab active" id="tab2" actv=".tab">2</li></ul>
    <div id="target" class="old"></div>
    <button id="ar" acl="#target" aclcn="new" rcl="#target" rclcn="old">acl+rcl</button>
    <button id="guarded" tgl="on" confirm="Sure?">guarded</button>
    <div id="outer"><button id="stopper" tgl="on" stop>stop</button></div>
    <div id="auto" click></div>
    <a id="nav1" n0="home,about">Home</a><a id="nav2" n0="guide">Guide</a>
    <nav></nav><button class="navTgl" id="navbtn">menu</button>
    <form id="lk"><button type="submit" id="sub">go</button></form>
    <form id="vf">
      <label><input type="checkbox" name="a" id="ca" :required or="b"></label>
      <label><input type="checkbox" name="b" id="cb" checked></label>
      <input name="req" id="req" :required>
      <input name="mx" id="mx" :required max="3" value="abcdef">
      <input name="un" id="un" username :required value="ab">
    </form>
    <div id="ovf" style="width:10px;height:10px;overflow:hidden"><div style="width:100px;height:100px"></div></div>
    <div notify><div class="n"><span close-notify id="cn">x</span></div></div>
    <script>${bundleSrc}</script>
</body>`, {
    url: 'http://127.0.0.1:19991/about', runScripts: 'dangerously',
    beforeParse(window) {
        window.URL.createObjectURL = () => 'blob:test';
        window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
        window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
    }
});
const win = dom.window, d = win.document;
const results = [];
function check(name, cond, detail) { results.push({ name, cond: !!cond, detail }); }
const click = (id) => d.getElementById(id).dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

setTimeout(() => {
    click('hs');
    check('h=/s= hides one target and shows the other', d.getElementById('panelA').style.display === 'none' && d.getElementById('panelB').style.display !== 'none');
    click('eInp');
    check('e= clears an input\'s value', d.getElementById('inp').value === '');
    click('eBox');
    check('e= empties a non-input target', d.getElementById('box').childNodes.length === 0);
    let focused = false; d.getElementById('inp').addEventListener('focus', () => focused = true);
    click('ff');
    check('f= focuses its target', focused || d.activeElement === d.getElementById('inp'));
    click('tg');
    check('tgl= toggles a class on itself plus .toggled', d.getElementById('tg').classList.contains('open') && d.getElementById('tg').classList.contains('toggled'));
    click('tt');
    check('t= + tcn= toggles the class on the target', d.getElementById('menu').classList.contains('shown'));
    click('tab1');
    check('actv= moves .active to the clicked item', d.getElementById('tab1').classList.contains('active') && !d.getElementById('tab2').classList.contains('active'));
    click('ar');
    const t = d.getElementById('target').classList;
    check('acl=/rcl= add and remove classes on the target', t.contains('new') && !t.contains('old'), d.getElementById('target').className);
    win.confirm = () => false;
    click('guarded');
    check('confirm= blocks the directive when declined', !d.getElementById('guarded').classList.contains('on'));
    // Directives are delegated from <body> (as in V1), so `stop` keeps the
    // event from travelling past body — a listener on document never sees it.
    let reachedDoc = false; const onDoc = () => reachedDoc = true; d.addEventListener('click', onDoc);
    click('stopper');
    d.removeEventListener('click', onDoc);
    check('stop halts propagation after the directive runs', d.getElementById('stopper').classList.contains('on') && !reachedDoc);
    click('navbtn');
    check('.navTgl opens the nav (nav-opened on <nav> and <body>)', d.querySelector('nav').classList.contains('nav-opened') && d.body.classList.contains('nav-opened'));

    // applyTriggers(): [click] auto-fires once and removes itself; n0..n9
    // mark the entry matching the current URL node as .active.
    let autoClicked = 0; d.getElementById('auto').addEventListener('click', () => autoClicked++);
    win.eval(`nodes = ["about"]; appSettings = appSettings || { Base: location.origin + "/" }; applyTriggers();`);
    check('[click] auto-triggers once and drops the attribute', autoClicked === 1 && !d.getElementById('auto').hasAttribute('click'), 'clicks=' + autoClicked);

    win.eval(`$("#lk").lock();`);
    check('$.fn.lock() disables a form\'s submit button', d.getElementById('sub').disabled === true);
    win.eval(`$("#lk").unlock();`);
    check('$.fn.unlock() re-enables it', d.getElementById('sub').disabled === false);

    const g = (expr) => win.eval(expr);
    // classesOnly=true: without it V1 stops at the first invalid field and focuses it.
    win.eval(`checkFormInputs($("#vf"), null, true)`);
    check('or= : a required checkbox counts as checked when its partner is', d.getElementById('ca').classList.contains('is-valid'), d.getElementById('ca').className);
    check(':required empty text input is marked is-empty is-invalid', /is-empty/.test(d.getElementById('req').className) && /is-invalid/.test(d.getElementById('req').className), d.getElementById('req').className);
    check('max= truncates the value', d.getElementById('mx').value === 'abc', d.getElementById('mx').value);
    check('[username] shorter than 4 chars is not-4-chars', /not-4-chars/.test(d.getElementById('un').className), d.getElementById('un').className);
    check('$.fn.attr() with no args returns all attributes', (a => a.id === 'tt' && a.t === '#menu' && a.tcn === 'shown')(g('$("#tt").attr()')), JSON.stringify(g('$("#tt").attr()')));
    check('$.fn.hasKey()', g('$("#box").data("k", 1); $("#box").hasKey("k") && !$("#box").hasKey("nope")'));
    check('$.fn.isOverflown() returns a boolean', typeof g('$("#ovf").isOverflown()') === 'boolean');
    let prio = 0; win.__prio = () => prio++;
    check('$.fn.priorityOn() binds without throwing under the shim', (() => { try { g('$("#box").priorityOn("click", null, null, function(){ __prio(); })'); click('box'); return prio === 1; } catch (e) { return false; } })(), 'prio=' + prio);
    let submits = 0; d.getElementById('lk').addEventListener('submit', (e) => { e.preventDefault(); submits++; });
    d.getElementById('unlock-dummy'); g('document.getElementById("lk").submit()');
    check('form.submit() routes through a real submit event (V1 override)', submits === 1, 'submits=' + submits);
    check('getScrollBarWidth() ran at load (_scW is a number)', typeof g('_scW') === 'number');
    check('_loader.show()/hide() add and remove the [loader] overlay', (() => { g('_loader.show()'); const on = !!d.querySelector('[loader]'); g('_loader.hide()'); return on; })());
    check('compareUs() deep-compares', g('compareUs({a:[1,{b:2}]},{a:[1,{b:2}]}) && !compareUs({a:1},{a:2})'));
    check('generate() returns a random id string', /^[a-z0-9]{10}$/.test(g('generate()')));
    check('daysBetween()', g('daysBetween(new Date(2026,0,1), new Date(2026,0,11))') === 10);
    check('addOrChangeParameters() merges query params', /a=1/.test(g('addOrChangeParameters("/x?a=0", {a:1})')));
    check('isInput()/getVal()/setVal()', g('(function(){ var i=$("#inp"); setVal(i,"v"); return isInput(i) && getVal(i)==="v"; })()'));
    check('dotsIntoObjs() builds a nested object', g('JSON.stringify(dotsIntoObjs("a.b", 5))') === '{"a":{"b":5}}');
    check('formatBytes()', g('formatBytes(1024)').indexOf('1') === 0 && /KB/i.test(g('formatBytes(1024)')));

    click('cn');
    setTimeout(() => {
        // Escape closes the open nav (.navTgl above arms it after 20ms).
        d.dispatchEvent(new win.KeyboardEvent('keydown', { keyCode: 27, which: 27, bubbles: true }));
        check('Escape closes the open nav', !d.body.classList.contains('nav-opened'));
        check('n0= marks the link matching the current route .active', d.getElementById('nav1').classList.contains('active') && !d.getElementById('nav2').classList.contains('active'));
        check('close-notify dismisses its notification', d.getElementById('cn') === null);
        let pass = 0, fail = 0;
        for (const r of results) {
            if (r.cond) { pass++; console.log('PASS  ' + r.name); }
            else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
        }
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    }, 100);
}, 300);
