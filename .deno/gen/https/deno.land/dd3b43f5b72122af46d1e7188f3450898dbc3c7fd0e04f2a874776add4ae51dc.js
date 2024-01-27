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
import { ERR_INVALID_ARG_TYPE, ERR_INVALID_ARG_VALUE, ERR_INVALID_FILE_URL_HOST, ERR_INVALID_FILE_URL_PATH, ERR_INVALID_URL_SCHEME } from "./internal/errors.ts";
import { CHAR_0, CHAR_9, CHAR_AT, CHAR_BACKWARD_SLASH, CHAR_CARRIAGE_RETURN, CHAR_CIRCUMFLEX_ACCENT, CHAR_DOT, CHAR_DOUBLE_QUOTE, CHAR_FORM_FEED, CHAR_FORWARD_SLASH, CHAR_GRAVE_ACCENT, CHAR_HASH, CHAR_HYPHEN_MINUS, CHAR_LEFT_ANGLE_BRACKET, CHAR_LEFT_CURLY_BRACKET, CHAR_LEFT_SQUARE_BRACKET, CHAR_LINE_FEED, CHAR_LOWERCASE_A, CHAR_LOWERCASE_Z, CHAR_NO_BREAK_SPACE, CHAR_PERCENT, CHAR_PLUS, CHAR_QUESTION_MARK, CHAR_RIGHT_ANGLE_BRACKET, CHAR_RIGHT_CURLY_BRACKET, CHAR_RIGHT_SQUARE_BRACKET, CHAR_SEMICOLON, CHAR_SINGLE_QUOTE, CHAR_SPACE, CHAR_TAB, CHAR_UNDERSCORE, CHAR_UPPERCASE_A, CHAR_UPPERCASE_Z, CHAR_VERTICAL_LINE, CHAR_ZERO_WIDTH_NOBREAK_SPACE } from "../path/_constants.ts";
import * as path from "./path.ts";
import { toASCII } from "./internal/idna.ts";
import { isWindows, osType } from "../_util/os.ts";
import { encodeStr, hexTable } from "./internal/querystring.ts";
import querystring from "./querystring.ts";
const forwardSlashRegEx = /\//g;
const percentRegEx = /%/g;
const backslashRegEx = /\\/g;
const newlineRegEx = /\n/g;
const carriageReturnRegEx = /\r/g;
const tabRegEx = /\t/g;
// Reference: RFC 3986, RFC 1808, RFC 2396
// define these here so at least they only have to be
// compiled once on the first module load.
const protocolPattern = /^[a-z0-9.+-]+:/i;
const portPattern = /:[0-9]*$/;
const hostPattern = /^\/\/[^@/]+@[^@/]+/;
// Special case for a simple path URL
const simplePathPattern = /^(\/\/?(?!\/)[^?\s]*)(\?[^\s]*)?$/;
// Protocols that can allow "unsafe" and "unwise" chars.
const unsafeProtocol = new Set([
    "javascript",
    "javascript:"
]);
// Protocols that never have a hostname.
const hostlessProtocol = new Set([
    "javascript",
    "javascript:"
]);
// Protocols that always contain a // bit.
const slashedProtocol = new Set([
    "http",
    "http:",
    "https",
    "https:",
    "ftp",
    "ftp:",
    "gopher",
    "gopher:",
    "file",
    "file:",
    "ws",
    "ws:",
    "wss",
    "wss:", 
]);
const hostnameMaxLen = 255;
// These characters do not need escaping:
// ! - . _ ~
// ' ( ) * :
// digits
// alpha (uppercase)
// alpha (lowercase)
// deno-fmt-ignore
const noEscapeAuth = new Int8Array([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    0,
    0,
    1,
    1,
    0,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    1,
    0,
    0,
    0,
    1,
    0
]);
const _url = URL;
export { _url as URL };
// Legacy URL API
export class Url {
    protocol;
    slashes;
    auth;
    host;
    port;
    hostname;
    hash;
    search;
    query;
    pathname;
    path;
    href;
    constructor(){
        this.protocol = null;
        this.slashes = null;
        this.auth = null;
        this.host = null;
        this.port = null;
        this.hostname = null;
        this.hash = null;
        this.search = null;
        this.query = null;
        this.pathname = null;
        this.path = null;
        this.href = null;
    }
     #parseHost() {
        let host = this.host || "";
        let port = portPattern.exec(host);
        if (port) {
            port = port[0];
            if (port !== ":") {
                this.port = port.slice(1);
            }
            host = host.slice(0, host.length - port.length);
        }
        if (host) this.hostname = host;
    }
    resolve(relative) {
        return this.resolveObject(parse(relative, false, true)).format();
    }
    resolveObject(relative) {
        if (typeof relative === "string") {
            const rel = new Url();
            rel.urlParse(relative, false, true);
            relative = rel;
        }
        const result = new Url();
        const tkeys = Object.keys(this);
        for(let tk = 0; tk < tkeys.length; tk++){
            const tkey = tkeys[tk];
            result[tkey] = this[tkey];
        }
        // Hash is always overridden, no matter what.
        // even href="" will remove it.
        result.hash = relative.hash;
        // If the relative url is empty, then there's nothing left to do here.
        if (relative.href === "") {
            result.href = result.format();
            return result;
        }
        // Hrefs like //foo/bar always cut to the protocol.
        if (relative.slashes && !relative.protocol) {
            // Take everything except the protocol from relative
            const rkeys = Object.keys(relative);
            for(let rk = 0; rk < rkeys.length; rk++){
                const rkey = rkeys[rk];
                if (rkey !== "protocol") result[rkey] = relative[rkey];
            }
            // urlParse appends trailing / to urls like http://www.example.com
            if (result.protocol && slashedProtocol.has(result.protocol) && result.hostname && !result.pathname) {
                result.path = result.pathname = "/";
            }
            result.href = result.format();
            return result;
        }
        if (relative.protocol && relative.protocol !== result.protocol) {
            // If it's a known url protocol, then changing
            // the protocol does weird things
            // first, if it's not file:, then we MUST have a host,
            // and if there was a path
            // to begin with, then we MUST have a path.
            // if it is file:, then the host is dropped,
            // because that's known to be hostless.
            // anything else is assumed to be absolute.
            if (!slashedProtocol.has(relative.protocol)) {
                const keys = Object.keys(relative);
                for(let v = 0; v < keys.length; v++){
                    const k = keys[v];
                    result[k] = relative[k];
                }
                result.href = result.format();
                return result;
            }
            result.protocol = relative.protocol;
            if (!relative.host && !/^file:?$/.test(relative.protocol) && !hostlessProtocol.has(relative.protocol)) {
                const relPath = (relative.pathname || "").split("/");
                while(relPath.length && !(relative.host = relPath.shift() || null));
                if (!relative.host) relative.host = "";
                if (!relative.hostname) relative.hostname = "";
                if (relPath[0] !== "") relPath.unshift("");
                if (relPath.length < 2) relPath.unshift("");
                result.pathname = relPath.join("/");
            } else {
                result.pathname = relative.pathname;
            }
            result.search = relative.search;
            result.query = relative.query;
            result.host = relative.host || "";
            result.auth = relative.auth;
            result.hostname = relative.hostname || relative.host;
            result.port = relative.port;
            // To support http.request
            if (result.pathname || result.search) {
                const p = result.pathname || "";
                const s = result.search || "";
                result.path = p + s;
            }
            result.slashes = result.slashes || relative.slashes;
            result.href = result.format();
            return result;
        }
        const isSourceAbs = result.pathname && result.pathname.charAt(0) === "/";
        const isRelAbs = relative.host || relative.pathname && relative.pathname.charAt(0) === "/";
        let mustEndAbs = isRelAbs || isSourceAbs || result.host && relative.pathname;
        const removeAllDots = mustEndAbs;
        let srcPath = result.pathname && result.pathname.split("/") || [];
        const relPath1 = relative.pathname && relative.pathname.split("/") || [];
        const noLeadingSlashes = result.protocol && !slashedProtocol.has(result.protocol);
        // If the url is a non-slashed url, then relative
        // links like ../.. should be able
        // to crawl up to the hostname, as well.  This is strange.
        // result.protocol has already been set by now.
        // Later on, put the first path part into the host field.
        if (noLeadingSlashes) {
            result.hostname = "";
            result.port = null;
            if (result.host) {
                if (srcPath[0] === "") srcPath[0] = result.host;
                else srcPath.unshift(result.host);
            }
            result.host = "";
            if (relative.protocol) {
                relative.hostname = null;
                relative.port = null;
                result.auth = null;
                if (relative.host) {
                    if (relPath1[0] === "") relPath1[0] = relative.host;
                    else relPath1.unshift(relative.host);
                }
                relative.host = null;
            }
            mustEndAbs = mustEndAbs && (relPath1[0] === "" || srcPath[0] === "");
        }
        if (isRelAbs) {
            // it's absolute.
            if (relative.host || relative.host === "") {
                if (result.host !== relative.host) result.auth = null;
                result.host = relative.host;
                result.port = relative.port;
            }
            if (relative.hostname || relative.hostname === "") {
                if (result.hostname !== relative.hostname) result.auth = null;
                result.hostname = relative.hostname;
            }
            result.search = relative.search;
            result.query = relative.query;
            srcPath = relPath1;
        // Fall through to the dot-handling below.
        } else if (relPath1.length) {
            // it's relative
            // throw away the existing file, and take the new path instead.
            if (!srcPath) srcPath = [];
            srcPath.pop();
            srcPath = srcPath.concat(relPath1);
            result.search = relative.search;
            result.query = relative.query;
        } else if (relative.search !== null && relative.search !== undefined) {
            // Just pull out the search.
            // like href='?foo'.
            // Put this after the other two cases because it simplifies the booleans
            if (noLeadingSlashes) {
                result.hostname = result.host = srcPath.shift() || null;
                // Occasionally the auth can get stuck only in host.
                // This especially happens in cases like
                // url.resolveObject('mailto:local1@domain1', 'local2@domain2')
                const authInHost = result.host && result.host.indexOf("@") > 0 && result.host.split("@");
                if (authInHost) {
                    result.auth = authInHost.shift() || null;
                    result.host = result.hostname = authInHost.shift() || null;
                }
            }
            result.search = relative.search;
            result.query = relative.query;
            // To support http.request
            if (result.pathname !== null || result.search !== null) {
                result.path = (result.pathname ? result.pathname : "") + (result.search ? result.search : "");
            }
            result.href = result.format();
            return result;
        }
        if (!srcPath.length) {
            // No path at all. All other things were already handled above.
            result.pathname = null;
            // To support http.request
            if (result.search) {
                result.path = "/" + result.search;
            } else {
                result.path = null;
            }
            result.href = result.format();
            return result;
        }
        // If a url ENDs in . or .., then it must get a trailing slash.
        // however, if it ends in anything else non-slashy,
        // then it must NOT get a trailing slash.
        let last = srcPath.slice(-1)[0];
        const hasTrailingSlash = (result.host || relative.host || srcPath.length > 1) && (last === "." || last === "..") || last === "";
        // Strip single dots, resolve double dots to parent dir
        // if the path tries to go above the root, `up` ends up > 0
        let up = 0;
        for(let i = srcPath.length - 1; i >= 0; i--){
            last = srcPath[i];
            if (last === ".") {
                srcPath.splice(i, 1);
            } else if (last === "..") {
                srcPath.splice(i, 1);
                up++;
            } else if (up) {
                srcPath.splice(i, 1);
                up--;
            }
        }
        // If the path is allowed to go above the root, restore leading ..s
        if (!mustEndAbs && !removeAllDots) {
            while(up--){
                srcPath.unshift("..");
            }
        }
        if (mustEndAbs && srcPath[0] !== "" && (!srcPath[0] || srcPath[0].charAt(0) !== "/")) {
            srcPath.unshift("");
        }
        if (hasTrailingSlash && srcPath.join("/").substr(-1) !== "/") {
            srcPath.push("");
        }
        const isAbsolute = srcPath[0] === "" || srcPath[0] && srcPath[0].charAt(0) === "/";
        // put the host back
        if (noLeadingSlashes) {
            result.hostname = result.host = isAbsolute ? "" : srcPath.length ? srcPath.shift() || null : "";
            // Occasionally the auth can get stuck only in host.
            // This especially happens in cases like
            // url.resolveObject('mailto:local1@domain1', 'local2@domain2')
            const authInHost1 = result.host && result.host.indexOf("@") > 0 ? result.host.split("@") : false;
            if (authInHost1) {
                result.auth = authInHost1.shift() || null;
                result.host = result.hostname = authInHost1.shift() || null;
            }
        }
        mustEndAbs = mustEndAbs || result.host && srcPath.length;
        if (mustEndAbs && !isAbsolute) {
            srcPath.unshift("");
        }
        if (!srcPath.length) {
            result.pathname = null;
            result.path = null;
        } else {
            result.pathname = srcPath.join("/");
        }
        // To support request.http
        if (result.pathname !== null || result.search !== null) {
            result.path = (result.pathname ? result.pathname : "") + (result.search ? result.search : "");
        }
        result.auth = relative.auth || result.auth;
        result.slashes = result.slashes || relative.slashes;
        result.href = result.format();
        return result;
    }
    format() {
        let auth = this.auth || "";
        if (auth) {
            auth = encodeStr(auth, noEscapeAuth, hexTable);
            auth += "@";
        }
        let protocol = this.protocol || "";
        let pathname = this.pathname || "";
        let hash = this.hash || "";
        let host = "";
        let query = "";
        if (this.host) {
            host = auth + this.host;
        } else if (this.hostname) {
            host = auth + (this.hostname.includes(":") && !isIpv6Hostname(this.hostname) ? "[" + this.hostname + "]" : this.hostname);
            if (this.port) {
                host += ":" + this.port;
            }
        }
        if (this.query !== null && typeof this.query === "object") {
            query = querystring.stringify(this.query);
        }
        let search = this.search || query && "?" + query || "";
        if (protocol && protocol.charCodeAt(protocol.length - 1) !== 58 /* : */ ) {
            protocol += ":";
        }
        let newPathname = "";
        let lastPos = 0;
        for(let i = 0; i < pathname.length; ++i){
            switch(pathname.charCodeAt(i)){
                case CHAR_HASH:
                    if (i - lastPos > 0) {
                        newPathname += pathname.slice(lastPos, i);
                    }
                    newPathname += "%23";
                    lastPos = i + 1;
                    break;
                case CHAR_QUESTION_MARK:
                    if (i - lastPos > 0) {
                        newPathname += pathname.slice(lastPos, i);
                    }
                    newPathname += "%3F";
                    lastPos = i + 1;
                    break;
            }
        }
        if (lastPos > 0) {
            if (lastPos !== pathname.length) {
                pathname = newPathname + pathname.slice(lastPos);
            } else pathname = newPathname;
        }
        // Only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
        // unless they had them to begin with.
        if (this.slashes || slashedProtocol.has(protocol)) {
            if (this.slashes || host) {
                if (pathname && pathname.charCodeAt(0) !== CHAR_FORWARD_SLASH) {
                    pathname = "/" + pathname;
                }
                host = "//" + host;
            } else if (protocol.length >= 4 && protocol.charCodeAt(0) === 102 /* f */  && protocol.charCodeAt(1) === 105 /* i */  && protocol.charCodeAt(2) === 108 /* l */  && protocol.charCodeAt(3) === 101 /* e */ ) {
                host = "//";
            }
        }
        search = search.replace(/#/g, "%23");
        if (hash && hash.charCodeAt(0) !== CHAR_HASH) {
            hash = "#" + hash;
        }
        if (search && search.charCodeAt(0) !== CHAR_QUESTION_MARK) {
            search = "?" + search;
        }
        return protocol + host + pathname + search + hash;
    }
    urlParse(url, parseQueryString, slashesDenoteHost) {
        // Copy chrome, IE, opera backslash-handling behavior.
        // Back slashes before the query string get converted to forward slashes
        // See: https://code.google.com/p/chromium/issues/detail?id=25916
        let hasHash = false;
        let start = -1;
        let end = -1;
        let rest = "";
        let lastPos = 0;
        for(let i = 0, inWs = false, split = false; i < url.length; ++i){
            const code = url.charCodeAt(i);
            // Find first and last non-whitespace characters for trimming
            const isWs = code === CHAR_SPACE || code === CHAR_TAB || code === CHAR_CARRIAGE_RETURN || code === CHAR_LINE_FEED || code === CHAR_FORM_FEED || code === CHAR_NO_BREAK_SPACE || code === CHAR_ZERO_WIDTH_NOBREAK_SPACE;
            if (start === -1) {
                if (isWs) continue;
                lastPos = start = i;
            } else if (inWs) {
                if (!isWs) {
                    end = -1;
                    inWs = false;
                }
            } else if (isWs) {
                end = i;
                inWs = true;
            }
            // Only convert backslashes while we haven't seen a split character
            if (!split) {
                switch(code){
                    case CHAR_HASH:
                        hasHash = true;
                    // Fall through
                    case CHAR_QUESTION_MARK:
                        split = true;
                        break;
                    case CHAR_BACKWARD_SLASH:
                        if (i - lastPos > 0) rest += url.slice(lastPos, i);
                        rest += "/";
                        lastPos = i + 1;
                        break;
                }
            } else if (!hasHash && code === CHAR_HASH) {
                hasHash = true;
            }
        }
        // Check if string was non-empty (including strings with only whitespace)
        if (start !== -1) {
            if (lastPos === start) {
                // We didn't convert any backslashes
                if (end === -1) {
                    if (start === 0) rest = url;
                    else rest = url.slice(start);
                } else {
                    rest = url.slice(start, end);
                }
            } else if (end === -1 && lastPos < url.length) {
                // We converted some backslashes and have only part of the entire string
                rest += url.slice(lastPos);
            } else if (end !== -1 && lastPos < end) {
                // We converted some backslashes and have only part of the entire string
                rest += url.slice(lastPos, end);
            }
        }
        if (!slashesDenoteHost && !hasHash) {
            // Try fast path regexp
            const simplePath = simplePathPattern.exec(rest);
            if (simplePath) {
                this.path = rest;
                this.href = rest;
                this.pathname = simplePath[1];
                if (simplePath[2]) {
                    this.search = simplePath[2];
                    if (parseQueryString) {
                        this.query = querystring.parse(this.search.slice(1));
                    } else {
                        this.query = this.search.slice(1);
                    }
                } else if (parseQueryString) {
                    this.search = null;
                    this.query = Object.create(null);
                }
                return this;
            }
        }
        let proto = protocolPattern.exec(rest);
        let lowerProto = "";
        if (proto) {
            proto = proto[0];
            lowerProto = proto.toLowerCase();
            this.protocol = lowerProto;
            rest = rest.slice(proto.length);
        }
        // Figure out if it's got a host
        // user@server is *always* interpreted as a hostname, and url
        // resolution will treat //foo/bar as host=foo,path=bar because that's
        // how the browser resolves relative URLs.
        let slashes;
        if (slashesDenoteHost || proto || hostPattern.test(rest)) {
            slashes = rest.charCodeAt(0) === CHAR_FORWARD_SLASH && rest.charCodeAt(1) === CHAR_FORWARD_SLASH;
            if (slashes && !(proto && hostlessProtocol.has(lowerProto))) {
                rest = rest.slice(2);
                this.slashes = true;
            }
        }
        if (!hostlessProtocol.has(lowerProto) && (slashes || proto && !slashedProtocol.has(proto))) {
            // there's a hostname.
            // the first instance of /, ?, ;, or # ends the host.
            //
            // If there is an @ in the hostname, then non-host chars *are* allowed
            // to the left of the last @ sign, unless some host-ending character
            // comes *before* the @-sign.
            // URLs are obnoxious.
            //
            // ex:
            // http://a@b@c/ => user:a@b host:c
            // http://a@b?@c => user:a host:b path:/?@c
            let hostEnd = -1;
            let atSign = -1;
            let nonHost = -1;
            for(let i1 = 0; i1 < rest.length; ++i1){
                switch(rest.charCodeAt(i1)){
                    case CHAR_TAB:
                    case CHAR_LINE_FEED:
                    case CHAR_CARRIAGE_RETURN:
                    case CHAR_SPACE:
                    case CHAR_DOUBLE_QUOTE:
                    case CHAR_PERCENT:
                    case CHAR_SINGLE_QUOTE:
                    case CHAR_SEMICOLON:
                    case CHAR_LEFT_ANGLE_BRACKET:
                    case CHAR_RIGHT_ANGLE_BRACKET:
                    case CHAR_BACKWARD_SLASH:
                    case CHAR_CIRCUMFLEX_ACCENT:
                    case CHAR_GRAVE_ACCENT:
                    case CHAR_LEFT_CURLY_BRACKET:
                    case CHAR_VERTICAL_LINE:
                    case CHAR_RIGHT_CURLY_BRACKET:
                        // Characters that are never ever allowed in a hostname from RFC 2396
                        if (nonHost === -1) nonHost = i1;
                        break;
                    case CHAR_HASH:
                    case CHAR_FORWARD_SLASH:
                    case CHAR_QUESTION_MARK:
                        // Find the first instance of any host-ending characters
                        if (nonHost === -1) nonHost = i1;
                        hostEnd = i1;
                        break;
                    case CHAR_AT:
                        // At this point, either we have an explicit point where the
                        // auth portion cannot go past, or the last @ char is the decider.
                        atSign = i1;
                        nonHost = -1;
                        break;
                }
                if (hostEnd !== -1) break;
            }
            start = 0;
            if (atSign !== -1) {
                this.auth = decodeURIComponent(rest.slice(0, atSign));
                start = atSign + 1;
            }
            if (nonHost === -1) {
                this.host = rest.slice(start);
                rest = "";
            } else {
                this.host = rest.slice(start, nonHost);
                rest = rest.slice(nonHost);
            }
            // pull out port.
            this.#parseHost();
            // We've indicated that there is a hostname,
            // so even if it's empty, it has to be present.
            if (typeof this.hostname !== "string") this.hostname = "";
            const hostname = this.hostname;
            // If hostname begins with [ and ends with ]
            // assume that it's an IPv6 address.
            const ipv6Hostname = isIpv6Hostname(hostname);
            // validate a little.
            if (!ipv6Hostname) {
                rest = getHostname(this, rest, hostname);
            }
            if (this.hostname.length > hostnameMaxLen) {
                this.hostname = "";
            } else {
                // Hostnames are always lower case.
                this.hostname = this.hostname.toLowerCase();
            }
            if (!ipv6Hostname) {
                // IDNA Support: Returns a punycoded representation of "domain".
                // It only converts parts of the domain name that
                // have non-ASCII characters, i.e. it doesn't matter if
                // you call it with a domain that already is ASCII-only.
                // Use lenient mode (`true`) to try to support even non-compliant
                // URLs.
                this.hostname = toASCII(this.hostname);
            }
            const p = this.port ? ":" + this.port : "";
            const h = this.hostname || "";
            this.host = h + p;
            // strip [ and ] from the hostname
            // the host field still retains them, though
            if (ipv6Hostname) {
                this.hostname = this.hostname.slice(1, -1);
                if (rest[0] !== "/") {
                    rest = "/" + rest;
                }
            }
        }
        // Now rest is set to the post-host stuff.
        // Chop off any delim chars.
        if (!unsafeProtocol.has(lowerProto)) {
            // First, make 100% sure that any "autoEscape" chars get
            // escaped, even if encodeURIComponent doesn't think they
            // need to be.
            rest = autoEscapeStr(rest);
        }
        let questionIdx = -1;
        let hashIdx = -1;
        for(let i2 = 0; i2 < rest.length; ++i2){
            const code1 = rest.charCodeAt(i2);
            if (code1 === CHAR_HASH) {
                this.hash = rest.slice(i2);
                hashIdx = i2;
                break;
            } else if (code1 === CHAR_QUESTION_MARK && questionIdx === -1) {
                questionIdx = i2;
            }
        }
        if (questionIdx !== -1) {
            if (hashIdx === -1) {
                this.search = rest.slice(questionIdx);
                this.query = rest.slice(questionIdx + 1);
            } else {
                this.search = rest.slice(questionIdx, hashIdx);
                this.query = rest.slice(questionIdx + 1, hashIdx);
            }
            if (parseQueryString) {
                this.query = querystring.parse(this.query);
            }
        } else if (parseQueryString) {
            // No query string, but parseQueryString still requested
            this.search = null;
            this.query = Object.create(null);
        }
        const useQuestionIdx = questionIdx !== -1 && (hashIdx === -1 || questionIdx < hashIdx);
        const firstIdx = useQuestionIdx ? questionIdx : hashIdx;
        if (firstIdx === -1) {
            if (rest.length > 0) this.pathname = rest;
        } else if (firstIdx > 0) {
            this.pathname = rest.slice(0, firstIdx);
        }
        if (slashedProtocol.has(lowerProto) && this.hostname && !this.pathname) {
            this.pathname = "/";
        }
        // To support http.request
        if (this.pathname || this.search) {
            const p1 = this.pathname || "";
            const s = this.search || "";
            this.path = p1 + s;
        }
        // Finally, reconstruct the href based on what has been validated.
        this.href = this.format();
        return this;
    }
}
export function format(urlObject, options) {
    if (urlObject instanceof URL) {
        return formatWhatwg(urlObject, options);
    }
    if (typeof urlObject === "string") {
        urlObject = parse(urlObject, true, false);
    }
    return urlObject.format();
}
/**
 * The URL object has both a `toString()` method and `href` property that return string serializations of the URL.
 * These are not, however, customizable in any way.
 * This method allows for basic customization of the output.
 * @see Tested in `parallel/test-url-format-whatwg.js`.
 * @param urlObject
 * @param options
 * @param options.auth `true` if the serialized URL string should include the username and password, `false` otherwise. **Default**: `true`.
 * @param options.fragment `true` if the serialized URL string should include the fragment, `false` otherwise. **Default**: `true`.
 * @param options.search `true` if the serialized URL string should include the search query, **Default**: `true`.
 * @param options.unicode `true` if Unicode characters appearing in the host component of the URL string should be encoded directly as opposed to being Punycode encoded. **Default**: `false`.
 * @returns a customizable serialization of a URL `String` representation of a `WHATWG URL` object.
 */ function formatWhatwg(urlObject, options) {
    if (typeof urlObject === "string") {
        urlObject = new URL(urlObject);
    }
    if (options) {
        if (typeof options !== "object") {
            throw new ERR_INVALID_ARG_TYPE("options", "object", options);
        }
    }
    options = {
        auth: true,
        fragment: true,
        search: true,
        unicode: false,
        ...options
    };
    let ret = urlObject.protocol;
    if (urlObject.host !== null) {
        ret += "//";
        const hasUsername = !!urlObject.username;
        const hasPassword = !!urlObject.password;
        if (options.auth && (hasUsername || hasPassword)) {
            if (hasUsername) {
                ret += urlObject.username;
            }
            if (hasPassword) {
                ret += `:${urlObject.password}`;
            }
            ret += "@";
        }
        // TODO(wafuwfu13): Support unicode option
        // ret += options.unicode ?
        //   domainToUnicode(urlObject.host) : urlObject.host;
        ret += urlObject.host;
        if (urlObject.port) {
            ret += `:${urlObject.port}`;
        }
    }
    ret += urlObject.pathname;
    if (options.search && urlObject.search) {
        ret += urlObject.search;
    }
    if (options.fragment && urlObject.hash) {
        ret += urlObject.hash;
    }
    return ret;
}
function isIpv6Hostname(hostname) {
    return hostname.charCodeAt(0) === CHAR_LEFT_SQUARE_BRACKET && hostname.charCodeAt(hostname.length - 1) === CHAR_RIGHT_SQUARE_BRACKET;
}
function getHostname(self, rest, hostname) {
    for(let i = 0; i < hostname.length; ++i){
        const code = hostname.charCodeAt(i);
        const isValid = code >= CHAR_LOWERCASE_A && code <= CHAR_LOWERCASE_Z || code === CHAR_DOT || code >= CHAR_UPPERCASE_A && code <= CHAR_UPPERCASE_Z || code >= CHAR_0 && code <= CHAR_9 || code === CHAR_HYPHEN_MINUS || code === CHAR_PLUS || code === CHAR_UNDERSCORE || code > 127;
        // Invalid host character
        if (!isValid) {
            self.hostname = hostname.slice(0, i);
            return `/${hostname.slice(i)}${rest}`;
        }
    }
    return rest;
}
// Escaped characters. Use empty strings to fill up unused entries.
// Using Array is faster than Object/Map
// deno-fmt-ignore
const escapedCodes = [
    /* 0 - 9 */ "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "%09",
    /* 10 - 19 */ "%0A",
    "",
    "",
    "%0D",
    "",
    "",
    "",
    "",
    "",
    "",
    /* 20 - 29 */ "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    /* 30 - 39 */ "",
    "",
    "%20",
    "",
    "%22",
    "",
    "",
    "",
    "",
    "%27",
    /* 40 - 49 */ "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    /* 50 - 59 */ "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    /* 60 - 69 */ "%3C",
    "",
    "%3E",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    /* 70 - 79 */ "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    /* 80 - 89 */ "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    /* 90 - 99 */ "",
    "",
    "%5C",
    "",
    "%5E",
    "",
    "%60",
    "",
    "",
    "",
    /* 100 - 109 */ "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    /* 110 - 119 */ "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    /* 120 - 125 */ "",
    "",
    "",
    "%7B",
    "%7C",
    "%7D"
];
// Automatically escape all delimiters and unwise characters from RFC 2396.
// Also escape single quotes in case of an XSS attack.
// Return the escaped string.
function autoEscapeStr(rest) {
    let escaped = "";
    let lastEscapedPos = 0;
    for(let i = 0; i < rest.length; ++i){
        // `escaped` contains substring up to the last escaped character.
        const escapedChar = escapedCodes[rest.charCodeAt(i)];
        if (escapedChar) {
            // Concat if there are ordinary characters in the middle.
            if (i > lastEscapedPos) {
                escaped += rest.slice(lastEscapedPos, i);
            }
            escaped += escapedChar;
            lastEscapedPos = i + 1;
        }
    }
    if (lastEscapedPos === 0) {
        // Nothing has been escaped.
        return rest;
    }
    // There are ordinary characters at the end.
    if (lastEscapedPos < rest.length) {
        escaped += rest.slice(lastEscapedPos);
    }
    return escaped;
}
/**
 * The url.urlParse() method takes a URL string, parses it, and returns a URL object.
 *
 * @see Tested in `parallel/test-url-parse-format.js`.
 * @param url The URL string to parse.
 * @param parseQueryString If `true`, the query property will always be set to an object returned by the querystring module's parse() method. If false,
 * the query property on the returned URL object will be an unparsed, undecoded string. Default: false.
 * @param slashesDenoteHost If `true`, the first token after the literal string // and preceding the next / will be interpreted as the host
 */ export function parse(url, parseQueryString, slashesDenoteHost) {
    if (url instanceof Url) return url;
    const urlObject = new Url();
    urlObject.urlParse(url, parseQueryString, slashesDenoteHost);
    return urlObject;
}
/** The url.resolve() method resolves a target URL relative to a base URL in a manner similar to that of a Web browser resolving an anchor tag HREF.
 * @see https://nodejs.org/api/url.html#urlresolvefrom-to
 * @legacy
 */ export function resolve(from, to) {
    return parse(from, false, true).resolve(to);
}
export function resolveObject(source, relative) {
    if (!source) return relative;
    return parse(source, false, true).resolveObject(relative);
}
/**
 * This function ensures the correct decodings of percent-encoded characters as well as ensuring a cross-platform valid absolute path string.
 * @see Tested in `parallel/test-fileurltopath.js`.
 * @param path The file URL string or URL object to convert to a path.
 * @returns The fully-resolved platform-specific Node.js file path.
 */ export function fileURLToPath(path) {
    if (typeof path === "string") path = new URL(path);
    else if (!(path instanceof URL)) {
        throw new ERR_INVALID_ARG_TYPE("path", [
            "string",
            "URL"
        ], path);
    }
    if (path.protocol !== "file:") {
        throw new ERR_INVALID_URL_SCHEME("file");
    }
    return isWindows ? getPathFromURLWin(path) : getPathFromURLPosix(path);
}
function getPathFromURLWin(url) {
    const hostname = url.hostname;
    let pathname = url.pathname;
    for(let n = 0; n < pathname.length; n++){
        if (pathname[n] === "%") {
            const third = pathname.codePointAt(n + 2) | 0x20;
            if (pathname[n + 1] === "2" && third === 102 || pathname[n + 1] === "5" && third === 99 // 5c 5C \
            ) {
                throw new ERR_INVALID_FILE_URL_PATH("must not include encoded \\ or / characters");
            }
        }
    }
    pathname = pathname.replace(forwardSlashRegEx, "\\");
    pathname = decodeURIComponent(pathname);
    if (hostname !== "") {
        // TODO(bartlomieju): add support for punycode encodings
        return `\\\\${hostname}${pathname}`;
    } else {
        // Otherwise, it's a local path that requires a drive letter
        const letter = pathname.codePointAt(1) | 0x20;
        const sep = pathname[2];
        if (letter < CHAR_LOWERCASE_A || letter > CHAR_LOWERCASE_Z || sep !== ":") {
            throw new ERR_INVALID_FILE_URL_PATH("must be absolute");
        }
        return pathname.slice(1);
    }
}
function getPathFromURLPosix(url) {
    if (url.hostname !== "") {
        throw new ERR_INVALID_FILE_URL_HOST(osType);
    }
    const pathname = url.pathname;
    for(let n = 0; n < pathname.length; n++){
        if (pathname[n] === "%") {
            const third = pathname.codePointAt(n + 2) | 0x20;
            if (pathname[n + 1] === "2" && third === 102) {
                throw new ERR_INVALID_FILE_URL_PATH("must not include encoded / characters");
            }
        }
    }
    return decodeURIComponent(pathname);
}
/**
 *  The following characters are percent-encoded when converting from file path
 *  to URL:
 *  - %: The percent character is the only character not encoded by the
 *       `pathname` setter.
 *  - \: Backslash is encoded on non-windows platforms since it's a valid
 *       character but the `pathname` setters replaces it by a forward slash.
 *  - LF: The newline character is stripped out by the `pathname` setter.
 *        (See whatwg/url#419)
 *  - CR: The carriage return character is also stripped out by the `pathname`
 *        setter.
 *  - TAB: The tab character is also stripped out by the `pathname` setter.
 */ function encodePathChars(filepath) {
    if (filepath.includes("%")) {
        filepath = filepath.replace(percentRegEx, "%25");
    }
    // In posix, backslash is a valid character in paths:
    if (!isWindows && filepath.includes("\\")) {
        filepath = filepath.replace(backslashRegEx, "%5C");
    }
    if (filepath.includes("\n")) {
        filepath = filepath.replace(newlineRegEx, "%0A");
    }
    if (filepath.includes("\r")) {
        filepath = filepath.replace(carriageReturnRegEx, "%0D");
    }
    if (filepath.includes("\t")) {
        filepath = filepath.replace(tabRegEx, "%09");
    }
    return filepath;
}
/**
 * This function ensures that `filepath` is resolved absolutely, and that the URL control characters are correctly encoded when converting into a File URL.
 * @see Tested in `parallel/test-url-pathtofileurl.js`.
 * @param filepath The file path string to convert to a file URL.
 * @returns The file URL object.
 */ export function pathToFileURL(filepath) {
    const outURL = new URL("file://");
    if (isWindows && filepath.startsWith("\\\\")) {
        // UNC path format: \\server\share\resource
        const paths = filepath.split("\\");
        if (paths.length <= 3) {
            throw new ERR_INVALID_ARG_VALUE("filepath", filepath, "Missing UNC resource path");
        }
        const hostname = paths[2];
        if (hostname.length === 0) {
            throw new ERR_INVALID_ARG_VALUE("filepath", filepath, "Empty UNC servername");
        }
        // TODO(wafuwafu13): To be `outURL.hostname = domainToASCII(hostname)` once `domainToASCII` are implemented
        outURL.hostname = hostname;
        outURL.pathname = encodePathChars(paths.slice(3).join("/"));
    } else {
        let resolved = path.resolve(filepath);
        // path.resolve strips trailing slashes so we must add them back
        const filePathLast = filepath.charCodeAt(filepath.length - 1);
        if ((filePathLast === CHAR_FORWARD_SLASH || isWindows && filePathLast === CHAR_BACKWARD_SLASH) && resolved[resolved.length - 1] !== path.sep) {
            resolved += "/";
        }
        outURL.pathname = encodePathChars(resolved);
    }
    return outURL;
}
/**
 * This utility function converts a URL object into an ordinary options object as expected by the `http.request()` and `https.request()` APIs.
 * @see Tested in `parallel/test-url-urltooptions.js`.
 * @param url The `WHATWG URL` object to convert to an options object.
 * @returns HttpOptions
 * @returns HttpOptions.protocol Protocol to use.
 * @returns HttpOptions.hostname A domain name or IP address of the server to issue the request to.
 * @returns HttpOptions.hash The fragment portion of the URL.
 * @returns HttpOptions.search The serialized query portion of the URL.
 * @returns HttpOptions.pathname The path portion of the URL.
 * @returns HttpOptions.path Request path. Should include query string if any. E.G. `'/index.html?page=12'`. An exception is thrown when the request path contains illegal characters. Currently, only spaces are rejected but that may change in the future.
 * @returns HttpOptions.href The serialized URL.
 * @returns HttpOptions.port Port of remote server.
 * @returns HttpOptions.auth Basic authentication i.e. `'user:password'` to compute an Authorization header.
 */ function urlToHttpOptions(url) {
    const options = {
        protocol: url.protocol,
        hostname: typeof url.hostname === "string" && url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname,
        hash: url.hash,
        search: url.search,
        pathname: url.pathname,
        path: `${url.pathname || ""}${url.search || ""}`,
        href: url.href
    };
    if (url.port !== "") {
        options.port = Number(url.port);
    }
    if (url.username || url.password) {
        options.auth = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
    }
    return options;
}
export default {
    parse,
    format,
    resolve,
    resolveObject,
    fileURLToPath,
    pathToFileURL,
    urlToHttpOptions,
    Url,
    URL,
    URLSearchParams
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvdXJsLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjIgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuaW1wb3J0IHtcbiAgRVJSX0lOVkFMSURfQVJHX1RZUEUsXG4gIEVSUl9JTlZBTElEX0FSR19WQUxVRSxcbiAgRVJSX0lOVkFMSURfRklMRV9VUkxfSE9TVCxcbiAgRVJSX0lOVkFMSURfRklMRV9VUkxfUEFUSCxcbiAgRVJSX0lOVkFMSURfVVJMX1NDSEVNRSxcbn0gZnJvbSBcIi4vaW50ZXJuYWwvZXJyb3JzLnRzXCI7XG5pbXBvcnQge1xuICBDSEFSXzAsXG4gIENIQVJfOSxcbiAgQ0hBUl9BVCxcbiAgQ0hBUl9CQUNLV0FSRF9TTEFTSCxcbiAgQ0hBUl9DQVJSSUFHRV9SRVRVUk4sXG4gIENIQVJfQ0lSQ1VNRkxFWF9BQ0NFTlQsXG4gIENIQVJfRE9ULFxuICBDSEFSX0RPVUJMRV9RVU9URSxcbiAgQ0hBUl9GT1JNX0ZFRUQsXG4gIENIQVJfRk9SV0FSRF9TTEFTSCxcbiAgQ0hBUl9HUkFWRV9BQ0NFTlQsXG4gIENIQVJfSEFTSCxcbiAgQ0hBUl9IWVBIRU5fTUlOVVMsXG4gIENIQVJfTEVGVF9BTkdMRV9CUkFDS0VULFxuICBDSEFSX0xFRlRfQ1VSTFlfQlJBQ0tFVCxcbiAgQ0hBUl9MRUZUX1NRVUFSRV9CUkFDS0VULFxuICBDSEFSX0xJTkVfRkVFRCxcbiAgQ0hBUl9MT1dFUkNBU0VfQSxcbiAgQ0hBUl9MT1dFUkNBU0VfWixcbiAgQ0hBUl9OT19CUkVBS19TUEFDRSxcbiAgQ0hBUl9QRVJDRU5ULFxuICBDSEFSX1BMVVMsXG4gIENIQVJfUVVFU1RJT05fTUFSSyxcbiAgQ0hBUl9SSUdIVF9BTkdMRV9CUkFDS0VULFxuICBDSEFSX1JJR0hUX0NVUkxZX0JSQUNLRVQsXG4gIENIQVJfUklHSFRfU1FVQVJFX0JSQUNLRVQsXG4gIENIQVJfU0VNSUNPTE9OLFxuICBDSEFSX1NJTkdMRV9RVU9URSxcbiAgQ0hBUl9TUEFDRSxcbiAgQ0hBUl9UQUIsXG4gIENIQVJfVU5ERVJTQ09SRSxcbiAgQ0hBUl9VUFBFUkNBU0VfQSxcbiAgQ0hBUl9VUFBFUkNBU0VfWixcbiAgQ0hBUl9WRVJUSUNBTF9MSU5FLFxuICBDSEFSX1pFUk9fV0lEVEhfTk9CUkVBS19TUEFDRSxcbn0gZnJvbSBcIi4uL3BhdGgvX2NvbnN0YW50cy50c1wiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwiLi9wYXRoLnRzXCI7XG5pbXBvcnQgeyB0b0FTQ0lJIH0gZnJvbSBcIi4vaW50ZXJuYWwvaWRuYS50c1wiO1xuaW1wb3J0IHsgaXNXaW5kb3dzLCBvc1R5cGUgfSBmcm9tIFwiLi4vX3V0aWwvb3MudHNcIjtcbmltcG9ydCB7IGVuY29kZVN0ciwgaGV4VGFibGUgfSBmcm9tIFwiLi9pbnRlcm5hbC9xdWVyeXN0cmluZy50c1wiO1xuaW1wb3J0IHF1ZXJ5c3RyaW5nIGZyb20gXCIuL3F1ZXJ5c3RyaW5nLnRzXCI7XG5pbXBvcnQgdHlwZSB7IFBhcnNlZFVybFF1ZXJ5IH0gZnJvbSBcIi4vcXVlcnlzdHJpbmcudHNcIjtcblxuY29uc3QgZm9yd2FyZFNsYXNoUmVnRXggPSAvXFwvL2c7XG5jb25zdCBwZXJjZW50UmVnRXggPSAvJS9nO1xuY29uc3QgYmFja3NsYXNoUmVnRXggPSAvXFxcXC9nO1xuY29uc3QgbmV3bGluZVJlZ0V4ID0gL1xcbi9nO1xuY29uc3QgY2FycmlhZ2VSZXR1cm5SZWdFeCA9IC9cXHIvZztcbmNvbnN0IHRhYlJlZ0V4ID0gL1xcdC9nO1xuLy8gUmVmZXJlbmNlOiBSRkMgMzk4NiwgUkZDIDE4MDgsIFJGQyAyMzk2XG5cbi8vIGRlZmluZSB0aGVzZSBoZXJlIHNvIGF0IGxlYXN0IHRoZXkgb25seSBoYXZlIHRvIGJlXG4vLyBjb21waWxlZCBvbmNlIG9uIHRoZSBmaXJzdCBtb2R1bGUgbG9hZC5cbmNvbnN0IHByb3RvY29sUGF0dGVybiA9IC9eW2EtejAtOS4rLV0rOi9pO1xuY29uc3QgcG9ydFBhdHRlcm4gPSAvOlswLTldKiQvO1xuY29uc3QgaG9zdFBhdHRlcm4gPSAvXlxcL1xcL1teQC9dK0BbXkAvXSsvO1xuLy8gU3BlY2lhbCBjYXNlIGZvciBhIHNpbXBsZSBwYXRoIFVSTFxuY29uc3Qgc2ltcGxlUGF0aFBhdHRlcm4gPSAvXihcXC9cXC8/KD8hXFwvKVteP1xcc10qKShcXD9bXlxcc10qKT8kLztcbi8vIFByb3RvY29scyB0aGF0IGNhbiBhbGxvdyBcInVuc2FmZVwiIGFuZCBcInVud2lzZVwiIGNoYXJzLlxuY29uc3QgdW5zYWZlUHJvdG9jb2wgPSBuZXcgU2V0KFtcImphdmFzY3JpcHRcIiwgXCJqYXZhc2NyaXB0OlwiXSk7XG4vLyBQcm90b2NvbHMgdGhhdCBuZXZlciBoYXZlIGEgaG9zdG5hbWUuXG5jb25zdCBob3N0bGVzc1Byb3RvY29sID0gbmV3IFNldChbXCJqYXZhc2NyaXB0XCIsIFwiamF2YXNjcmlwdDpcIl0pO1xuLy8gUHJvdG9jb2xzIHRoYXQgYWx3YXlzIGNvbnRhaW4gYSAvLyBiaXQuXG5jb25zdCBzbGFzaGVkUHJvdG9jb2wgPSBuZXcgU2V0KFtcbiAgXCJodHRwXCIsXG4gIFwiaHR0cDpcIixcbiAgXCJodHRwc1wiLFxuICBcImh0dHBzOlwiLFxuICBcImZ0cFwiLFxuICBcImZ0cDpcIixcbiAgXCJnb3BoZXJcIixcbiAgXCJnb3BoZXI6XCIsXG4gIFwiZmlsZVwiLFxuICBcImZpbGU6XCIsXG4gIFwid3NcIixcbiAgXCJ3czpcIixcbiAgXCJ3c3NcIixcbiAgXCJ3c3M6XCIsXG5dKTtcblxuY29uc3QgaG9zdG5hbWVNYXhMZW4gPSAyNTU7XG5cbi8vIFRoZXNlIGNoYXJhY3RlcnMgZG8gbm90IG5lZWQgZXNjYXBpbmc6XG4vLyAhIC0gLiBfIH5cbi8vICcgKCApICogOlxuLy8gZGlnaXRzXG4vLyBhbHBoYSAodXBwZXJjYXNlKVxuLy8gYWxwaGEgKGxvd2VyY2FzZSlcbi8vIGRlbm8tZm10LWlnbm9yZVxuY29uc3Qgbm9Fc2NhcGVBdXRoID0gbmV3IEludDhBcnJheShbXG4gIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIC8vIDB4MDAgLSAweDBGXG4gIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIDAsIC8vIDB4MTAgLSAweDFGXG4gIDAsIDEsIDAsIDAsIDAsIDAsIDAsIDEsIDEsIDEsIDEsIDAsIDAsIDEsIDEsIDAsIC8vIDB4MjAgLSAweDJGXG4gIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDAsIDAsIDAsIDAsIDAsIC8vIDB4MzAgLSAweDNGXG4gIDAsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIC8vIDB4NDAgLSAweDRGXG4gIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDAsIDAsIDAsIDAsIDEsIC8vIDB4NTAgLSAweDVGXG4gIDAsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIC8vIDB4NjAgLSAweDZGXG4gIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDEsIDAsIDAsIDAsIDEsIDAsICAvLyAweDcwIC0gMHg3RlxuXSk7XG5cbmNvbnN0IF91cmwgPSBVUkw7XG5leHBvcnQgeyBfdXJsIGFzIFVSTCB9O1xuXG4vLyBMZWdhY3kgVVJMIEFQSVxuZXhwb3J0IGNsYXNzIFVybCB7XG4gIHB1YmxpYyBwcm90b2NvbDogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGljIHNsYXNoZXM6IGJvb2xlYW4gfCBudWxsO1xuICBwdWJsaWMgYXV0aDogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGljIGhvc3Q6IHN0cmluZyB8IG51bGw7XG4gIHB1YmxpYyBwb3J0OiBzdHJpbmcgfCBudWxsO1xuICBwdWJsaWMgaG9zdG5hbWU6IHN0cmluZyB8IG51bGw7XG4gIHB1YmxpYyBoYXNoOiBzdHJpbmcgfCBudWxsO1xuICBwdWJsaWMgc2VhcmNoOiBzdHJpbmcgfCBudWxsO1xuICBwdWJsaWMgcXVlcnk6IHN0cmluZyB8IFBhcnNlZFVybFF1ZXJ5IHwgbnVsbDtcbiAgcHVibGljIHBhdGhuYW1lOiBzdHJpbmcgfCBudWxsO1xuICBwdWJsaWMgcGF0aDogc3RyaW5nIHwgbnVsbDtcbiAgcHVibGljIGhyZWY6IHN0cmluZyB8IG51bGw7XG4gIFtrZXk6IHN0cmluZ106IHVua25vd25cblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLnByb3RvY29sID0gbnVsbDtcbiAgICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICAgIHRoaXMuYXV0aCA9IG51bGw7XG4gICAgdGhpcy5ob3N0ID0gbnVsbDtcbiAgICB0aGlzLnBvcnQgPSBudWxsO1xuICAgIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICAgIHRoaXMuaGFzaCA9IG51bGw7XG4gICAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICAgIHRoaXMucXVlcnkgPSBudWxsO1xuICAgIHRoaXMucGF0aG5hbWUgPSBudWxsO1xuICAgIHRoaXMucGF0aCA9IG51bGw7XG4gICAgdGhpcy5ocmVmID0gbnVsbDtcbiAgfVxuXG4gICNwYXJzZUhvc3QoKSB7XG4gICAgbGV0IGhvc3QgPSB0aGlzLmhvc3QgfHwgXCJcIjtcbiAgICBsZXQgcG9ydDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCB8IHN0cmluZyA9IHBvcnRQYXR0ZXJuLmV4ZWMoaG9zdCk7XG4gICAgaWYgKHBvcnQpIHtcbiAgICAgIHBvcnQgPSBwb3J0WzBdO1xuICAgICAgaWYgKHBvcnQgIT09IFwiOlwiKSB7XG4gICAgICAgIHRoaXMucG9ydCA9IHBvcnQuc2xpY2UoMSk7XG4gICAgICB9XG4gICAgICBob3N0ID0gaG9zdC5zbGljZSgwLCBob3N0Lmxlbmd0aCAtIHBvcnQubGVuZ3RoKTtcbiAgICB9XG4gICAgaWYgKGhvc3QpIHRoaXMuaG9zdG5hbWUgPSBob3N0O1xuICB9XG5cbiAgcHVibGljIHJlc29sdmUocmVsYXRpdmU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLnJlc29sdmVPYmplY3QocGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKSkuZm9ybWF0KCk7XG4gIH1cblxuICBwdWJsaWMgcmVzb2x2ZU9iamVjdChyZWxhdGl2ZTogc3RyaW5nIHwgVXJsKSB7XG4gICAgaWYgKHR5cGVvZiByZWxhdGl2ZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgY29uc3QgcmVsID0gbmV3IFVybCgpO1xuICAgICAgcmVsLnVybFBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSk7XG4gICAgICByZWxhdGl2ZSA9IHJlbDtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBuZXcgVXJsKCk7XG4gICAgY29uc3QgdGtleXMgPSBPYmplY3Qua2V5cyh0aGlzKTtcbiAgICBmb3IgKGxldCB0ayA9IDA7IHRrIDwgdGtleXMubGVuZ3RoOyB0aysrKSB7XG4gICAgICBjb25zdCB0a2V5ID0gdGtleXNbdGtdO1xuICAgICAgcmVzdWx0W3RrZXldID0gdGhpc1t0a2V5XTtcbiAgICB9XG5cbiAgICAvLyBIYXNoIGlzIGFsd2F5cyBvdmVycmlkZGVuLCBubyBtYXR0ZXIgd2hhdC5cbiAgICAvLyBldmVuIGhyZWY9XCJcIiB3aWxsIHJlbW92ZSBpdC5cbiAgICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgICAvLyBJZiB0aGUgcmVsYXRpdmUgdXJsIGlzIGVtcHR5LCB0aGVuIHRoZXJlJ3Mgbm90aGluZyBsZWZ0IHRvIGRvIGhlcmUuXG4gICAgaWYgKHJlbGF0aXZlLmhyZWYgPT09IFwiXCIpIHtcbiAgICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBIcmVmcyBsaWtlIC8vZm9vL2JhciBhbHdheXMgY3V0IHRvIHRoZSBwcm90b2NvbC5cbiAgICBpZiAocmVsYXRpdmUuc2xhc2hlcyAmJiAhcmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAgIC8vIFRha2UgZXZlcnl0aGluZyBleGNlcHQgdGhlIHByb3RvY29sIGZyb20gcmVsYXRpdmVcbiAgICAgIGNvbnN0IHJrZXlzID0gT2JqZWN0LmtleXMocmVsYXRpdmUpO1xuICAgICAgZm9yIChsZXQgcmsgPSAwOyByayA8IHJrZXlzLmxlbmd0aDsgcmsrKykge1xuICAgICAgICBjb25zdCBya2V5ID0gcmtleXNbcmtdO1xuICAgICAgICBpZiAocmtleSAhPT0gXCJwcm90b2NvbFwiKSByZXN1bHRbcmtleV0gPSByZWxhdGl2ZVtya2V5XTtcbiAgICAgIH1cblxuICAgICAgLy8gdXJsUGFyc2UgYXBwZW5kcyB0cmFpbGluZyAvIHRvIHVybHMgbGlrZSBodHRwOi8vd3d3LmV4YW1wbGUuY29tXG4gICAgICBpZiAoXG4gICAgICAgIHJlc3VsdC5wcm90b2NvbCAmJlxuICAgICAgICBzbGFzaGVkUHJvdG9jb2wuaGFzKHJlc3VsdC5wcm90b2NvbCkgJiZcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lICYmXG4gICAgICAgICFyZXN1bHQucGF0aG5hbWVcbiAgICAgICkge1xuICAgICAgICByZXN1bHQucGF0aCA9IHJlc3VsdC5wYXRobmFtZSA9IFwiL1wiO1xuICAgICAgfVxuXG4gICAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgaWYgKHJlbGF0aXZlLnByb3RvY29sICYmIHJlbGF0aXZlLnByb3RvY29sICE9PSByZXN1bHQucHJvdG9jb2wpIHtcbiAgICAgIC8vIElmIGl0J3MgYSBrbm93biB1cmwgcHJvdG9jb2wsIHRoZW4gY2hhbmdpbmdcbiAgICAgIC8vIHRoZSBwcm90b2NvbCBkb2VzIHdlaXJkIHRoaW5nc1xuICAgICAgLy8gZmlyc3QsIGlmIGl0J3Mgbm90IGZpbGU6LCB0aGVuIHdlIE1VU1QgaGF2ZSBhIGhvc3QsXG4gICAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgICAgLy8gdG8gYmVnaW4gd2l0aCwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBwYXRoLlxuICAgICAgLy8gaWYgaXQgaXMgZmlsZTosIHRoZW4gdGhlIGhvc3QgaXMgZHJvcHBlZCxcbiAgICAgIC8vIGJlY2F1c2UgdGhhdCdzIGtub3duIHRvIGJlIGhvc3RsZXNzLlxuICAgICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgICAgaWYgKCFzbGFzaGVkUHJvdG9jb2wuaGFzKHJlbGF0aXZlLnByb3RvY29sKSkge1xuICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMocmVsYXRpdmUpO1xuICAgICAgICBmb3IgKGxldCB2ID0gMDsgdiA8IGtleXMubGVuZ3RoOyB2KyspIHtcbiAgICAgICAgICBjb25zdCBrID0ga2V5c1t2XTtcbiAgICAgICAgICByZXN1bHRba10gPSByZWxhdGl2ZVtrXTtcbiAgICAgICAgfVxuICAgICAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH1cblxuICAgICAgcmVzdWx0LnByb3RvY29sID0gcmVsYXRpdmUucHJvdG9jb2w7XG4gICAgICBpZiAoXG4gICAgICAgICFyZWxhdGl2ZS5ob3N0ICYmXG4gICAgICAgICEvXmZpbGU6PyQvLnRlc3QocmVsYXRpdmUucHJvdG9jb2wpICYmXG4gICAgICAgICFob3N0bGVzc1Byb3RvY29sLmhhcyhyZWxhdGl2ZS5wcm90b2NvbClcbiAgICAgICkge1xuICAgICAgICBjb25zdCByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8IFwiXCIpLnNwbGl0KFwiL1wiKTtcbiAgICAgICAgd2hpbGUgKHJlbFBhdGgubGVuZ3RoICYmICEocmVsYXRpdmUuaG9zdCA9IHJlbFBhdGguc2hpZnQoKSB8fCBudWxsKSk7XG4gICAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9IFwiXCI7XG4gICAgICAgIGlmICghcmVsYXRpdmUuaG9zdG5hbWUpIHJlbGF0aXZlLmhvc3RuYW1lID0gXCJcIjtcbiAgICAgICAgaWYgKHJlbFBhdGhbMF0gIT09IFwiXCIpIHJlbFBhdGgudW5zaGlmdChcIlwiKTtcbiAgICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxQYXRoLmpvaW4oXCIvXCIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsYXRpdmUucGF0aG5hbWU7XG4gICAgICB9XG4gICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgICByZXN1bHQuaG9zdCA9IHJlbGF0aXZlLmhvc3QgfHwgXCJcIjtcbiAgICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aDtcbiAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lIHx8IHJlbGF0aXZlLmhvc3Q7XG4gICAgICByZXN1bHQucG9ydCA9IHJlbGF0aXZlLnBvcnQ7XG4gICAgICAvLyBUbyBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgICAgaWYgKHJlc3VsdC5wYXRobmFtZSB8fCByZXN1bHQuc2VhcmNoKSB7XG4gICAgICAgIGNvbnN0IHAgPSByZXN1bHQucGF0aG5hbWUgfHwgXCJcIjtcbiAgICAgICAgY29uc3QgcyA9IHJlc3VsdC5zZWFyY2ggfHwgXCJcIjtcbiAgICAgICAgcmVzdWx0LnBhdGggPSBwICsgcztcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBjb25zdCBpc1NvdXJjZUFicyA9IHJlc3VsdC5wYXRobmFtZSAmJiByZXN1bHQucGF0aG5hbWUuY2hhckF0KDApID09PSBcIi9cIjtcbiAgICBjb25zdCBpc1JlbEFicyA9IHJlbGF0aXZlLmhvc3QgfHxcbiAgICAgIChyZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5jaGFyQXQoMCkgPT09IFwiL1wiKTtcbiAgICBsZXQgbXVzdEVuZEFiczogc3RyaW5nIHwgYm9vbGVhbiB8IG51bWJlciB8IG51bGwgPSBpc1JlbEFicyB8fFxuICAgICAgaXNTb3VyY2VBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHJlbGF0aXZlLnBhdGhuYW1lKTtcbiAgICBjb25zdCByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicztcbiAgICBsZXQgc3JjUGF0aCA9IChyZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLnNwbGl0KFwiL1wiKSkgfHwgW107XG4gICAgY29uc3QgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdChcIi9cIikpIHx8IFtdO1xuICAgIGNvbnN0IG5vTGVhZGluZ1NsYXNoZXMgPSByZXN1bHQucHJvdG9jb2wgJiZcbiAgICAgICFzbGFzaGVkUHJvdG9jb2wuaGFzKHJlc3VsdC5wcm90b2NvbCk7XG5cbiAgICAvLyBJZiB0aGUgdXJsIGlzIGEgbm9uLXNsYXNoZWQgdXJsLCB0aGVuIHJlbGF0aXZlXG4gICAgLy8gbGlua3MgbGlrZSAuLi8uLiBzaG91bGQgYmUgYWJsZVxuICAgIC8vIHRvIGNyYXdsIHVwIHRvIHRoZSBob3N0bmFtZSwgYXMgd2VsbC4gIFRoaXMgaXMgc3RyYW5nZS5cbiAgICAvLyByZXN1bHQucHJvdG9jb2wgaGFzIGFscmVhZHkgYmVlbiBzZXQgYnkgbm93LlxuICAgIC8vIExhdGVyIG9uLCBwdXQgdGhlIGZpcnN0IHBhdGggcGFydCBpbnRvIHRoZSBob3N0IGZpZWxkLlxuICAgIGlmIChub0xlYWRpbmdTbGFzaGVzKSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSBcIlwiO1xuICAgICAgcmVzdWx0LnBvcnQgPSBudWxsO1xuICAgICAgaWYgKHJlc3VsdC5ob3N0KSB7XG4gICAgICAgIGlmIChzcmNQYXRoWzBdID09PSBcIlwiKSBzcmNQYXRoWzBdID0gcmVzdWx0Lmhvc3Q7XG4gICAgICAgIGVsc2Ugc3JjUGF0aC51bnNoaWZ0KHJlc3VsdC5ob3N0KTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5ob3N0ID0gXCJcIjtcbiAgICAgIGlmIChyZWxhdGl2ZS5wcm90b2NvbCkge1xuICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA9IG51bGw7XG4gICAgICAgIHJlbGF0aXZlLnBvcnQgPSBudWxsO1xuICAgICAgICByZXN1bHQuYXV0aCA9IG51bGw7XG4gICAgICAgIGlmIChyZWxhdGl2ZS5ob3N0KSB7XG4gICAgICAgICAgaWYgKHJlbFBhdGhbMF0gPT09IFwiXCIpIHJlbFBhdGhbMF0gPSByZWxhdGl2ZS5ob3N0O1xuICAgICAgICAgIGVsc2UgcmVsUGF0aC51bnNoaWZ0KHJlbGF0aXZlLmhvc3QpO1xuICAgICAgICB9XG4gICAgICAgIHJlbGF0aXZlLmhvc3QgPSBudWxsO1xuICAgICAgfVxuICAgICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgJiYgKHJlbFBhdGhbMF0gPT09IFwiXCIgfHwgc3JjUGF0aFswXSA9PT0gXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKGlzUmVsQWJzKSB7XG4gICAgICAvLyBpdCdzIGFic29sdXRlLlxuICAgICAgaWYgKHJlbGF0aXZlLmhvc3QgfHwgcmVsYXRpdmUuaG9zdCA9PT0gXCJcIikge1xuICAgICAgICBpZiAocmVzdWx0Lmhvc3QgIT09IHJlbGF0aXZlLmhvc3QpIHJlc3VsdC5hdXRoID0gbnVsbDtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0O1xuICAgICAgICByZXN1bHQucG9ydCA9IHJlbGF0aXZlLnBvcnQ7XG4gICAgICB9XG4gICAgICBpZiAocmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdG5hbWUgPT09IFwiXCIpIHtcbiAgICAgICAgaWYgKHJlc3VsdC5ob3N0bmFtZSAhPT0gcmVsYXRpdmUuaG9zdG5hbWUpIHJlc3VsdC5hdXRoID0gbnVsbDtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWU7XG4gICAgICB9XG4gICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgICBzcmNQYXRoID0gcmVsUGF0aDtcbiAgICAgIC8vIEZhbGwgdGhyb3VnaCB0byB0aGUgZG90LWhhbmRsaW5nIGJlbG93LlxuICAgIH0gZWxzZSBpZiAocmVsUGF0aC5sZW5ndGgpIHtcbiAgICAgIC8vIGl0J3MgcmVsYXRpdmVcbiAgICAgIC8vIHRocm93IGF3YXkgdGhlIGV4aXN0aW5nIGZpbGUsIGFuZCB0YWtlIHRoZSBuZXcgcGF0aCBpbnN0ZWFkLlxuICAgICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgICBzcmNQYXRoLnBvcCgpO1xuICAgICAgc3JjUGF0aCA9IHNyY1BhdGguY29uY2F0KHJlbFBhdGgpO1xuICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIH0gZWxzZSBpZiAocmVsYXRpdmUuc2VhcmNoICE9PSBudWxsICYmIHJlbGF0aXZlLnNlYXJjaCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAvLyBKdXN0IHB1bGwgb3V0IHRoZSBzZWFyY2guXG4gICAgICAvLyBsaWtlIGhyZWY9Jz9mb28nLlxuICAgICAgLy8gUHV0IHRoaXMgYWZ0ZXIgdGhlIG90aGVyIHR3byBjYXNlcyBiZWNhdXNlIGl0IHNpbXBsaWZpZXMgdGhlIGJvb2xlYW5zXG4gICAgICBpZiAobm9MZWFkaW5nU2xhc2hlcykge1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IHNyY1BhdGguc2hpZnQoKSB8fCBudWxsO1xuICAgICAgICAvLyBPY2Nhc2lvbmFsbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3QuXG4gICAgICAgIC8vIFRoaXMgZXNwZWNpYWxseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgICAgLy8gdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgICAgIGNvbnN0IGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgJiZcbiAgICAgICAgICByZXN1bHQuaG9zdC5zcGxpdChcIkBcIik7XG4gICAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCkgfHwgbnVsbDtcbiAgICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKSB8fCBudWxsO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgICAvLyBUbyBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgICAgaWYgKHJlc3VsdC5wYXRobmFtZSAhPT0gbnVsbCB8fCByZXN1bHQuc2VhcmNoICE9PSBudWxsKSB7XG4gICAgICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6IFwiXCIpICtcbiAgICAgICAgICAocmVzdWx0LnNlYXJjaCA/IHJlc3VsdC5zZWFyY2ggOiBcIlwiKTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgICAvLyBObyBwYXRoIGF0IGFsbC4gQWxsIG90aGVyIHRoaW5ncyB3ZXJlIGFscmVhZHkgaGFuZGxlZCBhYm92ZS5cbiAgICAgIHJlc3VsdC5wYXRobmFtZSA9IG51bGw7XG4gICAgICAvLyBUbyBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgICAgaWYgKHJlc3VsdC5zZWFyY2gpIHtcbiAgICAgICAgcmVzdWx0LnBhdGggPSBcIi9cIiArIHJlc3VsdC5zZWFyY2g7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQucGF0aCA9IG51bGw7XG4gICAgICB9XG4gICAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLy8gSWYgYSB1cmwgRU5EcyBpbiAuIG9yIC4uLCB0aGVuIGl0IG11c3QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gICAgLy8gaG93ZXZlciwgaWYgaXQgZW5kcyBpbiBhbnl0aGluZyBlbHNlIG5vbi1zbGFzaHksXG4gICAgLy8gdGhlbiBpdCBtdXN0IE5PVCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgICBsZXQgbGFzdCA9IHNyY1BhdGguc2xpY2UoLTEpWzBdO1xuICAgIGNvbnN0IGhhc1RyYWlsaW5nU2xhc2ggPVxuICAgICAgKChyZXN1bHQuaG9zdCB8fCByZWxhdGl2ZS5ob3N0IHx8IHNyY1BhdGgubGVuZ3RoID4gMSkgJiZcbiAgICAgICAgKGxhc3QgPT09IFwiLlwiIHx8IGxhc3QgPT09IFwiLi5cIikpIHx8XG4gICAgICBsYXN0ID09PSBcIlwiO1xuXG4gICAgLy8gU3RyaXAgc2luZ2xlIGRvdHMsIHJlc29sdmUgZG91YmxlIGRvdHMgdG8gcGFyZW50IGRpclxuICAgIC8vIGlmIHRoZSBwYXRoIHRyaWVzIHRvIGdvIGFib3ZlIHRoZSByb290LCBgdXBgIGVuZHMgdXAgPiAwXG4gICAgbGV0IHVwID0gMDtcbiAgICBmb3IgKGxldCBpID0gc3JjUGF0aC5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgbGFzdCA9IHNyY1BhdGhbaV07XG4gICAgICBpZiAobGFzdCA9PT0gXCIuXCIpIHtcbiAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICB9IGVsc2UgaWYgKGxhc3QgPT09IFwiLi5cIikge1xuICAgICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgICAgdXArKztcbiAgICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICAgIHVwLS07XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICAgIGlmICghbXVzdEVuZEFicyAmJiAhcmVtb3ZlQWxsRG90cykge1xuICAgICAgd2hpbGUgKHVwLS0pIHtcbiAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiLi5cIik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgbXVzdEVuZEFicyAmJlxuICAgICAgc3JjUGF0aFswXSAhPT0gXCJcIiAmJlxuICAgICAgKCFzcmNQYXRoWzBdIHx8IHNyY1BhdGhbMF0uY2hhckF0KDApICE9PSBcIi9cIilcbiAgICApIHtcbiAgICAgIHNyY1BhdGgudW5zaGlmdChcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoaGFzVHJhaWxpbmdTbGFzaCAmJiBzcmNQYXRoLmpvaW4oXCIvXCIpLnN1YnN0cigtMSkgIT09IFwiL1wiKSB7XG4gICAgICBzcmNQYXRoLnB1c2goXCJcIik7XG4gICAgfVxuXG4gICAgY29uc3QgaXNBYnNvbHV0ZSA9IHNyY1BhdGhbMF0gPT09IFwiXCIgfHxcbiAgICAgIChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckF0KDApID09PSBcIi9cIik7XG5cbiAgICAvLyBwdXQgdGhlIGhvc3QgYmFja1xuICAgIGlmIChub0xlYWRpbmdTbGFzaGVzKSB7XG4gICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IGlzQWJzb2x1dGVcbiAgICAgICAgPyBcIlwiXG4gICAgICAgIDogc3JjUGF0aC5sZW5ndGhcbiAgICAgICAgPyBzcmNQYXRoLnNoaWZ0KCkgfHwgbnVsbFxuICAgICAgICA6IFwiXCI7XG4gICAgICAvLyBPY2Nhc2lvbmFsbHkgdGhlIGF1dGggY2FuIGdldCBzdHVjayBvbmx5IGluIGhvc3QuXG4gICAgICAvLyBUaGlzIGVzcGVjaWFsbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAvLyB1cmwucmVzb2x2ZU9iamVjdCgnbWFpbHRvOmxvY2FsMUBkb21haW4xJywgJ2xvY2FsMkBkb21haW4yJylcbiAgICAgIGNvbnN0IGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDBcbiAgICAgICAgPyByZXN1bHQuaG9zdC5zcGxpdChcIkBcIilcbiAgICAgICAgOiBmYWxzZTtcbiAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgIHJlc3VsdC5hdXRoID0gYXV0aEluSG9zdC5zaGlmdCgpIHx8IG51bGw7XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpIHx8IG51bGw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICAgIGlmIChtdXN0RW5kQWJzICYmICFpc0Fic29sdXRlKSB7XG4gICAgICBzcmNQYXRoLnVuc2hpZnQoXCJcIik7XG4gICAgfVxuXG4gICAgaWYgKCFzcmNQYXRoLmxlbmd0aCkge1xuICAgICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICAgIHJlc3VsdC5wYXRoID0gbnVsbDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0LnBhdGhuYW1lID0gc3JjUGF0aC5qb2luKFwiL1wiKTtcbiAgICB9XG5cbiAgICAvLyBUbyBzdXBwb3J0IHJlcXVlc3QuaHR0cFxuICAgIGlmIChyZXN1bHQucGF0aG5hbWUgIT09IG51bGwgfHwgcmVzdWx0LnNlYXJjaCAhPT0gbnVsbCkge1xuICAgICAgcmVzdWx0LnBhdGggPSAocmVzdWx0LnBhdGhuYW1lID8gcmVzdWx0LnBhdGhuYW1lIDogXCJcIikgK1xuICAgICAgICAocmVzdWx0LnNlYXJjaCA/IHJlc3VsdC5zZWFyY2ggOiBcIlwiKTtcbiAgICB9XG4gICAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoIHx8IHJlc3VsdC5hdXRoO1xuICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgZm9ybWF0KCkge1xuICAgIGxldCBhdXRoID0gdGhpcy5hdXRoIHx8IFwiXCI7XG4gICAgaWYgKGF1dGgpIHtcbiAgICAgIGF1dGggPSBlbmNvZGVTdHIoYXV0aCwgbm9Fc2NhcGVBdXRoLCBoZXhUYWJsZSk7XG4gICAgICBhdXRoICs9IFwiQFwiO1xuICAgIH1cblxuICAgIGxldCBwcm90b2NvbCA9IHRoaXMucHJvdG9jb2wgfHwgXCJcIjtcbiAgICBsZXQgcGF0aG5hbWUgPSB0aGlzLnBhdGhuYW1lIHx8IFwiXCI7XG4gICAgbGV0IGhhc2ggPSB0aGlzLmhhc2ggfHwgXCJcIjtcbiAgICBsZXQgaG9zdCA9IFwiXCI7XG4gICAgbGV0IHF1ZXJ5ID0gXCJcIjtcblxuICAgIGlmICh0aGlzLmhvc3QpIHtcbiAgICAgIGhvc3QgPSBhdXRoICsgdGhpcy5ob3N0O1xuICAgIH0gZWxzZSBpZiAodGhpcy5ob3N0bmFtZSkge1xuICAgICAgaG9zdCA9IGF1dGggK1xuICAgICAgICAodGhpcy5ob3N0bmFtZS5pbmNsdWRlcyhcIjpcIikgJiYgIWlzSXB2Nkhvc3RuYW1lKHRoaXMuaG9zdG5hbWUpXG4gICAgICAgICAgPyBcIltcIiArIHRoaXMuaG9zdG5hbWUgKyBcIl1cIlxuICAgICAgICAgIDogdGhpcy5ob3N0bmFtZSk7XG4gICAgICBpZiAodGhpcy5wb3J0KSB7XG4gICAgICAgIGhvc3QgKz0gXCI6XCIgKyB0aGlzLnBvcnQ7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRoaXMucXVlcnkgIT09IG51bGwgJiYgdHlwZW9mIHRoaXMucXVlcnkgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgIHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHRoaXMucXVlcnkpO1xuICAgIH1cblxuICAgIGxldCBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCAocXVlcnkgJiYgXCI/XCIgKyBxdWVyeSkgfHwgXCJcIjtcblxuICAgIGlmIChwcm90b2NvbCAmJiBwcm90b2NvbC5jaGFyQ29kZUF0KHByb3RvY29sLmxlbmd0aCAtIDEpICE9PSA1OCAvKiA6ICovKSB7XG4gICAgICBwcm90b2NvbCArPSBcIjpcIjtcbiAgICB9XG5cbiAgICBsZXQgbmV3UGF0aG5hbWUgPSBcIlwiO1xuICAgIGxldCBsYXN0UG9zID0gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBhdGhuYW1lLmxlbmd0aDsgKytpKSB7XG4gICAgICBzd2l0Y2ggKHBhdGhuYW1lLmNoYXJDb2RlQXQoaSkpIHtcbiAgICAgICAgY2FzZSBDSEFSX0hBU0g6XG4gICAgICAgICAgaWYgKGkgLSBsYXN0UG9zID4gMCkge1xuICAgICAgICAgICAgbmV3UGF0aG5hbWUgKz0gcGF0aG5hbWUuc2xpY2UobGFzdFBvcywgaSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG5ld1BhdGhuYW1lICs9IFwiJTIzXCI7XG4gICAgICAgICAgbGFzdFBvcyA9IGkgKyAxO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIENIQVJfUVVFU1RJT05fTUFSSzpcbiAgICAgICAgICBpZiAoaSAtIGxhc3RQb3MgPiAwKSB7XG4gICAgICAgICAgICBuZXdQYXRobmFtZSArPSBwYXRobmFtZS5zbGljZShsYXN0UG9zLCBpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgbmV3UGF0aG5hbWUgKz0gXCIlM0ZcIjtcbiAgICAgICAgICBsYXN0UG9zID0gaSArIDE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChsYXN0UG9zID4gMCkge1xuICAgICAgaWYgKGxhc3RQb3MgIT09IHBhdGhuYW1lLmxlbmd0aCkge1xuICAgICAgICBwYXRobmFtZSA9IG5ld1BhdGhuYW1lICsgcGF0aG5hbWUuc2xpY2UobGFzdFBvcyk7XG4gICAgICB9IGVsc2UgcGF0aG5hbWUgPSBuZXdQYXRobmFtZTtcbiAgICB9XG5cbiAgICAvLyBPbmx5IHRoZSBzbGFzaGVkUHJvdG9jb2xzIGdldCB0aGUgLy8uICBOb3QgbWFpbHRvOiwgeG1wcDosIGV0Yy5cbiAgICAvLyB1bmxlc3MgdGhleSBoYWQgdGhlbSB0byBiZWdpbiB3aXRoLlxuICAgIGlmICh0aGlzLnNsYXNoZXMgfHwgc2xhc2hlZFByb3RvY29sLmhhcyhwcm90b2NvbCkpIHtcbiAgICAgIGlmICh0aGlzLnNsYXNoZXMgfHwgaG9zdCkge1xuICAgICAgICBpZiAocGF0aG5hbWUgJiYgcGF0aG5hbWUuY2hhckNvZGVBdCgwKSAhPT0gQ0hBUl9GT1JXQVJEX1NMQVNIKSB7XG4gICAgICAgICAgcGF0aG5hbWUgPSBcIi9cIiArIHBhdGhuYW1lO1xuICAgICAgICB9XG4gICAgICAgIGhvc3QgPSBcIi8vXCIgKyBob3N0O1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgcHJvdG9jb2wubGVuZ3RoID49IDQgJiZcbiAgICAgICAgcHJvdG9jb2wuY2hhckNvZGVBdCgwKSA9PT0gMTAyIC8qIGYgKi8gJiZcbiAgICAgICAgcHJvdG9jb2wuY2hhckNvZGVBdCgxKSA9PT0gMTA1IC8qIGkgKi8gJiZcbiAgICAgICAgcHJvdG9jb2wuY2hhckNvZGVBdCgyKSA9PT0gMTA4IC8qIGwgKi8gJiZcbiAgICAgICAgcHJvdG9jb2wuY2hhckNvZGVBdCgzKSA9PT0gMTAxIC8qIGUgKi9cbiAgICAgICkge1xuICAgICAgICBob3N0ID0gXCIvL1wiO1xuICAgICAgfVxuICAgIH1cblxuICAgIHNlYXJjaCA9IHNlYXJjaC5yZXBsYWNlKC8jL2csIFwiJTIzXCIpO1xuXG4gICAgaWYgKGhhc2ggJiYgaGFzaC5jaGFyQ29kZUF0KDApICE9PSBDSEFSX0hBU0gpIHtcbiAgICAgIGhhc2ggPSBcIiNcIiArIGhhc2g7XG4gICAgfVxuICAgIGlmIChzZWFyY2ggJiYgc2VhcmNoLmNoYXJDb2RlQXQoMCkgIT09IENIQVJfUVVFU1RJT05fTUFSSykge1xuICAgICAgc2VhcmNoID0gXCI/XCIgKyBzZWFyY2g7XG4gICAgfVxuXG4gICAgcmV0dXJuIHByb3RvY29sICsgaG9zdCArIHBhdGhuYW1lICsgc2VhcmNoICsgaGFzaDtcbiAgfVxuXG4gIHB1YmxpYyB1cmxQYXJzZShcbiAgICB1cmw6IHN0cmluZyxcbiAgICBwYXJzZVF1ZXJ5U3RyaW5nOiBib29sZWFuLFxuICAgIHNsYXNoZXNEZW5vdGVIb3N0OiBib29sZWFuLFxuICApIHtcbiAgICAvLyBDb3B5IGNocm9tZSwgSUUsIG9wZXJhIGJhY2tzbGFzaC1oYW5kbGluZyBiZWhhdmlvci5cbiAgICAvLyBCYWNrIHNsYXNoZXMgYmVmb3JlIHRoZSBxdWVyeSBzdHJpbmcgZ2V0IGNvbnZlcnRlZCB0byBmb3J3YXJkIHNsYXNoZXNcbiAgICAvLyBTZWU6IGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvY2hyb21pdW0vaXNzdWVzL2RldGFpbD9pZD0yNTkxNlxuICAgIGxldCBoYXNIYXNoID0gZmFsc2U7XG4gICAgbGV0IHN0YXJ0ID0gLTE7XG4gICAgbGV0IGVuZCA9IC0xO1xuICAgIGxldCByZXN0ID0gXCJcIjtcbiAgICBsZXQgbGFzdFBvcyA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDAsIGluV3MgPSBmYWxzZSwgc3BsaXQgPSBmYWxzZTsgaSA8IHVybC5sZW5ndGg7ICsraSkge1xuICAgICAgY29uc3QgY29kZSA9IHVybC5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAvLyBGaW5kIGZpcnN0IGFuZCBsYXN0IG5vbi13aGl0ZXNwYWNlIGNoYXJhY3RlcnMgZm9yIHRyaW1taW5nXG4gICAgICBjb25zdCBpc1dzID0gY29kZSA9PT0gQ0hBUl9TUEFDRSB8fFxuICAgICAgICBjb2RlID09PSBDSEFSX1RBQiB8fFxuICAgICAgICBjb2RlID09PSBDSEFSX0NBUlJJQUdFX1JFVFVSTiB8fFxuICAgICAgICBjb2RlID09PSBDSEFSX0xJTkVfRkVFRCB8fFxuICAgICAgICBjb2RlID09PSBDSEFSX0ZPUk1fRkVFRCB8fFxuICAgICAgICBjb2RlID09PSBDSEFSX05PX0JSRUFLX1NQQUNFIHx8XG4gICAgICAgIGNvZGUgPT09IENIQVJfWkVST19XSURUSF9OT0JSRUFLX1NQQUNFO1xuICAgICAgaWYgKHN0YXJ0ID09PSAtMSkge1xuICAgICAgICBpZiAoaXNXcykgY29udGludWU7XG4gICAgICAgIGxhc3RQb3MgPSBzdGFydCA9IGk7XG4gICAgICB9IGVsc2UgaWYgKGluV3MpIHtcbiAgICAgICAgaWYgKCFpc1dzKSB7XG4gICAgICAgICAgZW5kID0gLTE7XG4gICAgICAgICAgaW5XcyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGlzV3MpIHtcbiAgICAgICAgZW5kID0gaTtcbiAgICAgICAgaW5XcyA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIC8vIE9ubHkgY29udmVydCBiYWNrc2xhc2hlcyB3aGlsZSB3ZSBoYXZlbid0IHNlZW4gYSBzcGxpdCBjaGFyYWN0ZXJcbiAgICAgIGlmICghc3BsaXQpIHtcbiAgICAgICAgc3dpdGNoIChjb2RlKSB7XG4gICAgICAgICAgY2FzZSBDSEFSX0hBU0g6XG4gICAgICAgICAgICBoYXNIYXNoID0gdHJ1ZTtcbiAgICAgICAgICAvLyBGYWxsIHRocm91Z2hcbiAgICAgICAgICBjYXNlIENIQVJfUVVFU1RJT05fTUFSSzpcbiAgICAgICAgICAgIHNwbGl0ID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgQ0hBUl9CQUNLV0FSRF9TTEFTSDpcbiAgICAgICAgICAgIGlmIChpIC0gbGFzdFBvcyA+IDApIHJlc3QgKz0gdXJsLnNsaWNlKGxhc3RQb3MsIGkpO1xuICAgICAgICAgICAgcmVzdCArPSBcIi9cIjtcbiAgICAgICAgICAgIGxhc3RQb3MgPSBpICsgMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFoYXNIYXNoICYmIGNvZGUgPT09IENIQVJfSEFTSCkge1xuICAgICAgICBoYXNIYXNoID0gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBzdHJpbmcgd2FzIG5vbi1lbXB0eSAoaW5jbHVkaW5nIHN0cmluZ3Mgd2l0aCBvbmx5IHdoaXRlc3BhY2UpXG4gICAgaWYgKHN0YXJ0ICE9PSAtMSkge1xuICAgICAgaWYgKGxhc3RQb3MgPT09IHN0YXJ0KSB7XG4gICAgICAgIC8vIFdlIGRpZG4ndCBjb252ZXJ0IGFueSBiYWNrc2xhc2hlc1xuXG4gICAgICAgIGlmIChlbmQgPT09IC0xKSB7XG4gICAgICAgICAgaWYgKHN0YXJ0ID09PSAwKSByZXN0ID0gdXJsO1xuICAgICAgICAgIGVsc2UgcmVzdCA9IHVybC5zbGljZShzdGFydCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdCA9IHVybC5zbGljZShzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChlbmQgPT09IC0xICYmIGxhc3RQb3MgPCB1cmwubGVuZ3RoKSB7XG4gICAgICAgIC8vIFdlIGNvbnZlcnRlZCBzb21lIGJhY2tzbGFzaGVzIGFuZCBoYXZlIG9ubHkgcGFydCBvZiB0aGUgZW50aXJlIHN0cmluZ1xuICAgICAgICByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zKTtcbiAgICAgIH0gZWxzZSBpZiAoZW5kICE9PSAtMSAmJiBsYXN0UG9zIDwgZW5kKSB7XG4gICAgICAgIC8vIFdlIGNvbnZlcnRlZCBzb21lIGJhY2tzbGFzaGVzIGFuZCBoYXZlIG9ubHkgcGFydCBvZiB0aGUgZW50aXJlIHN0cmluZ1xuICAgICAgICByZXN0ICs9IHVybC5zbGljZShsYXN0UG9zLCBlbmQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghc2xhc2hlc0Rlbm90ZUhvc3QgJiYgIWhhc0hhc2gpIHtcbiAgICAgIC8vIFRyeSBmYXN0IHBhdGggcmVnZXhwXG4gICAgICBjb25zdCBzaW1wbGVQYXRoID0gc2ltcGxlUGF0aFBhdHRlcm4uZXhlYyhyZXN0KTtcbiAgICAgIGlmIChzaW1wbGVQYXRoKSB7XG4gICAgICAgIHRoaXMucGF0aCA9IHJlc3Q7XG4gICAgICAgIHRoaXMuaHJlZiA9IHJlc3Q7XG4gICAgICAgIHRoaXMucGF0aG5hbWUgPSBzaW1wbGVQYXRoWzFdO1xuICAgICAgICBpZiAoc2ltcGxlUGF0aFsyXSkge1xuICAgICAgICAgIHRoaXMuc2VhcmNoID0gc2ltcGxlUGF0aFsyXTtcbiAgICAgICAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICAgICAgdGhpcy5xdWVyeSA9IHF1ZXJ5c3RyaW5nLnBhcnNlKHRoaXMuc2VhcmNoLnNsaWNlKDEpKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5xdWVyeSA9IHRoaXMuc2VhcmNoLnNsaWNlKDEpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICAgICAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICAgICAgICAgIHRoaXMucXVlcnkgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBwcm90bzogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCB8IHN0cmluZyA9IHByb3RvY29sUGF0dGVybi5leGVjKHJlc3QpO1xuICAgIGxldCBsb3dlclByb3RvID0gXCJcIjtcbiAgICBpZiAocHJvdG8pIHtcbiAgICAgIHByb3RvID0gcHJvdG9bMF07XG4gICAgICBsb3dlclByb3RvID0gcHJvdG8udG9Mb3dlckNhc2UoKTtcbiAgICAgIHRoaXMucHJvdG9jb2wgPSBsb3dlclByb3RvO1xuICAgICAgcmVzdCA9IHJlc3Quc2xpY2UocHJvdG8ubGVuZ3RoKTtcbiAgICB9XG5cbiAgICAvLyBGaWd1cmUgb3V0IGlmIGl0J3MgZ290IGEgaG9zdFxuICAgIC8vIHVzZXJAc2VydmVyIGlzICphbHdheXMqIGludGVycHJldGVkIGFzIGEgaG9zdG5hbWUsIGFuZCB1cmxcbiAgICAvLyByZXNvbHV0aW9uIHdpbGwgdHJlYXQgLy9mb28vYmFyIGFzIGhvc3Q9Zm9vLHBhdGg9YmFyIGJlY2F1c2UgdGhhdCdzXG4gICAgLy8gaG93IHRoZSBicm93c2VyIHJlc29sdmVzIHJlbGF0aXZlIFVSTHMuXG4gICAgbGV0IHNsYXNoZXM7XG4gICAgaWYgKHNsYXNoZXNEZW5vdGVIb3N0IHx8IHByb3RvIHx8IGhvc3RQYXR0ZXJuLnRlc3QocmVzdCkpIHtcbiAgICAgIHNsYXNoZXMgPSByZXN0LmNoYXJDb2RlQXQoMCkgPT09IENIQVJfRk9SV0FSRF9TTEFTSCAmJlxuICAgICAgICByZXN0LmNoYXJDb2RlQXQoMSkgPT09IENIQVJfRk9SV0FSRF9TTEFTSDtcbiAgICAgIGlmIChzbGFzaGVzICYmICEocHJvdG8gJiYgaG9zdGxlc3NQcm90b2NvbC5oYXMobG93ZXJQcm90bykpKSB7XG4gICAgICAgIHJlc3QgPSByZXN0LnNsaWNlKDIpO1xuICAgICAgICB0aGlzLnNsYXNoZXMgPSB0cnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChcbiAgICAgICFob3N0bGVzc1Byb3RvY29sLmhhcyhsb3dlclByb3RvKSAmJlxuICAgICAgKHNsYXNoZXMgfHwgKHByb3RvICYmICFzbGFzaGVkUHJvdG9jb2wuaGFzKHByb3RvKSkpXG4gICAgKSB7XG4gICAgICAvLyB0aGVyZSdzIGEgaG9zdG5hbWUuXG4gICAgICAvLyB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgLywgPywgOywgb3IgIyBlbmRzIHRoZSBob3N0LlxuICAgICAgLy9cbiAgICAgIC8vIElmIHRoZXJlIGlzIGFuIEAgaW4gdGhlIGhvc3RuYW1lLCB0aGVuIG5vbi1ob3N0IGNoYXJzICphcmUqIGFsbG93ZWRcbiAgICAgIC8vIHRvIHRoZSBsZWZ0IG9mIHRoZSBsYXN0IEAgc2lnbiwgdW5sZXNzIHNvbWUgaG9zdC1lbmRpbmcgY2hhcmFjdGVyXG4gICAgICAvLyBjb21lcyAqYmVmb3JlKiB0aGUgQC1zaWduLlxuICAgICAgLy8gVVJMcyBhcmUgb2Jub3hpb3VzLlxuICAgICAgLy9cbiAgICAgIC8vIGV4OlxuICAgICAgLy8gaHR0cDovL2FAYkBjLyA9PiB1c2VyOmFAYiBob3N0OmNcbiAgICAgIC8vIGh0dHA6Ly9hQGI/QGMgPT4gdXNlcjphIGhvc3Q6YiBwYXRoOi8/QGNcblxuICAgICAgbGV0IGhvc3RFbmQgPSAtMTtcbiAgICAgIGxldCBhdFNpZ24gPSAtMTtcbiAgICAgIGxldCBub25Ib3N0ID0gLTE7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJlc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgc3dpdGNoIChyZXN0LmNoYXJDb2RlQXQoaSkpIHtcbiAgICAgICAgICBjYXNlIENIQVJfVEFCOlxuICAgICAgICAgIGNhc2UgQ0hBUl9MSU5FX0ZFRUQ6XG4gICAgICAgICAgY2FzZSBDSEFSX0NBUlJJQUdFX1JFVFVSTjpcbiAgICAgICAgICBjYXNlIENIQVJfU1BBQ0U6XG4gICAgICAgICAgY2FzZSBDSEFSX0RPVUJMRV9RVU9URTpcbiAgICAgICAgICBjYXNlIENIQVJfUEVSQ0VOVDpcbiAgICAgICAgICBjYXNlIENIQVJfU0lOR0xFX1FVT1RFOlxuICAgICAgICAgIGNhc2UgQ0hBUl9TRU1JQ09MT046XG4gICAgICAgICAgY2FzZSBDSEFSX0xFRlRfQU5HTEVfQlJBQ0tFVDpcbiAgICAgICAgICBjYXNlIENIQVJfUklHSFRfQU5HTEVfQlJBQ0tFVDpcbiAgICAgICAgICBjYXNlIENIQVJfQkFDS1dBUkRfU0xBU0g6XG4gICAgICAgICAgY2FzZSBDSEFSX0NJUkNVTUZMRVhfQUNDRU5UOlxuICAgICAgICAgIGNhc2UgQ0hBUl9HUkFWRV9BQ0NFTlQ6XG4gICAgICAgICAgY2FzZSBDSEFSX0xFRlRfQ1VSTFlfQlJBQ0tFVDpcbiAgICAgICAgICBjYXNlIENIQVJfVkVSVElDQUxfTElORTpcbiAgICAgICAgICBjYXNlIENIQVJfUklHSFRfQ1VSTFlfQlJBQ0tFVDpcbiAgICAgICAgICAgIC8vIENoYXJhY3RlcnMgdGhhdCBhcmUgbmV2ZXIgZXZlciBhbGxvd2VkIGluIGEgaG9zdG5hbWUgZnJvbSBSRkMgMjM5NlxuICAgICAgICAgICAgaWYgKG5vbkhvc3QgPT09IC0xKSBub25Ib3N0ID0gaTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgQ0hBUl9IQVNIOlxuICAgICAgICAgIGNhc2UgQ0hBUl9GT1JXQVJEX1NMQVNIOlxuICAgICAgICAgIGNhc2UgQ0hBUl9RVUVTVElPTl9NQVJLOlxuICAgICAgICAgICAgLy8gRmluZCB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgYW55IGhvc3QtZW5kaW5nIGNoYXJhY3RlcnNcbiAgICAgICAgICAgIGlmIChub25Ib3N0ID09PSAtMSkgbm9uSG9zdCA9IGk7XG4gICAgICAgICAgICBob3N0RW5kID0gaTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgQ0hBUl9BVDpcbiAgICAgICAgICAgIC8vIEF0IHRoaXMgcG9pbnQsIGVpdGhlciB3ZSBoYXZlIGFuIGV4cGxpY2l0IHBvaW50IHdoZXJlIHRoZVxuICAgICAgICAgICAgLy8gYXV0aCBwb3J0aW9uIGNhbm5vdCBnbyBwYXN0LCBvciB0aGUgbGFzdCBAIGNoYXIgaXMgdGhlIGRlY2lkZXIuXG4gICAgICAgICAgICBhdFNpZ24gPSBpO1xuICAgICAgICAgICAgbm9uSG9zdCA9IC0xO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGhvc3RFbmQgIT09IC0xKSBicmVhaztcbiAgICAgIH1cbiAgICAgIHN0YXJ0ID0gMDtcbiAgICAgIGlmIChhdFNpZ24gIT09IC0xKSB7XG4gICAgICAgIHRoaXMuYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChyZXN0LnNsaWNlKDAsIGF0U2lnbikpO1xuICAgICAgICBzdGFydCA9IGF0U2lnbiArIDE7XG4gICAgICB9XG4gICAgICBpZiAobm9uSG9zdCA9PT0gLTEpIHtcbiAgICAgICAgdGhpcy5ob3N0ID0gcmVzdC5zbGljZShzdGFydCk7XG4gICAgICAgIHJlc3QgPSBcIlwiO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5ob3N0ID0gcmVzdC5zbGljZShzdGFydCwgbm9uSG9zdCk7XG4gICAgICAgIHJlc3QgPSByZXN0LnNsaWNlKG5vbkhvc3QpO1xuICAgICAgfVxuXG4gICAgICAvLyBwdWxsIG91dCBwb3J0LlxuICAgICAgdGhpcy4jcGFyc2VIb3N0KCk7XG5cbiAgICAgIC8vIFdlJ3ZlIGluZGljYXRlZCB0aGF0IHRoZXJlIGlzIGEgaG9zdG5hbWUsXG4gICAgICAvLyBzbyBldmVuIGlmIGl0J3MgZW1wdHksIGl0IGhhcyB0byBiZSBwcmVzZW50LlxuICAgICAgaWYgKHR5cGVvZiB0aGlzLmhvc3RuYW1lICE9PSBcInN0cmluZ1wiKSB0aGlzLmhvc3RuYW1lID0gXCJcIjtcblxuICAgICAgY29uc3QgaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lO1xuXG4gICAgICAvLyBJZiBob3N0bmFtZSBiZWdpbnMgd2l0aCBbIGFuZCBlbmRzIHdpdGggXVxuICAgICAgLy8gYXNzdW1lIHRoYXQgaXQncyBhbiBJUHY2IGFkZHJlc3MuXG4gICAgICBjb25zdCBpcHY2SG9zdG5hbWUgPSBpc0lwdjZIb3N0bmFtZShob3N0bmFtZSk7XG5cbiAgICAgIC8vIHZhbGlkYXRlIGEgbGl0dGxlLlxuICAgICAgaWYgKCFpcHY2SG9zdG5hbWUpIHtcbiAgICAgICAgcmVzdCA9IGdldEhvc3RuYW1lKHRoaXMsIHJlc3QsIGhvc3RuYW1lKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuaG9zdG5hbWUubGVuZ3RoID4gaG9zdG5hbWVNYXhMZW4pIHtcbiAgICAgICAgdGhpcy5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBIb3N0bmFtZXMgYXJlIGFsd2F5cyBsb3dlciBjYXNlLlxuICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgfVxuXG4gICAgICBpZiAoIWlwdjZIb3N0bmFtZSkge1xuICAgICAgICAvLyBJRE5BIFN1cHBvcnQ6IFJldHVybnMgYSBwdW55Y29kZWQgcmVwcmVzZW50YXRpb24gb2YgXCJkb21haW5cIi5cbiAgICAgICAgLy8gSXQgb25seSBjb252ZXJ0cyBwYXJ0cyBvZiB0aGUgZG9tYWluIG5hbWUgdGhhdFxuICAgICAgICAvLyBoYXZlIG5vbi1BU0NJSSBjaGFyYWN0ZXJzLCBpLmUuIGl0IGRvZXNuJ3QgbWF0dGVyIGlmXG4gICAgICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIEFTQ0lJLW9ubHkuXG5cbiAgICAgICAgLy8gVXNlIGxlbmllbnQgbW9kZSAoYHRydWVgKSB0byB0cnkgdG8gc3VwcG9ydCBldmVuIG5vbi1jb21wbGlhbnRcbiAgICAgICAgLy8gVVJMcy5cbiAgICAgICAgdGhpcy5ob3N0bmFtZSA9IHRvQVNDSUkodGhpcy5ob3N0bmFtZSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHAgPSB0aGlzLnBvcnQgPyBcIjpcIiArIHRoaXMucG9ydCA6IFwiXCI7XG4gICAgICBjb25zdCBoID0gdGhpcy5ob3N0bmFtZSB8fCBcIlwiO1xuICAgICAgdGhpcy5ob3N0ID0gaCArIHA7XG5cbiAgICAgIC8vIHN0cmlwIFsgYW5kIF0gZnJvbSB0aGUgaG9zdG5hbWVcbiAgICAgIC8vIHRoZSBob3N0IGZpZWxkIHN0aWxsIHJldGFpbnMgdGhlbSwgdGhvdWdoXG4gICAgICBpZiAoaXB2Nkhvc3RuYW1lKSB7XG4gICAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lLnNsaWNlKDEsIC0xKTtcbiAgICAgICAgaWYgKHJlc3RbMF0gIT09IFwiL1wiKSB7XG4gICAgICAgICAgcmVzdCA9IFwiL1wiICsgcmVzdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIE5vdyByZXN0IGlzIHNldCB0byB0aGUgcG9zdC1ob3N0IHN0dWZmLlxuICAgIC8vIENob3Agb2ZmIGFueSBkZWxpbSBjaGFycy5cbiAgICBpZiAoIXVuc2FmZVByb3RvY29sLmhhcyhsb3dlclByb3RvKSkge1xuICAgICAgLy8gRmlyc3QsIG1ha2UgMTAwJSBzdXJlIHRoYXQgYW55IFwiYXV0b0VzY2FwZVwiIGNoYXJzIGdldFxuICAgICAgLy8gZXNjYXBlZCwgZXZlbiBpZiBlbmNvZGVVUklDb21wb25lbnQgZG9lc24ndCB0aGluayB0aGV5XG4gICAgICAvLyBuZWVkIHRvIGJlLlxuICAgICAgcmVzdCA9IGF1dG9Fc2NhcGVTdHIocmVzdCk7XG4gICAgfVxuXG4gICAgbGV0IHF1ZXN0aW9uSWR4ID0gLTE7XG4gICAgbGV0IGhhc2hJZHggPSAtMTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJlc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgIGNvbnN0IGNvZGUgPSByZXN0LmNoYXJDb2RlQXQoaSk7XG4gICAgICBpZiAoY29kZSA9PT0gQ0hBUl9IQVNIKSB7XG4gICAgICAgIHRoaXMuaGFzaCA9IHJlc3Quc2xpY2UoaSk7XG4gICAgICAgIGhhc2hJZHggPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH0gZWxzZSBpZiAoY29kZSA9PT0gQ0hBUl9RVUVTVElPTl9NQVJLICYmIHF1ZXN0aW9uSWR4ID09PSAtMSkge1xuICAgICAgICBxdWVzdGlvbklkeCA9IGk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHF1ZXN0aW9uSWR4ICE9PSAtMSkge1xuICAgICAgaWYgKGhhc2hJZHggPT09IC0xKSB7XG4gICAgICAgIHRoaXMuc2VhcmNoID0gcmVzdC5zbGljZShxdWVzdGlvbklkeCk7XG4gICAgICAgIHRoaXMucXVlcnkgPSByZXN0LnNsaWNlKHF1ZXN0aW9uSWR4ICsgMSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnNlYXJjaCA9IHJlc3Quc2xpY2UocXVlc3Rpb25JZHgsIGhhc2hJZHgpO1xuICAgICAgICB0aGlzLnF1ZXJ5ID0gcmVzdC5zbGljZShxdWVzdGlvbklkeCArIDEsIGhhc2hJZHgpO1xuICAgICAgfVxuICAgICAgaWYgKHBhcnNlUXVlcnlTdHJpbmcpIHtcbiAgICAgICAgdGhpcy5xdWVyeSA9IHF1ZXJ5c3RyaW5nLnBhcnNlKHRoaXMucXVlcnkpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgLy8gTm8gcXVlcnkgc3RyaW5nLCBidXQgcGFyc2VRdWVyeVN0cmluZyBzdGlsbCByZXF1ZXN0ZWRcbiAgICAgIHRoaXMuc2VhcmNoID0gbnVsbDtcbiAgICAgIHRoaXMucXVlcnkgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZVF1ZXN0aW9uSWR4ID0gcXVlc3Rpb25JZHggIT09IC0xICYmXG4gICAgICAoaGFzaElkeCA9PT0gLTEgfHwgcXVlc3Rpb25JZHggPCBoYXNoSWR4KTtcbiAgICBjb25zdCBmaXJzdElkeCA9IHVzZVF1ZXN0aW9uSWR4ID8gcXVlc3Rpb25JZHggOiBoYXNoSWR4O1xuICAgIGlmIChmaXJzdElkeCA9PT0gLTEpIHtcbiAgICAgIGlmIChyZXN0Lmxlbmd0aCA+IDApIHRoaXMucGF0aG5hbWUgPSByZXN0O1xuICAgIH0gZWxzZSBpZiAoZmlyc3RJZHggPiAwKSB7XG4gICAgICB0aGlzLnBhdGhuYW1lID0gcmVzdC5zbGljZSgwLCBmaXJzdElkeCk7XG4gICAgfVxuICAgIGlmIChzbGFzaGVkUHJvdG9jb2wuaGFzKGxvd2VyUHJvdG8pICYmIHRoaXMuaG9zdG5hbWUgJiYgIXRoaXMucGF0aG5hbWUpIHtcbiAgICAgIHRoaXMucGF0aG5hbWUgPSBcIi9cIjtcbiAgICB9XG5cbiAgICAvLyBUbyBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmICh0aGlzLnBhdGhuYW1lIHx8IHRoaXMuc2VhcmNoKSB7XG4gICAgICBjb25zdCBwID0gdGhpcy5wYXRobmFtZSB8fCBcIlwiO1xuICAgICAgY29uc3QgcyA9IHRoaXMuc2VhcmNoIHx8IFwiXCI7XG4gICAgICB0aGlzLnBhdGggPSBwICsgcztcbiAgICB9XG5cbiAgICAvLyBGaW5hbGx5LCByZWNvbnN0cnVjdCB0aGUgaHJlZiBiYXNlZCBvbiB3aGF0IGhhcyBiZWVuIHZhbGlkYXRlZC5cbiAgICB0aGlzLmhyZWYgPSB0aGlzLmZvcm1hdCgpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXQoXG4gIHVybE9iamVjdDogc3RyaW5nIHwgVVJMIHwgVXJsLFxuICBvcHRpb25zPzoge1xuICAgIGF1dGg6IGJvb2xlYW47XG4gICAgZnJhZ21lbnQ6IGJvb2xlYW47XG4gICAgc2VhcmNoOiBib29sZWFuO1xuICAgIHVuaWNvZGU6IGJvb2xlYW47XG4gIH0sXG4pOiBzdHJpbmcge1xuICBpZiAodXJsT2JqZWN0IGluc3RhbmNlb2YgVVJMKSB7XG4gICAgcmV0dXJuIGZvcm1hdFdoYXR3Zyh1cmxPYmplY3QsIG9wdGlvbnMpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiB1cmxPYmplY3QgPT09IFwic3RyaW5nXCIpIHtcbiAgICB1cmxPYmplY3QgPSBwYXJzZSh1cmxPYmplY3QsIHRydWUsIGZhbHNlKTtcbiAgfVxuICByZXR1cm4gdXJsT2JqZWN0LmZvcm1hdCgpO1xufVxuXG4vKipcbiAqIFRoZSBVUkwgb2JqZWN0IGhhcyBib3RoIGEgYHRvU3RyaW5nKClgIG1ldGhvZCBhbmQgYGhyZWZgIHByb3BlcnR5IHRoYXQgcmV0dXJuIHN0cmluZyBzZXJpYWxpemF0aW9ucyBvZiB0aGUgVVJMLlxuICogVGhlc2UgYXJlIG5vdCwgaG93ZXZlciwgY3VzdG9taXphYmxlIGluIGFueSB3YXkuXG4gKiBUaGlzIG1ldGhvZCBhbGxvd3MgZm9yIGJhc2ljIGN1c3RvbWl6YXRpb24gb2YgdGhlIG91dHB1dC5cbiAqIEBzZWUgVGVzdGVkIGluIGBwYXJhbGxlbC90ZXN0LXVybC1mb3JtYXQtd2hhdHdnLmpzYC5cbiAqIEBwYXJhbSB1cmxPYmplY3RcbiAqIEBwYXJhbSBvcHRpb25zXG4gKiBAcGFyYW0gb3B0aW9ucy5hdXRoIGB0cnVlYCBpZiB0aGUgc2VyaWFsaXplZCBVUkwgc3RyaW5nIHNob3VsZCBpbmNsdWRlIHRoZSB1c2VybmFtZSBhbmQgcGFzc3dvcmQsIGBmYWxzZWAgb3RoZXJ3aXNlLiAqKkRlZmF1bHQqKjogYHRydWVgLlxuICogQHBhcmFtIG9wdGlvbnMuZnJhZ21lbnQgYHRydWVgIGlmIHRoZSBzZXJpYWxpemVkIFVSTCBzdHJpbmcgc2hvdWxkIGluY2x1ZGUgdGhlIGZyYWdtZW50LCBgZmFsc2VgIG90aGVyd2lzZS4gKipEZWZhdWx0Kio6IGB0cnVlYC5cbiAqIEBwYXJhbSBvcHRpb25zLnNlYXJjaCBgdHJ1ZWAgaWYgdGhlIHNlcmlhbGl6ZWQgVVJMIHN0cmluZyBzaG91bGQgaW5jbHVkZSB0aGUgc2VhcmNoIHF1ZXJ5LCAqKkRlZmF1bHQqKjogYHRydWVgLlxuICogQHBhcmFtIG9wdGlvbnMudW5pY29kZSBgdHJ1ZWAgaWYgVW5pY29kZSBjaGFyYWN0ZXJzIGFwcGVhcmluZyBpbiB0aGUgaG9zdCBjb21wb25lbnQgb2YgdGhlIFVSTCBzdHJpbmcgc2hvdWxkIGJlIGVuY29kZWQgZGlyZWN0bHkgYXMgb3Bwb3NlZCB0byBiZWluZyBQdW55Y29kZSBlbmNvZGVkLiAqKkRlZmF1bHQqKjogYGZhbHNlYC5cbiAqIEByZXR1cm5zIGEgY3VzdG9taXphYmxlIHNlcmlhbGl6YXRpb24gb2YgYSBVUkwgYFN0cmluZ2AgcmVwcmVzZW50YXRpb24gb2YgYSBgV0hBVFdHIFVSTGAgb2JqZWN0LlxuICovXG5mdW5jdGlvbiBmb3JtYXRXaGF0d2coXG4gIHVybE9iamVjdDogc3RyaW5nIHwgVVJMLFxuICBvcHRpb25zPzoge1xuICAgIGF1dGg6IGJvb2xlYW47XG4gICAgZnJhZ21lbnQ6IGJvb2xlYW47XG4gICAgc2VhcmNoOiBib29sZWFuO1xuICAgIHVuaWNvZGU6IGJvb2xlYW47XG4gIH0sXG4pOiBzdHJpbmcge1xuICBpZiAodHlwZW9mIHVybE9iamVjdCA9PT0gXCJzdHJpbmdcIikge1xuICAgIHVybE9iamVjdCA9IG5ldyBVUkwodXJsT2JqZWN0KTtcbiAgfVxuICBpZiAob3B0aW9ucykge1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gXCJvYmplY3RcIikge1xuICAgICAgdGhyb3cgbmV3IEVSUl9JTlZBTElEX0FSR19UWVBFKFwib3B0aW9uc1wiLCBcIm9iamVjdFwiLCBvcHRpb25zKTtcbiAgICB9XG4gIH1cblxuICBvcHRpb25zID0ge1xuICAgIGF1dGg6IHRydWUsXG4gICAgZnJhZ21lbnQ6IHRydWUsXG4gICAgc2VhcmNoOiB0cnVlLFxuICAgIHVuaWNvZGU6IGZhbHNlLFxuICAgIC4uLm9wdGlvbnMsXG4gIH07XG5cbiAgbGV0IHJldCA9IHVybE9iamVjdC5wcm90b2NvbDtcbiAgaWYgKHVybE9iamVjdC5ob3N0ICE9PSBudWxsKSB7XG4gICAgcmV0ICs9IFwiLy9cIjtcbiAgICBjb25zdCBoYXNVc2VybmFtZSA9ICEhdXJsT2JqZWN0LnVzZXJuYW1lO1xuICAgIGNvbnN0IGhhc1Bhc3N3b3JkID0gISF1cmxPYmplY3QucGFzc3dvcmQ7XG4gICAgaWYgKG9wdGlvbnMuYXV0aCAmJiAoaGFzVXNlcm5hbWUgfHwgaGFzUGFzc3dvcmQpKSB7XG4gICAgICBpZiAoaGFzVXNlcm5hbWUpIHtcbiAgICAgICAgcmV0ICs9IHVybE9iamVjdC51c2VybmFtZTtcbiAgICAgIH1cbiAgICAgIGlmIChoYXNQYXNzd29yZCkge1xuICAgICAgICByZXQgKz0gYDoke3VybE9iamVjdC5wYXNzd29yZH1gO1xuICAgICAgfVxuICAgICAgcmV0ICs9IFwiQFwiO1xuICAgIH1cbiAgICAvLyBUT0RPKHdhZnV3ZnUxMyk6IFN1cHBvcnQgdW5pY29kZSBvcHRpb25cbiAgICAvLyByZXQgKz0gb3B0aW9ucy51bmljb2RlID9cbiAgICAvLyAgIGRvbWFpblRvVW5pY29kZSh1cmxPYmplY3QuaG9zdCkgOiB1cmxPYmplY3QuaG9zdDtcbiAgICByZXQgKz0gdXJsT2JqZWN0Lmhvc3Q7XG4gICAgaWYgKHVybE9iamVjdC5wb3J0KSB7XG4gICAgICByZXQgKz0gYDoke3VybE9iamVjdC5wb3J0fWA7XG4gICAgfVxuICB9XG5cbiAgcmV0ICs9IHVybE9iamVjdC5wYXRobmFtZTtcblxuICBpZiAob3B0aW9ucy5zZWFyY2ggJiYgdXJsT2JqZWN0LnNlYXJjaCkge1xuICAgIHJldCArPSB1cmxPYmplY3Quc2VhcmNoO1xuICB9XG4gIGlmIChvcHRpb25zLmZyYWdtZW50ICYmIHVybE9iamVjdC5oYXNoKSB7XG4gICAgcmV0ICs9IHVybE9iamVjdC5oYXNoO1xuICB9XG5cbiAgcmV0dXJuIHJldDtcbn1cblxuZnVuY3Rpb24gaXNJcHY2SG9zdG5hbWUoaG9zdG5hbWU6IHN0cmluZykge1xuICByZXR1cm4gKFxuICAgIGhvc3RuYW1lLmNoYXJDb2RlQXQoMCkgPT09IENIQVJfTEVGVF9TUVVBUkVfQlJBQ0tFVCAmJlxuICAgIGhvc3RuYW1lLmNoYXJDb2RlQXQoaG9zdG5hbWUubGVuZ3RoIC0gMSkgPT09IENIQVJfUklHSFRfU1FVQVJFX0JSQUNLRVRcbiAgKTtcbn1cblxuZnVuY3Rpb24gZ2V0SG9zdG5hbWUoc2VsZjogVXJsLCByZXN0OiBzdHJpbmcsIGhvc3RuYW1lOiBzdHJpbmcpIHtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBob3N0bmFtZS5sZW5ndGg7ICsraSkge1xuICAgIGNvbnN0IGNvZGUgPSBob3N0bmFtZS5jaGFyQ29kZUF0KGkpO1xuICAgIGNvbnN0IGlzVmFsaWQgPSAoY29kZSA+PSBDSEFSX0xPV0VSQ0FTRV9BICYmIGNvZGUgPD0gQ0hBUl9MT1dFUkNBU0VfWikgfHxcbiAgICAgIGNvZGUgPT09IENIQVJfRE9UIHx8XG4gICAgICAoY29kZSA+PSBDSEFSX1VQUEVSQ0FTRV9BICYmIGNvZGUgPD0gQ0hBUl9VUFBFUkNBU0VfWikgfHxcbiAgICAgIChjb2RlID49IENIQVJfMCAmJiBjb2RlIDw9IENIQVJfOSkgfHxcbiAgICAgIGNvZGUgPT09IENIQVJfSFlQSEVOX01JTlVTIHx8XG4gICAgICBjb2RlID09PSBDSEFSX1BMVVMgfHxcbiAgICAgIGNvZGUgPT09IENIQVJfVU5ERVJTQ09SRSB8fFxuICAgICAgY29kZSA+IDEyNztcblxuICAgIC8vIEludmFsaWQgaG9zdCBjaGFyYWN0ZXJcbiAgICBpZiAoIWlzVmFsaWQpIHtcbiAgICAgIHNlbGYuaG9zdG5hbWUgPSBob3N0bmFtZS5zbGljZSgwLCBpKTtcbiAgICAgIHJldHVybiBgLyR7aG9zdG5hbWUuc2xpY2UoaSl9JHtyZXN0fWA7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN0O1xufVxuXG4vLyBFc2NhcGVkIGNoYXJhY3RlcnMuIFVzZSBlbXB0eSBzdHJpbmdzIHRvIGZpbGwgdXAgdW51c2VkIGVudHJpZXMuXG4vLyBVc2luZyBBcnJheSBpcyBmYXN0ZXIgdGhhbiBPYmplY3QvTWFwXG4vLyBkZW5vLWZtdC1pZ25vcmVcbmNvbnN0IGVzY2FwZWRDb2RlcyA9IFtcbiAgLyogMCAtIDkgKi8gXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCIlMDlcIixcbiAgLyogMTAgLSAxOSAqLyBcIiUwQVwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIiUwRFwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICAvKiAyMCAtIDI5ICovIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIC8qIDMwIC0gMzkgKi8gXCJcIixcbiAgXCJcIixcbiAgXCIlMjBcIixcbiAgXCJcIixcbiAgXCIlMjJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCIlMjdcIixcbiAgLyogNDAgLSA0OSAqLyBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICAvKiA1MCAtIDU5ICovIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIC8qIDYwIC0gNjkgKi8gXCIlM0NcIixcbiAgXCJcIixcbiAgXCIlM0VcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgLyogNzAgLSA3OSAqLyBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICAvKiA4MCAtIDg5ICovIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIC8qIDkwIC0gOTkgKi8gXCJcIixcbiAgXCJcIixcbiAgXCIlNUNcIixcbiAgXCJcIixcbiAgXCIlNUVcIixcbiAgXCJcIixcbiAgXCIlNjBcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgLyogMTAwIC0gMTA5ICovIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIFwiXCIsXG4gIC8qIDExMCAtIDExOSAqLyBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICBcIlwiLFxuICAvKiAxMjAgLSAxMjUgKi8gXCJcIixcbiAgXCJcIixcbiAgXCJcIixcbiAgXCIlN0JcIixcbiAgXCIlN0NcIixcbiAgXCIlN0RcIlxuXTtcblxuLy8gQXV0b21hdGljYWxseSBlc2NhcGUgYWxsIGRlbGltaXRlcnMgYW5kIHVud2lzZSBjaGFyYWN0ZXJzIGZyb20gUkZDIDIzOTYuXG4vLyBBbHNvIGVzY2FwZSBzaW5nbGUgcXVvdGVzIGluIGNhc2Ugb2YgYW4gWFNTIGF0dGFjay5cbi8vIFJldHVybiB0aGUgZXNjYXBlZCBzdHJpbmcuXG5mdW5jdGlvbiBhdXRvRXNjYXBlU3RyKHJlc3Q6IHN0cmluZykge1xuICBsZXQgZXNjYXBlZCA9IFwiXCI7XG4gIGxldCBsYXN0RXNjYXBlZFBvcyA9IDA7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcmVzdC5sZW5ndGg7ICsraSkge1xuICAgIC8vIGBlc2NhcGVkYCBjb250YWlucyBzdWJzdHJpbmcgdXAgdG8gdGhlIGxhc3QgZXNjYXBlZCBjaGFyYWN0ZXIuXG4gICAgY29uc3QgZXNjYXBlZENoYXIgPSBlc2NhcGVkQ29kZXNbcmVzdC5jaGFyQ29kZUF0KGkpXTtcbiAgICBpZiAoZXNjYXBlZENoYXIpIHtcbiAgICAgIC8vIENvbmNhdCBpZiB0aGVyZSBhcmUgb3JkaW5hcnkgY2hhcmFjdGVycyBpbiB0aGUgbWlkZGxlLlxuICAgICAgaWYgKGkgPiBsYXN0RXNjYXBlZFBvcykge1xuICAgICAgICBlc2NhcGVkICs9IHJlc3Quc2xpY2UobGFzdEVzY2FwZWRQb3MsIGkpO1xuICAgICAgfVxuICAgICAgZXNjYXBlZCArPSBlc2NhcGVkQ2hhcjtcbiAgICAgIGxhc3RFc2NhcGVkUG9zID0gaSArIDE7XG4gICAgfVxuICB9XG4gIGlmIChsYXN0RXNjYXBlZFBvcyA9PT0gMCkge1xuICAgIC8vIE5vdGhpbmcgaGFzIGJlZW4gZXNjYXBlZC5cbiAgICByZXR1cm4gcmVzdDtcbiAgfVxuXG4gIC8vIFRoZXJlIGFyZSBvcmRpbmFyeSBjaGFyYWN0ZXJzIGF0IHRoZSBlbmQuXG4gIGlmIChsYXN0RXNjYXBlZFBvcyA8IHJlc3QubGVuZ3RoKSB7XG4gICAgZXNjYXBlZCArPSByZXN0LnNsaWNlKGxhc3RFc2NhcGVkUG9zKTtcbiAgfVxuXG4gIHJldHVybiBlc2NhcGVkO1xufVxuXG4vKipcbiAqIFRoZSB1cmwudXJsUGFyc2UoKSBtZXRob2QgdGFrZXMgYSBVUkwgc3RyaW5nLCBwYXJzZXMgaXQsIGFuZCByZXR1cm5zIGEgVVJMIG9iamVjdC5cbiAqXG4gKiBAc2VlIFRlc3RlZCBpbiBgcGFyYWxsZWwvdGVzdC11cmwtcGFyc2UtZm9ybWF0LmpzYC5cbiAqIEBwYXJhbSB1cmwgVGhlIFVSTCBzdHJpbmcgdG8gcGFyc2UuXG4gKiBAcGFyYW0gcGFyc2VRdWVyeVN0cmluZyBJZiBgdHJ1ZWAsIHRoZSBxdWVyeSBwcm9wZXJ0eSB3aWxsIGFsd2F5cyBiZSBzZXQgdG8gYW4gb2JqZWN0IHJldHVybmVkIGJ5IHRoZSBxdWVyeXN0cmluZyBtb2R1bGUncyBwYXJzZSgpIG1ldGhvZC4gSWYgZmFsc2UsXG4gKiB0aGUgcXVlcnkgcHJvcGVydHkgb24gdGhlIHJldHVybmVkIFVSTCBvYmplY3Qgd2lsbCBiZSBhbiB1bnBhcnNlZCwgdW5kZWNvZGVkIHN0cmluZy4gRGVmYXVsdDogZmFsc2UuXG4gKiBAcGFyYW0gc2xhc2hlc0Rlbm90ZUhvc3QgSWYgYHRydWVgLCB0aGUgZmlyc3QgdG9rZW4gYWZ0ZXIgdGhlIGxpdGVyYWwgc3RyaW5nIC8vIGFuZCBwcmVjZWRpbmcgdGhlIG5leHQgLyB3aWxsIGJlIGludGVycHJldGVkIGFzIHRoZSBob3N0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZShcbiAgdXJsOiBzdHJpbmcgfCBVcmwsXG4gIHBhcnNlUXVlcnlTdHJpbmc6IGJvb2xlYW4sXG4gIHNsYXNoZXNEZW5vdGVIb3N0OiBib29sZWFuLFxuKSB7XG4gIGlmICh1cmwgaW5zdGFuY2VvZiBVcmwpIHJldHVybiB1cmw7XG5cbiAgY29uc3QgdXJsT2JqZWN0ID0gbmV3IFVybCgpO1xuICB1cmxPYmplY3QudXJsUGFyc2UodXJsLCBwYXJzZVF1ZXJ5U3RyaW5nLCBzbGFzaGVzRGVub3RlSG9zdCk7XG4gIHJldHVybiB1cmxPYmplY3Q7XG59XG5cbi8qKiBUaGUgdXJsLnJlc29sdmUoKSBtZXRob2QgcmVzb2x2ZXMgYSB0YXJnZXQgVVJMIHJlbGF0aXZlIHRvIGEgYmFzZSBVUkwgaW4gYSBtYW5uZXIgc2ltaWxhciB0byB0aGF0IG9mIGEgV2ViIGJyb3dzZXIgcmVzb2x2aW5nIGFuIGFuY2hvciB0YWcgSFJFRi5cbiAqIEBzZWUgaHR0cHM6Ly9ub2RlanMub3JnL2FwaS91cmwuaHRtbCN1cmxyZXNvbHZlZnJvbS10b1xuICogQGxlZ2FjeVxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZShmcm9tOiBzdHJpbmcsIHRvOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHBhcnNlKGZyb20sIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHRvKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVPYmplY3Qoc291cmNlOiBzdHJpbmcgfCBVcmwsIHJlbGF0aXZlOiBzdHJpbmcpIHtcbiAgaWYgKCFzb3VyY2UpIHJldHVybiByZWxhdGl2ZTtcbiAgcmV0dXJuIHBhcnNlKHNvdXJjZSwgZmFsc2UsIHRydWUpLnJlc29sdmVPYmplY3QocmVsYXRpdmUpO1xufVxuXG4vKipcbiAqIFRoaXMgZnVuY3Rpb24gZW5zdXJlcyB0aGUgY29ycmVjdCBkZWNvZGluZ3Mgb2YgcGVyY2VudC1lbmNvZGVkIGNoYXJhY3RlcnMgYXMgd2VsbCBhcyBlbnN1cmluZyBhIGNyb3NzLXBsYXRmb3JtIHZhbGlkIGFic29sdXRlIHBhdGggc3RyaW5nLlxuICogQHNlZSBUZXN0ZWQgaW4gYHBhcmFsbGVsL3Rlc3QtZmlsZXVybHRvcGF0aC5qc2AuXG4gKiBAcGFyYW0gcGF0aCBUaGUgZmlsZSBVUkwgc3RyaW5nIG9yIFVSTCBvYmplY3QgdG8gY29udmVydCB0byBhIHBhdGguXG4gKiBAcmV0dXJucyBUaGUgZnVsbHktcmVzb2x2ZWQgcGxhdGZvcm0tc3BlY2lmaWMgTm9kZS5qcyBmaWxlIHBhdGguXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWxlVVJMVG9QYXRoKHBhdGg6IHN0cmluZyB8IFVSTCk6IHN0cmluZyB7XG4gIGlmICh0eXBlb2YgcGF0aCA9PT0gXCJzdHJpbmdcIikgcGF0aCA9IG5ldyBVUkwocGF0aCk7XG4gIGVsc2UgaWYgKCEocGF0aCBpbnN0YW5jZW9mIFVSTCkpIHtcbiAgICB0aHJvdyBuZXcgRVJSX0lOVkFMSURfQVJHX1RZUEUoXCJwYXRoXCIsIFtcInN0cmluZ1wiLCBcIlVSTFwiXSwgcGF0aCk7XG4gIH1cbiAgaWYgKHBhdGgucHJvdG9jb2wgIT09IFwiZmlsZTpcIikge1xuICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9VUkxfU0NIRU1FKFwiZmlsZVwiKTtcbiAgfVxuICByZXR1cm4gaXNXaW5kb3dzID8gZ2V0UGF0aEZyb21VUkxXaW4ocGF0aCkgOiBnZXRQYXRoRnJvbVVSTFBvc2l4KHBhdGgpO1xufVxuXG5mdW5jdGlvbiBnZXRQYXRoRnJvbVVSTFdpbih1cmw6IFVSTCk6IHN0cmluZyB7XG4gIGNvbnN0IGhvc3RuYW1lID0gdXJsLmhvc3RuYW1lO1xuICBsZXQgcGF0aG5hbWUgPSB1cmwucGF0aG5hbWU7XG4gIGZvciAobGV0IG4gPSAwOyBuIDwgcGF0aG5hbWUubGVuZ3RoOyBuKyspIHtcbiAgICBpZiAocGF0aG5hbWVbbl0gPT09IFwiJVwiKSB7XG4gICAgICBjb25zdCB0aGlyZCA9IHBhdGhuYW1lLmNvZGVQb2ludEF0KG4gKyAyKSEgfCAweDIwO1xuICAgICAgaWYgKFxuICAgICAgICAocGF0aG5hbWVbbiArIDFdID09PSBcIjJcIiAmJiB0aGlyZCA9PT0gMTAyKSB8fCAvLyAyZiAyRiAvXG4gICAgICAgIChwYXRobmFtZVtuICsgMV0gPT09IFwiNVwiICYmIHRoaXJkID09PSA5OSkgLy8gNWMgNUMgXFxcbiAgICAgICkge1xuICAgICAgICB0aHJvdyBuZXcgRVJSX0lOVkFMSURfRklMRV9VUkxfUEFUSChcbiAgICAgICAgICBcIm11c3Qgbm90IGluY2x1ZGUgZW5jb2RlZCBcXFxcIG9yIC8gY2hhcmFjdGVyc1wiLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHBhdGhuYW1lID0gcGF0aG5hbWUucmVwbGFjZShmb3J3YXJkU2xhc2hSZWdFeCwgXCJcXFxcXCIpO1xuICBwYXRobmFtZSA9IGRlY29kZVVSSUNvbXBvbmVudChwYXRobmFtZSk7XG4gIGlmIChob3N0bmFtZSAhPT0gXCJcIikge1xuICAgIC8vIFRPRE8oYmFydGxvbWllanUpOiBhZGQgc3VwcG9ydCBmb3IgcHVueWNvZGUgZW5jb2RpbmdzXG4gICAgcmV0dXJuIGBcXFxcXFxcXCR7aG9zdG5hbWV9JHtwYXRobmFtZX1gO1xuICB9IGVsc2Uge1xuICAgIC8vIE90aGVyd2lzZSwgaXQncyBhIGxvY2FsIHBhdGggdGhhdCByZXF1aXJlcyBhIGRyaXZlIGxldHRlclxuICAgIGNvbnN0IGxldHRlciA9IHBhdGhuYW1lLmNvZGVQb2ludEF0KDEpISB8IDB4MjA7XG4gICAgY29uc3Qgc2VwID0gcGF0aG5hbWVbMl07XG4gICAgaWYgKFxuICAgICAgbGV0dGVyIDwgQ0hBUl9MT1dFUkNBU0VfQSB8fFxuICAgICAgbGV0dGVyID4gQ0hBUl9MT1dFUkNBU0VfWiB8fCAvLyBhLi56IEEuLlpcbiAgICAgIHNlcCAhPT0gXCI6XCJcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9GSUxFX1VSTF9QQVRIKFwibXVzdCBiZSBhYnNvbHV0ZVwiKTtcbiAgICB9XG4gICAgcmV0dXJuIHBhdGhuYW1lLnNsaWNlKDEpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldFBhdGhGcm9tVVJMUG9zaXgodXJsOiBVUkwpOiBzdHJpbmcge1xuICBpZiAodXJsLmhvc3RuYW1lICE9PSBcIlwiKSB7XG4gICAgdGhyb3cgbmV3IEVSUl9JTlZBTElEX0ZJTEVfVVJMX0hPU1Qob3NUeXBlKTtcbiAgfVxuICBjb25zdCBwYXRobmFtZSA9IHVybC5wYXRobmFtZTtcbiAgZm9yIChsZXQgbiA9IDA7IG4gPCBwYXRobmFtZS5sZW5ndGg7IG4rKykge1xuICAgIGlmIChwYXRobmFtZVtuXSA9PT0gXCIlXCIpIHtcbiAgICAgIGNvbnN0IHRoaXJkID0gcGF0aG5hbWUuY29kZVBvaW50QXQobiArIDIpISB8IDB4MjA7XG4gICAgICBpZiAocGF0aG5hbWVbbiArIDFdID09PSBcIjJcIiAmJiB0aGlyZCA9PT0gMTAyKSB7XG4gICAgICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9GSUxFX1VSTF9QQVRIKFxuICAgICAgICAgIFwibXVzdCBub3QgaW5jbHVkZSBlbmNvZGVkIC8gY2hhcmFjdGVyc1wiLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHBhdGhuYW1lKTtcbn1cblxuLyoqXG4gKiAgVGhlIGZvbGxvd2luZyBjaGFyYWN0ZXJzIGFyZSBwZXJjZW50LWVuY29kZWQgd2hlbiBjb252ZXJ0aW5nIGZyb20gZmlsZSBwYXRoXG4gKiAgdG8gVVJMOlxuICogIC0gJTogVGhlIHBlcmNlbnQgY2hhcmFjdGVyIGlzIHRoZSBvbmx5IGNoYXJhY3RlciBub3QgZW5jb2RlZCBieSB0aGVcbiAqICAgICAgIGBwYXRobmFtZWAgc2V0dGVyLlxuICogIC0gXFw6IEJhY2tzbGFzaCBpcyBlbmNvZGVkIG9uIG5vbi13aW5kb3dzIHBsYXRmb3JtcyBzaW5jZSBpdCdzIGEgdmFsaWRcbiAqICAgICAgIGNoYXJhY3RlciBidXQgdGhlIGBwYXRobmFtZWAgc2V0dGVycyByZXBsYWNlcyBpdCBieSBhIGZvcndhcmQgc2xhc2guXG4gKiAgLSBMRjogVGhlIG5ld2xpbmUgY2hhcmFjdGVyIGlzIHN0cmlwcGVkIG91dCBieSB0aGUgYHBhdGhuYW1lYCBzZXR0ZXIuXG4gKiAgICAgICAgKFNlZSB3aGF0d2cvdXJsIzQxOSlcbiAqICAtIENSOiBUaGUgY2FycmlhZ2UgcmV0dXJuIGNoYXJhY3RlciBpcyBhbHNvIHN0cmlwcGVkIG91dCBieSB0aGUgYHBhdGhuYW1lYFxuICogICAgICAgIHNldHRlci5cbiAqICAtIFRBQjogVGhlIHRhYiBjaGFyYWN0ZXIgaXMgYWxzbyBzdHJpcHBlZCBvdXQgYnkgdGhlIGBwYXRobmFtZWAgc2V0dGVyLlxuICovXG5mdW5jdGlvbiBlbmNvZGVQYXRoQ2hhcnMoZmlsZXBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmIChmaWxlcGF0aC5pbmNsdWRlcyhcIiVcIikpIHtcbiAgICBmaWxlcGF0aCA9IGZpbGVwYXRoLnJlcGxhY2UocGVyY2VudFJlZ0V4LCBcIiUyNVwiKTtcbiAgfVxuICAvLyBJbiBwb3NpeCwgYmFja3NsYXNoIGlzIGEgdmFsaWQgY2hhcmFjdGVyIGluIHBhdGhzOlxuICBpZiAoIWlzV2luZG93cyAmJiBmaWxlcGF0aC5pbmNsdWRlcyhcIlxcXFxcIikpIHtcbiAgICBmaWxlcGF0aCA9IGZpbGVwYXRoLnJlcGxhY2UoYmFja3NsYXNoUmVnRXgsIFwiJTVDXCIpO1xuICB9XG4gIGlmIChmaWxlcGF0aC5pbmNsdWRlcyhcIlxcblwiKSkge1xuICAgIGZpbGVwYXRoID0gZmlsZXBhdGgucmVwbGFjZShuZXdsaW5lUmVnRXgsIFwiJTBBXCIpO1xuICB9XG4gIGlmIChmaWxlcGF0aC5pbmNsdWRlcyhcIlxcclwiKSkge1xuICAgIGZpbGVwYXRoID0gZmlsZXBhdGgucmVwbGFjZShjYXJyaWFnZVJldHVyblJlZ0V4LCBcIiUwRFwiKTtcbiAgfVxuICBpZiAoZmlsZXBhdGguaW5jbHVkZXMoXCJcXHRcIikpIHtcbiAgICBmaWxlcGF0aCA9IGZpbGVwYXRoLnJlcGxhY2UodGFiUmVnRXgsIFwiJTA5XCIpO1xuICB9XG4gIHJldHVybiBmaWxlcGF0aDtcbn1cblxuLyoqXG4gKiBUaGlzIGZ1bmN0aW9uIGVuc3VyZXMgdGhhdCBgZmlsZXBhdGhgIGlzIHJlc29sdmVkIGFic29sdXRlbHksIGFuZCB0aGF0IHRoZSBVUkwgY29udHJvbCBjaGFyYWN0ZXJzIGFyZSBjb3JyZWN0bHkgZW5jb2RlZCB3aGVuIGNvbnZlcnRpbmcgaW50byBhIEZpbGUgVVJMLlxuICogQHNlZSBUZXN0ZWQgaW4gYHBhcmFsbGVsL3Rlc3QtdXJsLXBhdGh0b2ZpbGV1cmwuanNgLlxuICogQHBhcmFtIGZpbGVwYXRoIFRoZSBmaWxlIHBhdGggc3RyaW5nIHRvIGNvbnZlcnQgdG8gYSBmaWxlIFVSTC5cbiAqIEByZXR1cm5zIFRoZSBmaWxlIFVSTCBvYmplY3QuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXRoVG9GaWxlVVJMKGZpbGVwYXRoOiBzdHJpbmcpOiBVUkwge1xuICBjb25zdCBvdXRVUkwgPSBuZXcgVVJMKFwiZmlsZTovL1wiKTtcbiAgaWYgKGlzV2luZG93cyAmJiBmaWxlcGF0aC5zdGFydHNXaXRoKFwiXFxcXFxcXFxcIikpIHtcbiAgICAvLyBVTkMgcGF0aCBmb3JtYXQ6IFxcXFxzZXJ2ZXJcXHNoYXJlXFxyZXNvdXJjZVxuICAgIGNvbnN0IHBhdGhzID0gZmlsZXBhdGguc3BsaXQoXCJcXFxcXCIpO1xuICAgIGlmIChwYXRocy5sZW5ndGggPD0gMykge1xuICAgICAgdGhyb3cgbmV3IEVSUl9JTlZBTElEX0FSR19WQUxVRShcbiAgICAgICAgXCJmaWxlcGF0aFwiLFxuICAgICAgICBmaWxlcGF0aCxcbiAgICAgICAgXCJNaXNzaW5nIFVOQyByZXNvdXJjZSBwYXRoXCIsXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCBob3N0bmFtZSA9IHBhdGhzWzJdO1xuICAgIGlmIChob3N0bmFtZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFUlJfSU5WQUxJRF9BUkdfVkFMVUUoXG4gICAgICAgIFwiZmlsZXBhdGhcIixcbiAgICAgICAgZmlsZXBhdGgsXG4gICAgICAgIFwiRW1wdHkgVU5DIHNlcnZlcm5hbWVcIixcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gVE9ETyh3YWZ1d2FmdTEzKTogVG8gYmUgYG91dFVSTC5ob3N0bmFtZSA9IGRvbWFpblRvQVNDSUkoaG9zdG5hbWUpYCBvbmNlIGBkb21haW5Ub0FTQ0lJYCBhcmUgaW1wbGVtZW50ZWRcbiAgICBvdXRVUkwuaG9zdG5hbWUgPSBob3N0bmFtZTtcbiAgICBvdXRVUkwucGF0aG5hbWUgPSBlbmNvZGVQYXRoQ2hhcnMocGF0aHMuc2xpY2UoMykuam9pbihcIi9cIikpO1xuICB9IGVsc2Uge1xuICAgIGxldCByZXNvbHZlZCA9IHBhdGgucmVzb2x2ZShmaWxlcGF0aCk7XG4gICAgLy8gcGF0aC5yZXNvbHZlIHN0cmlwcyB0cmFpbGluZyBzbGFzaGVzIHNvIHdlIG11c3QgYWRkIHRoZW0gYmFja1xuICAgIGNvbnN0IGZpbGVQYXRoTGFzdCA9IGZpbGVwYXRoLmNoYXJDb2RlQXQoZmlsZXBhdGgubGVuZ3RoIC0gMSk7XG4gICAgaWYgKFxuICAgICAgKGZpbGVQYXRoTGFzdCA9PT0gQ0hBUl9GT1JXQVJEX1NMQVNIIHx8XG4gICAgICAgIChpc1dpbmRvd3MgJiYgZmlsZVBhdGhMYXN0ID09PSBDSEFSX0JBQ0tXQVJEX1NMQVNIKSkgJiZcbiAgICAgIHJlc29sdmVkW3Jlc29sdmVkLmxlbmd0aCAtIDFdICE9PSBwYXRoLnNlcFxuICAgICkge1xuICAgICAgcmVzb2x2ZWQgKz0gXCIvXCI7XG4gICAgfVxuXG4gICAgb3V0VVJMLnBhdGhuYW1lID0gZW5jb2RlUGF0aENoYXJzKHJlc29sdmVkKTtcbiAgfVxuICByZXR1cm4gb3V0VVJMO1xufVxuXG5pbnRlcmZhY2UgSHR0cE9wdGlvbnMge1xuICBwcm90b2NvbDogc3RyaW5nO1xuICBob3N0bmFtZTogc3RyaW5nO1xuICBoYXNoOiBzdHJpbmc7XG4gIHNlYXJjaDogc3RyaW5nO1xuICBwYXRobmFtZTogc3RyaW5nO1xuICBwYXRoOiBzdHJpbmc7XG4gIGhyZWY6IHN0cmluZztcbiAgcG9ydD86IG51bWJlcjtcbiAgYXV0aD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBUaGlzIHV0aWxpdHkgZnVuY3Rpb24gY29udmVydHMgYSBVUkwgb2JqZWN0IGludG8gYW4gb3JkaW5hcnkgb3B0aW9ucyBvYmplY3QgYXMgZXhwZWN0ZWQgYnkgdGhlIGBodHRwLnJlcXVlc3QoKWAgYW5kIGBodHRwcy5yZXF1ZXN0KClgIEFQSXMuXG4gKiBAc2VlIFRlc3RlZCBpbiBgcGFyYWxsZWwvdGVzdC11cmwtdXJsdG9vcHRpb25zLmpzYC5cbiAqIEBwYXJhbSB1cmwgVGhlIGBXSEFUV0cgVVJMYCBvYmplY3QgdG8gY29udmVydCB0byBhbiBvcHRpb25zIG9iamVjdC5cbiAqIEByZXR1cm5zIEh0dHBPcHRpb25zXG4gKiBAcmV0dXJucyBIdHRwT3B0aW9ucy5wcm90b2NvbCBQcm90b2NvbCB0byB1c2UuXG4gKiBAcmV0dXJucyBIdHRwT3B0aW9ucy5ob3N0bmFtZSBBIGRvbWFpbiBuYW1lIG9yIElQIGFkZHJlc3Mgb2YgdGhlIHNlcnZlciB0byBpc3N1ZSB0aGUgcmVxdWVzdCB0by5cbiAqIEByZXR1cm5zIEh0dHBPcHRpb25zLmhhc2ggVGhlIGZyYWdtZW50IHBvcnRpb24gb2YgdGhlIFVSTC5cbiAqIEByZXR1cm5zIEh0dHBPcHRpb25zLnNlYXJjaCBUaGUgc2VyaWFsaXplZCBxdWVyeSBwb3J0aW9uIG9mIHRoZSBVUkwuXG4gKiBAcmV0dXJucyBIdHRwT3B0aW9ucy5wYXRobmFtZSBUaGUgcGF0aCBwb3J0aW9uIG9mIHRoZSBVUkwuXG4gKiBAcmV0dXJucyBIdHRwT3B0aW9ucy5wYXRoIFJlcXVlc3QgcGF0aC4gU2hvdWxkIGluY2x1ZGUgcXVlcnkgc3RyaW5nIGlmIGFueS4gRS5HLiBgJy9pbmRleC5odG1sP3BhZ2U9MTInYC4gQW4gZXhjZXB0aW9uIGlzIHRocm93biB3aGVuIHRoZSByZXF1ZXN0IHBhdGggY29udGFpbnMgaWxsZWdhbCBjaGFyYWN0ZXJzLiBDdXJyZW50bHksIG9ubHkgc3BhY2VzIGFyZSByZWplY3RlZCBidXQgdGhhdCBtYXkgY2hhbmdlIGluIHRoZSBmdXR1cmUuXG4gKiBAcmV0dXJucyBIdHRwT3B0aW9ucy5ocmVmIFRoZSBzZXJpYWxpemVkIFVSTC5cbiAqIEByZXR1cm5zIEh0dHBPcHRpb25zLnBvcnQgUG9ydCBvZiByZW1vdGUgc2VydmVyLlxuICogQHJldHVybnMgSHR0cE9wdGlvbnMuYXV0aCBCYXNpYyBhdXRoZW50aWNhdGlvbiBpLmUuIGAndXNlcjpwYXNzd29yZCdgIHRvIGNvbXB1dGUgYW4gQXV0aG9yaXphdGlvbiBoZWFkZXIuXG4gKi9cbmZ1bmN0aW9uIHVybFRvSHR0cE9wdGlvbnModXJsOiBVUkwpOiBIdHRwT3B0aW9ucyB7XG4gIGNvbnN0IG9wdGlvbnM6IEh0dHBPcHRpb25zID0ge1xuICAgIHByb3RvY29sOiB1cmwucHJvdG9jb2wsXG4gICAgaG9zdG5hbWU6IHR5cGVvZiB1cmwuaG9zdG5hbWUgPT09IFwic3RyaW5nXCIgJiYgdXJsLmhvc3RuYW1lLnN0YXJ0c1dpdGgoXCJbXCIpXG4gICAgICA/IHVybC5ob3N0bmFtZS5zbGljZSgxLCAtMSlcbiAgICAgIDogdXJsLmhvc3RuYW1lLFxuICAgIGhhc2g6IHVybC5oYXNoLFxuICAgIHNlYXJjaDogdXJsLnNlYXJjaCxcbiAgICBwYXRobmFtZTogdXJsLnBhdGhuYW1lLFxuICAgIHBhdGg6IGAke3VybC5wYXRobmFtZSB8fCBcIlwifSR7dXJsLnNlYXJjaCB8fCBcIlwifWAsXG4gICAgaHJlZjogdXJsLmhyZWYsXG4gIH07XG4gIGlmICh1cmwucG9ydCAhPT0gXCJcIikge1xuICAgIG9wdGlvbnMucG9ydCA9IE51bWJlcih1cmwucG9ydCk7XG4gIH1cbiAgaWYgKHVybC51c2VybmFtZSB8fCB1cmwucGFzc3dvcmQpIHtcbiAgICBvcHRpb25zLmF1dGggPSBgJHtkZWNvZGVVUklDb21wb25lbnQodXJsLnVzZXJuYW1lKX06JHtcbiAgICAgIGRlY29kZVVSSUNvbXBvbmVudChcbiAgICAgICAgdXJsLnBhc3N3b3JkLFxuICAgICAgKVxuICAgIH1gO1xuICB9XG4gIHJldHVybiBvcHRpb25zO1xufVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIHBhcnNlLFxuICBmb3JtYXQsXG4gIHJlc29sdmUsXG4gIHJlc29sdmVPYmplY3QsXG4gIGZpbGVVUkxUb1BhdGgsXG4gIHBhdGhUb0ZpbGVVUkwsXG4gIHVybFRvSHR0cE9wdGlvbnMsXG4gIFVybCxcbiAgVVJMLFxuICBVUkxTZWFyY2hQYXJhbXMsXG59O1xuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxzREFBc0Q7QUFDdEQsRUFBRTtBQUNGLDBFQUEwRTtBQUMxRSxnRUFBZ0U7QUFDaEUsc0VBQXNFO0FBQ3RFLHNFQUFzRTtBQUN0RSw0RUFBNEU7QUFDNUUscUVBQXFFO0FBQ3JFLHdCQUF3QjtBQUN4QixFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLHlEQUF5RDtBQUN6RCxFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLDZEQUE2RDtBQUM3RCw0RUFBNEU7QUFDNUUsMkVBQTJFO0FBQzNFLHdFQUF3RTtBQUN4RSw0RUFBNEU7QUFDNUUseUNBQXlDO0FBRXpDLFNBQ0Usb0JBQW9CLEVBQ3BCLHFCQUFxQixFQUNyQix5QkFBeUIsRUFDekIseUJBQXlCLEVBQ3pCLHNCQUFzQixRQUNqQixzQkFBc0IsQ0FBQztBQUM5QixTQUNFLE1BQU0s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LEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQzlDLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFDOUMsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUM5QyxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQzlDLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFDOUMsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFDO0FBQUUsS0FBQztBQUFFLEtBQUM7QUFBRSxLQUFD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QWEsQ0FBQyxFQUFFO0lBQ2hCLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLGFBQWEsQ0FBQyxFQUFFO0lBQ2hCLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLGFBQWEsQ0FBQyxLQUFLO0lBQ25CLEVBQUU7SUFDRixLQUFLO0lBQ0wsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLGFBQWEsQ0FBQyxFQUFFO0lBQ2hCLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLGFBQWEsQ0FBQyxFQUFFO0lBQ2hCLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLGFBQWEsQ0FBQyxFQUFFO0lBQ2hCLEVBQUU7SUFDRixLQUFLO0lBQ0wsRUFBRTtJQUNGLEtBQUs7SUFDTCxFQUFFO0lBQ0YsS0FBSztJQUNMLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLGVBQWUsQ0FBQyxFQUFFO0lBQ2xCLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLGVBQWUsQ0FBQyxFQUFFO0lBQ2xCLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLEVBQUU7SUFDRixFQUFFO0lBQ0YsRUFBRTtJQUNGLGVBQWUsQ0FBQyxFQUFF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