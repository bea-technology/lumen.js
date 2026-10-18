//new app.js

var fs = require('fs');
const path = require("path");
const chokidar = require('chokidar');
const express = require('express');
var compression = require('compression');
const app = express();
const server = require('http').createServer(app);
var WebSocketServer = require("ws").Server;
var wss = new WebSocketServer({ server: server, path: "/" });
const fcs = require("./fcs.js");
var cl = console.log;

var cookieParser = require('cookie-parser');
var expressSession = require('express-session');
const bodyParser = require('body-parser');
var multer = require('multer');
var upload = multer();

let session = expressSession({
  secret: 'keyboardcat',
  resave: true,
  saveUninitialized: true,
  cookie: { maxAge: 9999000 }
});

var config = fcs.getConfig();
var _views = {};
var _layouts = {};
var _tpls = {};

// 2026-09-17: tpls/ dev-mode counterpart to _bp()'s production build
// (see fcs.js's own comment for the full rationale/restriction). Existing
// projects have no tpls/ directory at all, unlike views/layouts (which
// lm create has always scaffolded) — guarded the same way fcs.js's build
// path is, rather than assuming it exists.
function readTpls() {
  return fcs.readTemplates(`${process.cwd()}`);
}

// 2026-09-18, real bug found and fixed: this comment's own assumption
// above ("lm create has always scaffolded views/layouts") turned out
// false for a real migrated V1 project — V1 never had the layouts/
// concept at all (chrome was controlled per-view via hasHeader/hasNav/
// hasFooter settings instead — see the same investigation's other
// findings). `getAllFiles()` was called completely unguarded on
// src/layouts/ (and src/views/, though that one's a safe assumption in
// practice), which throws a real, uncaught `ENOENT` on `fs.readdirSync`
// and kills the entire dev server process outright — not a "some pages
// break" failure, the server never even finishes starting. Guarded the
// same way readTpls() already is.
function readLayouts() {
  let dir = `${process.cwd()}` + path.sep + `src` + path.sep + `layouts` + path.sep;
  return fs.existsSync(dir) ? fcs.linkTemplateReactiveVars(fcs.annotateLayoutRegions(fcs.getAllFiles(dir, {}, false, true)), _tpls) : {};
}
function readViews() {
  let dir = `${process.cwd()}` + path.sep + `src` + path.sep + `views` + path.sep;
  return fs.existsSync(dir) ? fcs.linkTemplateReactiveVars(fcs.getAllFiles(dir, {}, false, true), _tpls) : {};
}

// index.js / project-scripts reactive-global compilation (2026-09-14) —
// dev-mode counterpart to what _bp() (the production build) now does: any
// top-level var/let/const in index.js, or in a /js/*.js file the developer's
// own index.html already references via <script src>, gets rewritten to
// target _vt.Global instead of executing as a plain window global — see
// packages/core's walk.js / _re.js for why (V1's documented convention for
// app-wide state like `isAdmin` was otherwise invisible to V2's reactive
// system). The developer's index.html and /js/ files are untouched on disk;
// this only intercepts what actually gets served, so their existing
// workflow (write a <script src="/js/whatever.js"> tag, same as V1) doesn't
// change. index.js itself needs no tag at all — it's always compiled and
// fetched by the core bundle directly (see ws.js's `!_beaTn` bootstrap).
var _lmServerErrors = []; // errors this dev server hit before Copilot was mounted (handed to it below)
var _compiledScripts = {}; // request path ("/index.js", "/js/whatever.js") -> compiled code
(function buildCompiledScriptsMap() {
  try {
    var projectRoot = `${process.cwd()}`;
    var srcRoot = projectRoot + path.sep + `src`;
    // npm-in-project support (2026-09-16): only engaged if this project
    // actually declared a real dependency — see npm-bundle.js's
    // hasOwnDependencies(). A project with none takes the raw-read path
    // below unconditionally, byte-identical to before this feature existed.
    var hasOwnDeps = fcs.hasOwnDependencies(projectRoot);
    var indexJsPath = srcRoot + path.sep + "index.js";
    if (fs.existsSync(indexJsPath)) {
      var indexJsSrc = hasOwnDeps ? fcs.buildEntryWithImports(indexJsPath, projectRoot) : fs.readFileSync(indexJsPath, "utf8");
      _compiledScripts["/index.js"] = fcs.compileProjectScript(indexJsSrc, "index");
    }
    var indexHtmlPath = srcRoot + path.sep + "index.html";
    if (fs.existsSync(indexHtmlPath)) {
      var localSrcs = fcs.detectLocalProjectScripts(fs.readFileSync(indexHtmlPath, "utf8"));
      for (const src of localSrcs) {
        var scriptPath = srcRoot + src.split("/").join(path.sep);
        if (fs.existsSync(scriptPath)) {
          var scriptSrc = hasOwnDeps ? fcs.buildEntryWithImports(scriptPath, projectRoot) : fs.readFileSync(scriptPath, "utf8");
          _compiledScripts[src] = fcs.compileProjectScript(scriptSrc, src);
        }
      }
    }
  } catch (e) {
    cl("Failed to compile index.js / project scripts for reactivity — serving them raw. " + e.message);
    _lmServerErrors.push("Failed to compile index.js / project scripts: " + e.message);
  }
})();

