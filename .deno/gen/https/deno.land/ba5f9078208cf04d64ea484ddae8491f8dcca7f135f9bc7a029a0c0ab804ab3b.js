// Copyright 2018-2021 the oak authors. All rights reserved. MIT license.
import { Context } from "./context.ts";
import { STATUS_TEXT } from "./deps.ts";
import { HttpServerNative, NativeRequest } from "./http_server_native.ts";
import { KeyStack } from "./keyStack.ts";
import { compose } from "./middleware.ts";
import { cloneState } from "./structured_clone.ts";
import { assert, isConn } from "./util.ts";
const ADDR_REGEXP = /^\[?([^\]]*)\]?:([0-9]{1,5})$/;
export class ApplicationErrorEvent extends ErrorEvent {
    context;
    constructor(eventInitDict){
        super("error", eventInitDict);
        this.context = eventInitDict.context;
    }
}
function logErrorListener({ error , context  }) {
    if (error instanceof Error) {
        console.error(`[uncaught application error]: ${error.name} - ${error.message}`);
    } else {
        console.error(`[uncaught application error]\n`, error);
    }
    if (context) {
        let url;
        try {
            url = context.request.url.toString();
        } catch  {
            url = "[malformed url]";
        }
        console.error(`\nrequest:`, {
            url,
            method: context.request.method,
            hasBody: context.request.hasBody
        });
        console.error(`response:`, {
            status: context.response.status,
            type: context.response.type,
            hasBody: !!context.response.body,
            writable: context.response.writable
        });
    }
    if (error instanceof Error && error.stack) {
        console.error(`\n${error.stack.split("\n").slice(1).join("\n")}`);
    }
}
export class ApplicationListenEvent extends Event {
    hostname;
    listener;
    port;
    secure;
    serverType;
    constructor(eventInitDict){
        super("listen", eventInitDict);
        this.hostname = eventInitDict.hostname;
        this.listener = eventInitDict.listener;
        this.port = eventInitDict.port;
        this.secure = eventInitDict.secure;
        this.serverType = eventInitDict.serverType;
    }
}
/** A class which registers middleware (via `.use()`) and then processes
 * inbound requests against that middleware (via `.listen()`).
 *
 * The `context.state` can be typed via passing a generic argument when
 * constructing an instance of `Application`.
 */ // deno-lint-ignore no-explicit-any
