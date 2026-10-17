// Two V1 behaviors real sites depend on heavily, both broken in V2 until
// 2026-09-25:
//  1. Nested-mustache backticks — inside {{...}}, `expr` is evaluated and
//     substituted (arr[`idx`] reads arr[idx]). 100+ real uses across
//     BEACDN sites. The engine did the substitution, but the parser never
//     collected names inside backticks, so they weren't reactive and a
//     mustache whose only names sat inside backticks never rendered.
//  2. Delegated @-events bound with a COMMA LIST selector
//     ("[\@input],[\@change],[\@blur],[\@focus],[\@keyup],[\@keydown]",
//     and the six @swipe* names) fell through to native closest(), which
//     can't see @-attributes — none of those twelve events ever fired.
//     Plus @focus/@blur reported focusin/focusout as their type.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fcs = require(path.join(__dirname, '..', '..', 'cli', 'lib', 'fcs.js'));

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-btev-')));
fs.mkdirSync(root + '/src/views', { recursive: true });
fs.writeFileSync(root + '/src/views/home.view', `<b id="b1">{{arr[\`idx\`]}}</b>
<b id="b2">{{\`idx\`*10}}</b>
<b id="b3">{{new Date(\`createdAt\`.split("T")[0]).getFullYear()}}</b>
<b id="b4">{{sel[\`inv['BillTo']\`].name}}</b>
<ul id="L"><li :for="rows">{{rows[\`index\`].t}}</li></ul>
<input id="fi" @focus="onF" @blur="onB" @input="onI" @keyup="onK" @keydown="onD" @change="onC">
<div id="sw" @swipe="onS" @swipe-left="onSL"></div>
<button id="bump" @click="idx = 2">bump</button>
<script>
var arr = ['zero', 'one', 'two']; var idx = 1; var createdAt = "2024-05-01T00:00";
var sel = { X: { name: 'Xname' } }; var inv = { BillTo: 'X' }; var rows = [{ t: 'r0' }, { t: 'r1' }];
window.__ev = [];
function onF() { __ev.push('focus') } function onB() { __ev.push('blur') } function onI() { __ev.push('input') }
function onK() { __ev.push('keyup') } function onD() { __ev.push('keydown') } function onC() { __ev.push('change') }
function onS() { __ev.push('swipe') } function onSL() { __ev.push('swipe-left') }
</script>`);
const cwd = process.cwd();
process.chdir(root);
const views = fcs.getAllFiles(root + '/src/views/', {}, false, true);
process.chdir(cwd);

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const dom = new JSDOM(`<!doctype html><body><div app></div><script>${bundleSrc}</script></body>`, {
    url: 'http://127.0.0.1:19995/', runScripts: 'dangerously',
    beforeParse(w) {
        w.URL.createObjectURL = () => 'blob:test';
        w.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
        w.AudioContext = function () { this.state = 'running'; this.resume = () => Promise.resolve(); };
    }
});
const win = dom.window, d = win.document;
win.__payload = { hstFormatVersion: 1, views, layouts: {}, tpls: {} };
win.eval(`_vcD = window.__payload; _csswrk.isStarted = function () { return true; };
appSettings = { App: "[app]", defaultView: "__no_such_view_for_test_harness__" }; renderView('home', false, {});`);

const results = [];
const check = (name, cond, detail) => results.push({ name, cond: !!cond, detail });
const t = (id) => d.getElementById(id) ? d.getElementById(id).textContent.replace(/\s+/g, ' ').trim() : null;
setTimeout(() => {
    const rv = views[Object.keys(views)[0]].reactiveVars;
    check('names inside backticks are collected as reactive', ['idx', 'createdAt', 'inv'].every(n => rv.includes(n)), JSON.stringify(rv));
    check('arr[`idx`] reads arr[idx]', t('b1') === 'one', t('b1'));
    check('`idx`*10 (backtick-only mustache) renders', t('b2') === '10', t('b2'));
    check('new Date(`createdAt`...) renders', t('b3') === '2024', t('b3'));
    check('nested quotes inside backticks: sel[`inv[\'BillTo\']`].name', t('b4') === 'Xname', t('b4'));
    check('backtick index inside a :for row', t('L') === 'r0r1', t('L'));

    const fi = d.getElementById('fi');
    fi.focus();
    fi.dispatchEvent(new win.Event('input', { bubbles: true }));
    fi.dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true }));
    fi.dispatchEvent(new win.KeyboardEvent('keyup', { bubbles: true }));
    fi.dispatchEvent(new win.Event('change', { bubbles: true }));
    fi.blur();
    const ev = win.__ev.slice();
    for (const n of ['focus', 'input', 'keydown', 'keyup', 'change', 'blur'])
        check('@' + n + ' fires (comma-list delegated selector)', ev.includes(n), JSON.stringify(ev));
    const sw = d.getElementById('sw');
    sw.dispatchEvent(new win.CustomEvent('swipe', { bubbles: true }));
    sw.dispatchEvent(new win.CustomEvent('swipeleft', { bubbles: true }));
    check('@swipe fires', win.__ev.includes('swipe'), JSON.stringify(win.__ev));
    check('@swipe-left fires', win.__ev.includes('swipe-left'), JSON.stringify(win.__ev));

    d.getElementById('bump').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    setTimeout(() => {
        check('changing a backtick-only var re-renders (arr[`idx`])', t('b1') === 'two', t('b1'));
        check('changing a backtick-only var re-renders (`idx`*10)', t('b2') === '20', t('b2'));
        let pass = 0, fail = 0;
        for (const r of results) {
            if (r.cond) { pass++; console.log('PASS  ' + r.name); }
            else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
        }
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    }, 300);
}, 900);