// Per-project selective plugin bundling (2026-09-16) — dev-server
// counterpart to _bp()'s own wiring; only engaged if the project's own
// package.json declares a dependency matching one of plugins-registry.js's
// real npm package names (selectedProjectPlugins() returns empty
// otherwise — zero cost). Async (esbuild.build, not buildSync — see
// plugins-esbuild-plugin.js), so this runs as its own startup IIFE rather
// than inline in buildCompiledScriptsMap() above.
// The <script>/<link> tags are injected into the served index.html (see
// sendIndexHtml()), never written to the project's own file on disk — a
// detected plugin set changes as the code changes. Requests for the bundle
// itself wait on the in-flight build below rather than 404ing during the
// startup window.
var _pluginsJs = null;
var _pluginsCss = null;
var _pluginsBuildPromise = null;
_pluginsBuildPromise = (async function buildSelectedPluginsBundle() {
  try {
    var projectRoot = `${process.cwd()}`;
    var selected = fcs.selectedProjectPlugins(projectRoot);
    if (!selected.length) return;
    var pluginsEsbuild = require(path.join(__dirname, "plugins-esbuild-plugin.js"));
    _pluginsJs = await pluginsEsbuild.buildSelectedPluginsBundle(selected, projectRoot);
    _pluginsCss = await pluginsEsbuild.buildSelectedCss(selected, projectRoot + path.sep + "node_modules");

  } catch (e) {
    cl("Failed to build the selective plugins bundle — " + e.message);
  }
})();

app.use(compression());
app.use(cookieParser());
app.use(session);

// Lumen Copilot (2026-10-18, dev only): the panel + /__lm/copilot/* routes. See lib/copilot/server.js. Mounted
// before the project's own routes/static files; `lm build` never runs this file.
var _copilot = null;
try {
  const _copilotServer = require(path.join(__dirname, "copilot", "server.js"));
  if (_copilotServer.isEnabled(config)) {
    _copilot = _copilotServer.mount(app, {
      root: `${process.cwd()}`,
      token: process.env.LM_COPILOT_TOKEN || require("crypto").randomBytes(24).toString("hex"),
      getPort: function () { var a = server.address(); return a ? a.port : 0; },
    });
  }
} catch (e) {
  cl("Lumen Copilot is off: " + e.message);
  _copilot = null;
}

async function sendIndexHtml(res, req) {
  let file = `${process.cwd()}` + path.sep + `src` + path.sep + `index.html`;
  let html = fcs.v1CompatIndexHtml(fs.readFileSync(file, 'utf8'));
  if (_pluginsBuildPromise) { try { await _pluginsBuildPromise; } catch (e) { } }
  let tags = "";
  if (_pluginsJs != null && html.indexOf("/js/lumenjs-plugins.js") == -1) {
    tags += `\n    <script src="/js/lumenjs-plugins.js" type="text/javascript"></script>`;
  }
  if (tags) html = html.split("</head>").join(tags + "\n</head>");
  // Plugin CSS before the project's own stylesheets, exactly as `lm build` places it (fcs.placePluginsCss).
  if (_pluginsCss && _pluginsCss.trim() != "" && html.indexOf("/css/lumenjs-plugins.css") == -1) {
    html = fcs.placePluginsCss(html, `<link href="/css/lumenjs-plugins.css" rel="stylesheet" type="text/css" />`);
  }
  if (_copilot) html = _copilot.inject(html, req);
  res.type('text/html').send(html);
}

