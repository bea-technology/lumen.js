// walk.js — HTML/JS AST walker + reactive-variable rewrite compiler.
//
// Cleaned 2026-09-13: this file previously carried three competing, stacked
// implementations of the reactive-variable rewrite pass (see this repo's
// PROVENANCE.md / working-session history for the comparison). Two abandoned
// approaches were removed:
//   1. An early scope-tracking scheme (`getL1Vs_`/`digDeepL1Vs`/`transformL1Vs`
//      and a large commented-out predecessor of `getL1Vs`) that rewrote
//      identifiers by string-concatenating onto `node.name` directly
//      (e.g. `node.name = "_vt." + node.name`) — this produces a syntactically
//      invalid Identifier node (dotted names aren't valid JS identifiers) that
//      only "worked" because the code generator doesn't validate names before
//      printing them. Breaks any real AST-based tooling downstream (source
//      maps included).
//   2. Two draft passes (both named `changeReactiveVarsOccurences`) that
//      rewrote references to `x.value` — the Vue-ref/Solid-signal pattern.
//      Structurally clean, but incompatible with this runtime's actual data
//      model: `_re.js` stores all reactive state in one flat `_vt.View.vars`
//      object behind a single Proxy, not as individually boxed values per
//      variable, so `x.value` has nothing to resolve against.
// What's kept below is the third approach — rewriting references to
// `_vt.View.vars["<name>"]`, a real MemberExpression matching `_re.js`'s
// actual Proxy target — which is what's live in production today (verified
// against the actual `lmjs.beacdn.com` server, see PROVENANCE.md).
//
// 2026-09-13: two Phase 1 fixes on top of the cleanup above.
//   - `transformTopLevelDeclarations` used to only rewrite a VariableDeclaration
//     with exactly one declarator; `var x = 1, y = 2;` was silently left as a
//     real `var` and never wired into `_vt.View.vars`. Now handles any number
//     of declarators, splitting reactive and non-reactive ones into separate
//     statements as needed.
//   - `getWatcher` now runs `validateBeforeRewrite` first: it regenerates the
//     *original*, unmodified script via `astring.generate` and parses it with
//     `new Function(...)` (compiled, never executed) so a real JS engine — not
//     hand-rolled logic — catches genuine errors (a duplicate `let`/`const`,
//     for instance) using the developer's actual variable names, before the
//     `_vt.View.vars[...]` rewrite would otherwise erase that error entirely.
//     Reports through `reportLumenError` (see `_re.js`).

class WalkerBase {
    constructor() {
        this.should_skip = false;
        this.should_remove = false;
        this.replacement = null;
        this.context = {
            skip: () => (this.should_skip = true),
            remove: () => (this.should_remove = true),
            replace: (node) => (this.replacement = node)
        };
    }
    replace(parent, prop, index, node) {
        if (parent && prop) {
            if (index != null) {
                (parent[prop])[index] = node;
            } else {
                (parent[prop]) = node;
            }
        }
    }

    remove(parent, prop, index) {
        if (parent && prop) {
            if (index !== null && index !== undefined) {
                (parent[prop]).splice(index, 1);
            } else {
                delete parent[prop];
            }
        }
    }
}

class SyncWalker extends WalkerBase {

    constructor(enter, leave) {
        super();

        this.should_skip = false;
        this.should_remove = false;
        this.replacement = null;

        this.context = {
            skip: () => (this.should_skip = true),
            remove: () => (this.should_remove = true),
            replace: (node) => (this.replacement = node)
        };

        this.enter = enter;
        this.leave = leave;
    }

