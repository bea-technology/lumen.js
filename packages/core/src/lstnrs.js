/**************************************/
/****** START GLOBAL EVENTS LISTENERS */
/**************************************/

var _navT = 0;
var _nav = false;
var _pbc;
var _vuid = {};
// Mobile autoplay policy: a suspended AudioContext can only be resumed from a
// real user gesture, so V1 unlocked one on the first click/touch/tap.
// 2026-09-26: V1 did `new AudioContext()` bare. This handler runs on EVERY
// click, so in any environment without the unprefixed constructor (older
// Safari exposes only webkitAudioContext) that threw on every single click of
// the page's life. Same unguarded-optional-API class as the renderPlugins()
// fixes; guarded here, with the real webkit fallback V1 never had.
$("body").on("click touch tap", function (e) {
  try {
    var _AC = typeof AudioContext !== "undefined" ? AudioContext
      : (typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null);
    if (!_AC) return;
    if (!_pbc) _pbc = new _AC();
    if (_pbc.state == "suspended") {
      _pbc.resume().then(() => { });
    }
  } catch (err) { }
});
$("body").on("click touch", ".navTgl", function (e) {
  _nav = false;
  clearTimeout(_navT);
  if ($("nav").hasClass("nav-opened")) {
    $("nav").removeClass("nav-opened");
    $("body").removeClass("nav-opened");
  } else {
    $("nav").addClass("nav-opened");
    $("body").addClass("nav-opened");
    _navT = setTimeout(function () {
      _nav = true;
    }, 20);
  }
  e.stopPropagation();
});

$(document).keydown(function (e) {
  var keyCode = e.keyCode || e.which;
  if (keyCode == 27) {
    e.preventDefault();
    e.stopPropagation();
    if ($("[loader]").length) {
      if (_loader.options.Dismissible) _loader.hide();
    } else if (_nav) {
      $("nav").removeClass("nav-opened");
      $("body").removeClass("nav-opened");
      _nav = false;
    } else {
      if ($("popup").length && $("droplet").length) {
        $("droplet")
          .removeClass("is-visible")
          .each(function () {
            var p = $(this);
            setTimeout(function () {
              p.remove();
            }, 150);
          });
      } else if ($("popup").length) {
        $("[close-modal]:last").click();
      } else {
        $("body").css({ overflow: "visible" });
        $("droplet")
          .removeClass("is-visible")
          .each(function () {
            var p = $(this);
            setTimeout(function () {
              p.remove();
            }, 150);
          });
      }
    }
  }
});

_csswrk.on('css-ready', function (e) {
  let data = e.originalEvent.data;
  _vuid[data.key].resolve(data.csses);
});

// V1 started the upload worker at boot (core.js `_upwrk.start()`); V2 never started it, so [up] elements never
// reported files-added / upload-progress / ... Start it on first use instead of on every page load.
function _upwrkStarted() {
  if (!_upwrk.isStarted()) _upwrk.start();
  return _upwrk;
}

_upwrk.on('message', function (e) {
  let data = e.originalEvent.data;
});
_upwrk.on('files-added', function (e) {
  let data = e.originalEvent.data;
  processEv(e, $('[upid="' + data.upid + '"]'), "files-added", data.files, data.newfiles);
});
_upwrk.on('queue-changed', function (e) {
  let data = e.originalEvent.data;
  processEv(e, $('[upid="' + data.upid + '"]'), "queue-changed", data.files);
});
_upwrk.on('file-removed', function (e) {
  let data = e.originalEvent.data;
  processEv(e, $('[upid="' + data.upid + '"]'), "file-removed", data.files, data.removedfile);
});
_upwrk.on('upload-start', function (e) {
  let data = e.originalEvent.data;
  processEv(e, $('[upid="' + data.upid + '"]'), "upload-start", data.files);
});
_upwrk.on('file-uploaded', function (e) {
  let data = e.originalEvent.data;
  processEv(e, $('[upid="' + data.upid + '"]'), "file-uploaded", data.files, data.file);
});
_upwrk.on('upload-progress', function (e) {
  let data = e.originalEvent.data;
  processEv(e, $('[upid="' + data.upid + '"]'), "upload-progress", data.files);
});
_upwrk.on('upload-complete', function (e) {
  let data = e.originalEvent.data;
  processEv(e, $('[upid="' + data.upid + '"]'), "upload-complete", data.files);
});
_upwrk.on('upload-stop', function (e) {
  let data = e.originalEvent.data;
  processEv(e, $('[upid="' + data.upid + '"]'), "upload-stop", data.files);
});
_upwrk.on('queue-empty', function (e) {
  let data = e.originalEvent.data;
  processEv(e, $('[upid="' + data.upid + '"]'), "queue-empty");
});


$.fn.extend({
  startUpload: function () {
    if (this.hasAttr('up')) {
      _upwrkStarted().trigger('start-upload', {
        "upid": this.attr('upid')
      });
    }
    return this;
  },
  stopUpload: function () {
    if (this.hasAttr('up')) {
      _upwrkStarted().trigger('stop-upload', {
        "upid": this.attr('upid')
      });
    }
    return this;
  },
  removeFile: function (id) {
    if (this.hasAttr('up')) {
      _upwrkStarted().trigger('remove-file', {
        "upid": this.attr('upid'),
        "id": id
      });
    }
    return this;
  }
});


$("body").on("FilesAdded", "[up]", function (e, files) {
  let t = $(this);
  var size = t.attr('data-mxs') ? t.attr('data-mxs') : '10mb';
  //TODO: Filter + Reset File Input
  _upwrkStarted().trigger('handle-files', {
    "upid": t.attr('upid'),
    "files": files
  });
  processEv(e, t, "browse-files", files);
});

$("body").on("dragover", "[up] [drpzn]", function (e) {
  e.stopPropagation();
  e.preventDefault();
  let t = $(this).closest('[up]');
  $(this).addClass('dragover');
  e.originalEvent.dataTransfer.dropEffect = 'copy';
  return false;
});
$("body").on("dragleave", "[up] [drpzn]", function (e) {
  e.stopPropagation();
  e.preventDefault();
  $(this).removeClass('dragover');
});
$("body").on("drop", "[up] [drpzn]", function (e) {
  e.stopPropagation();
  e.preventDefault();
  var files = e.originalEvent.dataTransfer?.files || e.target?.files;
  let t = $(this).closest('[up]');
  $(this).removeClass('dragover');
  t.trigger('FilesAdded', [files]);
  return false;
});
$("body").on("click", "[up] [browse]", function (e) {
  e.stopPropagation();
  e.preventDefault();
  let t = $(this).closest('[up]');
  t.find("[files]").click();
});
$("body").on("change", "[up] [files]", function (e) {
  e.stopPropagation();
  e.preventDefault();
  var files = e.originalEvent.dataTransfer?.files || e.target?.files;
  let t = $(this).closest('[up]');
  t.trigger('FilesAdded', [files]);
});

