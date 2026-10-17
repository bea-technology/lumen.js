// The .view / .layout / .tpl parser (HTML -> HST), split out of fcs.js on 2026-10-07 so the same source also
// builds the in-browser compiler behind lumenjs.com's playground (build/browser-compiler.js). Keep this file free
// of Node-only APIs (fs, path, Buffer, process): it must bundle for the browser unchanged.
var _acorn = require("acorn");
var acorn = require("acorn-loose");
var he = require("he");

// acorn-loose is the lenient fallback for scripts a real parser rejects, but it also mis-parses valid code: a
// template-literal chain ending a line followed by a statement with no semicolon came out as an "✖" placeholder
// (cloud.bea domains.view), which broke the whole script. Valid source goes through the strict parser.
function parseScriptJs(source) {
  let ast;
  try {
    ast = _acorn.parse(source, { ecmaVersion: "latest", sourceType: "script" });
  } catch (e) {
    ast = acorn.parse(source, { ecmaVersion: "latest" });
  }
  return stripAstPositions(ast);
}

// A view <script> ships as its source text; the runtime parses it with the same acorn options when the view mounts.
// Shipping the ESTree instead made each script ~5x larger (console.roxyon.com: 4.2 MB of a 6 MB app.js). A script
// that only the lenient parser (acorn-loose) accepts keeps its AST, since the runtime has only the strict parser.
function scriptPayload(source) {
  try {
    _acorn.parse(source, { ecmaVersion: "latest", sourceType: "script" });
    return { content: source };
  } catch (e) {
    return { jst: parseScriptJs(source) };
  }
}
exports.scriptPayload = scriptPayload;

// When an AST does ship (the lenient-parser fallback above), nothing reads
// source positions: drop start/end/loc/range from every node (a third of each node's JSON). `raw` stays — astring
// prints literals from it.
function stripAstPositions(node) {
  if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) stripAstPositions(node[i]); return node; }
  if (!node || typeof node !== "object") return node;
  delete node.start; delete node.end; delete node.loc; delete node.range;
  for (const k in node) {
    const v = node[k];
    if (v && typeof v === "object") stripAstPositions(v);
  }
  return node;
}
exports.stripAstPositions = stripAstPositions;

// 2026-09-18: persistent layout widgets (_vt.Widgets) — a layout element
// carrying a bare (valueless) attribute, e.g. <nav nav>, declares a named
// widget region, generalizing V1's hardcoded hasNav/hasHeader/hasFooter
// past its fixed 3-name list. Confirmed empirically (not assumed) that
// _hst()'s real parser output represents a bare attribute as `attrs[k] ===
// ""` (an empty string), not `true`/`null` — see the scratch test that
// produced `{"header": {"attrs": {"header": ""}}}` etc. for
// `<header header></header>`.
//
// Excludes "body" (already a separate, hardcoded main-content target — see
// _re.js's renderView()) and every other bare attribute name already
// meaningful elsewhere in the engine (grepped `attrs.hasOwnProperty(...)`/
// `hasAttr(...)` across packages/core/src — "view"/"scoped"/"tpl" are
// structural directives, "sl"/"color"/"time"/"date"/"datetime" trigger
// autoInitPlugins(), "up"/"stop"/"confirm"/"econfirm"/"acl"/"rcl" are
// lstnrs.js event-modifier attributes), plus real HTML boolean attributes a
// layout author might legitimately use for unrelated purposes.
const RESERVED_BARE_ATTRS = new Set([
  "body",
  "view", "scoped", "tpl",
  "sl", "color", "time", "date", "datetime",
  "up", "stop", "confirm", "econfirm", "acl", "rcl",
  "hidden", "disabled", "readonly", "required", "checked", "selected",
  "autofocus", "multiple", "async", "defer",
]);

function _collectWidgetRegions(nodes, found) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (node && node.type === "tag" && node.attrs) {
      for (const attrName in node.attrs) {
        if (
          Object.prototype.hasOwnProperty.call(node.attrs, attrName) &&
          node.attrs[attrName] === "" &&
          !RESERVED_BARE_ATTRS.has(attrName) &&
          !found.includes(attrName)
        ) {
          found.push(attrName);
        }
      }
    }
    if (node && Array.isArray(node.children)) {
      _collectWidgetRegions(node.children, found);
    }
  }
}

// Annotates every entry of a `layouts` HST bucket (the shape getAllFiles()
// produces, keyed by btoa(filePath)) with its own `.regions` array — the
// widget-region names that layout declares, in document order (first-found
// wins on later dedup elsewhere, so this order matters). Mutates and
// returns the same object; safe to call on an already-annotated bucket
// (re-scans, doesn't accumulate).
function annotateLayoutRegions(layoutsObj) {
  for (const key in layoutsObj) {
    if (!Object.prototype.hasOwnProperty.call(layoutsObj, key)) continue;
    let entry = layoutsObj[key];
    if (!entry || !entry.hst) continue;
    let found = [];
    _collectWidgetRegions(entry.hst, found);
    entry.regions = found;
  }
  return layoutsObj;
}
exports.annotateLayoutRegions = annotateLayoutRegions;