    visit(node, parent, prop, index) {
        if (node) {
            if (this.enter) {
                const _should_skip = this.should_skip;
                const _should_remove = this.should_remove;
                const _replacement = this.replacement;
                this.should_skip = false;
                this.should_remove = false;
                this.replacement = null;

                this.enter.call(this.context, node, parent, prop, index);

                if (this.replacement) {
                    if (Array.isArray(this.replacement)) {
                        var expressions = [];
                        for (let rp = 0; rp < this.replacement.length; rp++) {
                            expressions.push(this.replacement[rp]);
                        }
                        if (this.replacement.length > 1) {
                            node = {
                                "type": "VariableDeclaration",
                                "start": node.start,
                                "kind": "let",
                                "declarations": expressions,
                                "level": node.level,
                                "scope": node.scope
                            };
                        } else {
                            node = {
                                "type": "ExpressionStatement",
                                "expression": {
                                    "type": "SequenceExpression",
                                    "expressions": expressions,
                                    "level": node.level,
                                    "scope": node.scope
                                },
                                "level": node.level,
                                "scope": node.scope
                            };
                        }
                        this.replace(parent, prop, index, node);
                    } else {
                        node = this.replacement;
                        this.replace(parent, prop, index, node);
                    }
                }

                if (this.should_remove) {
                    this.remove(parent, prop, index);
                }

                const skipped = this.should_skip;
                const removed = this.should_remove;

                this.should_skip = _should_skip;
                this.should_remove = _should_remove;
                this.replacement = _replacement;

                if (skipped) return node;
                if (removed) return null;
            }

            let key;

            for (key in node) {
                const value = node[key];
                if (value && typeof value === 'object') {
                    if (Array.isArray(value)) {
                        const nodes = (value);
                        for (let i = 0; i < nodes.length; i += 1) {
                            const item = nodes[i];
                            if (isNode(item)) {
                                if (!this.visit(item, node, key, i)) {
                                    i--;
                                }
                            }
                        }
                    } else if (isNode(value)) {
                        this.visit(value, node, key, null);
                    }
                }
            }

            if (this.leave) {
                const _replacement = this.replacement;
                const _should_remove = this.should_remove;
                this.replacement = null;
                this.should_remove = false;

                this.leave.call(this.context, node, parent, prop, index);

                if (this.replacement) {
                    if (Array.isArray(this.replacement)) {
                        for (let rp = 0; rp < this.replacement.length; rp++) {
                            node = this.replacement[rp];
                            this.replace(parent, prop, index, node);
                        }
                    } else {
                        node = this.replacement;
                        this.replace(parent, prop, index, node);
                    }
                }

                if (this.should_remove) {
                    this.remove(parent, prop, index);
                }

                const removed = this.should_remove;

                this.replacement = _replacement;
                this.should_remove = _should_remove;

                if (removed) return null;
            }
        }

        return node;
    }
}

function isNode(value) {
    return (
        value !== null && typeof value === 'object' && 'type' in value && typeof value.type === 'string'
    );
}

function walk(ast, { enter, leave }) {
    const instance = new SyncWalker(enter, leave);
    return instance.visit(ast, null);
}


function getProgramBody(node) {
    if (node.type == 'Program') {
        return node.body;
    }
    return node;
}

function parseNode(node) {
    // console.log("Parsing", node);
}

function checkNodeL1(node, varz, vazzz) {
    try {
        if (node && typeof node === 'object') {
            if (Array.isArray(node)) {
                for (let i = 0; i < node.length; i++) {
                    const nd = node[i];
                    if (isNode(nd)) {
                        if (nd.type === "VariableDeclaration") {
                            let declarators = nd.declarations;
                            for (let x = 0; x < declarators.length; x++) {
                                let dec = declarators[x].id;

                                if (vazzz.includes(dec.name)) {
                                    varz.push({
                                        name: dec.name,
                                        node: dec
                                    });
                                    dec.marked = true;
                                }
                            }
                        } else if (nd.type == "Identifier") {
                        }

                        parseNode(nd);
                    }
                }
            } else if (isNode(node)) {
            }
        }
    } catch (e) {
    }
}

function getL1Vs(AST, view, vazzz) {
    var level = 0, block = [{ start: 0 }];
    var varz = view?.varz ?? [];

    let nodes = getProgramBody(AST);
    checkNodeL1(nodes, varz, vazzz);

    return {
        "varz": varz,
        "AST": AST
    };
}