$("body").on("click touch", "[ctc]", function (ev) {
  var el = $(this);
  var ctc = el.attr("ctc");
  var selector = el;
  if (ctc.indexOf("el.") !== -1) {
    selector = eval(ctc);
  } else if (ctc != "") selector = $(ctc);

  if (!navigator.clipboard) {
    var temp = $("<textarea class='pf' style='left: -40%;' />");
    $("body").append(temp);
    temp.val(selector.text()).select();
    document.execCommand("copy");
    temp.remove();
  } else {
    navigator.clipboard.writeText(selector.text()).then(
      function () {
        // console.log("Async: Copying to clipboard was successful!");
      },
      function (err) {
        // console.error("Async: Could not copy text: ", err);
        var temp = $("<textarea class='pf' style='left: -40%;' />");
        $("body").append(temp);
        temp.val(selector.text()).select();
        document.execCommand("copy");
        temp.remove();
      }
    );
  }

  if (el.hasAttr("stop")) ev.stopPropagation();
});

$("body").on("click touch", "[scroll-left]", function (ev) {
  var _el = $(this);
  var _wrap = _el.closest("[wrapper]");
  if (_wrap.length) {
    var _p = _wrap.find("div").first();
    _p.stop().animate(
      { scrollLeft: _p.scrollLeft() - 100 },
      {
        duration: 200,
        easing: "easeOutCirc",
        complete: function () { },
      }
    );
  }
});

$("body").on("click touch", "[scroll-right]", function (ev) {
  var _el = $(this);
  var _wrap = _el.closest("[wrapper]");
  if (_wrap.length) {
    var _p = _wrap.find("div").first();
    _p.stop().animate(
      { scrollLeft: _p.scrollLeft() + 100 },
      {
        duration: 200,
        easing: "easeOutCirc",
        complete: function () { },
      }
    );
  }
});

$("body").on("click touch", "[scroll-top]", function (ev) {
  var _el = $(this);
  var _wrap = _el.closest("[wrapper]");
  if (_wrap.length) {
    var _p = _wrap.find("div").first();
    _p.stop().animate(
      { scrollTop: _p.scrollTop() - 100 },
      {
        duration: 200,
        easing: "easeOutCirc",
        complete: function () { },
      }
    );
  }
});

$("body").on("click touch", "[scroll-bottom]", function (ev) {
  var _el = $(this);
  var _wrap = _el.closest("[wrapper]");
  if (_wrap.length) {
    var _p = _wrap.find("div").first();
    _p.stop().animate(
      { scrollTop: _p.scrollTop() + 100 },
      {
        duration: 200,
        easing: "easeOutCirc",
        complete: function () { },
      }
    );
  }
});

function bs(t) {
  $("body").css({ overflow: t ? "visible" : "hidden" });
}

$("body").on("open-modal", "[modal]", function (ev) {
  var el = $(this);
  var n = popups.modals.length;
  var _view = el.attr("modal");
  bs();

  var va = el.attr("modal-align") ?? "center middle";
  var padding = el.attr("modal-spacing") ?? "";
  var ov = el.attr("modal-ov") ?? "bgb20";
  var icon = el.attr("modal-icon") ?? "mdi:close";
  va = va.split(" ");
  if (va.length == 2) {
    va = {
      h: ["left", "center", "right"].indexOf(va[0]) >= 0 ? va[0] : "center",
      v:
        ["top", "center", "middle", "bottom"].indexOf(va[1]) >= 0
          ? va[1]
          : "middle",
    };
  } else {
    va = {
      h: "center",
      v: "middle",
    };
    setError(null, "Modal align should be modal-align='vertical horizontal'.");
  }

  if (!el.hasAttr("data-modal")) {
    var selector = "modals_" + n;

    var popup =
      // 2026-10-03: V1's modal shell, verbatim (core-v1 listeners.js). The
      // earlier V2 shell (<pop-o>/<tbl_nm>/<cl>/<pop-c> tags) laid modals out
      // differently and let tag-selector CSS like console's `.gen-modal pop-h`
      // (dormant under V1) take effect: every console.roxyon.com modal changed
      // width, position, header and radius. V1 sites style [pop-c]/[pop-h]...
      '<popup class="ov df pf [c] z10000 oya [ov]">' +
      '<div pop-c class="ma w100 [va] [ta] [p]">' +
      '<flx pop-h class="ps t0 as z100">' +
      '<flx class="f1 fc as"><div pop-t>[t]</div><div pop-d>[d]</div></flx>' +
      '<div pop-x close-modal data-dismiss="modal" aria-label="Close"><span aria-hidden="true" class="cc c iconify" data-icon="[i]"></span></div>' +
      '</flx>' +
      "<div pop-b>[b]</div>" +
      "<div pop-f class='ps b0 z100'>[f]</div>" +
      "</div>" +
      "</popup>";

    var verticalAlign =
      va["v"] == "center" || va["v"] == "middle"
        ? "vm"
        : va["v"] == "top"
          ? "vt"
          : "vb";
    var textAlign = va["h"] == "center" ? "c" : va["h"] == "left" ? "l" : "r";

    popup = popup
      .split("[va]")
      .join(verticalAlign)
      .split("[p]")
      .join(padding)
      .split("[ta]")
      .join(textAlign)
      .split("[ov]")
      .join(ov)
      .split("[i]")
      .join(icon);
    let attrsData = {
      t: el.attr("modal-title") ?? "New Modal",
      d: el.attr("modal-description") ?? "",
      c: el.attr("modal-class") ?? "",
    };
    if (_view != "") {
      popup = popup.split("[t]").join(attrsData.t);
      popup = popup.split("[d]").join(attrsData.d);
      popup = popup
        .split("[b]")
        .join('<div for-modal="' + selector + "\" view='" + _view + "'></div>");
      popup = popup.split("[f]").join("");
    } else {
      var c = getComData(el);
      if (!c) {
        if (el.find("modal").length > 0) {
          var modalData = el.find("modal:first");
          var c = getComData(modalData, true);
        }
      }
      if (c) {
        if (c.Title) popup = popup.split("[t]").join(c.Title ?? attrsData.t);
        popup = popup.split("[d]").join(c.Description ?? attrsData.d);
        popup = popup.split("[b]").join(c.Body ?? "");
        popup = popup.split("[f]").join(c.Footer ?? "");
      } else {
        popup = popup.split("[t]").join(attrsData.t);
        popup = popup.split("[d]").join(attrsData.d);
        popup = popup.split("[b]").join("");
        popup = popup.split("[f]").join("");
      }
    }
    popup = popup.split("[c]").join(attrsData.c);
    var newModal = $(popup);
    newModal.attr("id", selector).appendTo("body");
    // el.attach('Open');
    let modal = $("#" + selector);

    el.trigger("modal-open", [modal]);

    modal.data("props", el.data("props"));

    // V1 mounted the modal's view later (globalWatch) with props { modal: <what @modal-open returned> } — the same
    // object, so `view.scope(function (view, props) { props.modal.x = 1 })` is seen by the opener. Mount it only
    // now that @modal-open has run, and hand the props over the same way.
    if (_view != "") {
      let _host = newModal.find("[for-modal]");
      let _mp = modal.data("props");
      _host.data("props", _mp !== undefined ? { modal: _mp } : {});
      mountModalView(_host.get(0), _view);
    }

    modal
      .addClass("modal-open")
      .delay(10)
      .queue(function (next) {
        $(this).addClass("in");
        next();
      });
    $(this).attr("data-modal", selector);
    popups["modals"].push(newModal.get(0));

    // el.trigger('Open', [$("#" + selector), el, c]);

    // if (el.attr('modal-open')) {
    //     var mo = el.attr('modal-open');
    //     if (typeof window[mo] === "function") {
    //         window[mo]($("#" + selector), el, c);
    //     }
    // }

    globalWatch();
  }

  if (el.hasAttr("stop")) ev.stopPropagation();
});

