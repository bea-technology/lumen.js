// Regression test (2026-10-05, found on console.roxyon.com in production on 2.5.1): an Iconify icon with an
// @-event — `<span class="iconify" data-icon="..." @click="fn">` — lost its handler. Iconify swaps the span for a
// new <svg> (parentNode.replaceChild), copying real DOM attributes with setAttribute. Two separate holes:
//   1. vendor/reconnecting-websocket.js's setAttribute patch wrote `this.events[prop]`, but el.events only exists
//      on renderer-built elements; on the fresh <svg> it threw into an empty catch and the @click vanished. Same
//      for any script-made element (`document.createElement` + `setAttribute('@click', ...)`).
//   2. A template-rendered span keeps @click only on el.events (never a real attribute), so Iconify never even
//      saw it to copy.
// V1 kept @click through the swap in both cases (checked with tools/migration-check/v1v2-probe.js). Iconify itself
// is a plugin and isn't in this bundle, so its swap is reproduced here exactly: build the <svg>, copy attributes
// with setAttribute, add the `iconify` class, replaceChild.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');

const dom = new JSDOM(
    `<!doctype html><body><script>${bundleSrc}</script></body>`,
    {
        url: 'http://127.0.0.1:3000/', runScripts: 'dangerously',
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
            window.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
        }
    }
);
const win = dom.window;

setTimeout(() => {
    const document = win.document;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    let pass = 0, fail = 0;
    function check(name, cond, detail) {
        if (cond) { pass++; console.log('PASS  ' + name); }
        else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
    }

    win.__hits = [];
    win.hitTpl = function () { win.__hits.push('tpl'); };
    win.hitStr = function () { win.__hits.push('str'); };
    win.hitSet = function () { win.__hits.push('set'); };
    win.hitOther = function () { win.__hits.push('other'); };

    // What Iconify 3.1.1 does (dist/iconify.js renderInlineSVG): new <svg>, copy every attribute except class with
    // setAttribute, add its classes, then replaceChild.
    function iconifySwap(el) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.appendChild(document.createElementNS(SVG_NS, 'path'));
        const attrs = el.attributes;
        for (let i = 0; i < attrs.length; i++) {
            const name = attrs.item(i).name;
            if (name !== 'class' && !svg.hasAttribute(name)) svg.setAttribute(name, attrs.item(i).value);
        }
        svg.classList.add('iconify', 'iconify--mdi');
        el.parentNode.replaceChild(svg, el);
        return svg;
    }
    function click(el) {
        win.__hits = [];
        el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
        return win.__hits.join(',');
    }

    const box = document.createElement('div');
    document.body.appendChild(box);

    // 1. Script-made element: setAttribute('@click') on an element with no el.events yet.
    const s = document.createElement('span');
    s.setAttribute('@click', 'hitSet');
    box.appendChild(s);
    check('setAttribute(@click) on a script-made element is kept', s.getAttribute('@click') === 'hitSet', 'got ' + s.getAttribute('@click'));
    check('...and stays off the real DOM attributes (redirected to el.events by design)', !s.hasAttribute('@click'));
    check('...and a click on it runs the handler', click(s) === 'set', 'hits=' + win.__hits);

    // 2. Template-rendered icon span: @click lives only on el.events (how createEl() builds it).
    const tpl = document.createElement('span');
    tpl.className = 'iconify';
    tpl.setAttribute('data-icon', 'mdi:lock');
    tpl.events = { '@click': 'hitTpl' };
    box.appendChild(tpl);
    const tplSvg = iconifySwap(tpl);
    check('template icon: the Iconify <svg> carries @click', tplSvg.getAttribute('@click') === 'hitTpl', 'got ' + tplSvg.getAttribute('@click'));
    check('template icon: a click on the <svg> runs the handler', click(tplSvg) === 'tpl', 'hits=' + win.__hits);
    check('template icon: a click on its inner <path> runs the handler', click(tplSvg.firstChild) === 'tpl', 'hits=' + win.__hits);

    // 3. Icon built from an HTML string (jQuery .html()): @click is a real DOM attribute, copied by setAttribute.
    box.insertAdjacentHTML('beforeend', '<span id="str" class="iconify" data-icon="mdi:lock" data-id="d1" @click="hitStr"></span>');
    const str = document.getElementById('str');
    check('string icon: parsed @click is readable before the swap', str.getAttribute('@click') === 'hitStr', 'got ' + str.getAttribute('@click'));
    const strSvg = iconifySwap(str);
    check('string icon: the Iconify <svg> carries @click', strSvg.getAttribute('@click') === 'hitStr', 'got ' + strSvg.getAttribute('@click'));
    check('string icon: a click on the <svg> runs the handler', click(strSvg) === 'str', 'hits=' + win.__hits);
    check('string icon: other attributes still copied (data-id)', strSvg.getAttribute('data-id') === 'd1');

    // 4. removeAttribute clears a parsed (real) @-attribute too, not only el.events.
    box.insertAdjacentHTML('beforeend', '<span id="rm" @click="hitOther">x</span>');
    const rm = document.getElementById('rm');
    rm.removeAttribute('@click');
    check('removeAttribute(@click) clears a parsed @click', rm.getAttribute('@click') == null, 'got ' + rm.getAttribute('@click'));
    check('...so a click no longer runs it', click(rm) === '', 'hits=' + win.__hits);

    // 5. The replaceChild carry-over is limited to Iconify's own <svg>.
    const old = document.createElement('span');
    old.events = { '@click': 'hitOther' };
    box.appendChild(old);
    const plainNew = document.createElement('span');
    box.replaceChild(plainNew, old);
    check('a non-Iconify replaceChild does not inherit the old node\'s @-events', plainNew.events === undefined && plainNew.getAttribute('@click') == null);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}, 300);
