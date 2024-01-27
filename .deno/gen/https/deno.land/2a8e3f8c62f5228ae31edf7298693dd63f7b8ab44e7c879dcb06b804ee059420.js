import { compile, pathParse, pathToRegexp, Status } from "./deps.ts";
import { httpErrors } from "./httpError.ts";
import { compose } from "./middleware.ts";
import { assert, decodeComponent } from "./util.ts";
/** Generate a URL from a string, potentially replace route params with
 * values. */ function toUrl(url, params = {
}, options) {
    const tokens = pathParse(url);
    let replace = {
    };
    if (tokens.some((token)=>typeof token === "object"
    )) {
        replace = params;
    } else {
        options = params;
    }
    const toPath = compile(url, options);
    const replaced = toPath(replace);
    if (options && options.query) {
        const url = new URL(replaced, "http://oak");
        if (typeof options.query === "string") {
            url.search = options.query;
        } else {
            url.search = String(options.query instanceof URLSearchParams ? options.query : new URLSearchParams(options.query));
        }
        return `${url.pathname}${url.search}${url.hash}`;
    }
    return replaced;
}
class Layer {
    #opts;
    #paramNames = [];
    #regexp;
    methods;
    name;
    path;
    stack;
    constructor(path, methods, middleware, { name , ...opts } = {
    }){
        this.#opts = opts;
        this.name = name;
        this.methods = [
            ...methods
        ];
        if (this.methods.includes("GET")) {
            this.methods.unshift("HEAD");
        }
        this.stack = Array.isArray(middleware) ? middleware.slice() : [
            middleware
        ];
        this.path = path;
        this.#regexp = pathToRegexp(path, this.#paramNames, this.#opts);
    }
    clone() {
        return new Layer(this.path, this.methods, this.stack, {
            name: this.name,
            ...this.#opts
        });
    }
    match(path) {
        return this.#regexp.test(path);
    }
    params(captures, existingParams = {
    }) {
        const params = existingParams;
        for(let i = 0; i < captures.length; i++){
            if (this.#paramNames[i]) {
                const c = captures[i];
                params[this.#paramNames[i].name] = c ? decodeComponent(c) : c;
            }
        }
        return params;
    }
    captures(path) {
        if (this.#opts.ignoreCaptures) {
            return [];
        }
        return path.match(this.#regexp)?.slice(1) ?? [];
    }
    url(params = {
    }, options) {
        const url = this.path.replace(/\(\.\*\)/g, "");
        return toUrl(url, params, options);
    }
    param(param, // deno-lint-ignore no-explicit-any
    fn) {
        const stack = this.stack;
        const params = this.#paramNames;
        const middleware = function(ctx, next) {
            const p = ctx.params[param];
            assert(p);
            return fn.call(this, p, ctx, next);
        };
        middleware.param = param;
        const names = params.map((p)=>p.name
        );
        const x = names.indexOf(param);
        if (x >= 0) {
            for(let i = 0; i < stack.length; i++){
                const fn = stack[i];
                if (!fn.param || names.indexOf(fn.param) > x) {
                    stack.splice(i, 0, middleware);
                    break;
                }
            }
        }
        return this;
    }
    setPrefix(prefix) {
        if (this.path) {
            this.path = this.path !== "/" || this.#opts.strict === true ? `${prefix}${this.path}` : prefix;
            this.#paramNames = [];
            this.#regexp = pathToRegexp(this.path, this.#paramNames, this.#opts);
        }
        return this;
    }
    // deno-lint-ignore no-explicit-any
    toJSON() {
        return {
            methods: [
                ...this.methods
            ],
            middleware: [
                ...this.stack
            ],
            paramNames: this.#paramNames.map((key)=>key.name
            ),
            path: this.path,
            regexp: this.#regexp,
            options: {
                ...this.#opts
            }
        };
    }
    [Symbol.for("Deno.customInspect")](inspect) {
        return `${this.constructor.name} ${inspect({
            methods: this.methods,
            middleware: this.stack,
            options: this.#opts,
            paramNames: this.#paramNames.map((key)=>key.name
            ),
            path: this.path,
            regexp: this.#regexp
        })}`;
    }
}
/** An interface for registering middleware that will run when certain HTTP
 * methods and paths are requested, as well as provides a way to parameterize
 * parts of the requested path. */ export class Router {
    #opts;
    #methods;
    // deno-lint-ignore no-explicit-any
    #params = {
    };
    #stack = [];
     #match(path, method) {
        const matches = {
            path: [],
            pathAndMethod: [],
            route: false
        };
        for (const route of this.#stack){
            if (route.match(path)) {
                matches.path.push(route);
                if (route.methods.length === 0 || route.methods.includes(method)) {
                    matches.pathAndMethod.push(route);
                    if (route.methods.length) {
                        matches.route = true;
                    }
                }
            }
        }
        return matches;
    }
     #register(path, middlewares, methods, options = {
    }) {
        if (Array.isArray(path)) {
            for (const p of path){
                this.#register(p, middlewares, methods, options);
            }
            return;
        }
        let layerMiddlewares = [];
        for (const middleware of middlewares){
            if (!middleware.router) {
                layerMiddlewares.push(middleware);
                continue;
            }
            if (layerMiddlewares.length) {
                this.#addLayer(path, layerMiddlewares, methods, options);
                layerMiddlewares = [];
            }
            const router = middleware.router.#clone();
            for (const layer of router.#stack){
                if (!options.ignorePrefix) {
                    layer.setPrefix(path);
                }
                if (this.#opts.prefix) {
                    layer.setPrefix(this.#opts.prefix);
                }
                this.#stack.push(layer);
            }
            for (const [param, mw] of Object.entries(this.#params)){
                router.param(param, mw);
            }
        }
        if (layerMiddlewares.length) {
            this.#addLayer(path, layerMiddlewares, methods, options);
        }
    }
     #addLayer(path, middlewares, methods, options = {
    }) {
        const { end , name , sensitive =this.#opts.sensitive , strict =this.#opts.strict , ignoreCaptures ,  } = options;
        const route = new Layer(path, methods, middlewares, {
            end,
            name,
            sensitive,
            strict,
            ignoreCaptures
        });
        if (this.#opts.prefix) {
            route.setPrefix(this.#opts.prefix);
        }
        for (const [param, mw] of Object.entries(this.#params)){
            route.param(param, mw);
        }
        this.#stack.push(route);
    }
     #route(name) {
        for (const route of this.#stack){
            if (route.name === name) {
                return route;
            }
        }
    }
     #useVerb(nameOrPath, pathOrMiddleware, middleware, methods) {
        let name = undefined;
        let path;
        if (typeof pathOrMiddleware === "string") {
            name = nameOrPath;
            path = pathOrMiddleware;
        } else {
            path = nameOrPath;
            middleware.unshift(pathOrMiddleware);
        }
        this.#register(path, middleware, methods, {
            name
        });
    }
     #clone() {
        const router = new Router(this.#opts);
        router.#methods = router.#methods.slice();
        router.#params = {
            ...this.#params
        };
        router.#stack = this.#stack.map((layer)=>layer.clone()
        );
        return router;
    }
    constructor(opts = {
    }){
        this.#opts = opts;
        this.#methods = opts.methods ?? [
            "DELETE",
            "GET",
            "HEAD",
            "OPTIONS",
            "PATCH",
            "POST",
            "PUT", 
        ];
    }
    all(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "DELETE",
            "GET",
            "POST",
            "PUT"
        ]);
        return this;
    }
    /** Middleware that handles requests for HTTP methods registered with the
   * router.  If none of the routes handle a method, then "not allowed" logic
   * will be used.  If a method is supported by some routes, but not the
   * particular matched router, then "not implemented" will be returned.
   *
   * The middleware will also automatically handle the `OPTIONS` method,
   * responding with a `200 OK` when the `Allowed` header sent to the allowed
   * methods for a given route.
   *
   * By default, a "not allowed" request will respond with a `405 Not Allowed`
   * and a "not implemented" will respond with a `501 Not Implemented`. Setting
   * the option `.throw` to `true` will cause the middleware to throw an
   * `HTTPError` instead of setting the response status.  The error can be
   * overridden by providing a `.notImplemented` or `.notAllowed` method in the
   * options, of which the value will be returned will be thrown instead of the
   * HTTP error. */ allowedMethods(options = {
    }) {
        const implemented = this.#methods;
        const allowedMethods = async (context, next)=>{
            const ctx = context;
            await next();
            if (!ctx.response.status || ctx.response.status === Status.NotFound) {
                assert(ctx.matched);
                const allowed = new Set();
                for (const route of ctx.matched){
                    for (const method of route.methods){
                        allowed.add(method);
                    }
                }
                const allowedStr = [
                    ...allowed
                ].join(", ");
                if (!implemented.includes(ctx.request.method)) {
                    if (options.throw) {
                        throw options.notImplemented ? options.notImplemented() : new httpErrors.NotImplemented();
                    } else {
                        ctx.response.status = Status.NotImplemented;
                        ctx.response.headers.set("Allowed", allowedStr);
                    }
                } else if (allowed.size) {
                    if (ctx.request.method === "OPTIONS") {
                        ctx.response.status = Status.OK;
                        ctx.response.headers.set("Allowed", allowedStr);
                    } else if (!allowed.has(ctx.request.method)) {
                        if (options.throw) {
                            throw options.methodNotAllowed ? options.methodNotAllowed() : new httpErrors.MethodNotAllowed();
                        } else {
                            ctx.response.status = Status.MethodNotAllowed;
                            ctx.response.headers.set("Allowed", allowedStr);
                        }
                    }
                }
            }
        };
        return allowedMethods;
    }
    delete(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "DELETE"
        ]);
        return this;
    }
    /** Iterate over the routes currently added to the router.  To be compatible
   * with the iterable interfaces, both the key and value are set to the value
   * of the route. */ *entries() {
        for (const route of this.#stack){
            const value = route.toJSON();
            yield [
                value,
                value
            ];
        }
    }
    /** Iterate over the routes currently added to the router, calling the
   * `callback` function for each value. */ forEach(callback, // deno-lint-ignore no-explicit-any
    thisArg = null) {
        for (const route of this.#stack){
            const value = route.toJSON();
            callback.call(thisArg, value, value, this);
        }
    }
    get(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "GET"
        ]);
        return this;
    }
    head(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "HEAD"
        ]);
        return this;
    }
    /** Iterate over the routes currently added to the router.  To be compatible
   * with the iterable interfaces, the key is set to the value of the route. */ *keys() {
        for (const route of this.#stack){
            yield route.toJSON();
        }
    }
    options(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "OPTIONS"
        ]);
        return this;
    }
    /** Register param middleware, which will be called when the particular param
   * is parsed from the route. */ param(param, middleware) {
        this.#params[param] = middleware;
        for (const route of this.#stack){
            route.param(param, middleware);
        }
        return this;
    }
    patch(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "PATCH"
        ]);
        return this;
    }
    post(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "POST"
        ]);
        return this;
    }
    /** Set the router prefix for this router. */ prefix(prefix) {
        prefix = prefix.replace(/\/$/, "");
        this.#opts.prefix = prefix;
        for (const route of this.#stack){
            route.setPrefix(prefix);
        }
        return this;
    }
    put(nameOrPath, pathOrMiddleware, ...middleware) {
        this.#useVerb(nameOrPath, pathOrMiddleware, middleware, [
            "PUT"
        ]);
        return this;
    }
    /** Register a direction middleware, where when the `source` path is matched
   * the router will redirect the request to the `destination` path.  A `status`
   * of `302 Found` will be set by default.
   *
   * The `source` and `destination` can be named routes. */ redirect(source, destination, status = Status.Found) {
        if (source[0] !== "/") {
            const s = this.url(source);
            if (!s) {
                throw new RangeError(`Could not resolve named route: "${source}"`);
            }
            source = s;
        }
        if (typeof destination === "string") {
            if (destination[0] !== "/") {
                const d = this.url(destination);
                if (!d) {
                    try {
                        const url = new URL(destination);
                        destination = url;
                    } catch  {
                        throw new RangeError(`Could not resolve named route: "${source}"`);
                    }
                } else {
                    destination = d;
                }
            }
        }
        this.all(source, async (ctx, next)=>{
            await next();
            ctx.response.redirect(destination);
            ctx.response.status = status;
        });
        return this;
    }
    /** Return middleware that will do all the route processing that the router
   * has been configured to handle.  Typical usage would be something like this:
   *
   * ```ts
   * import { Application, Router } from "https://deno.land/x/oak/mod.ts";
   *
   * const app = new Application();
   * const router = new Router();
   *
   * // register routes
   *
   * app.use(router.routes());
   * app.use(router.allowedMethods());
   * await app.listen({ port: 80 });
   * ```
   */ routes() {
        const dispatch = (context, next)=>{
            const ctx = context;
            let pathname;
            let method;
            try {
                const { url: { pathname: p  } , method: m  } = ctx.request;
                pathname = p;
                method = m;
            } catch (e) {
                return Promise.reject(e);
            }
            const path = (this.#opts.routerPath ?? ctx.routerPath) ?? decodeURI(pathname);
            const matches = this.#match(path, method);
            if (ctx.matched) {
                ctx.matched.push(...matches.path);
            } else {
                ctx.matched = [
                    ...matches.path
                ];
            }
            // deno-lint-ignore no-explicit-any
            ctx.router = this;
            if (!matches.route) return next();
            const { pathAndMethod: matchedRoutes  } = matches;
            const chain = matchedRoutes.reduce((prev, route)=>[
                    ...prev,
                    (ctx, next)=>{
                        ctx.captures = route.captures(path);
                        ctx.params = route.params(ctx.captures, ctx.params);
                        ctx.routeName = route.name;
                        return next();
                    },
                    ...route.stack, 
                ]
            , []);
            return compose(chain)(ctx, next);
        };
        dispatch.router = this;
        return dispatch;
    }
    /** Generate a URL pathname for a named route, interpolating the optional
   * params provided.  Also accepts an optional set of options. */ url(name, params, options) {
        const route = this.#route(name);
        if (route) {
            return route.url(params, options);
        }
    }
    use(pathOrMiddleware, ...middleware) {
        let path;
        if (typeof pathOrMiddleware === "string" || Array.isArray(pathOrMiddleware)) {
            path = pathOrMiddleware;
        } else {
            middleware.unshift(pathOrMiddleware);
        }
        this.#register(path ?? "(.*)", middleware, [], {
            end: false,
            ignoreCaptures: !path,
            ignorePrefix: !path
        });
        return this;
    }
    /** Iterate over the routes currently added to the router. */ *values() {
        for (const route of this.#stack){
            yield route.toJSON();
        }
    }
    /** Provide an iterator interface that iterates over the routes registered
   * with the router. */ *[Symbol.iterator]() {
        for (const route of this.#stack){
            yield route.toJSON();
        }
    }
    /** Generate a URL pathname based on the provided path, interpolating the
   * optional params provided.  Also accepts an optional set of options. */ static url(path, params, options) {
        return toUrl(path, params, options);
    }
    [Symbol.for("Deno.customInspect")](inspect) {
        return `${this.constructor.name} ${inspect({
            "#params": this.#params,
            "#stack": this.#stack
        })}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMC4xLjAvcm91dGVyLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQWRhcHRlZCBkaXJlY3RseSBmcm9tIEBrb2Evcm91dGVyIGF0XG4gKiBodHRwczovL2dpdGh1Yi5jb20va29hanMvcm91dGVyLyB3aGljaCBpcyBsaWNlbnNlZCBhczpcbiAqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTUgQWxleGFuZGVyIEMuIE1pbmdvaWFcbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbmltcG9ydCB0eXBlIHsgU3RhdGUgfSBmcm9tIFwiLi9hcHBsaWNhdGlvbi50c1wiO1xuaW1wb3J0IHR5cGUgeyBDb250ZXh0IH0gZnJvbSBcIi4vY29udGV4dC50c1wiO1xuaW1wb3J0IHtcbiAgY29tcGlsZSxcbiAgS2V5LFxuICBQYXJzZU9wdGlvbnMsXG4gIHBhdGhQYXJzZSxcbiAgcGF0aFRvUmVnZXhwLFxuICBTdGF0dXMsXG4gIFRva2Vuc1RvUmVnZXhwT3B0aW9ucyxcbn0gZnJvbSBcIi4vZGVwcy50c1wiO1xuaW1wb3J0IHsgaHR0cEVycm9ycyB9IGZyb20gXCIuL2h0dHBFcnJvci50c1wiO1xuaW1wb3J0IHsgY29tcG9zZSwgTWlkZGxld2FyZSB9IGZyb20gXCIuL21pZGRsZXdhcmUudHNcIjtcbmltcG9ydCB0eXBlIHsgSFRUUE1ldGhvZHMsIFJlZGlyZWN0U3RhdHVzIH0gZnJvbSBcIi4vdHlwZXMuZC50c1wiO1xuaW1wb3J0IHsgYXNzZXJ0LCBkZWNvZGVDb21wb25lbnQgfSBmcm9tIFwiLi91dGlsLnRzXCI7XG5cbmludGVyZmFjZSBNYXRjaGVzPFIgZXh0ZW5kcyBzdHJpbmc+IHtcbiAgcGF0aDogTGF5ZXI8Uj5bXTtcbiAgcGF0aEFuZE1ldGhvZDogTGF5ZXI8Uj5bXTtcbiAgcm91dGU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUm91dGVyQWxsb3dlZE1ldGhvZHNPcHRpb25zIHtcbiAgLyoqIFVzZSB0aGUgdmFsdWUgcmV0dXJuZWQgZnJvbSB0aGlzIGZ1bmN0aW9uIGluc3RlYWQgb2YgYW4gSFRUUCBlcnJvclxuICAgKiBgTWV0aG9kTm90QWxsb3dlZGAuICovXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIG1ldGhvZE5vdEFsbG93ZWQ/KCk6IGFueTtcblxuICAvKiogVXNlIHRoZSB2YWx1ZSByZXR1cm5lZCBmcm9tIHRoaXMgZnVuY3Rpb24gaW5zdGVhZCBvZiBhbiBIVFRQIGVycm9yXG4gICAqIGBOb3RJbXBsZW1lbnRlZGAuICovXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIG5vdEltcGxlbWVudGVkPygpOiBhbnk7XG5cbiAgLyoqIFdoZW4gZGVhbGluZyB3aXRoIGEgbm9uLWltcGxlbWVudGVkIG1ldGhvZCBvciBhIG1ldGhvZCBub3QgYWxsb3dlZCwgdGhyb3dcbiAgICogYW4gZXJyb3IgaW5zdGVhZCBvZiBzZXR0aW5nIHRoZSBzdGF0dXMgYW5kIGhlYWRlciBmb3IgdGhlIHJlc3BvbnNlLiAqL1xuICB0aHJvdz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUm91dGU8XG4gIFIgZXh0ZW5kcyBzdHJpbmcsXG4gIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBTIGV4dGVuZHMgU3RhdGUgPSBSZWNvcmQ8c3RyaW5nLCBhbnk+LFxuPiB7XG4gIC8qKiBUaGUgSFRUUCBtZXRob2RzIHRoYXQgdGhpcyByb3V0ZSBoYW5kbGVzLiAqL1xuICBtZXRob2RzOiBIVFRQTWV0aG9kc1tdO1xuXG4gIC8qKiBUaGUgbWlkZGxld2FyZSB0aGF0IHdpbGwgYmUgYXBwbGllZCB0byB0aGlzIHJvdXRlLiAqL1xuICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W107XG5cbiAgLyoqIEFuIG9wdGlvbmFsIG5hbWUgZm9yIHRoZSByb3V0ZS4gKi9cbiAgbmFtZT86IHN0cmluZztcblxuICAvKiogT3B0aW9ucyB0aGF0IHdlcmUgdXNlZCB0byBjcmVhdGUgdGhlIHJvdXRlLiAqL1xuICBvcHRpb25zOiBMYXllck9wdGlvbnM7XG5cbiAgLyoqIFRoZSBwYXJhbWV0ZXJzIHRoYXQgYXJlIGlkZW50aWZpZWQgaW4gdGhlIHJvdXRlIHRoYXQgd2lsbCBiZSBwYXJzZWQgb3V0XG4gICAqIG9uIG1hdGNoZWQgcmVxdWVzdHMuICovXG4gIHBhcmFtTmFtZXM6IChrZXlvZiBQKVtdO1xuXG4gIC8qKiBUaGUgcGF0aCB0aGF0IHRoaXMgcm91dGUgbWFuYWdlcy4gKi9cbiAgcGF0aDogc3RyaW5nO1xuXG4gIC8qKiBUaGUgcmVndWxhciBleHByZXNzaW9uIHVzZWQgZm9yIG1hdGNoaW5nIGFuZCBwYXJzaW5nIHBhcmFtZXRlcnMgZm9yIHRoZVxuICAgKiByb3V0ZS4gKi9cbiAgcmVnZXhwOiBSZWdFeHA7XG59XG5cbi8qKiBUaGUgY29udGV4dCBwYXNzZWQgcm91dGVyIG1pZGRsZXdhcmUuICAqL1xuZXhwb3J0IGludGVyZmFjZSBSb3V0ZXJDb250ZXh0PFxuICBSIGV4dGVuZHMgc3RyaW5nLFxuICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgUyBleHRlbmRzIFN0YXRlID0gUmVjb3JkPHN0cmluZywgYW55Pixcbj4gZXh0ZW5kcyBDb250ZXh0PFM+IHtcbiAgLyoqIFdoZW4gbWF0Y2hpbmcgdGhlIHJvdXRlLCBhbiBhcnJheSBvZiB0aGUgY2FwdHVyaW5nIGdyb3VwcyBmcm9tIHRoZSByZWd1bGFyXG4gICAqIGV4cHJlc3Npb24uICovXG4gIGNhcHR1cmVzOiBzdHJpbmdbXTtcblxuICAvKiogVGhlIHJvdXRlcyB0aGF0IHdlcmUgbWF0Y2hlZCBmb3IgdGhpcyByZXF1ZXN0LiAqL1xuICBtYXRjaGVkPzogTGF5ZXI8UiwgUCwgUz5bXTtcblxuICAvKiogQW55IHBhcmFtZXRlcnMgcGFyc2VkIGZyb20gdGhlIHJvdXRlIHdoZW4gbWF0Y2hlZC4gKi9cbiAgcGFyYW1zOiBQO1xuXG4gIC8qKiBBIHJlZmVyZW5jZSB0byB0aGUgcm91dGVyIGluc3RhbmNlLiAqL1xuICByb3V0ZXI6IFJvdXRlcjtcblxuICAvKiogSWYgdGhlIG1hdGNoZWQgcm91dGUgaGFzIGEgYG5hbWVgLCB0aGUgbWF0Y2hlZCByb3V0ZSBuYW1lIGlzIHByb3ZpZGVkXG4gICAqIGhlcmUuICovXG4gIHJvdXRlTmFtZT86IHN0cmluZztcblxuICAvKiogT3ZlcnJpZGVzIHRoZSBtYXRjaGVkIHBhdGggZm9yIGZ1dHVyZSByb3V0ZSBtaWRkbGV3YXJlLCB3aGVuIGFcbiAgICogYHJvdXRlclBhdGhgIG9wdGlvbiBpcyBub3QgZGVmaW5lZCBvbiB0aGUgYFJvdXRlcmAgb3B0aW9ucy4gKi9cbiAgcm91dGVyUGF0aD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSb3V0ZXJNaWRkbGV3YXJlPFxuICBSIGV4dGVuZHMgc3RyaW5nLFxuICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgUyBleHRlbmRzIFN0YXRlID0gUmVjb3JkPHN0cmluZywgYW55Pixcbj4ge1xuICAoY29udGV4dDogUm91dGVyQ29udGV4dDxSLCBQLCBTPiwgbmV4dDogKCkgPT4gUHJvbWlzZTx1bmtub3duPik6XG4gICAgfCBQcm9taXNlPHVua25vd24+XG4gICAgfCB1bmtub3duO1xuICAvKiogRm9yIHJvdXRlIHBhcmFtZXRlciBtaWRkbGV3YXJlLCB0aGUgYHBhcmFtYCBrZXkgZm9yIHRoaXMgcGFyYW1ldGVyIHdpbGxcbiAgICogYmUgc2V0LiAqL1xuICBwYXJhbT86IGtleW9mIFA7XG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIHJvdXRlcj86IFJvdXRlcjxhbnk+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJvdXRlck9wdGlvbnMge1xuICAvKiogT3ZlcnJpZGUgdGhlIGRlZmF1bHQgc2V0IG9mIG1ldGhvZHMgc3VwcG9ydGVkIGJ5IHRoZSByb3V0ZXIuICovXG4gIG1ldGhvZHM/OiBIVFRQTWV0aG9kc1tdO1xuXG4gIC8qKiBPbmx5IGhhbmRsZSByb3V0ZXMgd2hlcmUgdGhlIHJlcXVlc3RlZCBwYXRoIHN0YXJ0cyB3aXRoIHRoZSBwcmVmaXguICovXG4gIHByZWZpeD86IHN0cmluZztcblxuICAvKiogT3ZlcnJpZGUgdGhlIGByZXF1ZXN0LnVybC5wYXRobmFtZWAgd2hlbiBtYXRjaGluZyBtaWRkbGV3YXJlIHRvIHJ1bi4gKi9cbiAgcm91dGVyUGF0aD86IHN0cmluZztcblxuICAvKiogRGV0ZXJtaW5lcyBpZiByb3V0ZXMgYXJlIG1hdGNoZWQgaW4gYSBjYXNlIHNlbnNpdGl2ZSB3YXkuICBEZWZhdWx0cyB0b1xuICAgKiBgZmFsc2VgLiAqL1xuICBzZW5zaXRpdmU/OiBib29sZWFuO1xuXG4gIC8qKiBEZXRlcm1pbmVzIGlmIHJvdXRlcyBhcmUgbWF0Y2hlZCBzdHJpY3RseSwgd2hlcmUgdGhlIHRyYWlsaW5nIGAvYCBpcyBub3RcbiAgICogb3B0aW9uYWwuICBEZWZhdWx0cyB0byBgZmFsc2VgLiAqL1xuICBzdHJpY3Q/OiBib29sZWFuO1xufVxuXG4vKiogTWlkZGxld2FyZSB0aGF0IHdpbGwgYmUgY2FsbGVkIGJ5IHRoZSByb3V0ZXIgd2hlbiBoYW5kbGluZyBhIHNwZWNpZmljXG4gKiBwYXJhbWV0ZXIsIHdoaWNoIHRoZSBtaWRkbGV3YXJlIHdpbGwgYmUgY2FsbGVkIHdoZW4gYSByZXF1ZXN0IG1hdGNoZXMgdGhlXG4gKiByb3V0ZSBwYXJhbWV0ZXIuICovXG5leHBvcnQgaW50ZXJmYWNlIFJvdXRlclBhcmFtTWlkZGxld2FyZTxcbiAgUiBleHRlbmRzIHN0cmluZyxcbiAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIFMgZXh0ZW5kcyBTdGF0ZSA9IFJlY29yZDxzdHJpbmcsIGFueT4sXG4+IHtcbiAgKFxuICAgIHBhcmFtOiBzdHJpbmcsXG4gICAgY29udGV4dDogUm91dGVyQ29udGV4dDxSLCBQLCBTPixcbiAgICBuZXh0OiAoKSA9PiBQcm9taXNlPHVua25vd24+LFxuICApOiBQcm9taXNlPHVua25vd24+IHwgdW5rbm93bjtcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgcm91dGVyPzogUm91dGVyPGFueT47XG59XG5cbmludGVyZmFjZSBQYXJhbXNEaWN0aW9uYXJ5IHtcbiAgW2tleTogc3RyaW5nXTogc3RyaW5nO1xufVxuXG50eXBlIFJlbW92ZVRhaWw8UyBleHRlbmRzIHN0cmluZywgVGFpbCBleHRlbmRzIHN0cmluZz4gPSBTIGV4dGVuZHNcbiAgYCR7aW5mZXIgUH0ke1RhaWx9YCA/IFAgOiBTO1xuXG50eXBlIEdldFJvdXRlUGFyYW1zPFMgZXh0ZW5kcyBzdHJpbmc+ID0gUmVtb3ZlVGFpbDxcbiAgUmVtb3ZlVGFpbDxSZW1vdmVUYWlsPFMsIGAvJHtzdHJpbmd9YD4sIGAtJHtzdHJpbmd9YD4sXG4gIGAuJHtzdHJpbmd9YFxuPjtcblxuZXhwb3J0IHR5cGUgUm91dGVQYXJhbXM8Um91dGUgZXh0ZW5kcyBzdHJpbmc+ID0gc3RyaW5nIGV4dGVuZHMgUm91dGVcbiAgPyBQYXJhbXNEaWN0aW9uYXJ5XG4gIDogUm91dGUgZXh0ZW5kcyBgJHtzdHJpbmd9KCR7c3RyaW5nfWAgPyBQYXJhbXNEaWN0aW9uYXJ5XG4gIDogUm91dGUgZXh0ZW5kcyBgJHtzdHJpbmd9OiR7aW5mZXIgUmVzdH1gID8gXG4gICAgJiAoXG4gICAgICBHZXRSb3V0ZVBhcmFtczxSZXN0PiBleHRlbmRzIG5ldmVyID8gUGFyYW1zRGljdGlvbmFyeVxuICAgICAgICA6IEdldFJvdXRlUGFyYW1zPFJlc3Q+IGV4dGVuZHMgYCR7aW5mZXIgUGFyYW1OYW1lfT9gXG4gICAgICAgICAgPyB7IFtQIGluIFBhcmFtTmFtZV0/OiBzdHJpbmcgfVxuICAgICAgICA6IHsgW1AgaW4gR2V0Um91dGVQYXJhbXM8UmVzdD5dOiBzdHJpbmcgfVxuICAgIClcbiAgICAmIChSZXN0IGV4dGVuZHMgYCR7R2V0Um91dGVQYXJhbXM8UmVzdD59JHtpbmZlciBOZXh0fWAgPyBSb3V0ZVBhcmFtczxOZXh0PlxuICAgICAgOiB1bmtub3duKVxuICA6IFJlY29yZDxzdHJpbmcgfCBudW1iZXIsIHN0cmluZyB8IHVuZGVmaW5lZD47XG5cbnR5cGUgTGF5ZXJPcHRpb25zID0gVG9rZW5zVG9SZWdleHBPcHRpb25zICYgUGFyc2VPcHRpb25zICYge1xuICBpZ25vcmVDYXB0dXJlcz86IGJvb2xlYW47XG4gIG5hbWU/OiBzdHJpbmc7XG59O1xuXG50eXBlIFJlZ2lzdGVyT3B0aW9ucyA9IExheWVyT3B0aW9ucyAmIHtcbiAgaWdub3JlUHJlZml4PzogYm9vbGVhbjtcbn07XG5cbnR5cGUgVXJsT3B0aW9ucyA9IFRva2Vuc1RvUmVnZXhwT3B0aW9ucyAmIFBhcnNlT3B0aW9ucyAmIHtcbiAgLyoqIFdoZW4gZ2VuZXJhdGluZyBhIFVSTCBmcm9tIGEgcm91dGUsIGFkZCB0aGUgcXVlcnkgdG8gdGhlIFVSTC4gIElmIGFuXG4gICAqIG9iamVjdCAqL1xuICBxdWVyeT86IFVSTFNlYXJjaFBhcmFtcyB8IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCBzdHJpbmc7XG59O1xuXG4vKiogR2VuZXJhdGUgYSBVUkwgZnJvbSBhIHN0cmluZywgcG90ZW50aWFsbHkgcmVwbGFjZSByb3V0ZSBwYXJhbXMgd2l0aFxuICogdmFsdWVzLiAqL1xuZnVuY3Rpb24gdG9Vcmw8UiBleHRlbmRzIHN0cmluZz4oXG4gIHVybDogc3RyaW5nLFxuICBwYXJhbXMgPSB7fSBhcyBSb3V0ZVBhcmFtczxSPixcbiAgb3B0aW9ucz86IFVybE9wdGlvbnMsXG4pIHtcbiAgY29uc3QgdG9rZW5zID0gcGF0aFBhcnNlKHVybCk7XG4gIGxldCByZXBsYWNlID0ge30gYXMgUm91dGVQYXJhbXM8Uj47XG5cbiAgaWYgKHRva2Vucy5zb21lKCh0b2tlbikgPT4gdHlwZW9mIHRva2VuID09PSBcIm9iamVjdFwiKSkge1xuICAgIHJlcGxhY2UgPSBwYXJhbXM7XG4gIH0gZWxzZSB7XG4gICAgb3B0aW9ucyA9IHBhcmFtcztcbiAgfVxuXG4gIGNvbnN0IHRvUGF0aCA9IGNvbXBpbGUodXJsLCBvcHRpb25zKTtcbiAgY29uc3QgcmVwbGFjZWQgPSB0b1BhdGgocmVwbGFjZSk7XG5cbiAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5xdWVyeSkge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmVwbGFjZWQsIFwiaHR0cDovL29ha1wiKTtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMucXVlcnkgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIHVybC5zZWFyY2ggPSBvcHRpb25zLnF1ZXJ5O1xuICAgIH0gZWxzZSB7XG4gICAgICB1cmwuc2VhcmNoID0gU3RyaW5nKFxuICAgICAgICBvcHRpb25zLnF1ZXJ5IGluc3RhbmNlb2YgVVJMU2VhcmNoUGFyYW1zXG4gICAgICAgICAgPyBvcHRpb25zLnF1ZXJ5XG4gICAgICAgICAgOiBuZXcgVVJMU2VhcmNoUGFyYW1zKG9wdGlvbnMucXVlcnkpLFxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIGAke3VybC5wYXRobmFtZX0ke3VybC5zZWFyY2h9JHt1cmwuaGFzaH1gO1xuICB9XG4gIHJldHVybiByZXBsYWNlZDtcbn1cblxuY2xhc3MgTGF5ZXI8XG4gIFIgZXh0ZW5kcyBzdHJpbmcsXG4gIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBTIGV4dGVuZHMgU3RhdGUgPSBSZWNvcmQ8c3RyaW5nLCBhbnk+LFxuPiB7XG4gICNvcHRzOiBMYXllck9wdGlvbnM7XG4gICNwYXJhbU5hbWVzOiBLZXlbXSA9IFtdO1xuICAjcmVnZXhwOiBSZWdFeHA7XG5cbiAgbWV0aG9kczogSFRUUE1ldGhvZHNbXTtcbiAgbmFtZT86IHN0cmluZztcbiAgcGF0aDogc3RyaW5nO1xuICBzdGFjazogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPltdO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHBhdGg6IHN0cmluZyxcbiAgICBtZXRob2RzOiBIVFRQTWV0aG9kc1tdLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4gfCBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W10sXG4gICAgeyBuYW1lLCAuLi5vcHRzIH06IExheWVyT3B0aW9ucyA9IHt9LFxuICApIHtcbiAgICB0aGlzLiNvcHRzID0gb3B0cztcbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgIHRoaXMubWV0aG9kcyA9IFsuLi5tZXRob2RzXTtcbiAgICBpZiAodGhpcy5tZXRob2RzLmluY2x1ZGVzKFwiR0VUXCIpKSB7XG4gICAgICB0aGlzLm1ldGhvZHMudW5zaGlmdChcIkhFQURcIik7XG4gICAgfVxuICAgIHRoaXMuc3RhY2sgPSBBcnJheS5pc0FycmF5KG1pZGRsZXdhcmUpID8gbWlkZGxld2FyZS5zbGljZSgpIDogW21pZGRsZXdhcmVdO1xuICAgIHRoaXMucGF0aCA9IHBhdGg7XG4gICAgdGhpcy4jcmVnZXhwID0gcGF0aFRvUmVnZXhwKHBhdGgsIHRoaXMuI3BhcmFtTmFtZXMsIHRoaXMuI29wdHMpO1xuICB9XG5cbiAgY2xvbmUoKTogTGF5ZXI8UiwgUCwgUz4ge1xuICAgIHJldHVybiBuZXcgTGF5ZXIoXG4gICAgICB0aGlzLnBhdGgsXG4gICAgICB0aGlzLm1ldGhvZHMsXG4gICAgICB0aGlzLnN0YWNrLFxuICAgICAgeyBuYW1lOiB0aGlzLm5hbWUsIC4uLnRoaXMuI29wdHMgfSxcbiAgICApO1xuICB9XG5cbiAgbWF0Y2gocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuI3JlZ2V4cC50ZXN0KHBhdGgpO1xuICB9XG5cbiAgcGFyYW1zKFxuICAgIGNhcHR1cmVzOiBzdHJpbmdbXSxcbiAgICBleGlzdGluZ1BhcmFtcyA9IHt9IGFzIFJvdXRlUGFyYW1zPFI+LFxuICApOiBSb3V0ZVBhcmFtczxSPiB7XG4gICAgY29uc3QgcGFyYW1zID0gZXhpc3RpbmdQYXJhbXM7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjYXB0dXJlcy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHRoaXMuI3BhcmFtTmFtZXNbaV0pIHtcbiAgICAgICAgY29uc3QgYyA9IGNhcHR1cmVzW2ldO1xuICAgICAgICBwYXJhbXNbdGhpcy4jcGFyYW1OYW1lc1tpXS5uYW1lXSA9IGMgPyBkZWNvZGVDb21wb25lbnQoYykgOiBjO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcGFyYW1zO1xuICB9XG5cbiAgY2FwdHVyZXMocGF0aDogc3RyaW5nKTogc3RyaW5nW10ge1xuICAgIGlmICh0aGlzLiNvcHRzLmlnbm9yZUNhcHR1cmVzKSB7XG4gICAgICByZXR1cm4gW107XG4gICAgfVxuICAgIHJldHVybiBwYXRoLm1hdGNoKHRoaXMuI3JlZ2V4cCk/LnNsaWNlKDEpID8/IFtdO1xuICB9XG5cbiAgdXJsKFxuICAgIHBhcmFtcyA9IHt9IGFzIFJvdXRlUGFyYW1zPFI+LFxuICAgIG9wdGlvbnM/OiBVcmxPcHRpb25zLFxuICApOiBzdHJpbmcge1xuICAgIGNvbnN0IHVybCA9IHRoaXMucGF0aC5yZXBsYWNlKC9cXChcXC5cXCpcXCkvZywgXCJcIik7XG4gICAgcmV0dXJuIHRvVXJsKHVybCwgcGFyYW1zLCBvcHRpb25zKTtcbiAgfVxuXG4gIHBhcmFtKFxuICAgIHBhcmFtOiBzdHJpbmcsXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICBmbjogUm91dGVyUGFyYW1NaWRkbGV3YXJlPGFueSwgYW55LCBhbnk+LFxuICApIHtcbiAgICBjb25zdCBzdGFjayA9IHRoaXMuc3RhY2s7XG4gICAgY29uc3QgcGFyYW1zID0gdGhpcy4jcGFyYW1OYW1lcztcbiAgICBjb25zdCBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFI+ID0gZnVuY3Rpb24gKFxuICAgICAgdGhpczogUm91dGVyLFxuICAgICAgY3R4LFxuICAgICAgbmV4dCxcbiAgICApOiBQcm9taXNlPHVua25vd24+IHwgdW5rbm93biB7XG4gICAgICBjb25zdCBwID0gY3R4LnBhcmFtc1twYXJhbV07XG4gICAgICBhc3NlcnQocCk7XG4gICAgICByZXR1cm4gZm4uY2FsbCh0aGlzLCBwLCBjdHgsIG5leHQpO1xuICAgIH07XG4gICAgbWlkZGxld2FyZS5wYXJhbSA9IHBhcmFtO1xuXG4gICAgY29uc3QgbmFtZXMgPSBwYXJhbXMubWFwKChwKSA9PiBwLm5hbWUpO1xuXG4gICAgY29uc3QgeCA9IG5hbWVzLmluZGV4T2YocGFyYW0pO1xuICAgIGlmICh4ID49IDApIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc3RhY2subGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgZm4gPSBzdGFja1tpXTtcbiAgICAgICAgaWYgKCFmbi5wYXJhbSB8fCBuYW1lcy5pbmRleE9mKGZuLnBhcmFtIGFzIChzdHJpbmcgfCBudW1iZXIpKSA+IHgpIHtcbiAgICAgICAgICBzdGFjay5zcGxpY2UoaSwgMCwgbWlkZGxld2FyZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBzZXRQcmVmaXgocHJlZml4OiBzdHJpbmcpOiB0aGlzIHtcbiAgICBpZiAodGhpcy5wYXRoKSB7XG4gICAgICB0aGlzLnBhdGggPSB0aGlzLnBhdGggIT09IFwiL1wiIHx8IHRoaXMuI29wdHMuc3RyaWN0ID09PSB0cnVlXG4gICAgICAgID8gYCR7cHJlZml4fSR7dGhpcy5wYXRofWBcbiAgICAgICAgOiBwcmVmaXg7XG4gICAgICB0aGlzLiNwYXJhbU5hbWVzID0gW107XG4gICAgICB0aGlzLiNyZWdleHAgPSBwYXRoVG9SZWdleHAodGhpcy5wYXRoLCB0aGlzLiNwYXJhbU5hbWVzLCB0aGlzLiNvcHRzKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICB0b0pTT04oKTogUm91dGU8YW55LCBhbnksIGFueT4ge1xuICAgIHJldHVybiB7XG4gICAgICBtZXRob2RzOiBbLi4udGhpcy5tZXRob2RzXSxcbiAgICAgIG1pZGRsZXdhcmU6IFsuLi50aGlzLnN0YWNrXSxcbiAgICAgIHBhcmFtTmFtZXM6IHRoaXMuI3BhcmFtTmFtZXMubWFwKChrZXkpID0+IGtleS5uYW1lKSxcbiAgICAgIHBhdGg6IHRoaXMucGF0aCxcbiAgICAgIHJlZ2V4cDogdGhpcy4jcmVnZXhwLFxuICAgICAgb3B0aW9uczogeyAuLi50aGlzLiNvcHRzIH0sXG4gICAgfTtcbiAgfVxuXG4gIFtTeW1ib2wuZm9yKFwiRGVuby5jdXN0b21JbnNwZWN0XCIpXShpbnNwZWN0OiAodmFsdWU6IHVua25vd24pID0+IHN0cmluZykge1xuICAgIHJldHVybiBgJHt0aGlzLmNvbnN0cnVjdG9yLm5hbWV9ICR7XG4gICAgICBpbnNwZWN0KHtcbiAgICAgICAgbWV0aG9kczogdGhpcy5tZXRob2RzLFxuICAgICAgICBtaWRkbGV3YXJlOiB0aGlzLnN0YWNrLFxuICAgICAgICBvcHRpb25zOiB0aGlzLiNvcHRzLFxuICAgICAgICBwYXJhbU5hbWVzOiB0aGlzLiNwYXJhbU5hbWVzLm1hcCgoa2V5KSA9PiBrZXkubmFtZSksXG4gICAgICAgIHBhdGg6IHRoaXMucGF0aCxcbiAgICAgICAgcmVnZXhwOiB0aGlzLiNyZWdleHAsXG4gICAgICB9KVxuICAgIH1gO1xuICB9XG59XG5cbi8qKiBBbiBpbnRlcmZhY2UgZm9yIHJlZ2lzdGVyaW5nIG1pZGRsZXdhcmUgdGhhdCB3aWxsIHJ1biB3aGVuIGNlcnRhaW4gSFRUUFxuICogbWV0aG9kcyBhbmQgcGF0aHMgYXJlIHJlcXVlc3RlZCwgYXMgd2VsbCBhcyBwcm92aWRlcyBhIHdheSB0byBwYXJhbWV0ZXJpemVcbiAqIHBhcnRzIG9mIHRoZSByZXF1ZXN0ZWQgcGF0aC4gKi9cbmV4cG9ydCBjbGFzcyBSb3V0ZXI8XG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIFJTIGV4dGVuZHMgU3RhdGUgPSBSZWNvcmQ8c3RyaW5nLCBhbnk+LFxuPiB7XG4gICNvcHRzOiBSb3V0ZXJPcHRpb25zO1xuICAjbWV0aG9kczogSFRUUE1ldGhvZHNbXTtcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgI3BhcmFtczogUmVjb3JkPHN0cmluZywgUm91dGVyUGFyYW1NaWRkbGV3YXJlPGFueSwgYW55LCBhbnk+PiA9IHt9O1xuICAjc3RhY2s6IExheWVyPHN0cmluZz5bXSA9IFtdO1xuXG4gICNtYXRjaChwYXRoOiBzdHJpbmcsIG1ldGhvZDogSFRUUE1ldGhvZHMpOiBNYXRjaGVzPHN0cmluZz4ge1xuICAgIGNvbnN0IG1hdGNoZXM6IE1hdGNoZXM8c3RyaW5nPiA9IHtcbiAgICAgIHBhdGg6IFtdLFxuICAgICAgcGF0aEFuZE1ldGhvZDogW10sXG4gICAgICByb3V0ZTogZmFsc2UsXG4gICAgfTtcblxuICAgIGZvciAoY29uc3Qgcm91dGUgb2YgdGhpcy4jc3RhY2spIHtcbiAgICAgIGlmIChyb3V0ZS5tYXRjaChwYXRoKSkge1xuICAgICAgICBtYXRjaGVzLnBhdGgucHVzaChyb3V0ZSk7XG4gICAgICAgIGlmIChyb3V0ZS5tZXRob2RzLmxlbmd0aCA9PT0gMCB8fCByb3V0ZS5tZXRob2RzLmluY2x1ZGVzKG1ldGhvZCkpIHtcbiAgICAgICAgICBtYXRjaGVzLnBhdGhBbmRNZXRob2QucHVzaChyb3V0ZSk7XG4gICAgICAgICAgaWYgKHJvdXRlLm1ldGhvZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICBtYXRjaGVzLnJvdXRlID0gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbWF0Y2hlcztcbiAgfVxuXG4gICNyZWdpc3RlcihcbiAgICBwYXRoOiBzdHJpbmcgfCBzdHJpbmdbXSxcbiAgICBtaWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+W10sXG4gICAgbWV0aG9kczogSFRUUE1ldGhvZHNbXSxcbiAgICBvcHRpb25zOiBSZWdpc3Rlck9wdGlvbnMgPSB7fSxcbiAgKTogdm9pZCB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocGF0aCkpIHtcbiAgICAgIGZvciAoY29uc3QgcCBvZiBwYXRoKSB7XG4gICAgICAgIHRoaXMuI3JlZ2lzdGVyKHAsIG1pZGRsZXdhcmVzLCBtZXRob2RzLCBvcHRpb25zKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgbGF5ZXJNaWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IG1pZGRsZXdhcmUgb2YgbWlkZGxld2FyZXMpIHtcbiAgICAgIGlmICghbWlkZGxld2FyZS5yb3V0ZXIpIHtcbiAgICAgICAgbGF5ZXJNaWRkbGV3YXJlcy5wdXNoKG1pZGRsZXdhcmUpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGxheWVyTWlkZGxld2FyZXMubGVuZ3RoKSB7XG4gICAgICAgIHRoaXMuI2FkZExheWVyKHBhdGgsIGxheWVyTWlkZGxld2FyZXMsIG1ldGhvZHMsIG9wdGlvbnMpO1xuICAgICAgICBsYXllck1pZGRsZXdhcmVzID0gW107XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJvdXRlciA9IG1pZGRsZXdhcmUucm91dGVyLiNjbG9uZSgpO1xuXG4gICAgICBmb3IgKGNvbnN0IGxheWVyIG9mIHJvdXRlci4jc3RhY2spIHtcbiAgICAgICAgaWYgKCFvcHRpb25zLmlnbm9yZVByZWZpeCkge1xuICAgICAgICAgIGxheWVyLnNldFByZWZpeChwYXRoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy4jb3B0cy5wcmVmaXgpIHtcbiAgICAgICAgICBsYXllci5zZXRQcmVmaXgodGhpcy4jb3B0cy5wcmVmaXgpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuI3N0YWNrLnB1c2gobGF5ZXIpO1xuICAgICAgfVxuXG4gICAgICBmb3IgKGNvbnN0IFtwYXJhbSwgbXddIG9mIE9iamVjdC5lbnRyaWVzKHRoaXMuI3BhcmFtcykpIHtcbiAgICAgICAgcm91dGVyLnBhcmFtKHBhcmFtLCBtdyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGxheWVyTWlkZGxld2FyZXMubGVuZ3RoKSB7XG4gICAgICB0aGlzLiNhZGRMYXllcihwYXRoLCBsYXllck1pZGRsZXdhcmVzLCBtZXRob2RzLCBvcHRpb25zKTtcbiAgICB9XG4gIH1cblxuICAjYWRkTGF5ZXIoXG4gICAgcGF0aDogc3RyaW5nLFxuICAgIG1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz5bXSxcbiAgICBtZXRob2RzOiBIVFRQTWV0aG9kc1tdLFxuICAgIG9wdGlvbnM6IExheWVyT3B0aW9ucyA9IHt9LFxuICApIHtcbiAgICBjb25zdCB7XG4gICAgICBlbmQsXG4gICAgICBuYW1lLFxuICAgICAgc2Vuc2l0aXZlID0gdGhpcy4jb3B0cy5zZW5zaXRpdmUsXG4gICAgICBzdHJpY3QgPSB0aGlzLiNvcHRzLnN0cmljdCxcbiAgICAgIGlnbm9yZUNhcHR1cmVzLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIGNvbnN0IHJvdXRlID0gbmV3IExheWVyKHBhdGgsIG1ldGhvZHMsIG1pZGRsZXdhcmVzLCB7XG4gICAgICBlbmQsXG4gICAgICBuYW1lLFxuICAgICAgc2Vuc2l0aXZlLFxuICAgICAgc3RyaWN0LFxuICAgICAgaWdub3JlQ2FwdHVyZXMsXG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy4jb3B0cy5wcmVmaXgpIHtcbiAgICAgIHJvdXRlLnNldFByZWZpeCh0aGlzLiNvcHRzLnByZWZpeCk7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBbcGFyYW0sIG13XSBvZiBPYmplY3QuZW50cmllcyh0aGlzLiNwYXJhbXMpKSB7XG4gICAgICByb3V0ZS5wYXJhbShwYXJhbSwgbXcpO1xuICAgIH1cblxuICAgIHRoaXMuI3N0YWNrLnB1c2gocm91dGUpO1xuICB9XG5cbiAgI3JvdXRlKG5hbWU6IHN0cmluZyk6IExheWVyPHN0cmluZz4gfCB1bmRlZmluZWQge1xuICAgIGZvciAoY29uc3Qgcm91dGUgb2YgdGhpcy4jc3RhY2spIHtcbiAgICAgIGlmIChyb3V0ZS5uYW1lID09PSBuYW1lKSB7XG4gICAgICAgIHJldHVybiByb3V0ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAjdXNlVmVyYihcbiAgICBuYW1lT3JQYXRoOiBzdHJpbmcsXG4gICAgcGF0aE9yTWlkZGxld2FyZTogc3RyaW5nIHwgUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+LFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nPltdLFxuICAgIG1ldGhvZHM6IEhUVFBNZXRob2RzW10sXG4gICk6IHZvaWQge1xuICAgIGxldCBuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gICAgbGV0IHBhdGg6IHN0cmluZztcbiAgICBpZiAodHlwZW9mIHBhdGhPck1pZGRsZXdhcmUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIG5hbWUgPSBuYW1lT3JQYXRoO1xuICAgICAgcGF0aCA9IHBhdGhPck1pZGRsZXdhcmU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhdGggPSBuYW1lT3JQYXRoO1xuICAgICAgbWlkZGxld2FyZS51bnNoaWZ0KHBhdGhPck1pZGRsZXdhcmUpO1xuICAgIH1cblxuICAgIHRoaXMuI3JlZ2lzdGVyKHBhdGgsIG1pZGRsZXdhcmUsIG1ldGhvZHMsIHsgbmFtZSB9KTtcbiAgfVxuXG4gICNjbG9uZSgpOiBSb3V0ZXI8UlM+IHtcbiAgICBjb25zdCByb3V0ZXIgPSBuZXcgUm91dGVyPFJTPih0aGlzLiNvcHRzKTtcbiAgICByb3V0ZXIuI21ldGhvZHMgPSByb3V0ZXIuI21ldGhvZHMuc2xpY2UoKTtcbiAgICByb3V0ZXIuI3BhcmFtcyA9IHsgLi4udGhpcy4jcGFyYW1zIH07XG4gICAgcm91dGVyLiNzdGFjayA9IHRoaXMuI3N0YWNrLm1hcCgobGF5ZXIpID0+IGxheWVyLmNsb25lKCkpO1xuICAgIHJldHVybiByb3V0ZXI7XG4gIH1cblxuICBjb25zdHJ1Y3RvcihvcHRzOiBSb3V0ZXJPcHRpb25zID0ge30pIHtcbiAgICB0aGlzLiNvcHRzID0gb3B0cztcbiAgICB0aGlzLiNtZXRob2RzID0gb3B0cy5tZXRob2RzID8/IFtcbiAgICAgIFwiREVMRVRFXCIsXG4gICAgICBcIkdFVFwiLFxuICAgICAgXCJIRUFEXCIsXG4gICAgICBcIk9QVElPTlNcIixcbiAgICAgIFwiUEFUQ0hcIixcbiAgICAgIFwiUE9TVFwiLFxuICAgICAgXCJQVVRcIixcbiAgICBdO1xuICB9XG5cbiAgLyoqIFJlZ2lzdGVyIG5hbWVkIG1pZGRsZXdhcmUgZm9yIHRoZSBzcGVjaWZpZWQgcm91dGVzIHdoZW4gdGhlIGBERUxFVEVgLFxuICAgKiBgR0VUYCwgYFBPU1RgLCBvciBgUFVUYCBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBhbGw8XG4gICAgUiBleHRlbmRzIHN0cmluZyxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgREVMRVRFYCxcbiAgICogYEdFVGAsIGBQT1NUYCwgb3IgYFBVVGAgbWV0aG9kIGlzIHJlcXVlc3RlZC4gKi9cbiAgYWxsPFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIGFsbDxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPiA9IFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZU9yUGF0aDogc3RyaW5nLFxuICAgIHBhdGhPck1pZGRsZXdhcmU6IHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPiB7XG4gICAgdGhpcy4jdXNlVmVyYihcbiAgICAgIG5hbWVPclBhdGgsXG4gICAgICBwYXRoT3JNaWRkbGV3YXJlIGFzIChzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz4pLFxuICAgICAgbWlkZGxld2FyZSBhcyBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz5bXSxcbiAgICAgIFtcIkRFTEVURVwiLCBcIkdFVFwiLCBcIlBPU1RcIiwgXCJQVVRcIl0sXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKiBNaWRkbGV3YXJlIHRoYXQgaGFuZGxlcyByZXF1ZXN0cyBmb3IgSFRUUCBtZXRob2RzIHJlZ2lzdGVyZWQgd2l0aCB0aGVcbiAgICogcm91dGVyLiAgSWYgbm9uZSBvZiB0aGUgcm91dGVzIGhhbmRsZSBhIG1ldGhvZCwgdGhlbiBcIm5vdCBhbGxvd2VkXCIgbG9naWNcbiAgICogd2lsbCBiZSB1c2VkLiAgSWYgYSBtZXRob2QgaXMgc3VwcG9ydGVkIGJ5IHNvbWUgcm91dGVzLCBidXQgbm90IHRoZVxuICAgKiBwYXJ0aWN1bGFyIG1hdGNoZWQgcm91dGVyLCB0aGVuIFwibm90IGltcGxlbWVudGVkXCIgd2lsbCBiZSByZXR1cm5lZC5cbiAgICpcbiAgICogVGhlIG1pZGRsZXdhcmUgd2lsbCBhbHNvIGF1dG9tYXRpY2FsbHkgaGFuZGxlIHRoZSBgT1BUSU9OU2AgbWV0aG9kLFxuICAgKiByZXNwb25kaW5nIHdpdGggYSBgMjAwIE9LYCB3aGVuIHRoZSBgQWxsb3dlZGAgaGVhZGVyIHNlbnQgdG8gdGhlIGFsbG93ZWRcbiAgICogbWV0aG9kcyBmb3IgYSBnaXZlbiByb3V0ZS5cbiAgICpcbiAgICogQnkgZGVmYXVsdCwgYSBcIm5vdCBhbGxvd2VkXCIgcmVxdWVzdCB3aWxsIHJlc3BvbmQgd2l0aCBhIGA0MDUgTm90IEFsbG93ZWRgXG4gICAqIGFuZCBhIFwibm90IGltcGxlbWVudGVkXCIgd2lsbCByZXNwb25kIHdpdGggYSBgNTAxIE5vdCBJbXBsZW1lbnRlZGAuIFNldHRpbmdcbiAgICogdGhlIG9wdGlvbiBgLnRocm93YCB0byBgdHJ1ZWAgd2lsbCBjYXVzZSB0aGUgbWlkZGxld2FyZSB0byB0aHJvdyBhblxuICAgKiBgSFRUUEVycm9yYCBpbnN0ZWFkIG9mIHNldHRpbmcgdGhlIHJlc3BvbnNlIHN0YXR1cy4gIFRoZSBlcnJvciBjYW4gYmVcbiAgICogb3ZlcnJpZGRlbiBieSBwcm92aWRpbmcgYSBgLm5vdEltcGxlbWVudGVkYCBvciBgLm5vdEFsbG93ZWRgIG1ldGhvZCBpbiB0aGVcbiAgICogb3B0aW9ucywgb2Ygd2hpY2ggdGhlIHZhbHVlIHdpbGwgYmUgcmV0dXJuZWQgd2lsbCBiZSB0aHJvd24gaW5zdGVhZCBvZiB0aGVcbiAgICogSFRUUCBlcnJvci4gKi9cbiAgYWxsb3dlZE1ldGhvZHMoXG4gICAgb3B0aW9uczogUm91dGVyQWxsb3dlZE1ldGhvZHNPcHRpb25zID0ge30sXG4gICk6IE1pZGRsZXdhcmUge1xuICAgIGNvbnN0IGltcGxlbWVudGVkID0gdGhpcy4jbWV0aG9kcztcblxuICAgIGNvbnN0IGFsbG93ZWRNZXRob2RzOiBNaWRkbGV3YXJlID0gYXN5bmMgKGNvbnRleHQsIG5leHQpID0+IHtcbiAgICAgIGNvbnN0IGN0eCA9IGNvbnRleHQgYXMgUm91dGVyQ29udGV4dDxzdHJpbmc+O1xuICAgICAgYXdhaXQgbmV4dCgpO1xuICAgICAgaWYgKCFjdHgucmVzcG9uc2Uuc3RhdHVzIHx8IGN0eC5yZXNwb25zZS5zdGF0dXMgPT09IFN0YXR1cy5Ob3RGb3VuZCkge1xuICAgICAgICBhc3NlcnQoY3R4Lm1hdGNoZWQpO1xuICAgICAgICBjb25zdCBhbGxvd2VkID0gbmV3IFNldDxIVFRQTWV0aG9kcz4oKTtcbiAgICAgICAgZm9yIChjb25zdCByb3V0ZSBvZiBjdHgubWF0Y2hlZCkge1xuICAgICAgICAgIGZvciAoY29uc3QgbWV0aG9kIG9mIHJvdXRlLm1ldGhvZHMpIHtcbiAgICAgICAgICAgIGFsbG93ZWQuYWRkKG1ldGhvZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYWxsb3dlZFN0ciA9IFsuLi5hbGxvd2VkXS5qb2luKFwiLCBcIik7XG4gICAgICAgIGlmICghaW1wbGVtZW50ZWQuaW5jbHVkZXMoY3R4LnJlcXVlc3QubWV0aG9kKSkge1xuICAgICAgICAgIGlmIChvcHRpb25zLnRocm93KSB7XG4gICAgICAgICAgICB0aHJvdyBvcHRpb25zLm5vdEltcGxlbWVudGVkXG4gICAgICAgICAgICAgID8gb3B0aW9ucy5ub3RJbXBsZW1lbnRlZCgpXG4gICAgICAgICAgICAgIDogbmV3IGh0dHBFcnJvcnMuTm90SW1wbGVtZW50ZWQoKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY3R4LnJlc3BvbnNlLnN0YXR1cyA9IFN0YXR1cy5Ob3RJbXBsZW1lbnRlZDtcbiAgICAgICAgICAgIGN0eC5yZXNwb25zZS5oZWFkZXJzLnNldChcIkFsbG93ZWRcIiwgYWxsb3dlZFN0cik7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGFsbG93ZWQuc2l6ZSkge1xuICAgICAgICAgIGlmIChjdHgucmVxdWVzdC5tZXRob2QgPT09IFwiT1BUSU9OU1wiKSB7XG4gICAgICAgICAgICBjdHgucmVzcG9uc2Uuc3RhdHVzID0gU3RhdHVzLk9LO1xuICAgICAgICAgICAgY3R4LnJlc3BvbnNlLmhlYWRlcnMuc2V0KFwiQWxsb3dlZFwiLCBhbGxvd2VkU3RyKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKCFhbGxvd2VkLmhhcyhjdHgucmVxdWVzdC5tZXRob2QpKSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy50aHJvdykge1xuICAgICAgICAgICAgICB0aHJvdyBvcHRpb25zLm1ldGhvZE5vdEFsbG93ZWRcbiAgICAgICAgICAgICAgICA/IG9wdGlvbnMubWV0aG9kTm90QWxsb3dlZCgpXG4gICAgICAgICAgICAgICAgOiBuZXcgaHR0cEVycm9ycy5NZXRob2ROb3RBbGxvd2VkKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjdHgucmVzcG9uc2Uuc3RhdHVzID0gU3RhdHVzLk1ldGhvZE5vdEFsbG93ZWQ7XG4gICAgICAgICAgICAgIGN0eC5yZXNwb25zZS5oZWFkZXJzLnNldChcIkFsbG93ZWRcIiwgYWxsb3dlZFN0cik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBhbGxvd2VkTWV0aG9kcztcbiAgfVxuXG4gIC8qKiBSZWdpc3RlciBuYW1lZCBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgREVMRVRFYCxcbiAgICogIG1ldGhvZCBpcyByZXF1ZXN0ZWQuICovXG4gIGRlbGV0ZTxcbiAgICBSIGV4dGVuZHMgc3RyaW5nLFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBwYXRoOiBSLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgLyoqIFJlZ2lzdGVyIG1pZGRsZXdhcmUgZm9yIHRoZSBzcGVjaWZpZWQgcm91dGVzIHdoZW4gdGhlIGBERUxFVEVgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBkZWxldGU8XG4gICAgUiBleHRlbmRzIHN0cmluZyxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBwYXRoOiBSLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgZGVsZXRlPFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxzdHJpbmc+ID0gUm91dGVQYXJhbXM8c3RyaW5nPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lT3JQYXRoOiBzdHJpbmcsXG4gICAgcGF0aE9yTWlkZGxld2FyZTogc3RyaW5nIHwgUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+IHtcbiAgICB0aGlzLiN1c2VWZXJiKFxuICAgICAgbmFtZU9yUGF0aCxcbiAgICAgIHBhdGhPck1pZGRsZXdhcmUgYXMgKHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nPiksXG4gICAgICBtaWRkbGV3YXJlIGFzIFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nPltdLFxuICAgICAgW1wiREVMRVRFXCJdLFxuICAgICk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKiogSXRlcmF0ZSBvdmVyIHRoZSByb3V0ZXMgY3VycmVudGx5IGFkZGVkIHRvIHRoZSByb3V0ZXIuICBUbyBiZSBjb21wYXRpYmxlXG4gICAqIHdpdGggdGhlIGl0ZXJhYmxlIGludGVyZmFjZXMsIGJvdGggdGhlIGtleSBhbmQgdmFsdWUgYXJlIHNldCB0byB0aGUgdmFsdWVcbiAgICogb2YgdGhlIHJvdXRlLiAqL1xuICAqZW50cmllcygpOiBJdGVyYWJsZUl0ZXJhdG9yPFtSb3V0ZTxzdHJpbmc+LCBSb3V0ZTxzdHJpbmc+XT4ge1xuICAgIGZvciAoY29uc3Qgcm91dGUgb2YgdGhpcy4jc3RhY2spIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gcm91dGUudG9KU09OKCk7XG4gICAgICB5aWVsZCBbdmFsdWUsIHZhbHVlXTtcbiAgICB9XG4gIH1cblxuICAvKiogSXRlcmF0ZSBvdmVyIHRoZSByb3V0ZXMgY3VycmVudGx5IGFkZGVkIHRvIHRoZSByb3V0ZXIsIGNhbGxpbmcgdGhlXG4gICAqIGBjYWxsYmFja2AgZnVuY3Rpb24gZm9yIGVhY2ggdmFsdWUuICovXG4gIGZvckVhY2goXG4gICAgY2FsbGJhY2s6IChcbiAgICAgIHZhbHVlMTogUm91dGU8c3RyaW5nPixcbiAgICAgIHZhbHVlMjogUm91dGU8c3RyaW5nPixcbiAgICAgIHJvdXRlcjogdGhpcyxcbiAgICApID0+IHZvaWQsXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICB0aGlzQXJnOiBhbnkgPSBudWxsLFxuICApOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMuI3N0YWNrKSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IHJvdXRlLnRvSlNPTigpO1xuICAgICAgY2FsbGJhY2suY2FsbCh0aGlzQXJnLCB2YWx1ZSwgdmFsdWUsIHRoaXMpO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBSZWdpc3RlciBuYW1lZCBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgR0VUYCxcbiAgICogIG1ldGhvZCBpcyByZXF1ZXN0ZWQuICovXG4gIGdldDxcbiAgICBSIGV4dGVuZHMgc3RyaW5nLFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBwYXRoOiBSLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgLyoqIFJlZ2lzdGVyIG1pZGRsZXdhcmUgZm9yIHRoZSBzcGVjaWZpZWQgcm91dGVzIHdoZW4gdGhlIGBHRVRgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBnZXQ8XG4gICAgUiBleHRlbmRzIHN0cmluZyxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBwYXRoOiBSLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgZ2V0PFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxzdHJpbmc+ID0gUm91dGVQYXJhbXM8c3RyaW5nPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lT3JQYXRoOiBzdHJpbmcsXG4gICAgcGF0aE9yTWlkZGxld2FyZTogc3RyaW5nIHwgUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+IHtcbiAgICB0aGlzLiN1c2VWZXJiKFxuICAgICAgbmFtZU9yUGF0aCxcbiAgICAgIHBhdGhPck1pZGRsZXdhcmUgYXMgKHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nPiksXG4gICAgICBtaWRkbGV3YXJlIGFzIFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nPltdLFxuICAgICAgW1wiR0VUXCJdLFxuICAgICk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKiogUmVnaXN0ZXIgbmFtZWQgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYEhFQURgLFxuICAgKiAgbWV0aG9kIGlzIHJlcXVlc3RlZC4gKi9cbiAgaGVhZDxcbiAgICBSIGV4dGVuZHMgc3RyaW5nLFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICBwYXRoOiBSLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZXM6IFJvdXRlck1pZGRsZXdhcmU8UiwgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPjtcbiAgLyoqIFJlZ2lzdGVyIG1pZGRsZXdhcmUgZm9yIHRoZSBzcGVjaWZpZWQgcm91dGVzIHdoZW4gdGhlIGBIRUFEYCxcbiAgICogbWV0aG9kIGlzIHJlcXVlc3RlZC4gKi9cbiAgaGVhZDxcbiAgICBSIGV4dGVuZHMgc3RyaW5nLFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIHBhdGg6IFIsXG4gICAgbWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICBoZWFkPFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxzdHJpbmc+ID0gUm91dGVQYXJhbXM8c3RyaW5nPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lT3JQYXRoOiBzdHJpbmcsXG4gICAgcGF0aE9yTWlkZGxld2FyZTogc3RyaW5nIHwgUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+IHtcbiAgICB0aGlzLiN1c2VWZXJiKFxuICAgICAgbmFtZU9yUGF0aCxcbiAgICAgIHBhdGhPck1pZGRsZXdhcmUgYXMgKHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nPiksXG4gICAgICBtaWRkbGV3YXJlIGFzIFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nPltdLFxuICAgICAgW1wiSEVBRFwiXSxcbiAgICApO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqIEl0ZXJhdGUgb3ZlciB0aGUgcm91dGVzIGN1cnJlbnRseSBhZGRlZCB0byB0aGUgcm91dGVyLiAgVG8gYmUgY29tcGF0aWJsZVxuICAgKiB3aXRoIHRoZSBpdGVyYWJsZSBpbnRlcmZhY2VzLCB0aGUga2V5IGlzIHNldCB0byB0aGUgdmFsdWUgb2YgdGhlIHJvdXRlLiAqL1xuICAqa2V5cygpOiBJdGVyYWJsZUl0ZXJhdG9yPFJvdXRlPHN0cmluZz4+IHtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMuI3N0YWNrKSB7XG4gICAgICB5aWVsZCByb3V0ZS50b0pTT04oKTtcbiAgICB9XG4gIH1cblxuICAvKiogUmVnaXN0ZXIgbmFtZWQgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYE9QVElPTlNgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBvcHRpb25zPFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIHBhdGg6IFIsXG4gICAgbWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICAvKiogUmVnaXN0ZXIgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYE9QVElPTlNgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBvcHRpb25zPFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIG9wdGlvbnM8XG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPHN0cmluZz4gPSBSb3V0ZVBhcmFtczxzdHJpbmc+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIG5hbWVPclBhdGg6IHN0cmluZyxcbiAgICBwYXRoT3JNaWRkbGV3YXJlOiBzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT4ge1xuICAgIHRoaXMuI3VzZVZlcmIoXG4gICAgICBuYW1lT3JQYXRoLFxuICAgICAgcGF0aE9yTWlkZGxld2FyZSBhcyAoc3RyaW5nIHwgUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+KSxcbiAgICAgIG1pZGRsZXdhcmUgYXMgUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+W10sXG4gICAgICBbXCJPUFRJT05TXCJdLFxuICAgICk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKiogUmVnaXN0ZXIgcGFyYW0gbWlkZGxld2FyZSwgd2hpY2ggd2lsbCBiZSBjYWxsZWQgd2hlbiB0aGUgcGFydGljdWxhciBwYXJhbVxuICAgKiBpcyBwYXJzZWQgZnJvbSB0aGUgcm91dGUuICovXG4gIHBhcmFtPFIgZXh0ZW5kcyBzdHJpbmcsIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTPihcbiAgICBwYXJhbToga2V5b2YgUm91dGVQYXJhbXM8Uj4sXG4gICAgbWlkZGxld2FyZTogUm91dGVyUGFyYW1NaWRkbGV3YXJlPFIsIFJvdXRlUGFyYW1zPFI+LCBTPixcbiAgKTogUm91dGVyPFM+IHtcbiAgICB0aGlzLiNwYXJhbXNbcGFyYW0gYXMgc3RyaW5nXSA9IG1pZGRsZXdhcmU7XG4gICAgZm9yIChjb25zdCByb3V0ZSBvZiB0aGlzLiNzdGFjaykge1xuICAgICAgcm91dGUucGFyYW0ocGFyYW0gYXMgc3RyaW5nLCBtaWRkbGV3YXJlKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKiogUmVnaXN0ZXIgbmFtZWQgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYFBBVENIYCxcbiAgICogbWV0aG9kIGlzIHJlcXVlc3RlZC4gKi9cbiAgcGF0Y2g8XG4gICAgUiBleHRlbmRzIHN0cmluZyxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4gPSBSb3V0ZVBhcmFtczxSPixcbiAgICBTIGV4dGVuZHMgU3RhdGUgPSBSUyxcbiAgPihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIGZvciB0aGUgc3BlY2lmaWVkIHJvdXRlcyB3aGVuIHRoZSBgUEFUQ0hgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBwYXRjaDxcbiAgICBSIGV4dGVuZHMgc3RyaW5nLFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIHBhdGg6IFIsXG4gICAgbWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICBwYXRjaDxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPiA9IFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZU9yUGF0aDogc3RyaW5nLFxuICAgIHBhdGhPck1pZGRsZXdhcmU6IHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPiB7XG4gICAgdGhpcy4jdXNlVmVyYihcbiAgICAgIG5hbWVPclBhdGgsXG4gICAgICBwYXRoT3JNaWRkbGV3YXJlIGFzIChzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz4pLFxuICAgICAgbWlkZGxld2FyZSBhcyBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz5bXSxcbiAgICAgIFtcIlBBVENIXCJdLFxuICAgICk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKiogUmVnaXN0ZXIgbmFtZWQgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYFBPU1RgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBwb3N0PFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIHBhdGg6IFIsXG4gICAgbWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICAvKiogUmVnaXN0ZXIgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYFBPU1RgLFxuICAgKiBtZXRob2QgaXMgcmVxdWVzdGVkLiAqL1xuICBwb3N0PFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIHBvc3Q8XG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPHN0cmluZz4gPSBSb3V0ZVBhcmFtczxzdHJpbmc+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIG5hbWVPclBhdGg6IHN0cmluZyxcbiAgICBwYXRoT3JNaWRkbGV3YXJlOiBzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT4ge1xuICAgIHRoaXMuI3VzZVZlcmIoXG4gICAgICBuYW1lT3JQYXRoLFxuICAgICAgcGF0aE9yTWlkZGxld2FyZSBhcyAoc3RyaW5nIHwgUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+KSxcbiAgICAgIG1pZGRsZXdhcmUgYXMgUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+W10sXG4gICAgICBbXCJQT1NUXCJdLFxuICAgICk7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKiogU2V0IHRoZSByb3V0ZXIgcHJlZml4IGZvciB0aGlzIHJvdXRlci4gKi9cbiAgcHJlZml4KHByZWZpeDogc3RyaW5nKTogdGhpcyB7XG4gICAgcHJlZml4ID0gcHJlZml4LnJlcGxhY2UoL1xcLyQvLCBcIlwiKTtcbiAgICB0aGlzLiNvcHRzLnByZWZpeCA9IHByZWZpeDtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMuI3N0YWNrKSB7XG4gICAgICByb3V0ZS5zZXRQcmVmaXgocHJlZml4KTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKiogUmVnaXN0ZXIgbmFtZWQgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYFBVVGBcbiAgICogbWV0aG9kIGlzIHJlcXVlc3RlZC4gKi9cbiAgcHV0PFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIHBhdGg6IFIsXG4gICAgbWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICAvKiogUmVnaXN0ZXIgbWlkZGxld2FyZSBmb3IgdGhlIHNwZWNpZmllZCByb3V0ZXMgd2hlbiB0aGUgYFBVVGBcbiAgICogbWV0aG9kIGlzIHJlcXVlc3RlZC4gKi9cbiAgcHV0PFxuICAgIFIgZXh0ZW5kcyBzdHJpbmcsXG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPFI+ID0gUm91dGVQYXJhbXM8Uj4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgcGF0aDogUixcbiAgICBtaWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+LFxuICAgIC4uLm1pZGRsZXdhcmVzOiBSb3V0ZXJNaWRkbGV3YXJlPFIsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIHB1dDxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPiA9IFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgbmFtZU9yUGF0aDogc3RyaW5nLFxuICAgIHBhdGhPck1pZGRsZXdhcmU6IHN0cmluZyB8IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlOiBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz5bXVxuICApOiBSb3V0ZXI8UyBleHRlbmRzIFJTID8gUyA6IChTICYgUlMpPiB7XG4gICAgdGhpcy4jdXNlVmVyYihcbiAgICAgIG5hbWVPclBhdGgsXG4gICAgICBwYXRoT3JNaWRkbGV3YXJlIGFzIChzdHJpbmcgfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz4pLFxuICAgICAgbWlkZGxld2FyZSBhcyBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZz5bXSxcbiAgICAgIFtcIlBVVFwiXSxcbiAgICApO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqIFJlZ2lzdGVyIGEgZGlyZWN0aW9uIG1pZGRsZXdhcmUsIHdoZXJlIHdoZW4gdGhlIGBzb3VyY2VgIHBhdGggaXMgbWF0Y2hlZFxuICAgKiB0aGUgcm91dGVyIHdpbGwgcmVkaXJlY3QgdGhlIHJlcXVlc3QgdG8gdGhlIGBkZXN0aW5hdGlvbmAgcGF0aC4gIEEgYHN0YXR1c2BcbiAgICogb2YgYDMwMiBGb3VuZGAgd2lsbCBiZSBzZXQgYnkgZGVmYXVsdC5cbiAgICpcbiAgICogVGhlIGBzb3VyY2VgIGFuZCBgZGVzdGluYXRpb25gIGNhbiBiZSBuYW1lZCByb3V0ZXMuICovXG4gIHJlZGlyZWN0KFxuICAgIHNvdXJjZTogc3RyaW5nLFxuICAgIGRlc3RpbmF0aW9uOiBzdHJpbmcgfCBVUkwsXG4gICAgc3RhdHVzOiBSZWRpcmVjdFN0YXR1cyA9IFN0YXR1cy5Gb3VuZCxcbiAgKTogdGhpcyB7XG4gICAgaWYgKHNvdXJjZVswXSAhPT0gXCIvXCIpIHtcbiAgICAgIGNvbnN0IHMgPSB0aGlzLnVybChzb3VyY2UpO1xuICAgICAgaWYgKCFzKSB7XG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKGBDb3VsZCBub3QgcmVzb2x2ZSBuYW1lZCByb3V0ZTogXCIke3NvdXJjZX1cImApO1xuICAgICAgfVxuICAgICAgc291cmNlID0gcztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBkZXN0aW5hdGlvbiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgaWYgKGRlc3RpbmF0aW9uWzBdICE9PSBcIi9cIikge1xuICAgICAgICBjb25zdCBkID0gdGhpcy51cmwoZGVzdGluYXRpb24pO1xuICAgICAgICBpZiAoIWQpIHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgdXJsID0gbmV3IFVSTChkZXN0aW5hdGlvbik7XG4gICAgICAgICAgICBkZXN0aW5hdGlvbiA9IHVybDtcbiAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKGBDb3VsZCBub3QgcmVzb2x2ZSBuYW1lZCByb3V0ZTogXCIke3NvdXJjZX1cImApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkZXN0aW5hdGlvbiA9IGQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLmFsbChzb3VyY2UsIGFzeW5jIChjdHgsIG5leHQpID0+IHtcbiAgICAgIGF3YWl0IG5leHQoKTtcbiAgICAgIGN0eC5yZXNwb25zZS5yZWRpcmVjdChkZXN0aW5hdGlvbik7XG4gICAgICBjdHgucmVzcG9uc2Uuc3RhdHVzID0gc3RhdHVzO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqIFJldHVybiBtaWRkbGV3YXJlIHRoYXQgd2lsbCBkbyBhbGwgdGhlIHJvdXRlIHByb2Nlc3NpbmcgdGhhdCB0aGUgcm91dGVyXG4gICAqIGhhcyBiZWVuIGNvbmZpZ3VyZWQgdG8gaGFuZGxlLiAgVHlwaWNhbCB1c2FnZSB3b3VsZCBiZSBzb21ldGhpbmcgbGlrZSB0aGlzOlxuICAgKlxuICAgKiBgYGB0c1xuICAgKiBpbXBvcnQgeyBBcHBsaWNhdGlvbiwgUm91dGVyIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrL21vZC50c1wiO1xuICAgKlxuICAgKiBjb25zdCBhcHAgPSBuZXcgQXBwbGljYXRpb24oKTtcbiAgICogY29uc3Qgcm91dGVyID0gbmV3IFJvdXRlcigpO1xuICAgKlxuICAgKiAvLyByZWdpc3RlciByb3V0ZXNcbiAgICpcbiAgICogYXBwLnVzZShyb3V0ZXIucm91dGVzKCkpO1xuICAgKiBhcHAudXNlKHJvdXRlci5hbGxvd2VkTWV0aG9kcygpKTtcbiAgICogYXdhaXQgYXBwLmxpc3Rlbih7IHBvcnQ6IDgwIH0pO1xuICAgKiBgYGBcbiAgICovXG4gIHJvdXRlcygpOiBNaWRkbGV3YXJlIHtcbiAgICBjb25zdCBkaXNwYXRjaCA9IChcbiAgICAgIGNvbnRleHQ6IENvbnRleHQsXG4gICAgICBuZXh0OiAoKSA9PiBQcm9taXNlPHVua25vd24+LFxuICAgICk6IFByb21pc2U8dW5rbm93bj4gPT4ge1xuICAgICAgY29uc3QgY3R4ID0gY29udGV4dCBhcyBSb3V0ZXJDb250ZXh0PHN0cmluZz47XG4gICAgICBsZXQgcGF0aG5hbWU6IHN0cmluZztcbiAgICAgIGxldCBtZXRob2Q6IEhUVFBNZXRob2RzO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyB1cmw6IHsgcGF0aG5hbWU6IHAgfSwgbWV0aG9kOiBtIH0gPSBjdHgucmVxdWVzdDtcbiAgICAgICAgcGF0aG5hbWUgPSBwO1xuICAgICAgICBtZXRob2QgPSBtO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZSk7XG4gICAgICB9XG4gICAgICBjb25zdCBwYXRoID0gdGhpcy4jb3B0cy5yb3V0ZXJQYXRoID8/IGN0eC5yb3V0ZXJQYXRoID8/XG4gICAgICAgIGRlY29kZVVSSShwYXRobmFtZSk7XG4gICAgICBjb25zdCBtYXRjaGVzID0gdGhpcy4jbWF0Y2gocGF0aCwgbWV0aG9kKTtcblxuICAgICAgaWYgKGN0eC5tYXRjaGVkKSB7XG4gICAgICAgIGN0eC5tYXRjaGVkLnB1c2goLi4ubWF0Y2hlcy5wYXRoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGN0eC5tYXRjaGVkID0gWy4uLm1hdGNoZXMucGF0aF07XG4gICAgICB9XG5cbiAgICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgICBjdHgucm91dGVyID0gdGhpcyBhcyBSb3V0ZXI8YW55PjtcblxuICAgICAgaWYgKCFtYXRjaGVzLnJvdXRlKSByZXR1cm4gbmV4dCgpO1xuXG4gICAgICBjb25zdCB7IHBhdGhBbmRNZXRob2Q6IG1hdGNoZWRSb3V0ZXMgfSA9IG1hdGNoZXM7XG5cbiAgICAgIGNvbnN0IGNoYWluID0gbWF0Y2hlZFJvdXRlcy5yZWR1Y2UoXG4gICAgICAgIChwcmV2LCByb3V0ZSkgPT4gW1xuICAgICAgICAgIC4uLnByZXYsXG4gICAgICAgICAgKGN0eCwgbmV4dCkgPT4ge1xuICAgICAgICAgICAgY3R4LmNhcHR1cmVzID0gcm91dGUuY2FwdHVyZXMocGF0aCk7XG4gICAgICAgICAgICBjdHgucGFyYW1zID0gcm91dGUucGFyYW1zKGN0eC5jYXB0dXJlcywgY3R4LnBhcmFtcyk7XG4gICAgICAgICAgICBjdHgucm91dGVOYW1lID0gcm91dGUubmFtZTtcbiAgICAgICAgICAgIHJldHVybiBuZXh0KCk7XG4gICAgICAgICAgfSxcbiAgICAgICAgICAuLi5yb3V0ZS5zdGFjayxcbiAgICAgICAgXSxcbiAgICAgICAgW10gYXMgUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+W10sXG4gICAgICApO1xuICAgICAgcmV0dXJuIGNvbXBvc2UoY2hhaW4pKGN0eCwgbmV4dCk7XG4gICAgfTtcbiAgICBkaXNwYXRjaC5yb3V0ZXIgPSB0aGlzO1xuICAgIHJldHVybiBkaXNwYXRjaDtcbiAgfVxuXG4gIC8qKiBHZW5lcmF0ZSBhIFVSTCBwYXRobmFtZSBmb3IgYSBuYW1lZCByb3V0ZSwgaW50ZXJwb2xhdGluZyB0aGUgb3B0aW9uYWxcbiAgICogcGFyYW1zIHByb3ZpZGVkLiAgQWxzbyBhY2NlcHRzIGFuIG9wdGlvbmFsIHNldCBvZiBvcHRpb25zLiAqL1xuICB1cmw8UCBleHRlbmRzIFJvdXRlUGFyYW1zPHN0cmluZz4gPSBSb3V0ZVBhcmFtczxzdHJpbmc+PihcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgcGFyYW1zPzogUCxcbiAgICBvcHRpb25zPzogVXJsT3B0aW9ucyxcbiAgKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcbiAgICBjb25zdCByb3V0ZSA9IHRoaXMuI3JvdXRlKG5hbWUpO1xuXG4gICAgaWYgKHJvdXRlKSB7XG4gICAgICByZXR1cm4gcm91dGUudXJsKHBhcmFtcywgb3B0aW9ucyk7XG4gICAgfVxuICB9XG5cbiAgLyoqIFJlZ2lzdGVyIG1pZGRsZXdhcmUgdG8gYmUgdXNlZCBvbiBldmVyeSBtYXRjaGVkIHJvdXRlLiAqL1xuICB1c2U8XG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPHN0cmluZz4gPSBSb3V0ZVBhcmFtczxzdHJpbmc+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIC8qKiBSZWdpc3RlciBtaWRkbGV3YXJlIHRvIGJlIHVzZWQgb24gZXZlcnkgcm91dGUgdGhhdCBtYXRjaGVzIHRoZSBzdXBwbGllZFxuICAgKiBgcGF0aGAuICovXG4gIHVzZTxcbiAgICBSIGV4dGVuZHMgc3RyaW5nLFxuICAgIFAgZXh0ZW5kcyBSb3V0ZVBhcmFtczxSPiA9IFJvdXRlUGFyYW1zPFI+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIHBhdGg6IFIsXG4gICAgbWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxSLCBQLCBTPltdXG4gICk6IFJvdXRlcjxTIGV4dGVuZHMgUlMgPyBTIDogKFMgJiBSUyk+O1xuICB1c2U8XG4gICAgUCBleHRlbmRzIFJvdXRlUGFyYW1zPHN0cmluZz4gPSBSb3V0ZVBhcmFtczxzdHJpbmc+LFxuICAgIFMgZXh0ZW5kcyBTdGF0ZSA9IFJTLFxuICA+KFxuICAgIHBhdGg6IHN0cmluZ1tdLFxuICAgIG1pZGRsZXdhcmU6IFJvdXRlck1pZGRsZXdhcmU8c3RyaW5nLCBQLCBTPixcbiAgICAuLi5taWRkbGV3YXJlczogUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT47XG4gIHVzZTxcbiAgICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8c3RyaW5nPiA9IFJvdXRlUGFyYW1zPHN0cmluZz4sXG4gICAgUyBleHRlbmRzIFN0YXRlID0gUlMsXG4gID4oXG4gICAgcGF0aE9yTWlkZGxld2FyZTogc3RyaW5nIHwgc3RyaW5nW10gfCBSb3V0ZXJNaWRkbGV3YXJlPHN0cmluZywgUCwgUz4sXG4gICAgLi4ubWlkZGxld2FyZTogUm91dGVyTWlkZGxld2FyZTxzdHJpbmcsIFAsIFM+W11cbiAgKTogUm91dGVyPFMgZXh0ZW5kcyBSUyA/IFMgOiAoUyAmIFJTKT4ge1xuICAgIGxldCBwYXRoOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcbiAgICBpZiAoXG4gICAgICB0eXBlb2YgcGF0aE9yTWlkZGxld2FyZSA9PT0gXCJzdHJpbmdcIiB8fCBBcnJheS5pc0FycmF5KHBhdGhPck1pZGRsZXdhcmUpXG4gICAgKSB7XG4gICAgICBwYXRoID0gcGF0aE9yTWlkZGxld2FyZTtcbiAgICB9IGVsc2Uge1xuICAgICAgbWlkZGxld2FyZS51bnNoaWZ0KHBhdGhPck1pZGRsZXdhcmUpO1xuICAgIH1cblxuICAgIHRoaXMuI3JlZ2lzdGVyKFxuICAgICAgcGF0aCA/PyBcIiguKilcIixcbiAgICAgIG1pZGRsZXdhcmUgYXMgUm91dGVyTWlkZGxld2FyZTxzdHJpbmc+W10sXG4gICAgICBbXSxcbiAgICAgIHsgZW5kOiBmYWxzZSwgaWdub3JlQ2FwdHVyZXM6ICFwYXRoLCBpZ25vcmVQcmVmaXg6ICFwYXRoIH0sXG4gICAgKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqIEl0ZXJhdGUgb3ZlciB0aGUgcm91dGVzIGN1cnJlbnRseSBhZGRlZCB0byB0aGUgcm91dGVyLiAqL1xuICAqdmFsdWVzKCk6IEl0ZXJhYmxlSXRlcmF0b3I8Um91dGU8c3RyaW5nLCBSb3V0ZVBhcmFtczxzdHJpbmc+LCBSUz4+IHtcbiAgICBmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMuI3N0YWNrKSB7XG4gICAgICB5aWVsZCByb3V0ZS50b0pTT04oKTtcbiAgICB9XG4gIH1cblxuICAvKiogUHJvdmlkZSBhbiBpdGVyYXRvciBpbnRlcmZhY2UgdGhhdCBpdGVyYXRlcyBvdmVyIHRoZSByb3V0ZXMgcmVnaXN0ZXJlZFxuICAgKiB3aXRoIHRoZSByb3V0ZXIuICovXG4gICpbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFxuICAgIFJvdXRlPHN0cmluZywgUm91dGVQYXJhbXM8c3RyaW5nPiwgUlM+XG4gID4ge1xuICAgIGZvciAoY29uc3Qgcm91dGUgb2YgdGhpcy4jc3RhY2spIHtcbiAgICAgIHlpZWxkIHJvdXRlLnRvSlNPTigpO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBHZW5lcmF0ZSBhIFVSTCBwYXRobmFtZSBiYXNlZCBvbiB0aGUgcHJvdmlkZWQgcGF0aCwgaW50ZXJwb2xhdGluZyB0aGVcbiAgICogb3B0aW9uYWwgcGFyYW1zIHByb3ZpZGVkLiAgQWxzbyBhY2NlcHRzIGFuIG9wdGlvbmFsIHNldCBvZiBvcHRpb25zLiAqL1xuICBzdGF0aWMgdXJsPFIgZXh0ZW5kcyBzdHJpbmc+KFxuICAgIHBhdGg6IFIsXG4gICAgcGFyYW1zPzogUm91dGVQYXJhbXM8Uj4sXG4gICAgb3B0aW9ucz86IFVybE9wdGlvbnMsXG4gICk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRvVXJsKHBhdGgsIHBhcmFtcywgb3B0aW9ucyk7XG4gIH1cblxuICBbU3ltYm9sLmZvcihcIkRlbm8uY3VzdG9tSW5zcGVjdFwiKV0oaW5zcGVjdDogKHZhbHVlOiB1bmtub3duKSA9PiBzdHJpbmcpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfSAke1xuICAgICAgaW5zcGVjdCh7IFwiI3BhcmFtc1wiOiB0aGlzLiNwYXJhbXMsIFwiI3N0YWNrXCI6IHRoaXMuI3N0YWNrIH0pXG4gICAgfWA7XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUE2QkEsTUFBTSxHQUNKLE9BQU8sRUFHUCxTQUFTLEVBQ1QsWUFBWSxFQUNaLE1BQU0sUUFFRCxDQUFXO0FBQ2xCLE1BQU0sR0FB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