// SVG elements must be created in the SVG namespace or the browser draws nothing (and `viewBox` is lowercased).
// Mark every node inside an <svg> with `svg: true` so the runtime's createEl() can use createElementNS; content of
// a <foreignObject> is HTML again.
function hst_markSvg(nodes, inSvg) {
  if (!Array.isArray(nodes)) return;
  for (const n of nodes) {
    if (!n || n.type === 'text') continue;
    let name = String(n.name || '').toLowerCase();
    let here = inSvg || name === 'svg';
    if (here) n.svg = true;
    let kidsInSvg = here && name !== 'foreignobject';
    hst_markSvg(n.children, kidsInSvg);
    if (Array.isArray(n.content)) hst_markSvg(n.content, kidsInSvg);
  }
}

// `:if` and `:for` on the same element apply in the order they are written — the earlier one has priority:
//   <li :if="show" :for="items as i">   the condition gates the whole loop  -> loop source `(show) ? (items) : []`
//   <li :for="items as i" :if="i > 1">  the loop runs first, the condition per row -> merged into :for-if
// Without this the LAST directive decided the element's type and the other one was silently dropped.
function hst_orderIfFor(res) {
  if (!res || !res.attrs || !res.forX || !Object.prototype.hasOwnProperty.call(res.attrs, ":if")) return;
  let keys = Object.keys(res.attrs);
  let cond = String(res.attrs[":if"]);
  if (keys.indexOf(":if") < keys.indexOf(":for")) {
    res.forX.js = "(" + cond + ") ? (" + res.forX.js + ") : []";
  } else {
    let prev = res.attrs[":for-if"];
    res.attrs[":for-if"] = prev ? "(" + prev + ") && (" + cond + ")" : cond;
  }
  res.type = "sections";
  delete res.cond;
  delete res.attrs[":if"];
  if (res.ax) delete res.ax[":if"];
}
exports.hst_orderIfFor = hst_orderIfFor;

class hst {
  htmlVoidElements = ['area', 'base', 'basefont', 'bgsound', 'br', 'col', 'command', 'embed', 'frame', 'hr', 'image', 'img', 'input', 'isindex', 'keygen', 'link', 'menuitem', 'meta', 'nextid', 'param', 'source', 'track', 'wbr'];

  // moustachePattern = /(?:\{[\s*\n*\r*\t*]*\{)([\s\S]+?)(\}[\s*\n*\r*\t*]*\})/gm;
  // moustachePattern = /\{\{\s*([\s\S]*?)\s*\}\}/g;
  moustachePattern = /\{\s*\{\s*([\s\S]*?)\s*\}\s*\}/g;
  // Quoted values may span lines (a long `data-x="{{ a ?\n b : c }}"`); `.` would stop at the newline and the
  // rest of the value would be read as stray attributes (dv2: an attribute named ":").
  attrRE = /\s([^'"/\s><]+?)[\s/>]|([^\s=]+)=\s?("[\s\S]*?"|'[\s\S]*?')/g;

  tagRE = /<[a-zA-Z0-9\-\!\/](?:"[^"]*"|'[^']*'|[^'">])*>/g;
  whitespaceRE = /^\s*$/;

  empty = Object.create(null);

  reactiveVariables = [];

  constructor(html) {
    let hst = this.parse(html);
    hst_markSvg(hst, false);
    // return hst;
    this.reactiveVariables = this.reactiveVariables.filter((value, index, self) => {
      return self.indexOf(value) === index;
    });

    return {
      hst: hst,
      "reactiveVars": this.reactiveVariables,
    };
  }

  keepOneSpace(_t) {
    _t = _t.replace(/\s\s/gm, " ");
    if (/\s\s/gm.test(_t)) return this.keepOneSpace(_t);
    return _t;
  }
  _clean(_t) {
    _t = _t.replace(/(\r?\n|\r)/gm, "");
    _t = _t.replace(/(\t)/gm, "");
    _t = this.keepOneSpace(_t);
    return _t.replace(/^(?:\s*\t*\r*\n*\{*)+|(?:\s*\t*\r*\n*\})+$/g, "").trim(); //.replace(/(?:\t*\r*\n*)/g,'');
  }

  processAttr(n, v, res) {
  }


  processForXAttr(val) {
    let forX = {
      "js": "",
      "as": {
        "k": "",
        "v": ""
      },
      "dx": ""
    };
    var val = val.trim();
    if (val.indexOf(";") > -1) {
      let zxx = val.split(";");
      forX['dx'] = zxx[1].trim();
      val = zxx[0].trim();
    }
    if (val.indexOf(" as ") > -1) {
      let arr2 = val.split(" as ");
      let kv = [];
      let arr3 = arr2[1].split(" ").join("").split(",");
      if (arr3.length > 1) {
        kv = [arr3[0], arr3[1]];
      } else {
        kv = [arr3[0]];
      }

      if (kv.length) {
        forX['as']['k'] = kv[0].trim();
        if (kv.length > 1) {
          forX['as']['v'] = kv[1].trim();
        }
      }
      val = arr2[0].trim();
    }
    forX['js'] = val.trim();
    return forX;
  }

