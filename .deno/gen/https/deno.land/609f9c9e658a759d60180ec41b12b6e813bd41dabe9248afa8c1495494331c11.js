import { base64, isAbsolute, join, normalize, sep, Status } from "./deps.ts";
import { createHttpError } from "./httpError.ts";
const ENCODE_CHARS_REGEXP = /(?:[^\x21\x25\x26-\x3B\x3D\x3F-\x5B\x5D\x5F\x61-\x7A\x7E]|%(?:[^0-9A-Fa-f]|[0-9A-Fa-f][^0-9A-Fa-f]|$))+/g;
const HTAB = "\t".charCodeAt(0);
const SPACE = " ".charCodeAt(0);
const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);
const UNMATCHED_SURROGATE_PAIR_REGEXP = /(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF]([^\uDC00-\uDFFF]|$)/g;
const UNMATCHED_SURROGATE_PAIR_REPLACE = "$1\uFFFD$2";
export const DEFAULT_CHUNK_SIZE = 16640; // 17 Kib
/** Body types which will be coerced into strings before being sent. */ export const BODY_TYPES = [
    "string",
    "number",
    "bigint",
    "boolean",
    "symbol"
];
export function assert(cond, msg = "Assertion failed") {
    if (!cond) {
        throw new Error(msg);
    }
}
/** Safely decode a URI component, where if it fails, instead of throwing,
 * just returns the original string
 */ export function decodeComponent(text) {
    try {
        return decodeURIComponent(text);
    } catch  {
        return text;
    }
}
/** Encodes the url preventing double enconding */ export function encodeUrl(url) {
    return String(url).replace(UNMATCHED_SURROGATE_PAIR_REGEXP, UNMATCHED_SURROGATE_PAIR_REPLACE).replace(ENCODE_CHARS_REGEXP, encodeURI);
}
function bufferToHex(buffer) {
    const arr = Array.from(new Uint8Array(buffer));
    return arr.map((b)=>b.toString(16).padStart(2, "0")
    ).join("");
}
export async function getRandomFilename(prefix = "", extension = "") {
    const buffer = await crypto.subtle.digest("SHA-1", crypto.getRandomValues(new Uint8Array(256)));
    return `${prefix}${bufferToHex(buffer)}${extension ? `.${extension}` : ""}`;
}
export async function getBoundary() {
    const buffer = await crypto.subtle.digest("SHA-1", crypto.getRandomValues(new Uint8Array(256)));
    return `oak_${bufferToHex(buffer)}`;
}
/** Guard for Async Iterables */ export function isAsyncIterable(value) {
    return typeof value === "object" && value !== null && Symbol.asyncIterator in value && // deno-lint-ignore no-explicit-any
    typeof value[Symbol.asyncIterator] === "function";
}
export function isRouterContext(value) {
    return "params" in value;
}
/** Guard for `Deno.Reader`. */ export function isReader(value) {
    return typeof value === "object" && value !== null && "read" in value && typeof value.read === "function";
}
function isCloser(value) {
    return typeof value === "object" && value != null && "close" in value && // deno-lint-ignore no-explicit-any
    typeof value["close"] === "function";
}
export function isConn(value) {
    return typeof value === "object" && value != null && "rid" in value && // deno-lint-ignore no-explicit-any
    typeof value.rid === "number" && "localAddr" in value && "remoteAddr" in value;
}
export function isListenTlsOptions(value) {
    return typeof value === "object" && value !== null && "certFile" in value && "keyFile" in value && "port" in value;
}
/**
 * Create a `ReadableStream<Uint8Array>` from an `AsyncIterable`.
 */ export function readableStreamFromAsyncIterable(source) {
    return new ReadableStream({
        async start (controller) {
            for await (const chunk of source){
                if (BODY_TYPES.includes(typeof chunk)) {
                    controller.enqueue(encoder.encode(String(chunk)));
                } else if (chunk instanceof Uint8Array) {
                    controller.enqueue(chunk);
                } else if (ArrayBuffer.isView(chunk)) {
                    controller.enqueue(new Uint8Array(chunk.buffer));
                } else if (chunk instanceof ArrayBuffer) {
                    controller.enqueue(new Uint8Array(chunk));
                } else {
                    try {
                        controller.enqueue(encoder.encode(JSON.stringify(chunk)));
                    } catch  {
                    // we just swallow errors here
                    }
                }
            }
            controller.close();
        }
    });
}
/**
 * Create a `ReadableStream<Uint8Array>` from a `Deno.Reader`.
 *
 * When the pull algorithm is called on the stream, a chunk from the reader
 * will be read.  When `null` is returned from the reader, the stream will be
 * closed along with the reader (if it is also a `Deno.Closer`).
 *
 * An example converting a `Deno.File` into a readable stream:
 *
 * ```ts
 * import { readableStreamFromReader } from "https://deno.land/std/io/mod.ts";
 *
 * const file = await Deno.open("./file.txt", { read: true });
 * const fileStream = readableStreamFromReader(file);
 * ```
 */ export function readableStreamFromReader(reader, options = {
}) {
    const { autoClose =true , chunkSize =DEFAULT_CHUNK_SIZE , strategy ,  } = options;
    return new ReadableStream({
        async pull (controller) {
            const chunk = new Uint8Array(chunkSize);
            try {
                const read = await reader.read(chunk);
                if (read === null) {
                    if (isCloser(reader) && autoClose) {
                        reader.close();
                    }
                    controller.close();
                    return;
                }
                controller.enqueue(chunk.subarray(0, read));
            } catch (e) {
                controller.error(e);
                if (isCloser(reader)) {
                    reader.close();
                }
            }
        },
        cancel () {
            if (isCloser(reader) && autoClose) {
                reader.close();
            }
        }
    }, strategy);
}
/** Determines if a HTTP `Status` is an `ErrorStatus` (4XX or 5XX). */ export function isErrorStatus(value) {
    return [
        Status.BadRequest,
        Status.Unauthorized,
        Status.PaymentRequired,
        Status.Forbidden,
        Status.NotFound,
        Status.MethodNotAllowed,
        Status.NotAcceptable,
        Status.ProxyAuthRequired,
        Status.RequestTimeout,
        Status.Conflict,
        Status.Gone,
        Status.LengthRequired,
        Status.PreconditionFailed,
        Status.RequestEntityTooLarge,
        Status.RequestURITooLong,
        Status.UnsupportedMediaType,
        Status.RequestedRangeNotSatisfiable,
        Status.ExpectationFailed,
        Status.Teapot,
        Status.MisdirectedRequest,
        Status.UnprocessableEntity,
        Status.Locked,
        Status.FailedDependency,
        Status.UpgradeRequired,
        Status.PreconditionRequired,
        Status.TooManyRequests,
        Status.RequestHeaderFieldsTooLarge,
        Status.UnavailableForLegalReasons,
        Status.InternalServerError,
        Status.NotImplemented,
        Status.BadGateway,
        Status.ServiceUnavailable,
        Status.GatewayTimeout,
        Status.HTTPVersionNotSupported,
        Status.VariantAlsoNegotiates,
        Status.InsufficientStorage,
        Status.LoopDetected,
        Status.NotExtended,
        Status.NetworkAuthenticationRequired, 
    ].includes(value);
}
/** Determines if a HTTP `Status` is a `RedirectStatus` (3XX). */ export function isRedirectStatus(value) {
    return [
        Status.MultipleChoices,
        Status.MovedPermanently,
        Status.Found,
        Status.SeeOther,
        Status.UseProxy,
        Status.TemporaryRedirect,
        Status.PermanentRedirect, 
    ].includes(value);
}
/** Determines if a string "looks" like HTML */ export function isHtml(value) {
    return /^\s*<(?:!DOCTYPE|html|body)/i.test(value);
}
/** Returns `u8` with leading white space removed. */ export function skipLWSPChar(u8) {
    const result = new Uint8Array(u8.length);
    let j = 0;
    for(let i = 0; i < u8.length; i++){
        if (u8[i] === SPACE || u8[i] === HTAB) continue;
        result[j++] = u8[i];
    }
    return result.slice(0, j);
}
export function stripEol(value) {
    if (value[value.byteLength - 1] == LF) {
        let drop = 1;
        if (value.byteLength > 1 && value[value.byteLength - 2] === CR) {
            drop = 2;
        }
        return value.subarray(0, value.byteLength - drop);
    }
    return value;
}
/*!
 * Adapted directly from https://github.com/pillarjs/resolve-path
 * which is licensed as follows:
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Jonathan Ong <me@jongleberry.com>
 * Copyright (c) 2015-2018 Douglas Christopher Wilson <doug@somethingdoug.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * 'Software'), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */ const UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
