// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.
// This module ports:
// - https://github.com/nodejs/node/blob/master/src/tcp_wrap.cc
// - https://github.com/nodejs/node/blob/master/src/tcp_wrap.h
import { notImplemented } from "../_utils.ts";
import { unreachable } from "../../testing/asserts.ts";
import { ConnectionWrap } from "./connection_wrap.ts";
import { AsyncWrap, providerType } from "./async_wrap.ts";
import { LibuvStreamWrap } from "./stream_wrap.ts";
import { ownerSymbol } from "./symbols.ts";
import { codeMap } from "./uv.ts";
import { delay } from "../../async/mod.ts";
import { kStreamBaseField } from "./stream_wrap.ts";
import { isIP } from "../internal/net.ts";
import { ceilPowOf2, INITIAL_ACCEPT_BACKOFF_DELAY, MAX_ACCEPT_BACKOFF_DELAY } from "./_listen.ts";
import * as DenoUnstable from "../../_deno_unstable.ts";
var /** The type of TCP socket. */ socketType;
(function(socketType) {
    socketType[socketType["SOCKET"] = 0] = "SOCKET";
    socketType[socketType["SERVER"] = 1] = "SERVER";
})(socketType || (socketType = {}));
export class TCPConnectWrap extends AsyncWrap {
    oncomplete;
    address;
    port;
    localAddress;
    localPort;
    constructor(){
        super(providerType.TCPCONNECTWRAP);
    }
}
export var constants;
(function(constants) {
    constants[constants["SOCKET"] = socketType.SOCKET] = "SOCKET";
    constants[constants["SERVER"] = socketType.SERVER] = "SERVER";
    constants[constants["UV_TCP_IPV6ONLY"] = 0] = "UV_TCP_IPV6ONLY";
})(constants || (constants = {}));
export class TCP extends ConnectionWrap {
    [ownerSymbol] = null;
    reading = false;
    #address;
    #port;
    #remoteAddress;
    #remoteFamily;
    #remotePort;
    #backlog;
    #listener;
    #connections = 0;
    #closed = false;
    #acceptBackoffDelay;
    /**
   * Creates a new TCP class instance.
   * @param type The socket type.
   * @param conn Optional connection object to wrap.
   */ constructor(type, conn){
        let provider;
        switch(type){
            case socketType.SOCKET:
                {
                    provider = providerType.TCPWRAP;
                    break;
                }
            case socketType.SERVER:
                {
                    provider = providerType.TCPSERVERWRAP;
                    break;
                }
            default:
                {
                    unreachable();
                }
        }
        super(provider, conn);
        // TODO(cmorten): the handling of new connections and construction feels
        // a little off. Suspect duplicating in some fashion.
        if (conn && provider === providerType.TCPWRAP) {
            const localAddr = conn.localAddr;
            this.#address = localAddr.hostname;
            this.#port = localAddr.port;
            const remoteAddr = conn.remoteAddr;
            this.#remoteAddress = remoteAddr.hostname;
            this.#remotePort = remoteAddr.port;
            this.#remoteFamily = isIP(remoteAddr.hostname);
        }
    }
    /**
   * Opens a file descriptor.
   * @param fd The file descriptor to open.
   * @return An error status code.
   */ open(_fd) {
        // REF: https://github.com/denoland/deno/issues/6529
        notImplemented("TCP.prototype.open");
    }
    /**
   * Bind to an IPv4 address.
   * @param address The hostname to bind to.
   * @param port The port to bind to
   * @return An error status code.
   */ bind(address, port) {
        return this.#bind(address, port, 0);
    }
    /**
   * Bind to an IPv6 address.
   * @param address The hostname to bind to.
   * @param port The port to bind to
   * @return An error status code.
   */ bind6(address, port, flags) {
        return this.#bind(address, port, flags);
    }
    /**
   * Connect to an IPv4 address.
   * @param req A TCPConnectWrap instance.
   * @param address The hostname to connect to.
   * @param port The port to connect to.
   * @return An error status code.
   */ connect(req, address, port) {
        return this.#connect(req, address, port);
    }
    /**
   * Connect to an IPv6 address.
   * @param req A TCPConnectWrap instance.
   * @param address The hostname to connect to.
   * @param port The port to connect to.
   * @return An error status code.
   */ connect6(req, address, port) {
        return this.#connect(req, address, port);
    }
    /**
   * Listen for new connections.
   * @param backlog The maximum length of the queue of pending connections.
   * @return An error status code.
   */ listen(backlog) {
        this.#backlog = ceilPowOf2(backlog + 1);
        const listenOptions = {
            hostname: this.#address,
            port: this.#port,
            transport: "tcp"
        };
        let listener;
        try {
            listener = Deno.listen(listenOptions);
        } catch (e) {
            if (e instanceof Deno.errors.AddrInUse) {
                return codeMap.get("EADDRINUSE");
            } else if (e instanceof Deno.errors.AddrNotAvailable) {
                return codeMap.get("EADDRNOTAVAIL");
            }
            // TODO(cmorten): map errors to appropriate error codes.
            return codeMap.get("UNKNOWN");
        }
        const address = listener.addr;
        this.#address = address.hostname;
        this.#port = address.port;
        this.#listener = listener;
        this.#accept();
        return 0;
    }
    ref() {
        if (this.#listener) {
            DenoUnstable.ListenerRef(this.#listener);
        }
    }
    unref() {
        if (this.#listener) {
            DenoUnstable.ListenerUnref(this.#listener);
        }
    }
    /**
   * Populates the provided object with local address entries.
   * @param sockname An object to add the local address entries to.
   * @return An error status code.
   */ getsockname(sockname) {
        if (typeof this.#address === "undefined" || typeof this.#port === "undefined") {
            return codeMap.get("EADDRNOTAVAIL");
        }
        sockname.address = this.#address;
        sockname.port = this.#port;
        sockname.family = isIP(this.#address);
        return 0;
    }
    /**
   * Populates the provided object with remote address entries.
   * @param peername An object to add the remote address entries to.
   * @return An error status code.
   */ getpeername(peername) {
        if (typeof this.#remoteAddress === "undefined" || typeof this.#remotePort === "undefined") {
            return codeMap.get("EADDRNOTAVAIL");
        }
        peername.address = this.#remoteAddress;
        peername.port = this.#remotePort;
        peername.family = this.#remoteFamily;
        return 0;
    }
    /**
   * @param noDelay
   * @return An error status code.
   */ setNoDelay(_noDelay) {
        // TODO(bnoordhuis) https://github.com/denoland/deno/pull/13103
        return 0;
    }
    /**
   * @param enable
   * @param initialDelay
   * @return An error status code.
   */ setKeepAlive(_enable, _initialDelay) {
        // TODO(bnoordhuis) https://github.com/denoland/deno/pull/13103
        return 0;
    }
    /**
   * Windows only.
   *
   * Deprecated by Node.
   * REF: https://github.com/nodejs/node/blob/master/lib/net.js#L1731
   *
   * @param enable
   * @return An error status code.
   * @deprecated
   */ setSimultaneousAccepts(_enable) {
        // Low priority to implement owing to it being deprecated in Node.
        notImplemented("TCP.prototype.setSimultaneousAccepts");
    }
    /**
   * Bind to an IPv4 or IPv6 address.
   * @param address The hostname to bind to.
   * @param port The port to bind to
   * @param _flags
   * @return An error status code.
   */  #bind(address, port, _flags) {
        // Deno doesn't currently separate bind from connect etc.
        // REF:
        // - https://doc.deno.land/deno/stable/~/Deno.connect
        // - https://doc.deno.land/deno/stable/~/Deno.listen
        //
        // This also means we won't be connecting from the specified local address
        // and port as providing these is not an option in Deno.
        // REF:
        // - https://doc.deno.land/deno/stable/~/Deno.ConnectOptions
        // - https://doc.deno.land/deno/stable/~/Deno.ListenOptions
        this.#address = address;
        this.#port = port;
        return 0;
    }
    /**
   * Connect to an IPv4 or IPv6 address.
   * @param req A TCPConnectWrap instance.
   * @param address The hostname to connect to.
   * @param port The port to connect to.
   * @return An error status code.
   */  #connect(req, address1, port1) {
        this.#remoteAddress = address1;
        this.#remotePort = port1;
        this.#remoteFamily = isIP(address1);
        const connectOptions = {
            hostname: address1,
            port: port1,
            transport: "tcp"
        };
        Deno.connect(connectOptions).then((conn)=>{
            // Incorrect / backwards, but correcting the local address and port with
            // what was actually used given we can't actually specify these in Deno.
            const localAddr = conn.localAddr;
            this.#address = req.localAddress = localAddr.hostname;
            this.#port = req.localPort = localAddr.port;
            this[kStreamBaseField] = conn;
            try {
                this.afterConnect(req, 0);
            } catch  {
            // swallow callback errors.
            }
        }, ()=>{
            try {
                // TODO(cmorten): correct mapping of connection error to status code.
                this.afterConnect(req, codeMap.get("ECONNREFUSED"));
            } catch  {
            // swallow callback errors.
            }
        });
        return 0;
    }
    /** Handle backoff delays following an unsuccessful accept. */ async #acceptBackoff() {
        // Backoff after transient errors to allow time for the system to
        // recover, and avoid blocking up the event loop with a continuously
        // running loop.
        if (!this.#acceptBackoffDelay) {
            this.#acceptBackoffDelay = INITIAL_ACCEPT_BACKOFF_DELAY;
        } else {
            this.#acceptBackoffDelay *= 2;
        }
        if (this.#acceptBackoffDelay >= MAX_ACCEPT_BACKOFF_DELAY) {
            this.#acceptBackoffDelay = MAX_ACCEPT_BACKOFF_DELAY;
        }
        await delay(this.#acceptBackoffDelay);
        this.#accept();
    }
    /** Accept new connections. */ async #accept() {
        if (this.#closed) {
            return;
        }
        if (this.#connections > this.#backlog) {
            this.#acceptBackoff();
            return;
        }
        let connection;
        try {
            connection = await this.#listener.accept();
        } catch (e) {
            if (e instanceof Deno.errors.BadResource && this.#closed) {
                // Listener and server has closed.
                return;
            }
            try {
                // TODO(cmorten): map errors to appropriate error codes.
                this.onconnection(codeMap.get("UNKNOWN"), undefined);
            } catch  {
            // swallow callback errors.
            }
            this.#acceptBackoff();
            return;
        }
        // Reset the backoff delay upon successful accept.
        this.#acceptBackoffDelay = undefined;
        const connectionHandle = new TCP(socketType.SOCKET, connection);
        this.#connections++;
        try {
            this.onconnection(0, connectionHandle);
        } catch  {
        // swallow callback errors.
        }
        return this.#accept();
    }
    /** Handle server closure. */ _onClose() {
        this.#closed = true;
        this.reading = false;
        this.#address = undefined;
        this.#port = undefined;
        this.#remoteAddress = undefined;
        this.#remoteFamily = undefined;
        this.#remotePort = undefined;
        this.#backlog = undefined;
        this.#connections = 0;
        this.#acceptBackoffDelay = undefined;
        if (this.provider === providerType.TCPSERVERWRAP) {
            try {
                this.#listener.close();
            } catch  {
            // listener already closed
            }
        }
        return LibuvStreamWrap.prototype._onClose.call(this);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvaW50ZXJuYWxfYmluZGluZy90Y3Bfd3JhcC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIFRoaXMgbW9kdWxlIHBvcnRzOlxuLy8gLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvYmxvYi9tYXN0ZXIvc3JjL3RjcF93cmFwLmNjXG4vLyAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9ibG9iL21hc3Rlci9zcmMvdGNwX3dyYXAuaFxuXG5pbXBvcnQgeyBub3RJbXBsZW1lbnRlZCB9IGZyb20gXCIuLi9fdXRpbHMudHNcIjtcbmltcG9ydCB7IHVucmVhY2hhYmxlIH0gZnJvbSBcIi4uLy4uL3Rlc3RpbmcvYXNzZXJ0cy50c1wiO1xuaW1wb3J0IHsgQ29ubmVjdGlvbldyYXAgfSBmcm9tIFwiLi9jb25uZWN0aW9uX3dyYXAudHNcIjtcbmltcG9ydCB7IEFzeW5jV3JhcCwgcHJvdmlkZXJUeXBlIH0gZnJvbSBcIi4vYXN5bmNfd3JhcC50c1wiO1xuaW1wb3J0IHsgTGlidXZTdHJlYW1XcmFwIH0gZnJvbSBcIi4vc3RyZWFtX3dyYXAudHNcIjtcbmltcG9ydCB7IG93bmVyU3ltYm9sIH0gZnJvbSBcIi4vc3ltYm9scy50c1wiO1xuaW1wb3J0IHsgY29kZU1hcCB9IGZyb20gXCIuL3V2LnRzXCI7XG5pbXBvcnQgeyBkZWxheSB9IGZyb20gXCIuLi8uLi9hc3luYy9tb2QudHNcIjtcbmltcG9ydCB7IGtTdHJlYW1CYXNlRmllbGQgfSBmcm9tIFwiLi9zdHJlYW1fd3JhcC50c1wiO1xuaW1wb3J0IHsgaXNJUCB9IGZyb20gXCIuLi9pbnRlcm5hbC9uZXQudHNcIjtcbmltcG9ydCB7XG4gIGNlaWxQb3dPZjIsXG4gIElOSVRJQUxfQUNDRVBUX0JBQ0tPRkZfREVMQVksXG4gIE1BWF9BQ0NFUFRfQkFDS09GRl9ERUxBWSxcbn0gZnJvbSBcIi4vX2xpc3Rlbi50c1wiO1xuaW1wb3J0ICogYXMgRGVub1Vuc3RhYmxlIGZyb20gXCIuLi8uLi9fZGVub191bnN0YWJsZS50c1wiO1xuXG4vKiogVGhlIHR5cGUgb2YgVENQIHNvY2tldC4gKi9cbmVudW0gc29ja2V0VHlwZSB7XG4gIFNPQ0tFVCxcbiAgU0VSVkVSLFxufVxuXG5pbnRlcmZhY2UgQWRkcmVzc0luZm8ge1xuICBhZGRyZXNzOiBzdHJpbmc7XG4gIGZhbWlseT86IG51bWJlcjtcbiAgcG9ydDogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgVENQQ29ubmVjdFdyYXAgZXh0ZW5kcyBBc3luY1dyYXAge1xuICBvbmNvbXBsZXRlITogKFxuICAgIHN0YXR1czogbnVtYmVyLFxuICAgIGhhbmRsZTogQ29ubmVjdGlvbldyYXAsXG4gICAgcmVxOiBUQ1BDb25uZWN0V3JhcCxcbiAgICByZWFkYWJsZTogYm9vbGVhbixcbiAgICB3cml0ZWFibGU6IGJvb2xlYW4sXG4gICkgPT4gdm9pZDtcbiAgYWRkcmVzcyE6IHN0cmluZztcbiAgcG9ydCE6IG51bWJlcjtcbiAgbG9jYWxBZGRyZXNzITogc3RyaW5nO1xuICBsb2NhbFBvcnQhOiBudW1iZXI7XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIocHJvdmlkZXJUeXBlLlRDUENPTk5FQ1RXUkFQKTtcbiAgfVxufVxuXG5leHBvcnQgZW51bSBjb25zdGFudHMge1xuICBTT0NLRVQgPSBzb2NrZXRUeXBlLlNPQ0tFVCxcbiAgU0VSVkVSID0gc29ja2V0VHlwZS5TRVJWRVIsXG4gIFVWX1RDUF9JUFY2T05MWSxcbn1cblxuZXhwb3J0IGNsYXNzIFRDUCBleHRlbmRzIENvbm5lY3Rpb25XcmFwIHtcbiAgW293bmVyU3ltYm9sXTogdW5rbm93biA9IG51bGw7XG4gIG92ZXJyaWRlIHJlYWRpbmcgPSBmYWxzZTtcblxuICAjYWRkcmVzcz86IHN0cmluZztcbiAgI3BvcnQ/OiBudW1iZXI7XG5cbiAgI3JlbW90ZUFkZHJlc3M/OiBzdHJpbmc7XG4gICNyZW1vdGVGYW1pbHk/OiBudW1iZXI7XG4gICNyZW1vdGVQb3J0PzogbnVtYmVyO1xuXG4gICNiYWNrbG9nPzogbnVtYmVyO1xuICAjbGlzdGVuZXIhOiBEZW5vLkxpc3RlbmVyO1xuICAjY29ubmVjdGlvbnMgPSAwO1xuXG4gICNjbG9zZWQgPSBmYWxzZTtcbiAgI2FjY2VwdEJhY2tvZmZEZWxheT86IG51bWJlcjtcblxuICAvKipcbiAgICogQ3JlYXRlcyBhIG5ldyBUQ1AgY2xhc3MgaW5zdGFuY2UuXG4gICAqIEBwYXJhbSB0eXBlIFRoZSBzb2NrZXQgdHlwZS5cbiAgICogQHBhcmFtIGNvbm4gT3B0aW9uYWwgY29ubmVjdGlvbiBvYmplY3QgdG8gd3JhcC5cbiAgICovXG4gIGNvbnN0cnVjdG9yKHR5cGU6IG51bWJlciwgY29ubj86IERlbm8uQ29ubikge1xuICAgIGxldCBwcm92aWRlcjogcHJvdmlkZXJUeXBlO1xuXG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlIHNvY2tldFR5cGUuU09DS0VUOiB7XG4gICAgICAgIHByb3ZpZGVyID0gcHJvdmlkZXJUeXBlLlRDUFdSQVA7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlIHNvY2tldFR5cGUuU0VSVkVSOiB7XG4gICAgICAgIHByb3ZpZGVyID0gcHJvdmlkZXJUeXBlLlRDUFNFUlZFUldSQVA7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBkZWZhdWx0OiB7XG4gICAgICAgIHVucmVhY2hhYmxlKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgc3VwZXIocHJvdmlkZXIsIGNvbm4pO1xuXG4gICAgLy8gVE9ETyhjbW9ydGVuKTogdGhlIGhhbmRsaW5nIG9mIG5ldyBjb25uZWN0aW9ucyBhbmQgY29uc3RydWN0aW9uIGZlZWxzXG4gICAgLy8gYSBsaXR0bGUgb2ZmLiBTdXNwZWN0IGR1cGxpY2F0aW5nIGluIHNvbWUgZmFzaGlvbi5cbiAgICBpZiAoY29ubiAmJiBwcm92aWRlciA9PT0gcHJvdmlkZXJUeXBlLlRDUFdSQVApIHtcbiAgICAgIGNvbnN0IGxvY2FsQWRkciA9IGNvbm4ubG9jYWxBZGRyIGFzIERlbm8uTmV0QWRkcjtcbiAgICAgIHRoaXMuI2FkZHJlc3MgPSBsb2NhbEFkZHIuaG9zdG5hbWU7XG4gICAgICB0aGlzLiNwb3J0ID0gbG9jYWxBZGRyLnBvcnQ7XG5cbiAgICAgIGNvbnN0IHJlbW90ZUFkZHIgPSBjb25uLnJlbW90ZUFkZHIgYXMgRGVuby5OZXRBZGRyO1xuICAgICAgdGhpcy4jcmVtb3RlQWRkcmVzcyA9IHJlbW90ZUFkZHIuaG9zdG5hbWU7XG4gICAgICB0aGlzLiNyZW1vdGVQb3J0ID0gcmVtb3RlQWRkci5wb3J0O1xuICAgICAgdGhpcy4jcmVtb3RlRmFtaWx5ID0gaXNJUChyZW1vdGVBZGRyLmhvc3RuYW1lKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogT3BlbnMgYSBmaWxlIGRlc2NyaXB0b3IuXG4gICAqIEBwYXJhbSBmZCBUaGUgZmlsZSBkZXNjcmlwdG9yIHRvIG9wZW4uXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICBvcGVuKF9mZDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAvLyBSRUY6IGh0dHBzOi8vZ2l0aHViLmNvbS9kZW5vbGFuZC9kZW5vL2lzc3Vlcy82NTI5XG4gICAgbm90SW1wbGVtZW50ZWQoXCJUQ1AucHJvdG90eXBlLm9wZW5cIik7XG4gIH1cblxuICAvKipcbiAgICogQmluZCB0byBhbiBJUHY0IGFkZHJlc3MuXG4gICAqIEBwYXJhbSBhZGRyZXNzIFRoZSBob3N0bmFtZSB0byBiaW5kIHRvLlxuICAgKiBAcGFyYW0gcG9ydCBUaGUgcG9ydCB0byBiaW5kIHRvXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICBiaW5kKGFkZHJlc3M6IHN0cmluZywgcG9ydDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy4jYmluZChhZGRyZXNzLCBwb3J0LCAwKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBCaW5kIHRvIGFuIElQdjYgYWRkcmVzcy5cbiAgICogQHBhcmFtIGFkZHJlc3MgVGhlIGhvc3RuYW1lIHRvIGJpbmQgdG8uXG4gICAqIEBwYXJhbSBwb3J0IFRoZSBwb3J0IHRvIGJpbmQgdG9cbiAgICogQHJldHVybiBBbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICovXG4gIGJpbmQ2KGFkZHJlc3M6IHN0cmluZywgcG9ydDogbnVtYmVyLCBmbGFnczogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy4jYmluZChhZGRyZXNzLCBwb3J0LCBmbGFncyk7XG4gIH1cblxuICAvKipcbiAgICogQ29ubmVjdCB0byBhbiBJUHY0IGFkZHJlc3MuXG4gICAqIEBwYXJhbSByZXEgQSBUQ1BDb25uZWN0V3JhcCBpbnN0YW5jZS5cbiAgICogQHBhcmFtIGFkZHJlc3MgVGhlIGhvc3RuYW1lIHRvIGNvbm5lY3QgdG8uXG4gICAqIEBwYXJhbSBwb3J0IFRoZSBwb3J0IHRvIGNvbm5lY3QgdG8uXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICBjb25uZWN0KHJlcTogVENQQ29ubmVjdFdyYXAsIGFkZHJlc3M6IHN0cmluZywgcG9ydDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy4jY29ubmVjdChyZXEsIGFkZHJlc3MsIHBvcnQpO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbm5lY3QgdG8gYW4gSVB2NiBhZGRyZXNzLlxuICAgKiBAcGFyYW0gcmVxIEEgVENQQ29ubmVjdFdyYXAgaW5zdGFuY2UuXG4gICAqIEBwYXJhbSBhZGRyZXNzIFRoZSBob3N0bmFtZSB0byBjb25uZWN0IHRvLlxuICAgKiBAcGFyYW0gcG9ydCBUaGUgcG9ydCB0byBjb25uZWN0IHRvLlxuICAgKiBAcmV0dXJuIEFuIGVycm9yIHN0YXR1cyBjb2RlLlxuICAgKi9cbiAgY29ubmVjdDYocmVxOiBUQ1BDb25uZWN0V3JhcCwgYWRkcmVzczogc3RyaW5nLCBwb3J0OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiNjb25uZWN0KHJlcSwgYWRkcmVzcywgcG9ydCk7XG4gIH1cblxuICAvKipcbiAgICogTGlzdGVuIGZvciBuZXcgY29ubmVjdGlvbnMuXG4gICAqIEBwYXJhbSBiYWNrbG9nIFRoZSBtYXhpbXVtIGxlbmd0aCBvZiB0aGUgcXVldWUgb2YgcGVuZGluZyBjb25uZWN0aW9ucy5cbiAgICogQHJldHVybiBBbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICovXG4gIGxpc3RlbihiYWNrbG9nOiBudW1iZXIpOiBudW1iZXIge1xuICAgIHRoaXMuI2JhY2tsb2cgPSBjZWlsUG93T2YyKGJhY2tsb2cgKyAxKTtcblxuICAgIGNvbnN0IGxpc3Rlbk9wdGlvbnMgPSB7XG4gICAgICBob3N0bmFtZTogdGhpcy4jYWRkcmVzcyEsXG4gICAgICBwb3J0OiB0aGlzLiNwb3J0ISxcbiAgICAgIHRyYW5zcG9ydDogXCJ0Y3BcIiBhcyBjb25zdCxcbiAgICB9O1xuXG4gICAgbGV0IGxpc3RlbmVyO1xuXG4gICAgdHJ5IHtcbiAgICAgIGxpc3RlbmVyID0gRGVuby5saXN0ZW4obGlzdGVuT3B0aW9ucyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGUgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5BZGRySW5Vc2UpIHtcbiAgICAgICAgcmV0dXJuIGNvZGVNYXAuZ2V0KFwiRUFERFJJTlVTRVwiKSE7XG4gICAgICB9IGVsc2UgaWYgKGUgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5BZGRyTm90QXZhaWxhYmxlKSB7XG4gICAgICAgIHJldHVybiBjb2RlTWFwLmdldChcIkVBRERSTk9UQVZBSUxcIikhO1xuICAgICAgfVxuXG4gICAgICAvLyBUT0RPKGNtb3J0ZW4pOiBtYXAgZXJyb3JzIHRvIGFwcHJvcHJpYXRlIGVycm9yIGNvZGVzLlxuICAgICAgcmV0dXJuIGNvZGVNYXAuZ2V0KFwiVU5LTk9XTlwiKSE7XG4gICAgfVxuXG4gICAgY29uc3QgYWRkcmVzcyA9IGxpc3RlbmVyLmFkZHIgYXMgRGVuby5OZXRBZGRyO1xuICAgIHRoaXMuI2FkZHJlc3MgPSBhZGRyZXNzLmhvc3RuYW1lO1xuICAgIHRoaXMuI3BvcnQgPSBhZGRyZXNzLnBvcnQ7XG5cbiAgICB0aGlzLiNsaXN0ZW5lciA9IGxpc3RlbmVyO1xuICAgIHRoaXMuI2FjY2VwdCgpO1xuXG4gICAgcmV0dXJuIDA7XG4gIH1cblxuICBvdmVycmlkZSByZWYoKSB7XG4gICAgaWYgKHRoaXMuI2xpc3RlbmVyKSB7XG4gICAgICBEZW5vVW5zdGFibGUuTGlzdGVuZXJSZWYodGhpcy4jbGlzdGVuZXIpO1xuICAgIH1cbiAgfVxuXG4gIG92ZXJyaWRlIHVucmVmKCkge1xuICAgIGlmICh0aGlzLiNsaXN0ZW5lcikge1xuICAgICAgRGVub1Vuc3RhYmxlLkxpc3RlbmVyVW5yZWYodGhpcy4jbGlzdGVuZXIpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBQb3B1bGF0ZXMgdGhlIHByb3ZpZGVkIG9iamVjdCB3aXRoIGxvY2FsIGFkZHJlc3MgZW50cmllcy5cbiAgICogQHBhcmFtIHNvY2tuYW1lIEFuIG9iamVjdCB0byBhZGQgdGhlIGxvY2FsIGFkZHJlc3MgZW50cmllcyB0by5cbiAgICogQHJldHVybiBBbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICovXG4gIGdldHNvY2tuYW1lKHNvY2tuYW1lOiBSZWNvcmQ8c3RyaW5nLCBuZXZlcj4gfCBBZGRyZXNzSW5mbyk6IG51bWJlciB7XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHRoaXMuI2FkZHJlc3MgPT09IFwidW5kZWZpbmVkXCIgfHxcbiAgICAgIHR5cGVvZiB0aGlzLiNwb3J0ID09PSBcInVuZGVmaW5lZFwiXG4gICAgKSB7XG4gICAgICByZXR1cm4gY29kZU1hcC5nZXQoXCJFQUREUk5PVEFWQUlMXCIpITtcbiAgICB9XG5cbiAgICBzb2NrbmFtZS5hZGRyZXNzID0gdGhpcy4jYWRkcmVzcztcbiAgICBzb2NrbmFtZS5wb3J0ID0gdGhpcy4jcG9ydDtcbiAgICBzb2NrbmFtZS5mYW1pbHkgPSBpc0lQKHRoaXMuI2FkZHJlc3MpO1xuXG4gICAgcmV0dXJuIDA7XG4gIH1cblxuICAvKipcbiAgICogUG9wdWxhdGVzIHRoZSBwcm92aWRlZCBvYmplY3Qgd2l0aCByZW1vdGUgYWRkcmVzcyBlbnRyaWVzLlxuICAgKiBAcGFyYW0gcGVlcm5hbWUgQW4gb2JqZWN0IHRvIGFkZCB0aGUgcmVtb3RlIGFkZHJlc3MgZW50cmllcyB0by5cbiAgICogQHJldHVybiBBbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICovXG4gIGdldHBlZXJuYW1lKHBlZXJuYW1lOiBSZWNvcmQ8c3RyaW5nLCBuZXZlcj4gfCBBZGRyZXNzSW5mbyk6IG51bWJlciB7XG4gICAgaWYgKFxuICAgICAgdHlwZW9mIHRoaXMuI3JlbW90ZUFkZHJlc3MgPT09IFwidW5kZWZpbmVkXCIgfHxcbiAgICAgIHR5cGVvZiB0aGlzLiNyZW1vdGVQb3J0ID09PSBcInVuZGVmaW5lZFwiXG4gICAgKSB7XG4gICAgICByZXR1cm4gY29kZU1hcC5nZXQoXCJFQUREUk5PVEFWQUlMXCIpITtcbiAgICB9XG5cbiAgICBwZWVybmFtZS5hZGRyZXNzID0gdGhpcy4jcmVtb3RlQWRkcmVzcztcbiAgICBwZWVybmFtZS5wb3J0ID0gdGhpcy4jcmVtb3RlUG9ydDtcbiAgICBwZWVybmFtZS5mYW1pbHkgPSB0aGlzLiNyZW1vdGVGYW1pbHk7XG5cbiAgICByZXR1cm4gMDtcbiAgfVxuXG4gIC8qKlxuICAgKiBAcGFyYW0gbm9EZWxheVxuICAgKiBAcmV0dXJuIEFuIGVycm9yIHN0YXR1cyBjb2RlLlxuICAgKi9cbiAgc2V0Tm9EZWxheShfbm9EZWxheTogYm9vbGVhbik6IG51bWJlciB7XG4gICAgLy8gVE9ETyhibm9vcmRodWlzKSBodHRwczovL2dpdGh1Yi5jb20vZGVub2xhbmQvZGVuby9wdWxsLzEzMTAzXG4gICAgcmV0dXJuIDA7XG4gIH1cblxuICAvKipcbiAgICogQHBhcmFtIGVuYWJsZVxuICAgKiBAcGFyYW0gaW5pdGlhbERlbGF5XG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICBzZXRLZWVwQWxpdmUoX2VuYWJsZTogYm9vbGVhbiwgX2luaXRpYWxEZWxheTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAvLyBUT0RPKGJub29yZGh1aXMpIGh0dHBzOi8vZ2l0aHViLmNvbS9kZW5vbGFuZC9kZW5vL3B1bGwvMTMxMDNcbiAgICByZXR1cm4gMDtcbiAgfVxuXG4gIC8qKlxuICAgKiBXaW5kb3dzIG9ubHkuXG4gICAqXG4gICAqIERlcHJlY2F0ZWQgYnkgTm9kZS5cbiAgICogUkVGOiBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvYmxvYi9tYXN0ZXIvbGliL25ldC5qcyNMMTczMVxuICAgKlxuICAgKiBAcGFyYW0gZW5hYmxlXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqIEBkZXByZWNhdGVkXG4gICAqL1xuICBzZXRTaW11bHRhbmVvdXNBY2NlcHRzKF9lbmFibGU6IGJvb2xlYW4pIHtcbiAgICAvLyBMb3cgcHJpb3JpdHkgdG8gaW1wbGVtZW50IG93aW5nIHRvIGl0IGJlaW5nIGRlcHJlY2F0ZWQgaW4gTm9kZS5cbiAgICBub3RJbXBsZW1lbnRlZChcIlRDUC5wcm90b3R5cGUuc2V0U2ltdWx0YW5lb3VzQWNjZXB0c1wiKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBCaW5kIHRvIGFuIElQdjQgb3IgSVB2NiBhZGRyZXNzLlxuICAgKiBAcGFyYW0gYWRkcmVzcyBUaGUgaG9zdG5hbWUgdG8gYmluZCB0by5cbiAgICogQHBhcmFtIHBvcnQgVGhlIHBvcnQgdG8gYmluZCB0b1xuICAgKiBAcGFyYW0gX2ZsYWdzXG4gICAqIEByZXR1cm4gQW4gZXJyb3Igc3RhdHVzIGNvZGUuXG4gICAqL1xuICAjYmluZChhZGRyZXNzOiBzdHJpbmcsIHBvcnQ6IG51bWJlciwgX2ZsYWdzOiBudW1iZXIpOiBudW1iZXIge1xuICAgIC8vIERlbm8gZG9lc24ndCBjdXJyZW50bHkgc2VwYXJhdGUgYmluZCBmcm9tIGNvbm5lY3QgZXRjLlxuICAgIC8vIFJFRjpcbiAgICAvLyAtIGh0dHBzOi8vZG9jLmRlbm8ubGFuZC9kZW5vL3N0YWJsZS9+L0Rlbm8uY29ubmVjdFxuICAgIC8vIC0gaHR0cHM6Ly9kb2MuZGVuby5sYW5kL2Rlbm8vc3RhYmxlL34vRGVuby5saXN0ZW5cbiAgICAvL1xuICAgIC8vIFRoaXMgYWxzbyBtZWFucyB3ZSB3b24ndCBiZSBjb25uZWN0aW5nIGZyb20gdGhlIHNwZWNpZmllZCBsb2NhbCBhZGRyZXNzXG4gICAgLy8gYW5kIHBvcnQgYXMgcHJvdmlkaW5nIHRoZXNlIGlzIG5vdCBhbiBvcHRpb24gaW4gRGVuby5cbiAgICAvLyBSRUY6XG4gICAgLy8gLSBodHRwczovL2RvYy5kZW5vLmxhbmQvZGVuby9zdGFibGUvfi9EZW5vLkNvbm5lY3RPcHRpb25zXG4gICAgLy8gLSBodHRwczovL2RvYy5kZW5vLmxhbmQvZGVuby9zdGFibGUvfi9EZW5vLkxpc3Rlbk9wdGlvbnNcblxuICAgIHRoaXMuI2FkZHJlc3MgPSBhZGRyZXNzO1xuICAgIHRoaXMuI3BvcnQgPSBwb3J0O1xuXG4gICAgcmV0dXJuIDA7XG4gIH1cblxuICAvKipcbiAgICogQ29ubmVjdCB0byBhbiBJUHY0IG9yIElQdjYgYWRkcmVzcy5cbiAgICogQHBhcmFtIHJlcSBBIFRDUENvbm5lY3RXcmFwIGluc3RhbmNlLlxuICAgKiBAcGFyYW0gYWRkcmVzcyBUaGUgaG9zdG5hbWUgdG8gY29ubmVjdCB0by5cbiAgICogQHBhcmFtIHBvcnQgVGhlIHBvcnQgdG8gY29ubmVjdCB0by5cbiAgICogQHJldHVybiBBbiBlcnJvciBzdGF0dXMgY29kZS5cbiAgICovXG4gICNjb25uZWN0KHJlcTogVENQQ29ubmVjdFdyYXAsIGFkZHJlc3M6IHN0cmluZywgcG9ydDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICB0aGlzLiNyZW1vdGVBZGRyZXNzID0gYWRkcmVzcztcbiAgICB0aGlzLiNyZW1vdGVQb3J0ID0gcG9ydDtcbiAgICB0aGlzLiNyZW1vdGVGYW1pbHkgPSBpc0lQKGFkZHJlc3MpO1xuXG4gICAgY29uc3QgY29ubmVjdE9wdGlvbnM6IERlbm8uQ29ubmVjdE9wdGlvbnMgPSB7XG4gICAgICBob3N0bmFtZTogYWRkcmVzcyxcbiAgICAgIHBvcnQsXG4gICAgICB0cmFuc3BvcnQ6IFwidGNwXCIsXG4gICAgfTtcblxuICAgIERlbm8uY29ubmVjdChjb25uZWN0T3B0aW9ucykudGhlbihcbiAgICAgIChjb25uOiBEZW5vLkNvbm4pID0+IHtcbiAgICAgICAgLy8gSW5jb3JyZWN0IC8gYmFja3dhcmRzLCBidXQgY29ycmVjdGluZyB0aGUgbG9jYWwgYWRkcmVzcyBhbmQgcG9ydCB3aXRoXG4gICAgICAgIC8vIHdoYXQgd2FzIGFjdHVhbGx5IHVzZWQgZ2l2ZW4gd2UgY2FuJ3QgYWN0dWFsbHkgc3BlY2lmeSB0aGVzZSBpbiBEZW5vLlxuICAgICAgICBjb25zdCBsb2NhbEFkZHIgPSBjb25uLmxvY2FsQWRkciBhcyBEZW5vLk5ldEFkZHI7XG4gICAgICAgIHRoaXMuI2FkZHJlc3MgPSByZXEubG9jYWxBZGRyZXNzID0gbG9jYWxBZGRyLmhvc3RuYW1lO1xuICAgICAgICB0aGlzLiNwb3J0ID0gcmVxLmxvY2FsUG9ydCA9IGxvY2FsQWRkci5wb3J0O1xuICAgICAgICB0aGlzW2tTdHJlYW1CYXNlRmllbGRdID0gY29ubjtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgIHRoaXMuYWZ0ZXJDb25uZWN0KHJlcSwgMCk7XG4gICAgICAgIH0gY2F0Y2gge1xuICAgICAgICAgIC8vIHN3YWxsb3cgY2FsbGJhY2sgZXJyb3JzLlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIC8vIFRPRE8oY21vcnRlbik6IGNvcnJlY3QgbWFwcGluZyBvZiBjb25uZWN0aW9uIGVycm9yIHRvIHN0YXR1cyBjb2RlLlxuICAgICAgICAgIHRoaXMuYWZ0ZXJDb25uZWN0KHJlcSwgY29kZU1hcC5nZXQoXCJFQ09OTlJFRlVTRURcIikhKTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gc3dhbGxvdyBjYWxsYmFjayBlcnJvcnMuXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgKTtcblxuICAgIHJldHVybiAwO1xuICB9XG5cbiAgLyoqIEhhbmRsZSBiYWNrb2ZmIGRlbGF5cyBmb2xsb3dpbmcgYW4gdW5zdWNjZXNzZnVsIGFjY2VwdC4gKi9cbiAgYXN5bmMgI2FjY2VwdEJhY2tvZmYoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gQmFja29mZiBhZnRlciB0cmFuc2llbnQgZXJyb3JzIHRvIGFsbG93IHRpbWUgZm9yIHRoZSBzeXN0ZW0gdG9cbiAgICAvLyByZWNvdmVyLCBhbmQgYXZvaWQgYmxvY2tpbmcgdXAgdGhlIGV2ZW50IGxvb3Agd2l0aCBhIGNvbnRpbnVvdXNseVxuICAgIC8vIHJ1bm5pbmcgbG9vcC5cbiAgICBpZiAoIXRoaXMuI2FjY2VwdEJhY2tvZmZEZWxheSkge1xuICAgICAgdGhpcy4jYWNjZXB0QmFja29mZkRlbGF5ID0gSU5JVElBTF9BQ0NFUFRfQkFDS09GRl9ERUxBWTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy4jYWNjZXB0QmFja29mZkRlbGF5ICo9IDI7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuI2FjY2VwdEJhY2tvZmZEZWxheSA+PSBNQVhfQUNDRVBUX0JBQ0tPRkZfREVMQVkpIHtcbiAgICAgIHRoaXMuI2FjY2VwdEJhY2tvZmZEZWxheSA9IE1BWF9BQ0NFUFRfQkFDS09GRl9ERUxBWTtcbiAgICB9XG5cbiAgICBhd2FpdCBkZWxheSh0aGlzLiNhY2NlcHRCYWNrb2ZmRGVsYXkpO1xuXG4gICAgdGhpcy4jYWNjZXB0KCk7XG4gIH1cblxuICAvKiogQWNjZXB0IG5ldyBjb25uZWN0aW9ucy4gKi9cbiAgYXN5bmMgI2FjY2VwdCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy4jY2xvc2VkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuI2Nvbm5lY3Rpb25zID4gdGhpcy4jYmFja2xvZyEpIHtcbiAgICAgIHRoaXMuI2FjY2VwdEJhY2tvZmYoKTtcblxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBjb25uZWN0aW9uOiBEZW5vLkNvbm47XG5cbiAgICB0cnkge1xuICAgICAgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuI2xpc3RlbmVyLmFjY2VwdCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuQmFkUmVzb3VyY2UgJiYgdGhpcy4jY2xvc2VkKSB7XG4gICAgICAgIC8vIExpc3RlbmVyIGFuZCBzZXJ2ZXIgaGFzIGNsb3NlZC5cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBUT0RPKGNtb3J0ZW4pOiBtYXAgZXJyb3JzIHRvIGFwcHJvcHJpYXRlIGVycm9yIGNvZGVzLlxuICAgICAgICB0aGlzLm9uY29ubmVjdGlvbiEoY29kZU1hcC5nZXQoXCJVTktOT1dOXCIpISwgdW5kZWZpbmVkKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBzd2FsbG93IGNhbGxiYWNrIGVycm9ycy5cbiAgICAgIH1cblxuICAgICAgdGhpcy4jYWNjZXB0QmFja29mZigpO1xuXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUmVzZXQgdGhlIGJhY2tvZmYgZGVsYXkgdXBvbiBzdWNjZXNzZnVsIGFjY2VwdC5cbiAgICB0aGlzLiNhY2NlcHRCYWNrb2ZmRGVsYXkgPSB1bmRlZmluZWQ7XG5cbiAgICBjb25zdCBjb25uZWN0aW9uSGFuZGxlID0gbmV3IFRDUChzb2NrZXRUeXBlLlNPQ0tFVCwgY29ubmVjdGlvbik7XG4gICAgdGhpcy4jY29ubmVjdGlvbnMrKztcblxuICAgIHRyeSB7XG4gICAgICB0aGlzLm9uY29ubmVjdGlvbiEoMCwgY29ubmVjdGlvbkhhbmRsZSk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBzd2FsbG93IGNhbGxiYWNrIGVycm9ycy5cbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy4jYWNjZXB0KCk7XG4gIH1cblxuICAvKiogSGFuZGxlIHNlcnZlciBjbG9zdXJlLiAqL1xuICBvdmVycmlkZSBfb25DbG9zZSgpOiBudW1iZXIge1xuICAgIHRoaXMuI2Nsb3NlZCA9IHRydWU7XG4gICAgdGhpcy5yZWFkaW5nID0gZmFsc2U7XG5cbiAgICB0aGlzLiNhZGRyZXNzID0gdW5kZWZpbmVkO1xuICAgIHRoaXMuI3BvcnQgPSB1bmRlZmluZWQ7XG5cbiAgICB0aGlzLiNyZW1vdGVBZGRyZXNzID0gdW5kZWZpbmVkO1xuICAgIHRoaXMuI3JlbW90ZUZhbWlseSA9IHVuZGVmaW5lZDtcbiAgICB0aGlzLiNyZW1vdGVQb3J0ID0gdW5kZWZpbmVkO1xuXG4gICAgdGhpcy4jYmFja2xvZyA9IHVuZGVmaW5lZDtcbiAgICB0aGlzLiNjb25uZWN0aW9ucyA9IDA7XG4gICAgdGhpcy4jYWNjZXB0QmFja29mZkRlbGF5ID0gdW5kZWZpbmVkO1xuXG4gICAgaWYgKHRoaXMucHJvdmlkZXIgPT09IHByb3ZpZGVyVHlwZS5UQ1BTRVJWRVJXUkFQKSB7XG4gICAgICB0cnkge1xuICAgICAgICB0aGlzLiNsaXN0ZW5lci5jbG9zZSgpO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIC8vIGxpc3RlbmVyIGFscmVhZHkgY2xvc2VkXG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIExpYnV2U3RyZWFtV3JhcC5wcm90b3R5cGUuX29uQ2xvc2UuY2FsbCh0aGlzKTtcbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxzREFBc0Q7QUFDdEQsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSxnRUFBZ0U7QUFDaEUsc0VBQXNFO0FBQ3RFLHNFQUFzRTtBQUN0RSw0RUFBNEU7QUFDNUUscUVBQXFFO0FBQ3JFLHdCQUF3QjtBQUN4QixFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLHlEQUF5RDtBQUN6RCxFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLDZEQUE2RDtBQUM3RCw0RUFBNEU7QUFDNUUsMkVBQTJFO0FBQzNFLHdFQUF3RTtBQUN4RSw0RUFBNEU7QUFDNUUseUNBQXlDO0FBRXpDLHFCQUFxQjtBQUNyQiwrREFBK0Q7QUFDL0QsOERBQThEO0FBRTlELFNBQVMsY0FBYyxRQUFRLGNBQWMsQ0FBQztBQUM5QyxTQUFTLFdBQVcsUUFBUSwwQkFBMEIsQ0FBQztBQUN2RCxTQUFTLGNBQWMsUUFBUSxzQkFBc0IsQ0FBQztBQUN0RCxTQUFTLFNBQVMsRUFBRSxZQUFZLFFBQVEsaUJBQWlCLENBQUM7QUFDMUQsU0FBUyxlQUFlLFFBQVEsa0JBQWtCLENBQUM7QUFDbkQsU0FBUyxXQUFXLFFBQVEsY0FBYyxDQUFDO0FBQzNDLFNBQVMsT0FBTyxRQUFRLFNBQVMsQ0FBQztBQUNsQyxTQUFTLEtBQUssUUFBUSxvQkFBb0IsQ0FBQztBQUMzQyxTQUFTLGdCQUFnQixRQUFRLGtCQUFrQixDQUFDO0FBQ3BELFNBQVMsSUFBSSxRQUFRLG9CQUFvQixDQUFDO0FBQzFDLFNBQ0UsVUFBVSxFQUNWLDRCQUE0QixFQUM1Qix3QkFBd0IsUUFDbkIsY0FBYyxDQUFDO0FBQ3RCLFlB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