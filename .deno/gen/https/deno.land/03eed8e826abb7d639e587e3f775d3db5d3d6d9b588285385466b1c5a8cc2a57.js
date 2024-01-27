// Copyright 2021-2022 the Deno authors. All rights reserved. MIT license.
import { delay } from "https://deno.land/std@0.120.0/async/mod.ts";
import * as colors from "https://deno.land/std@0.120.0/fmt/colors.ts";
import { STATUS_TEXT } from "https://deno.land/std@0.120.0/http/http_status.ts";
const GA_TRACKING_ID = "GA_TRACKING_ID";
const GA_BATCH_ENDPOINT = "https://www.google-analytics.com/batch";
const GA_MAX_PARAM_LENGTH = 2_048; // 2kb
const GA_MAX_PAYLOAD_LENGTH = 8_092; // 8kb
const GA_MAX_BATCH_PAYLOAD_COUNT = 20;
const GA_MAX_BATCH_LENGTH = 16_386; // 16kb
const UPLOAD_DELAY = 1_000;
const SLOW_UPLOAD_THRESHOLD = 1_000;
const encoder = new TextEncoder();
const batch = new Uint8Array(GA_MAX_BATCH_LENGTH);
const queue = [];
let uploading = false;
/** Create a queue that dispatches queued messages to the endpoint, returning
 * the enqueue function. */ function createEnqueue(endpoint, log, warn) {
    async function upload() {
        while(queue.length){
            let count = 0;
            let length = 0;
            while(count < Math.min(queue.length, GA_MAX_BATCH_PAYLOAD_COUNT)){
                const payload = queue[count];
                if (length + payload.length > GA_MAX_BATCH_LENGTH) {
                    break;
                }
                batch.set(payload, length);
                count += 1;
                length += payload.length;
            }
            const body = batch.subarray(0, length);
            try {
                const start = performance.now();
                const res = await fetch(endpoint, {
                    method: "POST",
                    body
                });
                const duration = performance.now() - start;
                if ((res.status !== 200 || duration >= SLOW_UPLOAD_THRESHOLD) && warn) {
                    log(`batch uploaded ${count} items in ${duration}ms. Response: ${res.status} ${res.statusText}`);
                }
                // Google says not to retry when it reports a non-200 status code.
                queue.splice(0, count);
            } catch (err) {
                if (warn) {
                    log(`batch upload failed: ${err}`);
                }
                await delay(UPLOAD_DELAY);
            }
        }
        uploading = false;
    }
    return function enqueue(payload) {
        queue.push(payload);
        if (!uploading) {
            uploading = true;
            setTimeout(upload, UPLOAD_DELAY);
        }
    };
}
function defaultLog(msg) {
    console.warn(`[ga] ${colors.yellow("warn")}: ${msg}`);
}
/** Create a SHA-1 hex string digest of the supplied message. */ async function toDigest(msg) {
    const buffer = await crypto.subtle.digest("SHA-1", encoder.encode(msg));
    return Array.from(new Uint8Array(buffer)).map((b)=>b.toString(16).padStart(2, "0")).join("");
}
/** Convert a Google Analytics message into a Uint8Array. */ function toPayload(message) {
    const entries = Object.entries(message).filter(([, v])=>v).map(([k, v])=>[
            k,
            String(v).slice(0, GA_MAX_PARAM_LENGTH)
        ]);
    const params = new URLSearchParams(entries);
    const item = `${params.toString()}\n`;
    return encoder.encode(item);
}
/** Convert a response status, status text and error into an "exception"
 * string. */ function toException(status, statusText, error) {
    let exception;
    if (status >= 400) {
        exception = `${status} ${statusText}`;
        if (error != null) {
            exception += ` (${String(error)})`;
        }
    }
    return exception;
}
/** Create and return a function which will dispatch messages to Google
 * Analytics.
 *
 * ### Examples
 *
 * #### Using `std/http`
 *
 * ```ts
 * import { createReporter } from "https://deno.land/x/g_a/mod.ts";
 * import { serve } from "https://deno.land/std/http/server.ts";
 * import type { ConnInfo } from "https://deno.land/std/http/server.ts";
 *
 * const ga = createReporter();
 *
 * function handler(req: Request, conn: ConnInfo) {
 *   let err;
 *   let res: Response;
 *   const start = performance.now();
 *   try {
 *     // processing of the request...
 *     res = new Response();
 *   } catch (e) {
 *     err = e;
 *   } finally {
 *     ga(req, conn, res!, start, err);
 *   }
 *   return res!;
 * }
 *
 * serve(handler);
 * ```
 *
 * #### Using low level APIs
 *
 * ```ts
 * import { createReporter } from "https://deno.land/x/g_a/mod.ts";
 *
 * const ga = createReporter();
 *
 * for await (const conn of Deno.listen({ port: 0 })) {
 *   (async () => {
 *     const httpConn = Deno.serveHttp(conn);
 *     for await (const requestEvent of httpConn) {
 *       let err;
 *       const start = performance.now();
 *       try {
 *         // processing of the request...
 *         const response = new Response();
 *         await requestEvent.respondWith(response);
 *       } catch (e) {
 *         err = e;
 *       } finally {
 *         await ga(requestEvent.request, conn, response, start, err);
 *       }
 *     }
 *   })();
 * }
 * ```
 *
 * @param options an optional set of options the impact the behavior of the
 *                returned reporter.
 * @returns the reporter function used to enqueue messages to dispatch to Google
 *          Analytics. */ export function createReporter(options = {}) {
    const { endpoint =GA_BATCH_ENDPOINT , filter =()=>true , id =Deno.env.get(GA_TRACKING_ID) , log =defaultLog , metaData =()=>undefined , warn =true ,  } = options;
    if (!id && warn) {
        log("GA_TRACKING_ID environment variable not set. Google Analytics reporting disabled.");
    }
    const enqueue = createEnqueue(endpoint, log, warn);
    return async function report(req, conn, res, start, error) {
        // Cannot report if no analytics ID
        if (!id) {
            return;
        }
        // Do not report 1XX or 3XX statuses to GA
        if (!(res.ok || res.status >= 400)) {
            return;
        }
        // Filter out any unwanted requests
        if (!filter(req, res)) {
            return;
        }
        const duration = performance.now() - start;
        const status = res.status;
        const statusText = res.statusText || STATUS_TEXT.get(status) || `${status}`;
        const userAgent = req.headers.get("user-agent");
        // TODO(@piscisaureus): validate that the 'cf-connecting-ip' header was
        // actually set by cloudflare. See https://www.cloudflare.com/en-gb/ips/.
        const [ip] = ((req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip")) ?? conn.remoteAddr.hostname).split(/\s*,\s*/);
        const { documentTitle , campaignMedium , campaignSource  } = metaData(req, res) ?? {};
        const exception = toException(status, statusText, error);
        const hitType = exception != null ? "exception" : "pageview";
        const message = {
            v: 1,
            tid: id,
            t: hitType,
            cid: await toDigest(ip),
            uip: ip,
            dl: req.url,
            dt: documentTitle,
            dr: req.headers.get("referer"),
            cm: campaignMedium,
            cs: campaignSource,
            ua: userAgent,
            exd: exception,
            exf: exception != null,
            srt: duration,
            qt: uploading ? 0 : UPLOAD_DELAY
        };
        const payload = toPayload(message);
        if (payload.length > GA_MAX_PAYLOAD_LENGTH) {
            if (warn) {
                log(`payload exceeds maximum size: ${JSON.stringify(message)}`);
            }
            return;
        }
        enqueue(payload);
    };
}
/** Creates and returns a reporting measurement middleware for oak, which will
 * generate and send to Google Analytics measurements for each request handled
 * by an oak application.
 *
 * ### Examples
 *
 * ```ts
 * import { createReportMiddleware } from "https://deno.land/x/g_a/mod.ts";
 * import { Application } from "https://deno.land/x/oak/mod.ts";
 *
 * const ga = createReportMiddleware();
 * const app = new Application();
 *
 * app.use(ga);
 * // register additional middleware...
 *
 * app.listen({ port: 0 });
 * ```
 *
 * @param options an optional set of options which affects the behavior of the
 *                returned middleware.
 * @returns middleware which should be registered early in the stack with the
 *          application.
 */ export function createReportMiddleware(options = {}) {
    const { endpoint =GA_BATCH_ENDPOINT , filter =()=>true , id =Deno.env.get(GA_TRACKING_ID) , log =defaultLog , metaData =()=>undefined , warn =true ,  } = options;
    if (!id && warn) {
        log("GA_TRACKING_ID environment variable not set. Google Analytics reporting disabled.");
    }
    const enqueue = createEnqueue(endpoint, log, warn);
    return async function reporter(ctx, next) {
        if (!id || !filter(ctx)) {
            return next();
        }
        let error;
        const start = performance.now();
        try {
            await next();
        } catch (e) {
            error = e;
        } finally{
            // Only report 2XX and >= 4XX status to GA
            const status = ctx.response.status;
            if (status >= 200 && status < 300 || status >= 400) {
                const duration = performance.now() - start;
                const statusText = STATUS_TEXT.get(status) ?? `${status}`;
                const ip = ctx.request.ip;
                const { documentTitle , campaignMedium , campaignSource  } = metaData(ctx) ?? {};
                const exception = toException(status, statusText, error);
                const hitType = exception != null ? "exception" : "pageview";
                const message = {
                    v: 1,
                    tid: id,
                    t: hitType,
                    cid: await toDigest(ip),
                    uip: ip,
                    dl: ctx.request.url.toString(),
                    dt: documentTitle,
                    dr: ctx.request.headers.get("referer"),
                    cm: campaignMedium,
                    cs: campaignSource,
                    ua: ctx.request.headers.get("user-agent"),
                    exd: exception,
                    exf: exception != null,
                    srt: duration,
                    qt: uploading ? 0 : UPLOAD_DELAY
                };
                const payload = toPayload(message);
                if (payload.length <= GA_MAX_PAYLOAD_LENGTH) {
                    enqueue(payload);
                } else if (warn) {
                    log(`payload exceeds maximum size: ${JSON.stringify(message)}`);
                }
            }
        }
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvZ19hQDAuMS4yL21vZC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAyMS0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG5pbXBvcnQgeyBkZWxheSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAMC4xMjAuMC9hc3luYy9tb2QudHNcIjtcbmltcG9ydCAqIGFzIGNvbG9ycyBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQDAuMTIwLjAvZm10L2NvbG9ycy50c1wiO1xuaW1wb3J0IHsgU1RBVFVTX1RFWFQgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkQDAuMTIwLjAvaHR0cC9odHRwX3N0YXR1cy50c1wiO1xuaW1wb3J0IHR5cGUgeyBDb250ZXh0IH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMC4xLjAvY29udGV4dC50c1wiO1xuaW1wb3J0IHR5cGUgeyBNaWRkbGV3YXJlIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMC4xLjAvbWlkZGxld2FyZS50c1wiO1xuXG5jb25zdCBHQV9UUkFDS0lOR19JRCA9IFwiR0FfVFJBQ0tJTkdfSURcIjtcbmNvbnN0IEdBX0JBVENIX0VORFBPSU5UID0gXCJodHRwczovL3d3dy5nb29nbGUtYW5hbHl0aWNzLmNvbS9iYXRjaFwiO1xuY29uc3QgR0FfTUFYX1BBUkFNX0xFTkdUSCA9IDJfMDQ4OyAvLyAya2JcbmNvbnN0IEdBX01BWF9QQVlMT0FEX0xFTkdUSCA9IDhfMDkyOyAvLyA4a2JcbmNvbnN0IEdBX01BWF9CQVRDSF9QQVlMT0FEX0NPVU5UID0gMjA7XG5jb25zdCBHQV9NQVhfQkFUQ0hfTEVOR1RIID0gMTZfMzg2OyAvLyAxNmtiXG5jb25zdCBVUExPQURfREVMQVkgPSAxXzAwMDtcbmNvbnN0IFNMT1dfVVBMT0FEX1RIUkVTSE9MRCA9IDFfMDAwO1xuXG4vKiogQSBuYXJyb3dlZCBkb3duIHZlcnNpb24gb2YgYERlbm8uQ29ubmAgd2hpY2ggb25seSBjb250YWlucyB0aGUgaW5mb3JtYXRpb25cbiAqIHdoaWNoIHRoZSBsaWJyYXJ5IHVzYWdlcy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ29ubiB7XG4gIHJlYWRvbmx5IHJlbW90ZUFkZHI6IERlbm8uQWRkcjtcbn1cblxuLyoqIFRoZSBzaGFwZSBvZiB0aGUgR29vZ2xlIEFuYWx5dGljcyBtZWFzdXJlbWVudCB0aGF0IGlzIHN1cHBvcnRlZC5cbiAqXG4gKiBSZWY6IGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL2FuYWx5dGljcy9kZXZndWlkZXMvY29sbGVjdGlvbi9wcm90b2NvbC92MS9wYXJhbWV0ZXJzXG4gKi9cbmludGVyZmFjZSBHQU1lYXN1cmVtZW50IHtcbiAgdjogMTtcbiAgdGlkOiBzdHJpbmc7XG4gIHQ6XG4gICAgfCBcInBhZ2V2aWV3XCJcbiAgICB8IFwic2NyZWVudmlld1wiXG4gICAgfCBcImV2ZW50XCJcbiAgICB8IFwidHJhbnNhY3Rpb25cIlxuICAgIHwgXCJpdGVtXCJcbiAgICB8IFwic29jaWFsXCJcbiAgICB8IFwiZXhjZXB0aW9uXCJcbiAgICB8IFwidGltaW5nXCI7XG4gIGNpZDogc3RyaW5nO1xuICB1aXA6IHN0cmluZztcbiAgZGw6IHN0cmluZztcbiAgZHQ/OiBzdHJpbmc7XG4gIGRyPzogc3RyaW5nIHwgbnVsbDtcbiAgY20/OiBzdHJpbmc7XG4gIGNzPzogc3RyaW5nO1xuICB1YT86IHN0cmluZyB8IG51bGw7XG4gIGV4ZD86IHN0cmluZztcbiAgZXhmOiBib29sZWFuO1xuICBzcnQ6IG51bWJlcjtcbiAgcXQ6IG51bWJlcjtcbn1cblxuLyoqIFNwZWNpYWxpemVkIGRhdGEgZmllbGRzIHRoYXQgYXJlIHN1cHBvcnRlZCBiZWluZyBzZXQgdmlhIGEgY2FsbGJhY2suICovXG5leHBvcnQgaW50ZXJmYWNlIE1ldGFEYXRhIHtcbiAgLyoqIFRoZSB2YWx1ZSB0byBiZSBhc3NpZ25lZCB0byB0aGUgYGNtYCBmaWVsZCBpbiB0aGUgbWVhc3VyZW1lbnQgcGF5bG9hZC4gKi9cbiAgY2FtcGFpZ25NZWRpdW0/OiBzdHJpbmc7XG4gIC8qKiBUaGUgdmFsdWUgdG8gYmUgYXNzaWduZWQgdG8gdGhlIGBjc2AgZmllbGQgaW4gdGhlIG1lYXN1cmVtZW50IHBheWxvYWQuICovXG4gIGNhbXBhaWduU291cmNlPzogc3RyaW5nO1xuICAvKiogVGhlIHZhbHVlIHRvIGJlIGFzc2lnbmVkIHRvIHRoZSBgZHRgIGZpZWxkIGluIHRoZSBtZWFzdXJlbWVudCBwYXlsb2FkLiAqL1xuICBkb2N1bWVudFRpdGxlPzogc3RyaW5nO1xufVxuXG4vKiogVGhlIGludGVyZmFjZSByZXR1cm5lZCBmcm9tIGBjcmVhdGVSZXBvcnRlcigpYCB0aGF0IGlzIHRoZW4gY2FsbGVkIHRvXG4gKiBlbnF1ZXVlIG1lYXN1cmVtZW50IG1lc3NhZ2VzIHRvIGJlIHNlbnQgdG8gR29vZ2xlIEFuYWx5dGljcy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgUmVwb3J0ZXIge1xuICAvKipcbiAgICogQSByZXBvcnRlciBmdW5jdGlvbiB3aGljaCB3aWxsIGFzeW5jaHJvbm91c2x5IGRpc3BhdGNoIG1lYXN1cmVtZW50IG1lc3NhZ2VzXG4gICAqIHRvIEdvb2dsZSBBbmFseXRpY3MuXG4gICAqXG4gICAqIEBwYXJhbSByZXEgdGhlIHdlYiBzdGFuZGFyZCByZXF1ZXN0IHJlY2VpdmVkXG4gICAqIEBwYXJhbSBjb25uIHRoZSBjb25uZWN0aW9uIGluZm9ybWF0aW9uIG9mIHRoZSByZXF1ZXN0XG4gICAqIEBwYXJhbSByZXMgdGhlIHdlYiBzdGFuZGFyZCByZXNwb25zZSBiZWluZyBzZW50XG4gICAqIEBwYXJhbSBzdGFydCB0aGUgdGltZSBpbiBtaWxsaXNlY29uZHMgd2hlbiB0aGUgcmVxdWVzdCBzdGFydGVkIGJlaW5nXG4gICAqICAgICAgICAgICAgICBoYW5kbGVkXG4gICAqIEBwYXJhbSBlcnJvciBhbnkgZXJyb3IgYXNzb2NpYXRlZCB3aXRoIGhhbmRsaW5nIHRoZSByZXF1ZXN0L3Jlc3BvbnNlXG4gICAqIEByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gdGhlIG1lYXN1cmVtZW50IGlzIGVucXVldWVkIHRvIGJlXG4gICAqICAgICAgICAgIHNlbnQgdG8gR29vZ2xlIEFuYWx5dGljcy5cbiAgICovXG4gIChcbiAgICByZXE6IFJlcXVlc3QsXG4gICAgY29ubjogQ29ubixcbiAgICByZXM6IFJlc3BvbnNlLFxuICAgIHN0YXJ0OiBudW1iZXIsXG4gICAgZXJyb3I/OiB1bmtub3duLFxuICApOiBQcm9taXNlPHZvaWQ+O1xufVxuXG4vKiogT3B0aW9ucyB3aGljaCBjYW4gYmUgc3VwcGxpZWQgdG8gdGhlIGBjcmVhdGVSZXBvcnRlcigpYCBmYWN0b3J5IGZ1bmN0aW9uLiAqL1xuZXhwb3J0IGludGVyZmFjZSBSZXBvcnRlck9wdGlvbnMge1xuICAvKiogVGhlIGJhdGNoIEdvb2dsZSBBbmFseXRpY3MgZW5kcG9pbnQgdG8gc2VuZCBtZXNzYWdlcyB0by4gIFRoaXMgZGVmYXVsdHNcbiAgICogdG8gYGh0dHBzOi8vd3d3Lmdvb2dsZS1hbmFseXRpY3MuY29tL2JhdGNoYC4gKi9cbiAgZW5kcG9pbnQ/OiBzdHJpbmc7XG4gIC8qKiBBbiBvcHRpb25hbCBjYWxsYmFjayB3aGljaCBkZXRlcm1pbmVzIGlmIGEgcGFydGljdWxhciByZXF1ZXN0IHNob3VsZFxuICAgKiBnZW5lcmF0ZSBhIG1lYXN1cmVtZW50IG1lc3NhZ2UuXG4gICAqXG4gICAqIEBwYXJhbSByZXEgdGhlIGN1cnJlbnQgYFJlcXVlc3RgIG9iamVjdC5cbiAgICogQHBhcmFtIHJlcyB0aGUgY3VycmVudCBgUmVzcG9uc2VgIG9iamVjdC5cbiAgICogQHJldHVybnMgYHRydWVgIGlmIHRoZSByZXF1ZXN0IHNob3VsZCBnZW5lcmF0ZSBhIG1lYXN1cmVtZW50LCBvciBgZmFsc2VgLlxuICAgKi9cbiAgZmlsdGVyPyhyZXE6IFJlcXVlc3QsIHJlczogUmVzcG9uc2UpOiBib29sZWFuO1xuICAvKiogVGhlIEdvb2dsZSBBbmFseXRpY3Mgd2ViIHByb3BlcnR5IElELiBUaGlzIGRlZmF1bHRzIHRvIGJlaW5nIHJlYWQgZnJvbSB0aGVcbiAgICogYEdBX1RSQUNLSU5HX0lEYCBlbnZpcm9ubWVudCB2YXJpYWJsZS4gSWYgbmVpdGhlciB0aGUgcHJvcGVydHkgSUQgaXMgcGFzc2VkXG4gICAqIG5vciBpcyB0aGUgZW52aXJvbm1lbnQgdmFyaWFibGUgc2V0LCBkaXNwYXRjaGluZyB3aWxsIGJlIGRpc2FibGVkLiAqL1xuICBpZD86IHN0cmluZztcbiAgLyoqIEFuIG9wdGlvbmFsIGZ1bmN0aW9uL21ldGhvZCBmb3IgbG9nZ2luZyB3YXJuaW5nIG1lc3NhZ2VzIGdlbmVyYXRlZCBmcm9tXG4gICAqIHRoZSBsaWJyYXJ5LiBUaGlzIGRlZmF1bHRzIHRvIGxvZ2dpbmcgdG8gYGNvbnNvbGUud2FybigpYC4gKi9cbiAgbG9nPyhtc2c6IHN0cmluZyk6IHZvaWQ7XG4gIC8qKiBBbiBvcHRpb25hbCBjYWxsYmFjayB3aGljaCBwcm92aWRlcyBvcHRpb25hbCBkYXRhIHRvIGVucmljaCB0aGVcbiAgICogbWVhc3VyZW1lbnQgbWVzc2FnZS5cbiAgICpcbiAgICogQHBhcmFtIHJlcSB0aGUgY3VycmVudCBgUmVxdWVzdGAgb2JqZWN0LlxuICAgKiBAcGFyYW0gcmVzIHRoZSBjdXJyZW50IGBSZXNwb25zZWAgb2JqZWN0LlxuICAgKiBAcmV0dXJucyBUaGUgbWV0YSBkYXRhIHRvIGVucmljaCB0aGUgbWVhc3VyZW1lbnQsIG9yIGB1bmRlZmluZWRgLlxuICAgKi9cbiAgbWV0YURhdGE/KHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSk6IE1ldGFEYXRhIHwgdW5kZWZpbmVkO1xuICAvKiogQSBib29sZWFuIHdoaWNoIGRlZmF1bHRzIHRvIGB0cnVlYCB0aGF0IGluZGljYXRlcyBpZiB0aGUgbGlicmFyeSBzaG91bGRcbiAgICogbG9nIHdhcm5pbmcgbWVzc2FnZXMgb3Igbm90LiAqL1xuICB3YXJuPzogYm9vbGVhbjtcbn1cblxuLyoqIE9wdGlvbnMgd2hpY2ggY2FuIGJlIHN1cHBsaWVkIHRvIHRoZSBgY3JlYXRlUmVwb3J0ZXJNaWRkbGV3YXJlKClgIGZhY3RvcnlcbiAqIGZ1bmN0aW9uLiAqL1xuZXhwb3J0IGludGVyZmFjZSBSZXBvcnRNaWRkbGV3YXJlT3B0aW9ucyB7XG4gIC8qKiBUaGUgYmF0Y2ggR29vZ2xlIEFuYWx5dGljcyBlbmRwb2ludCB0byBzZW5kIG1lc3NhZ2VzIHRvLiAgVGhpcyBkZWZhdWx0c1xuICAgKiB0byBgaHR0cHM6Ly93d3cuZ29vZ2xlLWFuYWx5dGljcy5jb20vYmF0Y2hgLiAqL1xuICBlbmRwb2ludD86IHN0cmluZztcbiAgLyoqIEFuIG9wdGlvbmFsIGNhbGxiYWNrIHdoaWNoIGRldGVybWluZXMgaWYgYSBwYXJ0aWN1bGFyIHJlcXVlc3Qgc2hvdWxkXG4gICAqIGdlbmVyYXRlIGEgbWVhc3VyZW1lbnQgbWVzc2FnZS5cbiAgICpcbiAgICogQHBhcmFtIGN0eCB0aGUgY29udGV4dCByZWxhdGVkIHRvIHRoZSByZXF1ZXN0L3Jlc3BvbnNlIGJlaW5nIHByb2Nlc3NlZFxuICAgKiBAcmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHJlcXVlc3Qgc2hvdWxkIGdlbmVyYXRlIGEgbWVhc3VyZW1lbnQsIG9yIGBmYWxzZWAuXG4gICAqL1xuICBmaWx0ZXI/KGN0eDogQ29udGV4dCk6IGJvb2xlYW47XG4gIC8qKiBUaGUgR29vZ2xlIEFuYWx5dGljcyB3ZWIgcHJvcGVydHkgSUQuIFRoaXMgZGVmYXVsdHMgdG8gYmVpbmcgcmVhZCBmcm9tIHRoZVxuICAgKiBgR0FfVFJBQ0tJTkdfSURgIGVudmlyb25tZW50IHZhcmlhYmxlLiBJZiBuZWl0aGVyIHRoZSBwcm9wZXJ0eSBJRCBpcyBwYXNzZWRcbiAgICogbm9yIGlzIHRoZSBlbnZpcm9ubWVudCB2YXJpYWJsZSBzZXQsIGRpc3BhdGNoaW5nIHdpbGwgYmUgZGlzYWJsZWQuICovXG4gIGlkPzogc3RyaW5nO1xuICAvKiogQW4gb3B0aW9uYWwgZnVuY3Rpb24vbWV0aG9kIGZvciBsb2dnaW5nIHdhcm5pbmcgbWVzc2FnZXMgZ2VuZXJhdGVkIGZyb21cbiAgICogdGhlIGxpYnJhcnkuIFRoaXMgZGVmYXVsdHMgdG8gbG9nZ2luZyB0byBgY29uc29sZS53YXJuKClgLiAqL1xuICBsb2c/KG1zZzogc3RyaW5nKTogdm9pZDtcbiAgLyoqIEFuIG9wdGlvbmFsIGNhbGxiYWNrIHdoaWNoIHByb3ZpZGVzIG9wdGlvbmFsIGRhdGEgdG8gZW5yaWNoIHRoZVxuICAgKiBtZWFzdXJlbWVudCBtZXNzYWdlLlxuICAgKlxuICAgKiBAcGFyYW0gY3R4IHRoZSBjb250ZXh0IHJlbGF0ZWQgdG8gdGhlIHJlcXVlc3QvcmVzcG9uc2UgYmVpbmcgcHJvY2Vzc2VkXG4gICAqIEByZXR1cm5zIFRoZSBtZXRhIGRhdGEgdG8gZW5yaWNoIHRoZSBtZWFzdXJlbWVudCwgb3IgYHVuZGVmaW5lZGAuXG4gICAqL1xuICBtZXRhRGF0YT8oY3R4OiBDb250ZXh0KTogTWV0YURhdGEgfCB1bmRlZmluZWQ7XG4gIC8qKiBBIGJvb2xlYW4gd2hpY2ggZGVmYXVsdHMgdG8gYHRydWVgIHRoYXQgaW5kaWNhdGVzIGlmIHRoZSBsaWJyYXJ5IHNob3VsZFxuICAgKiBsb2cgd2FybmluZyBtZXNzYWdlcyBvciBub3QuICovXG4gIHdhcm4/OiBib29sZWFuO1xufVxuXG5jb25zdCBlbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKCk7XG5jb25zdCBiYXRjaCA9IG5ldyBVaW50OEFycmF5KEdBX01BWF9CQVRDSF9MRU5HVEgpO1xuY29uc3QgcXVldWU6IFVpbnQ4QXJyYXlbXSA9IFtdO1xubGV0IHVwbG9hZGluZyA9IGZhbHNlO1xuXG4vKiogQ3JlYXRlIGEgcXVldWUgdGhhdCBkaXNwYXRjaGVzIHF1ZXVlZCBtZXNzYWdlcyB0byB0aGUgZW5kcG9pbnQsIHJldHVybmluZ1xuICogdGhlIGVucXVldWUgZnVuY3Rpb24uICovXG5mdW5jdGlvbiBjcmVhdGVFbnF1ZXVlKFxuICBlbmRwb2ludDogc3RyaW5nLFxuICBsb2c6IChtc2c6IHN0cmluZykgPT4gdm9pZCxcbiAgd2FybjogYm9vbGVhbixcbikge1xuICBhc3luYyBmdW5jdGlvbiB1cGxvYWQoKSB7XG4gICAgd2hpbGUgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgbGV0IGNvdW50ID0gMDtcbiAgICAgIGxldCBsZW5ndGggPSAwO1xuICAgICAgd2hpbGUgKGNvdW50IDwgTWF0aC5taW4ocXVldWUubGVuZ3RoLCBHQV9NQVhfQkFUQ0hfUEFZTE9BRF9DT1VOVCkpIHtcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IHF1ZXVlW2NvdW50XTtcbiAgICAgICAgaWYgKGxlbmd0aCArIHBheWxvYWQubGVuZ3RoID4gR0FfTUFYX0JBVENIX0xFTkdUSCkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGJhdGNoLnNldChwYXlsb2FkLCBsZW5ndGgpO1xuICAgICAgICBjb3VudCArPSAxO1xuICAgICAgICBsZW5ndGggKz0gcGF5bG9hZC5sZW5ndGg7XG4gICAgICB9XG4gICAgICBjb25zdCBib2R5ID0gYmF0Y2guc3ViYXJyYXkoMCwgbGVuZ3RoKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goZW5kcG9pbnQsIHsgbWV0aG9kOiBcIlBPU1RcIiwgYm9keSB9KTtcbiAgICAgICAgY29uc3QgZHVyYXRpb24gPSBwZXJmb3JtYW5jZS5ub3coKSAtIHN0YXJ0O1xuXG4gICAgICAgIGlmICgocmVzLnN0YXR1cyAhPT0gMjAwIHx8IGR1cmF0aW9uID49IFNMT1dfVVBMT0FEX1RIUkVTSE9MRCkgJiYgd2Fybikge1xuICAgICAgICAgIGxvZyhcbiAgICAgICAgICAgIGBiYXRjaCB1cGxvYWRlZCAke2NvdW50fSBpdGVtcyBpbiAke2R1cmF0aW9ufW1zLiBSZXNwb25zZTogJHtyZXMuc3RhdHVzfSAke3Jlcy5zdGF0dXNUZXh0fWAsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEdvb2dsZSBzYXlzIG5vdCB0byByZXRyeSB3aGVuIGl0IHJlcG9ydHMgYSBub24tMjAwIHN0YXR1cyBjb2RlLlxuICAgICAgICBxdWV1ZS5zcGxpY2UoMCwgY291bnQpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGlmICh3YXJuKSB7XG4gICAgICAgICAgbG9nKGBiYXRjaCB1cGxvYWQgZmFpbGVkOiAke2Vycn1gKTtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBkZWxheShVUExPQURfREVMQVkpO1xuICAgICAgfVxuICAgIH1cbiAgICB1cGxvYWRpbmcgPSBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiBmdW5jdGlvbiBlbnF1ZXVlKHBheWxvYWQ6IFVpbnQ4QXJyYXkpIHtcbiAgICBxdWV1ZS5wdXNoKHBheWxvYWQpO1xuXG4gICAgaWYgKCF1cGxvYWRpbmcpIHtcbiAgICAgIHVwbG9hZGluZyA9IHRydWU7XG4gICAgICBzZXRUaW1lb3V0KHVwbG9hZCwgVVBMT0FEX0RFTEFZKTtcbiAgICB9XG4gIH07XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRMb2cobXNnOiBzdHJpbmcpIHtcbiAgY29uc29sZS53YXJuKGBbZ2FdICR7Y29sb3JzLnllbGxvdyhcIndhcm5cIil9OiAke21zZ31gKTtcbn1cblxuLyoqIENyZWF0ZSBhIFNIQS0xIGhleCBzdHJpbmcgZGlnZXN0IG9mIHRoZSBzdXBwbGllZCBtZXNzYWdlLiAqL1xuYXN5bmMgZnVuY3Rpb24gdG9EaWdlc3QobXNnOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBidWZmZXIgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChcIlNIQS0xXCIsIGVuY29kZXIuZW5jb2RlKG1zZykpO1xuICByZXR1cm4gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShidWZmZXIpKS5tYXAoKGIpID0+XG4gICAgYi50b1N0cmluZygxNikucGFkU3RhcnQoMiwgXCIwXCIpXG4gICkuam9pbihcIlwiKTtcbn1cblxuLyoqIENvbnZlcnQgYSBHb29nbGUgQW5hbHl0aWNzIG1lc3NhZ2UgaW50byBhIFVpbnQ4QXJyYXkuICovXG5mdW5jdGlvbiB0b1BheWxvYWQobWVzc2FnZTogR0FNZWFzdXJlbWVudCk6IFVpbnQ4QXJyYXkge1xuICBjb25zdCBlbnRyaWVzID0gT2JqZWN0LmVudHJpZXMobWVzc2FnZSkuZmlsdGVyKChbLCB2XSkgPT4gdikubWFwKChcbiAgICBbaywgdl0sXG4gICkgPT4gW2ssIFN0cmluZyh2KS5zbGljZSgwLCBHQV9NQVhfUEFSQU1fTEVOR1RIKV0pIGFzIFtzdHJpbmcsIHN0cmluZ11bXTtcbiAgY29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyhlbnRyaWVzKTtcbiAgY29uc3QgaXRlbSA9IGAke3BhcmFtcy50b1N0cmluZygpfVxcbmA7XG4gIHJldHVybiBlbmNvZGVyLmVuY29kZShpdGVtKTtcbn1cblxuLyoqIENvbnZlcnQgYSByZXNwb25zZSBzdGF0dXMsIHN0YXR1cyB0ZXh0IGFuZCBlcnJvciBpbnRvIGFuIFwiZXhjZXB0aW9uXCJcbiAqIHN0cmluZy4gKi9cbmZ1bmN0aW9uIHRvRXhjZXB0aW9uKFxuICBzdGF0dXM6IG51bWJlcixcbiAgc3RhdHVzVGV4dDogc3RyaW5nLFxuICBlcnJvcjogdW5rbm93bixcbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGxldCBleGNlcHRpb247XG4gIGlmIChzdGF0dXMgPj0gNDAwKSB7XG4gICAgZXhjZXB0aW9uID0gYCR7c3RhdHVzfSAke3N0YXR1c1RleHR9YDtcbiAgICBpZiAoZXJyb3IgIT0gbnVsbCkge1xuICAgICAgZXhjZXB0aW9uICs9IGAgKCR7U3RyaW5nKGVycm9yKX0pYDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGV4Y2VwdGlvbjtcbn1cblxuLyoqIENyZWF0ZSBhbmQgcmV0dXJuIGEgZnVuY3Rpb24gd2hpY2ggd2lsbCBkaXNwYXRjaCBtZXNzYWdlcyB0byBHb29nbGVcbiAqIEFuYWx5dGljcy5cbiAqXG4gKiAjIyMgRXhhbXBsZXNcbiAqXG4gKiAjIyMjIFVzaW5nIGBzdGQvaHR0cGBcbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgY3JlYXRlUmVwb3J0ZXIgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQveC9nX2EvbW9kLnRzXCI7XG4gKiBpbXBvcnQgeyBzZXJ2ZSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGQvaHR0cC9zZXJ2ZXIudHNcIjtcbiAqIGltcG9ydCB0eXBlIHsgQ29ubkluZm8gfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQvc3RkL2h0dHAvc2VydmVyLnRzXCI7XG4gKlxuICogY29uc3QgZ2EgPSBjcmVhdGVSZXBvcnRlcigpO1xuICpcbiAqIGZ1bmN0aW9uIGhhbmRsZXIocmVxOiBSZXF1ZXN0LCBjb25uOiBDb25uSW5mbykge1xuICogICBsZXQgZXJyO1xuICogICBsZXQgcmVzOiBSZXNwb25zZTtcbiAqICAgY29uc3Qgc3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAqICAgdHJ5IHtcbiAqICAgICAvLyBwcm9jZXNzaW5nIG9mIHRoZSByZXF1ZXN0Li4uXG4gKiAgICAgcmVzID0gbmV3IFJlc3BvbnNlKCk7XG4gKiAgIH0gY2F0Y2ggKGUpIHtcbiAqICAgICBlcnIgPSBlO1xuICogICB9IGZpbmFsbHkge1xuICogICAgIGdhKHJlcSwgY29ubiwgcmVzISwgc3RhcnQsIGVycik7XG4gKiAgIH1cbiAqICAgcmV0dXJuIHJlcyE7XG4gKiB9XG4gKlxuICogc2VydmUoaGFuZGxlcik7XG4gKiBgYGBcbiAqXG4gKiAjIyMjIFVzaW5nIGxvdyBsZXZlbCBBUElzXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IGNyZWF0ZVJlcG9ydGVyIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3gvZ19hL21vZC50c1wiO1xuICpcbiAqIGNvbnN0IGdhID0gY3JlYXRlUmVwb3J0ZXIoKTtcbiAqXG4gKiBmb3IgYXdhaXQgKGNvbnN0IGNvbm4gb2YgRGVuby5saXN0ZW4oeyBwb3J0OiAwIH0pKSB7XG4gKiAgIChhc3luYyAoKSA9PiB7XG4gKiAgICAgY29uc3QgaHR0cENvbm4gPSBEZW5vLnNlcnZlSHR0cChjb25uKTtcbiAqICAgICBmb3IgYXdhaXQgKGNvbnN0IHJlcXVlc3RFdmVudCBvZiBodHRwQ29ubikge1xuICogICAgICAgbGV0IGVycjtcbiAqICAgICAgIGNvbnN0IHN0YXJ0ID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gKiAgICAgICB0cnkge1xuICogICAgICAgICAvLyBwcm9jZXNzaW5nIG9mIHRoZSByZXF1ZXN0Li4uXG4gKiAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gbmV3IFJlc3BvbnNlKCk7XG4gKiAgICAgICAgIGF3YWl0IHJlcXVlc3RFdmVudC5yZXNwb25kV2l0aChyZXNwb25zZSk7XG4gKiAgICAgICB9IGNhdGNoIChlKSB7XG4gKiAgICAgICAgIGVyciA9IGU7XG4gKiAgICAgICB9IGZpbmFsbHkge1xuICogICAgICAgICBhd2FpdCBnYShyZXF1ZXN0RXZlbnQucmVxdWVzdCwgY29ubiwgcmVzcG9uc2UsIHN0YXJ0LCBlcnIpO1xuICogICAgICAgfVxuICogICAgIH1cbiAqICAgfSkoKTtcbiAqIH1cbiAqIGBgYFxuICpcbiAqIEBwYXJhbSBvcHRpb25zIGFuIG9wdGlvbmFsIHNldCBvZiBvcHRpb25zIHRoZSBpbXBhY3QgdGhlIGJlaGF2aW9yIG9mIHRoZVxuICogICAgICAgICAgICAgICAgcmV0dXJuZWQgcmVwb3J0ZXIuXG4gKiBAcmV0dXJucyB0aGUgcmVwb3J0ZXIgZnVuY3Rpb24gdXNlZCB0byBlbnF1ZXVlIG1lc3NhZ2VzIHRvIGRpc3BhdGNoIHRvIEdvb2dsZVxuICogICAgICAgICAgQW5hbHl0aWNzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJlcG9ydGVyKG9wdGlvbnM6IFJlcG9ydGVyT3B0aW9ucyA9IHt9KTogUmVwb3J0ZXIge1xuICBjb25zdCB7XG4gICAgZW5kcG9pbnQgPSBHQV9CQVRDSF9FTkRQT0lOVCxcbiAgICBmaWx0ZXIgPSAoKSA9PiB0cnVlLFxuICAgIGlkID0gRGVuby5lbnYuZ2V0KEdBX1RSQUNLSU5HX0lEKSxcbiAgICBsb2cgPSBkZWZhdWx0TG9nLFxuICAgIG1ldGFEYXRhID0gKCkgPT4gdW5kZWZpbmVkLFxuICAgIHdhcm4gPSB0cnVlLFxuICB9ID0gb3B0aW9ucztcbiAgaWYgKCFpZCAmJiB3YXJuKSB7XG4gICAgbG9nKFxuICAgICAgXCJHQV9UUkFDS0lOR19JRCBlbnZpcm9ubWVudCB2YXJpYWJsZSBub3Qgc2V0LiBHb29nbGUgQW5hbHl0aWNzIHJlcG9ydGluZyBkaXNhYmxlZC5cIixcbiAgICApO1xuICB9XG4gIGNvbnN0IGVucXVldWUgPSBjcmVhdGVFbnF1ZXVlKGVuZHBvaW50LCBsb2csIHdhcm4pO1xuXG4gIHJldHVybiBhc3luYyBmdW5jdGlvbiByZXBvcnQoXG4gICAgcmVxOiBSZXF1ZXN0LFxuICAgIGNvbm46IENvbm4sXG4gICAgcmVzOiBSZXNwb25zZSxcbiAgICBzdGFydDogbnVtYmVyLFxuICAgIGVycm9yPzogdW5rbm93bixcbiAgKSB7XG4gICAgLy8gQ2Fubm90IHJlcG9ydCBpZiBubyBhbmFseXRpY3MgSURcbiAgICBpZiAoIWlkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gRG8gbm90IHJlcG9ydCAxWFggb3IgM1hYIHN0YXR1c2VzIHRvIEdBXG4gICAgaWYgKCEocmVzLm9rIHx8IHJlcy5zdGF0dXMgPj0gNDAwKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEZpbHRlciBvdXQgYW55IHVud2FudGVkIHJlcXVlc3RzXG4gICAgaWYgKCFmaWx0ZXIocmVxLCByZXMpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgZHVyYXRpb24gPSBwZXJmb3JtYW5jZS5ub3coKSAtIHN0YXJ0O1xuXG4gICAgY29uc3Qgc3RhdHVzID0gcmVzLnN0YXR1cztcbiAgICBjb25zdCBzdGF0dXNUZXh0ID0gcmVzLnN0YXR1c1RleHQgfHwgU1RBVFVTX1RFWFQuZ2V0KHN0YXR1cykgfHwgYCR7c3RhdHVzfWA7XG4gICAgY29uc3QgdXNlckFnZW50ID0gcmVxLmhlYWRlcnMuZ2V0KFwidXNlci1hZ2VudFwiKTtcbiAgICAvLyBUT0RPKEBwaXNjaXNhdXJldXMpOiB2YWxpZGF0ZSB0aGF0IHRoZSAnY2YtY29ubmVjdGluZy1pcCcgaGVhZGVyIHdhc1xuICAgIC8vIGFjdHVhbGx5IHNldCBieSBjbG91ZGZsYXJlLiBTZWUgaHR0cHM6Ly93d3cuY2xvdWRmbGFyZS5jb20vZW4tZ2IvaXBzLy5cbiAgICBjb25zdCBbaXBdID0gKHJlcS5oZWFkZXJzLmdldChcIngtZm9yd2FyZGVkLWZvclwiKSA/P1xuICAgICAgcmVxLmhlYWRlcnMuZ2V0KFwiY2YtY29ubmVjdGluZy1pcFwiKSA/P1xuICAgICAgKGNvbm4ucmVtb3RlQWRkciBhcyBEZW5vLk5ldEFkZHIpLmhvc3RuYW1lKS5zcGxpdCgvXFxzKixcXHMqLyk7XG4gICAgY29uc3QgeyBkb2N1bWVudFRpdGxlLCBjYW1wYWlnbk1lZGl1bSwgY2FtcGFpZ25Tb3VyY2UgfSA9XG4gICAgICBtZXRhRGF0YShyZXEsIHJlcykgPz9cbiAgICAgICAge307XG4gICAgY29uc3QgZXhjZXB0aW9uID0gdG9FeGNlcHRpb24oc3RhdHVzLCBzdGF0dXNUZXh0LCBlcnJvcik7XG4gICAgY29uc3QgaGl0VHlwZSA9IGV4Y2VwdGlvbiAhPSBudWxsID8gXCJleGNlcHRpb25cIiA6IFwicGFnZXZpZXdcIjtcblxuICAgIGNvbnN0IG1lc3NhZ2UgPSB7XG4gICAgICB2OiAxLCAvLyB2ZXJzaW9uLCBzaG91bGQgYWx3YXlzIGJlIDFcbiAgICAgIHRpZDogaWQsXG4gICAgICB0OiBoaXRUeXBlLCAvLyBldmVudCB0eXBlXG4gICAgICBjaWQ6IGF3YWl0IHRvRGlnZXN0KGlwKSwgLy8gR0EgcmVxdWlyZXMgYGNpZGAgdG8gYmUgc2V0LlxuICAgICAgdWlwOiBpcCxcbiAgICAgIGRsOiByZXEudXJsLFxuICAgICAgZHQ6IGRvY3VtZW50VGl0bGUsXG4gICAgICBkcjogcmVxLmhlYWRlcnMuZ2V0KFwicmVmZXJlclwiKSxcbiAgICAgIGNtOiBjYW1wYWlnbk1lZGl1bSxcbiAgICAgIGNzOiBjYW1wYWlnblNvdXJjZSxcbiAgICAgIHVhOiB1c2VyQWdlbnQsXG4gICAgICBleGQ6IGV4Y2VwdGlvbixcbiAgICAgIGV4ZjogZXhjZXB0aW9uICE9IG51bGwsXG4gICAgICBzcnQ6IGR1cmF0aW9uLFxuICAgICAgcXQ6IHVwbG9hZGluZyA/IDAgOiBVUExPQURfREVMQVksXG4gICAgfSBhcyBjb25zdDtcblxuICAgIGNvbnN0IHBheWxvYWQgPSB0b1BheWxvYWQobWVzc2FnZSk7XG4gICAgaWYgKHBheWxvYWQubGVuZ3RoID4gR0FfTUFYX1BBWUxPQURfTEVOR1RIKSB7XG4gICAgICBpZiAod2Fybikge1xuICAgICAgICBsb2coYHBheWxvYWQgZXhjZWVkcyBtYXhpbXVtIHNpemU6ICR7SlNPTi5zdHJpbmdpZnkobWVzc2FnZSl9YCk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGVucXVldWUocGF5bG9hZCk7XG4gIH07XG59XG5cbi8qKiBDcmVhdGVzIGFuZCByZXR1cm5zIGEgcmVwb3J0aW5nIG1lYXN1cmVtZW50IG1pZGRsZXdhcmUgZm9yIG9haywgd2hpY2ggd2lsbFxuICogZ2VuZXJhdGUgYW5kIHNlbmQgdG8gR29vZ2xlIEFuYWx5dGljcyBtZWFzdXJlbWVudHMgZm9yIGVhY2ggcmVxdWVzdCBoYW5kbGVkXG4gKiBieSBhbiBvYWsgYXBwbGljYXRpb24uXG4gKlxuICogIyMjIEV4YW1wbGVzXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IGNyZWF0ZVJlcG9ydE1pZGRsZXdhcmUgfSBmcm9tIFwiaHR0cHM6Ly9kZW5vLmxhbmQveC9nX2EvbW9kLnRzXCI7XG4gKiBpbXBvcnQgeyBBcHBsaWNhdGlvbiB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC94L29hay9tb2QudHNcIjtcbiAqXG4gKiBjb25zdCBnYSA9IGNyZWF0ZVJlcG9ydE1pZGRsZXdhcmUoKTtcbiAqIGNvbnN0IGFwcCA9IG5ldyBBcHBsaWNhdGlvbigpO1xuICpcbiAqIGFwcC51c2UoZ2EpO1xuICogLy8gcmVnaXN0ZXIgYWRkaXRpb25hbCBtaWRkbGV3YXJlLi4uXG4gKlxuICogYXBwLmxpc3Rlbih7IHBvcnQ6IDAgfSk7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0gb3B0aW9ucyBhbiBvcHRpb25hbCBzZXQgb2Ygb3B0aW9ucyB3aGljaCBhZmZlY3RzIHRoZSBiZWhhdmlvciBvZiB0aGVcbiAqICAgICAgICAgICAgICAgIHJldHVybmVkIG1pZGRsZXdhcmUuXG4gKiBAcmV0dXJucyBtaWRkbGV3YXJlIHdoaWNoIHNob3VsZCBiZSByZWdpc3RlcmVkIGVhcmx5IGluIHRoZSBzdGFjayB3aXRoIHRoZVxuICogICAgICAgICAgYXBwbGljYXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSZXBvcnRNaWRkbGV3YXJlKFxuICBvcHRpb25zOiBSZXBvcnRNaWRkbGV3YXJlT3B0aW9ucyA9IHt9LFxuKTogTWlkZGxld2FyZSB7XG4gIGNvbnN0IHtcbiAgICBlbmRwb2ludCA9IEdBX0JBVENIX0VORFBPSU5ULFxuICAgIGZpbHRlciA9ICgpID0+IHRydWUsXG4gICAgaWQgPSBEZW5vLmVudi5nZXQoR0FfVFJBQ0tJTkdfSUQpLFxuICAgIGxvZyA9IGRlZmF1bHRMb2csXG4gICAgbWV0YURhdGEgPSAoKSA9PiB1bmRlZmluZWQsXG4gICAgd2FybiA9IHRydWUsXG4gIH0gPSBvcHRpb25zO1xuICBpZiAoIWlkICYmIHdhcm4pIHtcbiAgICBsb2coXG4gICAgICBcIkdBX1RSQUNLSU5HX0lEIGVudmlyb25tZW50IHZhcmlhYmxlIG5vdCBzZXQuIEdvb2dsZSBBbmFseXRpY3MgcmVwb3J0aW5nIGRpc2FibGVkLlwiLFxuICAgICk7XG4gIH1cbiAgY29uc3QgZW5xdWV1ZSA9IGNyZWF0ZUVucXVldWUoZW5kcG9pbnQsIGxvZywgd2Fybik7XG5cbiAgcmV0dXJuIGFzeW5jIGZ1bmN0aW9uIHJlcG9ydGVyKGN0eCwgbmV4dCkge1xuICAgIGlmICghaWQgfHwgIWZpbHRlcihjdHgpKSB7XG4gICAgICByZXR1cm4gbmV4dCgpO1xuICAgIH1cbiAgICBsZXQgZXJyb3I6IHVua25vd247XG4gICAgY29uc3Qgc3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgbmV4dCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGVycm9yID0gZTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgLy8gT25seSByZXBvcnQgMlhYIGFuZCA+PSA0WFggc3RhdHVzIHRvIEdBXG4gICAgICBjb25zdCBzdGF0dXMgPSBjdHgucmVzcG9uc2Uuc3RhdHVzO1xuICAgICAgaWYgKChzdGF0dXMgPj0gMjAwICYmIHN0YXR1cyA8IDMwMCkgfHwgc3RhdHVzID49IDQwMCkge1xuICAgICAgICBjb25zdCBkdXJhdGlvbiA9IHBlcmZvcm1hbmNlLm5vdygpIC0gc3RhcnQ7XG5cbiAgICAgICAgY29uc3Qgc3RhdHVzVGV4dCA9IFNUQVRVU19URVhULmdldChzdGF0dXMpID8/IGAke3N0YXR1c31gO1xuICAgICAgICBjb25zdCBpcCA9IGN0eC5yZXF1ZXN0LmlwO1xuICAgICAgICBjb25zdCB7IGRvY3VtZW50VGl0bGUsIGNhbXBhaWduTWVkaXVtLCBjYW1wYWlnblNvdXJjZSB9ID1cbiAgICAgICAgICBtZXRhRGF0YShjdHgpID8/XG4gICAgICAgICAgICB7fTtcbiAgICAgICAgY29uc3QgZXhjZXB0aW9uID0gdG9FeGNlcHRpb24oc3RhdHVzLCBzdGF0dXNUZXh0LCBlcnJvcik7XG4gICAgICAgIGNvbnN0IGhpdFR5cGUgPSBleGNlcHRpb24gIT0gbnVsbCA/IFwiZXhjZXB0aW9uXCIgOiBcInBhZ2V2aWV3XCI7XG5cbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IHtcbiAgICAgICAgICB2OiAxLCAvLyB2ZXJzaW9uLCBzaG91bGQgYWx3YXlzIGJlIDFcbiAgICAgICAgICB0aWQ6IGlkLFxuICAgICAgICAgIHQ6IGhpdFR5cGUsIC8vIGV2ZW50IHR5cGVcbiAgICAgICAgICBjaWQ6IGF3YWl0IHRvRGlnZXN0KGlwKSwgLy8gR0EgcmVxdWlyZXMgYGNpZGAgdG8gYmUgc2V0LlxuICAgICAgICAgIHVpcDogaXAsXG4gICAgICAgICAgZGw6IGN0eC5yZXF1ZXN0LnVybC50b1N0cmluZygpLFxuICAgICAgICAgIGR0OiBkb2N1bWVudFRpdGxlLFxuICAgICAgICAgIGRyOiBjdHgucmVxdWVzdC5oZWFkZXJzLmdldChcInJlZmVyZXJcIiksXG4gICAgICAgICAgY206IGNhbXBhaWduTWVkaXVtLFxuICAgICAgICAgIGNzOiBjYW1wYWlnblNvdXJjZSxcbiAgICAgICAgICB1YTogY3R4LnJlcXVlc3QuaGVhZGVycy5nZXQoXCJ1c2VyLWFnZW50XCIpLFxuICAgICAgICAgIGV4ZDogZXhjZXB0aW9uLFxuICAgICAgICAgIGV4ZjogZXhjZXB0aW9uICE9IG51bGwsXG4gICAgICAgICAgc3J0OiBkdXJhdGlvbixcbiAgICAgICAgICBxdDogdXBsb2FkaW5nID8gMCA6IFVQTE9BRF9ERUxBWSxcbiAgICAgICAgfSBhcyBjb25zdDtcblxuICAgICAgICBjb25zdCBwYXlsb2FkID0gdG9QYXlsb2FkKG1lc3NhZ2UpO1xuICAgICAgICBpZiAocGF5bG9hZC5sZW5ndGggPD0gR0FfTUFYX1BBWUxPQURfTEVOR1RIKSB7XG4gICAgICAgICAgZW5xdWV1ZShwYXlsb2FkKTtcbiAgICAgICAgfSBlbHNlIGlmICh3YXJuKSB7XG4gICAgICAgICAgbG9nKGBwYXlsb2FkIGV4Y2VlZHMgbWF4aW11bSBzaXplOiAke0pTT04uc3RyaW5naWZ5KG1lc3NhZ2UpfWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9O1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGlu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