app.use('/', async function (req, res, next) {
  if (req.path === '/' || req.path === '/index.html') {
    sendIndexHtml(res, req);
    return;
  }
  // A migrated V1 project has no src/js/lm.js yet — serve this CLI's own.
  if (req.path === '/js/lm.js' && !fs.existsSync(`${process.cwd()}` + path.sep + `src` + path.sep + `js` + path.sep + `lm.js`)) {
    res.type('application/javascript').sendFile(path.join(__dirname, 'files', 'libs', 'lm.js'));
    return;
  }
  if (Object.prototype.hasOwnProperty.call(_compiledScripts, req.path)) {
    res.type('application/javascript').send(_compiledScripts[req.path]);
    return;
  }
  // 2026-09-19: wait for the in-flight build (see its own comment above)
  // instead of immediately falling through to a real 404 for these two
  // paths specifically — _pluginsBuildPromise resolves to undefined for a
  // project with nothing selected, so this is a no-op await in that case,
  // not an extra round-trip for every other request.
  if (req.path === '/js/lumenjs-plugins.js' || req.path === '/css/lumenjs-plugins.css') {
    if (_pluginsBuildPromise) { try { await _pluginsBuildPromise; } catch (e) { } }
    if (req.path === '/js/lumenjs-plugins.js' && _pluginsJs != null) {
      res.type('application/javascript').send(_pluginsJs);
      return;
    }
    if (req.path === '/css/lumenjs-plugins.css' && _pluginsCss != null) {
      res.type('text/css').send(_pluginsCss);
      return;
    }
  }
  next();
});
app.use('/', express.static(`${process.cwd()}` + path.sep + `src`));
app.set('etag', false);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());
app.use(upload.array());

wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    try {
      const buffer = Buffer.from(message);
      const data = JSON.parse(buffer.toString());

      if (data.hasOwnProperty('e')) {
        var _data = {
          "e": data.e,
          "_iter": data._iter,
          "payload": {}
        };

        if (data.e == "getfiles") {
          _data['payload'] = {
            "hstFormatVersion": fcs.HST_FORMAT_VERSION,
            "views": _views,
            "layouts": _layouts,
            "tpls": _tpls
          };
        } else if (data.e == "getlayout") {
          _data.payload = _layouts[data.payload];
        } else if (data.e == "getview") {
          _data.payload = _views[data.payload];
        } else if (data.e == "gettpl") {
          // 2026-09-26: the client emits gettpl for a template missing from
          // the embedded payload (vendor/reconnecting-websocket.js's
          // renderViewsTpls), exactly as it emits getview for a view -- but
          // this server only answered getview/getlayout, so a gettpl round
          // trip came back with the empty default payload and the template
          // silently never rendered. _tpls is already maintained alongside
          // _views/_layouts (readTpls), so this just answers from it.
          _data.payload = _tpls[data.payload];
        } else if (data.e == "request") {
          try {
            let pata = data.payload;
            let __data = pata['data'];
            let _body = pata['body'];
            var resa = await API.req(_body['path'], __data, _body['headers'], _body['method'], _body['api'], true);
            let res = await resa.text();
            try {
              res = JSON.parse(res);
            } catch (e) {
            }
            _data.payload = (_body['full']) ? {
              "headers": resa.headers,
              "data": res
            } : res;
            ws.send(JSON.stringify(_data));
          } catch (e) {
            _data.payload = { "code": 108, "error": e.message, "type": "RequestError" };
            ws.send(JSON.stringify(_data));
          }
          return;
        }

        ws.send(JSON.stringify(_data));

      }
    } catch (e) {

    }
  });
}).on('error', (e) => { });

global.app = app;
var fetch = fcs.fetch;
global.fetch = fetch;
global.wss = wss;
global.fs = fs;
global.path = path;

var API = fcs.API;
global.API = API;

if (fs.existsSync(`${process.cwd()}` + path.sep + `src` + path.sep + `app.js`)) {
  require(`${process.cwd()}` + path.sep + `src` + path.sep + `app.js`);
}

app.get('*', function (req, res) {
  let nodes = req.params[0].split("/");
  if (nodes.length) nodes.shift();
  if (fs.existsSync(`${process.cwd()}` + path.sep + `src` + path.sep + `views` + path.sep + nodes[0] + `.view`)) sendIndexHtml(res, req);
  else res.sendFile(`${process.cwd()}` + path.sep + `src` + path.sep + `404.html`);
  return;
});

app.post('*', function (req, res) {
  let nodes = req.params[0].split("/");
  if (nodes.length) nodes.shift();
  if (fs.existsSync(`${process.cwd()}` + path.sep + `src` + path.sep + `views` + path.sep + nodes[0] + `.view`)) sendIndexHtml(res, req);
  else res.sendFile(`${process.cwd()}` + path.sep + `src` + path.sep + `404.html`);
  return;
});

// In-process hot reload for views/layouts (2026-09-14) — replaces relying on
// nodemon's full-process restart for these two directories specifically
// (see startServer() in fcs.js, which now excludes them from its own watch).
// No dropped connections, no full-project re-parse: just the one file that
// changed, re-parsed, broadcast to already-connected clients, which already
// know how to diff-and-render only what actually changed (see ws.js's
// syncViewFiles(), triggered here via the "files-changed" push).
function broadcastFilesChanged() {
  wss.clients.forEach(function (client) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(JSON.stringify({ e: 'files-changed' }));
    }
  });
}

