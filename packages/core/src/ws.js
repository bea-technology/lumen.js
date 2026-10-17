class AbstractWebSocket {
    constructor(url, connectionTimeout = 5000) {
        this.url = url;
        this.socket = null;
        this.reconnectInterval = 3000;
        this.reconnectTimeout = null;
        this.connectionTimeout = connectionTimeout;
        this.connectionTimeoutId = null;
        this.connected = false;
        this.messageQueue = [];
    }

    connect() {
        this.socket = new WebSocket(this.url);

        this.connectionTimeoutId = setTimeout(() => {
            this.handleConnectionTimeout();
        }, this.connectionTimeout);

        this.socket.onopen = () => {
            clearTimeout(this.connectionTimeoutId);
            this.connected = true;
            this.onOpen();
            this.processMessageQueue();
        };

        this.socket.onmessage = (event) => {
            this.onMessage(event.data);
        };

        this.socket.onclose = (event) => {
            clearTimeout(this.connectionTimeoutId);
            this.connected = false;
            this.onClose(event.code);
            this.reconnect();
        };

        this.socket.onerror = (error) => {
            clearTimeout(this.connectionTimeoutId);
            this.onError(error);
        };
    }

    send(message) {
        cl("Sending ", message);
        if (this.connected) {
            this.socket.send(message);
        } else {
            this.messageQueue.push(message);
            console.error("WebSocket is not open. Unable to send message.");
        }
    }

    processMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            cl("Sending From Queue ", message);
            this.socket.send(message);
        }
    }

    handleConnectionTimeout() {
        this.socket.close();
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
        }
        clearTimeout(this.reconnectTimeout);
    }

    onOpen() {
    }

    onMessage(message) {
    }

    onClose(code) {
    }

    onError(error) {
    }

    reconnect() {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, this.reconnectInterval);
    }
}

class MyWebSocket extends AbstractWebSocket {
    constructor(url) {
        super(url);
    }

    onOpen() {
        super.onOpen();
    }

    onMessage(message) {
        super.onMessage(message);
    }

    onClose(code) {
        super.onClose(code);
        // Additional logic specific to your WebSocket implementation
    }

    onError(error) {
        super.onError(error);
        // Additional logic specific to your WebSocket implementation
    }
}

// // Create an instance of your WebSocket class and connect
// const myWebSocket = new MyWebSocket("wss://beaapis.com");
// myWebSocket.connect();

// // Send messages
// myWebSocket.send("Hello, WebSocket!");






class Nuclear {
    _iter = 0;
    reconnectAttempts = 0;
    timeoutInterval = 4000;
    cbs = {};
    _cbs = {};
    lstnrs = {};
    _ws;
    srvr = undefined;

    constructor(srvr) {
        this.srvr = srvr;

        this.init();
        return this;
    }