export function resolvePath(rootPath, relativePath) {
    let path = relativePath;
    let root = rootPath;
    // root is optional, similar to root.resolve
    if (relativePath === undefined) {
        path = rootPath;
        root = ".";
    }
    if (path == null) {
        throw new TypeError("Argument relativePath is required.");
    }
    // containing NULL bytes is malicious
    if (path.includes("\0")) {
        throw createHttpError(400, "Malicious Path");
    }
    // path should never be absolute
    if (isAbsolute(path)) {
        throw createHttpError(400, "Malicious Path");
    }
    // path outside root
    if (UP_PATH_REGEXP.test(normalize("." + sep + path))) {
        throw createHttpError(403);
    }
    // join the relative path
    return normalize(join(root, path));
}
/** A utility class that transforms "any" chunk into an `Uint8Array`. */ export class Uint8ArrayTransformStream extends TransformStream {
    constructor(){
        const init = {
            async transform (chunk, controller) {
                chunk = await chunk;
                switch(typeof chunk){
                    case "object":
                        if (chunk === null) {
                            controller.terminate();
                        } else if (ArrayBuffer.isView(chunk)) {
                            controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
                        } else if (Array.isArray(chunk) && chunk.every((value)=>typeof value === "number"
                        )) {
                            controller.enqueue(new Uint8Array(chunk));
                        } else if (typeof chunk.valueOf === "function" && chunk.valueOf() !== chunk) {
                            this.transform(chunk.valueOf(), controller);
                        } else if ("toJSON" in chunk) {
                            this.transform(JSON.stringify(chunk), controller);
                        }
                        break;
                    case "symbol":
                        controller.error(new TypeError("Cannot transform a symbol to a Uint8Array"));
                        break;
                    case "undefined":
                        controller.error(new TypeError("Cannot transform undefined to a Uint8Array"));
                        break;
                    default:
                        controller.enqueue(this.encoder.encode(String(chunk)));
                }
            },
            encoder: new TextEncoder()
        };
        super(init);
    }
}
const replacements = {
    "/": "_",
    "+": "-",
    "=": ""
};
const encoder = new TextEncoder();
export function encodeBase64Safe(data) {
    return base64.encode(data).replace(/\/|\+|=/g, (c)=>replacements[c]
    );
}
export function importKey(key) {
    if (typeof key === "string") {
        key = encoder.encode(key);
    } else if (Array.isArray(key) || key instanceof ArrayBuffer) {
        // TODO(@kitsonk) don't transform AB when https://github.com/denoland/deno/issues/11664 is fixed
        key = new Uint8Array(key);
    }
    return globalThis.crypto.subtle.importKey("raw", key, {
        name: "HMAC",
        hash: {
            name: "SHA-256"
        }
    }, true, [
        "sign",
        "verify"
    ]);
}
export function sign(data, key) {
    if (typeof data === "string") {
        data = encoder.encode(data);
    } else if (Array.isArray(data)) {
        data = Uint8Array.from(data);
    }
    return crypto.subtle.sign("HMAC", key, data);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMC4xLjAvdXRpbC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIxIHRoZSBvYWsgYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbmltcG9ydCB0eXBlIHsgU3RhdGUgfSBmcm9tIFwiLi9hcHBsaWNhdGlvbi50c1wiO1xuaW1wb3J0IHR5cGUgeyBDb250ZXh0IH0gZnJvbSBcIi4vY29udGV4dC50c1wiO1xuaW1wb3J0IHsgYmFzZTY0LCBpc0Fic29sdXRlLCBqb2luLCBub3JtYWxpemUsIHNlcCwgU3RhdHVzIH0gZnJvbSBcIi4vZGVwcy50c1wiO1xuaW1wb3J0IHsgY3JlYXRlSHR0cEVycm9yIH0gZnJvbSBcIi4vaHR0cEVycm9yLnRzXCI7XG5pbXBvcnQgdHlwZSB7IFJvdXRlUGFyYW1zLCBSb3V0ZXJDb250ZXh0IH0gZnJvbSBcIi4vcm91dGVyLnRzXCI7XG5pbXBvcnQgdHlwZSB7IERhdGEsIEVycm9yU3RhdHVzLCBLZXksIFJlZGlyZWN0U3RhdHVzIH0gZnJvbSBcIi4vdHlwZXMuZC50c1wiO1xuXG5jb25zdCBFTkNPREVfQ0hBUlNfUkVHRVhQID1cbiAgLyg/OlteXFx4MjFcXHgyNVxceDI2LVxceDNCXFx4M0RcXHgzRi1cXHg1QlxceDVEXFx4NUZcXHg2MS1cXHg3QVxceDdFXXwlKD86W14wLTlBLUZhLWZdfFswLTlBLUZhLWZdW14wLTlBLUZhLWZdfCQpKSsvZztcbmNvbnN0IEhUQUIgPSBcIlxcdFwiLmNoYXJDb2RlQXQoMCk7XG5jb25zdCBTUEFDRSA9IFwiIFwiLmNoYXJDb2RlQXQoMCk7XG5jb25zdCBDUiA9IFwiXFxyXCIuY2hhckNvZGVBdCgwKTtcbmNvbnN0IExGID0gXCJcXG5cIi5jaGFyQ29kZUF0KDApO1xuY29uc3QgVU5NQVRDSEVEX1NVUlJPR0FURV9QQUlSX1JFR0VYUCA9XG4gIC8oXnxbXlxcdUQ4MDAtXFx1REJGRl0pW1xcdURDMDAtXFx1REZGRl18W1xcdUQ4MDAtXFx1REJGRl0oW15cXHVEQzAwLVxcdURGRkZdfCQpL2c7XG5jb25zdCBVTk1BVENIRURfU1VSUk9HQVRFX1BBSVJfUkVQTEFDRSA9IFwiJDFcXHVGRkZEJDJcIjtcbmV4cG9ydCBjb25zdCBERUZBVUxUX0NIVU5LX1NJWkUgPSAxNl82NDA7IC8vIDE3IEtpYlxuXG4vKiogQm9keSB0eXBlcyB3aGljaCB3aWxsIGJlIGNvZXJjZWQgaW50byBzdHJpbmdzIGJlZm9yZSBiZWluZyBzZW50LiAqL1xuZXhwb3J0IGNvbnN0IEJPRFlfVFlQRVMgPSBbXCJzdHJpbmdcIiwgXCJudW1iZXJcIiwgXCJiaWdpbnRcIiwgXCJib29sZWFuXCIsIFwic3ltYm9sXCJdO1xuXG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0KGNvbmQ6IHVua25vd24sIG1zZyA9IFwiQXNzZXJ0aW9uIGZhaWxlZFwiKTogYXNzZXJ0cyBjb25kIHtcbiAgaWYgKCFjb25kKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKG1zZyk7XG4gIH1cbn1cblxuLyoqIFNhZmVseSBkZWNvZGUgYSBVUkkgY29tcG9uZW50LCB3aGVyZSBpZiBpdCBmYWlscywgaW5zdGVhZCBvZiB0aHJvd2luZyxcbiAqIGp1c3QgcmV0dXJucyB0aGUgb3JpZ2luYWwgc3RyaW5nXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZWNvZGVDb21wb25lbnQodGV4dDogc3RyaW5nKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudCh0ZXh0KTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHRleHQ7XG4gIH1cbn1cblxuLyoqIEVuY29kZXMgdGhlIHVybCBwcmV2ZW50aW5nIGRvdWJsZSBlbmNvbmRpbmcgKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmNvZGVVcmwodXJsOiBzdHJpbmcpIHtcbiAgcmV0dXJuIFN0cmluZyh1cmwpXG4gICAgLnJlcGxhY2UoVU5NQVRDSEVEX1NVUlJPR0FURV9QQUlSX1JFR0VYUCwgVU5NQVRDSEVEX1NVUlJPR0FURV9QQUlSX1JFUExBQ0UpXG4gICAgLnJlcGxhY2UoRU5DT0RFX0NIQVJTX1JFR0VYUCwgZW5jb2RlVVJJKTtcbn1cblxuZnVuY3Rpb24gYnVmZmVyVG9IZXgoYnVmZmVyOiBBcnJheUJ1ZmZlcik6IHN0cmluZyB7XG4gIGNvbnN0IGFyciA9IEFycmF5LmZyb20obmV3IFVpbnQ4QXJyYXkoYnVmZmVyKSk7XG4gIHJldHVybiBhcnIubWFwKChiKSA9PiBiLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCBcIjBcIikpLmpvaW4oXCJcIik7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRSYW5kb21GaWxlbmFtZShcbiAgcHJlZml4ID0gXCJcIixcbiAgZXh0ZW5zaW9uID0gXCJcIixcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IGJ1ZmZlciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFxuICAgIFwiU0hBLTFcIixcbiAgICBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKG5ldyBVaW50OEFycmF5KDI1NikpLFxuICApO1xuICByZXR1cm4gYCR7cHJlZml4fSR7YnVmZmVyVG9IZXgoYnVmZmVyKX0ke2V4dGVuc2lvbiA/IGAuJHtleHRlbnNpb259YCA6IFwiXCJ9YDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEJvdW5kYXJ5KCk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IGJ1ZmZlciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZGlnZXN0KFxuICAgIFwiU0hBLTFcIixcbiAgICBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKG5ldyBVaW50OEFycmF5KDI1NikpLFxuICApO1xuICByZXR1cm4gYG9ha18ke2J1ZmZlclRvSGV4KGJ1ZmZlcil9YDtcbn1cblxuLyoqIEd1YXJkIGZvciBBc3luYyBJdGVyYWJsZXMgKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0FzeW5jSXRlcmFibGUoXG4gIHZhbHVlOiB1bmtub3duLFxuKTogdmFsdWUgaXMgQXN5bmNJdGVyYWJsZTx1bmtub3duPiB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiYgdmFsdWUgIT09IG51bGwgJiZcbiAgICBTeW1ib2wuYXN5bmNJdGVyYXRvciBpbiB2YWx1ZSAmJlxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgdHlwZW9mICh2YWx1ZSBhcyBhbnkpW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSA9PT0gXCJmdW5jdGlvblwiO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNSb3V0ZXJDb250ZXh0PFxuICBSIGV4dGVuZHMgc3RyaW5nLFxuICBQIGV4dGVuZHMgUm91dGVQYXJhbXM8Uj4sXG4gIFMgZXh0ZW5kcyBTdGF0ZSxcbj4oXG4gIHZhbHVlOiBDb250ZXh0PFM+LFxuKTogdmFsdWUgaXMgUm91dGVyQ29udGV4dDxSLCBQLCBTPiB7XG4gIHJldHVybiBcInBhcmFtc1wiIGluIHZhbHVlO1xufVxuXG4vKiogR3VhcmQgZm9yIGBEZW5vLlJlYWRlcmAuICovXG5leHBvcnQgZnVuY3Rpb24gaXNSZWFkZXIodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBEZW5vLlJlYWRlciB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiYgdmFsdWUgIT09IG51bGwgJiYgXCJyZWFkXCIgaW4gdmFsdWUgJiZcbiAgICB0eXBlb2YgKHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5yZWFkID09PSBcImZ1bmN0aW9uXCI7XG59XG5cbmZ1bmN0aW9uIGlzQ2xvc2VyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgRGVuby5DbG9zZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmIHZhbHVlICE9IG51bGwgJiYgXCJjbG9zZVwiIGluIHZhbHVlICYmXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICB0eXBlb2YgKHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIGFueT4pW1wiY2xvc2VcIl0gPT09IFwiZnVuY3Rpb25cIjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ29ubih2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIERlbm8uQ29ubiB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiYgdmFsdWUgIT0gbnVsbCAmJiBcInJpZFwiIGluIHZhbHVlICYmXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICB0eXBlb2YgKHZhbHVlIGFzIGFueSkucmlkID09PSBcIm51bWJlclwiICYmIFwibG9jYWxBZGRyXCIgaW4gdmFsdWUgJiZcbiAgICBcInJlbW90ZUFkZHJcIiBpbiB2YWx1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTGlzdGVuVGxzT3B0aW9ucyhcbiAgdmFsdWU6IHVua25vd24sXG4pOiB2YWx1ZSBpcyBEZW5vLkxpc3RlblRsc09wdGlvbnMge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmIHZhbHVlICE9PSBudWxsICYmIFwiY2VydEZpbGVcIiBpbiB2YWx1ZSAmJlxuICAgIFwia2V5RmlsZVwiIGluIHZhbHVlICYmIFwicG9ydFwiIGluIHZhbHVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlYWRhYmxlU3RyZWFtRnJvbVJlYWRlck9wdGlvbnMge1xuICAvKiogSWYgdGhlIGByZWFkZXJgIGlzIGFsc28gYSBgRGVuby5DbG9zZXJgLCBhdXRvbWF0aWNhbGx5IGNsb3NlIHRoZSBgcmVhZGVyYFxuICAgKiB3aGVuIGBFT0ZgIGlzIGVuY291bnRlcmVkLCBvciBhIHJlYWQgZXJyb3Igb2NjdXJzLlxuICAgKlxuICAgKiBEZWZhdWx0cyB0byBgdHJ1ZWAuICovXG4gIGF1dG9DbG9zZT86IGJvb2xlYW47XG5cbiAgLyoqIFRoZSBzaXplIG9mIGNodW5rcyB0byBhbGxvY2F0ZSB0byByZWFkLCB0aGUgZGVmYXVsdCBpcyB+MTZLaUIsIHdoaWNoIGlzXG4gICAqIHRoZSBtYXhpbXVtIHNpemUgdGhhdCBEZW5vIG9wZXJhdGlvbnMgY2FuIGN1cnJlbnRseSBzdXBwb3J0LiAqL1xuICBjaHVua1NpemU/OiBudW1iZXI7XG5cbiAgLyoqIFRoZSBxdWV1aW5nIHN0cmF0ZWd5IHRvIGNyZWF0ZSB0aGUgYFJlYWRhYmxlU3RyZWFtYCB3aXRoLiAqL1xuICBzdHJhdGVneT86IHsgaGlnaFdhdGVyTWFyaz86IG51bWJlciB8IHVuZGVmaW5lZDsgc2l6ZT86IHVuZGVmaW5lZCB9O1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5PmAgZnJvbSBhbiBgQXN5bmNJdGVyYWJsZWAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkYWJsZVN0cmVhbUZyb21Bc3luY0l0ZXJhYmxlKFxuICBzb3VyY2U6IEFzeW5jSXRlcmFibGU8dW5rbm93bj4sXG4pOiBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5PiB7XG4gIHJldHVybiBuZXcgUmVhZGFibGVTdHJlYW0oe1xuICAgIGFzeW5jIHN0YXJ0KGNvbnRyb2xsZXIpIHtcbiAgICAgIGZvciBhd2FpdCAoY29uc3QgY2h1bmsgb2Ygc291cmNlKSB7XG4gICAgICAgIGlmIChCT0RZX1RZUEVTLmluY2x1ZGVzKHR5cGVvZiBjaHVuaykpIHtcbiAgICAgICAgICBjb250cm9sbGVyLmVucXVldWUoZW5jb2Rlci5lbmNvZGUoU3RyaW5nKGNodW5rKSkpO1xuICAgICAgICB9IGVsc2UgaWYgKGNodW5rIGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuICAgICAgICAgIGNvbnRyb2xsZXIuZW5xdWV1ZShjaHVuayk7XG4gICAgICAgIH0gZWxzZSBpZiAoQXJyYXlCdWZmZXIuaXNWaWV3KGNodW5rKSkge1xuICAgICAgICAgIGNvbnRyb2xsZXIuZW5xdWV1ZShuZXcgVWludDhBcnJheShjaHVuay5idWZmZXIpKTtcbiAgICAgICAgfSBlbHNlIGlmIChjaHVuayBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG4gICAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKG5ldyBVaW50OEFycmF5KGNodW5rKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnRyb2xsZXIuZW5xdWV1ZShlbmNvZGVyLmVuY29kZShKU09OLnN0cmluZ2lmeShjaHVuaykpKTtcbiAgICAgICAgICB9IGNhdGNoIHtcbiAgICAgICAgICAgIC8vIHdlIGp1c3Qgc3dhbGxvdyBlcnJvcnMgaGVyZVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29udHJvbGxlci5jbG9zZSgpO1xuICAgIH0sXG4gIH0pO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5PmAgZnJvbSBhIGBEZW5vLlJlYWRlcmAuXG4gKlxuICogV2hlbiB0aGUgcHVsbCBhbGdvcml0aG0gaXMgY2FsbGVkIG9uIHRoZSBzdHJlYW0sIGEgY2h1bmsgZnJvbSB0aGUgcmVhZGVyXG4gKiB3aWxsIGJlIHJlYWQuICBXaGVuIGBudWxsYCBpcyByZXR1cm5lZCBmcm9tIHRoZSByZWFkZXIsIHRoZSBzdHJlYW0gd2lsbCBiZVxuICogY2xvc2VkIGFsb25nIHdpdGggdGhlIHJlYWRlciAoaWYgaXQgaXMgYWxzbyBhIGBEZW5vLkNsb3NlcmApLlxuICpcbiAqIEFuIGV4YW1wbGUgY29udmVydGluZyBhIGBEZW5vLkZpbGVgIGludG8gYSByZWFkYWJsZSBzdHJlYW06XG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IHJlYWRhYmxlU3RyZWFtRnJvbVJlYWRlciB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGQvaW8vbW9kLnRzXCI7XG4gKlxuICogY29uc3QgZmlsZSA9IGF3YWl0IERlbm8ub3BlbihcIi4vZmlsZS50eHRcIiwgeyByZWFkOiB0cnVlIH0pO1xuICogY29uc3QgZmlsZVN0cmVhbSA9IHJlYWRhYmxlU3RyZWFtRnJvbVJlYWRlcihmaWxlKTtcbiAqIGBgYFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZGFibGVTdHJlYW1Gcm9tUmVhZGVyKFxuICByZWFkZXI6IERlbm8uUmVhZGVyIHwgKERlbm8uUmVhZGVyICYgRGVuby5DbG9zZXIpLFxuICBvcHRpb25zOiBSZWFkYWJsZVN0cmVhbUZyb21SZWFkZXJPcHRpb25zID0ge30sXG4pOiBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5PiB7XG4gIGNvbnN0IHtcbiAgICBhdXRvQ2xvc2UgPSB0cnVlLFxuICAgIGNodW5rU2l6ZSA9IERFRkFVTFRfQ0hVTktfU0laRSxcbiAgICBzdHJhdGVneSxcbiAgfSA9IG9wdGlvbnM7XG5cbiAgcmV0dXJuIG5ldyBSZWFkYWJsZVN0cmVhbSh7XG4gICAgYXN5bmMgcHVsbChjb250cm9sbGVyKSB7XG4gICAgICBjb25zdCBjaHVuayA9IG5ldyBVaW50OEFycmF5KGNodW5rU2l6ZSk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZWFkID0gYXdhaXQgcmVhZGVyLnJlYWQoY2h1bmspO1xuICAgICAgICBpZiAocmVhZCA9PT0gbnVsbCkge1xuICAgICAgICAgIGlmIChpc0Nsb3NlcihyZWFkZXIpICYmIGF1dG9DbG9zZSkge1xuICAgICAgICAgICAgcmVhZGVyLmNsb3NlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRyb2xsZXIuY2xvc2UoKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKGNodW5rLnN1YmFycmF5KDAsIHJlYWQpKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29udHJvbGxlci5lcnJvcihlKTtcbiAgICAgICAgaWYgKGlzQ2xvc2VyKHJlYWRlcikpIHtcbiAgICAgICAgICByZWFkZXIuY2xvc2UoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgY2FuY2VsKCkge1xuICAgICAgaWYgKGlzQ2xvc2VyKHJlYWRlcikgJiYgYXV0b0Nsb3NlKSB7XG4gICAgICAgIHJlYWRlci5jbG9zZSgpO1xuICAgICAgfVxuICAgIH0sXG4gIH0sIHN0cmF0ZWd5KTtcbn1cblxuLyoqIERldGVybWluZXMgaWYgYSBIVFRQIGBTdGF0dXNgIGlzIGFuIGBFcnJvclN0YXR1c2AgKDRYWCBvciA1WFgpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzRXJyb3JTdGF0dXModmFsdWU6IFN0YXR1cyk6IHZhbHVlIGlzIEVycm9yU3RhdHVzIHtcbiAgcmV0dXJuIFtcbiAgICBTdGF0dXMuQmFkUmVxdWVzdCxcbiAgICBTdGF0dXMuVW5hdXRob3JpemVkLFxuICAgIFN0YXR1cy5QYXltZW50UmVxdWlyZWQsXG4gICAgU3RhdHVzLkZvcmJpZGRlbixcbiAgICBTdGF0dXMuTm90Rm91bmQsXG4gICAgU3RhdHVzLk1ldGhvZE5vdEFsbG93ZWQsXG4gICAgU3RhdHVzLk5vdEFjY2VwdGFibGUsXG4gICAgU3RhdHVzLlByb3h5QXV0aFJlcXVpcmVkLFxuICAgIFN0YXR1cy5SZXF1ZXN0VGltZW91dCxcbiAgICBTdGF0dXMuQ29uZmxpY3QsXG4gICAgU3RhdHVzLkdvbmUsXG4gICAgU3RhdHVzLkxlbmd0aFJlcXVpcmVkLFxuICAgIFN0YXR1cy5QcmVjb25kaXRpb25GYWlsZWQsXG4gICAgU3RhdHVzLlJlcXVlc3RFbnRpdHlUb29MYXJnZSxcbiAgICBTdGF0dXMuUmVxdWVzdFVSSVRvb0xvbmcsXG4gICAgU3RhdHVzLlVuc3VwcG9ydGVkTWVkaWFUeXBlLFxuICAgIFN0YXR1cy5SZXF1ZXN0ZWRSYW5nZU5vdFNhdGlzZmlhYmxlLFxuICAgIFN0YXR1cy5FeHBlY3RhdGlvbkZhaWxlZCxcbiAgICBTdGF0dXMuVGVhcG90LFxuICAgIFN0YXR1cy5NaXNkaXJlY3RlZFJlcXVlc3QsXG4gICAgU3RhdHVzLlVucHJvY2Vzc2FibGVFbnRpdHksXG4gICAgU3RhdHVzLkxvY2tlZCxcbiAgICBTdGF0dXMuRmFpbGVkRGVwZW5kZW5jeSxcbiAgICBTdGF0dXMuVXBncmFkZVJlcXVpcmVkLFxuICAgIFN0YXR1cy5QcmVjb25kaXRpb25SZXF1aXJlZCxcbiAgICBTdGF0dXMuVG9vTWFueVJlcXVlc3RzLFxuICAgIFN0YXR1cy5SZXF1ZXN0SGVhZGVyRmllbGRzVG9vTGFyZ2UsXG4gICAgU3RhdHVzLlVuYXZhaWxhYmxlRm9yTGVnYWxSZWFzb25zLFxuICAgIFN0YXR1cy5JbnRlcm5hbFNlcnZlckVycm9yLFxuICAgIFN0YXR1cy5Ob3RJbXBsZW1lbnRlZCxcbiAgICBTdGF0dXMuQmFkR2F0ZXdheSxcbiAgICBTdGF0dXMuU2VydmljZVVuYXZhaWxhYmxlLFxuICAgIFN0YXR1cy5HYXRld2F5VGltZW91dCxcbiAgICBTdGF0dXMuSFRUUFZlcnNpb25Ob3RTdXBwb3J0ZWQsXG4gICAgU3RhdHVzLlZhcmlhbnRBbHNvTmVnb3RpYXRlcyxcbiAgICBTdGF0dXMuSW5zdWZmaWNpZW50U3RvcmFnZSxcbiAgICBTdGF0dXMuTG9vcERldGVjdGVkLFxuICAgIFN0YXR1cy5Ob3RFeHRlbmRlZCxcbiAgICBTdGF0dXMuTmV0d29ya0F1dGhlbnRpY2F0aW9uUmVxdWlyZWQsXG4gIF0uaW5jbHVkZXModmFsdWUpO1xufVxuXG4vKiogRGV0ZXJtaW5lcyBpZiBhIEhUVFAgYFN0YXR1c2AgaXMgYSBgUmVkaXJlY3RTdGF0dXNgICgzWFgpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzUmVkaXJlY3RTdGF0dXModmFsdWU6IFN0YXR1cyk6IHZhbHVlIGlzIFJlZGlyZWN0U3RhdHVzIHtcbiAgcmV0dXJuIFtcbiAgICBTdGF0dXMuTXVsdGlwbGVDaG9pY2VzLFxuICAgIFN0YXR1cy5Nb3ZlZFBlcm1hbmVudGx5LFxuICAgIFN0YXR1cy5Gb3VuZCxcbiAgICBTdGF0dXMuU2VlT3RoZXIsXG4gICAgU3RhdHVzLlVzZVByb3h5LFxuICAgIFN0YXR1cy5UZW1wb3JhcnlSZWRpcmVjdCxcbiAgICBTdGF0dXMuUGVybWFuZW50UmVkaXJlY3QsXG4gIF0uaW5jbHVkZXModmFsdWUpO1xufVxuXG4vKiogRGV0ZXJtaW5lcyBpZiBhIHN0cmluZyBcImxvb2tzXCIgbGlrZSBIVE1MICovXG5leHBvcnQgZnVuY3Rpb24gaXNIdG1sKHZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIC9eXFxzKjwoPzohRE9DVFlQRXxodG1sfGJvZHkpL2kudGVzdCh2YWx1ZSk7XG59XG5cbi8qKiBSZXR1cm5zIGB1OGAgd2l0aCBsZWFkaW5nIHdoaXRlIHNwYWNlIHJlbW92ZWQuICovXG5leHBvcnQgZnVuY3Rpb24gc2tpcExXU1BDaGFyKHU4OiBVaW50OEFycmF5KTogVWludDhBcnJheSB7XG4gIGNvbnN0IHJlc3VsdCA9IG5ldyBVaW50OEFycmF5KHU4Lmxlbmd0aCk7XG4gIGxldCBqID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB1OC5sZW5ndGg7IGkrKykge1xuICAgIGlmICh1OFtpXSA9PT0gU1BBQ0UgfHwgdThbaV0gPT09IEhUQUIpIGNvbnRpbnVlO1xuICAgIHJlc3VsdFtqKytdID0gdThbaV07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdC5zbGljZSgwLCBqKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmlwRW9sKHZhbHVlOiBVaW50OEFycmF5KTogVWludDhBcnJheSB7XG4gIGlmICh2YWx1ZVt2YWx1ZS5ieXRlTGVuZ3RoIC0gMV0gPT0gTEYpIHtcbiAgICBsZXQgZHJvcCA9IDE7XG4gICAgaWYgKHZhbHVlLmJ5dGVMZW5ndGggPiAxICYmIHZhbHVlW3ZhbHVlLmJ5dGVMZW5ndGggLSAyXSA9PT0gQ1IpIHtcbiAgICAgIGRyb3AgPSAyO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWUuc3ViYXJyYXkoMCwgdmFsdWUuYnl0ZUxlbmd0aCAtIGRyb3ApO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn1cblxuLyohXG4gKiBBZGFwdGVkIGRpcmVjdGx5IGZyb20gaHR0cHM6Ly9naXRodWIuY29tL3BpbGxhcmpzL3Jlc29sdmUtcGF0aFxuICogd2hpY2ggaXMgbGljZW5zZWQgYXMgZm9sbG93czpcbiAqXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgSm9uYXRoYW4gT25nIDxtZUBqb25nbGViZXJyeS5jb20+XG4gKiBDb3B5cmlnaHQgKGMpIDIwMTUtMjAxOCBEb3VnbGFzIENocmlzdG9waGVyIFdpbHNvbiA8ZG91Z0Bzb21ldGhpbmdkb3VnLmNvbT5cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmdcbiAqIGEgY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuICogJ1NvZnR3YXJlJyksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuICogd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuICogZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvXG4gKiBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG9cbiAqIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZVxuICogaW5jbHVkZWQgaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEICdBUyBJUycsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsXG4gKiBFWFBSRVNTIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0ZcbiAqIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC5cbiAqIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULFxuICogVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEVcbiAqIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuICovXG5cbmNvbnN0IFVQX1BBVEhfUkVHRVhQID0gLyg/Ol58W1xcXFwvXSlcXC5cXC4oPzpbXFxcXC9dfCQpLztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVQYXRoKHJlbGF0aXZlUGF0aDogc3RyaW5nKTogc3RyaW5nO1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVQYXRoKHJvb3RQYXRoOiBzdHJpbmcsIHJlbGF0aXZlUGF0aDogc3RyaW5nKTogc3RyaW5nO1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVQYXRoKHJvb3RQYXRoOiBzdHJpbmcsIHJlbGF0aXZlUGF0aD86IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBwYXRoID0gcmVsYXRpdmVQYXRoO1xuICBsZXQgcm9vdCA9IHJvb3RQYXRoO1xuXG4gIC8vIHJvb3QgaXMgb3B0aW9uYWwsIHNpbWlsYXIgdG8gcm9vdC5yZXNvbHZlXG4gIGlmIChyZWxhdGl2ZVBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgIHBhdGggPSByb290UGF0aDtcbiAgICByb290ID0gXCIuXCI7XG4gIH1cblxuICBpZiAocGF0aCA9PSBudWxsKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIkFyZ3VtZW50IHJlbGF0aXZlUGF0aCBpcyByZXF1aXJlZC5cIik7XG4gIH1cblxuICAvLyBjb250YWluaW5nIE5VTEwgYnl0ZXMgaXMgbWFsaWNpb3VzXG4gIGlmIChwYXRoLmluY2x1ZGVzKFwiXFwwXCIpKSB7XG4gICAgdGhyb3cgY3JlYXRlSHR0cEVycm9yKDQwMCwgXCJNYWxpY2lvdXMgUGF0aFwiKTtcbiAgfVxuXG4gIC8vIHBhdGggc2hvdWxkIG5ldmVyIGJlIGFic29sdXRlXG4gIGlmIChpc0Fic29sdXRlKHBhdGgpKSB7XG4gICAgdGhyb3cgY3JlYXRlSHR0cEVycm9yKDQwMCwgXCJNYWxpY2lvdXMgUGF0aFwiKTtcbiAgfVxuXG4gIC8vIHBhdGggb3V0c2lkZSByb290XG4gIGlmIChVUF9QQVRIX1JFR0VYUC50ZXN0KG5vcm1hbGl6ZShcIi5cIiArIHNlcCArIHBhdGgpKSkge1xuICAgIHRocm93IGNyZWF0ZUh0dHBFcnJvcig0MDMpO1xuICB9XG5cbiAgLy8gam9pbiB0aGUgcmVsYXRpdmUgcGF0aFxuICByZXR1cm4gbm9ybWFsaXplKGpvaW4ocm9vdCwgcGF0aCkpO1xufVxuXG4vKiogQSB1dGlsaXR5IGNsYXNzIHRoYXQgdHJhbnNmb3JtcyBcImFueVwiIGNodW5rIGludG8gYW4gYFVpbnQ4QXJyYXlgLiAqL1xuZXhwb3J0IGNsYXNzIFVpbnQ4QXJyYXlUcmFuc2Zvcm1TdHJlYW1cbiAgZXh0ZW5kcyBUcmFuc2Zvcm1TdHJlYW08dW5rbm93biwgVWludDhBcnJheT4ge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBjb25zdCBpbml0ID0ge1xuICAgICAgYXN5bmMgdHJhbnNmb3JtKFxuICAgICAgICBjaHVuazogdW5rbm93bixcbiAgICAgICAgY29udHJvbGxlcjogVHJhbnNmb3JtU3RyZWFtRGVmYXVsdENvbnRyb2xsZXI8VWludDhBcnJheT4sXG4gICAgICApIHtcbiAgICAgICAgY2h1bmsgPSBhd2FpdCBjaHVuaztcbiAgICAgICAgc3dpdGNoICh0eXBlb2YgY2h1bmspIHtcbiAgICAgICAgICBjYXNlIFwib2JqZWN0XCI6XG4gICAgICAgICAgICBpZiAoY2h1bmsgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgY29udHJvbGxlci50ZXJtaW5hdGUoKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoQXJyYXlCdWZmZXIuaXNWaWV3KGNodW5rKSkge1xuICAgICAgICAgICAgICBjb250cm9sbGVyLmVucXVldWUoXG4gICAgICAgICAgICAgICAgbmV3IFVpbnQ4QXJyYXkoXG4gICAgICAgICAgICAgICAgICBjaHVuay5idWZmZXIsXG4gICAgICAgICAgICAgICAgICBjaHVuay5ieXRlT2Zmc2V0LFxuICAgICAgICAgICAgICAgICAgY2h1bmsuYnl0ZUxlbmd0aCxcbiAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICAgQXJyYXkuaXNBcnJheShjaHVuaykgJiZcbiAgICAgICAgICAgICAgY2h1bmsuZXZlcnkoKHZhbHVlKSA9PiB0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKG5ldyBVaW50OEFycmF5KGNodW5rKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICB0eXBlb2YgY2h1bmsudmFsdWVPZiA9PT0gXCJmdW5jdGlvblwiICYmIGNodW5rLnZhbHVlT2YoKSAhPT0gY2h1bmtcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICB0aGlzLnRyYW5zZm9ybShjaHVuay52YWx1ZU9mKCksIGNvbnRyb2xsZXIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChcInRvSlNPTlwiIGluIGNodW5rKSB7XG4gICAgICAgICAgICAgIHRoaXMudHJhbnNmb3JtKEpTT04uc3RyaW5naWZ5KGNodW5rKSwgY29udHJvbGxlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIFwic3ltYm9sXCI6XG4gICAgICAgICAgICBjb250cm9sbGVyLmVycm9yKFxuICAgICAgICAgICAgICBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IHRyYW5zZm9ybSBhIHN5bWJvbCB0byBhIFVpbnQ4QXJyYXlcIiksXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBcInVuZGVmaW5lZFwiOlxuICAgICAgICAgICAgY29udHJvbGxlci5lcnJvcihcbiAgICAgICAgICAgICAgbmV3IFR5cGVFcnJvcihcIkNhbm5vdCB0cmFuc2Zvcm0gdW5kZWZpbmVkIHRvIGEgVWludDhBcnJheVwiKSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKHRoaXMuZW5jb2Rlci5lbmNvZGUoU3RyaW5nKGNodW5rKSkpO1xuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgZW5jb2RlcjogbmV3IFRleHRFbmNvZGVyKCksXG4gICAgfTtcbiAgICBzdXBlcihpbml0KTtcbiAgfVxufVxuXG5jb25zdCByZXBsYWNlbWVudHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIFwiL1wiOiBcIl9cIixcbiAgXCIrXCI6IFwiLVwiLFxuICBcIj1cIjogXCJcIixcbn07XG5cbmNvbnN0IGVuY29kZXIgPSBuZXcgVGV4dEVuY29kZXIoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGVuY29kZUJhc2U2NFNhZmUoZGF0YTogc3RyaW5nIHwgQXJyYXlCdWZmZXIpOiBzdHJpbmcge1xuICByZXR1cm4gYmFzZTY0LmVuY29kZShkYXRhKS5yZXBsYWNlKC9cXC98XFwrfD0vZywgKGMpID0+IHJlcGxhY2VtZW50c1tjXSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbXBvcnRLZXkoa2V5OiBLZXkpOiBQcm9taXNlPENyeXB0b0tleT4ge1xuICBpZiAodHlwZW9mIGtleSA9PT0gXCJzdHJpbmdcIikge1xuICAgIGtleSA9IGVuY29kZXIuZW5jb2RlKGtleSk7XG4gIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShrZXkpIHx8IGtleSBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB7XG4gICAgLy8gVE9ETyhAa2l0c29uaykgZG9uJ3QgdHJhbnNmb3JtIEFCIHdoZW4gaHR0cHM6Ly9naXRodWIuY29tL2Rlbm9sYW5kL2Rlbm8vaXNzdWVzLzExNjY0IGlzIGZpeGVkXG4gICAga2V5ID0gbmV3IFVpbnQ4QXJyYXkoa2V5KTtcbiAgfVxuICByZXR1cm4gZ2xvYmFsVGhpcy5jcnlwdG8uc3VidGxlLmltcG9ydEtleShcbiAgICBcInJhd1wiLFxuICAgIGtleSxcbiAgICB7XG4gICAgICBuYW1lOiBcIkhNQUNcIixcbiAgICAgIGhhc2g6IHsgbmFtZTogXCJTSEEtMjU2XCIgfSxcbiAgICB9LFxuICAgIHRydWUsXG4gICAgW1wic2lnblwiLCBcInZlcmlmeVwiXSxcbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNpZ24oZGF0YTogRGF0YSwga2V5OiBDcnlwdG9LZXkpOiBQcm9taXNlPEFycmF5QnVmZmVyPiB7XG4gIGlmICh0eXBlb2YgZGF0YSA9PT0gXCJzdHJpbmdcIikge1xuICAgIGRhdGEgPSBlbmNvZGVyLmVuY29kZShkYXRhKTtcbiAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgZGF0YSA9IFVpbnQ4QXJyYXkuZnJvbShkYXRhKTtcbiAgfVxuICByZXR1cm4gY3J5cHRvLnN1YnRsZS5zaWduKFwiSE1BQ1wiLCBrZXksIGRhdGEpO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUlBLE1BQU0sR0FBRyxNQUFNLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLE1BQU0sUUFBUSxDQUFXO0FBQzVFLE1BQU0sR0FBRyxlQUFlLFFBQVEsQ0FBZ0I7QUFJaEQsS0FBSyxDQUFDLG1CQUFtQjtBQUV6QixLQUFLLENBQUMsSUFBSSxHQUFHLENBQUksSUFBQyxVQUFVLENBQUMsQ0FBQztB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