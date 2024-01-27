#!/usr/bin/env -S deno run --allow-net --allow-read
// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// This program serves files in the current directory over HTTP.
// TODO(bartlomieju): Add tests like these:
// https://github.com/indexzero/http-server/blob/master/test/http-server-test.js
import { extname, posix } from "../path/mod.ts";
import { encode } from "../encoding/hex.ts";
import { serve, serveTls } from "./server.ts";
import { Status, STATUS_TEXT } from "./http_status.ts";
import { parse } from "../flags/mod.ts";
import { assert } from "../_util/assert.ts";
import { red } from "../fmt/colors.ts";
const DEFAULT_CHUNK_SIZE = 16_640;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MEDIA_TYPES = {
    ".md": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".json": "application/json",
    ".map": "application/json",
    ".txt": "text/plain",
    ".ts": "text/typescript",
    ".tsx": "text/tsx",
    ".js": "application/javascript",
    ".jsx": "text/jsx",
    ".gz": "application/gzip",
    ".css": "text/css",
    ".wasm": "application/wasm",
    ".mjs": "application/javascript",
    ".otf": "font/otf",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".conf": "text/plain",
    ".list": "text/plain",
    ".log": "text/plain",
    ".ini": "text/plain",
    ".vtt": "text/vtt",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".mid": "audio/midi",
    ".midi": "audio/midi",
    ".mp3": "audio/mp3",
    ".mp4a": "audio/mp4",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".spx": "audio/ogg",
    ".opus": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".aac": "audio/x-aac",
    ".flac": "audio/x-flac",
    ".mp4": "video/mp4",
    ".mp4v": "video/mp4",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".svg": "image/svg+xml",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".tiff": "image/tiff",
    ".psd": "image/vnd.adobe.photoshop",
    ".ico": "image/vnd.microsoft.icon",
    ".webp": "image/webp",
    ".es": "application/ecmascript",
    ".epub": "application/epub+zip",
    ".jar": "application/java-archive",
    ".war": "application/java-archive",
    ".webmanifest": "application/manifest+json",
    ".doc": "application/msword",
    ".dot": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".dotx": "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
    ".cjs": "application/node",
    ".bin": "application/octet-stream",
    ".pkg": "application/octet-stream",
    ".dump": "application/octet-stream",
    ".exe": "application/octet-stream",
    ".deploy": "application/octet-stream",
    ".img": "application/octet-stream",
    ".msi": "application/octet-stream",
    ".pdf": "application/pdf",
    ".pgp": "application/pgp-encrypted",
    ".asc": "application/pgp-signature",
    ".sig": "application/pgp-signature",
    ".ai": "application/postscript",
    ".eps": "application/postscript",
    ".ps": "application/postscript",
    ".rdf": "application/rdf+xml",
    ".rss": "application/rss+xml",
    ".rtf": "application/rtf",
    ".apk": "application/vnd.android.package-archive",
    ".key": "application/vnd.apple.keynote",
    ".numbers": "application/vnd.apple.keynote",
    ".pages": "application/vnd.apple.pages",
    ".geo": "application/vnd.dynageo",
    ".gdoc": "application/vnd.google-apps.document",
    ".gslides": "application/vnd.google-apps.presentation",
    ".gsheet": "application/vnd.google-apps.spreadsheet",
    ".kml": "application/vnd.google-earth.kml+xml",
    ".mkz": "application/vnd.google-earth.kmz",
    ".icc": "application/vnd.iccprofile",
    ".icm": "application/vnd.iccprofile",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xlm": "application/vnd.ms-excel",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pot": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".potx": "application/vnd.openxmlformats-officedocument.presentationml.template",
    ".xps": "application/vnd.ms-xpsdocument",
    ".odc": "application/vnd.oasis.opendocument.chart",
    ".odb": "application/vnd.oasis.opendocument.database",
    ".odf": "application/vnd.oasis.opendocument.formula",
    ".odg": "application/vnd.oasis.opendocument.graphics",
    ".odp": "application/vnd.oasis.opendocument.presentation",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".rar": "application/vnd.rar",
    ".unityweb": "application/vnd.unity",
    ".dmg": "application/x-apple-diskimage",
    ".bz": "application/x-bzip",
    ".crx": "application/x-chrome-extension",
    ".deb": "application/x-debian-package",
    ".php": "application/x-httpd-php",
    ".iso": "application/x-iso9660-image",
    ".sh": "application/x-sh",
    ".sql": "application/x-sql",
    ".srt": "application/x-subrip",
    ".xml": "application/xml",
    ".zip": "application/zip"
};
/** Returns the content-type based on the extension of a path. */ function contentType(path) {
    return MEDIA_TYPES[extname(path)];
}
// The fnv-1a hash function.
function fnv1a(buf) {
    let hash = 2166136261; // 32-bit FNV offset basis
    for(let i = 0; i < buf.length; i++){
        hash ^= buf.charCodeAt(i);
        // Equivalent to `hash *= 16777619` without using BigInt
        // 32-bit FNV prime
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    // 32-bit hex string
    return (hash >>> 0).toString(16);
}
// Generates a hash for the provided string
async function createEtagHash(message, algorithm = "fnv1a") {
    if (algorithm === "fnv1a") {
        return fnv1a(message);
    }
    const msgUint8 = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest(algorithm, msgUint8);
    return decoder.decode(encode(new Uint8Array(hashBuffer)));
}
function modeToString(isDir, maybeMode) {
    const modeMap = [
        "---",
        "--x",
        "-w-",
        "-wx",
        "r--",
        "r-x",
        "rw-",
        "rwx"
    ];
    if (maybeMode === null) {
        return "(unknown mode)";
    }
    const mode = maybeMode.toString(8);
    if (mode.length < 3) {
        return "(unknown mode)";
    }
    let output = "";
    mode.split("").reverse().slice(0, 3).forEach((v)=>{
        output = `${modeMap[+v]} ${output}`;
    });
    output = `${isDir ? "d" : "-"} ${output}`;
    return output;
}
function fileLenToString(len) {
    const multiplier = 1024;
    let base = 1;
    const suffix = [
        "B",
        "K",
        "M",
        "G",
        "T"
    ];
    let suffixIndex = 0;
    while(base * multiplier < len){
        if (suffixIndex >= suffix.length - 1) {
            break;
        }
        base *= multiplier;
        suffixIndex++;
    }
    return `${(len / base).toFixed(2)}${suffix[suffixIndex]}`;
}
/**
 * Returns an HTTP Response with the requested file as the body.
 * @param req The server request context used to cleanup the file handle.
 * @param filePath Path of the file to serve.
 * @param etagAlgorithm The algorithm to use for generating the ETag. Defaults to "fnv1a".
 * @param fileInfo An optional FileInfo object returned by Deno.stat. It is used
 * for optimization purposes.
 */ export async function serveFile(req, filePath, { etagAlgorithm , fileInfo  } = {}) {
    let file;
    if (fileInfo === undefined) {
        [file, fileInfo] = await Promise.all([
            Deno.open(filePath),
            Deno.stat(filePath), 
        ]);
    } else {
        file = await Deno.open(filePath);
    }
    const headers = setBaseHeaders();
    // Set mime-type using the file extension in filePath
    const contentTypeValue = contentType(filePath);
    if (contentTypeValue) {
        headers.set("content-type", contentTypeValue);
    }
    // Set date header if access timestamp is available
    if (fileInfo.atime instanceof Date) {
        const date = new Date(fileInfo.atime);
        headers.set("date", date.toUTCString());
    }
    // Set last modified header if access timestamp is available
    if (fileInfo.mtime instanceof Date) {
        const lastModified = new Date(fileInfo.mtime);
        headers.set("last-modified", lastModified.toUTCString());
        // Create a simple etag that is an md5 of the last modified date and filesize concatenated
        const simpleEtag = await createEtagHash(`${lastModified.toJSON()}${fileInfo.size}`, etagAlgorithm || "fnv1a");
        headers.set("etag", simpleEtag);
        // If a `if-none-match` header is present and the value matches the tag or
        // if a `if-modified-since` header is present and the value is bigger than
        // the access timestamp value, then return 304
        const ifNoneMatch = req.headers.get("if-none-match");
        const ifModifiedSince = req.headers.get("if-modified-since");
        if (ifNoneMatch && (ifNoneMatch === simpleEtag || "W/" + ifNoneMatch === simpleEtag || ifNoneMatch === "W/" + simpleEtag) || ifNoneMatch === null && ifModifiedSince && fileInfo.mtime.getTime() < new Date(ifModifiedSince).getTime() + 1000) {
            const status = Status.NotModified;
            const statusText = STATUS_TEXT.get(status);
            file.close();
            return new Response(null, {
                status,
                statusText,
                headers
            });
        }
    }
    // Get and parse the "range" header
    const range = req.headers.get("range");
    const rangeRe = /bytes=(\d+)-(\d+)?/;
    const parsed = rangeRe.exec(range);
    // Use the parsed value if available, fallback to the start and end of the entire file
    const start = parsed && parsed[1] ? +parsed[1] : 0;
    const end = parsed && parsed[2] ? +parsed[2] : fileInfo.size - 1;
    // If there is a range, set the status to 206, and set the "Content-range" header.
    if (range && parsed) {
        headers.set("content-range", `bytes ${start}-${end}/${fileInfo.size}`);
    }
    // Return 416 if `start` isn't less than or equal to `end`, or `start` or `end` are greater than the file's size
    const maxRange = fileInfo.size - 1;
    if (range && (!parsed || typeof start !== "number" || start > end || start > maxRange || end > maxRange)) {
        const status1 = Status.RequestedRangeNotSatisfiable;
        const statusText1 = STATUS_TEXT.get(status1);
        file.close();
        return new Response(statusText1, {
            status: status1,
            statusText: statusText1,
            headers
        });
    }
    // Set content length
    const contentLength = end - start + 1;
    headers.set("content-length", `${contentLength}`);
    if (range && parsed) {
        // Create a stream of the file instead of loading it into memory
        let bytesSent = 0;
        const body = new ReadableStream({
            async start () {
                if (start > 0) {
                    await file.seek(start, Deno.SeekMode.Start);
                }
            },
            async pull (controller) {
                const bytes = new Uint8Array(DEFAULT_CHUNK_SIZE);
                const bytesRead = await file.read(bytes);
                if (bytesRead === null) {
                    file.close();
                    controller.close();
                    return;
                }
                controller.enqueue(bytes.slice(0, Math.min(bytesRead, contentLength - bytesSent)));
                bytesSent += bytesRead;
                if (bytesSent > contentLength) {
                    file.close();
                    controller.close();
                }
            }
        });
        return new Response(body, {
            status: 206,
            statusText: "Partial Content",
            headers
        });
    }
    return new Response(file.readable, {
        status: 200,
        statusText: "OK",
        headers
    });
}
// TODO(bartlomieju): simplify this after deno.stat and deno.readDir are fixed
async function serveDirIndex(req, dirPath, options) {
    const showDotfiles = options.dotfiles;
    const dirUrl = `/${posix.relative(options.target, dirPath)}`;
    const listEntry = [];
    // if ".." makes sense
    if (dirUrl !== "/") {
        const prevPath = posix.join(dirPath, "..");
        const fileInfo = await Deno.stat(prevPath);
        listEntry.push({
            mode: modeToString(true, fileInfo.mode),
            size: "",
            name: "../",
            url: posix.join(dirUrl, "..")
        });
    }
    for await (const entry of Deno.readDir(dirPath)){
        if (!showDotfiles && entry.name[0] === ".") {
            continue;
        }
        const filePath = posix.join(dirPath, entry.name);
        const fileUrl = encodeURI(posix.join(dirUrl, entry.name));
        const fileInfo1 = await Deno.stat(filePath);
        if (entry.name === "index.html" && entry.isFile) {
            // in case index.html as dir...
            return serveFile(req, filePath, {
                etagAlgorithm: options.etagAlgorithm,
                fileInfo: fileInfo1
            });
        }
        listEntry.push({
            mode: modeToString(entry.isDirectory, fileInfo1.mode),
            size: entry.isFile ? fileLenToString(fileInfo1.size ?? 0) : "",
            name: `${entry.name}${entry.isDirectory ? "/" : ""}`,
            url: `${fileUrl}${entry.isDirectory ? "/" : ""}`
        });
    }
    listEntry.sort((a, b)=>a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1);
    const formattedDirUrl = `${dirUrl.replace(/\/$/, "")}/`;
    const page = encoder.encode(dirViewerTemplate(formattedDirUrl, listEntry));
    const headers = setBaseHeaders();
    headers.set("content-type", "text/html");
    return new Response(page, {
        status: Status.OK,
        headers
    });
}
function serveFallback(_req, e) {
    if (e instanceof URIError) {
        return Promise.resolve(new Response(STATUS_TEXT.get(Status.BadRequest), {
            status: Status.BadRequest
        }));
    } else if (e instanceof Deno.errors.NotFound) {
        return Promise.resolve(new Response(STATUS_TEXT.get(Status.NotFound), {
            status: Status.NotFound
        }));
    }
    return Promise.resolve(new Response(STATUS_TEXT.get(Status.InternalServerError), {
        status: Status.InternalServerError
    }));
}
function serverLog(req, status) {
    const d = new Date().toISOString();
    const dateFmt = `[${d.slice(0, 10)} ${d.slice(11, 19)}]`;
    const normalizedUrl = normalizeURL(req.url);
    const s = `${dateFmt} [${req.method}] ${normalizedUrl} ${status}`;
    // using console.debug instead of console.log so chrome inspect users can hide request logs
    console.debug(s);
}
function setBaseHeaders() {
    const headers = new Headers();
    headers.set("server", "deno");
    // Set "accept-ranges" so that the client knows it can make range requests on future requests
    headers.set("accept-ranges", "bytes");
    headers.set("date", new Date().toUTCString());
    return headers;
}
function dirViewerTemplate(dirname, entries) {
    const paths = dirname.split("/");
    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="X-UA-Compatible" content="ie=edge" />
        <title>Deno File Server</title>
        <style>
          :root {
            --background-color: #fafafa;
            --color: rgba(0, 0, 0, 0.87);
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --background-color: #292929;
              --color: #fff;
            }
            thead {
              color: #7f7f7f;
            }
          }
          @media (min-width: 960px) {
            main {
              max-width: 960px;
            }
            body {
              padding-left: 32px;
              padding-right: 32px;
            }
          }
          @media (min-width: 600px) {
            main {
              padding-left: 24px;
              padding-right: 24px;
            }
          }
          body {
            background: var(--background-color);
            color: var(--color);
            font-family: "Roboto", "Helvetica", "Arial", sans-serif;
            font-weight: 400;
            line-height: 1.43;
            font-size: 0.875rem;
          }
          a {
            color: #2196f3;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          thead {
            text-align: left;
          }
          thead th {
            padding-bottom: 12px;
          }
          table td {
            padding: 6px 36px 6px 0px;
          }
          .size {
            text-align: right;
            padding: 6px 12px 6px 24px;
          }
          .mode {
            font-family: monospace, monospace;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Index of
          <a href="/">home</a>${paths.map((path, index, array)=>{
        if (path === "") return "";
        const link = array.slice(0, index + 1).join("/");
        return `<a href="${link}">${path}</a>`;
    }).join("/")}
          </h1>
          <table>
            <thead>
              <tr>
                <th>Mode</th>
                <th>Size</th>
                <th>Name</th>
              </tr>
            </thead>
            ${entries.map((entry)=>`
                  <tr>
                    <td class="mode">
                      ${entry.mode}
                    </td>
                    <td class="size">
                      ${entry.size}
                    </td>
                    <td>
                      <a href="${entry.url}">${entry.name}</a>
                    </td>
                  </tr>
                `).join("")}
          </table>
        </main>
      </body>
    </html>
  `;
}
/**
 * Serves the files under the given directory root (opts.fsRoot).
 *
 * ```ts
 * import { serve } from "https://deno.land/std@$STD_VERSION/http/server.ts";
 * import { serveDir } from "https://deno.land/std@$STD_VERSION/http/file_server.ts";
 *
 * serve((req) => {
 *   const pathname = new URL(req.url).pathname;
 *   if (pathname.startsWith("/static")) {
 *     return serveDir(req, {
 *       fsRoot: "path/to/static/files/dir",
 *     });
 *   }
 *   // Do dynamic responses
 *   return new Response();
 * });
 * ```
 *
 * Optionally you can pass `urlRoot` option. If it's specified that part is stripped from the beginning of the requested pathname.
 *
 * ```ts
 * import { serveDir } from "https://deno.land/std@$STD_VERSION/http/file_server.ts";
 *
 * // ...
 * serveDir(new Request("http://localhost/static/path/to/file"), {
 *   fsRoot: "public",
 *   urlRoot: "static",
 * });
 * ```
 *
 * The above example serves `./public/path/to/file` for the request to `/static/path/to/file`.
 *
 * @param request The request to handle
 * @param opts
 * @returns
 */ export async function serveDir(req, opts = {}) {
    let response;
    const target = opts.fsRoot || ".";
    const urlRoot = opts.urlRoot;
    try {
        let normalizedPath = normalizeURL(req.url);
        if (urlRoot) {
            if (normalizedPath.startsWith("/" + urlRoot)) {
                normalizedPath = normalizedPath.replace(urlRoot, "");
            } else {
                throw new Deno.errors.NotFound();
            }
        }
        const fsPath = posix.join(target, normalizedPath);
        const fileInfo = await Deno.stat(fsPath);
        if (fileInfo.isDirectory) {
            if (opts.showDirListing) {
                response = await serveDirIndex(req, fsPath, {
                    dotfiles: opts.showDotfiles || false,
                    target
                });
            } else {
                throw new Deno.errors.NotFound();
            }
        } else {
            response = await serveFile(req, fsPath, {
                etagAlgorithm: opts.etagAlgorithm,
                fileInfo
            });
        }
    } catch (e) {
        const err = e instanceof Error ? e : new Error("[non-error thrown]");
        console.error(red(err.message));
        response = await serveFallback(req, err);
    }
    if (opts.enableCors) {
        assert(response);
        response.headers.append("access-control-allow-origin", "*");
        response.headers.append("access-control-allow-headers", "Origin, X-Requested-With, Content-Type, Accept, Range");
    }
    if (!opts.quiet) serverLog(req, response.status);
    return response;
}
function normalizeURL(url) {
    let normalizedUrl = url;
    try {
        //allowed per https://www.w3.org/Protocols/rfc2616/rfc2616-sec5.html
        const absoluteURI = new URL(normalizedUrl);
        normalizedUrl = absoluteURI.pathname;
    } catch (e) {
        //wasn't an absoluteURI
        if (!(e instanceof TypeError)) {
            throw e;
        }
    }
    try {
        normalizedUrl = decodeURI(normalizedUrl);
    } catch (e1) {
        if (!(e1 instanceof URIError)) {
            throw e1;
        }
    }
    if (normalizedUrl[0] !== "/") {
        throw new URIError("The request URI is malformed.");
    }
    normalizedUrl = posix.normalize(normalizedUrl);
    const startOfParams = normalizedUrl.indexOf("?");
    return startOfParams > -1 ? normalizedUrl.slice(0, startOfParams) : normalizedUrl;
}
function main() {
    const serverArgs = parse(Deno.args, {
        string: [
            "port",
            "host",
            "cert",
            "key"
        ],
        boolean: [
            "help",
            "dir-listing",
            "dotfiles",
            "cors",
            "verbose"
        ],
        default: {
            "dir-listing": true,
            dotfiles: true,
            cors: true,
            verbose: false,
            host: "0.0.0.0",
            port: "4507",
            cert: "",
            key: ""
        },
        alias: {
            p: "port",
            c: "cert",
            k: "key",
            h: "help",
            v: "verbose"
        }
    });
    const port = serverArgs.port;
    const host = serverArgs.host;
    const certFile = serverArgs.cert;
    const keyFile = serverArgs.key;
    if (serverArgs.help) {
        printUsage();
        Deno.exit();
    }
    if (keyFile || certFile) {
        if (keyFile === "" || certFile === "") {
            console.log("--key and --cert are required for TLS");
            printUsage();
            Deno.exit(1);
        }
    }
    const wild = serverArgs._;
    const target = posix.resolve(wild[0] ?? "");
    const handler = (req)=>{
        return serveDir(req, {
            fsRoot: target,
            showDirListing: serverArgs["dir-listing"],
            showDotfiles: serverArgs.dotfiles,
            enableCors: serverArgs.cors,
            quiet: !serverArgs.verbose
        });
    };
    const useTls = Boolean(keyFile || certFile);
    if (useTls) {
        serveTls(handler, {
            port: Number(port),
            hostname: host,
            certFile,
            keyFile
        });
    } else {
        serve(handler, {
            port: Number(port),
            hostname: host
        });
    }
}
function printUsage() {
    console.log(`Deno File Server
  Serves a local directory in HTTP.

INSTALL:
  deno install --allow-net --allow-read https://deno.land/std/http/file_server.ts

USAGE:
  file_server [path] [options]

OPTIONS:
  -h, --help          Prints help information
  -p, --port <PORT>   Set port
  --cors              Enable CORS via the "Access-Control-Allow-Origin" header
  --host     <HOST>   Hostname (default is 0.0.0.0)
  -c, --cert <FILE>   TLS certificate file (enables TLS)
  -k, --key  <FILE>   TLS key file (enables TLS)
  --no-dir-listing    Disable directory listing
  --no-dotfiles       Do not show dotfiles
  -v, --verbose       Print request level logs

  All TLS options are required when one is provided.`);
}
if (import.meta.main) {
    main();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0MC4wL2h0dHAvZmlsZV9zZXJ2ZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgLVMgZGVubyBydW4gLS1hbGxvdy1uZXQgLS1hbGxvdy1yZWFkXG4vLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG4vLyBUaGlzIHByb2dyYW0gc2VydmVzIGZpbGVzIGluIHRoZSBjdXJyZW50IGRpcmVjdG9yeSBvdmVyIEhUVFAuXG4vLyBUT0RPKGJhcnRsb21pZWp1KTogQWRkIHRlc3RzIGxpa2UgdGhlc2U6XG4vLyBodHRwczovL2dpdGh1Yi5jb20vaW5kZXh6ZXJvL2h0dHAtc2VydmVyL2Jsb2IvbWFzdGVyL3Rlc3QvaHR0cC1zZXJ2ZXItdGVzdC5qc1xuXG5pbXBvcnQgeyBleHRuYW1lLCBwb3NpeCB9IGZyb20gXCIuLi9wYXRoL21vZC50c1wiO1xuaW1wb3J0IHsgZW5jb2RlIH0gZnJvbSBcIi4uL2VuY29kaW5nL2hleC50c1wiO1xuaW1wb3J0IHsgc2VydmUsIHNlcnZlVGxzIH0gZnJvbSBcIi4vc2VydmVyLnRzXCI7XG5pbXBvcnQgeyBTdGF0dXMsIFNUQVRVU19URVhUIH0gZnJvbSBcIi4vaHR0cF9zdGF0dXMudHNcIjtcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSBcIi4uL2ZsYWdzL21vZC50c1wiO1xuaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcIi4uL191dGlsL2Fzc2VydC50c1wiO1xuaW1wb3J0IHsgcmVkIH0gZnJvbSBcIi4uL2ZtdC9jb2xvcnMudHNcIjtcblxuY29uc3QgREVGQVVMVF9DSFVOS19TSVpFID0gMTZfNjQwO1xuXG5pbnRlcmZhY2UgRW50cnlJbmZvIHtcbiAgbW9kZTogc3RyaW5nO1xuICBzaXplOiBzdHJpbmc7XG4gIHVybDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBGaWxlU2VydmVyQXJncyB7XG4gIF86IHN0cmluZ1tdO1xuICAvLyAtcCAtLXBvcnRcbiAgcG9ydDogc3RyaW5nO1xuICAvLyAtLWNvcnNcbiAgY29yczogYm9vbGVhbjtcbiAgLy8gLS1uby1kaXItbGlzdGluZ1xuICBcImRpci1saXN0aW5nXCI6IGJvb2xlYW47XG4gIGRvdGZpbGVzOiBib29sZWFuO1xuICAvLyAtLWhvc3RcbiAgaG9zdDogc3RyaW5nO1xuICAvLyAtYyAtLWNlcnRcbiAgY2VydDogc3RyaW5nO1xuICAvLyAtayAtLWtleVxuICBrZXk6IHN0cmluZztcbiAgLy8gLWggLS1oZWxwXG4gIGhlbHA6IGJvb2xlYW47XG4gIC8vIC0tcXVpZXRcbiAgcXVpZXQ6IGJvb2xlYW47XG59XG5cbmNvbnN0IGVuY29kZXIgPSBuZXcgVGV4dEVuY29kZXIoKTtcbmNvbnN0IGRlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoKTtcblxuY29uc3QgTUVESUFfVFlQRVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIFwiLm1kXCI6IFwidGV4dC9tYXJrZG93blwiLFxuICBcIi5odG1sXCI6IFwidGV4dC9odG1sXCIsXG4gIFwiLmh0bVwiOiBcInRleHQvaHRtbFwiLFxuICBcIi5qc29uXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICBcIi5tYXBcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gIFwiLnR4dFwiOiBcInRleHQvcGxhaW5cIixcbiAgXCIudHNcIjogXCJ0ZXh0L3R5cGVzY3JpcHRcIixcbiAgXCIudHN4XCI6IFwidGV4dC90c3hcIixcbiAgXCIuanNcIjogXCJhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XCIsXG4gIFwiLmpzeFwiOiBcInRleHQvanN4XCIsXG4gIFwiLmd6XCI6IFwiYXBwbGljYXRpb24vZ3ppcFwiLFxuICBcIi5jc3NcIjogXCJ0ZXh0L2Nzc1wiLFxuICBcIi53YXNtXCI6IFwiYXBwbGljYXRpb24vd2FzbVwiLFxuICBcIi5tanNcIjogXCJhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XCIsXG4gIFwiLm90ZlwiOiBcImZvbnQvb3RmXCIsXG4gIFwiLnR0ZlwiOiBcImZvbnQvdHRmXCIsXG4gIFwiLndvZmZcIjogXCJmb250L3dvZmZcIixcbiAgXCIud29mZjJcIjogXCJmb250L3dvZmYyXCIsXG4gIFwiLmNvbmZcIjogXCJ0ZXh0L3BsYWluXCIsXG4gIFwiLmxpc3RcIjogXCJ0ZXh0L3BsYWluXCIsXG4gIFwiLmxvZ1wiOiBcInRleHQvcGxhaW5cIixcbiAgXCIuaW5pXCI6IFwidGV4dC9wbGFpblwiLFxuICBcIi52dHRcIjogXCJ0ZXh0L3Z0dFwiLFxuICBcIi55YW1sXCI6IFwidGV4dC95YW1sXCIsXG4gIFwiLnltbFwiOiBcInRleHQveWFtbFwiLFxuICBcIi5taWRcIjogXCJhdWRpby9taWRpXCIsXG4gIFwiLm1pZGlcIjogXCJhdWRpby9taWRpXCIsXG4gIFwiLm1wM1wiOiBcImF1ZGlvL21wM1wiLFxuICBcIi5tcDRhXCI6IFwiYXVkaW8vbXA0XCIsXG4gIFwiLm00YVwiOiBcImF1ZGlvL21wNFwiLFxuICBcIi5vZ2dcIjogXCJhdWRpby9vZ2dcIixcbiAgXCIuc3B4XCI6IFwiYXVkaW8vb2dnXCIsXG4gIFwiLm9wdXNcIjogXCJhdWRpby9vZ2dcIixcbiAgXCIud2F2XCI6IFwiYXVkaW8vd2F2XCIsXG4gIFwiLndlYm1cIjogXCJhdWRpby93ZWJtXCIsXG4gIFwiLmFhY1wiOiBcImF1ZGlvL3gtYWFjXCIsXG4gIFwiLmZsYWNcIjogXCJhdWRpby94LWZsYWNcIixcbiAgXCIubXA0XCI6IFwidmlkZW8vbXA0XCIsXG4gIFwiLm1wNHZcIjogXCJ2aWRlby9tcDRcIixcbiAgXCIubWt2XCI6IFwidmlkZW8veC1tYXRyb3NrYVwiLFxuICBcIi5tb3ZcIjogXCJ2aWRlby9xdWlja3RpbWVcIixcbiAgXCIuc3ZnXCI6IFwiaW1hZ2Uvc3ZnK3htbFwiLFxuICBcIi5hdmlmXCI6IFwiaW1hZ2UvYXZpZlwiLFxuICBcIi5ibXBcIjogXCJpbWFnZS9ibXBcIixcbiAgXCIuZ2lmXCI6IFwiaW1hZ2UvZ2lmXCIsXG4gIFwiLmhlaWNcIjogXCJpbWFnZS9oZWljXCIsXG4gIFwiLmhlaWZcIjogXCJpbWFnZS9oZWlmXCIsXG4gIFwiLmpwZWdcIjogXCJpbWFnZS9qcGVnXCIsXG4gIFwiLmpwZ1wiOiBcImltYWdlL2pwZWdcIixcbiAgXCIucG5nXCI6IFwiaW1hZ2UvcG5nXCIsXG4gIFwiLnRpZmZcIjogXCJpbWFnZS90aWZmXCIsXG4gIFwiLnBzZFwiOiBcImltYWdlL3ZuZC5hZG9iZS5waG90b3Nob3BcIixcbiAgXCIuaWNvXCI6IFwiaW1hZ2Uvdm5kLm1pY3Jvc29mdC5pY29uXCIsXG4gIFwiLndlYnBcIjogXCJpbWFnZS93ZWJwXCIsXG4gIFwiLmVzXCI6IFwiYXBwbGljYXRpb24vZWNtYXNjcmlwdFwiLFxuICBcIi5lcHViXCI6IFwiYXBwbGljYXRpb24vZXB1Yit6aXBcIixcbiAgXCIuamFyXCI6IFwiYXBwbGljYXRpb24vamF2YS1hcmNoaXZlXCIsXG4gIFwiLndhclwiOiBcImFwcGxpY2F0aW9uL2phdmEtYXJjaGl2ZVwiLFxuICBcIi53ZWJtYW5pZmVzdFwiOiBcImFwcGxpY2F0aW9uL21hbmlmZXN0K2pzb25cIixcbiAgXCIuZG9jXCI6IFwiYXBwbGljYXRpb24vbXN3b3JkXCIsXG4gIFwiLmRvdFwiOiBcImFwcGxpY2F0aW9uL21zd29yZFwiLFxuICBcIi5kb2N4XCI6XG4gICAgXCJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQud29yZHByb2Nlc3NpbmdtbC5kb2N1bWVudFwiLFxuICBcIi5kb3R4XCI6XG4gICAgXCJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQud29yZHByb2Nlc3NpbmdtbC50ZW1wbGF0ZVwiLFxuICBcIi5janNcIjogXCJhcHBsaWNhdGlvbi9ub2RlXCIsXG4gIFwiLmJpblwiOiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiLFxuICBcIi5wa2dcIjogXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIixcbiAgXCIuZHVtcFwiOiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiLFxuICBcIi5leGVcIjogXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIixcbiAgXCIuZGVwbG95XCI6IFwiYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtXCIsXG4gIFwiLmltZ1wiOiBcImFwcGxpY2F0aW9uL29jdGV0LXN0cmVhbVwiLFxuICBcIi5tc2lcIjogXCJhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW1cIixcbiAgXCIucGRmXCI6IFwiYXBwbGljYXRpb24vcGRmXCIsXG4gIFwiLnBncFwiOiBcImFwcGxpY2F0aW9uL3BncC1lbmNyeXB0ZWRcIixcbiAgXCIuYXNjXCI6IFwiYXBwbGljYXRpb24vcGdwLXNpZ25hdHVyZVwiLFxuICBcIi5zaWdcIjogXCJhcHBsaWNhdGlvbi9wZ3Atc2lnbmF0dXJlXCIsXG4gIFwiLmFpXCI6IFwiYXBwbGljYXRpb24vcG9zdHNjcmlwdFwiLFxuICBcIi5lcHNcIjogXCJhcHBsaWNhdGlvbi9wb3N0c2NyaXB0XCIsXG4gIFwiLnBzXCI6IFwiYXBwbGljYXRpb24vcG9zdHNjcmlwdFwiLFxuICBcIi5yZGZcIjogXCJhcHBsaWNhdGlvbi9yZGYreG1sXCIsXG4gIFwiLnJzc1wiOiBcImFwcGxpY2F0aW9uL3Jzcyt4bWxcIixcbiAgXCIucnRmXCI6IFwiYXBwbGljYXRpb24vcnRmXCIsXG4gIFwiLmFwa1wiOiBcImFwcGxpY2F0aW9uL3ZuZC5hbmRyb2lkLnBhY2thZ2UtYXJjaGl2ZVwiLFxuICBcIi5rZXlcIjogXCJhcHBsaWNhdGlvbi92bmQuYXBwbGUua2V5bm90ZVwiLFxuICBcIi5udW1iZXJzXCI6IFwiYXBwbGljYXRpb24vdm5kLmFwcGxlLmtleW5vdGVcIixcbiAgXCIucGFnZXNcIjogXCJhcHBsaWNhdGlvbi92bmQuYXBwbGUucGFnZXNcIixcbiAgXCIuZ2VvXCI6IFwiYXBwbGljYXRpb24vdm5kLmR5bmFnZW9cIixcbiAgXCIuZ2RvY1wiOiBcImFwcGxpY2F0aW9uL3ZuZC5nb29nbGUtYXBwcy5kb2N1bWVudFwiLFxuICBcIi5nc2xpZGVzXCI6IFwiYXBwbGljYXRpb24vdm5kLmdvb2dsZS1hcHBzLnByZXNlbnRhdGlvblwiLFxuICBcIi5nc2hlZXRcIjogXCJhcHBsaWNhdGlvbi92bmQuZ29vZ2xlLWFwcHMuc3ByZWFkc2hlZXRcIixcbiAgXCIua21sXCI6IFwiYXBwbGljYXRpb24vdm5kLmdvb2dsZS1lYXJ0aC5rbWwreG1sXCIsXG4gIFwiLm1relwiOiBcImFwcGxpY2F0aW9uL3ZuZC5nb29nbGUtZWFydGgua216XCIsXG4gIFwiLmljY1wiOiBcImFwcGxpY2F0aW9uL3ZuZC5pY2Nwcm9maWxlXCIsXG4gIFwiLmljbVwiOiBcImFwcGxpY2F0aW9uL3ZuZC5pY2Nwcm9maWxlXCIsXG4gIFwiLnhsc1wiOiBcImFwcGxpY2F0aW9uL3ZuZC5tcy1leGNlbFwiLFxuICBcIi54bHN4XCI6IFwiYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnNwcmVhZHNoZWV0bWwuc2hlZXRcIixcbiAgXCIueGxtXCI6IFwiYXBwbGljYXRpb24vdm5kLm1zLWV4Y2VsXCIsXG4gIFwiLnBwdFwiOiBcImFwcGxpY2F0aW9uL3ZuZC5tcy1wb3dlcnBvaW50XCIsXG4gIFwiLnBvdFwiOiBcImFwcGxpY2F0aW9uL3ZuZC5tcy1wb3dlcnBvaW50XCIsXG4gIFwiLnBwdHhcIjpcbiAgICBcImFwcGxpY2F0aW9uL3ZuZC5vcGVueG1sZm9ybWF0cy1vZmZpY2Vkb2N1bWVudC5wcmVzZW50YXRpb25tbC5wcmVzZW50YXRpb25cIixcbiAgXCIucG90eFwiOlxuICAgIFwiYXBwbGljYXRpb24vdm5kLm9wZW54bWxmb3JtYXRzLW9mZmljZWRvY3VtZW50LnByZXNlbnRhdGlvbm1sLnRlbXBsYXRlXCIsXG4gIFwiLnhwc1wiOiBcImFwcGxpY2F0aW9uL3ZuZC5tcy14cHNkb2N1bWVudFwiLFxuICBcIi5vZGNcIjogXCJhcHBsaWNhdGlvbi92bmQub2FzaXMub3BlbmRvY3VtZW50LmNoYXJ0XCIsXG4gIFwiLm9kYlwiOiBcImFwcGxpY2F0aW9uL3ZuZC5vYXNpcy5vcGVuZG9jdW1lbnQuZGF0YWJhc2VcIixcbiAgXCIub2RmXCI6IFwiYXBwbGljYXRpb24vdm5kLm9hc2lzLm9wZW5kb2N1bWVudC5mb3JtdWxhXCIsXG4gIFwiLm9kZ1wiOiBcImFwcGxpY2F0aW9uL3ZuZC5vYXNpcy5vcGVuZG9jdW1lbnQuZ3JhcGhpY3NcIixcbiAgXCIub2RwXCI6IFwiYXBwbGljYXRpb24vdm5kLm9hc2lzLm9wZW5kb2N1bWVudC5wcmVzZW50YXRpb25cIixcbiAgXCIub2RzXCI6IFwiYXBwbGljYXRpb24vdm5kLm9hc2lzLm9wZW5kb2N1bWVudC5zcHJlYWRzaGVldFwiLFxuICBcIi5vZHRcIjogXCJhcHBsaWNhdGlvbi92bmQub2FzaXMub3BlbmRvY3VtZW50LnRleHRcIixcbiAgXCIucmFyXCI6IFwiYXBwbGljYXRpb24vdm5kLnJhclwiLFxuICBcIi51bml0eXdlYlwiOiBcImFwcGxpY2F0aW9uL3ZuZC51bml0eVwiLFxuICBcIi5kbWdcIjogXCJhcHBsaWNhdGlvbi94LWFwcGxlLWRpc2tpbWFnZVwiLFxuICBcIi5ielwiOiBcImFwcGxpY2F0aW9uL3gtYnppcFwiLFxuICBcIi5jcnhcIjogXCJhcHBsaWNhdGlvbi94LWNocm9tZS1leHRlbnNpb25cIixcbiAgXCIuZGViXCI6IFwiYXBwbGljYXRpb24veC1kZWJpYW4tcGFja2FnZVwiLFxuICBcIi5waHBcIjogXCJhcHBsaWNhdGlvbi94LWh0dHBkLXBocFwiLFxuICBcIi5pc29cIjogXCJhcHBsaWNhdGlvbi94LWlzbzk2NjAtaW1hZ2VcIixcbiAgXCIuc2hcIjogXCJhcHBsaWNhdGlvbi94LXNoXCIsXG4gIFwiLnNxbFwiOiBcImFwcGxpY2F0aW9uL3gtc3FsXCIsXG4gIFwiLnNydFwiOiBcImFwcGxpY2F0aW9uL3gtc3VicmlwXCIsXG4gIFwiLnhtbFwiOiBcImFwcGxpY2F0aW9uL3htbFwiLFxuICBcIi56aXBcIjogXCJhcHBsaWNhdGlvbi96aXBcIixcbn07XG5cbi8qKiBSZXR1cm5zIHRoZSBjb250ZW50LXR5cGUgYmFzZWQgb24gdGhlIGV4dGVuc2lvbiBvZiBhIHBhdGguICovXG5mdW5jdGlvbiBjb250ZW50VHlwZShwYXRoOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuICByZXR1cm4gTUVESUFfVFlQRVNbZXh0bmFtZShwYXRoKV07XG59XG5cbi8vIFRoZSBmbnYtMWEgaGFzaCBmdW5jdGlvbi5cbmZ1bmN0aW9uIGZudjFhKGJ1Zjogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGhhc2ggPSAyMTY2MTM2MjYxOyAvLyAzMi1iaXQgRk5WIG9mZnNldCBiYXNpc1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGJ1Zi5sZW5ndGg7IGkrKykge1xuICAgIGhhc2ggXj0gYnVmLmNoYXJDb2RlQXQoaSk7XG4gICAgLy8gRXF1aXZhbGVudCB0byBgaGFzaCAqPSAxNjc3NzYxOWAgd2l0aG91dCB1c2luZyBCaWdJbnRcbiAgICAvLyAzMi1iaXQgRk5WIHByaW1lXG4gICAgaGFzaCArPSAoaGFzaCA8PCAxKSArIChoYXNoIDw8IDQpICsgKGhhc2ggPDwgNykgKyAoaGFzaCA8PCA4KSArXG4gICAgICAoaGFzaCA8PCAyNCk7XG4gIH1cbiAgLy8gMzItYml0IGhleCBzdHJpbmdcbiAgcmV0dXJuIChoYXNoID4+PiAwKS50b1N0cmluZygxNik7XG59XG5cbnR5cGUgRXRhZ0FsZ29yaXRobSA9IFwiZm52MWFcIiB8IFwic2hhLTFcIiB8IFwic2hhLTI1NlwiIHwgXCJzaGEtMzg0XCIgfCBcInNoYS01MTJcIjtcblxuLy8gR2VuZXJhdGVzIGEgaGFzaCBmb3IgdGhlIHByb3ZpZGVkIHN0cmluZ1xuYXN5bmMgZnVuY3Rpb24gY3JlYXRlRXRhZ0hhc2goXG4gIG1lc3NhZ2U6IHN0cmluZyxcbiAgYWxnb3JpdGhtOiBFdGFnQWxnb3JpdGhtID0gXCJmbnYxYVwiLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgaWYgKGFsZ29yaXRobSA9PT0gXCJmbnYxYVwiKSB7XG4gICAgcmV0dXJuIGZudjFhKG1lc3NhZ2UpO1xuICB9XG4gIGNvbnN0IG1zZ1VpbnQ4ID0gZW5jb2Rlci5lbmNvZGUobWVzc2FnZSk7XG4gIGNvbnN0IGhhc2hCdWZmZXIgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChhbGdvcml0aG0sIG1zZ1VpbnQ4KTtcbiAgcmV0dXJuIGRlY29kZXIuZGVjb2RlKGVuY29kZShuZXcgVWludDhBcnJheShoYXNoQnVmZmVyKSkpO1xufVxuXG5mdW5jdGlvbiBtb2RlVG9TdHJpbmcoaXNEaXI6IGJvb2xlYW4sIG1heWJlTW9kZTogbnVtYmVyIHwgbnVsbCk6IHN0cmluZyB7XG4gIGNvbnN0IG1vZGVNYXAgPSBbXCItLS1cIiwgXCItLXhcIiwgXCItdy1cIiwgXCItd3hcIiwgXCJyLS1cIiwgXCJyLXhcIiwgXCJydy1cIiwgXCJyd3hcIl07XG5cbiAgaWYgKG1heWJlTW9kZSA9PT0gbnVsbCkge1xuICAgIHJldHVybiBcIih1bmtub3duIG1vZGUpXCI7XG4gIH1cbiAgY29uc3QgbW9kZSA9IG1heWJlTW9kZS50b1N0cmluZyg4KTtcbiAgaWYgKG1vZGUubGVuZ3RoIDwgMykge1xuICAgIHJldHVybiBcIih1bmtub3duIG1vZGUpXCI7XG4gIH1cbiAgbGV0IG91dHB1dCA9IFwiXCI7XG4gIG1vZGVcbiAgICAuc3BsaXQoXCJcIilcbiAgICAucmV2ZXJzZSgpXG4gICAgLnNsaWNlKDAsIDMpXG4gICAgLmZvckVhY2goKHYpOiB2b2lkID0+IHtcbiAgICAgIG91dHB1dCA9IGAke21vZGVNYXBbK3ZdfSAke291dHB1dH1gO1xuICAgIH0pO1xuICBvdXRwdXQgPSBgJHtpc0RpciA/IFwiZFwiIDogXCItXCJ9ICR7b3V0cHV0fWA7XG4gIHJldHVybiBvdXRwdXQ7XG59XG5cbmZ1bmN0aW9uIGZpbGVMZW5Ub1N0cmluZyhsZW46IG51bWJlcik6IHN0cmluZyB7XG4gIGNvbnN0IG11bHRpcGxpZXIgPSAxMDI0O1xuICBsZXQgYmFzZSA9IDE7XG4gIGNvbnN0IHN1ZmZpeCA9IFtcIkJcIiwgXCJLXCIsIFwiTVwiLCBcIkdcIiwgXCJUXCJdO1xuICBsZXQgc3VmZml4SW5kZXggPSAwO1xuXG4gIHdoaWxlIChiYXNlICogbXVsdGlwbGllciA8IGxlbikge1xuICAgIGlmIChzdWZmaXhJbmRleCA+PSBzdWZmaXgubGVuZ3RoIC0gMSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGJhc2UgKj0gbXVsdGlwbGllcjtcbiAgICBzdWZmaXhJbmRleCsrO1xuICB9XG5cbiAgcmV0dXJuIGAkeyhsZW4gLyBiYXNlKS50b0ZpeGVkKDIpfSR7c3VmZml4W3N1ZmZpeEluZGV4XX1gO1xufVxuXG5pbnRlcmZhY2UgU2VydmVGaWxlT3B0aW9ucyB7XG4gIGV0YWdBbGdvcml0aG0/OiBFdGFnQWxnb3JpdGhtO1xuICBmaWxlSW5mbz86IERlbm8uRmlsZUluZm87XG59XG5cbi8qKlxuICogUmV0dXJucyBhbiBIVFRQIFJlc3BvbnNlIHdpdGggdGhlIHJlcXVlc3RlZCBmaWxlIGFzIHRoZSBib2R5LlxuICogQHBhcmFtIHJlcSBUaGUgc2VydmVyIHJlcXVlc3QgY29udGV4dCB1c2VkIHRvIGNsZWFudXAgdGhlIGZpbGUgaGFuZGxlLlxuICogQHBhcmFtIGZpbGVQYXRoIFBhdGggb2YgdGhlIGZpbGUgdG8gc2VydmUuXG4gKiBAcGFyYW0gZXRhZ0FsZ29yaXRobSBUaGUgYWxnb3JpdGhtIHRvIHVzZSBmb3IgZ2VuZXJhdGluZyB0aGUgRVRhZy4gRGVmYXVsdHMgdG8gXCJmbnYxYVwiLlxuICogQHBhcmFtIGZpbGVJbmZvIEFuIG9wdGlvbmFsIEZpbGVJbmZvIG9iamVjdCByZXR1cm5lZCBieSBEZW5vLnN0YXQuIEl0IGlzIHVzZWRcbiAqIGZvciBvcHRpbWl6YXRpb24gcHVycG9zZXMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXJ2ZUZpbGUoXG4gIHJlcTogUmVxdWVzdCxcbiAgZmlsZVBhdGg6IHN0cmluZyxcbiAgeyBldGFnQWxnb3JpdGhtLCBmaWxlSW5mbyB9OiBTZXJ2ZUZpbGVPcHRpb25zID0ge30sXG4pOiBQcm9taXNlPFJlc3BvbnNlPiB7XG4gIGxldCBmaWxlOiBEZW5vLkZzRmlsZTtcbiAgaWYgKGZpbGVJbmZvID09PSB1bmRlZmluZWQpIHtcbiAgICBbZmlsZSwgZmlsZUluZm9dID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgRGVuby5vcGVuKGZpbGVQYXRoKSxcbiAgICAgIERlbm8uc3RhdChmaWxlUGF0aCksXG4gICAgXSk7XG4gIH0gZWxzZSB7XG4gICAgZmlsZSA9IGF3YWl0IERlbm8ub3BlbihmaWxlUGF0aCk7XG4gIH1cbiAgY29uc3QgaGVhZGVycyA9IHNldEJhc2VIZWFkZXJzKCk7XG5cbiAgLy8gU2V0IG1pbWUtdHlwZSB1c2luZyB0aGUgZmlsZSBleHRlbnNpb24gaW4gZmlsZVBhdGhcbiAgY29uc3QgY29udGVudFR5cGVWYWx1ZSA9IGNvbnRlbnRUeXBlKGZpbGVQYXRoKTtcbiAgaWYgKGNvbnRlbnRUeXBlVmFsdWUpIHtcbiAgICBoZWFkZXJzLnNldChcImNvbnRlbnQtdHlwZVwiLCBjb250ZW50VHlwZVZhbHVlKTtcbiAgfVxuXG4gIC8vIFNldCBkYXRlIGhlYWRlciBpZiBhY2Nlc3MgdGltZXN0YW1wIGlzIGF2YWlsYWJsZVxuICBpZiAoZmlsZUluZm8uYXRpbWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKGZpbGVJbmZvLmF0aW1lKTtcbiAgICBoZWFkZXJzLnNldChcImRhdGVcIiwgZGF0ZS50b1VUQ1N0cmluZygpKTtcbiAgfVxuXG4gIC8vIFNldCBsYXN0IG1vZGlmaWVkIGhlYWRlciBpZiBhY2Nlc3MgdGltZXN0YW1wIGlzIGF2YWlsYWJsZVxuICBpZiAoZmlsZUluZm8ubXRpbWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgY29uc3QgbGFzdE1vZGlmaWVkID0gbmV3IERhdGUoZmlsZUluZm8ubXRpbWUpO1xuICAgIGhlYWRlcnMuc2V0KFwibGFzdC1tb2RpZmllZFwiLCBsYXN0TW9kaWZpZWQudG9VVENTdHJpbmcoKSk7XG5cbiAgICAvLyBDcmVhdGUgYSBzaW1wbGUgZXRhZyB0aGF0IGlzIGFuIG1kNSBvZiB0aGUgbGFzdCBtb2RpZmllZCBkYXRlIGFuZCBmaWxlc2l6ZSBjb25jYXRlbmF0ZWRcbiAgICBjb25zdCBzaW1wbGVFdGFnID0gYXdhaXQgY3JlYXRlRXRhZ0hhc2goXG4gICAgICBgJHtsYXN0TW9kaWZpZWQudG9KU09OKCl9JHtmaWxlSW5mby5zaXplfWAsXG4gICAgICBldGFnQWxnb3JpdGhtIHx8IFwiZm52MWFcIixcbiAgICApO1xuICAgIGhlYWRlcnMuc2V0KFwiZXRhZ1wiLCBzaW1wbGVFdGFnKTtcblxuICAgIC8vIElmIGEgYGlmLW5vbmUtbWF0Y2hgIGhlYWRlciBpcyBwcmVzZW50IGFuZCB0aGUgdmFsdWUgbWF0Y2hlcyB0aGUgdGFnIG9yXG4gICAgLy8gaWYgYSBgaWYtbW9kaWZpZWQtc2luY2VgIGhlYWRlciBpcyBwcmVzZW50IGFuZCB0aGUgdmFsdWUgaXMgYmlnZ2VyIHRoYW5cbiAgICAvLyB0aGUgYWNjZXNzIHRpbWVzdGFtcCB2YWx1ZSwgdGhlbiByZXR1cm4gMzA0XG4gICAgY29uc3QgaWZOb25lTWF0Y2ggPSByZXEuaGVhZGVycy5nZXQoXCJpZi1ub25lLW1hdGNoXCIpO1xuICAgIGNvbnN0IGlmTW9kaWZpZWRTaW5jZSA9IHJlcS5oZWFkZXJzLmdldChcImlmLW1vZGlmaWVkLXNpbmNlXCIpO1xuICAgIGlmIChcbiAgICAgIChpZk5vbmVNYXRjaCAmJlxuICAgICAgICAoaWZOb25lTWF0Y2ggPT09IHNpbXBsZUV0YWcgfHwgXCJXL1wiICsgaWZOb25lTWF0Y2ggPT09IHNpbXBsZUV0YWcgfHxcbiAgICAgICAgICBpZk5vbmVNYXRjaCA9PT0gXCJXL1wiICsgc2ltcGxlRXRhZykpIHx8XG4gICAgICAoaWZOb25lTWF0Y2ggPT09IG51bGwgJiZcbiAgICAgICAgaWZNb2RpZmllZFNpbmNlICYmXG4gICAgICAgIGZpbGVJbmZvLm10aW1lLmdldFRpbWUoKSA8IG5ldyBEYXRlKGlmTW9kaWZpZWRTaW5jZSkuZ2V0VGltZSgpICsgMTAwMClcbiAgICApIHtcbiAgICAgIGNvbnN0IHN0YXR1cyA9IFN0YXR1cy5Ob3RNb2RpZmllZDtcbiAgICAgIGNvbnN0IHN0YXR1c1RleHQgPSBTVEFUVVNfVEVYVC5nZXQoc3RhdHVzKTtcblxuICAgICAgZmlsZS5jbG9zZSgpO1xuXG4gICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKG51bGwsIHtcbiAgICAgICAgc3RhdHVzLFxuICAgICAgICBzdGF0dXNUZXh0LFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgLy8gR2V0IGFuZCBwYXJzZSB0aGUgXCJyYW5nZVwiIGhlYWRlclxuICBjb25zdCByYW5nZSA9IHJlcS5oZWFkZXJzLmdldChcInJhbmdlXCIpIGFzIHN0cmluZztcbiAgY29uc3QgcmFuZ2VSZSA9IC9ieXRlcz0oXFxkKyktKFxcZCspPy87XG4gIGNvbnN0IHBhcnNlZCA9IHJhbmdlUmUuZXhlYyhyYW5nZSk7XG5cbiAgLy8gVXNlIHRoZSBwYXJzZWQgdmFsdWUgaWYgYXZhaWxhYmxlLCBmYWxsYmFjayB0byB0aGUgc3RhcnQgYW5kIGVuZCBvZiB0aGUgZW50aXJlIGZpbGVcbiAgY29uc3Qgc3RhcnQgPSBwYXJzZWQgJiYgcGFyc2VkWzFdID8gK3BhcnNlZFsxXSA6IDA7XG4gIGNvbnN0IGVuZCA9IHBhcnNlZCAmJiBwYXJzZWRbMl0gPyArcGFyc2VkWzJdIDogZmlsZUluZm8uc2l6ZSAtIDE7XG5cbiAgLy8gSWYgdGhlcmUgaXMgYSByYW5nZSwgc2V0IHRoZSBzdGF0dXMgdG8gMjA2LCBhbmQgc2V0IHRoZSBcIkNvbnRlbnQtcmFuZ2VcIiBoZWFkZXIuXG4gIGlmIChyYW5nZSAmJiBwYXJzZWQpIHtcbiAgICBoZWFkZXJzLnNldChcImNvbnRlbnQtcmFuZ2VcIiwgYGJ5dGVzICR7c3RhcnR9LSR7ZW5kfS8ke2ZpbGVJbmZvLnNpemV9YCk7XG4gIH1cblxuICAvLyBSZXR1cm4gNDE2IGlmIGBzdGFydGAgaXNuJ3QgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIGBlbmRgLCBvciBgc3RhcnRgIG9yIGBlbmRgIGFyZSBncmVhdGVyIHRoYW4gdGhlIGZpbGUncyBzaXplXG4gIGNvbnN0IG1heFJhbmdlID0gZmlsZUluZm8uc2l6ZSAtIDE7XG5cbiAgaWYgKFxuICAgIHJhbmdlICYmXG4gICAgKCFwYXJzZWQgfHxcbiAgICAgIHR5cGVvZiBzdGFydCAhPT0gXCJudW1iZXJcIiB8fFxuICAgICAgc3RhcnQgPiBlbmQgfHxcbiAgICAgIHN0YXJ0ID4gbWF4UmFuZ2UgfHxcbiAgICAgIGVuZCA+IG1heFJhbmdlKVxuICApIHtcbiAgICBjb25zdCBzdGF0dXMgPSBTdGF0dXMuUmVxdWVzdGVkUmFuZ2VOb3RTYXRpc2ZpYWJsZTtcbiAgICBjb25zdCBzdGF0dXNUZXh0ID0gU1RBVFVTX1RFWFQuZ2V0KHN0YXR1cyk7XG5cbiAgICBmaWxlLmNsb3NlKCk7XG5cbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKHN0YXR1c1RleHQsIHtcbiAgICAgIHN0YXR1cyxcbiAgICAgIHN0YXR1c1RleHQsXG4gICAgICBoZWFkZXJzLFxuICAgIH0pO1xuICB9XG5cbiAgLy8gU2V0IGNvbnRlbnQgbGVuZ3RoXG4gIGNvbnN0IGNvbnRlbnRMZW5ndGggPSBlbmQgLSBzdGFydCArIDE7XG4gIGhlYWRlcnMuc2V0KFwiY29udGVudC1sZW5ndGhcIiwgYCR7Y29udGVudExlbmd0aH1gKTtcbiAgaWYgKHJhbmdlICYmIHBhcnNlZCkge1xuICAgIC8vIENyZWF0ZSBhIHN0cmVhbSBvZiB0aGUgZmlsZSBpbnN0ZWFkIG9mIGxvYWRpbmcgaXQgaW50byBtZW1vcnlcbiAgICBsZXQgYnl0ZXNTZW50ID0gMDtcbiAgICBjb25zdCBib2R5ID0gbmV3IFJlYWRhYmxlU3RyZWFtKHtcbiAgICAgIGFzeW5jIHN0YXJ0KCkge1xuICAgICAgICBpZiAoc3RhcnQgPiAwKSB7XG4gICAgICAgICAgYXdhaXQgZmlsZS5zZWVrKHN0YXJ0LCBEZW5vLlNlZWtNb2RlLlN0YXJ0KTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIGFzeW5jIHB1bGwoY29udHJvbGxlcikge1xuICAgICAgICBjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KERFRkFVTFRfQ0hVTktfU0laRSk7XG4gICAgICAgIGNvbnN0IGJ5dGVzUmVhZCA9IGF3YWl0IGZpbGUucmVhZChieXRlcyk7XG4gICAgICAgIGlmIChieXRlc1JlYWQgPT09IG51bGwpIHtcbiAgICAgICAgICBmaWxlLmNsb3NlKCk7XG4gICAgICAgICAgY29udHJvbGxlci5jbG9zZSgpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb250cm9sbGVyLmVucXVldWUoXG4gICAgICAgICAgYnl0ZXMuc2xpY2UoMCwgTWF0aC5taW4oYnl0ZXNSZWFkLCBjb250ZW50TGVuZ3RoIC0gYnl0ZXNTZW50KSksXG4gICAgICAgICk7XG4gICAgICAgIGJ5dGVzU2VudCArPSBieXRlc1JlYWQ7XG4gICAgICAgIGlmIChieXRlc1NlbnQgPiBjb250ZW50TGVuZ3RoKSB7XG4gICAgICAgICAgZmlsZS5jbG9zZSgpO1xuICAgICAgICAgIGNvbnRyb2xsZXIuY2xvc2UoKTtcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHJldHVybiBuZXcgUmVzcG9uc2UoYm9keSwge1xuICAgICAgc3RhdHVzOiAyMDYsXG4gICAgICBzdGF0dXNUZXh0OiBcIlBhcnRpYWwgQ29udGVudFwiLFxuICAgICAgaGVhZGVycyxcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBuZXcgUmVzcG9uc2UoZmlsZS5yZWFkYWJsZSwge1xuICAgIHN0YXR1czogMjAwLFxuICAgIHN0YXR1c1RleHQ6IFwiT0tcIixcbiAgICBoZWFkZXJzLFxuICB9KTtcbn1cblxuLy8gVE9ETyhiYXJ0bG9taWVqdSk6IHNpbXBsaWZ5IHRoaXMgYWZ0ZXIgZGVuby5zdGF0IGFuZCBkZW5vLnJlYWREaXIgYXJlIGZpeGVkXG5hc3luYyBmdW5jdGlvbiBzZXJ2ZURpckluZGV4KFxuICByZXE6IFJlcXVlc3QsXG4gIGRpclBhdGg6IHN0cmluZyxcbiAgb3B0aW9uczoge1xuICAgIGRvdGZpbGVzOiBib29sZWFuO1xuICAgIHRhcmdldDogc3RyaW5nO1xuICAgIGV0YWdBbGdvcml0aG0/OiBFdGFnQWxnb3JpdGhtO1xuICB9LFxuKTogUHJvbWlzZTxSZXNwb25zZT4ge1xuICBjb25zdCBzaG93RG90ZmlsZXMgPSBvcHRpb25zLmRvdGZpbGVzO1xuICBjb25zdCBkaXJVcmwgPSBgLyR7cG9zaXgucmVsYXRpdmUob3B0aW9ucy50YXJnZXQsIGRpclBhdGgpfWA7XG4gIGNvbnN0IGxpc3RFbnRyeTogRW50cnlJbmZvW10gPSBbXTtcblxuICAvLyBpZiBcIi4uXCIgbWFrZXMgc2Vuc2VcbiAgaWYgKGRpclVybCAhPT0gXCIvXCIpIHtcbiAgICBjb25zdCBwcmV2UGF0aCA9IHBvc2l4LmpvaW4oZGlyUGF0aCwgXCIuLlwiKTtcbiAgICBjb25zdCBmaWxlSW5mbyA9IGF3YWl0IERlbm8uc3RhdChwcmV2UGF0aCk7XG4gICAgbGlzdEVudHJ5LnB1c2goe1xuICAgICAgbW9kZTogbW9kZVRvU3RyaW5nKHRydWUsIGZpbGVJbmZvLm1vZGUpLFxuICAgICAgc2l6ZTogXCJcIixcbiAgICAgIG5hbWU6IFwiLi4vXCIsXG4gICAgICB1cmw6IHBvc2l4LmpvaW4oZGlyVXJsLCBcIi4uXCIpLFxuICAgIH0pO1xuICB9XG5cbiAgZm9yIGF3YWl0IChjb25zdCBlbnRyeSBvZiBEZW5vLnJlYWREaXIoZGlyUGF0aCkpIHtcbiAgICBpZiAoIXNob3dEb3RmaWxlcyAmJiBlbnRyeS5uYW1lWzBdID09PSBcIi5cIikge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGZpbGVQYXRoID0gcG9zaXguam9pbihkaXJQYXRoLCBlbnRyeS5uYW1lKTtcbiAgICBjb25zdCBmaWxlVXJsID0gZW5jb2RlVVJJKHBvc2l4LmpvaW4oZGlyVXJsLCBlbnRyeS5uYW1lKSk7XG4gICAgY29uc3QgZmlsZUluZm8gPSBhd2FpdCBEZW5vLnN0YXQoZmlsZVBhdGgpO1xuICAgIGlmIChlbnRyeS5uYW1lID09PSBcImluZGV4Lmh0bWxcIiAmJiBlbnRyeS5pc0ZpbGUpIHtcbiAgICAgIC8vIGluIGNhc2UgaW5kZXguaHRtbCBhcyBkaXIuLi5cbiAgICAgIHJldHVybiBzZXJ2ZUZpbGUocmVxLCBmaWxlUGF0aCwge1xuICAgICAgICBldGFnQWxnb3JpdGhtOiBvcHRpb25zLmV0YWdBbGdvcml0aG0sXG4gICAgICAgIGZpbGVJbmZvLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGxpc3RFbnRyeS5wdXNoKHtcbiAgICAgIG1vZGU6IG1vZGVUb1N0cmluZyhlbnRyeS5pc0RpcmVjdG9yeSwgZmlsZUluZm8ubW9kZSksXG4gICAgICBzaXplOiBlbnRyeS5pc0ZpbGUgPyBmaWxlTGVuVG9TdHJpbmcoZmlsZUluZm8uc2l6ZSA/PyAwKSA6IFwiXCIsXG4gICAgICBuYW1lOiBgJHtlbnRyeS5uYW1lfSR7ZW50cnkuaXNEaXJlY3RvcnkgPyBcIi9cIiA6IFwiXCJ9YCxcbiAgICAgIHVybDogYCR7ZmlsZVVybH0ke2VudHJ5LmlzRGlyZWN0b3J5ID8gXCIvXCIgOiBcIlwifWAsXG4gICAgfSk7XG4gIH1cbiAgbGlzdEVudHJ5LnNvcnQoKGEsIGIpID0+XG4gICAgYS5uYW1lLnRvTG93ZXJDYXNlKCkgPiBiLm5hbWUudG9Mb3dlckNhc2UoKSA/IDEgOiAtMVxuICApO1xuICBjb25zdCBmb3JtYXR0ZWREaXJVcmwgPSBgJHtkaXJVcmwucmVwbGFjZSgvXFwvJC8sIFwiXCIpfS9gO1xuICBjb25zdCBwYWdlID0gZW5jb2Rlci5lbmNvZGUoZGlyVmlld2VyVGVtcGxhdGUoZm9ybWF0dGVkRGlyVXJsLCBsaXN0RW50cnkpKTtcblxuICBjb25zdCBoZWFkZXJzID0gc2V0QmFzZUhlYWRlcnMoKTtcbiAgaGVhZGVycy5zZXQoXCJjb250ZW50LXR5cGVcIiwgXCJ0ZXh0L2h0bWxcIik7XG5cbiAgcmV0dXJuIG5ldyBSZXNwb25zZShwYWdlLCB7IHN0YXR1czogU3RhdHVzLk9LLCBoZWFkZXJzIH0pO1xufVxuXG5mdW5jdGlvbiBzZXJ2ZUZhbGxiYWNrKF9yZXE6IFJlcXVlc3QsIGU6IEVycm9yKTogUHJvbWlzZTxSZXNwb25zZT4ge1xuICBpZiAoZSBpbnN0YW5jZW9mIFVSSUVycm9yKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShcbiAgICAgIG5ldyBSZXNwb25zZShTVEFUVVNfVEVYVC5nZXQoU3RhdHVzLkJhZFJlcXVlc3QpLCB7XG4gICAgICAgIHN0YXR1czogU3RhdHVzLkJhZFJlcXVlc3QsXG4gICAgICB9KSxcbiAgICApO1xuICB9IGVsc2UgaWYgKGUgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5Ob3RGb3VuZCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoXG4gICAgICBuZXcgUmVzcG9uc2UoU1RBVFVTX1RFWFQuZ2V0KFN0YXR1cy5Ob3RGb3VuZCksIHtcbiAgICAgICAgc3RhdHVzOiBTdGF0dXMuTm90Rm91bmQsXG4gICAgICB9KSxcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShcbiAgICBuZXcgUmVzcG9uc2UoU1RBVFVTX1RFWFQuZ2V0KFN0YXR1cy5JbnRlcm5hbFNlcnZlckVycm9yKSwge1xuICAgICAgc3RhdHVzOiBTdGF0dXMuSW50ZXJuYWxTZXJ2ZXJFcnJvcixcbiAgICB9KSxcbiAgKTtcbn1cblxuZnVuY3Rpb24gc2VydmVyTG9nKHJlcTogUmVxdWVzdCwgc3RhdHVzOiBudW1iZXIpOiB2b2lkIHtcbiAgY29uc3QgZCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgY29uc3QgZGF0ZUZtdCA9IGBbJHtkLnNsaWNlKDAsIDEwKX0gJHtkLnNsaWNlKDExLCAxOSl9XWA7XG4gIGNvbnN0IG5vcm1hbGl6ZWRVcmwgPSBub3JtYWxpemVVUkwocmVxLnVybCk7XG4gIGNvbnN0IHMgPSBgJHtkYXRlRm10fSBbJHtyZXEubWV0aG9kfV0gJHtub3JtYWxpemVkVXJsfSAke3N0YXR1c31gO1xuICAvLyB1c2luZyBjb25zb2xlLmRlYnVnIGluc3RlYWQgb2YgY29uc29sZS5sb2cgc28gY2hyb21lIGluc3BlY3QgdXNlcnMgY2FuIGhpZGUgcmVxdWVzdCBsb2dzXG4gIGNvbnNvbGUuZGVidWcocyk7XG59XG5cbmZ1bmN0aW9uIHNldEJhc2VIZWFkZXJzKCk6IEhlYWRlcnMge1xuICBjb25zdCBoZWFkZXJzID0gbmV3IEhlYWRlcnMoKTtcbiAgaGVhZGVycy5zZXQoXCJzZXJ2ZXJcIiwgXCJkZW5vXCIpO1xuXG4gIC8vIFNldCBcImFjY2VwdC1yYW5nZXNcIiBzbyB0aGF0IHRoZSBjbGllbnQga25vd3MgaXQgY2FuIG1ha2UgcmFuZ2UgcmVxdWVzdHMgb24gZnV0dXJlIHJlcXVlc3RzXG4gIGhlYWRlcnMuc2V0KFwiYWNjZXB0LXJhbmdlc1wiLCBcImJ5dGVzXCIpO1xuICBoZWFkZXJzLnNldChcImRhdGVcIiwgbmV3IERhdGUoKS50b1VUQ1N0cmluZygpKTtcblxuICByZXR1cm4gaGVhZGVycztcbn1cblxuZnVuY3Rpb24gZGlyVmlld2VyVGVtcGxhdGUoZGlybmFtZTogc3RyaW5nLCBlbnRyaWVzOiBFbnRyeUluZm9bXSk6IHN0cmluZyB7XG4gIGNvbnN0IHBhdGhzID0gZGlybmFtZS5zcGxpdChcIi9cIik7XG5cbiAgcmV0dXJuIGBcbiAgICA8IURPQ1RZUEUgaHRtbD5cbiAgICA8aHRtbCBsYW5nPVwiZW5cIj5cbiAgICAgIDxoZWFkPlxuICAgICAgICA8bWV0YSBjaGFyc2V0PVwiVVRGLThcIiAvPlxuICAgICAgICA8bWV0YSBuYW1lPVwidmlld3BvcnRcIiBjb250ZW50PVwid2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEuMFwiIC8+XG4gICAgICAgIDxtZXRhIGh0dHAtZXF1aXY9XCJYLVVBLUNvbXBhdGlibGVcIiBjb250ZW50PVwiaWU9ZWRnZVwiIC8+XG4gICAgICAgIDx0aXRsZT5EZW5vIEZpbGUgU2VydmVyPC90aXRsZT5cbiAgICAgICAgPHN0eWxlPlxuICAgICAgICAgIDpyb290IHtcbiAgICAgICAgICAgIC0tYmFja2dyb3VuZC1jb2xvcjogI2ZhZmFmYTtcbiAgICAgICAgICAgIC0tY29sb3I6IHJnYmEoMCwgMCwgMCwgMC44Nyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIEBtZWRpYSAocHJlZmVycy1jb2xvci1zY2hlbWU6IGRhcmspIHtcbiAgICAgICAgICAgIDpyb290IHtcbiAgICAgICAgICAgICAgLS1iYWNrZ3JvdW5kLWNvbG9yOiAjMjkyOTI5O1xuICAgICAgICAgICAgICAtLWNvbG9yOiAjZmZmO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhlYWQge1xuICAgICAgICAgICAgICBjb2xvcjogIzdmN2Y3ZjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgQG1lZGlhIChtaW4td2lkdGg6IDk2MHB4KSB7XG4gICAgICAgICAgICBtYWluIHtcbiAgICAgICAgICAgICAgbWF4LXdpZHRoOiA5NjBweDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJvZHkge1xuICAgICAgICAgICAgICBwYWRkaW5nLWxlZnQ6IDMycHg7XG4gICAgICAgICAgICAgIHBhZGRpbmctcmlnaHQ6IDMycHg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIEBtZWRpYSAobWluLXdpZHRoOiA2MDBweCkge1xuICAgICAgICAgICAgbWFpbiB7XG4gICAgICAgICAgICAgIHBhZGRpbmctbGVmdDogMjRweDtcbiAgICAgICAgICAgICAgcGFkZGluZy1yaWdodDogMjRweDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgYm9keSB7XG4gICAgICAgICAgICBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLWNvbG9yKTtcbiAgICAgICAgICAgIGNvbG9yOiB2YXIoLS1jb2xvcik7XG4gICAgICAgICAgICBmb250LWZhbWlseTogXCJSb2JvdG9cIiwgXCJIZWx2ZXRpY2FcIiwgXCJBcmlhbFwiLCBzYW5zLXNlcmlmO1xuICAgICAgICAgICAgZm9udC13ZWlnaHQ6IDQwMDtcbiAgICAgICAgICAgIGxpbmUtaGVpZ2h0OiAxLjQzO1xuICAgICAgICAgICAgZm9udC1zaXplOiAwLjg3NXJlbTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYSB7XG4gICAgICAgICAgICBjb2xvcjogIzIxOTZmMztcbiAgICAgICAgICAgIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYTpob3ZlciB7XG4gICAgICAgICAgICB0ZXh0LWRlY29yYXRpb246IHVuZGVybGluZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhlYWQge1xuICAgICAgICAgICAgdGV4dC1hbGlnbjogbGVmdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhlYWQgdGgge1xuICAgICAgICAgICAgcGFkZGluZy1ib3R0b206IDEycHg7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRhYmxlIHRkIHtcbiAgICAgICAgICAgIHBhZGRpbmc6IDZweCAzNnB4IDZweCAwcHg7XG4gICAgICAgICAgfVxuICAgICAgICAgIC5zaXplIHtcbiAgICAgICAgICAgIHRleHQtYWxpZ246IHJpZ2h0O1xuICAgICAgICAgICAgcGFkZGluZzogNnB4IDEycHggNnB4IDI0cHg7XG4gICAgICAgICAgfVxuICAgICAgICAgIC5tb2RlIHtcbiAgICAgICAgICAgIGZvbnQtZmFtaWx5OiBtb25vc3BhY2UsIG1vbm9zcGFjZTtcbiAgICAgICAgICB9XG4gICAgICAgIDwvc3R5bGU+XG4gICAgICA8L2hlYWQ+XG4gICAgICA8Ym9keT5cbiAgICAgICAgPG1haW4+XG4gICAgICAgICAgPGgxPkluZGV4IG9mXG4gICAgICAgICAgPGEgaHJlZj1cIi9cIj5ob21lPC9hPiR7XG4gICAgcGF0aHNcbiAgICAgIC5tYXAoKHBhdGgsIGluZGV4LCBhcnJheSkgPT4ge1xuICAgICAgICBpZiAocGF0aCA9PT0gXCJcIikgcmV0dXJuIFwiXCI7XG4gICAgICAgIGNvbnN0IGxpbmsgPSBhcnJheS5zbGljZSgwLCBpbmRleCArIDEpLmpvaW4oXCIvXCIpO1xuICAgICAgICByZXR1cm4gYDxhIGhyZWY9XCIke2xpbmt9XCI+JHtwYXRofTwvYT5gO1xuICAgICAgfSlcbiAgICAgIC5qb2luKFwiL1wiKVxuICB9XG4gICAgICAgICAgPC9oMT5cbiAgICAgICAgICA8dGFibGU+XG4gICAgICAgICAgICA8dGhlYWQ+XG4gICAgICAgICAgICAgIDx0cj5cbiAgICAgICAgICAgICAgICA8dGg+TW9kZTwvdGg+XG4gICAgICAgICAgICAgICAgPHRoPlNpemU8L3RoPlxuICAgICAgICAgICAgICAgIDx0aD5OYW1lPC90aD5cbiAgICAgICAgICAgICAgPC90cj5cbiAgICAgICAgICAgIDwvdGhlYWQ+XG4gICAgICAgICAgICAke1xuICAgIGVudHJpZXNcbiAgICAgIC5tYXAoXG4gICAgICAgIChlbnRyeSkgPT4gYFxuICAgICAgICAgICAgICAgICAgPHRyPlxuICAgICAgICAgICAgICAgICAgICA8dGQgY2xhc3M9XCJtb2RlXCI+XG4gICAgICAgICAgICAgICAgICAgICAgJHtlbnRyeS5tb2RlfVxuICAgICAgICAgICAgICAgICAgICA8L3RkPlxuICAgICAgICAgICAgICAgICAgICA8dGQgY2xhc3M9XCJzaXplXCI+XG4gICAgICAgICAgICAgICAgICAgICAgJHtlbnRyeS5zaXplfVxuICAgICAgICAgICAgICAgICAgICA8L3RkPlxuICAgICAgICAgICAgICAgICAgICA8dGQ+XG4gICAgICAgICAgICAgICAgICAgICAgPGEgaHJlZj1cIiR7ZW50cnkudXJsfVwiPiR7ZW50cnkubmFtZX08L2E+XG4gICAgICAgICAgICAgICAgICAgIDwvdGQ+XG4gICAgICAgICAgICAgICAgICA8L3RyPlxuICAgICAgICAgICAgICAgIGAsXG4gICAgICApXG4gICAgICAuam9pbihcIlwiKVxuICB9XG4gICAgICAgICAgPC90YWJsZT5cbiAgICAgICAgPC9tYWluPlxuICAgICAgPC9ib2R5PlxuICAgIDwvaHRtbD5cbiAgYDtcbn1cblxuaW50ZXJmYWNlIFNlcnZlRGlyT3B0aW9ucyB7XG4gIGZzUm9vdD86IHN0cmluZztcbiAgdXJsUm9vdD86IHN0cmluZztcbiAgc2hvd0Rpckxpc3Rpbmc/OiBib29sZWFuO1xuICBzaG93RG90ZmlsZXM/OiBib29sZWFuO1xuICBlbmFibGVDb3JzPzogYm9vbGVhbjtcbiAgcXVpZXQ/OiBib29sZWFuO1xuICBldGFnQWxnb3JpdGhtPzogRXRhZ0FsZ29yaXRobTtcbn1cblxuLyoqXG4gKiBTZXJ2ZXMgdGhlIGZpbGVzIHVuZGVyIHRoZSBnaXZlbiBkaXJlY3Rvcnkgcm9vdCAob3B0cy5mc1Jvb3QpLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZSB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvc2VydmVyLnRzXCI7XG4gKiBpbXBvcnQgeyBzZXJ2ZURpciB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvZmlsZV9zZXJ2ZXIudHNcIjtcbiAqXG4gKiBzZXJ2ZSgocmVxKSA9PiB7XG4gKiAgIGNvbnN0IHBhdGhuYW1lID0gbmV3IFVSTChyZXEudXJsKS5wYXRobmFtZTtcbiAqICAgaWYgKHBhdGhuYW1lLnN0YXJ0c1dpdGgoXCIvc3RhdGljXCIpKSB7XG4gKiAgICAgcmV0dXJuIHNlcnZlRGlyKHJlcSwge1xuICogICAgICAgZnNSb290OiBcInBhdGgvdG8vc3RhdGljL2ZpbGVzL2RpclwiLFxuICogICAgIH0pO1xuICogICB9XG4gKiAgIC8vIERvIGR5bmFtaWMgcmVzcG9uc2VzXG4gKiAgIHJldHVybiBuZXcgUmVzcG9uc2UoKTtcbiAqIH0pO1xuICogYGBgXG4gKlxuICogT3B0aW9uYWxseSB5b3UgY2FuIHBhc3MgYHVybFJvb3RgIG9wdGlvbi4gSWYgaXQncyBzcGVjaWZpZWQgdGhhdCBwYXJ0IGlzIHN0cmlwcGVkIGZyb20gdGhlIGJlZ2lubmluZyBvZiB0aGUgcmVxdWVzdGVkIHBhdGhuYW1lLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBzZXJ2ZURpciB9IGZyb20gXCJodHRwczovL2Rlbm8ubGFuZC9zdGRAJFNURF9WRVJTSU9OL2h0dHAvZmlsZV9zZXJ2ZXIudHNcIjtcbiAqXG4gKiAvLyAuLi5cbiAqIHNlcnZlRGlyKG5ldyBSZXF1ZXN0KFwiaHR0cDovL2xvY2FsaG9zdC9zdGF0aWMvcGF0aC90by9maWxlXCIpLCB7XG4gKiAgIGZzUm9vdDogXCJwdWJsaWNcIixcbiAqICAgdXJsUm9vdDogXCJzdGF0aWNcIixcbiAqIH0pO1xuICogYGBgXG4gKlxuICogVGhlIGFib3ZlIGV4YW1wbGUgc2VydmVzIGAuL3B1YmxpYy9wYXRoL3RvL2ZpbGVgIGZvciB0aGUgcmVxdWVzdCB0byBgL3N0YXRpYy9wYXRoL3RvL2ZpbGVgLlxuICpcbiAqIEBwYXJhbSByZXF1ZXN0IFRoZSByZXF1ZXN0IHRvIGhhbmRsZVxuICogQHBhcmFtIG9wdHNcbiAqIEByZXR1cm5zXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXJ2ZURpcihyZXE6IFJlcXVlc3QsIG9wdHM6IFNlcnZlRGlyT3B0aW9ucyA9IHt9KSB7XG4gIGxldCByZXNwb25zZTogUmVzcG9uc2U7XG4gIGNvbnN0IHRhcmdldCA9IG9wdHMuZnNSb290IHx8IFwiLlwiO1xuICBjb25zdCB1cmxSb290ID0gb3B0cy51cmxSb290O1xuXG4gIHRyeSB7XG4gICAgbGV0IG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplVVJMKHJlcS51cmwpO1xuICAgIGlmICh1cmxSb290KSB7XG4gICAgICBpZiAobm9ybWFsaXplZFBhdGguc3RhcnRzV2l0aChcIi9cIiArIHVybFJvb3QpKSB7XG4gICAgICAgIG5vcm1hbGl6ZWRQYXRoID0gbm9ybWFsaXplZFBhdGgucmVwbGFjZSh1cmxSb290LCBcIlwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBEZW5vLmVycm9ycy5Ob3RGb3VuZCgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGZzUGF0aCA9IHBvc2l4LmpvaW4odGFyZ2V0LCBub3JtYWxpemVkUGF0aCk7XG4gICAgY29uc3QgZmlsZUluZm8gPSBhd2FpdCBEZW5vLnN0YXQoZnNQYXRoKTtcblxuICAgIGlmIChmaWxlSW5mby5pc0RpcmVjdG9yeSkge1xuICAgICAgaWYgKG9wdHMuc2hvd0Rpckxpc3RpbmcpIHtcbiAgICAgICAgcmVzcG9uc2UgPSBhd2FpdCBzZXJ2ZURpckluZGV4KHJlcSwgZnNQYXRoLCB7XG4gICAgICAgICAgZG90ZmlsZXM6IG9wdHMuc2hvd0RvdGZpbGVzIHx8IGZhbHNlLFxuICAgICAgICAgIHRhcmdldCxcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRGVuby5lcnJvcnMuTm90Rm91bmQoKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmVzcG9uc2UgPSBhd2FpdCBzZXJ2ZUZpbGUocmVxLCBmc1BhdGgsIHtcbiAgICAgICAgZXRhZ0FsZ29yaXRobTogb3B0cy5ldGFnQWxnb3JpdGhtLFxuICAgICAgICBmaWxlSW5mbyxcbiAgICAgIH0pO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnN0IGVyciA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUgOiBuZXcgRXJyb3IoXCJbbm9uLWVycm9yIHRocm93bl1cIik7XG4gICAgY29uc29sZS5lcnJvcihyZWQoZXJyLm1lc3NhZ2UpKTtcbiAgICByZXNwb25zZSA9IGF3YWl0IHNlcnZlRmFsbGJhY2socmVxLCBlcnIpO1xuICB9XG5cbiAgaWYgKG9wdHMuZW5hYmxlQ29ycykge1xuICAgIGFzc2VydChyZXNwb25zZSk7XG4gICAgcmVzcG9uc2UuaGVhZGVycy5hcHBlbmQoXCJhY2Nlc3MtY29udHJvbC1hbGxvdy1vcmlnaW5cIiwgXCIqXCIpO1xuICAgIHJlc3BvbnNlLmhlYWRlcnMuYXBwZW5kKFxuICAgICAgXCJhY2Nlc3MtY29udHJvbC1hbGxvdy1oZWFkZXJzXCIsXG4gICAgICBcIk9yaWdpbiwgWC1SZXF1ZXN0ZWQtV2l0aCwgQ29udGVudC1UeXBlLCBBY2NlcHQsIFJhbmdlXCIsXG4gICAgKTtcbiAgfVxuXG4gIGlmICghb3B0cy5xdWlldCkgc2VydmVyTG9nKHJlcSwgcmVzcG9uc2UhLnN0YXR1cyk7XG5cbiAgcmV0dXJuIHJlc3BvbnNlITtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplVVJMKHVybDogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IG5vcm1hbGl6ZWRVcmwgPSB1cmw7XG5cbiAgdHJ5IHtcbiAgICAvL2FsbG93ZWQgcGVyIGh0dHBzOi8vd3d3LnczLm9yZy9Qcm90b2NvbHMvcmZjMjYxNi9yZmMyNjE2LXNlYzUuaHRtbFxuICAgIGNvbnN0IGFic29sdXRlVVJJID0gbmV3IFVSTChub3JtYWxpemVkVXJsKTtcbiAgICBub3JtYWxpemVkVXJsID0gYWJzb2x1dGVVUkkucGF0aG5hbWU7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICAvL3dhc24ndCBhbiBhYnNvbHV0ZVVSSVxuICAgIGlmICghKGUgaW5zdGFuY2VvZiBUeXBlRXJyb3IpKSB7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuXG4gIHRyeSB7XG4gICAgbm9ybWFsaXplZFVybCA9IGRlY29kZVVSSShub3JtYWxpemVkVXJsKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGlmICghKGUgaW5zdGFuY2VvZiBVUklFcnJvcikpIHtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9XG5cbiAgaWYgKG5vcm1hbGl6ZWRVcmxbMF0gIT09IFwiL1wiKSB7XG4gICAgdGhyb3cgbmV3IFVSSUVycm9yKFwiVGhlIHJlcXVlc3QgVVJJIGlzIG1hbGZvcm1lZC5cIik7XG4gIH1cblxuICBub3JtYWxpemVkVXJsID0gcG9zaXgubm9ybWFsaXplKG5vcm1hbGl6ZWRVcmwpO1xuICBjb25zdCBzdGFydE9mUGFyYW1zID0gbm9ybWFsaXplZFVybC5pbmRleE9mKFwiP1wiKTtcblxuICByZXR1cm4gc3RhcnRPZlBhcmFtcyA+IC0xXG4gICAgPyBub3JtYWxpemVkVXJsLnNsaWNlKDAsIHN0YXJ0T2ZQYXJhbXMpXG4gICAgOiBub3JtYWxpemVkVXJsO1xufVxuXG5mdW5jdGlvbiBtYWluKCk6IHZvaWQge1xuICBjb25zdCBzZXJ2ZXJBcmdzID0gcGFyc2UoRGVuby5hcmdzLCB7XG4gICAgc3RyaW5nOiBbXCJwb3J0XCIsIFwiaG9zdFwiLCBcImNlcnRcIiwgXCJrZXlcIl0sXG4gICAgYm9vbGVhbjogW1wiaGVscFwiLCBcImRpci1saXN0aW5nXCIsIFwiZG90ZmlsZXNcIiwgXCJjb3JzXCIsIFwidmVyYm9zZVwiXSxcbiAgICBkZWZhdWx0OiB7XG4gICAgICBcImRpci1saXN0aW5nXCI6IHRydWUsXG4gICAgICBkb3RmaWxlczogdHJ1ZSxcbiAgICAgIGNvcnM6IHRydWUsXG4gICAgICB2ZXJib3NlOiBmYWxzZSxcbiAgICAgIGhvc3Q6IFwiMC4wLjAuMFwiLFxuICAgICAgcG9ydDogXCI0NTA3XCIsXG4gICAgICBjZXJ0OiBcIlwiLFxuICAgICAga2V5OiBcIlwiLFxuICAgIH0sXG4gICAgYWxpYXM6IHtcbiAgICAgIHA6IFwicG9ydFwiLFxuICAgICAgYzogXCJjZXJ0XCIsXG4gICAgICBrOiBcImtleVwiLFxuICAgICAgaDogXCJoZWxwXCIsXG4gICAgICB2OiBcInZlcmJvc2VcIixcbiAgICB9LFxuICB9KTtcbiAgY29uc3QgcG9ydCA9IHNlcnZlckFyZ3MucG9ydDtcbiAgY29uc3QgaG9zdCA9IHNlcnZlckFyZ3MuaG9zdDtcbiAgY29uc3QgY2VydEZpbGUgPSBzZXJ2ZXJBcmdzLmNlcnQ7XG4gIGNvbnN0IGtleUZpbGUgPSBzZXJ2ZXJBcmdzLmtleTtcblxuICBpZiAoc2VydmVyQXJncy5oZWxwKSB7XG4gICAgcHJpbnRVc2FnZSgpO1xuICAgIERlbm8uZXhpdCgpO1xuICB9XG5cbiAgaWYgKGtleUZpbGUgfHwgY2VydEZpbGUpIHtcbiAgICBpZiAoa2V5RmlsZSA9PT0gXCJcIiB8fCBjZXJ0RmlsZSA9PT0gXCJcIikge1xuICAgICAgY29uc29sZS5sb2coXCItLWtleSBhbmQgLS1jZXJ0IGFyZSByZXF1aXJlZCBmb3IgVExTXCIpO1xuICAgICAgcHJpbnRVc2FnZSgpO1xuICAgICAgRGVuby5leGl0KDEpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHdpbGQgPSBzZXJ2ZXJBcmdzLl8gYXMgc3RyaW5nW107XG4gIGNvbnN0IHRhcmdldCA9IHBvc2l4LnJlc29sdmUod2lsZFswXSA/PyBcIlwiKTtcblxuICBjb25zdCBoYW5kbGVyID0gKHJlcTogUmVxdWVzdCk6IFByb21pc2U8UmVzcG9uc2U+ID0+IHtcbiAgICByZXR1cm4gc2VydmVEaXIocmVxLCB7XG4gICAgICBmc1Jvb3Q6IHRhcmdldCxcbiAgICAgIHNob3dEaXJMaXN0aW5nOiBzZXJ2ZXJBcmdzW1wiZGlyLWxpc3RpbmdcIl0sXG4gICAgICBzaG93RG90ZmlsZXM6IHNlcnZlckFyZ3MuZG90ZmlsZXMsXG4gICAgICBlbmFibGVDb3JzOiBzZXJ2ZXJBcmdzLmNvcnMsXG4gICAgICBxdWlldDogIXNlcnZlckFyZ3MudmVyYm9zZSxcbiAgICB9KTtcbiAgfTtcblxuICBjb25zdCB1c2VUbHMgPSBCb29sZWFuKGtleUZpbGUgfHwgY2VydEZpbGUpO1xuXG4gIGlmICh1c2VUbHMpIHtcbiAgICBzZXJ2ZVRscyhoYW5kbGVyLCB7XG4gICAgICBwb3J0OiBOdW1iZXIocG9ydCksXG4gICAgICBob3N0bmFtZTogaG9zdCxcbiAgICAgIGNlcnRGaWxlLFxuICAgICAga2V5RmlsZSxcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBzZXJ2ZShoYW5kbGVyLCB7IHBvcnQ6IE51bWJlcihwb3J0KSwgaG9zdG5hbWU6IGhvc3QgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcHJpbnRVc2FnZSgpIHtcbiAgY29uc29sZS5sb2coYERlbm8gRmlsZSBTZXJ2ZXJcbiAgU2VydmVzIGEgbG9jYWwgZGlyZWN0b3J5IGluIEhUVFAuXG5cbklOU1RBTEw6XG4gIGRlbm8gaW5zdGFsbCAtLWFsbG93LW5ldCAtLWFsbG93LXJlYWQgaHR0cHM6Ly9kZW5vLmxhbmQvc3RkL2h0dHAvZmlsZV9zZXJ2ZXIudHNcblxuVVNBR0U6XG4gIGZpbGVfc2VydmVyIFtwYXRoXSBbb3B0aW9uc11cblxuT1BUSU9OUzpcbiAgLWgsIC0taGVscCAgICAgICAgICBQcmludHMgaGVscCBpbmZvcm1hdGlvblxuICAtcCwgLS1wb3J0IDxQT1JUPiAgIFNldCBwb3J0XG4gIC0tY29ycyAgICAgICAgICAgICAgRW5hYmxlIENPUlMgdmlhIHRoZSBcIkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpblwiIGhlYWRlclxuICAtLWhvc3QgICAgIDxIT1NUPiAgIEhvc3RuYW1lIChkZWZhdWx0IGlzIDAuMC4wLjApXG4gIC1jLCAtLWNlcnQgPEZJTEU+ICAgVExTIGNlcnRpZmljYXRlIGZpbGUgKGVuYWJsZXMgVExTKVxuICAtaywgLS1rZXkgIDxGSUxFPiAgIFRMUyBrZXkgZmlsZSAoZW5hYmxlcyBUTFMpXG4gIC0tbm8tZGlyLWxpc3RpbmcgICAgRGlzYWJsZSBkaXJlY3RvcnkgbGlzdGluZ1xuICAtLW5vLWRvdGZpbGVzICAgICAgIERvIG5vdCBzaG93IGRvdGZpbGVzXG4gIC12LCAtLXZlcmJvc2UgICAgICAgUHJpbnQgcmVxdWVzdCBsZXZlbCBsb2dzXG5cbiAgQWxsIFRMUyBvcHRpb25zIGFyZSByZXF1aXJlZCB3aGVuIG9uZSBpcyBwcm92aWRlZC5gKTtcbn1cblxuaWYgKGltcG9ydC5tZXRhLm1haW4pIHtcbiAgbWFpbigpO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FBQ0EsMEVBQTBFO0FBRTFFLGdFQUFnRTtBQUNoRSwyQ0FBMkM7QUFDM0MsZ0ZBQWdGO0FBRWhGLFNBQVMsT0FBTyxFQUFFLEtBQUssUUFBUSxnQkFBZ0IsQ0FBQztB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