chokidar
  .watch(`${process.cwd()}` + path.sep + `src` + path.sep + `views`, { ignoreInitial: true })
  .on('all', function () {
    _views = readViews();
    broadcastFilesChanged();
  });

chokidar
  .watch(`${process.cwd()}` + path.sep + `src` + path.sep + `layouts`, { ignoreInitial: true })
  .on('all', function () {
    _layouts = readLayouts();
    broadcastFilesChanged();
  });

chokidar
  .watch([
    `${process.cwd()}` + path.sep + `src` + path.sep + `tpls`,
    `${process.cwd()}` + path.sep + `src` + path.sep + `comps`,
  ], { ignoreInitial: true })
  .on('all', function () {
    _tpls = readTpls();
    // host views' reactiveVars depend on the templates they include
    _views = readViews();
    _layouts = readLayouts();
    broadcastFilesChanged();
  });

// 2026-09-21, real complaint found and fixed: this used to fall back to
// server.listen(0) on EADDRINUSE — the OS assigns a genuinely random free
// port, different every time. Since the configured port (3000, almost
// always) is frequently still held by the PREVIOUS dev-server process for
// a brief moment after a file-save-triggered restart (nodemon starts the
// new process before the old one has necessarily finished releasing its
// socket), this fired on a real fraction of ordinary restarts — landing
// on a different, unpredictable port practically every save, not just
// when the port is genuinely occupied by something else. Fixed two ways:
// (1) retry the CONFIGURED port itself a few times first, on a short
// delay — covers the common "previous process hasn't let go yet" case
// with zero port change at all; (2) only after those retries are
// exhausted, fall back to a real, deterministic scan (configured port + 1,
// +2, ...) instead of a random one — still stable/predictable across
// restarts if the port is genuinely unavailable for the whole session
// (e.g. another real project's dev server), rather than a fresh surprise
// number every time.
// config.server.port comes straight out of config.json as a STRING
// ("47001", not 47001) -- Number() it here, once, so every arithmetic use
// below (the +1/+2/... fallback scan) does real addition instead of
// string concatenation ("47001" + 1 === "470011", an invalid port that
// crashed server.listen() with ERR_SOCKET_BAD_PORT -- caught testing this
// exact fix on 2026-09-21).
var _lmBasePort = Number(config.server.port) > 0 ? Number(config.server.port) : 0;
var _lmOriginalPortRetries = 0;
var _LM_MAX_ORIGINAL_PORT_RETRIES = 10; // ~3s total at 300ms apart
var _lmFallbackAttempt = 0;
var _LM_MAX_FALLBACK_ATTEMPTS = 20;

function lmStartListening(port) {
  server.listen(port);
}

server.on('listening', function () {
  cl(`LumenJS server running at http://${config.server.host}:${server.address().port}/`);
  if (_copilot) {
    _lmServerErrors.splice(0).forEach(function (m) { _copilot.noteServerError(m); });
    if (!require(path.join(__dirname, "copilot", "auth.js")).hasCredentials()) {
      cl("Lumen Copilot (AI help on this page): run `lm login` to turn it on. New Roxyon accounts get $0.50 of free credit.");
    }
  }
  fcs.checkProjectRuntime(process.cwd());
  config.server.port = server.address().port;
  _tpls = readTpls();
  _views = readViews();
  _layouts = readLayouts();
});

server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  if (_lmBasePort > 0 && _lmOriginalPortRetries < _LM_MAX_ORIGINAL_PORT_RETRIES) {
    _lmOriginalPortRetries++;
    cl('Port ' + _lmBasePort + ' is in use (likely still being released by a previous run) — retrying (' + _lmOriginalPortRetries + '/' + _LM_MAX_ORIGINAL_PORT_RETRIES + ')...');
    setTimeout(() => lmStartListening(_lmBasePort), 300);
    return;
  }
  if (_lmFallbackAttempt < _LM_MAX_FALLBACK_ATTEMPTS) {
    _lmFallbackAttempt++;
    let fallbackPort = (_lmBasePort > 0 ? _lmBasePort : 3000) + _lmFallbackAttempt;
    cl('Port ' + _lmBasePort + ' is already in use — falling back to ' + fallbackPort + '..');
    lmStartListening(fallbackPort);
    return;
  }
  cl('Could not find a free port after ' + _LM_MAX_FALLBACK_ATTEMPTS + ' attempts starting from ' + _lmBasePort + '.');
});

lmStartListening(_lmBasePort);