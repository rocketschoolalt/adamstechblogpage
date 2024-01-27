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
// Copyright Mathias Bynens <https://mathiasbynens.be/>
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// Adapted from https://github.com/mathiasbynens/punycode.js
// TODO(cmorten): migrate punycode logic to "icu" internal binding and/or "url"
// internal module so there can be re-use within the "url" module etc.
"use strict";
/** Highest positive signed 32-bit float value */ const maxInt = 2147483647; // aka. 0x7FFFFFFF or 2^31-1
/** Bootstring parameters */ const base = 36;
const tMin = 1;
const tMax = 26;
const skew = 38;
const damp = 700;
const initialBias = 72;
const initialN = 128; // 0x80
const delimiter = "-"; // '\x2D'
/** Regular expressions */ const regexPunycode = /^xn--/;
const regexNonASCII = /[^\0-\x7E]/; // non-ASCII chars
const regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g; // RFC 3490 separators
/** Error messages */ const errors = {
    "overflow": "Overflow: input needs wider integers to process",
    "not-basic": "Illegal input >= 0x80 (not a basic code point)",
    "invalid-input": "Invalid input"
};
/** Convenience shortcuts */ const baseMinusTMin = base - tMin;
const floor = Math.floor;
/**
 * A generic error utility function.
 *
 * @param type The error type.
 * @return Throws a `RangeError` with the applicable error message.
 */ function error(type) {
    throw new RangeError(errors[type]);
}
/**
 * A simple `Array#map`-like wrapper to work with domain name strings or email
 * addresses.
 *
 * @param domain The domain name or email address.
 * @param callback The function that gets called for every
 * character.
 * @return A new string of characters returned by the callback
 * function.
 */ function mapDomain(str, fn) {
    const parts = str.split("@");
    let result = "";
    if (parts.length > 1) {
        // In email addresses, only the domain name should be punycoded. Leave
        // the local part (i.e. everything up to `@`) intact.
        result = parts[0] + "@";
        str = parts[1];
    }
    // Avoid `split(regex)` for IE8 compatibility. See #17.
    str = str.replace(regexSeparators, "\x2E");
    const labels = str.split(".");
    const encoded = labels.map(fn).join(".");
    return result + encoded;
}
/**
 * Creates an array containing the numeric code points of each Unicode
 * character in the string. While JavaScript uses UCS-2 internally,
 * this function will convert a pair of surrogate halves (each of which
 * UCS-2 exposes as separate characters) into a single code point,
 * matching UTF-16.
 *
 * @param str The Unicode input string (UCS-2).
 * @return The new array of code points.
 */ function ucs2decode(str) {
    const output = [];
    let counter = 0;
    const length = str.length;
    while(counter < length){
        const value = str.charCodeAt(counter++);
        if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
            // It's a high surrogate, and there is a next character.
            const extra = str.charCodeAt(counter++);
            if ((extra & 0xFC00) == 0xDC00) {
                output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
            } else {
                // It's an unmatched surrogate; only append this code unit, in case the
                // next code unit is the high surrogate of a surrogate pair.
                output.push(value);
                counter--;
            }
        } else {
            output.push(value);
        }
    }
    return output;
}
/**
 * Creates a string based on an array of numeric code points.
 * @see `punycode.ucs2.decode`
 * @memberOf punycode.ucs2
 * @name encode
 * @param {Array} codePoints The array of numeric code points.
 * @returns {String} The new Unicode string (UCS-2).
 */ function ucs2encode(array) {
    return String.fromCodePoint(...array);
}
export const ucs2 = {
    decode: ucs2decode,
    encode: ucs2encode
};
/**
 * Converts a basic code point into a digit/integer.
 * @see `digitToBasic()`
 * @private
 * @param codePoint The basic numeric code point value.
 * @returns The numeric value of a basic code point (for use in
 * representing integers) in the range `0` to `base - 1`, or `base` if
 * the code point does not represent a value.
 */ function basicToDigit(codePoint) {
    if (codePoint - 0x30 < 0x0A) {
        return codePoint - 0x16;
    }
    if (codePoint - 0x41 < 0x1A) {
        return codePoint - 0x41;
    }
    if (codePoint - 0x61 < 0x1A) {
        return codePoint - 0x61;
    }
    return base;
}
/**
 * Converts a digit/integer into a basic code point.
 *
 * @param digit The numeric value of a basic code point.
 * @return The basic code point whose value (when used for
 * representing integers) is `digit`, which needs to be in the range
 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
 * used; else, the lowercase form is used. The behavior is undefined
 * if `flag` is non-zero and `digit` has no uppercase form.
 */ function digitToBasic(digit, flag) {
    //  0..25 map to ASCII a..z or A..Z
    // 26..35 map to ASCII 0..9
    return digit + 22 + 75 * Number(digit < 26) - (Number(flag != 0) << 5);
}
/**
 * Bias adaptation function as per section 3.4 of RFC 3492.
 * https://tools.ietf.org/html/rfc3492#section-3.4
 */ function adapt(delta, numPoints, firstTime) {
    let k = 0;
    delta = firstTime ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    for(; delta > baseMinusTMin * tMax >> 1; k += base){
        delta = Math.floor(delta / baseMinusTMin);
    }
    return Math.floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
}
/**
 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
 * symbols.
 * @memberOf punycode
 * @param input The Punycode string of ASCII-only symbols.
 * @returns The resulting string of Unicode symbols.
 */ export function decode(input) {
    // Don't use UCS-2.
    const output = [];
    const inputLength = input.length;
    let i = 0;
    let n = initialN;
    let bias = initialBias;
    // Handle the basic code points: let `basic` be the number of input code
    // points before the last delimiter, or `0` if there is none, then copy
    // the first basic code points to the output.
    let basic = input.lastIndexOf(delimiter);
    if (basic < 0) {
        basic = 0;
    }
    for(let j = 0; j < basic; ++j){
        // if it's not a basic code point
        if (input.charCodeAt(j) >= 0x80) {
            error("not-basic");
        }
        output.push(input.charCodeAt(j));
    }
    // Main decoding loop: start just after the last delimiter if any basic code
    // points were copied; start at the beginning otherwise.
    for(let index = basic > 0 ? basic + 1 : 0; index < inputLength;){
        // `index` is the index of the next character to be consumed.
        // Decode a generalized variable-length integer into `delta`,
        // which gets added to `i`. The overflow checking is easier
        // if we increase `i` as we go, then subtract off its starting
        // value at the end to obtain `delta`.
        const oldi = i;
        for(let w = 1, k = base;; k += base){
            if (index >= inputLength) {
                error("invalid-input");
            }
            const digit = basicToDigit(input.charCodeAt(index++));
            if (digit >= base || digit > floor((maxInt - i) / w)) {
                error("overflow");
            }
            i += digit * w;
            const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
            if (digit < t) {
                break;
            }
            const baseMinusT = base - t;
            if (w > floor(maxInt / baseMinusT)) {
                error("overflow");
            }
            w *= baseMinusT;
        }
        const out = output.length + 1;
        bias = adapt(i - oldi, out, oldi == 0);
        // `i` was supposed to wrap around from `out` to `0`,
        // incrementing `n` each time, so we'll fix that now:
        if (floor(i / out) > maxInt - n) {
            error("overflow");
        }
        n += floor(i / out);
        i %= out;
        // Insert `n` at position `i` of the output.
        output.splice(i++, 0, n);
    }
    return String.fromCodePoint(...output);
}
/**
 * Converts a string of Unicode symbols (e.g. a domain name label) to a
 * Punycode string of ASCII-only symbols.
 *
 * @param str The string of Unicode symbols.
 * @return The resulting Punycode string of ASCII-only symbols.
 */ export function encode(str) {
    const output = [];
    // Convert the input in UCS-2 to an array of Unicode code points.
    const input = ucs2decode(str);
    // Cache the length.
    const inputLength = input.length;
    // Initialize the state.
    let n = initialN;
    let delta = 0;
    let bias = initialBias;
    // Handle the basic code points.
    for (const currentValue of input){
        if (currentValue < 0x80) {
            output.push(String.fromCharCode(currentValue));
        }
    }
    const basicLength = output.length;
    let handledCPCount = basicLength;
    // `handledCPCount` is the number of code points that have been handled;
    // `basicLength` is the number of basic code points.
    // Finish the basic string with a delimiter unless it's empty.
    if (basicLength) {
        output.push(delimiter);
    }
    // Main encoding loop:
    while(handledCPCount < inputLength){
        // All non-basic code points < n have been handled already. Find the next
        // larger one:
        let m = maxInt;
        for (const currentValue1 of input){
            if (currentValue1 >= n && currentValue1 < m) {
                m = currentValue1;
            }
        }
        // Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
        // but guard against overflow.
        const handledCPCountPlusOne = handledCPCount + 1;
        if (m - n > Math.floor((maxInt - delta) / handledCPCountPlusOne)) {
            error("overflow");
        }
        delta += (m - n) * handledCPCountPlusOne;
        n = m;
        for (const currentValue2 of input){
            if (currentValue2 < n && ++delta > maxInt) {
                error("overflow");
            }
            if (currentValue2 == n) {
                // Represent delta as a generalized variable-length integer.
                let q = delta;
                for(let k = base;; k += base){
                    const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
                    if (q < t) {
                        break;
                    }
                    const qMinusT = q - t;
                    const baseMinusT = base - t;
                    output.push(String.fromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0)));
                    q = Math.floor(qMinusT / baseMinusT);
                }
                output.push(String.fromCharCode(digitToBasic(q, 0)));
                bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
                delta = 0;
                ++handledCPCount;
            }
        }
        ++delta;
        ++n;
    }
    return output.join("");
}
/**
 * Converts a Punycode string representing a domain name or an email address
 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
 * it doesn't matter if you call it on a string that has already been
 * converted to Unicode.
 * @memberOf punycode
 * @param {String} input The Punycoded domain name or email address to
 * convert to Unicode.
 * @returns {String} The Unicode representation of the given Punycode
 * string.
 */ export function toUnicode(input) {
    return mapDomain(input, function(string) {
        return regexPunycode.test(string) ? decode(string.slice(4).toLowerCase()) : string;
    });
}
/**
 * Converts a Unicode string representing a domain name or an email address to
 * Punycode. Only the non-ASCII parts of the domain name will be converted,
 * i.e. it doesn't matter if you call it with a domain that's already in
 * ASCII.
 *
 * @param input The domain name or email address to convert, as a
 * Unicode string.
 * @return The Punycode representation of the given domain name or
 * email address.
 */ export function toASCII(input) {
    return mapDomain(input, function(str) {
        return regexNonASCII.test(str) ? "xn--" + encode(str) : str;
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvaW50ZXJuYWwvaWRuYS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIENvcHlyaWdodCBNYXRoaWFzIEJ5bmVucyA8aHR0cHM6Ly9tYXRoaWFzYnluZW5zLmJlLz5cblxuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nXG4vLyBhIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvXG4vLyBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG9cbi8vIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmVcbi8vIGluY2x1ZGVkIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELFxuLy8gRVhQUkVTUyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORFxuLy8gTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRVxuLy8gTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTlxuLy8gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OXG4vLyBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gQWRhcHRlZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tYXRoaWFzYnluZW5zL3B1bnljb2RlLmpzXG5cbi8vIFRPRE8oY21vcnRlbik6IG1pZ3JhdGUgcHVueWNvZGUgbG9naWMgdG8gXCJpY3VcIiBpbnRlcm5hbCBiaW5kaW5nIGFuZC9vciBcInVybFwiXG4vLyBpbnRlcm5hbCBtb2R1bGUgc28gdGhlcmUgY2FuIGJlIHJlLXVzZSB3aXRoaW4gdGhlIFwidXJsXCIgbW9kdWxlIGV0Yy5cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbi8qKiBIaWdoZXN0IHBvc2l0aXZlIHNpZ25lZCAzMi1iaXQgZmxvYXQgdmFsdWUgKi9cbmNvbnN0IG1heEludCA9IDIxNDc0ODM2NDc7IC8vIGFrYS4gMHg3RkZGRkZGRiBvciAyXjMxLTFcblxuLyoqIEJvb3RzdHJpbmcgcGFyYW1ldGVycyAqL1xuY29uc3QgYmFzZSA9IDM2O1xuY29uc3QgdE1pbiA9IDE7XG5jb25zdCB0TWF4ID0gMjY7XG5jb25zdCBza2V3ID0gMzg7XG5jb25zdCBkYW1wID0gNzAwO1xuY29uc3QgaW5pdGlhbEJpYXMgPSA3MjtcbmNvbnN0IGluaXRpYWxOID0gMTI4OyAvLyAweDgwXG5jb25zdCBkZWxpbWl0ZXIgPSBcIi1cIjsgLy8gJ1xceDJEJ1xuXG4vKiogUmVndWxhciBleHByZXNzaW9ucyAqL1xuY29uc3QgcmVnZXhQdW55Y29kZSA9IC9eeG4tLS87XG5jb25zdCByZWdleE5vbkFTQ0lJID0gL1teXFwwLVxceDdFXS87IC8vIG5vbi1BU0NJSSBjaGFyc1xuY29uc3QgcmVnZXhTZXBhcmF0b3JzID0gL1tcXHgyRVxcdTMwMDJcXHVGRjBFXFx1RkY2MV0vZzsgLy8gUkZDIDM0OTAgc2VwYXJhdG9yc1xuXG4vKiogRXJyb3IgbWVzc2FnZXMgKi9cbmNvbnN0IGVycm9yczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgXCJvdmVyZmxvd1wiOiBcIk92ZXJmbG93OiBpbnB1dCBuZWVkcyB3aWRlciBpbnRlZ2VycyB0byBwcm9jZXNzXCIsXG4gIFwibm90LWJhc2ljXCI6IFwiSWxsZWdhbCBpbnB1dCA+PSAweDgwIChub3QgYSBiYXNpYyBjb2RlIHBvaW50KVwiLFxuICBcImludmFsaWQtaW5wdXRcIjogXCJJbnZhbGlkIGlucHV0XCIsXG59O1xuXG4vKiogQ29udmVuaWVuY2Ugc2hvcnRjdXRzICovXG5jb25zdCBiYXNlTWludXNUTWluID0gYmFzZSAtIHRNaW47XG5jb25zdCBmbG9vciA9IE1hdGguZmxvb3I7XG5cbi8qKlxuICogQSBnZW5lcmljIGVycm9yIHV0aWxpdHkgZnVuY3Rpb24uXG4gKlxuICogQHBhcmFtIHR5cGUgVGhlIGVycm9yIHR5cGUuXG4gKiBAcmV0dXJuIFRocm93cyBhIGBSYW5nZUVycm9yYCB3aXRoIHRoZSBhcHBsaWNhYmxlIGVycm9yIG1lc3NhZ2UuXG4gKi9cbmZ1bmN0aW9uIGVycm9yKHR5cGU6IHN0cmluZykge1xuICB0aHJvdyBuZXcgUmFuZ2VFcnJvcihlcnJvcnNbdHlwZV0pO1xufVxuXG4vKipcbiAqIEEgc2ltcGxlIGBBcnJheSNtYXBgLWxpa2Ugd3JhcHBlciB0byB3b3JrIHdpdGggZG9tYWluIG5hbWUgc3RyaW5ncyBvciBlbWFpbFxuICogYWRkcmVzc2VzLlxuICpcbiAqIEBwYXJhbSBkb21haW4gVGhlIGRvbWFpbiBuYW1lIG9yIGVtYWlsIGFkZHJlc3MuXG4gKiBAcGFyYW0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRoYXQgZ2V0cyBjYWxsZWQgZm9yIGV2ZXJ5XG4gKiBjaGFyYWN0ZXIuXG4gKiBAcmV0dXJuIEEgbmV3IHN0cmluZyBvZiBjaGFyYWN0ZXJzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFja1xuICogZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIG1hcERvbWFpbihzdHI6IHN0cmluZywgZm46IChsYWJlbDogc3RyaW5nKSA9PiBzdHJpbmcpIHtcbiAgY29uc3QgcGFydHMgPSBzdHIuc3BsaXQoXCJAXCIpO1xuICBsZXQgcmVzdWx0ID0gXCJcIjtcblxuICBpZiAocGFydHMubGVuZ3RoID4gMSkge1xuICAgIC8vIEluIGVtYWlsIGFkZHJlc3Nlcywgb25seSB0aGUgZG9tYWluIG5hbWUgc2hvdWxkIGJlIHB1bnljb2RlZC4gTGVhdmVcbiAgICAvLyB0aGUgbG9jYWwgcGFydCAoaS5lLiBldmVyeXRoaW5nIHVwIHRvIGBAYCkgaW50YWN0LlxuICAgIHJlc3VsdCA9IHBhcnRzWzBdICsgXCJAXCI7XG4gICAgc3RyID0gcGFydHNbMV07XG4gIH1cblxuICAvLyBBdm9pZCBgc3BsaXQocmVnZXgpYCBmb3IgSUU4IGNvbXBhdGliaWxpdHkuIFNlZSAjMTcuXG4gIHN0ciA9IHN0ci5yZXBsYWNlKHJlZ2V4U2VwYXJhdG9ycywgXCJcXHgyRVwiKTtcbiAgY29uc3QgbGFiZWxzID0gc3RyLnNwbGl0KFwiLlwiKTtcbiAgY29uc3QgZW5jb2RlZCA9IGxhYmVscy5tYXAoZm4pLmpvaW4oXCIuXCIpO1xuXG4gIHJldHVybiByZXN1bHQgKyBlbmNvZGVkO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgbnVtZXJpYyBjb2RlIHBvaW50cyBvZiBlYWNoIFVuaWNvZGVcbiAqIGNoYXJhY3RlciBpbiB0aGUgc3RyaW5nLiBXaGlsZSBKYXZhU2NyaXB0IHVzZXMgVUNTLTIgaW50ZXJuYWxseSxcbiAqIHRoaXMgZnVuY3Rpb24gd2lsbCBjb252ZXJ0IGEgcGFpciBvZiBzdXJyb2dhdGUgaGFsdmVzIChlYWNoIG9mIHdoaWNoXG4gKiBVQ1MtMiBleHBvc2VzIGFzIHNlcGFyYXRlIGNoYXJhY3RlcnMpIGludG8gYSBzaW5nbGUgY29kZSBwb2ludCxcbiAqIG1hdGNoaW5nIFVURi0xNi5cbiAqXG4gKiBAcGFyYW0gc3RyIFRoZSBVbmljb2RlIGlucHV0IHN0cmluZyAoVUNTLTIpLlxuICogQHJldHVybiBUaGUgbmV3IGFycmF5IG9mIGNvZGUgcG9pbnRzLlxuICovXG5mdW5jdGlvbiB1Y3MyZGVjb2RlKHN0cjogc3RyaW5nKSB7XG4gIGNvbnN0IG91dHB1dCA9IFtdO1xuICBsZXQgY291bnRlciA9IDA7XG4gIGNvbnN0IGxlbmd0aCA9IHN0ci5sZW5ndGg7XG5cbiAgd2hpbGUgKGNvdW50ZXIgPCBsZW5ndGgpIHtcbiAgICBjb25zdCB2YWx1ZSA9IHN0ci5jaGFyQ29kZUF0KGNvdW50ZXIrKyk7XG5cbiAgICBpZiAodmFsdWUgPj0gMHhEODAwICYmIHZhbHVlIDw9IDB4REJGRiAmJiBjb3VudGVyIDwgbGVuZ3RoKSB7XG4gICAgICAvLyBJdCdzIGEgaGlnaCBzdXJyb2dhdGUsIGFuZCB0aGVyZSBpcyBhIG5leHQgY2hhcmFjdGVyLlxuICAgICAgY29uc3QgZXh0cmEgPSBzdHIuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXG4gICAgICBpZiAoKGV4dHJhICYgMHhGQzAwKSA9PSAweERDMDApIHsgLy8gTG93IHN1cnJvZ2F0ZS5cbiAgICAgICAgb3V0cHV0LnB1c2goKCh2YWx1ZSAmIDB4M0ZGKSA8PCAxMCkgKyAoZXh0cmEgJiAweDNGRikgKyAweDEwMDAwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEl0J3MgYW4gdW5tYXRjaGVkIHN1cnJvZ2F0ZTsgb25seSBhcHBlbmQgdGhpcyBjb2RlIHVuaXQsIGluIGNhc2UgdGhlXG4gICAgICAgIC8vIG5leHQgY29kZSB1bml0IGlzIHRoZSBoaWdoIHN1cnJvZ2F0ZSBvZiBhIHN1cnJvZ2F0ZSBwYWlyLlxuICAgICAgICBvdXRwdXQucHVzaCh2YWx1ZSk7XG4gICAgICAgIGNvdW50ZXItLTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgb3V0cHV0LnB1c2godmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBvdXRwdXQ7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIHN0cmluZyBiYXNlZCBvbiBhbiBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuICogQHNlZSBgcHVueWNvZGUudWNzMi5kZWNvZGVgXG4gKiBAbWVtYmVyT2YgcHVueWNvZGUudWNzMlxuICogQG5hbWUgZW5jb2RlXG4gKiBAcGFyYW0ge0FycmF5fSBjb2RlUG9pbnRzIFRoZSBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuICogQHJldHVybnMge1N0cmluZ30gVGhlIG5ldyBVbmljb2RlIHN0cmluZyAoVUNTLTIpLlxuICovXG5mdW5jdGlvbiB1Y3MyZW5jb2RlKGFycmF5OiBudW1iZXJbXSkge1xuICByZXR1cm4gU3RyaW5nLmZyb21Db2RlUG9pbnQoLi4uYXJyYXkpO1xufVxuXG5leHBvcnQgY29uc3QgdWNzMiA9IHtcbiAgZGVjb2RlOiB1Y3MyZGVjb2RlLFxuICBlbmNvZGU6IHVjczJlbmNvZGUsXG59O1xuXG4vKipcbiAqIENvbnZlcnRzIGEgYmFzaWMgY29kZSBwb2ludCBpbnRvIGEgZGlnaXQvaW50ZWdlci5cbiAqIEBzZWUgYGRpZ2l0VG9CYXNpYygpYFxuICogQHByaXZhdGVcbiAqIEBwYXJhbSBjb2RlUG9pbnQgVGhlIGJhc2ljIG51bWVyaWMgY29kZSBwb2ludCB2YWx1ZS5cbiAqIEByZXR1cm5zIFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludCAoZm9yIHVzZSBpblxuICogcmVwcmVzZW50aW5nIGludGVnZXJzKSBpbiB0aGUgcmFuZ2UgYDBgIHRvIGBiYXNlIC0gMWAsIG9yIGBiYXNlYCBpZlxuICogdGhlIGNvZGUgcG9pbnQgZG9lcyBub3QgcmVwcmVzZW50IGEgdmFsdWUuXG4gKi9cbmZ1bmN0aW9uIGJhc2ljVG9EaWdpdChjb2RlUG9pbnQ6IG51bWJlcikge1xuICBpZiAoY29kZVBvaW50IC0gMHgzMCA8IDB4MEEpIHtcbiAgICByZXR1cm4gY29kZVBvaW50IC0gMHgxNjtcbiAgfVxuICBpZiAoY29kZVBvaW50IC0gMHg0MSA8IDB4MUEpIHtcbiAgICByZXR1cm4gY29kZVBvaW50IC0gMHg0MTtcbiAgfVxuICBpZiAoY29kZVBvaW50IC0gMHg2MSA8IDB4MUEpIHtcbiAgICByZXR1cm4gY29kZVBvaW50IC0gMHg2MTtcbiAgfVxuICByZXR1cm4gYmFzZTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBhIGRpZ2l0L2ludGVnZXIgaW50byBhIGJhc2ljIGNvZGUgcG9pbnQuXG4gKlxuICogQHBhcmFtIGRpZ2l0IFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludC5cbiAqIEByZXR1cm4gVGhlIGJhc2ljIGNvZGUgcG9pbnQgd2hvc2UgdmFsdWUgKHdoZW4gdXNlZCBmb3JcbiAqIHJlcHJlc2VudGluZyBpbnRlZ2VycykgaXMgYGRpZ2l0YCwgd2hpY2ggbmVlZHMgdG8gYmUgaW4gdGhlIHJhbmdlXG4gKiBgMGAgdG8gYGJhc2UgLSAxYC4gSWYgYGZsYWdgIGlzIG5vbi16ZXJvLCB0aGUgdXBwZXJjYXNlIGZvcm0gaXNcbiAqIHVzZWQ7IGVsc2UsIHRoZSBsb3dlcmNhc2UgZm9ybSBpcyB1c2VkLiBUaGUgYmVoYXZpb3IgaXMgdW5kZWZpbmVkXG4gKiBpZiBgZmxhZ2AgaXMgbm9uLXplcm8gYW5kIGBkaWdpdGAgaGFzIG5vIHVwcGVyY2FzZSBmb3JtLlxuICovXG5mdW5jdGlvbiBkaWdpdFRvQmFzaWMoZGlnaXQ6IG51bWJlciwgZmxhZzogbnVtYmVyKSB7XG4gIC8vICAwLi4yNSBtYXAgdG8gQVNDSUkgYS4ueiBvciBBLi5aXG4gIC8vIDI2Li4zNSBtYXAgdG8gQVNDSUkgMC4uOVxuICByZXR1cm4gZGlnaXQgKyAyMiArIDc1ICogTnVtYmVyKGRpZ2l0IDwgMjYpIC0gKE51bWJlcihmbGFnICE9IDApIDw8IDUpO1xufVxuXG4vKipcbiAqIEJpYXMgYWRhcHRhdGlvbiBmdW5jdGlvbiBhcyBwZXIgc2VjdGlvbiAzLjQgb2YgUkZDIDM0OTIuXG4gKiBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzQ5MiNzZWN0aW9uLTMuNFxuICovXG5mdW5jdGlvbiBhZGFwdChkZWx0YTogbnVtYmVyLCBudW1Qb2ludHM6IG51bWJlciwgZmlyc3RUaW1lOiBib29sZWFuKSB7XG4gIGxldCBrID0gMDtcbiAgZGVsdGEgPSBmaXJzdFRpbWUgPyBNYXRoLmZsb29yKGRlbHRhIC8gZGFtcCkgOiBkZWx0YSA+PiAxO1xuICBkZWx0YSArPSBNYXRoLmZsb29yKGRlbHRhIC8gbnVtUG9pbnRzKTtcblxuICBmb3IgKDsgLyogbm8gaW5pdGlhbGl6YXRpb24gKi8gZGVsdGEgPiBiYXNlTWludXNUTWluICogdE1heCA+PiAxOyBrICs9IGJhc2UpIHtcbiAgICBkZWx0YSA9IE1hdGguZmxvb3IoZGVsdGEgLyBiYXNlTWludXNUTWluKTtcbiAgfVxuXG4gIHJldHVybiBNYXRoLmZsb29yKGsgKyAoYmFzZU1pbnVzVE1pbiArIDEpICogZGVsdGEgLyAoZGVsdGEgKyBza2V3KSk7XG59XG5cbi8qKlxuICogQ29udmVydHMgYSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzIHRvIGEgc3RyaW5nIG9mIFVuaWNvZGVcbiAqIHN5bWJvbHMuXG4gKiBAbWVtYmVyT2YgcHVueWNvZGVcbiAqIEBwYXJhbSBpbnB1dCBUaGUgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cbiAqIEByZXR1cm5zIFRoZSByZXN1bHRpbmcgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZShpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgLy8gRG9uJ3QgdXNlIFVDUy0yLlxuICBjb25zdCBvdXRwdXQgPSBbXTtcbiAgY29uc3QgaW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGg7XG4gIGxldCBpID0gMDtcbiAgbGV0IG4gPSBpbml0aWFsTjtcbiAgbGV0IGJpYXMgPSBpbml0aWFsQmlhcztcblxuICAvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzOiBsZXQgYGJhc2ljYCBiZSB0aGUgbnVtYmVyIG9mIGlucHV0IGNvZGVcbiAgLy8gcG9pbnRzIGJlZm9yZSB0aGUgbGFzdCBkZWxpbWl0ZXIsIG9yIGAwYCBpZiB0aGVyZSBpcyBub25lLCB0aGVuIGNvcHlcbiAgLy8gdGhlIGZpcnN0IGJhc2ljIGNvZGUgcG9pbnRzIHRvIHRoZSBvdXRwdXQuXG5cbiAgbGV0IGJhc2ljID0gaW5wdXQubGFzdEluZGV4T2YoZGVsaW1pdGVyKTtcbiAgaWYgKGJhc2ljIDwgMCkge1xuICAgIGJhc2ljID0gMDtcbiAgfVxuXG4gIGZvciAobGV0IGogPSAwOyBqIDwgYmFzaWM7ICsraikge1xuICAgIC8vIGlmIGl0J3Mgbm90IGEgYmFzaWMgY29kZSBwb2ludFxuICAgIGlmIChpbnB1dC5jaGFyQ29kZUF0KGopID49IDB4ODApIHtcbiAgICAgIGVycm9yKFwibm90LWJhc2ljXCIpO1xuICAgIH1cbiAgICBvdXRwdXQucHVzaChpbnB1dC5jaGFyQ29kZUF0KGopKTtcbiAgfVxuXG4gIC8vIE1haW4gZGVjb2RpbmcgbG9vcDogc3RhcnQganVzdCBhZnRlciB0aGUgbGFzdCBkZWxpbWl0ZXIgaWYgYW55IGJhc2ljIGNvZGVcbiAgLy8gcG9pbnRzIHdlcmUgY29waWVkOyBzdGFydCBhdCB0aGUgYmVnaW5uaW5nIG90aGVyd2lzZS5cblxuICBmb3IgKFxuICAgIGxldCBpbmRleCA9IGJhc2ljID4gMCA/IGJhc2ljICsgMSA6IDA7XG4gICAgaW5kZXggPCBpbnB1dExlbmd0aDtcbiAgICAvKiBubyBmaW5hbCBleHByZXNzaW9uICovXG4gICkge1xuICAgIC8vIGBpbmRleGAgaXMgdGhlIGluZGV4IG9mIHRoZSBuZXh0IGNoYXJhY3RlciB0byBiZSBjb25zdW1lZC5cbiAgICAvLyBEZWNvZGUgYSBnZW5lcmFsaXplZCB2YXJpYWJsZS1sZW5ndGggaW50ZWdlciBpbnRvIGBkZWx0YWAsXG4gICAgLy8gd2hpY2ggZ2V0cyBhZGRlZCB0byBgaWAuIFRoZSBvdmVyZmxvdyBjaGVja2luZyBpcyBlYXNpZXJcbiAgICAvLyBpZiB3ZSBpbmNyZWFzZSBgaWAgYXMgd2UgZ28sIHRoZW4gc3VidHJhY3Qgb2ZmIGl0cyBzdGFydGluZ1xuICAgIC8vIHZhbHVlIGF0IHRoZSBlbmQgdG8gb2J0YWluIGBkZWx0YWAuXG4gICAgY29uc3Qgb2xkaSA9IGk7XG4gICAgZm9yIChsZXQgdyA9IDEsIGsgPSBiYXNlOzsgLyogbm8gY29uZGl0aW9uICovIGsgKz0gYmFzZSkge1xuICAgICAgaWYgKGluZGV4ID49IGlucHV0TGVuZ3RoKSB7XG4gICAgICAgIGVycm9yKFwiaW52YWxpZC1pbnB1dFwiKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgZGlnaXQgPSBiYXNpY1RvRGlnaXQoaW5wdXQuY2hhckNvZGVBdChpbmRleCsrKSk7XG5cbiAgICAgIGlmIChkaWdpdCA+PSBiYXNlIHx8IGRpZ2l0ID4gZmxvb3IoKG1heEludCAtIGkpIC8gdykpIHtcbiAgICAgICAgZXJyb3IoXCJvdmVyZmxvd1wiKTtcbiAgICAgIH1cblxuICAgICAgaSArPSBkaWdpdCAqIHc7XG4gICAgICBjb25zdCB0ID0gayA8PSBiaWFzID8gdE1pbiA6IChrID49IGJpYXMgKyB0TWF4ID8gdE1heCA6IGsgLSBiaWFzKTtcblxuICAgICAgaWYgKGRpZ2l0IDwgdCkge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgY29uc3QgYmFzZU1pbnVzVCA9IGJhc2UgLSB0O1xuICAgICAgaWYgKHcgPiBmbG9vcihtYXhJbnQgLyBiYXNlTWludXNUKSkge1xuICAgICAgICBlcnJvcihcIm92ZXJmbG93XCIpO1xuICAgICAgfVxuXG4gICAgICB3ICo9IGJhc2VNaW51c1Q7XG4gICAgfVxuXG4gICAgY29uc3Qgb3V0ID0gb3V0cHV0Lmxlbmd0aCArIDE7XG4gICAgYmlhcyA9IGFkYXB0KGkgLSBvbGRpLCBvdXQsIG9sZGkgPT0gMCk7XG5cbiAgICAvLyBgaWAgd2FzIHN1cHBvc2VkIHRvIHdyYXAgYXJvdW5kIGZyb20gYG91dGAgdG8gYDBgLFxuICAgIC8vIGluY3JlbWVudGluZyBgbmAgZWFjaCB0aW1lLCBzbyB3ZSdsbCBmaXggdGhhdCBub3c6XG4gICAgaWYgKGZsb29yKGkgLyBvdXQpID4gbWF4SW50IC0gbikge1xuICAgICAgZXJyb3IoXCJvdmVyZmxvd1wiKTtcbiAgICB9XG5cbiAgICBuICs9IGZsb29yKGkgLyBvdXQpO1xuICAgIGkgJT0gb3V0O1xuXG4gICAgLy8gSW5zZXJ0IGBuYCBhdCBwb3NpdGlvbiBgaWAgb2YgdGhlIG91dHB1dC5cbiAgICBvdXRwdXQuc3BsaWNlKGkrKywgMCwgbik7XG4gIH1cblxuICByZXR1cm4gU3RyaW5nLmZyb21Db2RlUG9pbnQoLi4ub3V0cHV0KTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBhIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMgKGUuZy4gYSBkb21haW4gbmFtZSBsYWJlbCkgdG8gYVxuICogUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scy5cbiAqXG4gKiBAcGFyYW0gc3RyIFRoZSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzLlxuICogQHJldHVybiBUaGUgcmVzdWx0aW5nIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbmNvZGUoc3RyOiBzdHJpbmcpIHtcbiAgY29uc3Qgb3V0cHV0ID0gW107XG5cbiAgLy8gQ29udmVydCB0aGUgaW5wdXQgaW4gVUNTLTIgdG8gYW4gYXJyYXkgb2YgVW5pY29kZSBjb2RlIHBvaW50cy5cbiAgY29uc3QgaW5wdXQgPSB1Y3MyZGVjb2RlKHN0cik7XG5cbiAgLy8gQ2FjaGUgdGhlIGxlbmd0aC5cbiAgY29uc3QgaW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGg7XG5cbiAgLy8gSW5pdGlhbGl6ZSB0aGUgc3RhdGUuXG4gIGxldCBuID0gaW5pdGlhbE47XG4gIGxldCBkZWx0YSA9IDA7XG4gIGxldCBiaWFzID0gaW5pdGlhbEJpYXM7XG5cbiAgLy8gSGFuZGxlIHRoZSBiYXNpYyBjb2RlIHBvaW50cy5cbiAgZm9yIChjb25zdCBjdXJyZW50VmFsdWUgb2YgaW5wdXQpIHtcbiAgICBpZiAoY3VycmVudFZhbHVlIDwgMHg4MCkge1xuICAgICAgb3V0cHV0LnB1c2goU3RyaW5nLmZyb21DaGFyQ29kZShjdXJyZW50VmFsdWUpKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBiYXNpY0xlbmd0aCA9IG91dHB1dC5sZW5ndGg7XG4gIGxldCBoYW5kbGVkQ1BDb3VudCA9IGJhc2ljTGVuZ3RoO1xuXG4gIC8vIGBoYW5kbGVkQ1BDb3VudGAgaXMgdGhlIG51bWJlciBvZiBjb2RlIHBvaW50cyB0aGF0IGhhdmUgYmVlbiBoYW5kbGVkO1xuICAvLyBgYmFzaWNMZW5ndGhgIGlzIHRoZSBudW1iZXIgb2YgYmFzaWMgY29kZSBwb2ludHMuXG5cbiAgLy8gRmluaXNoIHRoZSBiYXNpYyBzdHJpbmcgd2l0aCBhIGRlbGltaXRlciB1bmxlc3MgaXQncyBlbXB0eS5cbiAgaWYgKGJhc2ljTGVuZ3RoKSB7XG4gICAgb3V0cHV0LnB1c2goZGVsaW1pdGVyKTtcbiAgfVxuXG4gIC8vIE1haW4gZW5jb2RpbmcgbG9vcDpcbiAgd2hpbGUgKGhhbmRsZWRDUENvdW50IDwgaW5wdXRMZW5ndGgpIHtcbiAgICAvLyBBbGwgbm9uLWJhc2ljIGNvZGUgcG9pbnRzIDwgbiBoYXZlIGJlZW4gaGFuZGxlZCBhbHJlYWR5LiBGaW5kIHRoZSBuZXh0XG4gICAgLy8gbGFyZ2VyIG9uZTpcbiAgICBsZXQgbSA9IG1heEludDtcblxuICAgIGZvciAoY29uc3QgY3VycmVudFZhbHVlIG9mIGlucHV0KSB7XG4gICAgICBpZiAoY3VycmVudFZhbHVlID49IG4gJiYgY3VycmVudFZhbHVlIDwgbSkge1xuICAgICAgICBtID0gY3VycmVudFZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEluY3JlYXNlIGBkZWx0YWAgZW5vdWdoIHRvIGFkdmFuY2UgdGhlIGRlY29kZXIncyA8bixpPiBzdGF0ZSB0byA8bSwwPixcbiAgICAvLyBidXQgZ3VhcmQgYWdhaW5zdCBvdmVyZmxvdy5cbiAgICBjb25zdCBoYW5kbGVkQ1BDb3VudFBsdXNPbmUgPSBoYW5kbGVkQ1BDb3VudCArIDE7XG5cbiAgICBpZiAobSAtIG4gPiBNYXRoLmZsb29yKChtYXhJbnQgLSBkZWx0YSkgLyBoYW5kbGVkQ1BDb3VudFBsdXNPbmUpKSB7XG4gICAgICBlcnJvcihcIm92ZXJmbG93XCIpO1xuICAgIH1cblxuICAgIGRlbHRhICs9IChtIC0gbikgKiBoYW5kbGVkQ1BDb3VudFBsdXNPbmU7XG4gICAgbiA9IG07XG5cbiAgICBmb3IgKGNvbnN0IGN1cnJlbnRWYWx1ZSBvZiBpbnB1dCkge1xuICAgICAgaWYgKGN1cnJlbnRWYWx1ZSA8IG4gJiYgKytkZWx0YSA+IG1heEludCkge1xuICAgICAgICBlcnJvcihcIm92ZXJmbG93XCIpO1xuICAgICAgfVxuXG4gICAgICBpZiAoY3VycmVudFZhbHVlID09IG4pIHtcbiAgICAgICAgLy8gUmVwcmVzZW50IGRlbHRhIGFzIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXIuXG4gICAgICAgIGxldCBxID0gZGVsdGE7XG5cbiAgICAgICAgZm9yIChsZXQgayA9IGJhc2U7OyAvKiBubyBjb25kaXRpb24gKi8gayArPSBiYXNlKSB7XG4gICAgICAgICAgY29uc3QgdCA9IGsgPD0gYmlhcyA/IHRNaW4gOiAoayA+PSBiaWFzICsgdE1heCA/IHRNYXggOiBrIC0gYmlhcyk7XG5cbiAgICAgICAgICBpZiAocSA8IHQpIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHFNaW51c1QgPSBxIC0gdDtcbiAgICAgICAgICBjb25zdCBiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cbiAgICAgICAgICBvdXRwdXQucHVzaChcbiAgICAgICAgICAgIFN0cmluZy5mcm9tQ2hhckNvZGUoZGlnaXRUb0Jhc2ljKHQgKyBxTWludXNUICUgYmFzZU1pbnVzVCwgMCkpLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBxID0gTWF0aC5mbG9vcihxTWludXNUIC8gYmFzZU1pbnVzVCk7XG4gICAgICAgIH1cblxuICAgICAgICBvdXRwdXQucHVzaChTdHJpbmcuZnJvbUNoYXJDb2RlKGRpZ2l0VG9CYXNpYyhxLCAwKSkpO1xuXG4gICAgICAgIGJpYXMgPSBhZGFwdChcbiAgICAgICAgICBkZWx0YSxcbiAgICAgICAgICBoYW5kbGVkQ1BDb3VudFBsdXNPbmUsXG4gICAgICAgICAgaGFuZGxlZENQQ291bnQgPT0gYmFzaWNMZW5ndGgsXG4gICAgICAgICk7XG5cbiAgICAgICAgZGVsdGEgPSAwO1xuICAgICAgICArK2hhbmRsZWRDUENvdW50O1xuICAgICAgfVxuICAgIH1cblxuICAgICsrZGVsdGE7XG4gICAgKytuO1xuICB9XG5cbiAgcmV0dXJuIG91dHB1dC5qb2luKFwiXCIpO1xufVxuXG4vKipcbiAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIG9yIGFuIGVtYWlsIGFkZHJlc3NcbiAqIHRvIFVuaWNvZGUuIE9ubHkgdGhlIFB1bnljb2RlZCBwYXJ0cyBvZiB0aGUgaW5wdXQgd2lsbCBiZSBjb252ZXJ0ZWQsIGkuZS5cbiAqIGl0IGRvZXNuJ3QgbWF0dGVyIGlmIHlvdSBjYWxsIGl0IG9uIGEgc3RyaW5nIHRoYXQgaGFzIGFscmVhZHkgYmVlblxuICogY29udmVydGVkIHRvIFVuaWNvZGUuXG4gKiBAbWVtYmVyT2YgcHVueWNvZGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgUHVueWNvZGVkIGRvbWFpbiBuYW1lIG9yIGVtYWlsIGFkZHJlc3MgdG9cbiAqIGNvbnZlcnQgdG8gVW5pY29kZS5cbiAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBVbmljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBQdW55Y29kZVxuICogc3RyaW5nLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9Vbmljb2RlKGlucHV0OiBzdHJpbmcpIHtcbiAgcmV0dXJuIG1hcERvbWFpbihpbnB1dCwgZnVuY3Rpb24gKHN0cmluZykge1xuICAgIHJldHVybiByZWdleFB1bnljb2RlLnRlc3Qoc3RyaW5nKVxuICAgICAgPyBkZWNvZGUoc3RyaW5nLnNsaWNlKDQpLnRvTG93ZXJDYXNlKCkpXG4gICAgICA6IHN0cmluZztcbiAgfSk7XG59XG5cbi8qKlxuICogQ29udmVydHMgYSBVbmljb2RlIHN0cmluZyByZXByZXNlbnRpbmcgYSBkb21haW4gbmFtZSBvciBhbiBlbWFpbCBhZGRyZXNzIHRvXG4gKiBQdW55Y29kZS4gT25seSB0aGUgbm9uLUFTQ0lJIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCxcbiAqIGkuZS4gaXQgZG9lc24ndCBtYXR0ZXIgaWYgeW91IGNhbGwgaXQgd2l0aCBhIGRvbWFpbiB0aGF0J3MgYWxyZWFkeSBpblxuICogQVNDSUkuXG4gKlxuICogQHBhcmFtIGlucHV0IFRoZSBkb21haW4gbmFtZSBvciBlbWFpbCBhZGRyZXNzIHRvIGNvbnZlcnQsIGFzIGFcbiAqIFVuaWNvZGUgc3RyaW5nLlxuICogQHJldHVybiBUaGUgUHVueWNvZGUgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIGRvbWFpbiBuYW1lIG9yXG4gKiBlbWFpbCBhZGRyZXNzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9BU0NJSShpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIG1hcERvbWFpbihpbnB1dCwgZnVuY3Rpb24gKHN0cjogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHJlZ2V4Tm9uQVNDSUkudGVzdChzdHIpID8gXCJ4bi0tXCIgKyBlbmNvZGUoc3RyKSA6IHN0cjtcbiAgfSk7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLHNEQUFzRDtBQUN0RCxFQUFFO0FBQ0YsMEVBQTBFO0FBQzFFLGdFQUFnRTtBQUNoRSxzRUFBc0U7QUFDdEUsc0VBQXNFO0FBQ3RFLDRFQUE0RTtBQUM1RSxxRUFBcUU7QUFDckUsd0JBQXdCO0FBQ3hCLEVBQUU7QUFDRiwwRUFBMEU7QUFDMUUseURBQXlEO0FBQ3pELEVBQUU7QUFDRiwwRUFBMEU7QUFDMUUsNkRBQTZEO0FBQzdELDRFQUE0RTtBQUM1RSwyRUFBMkU7QUFDM0Usd0VBQXdFO0FBQ3hFLDRFQUE0RTtBQUM1RSx5Q0FBeUM7QUFFekMsdURBQXVEO0FBRXZELHdFQUF3RTtBQUN4RSxrRUFBa0U7QUFDbEUsc0VBQXNFO0FBQ3RFLHNFQUFzRTtBQUN0RSxxRUFBcUU7QUFDckUsd0VBQXdFO0FBQ3hFLDRCQUE0QjtBQUU1QixpRUFBaUU7QUFDakUsa0VBQWtFO0FBRWxFLGtFQUFrRTtBQUNsRSxxRUFBcUU7QUFDckUsd0RBQXdEO0FBQ3hELHlFQUF5RTtB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