function getWatcher(AST, view, vazzz, targetKey = "View") {
    // 2026-09-17, real bug found and fixed: changeReactiveVarsOccurences()/
    // transformTopLevelDeclarations() mutate the AST IN PLACE (they
    // replace nodes via `parent[prop] = replacement`, not by building a
    // new tree) — harmless as long as a given AST object is only ever
    // rewritten once, which used to always be true. Per-instance subview
    // scoping changed that: renderHST() (_re.js) is called once per
    // subview MOUNT, but all mounts of the same .view file share the
    // exact same parsed `nd._jst` object (parsed once, cached, reused) —
    // so the first instance's rewrite (into e.g. _vt.View.views[0].vars)
    // permanently consumed the raw identifiers, and every subsequent
    // instance's "rewrite" silently found nothing left to rewrite,
    // regenerating instance 0's already-rewritten code unchanged. Found
    // testing 3 real mounted instances of the same subview on lumenjs.com's
    // own V2 homepage — only the first ever got its own correct scope.
    // Cloning here (not at each call site) makes getWatcher() safe to
    // call repeatedly against the same input AST, which is now a real
    // requirement, not just good hygiene. ASTs are plain, JSON-safe data
    // (no functions/circular refs), so JSON round-tripping is a correct,
    // dependency-free deep clone — walk.js has no access to the vendored
    // recursive clone() helper (a different, browser-only bundle file).
    AST = JSON.parse(JSON.stringify(AST));

    let Vars = getL1Vs(AST, view, vazzz);
    AST = Vars['AST'];
    let varz = Vars['varz'];

    validateBeforeRewrite(AST, view);

    AST = changeReactiveVarsOccurences(AST, vazzz, targetKey);
    AST = transformTopLevelDeclarations(AST, vazzz, targetKey);

    return {
        "code": astring.generate(AST),
        "varz": varz
    };
}

// Catches real JS errors (duplicate declarations, etc.) using the developer's
// original variable names, by handing the *unmodified* AST to a real engine
// before the `_vt.View.vars[...]` rewrite would otherwise make them invisible.
// `new Function(...)` only compiles this — it is never invoked, so nothing in
// the developer's script actually runs here.
function validateBeforeRewrite(AST, view) {
    try {
        new Function(astring.generate(AST));
    } catch (e) {
        if (typeof reportLumenError === 'function') {
            reportLumenError({
                stage: 'validate',
                view: view?.name,
                error: e,
                hint: "This is a real JavaScript error in your <script> block (for example, a variable declared twice with let/const) — fix it in the .view file; it will not surface again once rewritten."
            });
        }
    }
}

// 2026-09-17: `targetKey` used to only ever be a plain string ("View" or
// "Global"), producing a fixed 2-level root (`_vt.View`/`_vt.Global`). Real
// per-instance subview scoping (`_vt.View.views[i].vars`, and its nested
// form `_vt.View.views[0].views[2].vars` for a subview hosting a subview)
// needs a *deeper* chain than a single Identifier can express. Accepts
// either form now: a bare string is treated as a one-element path (100%
// unchanged output for every existing caller — "View"/"Global" still build
// exactly `_vt.View`/`_vt.Global`); an array of segments builds the real
// chain, a string segment as a non-computed Identifier access, a number
// segment as a computed numeric-literal access (`.views[3]`).
function buildTargetRootExpr(targetKey) {
    const segments = Array.isArray(targetKey) ? targetKey : [targetKey];
    let expr = { type: "Identifier", name: "_vt" };
    for (const seg of segments) {
        if (typeof seg === "number") {
            expr = {
                type: "MemberExpression",
                object: expr,
                property: { type: "Literal", value: seg, raw: String(seg) },
                computed: true
            };
        } else {
            expr = {
                type: "MemberExpression",
                object: expr,
                property: { type: "Identifier", name: seg },
                computed: false
            };
        }
    }
    return expr;
}