  parseTag(tag) {
    var res = {
      type: 'tag',
      name: '',
      isV: false,
      attrs: {},
      ax: {},
      evs: {},
      ex: {},
      children: []
    };
    var tagMatch = tag.match(/<\/?([^\s]+?)[/\s>]/);

    if (tagMatch) {
      res.name = tagMatch[1];
      res.isV = this.htmlVoidElements.includes(tagMatch[1]) || tag.charAt(tag.length - 2) === '/';
    }

    var reg = new RegExp(this.attrRE);
    var result = null;

    for (; ;) {
      result = reg.exec(tag);

      if (result === null) {
        break;
      }

      if (!result[0].trim()) {
        continue;
      }

      if (result[1]) {
        var attr = result[1].trim();
        var arr = [attr, ''];


        if (arr[0] == ":else") {
          res.type = "section";
          res.cond = "";
        }
        // else if (arr[0] == ":for") {
        //   res.type = "sections";
        //   res.content = "";
        //   res.forX = this.processForXAttr("");
        // }

        if (attr.indexOf('=') > -1) {
          arr = attr.split('=');
        }

        if (arr[0].substring(0, 1) == "@") {
        } else {
          if (res.name.toLowerCase() == "icon" && arr[0].indexOf(":") > -1 && arr[0].substr(0, 1) != ":") {
            res.icon = arr[0];
          } else res.attrs[arr[0]] = arr[1];
          // res.attrs[arr[0]] = this.cleanExpression(arr[1]);
        }

        reg.lastIndex--;
      } else if (result[2]) {
        let sl = result[3].trim().substring(1, result[3].length - 1);
        // 2026-09-22, real bug found and fixed: a real browser's native
        // HTML parser always HTML-entity-decodes an attribute's value at
        // parse time (`<p :if="age &lt; 18">` really means the attribute
        // value is the 8-character string "age < 18", not the literal
        // text "age &lt; 18") — this custom parser never did that at all.
        // Real, severe impact, confirmed on a real migrated V1 page:
        // `:if="age &lt; 18"` (content authored with the entity, common
        // in migrated/copy-pasted docs content) got parsed by acorn as
        // TWO real JS statements (`age & lt;` then `18;`, since `&` is a
        // real bitwise-AND operator and `lt` a real bare identifier) —
        // "lt" got detected as a genuinely-used variable (collectVariable
        // UsageFromAST doesn't know it's an artifact) and added to
        // reactiveVariables, which meant it round-tripped through
        // scopedEval() as a REAL, defined (undefined-valued) parameter
        // instead of throwing a ReferenceError — eval()'s result became
        // the LAST statement's value (the literal 18, always truthy),
        // making the :if condition permanently stuck true regardless of
        // the real age value, no error anywhere. Decoding here, once,
        // right after extraction — before acorn ever sees it, before
        // mustache-splitting, before it's stored as an attr/condition
        // value — fixes every one of those downstream consumers at once,
        // matching real browser semantics exactly.
        sl = he.decode(sl);

        if (result[2] == ":if" || result[2] == ":else-if" || result[2] == ":else") {
          res.type = "section";
          res.cond = sl;
          // 2026-09-14: :if/:else-if conditions never got the same
          // variable-detection pass mustaches (below) and :for (right below
          // this) already get — a variable referenced ONLY inside a
          // condition (never literally in {{ }}) was silently never
          // detected as reactive. Confirmed with a real minimal case:
          // `:if="isAdmin"` alone, no {{isAdmin}} anywhere, produced zero
          // detected reactive vars — the exact "renders once, never
          // updates, no error" failure this redesign was meant to remove,
          // just relocated rather than fixed. Mirrors the mustache logic
          // exactly (see collectVariableUsageFromAST below).
          if (sl) {
            try {
              let condAST = acorn.parse(sl, { ecmaVersion: "latest" });
              let condVars = this.collectVariableUsageFromAST(condAST, {
                excludeBuiltins: true,
                extraBuiltins: [],
              });
              for (let X = 0; X < condVars.length; X++) {
                this.reactiveVariables.push(condVars[X]);
              }
            } catch (e) {
              // malformed condition — leave undetected rather than crash
              // the whole file's parse over one bad expression.
            }
          }
        } else if (result[2] == ":for") {
          res.type = "sections";
          res.content = sl;
          res.forX = this.processForXAttr(sl);
          // 2026-09-21, real bug found and fixed: this used to push
          // res.forX.js — the RAW array-source expression text (e.g.
          // "globals.sections.footer_social.specs" for
          // `:for="globals.sections.footer_social.specs"`) — directly
          // into the file's shared reactiveVariables list, instead of
          // reducing it to the actual base identifier the way :if/
          // :else-if (right above) and every mustache (_getMs2) already
          // do via collectVariableUsageFromAST. Confirmed real, migrating
          // a real V1 footer with exactly this :for shape: the dotted
          // string landed in reactiveVariables verbatim, and since that
          // list is shared across the WHOLE file (not just this one
          // section), it poisoned evaluation of every OTHER, unrelated
          // expression in the same file too — _re.js's scopedEval()
          // builds its eval context from these names as literal function
          // PARAMETER names (Function.apply(null, [...names, ...])), and
          // a name containing dots makes that throw "Arg string
          // terminates parameters early" for every expression evaluated
          // in that context, not just this :for's own. res.forX.js
          // itself is untouched — _re.js's renderSection() still needs
          // the full expression text to actually evaluate the loop
          // source at runtime; only what gets pushed into the shared
          // tracking list changes.
          if (res.forX.js) {
            try {
              let forAST = acorn.parse(res.forX.js, { ecmaVersion: "latest" });
              let forVars = this.collectVariableUsageFromAST(forAST, {
                excludeBuiltins: true,
                extraBuiltins: [],
              });
              for (let X = 0; X < forVars.length; X++) {
                this.reactiveVariables.push(forVars[X]);
              }
            } catch (e) {
              // malformed :for source — leave undetected rather than
              // crash the whole file's parse over one bad expression,
              // matching :if/:else-if's own established fallback.
            }
          }
        }

        if (result[2].substring(0, 1) == "@") {
          let max = this._getMs2(sl);
          res.evs[result[2]] = max[1];
          max[0].length ? res.ex[result[2]] = max[0] : null;
        } else {
          // V1 replaced "`{{expr}}`" in an attribute as one unit, dropping that one pair of backticks
          // (`data-k="`{{it.n}}`"` -> "a"; "``{{k}}``" -> "`tea`").
          let max = this._getMs2(sl.replace(/`(\{\s*\{[\s\S]*?\}\s*\})`/g, "$1"));

          if (res.name.toLowerCase() == "icon" && result[2].indexOf(":") > -1 && result[2].substr(0, 1) != ":") {
            res.icon = result[2];
          } else res.attrs[result[2]] = max[1];
          // res.attrs[result[2]] = this.cleanExpression(sl);
          max[0].length ? res.ax[result[2]] = max[0] : null;
        }
      }
    }

    hst_orderIfFor(res);
    return res;
  };