$("body").on("click touch", "[modal]", function (ev) {
  let modalTriggered = false;
  var obj = {};
  $.each($(this)[0].attributes, function () {
    if (this.value.toLowerCase() == "openmodal") {
      modalTriggered = true;
      return;
    }
    obj[this.name] = this.value;
  });
  if (!modalTriggered) {
    $(this).trigger("open-modal");
  }
});

$("body").on("modal-close", "[\\@modal-close]", function (ev, modal, cb) {
  let el = $(this),
    _v = el.attr("@modal-close");
  let props = modal.data("props");
  let _fn = _v.split("(")[0];
  try {
    if (typeof window[_v] === "function") cb(window[_fn](ev, el, modal, props));
    else {
      let _eva = eval(_v);
      cb(_eva);
    }
  } catch (e) {
    cb();
  }

  // let el = $(this),
  //   _v = el.attr("@modal-close"),
  //   _bv = el.attr("@modal-beforeclose");

  // let props = modal.data("props");
  // let _fn = _v.split("(")[0];

  // try {
  //   let ex = true;
  //   if (_bv) {
  //     let r = true;
  //     let _bfn = _bv.split("(")[0];
  //     if (typeof window[_bv] === "function") r = cb(window[_bfn](ev, el, modal, props));
  //     else {
  //       let _eva = eval(_bv);
  //       r = cb(_eva);
  //     }
  //     ex = r;
  //   }
  //   if (ex) {
  //     if (typeof window[_v] === "function") cb(window[_fn](ev, el, modal, props));
  //     else {
  //       let _eva = eval(_v);
  //       cb(_eva);
  //     }
  //   }
  // } catch (e) {
  //   cb();
  // }
});

$("body").on("modal-open", "[\\@modal-open]", function (ev, modal) {
  let el = $(this),
    _v = el.attr("@modal-open");
  let _fn = _v.split("(")[0];
  try {
    if (typeof window[_v] === "function") {
      var _data = window[_fn](ev, el, modal);
      modal.data("props", _data);
    } else {
      let _eva = eval(_v);
      modal.data("props", _eva);
    }
  } catch (e) { }
});

function evalEvAttr(_v, ev, el, n, arg1, arg2, arg3) {
  let _fn = _v.split("(")[0];
  try {
    // 2026-09-17: prefer the triggering element's OWN rendering instance's
    // function registry (._ownerRe.view.fns, set up by walk.js's
    // _fnRegisterStatement() + _re.js's createEl()/renderHST()) over the
    // plain `window[_fn]` lookup below — real bug found and fixed: every
    // mounted instance of the same subview declaring a same-named handler
    // (e.g. multiple `<div view="widgets/card">` each with their own
    // `function bump(){}`) used to collide on one global, since a plain
    // <script> tag's top-level function declarations all write to the
    // same `window` object — window.bump silently became whichever
    // instance's script last ran, so every instance's @click fired THAT
    // one instance's handler regardless of which was actually clicked.
    // Only applies to the plain-name form (`_v === _fn`, no `(...)`) —
    // a parameterized attribute like `@click="fn(x)"` already falls
    // through to the eval() branch below unchanged, exactly as before.
    let _rawEl = el[0];
    // Nearest engine up the chain that declares it: a :for row's engine has no functions of its own, its view does.
    let _ownFn = null;
    if (_v === _fn) {
      for (let _e = _rawEl && _rawEl._ownerRe, _n = 0; _e && _e.view && _n < 50; _e = _e.view._pv, _n++) {
        let _fns = _e.view.fns;
        if (_fns && Object.prototype.hasOwnProperty.call(_fns, _fn) && typeof _fns[_fn] === "function") { _ownFn = _fns[_fn]; break; }
      }
    }
    if (_ownFn || typeof window[_v] === "function") {
      ev["cType"] = n;
      let _handler = _ownFn || window[_fn];
      var _data = arg3 ? _handler(ev, el, arg1, arg2, arg3) : (arg2 ? _handler(ev, el, arg1, arg2) : (arg1 ? _handler(ev, el, arg1) : _handler(ev, el)));
      return _data;
    } else {
      // 2026-09-21: routed through _evalEventScopedExpr() (_re.js) instead
      // of a bare eval(_v) — see that function's own comment for the full
      // story. A plain eval() here could never resolve, let alone write
      // back to, a reactive var (isLoggedIn = !isLoggedIn, age++, ...) —
      // only real global functions/vars ever worked. _rawEl._ownerRe is
      // the same owner-instance reference the function-lookup branch above
      // already uses.
      let _eva = _evalEventScopedExpr(_rawEl && _rawEl._ownerRe, _v, { ev: ev, el: el, n: n, arg1: arg1, arg2: arg2, arg3: arg3 });
      return _eva;
    }
  } catch (e) {
    return false;
  }
}

