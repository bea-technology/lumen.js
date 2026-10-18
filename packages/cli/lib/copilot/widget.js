// Lumen Copilot panel (2026-10-18), served only by `lm serve` at /__lm/copilot.js. Never part of `lm build`.
// Loaded right after <head> so its error hooks see the app's first errors. Everything it draws lives in a
// shadow root, so the project's CSS can't reach it and it can't reach the project's.
(function () {
  "use strict";
  if (window.__lmCopilotLoaded) return;
  window.__lmCopilotLoaded = true;
  var cfg = window.__lmCopilot || {};
  var TOKEN = cfg.t || "";
  try { delete window.__lmCopilot; } catch (e) { window.__lmCopilot = undefined; }
  if (!TOKEN) return;

  // ---- error capture ------------------------------------------------------------------------------------------
  var errors = [];
  var listeners = [];
  var inOwnCode = false;
  function addError(kind, message, stack, source) {
    if (inOwnCode) return;
    message = String(message || "").slice(0, 2000);
    if (!message) return;
    var last = errors[errors.length - 1];
    if (last && last.message === message && last.kind === kind) { last.count++; changed(); return; }
    errors.push({ kind: kind, message: message, stack: String(stack || "").slice(0, 6000), source: String(source || ""),
      route: location.pathname + location.search + location.hash, at: Date.now(), count: 1 });
    if (errors.length > 20) errors.shift();
    changed();
  }
  function changed() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](); } catch (e) { } } }

  window.addEventListener("error", function (ev) {
    if (!ev || !ev.message) return; // resource load errors carry no message
    var src = ev.filename ? ev.filename + ":" + ev.lineno + ":" + ev.colno : "";
    addError("error", ev.message, ev.error && ev.error.stack, src);
  });
  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev && ev.reason;
    addError("promise", (r && r.message) || String(r), r && r.stack, "");
  });
  var origError = console.error;
  console.error = function () {
    try {
      var parts = [], stack = "";
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        if (a instanceof Error) { parts.push(a.message); stack = stack || a.stack; }
        else if (typeof a === "string") parts.push(a);
        else { try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(String(a)); } }
      }
      addError("console", parts.join(" "), stack || new Error().stack, "");
    } catch (e) { }
    return origError.apply(console, arguments);
  };

  // ---- talking to the dev server ------------------------------------------------------------------------------
  function call(method, url, body) {
    inOwnCode = true;
    var p = fetch(url, {
      method: method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json", "x-lm-copilot": TOKEN } : { "x-lm-copilot": TOKEN },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.json().catch(function () { return { ok: false, error: "HTTP " + r.status }; }); },
      function (e) { return { ok: false, error: "The dev server did not answer (" + e.message + ")." }; });
    inOwnCode = false;
    return p;
  }

  // ---- UI -----------------------------------------------------------------------------------------------------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] == null) continue;
      if (k === "text") n.textContent = attrs[k];
      else if (k.indexOf("on") === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function money(v) {
    var n = Number(v);
    if (!isFinite(n)) return "";
    return "$" + (n !== 0 && Math.abs(n) < 0.01 ? n.toFixed(4) : n.toFixed(2));
  }

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,sans-serif}",
    ".fab{position:fixed;right:18px;bottom:18px;z-index:2147483646;border:0;border-radius:22px;padding:10px 16px;background:#111827;color:#fff;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)}",
    ".fab .n{display:inline-block;min-width:18px;margin-left:8px;padding:0 6px;border-radius:9px;background:#ef4444;font-size:11px;line-height:18px}",
    ".panel{position:fixed;right:18px;bottom:70px;z-index:2147483647;width:440px;max-width:calc(100vw - 36px);height:620px;max-height:calc(100vh - 100px);display:flex;flex-direction:column;background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.25);overflow:hidden;font-size:13px}",
    ".panel[hidden]{display:none}",
    ".hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #e5e7eb;background:#f9fafb}",
    ".hd b{flex:1;font-size:14px}",
    ".x{border:0;background:none;font-size:18px;cursor:pointer;color:#6b7280}",
    ".tabs{display:flex;border-bottom:1px solid #e5e7eb}",
    ".tabs button{flex:1;border:0;background:none;padding:9px;cursor:pointer;font-size:13px;color:#6b7280;border-bottom:2px solid transparent}",
    ".tabs button.on{color:#111827;border-bottom-color:#2563eb;font-weight:600}",
    ".body{flex:1;overflow:auto;padding:12px}",
    ".err{border:1px solid #fecaca;background:#fef2f2;border-radius:8px;padding:8px;margin-bottom:8px}",
    ".err .m{font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;max-height:80px;overflow:hidden}",
    ".err .k{color:#991b1b;font-size:11px;margin-bottom:4px}",
    ".btn{border:1px solid #d1d5db;background:#fff;border-radius:7px;padding:6px 10px;cursor:pointer;font-size:12px}",
    ".btn.p{background:#2563eb;border-color:#2563eb;color:#fff}",
    ".btn[disabled]{opacity:.5;cursor:default}",
    "textarea,input[type=text]{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-size:13px;margin-bottom:8px}",
    "textarea{height:90px;resize:vertical}",
    ".row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
    ".muted{color:#6b7280;font-size:12px}",
    ".ans{margin-top:12px;border-top:1px solid #e5e7eb;padding-top:12px}",
    ".txt{white-space:pre-wrap;word-break:break-word;line-height:1.5}",
    "pre{background:#0b1020;color:#e5e7eb;border-radius:8px;padding:8px;overflow:auto;font-size:11.5px;line-height:1.45;font-family:ui-monospace,Menlo,monospace;margin:6px 0}",
    ".add{color:#86efac}.del{color:#fca5a5}.hunk{color:#93c5fd}",
    ".file{font-weight:600;margin-top:10px}",
    ".price{margin-top:10px;padding:6px 8px;background:#f3f4f6;border-radius:6px;font-size:12px;color:#374151}",
    ".warn{color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px;margin-top:8px}",
    "a{color:#2563eb}",
  ].join("\n");

  var host, root, fab, panel, bodyEl, tab = "errors", serverErrors = [], busy = false, lastAnswer = null;

  function build() {
    host = el("div", { id: "lm-copilot-host" });
    root = host.attachShadow({ mode: "open" });
    root.appendChild(el("style", { text: CSS }));
    fab = el("button", { "class": "fab", title: "Lumen Copilot (lm serve only)", onclick: toggle });
    panel = el("div", { "class": "panel", hidden: "" });
    var tabs = el("div", { "class": "tabs" }, [
      el("button", { "data-t": "errors", text: "Explain an error", onclick: function () { setTab("errors"); } }),
      el("button", { "data-t": "create", text: "Create a view", onclick: function () { setTab("create"); } }),
    ]);
    bodyEl = el("div", { "class": "body" });
    panel.appendChild(el("div", { "class": "hd" }, [el("b", { text: "Lumen Copilot" }), el("span", { "class": "muted", text: "dev only" }),
      el("button", { "class": "x", title: "Close", text: "×", onclick: toggle })]));
    panel.appendChild(tabs);
    panel.appendChild(bodyEl);
    root.appendChild(fab);
    root.appendChild(panel);
    document.documentElement.appendChild(host);
    listeners.push(function () { renderFab(); if (!panel.hidden && tab === "errors" && !busy && !lastAnswer) render(); });
    renderFab();
  }

  function renderFab() {
    fab.textContent = "Copilot";
    var n = errors.length + serverErrors.length;
    if (n) fab.appendChild(el("span", { "class": "n", text: String(n) }));
  }

  function toggle() {
    if (panel.hidden) {
      panel.hidden = false;
      refreshStatus();
      render();
    } else panel.hidden = true;
  }

  function setTab(t) { tab = t; lastAnswer = null; render(); }

  function refreshStatus() {
    call("GET", "/__lm/copilot/status").then(function (s) {
      if (s && s.ok) {
        serverErrors = (s.serverErrors || []).map(function (e) { return { kind: "server", message: e.message, stack: "", source: "lm serve", route: location.pathname, count: 1 }; });
        if (!s.signedIn) { lastAnswer = { signin: true, error: "Sign in to Roxyon to use Lumen Copilot: run `lm login` in a terminal." }; }
        renderFab();
        if (!busy) render();
      }
    });
  }

  function render() {
    var tb = root.querySelectorAll(".tabs button");
    for (var i = 0; i < tb.length; i++) tb[i].className = tb[i].getAttribute("data-t") === tab ? "on" : "";
    bodyEl.textContent = "";
    if (tab === "errors") renderErrors(); else renderCreate();
    if (busy) bodyEl.appendChild(el("div", { "class": "ans muted", id: "busy", text: "Thinking..." }));
    if (lastAnswer) bodyEl.appendChild(renderAnswer(lastAnswer));
  }

  function renderErrors() {
    var all = serverErrors.concat(errors);
    if (!all.length) {
      bodyEl.appendChild(el("p", { "class": "muted", text: "No errors on this page yet. When the page or the dev server reports one, it shows here with an Explain button." }));
      return;
    }
    all.slice().reverse().forEach(function (e) {
      bodyEl.appendChild(el("div", { "class": "err" }, [
        el("div", { "class": "k", text: (e.kind === "server" ? "dev server" : e.kind) + (e.count > 1 ? " (x" + e.count + ")" : "") + " · " + e.route }),
        el("div", { "class": "m", text: e.message }),
        el("div", { "class": "row", style: "margin-top:6px" }, [
          el("button", { "class": "btn p", text: "Explain this error", disabled: busy ? "" : null, onclick: function () { explain(e, false); } }),
          el("button", { "class": "btn", text: "Think harder", title: "Uses a stronger model; costs more", disabled: busy ? "" : null, onclick: function () { explain(e, true); } }),
        ]),
      ]));
    });
  }

  var draft = { prompt: "", name: "", think: false };
  function renderCreate() {
    var ta = el("textarea", { placeholder: "Describe the view, e.g. \"a pricing page with three plans and a monthly/yearly switch\"" });
    ta.value = draft.prompt;
    ta.addEventListener("input", function () { draft.prompt = ta.value; });
    var nm = el("input", { type: "text", placeholder: "Name (optional), e.g. pricing  ->  src/views/pricing.view" });
    nm.value = draft.name;
    nm.addEventListener("input", function () { draft.name = nm.value; });
    var th = el("input", { type: "checkbox" });
    th.checked = draft.think;
    th.addEventListener("change", function () { draft.think = th.checked; });
    var go = el("button", { "class": "btn p", text: "Create view", onclick: function () {
      if (!draft.prompt.trim()) { ta.focus(); return; }
      turn({ mode: "create", prompt: draft.prompt, name: draft.name, think: draft.think });
    } });
    if (busy) go.setAttribute("disabled", "");
    bodyEl.appendChild(ta);
    bodyEl.appendChild(nm);
    bodyEl.appendChild(el("div", { "class": "row" }, [go, el("label", { "class": "muted" }, [th, " Think harder (stronger model, costs more)"])]));
    bodyEl.appendChild(el("p", { "class": "muted", text: "Nothing is written until you click Apply. The price of each answer is shown under it." }));
  }

  function explain(e, think) {
    turn({ mode: "explain", think: think, prompt: "", error: { message: e.message, stack: e.stack, route: e.route, source: e.source } });
  }

  function turn(body) {
    if (busy) return;
    busy = true; lastAnswer = null; render();
    var t0 = Date.now();
    var tick = setInterval(function () {
      var b = root.getElementById ? root.getElementById("busy") : null;
      if (b) b.textContent = "Thinking... " + Math.round((Date.now() - t0) / 1000) + "s";
    }, 1000);
    call("POST", "/__lm/copilot/turn", body).then(function (r) {
      clearInterval(tick);
      busy = false; lastAnswer = r || { ok: false, error: "No answer." }; render();
    });
  }

  function textBlock(s) {
    // Plain text with ``` fenced code shown as code. No HTML from the answer is ever parsed.
    var wrap = el("div", { "class": "txt" });
    String(s || "").split(/```[\w-]*\n?/).forEach(function (part, i) {
      if (i % 2) wrap.appendChild(el("pre", { text: part.replace(/\n$/, "") }));
      else if (part) wrap.appendChild(document.createTextNode(part));
    });
    return wrap;
  }

  function diffBlock(d) {
    var pre = el("pre");
    String(d || "").split("\n").forEach(function (line) {
      var c = line[0] === "+" && line.indexOf("+++") !== 0 ? "add" : line[0] === "-" && line.indexOf("---") !== 0 ? "del" : line.indexOf("@@") === 0 ? "hunk" : "";
      pre.appendChild(el("span", c ? { "class": c, text: line + "\n" } : { text: line + "\n" }));
    });
    return pre;
  }

  function renderAnswer(a) {
    var box = el("div", { "class": "ans" });
    if (!a.ok) {
      box.appendChild(el("div", { "class": "warn", text: a.error || "Something went wrong." }));
      if (a.topup) box.appendChild(el("p", {}, [el("a", { href: a.topup, target: "_blank", rel: "noopener", text: "Add funds to your Roxyon wallet" })]));
      if (a.usage) box.appendChild(priceLine(a.usage));
      return box;
    }
    box.appendChild(textBlock(a.text));
    if (a.hint) box.appendChild(el("p", { "class": "muted", text: a.hint }));
    (a.edits || []).forEach(function (e) {
      box.appendChild(el("div", { "class": "file", text: (e.isNew ? "New file: " : "Change: ") + e.path }));
      box.appendChild(diffBlock(e.diff));
    });
    if (a.dropped && a.dropped.length) box.appendChild(el("div", { "class": "warn", text: "Not offered (outside src/ or not allowed): " + a.dropped.join(", ") }));
    if (a.id && !a.applied) {
      var apply = el("button", { "class": "btn p", text: "Apply " + a.edits.length + " file" + (a.edits.length > 1 ? "s" : ""), onclick: function () {
        apply.setAttribute("disabled", "");
        call("POST", "/__lm/copilot/apply", { id: a.id }).then(function (r) {
          if (r && r.ok) { a.applied = r.applyId; a.appliedFiles = r.files; }
          else a.applyError = (r && r.error) || "Apply failed.";
          render();
        });
      } });
      box.appendChild(el("div", { "class": "row", style: "margin-top:8px" }, [apply, el("span", { "class": "muted", text: "Writes to your project; Undo is available." })]));
    }
    if (a.applyError) box.appendChild(el("div", { "class": "warn", text: a.applyError }));
    if (a.applied && !a.undone) {
      var undo = el("button", { "class": "btn", text: "Undo", onclick: function () {
        undo.setAttribute("disabled", "");
        call("POST", "/__lm/copilot/undo", { applyId: a.applied }).then(function (r) {
          if (r && r.ok) a.undone = true; else a.applyError = (r && r.error) || "Undo failed.";
          render();
        });
      } });
      box.appendChild(el("div", { "class": "row", style: "margin-top:8px" }, [el("span", { text: "Applied: " + (a.appliedFiles || []).join(", ") }), undo]));
    }
    if (a.undone) box.appendChild(el("p", { "class": "muted", text: "Undone: the files are back to how they were." }));
    if (a.usage) box.appendChild(priceLine(a.usage));
    return box;
  }

  function priceLine(u) {
    var parts = [];
    if (u.chargeUSD != null) parts.push("This answer: " + money(u.chargeUSD) + (u.model ? " (" + u.model + ")" : ""));
    if (u.walletUSD != null) parts.push("Wallet: " + money(u.walletUSD));
    if (u.note) parts.push(u.note);
    return el("div", { "class": "price", text: parts.join(" · ") });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
