/**
 * Tokenize input string.
 */ function lexer(str) {
    const tokens = [];
    let i = 0;
    while(i < str.length){
        const char = str[i];
        if (char === "*" || char === "+" || char === "?") {
            tokens.push({
                type: "MODIFIER",
                index: i,
                value: str[i++]
            });
            continue;
        }
        if (char === "\\") {
            tokens.push({
                type: "ESCAPED_CHAR",
                index: i++,
                value: str[i++]
            });
            continue;
        }
        if (char === "{") {
            tokens.push({
                type: "OPEN",
                index: i,
                value: str[i++]
            });
            continue;
        }
        if (char === "}") {
            tokens.push({
                type: "CLOSE",
                index: i,
                value: str[i++]
            });
            continue;
        }
        if (char === ":") {
            let name = "";
            let j = i + 1;
            while(j < str.length){
                const code = str.charCodeAt(j);
                if (// `0-9`
                (code >= 48 && code <= 57) || // `A-Z`
                (code >= 65 && code <= 90) || // `a-z`
                (code >= 97 && code <= 122) || // `_`
                code === 95) {
                    name += str[j++];
                    continue;
                }
                break;
            }
            if (!name) throw new TypeError(`Missing parameter name at ${i}`);
            tokens.push({
                type: "NAME",
                index: i,
                value: name
            });
            i = j;
            continue;
        }
        if (char === "(") {
            let count = 1;
            let pattern = "";
            let j = i + 1;
            if (str[j] === "?") {
                throw new TypeError(`Pattern cannot start with "?" at ${j}`);
            }
            while(j < str.length){
                if (str[j] === "\\") {
                    pattern += str[j++] + str[j++];
                    continue;
                }
                if (str[j] === ")") {
                    count--;
                    if (count === 0) {
                        j++;
                        break;
                    }
                } else if (str[j] === "(") {
                    count++;
                    if (str[j + 1] !== "?") {
                        throw new TypeError(`Capturing groups are not allowed at ${j}`);
                    }
                }
                pattern += str[j++];
            }
            if (count) throw new TypeError(`Unbalanced pattern at ${i}`);
            if (!pattern) throw new TypeError(`Missing pattern at ${i}`);
            tokens.push({
                type: "PATTERN",
                index: i,
                value: pattern
            });
            i = j;
            continue;
        }
        tokens.push({
            type: "CHAR",
            index: i,
            value: str[i++]
        });
    }
    tokens.push({
        type: "END",
        index: i,
        value: ""
    });
    return tokens;
}
/**
 * Parse a string for the raw tokens.
 */ export function parse(str, options = {
}) {
    const tokens = lexer(str);
    const { prefixes ="./"  } = options;
    const defaultPattern = `[^${escapeString(options.delimiter || "/#?")}]+?`;
    const result = [];
    let key = 0;
    let i = 0;
    let path = "";
    const tryConsume = (type)=>{
        if (i < tokens.length && tokens[i].type === type) return tokens[i++].value;
    };
    const mustConsume = (type)=>{
        const value = tryConsume(type);
        if (value !== undefined) return value;
        const { type: nextType , index  } = tokens[i];
        throw new TypeError(`Unexpected ${nextType} at ${index}, expected ${type}`);
    };
    const consumeText = ()=>{
        let result = "";
        let value;
        // tslint:disable-next-line
        while(value = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")){
            result += value;
        }
        return result;
    };
    while(i < tokens.length){
        const char = tryConsume("CHAR");
        const name = tryConsume("NAME");
        const pattern = tryConsume("PATTERN");
        if (name || pattern) {
            let prefix = char || "";
            if (prefixes.indexOf(prefix) === -1) {
                path += prefix;
                prefix = "";
            }
            if (path) {
                result.push(path);
                path = "";
            }
            result.push({
                name: name || key++,
                prefix,
                suffix: "",
                pattern: pattern || defaultPattern,
                modifier: tryConsume("MODIFIER") || ""
            });
            continue;
        }
        const value = char || tryConsume("ESCAPED_CHAR");
        if (value) {
            path += value;
            continue;
        }
        if (path) {
            result.push(path);
            path = "";
        }
        const open = tryConsume("OPEN");
        if (open) {
            const prefix = consumeText();
            const name = tryConsume("NAME") || "";
            const pattern = tryConsume("PATTERN") || "";
            const suffix = consumeText();
            mustConsume("CLOSE");
            result.push({
                name: name || (pattern ? key++ : ""),
                pattern: name && !pattern ? defaultPattern : pattern,
                prefix,
                suffix,
                modifier: tryConsume("MODIFIER") || ""
            });
            continue;
        }
        mustConsume("END");
    }
    return result;
}
/**
 * Compile a string to a template function for the path.
 */ export function compile(str, options) {
    return tokensToFunction(parse(str, options), options);
}
/**
 * Expose a method for transforming tokens into the path function.
 */ export function tokensToFunction(tokens, options = {
}) {
    const reFlags = flags(options);
    const { encode =(x)=>x
     , validate =true  } = options;
    // Compile all the tokens into regexps.
    const matches = tokens.map((token)=>{
        if (typeof token === "object") {
            return new RegExp(`^(?:${token.pattern})$`, reFlags);
        }
    });
    return (data)=>{
        let path = "";
        for(let i = 0; i < tokens.length; i++){
            const token = tokens[i];
            if (typeof token === "string") {
                path += token;
                continue;
            }
            const value = data ? data[token.name] : undefined;
            const optional = token.modifier === "?" || token.modifier === "*";
            const repeat = token.modifier === "*" || token.modifier === "+";
            if (Array.isArray(value)) {
                if (!repeat) {
                    throw new TypeError(`Expected "${token.name}" to not repeat, but got an array`);
                }
                if (value.length === 0) {
                    if (optional) continue;
                    throw new TypeError(`Expected "${token.name}" to not be empty`);
                }
                for(let j = 0; j < value.length; j++){
                    const segment = encode(value[j], token);
                    if (validate && !matches[i].test(segment)) {
                        throw new TypeError(`Expected all "${token.name}" to match "${token.pattern}", but got "${segment}"`);
                    }
                    path += token.prefix + segment + token.suffix;
                }
                continue;
            }
            if (typeof value === "string" || typeof value === "number") {
                const segment = encode(String(value), token);
                if (validate && !matches[i].test(segment)) {
                    throw new TypeError(`Expected "${token.name}" to match "${token.pattern}", but got "${segment}"`);
                }
                path += token.prefix + segment + token.suffix;
                continue;
            }
            if (optional) continue;
            const typeOfMessage = repeat ? "an array" : "a string";
            throw new TypeError(`Expected "${token.name}" to be ${typeOfMessage}`);
        }
        return path;
    };
}
/**
 * Create path match function from `path-to-regexp` spec.
 */ export function match(str, options) {
    const keys = [];
    const re = pathToRegexp(str, keys, options);
    return regexpToFunction(re, keys, options);
}
/**
 * Create a path match function from `path-to-regexp` output.
 */ export function regexpToFunction(re, keys, options = {
}) {
    const { decode =(x)=>x
      } = options;
    return function(pathname) {
        const m = re.exec(pathname);
        if (!m) return false;
        const { 0: path , index  } = m;
        const params = Object.create(null);
        for(let i = 1; i < m.length; i++){
            // tslint:disable-next-line
            if (m[i] === undefined) continue;
            const key = keys[i - 1];
            if (key.modifier === "*" || key.modifier === "+") {
                params[key.name] = m[i].split(key.prefix + key.suffix).map((value)=>{
                    return decode(value, key);
                });
            } else {
                params[key.name] = decode(m[i], key);
            }
        }
        return {
            path,
            index,
            params
        };
    };
}
/**
 * Escape a regular expression string.
 */ function escapeString(str) {
    return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
/**
 * Get the flags for a regexp from the options.
 */ function flags(options) {
    return options && options.sensitive ? "" : "i";
}
/**
 * Pull out keys from a regexp.
 */ function regexpToRegexp(path, keys) {
    if (!keys) return path;
    const groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
    let index = 0;
    let execResult = groupsRegex.exec(path.source);
    while(execResult){
        keys.push({
            // Use parenthesized substring match if available, index otherwise
            name: execResult[1] || index++,
            prefix: "",
            suffix: "",
            modifier: "",
            pattern: ""
        });
        execResult = groupsRegex.exec(path.source);
    }
    return path;
}
/**
 * Transform an array into a regexp.
 */ function arrayToRegexp(paths, keys, options) {
    const parts = paths.map((path)=>pathToRegexp(path, keys, options).source
    );
    return new RegExp(`(?:${parts.join("|")})`, flags(options));
}
/**
 * Create a path regexp from string input.
 */ function stringToRegexp(path, keys, options) {
    return tokensToRegexp(parse(path, options), keys, options);
}
/**
 * Expose a function for taking tokens and returning a RegExp.
 */ export function tokensToRegexp(tokens, keys, options = {
}) {
    const { strict =false , start =true , end =true , encode =(x)=>x
      } = options;
    const endsWith = `[${escapeString(options.endsWith || "")}]|$`;
    const delimiter = `[${escapeString(options.delimiter || "/#?")}]`;
    let route = start ? "^" : "";
    // Iterate over the tokens and create our regexp string.
    for (const token of tokens){
        if (typeof token === "string") {
            route += escapeString(encode(token));
        } else {
            const prefix = escapeString(encode(token.prefix));
            const suffix = escapeString(encode(token.suffix));
            if (token.pattern) {
                if (keys) keys.push(token);
                if (prefix || suffix) {
                    if (token.modifier === "+" || token.modifier === "*") {
                        const mod = token.modifier === "*" ? "?" : "";
                        route += `(?:${prefix}((?:${token.pattern})(?:${suffix}${prefix}(?:${token.pattern}))*)${suffix})${mod}`;
                    } else {
                        route += `(?:${prefix}(${token.pattern})${suffix})${token.modifier}`;
                    }
                } else {
                    route += `(${token.pattern})${token.modifier}`;
                }
            } else {
                route += `(?:${prefix}${suffix})${token.modifier}`;
            }
        }
    }
    if (end) {
        if (!strict) route += `${delimiter}?`;
        route += !options.endsWith ? "$" : `(?=${endsWith})`;
    } else {
        const endToken = tokens[tokens.length - 1];
        const isEndDelimited = typeof endToken === "string" ? delimiter.indexOf(endToken[endToken.length - 1]) > -1 : endToken === undefined;
        if (!strict) {
            route += `(?:${delimiter}(?=${endsWith}))?`;
        }
        if (!isEndDelimited) {
            route += `(?=${delimiter}|${endsWith})`;
        }
    }
    return new RegExp(route, flags(options));
}
/**
 * Normalize the given path string, returning a regular expression.
 *
 * An empty array can be passed in for the keys, which will hold the
 * placeholder key descriptions. For example, using `/user/:id`, `keys` will
 * contain `[{ name: 'id', delimiter: '/', optional: false, repeat: false }]`.
 */ export function pathToRegexp(path, keys, options) {
    if (path instanceof RegExp) return regexpToRegexp(path, keys);
    if (Array.isArray(path)) return arrayToRegexp(path, keys, options);
    return stringToRegexp(path, keys, options);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvcGF0aF90b19yZWdleHBAdjYuMi4wL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVG9rZW5pemVyIHJlc3VsdHMuXG4gKi9cbmludGVyZmFjZSBMZXhUb2tlbiB7XG4gIHR5cGU6XG4gICAgfCBcIk9QRU5cIlxuICAgIHwgXCJDTE9TRVwiXG4gICAgfCBcIlBBVFRFUk5cIlxuICAgIHwgXCJOQU1FXCJcbiAgICB8IFwiQ0hBUlwiXG4gICAgfCBcIkVTQ0FQRURfQ0hBUlwiXG4gICAgfCBcIk1PRElGSUVSXCJcbiAgICB8IFwiRU5EXCI7XG4gIGluZGV4OiBudW1iZXI7XG4gIHZhbHVlOiBzdHJpbmc7XG59XG5cbi8qKlxuICogVG9rZW5pemUgaW5wdXQgc3RyaW5nLlxuICovXG5mdW5jdGlvbiBsZXhlcihzdHI6IHN0cmluZyk6IExleFRva2VuW10ge1xuICBjb25zdCB0b2tlbnM6IExleFRva2VuW10gPSBbXTtcbiAgbGV0IGkgPSAwO1xuXG4gIHdoaWxlIChpIDwgc3RyLmxlbmd0aCkge1xuICAgIGNvbnN0IGNoYXIgPSBzdHJbaV07XG5cbiAgICBpZiAoY2hhciA9PT0gXCIqXCIgfHwgY2hhciA9PT0gXCIrXCIgfHwgY2hhciA9PT0gXCI/XCIpIHtcbiAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJNT0RJRklFUlwiLCBpbmRleDogaSwgdmFsdWU6IHN0cltpKytdIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGNoYXIgPT09IFwiXFxcXFwiKSB7XG4gICAgICB0b2tlbnMucHVzaCh7IHR5cGU6IFwiRVNDQVBFRF9DSEFSXCIsIGluZGV4OiBpKyssIHZhbHVlOiBzdHJbaSsrXSB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChjaGFyID09PSBcIntcIikge1xuICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIk9QRU5cIiwgaW5kZXg6IGksIHZhbHVlOiBzdHJbaSsrXSB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChjaGFyID09PSBcIn1cIikge1xuICAgICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIkNMT1NFXCIsIGluZGV4OiBpLCB2YWx1ZTogc3RyW2krK10gfSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAoY2hhciA9PT0gXCI6XCIpIHtcbiAgICAgIGxldCBuYW1lID0gXCJcIjtcbiAgICAgIGxldCBqID0gaSArIDE7XG5cbiAgICAgIHdoaWxlIChqIDwgc3RyLmxlbmd0aCkge1xuICAgICAgICBjb25zdCBjb2RlID0gc3RyLmNoYXJDb2RlQXQoaik7XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgIC8vIGAwLTlgXG4gICAgICAgICAgKGNvZGUgPj0gNDggJiYgY29kZSA8PSA1NykgfHxcbiAgICAgICAgICAvLyBgQS1aYFxuICAgICAgICAgIChjb2RlID49IDY1ICYmIGNvZGUgPD0gOTApIHx8XG4gICAgICAgICAgLy8gYGEtemBcbiAgICAgICAgICAoY29kZSA+PSA5NyAmJiBjb2RlIDw9IDEyMikgfHxcbiAgICAgICAgICAvLyBgX2BcbiAgICAgICAgICBjb2RlID09PSA5NVxuICAgICAgICApIHtcbiAgICAgICAgICBuYW1lICs9IHN0cltqKytdO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGlmICghbmFtZSkgdGhyb3cgbmV3IFR5cGVFcnJvcihgTWlzc2luZyBwYXJhbWV0ZXIgbmFtZSBhdCAke2l9YCk7XG5cbiAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJOQU1FXCIsIGluZGV4OiBpLCB2YWx1ZTogbmFtZSB9KTtcbiAgICAgIGkgPSBqO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGNoYXIgPT09IFwiKFwiKSB7XG4gICAgICBsZXQgY291bnQgPSAxO1xuICAgICAgbGV0IHBhdHRlcm4gPSBcIlwiO1xuICAgICAgbGV0IGogPSBpICsgMTtcblxuICAgICAgaWYgKHN0cltqXSA9PT0gXCI/XCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgUGF0dGVybiBjYW5ub3Qgc3RhcnQgd2l0aCBcIj9cIiBhdCAke2p9YCk7XG4gICAgICB9XG5cbiAgICAgIHdoaWxlIChqIDwgc3RyLmxlbmd0aCkge1xuICAgICAgICBpZiAoc3RyW2pdID09PSBcIlxcXFxcIikge1xuICAgICAgICAgIHBhdHRlcm4gKz0gc3RyW2orK10gKyBzdHJbaisrXTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdHJbal0gPT09IFwiKVwiKSB7XG4gICAgICAgICAgY291bnQtLTtcbiAgICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICAgIGorKztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChzdHJbal0gPT09IFwiKFwiKSB7XG4gICAgICAgICAgY291bnQrKztcbiAgICAgICAgICBpZiAoc3RyW2ogKyAxXSAhPT0gXCI/XCIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYENhcHR1cmluZyBncm91cHMgYXJlIG5vdCBhbGxvd2VkIGF0ICR7an1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBwYXR0ZXJuICs9IHN0cltqKytdO1xuICAgICAgfVxuXG4gICAgICBpZiAoY291bnQpIHRocm93IG5ldyBUeXBlRXJyb3IoYFVuYmFsYW5jZWQgcGF0dGVybiBhdCAke2l9YCk7XG4gICAgICBpZiAoIXBhdHRlcm4pIHRocm93IG5ldyBUeXBlRXJyb3IoYE1pc3NpbmcgcGF0dGVybiBhdCAke2l9YCk7XG5cbiAgICAgIHRva2Vucy5wdXNoKHsgdHlwZTogXCJQQVRURVJOXCIsIGluZGV4OiBpLCB2YWx1ZTogcGF0dGVybiB9KTtcbiAgICAgIGkgPSBqO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgdG9rZW5zLnB1c2goeyB0eXBlOiBcIkNIQVJcIiwgaW5kZXg6IGksIHZhbHVlOiBzdHJbaSsrXSB9KTtcbiAgfVxuXG4gIHRva2Vucy5wdXNoKHsgdHlwZTogXCJFTkRcIiwgaW5kZXg6IGksIHZhbHVlOiBcIlwiIH0pO1xuXG4gIHJldHVybiB0b2tlbnM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGFyc2VPcHRpb25zIHtcbiAgLyoqXG4gICAqIFNldCB0aGUgZGVmYXVsdCBkZWxpbWl0ZXIgZm9yIHJlcGVhdCBwYXJhbWV0ZXJzLiAoZGVmYXVsdDogYCcvJ2ApXG4gICAqL1xuICBkZWxpbWl0ZXI/OiBzdHJpbmc7XG4gIC8qKlxuICAgKiBMaXN0IG9mIGNoYXJhY3RlcnMgdG8gYXV0b21hdGljYWxseSBjb25zaWRlciBwcmVmaXhlcyB3aGVuIHBhcnNpbmcuXG4gICAqL1xuICBwcmVmaXhlcz86IHN0cmluZztcbn1cblxuLyoqXG4gKiBQYXJzZSBhIHN0cmluZyBmb3IgdGhlIHJhdyB0b2tlbnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZShzdHI6IHN0cmluZywgb3B0aW9uczogUGFyc2VPcHRpb25zID0ge30pOiBUb2tlbltdIHtcbiAgY29uc3QgdG9rZW5zID0gbGV4ZXIoc3RyKTtcbiAgY29uc3QgeyBwcmVmaXhlcyA9IFwiLi9cIiB9ID0gb3B0aW9ucztcbiAgY29uc3QgZGVmYXVsdFBhdHRlcm4gPSBgW14ke2VzY2FwZVN0cmluZyhvcHRpb25zLmRlbGltaXRlciB8fCBcIi8jP1wiKX1dKz9gO1xuICBjb25zdCByZXN1bHQ6IFRva2VuW10gPSBbXTtcbiAgbGV0IGtleSA9IDA7XG4gIGxldCBpID0gMDtcbiAgbGV0IHBhdGggPSBcIlwiO1xuXG4gIGNvbnN0IHRyeUNvbnN1bWUgPSAodHlwZTogTGV4VG9rZW5bXCJ0eXBlXCJdKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcbiAgICBpZiAoaSA8IHRva2Vucy5sZW5ndGggJiYgdG9rZW5zW2ldLnR5cGUgPT09IHR5cGUpIHJldHVybiB0b2tlbnNbaSsrXS52YWx1ZTtcbiAgfTtcblxuICBjb25zdCBtdXN0Q29uc3VtZSA9ICh0eXBlOiBMZXhUb2tlbltcInR5cGVcIl0pOiBzdHJpbmcgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gdHJ5Q29uc3VtZSh0eXBlKTtcbiAgICBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkgcmV0dXJuIHZhbHVlO1xuICAgIGNvbnN0IHsgdHlwZTogbmV4dFR5cGUsIGluZGV4IH0gPSB0b2tlbnNbaV07XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgVW5leHBlY3RlZCAke25leHRUeXBlfSBhdCAke2luZGV4fSwgZXhwZWN0ZWQgJHt0eXBlfWApO1xuICB9O1xuXG4gIGNvbnN0IGNvbnN1bWVUZXh0ID0gKCk6IHN0cmluZyA9PiB7XG4gICAgbGV0IHJlc3VsdCA9IFwiXCI7XG4gICAgbGV0IHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lXG4gICAgd2hpbGUgKCh2YWx1ZSA9IHRyeUNvbnN1bWUoXCJDSEFSXCIpIHx8IHRyeUNvbnN1bWUoXCJFU0NBUEVEX0NIQVJcIikpKSB7XG4gICAgICByZXN1bHQgKz0gdmFsdWU7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgd2hpbGUgKGkgPCB0b2tlbnMubGVuZ3RoKSB7XG4gICAgY29uc3QgY2hhciA9IHRyeUNvbnN1bWUoXCJDSEFSXCIpO1xuICAgIGNvbnN0IG5hbWUgPSB0cnlDb25zdW1lKFwiTkFNRVwiKTtcbiAgICBjb25zdCBwYXR0ZXJuID0gdHJ5Q29uc3VtZShcIlBBVFRFUk5cIik7XG5cbiAgICBpZiAobmFtZSB8fCBwYXR0ZXJuKSB7XG4gICAgICBsZXQgcHJlZml4ID0gY2hhciB8fCBcIlwiO1xuXG4gICAgICBpZiAocHJlZml4ZXMuaW5kZXhPZihwcmVmaXgpID09PSAtMSkge1xuICAgICAgICBwYXRoICs9IHByZWZpeDtcbiAgICAgICAgcHJlZml4ID0gXCJcIjtcbiAgICAgIH1cblxuICAgICAgaWYgKHBhdGgpIHtcbiAgICAgICAgcmVzdWx0LnB1c2gocGF0aCk7XG4gICAgICAgIHBhdGggPSBcIlwiO1xuICAgICAgfVxuXG4gICAgICByZXN1bHQucHVzaCh7XG4gICAgICAgIG5hbWU6IG5hbWUgfHwga2V5KyssXG4gICAgICAgIHByZWZpeCxcbiAgICAgICAgc3VmZml4OiBcIlwiLFxuICAgICAgICBwYXR0ZXJuOiBwYXR0ZXJuIHx8IGRlZmF1bHRQYXR0ZXJuLFxuICAgICAgICBtb2RpZmllcjogdHJ5Q29uc3VtZShcIk1PRElGSUVSXCIpIHx8IFwiXCJcbiAgICAgIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3QgdmFsdWUgPSBjaGFyIHx8IHRyeUNvbnN1bWUoXCJFU0NBUEVEX0NIQVJcIik7XG4gICAgaWYgKHZhbHVlKSB7XG4gICAgICBwYXRoICs9IHZhbHVlO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKHBhdGgpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHBhdGgpO1xuICAgICAgcGF0aCA9IFwiXCI7XG4gICAgfVxuXG4gICAgY29uc3Qgb3BlbiA9IHRyeUNvbnN1bWUoXCJPUEVOXCIpO1xuICAgIGlmIChvcGVuKSB7XG4gICAgICBjb25zdCBwcmVmaXggPSBjb25zdW1lVGV4dCgpO1xuICAgICAgY29uc3QgbmFtZSA9IHRyeUNvbnN1bWUoXCJOQU1FXCIpIHx8IFwiXCI7XG4gICAgICBjb25zdCBwYXR0ZXJuID0gdHJ5Q29uc3VtZShcIlBBVFRFUk5cIikgfHwgXCJcIjtcbiAgICAgIGNvbnN0IHN1ZmZpeCA9IGNvbnN1bWVUZXh0KCk7XG5cbiAgICAgIG11c3RDb25zdW1lKFwiQ0xPU0VcIik7XG5cbiAgICAgIHJlc3VsdC5wdXNoKHtcbiAgICAgICAgbmFtZTogbmFtZSB8fCAocGF0dGVybiA/IGtleSsrIDogXCJcIiksXG4gICAgICAgIHBhdHRlcm46IG5hbWUgJiYgIXBhdHRlcm4gPyBkZWZhdWx0UGF0dGVybiA6IHBhdHRlcm4sXG4gICAgICAgIHByZWZpeCxcbiAgICAgICAgc3VmZml4LFxuICAgICAgICBtb2RpZmllcjogdHJ5Q29uc3VtZShcIk1PRElGSUVSXCIpIHx8IFwiXCJcbiAgICAgIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgbXVzdENvbnN1bWUoXCJFTkRcIik7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFRva2Vuc1RvRnVuY3Rpb25PcHRpb25zIHtcbiAgLyoqXG4gICAqIFdoZW4gYHRydWVgIHRoZSByZWdleHAgd2lsbCBiZSBjYXNlIHNlbnNpdGl2ZS4gKGRlZmF1bHQ6IGBmYWxzZWApXG4gICAqL1xuICBzZW5zaXRpdmU/OiBib29sZWFuO1xuICAvKipcbiAgICogRnVuY3Rpb24gZm9yIGVuY29kaW5nIGlucHV0IHN0cmluZ3MgZm9yIG91dHB1dC5cbiAgICovXG4gIGVuY29kZT86ICh2YWx1ZTogc3RyaW5nLCB0b2tlbjogS2V5KSA9PiBzdHJpbmc7XG4gIC8qKlxuICAgKiBXaGVuIGBmYWxzZWAgdGhlIGZ1bmN0aW9uIGNhbiBwcm9kdWNlIGFuIGludmFsaWQgKHVubWF0Y2hlZCkgcGF0aC4gKGRlZmF1bHQ6IGB0cnVlYClcbiAgICovXG4gIHZhbGlkYXRlPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBDb21waWxlIGEgc3RyaW5nIHRvIGEgdGVtcGxhdGUgZnVuY3Rpb24gZm9yIHRoZSBwYXRoLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcGlsZTxQIGV4dGVuZHMgb2JqZWN0ID0gb2JqZWN0PihcbiAgc3RyOiBzdHJpbmcsXG4gIG9wdGlvbnM/OiBQYXJzZU9wdGlvbnMgJiBUb2tlbnNUb0Z1bmN0aW9uT3B0aW9uc1xuKSB7XG4gIHJldHVybiB0b2tlbnNUb0Z1bmN0aW9uPFA+KHBhcnNlKHN0ciwgb3B0aW9ucyksIG9wdGlvbnMpO1xufVxuXG5leHBvcnQgdHlwZSBQYXRoRnVuY3Rpb248UCBleHRlbmRzIG9iamVjdCA9IG9iamVjdD4gPSAoZGF0YT86IFApID0+IHN0cmluZztcblxuLyoqXG4gKiBFeHBvc2UgYSBtZXRob2QgZm9yIHRyYW5zZm9ybWluZyB0b2tlbnMgaW50byB0aGUgcGF0aCBmdW5jdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRva2Vuc1RvRnVuY3Rpb248UCBleHRlbmRzIG9iamVjdCA9IG9iamVjdD4oXG4gIHRva2VuczogVG9rZW5bXSxcbiAgb3B0aW9uczogVG9rZW5zVG9GdW5jdGlvbk9wdGlvbnMgPSB7fVxuKTogUGF0aEZ1bmN0aW9uPFA+IHtcbiAgY29uc3QgcmVGbGFncyA9IGZsYWdzKG9wdGlvbnMpO1xuICBjb25zdCB7IGVuY29kZSA9ICh4OiBzdHJpbmcpID0+IHgsIHZhbGlkYXRlID0gdHJ1ZSB9ID0gb3B0aW9ucztcblxuICAvLyBDb21waWxlIGFsbCB0aGUgdG9rZW5zIGludG8gcmVnZXhwcy5cbiAgY29uc3QgbWF0Y2hlcyA9IHRva2Vucy5tYXAodG9rZW4gPT4ge1xuICAgIGlmICh0eXBlb2YgdG9rZW4gPT09IFwib2JqZWN0XCIpIHtcbiAgICAgIHJldHVybiBuZXcgUmVnRXhwKGBeKD86JHt0b2tlbi5wYXR0ZXJufSkkYCwgcmVGbGFncyk7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gKGRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT4gfCBudWxsIHwgdW5kZWZpbmVkKSA9PiB7XG4gICAgbGV0IHBhdGggPSBcIlwiO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHRva2VuID0gdG9rZW5zW2ldO1xuXG4gICAgICBpZiAodHlwZW9mIHRva2VuID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHBhdGggKz0gdG9rZW47XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB2YWx1ZSA9IGRhdGEgPyBkYXRhW3Rva2VuLm5hbWVdIDogdW5kZWZpbmVkO1xuICAgICAgY29uc3Qgb3B0aW9uYWwgPSB0b2tlbi5tb2RpZmllciA9PT0gXCI/XCIgfHwgdG9rZW4ubW9kaWZpZXIgPT09IFwiKlwiO1xuICAgICAgY29uc3QgcmVwZWF0ID0gdG9rZW4ubW9kaWZpZXIgPT09IFwiKlwiIHx8IHRva2VuLm1vZGlmaWVyID09PSBcIitcIjtcblxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgIGlmICghcmVwZWF0KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcbiAgICAgICAgICAgIGBFeHBlY3RlZCBcIiR7dG9rZW4ubmFtZX1cIiB0byBub3QgcmVwZWF0LCBidXQgZ290IGFuIGFycmF5YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmFsdWUubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgaWYgKG9wdGlvbmFsKSBjb250aW51ZTtcblxuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoYEV4cGVjdGVkIFwiJHt0b2tlbi5uYW1lfVwiIHRvIG5vdCBiZSBlbXB0eWApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCB2YWx1ZS5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IHNlZ21lbnQgPSBlbmNvZGUodmFsdWVbal0sIHRva2VuKTtcblxuICAgICAgICAgIGlmICh2YWxpZGF0ZSAmJiAhKG1hdGNoZXNbaV0gYXMgUmVnRXhwKS50ZXN0KHNlZ21lbnQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICAgICAgICBgRXhwZWN0ZWQgYWxsIFwiJHt0b2tlbi5uYW1lfVwiIHRvIG1hdGNoIFwiJHt0b2tlbi5wYXR0ZXJufVwiLCBidXQgZ290IFwiJHtzZWdtZW50fVwiYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBwYXRoICs9IHRva2VuLnByZWZpeCArIHNlZ21lbnQgKyB0b2tlbi5zdWZmaXg7XG4gICAgICAgIH1cblxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJzdHJpbmdcIiB8fCB0eXBlb2YgdmFsdWUgPT09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgY29uc3Qgc2VnbWVudCA9IGVuY29kZShTdHJpbmcodmFsdWUpLCB0b2tlbik7XG5cbiAgICAgICAgaWYgKHZhbGlkYXRlICYmICEobWF0Y2hlc1tpXSBhcyBSZWdFeHApLnRlc3Qoc2VnbWVudCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFxuICAgICAgICAgICAgYEV4cGVjdGVkIFwiJHt0b2tlbi5uYW1lfVwiIHRvIG1hdGNoIFwiJHt0b2tlbi5wYXR0ZXJufVwiLCBidXQgZ290IFwiJHtzZWdtZW50fVwiYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBwYXRoICs9IHRva2VuLnByZWZpeCArIHNlZ21lbnQgKyB0b2tlbi5zdWZmaXg7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAob3B0aW9uYWwpIGNvbnRpbnVlO1xuXG4gICAgICBjb25zdCB0eXBlT2ZNZXNzYWdlID0gcmVwZWF0ID8gXCJhbiBhcnJheVwiIDogXCJhIHN0cmluZ1wiO1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihgRXhwZWN0ZWQgXCIke3Rva2VuLm5hbWV9XCIgdG8gYmUgJHt0eXBlT2ZNZXNzYWdlfWApO1xuICAgIH1cblxuICAgIHJldHVybiBwYXRoO1xuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlZ2V4cFRvRnVuY3Rpb25PcHRpb25zIHtcbiAgLyoqXG4gICAqIEZ1bmN0aW9uIGZvciBkZWNvZGluZyBzdHJpbmdzIGZvciBwYXJhbXMuXG4gICAqL1xuICBkZWNvZGU/OiAodmFsdWU6IHN0cmluZywgdG9rZW46IEtleSkgPT4gc3RyaW5nO1xufVxuXG4vKipcbiAqIEEgbWF0Y2ggcmVzdWx0IGNvbnRhaW5zIGRhdGEgYWJvdXQgdGhlIHBhdGggbWF0Y2guXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgTWF0Y2hSZXN1bHQ8UCBleHRlbmRzIG9iamVjdCA9IG9iamVjdD4ge1xuICBwYXRoOiBzdHJpbmc7XG4gIGluZGV4OiBudW1iZXI7XG4gIHBhcmFtczogUDtcbn1cblxuLyoqXG4gKiBBIG1hdGNoIGlzIGVpdGhlciBgZmFsc2VgIChubyBtYXRjaCkgb3IgYSBtYXRjaCByZXN1bHQuXG4gKi9cbmV4cG9ydCB0eXBlIE1hdGNoPFAgZXh0ZW5kcyBvYmplY3QgPSBvYmplY3Q+ID0gZmFsc2UgfCBNYXRjaFJlc3VsdDxQPjtcblxuLyoqXG4gKiBUaGUgbWF0Y2ggZnVuY3Rpb24gdGFrZXMgYSBzdHJpbmcgYW5kIHJldHVybnMgd2hldGhlciBpdCBtYXRjaGVkIHRoZSBwYXRoLlxuICovXG5leHBvcnQgdHlwZSBNYXRjaEZ1bmN0aW9uPFAgZXh0ZW5kcyBvYmplY3QgPSBvYmplY3Q+ID0gKFxuICBwYXRoOiBzdHJpbmdcbikgPT4gTWF0Y2g8UD47XG5cbi8qKlxuICogQ3JlYXRlIHBhdGggbWF0Y2ggZnVuY3Rpb24gZnJvbSBgcGF0aC10by1yZWdleHBgIHNwZWMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXRjaDxQIGV4dGVuZHMgb2JqZWN0ID0gb2JqZWN0PihcbiAgc3RyOiBQYXRoLFxuICBvcHRpb25zPzogUGFyc2VPcHRpb25zICYgVG9rZW5zVG9SZWdleHBPcHRpb25zICYgUmVnZXhwVG9GdW5jdGlvbk9wdGlvbnNcbikge1xuICBjb25zdCBrZXlzOiBLZXlbXSA9IFtdO1xuICBjb25zdCByZSA9IHBhdGhUb1JlZ2V4cChzdHIsIGtleXMsIG9wdGlvbnMpO1xuICByZXR1cm4gcmVnZXhwVG9GdW5jdGlvbjxQPihyZSwga2V5cywgb3B0aW9ucyk7XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgcGF0aCBtYXRjaCBmdW5jdGlvbiBmcm9tIGBwYXRoLXRvLXJlZ2V4cGAgb3V0cHV0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnZXhwVG9GdW5jdGlvbjxQIGV4dGVuZHMgb2JqZWN0ID0gb2JqZWN0PihcbiAgcmU6IFJlZ0V4cCxcbiAga2V5czogS2V5W10sXG4gIG9wdGlvbnM6IFJlZ2V4cFRvRnVuY3Rpb25PcHRpb25zID0ge31cbik6IE1hdGNoRnVuY3Rpb248UD4ge1xuICBjb25zdCB7IGRlY29kZSA9ICh4OiBzdHJpbmcpID0+IHggfSA9IG9wdGlvbnM7XG5cbiAgcmV0dXJuIGZ1bmN0aW9uKHBhdGhuYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtID0gcmUuZXhlYyhwYXRobmFtZSk7XG4gICAgaWYgKCFtKSByZXR1cm4gZmFsc2U7XG5cbiAgICBjb25zdCB7IDA6IHBhdGgsIGluZGV4IH0gPSBtO1xuICAgIGNvbnN0IHBhcmFtcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cbiAgICBmb3IgKGxldCBpID0gMTsgaSA8IG0ubGVuZ3RoOyBpKyspIHtcbiAgICAgIC8vIHRzbGludDpkaXNhYmxlLW5leHQtbGluZVxuICAgICAgaWYgKG1baV0gPT09IHVuZGVmaW5lZCkgY29udGludWU7XG5cbiAgICAgIGNvbnN0IGtleSA9IGtleXNbaSAtIDFdO1xuXG4gICAgICBpZiAoa2V5Lm1vZGlmaWVyID09PSBcIipcIiB8fCBrZXkubW9kaWZpZXIgPT09IFwiK1wiKSB7XG4gICAgICAgIHBhcmFtc1trZXkubmFtZV0gPSBtW2ldLnNwbGl0KGtleS5wcmVmaXggKyBrZXkuc3VmZml4KS5tYXAodmFsdWUgPT4ge1xuICAgICAgICAgIHJldHVybiBkZWNvZGUodmFsdWUsIGtleSk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGFyYW1zW2tleS5uYW1lXSA9IGRlY29kZShtW2ldLCBrZXkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IHBhdGgsIGluZGV4LCBwYXJhbXMgfTtcbiAgfTtcbn1cblxuLyoqXG4gKiBFc2NhcGUgYSByZWd1bGFyIGV4cHJlc3Npb24gc3RyaW5nLlxuICovXG5mdW5jdGlvbiBlc2NhcGVTdHJpbmcoc3RyOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC8oWy4rKj89XiE6JHt9KClbXFxdfC9cXFxcXSkvZywgXCJcXFxcJDFcIik7XG59XG5cbi8qKlxuICogR2V0IHRoZSBmbGFncyBmb3IgYSByZWdleHAgZnJvbSB0aGUgb3B0aW9ucy5cbiAqL1xuZnVuY3Rpb24gZmxhZ3Mob3B0aW9ucz86IHsgc2Vuc2l0aXZlPzogYm9vbGVhbiB9KSB7XG4gIHJldHVybiBvcHRpb25zICYmIG9wdGlvbnMuc2Vuc2l0aXZlID8gXCJcIiA6IFwiaVwiO1xufVxuXG4vKipcbiAqIE1ldGFkYXRhIGFib3V0IGEga2V5LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEtleSB7XG4gIG5hbWU6IHN0cmluZyB8IG51bWJlcjtcbiAgcHJlZml4OiBzdHJpbmc7XG4gIHN1ZmZpeDogc3RyaW5nO1xuICBwYXR0ZXJuOiBzdHJpbmc7XG4gIG1vZGlmaWVyOiBzdHJpbmc7XG59XG5cbi8qKlxuICogQSB0b2tlbiBpcyBhIHN0cmluZyAobm90aGluZyBzcGVjaWFsKSBvciBrZXkgbWV0YWRhdGEgKGNhcHR1cmUgZ3JvdXApLlxuICovXG5leHBvcnQgdHlwZSBUb2tlbiA9IHN0cmluZyB8IEtleTtcblxuLyoqXG4gKiBQdWxsIG91dCBrZXlzIGZyb20gYSByZWdleHAuXG4gKi9cbmZ1bmN0aW9uIHJlZ2V4cFRvUmVnZXhwKHBhdGg6IFJlZ0V4cCwga2V5cz86IEtleVtdKTogUmVnRXhwIHtcbiAgaWYgKCFrZXlzKSByZXR1cm4gcGF0aDtcblxuICBjb25zdCBncm91cHNSZWdleCA9IC9cXCgoPzpcXD88KC4qPyk+KT8oPyFcXD8pL2c7XG5cbiAgbGV0IGluZGV4ID0gMDtcbiAgbGV0IGV4ZWNSZXN1bHQgPSBncm91cHNSZWdleC5leGVjKHBhdGguc291cmNlKTtcbiAgd2hpbGUgKGV4ZWNSZXN1bHQpIHtcbiAgICBrZXlzLnB1c2goe1xuICAgICAgLy8gVXNlIHBhcmVudGhlc2l6ZWQgc3Vic3RyaW5nIG1hdGNoIGlmIGF2YWlsYWJsZSwgaW5kZXggb3RoZXJ3aXNlXG4gICAgICBuYW1lOiBleGVjUmVzdWx0WzFdIHx8IGluZGV4KyssXG4gICAgICBwcmVmaXg6IFwiXCIsXG4gICAgICBzdWZmaXg6IFwiXCIsXG4gICAgICBtb2RpZmllcjogXCJcIixcbiAgICAgIHBhdHRlcm46IFwiXCJcbiAgICB9KTtcbiAgICBleGVjUmVzdWx0ID0gZ3JvdXBzUmVnZXguZXhlYyhwYXRoLnNvdXJjZSk7XG4gIH1cblxuICByZXR1cm4gcGF0aDtcbn1cblxuLyoqXG4gKiBUcmFuc2Zvcm0gYW4gYXJyYXkgaW50byBhIHJlZ2V4cC5cbiAqL1xuZnVuY3Rpb24gYXJyYXlUb1JlZ2V4cChcbiAgcGF0aHM6IEFycmF5PHN0cmluZyB8IFJlZ0V4cD4sXG4gIGtleXM/OiBLZXlbXSxcbiAgb3B0aW9ucz86IFRva2Vuc1RvUmVnZXhwT3B0aW9ucyAmIFBhcnNlT3B0aW9uc1xuKTogUmVnRXhwIHtcbiAgY29uc3QgcGFydHMgPSBwYXRocy5tYXAocGF0aCA9PiBwYXRoVG9SZWdleHAocGF0aCwga2V5cywgb3B0aW9ucykuc291cmNlKTtcbiAgcmV0dXJuIG5ldyBSZWdFeHAoYCg/OiR7cGFydHMuam9pbihcInxcIil9KWAsIGZsYWdzKG9wdGlvbnMpKTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBwYXRoIHJlZ2V4cCBmcm9tIHN0cmluZyBpbnB1dC5cbiAqL1xuZnVuY3Rpb24gc3RyaW5nVG9SZWdleHAoXG4gIHBhdGg6IHN0cmluZyxcbiAga2V5cz86IEtleVtdLFxuICBvcHRpb25zPzogVG9rZW5zVG9SZWdleHBPcHRpb25zICYgUGFyc2VPcHRpb25zXG4pIHtcbiAgcmV0dXJuIHRva2Vuc1RvUmVnZXhwKHBhcnNlKHBhdGgsIG9wdGlvbnMpLCBrZXlzLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUb2tlbnNUb1JlZ2V4cE9wdGlvbnMge1xuICAvKipcbiAgICogV2hlbiBgdHJ1ZWAgdGhlIHJlZ2V4cCB3aWxsIGJlIGNhc2Ugc2Vuc2l0aXZlLiAoZGVmYXVsdDogYGZhbHNlYClcbiAgICovXG4gIHNlbnNpdGl2ZT86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBXaGVuIGB0cnVlYCB0aGUgcmVnZXhwIHdvbid0IGFsbG93IGFuIG9wdGlvbmFsIHRyYWlsaW5nIGRlbGltaXRlciB0byBtYXRjaC4gKGRlZmF1bHQ6IGBmYWxzZWApXG4gICAqL1xuICBzdHJpY3Q/OiBib29sZWFuO1xuICAvKipcbiAgICogV2hlbiBgdHJ1ZWAgdGhlIHJlZ2V4cCB3aWxsIG1hdGNoIHRvIHRoZSBlbmQgb2YgdGhlIHN0cmluZy4gKGRlZmF1bHQ6IGB0cnVlYClcbiAgICovXG4gIGVuZD86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBXaGVuIGB0cnVlYCB0aGUgcmVnZXhwIHdpbGwgbWF0Y2ggZnJvbSB0aGUgYmVnaW5uaW5nIG9mIHRoZSBzdHJpbmcuIChkZWZhdWx0OiBgdHJ1ZWApXG4gICAqL1xuICBzdGFydD86IGJvb2xlYW47XG4gIC8qKlxuICAgKiBTZXRzIHRoZSBmaW5hbCBjaGFyYWN0ZXIgZm9yIG5vbi1lbmRpbmcgb3B0aW1pc3RpYyBtYXRjaGVzLiAoZGVmYXVsdDogYC9gKVxuICAgKi9cbiAgZGVsaW1pdGVyPzogc3RyaW5nO1xuICAvKipcbiAgICogTGlzdCBvZiBjaGFyYWN0ZXJzIHRoYXQgY2FuIGFsc28gYmUgXCJlbmRcIiBjaGFyYWN0ZXJzLlxuICAgKi9cbiAgZW5kc1dpdGg/OiBzdHJpbmc7XG4gIC8qKlxuICAgKiBFbmNvZGUgcGF0aCB0b2tlbnMgZm9yIHVzZSBpbiB0aGUgYFJlZ0V4cGAuXG4gICAqL1xuICBlbmNvZGU/OiAodmFsdWU6IHN0cmluZykgPT4gc3RyaW5nO1xufVxuXG4vKipcbiAqIEV4cG9zZSBhIGZ1bmN0aW9uIGZvciB0YWtpbmcgdG9rZW5zIGFuZCByZXR1cm5pbmcgYSBSZWdFeHAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b2tlbnNUb1JlZ2V4cChcbiAgdG9rZW5zOiBUb2tlbltdLFxuICBrZXlzPzogS2V5W10sXG4gIG9wdGlvbnM6IFRva2Vuc1RvUmVnZXhwT3B0aW9ucyA9IHt9XG4pIHtcbiAgY29uc3Qge1xuICAgIHN0cmljdCA9IGZhbHNlLFxuICAgIHN0YXJ0ID0gdHJ1ZSxcbiAgICBlbmQgPSB0cnVlLFxuICAgIGVuY29kZSA9ICh4OiBzdHJpbmcpID0+IHhcbiAgfSA9IG9wdGlvbnM7XG4gIGNvbnN0IGVuZHNXaXRoID0gYFske2VzY2FwZVN0cmluZyhvcHRpb25zLmVuZHNXaXRoIHx8IFwiXCIpfV18JGA7XG4gIGNvbnN0IGRlbGltaXRlciA9IGBbJHtlc2NhcGVTdHJpbmcob3B0aW9ucy5kZWxpbWl0ZXIgfHwgXCIvIz9cIil9XWA7XG4gIGxldCByb3V0ZSA9IHN0YXJ0ID8gXCJeXCIgOiBcIlwiO1xuXG4gIC8vIEl0ZXJhdGUgb3ZlciB0aGUgdG9rZW5zIGFuZCBjcmVhdGUgb3VyIHJlZ2V4cCBzdHJpbmcuXG4gIGZvciAoY29uc3QgdG9rZW4gb2YgdG9rZW5zKSB7XG4gICAgaWYgKHR5cGVvZiB0b2tlbiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgcm91dGUgKz0gZXNjYXBlU3RyaW5nKGVuY29kZSh0b2tlbikpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBwcmVmaXggPSBlc2NhcGVTdHJpbmcoZW5jb2RlKHRva2VuLnByZWZpeCkpO1xuICAgICAgY29uc3Qgc3VmZml4ID0gZXNjYXBlU3RyaW5nKGVuY29kZSh0b2tlbi5zdWZmaXgpKTtcblxuICAgICAgaWYgKHRva2VuLnBhdHRlcm4pIHtcbiAgICAgICAgaWYgKGtleXMpIGtleXMucHVzaCh0b2tlbik7XG5cbiAgICAgICAgaWYgKHByZWZpeCB8fCBzdWZmaXgpIHtcbiAgICAgICAgICBpZiAodG9rZW4ubW9kaWZpZXIgPT09IFwiK1wiIHx8IHRva2VuLm1vZGlmaWVyID09PSBcIipcIikge1xuICAgICAgICAgICAgY29uc3QgbW9kID0gdG9rZW4ubW9kaWZpZXIgPT09IFwiKlwiID8gXCI/XCIgOiBcIlwiO1xuICAgICAgICAgICAgcm91dGUgKz0gYCg/OiR7cHJlZml4fSgoPzoke3Rva2VuLnBhdHRlcm59KSg/OiR7c3VmZml4fSR7cHJlZml4fSg/OiR7dG9rZW4ucGF0dGVybn0pKSopJHtzdWZmaXh9KSR7bW9kfWA7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJvdXRlICs9IGAoPzoke3ByZWZpeH0oJHt0b2tlbi5wYXR0ZXJufSkke3N1ZmZpeH0pJHt0b2tlbi5tb2RpZmllcn1gO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByb3V0ZSArPSBgKCR7dG9rZW4ucGF0dGVybn0pJHt0b2tlbi5tb2RpZmllcn1gO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByb3V0ZSArPSBgKD86JHtwcmVmaXh9JHtzdWZmaXh9KSR7dG9rZW4ubW9kaWZpZXJ9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAoZW5kKSB7XG4gICAgaWYgKCFzdHJpY3QpIHJvdXRlICs9IGAke2RlbGltaXRlcn0/YDtcblxuICAgIHJvdXRlICs9ICFvcHRpb25zLmVuZHNXaXRoID8gXCIkXCIgOiBgKD89JHtlbmRzV2l0aH0pYDtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBlbmRUb2tlbiA9IHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV07XG4gICAgY29uc3QgaXNFbmREZWxpbWl0ZWQgPVxuICAgICAgdHlwZW9mIGVuZFRva2VuID09PSBcInN0cmluZ1wiXG4gICAgICAgID8gZGVsaW1pdGVyLmluZGV4T2YoZW5kVG9rZW5bZW5kVG9rZW4ubGVuZ3RoIC0gMV0pID4gLTFcbiAgICAgICAgOiAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmVcbiAgICAgICAgICBlbmRUb2tlbiA9PT0gdW5kZWZpbmVkO1xuXG4gICAgaWYgKCFzdHJpY3QpIHtcbiAgICAgIHJvdXRlICs9IGAoPzoke2RlbGltaXRlcn0oPz0ke2VuZHNXaXRofSkpP2A7XG4gICAgfVxuXG4gICAgaWYgKCFpc0VuZERlbGltaXRlZCkge1xuICAgICAgcm91dGUgKz0gYCg/PSR7ZGVsaW1pdGVyfXwke2VuZHNXaXRofSlgO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBuZXcgUmVnRXhwKHJvdXRlLCBmbGFncyhvcHRpb25zKSk7XG59XG5cbi8qKlxuICogU3VwcG9ydGVkIGBwYXRoLXRvLXJlZ2V4cGAgaW5wdXQgdHlwZXMuXG4gKi9cbmV4cG9ydCB0eXBlIFBhdGggPSBzdHJpbmcgfCBSZWdFeHAgfCBBcnJheTxzdHJpbmcgfCBSZWdFeHA+O1xuXG4vKipcbiAqIE5vcm1hbGl6ZSB0aGUgZ2l2ZW4gcGF0aCBzdHJpbmcsIHJldHVybmluZyBhIHJlZ3VsYXIgZXhwcmVzc2lvbi5cbiAqXG4gKiBBbiBlbXB0eSBhcnJheSBjYW4gYmUgcGFzc2VkIGluIGZvciB0aGUga2V5cywgd2hpY2ggd2lsbCBob2xkIHRoZVxuICogcGxhY2Vob2xkZXIga2V5IGRlc2NyaXB0aW9ucy4gRm9yIGV4YW1wbGUsIHVzaW5nIGAvdXNlci86aWRgLCBga2V5c2Agd2lsbFxuICogY29udGFpbiBgW3sgbmFtZTogJ2lkJywgZGVsaW1pdGVyOiAnLycsIG9wdGlvbmFsOiBmYWxzZSwgcmVwZWF0OiBmYWxzZSB9XWAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXRoVG9SZWdleHAoXG4gIHBhdGg6IFBhdGgsXG4gIGtleXM/OiBLZXlbXSxcbiAgb3B0aW9ucz86IFRva2Vuc1RvUmVnZXhwT3B0aW9ucyAmIFBhcnNlT3B0aW9uc1xuKSB7XG4gIGlmIChwYXRoIGluc3RhbmNlb2YgUmVnRXhwKSByZXR1cm4gcmVnZXhwVG9SZWdleHAocGF0aCwga2V5cyk7XG4gIGlmIChBcnJheS5pc0FycmF5KHBhdGgpKSByZXR1cm4gYXJyYXlUb1JlZ2V4cChwYXRoLCBrZXlzLCBvcHRpb25zKTtcbiAgcmV0dXJuIHN0cmluZ1RvUmVnZXhwKHBhdGgsIGtleXMsIG9wdGlvbnMp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