function processEv(ev, el, n, arg1, arg2, arg3) {
  if (el.hasAttr("stop")) ev.stopPropagation();
  if (n == "focusin") n = "focus";
  else if (n == "focusout") n = "blur";
  if (!el.hasAttr("@" + n)) return;
  if (el.hasAttr("@before-" + n)) {
    if (!evalEvAttr(el.attr("@before-" + n), ev, el, n, arg1, arg2, arg3)) return;
  }
  let _v = el.attr("@" + n);
  if (_v.toLowerCase() == "openmodal") {
    el.trigger("open-modal");
    return;
  }
  evalEvAttr(_v, ev, el, n, arg1, arg2, arg3);
}

$("body").on("click touch", "[ci]", function (ev) {
  var el = $(this);
  var f = el.closest("form");
  var inputs = $("");

  if (el.attr("ci") != "") {
    let ci = el.attr("ci").split(",");
    for (let index = 0; index < ci.length; index++) {
      const selector = ci[index];
      inputs = inputs.add(f.find(selector));
    }
  } else {
    inputs = f.find(
      $("input[\\:required],select[\\:required],textarea[\\:required]")
    );
  }

  f.removeClass("validation-error");
  for (var i = 0; i < inputs.length; i++) {
    if (!checkFormInputs(f, inputs[i])) {
      f.addClass("validation-error");
      break;
    }
  }
});

$("body").on("doubletap", "[\\@dblclick]", function (ev) {
  processEv(ev, $(this), "dblclick");
});

$("body").on("doubletap", "[\\@dbltap]", function (ev) {
  processEv(ev, $(this), "dbltap");
});

$("body").on("singletap", "[\\@singleclick]", function (ev) {
  processEv(ev, $(this), "singleclick");
});

$("body").on("singletap", "[\\@singletap]", function (ev) {
  processEv(ev, $(this), "singletap");
});

$("body").on("taphold", "[\\@taphold]", function (ev) {
  processEv(ev, $(this), "taphold");
});

$("body").on("taphold", "[\\@clickhold]", function (ev) {
  processEv(ev, $(this), "clickhold");
});

$("body").on("click touch", "[\\@click]", function (ev) {
  processEv(ev, $(this), "click");
});

$("body").on("tap", "[\\@tap]", function (ev) {
  processEv(ev, $(this), "tap");
});

$("body").on("tap2", "[\\@click2]", function (ev) {
  processEv(ev, $(this), "click2");
});

$("body").on("tap2", "[\\@tap2]", function (ev) {
  processEv(ev, $(this), "tap2");
});

$("body").on("tap2hold", "[\\@click2hold]", function (ev) {
  processEv(ev, $(this), "click2hold");
});

$("body").on("tap2hold", "[\\@tap2hold]", function (ev) {
  processEv(ev, $(this), "tap2hold");
});

$("body").on("orientationchange", "[\\@orientationchange]", function (ev) {
  processEv(ev, $(this), "orientationchange");
});

$("body").on(
  "swipe swipeleft swipedown swipeend swipeup swiperight",
  "[\\@swipe],[\\@swipe-down],[\\@swipe-up],[\\@swipe-left],[\\@swipe-right],[\\@swipe-end]",
  function (ev) {
    let _v =
      ev.type.length == 5 ? "swipe" : ev.type.split("swipe").join("swipe-");
    processEv(ev, $(this), _v);
  }
);

$("body").on("mouseover", "[\\@mouse-over]", function (ev) {
  processEv(ev, $(this), "mouse-over");
});

$("body").on("mousedown touchstart", "[\\@mouse-down]", function (ev) {
  processEv(ev, $(this), "mouse-down");
});

$("body").on("tapstart", "[\\@tap-start]", function (ev) {
  processEv(ev, $(this), "tap-start");
});

$("body").on("tapend", "[\\@tap-end]", function (ev) {
  processEv(ev, $(this), "tap-end");
});

$("body").on("tapmove", "[\\@tap-move]", function (ev) {
  processEv(ev, $(this), "tap-move");
});

$("body").on("mouseup touchend", "[\\@mouse-up]", function (ev) {
  processEv(ev, $(this), "mouse-up");
});

$("body").on("mouseout", "[\\@mouse-out]", function (ev) {
  processEv(ev, $(this), "mouse-out");
});

$("body").on("mouseenter touchmove", "[\\:hover]", function (ev) {
  let _s = $(this).attr(":hover");
  $(this).attr(
    "style",
    ($(this).hasAttr("style") ? $(this).attr("style").rtrim(";") + ";" : "") +
    _s
  );
});

$("body").on("mouseleave touchend", "[\\:hover]", function (ev) {
  let _s = $(this).attr(":hover");
  $(this).attr("style", $(this).attr("style").split(_s).join(""));
});

$("body").on("mouseenter", "[\\@mouse-enter]", function (ev) {
  processEv(ev, $(this), "mouse-enter");
});

$("body").on("mouseleave", "[\\@mouse-leave]", function (ev) {
  processEv(ev, $(this), "mouse-leave");
});

$("body").on("mousemove", "[\\@mouse-move]", function (ev) {
  processEv(ev, $(this), "mouse-move");
});

$("body").on("touchmove", "[\\@mouse-move]", function (ev) {
  processEv(ev, $(this), "mouse-move");
});

$("body").on("sort", "[\\@sort]", function (ev, ui) {
  processEv(ev, $(this), "sort", ui);
});

$("body").on("sortupdate", "[\\@sort-update]", function (ev, ui) {
  processEv(ev, $(this), "sort-update", ui);
});

$("body").on("sortchange", "[\\@sort-change]", function (ev, ui) {
  processEv(ev, $(this), "sort-change", ui);
});

$("body").on("sortstart", "[\\@sort-start]", function (ev, ui) {
  processEv(ev, $(this), "sort-start", ui);
});

$("body").on("sortstop", "[\\@sort-stop]", function (ev, ui) {
  processEv(ev, $(this), "sort-stop", ui);
});

