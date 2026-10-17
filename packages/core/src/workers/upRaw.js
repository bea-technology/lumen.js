let _w = self;
var files = [];
function defer() {
  var res, rej;
  var promise = new Promise((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
  promise.resolve = res;
  promise.reject = rej;
  promise.success = res;
  promise.failed = rej;
  return promise;
}

class _Live {
  _chnls = {};
  _users = {};
  _iter = 0;
  reconnectAttempts = 0;
  timeoutInterval = 4000;
  cbs = {};
  _cbs = {};
  lstnrs = {};
  _ws;
  srvr = undefined;

  constructor(srvr, que) {
    this.srvr = srvr;

    this.init(que);
    return this;
  }

  on(e, cb) {
    if (!this.lstnrs.hasOwnProperty(e)) this.lstnrs[e] = [];
    this.lstnrs[e].push(cb);
    if (e == "open" && this._ws?.readyState == 1) {
      this.trigger("open", this._ws);
    }
    return this;
  }

  off(e) {
    if (e == "connect") return this;
    if (this.lstnrs.hasOwnProperty(e)) delete this.lstnrs[e];
    return this;
  }

  createUser(id) {
    let user = new _User(id, this);
    return user;
  }

  subscribe(e, cb) {
    return this.on(e, cb);
  }

  unsubscribe(e, cb) {
    return this.off(e, cb);
  }

  trigger(n, e) {
    if (this.lstnrs.hasOwnProperty(n)) {
      for (let x = 0; x < this.lstnrs[n].length; x++) {
        this.lstnrs[n][x](e);
      }
    }
    return this;
  }

  emit(e, data, cb) {
    try {
      this._iter++;
      if (cb) this.cbs["cb_" + this._iter] = cb;
      if (this.ready()) {
        this._ws.send(JSON.stringify({ e: e, payload: data, _iter: this._iter }));
      } else {
        this._send(JSON.stringify({ e: e, payload: data, _iter: this._iter }));
      }
    } catch (error) {
      if (_debugMode) cl(error);
    }
    return this;
  }

  _emit(e, data, _isBin) {
    this._iter++;
    let prom = defer();
    this._cbs["cb_" + this._iter] = prom;
    if (_isBin) {
      if (this.ready()) {
        this._ws.binaryType = "arraybuffer";
        this._ws.send(this._binData({ e: e, payloadBin: data, _iter: this._iter }));
        this._ws.binaryType = "blob";
      } else {
        this._send(this._binData({ e: e, payloadBin: data, _iter: this._iter }));
      }
    } else {
      if (this.ready()) {
        this._ws.send(JSON.stringify({ e: e, payload: data, _iter: this._iter }));
      } else {
        this._send(JSON.stringify({ e: e, payload: data, _iter: this._iter }));
      }
    }
    return prom;
  }

  _send(m) {
    let _s = this;
    setTimeout(function () {
      if (_s.ready()) _s._ws.send(m);
      else _s._send(m);
    }, 500);
  }

  ready() {
    return this._ws !== undefined && this._ws.readyState == WebSocket.OPEN;
  }

  connecting() {
    return this._ws !== undefined && this._ws.readyState == WebSocket.CONNECTING;
  }

  init(que) {
    var _s = this;

    if (_s.ready()) {
      if (que && que['status'] == "STARTED") upload(que);
      return;
    }
    if (_s.connecting()) {
      setTimeout(function () {
        if (_s.ready()) { if (que && que['status'] == "STARTED") upload(que); }
        else _s.init(que);
      }, 500);
      return;
    }

    this._ws = new WebSocket(
      this.srvr ? this.srvr : "wss://www.beaapis.com/"
    );

    var localws = this._ws;
    var timeout = setTimeout(function () {
      if (localws.readyState != 1) localws.close();
    }, this.timeoutInterval);

    this._ws.onopen = function (e) {
      if (que && que['status'] == "STARTED") upload(que);
      clearTimeout(timeout);
      _s.trigger("connect", e);
      _s.trigger("open", e);
    };

    this._ws.onclose = function (e) {
      clearTimeout(timeout);
      _s._ws = undefined;
      _s._iter = 0;
      _s.cbs = {};

      setTimeout(function () {
        _s.reconnectAttempts++;
        _s.init(que);
      }, 1000);
    };

    this._ws.onmessage = function (e) {
      try {
        let data = JSON.parse(e.data);
        if (data.hasOwnProperty("for")) {
          let t = data["type"] ?? "room";
          let ev = data["ev"] ?? "message";
          const customEvent = new CustomEvent(ev, {
            detail: data["payload"],
          });
          customEvent.data = data["payload"];
          let payload = data["payload"];
          if (payload.hasOwnProperty("user")) {
            if (t == "user") {
              _s._users[data["for"]].trigger(ev, customEvent);
            } else
              _s._chnls[payload.user.id][data["for"]].trigger(
                ev,
                customEvent
              );
          }
        } else if (data.hasOwnProperty("e")) {
          let event = data["e"];
          let iter = data["_iter"];
          const customEvent = new CustomEvent(event, {
            detail: data["payload"],
          });
          customEvent.data = data["payload"];
          if (event != "rooms") _s.trigger(event, customEvent);
          if (_s.cbs["cb_" + iter]) _s.cbs["cb_" + iter](customEvent);
          _s._cbs["cb_" + iter].resolve(customEvent);
        }
      } catch (e) { }
    };
    this._ws.onerror = function (e) {
      if (_s._ws) {
        _s._ws.close();
      }
    };
  }

  _binData(_data) {
    var data = _data.payloadBin;
    var fileData = data.chunk;
    delete data['chunk'];

    const fileMetaJson = JSON.stringify({
      payload: data,
      e: _data.e,
      _iter: _data._iter,
    });

    // _must_ do this to encode as a ArrayBuffer / Uint8Array
    const enc = new TextEncoder(); // always utf-8, Uint8Array()
    const buf1 = enc.encode("!");
    const buf2 = enc.encode(fileMetaJson);
    const buf3 = enc.encode("_B_:_E_:_A_");
    const buf4 = fileData;

    let sendData = new Uint8Array(
      buf1.byteLength + buf2.byteLength + buf3.byteLength + buf4.byteLength
    );
    sendData.set(new Uint8Array(buf1), 0);
    sendData.set(new Uint8Array(buf2), buf1.byteLength);
    sendData.set(new Uint8Array(buf3), buf1.byteLength + buf2.byteLength);
    sendData.set(
      new Uint8Array(buf4),
      buf1.byteLength + buf2.byteLength + buf3.byteLength
    );

    return sendData;
  }
}

var LIVE = new _Live("wss://www.beaapis.com/");

function openSocket(que) {
  LIVE.init(que);
}

function readFileAsync(file) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();

    reader.onload = (e) => {
      let rawData = new ArrayBuffer();
      rawData = e.target.result;
      resolve(rawData);
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

var _queue = {};
function fid() {
  return 'file_' + Date.now().toString(36) + Math.floor(Math.pow(10, 12) + Math.random() * 9 * Math.pow(10, 12)).toString(36);
}

const wait = (msec) => new Promise((resolve, _) => {
  setTimeout(resolve, msec);
});

async function upload(que) {

  if (que && que['status'] != "STARTED") {
    // _w.trigger('message', "que stopped before upload start");
    return;
  }
  const BYTES_PER_CHUNK = Math.ceil(1024 * 1024 * 0.25);

  for (var x = 0; x < Object.keys(que['files']).length; x++) {
    let id = Object.keys(que['files'])[x];
    let file = Object.values(que['files'])[x];
    if (que && que['status'] == "STOPPED") {
      // _w.trigger('message', "que stopped while uploading!");
      return;
    }

    if (file.status == "DONE") continue;
    // else if(file.status=="UPLOADING") continue;

    let blob = que['blobs'][id];
    let _data = que['data'][id];
    let SIZE = blob.size;

    var start = 0;
    var end = BYTES_PER_CHUNK;
    var chunks = Math.ceil(SIZE / BYTES_PER_CHUNK);
    var data = {
      cmd: 1,
      name: blob.name,
      id: id,
      chunks: chunks,
    };

    var _e = await LIVE._emit("upload", data);

    let part = 1;
    if (_data['part'] > 1) {
      part = _data['part'] ? _data['part'] : 1;
      start = (part - 1) * BYTES_PER_CHUNK;
      end = start + BYTES_PER_CHUNK;
    }
    while (start < SIZE) {
      if (que && que['status'] == "STOPPED") {
        // _w.trigger('message', "que stopped while uploading inside!");
        return;
      }
      if (!que['files'].hasOwnProperty(id)) {
        // _w.trigger('message', "file removed while uploading");
        return;
      }
      if ("mozSlice" in blob) {
        var chunk = blob.mozSlice(start, end);
      } else if ("slice" in blob) {
        var chunk = blob.slice(start, end);
      } else {
        var chunk = blob.webkitSlice(start, end);
      }
      var text = await readFileAsync(chunk);

      var data = {
        cmd: 2,
        name: blob.name,
        part: part,
        chunks: chunks,
        id: id,
        chunk: text
      };
      _data['chunks'] = chunks;
      _data['part'] = part + 1;
      file['status'] = "UPLOADING";
      file['loaded'] = file['loaded'] + chunk.size;
      file['percent'] = Math.ceil(part * 100 / chunks);

      if (file['loaded'] > file.size) file.loaded = file.size;
      if (file['percent'] > 100) file.percent = 100;


      let response = await LIVE._emit("upload", data, true);
      if (response?.data?.url) {
        file["url"] = response?.data?.url;
      }

      _w.trigger('upload-progress', {
        "upid": file.upid,
        "files": que['files']
      });
      start = end;
      end = start + BYTES_PER_CHUNK;
      part++;
    }

    file['status'] = "DONE";
    _w.trigger('file-uploaded', {
      "upid": file.upid,
      "files": que['files'],
      "file": file
    });

  }

  que['status'] = "DONE";
  _w.trigger('upload-complete', {
    "upid": que.upid,
    "files": que['files'],
  });
}

function process(data) {
  var upid = data.upid;
  var _files = data.files;
  if (!_queue.hasOwnProperty(upid)) _queue[upid] = {
    "status": "QUEUED",
    "upid": upid,
    "files": {},
    "blobs": {},
    "data": {}
  };
  var que = _queue[upid];
  var files = [];
  var newFiles = {};
  var newData = {};
  for (var j = 0; j < _files.length; j++) files.push(_files[j]);
  while (files.length > 0) {
    var blob = files.shift();
    var id = fid();
    newFiles[id] = {
      "id": id,
      "upid": upid,
      "name": blob.name,
      "type": blob.type,
      "size": blob.size,
      "loaded": 0,
      "percent": 0,
      "status": "QUEUED",
      "lastModifiedDate": blob.lastModifiedDate ? blob.lastModifiedDate.toLocaleDateString() : 'n/a'
    };
    newData[id] = {
      "id": id,
      "upid": upid,
      "chunks": 1,
      "part": 1
    };
    que['files'] = { ...que['files'], ...newFiles };
    que['data'] = { ...que['data'], ...newData };
    que['blobs'][id] = blob;
    _w.trigger('queue-changed', {
      "upid": upid,
      "files": que['files']
    });
  }
  _w.trigger('files-added', {
    "upid": upid,
    "files": que['files'],
    "newfiles": newFiles
  });
}
(function () {
  'use strict';
  _w.on('handle-files', function (e) {
    process(e.data);
  });
  _w.on('start-upload', function (e) {
    var upid = e.data.upid;
    var que = _queue[upid];
    if (que) {
      if (que['status'] == "STARTED") {
        _w.trigger('message', "Already Started!");
        return;
      }
    } else {
      _w.trigger('queue-empty', {
        "upid": upid
      });
      return;
    }
    que['status'] = "STARTED";
    if (LIVE.ready()) {
      upload(que);
    } else openSocket(que);
  });
  _w.on('stop-upload', function (e) {
    var upid = e.data.upid;
    var que = _queue[upid];
    if (que) {
      que['status'] = "STOPPED";
      _w.trigger('upload-stop', {
        "upid": upid,
        "files": que
      });
    } else {
      _w.trigger('queue-empty', {
        "upid": upid
      });
    }
  });
  _w.on('remove-file', function (e) {
    var upid = e.data.upid;
    var que = _queue[upid];
    var id = e.data.id;
    if (que['files']?.hasOwnProperty(id)) {
      var removedfile = que['files'][id];
      delete que['files'][id];
      _w.trigger('file-removed', {
        "upid": upid,
        "files": que['files'],
        "removedfile": removedfile
      });
      _w.trigger('queue-changed', {
        "upid": upid,
        "files": que['files']
      });
      if (Object.keys(que['files']).length == 0) {
        delete _queue[upid];
        _w.trigger('queue-empty', {
          "upid": upid
        });
      }
    }
  });
  return;
})();