export class Application extends EventTarget {
    #composedMiddleware;
    #contextState;
    #keys;
    #middleware = [];
    #serverConstructor;
    /** A set of keys, or an instance of `KeyStack` which will be used to sign
   * cookies read and set by the application to avoid tampering with the
   * cookies. */ get keys() {
        return this.#keys;
    }
    set keys(keys) {
        if (!keys) {
            this.#keys = undefined;
            return;
        } else if (Array.isArray(keys)) {
            this.#keys = new KeyStack(keys);
        } else {
            this.#keys = keys;
        }
    }
    /** If `true`, proxy headers will be trusted when processing requests.  This
   * defaults to `false`. */ proxy;
    /** Generic state of the application, which can be specified by passing the
   * generic argument when constructing:
   *
   *       const app = new Application<{ foo: string }>();
   *
   * Or can be contextually inferred based on setting an initial state object:
   *
   *       const app = new Application({ state: { foo: "bar" } });
   *
   * When a new context is created, the application's state is cloned and the
   * state is unique to that request/response.  Changes can be made to the
   * application state that will be shared with all contexts.
   */ state;
    constructor(options = {
    }){
        super();
        const { state , keys , proxy , serverConstructor =HttpServerNative , contextState ="clone" , logErrors =true ,  } = options;
        this.proxy = proxy ?? false;
        this.keys = keys;
        this.state = state ?? {
        };
        this.#serverConstructor = serverConstructor;
        this.#contextState = contextState;
        if (logErrors) {
            this.addEventListener("error", logErrorListener);
        }
    }
     #getComposed() {
        if (!this.#composedMiddleware) {
            this.#composedMiddleware = compose(this.#middleware);
        }
        return this.#composedMiddleware;
    }
     #getContextState() {
        switch(this.#contextState){
            case "alias":
                return this.state;
            case "clone":
                return cloneState(this.state);
            case "empty":
                return {
                };
            case "prototype":
                return Object.create(this.state);
        }
    }
    /** Deal with uncaught errors in either the middleware or sending the
   * response. */ // deno-lint-ignore no-explicit-any
     #handleError(context, error) {
        if (!(error instanceof Error)) {
            error = new Error(`non-error thrown: ${JSON.stringify(error)}`);
        }
        const { message  } = error;
        this.dispatchEvent(new ApplicationErrorEvent({
            context,
            message,
            error
        }));
        if (!context.response.writable) {
            return;
        }
        for (const key of [
            ...context.response.headers.keys()
        ]){
            context.response.headers.delete(key);
        }
        if (error.headers && error.headers instanceof Headers) {
            for (const [key, value] of error.headers){
                context.response.headers.set(key, value);
            }
        }
        context.response.type = "text";
        const status = context.response.status = Deno.errors && error instanceof Deno.errors.NotFound ? 404 : error.status && typeof error.status === "number" ? error.status : 500;
        context.response.body = error.expose ? error.message : STATUS_TEXT.get(status);
    }
    /** Processing registered middleware on each request. */ async #handleRequest(request, secure, state) {
        const context = new Context(this, request, this.#getContextState(), secure);
        let resolve;
        const handlingPromise = new Promise((res)=>resolve = res
        );
        state.handling.add(handlingPromise);
        if (!state.closing && !state.closed) {
            try {
                await this.#getComposed()(context);
            } catch (err) {
                this.#handleError(context, err);
            }
        }
        if (context.respond === false) {
            context.response.destroy();
            resolve();
            state.handling.delete(handlingPromise);
            return;
        }
        let closeResources = true;
        let response;
        try {
            closeResources = false;
            response = await context.response.toDomResponse();
        } catch (err) {
            this.#handleError(context, err);
            response = await context.response.toDomResponse();
        }
        assert(response);
        try {
            await request.respond(response);
        } catch (err1) {
            this.#handleError(context, err1);
        } finally{
            context.response.destroy(closeResources);
            resolve();
            state.handling.delete(handlingPromise);
            if (state.closing) {
                state.server.close();
                state.closed = true;
            }
        }
    }
    /** Add an event listener for an event.  Currently valid event types are
   * `"error"` and `"listen"`. */ addEventListener(type, listener, options) {
        super.addEventListener(type, listener, options);
    }
    /** Handle an individual server request, returning the server response.  This
   * is similar to `.listen()`, but opening the connection and retrieving
   * requests are not the responsibility of the application.  If the generated
   * context gets set to not to respond, then the method resolves with
   * `undefined`, otherwise it resolves with a request that is compatible with
   * `std/http/server`. */ handle = async (request, secureOrConn, secure = false)=>{
        if (!this.#middleware.length) {
            throw new TypeError("There is no middleware to process requests.");
        }
        assert(isConn(secureOrConn) || typeof secureOrConn === "undefined");
        const contextRequest = new NativeRequest({
            request,
            respondWith () {
                return Promise.resolve(undefined);
            }
        }, {
            conn: secureOrConn
        });
        const context = new Context(this, contextRequest, this.#getContextState(), secure);
        try {
            await this.#getComposed()(context);
        } catch (err) {
            this.#handleError(context, err);
        }
        if (context.respond === false) {
            context.response.destroy();
            return;
        }
        try {
            const response = await context.response.toDomResponse();
            context.response.destroy(false);
            return response;
        } catch (err1) {
            this.#handleError(context, err1);
            throw err1;
        }
    };
    async listen(options) {
        if (!this.#middleware.length) {
            throw new TypeError("There is no middleware to process requests.");
        }
        if (typeof options === "string") {
            const match = ADDR_REGEXP.exec(options);
            if (!match) {
                throw TypeError(`Invalid address passed: "${options}"`);
            }
            const [, hostname, portStr] = match;
            options = {
                hostname,
                port: parseInt(portStr, 10)
            };
        }
        const server = new this.#serverConstructor(this, options);
        const { signal  } = options;
        const state = {
            closed: false,
            closing: false,
            handling: new Set(),
            server
        };
        if (signal) {
            signal.addEventListener("abort", ()=>{
                if (!state.handling.size) {
                    server.close();
                    state.closed = true;
                }
                state.closing = true;
            });
        }
        const { secure =false  } = options;
        const serverType = server instanceof HttpServerNative ? "native" : "custom";
        const listener = server.listen();
        const { hostname , port  } = listener.addr;
        this.dispatchEvent(new ApplicationListenEvent({
            hostname,
            listener,
            port,
            secure,
            serverType
        }));
        try {
            for await (const request of server){
                this.#handleRequest(request, secure, state);
            }
            await Promise.all(state.handling);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Application Error";
            this.dispatchEvent(new ApplicationErrorEvent({
                message,
                error
            }));
        }
    }
    use(...middleware) {
        this.#middleware.push(...middleware);
        this.#composedMiddleware = undefined;
        // deno-lint-ignore no-explicit-any
        return this;
    }
    [Symbol.for("Deno.customInspect")](inspect) {
        const { keys , proxy , state  } = this;
        return `${this.constructor.name} ${inspect({
            "#middleware": this.#middleware,
            keys,
            proxy,
            state
        })}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMC4xLjAvYXBwbGljYXRpb24udHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMSB0aGUgb2FrIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSBcIi4vY29udGV4dC50c1wiO1xuaW1wb3J0IHsgU3RhdHVzLCBTVEFUVVNfVEVYVCB9IGZyb20gXCIuL2RlcHMudHNcIjtcbmltcG9ydCB7IEh0dHBTZXJ2ZXJOYXRpdmUsIE5hdGl2ZVJlcXVlc3QgfSBmcm9tIFwiLi9odHRwX3NlcnZlcl9uYXRpdmUudHNcIjtcbmltcG9ydCB7IEtleVN0YWNrIH0gZnJvbSBcIi4va2V5U3RhY2sudHNcIjtcbmltcG9ydCB7IGNvbXBvc2UsIE1pZGRsZXdhcmUgfSBmcm9tIFwiLi9taWRkbGV3YXJlLnRzXCI7XG5pbXBvcnQgeyBjbG9uZVN0YXRlIH0gZnJvbSBcIi4vc3RydWN0dXJlZF9jbG9uZS50c1wiO1xuaW1wb3J0IHsgS2V5LCBTZXJ2ZXIsIFNlcnZlckNvbnN0cnVjdG9yIH0gZnJvbSBcIi4vdHlwZXMuZC50c1wiO1xuaW1wb3J0IHsgYXNzZXJ0LCBpc0Nvbm4gfSBmcm9tIFwiLi91dGlsLnRzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGlzdGVuT3B0aW9uc0Jhc2UgZXh0ZW5kcyBEZW5vLkxpc3Rlbk9wdGlvbnMge1xuICBzZWN1cmU/OiBmYWxzZTtcbiAgc2lnbmFsPzogQWJvcnRTaWduYWw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGlzdGVuT3B0aW9uc1RscyBleHRlbmRzIERlbm8uTGlzdGVuVGxzT3B0aW9ucyB7XG4gIC8qKiBBcHBsaWNhdGlvbi1MYXllciBQcm90b2NvbCBOZWdvdGlhdGlvbiAoQUxQTikgcHJvdG9jb2xzIHRvIGFubm91bmNlIHRvXG4gICAqIHRoZSBjbGllbnQuIElmIG5vdCBzcGVjaWZpZWQsIG5vIEFMUE4gZXh0ZW5zaW9uIHdpbGwgYmUgaW5jbHVkZWQgaW4gdGhlXG4gICAqIFRMUyBoYW5kc2hha2UuXG4gICAqXG4gICAqICoqTk9URSoqIHRoaXMgaXMgcGFydCBvZiB0aGUgbmF0aXZlIEhUVFAgc2VydmVyIGluIERlbm8gMS45IG9yIGxhdGVyLFxuICAgKiB3aGljaCByZXF1aXJlcyB0aGUgYC0tdW5zdGFibGVgIGZsYWcgdG8gYmUgYXZhaWxhYmxlLlxuICAgKi9cbiAgYWxwblByb3RvY29scz86IHN0cmluZ1tdO1xuICBzZWN1cmU6IHRydWU7XG4gIHNpZ25hbD86IEFib3J0U2lnbmFsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEhhbmRsZU1ldGhvZCB7XG4gIC8qKiBIYW5kbGUgYW4gaW5kaXZpZHVhbCBzZXJ2ZXIgcmVxdWVzdCwgcmV0dXJuaW5nIHRoZSBzZXJ2ZXIgcmVzcG9uc2UuICBUaGlzXG4gICAqIGlzIHNpbWlsYXIgdG8gYC5saXN0ZW4oKWAsIGJ1dCBvcGVuaW5nIHRoZSBjb25uZWN0aW9uIGFuZCByZXRyaWV2aW5nXG4gICAqIHJlcXVlc3RzIGFyZSBub3QgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIHRoZSBhcHBsaWNhdGlvbi4gIElmIHRoZSBnZW5lcmF0ZWRcbiAgICogY29udGV4dCBnZXRzIHNldCB0byBub3QgdG8gcmVzcG9uZCwgdGhlbiB0aGUgbWV0aG9kIHJlc29sdmVzIHdpdGhcbiAgICogYHVuZGVmaW5lZGAsIG90aGVyd2lzZSBpdCByZXNvbHZlcyB3aXRoIGEgRE9NIGBSZXNwb25zZWAgb2JqZWN0LiAqL1xuICAoXG4gICAgcmVxdWVzdDogUmVxdWVzdCxcbiAgICBjb25uPzogRGVuby5Db25uLFxuICAgIHNlY3VyZT86IGJvb2xlYW4sXG4gICk6IFByb21pc2U8UmVzcG9uc2UgfCB1bmRlZmluZWQ+O1xufVxuXG5leHBvcnQgdHlwZSBMaXN0ZW5PcHRpb25zID0gTGlzdGVuT3B0aW9uc1RscyB8IExpc3Rlbk9wdGlvbnNCYXNlO1xuXG5pbnRlcmZhY2UgQXBwbGljYXRpb25FcnJvckV2ZW50TGlzdGVuZXI8UyBleHRlbmRzIEFTLCBBUz4ge1xuICAoZXZ0OiBBcHBsaWNhdGlvbkVycm9yRXZlbnQ8UywgQVM+KTogdm9pZCB8IFByb21pc2U8dm9pZD47XG59XG5cbmludGVyZmFjZSBBcHBsaWNhdGlvbkVycm9yRXZlbnRMaXN0ZW5lck9iamVjdDxTIGV4dGVuZHMgQVMsIEFTPiB7XG4gIGhhbmRsZUV2ZW50KGV2dDogQXBwbGljYXRpb25FcnJvckV2ZW50PFMsIEFTPik6IHZvaWQgfCBQcm9taXNlPHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgQXBwbGljYXRpb25FcnJvckV2ZW50SW5pdDxTIGV4dGVuZHMgQVMsIEFTIGV4dGVuZHMgU3RhdGU+XG4gIGV4dGVuZHMgRXJyb3JFdmVudEluaXQge1xuICBjb250ZXh0PzogQ29udGV4dDxTLCBBUz47XG59XG5cbnR5cGUgQXBwbGljYXRpb25FcnJvckV2ZW50TGlzdGVuZXJPckV2ZW50TGlzdGVuZXJPYmplY3Q8UyBleHRlbmRzIEFTLCBBUz4gPVxuICB8IEFwcGxpY2F0aW9uRXJyb3JFdmVudExpc3RlbmVyPFMsIEFTPlxuICB8IEFwcGxpY2F0aW9uRXJyb3JFdmVudExpc3RlbmVyT2JqZWN0PFMsIEFTPjtcblxuaW50ZXJmYWNlIEFwcGxpY2F0aW9uTGlzdGVuRXZlbnRMaXN0ZW5lciB7XG4gIChldnQ6IEFwcGxpY2F0aW9uTGlzdGVuRXZlbnQpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcbn1cblxuaW50ZXJmYWNlIEFwcGxpY2F0aW9uTGlzdGVuRXZlbnRMaXN0ZW5lck9iamVjdCB7XG4gIGhhbmRsZUV2ZW50KGV2dDogQXBwbGljYXRpb25MaXN0ZW5FdmVudCk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgQXBwbGljYXRpb25MaXN0ZW5FdmVudEluaXQgZXh0ZW5kcyBFdmVudEluaXQge1xuICBob3N0bmFtZTogc3RyaW5nO1xuICBsaXN0ZW5lcjogRGVuby5MaXN0ZW5lcjtcbiAgcG9ydDogbnVtYmVyO1xuICBzZWN1cmU6IGJvb2xlYW47XG4gIHNlcnZlclR5cGU6IFwibmF0aXZlXCIgfCBcImN1c3RvbVwiO1xufVxuXG50eXBlIEFwcGxpY2F0aW9uTGlzdGVuRXZlbnRMaXN0ZW5lck9yRXZlbnRMaXN0ZW5lck9iamVjdCA9XG4gIHwgQXBwbGljYXRpb25MaXN0ZW5FdmVudExpc3RlbmVyXG4gIHwgQXBwbGljYXRpb25MaXN0ZW5FdmVudExpc3RlbmVyT2JqZWN0O1xuXG5leHBvcnQgaW50ZXJmYWNlIEFwcGxpY2F0aW9uT3B0aW9uczxTPiB7XG4gIC8qKiBEZXRlcm1pbmUgaG93IHdoZW4gY3JlYXRpbmcgYSBuZXcgY29udGV4dCwgdGhlIHN0YXRlIGZyb20gdGhlIGFwcGxpY2F0aW9uXG4gICAqIHNob3VsZCBiZSBhcHBsaWVkLiBBIHZhbHVlIG9mIGBcImNsb25lXCJgIHdpbGwgc2V0IHRoZSBzdGF0ZSBhcyBhIGNsb25lIG9mXG4gICAqIHRoZSBhcHAgc3RhdGUuIEFueSBub24tY2xvbmVhYmxlIG9yIG5vbi1lbnVtZXJhYmxlIHByb3BlcnRpZXMgd2lsbCBub3QgYmVcbiAgICogY29waWVkLiBBIHZhbHVlIG9mIGBcInByb3RvdHlwZVwiYCBtZWFucyB0aGF0IHRoZSBhcHBsaWNhdGlvbidzIHN0YXRlIHdpbGwgYmVcbiAgICogdXNlZCBhcyB0aGUgcHJvdG90eXBlIG9mIHRoZSB0aGUgY29udGV4dCdzIHN0YXRlLCBtZWFuaW5nIHNoYWxsb3dcbiAgICogcHJvcGVydGllcyBvbiB0aGUgY29udGV4dCdzIHN0YXRlIHdpbGwgbm90IGJlIHJlZmxlY3RlZCBpbiB0aGVcbiAgICogYXBwbGljYXRpb24ncyBzdGF0ZS4gQSB2YWx1ZSBvZiBgXCJhbGlhc1wiYCBtZWFucyB0aGF0IGFwcGxpY2F0aW9uJ3MgYC5zdGF0ZWBcbiAgICogYW5kIHRoZSBjb250ZXh0J3MgYC5zdGF0ZWAgd2lsbCBiZSBhIHJlZmVyZW5jZSB0byB0aGUgc2FtZSBvYmplY3QuIEEgdmFsdWVcbiAgICogb2YgYFwiZW1wdHlcImAgd2lsbCBpbml0aWFsaXplIHRoZSBjb250ZXh0J3MgYC5zdGF0ZWAgd2l0aCBhbiBlbXB0eSBvYmplY3QuXG4gICAqXG4gICAqIFRoZSBkZWZhdWx0IHZhbHVlIGlzIGBcImNsb25lXCJgLlxuICAgKi9cbiAgY29udGV4dFN0YXRlPzogXCJjbG9uZVwiIHwgXCJwcm90b3R5cGVcIiB8IFwiYWxpYXNcIiB8IFwiZW1wdHlcIjtcblxuICAvKiogQW4gaW5pdGlhbCBzZXQgb2Yga2V5cyAob3IgaW5zdGFuY2Ugb2YgYEtleUdyaXBgKSB0byBiZSB1c2VkIGZvciBzaWduaW5nXG4gICAqIGNvb2tpZXMgcHJvZHVjZWQgYnkgdGhlIGFwcGxpY2F0aW9uLiAqL1xuICBrZXlzPzogS2V5U3RhY2sgfCBLZXlbXTtcblxuICAvKiogSWYgYHRydWVgLCBhbnkgZXJyb3JzIGhhbmRsZWQgYnkgdGhlIGFwcGxpY2F0aW9uIHdpbGwgYmUgbG9nZ2VkIHRvIHRoZVxuICAgKiBzdGRlcnIuIElmIGBmYWxzZWAgbm90aGluZyB3aWxsIGJlIGxvZ2dlZC4gVGhlIGRlZmF1bHQgaXMgYHRydWVgLlxuICAgKlxuICAgKiBBbGwgZXJyb3JzIGFyZSBhdmFpbGFibGUgYXMgZXZlbnRzIG9uIHRoZSBhcHBsaWNhdGlvbiBvZiB0eXBlIGBcImVycm9yXCJgIGFuZFxuICAgKiBjYW4gYmUgYWNjZXNzZWQgZm9yIGN1c3RvbSBsb2dnaW5nL2FwcGxpY2F0aW9uIG1hbmFnZW1lbnQgdmlhIGFkZGluZyBhblxuICAgKiBldmVudCBsaXN0ZW5lciB0byB0aGUgYXBwbGljYXRpb246XG4gICAqXG4gICAqIGBgYHRzXG4gICAqIGNvbnN0IGFwcCA9IG5ldyBBcHBsaWNhdGlvbih7IGxvZ0Vycm9yczogZmFsc2UgfSk7XG4gICAqIGFwcC5hZGRFdmVudExpc3RlbmVyKFwiZXJyb3JcIiwgKGV2dCkgPT4ge1xuICAgKiAgIC8vIGV2dC5lcnJvciB3aWxsIGNvbnRhaW4gd2hhdCBlcnJvciB3YXMgdGhyb3duXG4gICAqIH0pO1xuICAgKiBgYGBcbiAgICovXG4gIGxvZ0Vycm9ycz86IGJvb2xlYW47XG5cbiAgLyoqIElmIHNldCB0byBgdHJ1ZWAsIHByb3h5IGhlYWRlcnMgd2lsbCBiZSB0cnVzdGVkIHdoZW4gcHJvY2Vzc2luZyByZXF1ZXN0cy5cbiAgICogVGhpcyBkZWZhdWx0cyB0byBgZmFsc2VgLiAqL1xuICBwcm94eT86IGJvb2xlYW47XG5cbiAgLyoqIEEgc2VydmVyIGNvbnN0cnVjdG9yIHRvIHVzZSBpbnN0ZWFkIG9mIHRoZSBkZWZhdWx0IHNlcnZlciBmb3IgcmVjZWl2aW5nXG4gICAqIHJlcXVlc3RzLlxuICAgKlxuICAgKiBHZW5lcmFsbHkgdGhpcyBpcyBvbmx5IHVzZWQgZm9yIHRlc3RpbmcuICovXG4gIHNlcnZlckNvbnN0cnVjdG9yPzogU2VydmVyQ29uc3RydWN0b3I8TmF0aXZlUmVxdWVzdD47XG5cbiAgLyoqIFRoZSBpbml0aWFsIHN0YXRlIG9iamVjdCBmb3IgdGhlIGFwcGxpY2F0aW9uLCBvZiB3aGljaCB0aGUgdHlwZSBjYW4gYmVcbiAgICogdXNlZCB0byBpbmZlciB0aGUgdHlwZSBvZiB0aGUgc3RhdGUgZm9yIGJvdGggdGhlIGFwcGxpY2F0aW9uIGFuZCBhbnkgb2YgdGhlXG4gICAqIGFwcGxpY2F0aW9uJ3MgY29udGV4dC4gKi9cbiAgc3RhdGU/OiBTO1xufVxuXG5pbnRlcmZhY2UgUmVxdWVzdFN0YXRlIHtcbiAgaGFuZGxpbmc6IFNldDxQcm9taXNlPHZvaWQ+PjtcbiAgY2xvc2luZzogYm9vbGVhbjtcbiAgY2xvc2VkOiBib29sZWFuO1xuICBzZXJ2ZXI6IFNlcnZlcjxOYXRpdmVSZXF1ZXN0Pjtcbn1cblxuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmV4cG9ydCB0eXBlIFN0YXRlID0gUmVjb3JkPHN0cmluZyB8IG51bWJlciB8IHN5bWJvbCwgYW55PjtcblxuY29uc3QgQUREUl9SRUdFWFAgPSAvXlxcWz8oW15cXF1dKilcXF0/OihbMC05XXsxLDV9KSQvO1xuXG5leHBvcnQgY2xhc3MgQXBwbGljYXRpb25FcnJvckV2ZW50PFMgZXh0ZW5kcyBBUywgQVMgZXh0ZW5kcyBTdGF0ZT5cbiAgZXh0ZW5kcyBFcnJvckV2ZW50IHtcbiAgY29udGV4dD86IENvbnRleHQ8UywgQVM+O1xuXG4gIGNvbnN0cnVjdG9yKGV2ZW50SW5pdERpY3Q6IEFwcGxpY2F0aW9uRXJyb3JFdmVudEluaXQ8UywgQVM+KSB7XG4gICAgc3VwZXIoXCJlcnJvclwiLCBldmVudEluaXREaWN0KTtcbiAgICB0aGlzLmNvbnRleHQgPSBldmVudEluaXREaWN0LmNvbnRleHQ7XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9nRXJyb3JMaXN0ZW5lcjxTIGV4dGVuZHMgQVMsIEFTIGV4dGVuZHMgU3RhdGU+KFxuICB7IGVycm9yLCBjb250ZXh0IH06IEFwcGxpY2F0aW9uRXJyb3JFdmVudDxTLCBBUz4sXG4pIHtcbiAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKFxuICAgICAgYFt1bmNhdWdodCBhcHBsaWNhdGlvbiBlcnJvcl06ICR7ZXJyb3IubmFtZX0gLSAke2Vycm9yLm1lc3NhZ2V9YCxcbiAgICApO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUuZXJyb3IoYFt1bmNhdWdodCBhcHBsaWNhdGlvbiBlcnJvcl1cXG5gLCBlcnJvcik7XG4gIH1cbiAgaWYgKGNvbnRleHQpIHtcbiAgICBsZXQgdXJsOiBzdHJpbmc7XG4gICAgdHJ5IHtcbiAgICAgIHVybCA9IGNvbnRleHQucmVxdWVzdC51cmwudG9TdHJpbmcoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHVybCA9IFwiW21hbGZvcm1lZCB1cmxdXCI7XG4gICAgfVxuICAgIGNvbnNvbGUuZXJyb3IoYFxcbnJlcXVlc3Q6YCwge1xuICAgICAgdXJsLFxuICAgICAgbWV0aG9kOiBjb250ZXh0LnJlcXVlc3QubWV0aG9kLFxuICAgICAgaGFzQm9keTogY29udGV4dC5yZXF1ZXN0Lmhhc0JvZHksXG4gICAgfSk7XG4gICAgY29uc29sZS5lcnJvcihgcmVzcG9uc2U6YCwge1xuICAgICAgc3RhdHVzOiBjb250ZXh0LnJlc3BvbnNlLnN0YXR1cyxcbiAgICAgIHR5cGU6IGNvbnRleHQucmVzcG9uc2UudHlwZSxcbiAgICAgIGhhc0JvZHk6ICEhY29udGV4dC5yZXNwb25zZS5ib2R5LFxuICAgICAgd3JpdGFibGU6IGNvbnRleHQucmVzcG9uc2Uud3JpdGFibGUsXG4gICAgfSk7XG4gIH1cbiAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3Iuc3RhY2spIHtcbiAgICBjb25zb2xlLmVycm9yKGBcXG4ke2Vycm9yLnN0YWNrLnNwbGl0KFwiXFxuXCIpLnNsaWNlKDEpLmpvaW4oXCJcXG5cIil9YCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEFwcGxpY2F0aW9uTGlzdGVuRXZlbnQgZXh0ZW5kcyBFdmVudCB7XG4gIGhvc3RuYW1lOiBzdHJpbmc7XG4gIGxpc3RlbmVyOiBEZW5vLkxpc3RlbmVyO1xuICBwb3J0OiBudW1iZXI7XG4gIHNlY3VyZTogYm9vbGVhbjtcbiAgc2VydmVyVHlwZTogXCJuYXRpdmVcIiB8IFwiY3VzdG9tXCI7XG5cbiAgY29uc3RydWN0b3IoZXZlbnRJbml0RGljdDogQXBwbGljYXRpb25MaXN0ZW5FdmVudEluaXQpIHtcbiAgICBzdXBlcihcImxpc3RlblwiLCBldmVudEluaXREaWN0KTtcbiAgICB0aGlzLmhvc3RuYW1lID0gZXZlbnRJbml0RGljdC5ob3N0bmFtZTtcbiAgICB0aGlzLmxpc3RlbmVyID0gZXZlbnRJbml0RGljdC5saXN0ZW5lcjtcbiAgICB0aGlzLnBvcnQgPSBldmVudEluaXREaWN0LnBvcnQ7XG4gICAgdGhpcy5zZWN1cmUgPSBldmVudEluaXREaWN0LnNlY3VyZTtcbiAgICB0aGlzLnNlcnZlclR5cGUgPSBldmVudEluaXREaWN0LnNlcnZlclR5cGU7XG4gIH1cbn1cblxuLyoqIEEgY2xhc3Mgd2hpY2ggcmVnaXN0ZXJzIG1pZGRsZXdhcmUgKHZpYSBgLnVzZSgpYCkgYW5kIHRoZW4gcHJvY2Vzc2VzXG4gKiBpbmJvdW5kIHJlcXVlc3RzIGFnYWluc3QgdGhhdCBtaWRkbGV3YXJlICh2aWEgYC5saXN0ZW4oKWApLlxuICpcbiAqIFRoZSBgY29udGV4dC5zdGF0ZWAgY2FuIGJlIHR5cGVkIHZpYSBwYXNzaW5nIGEgZ2VuZXJpYyBhcmd1bWVudCB3aGVuXG4gKiBjb25zdHJ1Y3RpbmcgYW4gaW5zdGFuY2Ugb2YgYEFwcGxpY2F0aW9uYC5cbiAqL1xuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmV4cG9ydCBjbGFzcyBBcHBsaWNhdGlvbjxBUyBleHRlbmRzIFN0YXRlID0gUmVjb3JkPHN0cmluZywgYW55Pj5cbiAgZXh0ZW5kcyBFdmVudFRhcmdldCB7XG4gICNjb21wb3NlZE1pZGRsZXdhcmU/OiAoY29udGV4dDogQ29udGV4dDxBUywgQVM+KSA9PiBQcm9taXNlPHVua25vd24+O1xuICAjY29udGV4dFN0YXRlOiBcImNsb25lXCIgfCBcInByb3RvdHlwZVwiIHwgXCJhbGlhc1wiIHwgXCJlbXB0eVwiO1xuICAja2V5cz86IEtleVN0YWNrO1xuICAjbWlkZGxld2FyZTogTWlkZGxld2FyZTxTdGF0ZSwgQ29udGV4dDxTdGF0ZSwgQVM+PltdID0gW107XG4gICNzZXJ2ZXJDb25zdHJ1Y3RvcjogU2VydmVyQ29uc3RydWN0b3I8TmF0aXZlUmVxdWVzdD47XG5cbiAgLyoqIEEgc2V0IG9mIGtleXMsIG9yIGFuIGluc3RhbmNlIG9mIGBLZXlTdGFja2Agd2hpY2ggd2lsbCBiZSB1c2VkIHRvIHNpZ25cbiAgICogY29va2llcyByZWFkIGFuZCBzZXQgYnkgdGhlIGFwcGxpY2F0aW9uIHRvIGF2b2lkIHRhbXBlcmluZyB3aXRoIHRoZVxuICAgKiBjb29raWVzLiAqL1xuICBnZXQga2V5cygpOiBLZXlTdGFjayB8IEtleVtdIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gdGhpcy4ja2V5cztcbiAgfVxuXG4gIHNldCBrZXlzKGtleXM6IEtleVN0YWNrIHwgS2V5W10gfCB1bmRlZmluZWQpIHtcbiAgICBpZiAoIWtleXMpIHtcbiAgICAgIHRoaXMuI2tleXMgPSB1bmRlZmluZWQ7XG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGtleXMpKSB7XG4gICAgICB0aGlzLiNrZXlzID0gbmV3IEtleVN0YWNrKGtleXMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLiNrZXlzID0ga2V5cztcbiAgICB9XG4gIH1cblxuICAvKiogSWYgYHRydWVgLCBwcm94eSBoZWFkZXJzIHdpbGwgYmUgdHJ1c3RlZCB3aGVuIHByb2Nlc3NpbmcgcmVxdWVzdHMuICBUaGlzXG4gICAqIGRlZmF1bHRzIHRvIGBmYWxzZWAuICovXG4gIHByb3h5OiBib29sZWFuO1xuXG4gIC8qKiBHZW5lcmljIHN0YXRlIG9mIHRoZSBhcHBsaWNhdGlvbiwgd2hpY2ggY2FuIGJlIHNwZWNpZmllZCBieSBwYXNzaW5nIHRoZVxuICAgKiBnZW5lcmljIGFyZ3VtZW50IHdoZW4gY29uc3RydWN0aW5nOlxuICAgKlxuICAgKiAgICAgICBjb25zdCBhcHAgPSBuZXcgQXBwbGljYXRpb248eyBmb286IHN0cmluZyB9PigpO1xuICAgKlxuICAgKiBPciBjYW4gYmUgY29udGV4dHVhbGx5IGluZmVycmVkIGJhc2VkIG9uIHNldHRpbmcgYW4gaW5pdGlhbCBzdGF0ZSBvYmplY3Q6XG4gICAqXG4gICAqICAgICAgIGNvbnN0IGFwcCA9IG5ldyBBcHBsaWNhdGlvbih7IHN0YXRlOiB7IGZvbzogXCJiYXJcIiB9IH0pO1xuICAgKlxuICAgKiBXaGVuIGEgbmV3IGNvbnRleHQgaXMgY3JlYXRlZCwgdGhlIGFwcGxpY2F0aW9uJ3Mgc3RhdGUgaXMgY2xvbmVkIGFuZCB0aGVcbiAgICogc3RhdGUgaXMgdW5pcXVlIHRvIHRoYXQgcmVxdWVzdC9yZXNwb25zZS4gIENoYW5nZXMgY2FuIGJlIG1hZGUgdG8gdGhlXG4gICAqIGFwcGxpY2F0aW9uIHN0YXRlIHRoYXQgd2lsbCBiZSBzaGFyZWQgd2l0aCBhbGwgY29udGV4dHMuXG4gICAqL1xuICBzdGF0ZTogQVM7XG5cbiAgY29uc3RydWN0b3Iob3B0aW9uczogQXBwbGljYXRpb25PcHRpb25zPEFTPiA9IHt9KSB7XG4gICAgc3VwZXIoKTtcbiAgICBjb25zdCB7XG4gICAgICBzdGF0ZSxcbiAgICAgIGtleXMsXG4gICAgICBwcm94eSxcbiAgICAgIHNlcnZlckNvbnN0cnVjdG9yID0gSHR0cFNlcnZlck5hdGl2ZSxcbiAgICAgIGNvbnRleHRTdGF0ZSA9IFwiY2xvbmVcIixcbiAgICAgIGxvZ0Vycm9ycyA9IHRydWUsXG4gICAgfSA9IG9wdGlvbnM7XG5cbiAgICB0aGlzLnByb3h5ID0gcHJveHkgPz8gZmFsc2U7XG4gICAgdGhpcy5rZXlzID0ga2V5cztcbiAgICB0aGlzLnN0YXRlID0gc3RhdGUgPz8ge30gYXMgQVM7XG4gICAgdGhpcy4jc2VydmVyQ29uc3RydWN0b3IgPSBzZXJ2ZXJDb25zdHJ1Y3RvcjtcbiAgICB0aGlzLiNjb250ZXh0U3RhdGUgPSBjb250ZXh0U3RhdGU7XG5cbiAgICBpZiAobG9nRXJyb3JzKSB7XG4gICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCBsb2dFcnJvckxpc3RlbmVyKTtcbiAgICB9XG4gIH1cblxuICAjZ2V0Q29tcG9zZWQoKTogKChjb250ZXh0OiBDb250ZXh0PEFTLCBBUz4pID0+IFByb21pc2U8dW5rbm93bj4pIHtcbiAgICBpZiAoIXRoaXMuI2NvbXBvc2VkTWlkZGxld2FyZSkge1xuICAgICAgdGhpcy4jY29tcG9zZWRNaWRkbGV3YXJlID0gY29tcG9zZSh0aGlzLiNtaWRkbGV3YXJlKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuI2NvbXBvc2VkTWlkZGxld2FyZTtcbiAgfVxuXG4gICNnZXRDb250ZXh0U3RhdGUoKTogQVMge1xuICAgIHN3aXRjaCAodGhpcy4jY29udGV4dFN0YXRlKSB7XG4gICAgICBjYXNlIFwiYWxpYXNcIjpcbiAgICAgICAgcmV0dXJuIHRoaXMuc3RhdGU7XG4gICAgICBjYXNlIFwiY2xvbmVcIjpcbiAgICAgICAgcmV0dXJuIGNsb25lU3RhdGUodGhpcy5zdGF0ZSk7XG4gICAgICBjYXNlIFwiZW1wdHlcIjpcbiAgICAgICAgcmV0dXJuIHt9IGFzIEFTO1xuICAgICAgY2FzZSBcInByb3RvdHlwZVwiOlxuICAgICAgICByZXR1cm4gT2JqZWN0LmNyZWF0ZSh0aGlzLnN0YXRlKTtcbiAgICB9XG4gIH1cblxuICAvKiogRGVhbCB3aXRoIHVuY2F1Z2h0IGVycm9ycyBpbiBlaXRoZXIgdGhlIG1pZGRsZXdhcmUgb3Igc2VuZGluZyB0aGVcbiAgICogcmVzcG9uc2UuICovXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICNoYW5kbGVFcnJvcihjb250ZXh0OiBDb250ZXh0PEFTPiwgZXJyb3I6IGFueSk6IHZvaWQge1xuICAgIGlmICghKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpKSB7XG4gICAgICBlcnJvciA9IG5ldyBFcnJvcihgbm9uLWVycm9yIHRocm93bjogJHtKU09OLnN0cmluZ2lmeShlcnJvcil9YCk7XG4gICAgfVxuICAgIGNvbnN0IHsgbWVzc2FnZSB9ID0gZXJyb3I7XG4gICAgdGhpcy5kaXNwYXRjaEV2ZW50KG5ldyBBcHBsaWNhdGlvbkVycm9yRXZlbnQoeyBjb250ZXh0LCBtZXNzYWdlLCBlcnJvciB9KSk7XG4gICAgaWYgKCFjb250ZXh0LnJlc3BvbnNlLndyaXRhYmxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IG9mIFsuLi5jb250ZXh0LnJlc3BvbnNlLmhlYWRlcnMua2V5cygpXSkge1xuICAgICAgY29udGV4dC5yZXNwb25zZS5oZWFkZXJzLmRlbGV0ZShrZXkpO1xuICAgIH1cbiAgICBpZiAoZXJyb3IuaGVhZGVycyAmJiBlcnJvci5oZWFkZXJzIGluc3RhbmNlb2YgSGVhZGVycykge1xuICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgZXJyb3IuaGVhZGVycykge1xuICAgICAgICBjb250ZXh0LnJlc3BvbnNlLmhlYWRlcnMuc2V0KGtleSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgICBjb250ZXh0LnJlc3BvbnNlLnR5cGUgPSBcInRleHRcIjtcbiAgICBjb25zdCBzdGF0dXM6IFN0YXR1cyA9IGNvbnRleHQucmVzcG9uc2Uuc3RhdHVzID1cbiAgICAgIERlbm8uZXJyb3JzICYmIGVycm9yIGluc3RhbmNlb2YgRGVuby5lcnJvcnMuTm90Rm91bmRcbiAgICAgICAgPyA0MDRcbiAgICAgICAgOiBlcnJvci5zdGF0dXMgJiYgdHlwZW9mIGVycm9yLnN0YXR1cyA9PT0gXCJudW1iZXJcIlxuICAgICAgICA/IGVycm9yLnN0YXR1c1xuICAgICAgICA6IDUwMDtcbiAgICBjb250ZXh0LnJlc3BvbnNlLmJvZHkgPSBlcnJvci5leHBvc2VcbiAgICAgID8gZXJyb3IubWVzc2FnZVxuICAgICAgOiBTVEFUVVNfVEVYVC5nZXQoc3RhdHVzKTtcbiAgfVxuXG4gIC8qKiBQcm9jZXNzaW5nIHJlZ2lzdGVyZWQgbWlkZGxld2FyZSBvbiBlYWNoIHJlcXVlc3QuICovXG4gIGFzeW5jICNoYW5kbGVSZXF1ZXN0KFxuICAgIHJlcXVlc3Q6IE5hdGl2ZVJlcXVlc3QsXG4gICAgc2VjdXJlOiBib29sZWFuLFxuICAgIHN0YXRlOiBSZXF1ZXN0U3RhdGUsXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNvbnRleHQgPSBuZXcgQ29udGV4dCh0aGlzLCByZXF1ZXN0LCB0aGlzLiNnZXRDb250ZXh0U3RhdGUoKSwgc2VjdXJlKTtcbiAgICBsZXQgcmVzb2x2ZTogKCkgPT4gdm9pZDtcbiAgICBjb25zdCBoYW5kbGluZ1Byb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzKSA9PiByZXNvbHZlID0gcmVzKTtcbiAgICBzdGF0ZS5oYW5kbGluZy5hZGQoaGFuZGxpbmdQcm9taXNlKTtcbiAgICBpZiAoIXN0YXRlLmNsb3NpbmcgJiYgIXN0YXRlLmNsb3NlZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy4jZ2V0Q29tcG9zZWQoKShjb250ZXh0KTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICB0aGlzLiNoYW5kbGVFcnJvcihjb250ZXh0LCBlcnIpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoY29udGV4dC5yZXNwb25kID09PSBmYWxzZSkge1xuICAgICAgY29udGV4dC5yZXNwb25zZS5kZXN0cm95KCk7XG4gICAgICByZXNvbHZlISgpO1xuICAgICAgc3RhdGUuaGFuZGxpbmcuZGVsZXRlKGhhbmRsaW5nUHJvbWlzZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGxldCBjbG9zZVJlc291cmNlcyA9IHRydWU7XG4gICAgbGV0IHJlc3BvbnNlOiBSZXNwb25zZTtcbiAgICB0cnkge1xuICAgICAgY2xvc2VSZXNvdXJjZXMgPSBmYWxzZTtcbiAgICAgIHJlc3BvbnNlID0gYXdhaXQgY29udGV4dC5yZXNwb25zZS50b0RvbVJlc3BvbnNlKCk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICB0aGlzLiNoYW5kbGVFcnJvcihjb250ZXh0LCBlcnIpO1xuICAgICAgcmVzcG9uc2UgPSBhd2FpdCBjb250ZXh0LnJlc3BvbnNlLnRvRG9tUmVzcG9uc2UoKTtcbiAgICB9XG4gICAgYXNzZXJ0KHJlc3BvbnNlKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgcmVxdWVzdC5yZXNwb25kKHJlc3BvbnNlKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHRoaXMuI2hhbmRsZUVycm9yKGNvbnRleHQsIGVycik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNvbnRleHQucmVzcG9uc2UuZGVzdHJveShjbG9zZVJlc291cmNlcyk7XG4gICAgICByZXNvbHZlISgpO1xuICAgICAgc3RhdGUuaGFuZGxpbmcuZGVsZXRlKGhhbmRsaW5nUHJvbWlzZSk7XG4gICAgICBpZiAoc3RhdGUuY2xvc2luZykge1xuICAgICAgICBzdGF0ZS5zZXJ2ZXIuY2xvc2UoKTtcbiAgICAgICAgc3RhdGUuY2xvc2VkID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKiogQWRkIGFuIGV2ZW50IGxpc3RlbmVyIGZvciBhbiBgXCJlcnJvclwiYCBldmVudCB3aGljaCBvY2N1cnMgd2hlbiBhblxuICAgKiB1bi1jYXVnaHQgZXJyb3Igb2NjdXJzIHdoZW4gcHJvY2Vzc2luZyB0aGUgbWlkZGxld2FyZSBvciBkdXJpbmcgcHJvY2Vzc2luZ1xuICAgKiBvZiB0aGUgcmVzcG9uc2UuICovXG4gIGFkZEV2ZW50TGlzdGVuZXI8UyBleHRlbmRzIEFTPihcbiAgICB0eXBlOiBcImVycm9yXCIsXG4gICAgbGlzdGVuZXI6IEFwcGxpY2F0aW9uRXJyb3JFdmVudExpc3RlbmVyT3JFdmVudExpc3RlbmVyT2JqZWN0PFMsIEFTPiB8IG51bGwsXG4gICAgb3B0aW9ucz86IGJvb2xlYW4gfCBBZGRFdmVudExpc3RlbmVyT3B0aW9ucyxcbiAgKTogdm9pZDtcbiAgLyoqIEFkZCBhbiBldmVudCBsaXN0ZW5lciBmb3IgYSBgXCJsaXN0ZW5cImAgZXZlbnQgd2hpY2ggb2NjdXJzIHdoZW4gdGhlIHNlcnZlclxuICAgKiBoYXMgc3VjY2Vzc2Z1bGx5IG9wZW5lZCBidXQgYmVmb3JlIGFueSByZXF1ZXN0cyBzdGFydCBiZWluZyBwcm9jZXNzZWQuICovXG4gIGFkZEV2ZW50TGlzdGVuZXIoXG4gICAgdHlwZTogXCJsaXN0ZW5cIixcbiAgICBsaXN0ZW5lcjogQXBwbGljYXRpb25MaXN0ZW5FdmVudExpc3RlbmVyT3JFdmVudExpc3RlbmVyT2JqZWN0IHwgbnVsbCxcbiAgICBvcHRpb25zPzogYm9vbGVhbiB8IEFkZEV2ZW50TGlzdGVuZXJPcHRpb25zLFxuICApOiB2b2lkO1xuICAvKiogQWRkIGFuIGV2ZW50IGxpc3RlbmVyIGZvciBhbiBldmVudC4gIEN1cnJlbnRseSB2YWxpZCBldmVudCB0eXBlcyBhcmVcbiAgICogYFwiZXJyb3JcImAgYW5kIGBcImxpc3RlblwiYC4gKi9cbiAgYWRkRXZlbnRMaXN0ZW5lcihcbiAgICB0eXBlOiBcImVycm9yXCIgfCBcImxpc3RlblwiLFxuICAgIGxpc3RlbmVyOiBFdmVudExpc3RlbmVyT3JFdmVudExpc3RlbmVyT2JqZWN0IHwgbnVsbCxcbiAgICBvcHRpb25zPzogYm9vbGVhbiB8IEFkZEV2ZW50TGlzdGVuZXJPcHRpb25zLFxuICApOiB2b2lkIHtcbiAgICBzdXBlci5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyLCBvcHRpb25zKTtcbiAgfVxuXG4gIC8qKiBIYW5kbGUgYW4gaW5kaXZpZHVhbCBzZXJ2ZXIgcmVxdWVzdCwgcmV0dXJuaW5nIHRoZSBzZXJ2ZXIgcmVzcG9uc2UuICBUaGlzXG4gICAqIGlzIHNpbWlsYXIgdG8gYC5saXN0ZW4oKWAsIGJ1dCBvcGVuaW5nIHRoZSBjb25uZWN0aW9uIGFuZCByZXRyaWV2aW5nXG4gICAqIHJlcXVlc3RzIGFyZSBub3QgdGhlIHJlc3BvbnNpYmlsaXR5IG9mIHRoZSBhcHBsaWNhdGlvbi4gIElmIHRoZSBnZW5lcmF0ZWRcbiAgICogY29udGV4dCBnZXRzIHNldCB0byBub3QgdG8gcmVzcG9uZCwgdGhlbiB0aGUgbWV0aG9kIHJlc29sdmVzIHdpdGhcbiAgICogYHVuZGVmaW5lZGAsIG90aGVyd2lzZSBpdCByZXNvbHZlcyB3aXRoIGEgcmVxdWVzdCB0aGF0IGlzIGNvbXBhdGlibGUgd2l0aFxuICAgKiBgc3RkL2h0dHAvc2VydmVyYC4gKi9cbiAgaGFuZGxlID0gKGFzeW5jIChcbiAgICByZXF1ZXN0OiBSZXF1ZXN0LFxuICAgIHNlY3VyZU9yQ29ubjogRGVuby5Db25uIHwgYm9vbGVhbiB8IHVuZGVmaW5lZCxcbiAgICBzZWN1cmU6IGJvb2xlYW4gfCB1bmRlZmluZWQgPSBmYWxzZSxcbiAgKTogUHJvbWlzZTxSZXNwb25zZSB8IHVuZGVmaW5lZD4gPT4ge1xuICAgIGlmICghdGhpcy4jbWlkZGxld2FyZS5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJUaGVyZSBpcyBubyBtaWRkbGV3YXJlIHRvIHByb2Nlc3MgcmVxdWVzdHMuXCIpO1xuICAgIH1cbiAgICBhc3NlcnQoaXNDb25uKHNlY3VyZU9yQ29ubikgfHwgdHlwZW9mIHNlY3VyZU9yQ29ubiA9PT0gXCJ1bmRlZmluZWRcIik7XG4gICAgY29uc3QgY29udGV4dFJlcXVlc3QgPSBuZXcgTmF0aXZlUmVxdWVzdCh7XG4gICAgICByZXF1ZXN0LFxuICAgICAgcmVzcG9uZFdpdGgoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcbiAgICAgIH0sXG4gICAgfSwgeyBjb25uOiBzZWN1cmVPckNvbm4gfSk7XG4gICAgY29uc3QgY29udGV4dCA9IG5ldyBDb250ZXh0KFxuICAgICAgdGhpcyxcbiAgICAgIGNvbnRleHRSZXF1ZXN0LFxuICAgICAgdGhpcy4jZ2V0Q29udGV4dFN0YXRlKCksXG4gICAgICBzZWN1cmUsXG4gICAgKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy4jZ2V0Q29tcG9zZWQoKShjb250ZXh0KTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHRoaXMuI2hhbmRsZUVycm9yKGNvbnRleHQsIGVycik7XG4gICAgfVxuICAgIGlmIChjb250ZXh0LnJlc3BvbmQgPT09IGZhbHNlKSB7XG4gICAgICBjb250ZXh0LnJlc3BvbnNlLmRlc3Ryb3koKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY29udGV4dC5yZXNwb25zZS50b0RvbVJlc3BvbnNlKCk7XG4gICAgICBjb250ZXh0LnJlc3BvbnNlLmRlc3Ryb3koZmFsc2UpO1xuICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgdGhpcy4jaGFuZGxlRXJyb3IoY29udGV4dCwgZXJyKTtcbiAgICAgIHRocm93IGVycjtcbiAgICB9XG4gIH0pIGFzIEhhbmRsZU1ldGhvZDtcblxuICAvKiogU3RhcnQgbGlzdGVuaW5nIGZvciByZXF1ZXN0cywgcHJvY2Vzc2luZyByZWdpc3RlcmVkIG1pZGRsZXdhcmUgb24gZWFjaFxuICAgKiByZXF1ZXN0LiAgSWYgdGhlIG9wdGlvbnMgYC5zZWN1cmVgIGlzIHVuZGVmaW5lZCBvciBgZmFsc2VgLCB0aGUgbGlzdGVuaW5nXG4gICAqIHdpbGwgYmUgb3ZlciBIVFRQLiAgSWYgdGhlIG9wdGlvbnMgYC5zZWN1cmVgIHByb3BlcnR5IGlzIGB0cnVlYCwgYVxuICAgKiBgLmNlcnRGaWxlYCBhbmQgYSBgLmtleUZpbGVgIHByb3BlcnR5IG5lZWQgdG8gYmUgc3VwcGxpZWQgYW5kIHJlcXVlc3RzXG4gICAqIHdpbGwgYmUgcHJvY2Vzc2VkIG92ZXIgSFRUUFMuICovXG4gIGFzeW5jIGxpc3RlbihhZGRyOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuICAvKiogU3RhcnQgbGlzdGVuaW5nIGZvciByZXF1ZXN0cywgcHJvY2Vzc2luZyByZWdpc3RlcmVkIG1pZGRsZXdhcmUgb24gZWFjaFxuICAgKiByZXF1ZXN0LiAgSWYgdGhlIG9wdGlvbnMgYC5zZWN1cmVgIGlzIHVuZGVmaW5lZCBvciBgZmFsc2VgLCB0aGUgbGlzdGVuaW5nXG4gICAqIHdpbGwgYmUgb3ZlciBIVFRQLiAgSWYgdGhlIG9wdGlvbnMgYC5zZWN1cmVgIHByb3BlcnR5IGlzIGB0cnVlYCwgYVxuICAgKiBgLmNlcnRGaWxlYCBhbmQgYSBgLmtleUZpbGVgIHByb3BlcnR5IG5lZWQgdG8gYmUgc3VwcGxpZWQgYW5kIHJlcXVlc3RzXG4gICAqIHdpbGwgYmUgcHJvY2Vzc2VkIG92ZXIgSFRUUFMuICovXG4gIGFzeW5jIGxpc3RlbihvcHRpb25zOiBMaXN0ZW5PcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcbiAgYXN5bmMgbGlzdGVuKG9wdGlvbnM6IHN0cmluZyB8IExpc3Rlbk9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMuI21pZGRsZXdhcmUubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiVGhlcmUgaXMgbm8gbWlkZGxld2FyZSB0byBwcm9jZXNzIHJlcXVlc3RzLlwiKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSBcInN0cmluZ1wiKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IEFERFJfUkVHRVhQLmV4ZWMob3B0aW9ucyk7XG4gICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgIHRocm93IFR5cGVFcnJvcihgSW52YWxpZCBhZGRyZXNzIHBhc3NlZDogXCIke29wdGlvbnN9XCJgKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IFssIGhvc3RuYW1lLCBwb3J0U3RyXSA9IG1hdGNoO1xuICAgICAgb3B0aW9ucyA9IHsgaG9zdG5hbWUsIHBvcnQ6IHBhcnNlSW50KHBvcnRTdHIsIDEwKSB9O1xuICAgIH1cbiAgICBjb25zdCBzZXJ2ZXIgPSBuZXcgdGhpcy4jc2VydmVyQ29uc3RydWN0b3IodGhpcywgb3B0aW9ucyk7XG4gICAgY29uc3QgeyBzaWduYWwgfSA9IG9wdGlvbnM7XG4gICAgY29uc3Qgc3RhdGUgPSB7XG4gICAgICBjbG9zZWQ6IGZhbHNlLFxuICAgICAgY2xvc2luZzogZmFsc2UsXG4gICAgICBoYW5kbGluZzogbmV3IFNldDxQcm9taXNlPHZvaWQ+PigpLFxuICAgICAgc2VydmVyLFxuICAgIH07XG4gICAgaWYgKHNpZ25hbCkge1xuICAgICAgc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoXCJhYm9ydFwiLCAoKSA9PiB7XG4gICAgICAgIGlmICghc3RhdGUuaGFuZGxpbmcuc2l6ZSkge1xuICAgICAgICAgIHNlcnZlci5jbG9zZSgpO1xuICAgICAgICAgIHN0YXRlLmNsb3NlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgc3RhdGUuY2xvc2luZyA9IHRydWU7XG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgeyBzZWN1cmUgPSBmYWxzZSB9ID0gb3B0aW9ucztcbiAgICBjb25zdCBzZXJ2ZXJUeXBlID0gc2VydmVyIGluc3RhbmNlb2YgSHR0cFNlcnZlck5hdGl2ZSA/IFwibmF0aXZlXCIgOiBcImN1c3RvbVwiO1xuICAgIGNvbnN0IGxpc3RlbmVyID0gc2VydmVyLmxpc3RlbigpO1xuICAgIGNvbnN0IHsgaG9zdG5hbWUsIHBvcnQgfSA9IGxpc3RlbmVyLmFkZHIgYXMgRGVuby5OZXRBZGRyO1xuICAgIHRoaXMuZGlzcGF0Y2hFdmVudChcbiAgICAgIG5ldyBBcHBsaWNhdGlvbkxpc3RlbkV2ZW50KHtcbiAgICAgICAgaG9zdG5hbWUsXG4gICAgICAgIGxpc3RlbmVyLFxuICAgICAgICBwb3J0LFxuICAgICAgICBzZWN1cmUsXG4gICAgICAgIHNlcnZlclR5cGUsXG4gICAgICB9KSxcbiAgICApO1xuICAgIHRyeSB7XG4gICAgICBmb3IgYXdhaXQgKGNvbnN0IHJlcXVlc3Qgb2Ygc2VydmVyKSB7XG4gICAgICAgIHRoaXMuI2hhbmRsZVJlcXVlc3QocmVxdWVzdCwgc2VjdXJlLCBzdGF0ZSk7XG4gICAgICB9XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChzdGF0ZS5oYW5kbGluZyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yXG4gICAgICAgID8gZXJyb3IubWVzc2FnZVxuICAgICAgICA6IFwiQXBwbGljYXRpb24gRXJyb3JcIjtcbiAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChcbiAgICAgICAgbmV3IEFwcGxpY2F0aW9uRXJyb3JFdmVudCh7IG1lc3NhZ2UsIGVycm9yIH0pLFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvKiogUmVnaXN0ZXIgbWlkZGxld2FyZSB0byBiZSB1c2VkIHdpdGggdGhlIGFwcGxpY2F0aW9uLiAgTWlkZGxld2FyZSB3aWxsXG4gICAqIGJlIHByb2Nlc3NlZCBpbiB0aGUgb3JkZXIgaXQgaXMgYWRkZWQsIGJ1dCBtaWRkbGV3YXJlIGNhbiBjb250cm9sIHRoZSBmbG93XG4gICAqIG9mIGV4ZWN1dGlvbiB2aWEgdGhlIHVzZSBvZiB0aGUgYG5leHQoKWAgZnVuY3Rpb24gdGhhdCB0aGUgbWlkZGxld2FyZVxuICAgKiBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCB3aXRoLiAgVGhlIGBjb250ZXh0YCBvYmplY3QgcHJvdmlkZXMgaW5mb3JtYXRpb25cbiAgICogYWJvdXQgdGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIGFwcGxpY2F0aW9uLlxuICAgKlxuICAgKiBCYXNpYyB1c2FnZTpcbiAgICpcbiAgICogYGBgdHNcbiAgICogY29uc3QgaW1wb3J0IHsgQXBwbGljYXRpb24gfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQveC9vYWsvbW9kLnRzXCI7XG4gICAqXG4gICAqIGNvbnN0IGFwcCA9IG5ldyBBcHBsaWNhdGlvbigpO1xuICAgKlxuICAgKiBhcHAudXNlKChjdHgsIG5leHQpID0+IHtcbiAgICogICBjdHgucmVxdWVzdDsgLy8gY29udGFpbnMgcmVxdWVzdCBpbmZvcm1hdGlvblxuICAgKiAgIGN0eC5yZXNwb25zZTsgLy8gc2V0dXBzIHVwIGluZm9ybWF0aW9uIHRvIHVzZSBpbiB0aGUgcmVzcG9uc2U7XG4gICAqICAgYXdhaXQgbmV4dCgpOyAvLyBtYW5hZ2VzIHRoZSBmbG93IGNvbnRyb2wgb2YgdGhlIG1pZGRsZXdhcmUgZXhlY3V0aW9uXG4gICAqIH0pO1xuICAgKlxuICAgKiBhd2FpdCBhcHAubGlzdGVuKHsgcG9ydDogODAgfSk7XG4gICAqIGBgYFxuICAgKi9cbiAgdXNlPFMgZXh0ZW5kcyBTdGF0ZSA9IEFTPihcbiAgICBtaWRkbGV3YXJlOiBNaWRkbGV3YXJlPFMsIENvbnRleHQ8UywgQVM+PixcbiAgICAuLi5taWRkbGV3YXJlczogTWlkZGxld2FyZTxTLCBDb250ZXh0PFMsIEFTPj5bXVxuICApOiBBcHBsaWNhdGlvbjxTIGV4dGVuZHMgQVMgPyBTIDogKFMgJiBBUyk+O1xuICB1c2U8UyBleHRlbmRzIFN0YXRlID0gQVM+KFxuICAgIC4uLm1pZGRsZXdhcmU6IE1pZGRsZXdhcmU8UywgQ29udGV4dDxTLCBBUz4+W11cbiAgKTogQXBwbGljYXRpb248UyBleHRlbmRzIEFTID8gUyA6IChTICYgQVMpPiB7XG4gICAgdGhpcy4jbWlkZGxld2FyZS5wdXNoKC4uLm1pZGRsZXdhcmUpO1xuICAgIHRoaXMuI2NvbXBvc2VkTWlkZGxld2FyZSA9IHVuZGVmaW5lZDtcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIHJldHVybiB0aGlzIGFzIEFwcGxpY2F0aW9uPGFueT47XG4gIH1cblxuICBbU3ltYm9sLmZvcihcIkRlbm8uY3VzdG9tSW5zcGVjdFwiKV0oaW5zcGVjdDogKHZhbHVlOiB1bmtub3duKSA9PiBzdHJpbmcpIHtcbiAgICBjb25zdCB7IGtleXMsIHByb3h5LCBzdGF0ZSB9ID0gdGhpcztcbiAgICByZXR1cm4gYCR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfSAke1xuICAgICAgaW5zcGVjdCh7IFwiI21pZGRsZXdhcmVcIjogdGhpcy4jbWlkZGxld2FyZSwga2V5cywgcHJveHksIHN0YXRlIH0pXG4gICAgfWA7XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxFQUF5RSxBQUF6RSx1RUFBeUU7QUFFekUsTUFBTSxHQUFHLE9BQU8sUUFBUSxDQUFjO0FBQ3RDLE1BQU0sR0FBVyxXQUFXLFFBQVEsQ0FBVztBQUMvQyxNQUFNLEdBQUcsZ0JBQWdCLEVBQUUsYUFBYSxRQUFRLENBQXlCO0FBQ3pFLE1BQU0sR0FBRyxRQUFRLFFBQVEsQ0FBZTtBQUN4QyxNQUFNLEdBQUcsT0FBTyxRQUFvQixDQUFpQjtBQUNyRCxNQUFNLEdBQUcsVUFBVSxRQUFRLENBQXVCO0FBRWxELE1BQU0sR0FBRyxNQUFNLEVBQUUsTUFBTSxRQUFRLENBQVc7QUFxSTFDLEtBQUssQ0FBQyxXQUFXO0FBRWpCLE1BQU0sT0FBTyxxQkFBcUIsU0FDeEIsVUFBVTtJQUNsQixPQUFPO2dCQUVL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