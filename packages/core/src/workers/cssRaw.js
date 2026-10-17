let _w = self;
var commentre = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g

function parseMe(css, options) {
    options = options || {};

    /**
     * Positional.
     */

    var lineno = 1;
    var column = 1;

    /**
     * Update lineno and column based on `str`.
     */

    function updatePosition(str) {
        var lines = str.match(/\n/g);
        if (lines) lineno += lines.length;
        var i = str.lastIndexOf('\n');
        column = ~i ? str.length - i : column + str.length;
    }

    /**
     * Mark position and patch `node.position`.
     */

    function position() {
        var start = { line: lineno, column: column };
        return function (node) {
            node.position = new Position(start);
            whitespace();
            return node;
        };
    }

    /**
     * Store position information for a node
     */

    function Position(start) {
        this.start = start;
        this.end = { line: lineno, column: column };
        this.source = options.source;
    }

    /**
     * Non-enumerable source string
     */

    Position.prototype.content = css;

    /**
     * Error `msg`.
     */

    var errorsList = [];

    function error(msg) {
        var err = new Error(options.source + ':' + lineno + ':' + column + ': ' + msg);
        err.reason = msg;
        err.filename = options.source;
        err.line = lineno;
        err.column = column;
        err.source = css;

        if (options.silent) {
            errorsList.push(err);
        } else {
            throw err;
        }
    }

    /**
     * Parse stylesheet.
     */

    function stylesheet() {
        var rulesList = rules();

        return {
            type: 'stylesheet',
            stylesheet: {
                source: options.source,
                rules: rulesList,
                parsingErrors: errorsList
            }
        };
    }

    /**
     * Opening brace.
     */

    function open() {
        return match(/^{\s*/);
    }

    /**
     * Closing brace.
     */

    function close() {
        return match(/^}/);
    }

    /**
     * Parse ruleset.
     */

    function rules() {
        var node;
        var rules = [];
        whitespace();
        comments(rules);
        while (css.length && css.charAt(0) != '}' && (node = atrule() || rule())) {
            if (node !== false) {
                rules.push(node);
                comments(rules);
            }
        }
        return rules;
    }

    /**
     * Match `re` and return captures.
     */

    function match(re) {
        var m = re.exec(css);
        if (!m) return;
        var str = m[0];
        updatePosition(str);
        css = css.slice(str.length);
        return m;
    }

    /**
     * Parse whitespace.
     */

    function whitespace() {
        match(/^\s*/);
    }

    /**
     * Parse comments;
     */

    function comments(rules) {
        var c;
        rules = rules || [];
        while (c = comment()) {
            if (c !== false) {
                rules.push(c);
            }
        }
        return rules;
    }

    /**
     * Parse comment.
     */

    function comment() {
        var pos = position();
        if ('/' != css.charAt(0) || '*' != css.charAt(1)) return;

        var i = 2;
        while ("" != css.charAt(i) && ('*' != css.charAt(i) || '/' != css.charAt(i + 1))) ++i;
        i += 2;

        if ("" === css.charAt(i - 1)) {
            return error('End of comment missing');
        }

        var str = css.slice(2, i - 2);
        column += 2;
        updatePosition(str);
        css = css.slice(i);
        column += 2;

        return pos({
            type: 'comment',
            comment: str
        });
    }

    /**
     * Parse selector.
     */

    function selector() {
        var m = match(/^([^{]+)/);
        if (!m) return;
        /* @fix Remove all comments from selectors
         * http://ostermiller.org/findcomment.html */
        return trim(m[0])
            .replace(/\/\*([^*]|[\r\n]|(\*+([^*/]|[\r\n])))*\*\/+/g, '')
            .replace(/"(?:\\"|[^"])*"|'(?:\\'|[^'])*'/g, function (m) {
                return m.replace(/,/g, '\u200C');
            })
            .split(/\s*(?![^(]*\)),\s*/)
            .map(function (s) {
                return s.replace(/\u200C/g, ',');
            });
    }

    /**
     * Parse declaration.
     */

    function declaration() {
        var pos = position();

        // prop
        var prop = match(/^(\*?[-#\/\*\\\w]+(\[[0-9a-z_-]+\])?)\s*/);
        if (!prop) return;
        prop = trim(prop[0]);

        // :
        if (!match(/^:\s*/)) return error("property missing ':'");

        // val
        var val = match(/^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^\)]*?\)|[^};])+)/);

        var ret = pos({
            type: 'declaration',
            property: prop.replace(commentre, ''),
            value: val ? trim(val[0]).replace(commentre, '') : ''
        });

        // ;
        match(/^[;\s]*/);

        return ret;
    }

    /**
     * Parse declarations.
     */

    function declarations() {
        var decls = [];

        if (!open()) return error("missing '{'");
        comments(decls);

        // declarations
        var decl;
        while (decl = declaration()) {
            if (decl !== false) {
                decls.push(decl);
                comments(decls);
            }
        }

        if (!close()) return error("missing '}'");
        return decls;
    }

    /**
     * Parse keyframe.
     */

    function keyframe() {
        var m;
        var vals = [];
        var pos = position();

        while (m = match(/^((\d+\.\d+|\.\d+|\d+)%?|[a-z]+)\s*/)) {
            vals.push(m[1]);
            match(/^,\s*/);
        }

        if (!vals.length) return;

        return pos({
            type: 'keyframe',
            values: vals,
            declarations: declarations()
        });
    }

    /**
     * Parse keyframes.
     */

    function atkeyframes() {
        var pos = position();
        var m = match(/^@([-\w]+)?keyframes\s*/);

        if (!m) return;
        var vendor = m[1];

        // identifier
        var m = match(/^([-\w]+)\s*/);
        if (!m) return error("@keyframes missing name");
        var name = m[1];

        if (!open()) return error("@keyframes missing '{'");

        var frame;
        var frames = comments();
        while (frame = keyframe()) {
            frames.push(frame);
            frames = frames.concat(comments());
        }

        if (!close()) return error("@keyframes missing '}'");

        return pos({
            type: 'keyframes',
            name: name,
            vendor: vendor,
            keyframes: frames
        });
    }

    /**
     * Parse supports.
     */

    function atsupports() {
        var pos = position();
        var m = match(/^@supports *([^{]+)/);

        if (!m) return;
        var supports = trim(m[1]);

        if (!open()) return error("@supports missing '{'");

        var style = comments().concat(rules());

        if (!close()) return error("@supports missing '}'");

        return pos({
            type: 'supports',
            supports: supports,
            rules: style
        });
    }

    /**
     * Parse host.
     */

    function athost() {
        var pos = position();
        var m = match(/^@host\s*/);

        if (!m) return;

        if (!open()) return error("@host missing '{'");

        var style = comments().concat(rules());

        if (!close()) return error("@host missing '}'");

        return pos({
            type: 'host',
            rules: style
        });
    }

    /**
     * Parse media.
     */

    function atmedia() {
        var pos = position();
        var m = match(/^@media *([^{]+)/);

        if (!m) return;
        var media = trim(m[1]);

        if (!open()) return error("@media missing '{'");

        var style = comments().concat(rules());

        if (!close()) return error("@media missing '}'");

        return pos({
            type: 'media',
            media: media,
            rules: style
        });
    }


    /**
     * Parse custom-media.
     */

    function atcustommedia() {
        var pos = position();
        var m = match(/^@custom-media\s+(--[^\s]+)\s*([^{;]+);/);
        if (!m) return;

        return pos({
            type: 'custom-media',
            name: trim(m[1]),
            media: trim(m[2])
        });
    }

    /**
     * Parse paged media.
     */

    function atpage() {
        var pos = position();
        var m = match(/^@page */);
        if (!m) return;

        var sel = selector() || [];

        if (!open()) return error("@page missing '{'");
        var decls = comments();

        // declarations
        var decl;
        while (decl = declaration()) {
            decls.push(decl);
            decls = decls.concat(comments());
        }

        if (!close()) return error("@page missing '}'");

        return pos({
            type: 'page',
            selectors: sel,
            declarations: decls
        });
    }

    /**
     * Parse document.
     */

    function atdocument() {
        var pos = position();
        var m = match(/^@([-\w]+)?document *([^{]+)/);
        if (!m) return;

        var vendor = trim(m[1]);
        var doc = trim(m[2]);

        if (!open()) return error("@document missing '{'");

        var style = comments().concat(rules());

        if (!close()) return error("@document missing '}'");

        return pos({
            type: 'document',
            document: doc,
            vendor: vendor,
            rules: style
        });
    }

    /**
     * Parse font-face.
     */

    function atfontface() {
        var pos = position();
        var m = match(/^@font-face\s*/);
        if (!m) return;

        if (!open()) return error("@font-face missing '{'");
        var decls = comments();

        // declarations
        var decl;
        while (decl = declaration()) {
            decls.push(decl);
            decls = decls.concat(comments());
        }

        if (!close()) return error("@font-face missing '}'");

        return pos({
            type: 'font-face',
            declarations: decls
        });
    }

    /**
     * Parse import
     */

    var atimport = _compileAtrule('import');

    /**
     * Parse charset
     */

    var atcharset = _compileAtrule('charset');

    /**
     * Parse namespace
     */

    var atnamespace = _compileAtrule('namespace');

    /**
     * Parse non-block at-rules
     */


    function _compileAtrule(name) {
        var re = new RegExp('^@' + name + '\\s*([^;]+);');
        return function () {
            var pos = position();
            var m = match(re);
            if (!m) return;
            var ret = { type: name };
            ret[name] = m[1].trim();
            return pos(ret);
        }
    }

    /**
     * Parse at rule.
     */

    function atrule() {
        if (css[0] != '@') return;

        return atkeyframes()
            || atmedia()
            || atcustommedia()
            || atsupports()
            || atimport()
            || atcharset()
            || atnamespace()
            || atdocument()
            || atpage()
            || athost()
            || atfontface();
    }

    /**
     * Parse rule.
     */

    function rule() {
        var pos = position();
        var sel = selector();

        if (!sel) return error('selector missing');
        comments();

        return pos({
            type: 'rule',
            selectors: sel,
            declarations: declarations()
        });
    }

    return addParent(stylesheet());
};

/**
 * Trim `str`.
 */

function trim(str) {
    return str ? str.replace(/^\s+|\s+$/g, '') : '';
}

/**
 * Adds non-enumerable parent node reference to each node.
 */

function addParent(obj, parent) {
    var isNode = obj && typeof obj.type === 'string';
    var childParent = isNode ? obj : parent;

    for (var k in obj) {
        var value = obj[k];
        if (Array.isArray(value)) {
            value.forEach(function (v) { addParent(v, childParent); });
        } else if (value && typeof value === 'object') {
            addParent(value, childParent);
        }
    }

    if (isNode) {
        Object.defineProperty(obj, 'parent', {
            configurable: true,
            writable: true,
            enumerable: false,
            value: parent || null
        });
    }

    return obj;
}





/*COMPRESSS*/

class Compress {
    options = {};
    indentation = null;
    constructor(options) {
        this.options = options ?? {};
        this.indentation = options?.indent ?? null;
    }
}

Compress.prototype.emit = function (str) {
    return str;
};

/**
 * Visit `node`.
 */

Compress.prototype.visit = function (node) {
    return this[node.type](node);
};

/**
 * Map visit over array of `nodes`, optionally using a `delim`
 */

Compress.prototype.mapVisit = function (nodes, delim) {
    var buf = '';
    delim = delim || '';

    for (var i = 0, length = nodes.length; i < length; i++) {
        buf += this.visit(nodes[i]);
        if (delim && i < length - 1) buf += this.emit(delim);
    }

    return buf;
};


Compress.prototype.compile = function (node) {
    return node.stylesheet
        .rules.map(this.visit, this)
        .join('');
};

/**
 * Visit comment node.
 */

Compress.prototype.comment = function (node) {
    return this.emit('', node.position);
};

/**
 * Visit import node.
 */

Compress.prototype.import = function (node) {
    return this.emit('@import ' + node.import + ';', node.position);
};

/**
 * Visit media node.
 */

Compress.prototype.media = function (node) {
    return this.emit('@media ' + node.media, node.position)
        + this.emit('{')
        + this.mapVisit(node.rules)
        + this.emit('}');
};

/**
 * Visit document node.
 */

Compress.prototype.document = function (node) {
    var doc = '@' + (node.vendor || '') + 'document ' + node.document;

    return this.emit(doc, node.position)
        + this.emit('{')
        + this.mapVisit(node.rules)
        + this.emit('}');
};

/**
 * Visit charset node.
 */

Compress.prototype.charset = function (node) {
    return this.emit('@charset ' + node.charset + ';', node.position);
};

/**
 * Visit namespace node.
 */

Compress.prototype.namespace = function (node) {
    return this.emit('@namespace ' + node.namespace + ';', node.position);
};

/**
 * Visit supports node.
 */

Compress.prototype.supports = function (node) {
    return this.emit('@supports ' + node.supports, node.position)
        + this.emit('{')
        + this.mapVisit(node.rules)
        + this.emit('}');
};

/**
 * Visit keyframes node.
 */

Compress.prototype.keyframes = function (node) {
    return this.emit('@'
        + (node.vendor || '')
        + 'keyframes '
        + node.name, node.position)
        + this.emit('{')
        + this.mapVisit(node.keyframes)
        + this.emit('}');
};

/**
 * Visit keyframe node.
 */

Compress.prototype.keyframe = function (node) {
    var decls = node.declarations;

    return this.emit(node.values.join(','), node.position)
        + this.emit('{')
        + this.mapVisit(decls)
        + this.emit('}');
};

/**
 * Visit page node.
 */

Compress.prototype.page = function (node) {
    var sel = node.selectors.length
        ? node.selectors.join(', ')
        : '';

    return this.emit('@page ' + sel, node.position)
        + this.emit('{')
        + this.mapVisit(node.declarations)
        + this.emit('}');
};

/**
 * Visit font-face node.
 */

Compress.prototype['font-face'] = function (node) {
    return this.emit('@font-face', node.position)
        + this.emit('{')
        + this.mapVisit(node.declarations)
        + this.emit('}');
};

/**
 * Visit host node.
 */

Compress.prototype.host = function (node) {
    return this.emit('@host', node.position)
        + this.emit('{')
        + this.mapVisit(node.rules)
        + this.emit('}');
};

/**
 * Visit custom-media node.
 */

Compress.prototype['custom-media'] = function (node) {
    return this.emit('@custom-media ' + node.name + ' ' + node.media + ';', node.position);
};

/**
 * Visit rule node.
 */

Compress.prototype.rule = function (node) {
    var decls = node.declarations;
    if (!decls.length) return '';

    return this.emit(node.selectors.join(','), node.position)
        + this.emit('{')
        + this.mapVisit(decls)
        + this.emit('}');
};

/**
 * Visit declaration node.
 */

Compress.prototype.declaration = function (node) {
    return this.emit(node.property + ':' + node.value, node.position) + this.emit(';');
};


/*END COMPRESSS*/


















/*IDENTITY*/

class Identity {
    options = {};
    indentation = null;
    constructor(options) {
        this.options = options ?? {};
        this.indentation = options?.indent ?? null;
    }
}

Identity.prototype.emit = function (str) {
    return str;
};

/**
 * Visit `node`.
 */

Identity.prototype.visit = function (node) {
    return this[node.type](node);
};

/**
 * Map visit over array of `nodes`, optionally using a `delim`
 */

Identity.prototype.mapVisit = function (nodes, delim) {
    var buf = '';
    delim = delim || '';

    for (var i = 0, length = nodes.length; i < length; i++) {
        buf += this.visit(nodes[i]);
        if (delim && i < length - 1) buf += this.emit(delim);
    }

    return buf;
};




Identity.prototype.compile = function (node) {
    return this.stylesheet(node);
};

/**
 * Visit stylesheet node.
 */

Identity.prototype.stylesheet = function (node) {
    return this.mapVisit(node.stylesheet.rules, '\n\n');
};

/**
 * Visit comment node.
 */

Identity.prototype.comment = function (node) {
    return this.emit(this.indent() + '/*' + node.comment + '*/', node.position);
};

/**
 * Visit import node.
 */

Identity.prototype.import = function (node) {
    return this.emit('@import ' + node.import + ';', node.position);
};

/**
 * Visit media node.
 */

Identity.prototype.media = function (node) {
    return this.emit('@media ' + node.media, node.position)
        + this.emit(
            ' {\n'
            + this.indent(1))
        + this.mapVisit(node.rules, '\n\n')
        + this.emit(
            this.indent(-1)
            + '\n}');
};

/**
 * Visit document node.
 */

Identity.prototype.document = function (node) {
    var doc = '@' + (node.vendor || '') + 'document ' + node.document;

    return this.emit(doc, node.position)
        + this.emit(
            ' '
            + ' {\n'
            + this.indent(1))
        + this.mapVisit(node.rules, '\n\n')
        + this.emit(
            this.indent(-1)
            + '\n}');
};

/**
 * Visit charset node.
 */

Identity.prototype.charset = function (node) {
    return this.emit('@charset ' + node.charset + ';', node.position);
};

/**
 * Visit namespace node.
 */

Identity.prototype.namespace = function (node) {
    return this.emit('@namespace ' + node.namespace + ';', node.position);
};

/**
 * Visit supports node.
 */

Identity.prototype.supports = function (node) {
    return this.emit('@supports ' + node.supports, node.position)
        + this.emit(
            ' {\n'
            + this.indent(1))
        + this.mapVisit(node.rules, '\n\n')
        + this.emit(
            this.indent(-1)
            + '\n}');
};

/**
 * Visit keyframes node.
 */

Identity.prototype.keyframes = function (node) {
    return this.emit('@' + (node.vendor || '') + 'keyframes ' + node.name, node.position)
        + this.emit(
            ' {\n'
            + this.indent(1))
        + this.mapVisit(node.keyframes, '\n')
        + this.emit(
            this.indent(-1)
            + '}');
};

/**
 * Visit keyframe node.
 */

Identity.prototype.keyframe = function (node) {
    var decls = node.declarations;

    return this.emit(this.indent())
        + this.emit(node.values.join(', '), node.position)
        + this.emit(
            ' {\n'
            + this.indent(1))
        + this.mapVisit(decls, '\n')
        + this.emit(
            this.indent(-1)
            + '\n'
            + this.indent() + '}\n');
};

/**
 * Visit page node.
 */

Identity.prototype.page = function (node) {
    var sel = node.selectors.length
        ? node.selectors.join(', ') + ' '
        : '';

    return this.emit('@page ' + sel, node.position)
        + this.emit('{\n')
        + this.emit(this.indent(1))
        + this.mapVisit(node.declarations, '\n')
        + this.emit(this.indent(-1))
        + this.emit('\n}');
};

/**
 * Visit font-face node.
 */

Identity.prototype['font-face'] = function (node) {
    return this.emit('@font-face ', node.position)
        + this.emit('{\n')
        + this.emit(this.indent(1))
        + this.mapVisit(node.declarations, '\n')
        + this.emit(this.indent(-1))
        + this.emit('\n}');
};

/**
 * Visit host node.
 */

Identity.prototype.host = function (node) {
    return this.emit('@host', node.position)
        + this.emit(
            ' {\n'
            + this.indent(1))
        + this.mapVisit(node.rules, '\n\n')
        + this.emit(
            this.indent(-1)
            + '\n}');
};

/**
 * Visit custom-media node.
 */

Identity.prototype['custom-media'] = function (node) {
    return this.emit('@custom-media ' + node.name + ' ' + node.media + ';', node.position);
};

/**
 * Visit rule node.
 */

Identity.prototype.rule = function (node) {
    var indent = this.indent();
    var decls = node.declarations;
    if (!decls.length) return '';

    return this.emit(node.selectors.map(function (s) { return indent + s }).join(',\n'), node.position)
        + this.emit(' {\n')
        + this.emit(this.indent(1))
        + this.mapVisit(decls, '\n')
        + this.emit(this.indent(-1))
        + this.emit('\n' + this.indent() + '}');
};

/**
 * Visit declaration node.
 */

Identity.prototype.declaration = function (node) {
    return this.emit(this.indent())
        + this.emit(node.property + ': ' + node.value, node.position)
        + this.emit(';');
};

/**
 * Increase, decrease or return current indentation.
 */

Identity.prototype.indent = function (level) {
    this.level = this.level || 1;

    if (null != level) {
        this.level += level;
        return '';
    }

    return Array(this.level).join(this.indentation || '  ');
};

/*END IDENTITY*/




function stringifyMe(node, options) {
    options = options || {};

    var compiler = options.compress
        ? new Compress(options)
        : new Identity(options);

    // source maps
    if (options.sourcemap) {
        var sourcemaps = require('./source-map-support');
        sourcemaps(compiler);

        var code = compiler.compile(node);
        compiler.applySourceMaps();

        var map = options.sourcemap === 'generator'
            ? compiler.map
            : compiler.map.toJSON();

        return { code: code, map: map };
    }

    var code = compiler.compile(node);
    return code;
};


// $('style[scoped]').each(function () {
//     var ojj = parseMe($(this).text());

//     let pre = ".kiki";
//     for (let x = 0; x < ojj?.stylesheet?.rules?.length; x++) {
//         for (let y = 0; y < ojj?.stylesheet?.rules[x].selectors.length; y++) {
//             ojj.stylesheet.rules[x].selectors[y] = pre + " " + ojj?.stylesheet?.rules[x].selectors[y];
//         }
//     }
//     var okkN = stringifyMe(ojj, { compress: false });
//     var okk = stringifyMe(ojj, { compress: true });
//     $(this).text(okk);
//     cl([ojj, okkN, okk]);
// });


(function () {
    'use strict';
    _w.on('css-ready', function (e) {
        var csses = e.data.csses;
        var key = e.data.key;
        var pre = e.data.pre;

        for (let index = 0; index < csses.length; index++) {
            var css = csses[index];

            var ojj = parseMe(css, { silent: true });
            for (let x = 0; x < ojj?.stylesheet?.rules?.length; x++) {
                for (let y = 0; y < ojj?.stylesheet?.rules[x].selectors.length; y++) {
                    if (ojj?.stylesheet?.rules[x].selectors[y] == "*") ojj.stylesheet.rules[x].selectors[y] = pre + ", " + pre + " " + ojj?.stylesheet?.rules[x].selectors[y];
                    else ojj.stylesheet.rules[x].selectors[y] = pre + " " + ojj?.stylesheet?.rules[x].selectors[y];
                }
            }
            var okk = stringifyMe(ojj, { compress: true });
            csses[index] = okk;
        }

        _w.trigger('css-ready', {
            "csses": csses,
            key: key
        });
    });
    return;
})();