$("body").on("sortbeforestop", "[\\@sort-before-stop]", function (ev, ui) {
  processEv(ev, $(this), "sort-before-stop", ui);
});

$("body").on("drag", "[\\@drag]", function (ev, ui) {
  processEv(ev, $(this), "drag", ui);
});

$("body").on("dragstart", "[\\@drag-start]", function (ev, ui) {
  processEv(ev, $(this), "drag-start", ui);
});

$("body").on("dragstop", "[\\@drag-stop]", function (ev, ui) {
  processEv(ev, $(this), "drag-stop", ui);
});

$("body").on("drop", "[\\@drop]", function (ev, ui) {
  processEv(ev, $(this), "drop", ui);
});

// V1's Select2 bridge (core-v1 listeners.js): select2:select/unselect on an [sl] element becomes sl-select /
// sl-unselect, which runs the element's @sl-select / @sl-unselect handler with (ev, el, data). Missing in V2.
$("body").on("select2:select", "[sl]", function (e) {
  $(this).trigger("sl-select", [e.params && e.params.data, e]);
});
$("body").on("select2:unselect", "[sl]", function (e) {
  $(this).trigger("sl-unselect", [e.params && e.params.data, e]);
});
$("body").on("sl-select", "[\\@sl-select]", function (ev, data, e) {
  ev.params = e && e.params;
  processEv(ev, $(this), "sl-select", data);
});
$("body").on("sl-unselect", "[\\@sl-unselect]", function (ev, data, e) {
  ev.params = e && e.params;
  processEv(ev, $(this), "sl-unselect", data);
});

$("body").on("clear", "[sl]", function (ev, ui) {
  let t = $(this);
  t.empty().change();
  try {
    let opts = t.data("select2")?.options?.options;
    opts.data = null;
    t.select2(opts);
  } catch (e) {
    cl(e);
  }
});

$("body").on(
  "change blur focus keyup keydown input",
  "[\\@input],[\\@change],[\\@blur],[\\@focus],[\\@keyup],[\\@keydown]",
  function (ev) {
    // focus/blur don't bubble, so delegation listens for focusin/focusout;
    // real jQuery reports the original type back — do the same, or
    // processEv looks for a nonexistent @focusin/@focusout attribute.
    var t = ev.type === "focusin" ? "focus" : ev.type === "focusout" ? "blur" : ev.type;
    processEv(ev, $(this), t);
  }
);

$("body").on("click touch", "[close-modal]", function (ev) {
  var el = $(this);
  var modal = el.closest("popup");
  var id = modal.attr("id");
  var element_to_remove = $("#" + id).get(0);
  var index = $.inArray(element_to_remove, popups.modals);
  var modalOwner = $("[modal][data-modal=" + id + "]");
  if (el.hasAttr("stop")) ev.stopPropagation();
  ev.preventDefault();
  if (modalOwner.hasAttr("@modal-beforeclose")) {
    try {
      // 2026-09-23: rewritten via evalEvAttr() (the real, established
      // handler-resolution mechanism every other @-attribute in this
      // file uses) — the old hand-rolled version only ever checked
      // `typeof window[_bv] === "function"` (the RAW attribute value,
      // including any "(...)"), so it only worked for a bare function
      // name like `@modal-beforeclose="myVeto"` and had no else branch
      // at all for the parameterized form (`@modal-beforeclose=
      // "myVeto(el)"`) that's the normal convention elsewhere in this
      // codebase — that form was silently never evaluated, the modal
      // just closed unconditionally. evalEvAttr(_bv, ev, el, n, arg1)
      // calls window[fnName](ev, el, arg1) for the bare-name form (same
      // (ev, el, modalOwner) argument shape the old code passed) and
      // falls through to a real scoped-expression eval for the
      // parameterized form, matching @click/@sort/etc.
      let _bv = modalOwner.attr("@modal-beforeclose");
      let _result = evalEvAttr(_bv, ev, el, "modal-beforeclose", modalOwner);
      if (_result === false) return;
    } catch (e) { }
  }
  if (modalOwner.hasAttr("@modal-close")) {
    modalOwner.trigger("modal-close", [
      modal,
      function (res) {
        if (res === false) return;
        $(
          ".select2-container:not(.select2),.colorpicker.colorpicker-visible"
        ).remove();
        if (index > -1) {
          $("[modal][data-modal=" + id + "]").removeAttr("data-modal");
          modal
            .removeClass("in")
            .delay(150)
            .queue(function (next) {
              $(this).remove();
              if (popups.modals.length == 0) bs(true);
              next();
            });
          popups.modals.splice(index, 1);
        }
      },
    ]);
  } else {
    $(
      ".select2-container:not(.select2),.colorpicker.colorpicker-visible"
    ).remove();
    if (index > -1) {
      $("[modal][data-modal=" + id + "]").removeAttr("data-modal");
      modal
        .removeClass("in")
        .delay(150)
        .queue(function (next) {
          $(this).remove();
          if (popups.modals.length == 0) bs(true);
          next();
        });
      popups.modals.splice(index, 1);
    }
  }
});

$("body").on("change keyup", "[password]", function (e) {
  let el = $(this);
  let lbl = el.closest("label");
  let f = el.closest("form");
  var v = $.trim($(this).val());
  let allCls = "has-spaces weak strong very-strong medium";
  let cls = passwordStrength(v);

  el.removeClass(allCls).addClass(cls);
  if (f.length) f.removeClass(allCls).addClass(cls);
  if (lbl.length) lbl.removeClass(allCls).addClass(cls);

  if (!$(this).next().hasClass("passStrength"))
    $(this).after("<span class='passStrength'></span>");
  $(this).parent().find(".passStrength").removeClass(allCls).addClass(cls);
});

$("body").on("change keyup", "[username]", function (e) {
  var keyCode = e.keyCode || e.which;
  if (
    keyCode != 9 &&
    keyCode != 16 &&
    keyCode != 27 &&
    keyCode != 93 &&
    keyCode != 91 &&
    keyCode != 17 &&
    keyCode != 18
  ) {
    var el = $(this);
    let f = el.closest("form");
    checkFormInputs(f, el, true);
  }
});

