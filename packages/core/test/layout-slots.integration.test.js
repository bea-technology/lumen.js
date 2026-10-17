// Integration test: layout slot generalization (2026-09-15) — a view can
// target a named layout region (not just the default `[body]` slot) by
// wrapping content in `<slot name="...">...</slot>`. See _re.js's `walk()`
// ("slot" branch) for how `view._slots[name]` gets populated with real,
// already-walked DOM nodes, and `renderView()` for how each populated slot
// gets injected into its matching `[slot="name"]` layout element.
//
// The HST fixture is copied verbatim from fcs.js's real parser output
// (getAllFiles() against a real .view using <slot name="...">) rather than
// hand-built — same reasoning as render-hooks.integration.test.js's own
// fixture: `<slot>` needed zero parser changes (it already parses as an
// ordinary {type:'tag', name:'slot', attrs:{name:'sidebar'}} node), but
// that's exactly the kind of assumption worth confirming against real
// output instead of trusting on paper.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const bundleSrc = fs.readFileSync(path.join(__dirname, '../dist/lumenjs-core.js'), 'utf8');
const viewHst = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/layout-slots.view.hst.json'), 'utf8'));

const dom = new JSDOM(
    `<!doctype html><body>
        <div id="main-root"></div>
        <div id="layout-root"><aside slot="sidebar"></aside></div>
        <script>${bundleSrc}</script>
    </body>`,
    {
        url: 'http://127.0.0.1:3000/', runScripts: 'dangerously',
        beforeParse(window) {
            window.URL.createObjectURL = () => 'blob:test';
            window.Worker = function () { this.postMessage = () => { }; this.addEventListener = () => { }; this.terminate = () => { }; };
        }
    }
);
const win = dom.window;

const mainScript = `
window.__results = [];
function check(name, cond, detail) { window.__results.push({ name, cond: !!cond, detail }); }

try {
    var viewHst = ${JSON.stringify(viewHst)};
    var view = new _v({ name: 'home', type: 'main', hst: viewHst, vars: { title: 'Hello' }, rvs: ['title'] });
    var engine = new _lm(view);
    engine.reactiveVariables = ['title'];
    engine.renderAll();

    check('main content ([body]-bound) does NOT include slot content', engine._RealDOM.length === 1 && engine._RealDOM[0].id === 'e2e-main', JSON.stringify(engine._RealDOM.map(n => n.id)));
    check('view._slots.sidebar got populated with real DOM nodes', view._slots && Array.isArray(view._slots.sidebar) && view._slots.sidebar.length > 0, JSON.stringify(view._slots));

    var mainRoot = document.getElementById('main-root');
    mainRoot.append.apply(mainRoot, engine._RealDOM);
    check('main content rendered correctly with its mustache resolved', mainRoot.textContent.trim() === 'Main: Hello', 'got: "' + mainRoot.textContent.trim() + '"');

    // Mirrors exactly what renderView() itself does: inject each
    // populated slot into its matching [slot="name"] layout element.
    $('[slot="sidebar"]').html(view._slots.sidebar);

    var sidebarEl = document.querySelector('[slot="sidebar"]');
    check('slot content actually landed inside the layout\\'s [slot="sidebar"] element', sidebarEl.textContent.trim() === 'Sidebar: Hello', 'got: "' + sidebarEl.textContent.trim() + '"');

    // Reactivity: slot content isn't a dead copy — its mustache is wired
    // to the SAME reactive effect system as the main content, since
    // walk() ran setEffects() on it exactly like any other node.
    _vt.View.vars.title = 'Updated';
    check('main content mustache updates on mutation', mainRoot.textContent.trim() === 'Main: Updated', 'got: "' + mainRoot.textContent.trim() + '"');
    check('slot content mustache ALSO updates on the same mutation (proves it\\'s reactive, not a static snapshot)', sidebarEl.textContent.trim() === 'Sidebar: Updated', 'got: "' + sidebarEl.textContent.trim() + '"');

    // A view targeting a slot no loaded layout declares must be a silent
    // no-op, not an error — real jQuery/dom-shim behavior on an empty
    // selector match, nothing new to implement, but worth proving it
    // doesn't throw.
    $('[slot="does-not-exist"]').html(view._slots.sidebar);
    check('injecting into a slot name no layout declares does not throw', true);
} catch (e) {
    window.__results.push({ name: 'test script ran to completion', cond: false, detail: e.message + '\\n' + e.stack });
}
`;

setTimeout(() => {
    const script = win.document.createElement('script');
    script.textContent = mainScript;
    win.document.body.appendChild(script);

    setTimeout(() => {
        let pass = 0, fail = 0;
        for (const r of (win.__results || [])) {
            if (r.cond) { pass++; console.log('PASS  ' + r.name); }
            else { fail++; console.log('FAIL  ' + r.name + (r.detail ? ' — ' + r.detail : '')); }
        }
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail === 0 ? 0 : 1);
    }, 300);
}, 300);