// The kept reactive-variable rewrite: turns a reference to a reactive
// variable into `_vt.View.vars["<name>"]`, matching `_re.js`'s Proxy target.
// `targetKey` (2026-09-14): which root of `_vt` to rewrite into — "View"
// (default, unchanged) for .view <script> blocks, "Global" for index.js's
// top-level vars, which need to outlive a single view (see _re.js's _vt.Global).
// Can also be a path array (see buildTargetRootExpr above) for a subview
// instance's own scope.
function changeReactiveVarsOccurences(AST, reactiveVariables, targetKey = "View") {
    const reactive = new Set(reactiveVariables || []);

    // ---- Scope Management ----
    // Each scope entry: { isFunction: boolean, names: Set<string> }
    const scopeStack = [];
    const bindingIdNodes = new WeakSet(); // Identifier AST nodes that are binding positions

    const pushScope = (isFunction) => scopeStack.push({ isFunction: !!isFunction, names: new Set() });
    const popScope = () => scopeStack.pop();
    const currentScope = () => scopeStack[scopeStack.length - 1];

    // declare name in nearest function scope (for 'var'/'function') or current scope otherwise
    function declare(name, kind) {
        if (!name) return;
        if (kind === "var" || kind === "function") {
            for (let i = scopeStack.length - 1; i >= 0; i--) {
                if (scopeStack[i].isFunction || i === 0) {
                    scopeStack[i].names.add(name);
                    return;
                }
            }
        } else {
            // let/const/class/param etc -> current (block) scope
            currentScope().names.add(name);
        }
    }

    // Helper: root-level existence (declared in program scope)
    function rootHas(name) {
        return scopeStack.length > 0 && scopeStack[0].names.has(name);
    }

    // Helper: is this name shadowed by any inner scope (excluding root)
    function isShadowedFromRoot(name) {
        for (let i = scopeStack.length - 1; i >= 1; i--) {
            if (scopeStack[i].names.has(name)) return true;
        }
        return false;
    }

    // ----- Pattern utilities (destructuring, rest, assignment patterns) -----
    function visitPattern(node, onId) {
        if (!node) return;
        switch (node.type) {
            case "Identifier":
                onId(node);
                break;
            case "RestElement":
                visitPattern(node.argument, onId);
                break;
            case "AssignmentPattern":
                visitPattern(node.left, onId);
                break;
            case "ArrayPattern":
                for (const el of node.elements) if (el) visitPattern(el, onId);
                break;
            case "ObjectPattern":
                for (const p of node.properties) {
                    if (p.type === "Property") visitPattern(p.value, onId);
                    else if (p.type === "RestElement") visitPattern(p.argument, onId);
                }
                break;
            default:
                break;
        }
    }

    // Mark pattern bindings (used for variable declarators, params, catch params)
    function markPatternBindings(pattern, kind = "var") {
        if (!pattern) return;
        visitPattern(pattern, (idNode) => {
            bindingIdNodes.add(idNode);
            declare(idNode.name, kind);
        });
    }

    // Predeclare top-level lexicals and hoisted declarations for Program
    function predeclareProgram(programNode) {
        if (!programNode || !Array.isArray(programNode.body)) return;
        for (const stmt of programNode.body) {
            if (stmt.type === "VariableDeclaration") {
                // declare all declared names in program scope (var/let/const)
                for (const d of stmt.declarations) {
                    visitPattern(d.id, (id) => {
                        // binding id node (declaration) should be marked
                        bindingIdNodes.add(id);
                        declare(id.name, stmt.kind);
                    });
                }
            } else if (stmt.type === "FunctionDeclaration" && stmt.id) {
                bindingIdNodes.add(stmt.id);
                declare(stmt.id.name, "function");
            } else if (stmt.type === "ClassDeclaration" && stmt.id) {
                bindingIdNodes.add(stmt.id);
                declare(stmt.id.name, "let");
            } else if (stmt.type === "ImportDeclaration") {
                for (const spec of stmt.specifiers || []) {
                    if (spec.local) {
                        bindingIdNodes.add(spec.local);
                        declare(spec.local.name, "const");
                    }
                }
            }
        }
    }

    // Predeclare block-scoped names at the start of a block (helps with TDZ)
    function predeclareBlockLexicals(blockNode) {
        if (!blockNode || !Array.isArray(blockNode.body)) return;
        for (const stmt of blockNode.body) {
            if (stmt.type === "VariableDeclaration" && stmt.kind !== "var") {
                for (const d of stmt.declarations) {
                    visitPattern(d.id, (id) => {
                        bindingIdNodes.add(id);
                        // block-scoped: declareHere
                        currentScope().names.add(id.name);
                    });
                }
            } else if (stmt.type === "FunctionDeclaration" && stmt.id) {
                // function declarations are block-scoped in modern JS
                bindingIdNodes.add(stmt.id);
                currentScope().names.add(stmt.id.name);
            } else if (stmt.type === "ClassDeclaration" && stmt.id) {
                bindingIdNodes.add(stmt.id);
                currentScope().names.add(stmt.id.name);
            }
        }
    }

    // Predeclare for-loop header bindings (let/const in header shadow test/update/body)
    function predeclareForHeader(node) {
        const header = node.type === "ForStatement" ? node.init : node.left;
        if (header && header.type === "VariableDeclaration" && header.kind !== "var") {
            for (const d of header.declarations) {
                visitPattern(d.id, (id) => {
                    bindingIdNodes.add(id);
                    currentScope().names.add(id.name);
                });
            }
        }
    }

    // ----- Node-level checks to avoid rewriting keys/bindings/labels/imports -----
    function shouldSkipIdentifier(node, parent, prop) {
        if (!parent) return false;

        // Label identifiers
        if (
            (parent.type === "LabeledStatement" && prop === "label") ||
            ((parent.type === "BreakStatement" || parent.type === "ContinueStatement") && prop === "label")
        ) return true;

        // MemberExpression property (non-computed): obj.x -> don't rewrite 'x' as a property name
        if (parent.type === "MemberExpression") {
            if (prop === "property" && parent.computed === false) return true;
        }

        // Object literal property key (non-computed)
        if (parent.type === "Property") {
            if (prop === "key" && parent.computed === false) return true;
            // If shorthand `{ x }` we will handle by turning shorthand=false when replacing the value
        }

        // MethodDefinition / ClassProperty keys (non-computed)
        if ((parent.type === "MethodDefinition" || parent.type === "ClassProperty" || parent.type === "PropertyDefinition") &&
            prop === "key" && parent.computed === false) return true;

        // Import/Export specifiers: they are bindings and usually already marked, but double-guard
        if (
            parent.type === "ImportSpecifier" ||
            parent.type === "ImportDefaultSpecifier" ||
            parent.type === "ImportNamespaceSpecifier" ||
            parent.type === "ExportSpecifier"
        ) return true;

        return false;
    }

    // ---- Recursive walker (post-order) ----
    function walk(node, parent, prop, index) {
        if (!node || typeof node !== "object") return;

        // ENTER: handle scope creation & pre-declarations BEFORE visiting children
        switch (node.type) {
            case "Program":
                pushScope(true);
                predeclareProgram(node);
                break;

            case "BlockStatement":
            case "StaticBlock":
                pushScope(false);
                predeclareBlockLexicals(node);
                break;

            case "FunctionDeclaration":
                // function name is hoisted to the outer scope
                if (node.id) {
                    bindingIdNodes.add(node.id);
                    declare(node.id.name, "function"); // hoist to nearest function/program (outer)
                }
                pushScope(true);
                // params bind in the new function scope
                for (const p of node.params) markPatternBindings(p, "param");
                break;

            case "FunctionExpression":
                pushScope(true);
                // named function expression: name binds in its own function scope
                if (node.id) {
                    bindingIdNodes.add(node.id);
                    declare(node.id.name, "let"); // local to this function scope
                }
                for (const p of node.params) markPatternBindings(p, "param");
                break;

            case "ArrowFunctionExpression":
                pushScope(true);
                for (const p of node.params) markPatternBindings(p, "param");
                break;

            case "CatchClause":
                pushScope(false);
                if (node.param) markPatternBindings(node.param, "let");
                break;

            case "ForStatement":
            case "ForInStatement":
            case "ForOfStatement":
                pushScope(false);
                predeclareForHeader(node);
                break;

            case "VariableDeclaration":
                // declare bindings for each declarator (var/let/const)
                for (const decl of node.declarations) {
                    markPatternBindings(decl.id, node.kind || "var");
                }
                break;

            case "ClassDeclaration":
                if (node.id) {
                    bindingIdNodes.add(node.id);
                    declare(node.id.name, "let");
                }
                break;

            case "ImportDeclaration":
                for (const spec of node.specifiers || []) {
                    if (spec.local) {
                        bindingIdNodes.add(spec.local);
                        declare(spec.local.name, "const");
                    }
                }
                break;
        }

        // Recurse children (post-order traversal so declarations are marked before uses below)
        for (const key in node) {
            if (key === "parent") continue;
            const child = node[key];
            if (Array.isArray(child)) {
                for (let i = 0; i < child.length; i++) {
                    if (child[i] && typeof child[i] === "object") {
                        walk(child[i], node, key, i);
                    }
                }
            } else if (child && typeof child === "object") {
                walk(child, node, key, null);
            }
        }

        // POST: rewrite Identifier references if they meet the criteria
        if (node.type === "Identifier") {
            const name = node.name;

            // Only consider reactive names and only non-binding identifier nodes
            if (!reactive.has(name) || bindingIdNodes.has(node)) {
                // do nothing
            } else if (!rootHas(name)) {
                // Not declared at program root: we only rewrite variables declared at root
            } else if (isShadowedFromRoot(name)) {
                // An inner scope declared the same name -> the reference belongs to inner binding; skip
            } else if (shouldSkipIdentifier(node, parent, prop)) {
                // e.g., property key, non-computed member property, import/export, labels...
            } else {
                // Special-case object-property shorthand: if we're the value of a shorthand property,
                // we must turn shorthand off so `{ x }` becomes `{ x: _vt.View.vars["x"] }`
                if (parent && parent.type === "Property" && parent.shorthand && prop === "value") {
                    parent.shorthand = false;
                }

                // Build computed member expression: _vt.<targetKey>.vars["<name>"]
                const replacement = {
                    type: "MemberExpression",
                    object: {
                        type: "MemberExpression",
                        object: buildTargetRootExpr(targetKey),
                        property: { type: "Identifier", name: "vars" },
                        computed: false
                    },
                    property: { type: "Literal", value: name, raw: JSON.stringify(name) },
                    computed: true
                };

                // Replace in parent structure
                if (parent) {
                    if (index !== null && Array.isArray(parent[prop])) {
                        parent[prop][index] = replacement;
                    } else {
                        parent[prop] = replacement;
                    }
                } else {
                    // unlikely: top-level Identifier as AST root — replace the root reference
                    // (some tools expect AST to be an object with Program root, but be safe)
                    // mutate node in-place:
                    Object.keys(node).forEach(k => delete node[k]);
                    Object.assign(node, replacement);
                }
            }
        }

        // EXIT: pop scopes created on enter
        switch (node.type) {
            case "Program":
            case "BlockStatement":
            case "StaticBlock":
            case "FunctionDeclaration":
            case "FunctionExpression":
            case "ArrowFunctionExpression":
            case "CatchClause":
            case "ForStatement":
            case "ForInStatement":
            case "ForOfStatement":
                popScope();
                break;
            default:
                break;
        }
    }

    // Run walker
    walk(AST, null, null, null);
    return AST;
}

