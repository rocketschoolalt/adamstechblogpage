// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
import { validateCallback } from "../internal/validators.mjs";
import { notImplemented } from "../_utils.ts";
export function isFileOptions(fileOptions) {
    if (!fileOptions) return false;
    return fileOptions.encoding != undefined || fileOptions.flag != undefined || fileOptions.signal != undefined || fileOptions.mode != undefined;
}
export function getEncoding(optOrCallback) {
    if (!optOrCallback || typeof optOrCallback === "function") {
        return null;
    }
    const encoding = typeof optOrCallback === "string" ? optOrCallback : optOrCallback.encoding;
    if (!encoding) return null;
    return encoding;
}
export function checkEncoding(encoding) {
    if (!encoding) return null;
    encoding = encoding.toLowerCase();
    if ([
        "utf8",
        "hex",
        "base64"
    ].includes(encoding)) return encoding;
    if (encoding === "utf-8") {
        return "utf8";
    }
    if (encoding === "binary") {
        return "binary";
    // before this was buffer, however buffer is not used in Node
    // node -e "require('fs').readFile('../world.txt', 'buffer', console.log)"
    }
    const notImplementedEncodings = [
        "utf16le",
        "latin1",
        "ascii",
        "ucs2"
    ];
    if (notImplementedEncodings.includes(encoding)) {
        notImplemented(`"${encoding}" encoding`);
    }
    throw new Error(`The value "${encoding}" is invalid for option "encoding"`);
}
export function getOpenOptions(flag) {
    if (!flag) {
        return {
            create: true,
            append: true
        };
    }
    let openOptions;
    switch(flag){
        case "a":
            {
                // 'a': Open file for appending. The file is created if it does not exist.
                openOptions = {
                    create: true,
                    append: true
                };
                break;
            }
        case "ax":
            {
                // 'ax': Like 'a' but fails if the path exists.
                openOptions = {
                    createNew: true,
                    write: true,
                    append: true
                };
                break;
            }
        case "a+":
            {
                // 'a+': Open file for reading and appending. The file is created if it does not exist.
                openOptions = {
                    read: true,
                    create: true,
                    append: true
                };
                break;
            }
        case "ax+":
            {
                // 'ax+': Like 'a+' but fails if the path exists.
                openOptions = {
                    read: true,
                    createNew: true,
                    append: true
                };
                break;
            }
        case "r":
            {
                // 'r': Open file for reading. An exception occurs if the file does not exist.
                openOptions = {
                    read: true
                };
                break;
            }
        case "r+":
            {
                // 'r+': Open file for reading and writing. An exception occurs if the file does not exist.
                openOptions = {
                    read: true,
                    write: true
                };
                break;
            }
        case "w":
            {
                // 'w': Open file for writing. The file is created (if it does not exist) or truncated (if it exists).
                openOptions = {
                    create: true,
                    write: true,
                    truncate: true
                };
                break;
            }
        case "wx":
            {
                // 'wx': Like 'w' but fails if the path exists.
                openOptions = {
                    createNew: true,
                    write: true
                };
                break;
            }
        case "w+":
            {
                // 'w+': Open file for reading and writing. The file is created (if it does not exist) or truncated (if it exists).
                openOptions = {
                    create: true,
                    write: true,
                    truncate: true,
                    read: true
                };
                break;
            }
        case "wx+":
            {
                // 'wx+': Like 'w+' but fails if the path exists.
                openOptions = {
                    createNew: true,
                    write: true,
                    read: true
                };
                break;
            }
        case "as":
            {
                // 'as': Open file for appending in synchronous mode. The file is created if it does not exist.
                openOptions = {
                    create: true,
                    append: true
                };
                break;
            }
        case "as+":
            {
                // 'as+': Open file for reading and appending in synchronous mode. The file is created if it does not exist.
                openOptions = {
                    create: true,
                    read: true,
                    append: true
                };
                break;
            }
        case "rs+":
            {
                // 'rs+': Open file for reading and writing in synchronous mode. Instructs the operating system to bypass the local file system cache.
                openOptions = {
                    create: true,
                    read: true,
                    write: true
                };
                break;
            }
        default:
            {
                throw new Error(`Unrecognized file system flag: ${flag}`);
            }
    }
    return openOptions;
}
export { isUint32 as isFd } from "../internal/validators.mjs";
export function maybeCallback(cb) {
    validateCallback(cb);
    return cb;
}
// Ensure that callbacks run in the global context. Only use this function
// for callbacks that are passed to the binding layer, callbacks that are
// invoked from JS already run in the proper scope.
export function makeCallback(cb) {
    validateCallback(cb);
    return (...args)=>Reflect.apply(cb, this, args);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvX2ZzL19mc19jb21tb24udHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cbmltcG9ydCB7IHZhbGlkYXRlQ2FsbGJhY2sgfSBmcm9tIFwiLi4vaW50ZXJuYWwvdmFsaWRhdG9ycy5tanNcIjtcbmltcG9ydCB0eXBlIHsgRXJybm9FeGNlcHRpb24gfSBmcm9tIFwiLi4vX2dsb2JhbC5kLnRzXCI7XG5pbXBvcnQge1xuICBCaW5hcnlFbmNvZGluZ3MsXG4gIEVuY29kaW5ncyxcbiAgbm90SW1wbGVtZW50ZWQsXG4gIFRleHRFbmNvZGluZ3MsXG59IGZyb20gXCIuLi9fdXRpbHMudHNcIjtcblxuZXhwb3J0IHR5cGUgQ2FsbGJhY2tXaXRoRXJyb3IgPSAoZXJyOiBFcnJub0V4Y2VwdGlvbiB8IG51bGwpID0+IHZvaWQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRmlsZU9wdGlvbnMge1xuICBlbmNvZGluZz86IEVuY29kaW5ncztcbiAgZmxhZz86IHN0cmluZztcbiAgc2lnbmFsPzogQWJvcnRTaWduYWw7XG59XG5cbmV4cG9ydCB0eXBlIFRleHRPcHRpb25zQXJndW1lbnQgPVxuICB8IFRleHRFbmNvZGluZ3NcbiAgfCAoeyBlbmNvZGluZzogVGV4dEVuY29kaW5ncyB9ICYgRmlsZU9wdGlvbnMpO1xuZXhwb3J0IHR5cGUgQmluYXJ5T3B0aW9uc0FyZ3VtZW50ID1cbiAgfCBCaW5hcnlFbmNvZGluZ3NcbiAgfCAoeyBlbmNvZGluZzogQmluYXJ5RW5jb2RpbmdzIH0gJiBGaWxlT3B0aW9ucyk7XG5leHBvcnQgdHlwZSBGaWxlT3B0aW9uc0FyZ3VtZW50ID0gRW5jb2RpbmdzIHwgRmlsZU9wdGlvbnM7XG5cbmV4cG9ydCBpbnRlcmZhY2UgV3JpdGVGaWxlT3B0aW9ucyBleHRlbmRzIEZpbGVPcHRpb25zIHtcbiAgbW9kZT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRmlsZU9wdGlvbnMoXG4gIGZpbGVPcHRpb25zOiBzdHJpbmcgfCBXcml0ZUZpbGVPcHRpb25zIHwgdW5kZWZpbmVkLFxuKTogZmlsZU9wdGlvbnMgaXMgRmlsZU9wdGlvbnMge1xuICBpZiAoIWZpbGVPcHRpb25zKSByZXR1cm4gZmFsc2U7XG5cbiAgcmV0dXJuIChcbiAgICAoZmlsZU9wdGlvbnMgYXMgRmlsZU9wdGlvbnMpLmVuY29kaW5nICE9IHVuZGVmaW5lZCB8fFxuICAgIChmaWxlT3B0aW9ucyBhcyBGaWxlT3B0aW9ucykuZmxhZyAhPSB1bmRlZmluZWQgfHxcbiAgICAoZmlsZU9wdGlvbnMgYXMgRmlsZU9wdGlvbnMpLnNpZ25hbCAhPSB1bmRlZmluZWQgfHxcbiAgICAoZmlsZU9wdGlvbnMgYXMgV3JpdGVGaWxlT3B0aW9ucykubW9kZSAhPSB1bmRlZmluZWRcbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVuY29kaW5nKFxuICBvcHRPckNhbGxiYWNrPzpcbiAgICB8IEZpbGVPcHRpb25zXG4gICAgfCBXcml0ZUZpbGVPcHRpb25zXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICB8ICgoLi4uYXJnczogYW55W10pID0+IGFueSlcbiAgICB8IEVuY29kaW5nc1xuICAgIHwgbnVsbCxcbik6IEVuY29kaW5ncyB8IG51bGwge1xuICBpZiAoIW9wdE9yQ2FsbGJhY2sgfHwgdHlwZW9mIG9wdE9yQ2FsbGJhY2sgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgZW5jb2RpbmcgPSB0eXBlb2Ygb3B0T3JDYWxsYmFjayA9PT0gXCJzdHJpbmdcIlxuICAgID8gb3B0T3JDYWxsYmFja1xuICAgIDogb3B0T3JDYWxsYmFjay5lbmNvZGluZztcbiAgaWYgKCFlbmNvZGluZykgcmV0dXJuIG51bGw7XG4gIHJldHVybiBlbmNvZGluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrRW5jb2RpbmcoZW5jb2Rpbmc6IEVuY29kaW5ncyB8IG51bGwpOiBFbmNvZGluZ3MgfCBudWxsIHtcbiAgaWYgKCFlbmNvZGluZykgcmV0dXJuIG51bGw7XG5cbiAgZW5jb2RpbmcgPSBlbmNvZGluZy50b0xvd2VyQ2FzZSgpIGFzIEVuY29kaW5ncztcbiAgaWYgKFtcInV0ZjhcIiwgXCJoZXhcIiwgXCJiYXNlNjRcIl0uaW5jbHVkZXMoZW5jb2RpbmcpKSByZXR1cm4gZW5jb2Rpbmc7XG5cbiAgaWYgKGVuY29kaW5nID09PSBcInV0Zi04XCIpIHtcbiAgICByZXR1cm4gXCJ1dGY4XCI7XG4gIH1cbiAgaWYgKGVuY29kaW5nID09PSBcImJpbmFyeVwiKSB7XG4gICAgcmV0dXJuIFwiYmluYXJ5XCI7XG4gICAgLy8gYmVmb3JlIHRoaXMgd2FzIGJ1ZmZlciwgaG93ZXZlciBidWZmZXIgaXMgbm90IHVzZWQgaW4gTm9kZVxuICAgIC8vIG5vZGUgLWUgXCJyZXF1aXJlKCdmcycpLnJlYWRGaWxlKCcuLi93b3JsZC50eHQnLCAnYnVmZmVyJywgY29uc29sZS5sb2cpXCJcbiAgfVxuXG4gIGNvbnN0IG5vdEltcGxlbWVudGVkRW5jb2RpbmdzID0gW1widXRmMTZsZVwiLCBcImxhdGluMVwiLCBcImFzY2lpXCIsIFwidWNzMlwiXTtcblxuICBpZiAobm90SW1wbGVtZW50ZWRFbmNvZGluZ3MuaW5jbHVkZXMoZW5jb2RpbmcgYXMgc3RyaW5nKSkge1xuICAgIG5vdEltcGxlbWVudGVkKGBcIiR7ZW5jb2Rpbmd9XCIgZW5jb2RpbmdgKTtcbiAgfVxuXG4gIHRocm93IG5ldyBFcnJvcihgVGhlIHZhbHVlIFwiJHtlbmNvZGluZ31cIiBpcyBpbnZhbGlkIGZvciBvcHRpb24gXCJlbmNvZGluZ1wiYCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRPcGVuT3B0aW9ucyhmbGFnOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBEZW5vLk9wZW5PcHRpb25zIHtcbiAgaWYgKCFmbGFnKSB7XG4gICAgcmV0dXJuIHsgY3JlYXRlOiB0cnVlLCBhcHBlbmQ6IHRydWUgfTtcbiAgfVxuXG4gIGxldCBvcGVuT3B0aW9uczogRGVuby5PcGVuT3B0aW9ucztcbiAgc3dpdGNoIChmbGFnKSB7XG4gICAgY2FzZSBcImFcIjoge1xuICAgICAgLy8gJ2EnOiBPcGVuIGZpbGUgZm9yIGFwcGVuZGluZy4gVGhlIGZpbGUgaXMgY3JlYXRlZCBpZiBpdCBkb2VzIG5vdCBleGlzdC5cbiAgICAgIG9wZW5PcHRpb25zID0geyBjcmVhdGU6IHRydWUsIGFwcGVuZDogdHJ1ZSB9O1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgXCJheFwiOiB7XG4gICAgICAvLyAnYXgnOiBMaWtlICdhJyBidXQgZmFpbHMgaWYgdGhlIHBhdGggZXhpc3RzLlxuICAgICAgb3Blbk9wdGlvbnMgPSB7IGNyZWF0ZU5ldzogdHJ1ZSwgd3JpdGU6IHRydWUsIGFwcGVuZDogdHJ1ZSB9O1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgXCJhK1wiOiB7XG4gICAgICAvLyAnYSsnOiBPcGVuIGZpbGUgZm9yIHJlYWRpbmcgYW5kIGFwcGVuZGluZy4gVGhlIGZpbGUgaXMgY3JlYXRlZCBpZiBpdCBkb2VzIG5vdCBleGlzdC5cbiAgICAgIG9wZW5PcHRpb25zID0geyByZWFkOiB0cnVlLCBjcmVhdGU6IHRydWUsIGFwcGVuZDogdHJ1ZSB9O1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgXCJheCtcIjoge1xuICAgICAgLy8gJ2F4Kyc6IExpa2UgJ2ErJyBidXQgZmFpbHMgaWYgdGhlIHBhdGggZXhpc3RzLlxuICAgICAgb3Blbk9wdGlvbnMgPSB7IHJlYWQ6IHRydWUsIGNyZWF0ZU5ldzogdHJ1ZSwgYXBwZW5kOiB0cnVlIH07XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSBcInJcIjoge1xuICAgICAgLy8gJ3InOiBPcGVuIGZpbGUgZm9yIHJlYWRpbmcuIEFuIGV4Y2VwdGlvbiBvY2N1cnMgaWYgdGhlIGZpbGUgZG9lcyBub3QgZXhpc3QuXG4gICAgICBvcGVuT3B0aW9ucyA9IHsgcmVhZDogdHJ1ZSB9O1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgXCJyK1wiOiB7XG4gICAgICAvLyAncisnOiBPcGVuIGZpbGUgZm9yIHJlYWRpbmcgYW5kIHdyaXRpbmcuIEFuIGV4Y2VwdGlvbiBvY2N1cnMgaWYgdGhlIGZpbGUgZG9lcyBub3QgZXhpc3QuXG4gICAgICBvcGVuT3B0aW9ucyA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlIFwid1wiOiB7XG4gICAgICAvLyAndyc6IE9wZW4gZmlsZSBmb3Igd3JpdGluZy4gVGhlIGZpbGUgaXMgY3JlYXRlZCAoaWYgaXQgZG9lcyBub3QgZXhpc3QpIG9yIHRydW5jYXRlZCAoaWYgaXQgZXhpc3RzKS5cbiAgICAgIG9wZW5PcHRpb25zID0geyBjcmVhdGU6IHRydWUsIHdyaXRlOiB0cnVlLCB0cnVuY2F0ZTogdHJ1ZSB9O1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgXCJ3eFwiOiB7XG4gICAgICAvLyAnd3gnOiBMaWtlICd3JyBidXQgZmFpbHMgaWYgdGhlIHBhdGggZXhpc3RzLlxuICAgICAgb3Blbk9wdGlvbnMgPSB7IGNyZWF0ZU5ldzogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICBjYXNlIFwidytcIjoge1xuICAgICAgLy8gJ3crJzogT3BlbiBmaWxlIGZvciByZWFkaW5nIGFuZCB3cml0aW5nLiBUaGUgZmlsZSBpcyBjcmVhdGVkIChpZiBpdCBkb2VzIG5vdCBleGlzdCkgb3IgdHJ1bmNhdGVkIChpZiBpdCBleGlzdHMpLlxuICAgICAgb3Blbk9wdGlvbnMgPSB7IGNyZWF0ZTogdHJ1ZSwgd3JpdGU6IHRydWUsIHRydW5jYXRlOiB0cnVlLCByZWFkOiB0cnVlIH07XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSBcInd4K1wiOiB7XG4gICAgICAvLyAnd3grJzogTGlrZSAndysnIGJ1dCBmYWlscyBpZiB0aGUgcGF0aCBleGlzdHMuXG4gICAgICBvcGVuT3B0aW9ucyA9IHsgY3JlYXRlTmV3OiB0cnVlLCB3cml0ZTogdHJ1ZSwgcmVhZDogdHJ1ZSB9O1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgXCJhc1wiOiB7XG4gICAgICAvLyAnYXMnOiBPcGVuIGZpbGUgZm9yIGFwcGVuZGluZyBpbiBzeW5jaHJvbm91cyBtb2RlLiBUaGUgZmlsZSBpcyBjcmVhdGVkIGlmIGl0IGRvZXMgbm90IGV4aXN0LlxuICAgICAgb3Blbk9wdGlvbnMgPSB7IGNyZWF0ZTogdHJ1ZSwgYXBwZW5kOiB0cnVlIH07XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2FzZSBcImFzK1wiOiB7XG4gICAgICAvLyAnYXMrJzogT3BlbiBmaWxlIGZvciByZWFkaW5nIGFuZCBhcHBlbmRpbmcgaW4gc3luY2hyb25vdXMgbW9kZS4gVGhlIGZpbGUgaXMgY3JlYXRlZCBpZiBpdCBkb2VzIG5vdCBleGlzdC5cbiAgICAgIG9wZW5PcHRpb25zID0geyBjcmVhdGU6IHRydWUsIHJlYWQ6IHRydWUsIGFwcGVuZDogdHJ1ZSB9O1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIGNhc2UgXCJycytcIjoge1xuICAgICAgLy8gJ3JzKyc6IE9wZW4gZmlsZSBmb3IgcmVhZGluZyBhbmQgd3JpdGluZyBpbiBzeW5jaHJvbm91cyBtb2RlLiBJbnN0cnVjdHMgdGhlIG9wZXJhdGluZyBzeXN0ZW0gdG8gYnlwYXNzIHRoZSBsb2NhbCBmaWxlIHN5c3RlbSBjYWNoZS5cbiAgICAgIG9wZW5PcHRpb25zID0geyBjcmVhdGU6IHRydWUsIHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgZGVmYXVsdDoge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbnJlY29nbml6ZWQgZmlsZSBzeXN0ZW0gZmxhZzogJHtmbGFnfWApO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBvcGVuT3B0aW9ucztcbn1cblxuZXhwb3J0IHsgaXNVaW50MzIgYXMgaXNGZCB9IGZyb20gXCIuLi9pbnRlcm5hbC92YWxpZGF0b3JzLm1qc1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVDYWxsYmFjayhjYjogdW5rbm93bikge1xuICB2YWxpZGF0ZUNhbGxiYWNrKGNiKTtcblxuICByZXR1cm4gY2IgYXMgQ2FsbGJhY2tXaXRoRXJyb3I7XG59XG5cbi8vIEVuc3VyZSB0aGF0IGNhbGxiYWNrcyBydW4gaW4gdGhlIGdsb2JhbCBjb250ZXh0LiBPbmx5IHVzZSB0aGlzIGZ1bmN0aW9uXG4vLyBmb3IgY2FsbGJhY2tzIHRoYXQgYXJlIHBhc3NlZCB0byB0aGUgYmluZGluZyBsYXllciwgY2FsbGJhY2tzIHRoYXQgYXJlXG4vLyBpbnZva2VkIGZyb20gSlMgYWxyZWFkeSBydW4gaW4gdGhlIHByb3BlciBzY29wZS5cbmV4cG9ydCBmdW5jdGlvbiBtYWtlQ2FsbGJhY2soXG4gIHRoaXM6IHVua25vd24sXG4gIGNiPzogKGVycjogRXJyb3IgfCBudWxsLCByZXN1bHQ/OiB1bmtub3duKSA9PiB2b2lkLFxuKSB7XG4gIHZhbGlkYXRlQ2FsbGJhY2soY2IpO1xuXG4gIHJldHVybiAoLi4uYXJnczogdW5rbm93bltdKSA9PiBSZWZsZWN0LmFwcGx5KGNiISwgdGhpcywgYXJncyk7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLFNBQVMsZ0JBQWdCLFFBQVEsNEJBQTRCLENBQUM7QUFFOUQsU0FHRSxjQUFjLFFBRVQsY0FBYyxDQUFDO0FBc0J0QixPQUFPLFNBQVMsYUFBYSxDQUMzQixXQUFrRCxFQUN0QjtJQUM1QixJQUFJLENBQUMsV0FBVyxFQUFFLE9BQU8sS0FBSyxDQUFDO0lBRS9CLE9BQ0UsQUFBQyxXQUFXLENBQWlCLFFBQVEsSUFBSSxTQUFTLElBQ2xELEFBQUMsV0FBVyxD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