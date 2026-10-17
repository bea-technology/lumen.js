// npm-bundle.js — lets a project's own index.js / src/js/*.js files use
// real npm dependencies (`import X from 'x'`), resolved via esbuild,
// while staying compatible with the EXISTING, unmodified reactive-var
// rewrite pipeline (compileProjectScript()/walk.js in packages/core).
//
// Why this isn't "just esbuild-bundle the whole file" (verified empirically,
// not assumed, before writing this): walk.js's getL1Vs()/getProgramBody()
// make a top-level var/let/const reactive (rewritten into
// `_vt.Global.vars["name"]`) by scanning Program.body for top-level
// declarations — this is exactly what lets index.js declare state a view
// template can read via a mustache/`:if`, in a completely different file
// esbuild's own module graph has no visibility into. That breaks two ways
// if the whole file (entry + resolved deps) is hand ed to esbuild as one
// unit:
//   1. format:'iife' wraps EVERYTHING in one function call — Program.body
//      becomes a single ExpressionStatement, zero top-level declarations
//      visible, reactivity silently stops working for the whole file.
//   2. Even under format:'cjs' (which keeps the entry's own top-level
//      statements unwrapped), esbuild's default bundling (a) tree-shakes
//      away any top-level var/function the entry file itself never
//      references — exactly the index.js-declares/view-reads pattern this
//      is for — and (b) for ESM-authored dependencies, leaks THEIR OWN
//      internal top-level names into the same Program-root scope (e.g.
//      bundling `nanoid` put its internal `urlAlphabet` at Program root,
//      indistinguishable from the developer's own vars — a real
//      cross-package collision risk in the shared _vt.Global.vars
//      namespace, and walk.js would rewrite library internals it has no
//      business touching).
//
// Fix used here instead: generate a small SYNTHETIC SHIM that re-exports
// exactly what the entry file imports, bundle ONLY that shim with esbuild
// using format:'iife' + globalName (esbuild's own built-in feature for
// producing `var __lumenDeps = (() => { ...; return {...}; })();`) — every
// dependency internal stays closured inside that IIFE automatically, and
// default tree-shaking on the shim is CORRECT there (an explicit re-export
// is never "unused"). Then take the entry file's ORIGINAL, unmodified
// source, splice out just the import statements (replaced with
// `var <local> = __lumenDeps.<alias>;` binding lines), and prepend the
// shim's IIFE output. The combined string then goes through
// compileProjectScript()/walk.js completely unchanged — verified this
// produces exactly `_vt.Global.vars["<name>"]` for the entry's own vars
// and does NOT leak any dependency-internal name into that namespace.
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const esbuild = require("esbuild");

// Reads package.json at projectRoot and returns true only if it declares
// at least one real dependency. This is the opt-in gate everywhere below —
// a project with no package.json, or an empty `dependencies: {}` (the
// default scaffold), takes the false branch and never invokes esbuild at
// all: zero cost, byte-identical behavior to a project with no npm support.
function hasOwnDependencies(projectRoot) {
  try {
    const pkgPath = path.join(projectRoot, "package.json");
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return !!(pkg.dependencies && Object.keys(pkg.dependencies).length > 0);
  } catch (e) {
    return false; // malformed package.json — degrade to "no deps", never throw
  }
}
exports.hasOwnDependencies = hasOwnDependencies;

let _aliasCounter = 0;
function nextAlias() {
  return "__imp_" + _aliasCounter++;
}

// Parses `source`'s import statements and returns:
//   shimLines: source lines for a synthetic module that re-exports (or,
//     for side-effect-only imports, just re-imports) exactly what `source`
//     imports, each export aliased to a collision-proof generated name.
//   bindingLines: `var <localName> = __lumenDeps.<alias>;` lines to
//     replace each import statement with, preserving the entry file's own
//     local binding names exactly as the developer wrote them.
//   splices: [{start, end, replacement}] describing how to edit `source`
//     in place (import statement's own source range -> its binding lines).
function extractImports(source) {
  let ast;
  try {
    // sourceType: "module" here is throwaway — purely to enumerate
    // ImportDeclaration nodes. The FINAL combined string (shim + spliced
    // entry) still goes through compileProjectScript's own
    // sourceType:"script" parse unchanged, since by then no import/export
    // syntax remains.
    ast = acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    // Not parseable as a module (e.g. genuinely has no imports and isn't
    // valid ESM syntax for some unrelated reason) — nothing to extract.
    return { shimLines: [], splices: [] };
  }

  const shimLines = [];
  const splices = [];

  for (const node of ast.body) {
    if (node.type !== "ImportDeclaration") continue;
    const modSpecifier = node.source.value;
    const bindingLines = [];

    if (node.specifiers.length === 0) {
      // import "x"; — side-effect only, nothing to bind.
      shimLines.push(`import ${JSON.stringify(modSpecifier)};`);
    } else {
      for (const spec of node.specifiers) {
        const alias = nextAlias();
        if (spec.type === "ImportDefaultSpecifier") {
          shimLines.push(`export {default as ${alias}} from ${JSON.stringify(modSpecifier)};`);
        } else if (spec.type === "ImportNamespaceSpecifier") {
          shimLines.push(`export * as ${alias} from ${JSON.stringify(modSpecifier)};`);
        } else {
          // ImportSpecifier — spec.imported is the exported name in the
          // source module, spec.local is what the entry file calls it.
          const importedName = spec.imported.name;
          shimLines.push(`export {${importedName} as ${alias}} from ${JSON.stringify(modSpecifier)};`);
        }
        bindingLines.push(`var ${spec.local.name} = __lumenDeps.${alias};`);
      }
    }

    splices.push({
      start: node.start,
      end: node.end,
      replacement: bindingLines.join(" "),
    });
  }

  return { shimLines, splices };
}

// Bundles absFilePath (an entry file that may contain `import` statements)
// against projectRoot's real node_modules, and returns a single string
// with all imports resolved and no import/export syntax remaining —
// ready to hand to compileProjectScript() exactly as a hand-written,
// dependency-free file would be today.
function buildEntryWithImports(absFilePath, projectRoot) {
  const source = fs.readFileSync(absFilePath, "utf8");
  const { shimLines, splices } = extractImports(source);

  if (splices.length === 0) {
    // No import statements — nothing for esbuild to do. Also covers the
    // case where the file legitimately has zero imports even though the
    // project has SOME dependencies declared elsewhere.
    return source;
  }

  const depsResult = esbuild.buildSync({
    stdin: {
      contents: shimLines.join("\n"),
      resolveDir: projectRoot,
      loader: "js",
    },
    bundle: true,
    format: "iife",
    globalName: "__lumenDeps",
    platform: "browser",
    target: ["es2019"],
    write: false,
    minify: false,
    logLevel: "silent",
  });
  const depsCode = depsResult.outputFiles[0].text;

  // Splice the entry's own source in place, highest offset first so
  // earlier offsets stay valid as we edit.
  let entryTransformed = source;
  for (const s of [...splices].sort((a, b) => b.start - a.start)) {
    entryTransformed = entryTransformed.slice(0, s.start) + s.replacement + entryTransformed.slice(s.end);
  }

  return depsCode + "\n" + entryTransformed;
}
exports.buildEntryWithImports = buildEntryWithImports;