// KNOWN GAP (see file header): only rewrites a VariableDeclaration with
// exactly one declarator. `var x = 1, y = 2;` is left untouched.
function _reactiveAssignStatement(name, init, targetKey = "View") {
    return {
        type: "ExpressionStatement",
        expression: {
            type: "AssignmentExpression",
            operator: "=",
            left: {
                type: "MemberExpression",
                computed: true,
                object: {
                    type: "MemberExpression",
                    computed: false,
                    object: buildTargetRootExpr(targetKey),
                    property: { type: "Identifier", name: "vars" }
                },
                property: { type: "Literal", value: name }
            },
            right: init || { type: "Identifier", name: "undefined" }
        }
    };
}

// 2026-09-17: registers a top-level function declaration onto this
// render's own scope (`_vt.<targetKey>.fns["name"] = name`) — ADDITIVE,
// not a replacement: the function declaration itself is left completely
// untouched right above this (still a real `window.name` too, the
// existing, deliberate "functions stay real globals so onclick='fn()'
// keeps working" design — see compileProjectScript's matching comment).
// Needed once multiple instances of the same subview can be mounted at
// once (see _re.js's per-instance scoping work) — every instance
// declaring a same-named handler collided on the one global function
// (window.bump became whichever instance's script ran last), so every
// instance's @click ended up calling THAT one instance's handler
// regardless of which was actually clicked. lstnrs.js's evalEvAttr()
// checks this per-instance copy first, before falling back to window.
function _fnRegisterStatement(name, targetKey) {
    return {
        type: "ExpressionStatement",
        expression: {
            type: "AssignmentExpression",
            operator: "=",
            left: {
                type: "MemberExpression",
                computed: true,
                object: {
                    type: "MemberExpression",
                    computed: false,
                    object: buildTargetRootExpr(targetKey),
                    property: { type: "Identifier", name: "fns" }
                },
                property: { type: "Literal", value: name }
            },
            right: { type: "Identifier", name: name }
        }
    };
}

