import { Cookies } from "./cookies.ts";
import { createHttpError } from "./httpError.ts";
import { Request } from "./request.ts";
import { Response } from "./response.ts";
import { send } from "./send.ts";
import { SSEStreamTarget } from "./server_sent_event.ts";
/** Provides context about the current request and response to middleware
 * functions. */ export class Context {
    #socket;
    #sse;
    /** A reference to the current application. */ app;
    /** An object which allows access to cookies, mediating both the request and
   * response. */ cookies;
    /** Is `true` if the current connection is upgradeable to a web socket.
   * Otherwise the value is `false`.  Use `.upgrade()` to upgrade the connection
   * and return the web socket. */ get isUpgradable() {
        const upgrade = this.request.headers.get("upgrade");
        if (!upgrade || upgrade.toLowerCase() !== "websocket") {
            return false;
        }
        const secKey = this.request.headers.get("sec-websocket-key");
        return typeof secKey === "string" && secKey != "";
    }
    /** Determines if the request should be responded to.  If `false` when the
   * middleware completes processing, the response will not be sent back to the
   * requestor.  Typically this is used if the middleware will take over low
   * level processing of requests and responses, for example if using web
   * sockets.  This automatically gets set to `false` when the context is
   * upgraded to a web socket via the `.upgrade()` method.
   *
   * The default is `true`. */ respond;
    /** An object which contains information about the current request. */ request;
    /** An object which contains information about the response that will be sent
   * when the middleware finishes processing. */ response;
    /** If the the current context has been upgraded, then this will be set to
   * with the current web socket, otherwise it is `undefined`. */ get socket() {
        return this.#socket;
    }
    /** The object to pass state to front-end views.  This can be typed by
   * supplying the generic state argument when creating a new app.  For
   * example:
   *
   * ```ts
   * const app = new Application<{ foo: string }>();
   * ```
   *
   * Or can be contextually inferred based on setting an initial state object:
   *
   * ```ts
   * const app = new Application({ state: { foo: "bar" } });
   * ```
   *
   * On each request/response cycle, the context's state is cloned from the
   * application state. This means changes to the context's `.state` will be
   * dropped when the request drops, but "defaults" can be applied to the
   * application's state.  Changes to the application's state though won't be
   * reflected until the next request in the context's state.
   */ state;
    constructor(app, serverRequest, state, secure = false){
        this.app = app;
        this.state = state;
        this.request = new Request(serverRequest, app.proxy, secure);
        this.respond = true;
        this.response = new Response(this.request);
        this.cookies = new Cookies(this.request, this.response, {
            keys: this.app.keys,
            secure: this.request.secure
        });
    }
    /** Asserts the condition and if the condition fails, creates an HTTP error
   * with the provided status (which defaults to `500`).  The error status by
   * default will be set on the `.response.status`.
   */ assert(// deno-lint-ignore no-explicit-any
    condition, errorStatus = 500, message, props) {
        if (condition) {
            return;
        }
        const err = createHttpError(errorStatus, message);
        if (props) {
            Object.assign(err, props);
        }
        throw err;
    }
    /** Asynchronously fulfill a response with a file from the local file
   * system.
   *
   * If the `options.path` is not supplied, the file to be sent will default
   * to this `.request.url.pathname`.
   *
   * Requires Deno read permission. */ send(options) {
        const { path =this.request.url.pathname , ...sendOptions } = options;
        return send(this, path, sendOptions);
    }
    /** Convert the connection to stream events, returning an event target for
   * sending server sent events.  Events dispatched on the returned target will
   * be sent to the client and be available in the client's `EventSource` that
   * initiated the connection.
   *
   * This will set `.respond` to `false`. */ sendEvents(options) {
        if (!this.#sse) {
            this.#sse = new SSEStreamTarget(this, options);
        }
        return this.#sse;
    }
    /** Create and throw an HTTP Error, which can be used to pass status
   * information which can be caught by other middleware to send more
   * meaningful error messages back to the client.  The passed error status will
   * be set on the `.response.status` by default as well.
   */ throw(errorStatus, message, props) {
        const err = createHttpError(errorStatus, message);
        if (props) {
            Object.assign(err, props);
        }
        throw err;
    }
    /** Take the current request and upgrade it to a web socket, resolving with
   * the a web standard `WebSocket` object. This will set `.respond` to
   * `false`.  If the socket cannot be upgraded, this method will throw. */ upgrade(options) {
        if (this.#socket) {
            return this.#socket;
        }
        this.#socket = this.request.originalRequest.upgrade(options);
        this.respond = false;
        return this.#socket;
    }
    [Symbol.for("Deno.customInspect")](inspect) {
        const { app , cookies , isUpgradable , respond , request , response , socket , state ,  } = this;
        return `${this.constructor.name} ${inspect({
            app,
            cookies,
            isUpgradable,
            respond,
            request,
            response,
            socket,
            state
        })}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMC4xLjAvY29udGV4dC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIxIHRoZSBvYWsgYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbmltcG9ydCB0eXBlIHsgQXBwbGljYXRpb24sIFN0YXRlIH0gZnJvbSBcIi4vYXBwbGljYXRpb24udHNcIjtcbmltcG9ydCB7IENvb2tpZXMgfSBmcm9tIFwiLi9jb29raWVzLnRzXCI7XG5pbXBvcnQgeyBOYXRpdmVSZXF1ZXN0IH0gZnJvbSBcIi4vaHR0cF9zZXJ2ZXJfbmF0aXZlLnRzXCI7XG5pbXBvcnQgeyBjcmVhdGVIdHRwRXJyb3IgfSBmcm9tIFwiLi9odHRwRXJyb3IudHNcIjtcbmltcG9ydCB0eXBlIHsgS2V5U3RhY2sgfSBmcm9tIFwiLi9rZXlTdGFjay50c1wiO1xuaW1wb3J0IHsgUmVxdWVzdCB9IGZyb20gXCIuL3JlcXVlc3QudHNcIjtcbmltcG9ydCB7IFJlc3BvbnNlIH0gZnJvbSBcIi4vcmVzcG9uc2UudHNcIjtcbmltcG9ydCB7IHNlbmQsIFNlbmRPcHRpb25zIH0gZnJvbSBcIi4vc2VuZC50c1wiO1xuaW1wb3J0IHtcbiAgU2VydmVyU2VudEV2ZW50VGFyZ2V0T3B0aW9ucyxcbiAgU1NFU3RyZWFtVGFyZ2V0LFxufSBmcm9tIFwiLi9zZXJ2ZXJfc2VudF9ldmVudC50c1wiO1xuaW1wb3J0IHR5cGUgeyBTZXJ2ZXJTZW50RXZlbnRUYXJnZXQgfSBmcm9tIFwiLi9zZXJ2ZXJfc2VudF9ldmVudC50c1wiO1xuaW1wb3J0IHR5cGUgeyBFcnJvclN0YXR1cywgVXBncmFkZVdlYlNvY2tldE9wdGlvbnMgfSBmcm9tIFwiLi90eXBlcy5kLnRzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29udGV4dFNlbmRPcHRpb25zIGV4dGVuZHMgU2VuZE9wdGlvbnMge1xuICAvKiogVGhlIGZpbGVuYW1lIHRvIHNlbmQsIHdoaWNoIHdpbGwgYmUgcmVzb2x2ZWQgYmFzZWQgb24gdGhlIG90aGVyIG9wdGlvbnMuXG4gICAqIElmIHRoaXMgcHJvcGVydHkgaXMgb21pdHRlZCwgdGhlIGN1cnJlbnQgY29udGV4dCdzIGAucmVxdWVzdC51cmwucGF0aG5hbWVgXG4gICAqIHdpbGwgYmUgdXNlZC4gKi9cbiAgcGF0aD86IHN0cmluZztcbn1cblxuLyoqIFByb3ZpZGVzIGNvbnRleHQgYWJvdXQgdGhlIGN1cnJlbnQgcmVxdWVzdCBhbmQgcmVzcG9uc2UgdG8gbWlkZGxld2FyZVxuICogZnVuY3Rpb25zLiAqL1xuZXhwb3J0IGNsYXNzIENvbnRleHQ8XG4gIFMgZXh0ZW5kcyBBUyA9IFN0YXRlLFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBBUyBleHRlbmRzIFN0YXRlID0gUmVjb3JkPHN0cmluZywgYW55Pixcbj4ge1xuICAjc29ja2V0PzogV2ViU29ja2V0O1xuICAjc3NlPzogU2VydmVyU2VudEV2ZW50VGFyZ2V0O1xuXG4gIC8qKiBBIHJlZmVyZW5jZSB0byB0aGUgY3VycmVudCBhcHBsaWNhdGlvbi4gKi9cbiAgYXBwOiBBcHBsaWNhdGlvbjxBUz47XG5cbiAgLyoqIEFuIG9iamVjdCB3aGljaCBhbGxvd3MgYWNjZXNzIHRvIGNvb2tpZXMsIG1lZGlhdGluZyBib3RoIHRoZSByZXF1ZXN0IGFuZFxuICAgKiByZXNwb25zZS4gKi9cbiAgY29va2llczogQ29va2llcztcblxuICAvKiogSXMgYHRydWVgIGlmIHRoZSBjdXJyZW50IGNvbm5lY3Rpb24gaXMgdXBncmFkZWFibGUgdG8gYSB3ZWIgc29ja2V0LlxuICAgKiBPdGhlcndpc2UgdGhlIHZhbHVlIGlzIGBmYWxzZWAuICBVc2UgYC51cGdyYWRlKClgIHRvIHVwZ3JhZGUgdGhlIGNvbm5lY3Rpb25cbiAgICogYW5kIHJldHVybiB0aGUgd2ViIHNvY2tldC4gKi9cbiAgZ2V0IGlzVXBncmFkYWJsZSgpOiBib29sZWFuIHtcbiAgICBjb25zdCB1cGdyYWRlID0gdGhpcy5yZXF1ZXN0LmhlYWRlcnMuZ2V0KFwidXBncmFkZVwiKTtcbiAgICBpZiAoIXVwZ3JhZGUgfHwgdXBncmFkZS50b0xvd2VyQ2FzZSgpICE9PSBcIndlYnNvY2tldFwiKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IHNlY0tleSA9IHRoaXMucmVxdWVzdC5oZWFkZXJzLmdldChcInNlYy13ZWJzb2NrZXQta2V5XCIpO1xuICAgIHJldHVybiB0eXBlb2Ygc2VjS2V5ID09PSBcInN0cmluZ1wiICYmIHNlY0tleSAhPSBcIlwiO1xuICB9XG5cbiAgLyoqIERldGVybWluZXMgaWYgdGhlIHJlcXVlc3Qgc2hvdWxkIGJlIHJlc3BvbmRlZCB0by4gIElmIGBmYWxzZWAgd2hlbiB0aGVcbiAgICogbWlkZGxld2FyZSBjb21wbGV0ZXMgcHJvY2Vzc2luZywgdGhlIHJlc3BvbnNlIHdpbGwgbm90IGJlIHNlbnQgYmFjayB0byB0aGVcbiAgICogcmVxdWVzdG9yLiAgVHlwaWNhbGx5IHRoaXMgaXMgdXNlZCBpZiB0aGUgbWlkZGxld2FyZSB3aWxsIHRha2Ugb3ZlciBsb3dcbiAgICogbGV2ZWwgcHJvY2Vzc2luZyBvZiByZXF1ZXN0cyBhbmQgcmVzcG9uc2VzLCBmb3IgZXhhbXBsZSBpZiB1c2luZyB3ZWJcbiAgICogc29ja2V0cy4gIFRoaXMgYXV0b21hdGljYWxseSBnZXRzIHNldCB0byBgZmFsc2VgIHdoZW4gdGhlIGNvbnRleHQgaXNcbiAgICogdXBncmFkZWQgdG8gYSB3ZWIgc29ja2V0IHZpYSB0aGUgYC51cGdyYWRlKClgIG1ldGhvZC5cbiAgICpcbiAgICogVGhlIGRlZmF1bHQgaXMgYHRydWVgLiAqL1xuICByZXNwb25kOiBib29sZWFuO1xuXG4gIC8qKiBBbiBvYmplY3Qgd2hpY2ggY29udGFpbnMgaW5mb3JtYXRpb24gYWJvdXQgdGhlIGN1cnJlbnQgcmVxdWVzdC4gKi9cbiAgcmVxdWVzdDogUmVxdWVzdDtcblxuICAvKiogQW4gb2JqZWN0IHdoaWNoIGNvbnRhaW5zIGluZm9ybWF0aW9uIGFib3V0IHRoZSByZXNwb25zZSB0aGF0IHdpbGwgYmUgc2VudFxuICAgKiB3aGVuIHRoZSBtaWRkbGV3YXJlIGZpbmlzaGVzIHByb2Nlc3NpbmcuICovXG4gIHJlc3BvbnNlOiBSZXNwb25zZTtcblxuICAvKiogSWYgdGhlIHRoZSBjdXJyZW50IGNvbnRleHQgaGFzIGJlZW4gdXBncmFkZWQsIHRoZW4gdGhpcyB3aWxsIGJlIHNldCB0b1xuICAgKiB3aXRoIHRoZSBjdXJyZW50IHdlYiBzb2NrZXQsIG90aGVyd2lzZSBpdCBpcyBgdW5kZWZpbmVkYC4gKi9cbiAgZ2V0IHNvY2tldCgpOiBXZWJTb2NrZXQgfCB1bmRlZmluZWQge1xuICAgIHJldHVybiB0aGlzLiNzb2NrZXQ7XG4gIH1cblxuICAvKiogVGhlIG9iamVjdCB0byBwYXNzIHN0YXRlIHRvIGZyb250LWVuZCB2aWV3cy4gIFRoaXMgY2FuIGJlIHR5cGVkIGJ5XG4gICAqIHN1cHBseWluZyB0aGUgZ2VuZXJpYyBzdGF0ZSBhcmd1bWVudCB3aGVuIGNyZWF0aW5nIGEgbmV3IGFwcC4gIEZvclxuICAgKiBleGFtcGxlOlxuICAgKlxuICAgKiBgYGB0c1xuICAgKiBjb25zdCBhcHAgPSBuZXcgQXBwbGljYXRpb248eyBmb286IHN0cmluZyB9PigpO1xuICAgKiBgYGBcbiAgICpcbiAgICogT3IgY2FuIGJlIGNvbnRleHR1YWxseSBpbmZlcnJlZCBiYXNlZCBvbiBzZXR0aW5nIGFuIGluaXRpYWwgc3RhdGUgb2JqZWN0OlxuICAgKlxuICAgKiBgYGB0c1xuICAgKiBjb25zdCBhcHAgPSBuZXcgQXBwbGljYXRpb24oeyBzdGF0ZTogeyBmb286IFwiYmFyXCIgfSB9KTtcbiAgICogYGBgXG4gICAqXG4gICAqIE9uIGVhY2ggcmVxdWVzdC9yZXNwb25zZSBjeWNsZSwgdGhlIGNvbnRleHQncyBzdGF0ZSBpcyBjbG9uZWQgZnJvbSB0aGVcbiAgICogYXBwbGljYXRpb24gc3RhdGUuIFRoaXMgbWVhbnMgY2hhbmdlcyB0byB0aGUgY29udGV4dCdzIGAuc3RhdGVgIHdpbGwgYmVcbiAgICogZHJvcHBlZCB3aGVuIHRoZSByZXF1ZXN0IGRyb3BzLCBidXQgXCJkZWZhdWx0c1wiIGNhbiBiZSBhcHBsaWVkIHRvIHRoZVxuICAgKiBhcHBsaWNhdGlvbidzIHN0YXRlLiAgQ2hhbmdlcyB0byB0aGUgYXBwbGljYXRpb24ncyBzdGF0ZSB0aG91Z2ggd29uJ3QgYmVcbiAgICogcmVmbGVjdGVkIHVudGlsIHRoZSBuZXh0IHJlcXVlc3QgaW4gdGhlIGNvbnRleHQncyBzdGF0ZS5cbiAgICovXG4gIHN0YXRlOiBTO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIGFwcDogQXBwbGljYXRpb248QVM+LFxuICAgIHNlcnZlclJlcXVlc3Q6IE5hdGl2ZVJlcXVlc3QsXG4gICAgc3RhdGU6IFMsXG4gICAgc2VjdXJlID0gZmFsc2UsXG4gICkge1xuICAgIHRoaXMuYXBwID0gYXBwO1xuICAgIHRoaXMuc3RhdGUgPSBzdGF0ZTtcbiAgICB0aGlzLnJlcXVlc3QgPSBuZXcgUmVxdWVzdChzZXJ2ZXJSZXF1ZXN0LCBhcHAucHJveHksIHNlY3VyZSk7XG4gICAgdGhpcy5yZXNwb25kID0gdHJ1ZTtcbiAgICB0aGlzLnJlc3BvbnNlID0gbmV3IFJlc3BvbnNlKHRoaXMucmVxdWVzdCk7XG4gICAgdGhpcy5jb29raWVzID0gbmV3IENvb2tpZXModGhpcy5yZXF1ZXN0LCB0aGlzLnJlc3BvbnNlLCB7XG4gICAgICBrZXlzOiB0aGlzLmFwcC5rZXlzIGFzIEtleVN0YWNrIHwgdW5kZWZpbmVkLFxuICAgICAgc2VjdXJlOiB0aGlzLnJlcXVlc3Quc2VjdXJlLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqIEFzc2VydHMgdGhlIGNvbmRpdGlvbiBhbmQgaWYgdGhlIGNvbmRpdGlvbiBmYWlscywgY3JlYXRlcyBhbiBIVFRQIGVycm9yXG4gICAqIHdpdGggdGhlIHByb3ZpZGVkIHN0YXR1cyAod2hpY2ggZGVmYXVsdHMgdG8gYDUwMGApLiAgVGhlIGVycm9yIHN0YXR1cyBieVxuICAgKiBkZWZhdWx0IHdpbGwgYmUgc2V0IG9uIHRoZSBgLnJlc3BvbnNlLnN0YXR1c2AuXG4gICAqL1xuICBhc3NlcnQoXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICBjb25kaXRpb246IGFueSxcbiAgICBlcnJvclN0YXR1czogRXJyb3JTdGF0dXMgPSA1MDAsXG4gICAgbWVzc2FnZT86IHN0cmluZyxcbiAgICBwcm9wcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuICApOiBhc3NlcnRzIGNvbmRpdGlvbiB7XG4gICAgaWYgKGNvbmRpdGlvbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBlcnIgPSBjcmVhdGVIdHRwRXJyb3IoZXJyb3JTdGF0dXMsIG1lc3NhZ2UpO1xuICAgIGlmIChwcm9wcykge1xuICAgICAgT2JqZWN0LmFzc2lnbihlcnIsIHByb3BzKTtcbiAgICB9XG4gICAgdGhyb3cgZXJyO1xuICB9XG5cbiAgLyoqIEFzeW5jaHJvbm91c2x5IGZ1bGZpbGwgYSByZXNwb25zZSB3aXRoIGEgZmlsZSBmcm9tIHRoZSBsb2NhbCBmaWxlXG4gICAqIHN5c3RlbS5cbiAgICpcbiAgICogSWYgdGhlIGBvcHRpb25zLnBhdGhgIGlzIG5vdCBzdXBwbGllZCwgdGhlIGZpbGUgdG8gYmUgc2VudCB3aWxsIGRlZmF1bHRcbiAgICogdG8gdGhpcyBgLnJlcXVlc3QudXJsLnBhdGhuYW1lYC5cbiAgICpcbiAgICogUmVxdWlyZXMgRGVubyByZWFkIHBlcm1pc3Npb24uICovXG4gIHNlbmQob3B0aW9uczogQ29udGV4dFNlbmRPcHRpb25zKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcbiAgICBjb25zdCB7IHBhdGggPSB0aGlzLnJlcXVlc3QudXJsLnBhdGhuYW1lLCAuLi5zZW5kT3B0aW9ucyB9ID0gb3B0aW9ucztcbiAgICByZXR1cm4gc2VuZCh0aGlzLCBwYXRoLCBzZW5kT3B0aW9ucyk7XG4gIH1cblxuICAvKiogQ29udmVydCB0aGUgY29ubmVjdGlvbiB0byBzdHJlYW0gZXZlbnRzLCByZXR1cm5pbmcgYW4gZXZlbnQgdGFyZ2V0IGZvclxuICAgKiBzZW5kaW5nIHNlcnZlciBzZW50IGV2ZW50cy4gIEV2ZW50cyBkaXNwYXRjaGVkIG9uIHRoZSByZXR1cm5lZCB0YXJnZXQgd2lsbFxuICAgKiBiZSBzZW50IHRvIHRoZSBjbGllbnQgYW5kIGJlIGF2YWlsYWJsZSBpbiB0aGUgY2xpZW50J3MgYEV2ZW50U291cmNlYCB0aGF0XG4gICAqIGluaXRpYXRlZCB0aGUgY29ubmVjdGlvbi5cbiAgICpcbiAgICogVGhpcyB3aWxsIHNldCBgLnJlc3BvbmRgIHRvIGBmYWxzZWAuICovXG4gIHNlbmRFdmVudHMob3B0aW9ucz86IFNlcnZlclNlbnRFdmVudFRhcmdldE9wdGlvbnMpOiBTZXJ2ZXJTZW50RXZlbnRUYXJnZXQge1xuICAgIGlmICghdGhpcy4jc3NlKSB7XG4gICAgICB0aGlzLiNzc2UgPSBuZXcgU1NFU3RyZWFtVGFyZ2V0KHRoaXMsIG9wdGlvbnMpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy4jc3NlO1xuICB9XG5cbiAgLyoqIENyZWF0ZSBhbmQgdGhyb3cgYW4gSFRUUCBFcnJvciwgd2hpY2ggY2FuIGJlIHVzZWQgdG8gcGFzcyBzdGF0dXNcbiAgICogaW5mb3JtYXRpb24gd2hpY2ggY2FuIGJlIGNhdWdodCBieSBvdGhlciBtaWRkbGV3YXJlIHRvIHNlbmQgbW9yZVxuICAgKiBtZWFuaW5nZnVsIGVycm9yIG1lc3NhZ2VzIGJhY2sgdG8gdGhlIGNsaWVudC4gIFRoZSBwYXNzZWQgZXJyb3Igc3RhdHVzIHdpbGxcbiAgICogYmUgc2V0IG9uIHRoZSBgLnJlc3BvbnNlLnN0YXR1c2AgYnkgZGVmYXVsdCBhcyB3ZWxsLlxuICAgKi9cbiAgdGhyb3coXG4gICAgZXJyb3JTdGF0dXM6IEVycm9yU3RhdHVzLFxuICAgIG1lc3NhZ2U/OiBzdHJpbmcsXG4gICAgcHJvcHM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcbiAgKTogbmV2ZXIge1xuICAgIGNvbnN0IGVyciA9IGNyZWF0ZUh0dHBFcnJvcihlcnJvclN0YXR1cywgbWVzc2FnZSk7XG4gICAgaWYgKHByb3BzKSB7XG4gICAgICBPYmplY3QuYXNzaWduKGVyciwgcHJvcHMpO1xuICAgIH1cbiAgICB0aHJvdyBlcnI7XG4gIH1cblxuICAvKiogVGFrZSB0aGUgY3VycmVudCByZXF1ZXN0IGFuZCB1cGdyYWRlIGl0IHRvIGEgd2ViIHNvY2tldCwgcmVzb2x2aW5nIHdpdGhcbiAgICogdGhlIGEgd2ViIHN0YW5kYXJkIGBXZWJTb2NrZXRgIG9iamVjdC4gVGhpcyB3aWxsIHNldCBgLnJlc3BvbmRgIHRvXG4gICAqIGBmYWxzZWAuICBJZiB0aGUgc29ja2V0IGNhbm5vdCBiZSB1cGdyYWRlZCwgdGhpcyBtZXRob2Qgd2lsbCB0aHJvdy4gKi9cbiAgdXBncmFkZShvcHRpb25zPzogVXBncmFkZVdlYlNvY2tldE9wdGlvbnMpOiBXZWJTb2NrZXQge1xuICAgIGlmICh0aGlzLiNzb2NrZXQpIHtcbiAgICAgIHJldHVybiB0aGlzLiNzb2NrZXQ7XG4gICAgfVxuICAgIHRoaXMuI3NvY2tldCA9IHRoaXMucmVxdWVzdC5vcmlnaW5hbFJlcXVlc3QudXBncmFkZShvcHRpb25zKTtcbiAgICB0aGlzLnJlc3BvbmQgPSBmYWxzZTtcbiAgICByZXR1cm4gdGhpcy4jc29ja2V0O1xuICB9XG5cbiAgW1N5bWJvbC5mb3IoXCJEZW5vLmN1c3RvbUluc3BlY3RcIildKGluc3BlY3Q6ICh2YWx1ZTogdW5rbm93bikgPT4gc3RyaW5nKSB7XG4gICAgY29uc3Qge1xuICAgICAgYXBwLFxuICAgICAgY29va2llcyxcbiAgICAgIGlzVXBncmFkYWJsZSxcbiAgICAgIHJlc3BvbmQsXG4gICAgICByZXF1ZXN0LFxuICAgICAgcmVzcG9uc2UsXG4gICAgICBzb2NrZXQsXG4gICAgICBzdGF0ZSxcbiAgICB9ID0gdGhpcztcbiAgICByZXR1cm4gYCR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfSAke1xuICAgICAgaW5zcGVjdCh7XG4gICAgICAgIGFwcCxcbiAgICAgICAgY29va2llcyxcbiAgICAgICAgaXNVcGdyYWRhYmxlLFxuICAgICAgICByZXNwb25kLFxuICAgICAgICByZXF1ZXN0LFxuICAgICAgICByZXNwb25zZSxcbiAgICAgICAgc29ja2V0LFxuICAgICAgICBzdGF0ZSxcbiAgICAgIH0pXG4gICAgfWA7XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFHQSxNQUFNLEdBQUcsT0FBTyxRQUFRLENBQWM7QUFFdEMsTUFBTSxHQUFHLGVBQWUsUUFBUSxDQUFnQjtBQUVoRCxNQUFNLEdBQUcsT0FBTyxRQUFRLENBQWM7QUFDdEMsTUFBTSxHQUFHLFFBQVEsUUFBUSxDQUFlO0FBQ3hDLE1BQU0sR0FBRyxJQUFJLFFBQXFCLENBQVc7QUFDN0MsTUFBTSxHQUVKLGVBQWUsUUFDVixDQUF3QjtBQVcvQixFQUNnQixBQURoQjtjQUNnQixBQURoQixFQUNnQixDQUNoQixNQUFNLE9BQU8sT0FBTztJQUtsQixDQUFDLE1BQU07SUFDUCxDQUFDLEdBQUc7SUFFSixFQUE4QyxBQUE5QywwQ0FBOEMsQUFBOUMsRUFBOEMsQ0FDOUMsR0FBRztJQUVILEVBQ2UsQUFEZjtlQUNlLEFBRGYsRUFDZSxDQUNmLE9BQU87SUFFUCxFQUVnQyxBQUZoQzs7Z0NBRWdDLEFBRmhDLEVBRWdDLEtBQzVCLFlBQVksR0FBWSxDQUFDO1FBQzNCLEtBQUssQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQVM7UUFDbEQsRUFBRSxHQUFHLE9BQU8sSUFBSSxPQUFPLENBQUMsV0FBVyxPQUFPLENBQVcsWUFBRSxDQUFDO1lBQ3RELE1BQU0sQ0FBQyxLQUFLO1FBQ2QsQ0FBQztRQUNELEtBQUssQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQW1CO1FBQzNE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