// ############################ FORM VALIDATION ############################
// >>>>>>>>>>>>>>>>>>>> Input on focus(typing in it) <<<<<<<<<<<<<<<<<<<<<<<
$("body").on(
  "focus",
  "input:not(.select2-search__field,.mobinit),textarea,select",
  function (ev) {
    var el = $(this);
    var f = el.closest("form");
    let lbl = el.closest("label");
    if (f.length) f.addClass("focused");
    if (lbl.length) lbl.addClass("focused");
    el.parent().addClass("focused");
    el.addClass("focused");
  }
);
// >>>>>>>>>>>>>>>>>>>> Input on focus(typing in it) <<<<<<<<<<<<<<<<<<<<<<<

// >>>>>>>>>>>>>>>>> Input on blur(stopped typing in it and press out of it) <<<<<<<<<<<<<<<<<<<
$("body").on(
  "blur",
  "input:not(.select2-search__field,.mobinit),textarea,select",
  function (ev) {
    var el = $(this);
    var f = el.closest("form");
    if (f.length) f.removeClass("focused");
    el.parent().removeClass("focused");
    el.removeClass("focused");
  }
);
// >>>>>>>>>>>>>>>>> Input on blur(stopped typing in it and press out of it) <<<<<<<<<<<<<<<<<<<

// >>>>>>>>>>>>>>>>> Input change(change the input value) blur(remove focus) focus(type it) keyup(remove finger) keydown(put finger) <<<<<<<<<<<<<<<<<<<
$("body").on(
  "change keyup",
  "input:not(.select2-search__field,.mobinit),textarea,select",
  function (ev) {
    var el = $(this);
    let f = el.closest("form");
    checkFormInputs(f, el, true);
  }
);
// >>>>>>>>>>>>>>>>> Input change(change the input value) blur(remove focus) focus(type it) keyup(remove finger) keydown(put finger) <<<<<<<<<<<<<<<<<<<
// ############################ FORM VALIDATION ############################

var _lookups = 0;
var _debs = {};
var _proms = {};

$("body").on("change keyup", "[\\:lookup]", function (e) {
  var keyCode = e.keyCode || e.which;
  if (
    keyCode != 9 &&
    keyCode != 16 &&
    keyCode != 27 &&
    keyCode != 93 &&
    keyCode != 91 &&
    keyCode != 17 &&
    keyCode != 18
  ) {
    var el = $(this);
    if (!el.attr("data-i")) {
      el.attr("data-i", _lookups);
      _lookups++;
    }
    var key = "lu_" + el.attr("data-i");

    clearTimeout(_debs[key]);
    // $(this).removeClass('error success not-4-chars not-on-pattern');
    // $(this).addClass('pending');
    // var n = $(this).attr('data-n');
    var v = $(this).val();
    var callback = el.attr(":lookup-callback");
    // var fi = $(this).closest('.fields');
    if (!_proms.hasOwnProperty(key)) {
      _proms[key] = defer();
      _proms[key]
        .then(function (val) {
          el.addClass("finished").removeClass("pending");
        })
        .catch((reason) => {
          el.addClass("pending").removeClass("finished");
        });
    } else {
      // _proms[key].reject();
      // _proms[key] = defer();
      // _proms[key].then(function(val) {
      //     el.addClass('finished').removeClass('pending');
      // }).catch((reason) => {
      //     el.addClass('pending').removeClass('finished');
      // });
    }
    el.addClass("pending").removeClass("finished");

    _debs[key] = setTimeout(function () {
      _proms[key].reject();
      _proms[key] = defer();
      _proms[key]
        .then(function (val) {
          el.addClass("finished").removeClass("pending");
        })
        .catch((reason) => {
          el.addClass("pending").removeClass("finished");
        });
      window[callback](v, _proms[key]);
    }, 200);

    // if (v.length < 4) {
    //     $(this).addClass('error not-4-chars');
    //     fi.addClass('error');
    //     $('[tip][for-username]').attr('tip', $(this).attr('data-4-chars')).click();
    //     return false;
    // }

    // prom.resolve();
    // prom.reject();

    // var k = v.match(/[A-Za-z]+(?!\.)(?!.*\.$)(?!.*?\.\.)[a-zA-Z0-9.]+[A-Za-z0-9]/);
    // if (!k) {
    //     $(this).addClass('error not-on-pattern');
    //     fi.addClass('error');
    //     $('[tip][for-username]').attr('tip', $(this).attr('data-chars-not-allowed')).click();
    // } else {
    //     if (k.input != k[0]) {
    //         $(this).addClass('error not-on-pattern');
    //         fi.addClass('error');
    //         $('[tip][for-username]').attr('tip', $(this).attr('data-chars-not-allowed')).click();
    //         return false;
    //     }
    // }
  }
});

// $('body').on('click touch', '[ci]', function (ev) {
//     var el = $(this)
//     var form = el.closest("form")
//     var inputs = $("input[req]")
//     for (var i = 0; i < inputs.length; i++) {
//         if ($(inputs[i]).attr('type') === 'checkbox' || $(inputs[i]).attr('type') === 'radio') {
//             if ($('input[req]:checked').length == 0 && $(inputs[i]).hasAttr('data-into')) {
//                 form.addClass("validation-error")
//                 if ($(inputs[i]).hasAttr('data-empty')) {
//                     $($(inputs[i]).attr('data-into')).text($(inputs[i]).attr('data-empty'))
//                 } else {
//                     alert("checkbox or radio don't have data-empty attribute")
//                 }
//             }
//         } else {
//             if ($(inputs[i]).val().length === 0 && $(inputs[i]).hasAttr('data-into')) {
//                 form.addClass("validation-error")
//                 if ($(inputs[i]).hasAttr('data-empty')) {
//                     $($(inputs[i]).attr('data-into')).text($(inputs[i]).attr('data-empty'))
//                 } else {
//                     console.log("place holder ", $(inputs[i]).attr('placeholder'))
//                     alert($(inputs[i]).attr('placeholder'))
//                 }
//             }
//         }
//     }

// });

// $('body').on('click touch', '[ci]', function (ev) {

//     var el = $(this);
//     var f = el.closest('form');

//     var inps = []; $(el.attr('ci')).each(function () { inps.push($(this).attr('name')); });

//     for (var i = 0; i < inps.length; i++) {
//         var inp = f.find("input[name='" + inps[i] + "']");
//         var sel = f.find('select[name="' + inps[i] + '"]');
//         var txt = f.find('textarea[name="' + inps[i] + '"]');
//         var e = inp; if (!e.length) e = sel; if (!e.length) e = txt;
//         var or = e.attr('or');