  removeComments(str) {
    str = str.replace(/<!--[\s\S]*?(?:-->)/g, '');
    return str;
  }
  cleanExpression(expression) {
    let cleaned = '';
    let inSingle = false, inDouble = false, inTemplate = false;
    let inRegex = false, escapeNext = false;
    let inBlockComment = false, inLineComment = false;

    for (let i = 0; i < expression.length; i++) {
      let char = expression[i];
      let next = expression[i + 1];

      // Handle escaping inside strings/template
      if (escapeNext) {
        cleaned += char;
        escapeNext = false;
        continue;
      }

      // Handle comments
      if (inBlockComment) {
        if (char === '*' && next === '/') {
          inBlockComment = false;
          i++;
        }
        continue;
      }
      if (inLineComment) {
        if (char === '\n') {
          inLineComment = false;
        }
        continue;
      }

      // Detect start of comment (only when not inside string/template/regex)
      if (!inSingle && !inDouble && !inTemplate && !inRegex) {
        if (char === '/' && next === '*') {
          inBlockComment = true;
          i++;
          continue;
        }
        if (char === '/' && next === '/') {
          inLineComment = true;
          i++;
          continue;
        }
      }

      // Handle strings
      if (!inDouble && !inTemplate && !inRegex && char === "'" && !inSingle) {
        inSingle = true;
        cleaned += char;
        continue;
      } else if (inSingle && char === "'") {
        inSingle = false;
        cleaned += char;
        continue;
      }

      if (!inSingle && !inTemplate && !inRegex && char === '"' && !inDouble) {
        inDouble = true;
        cleaned += char;
        continue;
      } else if (inDouble && char === '"') {
        inDouble = false;
        cleaned += char;
        continue;
      }

      // Handle template literals
      if (!inSingle && !inDouble && !inRegex && char === '`' && !inTemplate) {
        inTemplate = true;
        cleaned += char;
        continue;
      } else if (inTemplate && char === '`') {
        inTemplate = false;
        cleaned += char;
        continue;
      }

      // Handle regex literals (very naive detection)
      if (!inSingle && !inDouble && !inTemplate && char === '/' && !inRegex) {
        // Likely start of regex if previous non-whitespace char is an operator
        let prevNonSpace = cleaned.match(/\S$/);
        if (!prevNonSpace || /[=({[,;:?!+\-*/%&|^~<>]/.test(prevNonSpace[0])) {
          inRegex = true;
        }
        cleaned += char;
        continue;
      } else if (inRegex && char === '/' && expression[i - 1] !== '\\') {
        inRegex = false;
        cleaned += char;
        continue;
      }

      // Handle escaping inside strings/template
      if (char === '\\' && (inSingle || inDouble || inTemplate || inRegex)) {
        escapeNext = true;
        cleaned += char;
        continue;
      }

      // Whitespace normalization
      if (!inSingle && !inDouble && !inTemplate && !inRegex) {
        if (/\s/.test(char)) {
          // Collapse multiple spaces to a single space
          if (cleaned[cleaned.length - 1] !== ' ') {
            cleaned += ' ';
          }
          continue;
        }
      }

      cleaned += char;
    }

    return cleaned.trim();
  }



  _getMs(_t, wbt) {
    let result = '';
    let lastIndex = 0;
    let _m;

    var _ms = [];
    let hasError = false;
    while ((_m = this.moustachePattern.exec(_t)) != null) {



      try {
        let AST = acorn.parse(_m[0], { ecmaVersion: "latest" });
        // console.log(AST);
        hasError = false;
        let mux = this._clean(_m[0]);
        if (wbt) {
          if (_t.substring(_m.index - 1, 1) == "`") {
            _ms.push(mux);
            // console.log("ZZZZ", _m[0], mux);
            // _t.split(_m[0]).join(mux);

            // Append the part of the string before the match
            result += _t.substring(lastIndex, _m.index);
            // Append the replacement string
            result += "{{" + mux + "}}";
            // Update the last index to the end of the current match
            lastIndex = _m.index + _m[0].length;

          }
        } else {
          if (_t.substring(_m.index - 1, 1) != "`") {
            _ms.push(mux);
            // console.log("KKKK", _m[0], mux, _m);
            // _t.split(_m[0]).join(mux);

            // Append the part of the string before the match
            result += _t.substring(lastIndex, _m.index);
            // Append the replacement string
            result += "{{" + mux + "}}";
            // Update the last index to the end of the current match
            lastIndex = _m.index + _m[0].length;
          }
        }
      } catch (e) {
        hasError = true;
        // Invalid JS, ignore or report
        result += _t.substring(lastIndex, _m.index);
        result += "{{ /*Invalid Javascript Code*/ }}";
        console.log("Invalid JS", _m[0]);//, e);
      }

    }

    if (!hasError) result += _t.substring(lastIndex);

    return [_ms, result];
  }




  _getMs2(_t, wbt) {
    let content = '';
    let lastIndex = 0;
    let _m;

    var _muxes = [];
    let hasError = false;
    while ((_m = this.moustachePattern.exec(_t)) != null) {

      // console.log(_m);
      try {
        hasError = false;
        let mux = this._clean(_m[0]);

        // 2026-09-17, real bug found and fixed: a mustache immediately
        // preceded by a backtick (the documented attribute-interpolation
        // syntax, e.g. data-name="`{{f.name}}`" — see lumenjs-spec.md
        // §"Loops In Action") used to be skipped entirely here, based on
        // a leftover, half-finished refactor (the dead code above this
        // comment in git history was the original, correct handling,
        // abandoned mid-way in favor of an incomplete stopgap that just
        // opted out of backtick mustaches instead of processing them).
        // Skipping it left a gap in _muxes; setMuxesIndexes() below pairs
        // muxes positionally by re-scanning the same content string, so
        // that gap produced a muxes entry that was just {start, end} —
        // no rvs/jst/mus — for the skipped mustache. packages/core's
        // setEffects() (_re.js) unconditionally reads mus.rvs.length for
        // every attribute mustache, so this threw a real, uncaught
        // TypeError the moment a real page used this documented syntax
        // inside a :for loop (found building lumenjs.com's own homepage
        // on V2 — a `:for="features as f"` list with a backtick-wrapped
        // data-name attribute). Backtick-wrapped and plain mustaches need
        // identical rvs/jst/mus handling — the backtick is just a
        // delimiter in the attribute's literal text, not a different kind
        // of expression — so this now processes both the same way.
        let JST = acorn.parse(mux, { ecmaVersion: "latest" });
        let rvs = [];
        let vss = this.collectVariableUsageFromAST(JST, {
          excludeBuiltins: true,// (default true) — filter out JS global/builtin names
          extraBuiltins: [],//Array<string> (default []) -- add more names to filter
        });
        for (let X = 0; X < vss.length; X++) {
          rvs.push(vss[X]);
          this.reactiveVariables.push(vss[X]);
        }
        rvs = rvs.filter((value, index, self) => {
          return self.indexOf(value) === index;
        });
        // The expression's AST (JST) is only needed here, to find its reactive variables: the runtime evaluates the
        // `mus` text and never reads it. Shipping it was ~85% of a built app.js (console.roxyon.com: 6.6 of 7.9 MB).
        _muxes.push({
          "mus": mux,
          "rvs": rvs
        });

        // Append the part of the string before the match
        content += _t.substring(lastIndex, _m.index);
        // Append the replacement string
        content += "{{" + mux + "}}";
        // Update the last index to the end of the current match
        lastIndex = _m.index + _m[0].length;
      } catch (e) {
        hasError = true;
        // Invalid JS, ignore or report
        content += _t.substring(lastIndex, _m.index);
        content += "{{ /*Invalid Javascript Code*/ }}";
        console.log("Invalid JS", _m[0]);//, e);
      }

    }

    if (!hasError) content += _t.substring(lastIndex);


    _muxes = this.setMuxesIndexes(content, _muxes);

    return [_muxes, content];
  }

  setMuxesIndexes(content, _muxes) {
    let muxes = [];
    let lastIndex = 0;
    let i = 0;
    let _m;
    while ((_m = this.moustachePattern.exec(content)) != null) {

      muxes.push(
        {
          ..._muxes[i],
          "start": _m.index,
          "end": _m.index + _m[0].length
        });

      lastIndex = _m.index + _m[0].length;
      i++;
    }

    return muxes;
  }

  parse(html, options) {
    if (options === void 0) {
      options = {};
    }

    options || (options = {});
    options.components || (options.components = this.empty);

    html = this.removeComments(html);

    var result = [];
    var arr = [];
    var current;
    var level = -1;
    var inComponent = false;
    // 2026-09-18: see the fuller comment further down (where this gets set
    // true) — <script>/<style> are raw text in real HTML, so any tag-
    // looking substring the developer's own JS string/template literal
    // happens to contain (very common — building real HTML markup as a
    // string) must not be treated as a real tag by this loop. Reuses the
    // exact skip mechanism inComponent already has, just for a second,
    // independent reason to skip.
    var inRawText = false;
    var par = this;

    if (html.indexOf('<') !== 0) {
      var end = html.indexOf('<');
      let zl = end === -1 ? html : html.substring(0, end);
      let mssx = this._getMs2(zl);

      let textObj = {
        type: 'text',
        content: mssx[1],
        mss: mssx[0],
      };

      result.push(textObj);
    }


    html.replace(this.tagRE, async function (tag, index) {
      if (inComponent || inRawText) {
        if (tag !== '</' + current.name + '>') {
          return '';
        } else {
          inComponent = false;
          inRawText = false;
        }
      }

      var isOpen = tag.charAt(1) !== '/';
      var start = index + tag.length;
      var nextChar = html.charAt(start);
      var parent;

      if (isOpen) {
        level++;
        current = par.parseTag(tag);

        // 2026-09-18, real bug found and fixed: <script>/<style> are raw
        // text in real HTML — nothing inside them (however tag-like it
        // looks) is a real tag until the matching closing tag. This loop
        // used to have no such notion at all, so a tag-looking substring
        // inside a script's OWN JS string/template literal (`var frm =
        // "<div>...";` — completely ordinary, real code, found breaking a
        // real, unmodified V1 project's form.view) got processed as if it
        // were a real element, corrupting `current`/`level` for everything
        // parsed after it. Combined with the matching `hl` boundary fix
        // below (which finds the REAL `</script>`, not just the first
        // "<") and the inRawText skip-check above (which ignores every
        // match in between) — the two together are both required; either
        // alone leaves the other half of this bug live.
        if (current.type === 'tag' && (current.name === 'script' || current.name === 'style')) {
          inRawText = true;
        }

        if (current.type === 'tag' && current.name && options.components && options.components[current.name]) {
          current.type = 'component';
          inComponent = true;
        }

        if (!current.isV && !inComponent && nextChar && nextChar !== '<' && Array.isArray(current.children)) {
          let end;
          // 2026-09-18, real bug found and fixed: a <script> (or <style>)
          // block is raw text in real HTML — the ONLY thing that legally
          // ends it is a literal closing tag, never a bare "<" — but this
          // boundary-finder used to stop at the very first "<" found
          // anywhere after the opening tag, full stop. Any real script
          // building HTML as a JS string (a `var frm = "<div>...";` or
          // `` `<div>...` `` pattern — an extremely common, completely
          // ordinary thing to write, found breaking a real, unmodified V1
          // project's real form.view) silently truncated the ENTIRE rest
          // of that <script> block at that inner "<", with no error —
          // acorn then parsed only the truncated prefix, and the
          // remainder (real markup meant to stay untouched HTML, not become
          // parsed nodes) got walked as if it were the page's own DOM
          // structure. `<script>`/`<style>` now specifically look for
          // their real closing tag (case-insensitive, matching real
          // browser HTML parsing); every other tag keeps the exact same
          // first-"<" behavior as before — this is deliberately scoped
          // narrowly, not a general HTML-parsing rewrite.
          if (current.name === 'script' || current.name === 'style') {
            let closeRe = new RegExp('</\\s*' + current.name + '\\s*>', 'i');
            let m = closeRe.exec(html.slice(start));
            end = m ? start + m.index : html.length;
          } else {
            end = html.indexOf('<', start);
            while (html.charAt(end + 1) == " ") {
              end = html.indexOf('<', start + ((end + 1) - start));
            }
          }
          let hl = html.slice(start, end);

          let mssx = null;
          if (current.name != 'script') mssx = par._getMs2(hl);
          let textObj = {
            type: 'text',
            content: (current.name == 'script') ? "" : mssx[1],
            ...(current.name == 'script' ? scriptPayload(hl) : { mss: mssx[0] }),
            tag: current.name
          };

          current.children.push(textObj);
        }


        if (level === 0) {
          result.push(current);
        }

        parent = arr[level - 1];

        if (parent && parent.children) {
          parent.children.push(current);
        }

        arr[level] = current;

      }

      if (!isOpen || current.isV) {
        if (level > -1 && (current.isV || current.name === tag.slice(2, -1))) {
          level--;

          current = level === -1 ? result : arr[level];
        }

        if (!inComponent && nextChar !== '<' && nextChar) {
          parent = level === -1 ? result : arr[level].children;

          var _end = html.indexOf('<', start);
          var content = html.slice(start, _end === -1 ? undefined : _end);

          // V1 parity: whitespace between two sibling elements is a real text node in V1 (dev serves the raw view;
          // `lm build`'s conservativeCollapse keeps one space too). It is what separates inline/inline-block
          // siblings (chips, buttons) and what keeps newlines between inline siblings inside <pre>. Dropping it
          // made V2 render those rows a space-width tighter. Whitespace after the last tag of the file is still dropped.
          let wsOnly = par.whitespaceRE.test(content);

          if (wsOnly ? (_end > -1 && parent && Array.isArray(parent)) : true) {
            if (parent && Array.isArray(parent)) {
              if (wsOnly) {
                parent.push({ type: 'text', content: content, mss: [] });
              } else {
                let mssx = par._getMs2(content);

                let textObj = {
                  type: 'text',
                  content: mssx[1],
                  mss: mssx[0],
                };
                parent.push(textObj);



              }
            }
          }
        }
      }
    });
    return result;
  };

  collectVariableUsageFromAST(ast, options = {}) {
    const {
      excludeBuiltins = true,
      extraBuiltins = []
    } = options;

    // ------------- builtin set (browser + node + general) -------------
    const DEFAULT_BUILTINS = new Set([
      "undefined", "NaN", "Infinity", "null", "true", "false",
      "Object", "Function", "Boolean", "Symbol", "Error", "EvalError", "RangeError",
      "ReferenceError", "SyntaxError", "TypeError", "URIError", "Number", "BigInt",
      "Math", "Date", "String", "RegExp", "Array", "Map", "Set", "WeakMap", "WeakSet",
      "Promise", "Reflect", "Proxy", "Intl", "JSON", "Atomics", "SharedArrayBuffer",
      "ArrayBuffer", "DataView", "WeakRef", "FinalizationRegistry",
      "console", "window", "document", "navigator", "location", "localStorage",
      "sessionStorage", "fetch", "XMLHttpRequest", "setTimeout", "clearTimeout",
      "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame",
      "process", "global", "globalThis", "require", "module", "exports", "Buffer",
      "parseInt", "parseFloat", "isFinite", "isNaN", "encodeURI", "decodeURI",
      "encodeURIComponent", "decodeURIComponent", "escape", "unescape"
    ]);
    const builtinSet = new Set([...DEFAULT_BUILTINS, ...extraBuiltins]);

    // ---------- helpers for scope / binding analysis (two-pass) ----------
    function createScope(parent = null, isFunction = false) {
      return { parent, isFunction: !!isFunction, names: new Set() };
    }

    const scopeForNode = new WeakMap();    // node -> scope object (for nodes which create a scope)
    const bindingIdNodes = new WeakSet();  // identifier nodes that are *bindings*
    const allDeclaredNames = new Set();    // all declared names encountered

    // Mark pattern bindings (destructuring, rest, assignment patterns)
    function markPatternBindings(pattern, scope, kind = "var") {
      if (!pattern) return;
      switch (pattern.type) {
        case "Identifier":
          bindingIdNodes.add(pattern);
          declareInScope(pattern.name, kind, scope);
          allDeclaredNames.add(pattern.name);
          break;
        case "ArrayPattern":
          for (const el of pattern.elements) if (el) markPatternBindings(el, scope, kind);
          break;
        case "ObjectPattern":
          for (const p of pattern.properties) {
            if (p.type === "Property") markPatternBindings(p.value, scope, kind);
            else if (p.type === "RestElement") markPatternBindings(p.argument, scope, kind);
          }
          break;
        case "RestElement":
          markPatternBindings(pattern.argument, scope, kind);
          break;
        case "AssignmentPattern":
          markPatternBindings(pattern.left, scope, kind);
          break;
        default:
          break;
      }
    }

    // declare name according to kind (var/function hoist to function-like scope)
    function declareInScope(name, kind, currentScope) {
      if (!name || !currentScope) return;
      if (kind === "var" || kind === "function") {
        // hoist to nearest function-ish (or program)
        let s = currentScope;
        while (s && !s.isFunction && s.parent) s = s.parent;
        s.names.add(name);
      } else {
        // let/const/class/param -> current block scope
        currentScope.names.add(name);
      }
    }

    // PASS A: build scopes & mark declarations
    function buildScopes(node, currentScope) {
      if (!node || typeof node !== "object") return;

      switch (node.type) {
        case "Program": {
          scopeForNode.set(node, currentScope);
          for (const stmt of node.body) buildScopes(stmt, currentScope);
          return;
        }

        case "FunctionDeclaration": {
          // name binds in outer scope (hoisted-ish)
          if (node.id) {
            bindingIdNodes.add(node.id);
            declareInScope(node.id.name, "function", currentScope);
            allDeclaredNames.add(node.id.name);
          }
          const fnScope = createScope(currentScope, true);
          scopeForNode.set(node, fnScope);
          for (const p of node.params) markPatternBindings(p, fnScope, "param");
          buildScopes(node.body, fnScope);
          return;
        }

        case "FunctionExpression": {
          const fnScope = createScope(currentScope, true);
          scopeForNode.set(node, fnScope);
          if (node.id) { // named function expression binds inside function scope
            bindingIdNodes.add(node.id);
            declareInScope(node.id.name, "let", fnScope);
            allDeclaredNames.add(node.id.name);
          }
          for (const p of node.params) markPatternBindings(p, fnScope, "param");
          buildScopes(node.body, fnScope);
          return;
        }

        case "ArrowFunctionExpression": {
          const fnScope = createScope(currentScope, true);
          scopeForNode.set(node, fnScope);
          for (const p of node.params) markPatternBindings(p, fnScope, "param");
          buildScopes(node.body, fnScope);
          return;
        }

        case "BlockStatement":
        case "StaticBlock":
        case "SwitchStatement": {
          const blockScope = createScope(currentScope, false);
          scopeForNode.set(node, blockScope);
          if (node.type === "SwitchStatement") {
            for (const c of node.cases) buildScopes(c, blockScope);
          } else {
            for (const s of node.body) buildScopes(s, blockScope);
          }
          return;
        }

        case "CatchClause": {
          const catchScope = createScope(currentScope, false);
          scopeForNode.set(node, catchScope);
          if (node.param) markPatternBindings(node.param, catchScope, "let");
          buildScopes(node.body, catchScope);
          return;
        }

        case "ForStatement":
        case "ForInStatement":
        case "ForOfStatement": {
          // loop header may declare block-scoped variables
          const forScope = createScope(currentScope, false);
          scopeForNode.set(node, forScope);
          if (node.init) buildScopes(node.init, forScope);
          if (node.left) buildScopes(node.left, forScope);
          if (node.test) buildScopes(node.test, forScope);
          if (node.update) buildScopes(node.update, forScope);
          buildScopes(node.body, forScope);
          return;
        }

        case "VariableDeclaration": {
          for (const decl of node.declarations || []) {
            // Note: markPatternBindings expects a scope (currentScope)
            markPatternBindings(decl.id, currentScope, node.kind || "var");
            if (decl.init) buildScopes(decl.init, currentScope);
          }
          return;
        }

        case "ClassDeclaration": {
          if (node.id) {
            bindingIdNodes.add(node.id);
            declareInScope(node.id.name, "let", currentScope);
            allDeclaredNames.add(node.id.name);
          }
          if (node.body) buildScopes(node.body, currentScope);
          return;
        }

        case "ImportDeclaration": {
          for (const spec of node.specifiers || []) {
            if (spec.local) {
              bindingIdNodes.add(spec.local);
              declareInScope(spec.local.name, "const", currentScope);
              allDeclaredNames.add(spec.local.name);
            }
          }
          return;
        }

        case "ExportNamedDeclaration":
        case "ExportDefaultDeclaration":
        case "ExportAllDeclaration": {
          if (node.declaration) buildScopes(node.declaration, currentScope);
          return;
        }

        default:
          break;
      }

      // Generic recursive descent
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "range") continue;
        const child = node[key];
        if (Array.isArray(child)) {
          for (const c of child) if (c && typeof c === "object") buildScopes(c, currentScope);
        } else if (child && typeof child === "object") {
          buildScopes(child, currentScope);
        }
      }
    } // end buildScopes

    // initialize root scope and run pass A
    const rootScope = createScope(null, true);
    scopeForNode.set(ast, rootScope);
    buildScopes(ast, rootScope);

    // ---------- PASS B: collect variable-usage identifiers --------------
    const usageSet = new Set();

    // helper: whether identifier (node) is used as a variable value in this context
    function isVariableUsageIdentifier(node, parent, propName) {
      if (!parent) return true;
      // never consider binding identifiers
      if (bindingIdNodes.has(node)) return false;

      // label identifiers
      if ((parent.type === "LabeledStatement" && propName === "label") ||
        ((parent.type === "BreakStatement" || parent.type === "ContinueStatement") && propName === "label")) {
        return false;
      }

      // member expression property (non-computed) -> `obj.x` : property `x` is not a variable usage
      if (parent.type === "MemberExpression" && propName === "property" && parent.computed === false) {
        return false;
      }

      // object literal property key (non-computed) & not shorthand -> skip
      if (parent.type === "Property" && propName === "key" && parent.computed === false && !parent.shorthand) {
        return false;
      }

      // method/class keys
      if ((parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") &&
        propName === "key" && parent.computed === false) {
        return false;
      }

      // import/export specifiers and meta properties
      if (parent.type && (parent.type.startsWith("Import") || parent.type.startsWith("Export") || parent.type === "MetaProperty")) {
        return false;
      }

      // function/class ids (binding) - they should have been marked as binding already, but double-guard:
      if ((parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" || parent.type === "ClassDeclaration") && propName === "id") {
        return false;
      }

      // catch param, var declarator id: they are bindings (double-guard)
      if ((parent.type === "VariableDeclarator" && propName === "id") ||
        (parent.type === "CatchClause" && propName === "param")) {
        return false;
      }

      // IMPORTANT: exclude call/new callee identifiers (we consider callee function names as "function usage", not variable usage in this sense)
      if ((parent.type === "CallExpression" || parent.type === "OptionalCallExpression") && propName === "callee") {
        return false;
      }
      if ((parent.type === "NewExpression") && propName === "callee") {
        return false;
      }

      // Everything else we treat as usage (arguments, binary operands, assignment left/right, update argument, return, test, etc.)
      // Note: computed member expression property (obj[x]) -> propName === 'property' and parent.computed === true -> should be included (variable usage)
      return true;
    }

    // Walk and collect usage identifiers, while keeping scope stack (so we can test declarations if needed)
    const scopeStack = [rootScope];

    function collect(node, parent, propName, index) {
      if (!node || typeof node !== "object") return;

      // push scope if node created one in pass A
      const nodeScope = scopeForNode.get(node);
      if (nodeScope) scopeStack.push(nodeScope);

      // if identifier, decide
      if (node.type === "Identifier") {
        if (isVariableUsageIdentifier(node, parent, propName)) {
          const name = node.name;
          // optionally skip builtins
          if (!(excludeBuiltins && builtinSet.has(name))) {
            usageSet.add(name);
          }
        }
      }

      // recurse children
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "range") continue;
        const child = node[key];
        if (Array.isArray(child)) {
          for (let i = 0; i < child.length; i++) {
            const c = child[i];
            if (c && typeof c === "object") collect(c, node, key, i);
          }
        } else if (child && typeof child === "object") {
          collect(child, node, key, null);
        }
      }

      // pop scope
      if (nodeScope) scopeStack.pop();
    }

    collect(ast, null, null, null);

    // V1 nested-mustache syntax: inside {{...}}, a backtick segment is an
    // expression whose value is substituted in (`arr[\`idx\`]` reads
    // arr[idx]; the engine's getVal() does the substitution). To acorn it's
    // a plain template literal, so the names inside were never collected —
    // `idx` wasn't reactive, and a mustache whose only names sat inside
    // backticks never rendered at all. Parse each ${}-free segment's text.
    const self = this;
    (function findTpl(node) {
      if (!node || typeof node !== "object") return;
      if (node.type === "TemplateLiteral" && node.expressions.length === 0 && node.quasis.length === 1) {
        const inner = node.quasis[0].value.cooked;
        if (inner && inner.trim()) {
          try {
            const innerAst = _acorn.parse(inner, { ecmaVersion: "latest", sourceType: "script" });
            for (const n of self.collectVariableUsageFromAST(innerAst, options)) usageSet.add(n);
          } catch (e) { /* plain text, not an expression */ }
        }
        return;
      }
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "range") continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach(findTpl);
        else if (child && typeof child === "object") findTpl(child);
      }
    })(ast);

    // return sorted unique array
    return Array.from(usageSet).sort();
  }
}

function _hst(html) {
  return new hst(html);
}

exports.parseScriptJs = parseScriptJs;
exports.hst_markSvg = hst_markSvg;
exports.hst = hst;
exports._hst = _hst;