function _windowExportStatement(name) {
    return {
        type: "IfStatement",
        test: { type: "BinaryExpression", operator: "!==", left: { type: "UnaryExpression", operator: "typeof", prefix: true, argument: { type: "Identifier", name: "window" } }, right: { type: "Literal", value: "undefined" } },
        consequent: {
            type: "ExpressionStatement",
            expression: {
                type: "AssignmentExpression",
                operator: "=",
                left: { type: "MemberExpression", computed: true, object: { type: "Identifier", name: "window" }, property: { type: "Literal", value: name } },
                right: { type: "Identifier", name: name }
            }
        },
        alternate: null
    };
}

// Handles any number of declarators in a single top-level statement, not just
// one. `var x = 1, y = 2;` with only `x` reactive becomes two statements:
// `_vt.View.vars["x"] = 1;` followed by a real `var y = 2;` for the rest —
// each declarator only needs its own rewrite, and non-reactive ones must stay
// real declarations to remain valid references elsewhere in the script.
function transformTopLevelDeclarations(AST, reactiveVariables, targetKey = "View") {
    const reactive = new Set(reactiveVariables || []);
    const newBody = [];

    for (const stmt of AST.body) {
        if (stmt.type === "FunctionDeclaration" && stmt.id) {
            newBody.push(stmt);
            newBody.push(_fnRegisterStatement(stmt.id.name, targetKey));
            // The view script runs inside `try { ... }`. A plain function declared in a block still becomes a
            // global (Annex B), but async and generator ones stay block-scoped — V1 ran scripts unwrapped, so
            // `async function save(){}` was window.save for onclick=, other scripts and @-handlers.
            if (stmt.async || stmt.generator) newBody.push(_windowExportStatement(stmt.id.name));
            continue;
        }

        if (stmt.type !== "VariableDeclaration") {
            newBody.push(stmt);
            continue;
        }

        const reactiveDecls = stmt.declarations.filter(d => reactive.has(d.id.name));
        const nonReactiveDecls = stmt.declarations.filter(d => !reactive.has(d.id.name));

        if (reactiveDecls.length === 0) {
            newBody.push(stmt);
            continue;
        }

        for (const decl of reactiveDecls) {
            newBody.push(_reactiveAssignStatement(decl.id.name, decl.init, targetKey));
        }

        if (nonReactiveDecls.length > 0) {
            newBody.push({
                type: "VariableDeclaration",
                kind: stmt.kind,
                declarations: nonReactiveDecls
            });
        }
    }

    AST.body = newBody;
    return AST;
}

// Node-only export (2026-09-14) so the CLI's build/serve path (packages/cli's
// fcs.js) can reuse the exact same rewrite for index.js's top-level vars
// instead of re-implementing it. `module` doesn't exist in the browser
// bundle this file is concatenated into (see build/bundle.js), so this is a
// silent no-op there — it only ever runs in Node.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getWatcher, changeReactiveVarsOccurences, transformTopLevelDeclarations, validateBeforeRewrite };
}