//         // alert(or);

//         if (or != "") {
//             var inp2 = f.find("input[name='" + or + "']");
//             var sel2 = f.find('select[name="' + or + '"]');
//             var txt2 = f.find('textarea[name="' + or + '"]');
//             var or = inp2; if (!or.length) or = sel2; if (!or.length) or = txt2;
//         }

//         // alert(or.val());

//         if (e.is(':checkbox') || e.is(':radio')) {
//             if (!e.is(":checked")) {
//                 if (or.length) {
//                     if (!or.is(":checked")) {
//                         alert(e.attr('placeholder') + ' or ' + or.attr('placeholder'));
//                         e.addClass('error');
//                         e.focus();
//                         ev.preventDefault();
//                         ev.stopPropagation();
//                         return false;
//                     }
//                 } else {
//                     alert(e.attr('placeholder'));
//                     e.addClass('error');
//                     e.focus();
//                     ev.preventDefault();
//                     ev.stopPropagation();
//                     return false;
//                 }
//             }
//         } else {
//             if ($.trim(e.val()).length == 0) {
//                 if (or.length) {
//                     if ($.trim(or.val()).length == 0) {
//                         alert(e.attr('placeholder') + ' or ' + or.attr('placeholder'));
//                         e.addClass('error');
//                         e.focus();
//                         ev.preventDefault();
//                         ev.stopPropagation();
//                         return false;
//                     }
//                 } else {
//                     if (e.attr('data-into')) {
//                         $(e.attr('data-into')).html(e.attr('data-empty') ?? e.attr('placeholder'))
//                     } else {
//                         alert(e.attr('placeholder'));
//                     }
//                     e.addClass('error');
//                     e.focus();
//                     ev.preventDefault();
//                     ev.stopPropagation();
//                     return false;
//                 }
//             }

//             if (e.attr('data-into')) {
//                 $(e.attr('data-into')).html("")
//             }

//             if (e.is('[password]')) {
//                 if (!passwordValid(e.val())) {
//                     alert(e.attr('data-wpm'));
//                     e.addClass('error');
//                     e.focus();
//                     ev.preventDefault();
//                     ev.stopPropagation();
//                     return false;
//                 }
//             }
//             if (e.is('[rpassword]')) {
//                 if ($.trim(e.val()) != $.trim(e.closest('form').find('[password]').val())) {
//                     e.addClass('error');
//                     alert(e.attr('data-pnm'));
//                     e.focus();
//                     ev.preventDefault();
//                     ev.stopPropagation();
//                     return false;
//                 }
//                 e.removeClass('error');
//                 $('.passStrength').remove();
//             }

//         }

//     }
// });

$("body").on("click touch", "a,area", function (e) {
  var el = $(this);
  var link = el.attr("href");

  if (
    link == "" ||
    $(this).closest(".cke").length == 1 ||
    $(this).closest(".chosen-container").length == 1 ||
    $(this).attr("target") == "_blank" ||
    $(this).attr("target") == "_new" ||
    $(this).hasClass("norm") ||
    $(this).closest(".gm-style").length == 1
  ) {
  } else {
    var local = false;

    // alert(link);

    var l = getLocation(link);
    var l2 = getLocation(appSettings.Base);
    // console.log("ll ",[l])
    var url = "home";
    local = l.hostname == l2.hostname;

    var url = l.pathname.split(l2.pathname);

    // alert(url);

    if (l.pathname == "/" || l.pathname == "/home") {
      url = "home";
    } else {
      url = url.join("/");
    }
    // alert(url);

    if (local && !cntrlon) {
      // 2026-10-08: a link to a #fragment of the page already showing
      // (`href="#faq"`, or `/guide#faq` while on /guide) is left to the
      // browser: it scrolls, and the view is not re-rendered.
      if (l.hash && l.pathname == location.pathname && l.search == location.search) return;
      e.preventDefault();
      if (el.hasAttr("stop")) e.stopPropagation();

      pushURL(url + (l.search != "" ? l.search : "") + (l.hash || "") ?? "home");
    } else {
    }
  }
});

$("body").on("click touch", "[h],[s]", function (e) {
  var el = $(this);

  if (el.hasAttr("confirm")) if (!confirm(el.attr("confirm"))) return false;
  if (el.hasAttr("econfirm")) eval(el.attr("econfirm"));
  var attrs = el.attr();

  var hI = Object.keys(attrs).indexOf("h");
  var sI = Object.keys(attrs).indexOf("s");
  if (sI < hI) {
    $(el.attr("s")).show();
    $(el.attr("h")).hide();
  } else {
    $(el.attr("h")).hide();
    $(el.attr("s")).show();
  }
  if (el.hasAttr("stop")) e.stopPropagation();
});

$("body").on("click touch", "[e]", function (e) {
  var el = $(this);
  if (el.hasAttr("confirm")) if (!confirm(el.attr("confirm"))) return false;
  if (el.hasAttr("econfirm")) eval(el.attr("econfirm"));
  if ($($(this).attr("e")).is("input")) $($(this).attr("e")).val("");
  else $($(this).attr("e")).empty();
});

$("body").on("click touch", "[f]", function (e) {
  var el = $(this);
  $(el.attr("f")).trigger("focus");
  if (el.hasAttr("stop")) e.stopPropagation();
});
$("body").on("click touch", "[tgl]", function (e) {
  var el = $(this);
  if (el.hasAttr("confirm")) if (!confirm(el.attr("confirm"))) return false;
  if (el.hasAttr("econfirm")) eval(el.attr("econfirm"));
  el.toggleClass(el.attr("tgl"));
  el.toggleClass("toggled");
  if (el.hasAttr("stop")) e.stopPropagation();
});

$("body").on("click touch", "[t]", function (e) {
  var el = $(this);
  var tcn = el.attr("tcn") ? el.attr("tcn") : "active";
  if (el.hasAttr("confirm")) if (!confirm(el.attr("confirm"))) return false;
  if (el.hasAttr("econfirm")) eval(el.attr("econfirm"));
  $(el.attr("t")).toggleClass(tcn);
  el.toggleClass("toggled");
  if (el.hasAttr("stop")) e.stopPropagation();
});

$("body").on("click touch", "[actv]", function (e) {
  let el = $(this);
  if (el.attr("actv") != "") $(el.attr("actv")).removeClass("active");
  el.addClass("active");
  if (el.hasAttr("stop")) e.stopPropagation();
});

