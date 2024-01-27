// Copyright 2018-2021 the oak authors. All rights reserved. MIT license.
import { contentType, Status, STATUS_TEXT } from "./deps.ts";
import { DomResponse } from "./http_server_native.ts";
import { BODY_TYPES, encodeUrl, isAsyncIterable, isHtml, isReader, isRedirectStatus, readableStreamFromAsyncIterable, readableStreamFromReader, Uint8ArrayTransformStream } from "./util.ts";
/** A symbol that indicates to `response.redirect()` to attempt to redirect
 * back to the request referrer.  For example:
 *
 * ```ts
 * import { Application, REDIRECT_BACK } from "https://deno.land/x/oak/mod.ts";
 *
 * const app = new Application();
 *
 * app.use((ctx) => {
 *   if (ctx.request.url.pathName === "/back") {
 *     ctx.response.redirect(REDIRECT_BACK, "/");
 *   }
 * });
 *
 * await app.listen({ port: 80 });
 * ```
 */ export const REDIRECT_BACK = Symbol("redirect backwards");
export async function convertBodyToBodyInit(body, type) {
    let result;
    if (BODY_TYPES.includes(typeof body)) {
        result = String(body);
        type = type ?? (isHtml(result) ? "html" : "text/plain");
    } else if (isReader(body)) {
        result = readableStreamFromReader(body);
    } else if (ArrayBuffer.isView(body) || body instanceof ArrayBuffer || body instanceof Blob || body instanceof URLSearchParams) {
        result = body;
    } else if (body instanceof ReadableStream) {
        result = body.pipeThrough(new Uint8ArrayTransformStream());
    } else if (body instanceof FormData) {
        result = body;
        type = "multipart/form-data";
    } else if (isAsyncIterable(body)) {
        result = readableStreamFromAsyncIterable(body);
    } else if (body && typeof body === "object") {
        result = JSON.stringify(body);
        type = type ?? "json";
    } else if (typeof body === "function") {
        const result = body.call(null);
        return convertBodyToBodyInit(await result, type);
    } else if (body) {
        throw new TypeError("Response body was set but could not be converted.");
    }
    return [
        result,
        type
    ];
}
/** An interface to control what response will be sent when the middleware
 * finishes processing the request. */ export class Response {
    #body;
    #bodySet = false;
    #domResponse;
    #headers = new Headers();
    #request;
    #resources = [];
    #status;
    #type;
    #writable = true;
    async #getBodyInit() {
        const [body, type] = await convertBodyToBodyInit(this.body, this.type);
        this.type = type;
        return body;
    }
     #setContentType() {
        if (this.type) {
            const contentTypeString = contentType(this.type);
            if (contentTypeString && !this.headers.has("Content-Type")) {
                this.headers.append("Content-Type", contentTypeString);
            }
        }
    }
    /** The body of the response.  The body will be automatically processed when
   * the response is being sent and converted to a `Uint8Array` or a
   * `Deno.Reader`.
   *
   * Automatic conversion to a `Deno.Reader` occurs for async iterables. */ get body() {
        return this.#body;
    }
    /** The body of the response.  The body will be automatically processed when
   * the response is being sent and converted to a `Uint8Array` or a
   * `Deno.Reader`.
   *
   * Automatic conversion to a `Deno.Reader` occurs for async iterables. */ set body(value) {
        if (!this.#writable) {
            throw new Error("The response is not writable.");
        }
        this.#bodySet = true;
        this.#body = value;
    }
    /** Headers that will be returned in the response. */ get headers() {
        return this.#headers;
    }
    /** Headers that will be returned in the response. */ set headers(value) {
        if (!this.#writable) {
            throw new Error("The response is not writable.");
        }
        this.#headers = value;
    }
    /** The HTTP status of the response.  If this has not been explicitly set,
   * reading the value will return what would be the value of status if the
   * response were sent at this point in processing the middleware.  If the body
   * has been set, the status will be `200 OK`.  If a value for the body has
   * not been set yet, the status will be `404 Not Found`. */ get status() {
        if (this.#status) {
            return this.#status;
        }
        return this.body != null ? Status.OK : this.#bodySet ? Status.NoContent : Status.NotFound;
    }
    /** The HTTP status of the response.  If this has not been explicitly set,
   * reading the value will return what would be the value of status if the
   * response were sent at this point in processing the middleware.  If the body
   * has been set, the status will be `200 OK`.  If a value for the body has
   * not been set yet, the status will be `404 Not Found`. */ set status(value) {
        if (!this.#writable) {
            throw new Error("The response is not writable.");
        }
        this.#status = value;
    }
    /** The media type, or extension of the response.  Setting this value will
   * ensure an appropriate `Content-Type` header is added to the response. */ get type() {
        return this.#type;
    }
    /** The media type, or extension of the response.  Setting this value will
   * ensure an appropriate `Content-Type` header is added to the response. */ set type(value) {
        if (!this.#writable) {
            throw new Error("The response is not writable.");
        }
        this.#type = value;
    }
    /** A read-only property which determines if the response is writable or not.
   * Once the response has been processed, this value is set to `false`. */ get writable() {
        return this.#writable;
    }
    constructor(request){
        this.#request = request;
    }
    /** Add a resource to the list of resources that will be closed when the
   * request is destroyed. */ addResource(rid) {
        this.#resources.push(rid);
    }
    /** Release any resources that are being tracked by the response.
   *
   * @param closeResources close any resource IDs registered with the response
   */ destroy(closeResources = true) {
        this.#writable = false;
        this.#body = undefined;
        this.#domResponse = undefined;
        if (closeResources) {
            for (const rid of this.#resources){
                try {
                    Deno.close(rid);
                } catch  {
                // we don't care about errors here
                }
            }
        }
    }
    redirect(url, alt = "/") {
        if (url === REDIRECT_BACK) {
            url = this.#request.headers.get("Referer") ?? String(alt);
        } else if (typeof url === "object") {
            url = String(url);
        }
        this.headers.set("Location", encodeUrl(url));
        if (!this.status || !isRedirectStatus(this.status)) {
            this.status = Status.Found;
        }
        if (this.#request.accepts("html")) {
            url = encodeURI(url);
            this.type = "text/html; charset=utf-8";
            this.body = `Redirecting to <a href="${url}">${url}</a>.`;
            return;
        }
        this.type = "text/plain; charset=utf-8";
        this.body = `Redirecting to ${url}.`;
    }
    async toDomResponse() {
        if (this.#domResponse) {
            return this.#domResponse;
        }
        const bodyInit = await this.#getBodyInit();
        this.#setContentType();
        const { headers  } = this;
        // If there is no body and no content type and no set length, then set the
        // content length to 0
        if (!(bodyInit || headers.has("Content-Type") || headers.has("Content-Length"))) {
            headers.append("Content-Length", "0");
        }
        this.#writable = false;
        const status = this.status;
        const responseInit = {
            headers,
            status,
            statusText: STATUS_TEXT.get(status)
        };
        return this.#domResponse = new DomResponse(bodyInit, responseInit);
    }
    [Symbol.for("Deno.customInspect")](inspect) {
        const { body , headers , status , type , writable  } = this;
        return `Response ${inspect({
            body,
            headers,
            status,
            type,
            writable
        })}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMC4xLjAvcmVzcG9uc2UudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMSB0aGUgb2FrIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG5pbXBvcnQgeyBjb250ZW50VHlwZSwgU3RhdHVzLCBTVEFUVVNfVEVYVCB9IGZyb20gXCIuL2RlcHMudHNcIjtcbmltcG9ydCB7IERvbVJlc3BvbnNlIH0gZnJvbSBcIi4vaHR0cF9zZXJ2ZXJfbmF0aXZlLnRzXCI7XG5pbXBvcnQgdHlwZSB7IFJlcXVlc3QgfSBmcm9tIFwiLi9yZXF1ZXN0LnRzXCI7XG5pbXBvcnQge1xuICBCT0RZX1RZUEVTLFxuICBlbmNvZGVVcmwsXG4gIGlzQXN5bmNJdGVyYWJsZSxcbiAgaXNIdG1sLFxuICBpc1JlYWRlcixcbiAgaXNSZWRpcmVjdFN0YXR1cyxcbiAgcmVhZGFibGVTdHJlYW1Gcm9tQXN5bmNJdGVyYWJsZSxcbiAgcmVhZGFibGVTdHJlYW1Gcm9tUmVhZGVyLFxuICBVaW50OEFycmF5VHJhbnNmb3JtU3RyZWFtLFxufSBmcm9tIFwiLi91dGlsLnRzXCI7XG5cbnR5cGUgQm9keSA9XG4gIHwgc3RyaW5nXG4gIHwgbnVtYmVyXG4gIHwgYmlnaW50XG4gIHwgYm9vbGVhblxuICB8IHN5bWJvbFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIGJhbi10eXBlc1xuICB8IG9iamVjdFxuICB8IHVuZGVmaW5lZFxuICB8IG51bGw7XG50eXBlIEJvZHlGdW5jdGlvbiA9ICgpID0+IEJvZHkgfCBQcm9taXNlPEJvZHk+O1xuXG4vKiogQSBzeW1ib2wgdGhhdCBpbmRpY2F0ZXMgdG8gYHJlc3BvbnNlLnJlZGlyZWN0KClgIHRvIGF0dGVtcHQgdG8gcmVkaXJlY3RcbiAqIGJhY2sgdG8gdGhlIHJlcXVlc3QgcmVmZXJyZXIuICBGb3IgZXhhbXBsZTpcbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgQXBwbGljYXRpb24sIFJFRElSRUNUX0JBQ0sgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQveC9vYWsvbW9kLnRzXCI7XG4gKlxuICogY29uc3QgYXBwID0gbmV3IEFwcGxpY2F0aW9uKCk7XG4gKlxuICogYXBwLnVzZSgoY3R4KSA9PiB7XG4gKiAgIGlmIChjdHgucmVxdWVzdC51cmwucGF0aE5hbWUgPT09IFwiL2JhY2tcIikge1xuICogICAgIGN0eC5yZXNwb25zZS5yZWRpcmVjdChSRURJUkVDVF9CQUNLLCBcIi9cIik7XG4gKiAgIH1cbiAqIH0pO1xuICpcbiAqIGF3YWl0IGFwcC5saXN0ZW4oeyBwb3J0OiA4MCB9KTtcbiAqIGBgYFxuICovXG5leHBvcnQgY29uc3QgUkVESVJFQ1RfQkFDSyA9IFN5bWJvbChcInJlZGlyZWN0IGJhY2t3YXJkc1wiKTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbnZlcnRCb2R5VG9Cb2R5SW5pdChcbiAgYm9keTogQm9keSB8IEJvZHlGdW5jdGlvbixcbiAgdHlwZT86IHN0cmluZyxcbik6IFByb21pc2U8W2dsb2JhbFRoaXMuQm9keUluaXQgfCB1bmRlZmluZWQsIHN0cmluZyB8IHVuZGVmaW5lZF0+IHtcbiAgbGV0IHJlc3VsdDogZ2xvYmFsVGhpcy5Cb2R5SW5pdCB8IHVuZGVmaW5lZDtcbiAgaWYgKEJPRFlfVFlQRVMuaW5jbHVkZXModHlwZW9mIGJvZHkpKSB7XG4gICAgcmVzdWx0ID0gU3RyaW5nKGJvZHkpO1xuICAgIHR5cGUgPSB0eXBlID8/IChpc0h0bWwocmVzdWx0KSA/IFwiaHRtbFwiIDogXCJ0ZXh0L3BsYWluXCIpO1xuICB9IGVsc2UgaWYgKGlzUmVhZGVyKGJvZHkpKSB7XG4gICAgcmVzdWx0ID0gcmVhZGFibGVTdHJlYW1Gcm9tUmVhZGVyKGJvZHkpO1xuICB9IGVsc2UgaWYgKFxuICAgIEFycmF5QnVmZmVyLmlzVmlldyhib2R5KSB8fCBib2R5IGluc3RhbmNlb2YgQXJyYXlCdWZmZXIgfHxcbiAgICBib2R5IGluc3RhbmNlb2YgQmxvYiB8fCBib2R5IGluc3RhbmNlb2YgVVJMU2VhcmNoUGFyYW1zXG4gICkge1xuICAgIHJlc3VsdCA9IGJvZHk7XG4gIH0gZWxzZSBpZiAoYm9keSBpbnN0YW5jZW9mIFJlYWRhYmxlU3RyZWFtKSB7XG4gICAgcmVzdWx0ID0gYm9keS5waXBlVGhyb3VnaChuZXcgVWludDhBcnJheVRyYW5zZm9ybVN0cmVhbSgpKTtcbiAgfSBlbHNlIGlmIChib2R5IGluc3RhbmNlb2YgRm9ybURhdGEpIHtcbiAgICByZXN1bHQgPSBib2R5O1xuICAgIHR5cGUgPSBcIm11bHRpcGFydC9mb3JtLWRhdGFcIjtcbiAgfSBlbHNlIGlmIChpc0FzeW5jSXRlcmFibGUoYm9keSkpIHtcbiAgICByZXN1bHQgPSByZWFkYWJsZVN0cmVhbUZyb21Bc3luY0l0ZXJhYmxlKGJvZHkpO1xuICB9IGVsc2UgaWYgKGJvZHkgJiYgdHlwZW9mIGJvZHkgPT09IFwib2JqZWN0XCIpIHtcbiAgICByZXN1bHQgPSBKU09OLnN0cmluZ2lmeShib2R5KTtcbiAgICB0eXBlID0gdHlwZSA/PyBcImpzb25cIjtcbiAgfSBlbHNlIGlmICh0eXBlb2YgYm9keSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYm9keS5jYWxsKG51bGwpO1xuICAgIHJldHVybiBjb252ZXJ0Qm9keVRvQm9keUluaXQoYXdhaXQgcmVzdWx0LCB0eXBlKTtcbiAgfSBlbHNlIGlmIChib2R5KSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlJlc3BvbnNlIGJvZHkgd2FzIHNldCBidXQgY291bGQgbm90IGJlIGNvbnZlcnRlZC5cIik7XG4gIH1cbiAgcmV0dXJuIFtyZXN1bHQsIHR5cGVdO1xufVxuXG4vKiogQW4gaW50ZXJmYWNlIHRvIGNvbnRyb2wgd2hhdCByZXNwb25zZSB3aWxsIGJlIHNlbnQgd2hlbiB0aGUgbWlkZGxld2FyZVxuICogZmluaXNoZXMgcHJvY2Vzc2luZyB0aGUgcmVxdWVzdC4gKi9cbmV4cG9ydCBjbGFzcyBSZXNwb25zZSB7XG4gICNib2R5PzogQm9keSB8IEJvZHlGdW5jdGlvbjtcbiAgI2JvZHlTZXQgPSBmYWxzZTtcbiAgI2RvbVJlc3BvbnNlPzogZ2xvYmFsVGhpcy5SZXNwb25zZTtcbiAgI2hlYWRlcnMgPSBuZXcgSGVhZGVycygpO1xuICAjcmVxdWVzdDogUmVxdWVzdDtcbiAgI3Jlc291cmNlczogbnVtYmVyW10gPSBbXTtcbiAgI3N0YXR1cz86IFN0YXR1cztcbiAgI3R5cGU/OiBzdHJpbmc7XG4gICN3cml0YWJsZSA9IHRydWU7XG5cbiAgYXN5bmMgI2dldEJvZHlJbml0KCk6IFByb21pc2U8Z2xvYmFsVGhpcy5Cb2R5SW5pdCB8IHVuZGVmaW5lZD4ge1xuICAgIGNvbnN0IFtib2R5LCB0eXBlXSA9IGF3YWl0IGNvbnZlcnRCb2R5VG9Cb2R5SW5pdCh0aGlzLmJvZHksIHRoaXMudHlwZSk7XG4gICAgdGhpcy50eXBlID0gdHlwZTtcbiAgICByZXR1cm4gYm9keTtcbiAgfVxuXG4gICNzZXRDb250ZW50VHlwZSgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy50eXBlKSB7XG4gICAgICBjb25zdCBjb250ZW50VHlwZVN0cmluZyA9IGNvbnRlbnRUeXBlKHRoaXMudHlwZSk7XG4gICAgICBpZiAoY29udGVudFR5cGVTdHJpbmcgJiYgIXRoaXMuaGVhZGVycy5oYXMoXCJDb250ZW50LVR5cGVcIikpIHtcbiAgICAgICAgdGhpcy5oZWFkZXJzLmFwcGVuZChcIkNvbnRlbnQtVHlwZVwiLCBjb250ZW50VHlwZVN0cmluZyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqIFRoZSBib2R5IG9mIHRoZSByZXNwb25zZS4gIFRoZSBib2R5IHdpbGwgYmUgYXV0b21hdGljYWxseSBwcm9jZXNzZWQgd2hlblxuICAgKiB0aGUgcmVzcG9uc2UgaXMgYmVpbmcgc2VudCBhbmQgY29udmVydGVkIHRvIGEgYFVpbnQ4QXJyYXlgIG9yIGFcbiAgICogYERlbm8uUmVhZGVyYC5cbiAgICpcbiAgICogQXV0b21hdGljIGNvbnZlcnNpb24gdG8gYSBgRGVuby5SZWFkZXJgIG9jY3VycyBmb3IgYXN5bmMgaXRlcmFibGVzLiAqL1xuICBnZXQgYm9keSgpOiBCb2R5IHwgQm9keUZ1bmN0aW9uIHtcbiAgICByZXR1cm4gdGhpcy4jYm9keTtcbiAgfVxuXG4gIC8qKiBUaGUgYm9keSBvZiB0aGUgcmVzcG9uc2UuICBUaGUgYm9keSB3aWxsIGJlIGF1dG9tYXRpY2FsbHkgcHJvY2Vzc2VkIHdoZW5cbiAgICogdGhlIHJlc3BvbnNlIGlzIGJlaW5nIHNlbnQgYW5kIGNvbnZlcnRlZCB0byBhIGBVaW50OEFycmF5YCBvciBhXG4gICAqIGBEZW5vLlJlYWRlcmAuXG4gICAqXG4gICAqIEF1dG9tYXRpYyBjb252ZXJzaW9uIHRvIGEgYERlbm8uUmVhZGVyYCBvY2N1cnMgZm9yIGFzeW5jIGl0ZXJhYmxlcy4gKi9cbiAgc2V0IGJvZHkodmFsdWU6IEJvZHkgfCBCb2R5RnVuY3Rpb24pIHtcbiAgICBpZiAoIXRoaXMuI3dyaXRhYmxlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgcmVzcG9uc2UgaXMgbm90IHdyaXRhYmxlLlwiKTtcbiAgICB9XG4gICAgdGhpcy4jYm9keVNldCA9IHRydWU7XG4gICAgdGhpcy4jYm9keSA9IHZhbHVlO1xuICB9XG5cbiAgLyoqIEhlYWRlcnMgdGhhdCB3aWxsIGJlIHJldHVybmVkIGluIHRoZSByZXNwb25zZS4gKi9cbiAgZ2V0IGhlYWRlcnMoKTogSGVhZGVycyB7XG4gICAgcmV0dXJuIHRoaXMuI2hlYWRlcnM7XG4gIH1cblxuICAvKiogSGVhZGVycyB0aGF0IHdpbGwgYmUgcmV0dXJuZWQgaW4gdGhlIHJlc3BvbnNlLiAqL1xuICBzZXQgaGVhZGVycyh2YWx1ZTogSGVhZGVycykge1xuICAgIGlmICghdGhpcy4jd3JpdGFibGUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSByZXNwb25zZSBpcyBub3Qgd3JpdGFibGUuXCIpO1xuICAgIH1cbiAgICB0aGlzLiNoZWFkZXJzID0gdmFsdWU7XG4gIH1cblxuICAvKiogVGhlIEhUVFAgc3RhdHVzIG9mIHRoZSByZXNwb25zZS4gIElmIHRoaXMgaGFzIG5vdCBiZWVuIGV4cGxpY2l0bHkgc2V0LFxuICAgKiByZWFkaW5nIHRoZSB2YWx1ZSB3aWxsIHJldHVybiB3aGF0IHdvdWxkIGJlIHRoZSB2YWx1ZSBvZiBzdGF0dXMgaWYgdGhlXG4gICAqIHJlc3BvbnNlIHdlcmUgc2VudCBhdCB0aGlzIHBvaW50IGluIHByb2Nlc3NpbmcgdGhlIG1pZGRsZXdhcmUuICBJZiB0aGUgYm9keVxuICAgKiBoYXMgYmVlbiBzZXQsIHRoZSBzdGF0dXMgd2lsbCBiZSBgMjAwIE9LYC4gIElmIGEgdmFsdWUgZm9yIHRoZSBib2R5IGhhc1xuICAgKiBub3QgYmVlbiBzZXQgeWV0LCB0aGUgc3RhdHVzIHdpbGwgYmUgYDQwNCBOb3QgRm91bmRgLiAqL1xuICBnZXQgc3RhdHVzKCk6IFN0YXR1cyB7XG4gICAgaWYgKHRoaXMuI3N0YXR1cykge1xuICAgICAgcmV0dXJuIHRoaXMuI3N0YXR1cztcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYm9keSAhPSBudWxsXG4gICAgICA/IFN0YXR1cy5PS1xuICAgICAgOiB0aGlzLiNib2R5U2V0XG4gICAgICA/IFN0YXR1cy5Ob0NvbnRlbnRcbiAgICAgIDogU3RhdHVzLk5vdEZvdW5kO1xuICB9XG5cbiAgLyoqIFRoZSBIVFRQIHN0YXR1cyBvZiB0aGUgcmVzcG9uc2UuICBJZiB0aGlzIGhhcyBub3QgYmVlbiBleHBsaWNpdGx5IHNldCxcbiAgICogcmVhZGluZyB0aGUgdmFsdWUgd2lsbCByZXR1cm4gd2hhdCB3b3VsZCBiZSB0aGUgdmFsdWUgb2Ygc3RhdHVzIGlmIHRoZVxuICAgKiByZXNwb25zZSB3ZXJlIHNlbnQgYXQgdGhpcyBwb2ludCBpbiBwcm9jZXNzaW5nIHRoZSBtaWRkbGV3YXJlLiAgSWYgdGhlIGJvZHlcbiAgICogaGFzIGJlZW4gc2V0LCB0aGUgc3RhdHVzIHdpbGwgYmUgYDIwMCBPS2AuICBJZiBhIHZhbHVlIGZvciB0aGUgYm9keSBoYXNcbiAgICogbm90IGJlZW4gc2V0IHlldCwgdGhlIHN0YXR1cyB3aWxsIGJlIGA0MDQgTm90IEZvdW5kYC4gKi9cbiAgc2V0IHN0YXR1cyh2YWx1ZTogU3RhdHVzKSB7XG4gICAgaWYgKCF0aGlzLiN3cml0YWJsZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlIHJlc3BvbnNlIGlzIG5vdCB3cml0YWJsZS5cIik7XG4gICAgfVxuICAgIHRoaXMuI3N0YXR1cyA9IHZhbHVlO1xuICB9XG5cbiAgLyoqIFRoZSBtZWRpYSB0eXBlLCBvciBleHRlbnNpb24gb2YgdGhlIHJlc3BvbnNlLiAgU2V0dGluZyB0aGlzIHZhbHVlIHdpbGxcbiAgICogZW5zdXJlIGFuIGFwcHJvcHJpYXRlIGBDb250ZW50LVR5cGVgIGhlYWRlciBpcyBhZGRlZCB0byB0aGUgcmVzcG9uc2UuICovXG4gIGdldCB0eXBlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuI3R5cGU7XG4gIH1cbiAgLyoqIFRoZSBtZWRpYSB0eXBlLCBvciBleHRlbnNpb24gb2YgdGhlIHJlc3BvbnNlLiAgU2V0dGluZyB0aGlzIHZhbHVlIHdpbGxcbiAgICogZW5zdXJlIGFuIGFwcHJvcHJpYXRlIGBDb250ZW50LVR5cGVgIGhlYWRlciBpcyBhZGRlZCB0byB0aGUgcmVzcG9uc2UuICovXG4gIHNldCB0eXBlKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcbiAgICBpZiAoIXRoaXMuI3dyaXRhYmxlKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgcmVzcG9uc2UgaXMgbm90IHdyaXRhYmxlLlwiKTtcbiAgICB9XG4gICAgdGhpcy4jdHlwZSA9IHZhbHVlO1xuICB9XG5cbiAgLyoqIEEgcmVhZC1vbmx5IHByb3BlcnR5IHdoaWNoIGRldGVybWluZXMgaWYgdGhlIHJlc3BvbnNlIGlzIHdyaXRhYmxlIG9yIG5vdC5cbiAgICogT25jZSB0aGUgcmVzcG9uc2UgaGFzIGJlZW4gcHJvY2Vzc2VkLCB0aGlzIHZhbHVlIGlzIHNldCB0byBgZmFsc2VgLiAqL1xuICBnZXQgd3JpdGFibGUoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuI3dyaXRhYmxlO1xuICB9XG5cbiAgY29uc3RydWN0b3IocmVxdWVzdDogUmVxdWVzdCkge1xuICAgIHRoaXMuI3JlcXVlc3QgPSByZXF1ZXN0O1xuICB9XG5cbiAgLyoqIEFkZCBhIHJlc291cmNlIHRvIHRoZSBsaXN0IG9mIHJlc291cmNlcyB0aGF0IHdpbGwgYmUgY2xvc2VkIHdoZW4gdGhlXG4gICAqIHJlcXVlc3QgaXMgZGVzdHJveWVkLiAqL1xuICBhZGRSZXNvdXJjZShyaWQ6IG51bWJlcik6IHZvaWQge1xuICAgIHRoaXMuI3Jlc291cmNlcy5wdXNoKHJpZCk7XG4gIH1cblxuICAvKiogUmVsZWFzZSBhbnkgcmVzb3VyY2VzIHRoYXQgYXJlIGJlaW5nIHRyYWNrZWQgYnkgdGhlIHJlc3BvbnNlLlxuICAgKlxuICAgKiBAcGFyYW0gY2xvc2VSZXNvdXJjZXMgY2xvc2UgYW55IHJlc291cmNlIElEcyByZWdpc3RlcmVkIHdpdGggdGhlIHJlc3BvbnNlXG4gICAqL1xuICBkZXN0cm95KGNsb3NlUmVzb3VyY2VzID0gdHJ1ZSk6IHZvaWQge1xuICAgIHRoaXMuI3dyaXRhYmxlID0gZmFsc2U7XG4gICAgdGhpcy4jYm9keSA9IHVuZGVmaW5lZDtcbiAgICB0aGlzLiNkb21SZXNwb25zZSA9IHVuZGVmaW5lZDtcbiAgICBpZiAoY2xvc2VSZXNvdXJjZXMpIHtcbiAgICAgIGZvciAoY29uc3QgcmlkIG9mIHRoaXMuI3Jlc291cmNlcykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIERlbm8uY2xvc2UocmlkKTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gd2UgZG9uJ3QgY2FyZSBhYm91dCBlcnJvcnMgaGVyZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqIFNldHMgdGhlIHJlc3BvbnNlIHRvIHJlZGlyZWN0IHRvIHRoZSBzdXBwbGllZCBgdXJsYC5cbiAgICpcbiAgICogSWYgdGhlIGAuc3RhdHVzYCBpcyBub3QgY3VycmVudGx5IGEgcmVkaXJlY3Qgc3RhdHVzLCB0aGUgc3RhdHVzIHdpbGwgYmUgc2V0XG4gICAqIHRvIGAzMDIgRm91bmRgLlxuICAgKlxuICAgKiBUaGUgYm9keSB3aWxsIGJlIHNldCB0byBhIG1lc3NhZ2UgaW5kaWNhdGluZyB0aGUgcmVkaXJlY3Rpb24gaXMgb2NjdXJyaW5nLlxuICAgKi9cbiAgcmVkaXJlY3QodXJsOiBzdHJpbmcgfCBVUkwpOiB2b2lkO1xuICAvKiogU2V0cyB0aGUgcmVzcG9uc2UgdG8gcmVkaXJlY3QgYmFjayB0byB0aGUgcmVmZXJyZXIgaWYgYXZhaWxhYmxlLCB3aXRoIGFuXG4gICAqIG9wdGlvbmFsIGBhbHRgIFVSTCBpZiB0aGVyZSBpcyBubyByZWZlcnJlciBoZWFkZXIgb24gdGhlIHJlcXVlc3QuICBJZiB0aGVyZVxuICAgKiBpcyBubyByZWZlcnJlciBoZWFkZXIsIG5vciBhbiBgYWx0YCBwYXJhbWV0ZXIsIHRoZSByZWRpcmVjdCBpcyBzZXQgdG8gYC9gLlxuICAgKlxuICAgKiBJZiB0aGUgYC5zdGF0dXNgIGlzIG5vdCBjdXJyZW50bHkgYSByZWRpcmVjdCBzdGF0dXMsIHRoZSBzdGF0dXMgd2lsbCBiZSBzZXRcbiAgICogdG8gYDMwMiBGb3VuZGAuXG4gICAqXG4gICAqIFRoZSBib2R5IHdpbGwgYmUgc2V0IHRvIGEgbWVzc2FnZSBpbmRpY2F0aW5nIHRoZSByZWRpcmVjdGlvbiBpcyBvY2N1cnJpbmcuXG4gICAqL1xuICByZWRpcmVjdCh1cmw6IHR5cGVvZiBSRURJUkVDVF9CQUNLLCBhbHQ/OiBzdHJpbmcgfCBVUkwpOiB2b2lkO1xuICByZWRpcmVjdChcbiAgICB1cmw6IHN0cmluZyB8IFVSTCB8IHR5cGVvZiBSRURJUkVDVF9CQUNLLFxuICAgIGFsdDogc3RyaW5nIHwgVVJMID0gXCIvXCIsXG4gICk6IHZvaWQge1xuICAgIGlmICh1cmwgPT09IFJFRElSRUNUX0JBQ0spIHtcbiAgICAgIHVybCA9IHRoaXMuI3JlcXVlc3QuaGVhZGVycy5nZXQoXCJSZWZlcmVyXCIpID8/IFN0cmluZyhhbHQpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHVybCA9PT0gXCJvYmplY3RcIikge1xuICAgICAgdXJsID0gU3RyaW5nKHVybCk7XG4gICAgfVxuICAgIHRoaXMuaGVhZGVycy5zZXQoXCJMb2NhdGlvblwiLCBlbmNvZGVVcmwodXJsKSk7XG4gICAgaWYgKCF0aGlzLnN0YXR1cyB8fCAhaXNSZWRpcmVjdFN0YXR1cyh0aGlzLnN0YXR1cykpIHtcbiAgICAgIHRoaXMuc3RhdHVzID0gU3RhdHVzLkZvdW5kO1xuICAgIH1cblxuICAgIGlmICh0aGlzLiNyZXF1ZXN0LmFjY2VwdHMoXCJodG1sXCIpKSB7XG4gICAgICB1cmwgPSBlbmNvZGVVUkkodXJsKTtcbiAgICAgIHRoaXMudHlwZSA9IFwidGV4dC9odG1sOyBjaGFyc2V0PXV0Zi04XCI7XG4gICAgICB0aGlzLmJvZHkgPSBgUmVkaXJlY3RpbmcgdG8gPGEgaHJlZj1cIiR7dXJsfVwiPiR7dXJsfTwvYT4uYDtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy50eXBlID0gXCJ0ZXh0L3BsYWluOyBjaGFyc2V0PXV0Zi04XCI7XG4gICAgdGhpcy5ib2R5ID0gYFJlZGlyZWN0aW5nIHRvICR7dXJsfS5gO1xuICB9XG5cbiAgYXN5bmMgdG9Eb21SZXNwb25zZSgpOiBQcm9taXNlPGdsb2JhbFRoaXMuUmVzcG9uc2U+IHtcbiAgICBpZiAodGhpcy4jZG9tUmVzcG9uc2UpIHtcbiAgICAgIHJldHVybiB0aGlzLiNkb21SZXNwb25zZTtcbiAgICB9XG5cbiAgICBjb25zdCBib2R5SW5pdCA9IGF3YWl0IHRoaXMuI2dldEJvZHlJbml0KCk7XG5cbiAgICB0aGlzLiNzZXRDb250ZW50VHlwZSgpO1xuXG4gICAgY29uc3QgeyBoZWFkZXJzIH0gPSB0aGlzO1xuXG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gYm9keSBhbmQgbm8gY29udGVudCB0eXBlIGFuZCBubyBzZXQgbGVuZ3RoLCB0aGVuIHNldCB0aGVcbiAgICAvLyBjb250ZW50IGxlbmd0aCB0byAwXG4gICAgaWYgKFxuICAgICAgIShcbiAgICAgICAgYm9keUluaXQgfHxcbiAgICAgICAgaGVhZGVycy5oYXMoXCJDb250ZW50LVR5cGVcIikgfHxcbiAgICAgICAgaGVhZGVycy5oYXMoXCJDb250ZW50LUxlbmd0aFwiKVxuICAgICAgKVxuICAgICkge1xuICAgICAgaGVhZGVycy5hcHBlbmQoXCJDb250ZW50LUxlbmd0aFwiLCBcIjBcIik7XG4gICAgfVxuXG4gICAgdGhpcy4jd3JpdGFibGUgPSBmYWxzZTtcblxuICAgIGNvbnN0IHN0YXR1cyA9IHRoaXMuc3RhdHVzO1xuICAgIGNvbnN0IHJlc3BvbnNlSW5pdDogUmVzcG9uc2VJbml0ID0ge1xuICAgICAgaGVhZGVycyxcbiAgICAgIHN0YXR1cyxcbiAgICAgIHN0YXR1c1RleHQ6IFNUQVRVU19URVhULmdldChzdGF0dXMpLFxuICAgIH07XG5cbiAgICByZXR1cm4gdGhpcy4jZG9tUmVzcG9uc2UgPSBuZXcgRG9tUmVzcG9uc2UoYm9keUluaXQsIHJlc3BvbnNlSW5pdCk7XG4gIH1cblxuICBbU3ltYm9sLmZvcihcIkRlbm8uY3VzdG9tSW5zcGVjdFwiKV0oaW5zcGVjdDogKHZhbHVlOiB1bmtub3duKSA9PiBzdHJpbmcpIHtcbiAgICBjb25zdCB7IGJvZHksIGhlYWRlcnMsIHN0YXR1cywgdHlwZSwgd3JpdGFibGUgfSA9IHRoaXM7XG4gICAgcmV0dXJuIGBSZXNwb25zZSAke2luc3BlY3QoeyBib2R5LCBoZWFkZXJzLCBzdGF0dXMsIHR5cGUsIHdyaXRhYmxlIH0pfWA7XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxFQUF5RSxBQUF6RSx1RUFBeUU7QUFFekUsTUFBTSxHQUFHLFdBQVcsRUFBRSxNQUFNLEVBQUUsV0FBVyxRQUFR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