    on(e, cb) {
        // _cbs = {
        //   persitstant: {
        //     cbs...
        //   }
        //   normal: {
        //     cbs...
        //   }
        // }
        // off does not delete persistant cbs
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

    _emit(e, data) {
        this._iter++;
        let prom = defer();
        this._cbs["cb_" + this._iter] = prom;
        if (this.ready()) {
            this._ws.send(JSON.stringify({ e: e, payload: data, _iter: this._iter }));
        } else {
            this._send(JSON.stringify({ e: e, payload: data, _iter: this._iter }));
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

    init() {
        var _s = this;

        // if (_s.ready() || _s.connecting()) {
        //   return;
        // }

        // if (_s.connecting()) {
        //   setTimeout(function () {
        //     if (_s.ready()) {

        //     } else _s.init();
        //   }, 500);
        //   return;
        // }

        this._ws = new ReconnectingWebSocket(this.srvr ? this.srvr : "wss://www.beaapis.com/");
        this._ws.addEventListener("error", (event) => {
            // console.log("WebSocket error: ", event);
            return false;
        });
        // var localws = this._ws;
        // var timeout = setTimeout(function () {
        //   _gn = 0;
        //   barSet(1, 200);
        //   if (!(_s.ready() || _s.connecting())) localws.close();
        // }, this.timeoutInterval);

        this._ws.onopen = function (e) {
            // clearTimeout(timeout);
            _s.trigger("connect", e);
            _s.trigger("open", e);
        };

        this._ws.onclose = function (e) {
            // clearTimeout(timeout);
            // _s._ws = undefined;
            _s._iter = 0;
            _s.cbs = {};

            _gn = 0;
            barSet(1, 200);

            // setTimeout(function () {
            _s.reconnectAttempts++;
            //   _s.init();
            // }, 1000);
        };

        this._ws.onmessage = function (e) {
            try {
                let data = JSON.parse(e.data);
                if (data.hasOwnProperty("e")) {
                    let event = data["e"];
                    let iter = data["_iter"];
                    const customEvent = new CustomEvent(event, {
                        detail: data["payload"],
                    });
                    customEvent.data = data["payload"];
                    if (event != "rooms") _s.trigger(event, customEvent);
                    if (_s.cbs["cb_" + iter]) _s.cbs["cb_" + iter](customEvent);
                    // 2026-09-14, real bug found testing a real dev server
                    // end-to-end: this used to be unconditional
                    // (`_s._cbs["cb_" + iter].resolve(...)`), but `_cbs` is
                    // only ever populated by `_emit()` (the promise-based
                    // variant) — every plain `emit()` response hit
                    // `_cbs["cb_" + iter]` being undefined here and threw,
                    // silently swallowed by this function's own empty
                    // catch below. The real callback on the line above
                    // already ran by this point, so this specific crash
                    // wasn't blocking that callback — but it silently
                    // masked any OTHER error too (including a real bug in
                    // the caller's own callback), which is worse.
                    if (_s._cbs["cb_" + iter]) _s._cbs["cb_" + iter].resolve(customEvent);
                }
            } catch (e) { if (_debugMode) cl(e); }
        };
        this._ws.onerror = function (e) {
            _gn = 0;
            barSet(1, 200);
            // if (_s._ws) {
            //   _s._ws.close();
            // }
        };
    }
}

class _Ticker {
    id = "";
    tick = 1000;
    duration = 10000;
    data = {};
    status = 'created';
    user = undefined;
    channel = undefined;
    _cbs = {};

    constructor(obj, channel, user) {

        this.id = obj.id;
        this.tick = obj?.tick ?? 1000;
        this.duration = obj?.duration ?? 10000;
        this.data = obj?.data ?? {};
        this.user = user;
        this.channel = channel;
        this.user.id = this.user.id;
        this.init();
        return this;
    }

    init(opts, lstnrs) {

        let t = this.tick;
        let d = this.duration;
        let data = this.data;
        if (opts) {
            if (opts.hasOwnProperty("tick")) t = opts.tick;
            if (opts.hasOwnProperty("duration")) d = opts.duration;
            if (opts.hasOwnProperty("data")) data = opts.data;
        }

        this.user.nuke.emit("subscribe", {
            type: "ticker",
            ticker: this.id,
            channel: this.channel.id,
            user: this.user.id,
            data: {
                tick: t,
                duration: d,
                data: data
            }
        });

        if (!this.user.nuke._tickers.hasOwnProperty(this.channel.id))
            this.user.nuke._tickers[this.channel.id] = {};
        this.user.nuke._tickers[this.channel.id][this.id] = this;

        if (!lstnrs) {
            var self = this;

            this.on("create.class", function (e) {
                self.status = 'created';
            });

            this.on("start.class", function (e) {
                self.status = 'started';
            });

            this.on("tick.class", function (e) {
                self.status = 'started';
            });

            this.on("pause.class", function (e) {
                self.status = 'paused';
            });

            this.on("finish.class", function (e) {
                self.status = 'finished';
            });
        }
    }

    start() {
        if (this.status == 'started') {
            setError(null, `This ticker is already started`);
            return this;
        }

        if (this.status == 'finished') {
            setError(null, `This ticker is finished`);
            return this;
        }

        this.user.nuke.emit("ticker", {
            ticker: this.id,
            channel: this.channel.id,
            user: this.user.id,
            ev: "start",
        });
    }

    pause() {
        if (this.status == 'paused') {
            setError(null, `This ticker is already paused`);
            return this;
        }

        if (this.status != 'started') {
            setError(null, `This ticker is not started yet!`);
            return this;
        }

        this.user.nuke.emit("ticker", {
            ticker: this.id,
            channel: this.channel.id,
            user: this.user.id,
            ev: "pause",
        });
    }

    restart(opts) {
        if (this.status != 'finished') {
            setError(null, `This ticker is not finished yet!`);
            return this;
        }

        this.init(opts, true);
    }

    delete() {
        this.user.nuke.emit("unsubscribe", {
            type: "ticker",
            ticker: this.id,
            channel: this.channel.id,
            user: this.user.id,
            ev: "delete",
        });

        // This must be in the then

        // this = undefined;
        // if (this.user.nuke._tickers.hasOwnProperty(this.channel.id)) {
        //   delete this.user.nuke._tickers[this.channel.id][this.id];
        // }

    }

    extend(t) {
        this.user.nuke.emit("ticker", {
            ticker: this.id,
            channel: this.channel.id,
            user: this.user.id,
            ev: "extend",
            data: {
                time: t
            }
        });
    }

    on(e, cb) {
        let myRef2 = document.createElement("live");
        myRef2.dataset['cb'] = cb;
        document.body.append(myRef2);
        if (this._cbs.hasOwnProperty(e)) {
            this._cbs[e].push(cb);
        } else this._cbs[e] = [cb];
        return this;
    }

    off(e) {
        if (this._cbs.hasOwnProperty(e)) delete this._cbs[e];
        return this;
    }

    trigger(e, customEvent) {
        if (this._cbs.hasOwnProperty(e)) {
            for (let i = 0; i < this._cbs[e].length; i++) {
                const cb = this._cbs[e][i];
                cb(customEvent);
            }
        }
        return this;
    }

}

class _Channel {
    id = "/";
    user = undefined;
    type = "room";
    _cbs = {};

    constructor(id, type, user) {
        this.id = id;
        this.type = type;
        this.user = user;
        this.user.id = this.user.id ?? "Guest";
        return this;
    }

    trigger(e, customEvent) {
        if (this._cbs.hasOwnProperty(e)) {
            for (let i = 0; i < this._cbs[e].length; i++) {
                const cb = this._cbs[e][i];
                cb(customEvent);
            }
        }
        return this;
    }

    join() {
        this.user.nuke.emit("subscribe", {
            type: this.type,
            channel: this.id,
            user: this.user.id,
        });

        if (!this.user.nuke._chnls.hasOwnProperty(this.user.id))
            this.user.nuke._chnls[this.user.id] = {};
        this.user.nuke._chnls[this.user.id][this.id] = this;
    }

    leave() {
        this.user.nuke.emit("unsubscribe", {
            type: this.type,
            channel: this.id,
            user: this.user.id,
            ev: "leave",
        });
        if (this.user.nuke._chnls.hasOwnProperty(this.user.id)) {
            delete this.user.nuke._chnls[this.user.id][this.id];
        }
    }

    broadcast(ev, options) {
        this.user.nuke.emit("broadcast", {
            type: "room",
            channel: this.id,
            user: this.user.id,
            ev: ev,
            includeMe: options?.includeMe ?? true,
            data: options?.data ?? {},
        });
    }

    off(e) {
        if (e == "connect") return this;
        if (this._cbs.hasOwnProperty(e)) delete this._cbs[e];
        return this;
    }

    on(e, cb) {
        let myRef2 = document.createElement("live");
        myRef2.dataset['cb'] = cb;
        document.body.append(myRef2);
        if (this._cbs.hasOwnProperty(e)) {
            this._cbs[e].push(cb);
        } else this._cbs[e] = [cb];
        return this;
    }

    createTicker(obj) {
        if (!this.user.nuke._tickers.hasOwnProperty(this.id)) {
            this.user.nuke._tickers[this.id] = {};
        }

        // if (this.user.nuke._tickers[this.id].hasOwnProperty(obj.id)) {
        //   setError(null, `This ticker already exsists`);
        //   return this.user.nuke._tickers[this.id][obj.id];
        // }

        let t = new _Ticker(obj, this, this.user);
        return t;
    }

    getTicker(id) {
        this.user.nuke.emit("get", {
            type: "ticker",
            channel: this.id,
            user: this.user.id,
            ticker: id
        });
    }
}

class _User {
    id = "";
    nuke = undefined;
    _cbs = {};

    constructor(id, nuke) {
        this.id = id;
        this.nuke = nuke;
        this.init();
        return this;
    }
    init() {
        this.nuke.emit("subscribe", {
            type: "user",
            channel: this.id,
            user: this.id,
        });
        if (!this.nuke._users.hasOwnProperty("/" + this.id))
            this.nuke._users["/" + this.id] = this;
    }

    on(e, cb) {
        if (this.nuke._users["/" + this.id]._cbs.hasOwnProperty(e)) {
            this.nuke._users["/" + this.id]._cbs[e].push(cb);
        } else this.nuke._users["/" + this.id]._cbs[e] = [cb];
        return this;
    }

    off(e) {
        if (this._cbs.hasOwnProperty(e)) delete this._cbs[e];
        return this;
    }

    broadcast(ev, options) {
        this.nuke.emit("broadcast", {
            type: "user",
            channel: this.id,
            user: this.id,
            ev: ev,
            includeMe: options?.includeMe ?? true,
            data: options?.data ?? {},
        });
    }

    trigger(e, customEvent) {
        if (this._cbs.hasOwnProperty(e)) {
            for (let i = 0; i < this._cbs[e].length; i++) {
                const cb = this._cbs[e][i];
                cb(customEvent);
            }
        }
        return this;
    }

    _broadcastToAll(IDs, e, d, t) {
        this.nuke.emit("broadcast", {
            type: t == "u" ? "user" : "room",
            user: this.id,
            ev: e,
            includeMe: d["includeMe"] ?? true,
            data: d["data"],
            ...(t == "u" ? { users: IDs.join(",") } : { channels: IDs.join(",") }),
        });
    }

    broadcastToUsers(uIDs, e, d) {
        this._broadcastToAll(uIDs, e, d, "u");
    }

    broadcastToChannels(cIDs, e, d) {
        this._broadcastToAll(cIDs, e, d, "c");
    }

    unsubscribe(c) {
        if (this.nuke._chnls.hasOwnProperty(this.id)) {
            if (this.nuke._chnls[this.id].hasOwnProperty(c))
                this.nuke._chnls[this.id][c].leave();
        }
    }

    subscribe(e, cb) {
        if (!this.nuke._chnls.hasOwnProperty(this.id)) {
            this.nuke._chnls[this.id] = {};
        }

        // if (this.nuke._chnls[this.id].hasOwnProperty(e)) {
        //   setError(null, `You are already subscribed to ${e} as ${this.id}`);
        //   return this.nuke._chnls[this.id][e];
        // }
        let channel = new _Channel(e, "room", this);
        channel.join();
        return channel;
    }

    destroy() {
        this._cbs = {};
        if (this.nuke._chnls.hasOwnProperty(this.id)) {
            let chnls = this.nuke._chnls[this.id];
            for (const chnl in chnls) {
                this.unsubscribe(chnl);
            }
        }
    }
}

class _Live {
    _chnls = {};
    _users = {};
    _tickers = {};
    _iter = 0;
    reconnectAttempts = 0;
    timeoutInterval = 4000;
    cbs = {};
    _cbs = {};
    lstnrs = {};
    _ws;
    srvr = undefined;

    constructor(srvr) {
        this.srvr = srvr;

        this.init();
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

    _emit(e, data) {
        this._iter++;
        let prom = defer();
        this._cbs["cb_" + this._iter] = prom;
        if (this.ready()) {
            this._ws.send(JSON.stringify({ e: e, payload: data, _iter: this._iter }));
        } else {
            this._send(JSON.stringify({ e: e, payload: data, _iter: this._iter }));
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

    init() {
        var _s = this;

        if (_s.ready() || _s.connecting()) {
            return;
        }

        // if (_s.connecting()) {
        //   setTimeout(function () {
        //     if (_s.ready()) {

        //     } else _s.init();
        //   }, 500);
        //   return;
        // }

        this._ws = new ReconnectingWebSocket(
            this.srvr ? this.srvr : "wss://www.beaapis.com/"
        );
        this._ws.addEventListener("error", (event) => {
            // console.log("WebSocketƒ2 error: ", event);
        });

        // var localws = this._ws;
        // var timeout = setTimeout(function () {
        //   _gn = 0;
        //   barSet(1, 200);
        //   if (!(_s.ready() || _s.connecting())) localws.close();
        // }, this.timeoutInterval);

        this._ws.onopen = function (e) {
            // clearTimeout(timeout);
            _s.trigger("connect", e);
            _s.trigger("open", e);
        };

        this._ws.onclose = function (e) {
            // clearTimeout(timeout);
            // _s._ws = undefined;
            _s._iter = 0;
            _s.cbs = {};

            _gn = 0;
            barSet(1, 200);

            // setTimeout(function () {
            _s.reconnectAttempts++;
            //   _s.init();
            // }, 1000);
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
                            // cl([t,_s._users],data["for"],ev,_s._users[data["for"]].trigger(ev, customEvent));
                            _s._users[data["for"]].trigger(ev, customEvent);
                        } else if (t == "room")
                            _s._chnls[payload.user.id][data["for"]].trigger(
                                ev,
                                customEvent
                            );
                        else if (t == "ticker") {
                            _s._tickers[data["for"]][payload?.ticker?.id].trigger(
                                ev,
                                customEvent
                            );
                            _s._tickers[data["for"]][payload?.ticker?.id].trigger(
                                ev + ".class",
                                customEvent
                            );
                        }
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
                    // 2026-09-14, real bug found testing a real dev server
                    // end-to-end: this used to be unconditional
                    // (`_s._cbs["cb_" + iter].resolve(...)`), but `_cbs` is
                    // only ever populated by `_emit()` (the promise-based
                    // variant) — every plain `emit()` response hit
                    // `_cbs["cb_" + iter]` being undefined here and threw,
                    // silently swallowed by this function's own empty
                    // catch below. The real callback on the line above
                    // already ran by this point, so this specific crash
                    // wasn't blocking that callback — but it silently
                    // masked any OTHER error too (including a real bug in
                    // the caller's own callback), which is worse.
                    if (_s._cbs["cb_" + iter]) _s._cbs["cb_" + iter].resolve(customEvent);
                }
            } catch (e) { if (_debugMode) cl(e); }
        };
        this._ws.onerror = function (e) {
            _gn = 0;
            barSet(1, 200);
            // cl("Zikoo");
            // if (_s._ws) {
            //   _s._ws.close();
            // }
        };
    }
}
let LIVE;
let Nuke;
// window.onload = function () {
LIVE = new _Live("wss://www.beaapis.com/");
// Production = a signed build (_beaTn) or a build without BaaS keys (_lmStatic, 2.5.9). Only `lm serve` talks to
// the local dev server.
Nuke = new Nuclear(
    _beaTn || typeof _lmStatic !== "undefined"
        ? undefined
        : (window.location.protocol === "https:" ? "wss://" : "ws://") +
        window.location.hostname +
        (window.location.port ? ":" + window.location.port : "")
);
let _ovcD, _vcD;

// index.js's dev bootstrap now lives in index-bootstrap.js, concatenated at
// the very FRONT of this bundle (see build/bundle.js) — it has to run
// before vendor/reconnecting-websocket.js's $(document).ready() handler
// can fire (which it can do synchronously, mid-script), not merely before
// this file. See that file's comment for the full reasoning; this used to
// live here and raced that ready handler.

// Fetches all views/layouts and diffs against the previous copy, targeted
// re-rendering only whatever view/layout actually changed. Originally only
// ran on the socket's "connect" event (meaning a full nodemon process
// restart — see @lmjs_v2/cli's old startServer() — was the only way to
// trigger it, dropping every client connection in the process). Pulled out
// into its own function 2026-09-14 so a lighter, in-process "files-changed"
// push (chokidar-based, no restart, no dropped connection — see app.js) can
// trigger the exact same logic without needing a reconnect at all.
function syncViewFiles() {
    Nuke.emit("getfiles", {}, function (e) {
        var _files = e.data;
            let views = _files["views"];
            let layouts = _files["layouts"];
            // var HST = new _hst(views['c3JjL3ZpZXdzL2hvbWUudmlldw==']);
            // cl(HST);
            _vcD = _files;
            if (!_ovcD) _ovcD = clone(_vcD);
            else {
                for (var key in views) {
                    if (_ovcD['views'].hasOwnProperty(key)) {
                        if (!deepCompare(clone(_ovcD['views'][key]), clone(views[key]))) {
                            cl("Changed the " + "view " + atob(key));
                            let n = atob(key)
                                .split("src/views/")
                                .join("")
                                .split(".view")
                                .join("");
                            let nodes = getURLNodes();
                            _ovcD['views'][key] = views[key];
                            cl("view", n, atob(key));
                            if (n.indexOf("widgets/") === 0) {
                                // 2026-09-20 fix: a changed src/views/widgets/*.view
                                // file used to fall into the plain `else` branch
                                // below, calling renderView(n, true, {}) — n is a
                                // widget path like "widgets/nav", not a real
                                // navigable view/subview, so that call did nothing
                                // visible. Worse: even a real re-render of the
                                // CURRENT page wouldn't have picked up the change
                                // on its own — persistent widgets (_vt.Widgets, see
                                // _re.js's renderView()) are deliberately left
                                // untouched on ordinary navigation unless the
                                // RESOLVED NAME changes, which it doesn't here (the
                                // region still resolves to the same widget name,
                                // only that widget's own file content changed).
                                // Clearing the matching widget(s)' _resolvedFile
                                // makes the next renderView() call treat them as
                                // freshly (un)resolved, forcing a real remount with
                                // the new content.
                                let changedWidgetName = n.split("widgets/").join("");
                                for (let regionName in _vt.Widgets) {
                                    if (_vt.Widgets[regionName]._resolvedFile === changedWidgetName) {
                                        _vt.Widgets[regionName]._resolvedFile = undefined;
                                    }
                                }
                                renderView(nodes[0], null, View.props ?? {});
                            } else if (nodes[0] == n) {
                                renderView(nodes[0], null, View.props ?? {});
                            } else {
                                // A subview can be nested at any depth (a
                                // footer inside a guide sub-page), so
                                // searching one views[] list misses most of
                                // them. Re-rendering the current page mounts
                                // every subview fresh from the updated files.
                                renderView(nodes[0], null, View.props ?? {});
                            }
                        }
                    }
                }
                for (var key in layouts) {
                    if (_ovcD['layouts'].hasOwnProperty(key)) {
                        if (!deepCompare(clone(_ovcD['layouts'][key]), clone(layouts[key]))) {
                            cl("Changed the " + "layout " + atob(key));
                            let n = atob(key)
                                .split("src/layouts/")
                                .join("")
                                .split(".layout")
                                .join("");
                            let nodes = getURLNodes();
                            _ovcD['layouts'][key] = layouts[key];
                            cl("layout", n, atob(key));
                            // if (nodes[0] == n) {
                            // renderView(nodes[0], null, View.props ?? {});
                            // } else {
                            renderView(n, false, {}, 'layouts');
                            // if (n.indexOf("widgets/") > -1) {
                            //     $('[kd="' + key + '"]').addClass("_render");
                            //     renderWidget(n.split("widgets/").join(""), "kd='" + key + "'");
                            //     globalWatch();
                            // } else {
                            //     $('[view="' + n + '"]')
                            //         .removeData("_status")
                            //         .removeData("_re");
                            //     globalWatch();
                            // }
                            // }
                        }
                    }
                }
                // tpls/comps render inline in their host views, so any
                // template change means re-rendering the current page.
                let tpls = _files["tpls"] || {};
                let tplsChanged = !deepCompare(clone(_ovcD['tpls'] || {}), clone(tpls));
                if (tplsChanged) {
                    _ovcD['tpls'] = tpls;
                    let nodes = getURLNodes();
                    renderView(nodes[0], null, View.props ?? {});
                }
            }
        });
}

Nuke.on("connect", function () {
    if (_beaTn) {
        Nuke.emit(
            "get_uniquer",
            {
                beajsToken: _beaTn,
                uniquer: globals.uniquer,
            },
            function (e) {
                let d = e.data;
                let data = d.uniquer;
                globals.uniquer = data;
            }
        );
    } else if (typeof _lmStatic === "undefined") {
        syncViewFiles();
    }
});

// Dev-only: pushed by the local server the instant chokidar detects a
// src/views or src/layouts change (see @lmjs_v2/cli's app.js) — no process
// restart, no dropped connection, unlike the old nodemon-restart-triggered
// "connect" path above. Same fetch-and-diff, just a lighter trigger.
Nuke.on("files-changed", function () {
    if (!_beaTn && typeof _lmStatic === "undefined") syncViewFiles();
});
// };


var API = {
    get: function (u, d, h, a, opts) {
        return this.req(u, d, h, "GET", a, opts);
    },
    put: function (u, d, h, a, opts) {
        return this.req(u, d, h, "PUT", a, opts);
    },
    post: function (u, d, h, a, opts) {
        return this.req(u, d, h, "POST", a, opts);
    },
    delete: function (u, d, h, a, opts) {
        return this.req(u, d, h, "DELETE", a, opts);
    },
    patch: function (u, d, h, a, opts) {
        return this.req(u, d, h, "PATCH", a, opts);
    },
    req: function (u, d, h, m, a, opts, _prom) {
        if (!opts) opts = { full: false, progress: true };
        let prog = opts.hasOwnProperty("progress") ? opts.progress : true;
        let full = opts.hasOwnProperty("full") ? opts.full : false;

        let prom = _prom ? _prom : defer();
        try {
            return prom;
        } finally {
            if (
                Nuke &&
                Nuke._ws &&
                Nuke._ws.readyState == 1 &&
                (_beaTn ? globals.uniquer > 0 : true)
            ) {
                if (prog) {
                    _gn = 0;
                    _work();
                }
                Nuke.emit(
                    "request",
                    {
                        body: {
                            method: m,
                            path: u,
                            api: a ?? 0,
                            headers: h,
                            full: full,
                        },
                        uniquer: globals.uniquer ?? 0,
                        data: d,
                    },
                    function (e) {
                        // cl(e);
                        if (prog) {
                            _gn = 0;
                            barSet(1, 200);
                        }
                        var r = e.data;
                        prom.resolve(r);
                    }
                );
            } else {

                if (_beaTn && _beaTn != "") {
                    $.ajax({
                        "url": "https://www.beaapis.com/req",
                        headers: {},
                        type: "POST",
                        dataType: "json",
                        data: {
                            body: {
                                method: m,
                                path: u,
                                api: a ?? 0,
                                headers: h,
                                full: full,
                            },
                            uniquer: globals.uniquer ?? 0,
                            _beaTn: _beaTn,
                            data: d,
                        },
                        cache: false,
                        success: function (r, s) {
                            prom.resolve(r);
                        },
                        error: function () {
                            prom.reject("error");
                        }
                    });
                } else {
                    setTimeout(() => {
                        this.req(u, d, h, m, a, opts, prom);
                    }, _tickTime);
                }
                // API22.req(u, d, h, m, a, opts, prom);

                // prom.resolve(r);
            }
        }
    },
};