$("body").on("click touch", "[actvt]", function (e) {
  let el = $(this);
  if (el.attr("actvt") != "") $(el.attr("actvt")).removeClass("active");
  if (el.hasClass("active")) el.removeClass("active");
  else el.addClass("active");
  if (el.hasAttr("stop")) e.stopPropagation();
});

$("body").on("click touch", "[close-notify]", function (e) {
  var tis = $(this).parent();
  tis.fadeOut(function () {
    tis.remove();
  });
  if ($(this).hasAttr("stop")) e.stopPropagation();
});

let _keyInt;
$("body").on(
  "change blur focus keyup keydown input", '[icons_search]', function (ev) {
  var key = $.trim($(this).val());
  var outlet = $($(this).attr('icons_outlet'));
  var count_outlet = $($(this).attr('icons_count_outlet'));
  clearTimeout(_keyInt);
  if (key == "" || key.length <= 2) {
    count_outlet.hide();
    outlet.html('');
  } else {
    _keyInt = setTimeout(function () {

      fetch('https://api.iconify.design/search?query=' + key + '&limit=250', {
        method: 'GET'
      })
        .then(function (response) { return response.json(); })
        .then(function (r) {
          count_outlet.show();
          let icons = r.icons;
          outlet.html('');
          count_outlet.html((r.total > 250 ? r.total + '+' : r.total) + ' ' + 'icons found..');
          for (let i = 0; i < icons.length; i++) {
            outlet.append(`
                    <li class="w20 md_w25 m_w33 m_m_w50 c icoLi" data-class="`+ icons[i] + `"><div><span class="iconify fs24 mb5 lh40 g_nm" style="height: 40px;" data-icon="` + icons[i] + `" ></span><span class="name-class">` + icons[i] + `</span></div></li>
                    `);
          }

        });
    }, 400);
  }
});

$("body").on("click touch", "[alert]", function (e) {
  notify(
    $(this).attr("alert-t"),
    $(this).attr("alert"),
    $(this).attr("alert-icon") ? $(this).attr("alert-icon") : "alert-circle",
    $(this).attr("alert-type") ? $(this).attr("alert-type") : "alert"
  );
});

$("body").on("click touch", "[rcl],[acl]", function (e) {
  var el = $(this);
  if (el.hasAttr("confirm")) if (!confirm(el.attr("confirm"))) return false;
  if (el.hasAttr("econfirm")) eval(el.attr("econfirm"));

  if (el.hasAttr("acl") && el.hasAttr("rcl")) {
    var attrs = el.attr();

    var rclcn = el.attr("rclcn") ? el.attr("rclcn") : "active";
    var aclcn = el.attr("aclcn") ? el.attr("aclcn") : "active";
    var rCl = Object.keys(attrs).indexOf("rcl");
    var aCl = Object.keys(attrs).indexOf("acl");
    if (aCl < rCl) {
      $(el.attr("acl")).addClass(aclcn);
      el.addClass("added").removeClass("removed");
      if (el.hasAttr("stop")) e.stopPropagation();

      $(el.attr("rcl")).removeClass(rclcn);
      el.addClass("removed").removeClass("added");
      if (el.hasAttr("stop")) e.stopPropagation();
    } else {
      $(el.attr("rcl")).removeClass(rclcn);
      el.addClass("removed").removeClass("added");
      if (el.hasAttr("stop")) e.stopPropagation();

      $(el.attr("acl")).addClass(aclcn);
      el.addClass("added").removeClass("removed");
      if (el.hasAttr("stop")) e.stopPropagation();
    }
  } else {
    if (el.hasAttr("rcl")) {
      var rclcn = el.attr("rclcn") ? el.attr("rclcn") : "active";
      $(el.attr("rcl")).removeClass(rclcn);
      el.addClass("removed").removeClass("added");
      if (el.hasAttr("stop")) e.stopPropagation();
    } else {
      var aclcn = el.attr("aclcn") ? el.attr("aclcn") : "active";
      $(el.attr("acl")).addClass(aclcn);
      el.addClass("added").removeClass("removed");
      if (el.hasAttr("stop")) e.stopPropagation();
    }
  }
});

$("body").on("click touch", "[st]", function (e) {
  st($(this).attr("st"));
});

class Loader {
  options = {
    Dismissible: true,
    Class: "loader",
    Message: "Please Wait...",
  };

  constructor(options) {
    for (var k in options) {
      this.options[k] = options[k];
    }
  }

  dismiss() {
    if (this.options.Dismissible) {
      this.hide();
    }
  }

  init() {
    let l = `
                <div loader class="${this.options.Class}">
                    <div class="ov pf" @click="_loader.dismiss()"></div>
                    <div class="wrapper cc sh20">
                        <div class="animation"></div>
                        <div class="text">${this.options.Message}</div>
                    </div>
                </div>
        `;
    $("body").append(l);

    if (this.options.hasOwnProperty("Progress")) {
      var min = this.options.Progress;
      var max = 100;
      if (this.options.hasOwnProperty("MaxProgress"))
        max = this.options.MaxProgress;
      $("." + this.options.Class + "[loader] .wrapper").append(
        $('<div class="prog">' + min + "/" + max + "</div>")
      );
    }
  }

  show() {
    if ($("." + this.options.Class + "[loader]").length) return;
    this.init();
    $("body").css("overflow", "hidden");
  }

  hide() {
    $("." + this.options.Class + "[loader]").unbind("click");
    $("." + this.options.Class + "[loader]").remove();
    $("body").css("overflow", "auto");
  }

  update(options) {
    for (var k in options) {
      this.options[k] = options[k];
    }

    if (options.hasOwnProperty("Message")) {
      $("." + this.options.Class + "[loader] .wrapper .text").html(
        options.Message
      );
    }
    if (options.hasOwnProperty("Progress")) {
      var max = 100;
      if (options.hasOwnProperty("MaxProgress")) max = this.options.MaxProgress;
      if (!$("." + this.options.Class + "[loader] .wrapper .prog").length)
        $("." + this.options.Class + "[loader] .wrapper").append(
          $('<div class="prog">' + options.Progress + "/" + max + "</div>")
        );
      else
        $("." + this.options.Class + "[loader] .wrapper .prog").html(
          options.Progress + "/" + max
        );
    }
  }
}
var _loader = new Loader();
/**************************************/
/****** END GLOBAL EVENTS LISTENERS ***/
/**************************************/
