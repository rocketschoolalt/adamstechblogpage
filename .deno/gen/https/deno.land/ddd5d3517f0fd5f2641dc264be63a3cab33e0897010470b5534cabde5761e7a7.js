// Ported from js-yaml v3.13.1:
// https://github.com/nodeca/js-yaml/commit/665aadda42349dcae869f12040d9b10ef18d12da
// Copyright 2011-2015 by Vitaly Puzrin. All rights reserved. MIT license.
// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
import { YAMLError } from "../error.ts";
import { Mark } from "../mark.ts";
import * as common from "../utils.ts";
import { LoaderState } from "./loader_state.ts";
const { hasOwn  } = Object;
const CONTEXT_FLOW_IN = 1;
const CONTEXT_FLOW_OUT = 2;
const CONTEXT_BLOCK_IN = 3;
const CONTEXT_BLOCK_OUT = 4;
const CHOMPING_CLIP = 1;
const CHOMPING_STRIP = 2;
const CHOMPING_KEEP = 3;
const PATTERN_NON_PRINTABLE = // deno-lint-ignore no-control-regex
/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
const PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
const PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
const PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
const PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
    return Object.prototype.toString.call(obj);
}
function isEOL(c) {
    return c === 0x0a || /* LF */ c === 0x0d /* CR */ ;
}
function isWhiteSpace(c) {
    return c === 0x09 || /* Tab */ c === 0x20 /* Space */ ;
}
function isWsOrEol(c) {
    return c === 0x09 /* Tab */  || c === 0x20 /* Space */  || c === 0x0a /* LF */  || c === 0x0d /* CR */ ;
}
function isFlowIndicator(c) {
    return c === 0x2c /* , */  || c === 0x5b /* [ */  || c === 0x5d /* ] */  || c === 0x7b /* { */  || c === 0x7d /* } */ ;
}
function fromHexCode(c) {
    if (0x30 <= /* 0 */ c && c <= 0x39 /* 9 */ ) {
        return c - 0x30;
    }
    const lc = c | 0x20;
    if (0x61 <= /* a */ lc && lc <= 0x66 /* f */ ) {
        return lc - 0x61 + 10;
    }
    return -1;
}
function escapedHexLen(c) {
    if (c === 0x78 /* x */ ) {
        return 2;
    }
    if (c === 0x75 /* u */ ) {
        return 4;
    }
    if (c === 0x55 /* U */ ) {
        return 8;
    }
    return 0;
}
function fromDecimalCode(c) {
    if (0x30 <= /* 0 */ c && c <= 0x39 /* 9 */ ) {
        return c - 0x30;
    }
    return -1;
}
function simpleEscapeSequence(c) {
    return c === 0x30 /* 0 */  ? "\x00" : c === 0x61 /* a */  ? "\x07" : c === 0x62 /* b */  ? "\x08" : c === 0x74 /* t */  ? "\x09" : c === 0x09 /* Tab */  ? "\x09" : c === 0x6e /* n */  ? "\x0A" : c === 0x76 /* v */  ? "\x0B" : c === 0x66 /* f */  ? "\x0C" : c === 0x72 /* r */  ? "\x0D" : c === 0x65 /* e */  ? "\x1B" : c === 0x20 /* Space */  ? " " : c === 0x22 /* " */  ? "\x22" : c === 0x2f /* / */  ? "/" : c === 0x5c /* \ */  ? "\x5C" : c === 0x4e /* N */  ? "\x85" : c === 0x5f /* _ */  ? "\xA0" : c === 0x4c /* L */  ? "\u2028" : c === 0x50 /* P */  ? "\u2029" : "";
}
function charFromCodepoint(c) {
    if (c <= 0xffff) {
        return String.fromCharCode(c);
    }
    // Encode UTF-16 surrogate pair
    // https://en.wikipedia.org/wiki/UTF-16#Code_points_U.2B010000_to_U.2B10FFFF
    return String.fromCharCode((c - 0x010000 >> 10) + 0xd800, (c - 0x010000 & 0x03ff) + 0xdc00);
}
const simpleEscapeCheck = Array.from({
    length: 256
}); // integer, for fast access
const simpleEscapeMap = Array.from({
    length: 256
});
for(let i = 0; i < 256; i++){
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
}
function generateError(state, message) {
    return new YAMLError(message, new Mark(state.filename, state.input, state.position, state.line, state.position - state.lineStart));
}
function throwError(state, message) {
    throw generateError(state, message);
}
function throwWarning(state, message) {
    if (state.onWarning) {
        state.onWarning.call(null, generateError(state, message));
    }
}
const directiveHandlers = {
    YAML (state, _name, ...args) {
        if (state.version !== null) {
            return throwError(state, "duplication of %YAML directive");
        }
        if (args.length !== 1) {
            return throwError(state, "YAML directive accepts exactly one argument");
        }
        const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
        if (match === null) {
            return throwError(state, "ill-formed argument of the YAML directive");
        }
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        if (major !== 1) {
            return throwError(state, "unacceptable YAML version of the document");
        }
        state.version = args[0];
        state.checkLineBreaks = minor < 2;
        if (minor !== 1 && minor !== 2) {
            return throwWarning(state, "unsupported YAML version of the document");
        }
    },
    TAG (state, _name, ...args) {
        if (args.length !== 2) {
            return throwError(state, "TAG directive accepts exactly two arguments");
        }
        const handle = args[0];
        const prefix = args[1];
        if (!PATTERN_TAG_HANDLE.test(handle)) {
            return throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
        }
        if (state.tagMap && hasOwn(state.tagMap, handle)) {
            return throwError(state, `there is a previously declared suffix for "${handle}" tag handle`);
        }
        if (!PATTERN_TAG_URI.test(prefix)) {
            return throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
        }
        if (typeof state.tagMap === "undefined") {
            state.tagMap = {};
        }
        state.tagMap[handle] = prefix;
    }
};
function captureSegment(state, start, end, checkJson) {
    let result;
    if (start < end) {
        result = state.input.slice(start, end);
        if (checkJson) {
            for(let position = 0, length = result.length; position < length; position++){
                const character = result.charCodeAt(position);
                if (!(character === 0x09 || 0x20 <= character && character <= 0x10ffff)) {
                    return throwError(state, "expected valid JSON character");
                }
            }
        } else if (PATTERN_NON_PRINTABLE.test(result)) {
            return throwError(state, "the stream contains non-printable characters");
        }
        state.result += result;
    }
}
function mergeMappings(state, destination, source, overridableKeys) {
    if (!common.isObject(source)) {
        return throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    }
    const keys = Object.keys(source);
    for(let i = 0, len = keys.length; i < len; i++){
        const key = keys[i];
        if (!hasOwn(destination, key)) {
            destination[key] = source[key];
            overridableKeys[key] = true;
        }
    }
}
function storeMappingPair(state, result, overridableKeys, keyTag, keyNode, valueNode, startLine, startPos) {
    // The output is a plain object here, so keys can only be strings.
    // We need to convert keyNode to a string, but doing so can hang the process
    // (deeply nested arrays that explode exponentially using aliases).
    if (Array.isArray(keyNode)) {
        keyNode = Array.prototype.slice.call(keyNode);
        for(let index = 0, quantity = keyNode.length; index < quantity; index++){
            if (Array.isArray(keyNode[index])) {
                return throwError(state, "nested arrays are not supported inside keys");
            }
            if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
                keyNode[index] = "[object Object]";
            }
        }
    }
    // Avoid code execution in load() via toString property
    // (still use its own toString for arrays, timestamps,
    // and whatever user schema extensions happen to have @@toStringTag)
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
        keyNode = "[object Object]";
    }
    keyNode = String(keyNode);
    if (result === null) {
        result = {};
    }
    if (keyTag === "tag:yaml.org,2002:merge") {
        if (Array.isArray(valueNode)) {
            for(let index1 = 0, quantity1 = valueNode.length; index1 < quantity1; index1++){
                mergeMappings(state, result, valueNode[index1], overridableKeys);
            }
        } else {
            mergeMappings(state, result, valueNode, overridableKeys);
        }
    } else {
        if (!state.json && !hasOwn(overridableKeys, keyNode) && hasOwn(result, keyNode)) {
            state.line = startLine || state.line;
            state.position = startPos || state.position;
            return throwError(state, "duplicated mapping key");
        }
        result[keyNode] = valueNode;
        delete overridableKeys[keyNode];
    }
    return result;
}
function readLineBreak(state) {
    const ch = state.input.charCodeAt(state.position);
    if (ch === 0x0a /* LF */ ) {
        state.position++;
    } else if (ch === 0x0d /* CR */ ) {
        state.position++;
        if (state.input.charCodeAt(state.position) === 0x0a /* LF */ ) {
            state.position++;
        }
    } else {
        return throwError(state, "a line break is expected");
    }
    state.line += 1;
    state.lineStart = state.position;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
    let lineBreaks = 0, ch = state.input.charCodeAt(state.position);
    while(ch !== 0){
        while(isWhiteSpace(ch)){
            ch = state.input.charCodeAt(++state.position);
        }
        if (allowComments && ch === 0x23 /* # */ ) {
            do {
                ch = state.input.charCodeAt(++state.position);
            }while (ch !== 0x0a && /* LF */ ch !== 0x0d && /* CR */ ch !== 0)
        }
        if (isEOL(ch)) {
            readLineBreak(state);
            ch = state.input.charCodeAt(state.position);
            lineBreaks++;
            state.lineIndent = 0;
            while(ch === 0x20 /* Space */ ){
                state.lineIndent++;
                ch = state.input.charCodeAt(++state.position);
            }
        } else {
            break;
        }
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
        throwWarning(state, "deficient indentation");
    }
    return lineBreaks;
}
function testDocumentSeparator(state) {
    let _position = state.position;
    let ch = state.input.charCodeAt(_position);
    // Condition state.position === state.lineStart is tested
    // in parent on each call, for efficiency. No needs to test here again.
    if ((ch === 0x2d || /* - */ ch === 0x2e) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
        _position += 3;
        ch = state.input.charCodeAt(_position);
        if (ch === 0 || isWsOrEol(ch)) {
            return true;
        }
    }
    return false;
}
function writeFoldedLines(state, count) {
    if (count === 1) {
        state.result += " ";
    } else if (count > 1) {
        state.result += common.repeat("\n", count - 1);
    }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    const kind = state.kind;
    const result = state.result;
    let ch = state.input.charCodeAt(state.position);
    if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 0x23 /* # */  || ch === 0x26 /* & */  || ch === 0x2a /* * */  || ch === 0x21 /* ! */  || ch === 0x7c /* | */  || ch === 0x3e /* > */  || ch === 0x27 /* ' */  || ch === 0x22 /* " */  || ch === 0x25 /* % */  || ch === 0x40 /* @ */  || ch === 0x60 /* ` */ ) {
        return false;
    }
    let following;
    if (ch === 0x3f || /* ? */ ch === 0x2d /* - */ ) {
        following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
            return false;
        }
    }
    state.kind = "scalar";
    state.result = "";
    let captureEnd, captureStart = captureEnd = state.position;
    let hasPendingContent = false;
    let line = 0;
    while(ch !== 0){
        if (ch === 0x3a /* : */ ) {
            following = state.input.charCodeAt(state.position + 1);
            if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
                break;
            }
        } else if (ch === 0x23 /* # */ ) {
            const preceding = state.input.charCodeAt(state.position - 1);
            if (isWsOrEol(preceding)) {
                break;
            }
        } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) {
            break;
        } else if (isEOL(ch)) {
            line = state.line;
            const lineStart = state.lineStart;
            const lineIndent = state.lineIndent;
            skipSeparationSpace(state, false, -1);
            if (state.lineIndent >= nodeIndent) {
                hasPendingContent = true;
                ch = state.input.charCodeAt(state.position);
                continue;
            } else {
                state.position = captureEnd;
                state.line = line;
                state.lineStart = lineStart;
                state.lineIndent = lineIndent;
                break;
            }
        }
        if (hasPendingContent) {
            captureSegment(state, captureStart, captureEnd, false);
            writeFoldedLines(state, state.line - line);
            captureStart = captureEnd = state.position;
            hasPendingContent = false;
        }
        if (!isWhiteSpace(ch)) {
            captureEnd = state.position + 1;
        }
        ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) {
        return true;
    }
    state.kind = kind;
    state.result = result;
    return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
    let ch, captureStart, captureEnd;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 0x27 /* ' */ ) {
        return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while((ch = state.input.charCodeAt(state.position)) !== 0){
        if (ch === 0x27 /* ' */ ) {
            captureSegment(state, captureStart, state.position, true);
            ch = state.input.charCodeAt(++state.position);
            if (ch === 0x27 /* ' */ ) {
                captureStart = state.position;
                state.position++;
                captureEnd = state.position;
            } else {
                return true;
            }
        } else if (isEOL(ch)) {
            captureSegment(state, captureStart, captureEnd, true);
            writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
            captureStart = captureEnd = state.position;
        } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
            return throwError(state, "unexpected end of the document within a single quoted scalar");
        } else {
            state.position++;
            captureEnd = state.position;
        }
    }
    return throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 0x22 /* " */ ) {
        return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    let captureEnd, captureStart = captureEnd = state.position;
    let tmp;
    while((ch = state.input.charCodeAt(state.position)) !== 0){
        if (ch === 0x22 /* " */ ) {
            captureSegment(state, captureStart, state.position, true);
            state.position++;
            return true;
        }
        if (ch === 0x5c /* \ */ ) {
            captureSegment(state, captureStart, state.position, true);
            ch = state.input.charCodeAt(++state.position);
            if (isEOL(ch)) {
                skipSeparationSpace(state, false, nodeIndent);
            // TODO(bartlomieju): rework to inline fn with no type cast?
            } else if (ch < 256 && simpleEscapeCheck[ch]) {
                state.result += simpleEscapeMap[ch];
                state.position++;
            } else if ((tmp = escapedHexLen(ch)) > 0) {
                let hexLength = tmp;
                let hexResult = 0;
                for(; hexLength > 0; hexLength--){
                    ch = state.input.charCodeAt(++state.position);
                    if ((tmp = fromHexCode(ch)) >= 0) {
                        hexResult = (hexResult << 4) + tmp;
                    } else {
                        return throwError(state, "expected hexadecimal character");
                    }
                }
                state.result += charFromCodepoint(hexResult);
                state.position++;
            } else {
                return throwError(state, "unknown escape sequence");
            }
            captureStart = captureEnd = state.position;
        } else if (isEOL(ch)) {
            captureSegment(state, captureStart, captureEnd, true);
            writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
            captureStart = captureEnd = state.position;
        } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
            return throwError(state, "unexpected end of the document within a double quoted scalar");
        } else {
            state.position++;
            captureEnd = state.position;
        }
    }
    return throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
    let ch = state.input.charCodeAt(state.position);
    let terminator;
    let isMapping = true;
    let result = {};
    if (ch === 0x5b /* [ */ ) {
        terminator = 0x5d; /* ] */ 
        isMapping = false;
        result = [];
    } else if (ch === 0x7b /* { */ ) {
        terminator = 0x7d; /* } */ 
    } else {
        return false;
    }
    if (state.anchor !== null && typeof state.anchor != "undefined" && typeof state.anchorMap != "undefined") {
        state.anchorMap[state.anchor] = result;
    }
    ch = state.input.charCodeAt(++state.position);
    const tag = state.tag, anchor = state.anchor;
    let readNext = true;
    let valueNode, keyNode, keyTag = keyNode = valueNode = null, isExplicitPair, isPair = isExplicitPair = false;
    let following = 0, line = 0;
    const overridableKeys = {};
    while(ch !== 0){
        skipSeparationSpace(state, true, nodeIndent);
        ch = state.input.charCodeAt(state.position);
        if (ch === terminator) {
            state.position++;
            state.tag = tag;
            state.anchor = anchor;
            state.kind = isMapping ? "mapping" : "sequence";
            state.result = result;
            return true;
        }
        if (!readNext) {
            return throwError(state, "missed comma between flow collection entries");
        }
        keyTag = keyNode = valueNode = null;
        isPair = isExplicitPair = false;
        if (ch === 0x3f /* ? */ ) {
            following = state.input.charCodeAt(state.position + 1);
            if (isWsOrEol(following)) {
                isPair = isExplicitPair = true;
                state.position++;
                skipSeparationSpace(state, true, nodeIndent);
            }
        }
        line = state.line;
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        keyTag = state.tag || null;
        keyNode = state.result;
        skipSeparationSpace(state, true, nodeIndent);
        ch = state.input.charCodeAt(state.position);
        if ((isExplicitPair || state.line === line) && ch === 0x3a /* : */ ) {
            isPair = true;
            ch = state.input.charCodeAt(++state.position);
            skipSeparationSpace(state, true, nodeIndent);
            composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
            valueNode = state.result;
        }
        if (isMapping) {
            storeMappingPair(state, result, overridableKeys, keyTag, keyNode, valueNode);
        } else if (isPair) {
            result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode));
        } else {
            result.push(keyNode);
        }
        skipSeparationSpace(state, true, nodeIndent);
        ch = state.input.charCodeAt(state.position);
        if (ch === 0x2c /* , */ ) {
            readNext = true;
            ch = state.input.charCodeAt(++state.position);
        } else {
            readNext = false;
        }
    }
    return throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
    let chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false;
    let ch = state.input.charCodeAt(state.position);
    let folding = false;
    if (ch === 0x7c /* | */ ) {
        folding = false;
    } else if (ch === 0x3e /* > */ ) {
        folding = true;
    } else {
        return false;
    }
    state.kind = "scalar";
    state.result = "";
    let tmp = 0;
    while(ch !== 0){
        ch = state.input.charCodeAt(++state.position);
        if (ch === 0x2b || /* + */ ch === 0x2d /* - */ ) {
            if (CHOMPING_CLIP === chomping) {
                chomping = ch === 0x2b /* + */  ? CHOMPING_KEEP : CHOMPING_STRIP;
            } else {
                return throwError(state, "repeat of a chomping mode identifier");
            }
        } else if ((tmp = fromDecimalCode(ch)) >= 0) {
            if (tmp === 0) {
                return throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
            } else if (!detectedIndent) {
                textIndent = nodeIndent + tmp - 1;
                detectedIndent = true;
            } else {
                return throwError(state, "repeat of an indentation width identifier");
            }
        } else {
            break;
        }
    }
    if (isWhiteSpace(ch)) {
        do {
            ch = state.input.charCodeAt(++state.position);
        }while (isWhiteSpace(ch))
        if (ch === 0x23 /* # */ ) {
            do {
                ch = state.input.charCodeAt(++state.position);
            }while (!isEOL(ch) && ch !== 0)
        }
    }
    while(ch !== 0){
        readLineBreak(state);
        state.lineIndent = 0;
        ch = state.input.charCodeAt(state.position);
        while((!detectedIndent || state.lineIndent < textIndent) && ch === 0x20 /* Space */ ){
            state.lineIndent++;
            ch = state.input.charCodeAt(++state.position);
        }
        if (!detectedIndent && state.lineIndent > textIndent) {
            textIndent = state.lineIndent;
        }
        if (isEOL(ch)) {
            emptyLines++;
            continue;
        }
        // End of the scalar.
        if (state.lineIndent < textIndent) {
            // Perform the chomping.
            if (chomping === CHOMPING_KEEP) {
                state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
            } else if (chomping === CHOMPING_CLIP) {
                if (didReadContent) {
                    // i.e. only if the scalar is not empty.
                    state.result += "\n";
                }
            }
            break;
        }
        // Folded style: use fancy rules to handle line breaks.
        if (folding) {
            // Lines starting with white space characters (more-indented lines) are not folded.
            if (isWhiteSpace(ch)) {
                atMoreIndented = true;
                // except for the first content line (cf. Example 8.1)
                state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
            // End of more-indented block.
            } else if (atMoreIndented) {
                atMoreIndented = false;
                state.result += common.repeat("\n", emptyLines + 1);
            // Just one line break - perceive as the same line.
            } else if (emptyLines === 0) {
                if (didReadContent) {
                    // i.e. only if we have already read some scalar content.
                    state.result += " ";
                }
            // Several line breaks - perceive as different lines.
            } else {
                state.result += common.repeat("\n", emptyLines);
            }
        // Literal style: just add exact number of line breaks between content lines.
        } else {
            // Keep all line breaks except the header line break.
            state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        }
        didReadContent = true;
        detectedIndent = true;
        emptyLines = 0;
        const captureStart = state.position;
        while(!isEOL(ch) && ch !== 0){
            ch = state.input.charCodeAt(++state.position);
        }
        captureSegment(state, captureStart, state.position, false);
    }
    return true;
}
function readBlockSequence(state, nodeIndent) {
    let line, following, detected = false, ch;
    const tag = state.tag, anchor = state.anchor, result = [];
    if (state.anchor !== null && typeof state.anchor !== "undefined" && typeof state.anchorMap !== "undefined") {
        state.anchorMap[state.anchor] = result;
    }
    ch = state.input.charCodeAt(state.position);
    while(ch !== 0){
        if (ch !== 0x2d /* - */ ) {
            break;
        }
        following = state.input.charCodeAt(state.position + 1);
        if (!isWsOrEol(following)) {
            break;
        }
        detected = true;
        state.position++;
        if (skipSeparationSpace(state, true, -1)) {
            if (state.lineIndent <= nodeIndent) {
                result.push(null);
                ch = state.input.charCodeAt(state.position);
                continue;
            }
        }
        line = state.line;
        composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
        result.push(state.result);
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
        if ((state.line === line || state.lineIndent > nodeIndent) && ch !== 0) {
            return throwError(state, "bad indentation of a sequence entry");
        } else if (state.lineIndent < nodeIndent) {
            break;
        }
    }
    if (detected) {
        state.tag = tag;
        state.anchor = anchor;
        state.kind = "sequence";
        state.result = result;
        return true;
    }
    return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
    const tag = state.tag, anchor = state.anchor, result = {}, overridableKeys = {};
    let following, allowCompact = false, line, pos, keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
    if (state.anchor !== null && typeof state.anchor !== "undefined" && typeof state.anchorMap !== "undefined") {
        state.anchorMap[state.anchor] = result;
    }
    ch = state.input.charCodeAt(state.position);
    while(ch !== 0){
        following = state.input.charCodeAt(state.position + 1);
        line = state.line; // Save the current line.
        pos = state.position;
        //
        // Explicit notation case. There are two separate blocks:
        // first for the key (denoted by "?") and second for the value (denoted by ":")
        //
        if ((ch === 0x3f || /* ? */ ch === 0x3a) && /* : */ isWsOrEol(following)) {
            if (ch === 0x3f /* ? */ ) {
                if (atExplicitKey) {
                    storeMappingPair(state, result, overridableKeys, keyTag, keyNode, null);
                    keyTag = keyNode = valueNode = null;
                }
                detected = true;
                atExplicitKey = true;
                allowCompact = true;
            } else if (atExplicitKey) {
                // i.e. 0x3A/* : */ === character after the explicit key.
                atExplicitKey = false;
                allowCompact = true;
            } else {
                return throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
            }
            state.position += 1;
            ch = following;
        //
        // Implicit notation case. Flow-style node as the key first, then ":", and the value.
        //
        } else if (composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
            if (state.line === line) {
                ch = state.input.charCodeAt(state.position);
                while(isWhiteSpace(ch)){
                    ch = state.input.charCodeAt(++state.position);
                }
                if (ch === 0x3a /* : */ ) {
                    ch = state.input.charCodeAt(++state.position);
                    if (!isWsOrEol(ch)) {
                        return throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
                    }
                    if (atExplicitKey) {
                        storeMappingPair(state, result, overridableKeys, keyTag, keyNode, null);
                        keyTag = keyNode = valueNode = null;
                    }
                    detected = true;
                    atExplicitKey = false;
                    allowCompact = false;
                    keyTag = state.tag;
                    keyNode = state.result;
                } else if (detected) {
                    return throwError(state, "can not read an implicit mapping pair; a colon is missed");
                } else {
                    state.tag = tag;
                    state.anchor = anchor;
                    return true; // Keep the result of `composeNode`.
                }
            } else if (detected) {
                return throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
            } else {
                state.tag = tag;
                state.anchor = anchor;
                return true; // Keep the result of `composeNode`.
            }
        } else {
            break; // Reading is done. Go to the epilogue.
        }
        //
        // Common reading code for both explicit and implicit notations.
        //
        if (state.line === line || state.lineIndent > nodeIndent) {
            if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
                if (atExplicitKey) {
                    keyNode = state.result;
                } else {
                    valueNode = state.result;
                }
            }
            if (!atExplicitKey) {
                storeMappingPair(state, result, overridableKeys, keyTag, keyNode, valueNode, line, pos);
                keyTag = keyNode = valueNode = null;
            }
            skipSeparationSpace(state, true, -1);
            ch = state.input.charCodeAt(state.position);
        }
        if (state.lineIndent > nodeIndent && ch !== 0) {
            return throwError(state, "bad indentation of a mapping entry");
        } else if (state.lineIndent < nodeIndent) {
            break;
        }
    }
    //
    // Epilogue.
    //
    // Special case: last mapping's node contains only the key in explicit notation.
    if (atExplicitKey) {
        storeMappingPair(state, result, overridableKeys, keyTag, keyNode, null);
    }
    // Expose the resulting mapping.
    if (detected) {
        state.tag = tag;
        state.anchor = anchor;
        state.kind = "mapping";
        state.result = result;
    }
    return detected;
}
function readTagProperty(state) {
    let position, isVerbatim = false, isNamed = false, tagHandle = "", tagName, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 0x21 /* ! */ ) return false;
    if (state.tag !== null) {
        return throwError(state, "duplication of a tag property");
    }
    ch = state.input.charCodeAt(++state.position);
    if (ch === 0x3c /* < */ ) {
        isVerbatim = true;
        ch = state.input.charCodeAt(++state.position);
    } else if (ch === 0x21 /* ! */ ) {
        isNamed = true;
        tagHandle = "!!";
        ch = state.input.charCodeAt(++state.position);
    } else {
        tagHandle = "!";
    }
    position = state.position;
    if (isVerbatim) {
        do {
            ch = state.input.charCodeAt(++state.position);
        }while (ch !== 0 && ch !== 0x3e /* > */ )
        if (state.position < state.length) {
            tagName = state.input.slice(position, state.position);
            ch = state.input.charCodeAt(++state.position);
        } else {
            return throwError(state, "unexpected end of the stream within a verbatim tag");
        }
    } else {
        while(ch !== 0 && !isWsOrEol(ch)){
            if (ch === 0x21 /* ! */ ) {
                if (!isNamed) {
                    tagHandle = state.input.slice(position - 1, state.position + 1);
                    if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
                        return throwError(state, "named tag handle cannot contain such characters");
                    }
                    isNamed = true;
                    position = state.position + 1;
                } else {
                    return throwError(state, "tag suffix cannot contain exclamation marks");
                }
            }
            ch = state.input.charCodeAt(++state.position);
        }
        tagName = state.input.slice(position, state.position);
        if (PATTERN_FLOW_INDICATORS.test(tagName)) {
            return throwError(state, "tag suffix cannot contain flow indicator characters");
        }
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) {
        return throwError(state, `tag name cannot contain such characters: ${tagName}`);
    }
    if (isVerbatim) {
        state.tag = tagName;
    } else if (typeof state.tagMap !== "undefined" && hasOwn(state.tagMap, tagHandle)) {
        state.tag = state.tagMap[tagHandle] + tagName;
    } else if (tagHandle === "!") {
        state.tag = `!${tagName}`;
    } else if (tagHandle === "!!") {
        state.tag = `tag:yaml.org,2002:${tagName}`;
    } else {
        return throwError(state, `undeclared tag handle "${tagHandle}"`);
    }
    return true;
}
function readAnchorProperty(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 0x26 /* & */ ) return false;
    if (state.anchor !== null) {
        return throwError(state, "duplication of an anchor property");
    }
    ch = state.input.charCodeAt(++state.position);
    const position = state.position;
    while(ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)){
        ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === position) {
        return throwError(state, "name of an anchor node must contain at least one character");
    }
    state.anchor = state.input.slice(position, state.position);
    return true;
}
function readAlias(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 0x2a /* * */ ) return false;
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while(ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)){
        ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
        return throwError(state, "name of an alias node must contain at least one character");
    }
    const alias = state.input.slice(_position, state.position);
    if (typeof state.anchorMap !== "undefined" && !hasOwn(state.anchorMap, alias)) {
        return throwError(state, `unidentified alias "${alias}"`);
    }
    if (typeof state.anchorMap !== "undefined") {
        state.result = state.anchorMap[alias];
    }
    skipSeparationSpace(state, true, -1);
    return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    let allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, type, flowIndent, blockIndent;
    if (state.listener && state.listener !== null) {
        state.listener("open", state);
    }
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
        if (skipSeparationSpace(state, true, -1)) {
            atNewLine = true;
            if (state.lineIndent > parentIndent) {
                indentStatus = 1;
            } else if (state.lineIndent === parentIndent) {
                indentStatus = 0;
            } else if (state.lineIndent < parentIndent) {
                indentStatus = -1;
            }
        }
    }
    if (indentStatus === 1) {
        while(readTagProperty(state) || readAnchorProperty(state)){
            if (skipSeparationSpace(state, true, -1)) {
                atNewLine = true;
                allowBlockCollections = allowBlockStyles;
                if (state.lineIndent > parentIndent) {
                    indentStatus = 1;
                } else if (state.lineIndent === parentIndent) {
                    indentStatus = 0;
                } else if (state.lineIndent < parentIndent) {
                    indentStatus = -1;
                }
            } else {
                allowBlockCollections = false;
            }
        }
    }
    if (allowBlockCollections) {
        allowBlockCollections = atNewLine || allowCompact;
    }
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
        const cond = CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext;
        flowIndent = cond ? parentIndent : parentIndent + 1;
        blockIndent = state.position - state.lineStart;
        if (indentStatus === 1) {
            if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
                hasContent = true;
            } else {
                if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
                    hasContent = true;
                } else if (readAlias(state)) {
                    hasContent = true;
                    if (state.tag !== null || state.anchor !== null) {
                        return throwError(state, "alias node should not have Any properties");
                    }
                } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
                    hasContent = true;
                    if (state.tag === null) {
                        state.tag = "?";
                    }
                }
                if (state.anchor !== null && typeof state.anchorMap !== "undefined") {
                    state.anchorMap[state.anchor] = state.result;
                }
            }
        } else if (indentStatus === 0) {
            // Special case: block sequences are allowed to have same indentation level as the parent.
            // http://www.yaml.org/spec/1.2/spec.html#id2799784
            hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
        }
    }
    if (state.tag !== null && state.tag !== "!") {
        if (state.tag === "?") {
            for(let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex++){
                type = state.implicitTypes[typeIndex];
                // Implicit resolving is not allowed for non-scalar types, and '?'
                // non-specific tag is only assigned to plain scalars. So, it isn't
                // needed to check for 'kind' conformity.
                if (type.resolve(state.result)) {
                    // `state.result` updated in resolver if matched
                    state.result = type.construct(state.result);
                    state.tag = type.tag;
                    if (state.anchor !== null && typeof state.anchorMap !== "undefined") {
                        state.anchorMap[state.anchor] = state.result;
                    }
                    break;
                }
            }
        } else if (hasOwn(state.typeMap[state.kind || "fallback"], state.tag)) {
            type = state.typeMap[state.kind || "fallback"][state.tag];
            if (state.result !== null && type.kind !== state.kind) {
                return throwError(state, `unacceptable node kind for !<${state.tag}> tag; it should be "${type.kind}", not "${state.kind}"`);
            }
            if (!type.resolve(state.result)) {
                // `state.result` updated in resolver if matched
                return throwError(state, `cannot resolve a node with !<${state.tag}> explicit tag`);
            } else {
                state.result = type.construct(state.result);
                if (state.anchor !== null && typeof state.anchorMap !== "undefined") {
                    state.anchorMap[state.anchor] = state.result;
                }
            }
        } else {
            return throwError(state, `unknown tag !<${state.tag}>`);
        }
    }
    if (state.listener && state.listener !== null) {
        state.listener("close", state);
    }
    return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
    const documentStart = state.position;
    let position, directiveName, directiveArgs, hasDirectives = false, ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = {};
    state.anchorMap = {};
    while((ch = state.input.charCodeAt(state.position)) !== 0){
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
        if (state.lineIndent > 0 || ch !== 0x25 /* % */ ) {
            break;
        }
        hasDirectives = true;
        ch = state.input.charCodeAt(++state.position);
        position = state.position;
        while(ch !== 0 && !isWsOrEol(ch)){
            ch = state.input.charCodeAt(++state.position);
        }
        directiveName = state.input.slice(position, state.position);
        directiveArgs = [];
        if (directiveName.length < 1) {
            return throwError(state, "directive name must not be less than one character in length");
        }
        while(ch !== 0){
            while(isWhiteSpace(ch)){
                ch = state.input.charCodeAt(++state.position);
            }
            if (ch === 0x23 /* # */ ) {
                do {
                    ch = state.input.charCodeAt(++state.position);
                }while (ch !== 0 && !isEOL(ch))
                break;
            }
            if (isEOL(ch)) break;
            position = state.position;
            while(ch !== 0 && !isWsOrEol(ch)){
                ch = state.input.charCodeAt(++state.position);
            }
            directiveArgs.push(state.input.slice(position, state.position));
        }
        if (ch !== 0) readLineBreak(state);
        if (hasOwn(directiveHandlers, directiveName)) {
            directiveHandlers[directiveName](state, directiveName, ...directiveArgs);
        } else {
            throwWarning(state, `unknown document directive "${directiveName}"`);
        }
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 0x2d /* - */  && state.input.charCodeAt(state.position + 1) === 0x2d /* - */  && state.input.charCodeAt(state.position + 2) === 0x2d /* - */ ) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) {
        return throwError(state, "directives end mark is expected");
    }
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
        throwWarning(state, "non-ASCII line breaks are interpreted as content");
    }
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
        if (state.input.charCodeAt(state.position) === 0x2e /* . */ ) {
            state.position += 3;
            skipSeparationSpace(state, true, -1);
        }
        return;
    }
    if (state.position < state.length - 1) {
        return throwError(state, "end of the stream or a document separator is expected");
    } else {
        return;
    }
}
function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
        // Add tailing `\n` if not exists
        if (input.charCodeAt(input.length - 1) !== 0x0a /* LF */  && input.charCodeAt(input.length - 1) !== 0x0d /* CR */ ) {
            input += "\n";
        }
        // Strip BOM
        if (input.charCodeAt(0) === 0xfeff) {
            input = input.slice(1);
        }
    }
    const state = new LoaderState(input, options);
    // Use 0 as string terminator. That significantly simplifies bounds check.
    state.input += "\0";
    while(state.input.charCodeAt(state.position) === 0x20 /* Space */ ){
        state.lineIndent += 1;
        state.position += 1;
    }
    while(state.position < state.length - 1){
        readDocument(state);
    }
    return state.documents;
}
function isCbFunction(fn) {
    return typeof fn === "function";
}
export function loadAll(input, iteratorOrOption, options) {
    if (!isCbFunction(iteratorOrOption)) {
        return loadDocuments(input, iteratorOrOption);
    }
    const documents = loadDocuments(input, options);
    const iterator = iteratorOrOption;
    for(let index = 0, length = documents.length; index < length; index++){
        iterator(documents[index]);
    }
    return void 0;
}
export function load(input, options) {
    const documents = loadDocuments(input, options);
    if (documents.length === 0) {
        return;
    }
    if (documents.length === 1) {
        return documents[0];
    }
    throw new YAMLError("expected a single document in the stream, but found more");
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEzNC4wL2VuY29kaW5nL195YW1sL2xvYWRlci9sb2FkZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gUG9ydGVkIGZyb20ganMteWFtbCB2My4xMy4xOlxuLy8gaHR0cHM6Ly9naXRodWIuY29tL25vZGVjYS9qcy15YW1sL2NvbW1pdC82NjVhYWRkYTQyMzQ5ZGNhZTg2OWYxMjA0MGQ5YjEwZWYxOGQxMmRhXG4vLyBDb3B5cmlnaHQgMjAxMS0yMDE1IGJ5IFZpdGFseSBQdXpyaW4uIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cblxuaW1wb3J0IHsgWUFNTEVycm9yIH0gZnJvbSBcIi4uL2Vycm9yLnRzXCI7XG5pbXBvcnQgeyBNYXJrIH0gZnJvbSBcIi4uL21hcmsudHNcIjtcbmltcG9ydCB0eXBlIHsgVHlwZSB9IGZyb20gXCIuLi90eXBlLnRzXCI7XG5pbXBvcnQgKiBhcyBjb21tb24gZnJvbSBcIi4uL3V0aWxzLnRzXCI7XG5pbXBvcnQgeyBMb2FkZXJTdGF0ZSwgTG9hZGVyU3RhdGVPcHRpb25zLCBSZXN1bHRUeXBlIH0gZnJvbSBcIi4vbG9hZGVyX3N0YXRlLnRzXCI7XG5cbnR5cGUgQW55ID0gY29tbW9uLkFueTtcbnR5cGUgQXJyYXlPYmplY3Q8VCA9IEFueT4gPSBjb21tb24uQXJyYXlPYmplY3Q8VD47XG5cbmNvbnN0IHsgaGFzT3duIH0gPSBPYmplY3Q7XG5cbmNvbnN0IENPTlRFWFRfRkxPV19JTiA9IDE7XG5jb25zdCBDT05URVhUX0ZMT1dfT1VUID0gMjtcbmNvbnN0IENPTlRFWFRfQkxPQ0tfSU4gPSAzO1xuY29uc3QgQ09OVEVYVF9CTE9DS19PVVQgPSA0O1xuXG5jb25zdCBDSE9NUElOR19DTElQID0gMTtcbmNvbnN0IENIT01QSU5HX1NUUklQID0gMjtcbmNvbnN0IENIT01QSU5HX0tFRVAgPSAzO1xuXG5jb25zdCBQQVRURVJOX05PTl9QUklOVEFCTEUgPVxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWNvbnRyb2wtcmVnZXhcbiAgL1tcXHgwMC1cXHgwOFxceDBCXFx4MENcXHgwRS1cXHgxRlxceDdGLVxceDg0XFx4ODYtXFx4OUZcXHVGRkZFXFx1RkZGRl18W1xcdUQ4MDAtXFx1REJGRl0oPyFbXFx1REMwMC1cXHVERkZGXSl8KD86W15cXHVEODAwLVxcdURCRkZdfF4pW1xcdURDMDAtXFx1REZGRl0vO1xuY29uc3QgUEFUVEVSTl9OT05fQVNDSUlfTElORV9CUkVBS1MgPSAvW1xceDg1XFx1MjAyOFxcdTIwMjldLztcbmNvbnN0IFBBVFRFUk5fRkxPV19JTkRJQ0FUT1JTID0gL1ssXFxbXFxdXFx7XFx9XS87XG5jb25zdCBQQVRURVJOX1RBR19IQU5ETEUgPSAvXig/OiF8ISF8IVthLXpcXC1dKyEpJC9pO1xuY29uc3QgUEFUVEVSTl9UQUdfVVJJID1cbiAgL14oPzohfFteLFxcW1xcXVxce1xcfV0pKD86JVswLTlhLWZdezJ9fFswLTlhLXpcXC0jO1xcL1xcPzpAJj1cXCtcXCQsX1xcLiF+XFwqJ1xcKFxcKVxcW1xcXV0pKiQvaTtcblxuZnVuY3Rpb24gX2NsYXNzKG9iajogdW5rbm93bik6IHN0cmluZyB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqKTtcbn1cblxuZnVuY3Rpb24gaXNFT0woYzogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBjID09PSAweDBhIHx8IC8qIExGICovIGMgPT09IDB4MGQgLyogQ1IgKi87XG59XG5cbmZ1bmN0aW9uIGlzV2hpdGVTcGFjZShjOiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGMgPT09IDB4MDkgfHwgLyogVGFiICovIGMgPT09IDB4MjAgLyogU3BhY2UgKi87XG59XG5cbmZ1bmN0aW9uIGlzV3NPckVvbChjOiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIChcbiAgICBjID09PSAweDA5IC8qIFRhYiAqLyB8fFxuICAgIGMgPT09IDB4MjAgLyogU3BhY2UgKi8gfHxcbiAgICBjID09PSAweDBhIC8qIExGICovIHx8XG4gICAgYyA9PT0gMHgwZCAvKiBDUiAqL1xuICApO1xufVxuXG5mdW5jdGlvbiBpc0Zsb3dJbmRpY2F0b3IoYzogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiAoXG4gICAgYyA9PT0gMHgyYyAvKiAsICovIHx8XG4gICAgYyA9PT0gMHg1YiAvKiBbICovIHx8XG4gICAgYyA9PT0gMHg1ZCAvKiBdICovIHx8XG4gICAgYyA9PT0gMHg3YiAvKiB7ICovIHx8XG4gICAgYyA9PT0gMHg3ZCAvKiB9ICovXG4gICk7XG59XG5cbmZ1bmN0aW9uIGZyb21IZXhDb2RlKGM6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICgweDMwIDw9IC8qIDAgKi8gYyAmJiBjIDw9IDB4MzkgLyogOSAqLykge1xuICAgIHJldHVybiBjIC0gMHgzMDtcbiAgfVxuXG4gIGNvbnN0IGxjID0gYyB8IDB4MjA7XG5cbiAgaWYgKDB4NjEgPD0gLyogYSAqLyBsYyAmJiBsYyA8PSAweDY2IC8qIGYgKi8pIHtcbiAgICByZXR1cm4gbGMgLSAweDYxICsgMTA7XG4gIH1cblxuICByZXR1cm4gLTE7XG59XG5cbmZ1bmN0aW9uIGVzY2FwZWRIZXhMZW4oYzogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKGMgPT09IDB4NzggLyogeCAqLykge1xuICAgIHJldHVybiAyO1xuICB9XG4gIGlmIChjID09PSAweDc1IC8qIHUgKi8pIHtcbiAgICByZXR1cm4gNDtcbiAgfVxuICBpZiAoYyA9PT0gMHg1NSAvKiBVICovKSB7XG4gICAgcmV0dXJuIDg7XG4gIH1cbiAgcmV0dXJuIDA7XG59XG5cbmZ1bmN0aW9uIGZyb21EZWNpbWFsQ29kZShjOiBudW1iZXIpOiBudW1iZXIge1xuICBpZiAoMHgzMCA8PSAvKiAwICovIGMgJiYgYyA8PSAweDM5IC8qIDkgKi8pIHtcbiAgICByZXR1cm4gYyAtIDB4MzA7XG4gIH1cblxuICByZXR1cm4gLTE7XG59XG5cbmZ1bmN0aW9uIHNpbXBsZUVzY2FwZVNlcXVlbmNlKGM6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBjID09PSAweDMwIC8qIDAgKi9cbiAgICA/IFwiXFx4MDBcIlxuICAgIDogYyA9PT0gMHg2MSAvKiBhICovXG4gICAgPyBcIlxceDA3XCJcbiAgICA6IGMgPT09IDB4NjIgLyogYiAqL1xuICAgID8gXCJcXHgwOFwiXG4gICAgOiBjID09PSAweDc0IC8qIHQgKi9cbiAgICA/IFwiXFx4MDlcIlxuICAgIDogYyA9PT0gMHgwOSAvKiBUYWIgKi9cbiAgICA/IFwiXFx4MDlcIlxuICAgIDogYyA9PT0gMHg2ZSAvKiBuICovXG4gICAgPyBcIlxceDBBXCJcbiAgICA6IGMgPT09IDB4NzYgLyogdiAqL1xuICAgID8gXCJcXHgwQlwiXG4gICAgOiBjID09PSAweDY2IC8qIGYgKi9cbiAgICA/IFwiXFx4MENcIlxuICAgIDogYyA9PT0gMHg3MiAvKiByICovXG4gICAgPyBcIlxceDBEXCJcbiAgICA6IGMgPT09IDB4NjUgLyogZSAqL1xuICAgID8gXCJcXHgxQlwiXG4gICAgOiBjID09PSAweDIwIC8qIFNwYWNlICovXG4gICAgPyBcIiBcIlxuICAgIDogYyA9PT0gMHgyMiAvKiBcIiAqL1xuICAgID8gXCJcXHgyMlwiXG4gICAgOiBjID09PSAweDJmIC8qIC8gKi9cbiAgICA/IFwiL1wiXG4gICAgOiBjID09PSAweDVjIC8qIFxcICovXG4gICAgPyBcIlxceDVDXCJcbiAgICA6IGMgPT09IDB4NGUgLyogTiAqL1xuICAgID8gXCJcXHg4NVwiXG4gICAgOiBjID09PSAweDVmIC8qIF8gKi9cbiAgICA/IFwiXFx4QTBcIlxuICAgIDogYyA9PT0gMHg0YyAvKiBMICovXG4gICAgPyBcIlxcdTIwMjhcIlxuICAgIDogYyA9PT0gMHg1MCAvKiBQICovXG4gICAgPyBcIlxcdTIwMjlcIlxuICAgIDogXCJcIjtcbn1cblxuZnVuY3Rpb24gY2hhckZyb21Db2RlcG9pbnQoYzogbnVtYmVyKTogc3RyaW5nIHtcbiAgaWYgKGMgPD0gMHhmZmZmKSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoYyk7XG4gIH1cbiAgLy8gRW5jb2RlIFVURi0xNiBzdXJyb2dhdGUgcGFpclxuICAvLyBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9VVEYtMTYjQ29kZV9wb2ludHNfVS4yQjAxMDAwMF90b19VLjJCMTBGRkZGXG4gIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKFxuICAgICgoYyAtIDB4MDEwMDAwKSA+PiAxMCkgKyAweGQ4MDAsXG4gICAgKChjIC0gMHgwMTAwMDApICYgMHgwM2ZmKSArIDB4ZGMwMCxcbiAgKTtcbn1cblxuY29uc3Qgc2ltcGxlRXNjYXBlQ2hlY2sgPSBBcnJheS5mcm9tPG51bWJlcj4oeyBsZW5ndGg6IDI1NiB9KTsgLy8gaW50ZWdlciwgZm9yIGZhc3QgYWNjZXNzXG5jb25zdCBzaW1wbGVFc2NhcGVNYXAgPSBBcnJheS5mcm9tPHN0cmluZz4oeyBsZW5ndGg6IDI1NiB9KTtcbmZvciAobGV0IGkgPSAwOyBpIDwgMjU2OyBpKyspIHtcbiAgc2ltcGxlRXNjYXBlQ2hlY2tbaV0gPSBzaW1wbGVFc2NhcGVTZXF1ZW5jZShpKSA/IDEgOiAwO1xuICBzaW1wbGVFc2NhcGVNYXBbaV0gPSBzaW1wbGVFc2NhcGVTZXF1ZW5jZShpKTtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVFcnJvcihzdGF0ZTogTG9hZGVyU3RhdGUsIG1lc3NhZ2U6IHN0cmluZyk6IFlBTUxFcnJvciB7XG4gIHJldHVybiBuZXcgWUFNTEVycm9yKFxuICAgIG1lc3NhZ2UsXG4gICAgbmV3IE1hcmsoXG4gICAgICBzdGF0ZS5maWxlbmFtZSBhcyBzdHJpbmcsXG4gICAgICBzdGF0ZS5pbnB1dCxcbiAgICAgIHN0YXRlLnBvc2l0aW9uLFxuICAgICAgc3RhdGUubGluZSxcbiAgICAgIHN0YXRlLnBvc2l0aW9uIC0gc3RhdGUubGluZVN0YXJ0LFxuICAgICksXG4gICk7XG59XG5cbmZ1bmN0aW9uIHRocm93RXJyb3Ioc3RhdGU6IExvYWRlclN0YXRlLCBtZXNzYWdlOiBzdHJpbmcpOiBuZXZlciB7XG4gIHRocm93IGdlbmVyYXRlRXJyb3Ioc3RhdGUsIG1lc3NhZ2UpO1xufVxuXG5mdW5jdGlvbiB0aHJvd1dhcm5pbmcoc3RhdGU6IExvYWRlclN0YXRlLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgaWYgKHN0YXRlLm9uV2FybmluZykge1xuICAgIHN0YXRlLm9uV2FybmluZy5jYWxsKG51bGwsIGdlbmVyYXRlRXJyb3Ioc3RhdGUsIG1lc3NhZ2UpKTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgRGlyZWN0aXZlSGFuZGxlcnMge1xuICBbZGlyZWN0aXZlOiBzdHJpbmddOiAoXG4gICAgc3RhdGU6IExvYWRlclN0YXRlLFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICAuLi5hcmdzOiBzdHJpbmdbXVxuICApID0+IHZvaWQ7XG59XG5cbmNvbnN0IGRpcmVjdGl2ZUhhbmRsZXJzOiBEaXJlY3RpdmVIYW5kbGVycyA9IHtcbiAgWUFNTChzdGF0ZSwgX25hbWUsIC4uLmFyZ3M6IHN0cmluZ1tdKSB7XG4gICAgaWYgKHN0YXRlLnZlcnNpb24gIT09IG51bGwpIHtcbiAgICAgIHJldHVybiB0aHJvd0Vycm9yKHN0YXRlLCBcImR1cGxpY2F0aW9uIG9mICVZQU1MIGRpcmVjdGl2ZVwiKTtcbiAgICB9XG5cbiAgICBpZiAoYXJncy5sZW5ndGggIT09IDEpIHtcbiAgICAgIHJldHVybiB0aHJvd0Vycm9yKHN0YXRlLCBcIllBTUwgZGlyZWN0aXZlIGFjY2VwdHMgZXhhY3RseSBvbmUgYXJndW1lbnRcIik7XG4gICAgfVxuXG4gICAgY29uc3QgbWF0Y2ggPSAvXihbMC05XSspXFwuKFswLTldKykkLy5leGVjKGFyZ3NbMF0pO1xuICAgIGlmIChtYXRjaCA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHRocm93RXJyb3Ioc3RhdGUsIFwiaWxsLWZvcm1lZCBhcmd1bWVudCBvZiB0aGUgWUFNTCBkaXJlY3RpdmVcIik7XG4gICAgfVxuXG4gICAgY29uc3QgbWFqb3IgPSBwYXJzZUludChtYXRjaFsxXSwgMTApO1xuICAgIGNvbnN0IG1pbm9yID0gcGFyc2VJbnQobWF0Y2hbMl0sIDEwKTtcbiAgICBpZiAobWFqb3IgIT09IDEpIHtcbiAgICAgIHJldHVybiB0aHJvd0Vycm9yKHN0YXRlLCBcInVuYWNjZXB0YWJsZSBZQU1MIHZlcnNpb24gb2YgdGhlIGRvY3VtZW50XCIpO1xuICAgIH1cblxuICAgIHN0YXRlLnZlcnNpb24gPSBhcmdzWzBdO1xuICAgIHN0YXRlLmNoZWNrTGluZUJyZWFrcyA9IG1pbm9yIDwgMjtcbiAgICBpZiAobWlub3IgIT09IDEgJiYgbWlub3IgIT09IDIpIHtcbiAgICAgIHJldHVybiB0aHJvd1dhcm5pbmcoc3RhdGUsIFwidW5zdXBwb3J0ZWQgWUFNTCB2ZXJzaW9uIG9mIHRoZSBkb2N1bWVudFwiKTtcbiAgICB9XG4gIH0sXG5cbiAgVEFHKHN0YXRlLCBfbmFtZSwgLi4uYXJnczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICBpZiAoYXJncy5sZW5ndGggIT09IDIpIHtcbiAgICAgIHJldHVybiB0aHJvd0Vycm9yKHN0YXRlLCBcIlRBRyBkaXJlY3RpdmUgYWNjZXB0cyBleGFjdGx5IHR3byBhcmd1bWVudHNcIik7XG4gICAgfVxuXG4gICAgY29uc3QgaGFuZGxlID0gYXJnc1swXTtcbiAgICBjb25zdCBwcmVmaXggPSBhcmdzWzFdO1xuXG4gICAgaWYgKCFQQVRURVJOX1RBR19IQU5ETEUudGVzdChoYW5kbGUpKSB7XG4gICAgICByZXR1cm4gdGhyb3dFcnJvcihcbiAgICAgICAgc3RhdGUsXG4gICAgICAgIFwiaWxsLWZvcm1lZCB0YWcgaGFuZGxlIChmaXJzdCBhcmd1bWVudCkgb2YgdGhlIFRBRyBkaXJlY3RpdmVcIixcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHN0YXRlLnRhZ01hcCAmJiBoYXNPd24oc3RhdGUudGFnTWFwLCBoYW5kbGUpKSB7XG4gICAgICByZXR1cm4gdGhyb3dFcnJvcihcbiAgICAgICAgc3RhdGUsXG4gICAgICAgIGB0aGVyZSBpcyBhIHByZXZpb3VzbHkgZGVjbGFyZWQgc3VmZml4IGZvciBcIiR7aGFuZGxlfVwiIHRhZyBoYW5kbGVgLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAoIVBBVFRFUk5fVEFHX1VSSS50ZXN0KHByZWZpeCkpIHtcbiAgICAgIHJldHVybiB0aHJvd0Vycm9yKFxuICAgICAgICBzdGF0ZSxcbiAgICAgICAgXCJpbGwtZm9ybWVkIHRhZyBwcmVmaXggKHNlY29uZCBhcmd1bWVudCkgb2YgdGhlIFRBRyBkaXJlY3RpdmVcIixcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGVvZiBzdGF0ZS50YWdNYXAgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHN0YXRlLnRhZ01hcCA9IHt9O1xuICAgIH1cbiAgICBzdGF0ZS50YWdNYXBbaGFuZGxlXSA9IHByZWZpeDtcbiAgfSxcbn07XG5cbmZ1bmN0aW9uIGNhcHR1cmVTZWdtZW50KFxuICBzdGF0ZTogTG9hZGVyU3RhdGUsXG4gIHN0YXJ0OiBudW1iZXIsXG4gIGVuZDogbnVtYmVyLFxuICBjaGVja0pzb246IGJvb2xlYW4sXG4pOiB2b2lkIHtcbiAgbGV0IHJlc3VsdDogc3RyaW5nO1xuICBpZiAoc3RhcnQgPCBlbmQpIHtcbiAgICByZXN1bHQgPSBzdGF0ZS5pbnB1dC5zbGljZShzdGFydCwgZW5kKTtcblxuICAgIGlmIChjaGVja0pzb24pIHtcbiAgICAgIGZvciAoXG4gICAgICAgIGxldCBwb3NpdGlvbiA9IDAsIGxlbmd0aCA9IHJlc3VsdC5sZW5ndGg7XG4gICAgICAgIHBvc2l0aW9uIDwgbGVuZ3RoO1xuICAgICAgICBwb3NpdGlvbisrXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgY2hhcmFjdGVyID0gcmVzdWx0LmNoYXJDb2RlQXQocG9zaXRpb24pO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgIShjaGFyYWN0ZXIgPT09IDB4MDkgfHwgKDB4MjAgPD0gY2hhcmFjdGVyICYmIGNoYXJhY3RlciA8PSAweDEwZmZmZikpXG4gICAgICAgICkge1xuICAgICAgICAgIHJldHVybiB0aHJvd0Vycm9yKHN0YXRlLCBcImV4cGVjdGVkIHZhbGlkIEpTT04gY2hhcmFjdGVyXCIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChQQVRURVJOX05PTl9QUklOVEFCTEUudGVzdChyZXN1bHQpKSB7XG4gICAgICByZXR1cm4gdGhyb3dFcnJvcihzdGF0ZSwgXCJ0aGUgc3RyZWFtIGNvbnRhaW5zIG5vbi1wcmludGFibGUgY2hhcmFjdGVyc1wiKTtcbiAgICB9XG5cbiAgICBzdGF0ZS5yZXN1bHQgKz0gcmVzdWx0O1xuICB9XG59XG5cbmZ1bmN0aW9uIG1lcmdlTWFwcGluZ3MoXG4gIHN0YXRlOiBMb2FkZXJTdGF0ZSxcbiAgZGVzdGluYXRpb246IEFycmF5T2JqZWN0LFxuICBzb3VyY2U6IEFycmF5T2JqZWN0LFxuICBvdmVycmlkYWJsZUtleXM6IEFycmF5T2JqZWN0PGJvb2xlYW4+LFxuKTogdm9pZCB7XG4gIGlmICghY29tbW9uLmlzT2JqZWN0KHNvdXJjZSkpIHtcbiAgICByZXR1cm4gdGhyb3dFcnJvcihcbiAgICAgIHN0YXRlLFxuICAgICAgXCJjYW5ub3QgbWVyZ2UgbWFwcGluZ3M7IHRoZSBwcm92aWRlZCBzb3VyY2Ugb2JqZWN0IGlzIHVuYWNjZXB0YWJsZVwiLFxuICAgICk7XG4gIH1cblxuICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoc291cmNlKTtcbiAgZm9yIChsZXQgaSA9IDAsIGxlbiA9IGtleXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBjb25zdCBrZXkgPSBrZXlzW2ldO1xuICAgIGlmICghaGFzT3duKGRlc3RpbmF0aW9uLCBrZXkpKSB7XG4gICAgICBkZXN0aW5hdGlvbltrZXldID0gKHNvdXJjZSBhcyBBcnJheU9iamVjdClba2V5XTtcbiAgICAgIG92ZXJyaWRhYmxlS2V5c1trZXldID0gdHJ1ZTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gc3RvcmVNYXBwaW5nUGFpcihcbiAgc3RhdGU6IExvYWRlclN0YXRlLFxuICByZXN1bHQ6IEFycmF5T2JqZWN0IHwgbnVsbCxcbiAgb3ZlcnJpZGFibGVLZXlzOiBBcnJheU9iamVjdDxib29sZWFuPixcbiAga2V5VGFnOiBzdHJpbmcgfCBudWxsLFxuICBrZXlOb2RlOiBBbnksXG4gIHZhbHVlTm9kZTogdW5rbm93bixcbiAgc3RhcnRMaW5lPzogbnVtYmVyLFxuICBzdGFydFBvcz86IG51bWJlcixcbik6IEFycmF5T2JqZWN0IHtcbiAgLy8gVGhlIG91dHB1dCBpcyBhIHBsYWluIG9iamVjdCBoZXJlLCBzbyBrZXlzIGNhbiBvbmx5IGJlIHN0cmluZ3MuXG4gIC8vIFdlIG5lZWQgdG8gY29udmVydCBrZXlOb2RlIHRvIGEgc3RyaW5nLCBidXQgZG9pbmcgc28gY2FuIGhhbmcgdGhlIHByb2Nlc3NcbiAgLy8gKGRlZXBseSBuZXN0ZWQgYXJyYXlzIHRoYXQgZXhwbG9kZSBleHBvbmVudGlhbGx5IHVzaW5nIGFsaWFzZXMpLlxuICBpZiAoQXJyYXkuaXNBcnJheShrZXlOb2RlKSkge1xuICAgIGtleU5vZGUgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChrZXlOb2RlKTtcblxuICAgIGZvciAobGV0IGluZGV4ID0gMCwgcXVhbnRpdHkgPSBrZXlOb2RlLmxlbmd0aDsgaW5kZXggPCBxdWFudGl0eTsgaW5kZXgrKykge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoa2V5Tm9kZVtpbmRleF0pKSB7XG4gICAgICAgIHJldHVybiB0aHJvd0Vycm9yKHN0YXRlLCBcIm5lc3RlZCBhcnJheXMgYXJlIG5vdCBzdXBwb3J0ZWQgaW5zaWRlIGtleXNcIik7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIGtleU5vZGUgPT09IFwib2JqZWN0XCIgJiZcbiAgICAgICAgX2NsYXNzKGtleU5vZGVbaW5kZXhdKSA9PT0gXCJbb2JqZWN0IE9iamVjdF1cIlxuICAgICAgKSB7XG4gICAgICAgIGtleU5vZGVbaW5kZXhdID0gXCJbb2JqZWN0IE9iamVjdF1cIjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBBdm9pZCBjb2RlIGV4ZWN1dGlvbiBpbiBsb2FkKCkgdmlhIHRvU3RyaW5nIHByb3BlcnR5XG4gIC8vIChzdGlsbCB1c2UgaXRzIG93biB0b1N0cmluZyBmb3IgYXJyYXlzLCB0aW1lc3RhbXBzLFxuICAvLyBhbmQgd2hhdGV2ZXIgdXNlciBzY2hlbWEgZXh0ZW5zaW9ucyBoYXBwZW4gdG8gaGF2ZSBAQHRvU3RyaW5nVGFnKVxuICBpZiAodHlwZW9mIGtleU5vZGUgPT09IFwib2JqZWN0XCIgJiYgX2NsYXNzKGtleU5vZGUpID09PSBcIltvYmplY3QgT2JqZWN0XVwiKSB7XG4gICAga2V5Tm9kZSA9IFwiW29iamVjdCBPYmplY3RdXCI7XG4gIH1cblxuICBrZXlOb2RlID0gU3RyaW5nKGtleU5vZGUpO1xuXG4gIGlmIChyZXN1bHQgPT09IG51bGwpIHtcbiAgICByZXN1bHQgPSB7fTtcbiAgfVxuXG4gIGlmIChrZXlUYWcgPT09IFwidGFnOnlhbWwub3JnLDIwMDI6bWVyZ2VcIikge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlTm9kZSkpIHtcbiAgICAgIGZvciAoXG4gICAgICAgIGxldCBpbmRleCA9IDAsIHF1YW50aXR5ID0gdmFsdWVOb2RlLmxlbmd0aDtcbiAgICAgICAgaW5kZXggPCBxdWFudGl0eTtcbiAgICAgICAgaW5kZXgrK1xuICAgICAgKSB7XG4gICAgICAgIG1lcmdlTWFwcGluZ3Moc3RhdGUsIHJlc3VsdCwgdmFsdWVOb2RlW2luZGV4XSwgb3ZlcnJpZGFibGVLZXlzKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgbWVyZ2VNYXBwaW5ncyhzdGF0ZSwgcmVzdWx0LCB2YWx1ZU5vZGUgYXMgQXJyYXlPYmplY3QsIG92ZXJyaWRhYmxlS2V5cyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmIChcbiAgICAgICFzdGF0ZS5qc29uICYmXG4gICAgICAhaGFzT3duKG92ZXJyaWRhYmxlS2V5cywga2V5Tm9kZSkgJiZcbiAgICAgIGhhc093bihyZXN1bHQsIGtleU5vZGUpXG4gICAgKSB7XG4gICAgICBzdGF0ZS5saW5lID0gc3RhcnRMaW5lIHx8IHN0YXRlLmxpbmU7XG4gICAgICBzdGF0ZS5wb3NpdGlvbiA9IHN0YXJ0UG9zIHx8IHN0YXRlLnBvc2l0aW9uO1xuICAgICAgcmV0dXJuIHRocm93RXJyb3Ioc3RhdGUsIFwiZHVwbGljYXRlZCBtYXBwaW5nIGtleVwiKTtcbiAgICB9XG4gICAgcmVzdWx0W2tleU5vZGVdID0gdmFsdWVOb2RlO1xuICAgIGRlbGV0ZSBvdmVycmlkYWJsZUtleXNba2V5Tm9kZV07XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiByZWFkTGluZUJyZWFrKHN0YXRlOiBMb2FkZXJTdGF0ZSk6IHZvaWQge1xuICBjb25zdCBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24pO1xuXG4gIGlmIChjaCA9PT0gMHgwYSAvKiBMRiAqLykge1xuICAgIHN0YXRlLnBvc2l0aW9uKys7XG4gIH0gZWxzZSBpZiAoY2ggPT09IDB4MGQgLyogQ1IgKi8pIHtcbiAgICBzdGF0ZS5wb3NpdGlvbisrO1xuICAgIGlmIChzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KHN0YXRlLnBvc2l0aW9uKSA9PT0gMHgwYSAvKiBMRiAqLykge1xuICAgICAgc3RhdGUucG9zaXRpb24rKztcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHRocm93RXJyb3Ioc3RhdGUsIFwiYSBsaW5lIGJyZWFrIGlzIGV4cGVjdGVkXCIpO1xuICB9XG5cbiAgc3RhdGUubGluZSArPSAxO1xuICBzdGF0ZS5saW5lU3RhcnQgPSBzdGF0ZS5wb3NpdGlvbjtcbn1cblxuZnVuY3Rpb24gc2tpcFNlcGFyYXRpb25TcGFjZShcbiAgc3RhdGU6IExvYWRlclN0YXRlLFxuICBhbGxvd0NvbW1lbnRzOiBib29sZWFuLFxuICBjaGVja0luZGVudDogbnVtYmVyLFxuKTogbnVtYmVyIHtcbiAgbGV0IGxpbmVCcmVha3MgPSAwLFxuICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdChzdGF0ZS5wb3NpdGlvbik7XG5cbiAgd2hpbGUgKGNoICE9PSAwKSB7XG4gICAgd2hpbGUgKGlzV2hpdGVTcGFjZShjaCkpIHtcbiAgICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdCgrK3N0YXRlLnBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICBpZiAoYWxsb3dDb21tZW50cyAmJiBjaCA9PT0gMHgyMyAvKiAjICovKSB7XG4gICAgICBkbyB7XG4gICAgICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdCgrK3N0YXRlLnBvc2l0aW9uKTtcbiAgICAgIH0gd2hpbGUgKGNoICE9PSAweDBhICYmIC8qIExGICovIGNoICE9PSAweDBkICYmIC8qIENSICovIGNoICE9PSAwKTtcbiAgICB9XG5cbiAgICBpZiAoaXNFT0woY2gpKSB7XG4gICAgICByZWFkTGluZUJyZWFrKHN0YXRlKTtcblxuICAgICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KHN0YXRlLnBvc2l0aW9uKTtcbiAgICAgIGxpbmVCcmVha3MrKztcbiAgICAgIHN0YXRlLmxpbmVJbmRlbnQgPSAwO1xuXG4gICAgICB3aGlsZSAoY2ggPT09IDB4MjAgLyogU3BhY2UgKi8pIHtcbiAgICAgICAgc3RhdGUubGluZUluZGVudCsrO1xuICAgICAgICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoKytzdGF0ZS5wb3NpdGlvbik7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIGlmIChcbiAgICBjaGVja0luZGVudCAhPT0gLTEgJiZcbiAgICBsaW5lQnJlYWtzICE9PSAwICYmXG4gICAgc3RhdGUubGluZUluZGVudCA8IGNoZWNrSW5kZW50XG4gICkge1xuICAgIHRocm93V2FybmluZyhzdGF0ZSwgXCJkZWZpY2llbnQgaW5kZW50YXRpb25cIik7XG4gIH1cblxuICByZXR1cm4gbGluZUJyZWFrcztcbn1cblxuZnVuY3Rpb24gdGVzdERvY3VtZW50U2VwYXJhdG9yKHN0YXRlOiBMb2FkZXJTdGF0ZSk6IGJvb2xlYW4ge1xuICBsZXQgX3Bvc2l0aW9uID0gc3RhdGUucG9zaXRpb247XG4gIGxldCBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoX3Bvc2l0aW9uKTtcblxuICAvLyBDb25kaXRpb24gc3RhdGUucG9zaXRpb24gPT09IHN0YXRlLmxpbmVTdGFydCBpcyB0ZXN0ZWRcbiAgLy8gaW4gcGFyZW50IG9uIGVhY2ggY2FsbCwgZm9yIGVmZmljaWVuY3kuIE5vIG5lZWRzIHRvIHRlc3QgaGVyZSBhZ2Fpbi5cbiAgaWYgKFxuICAgIChjaCA9PT0gMHgyZCB8fCAvKiAtICovIGNoID09PSAweDJlKSAvKiAuICovICYmXG4gICAgY2ggPT09IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoX3Bvc2l0aW9uICsgMSkgJiZcbiAgICBjaCA9PT0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdChfcG9zaXRpb24gKyAyKVxuICApIHtcbiAgICBfcG9zaXRpb24gKz0gMztcblxuICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdChfcG9zaXRpb24pO1xuXG4gICAgaWYgKGNoID09PSAwIHx8IGlzV3NPckVvbChjaCkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gd3JpdGVGb2xkZWRMaW5lcyhzdGF0ZTogTG9hZGVyU3RhdGUsIGNvdW50OiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKGNvdW50ID09PSAxKSB7XG4gICAgc3RhdGUucmVzdWx0ICs9IFwiIFwiO1xuICB9IGVsc2UgaWYgKGNvdW50ID4gMSkge1xuICAgIHN0YXRlLnJlc3VsdCArPSBjb21tb24ucmVwZWF0KFwiXFxuXCIsIGNvdW50IC0gMSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVhZFBsYWluU2NhbGFyKFxuICBzdGF0ZTogTG9hZGVyU3RhdGUsXG4gIG5vZGVJbmRlbnQ6IG51bWJlcixcbiAgd2l0aGluRmxvd0NvbGxlY3Rpb246IGJvb2xlYW4sXG4pOiBib29sZWFuIHtcbiAgY29uc3Qga2luZCA9IHN0YXRlLmtpbmQ7XG4gIGNvbnN0IHJlc3VsdCA9IHN0YXRlLnJlc3VsdDtcbiAgbGV0IGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdChzdGF0ZS5wb3NpdGlvbik7XG5cbiAgaWYgKFxuICAgIGlzV3NPckVvbChjaCkgfHxcbiAgICBpc0Zsb3dJbmRpY2F0b3IoY2gpIHx8XG4gICAgY2ggPT09IDB4MjMgLyogIyAqLyB8fFxuICAgIGNoID09PSAweDI2IC8qICYgKi8gfHxcbiAgICBjaCA9PT0gMHgyYSAvKiAqICovIHx8XG4gICAgY2ggPT09IDB4MjEgLyogISAqLyB8fFxuICAgIGNoID09PSAweDdjIC8qIHwgKi8gfHxcbiAgICBjaCA9PT0gMHgzZSAvKiA+ICovIHx8XG4gICAgY2ggPT09IDB4MjcgLyogJyAqLyB8fFxuICAgIGNoID09PSAweDIyIC8qIFwiICovIHx8XG4gICAgY2ggPT09IDB4MjUgLyogJSAqLyB8fFxuICAgIGNoID09PSAweDQwIC8qIEAgKi8gfHxcbiAgICBjaCA9PT0gMHg2MCAvKiBgICovXG4gICkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGxldCBmb2xsb3dpbmc6IG51bWJlcjtcbiAgaWYgKGNoID09PSAweDNmIHx8IC8qID8gKi8gY2ggPT09IDB4MmQgLyogLSAqLykge1xuICAgIGZvbGxvd2luZyA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24gKyAxKTtcblxuICAgIGlmIChcbiAgICAgIGlzV3NPckVvbChmb2xsb3dpbmcpIHx8XG4gICAgICAod2l0aGluRmxvd0NvbGxlY3Rpb24gJiYgaXNGbG93SW5kaWNhdG9yKGZvbGxvd2luZykpXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgc3RhdGUua2luZCA9IFwic2NhbGFyXCI7XG4gIHN0YXRlLnJlc3VsdCA9IFwiXCI7XG4gIGxldCBjYXB0dXJlRW5kOiBudW1iZXIsXG4gICAgY2FwdHVyZVN0YXJ0ID0gKGNhcHR1cmVFbmQgPSBzdGF0ZS5wb3NpdGlvbik7XG4gIGxldCBoYXNQZW5kaW5nQ29udGVudCA9IGZhbHNlO1xuICBsZXQgbGluZSA9IDA7XG4gIHdoaWxlIChjaCAhPT0gMCkge1xuICAgIGlmIChjaCA9PT0gMHgzYSAvKiA6ICovKSB7XG4gICAgICBmb2xsb3dpbmcgPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KHN0YXRlLnBvc2l0aW9uICsgMSk7XG5cbiAgICAgIGlmIChcbiAgICAgICAgaXNXc09yRW9sKGZvbGxvd2luZykgfHxcbiAgICAgICAgKHdpdGhpbkZsb3dDb2xsZWN0aW9uICYmIGlzRmxvd0luZGljYXRvcihmb2xsb3dpbmcpKVxuICAgICAgKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoY2ggPT09IDB4MjMgLyogIyAqLykge1xuICAgICAgY29uc3QgcHJlY2VkaW5nID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdChzdGF0ZS5wb3NpdGlvbiAtIDEpO1xuXG4gICAgICBpZiAoaXNXc09yRW9sKHByZWNlZGluZykpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIChzdGF0ZS5wb3NpdGlvbiA9PT0gc3RhdGUubGluZVN0YXJ0ICYmIHRlc3REb2N1bWVudFNlcGFyYXRvcihzdGF0ZSkpIHx8XG4gICAgICAod2l0aGluRmxvd0NvbGxlY3Rpb24gJiYgaXNGbG93SW5kaWNhdG9yKGNoKSlcbiAgICApIHtcbiAgICAgIGJyZWFrO1xuICAgIH0gZWxzZSBpZiAoaXNFT0woY2gpKSB7XG4gICAgICBsaW5lID0gc3RhdGUubGluZTtcbiAgICAgIGNvbnN0IGxpbmVTdGFydCA9IHN0YXRlLmxpbmVTdGFydDtcbiAgICAgIGNvbnN0IGxpbmVJbmRlbnQgPSBzdGF0ZS5saW5lSW5kZW50O1xuICAgICAgc2tpcFNlcGFyYXRpb25TcGFjZShzdGF0ZSwgZmFsc2UsIC0xKTtcblxuICAgICAgaWYgKHN0YXRlLmxpbmVJbmRlbnQgPj0gbm9kZUluZGVudCkge1xuICAgICAgICBoYXNQZW5kaW5nQ29udGVudCA9IHRydWU7XG4gICAgICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdChzdGF0ZS5wb3NpdGlvbik7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RhdGUucG9zaXRpb24gPSBjYXB0dXJlRW5kO1xuICAgICAgICBzdGF0ZS5saW5lID0gbGluZTtcbiAgICAgICAgc3RhdGUubGluZVN0YXJ0ID0gbGluZVN0YXJ0O1xuICAgICAgICBzdGF0ZS5saW5lSW5kZW50ID0gbGluZUluZGVudDtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGhhc1BlbmRpbmdDb250ZW50KSB7XG4gICAgICBjYXB0dXJlU2VnbWVudChzdGF0ZSwgY2FwdHVyZVN0YXJ0LCBjYXB0dXJlRW5kLCBmYWxzZSk7XG4gICAgICB3cml0ZUZvbGRlZExpbmVzKHN0YXRlLCBzdGF0ZS5saW5lIC0gbGluZSk7XG4gICAgICBjYXB0dXJlU3RhcnQgPSBjYXB0dXJlRW5kID0gc3RhdGUucG9zaXRpb247XG4gICAgICBoYXNQZW5kaW5nQ29udGVudCA9IGZhbHNlO1xuICAgIH1cblxuICAgIGlmICghaXNXaGl0ZVNwYWNlKGNoKSkge1xuICAgICAgY2FwdHVyZUVuZCA9IHN0YXRlLnBvc2l0aW9uICsgMTtcbiAgICB9XG5cbiAgICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoKytzdGF0ZS5wb3NpdGlvbik7XG4gIH1cblxuICBjYXB0dXJlU2VnbWVudChzdGF0ZSwgY2FwdHVyZVN0YXJ0LCBjYXB0dXJlRW5kLCBmYWxzZSk7XG5cbiAgaWYgKHN0YXRlLnJlc3VsdCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgc3RhdGUua2luZCA9IGtpbmQ7XG4gIHN0YXRlLnJlc3VsdCA9IHJlc3VsdDtcbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiByZWFkU2luZ2xlUXVvdGVkU2NhbGFyKFxuICBzdGF0ZTogTG9hZGVyU3RhdGUsXG4gIG5vZGVJbmRlbnQ6IG51bWJlcixcbik6IGJvb2xlYW4ge1xuICBsZXQgY2gsIGNhcHR1cmVTdGFydCwgY2FwdHVyZUVuZDtcblxuICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24pO1xuXG4gIGlmIChjaCAhPT0gMHgyNyAvKiAnICovKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgc3RhdGUua2luZCA9IFwic2NhbGFyXCI7XG4gIHN0YXRlLnJlc3VsdCA9IFwiXCI7XG4gIHN0YXRlLnBvc2l0aW9uKys7XG4gIGNhcHR1cmVTdGFydCA9IGNhcHR1cmVFbmQgPSBzdGF0ZS5wb3NpdGlvbjtcblxuICB3aGlsZSAoKGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdChzdGF0ZS5wb3NpdGlvbikpICE9PSAwKSB7XG4gICAgaWYgKGNoID09PSAweDI3IC8qICcgKi8pIHtcbiAgICAgIGNhcHR1cmVTZWdtZW50KHN0YXRlLCBjYXB0dXJlU3RhcnQsIHN0YXRlLnBvc2l0aW9uLCB0cnVlKTtcbiAgICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdCgrK3N0YXRlLnBvc2l0aW9uKTtcblxuICAgICAgaWYgKGNoID09PSAweDI3IC8qICcgKi8pIHtcbiAgICAgICAgY2FwdHVyZVN0YXJ0ID0gc3RhdGUucG9zaXRpb247XG4gICAgICAgIHN0YXRlLnBvc2l0aW9uKys7XG4gICAgICAgIGNhcHR1cmVFbmQgPSBzdGF0ZS5wb3NpdGlvbjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaXNFT0woY2gpKSB7XG4gICAgICBjYXB0dXJlU2VnbWVudChzdGF0ZSwgY2FwdHVyZVN0YXJ0LCBjYXB0dXJlRW5kLCB0cnVlKTtcbiAgICAgIHdyaXRlRm9sZGVkTGluZXMoc3RhdGUsIHNraXBTZXBhcmF0aW9uU3BhY2Uoc3RhdGUsIGZhbHNlLCBub2RlSW5kZW50KSk7XG4gICAgICBjYXB0dXJlU3RhcnQgPSBjYXB0dXJlRW5kID0gc3RhdGUucG9zaXRpb247XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHN0YXRlLnBvc2l0aW9uID09PSBzdGF0ZS5saW5lU3RhcnQgJiZcbiAgICAgIHRlc3REb2N1bWVudFNlcGFyYXRvcihzdGF0ZSlcbiAgICApIHtcbiAgICAgIHJldHVybiB0aHJvd0Vycm9yKFxuICAgICAgICBzdGF0ZSxcbiAgICAgICAgXCJ1bmV4cGVjdGVkIGVuZCBvZiB0aGUgZG9jdW1lbnQgd2l0aGluIGEgc2luZ2xlIHF1b3RlZCBzY2FsYXJcIixcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0YXRlLnBvc2l0aW9uKys7XG4gICAgICBjYXB0dXJlRW5kID0gc3RhdGUucG9zaXRpb247XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRocm93RXJyb3IoXG4gICAgc3RhdGUsXG4gICAgXCJ1bmV4cGVjdGVkIGVuZCBvZiB0aGUgc3RyZWFtIHdpdGhpbiBhIHNpbmdsZSBxdW90ZWQgc2NhbGFyXCIsXG4gICk7XG59XG5cbmZ1bmN0aW9uIHJlYWREb3VibGVRdW90ZWRTY2FsYXIoXG4gIHN0YXRlOiBMb2FkZXJTdGF0ZSxcbiAgbm9kZUluZGVudDogbnVtYmVyLFxuKTogYm9vbGVhbiB7XG4gIGxldCBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24pO1xuXG4gIGlmIChjaCAhPT0gMHgyMiAvKiBcIiAqLykge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHN0YXRlLmtpbmQgPSBcInNjYWxhclwiO1xuICBzdGF0ZS5yZXN1bHQgPSBcIlwiO1xuICBzdGF0ZS5wb3NpdGlvbisrO1xuICBsZXQgY2FwdHVyZUVuZDogbnVtYmVyLFxuICAgIGNhcHR1cmVTdGFydCA9IChjYXB0dXJlRW5kID0gc3RhdGUucG9zaXRpb24pO1xuICBsZXQgdG1wOiBudW1iZXI7XG4gIHdoaWxlICgoY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KHN0YXRlLnBvc2l0aW9uKSkgIT09IDApIHtcbiAgICBpZiAoY2ggPT09IDB4MjIgLyogXCIgKi8pIHtcbiAgICAgIGNhcHR1cmVTZWdtZW50KHN0YXRlLCBjYXB0dXJlU3RhcnQsIHN0YXRlLnBvc2l0aW9uLCB0cnVlKTtcbiAgICAgIHN0YXRlLnBvc2l0aW9uKys7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKGNoID09PSAweDVjIC8qIFxcICovKSB7XG4gICAgICBjYXB0dXJlU2VnbWVudChzdGF0ZSwgY2FwdHVyZVN0YXJ0LCBzdGF0ZS5wb3NpdGlvbiwgdHJ1ZSk7XG4gICAgICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoKytzdGF0ZS5wb3NpdGlvbik7XG5cbiAgICAgIGlmIChpc0VPTChjaCkpIHtcbiAgICAgICAgc2tpcFNlcGFyYXRpb25TcGFjZShzdGF0ZSwgZmFsc2UsIG5vZGVJbmRlbnQpO1xuXG4gICAgICAgIC8vIFRPRE8oYmFydGxvbWllanUpOiByZXdvcmsgdG8gaW5saW5lIGZuIHdpdGggbm8gdHlwZSBjYXN0P1xuICAgICAgfSBlbHNlIGlmIChjaCA8IDI1NiAmJiBzaW1wbGVFc2NhcGVDaGVja1tjaF0pIHtcbiAgICAgICAgc3RhdGUucmVzdWx0ICs9IHNpbXBsZUVzY2FwZU1hcFtjaF07XG4gICAgICAgIHN0YXRlLnBvc2l0aW9uKys7XG4gICAgICB9IGVsc2UgaWYgKCh0bXAgPSBlc2NhcGVkSGV4TGVuKGNoKSkgPiAwKSB7XG4gICAgICAgIGxldCBoZXhMZW5ndGggPSB0bXA7XG4gICAgICAgIGxldCBoZXhSZXN1bHQgPSAwO1xuXG4gICAgICAgIGZvciAoOyBoZXhMZW5ndGggPiAwOyBoZXhMZW5ndGgtLSkge1xuICAgICAgICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdCgrK3N0YXRlLnBvc2l0aW9uKTtcblxuICAgICAgICAgIGlmICgodG1wID0gZnJvbUhleENvZGUoY2gpKSA+PSAwKSB7XG4gICAgICAgICAgICBoZXhSZXN1bHQgPSAoaGV4UmVzdWx0IDw8IDQpICsgdG1wO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhyb3dFcnJvcihzdGF0ZSwgXCJleHBlY3RlZCBoZXhhZGVjaW1hbCBjaGFyYWN0ZXJcIik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgc3RhdGUucmVzdWx0ICs9IGNoYXJGcm9tQ29kZXBvaW50KGhleFJlc3VsdCk7XG5cbiAgICAgICAgc3RhdGUucG9zaXRpb24rKztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aHJvd0Vycm9yKHN0YXRlLCBcInVua25vd24gZXNjYXBlIHNlcXVlbmNlXCIpO1xuICAgICAgfVxuXG4gICAgICBjYXB0dXJlU3RhcnQgPSBjYXB0dXJlRW5kID0gc3RhdGUucG9zaXRpb247XG4gICAgfSBlbHNlIGlmIChpc0VPTChjaCkpIHtcbiAgICAgIGNhcHR1cmVTZWdtZW50KHN0YXRlLCBjYXB0dXJlU3RhcnQsIGNhcHR1cmVFbmQsIHRydWUpO1xuICAgICAgd3JpdGVGb2xkZWRMaW5lcyhzdGF0ZSwgc2tpcFNlcGFyYXRpb25TcGFjZShzdGF0ZSwgZmFsc2UsIG5vZGVJbmRlbnQpKTtcbiAgICAgIGNhcHR1cmVTdGFydCA9IGNhcHR1cmVFbmQgPSBzdGF0ZS5wb3NpdGlvbjtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgc3RhdGUucG9zaXRpb24gPT09IHN0YXRlLmxpbmVTdGFydCAmJlxuICAgICAgdGVzdERvY3VtZW50U2VwYXJhdG9yKHN0YXRlKVxuICAgICkge1xuICAgICAgcmV0dXJuIHRocm93RXJyb3IoXG4gICAgICAgIHN0YXRlLFxuICAgICAgICBcInVuZXhwZWN0ZWQgZW5kIG9mIHRoZSBkb2N1bWVudCB3aXRoaW4gYSBkb3VibGUgcXVvdGVkIHNjYWxhclwiLFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RhdGUucG9zaXRpb24rKztcbiAgICAgIGNhcHR1cmVFbmQgPSBzdGF0ZS5wb3NpdGlvbjtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhyb3dFcnJvcihcbiAgICBzdGF0ZSxcbiAgICBcInVuZXhwZWN0ZWQgZW5kIG9mIHRoZSBzdHJlYW0gd2l0aGluIGEgZG91YmxlIHF1b3RlZCBzY2FsYXJcIixcbiAgKTtcbn1cblxuZnVuY3Rpb24gcmVhZEZsb3dDb2xsZWN0aW9uKHN0YXRlOiBMb2FkZXJTdGF0ZSwgbm9kZUluZGVudDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIGxldCBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24pO1xuICBsZXQgdGVybWluYXRvcjogbnVtYmVyO1xuICBsZXQgaXNNYXBwaW5nID0gdHJ1ZTtcbiAgbGV0IHJlc3VsdDogUmVzdWx0VHlwZSA9IHt9O1xuICBpZiAoY2ggPT09IDB4NWIgLyogWyAqLykge1xuICAgIHRlcm1pbmF0b3IgPSAweDVkOyAvKiBdICovXG4gICAgaXNNYXBwaW5nID0gZmFsc2U7XG4gICAgcmVzdWx0ID0gW107XG4gIH0gZWxzZSBpZiAoY2ggPT09IDB4N2IgLyogeyAqLykge1xuICAgIHRlcm1pbmF0b3IgPSAweDdkOyAvKiB9ICovXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKFxuICAgIHN0YXRlLmFuY2hvciAhPT0gbnVsbCAmJlxuICAgIHR5cGVvZiBzdGF0ZS5hbmNob3IgIT0gXCJ1bmRlZmluZWRcIiAmJlxuICAgIHR5cGVvZiBzdGF0ZS5hbmNob3JNYXAgIT0gXCJ1bmRlZmluZWRcIlxuICApIHtcbiAgICBzdGF0ZS5hbmNob3JNYXBbc3RhdGUuYW5jaG9yXSA9IHJlc3VsdDtcbiAgfVxuXG4gIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdCgrK3N0YXRlLnBvc2l0aW9uKTtcblxuICBjb25zdCB0YWcgPSBzdGF0ZS50YWcsXG4gICAgYW5jaG9yID0gc3RhdGUuYW5jaG9yO1xuICBsZXQgcmVhZE5leHQgPSB0cnVlO1xuICBsZXQgdmFsdWVOb2RlLFxuICAgIGtleU5vZGUsXG4gICAga2V5VGFnOiBzdHJpbmcgfCBudWxsID0gKGtleU5vZGUgPSB2YWx1ZU5vZGUgPSBudWxsKSxcbiAgICBpc0V4cGxpY2l0UGFpcjogYm9vbGVhbixcbiAgICBpc1BhaXIgPSAoaXNFeHBsaWNpdFBhaXIgPSBmYWxzZSk7XG4gIGxldCBmb2xsb3dpbmcgPSAwLFxuICAgIGxpbmUgPSAwO1xuICBjb25zdCBvdmVycmlkYWJsZUtleXM6IEFycmF5T2JqZWN0PGJvb2xlYW4+ID0ge307XG4gIHdoaWxlIChjaCAhPT0gMCkge1xuICAgIHNraXBTZXBhcmF0aW9uU3BhY2Uoc3RhdGUsIHRydWUsIG5vZGVJbmRlbnQpO1xuXG4gICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KHN0YXRlLnBvc2l0aW9uKTtcblxuICAgIGlmIChjaCA9PT0gdGVybWluYXRvcikge1xuICAgICAgc3RhdGUucG9zaXRpb24rKztcbiAgICAgIHN0YXRlLnRhZyA9IHRhZztcbiAgICAgIHN0YXRlLmFuY2hvciA9IGFuY2hvcjtcbiAgICAgIHN0YXRlLmtpbmQgPSBpc01hcHBpbmcgPyBcIm1hcHBpbmdcIiA6IFwic2VxdWVuY2VcIjtcbiAgICAgIHN0YXRlLnJlc3VsdCA9IHJlc3VsdDtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAoIXJlYWROZXh0KSB7XG4gICAgICByZXR1cm4gdGhyb3dFcnJvcihzdGF0ZSwgXCJtaXNzZWQgY29tbWEgYmV0d2VlbiBmbG93IGNvbGxlY3Rpb24gZW50cmllc1wiKTtcbiAgICB9XG5cbiAgICBrZXlUYWcgPSBrZXlOb2RlID0gdmFsdWVOb2RlID0gbnVsbDtcbiAgICBpc1BhaXIgPSBpc0V4cGxpY2l0UGFpciA9IGZhbHNlO1xuXG4gICAgaWYgKGNoID09PSAweDNmIC8qID8gKi8pIHtcbiAgICAgIGZvbGxvd2luZyA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24gKyAxKTtcblxuICAgICAgaWYgKGlzV3NPckVvbChmb2xsb3dpbmcpKSB7XG4gICAgICAgIGlzUGFpciA9IGlzRXhwbGljaXRQYWlyID0gdHJ1ZTtcbiAgICAgICAgc3RhdGUucG9zaXRpb24rKztcbiAgICAgICAgc2tpcFNlcGFyYXRpb25TcGFjZShzdGF0ZSwgdHJ1ZSwgbm9kZUluZGVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbGluZSA9IHN0YXRlLmxpbmU7XG4gICAgY29tcG9zZU5vZGUoc3RhdGUsIG5vZGVJbmRlbnQsIENPTlRFWFRfRkxPV19JTiwgZmFsc2UsIHRydWUpO1xuICAgIGtleVRhZyA9IHN0YXRlLnRhZyB8fCBudWxsO1xuICAgIGtleU5vZGUgPSBzdGF0ZS5yZXN1bHQ7XG4gICAgc2tpcFNlcGFyYXRpb25TcGFjZShzdGF0ZSwgdHJ1ZSwgbm9kZUluZGVudCk7XG5cbiAgICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24pO1xuXG4gICAgaWYgKChpc0V4cGxpY2l0UGFpciB8fCBzdGF0ZS5saW5lID09PSBsaW5lKSAmJiBjaCA9PT0gMHgzYSAvKiA6ICovKSB7XG4gICAgICBpc1BhaXIgPSB0cnVlO1xuICAgICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KCsrc3RhdGUucG9zaXRpb24pO1xuICAgICAgc2tpcFNlcGFyYXRpb25TcGFjZShzdGF0ZSwgdHJ1ZSwgbm9kZUluZGVudCk7XG4gICAgICBjb21wb3NlTm9kZShzdGF0ZSwgbm9kZUluZGVudCwgQ09OVEVYVF9GTE9XX0lOLCBmYWxzZSwgdHJ1ZSk7XG4gICAgICB2YWx1ZU5vZGUgPSBzdGF0ZS5yZXN1bHQ7XG4gICAgfVxuXG4gICAgaWYgKGlzTWFwcGluZykge1xuICAgICAgc3RvcmVNYXBwaW5nUGFpcihcbiAgICAgICAgc3RhdGUsXG4gICAgICAgIHJlc3VsdCxcbiAgICAgICAgb3ZlcnJpZGFibGVLZXlzLFxuICAgICAgICBrZXlUYWcsXG4gICAgICAgIGtleU5vZGUsXG4gICAgICAgIHZhbHVlTm9kZSxcbiAgICAgICk7XG4gICAgfSBlbHNlIGlmIChpc1BhaXIpIHtcbiAgICAgIChyZXN1bHQgYXMgQXJyYXlPYmplY3RbXSkucHVzaChcbiAgICAgICAgc3RvcmVNYXBwaW5nUGFpcihcbiAgICAgICAgICBzdGF0ZSxcbiAgICAgICAgICBudWxsLFxuICAgICAgICAgIG92ZXJyaWRhYmxlS2V5cyxcbiAgICAgICAgICBrZXlUYWcsXG4gICAgICAgICAga2V5Tm9kZSxcbiAgICAgICAgICB2YWx1ZU5vZGUsXG4gICAgICAgICksXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICAocmVzdWx0IGFzIFJlc3VsdFR5cGVbXSkucHVzaChrZXlOb2RlIGFzIFJlc3VsdFR5cGUpO1xuICAgIH1cblxuICAgIHNraXBTZXBhcmF0aW9uU3BhY2Uoc3RhdGUsIHRydWUsIG5vZGVJbmRlbnQpO1xuXG4gICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KHN0YXRlLnBvc2l0aW9uKTtcblxuICAgIGlmIChjaCA9PT0gMHgyYyAvKiAsICovKSB7XG4gICAgICByZWFkTmV4dCA9IHRydWU7XG4gICAgICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoKytzdGF0ZS5wb3NpdGlvbik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlYWROZXh0ID0gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRocm93RXJyb3IoXG4gICAgc3RhdGUsXG4gICAgXCJ1bmV4cGVjdGVkIGVuZCBvZiB0aGUgc3RyZWFtIHdpdGhpbiBhIGZsb3cgY29sbGVjdGlvblwiLFxuICApO1xufVxuXG5mdW5jdGlvbiByZWFkQmxvY2tTY2FsYXIoc3RhdGU6IExvYWRlclN0YXRlLCBub2RlSW5kZW50OiBudW1iZXIpOiBib29sZWFuIHtcbiAgbGV0IGNob21waW5nID0gQ0hPTVBJTkdfQ0xJUCxcbiAgICBkaWRSZWFkQ29udGVudCA9IGZhbHNlLFxuICAgIGRldGVjdGVkSW5kZW50ID0gZmFsc2UsXG4gICAgdGV4dEluZGVudCA9IG5vZGVJbmRlbnQsXG4gICAgZW1wdHlMaW5lcyA9IDAsXG4gICAgYXRNb3JlSW5kZW50ZWQgPSBmYWxzZTtcblxuICBsZXQgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KHN0YXRlLnBvc2l0aW9uKTtcblxuICBsZXQgZm9sZGluZyA9IGZhbHNlO1xuICBpZiAoY2ggPT09IDB4N2MgLyogfCAqLykge1xuICAgIGZvbGRpbmcgPSBmYWxzZTtcbiAgfSBlbHNlIGlmIChjaCA9PT0gMHgzZSAvKiA+ICovKSB7XG4gICAgZm9sZGluZyA9IHRydWU7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgc3RhdGUua2luZCA9IFwic2NhbGFyXCI7XG4gIHN0YXRlLnJlc3VsdCA9IFwiXCI7XG5cbiAgbGV0IHRtcCA9IDA7XG4gIHdoaWxlIChjaCAhPT0gMCkge1xuICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdCgrK3N0YXRlLnBvc2l0aW9uKTtcblxuICAgIGlmIChjaCA9PT0gMHgyYiB8fCAvKiArICovIGNoID09PSAweDJkIC8qIC0gKi8pIHtcbiAgICAgIGlmIChDSE9NUElOR19DTElQID09PSBjaG9tcGluZykge1xuICAgICAgICBjaG9tcGluZyA9IGNoID09PSAweDJiIC8qICsgKi8gPyBDSE9NUElOR19LRUVQIDogQ0hPTVBJTkdfU1RSSVA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhyb3dFcnJvcihzdGF0ZSwgXCJyZXBlYXQgb2YgYSBjaG9tcGluZyBtb2RlIGlkZW50aWZpZXJcIik7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICgodG1wID0gZnJvbURlY2ltYWxDb2RlKGNoKSkgPj0gMCkge1xuICAgICAgaWYgKHRtcCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gdGhyb3dFcnJvcihcbiAgICAgICAgICBzdGF0ZSxcbiAgICAgICAgICBcImJhZCBleHBsaWNpdCBpbmRlbnRhdGlvbiB3aWR0aCBvZiBhIGJsb2NrIHNjYWxhcjsgaXQgY2Fubm90IGJlIGxlc3MgdGhhbiBvbmVcIixcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoIWRldGVjdGVkSW5kZW50KSB7XG4gICAgICAgIHRleHRJbmRlbnQgPSBub2RlSW5kZW50ICsgdG1wIC0gMTtcbiAgICAgICAgZGV0ZWN0ZWRJbmRlbnQgPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRocm93RXJyb3Ioc3RhdGUsIFwicmVwZWF0IG9mIGFuIGluZGVudGF0aW9uIHdpZHRoIGlkZW50aWZpZXJcIik7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc1doaXRlU3BhY2UoY2gpKSB7XG4gICAgZG8ge1xuICAgICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KCsrc3RhdGUucG9zaXRpb24pO1xuICAgIH0gd2hpbGUgKGlzV2hpdGVTcGFjZShjaCkpO1xuXG4gICAgaWYgKGNoID09PSAweDIzIC8qICMgKi8pIHtcbiAgICAgIGRvIHtcbiAgICAgICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KCsrc3RhdGUucG9zaXRpb24pO1xuICAgICAgfSB3aGlsZSAoIWlzRU9MKGNoKSAmJiBjaCAhPT0gMCk7XG4gICAgfVxuICB9XG5cbiAgd2hpbGUgKGNoICE9PSAwKSB7XG4gICAgcmVhZExpbmVCcmVhayhzdGF0ZSk7XG4gICAgc3RhdGUubGluZUluZGVudCA9IDA7XG5cbiAgICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24pO1xuXG4gICAgd2hpbGUgKFxuICAgICAgKCFkZXRlY3RlZEluZGVudCB8fCBzdGF0ZS5saW5lSW5kZW50IDwgdGV4dEluZGVudCkgJiZcbiAgICAgIGNoID09PSAweDIwIC8qIFNwYWNlICovXG4gICAgKSB7XG4gICAgICBzdGF0ZS5saW5lSW5kZW50Kys7XG4gICAgICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoKytzdGF0ZS5wb3NpdGlvbik7XG4gICAgfVxuXG4gICAgaWYgKCFkZXRlY3RlZEluZGVudCAmJiBzdGF0ZS5saW5lSW5kZW50ID4gdGV4dEluZGVudCkge1xuICAgICAgdGV4dEluZGVudCA9IHN0YXRlLmxpbmVJbmRlbnQ7XG4gICAgfVxuXG4gICAgaWYgKGlzRU9MKGNoKSkge1xuICAgICAgZW1wdHlMaW5lcysrO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gRW5kIG9mIHRoZSBzY2FsYXIuXG4gICAgaWYgKHN0YXRlLmxpbmVJbmRlbnQgPCB0ZXh0SW5kZW50KSB7XG4gICAgICAvLyBQZXJmb3JtIHRoZSBjaG9tcGluZy5cbiAgICAgIGlmIChjaG9tcGluZyA9PT0gQ0hPTVBJTkdfS0VFUCkge1xuICAgICAgICBzdGF0ZS5yZXN1bHQgKz0gY29tbW9uLnJlcGVhdChcbiAgICAgICAgICBcIlxcblwiLFxuICAgICAgICAgIGRpZFJlYWRDb250ZW50ID8gMSArIGVtcHR5TGluZXMgOiBlbXB0eUxpbmVzLFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChjaG9tcGluZyA9PT0gQ0hPTVBJTkdfQ0xJUCkge1xuICAgICAgICBpZiAoZGlkUmVhZENvbnRlbnQpIHtcbiAgICAgICAgICAvLyBpLmUuIG9ubHkgaWYgdGhlIHNjYWxhciBpcyBub3QgZW1wdHkuXG4gICAgICAgICAgc3RhdGUucmVzdWx0ICs9IFwiXFxuXCI7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQnJlYWsgdGhpcyBgd2hpbGVgIGN5Y2xlIGFuZCBnbyB0byB0aGUgZnVuY3Rpb24ncyBlcGlsb2d1ZS5cbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIC8vIEZvbGRlZCBzdHlsZTogdXNlIGZhbmN5IHJ1bGVzIHRvIGhhbmRsZSBsaW5lIGJyZWFrcy5cbiAgICBpZiAoZm9sZGluZykge1xuICAgICAgLy8gTGluZXMgc3RhcnRpbmcgd2l0aCB3aGl0ZSBzcGFjZSBjaGFyYWN0ZXJzIChtb3JlLWluZGVudGVkIGxpbmVzKSBhcmUgbm90IGZvbGRlZC5cbiAgICAgIGlmIChpc1doaXRlU3BhY2UoY2gpKSB7XG4gICAgICAgIGF0TW9yZUluZGVudGVkID0gdHJ1ZTtcbiAgICAgICAgLy8gZXhjZXB0IGZvciB0aGUgZmlyc3QgY29udGVudCBsaW5lIChjZi4gRXhhbXBsZSA4LjEpXG4gICAgICAgIHN0YXRlLnJlc3VsdCArPSBjb21tb24ucmVwZWF0KFxuICAgICAgICAgIFwiXFxuXCIsXG4gICAgICAgICAgZGlkUmVhZENvbnRlbnQgPyAxICsgZW1wdHlMaW5lcyA6IGVtcHR5TGluZXMsXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gRW5kIG9mIG1vcmUtaW5kZW50ZWQgYmxvY2suXG4gICAgICB9IGVsc2UgaWYgKGF0TW9yZUluZGVudGVkKSB7XG4gICAgICAgIGF0TW9yZUluZGVudGVkID0gZmFsc2U7XG4gICAgICAgIHN0YXRlLnJlc3VsdCArPSBjb21tb24ucmVwZWF0KFwiXFxuXCIsIGVtcHR5TGluZXMgKyAxKTtcblxuICAgICAgICAvLyBKdXN0IG9uZSBsaW5lIGJyZWFrIC0gcGVyY2VpdmUgYXMgdGhlIHNhbWUgbGluZS5cbiAgICAgIH0gZWxzZSBpZiAoZW1wdHlMaW5lcyA9PT0gMCkge1xuICAgICAgICBpZiAoZGlkUmVhZENvbnRlbnQpIHtcbiAgICAgICAgICAvLyBpLmUuIG9ubHkgaWYgd2UgaGF2ZSBhbHJlYWR5IHJlYWQgc29tZSBzY2FsYXIgY29udGVudC5cbiAgICAgICAgICBzdGF0ZS5yZXN1bHQgKz0gXCIgXCI7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTZXZlcmFsIGxpbmUgYnJlYWtzIC0gcGVyY2VpdmUgYXMgZGlmZmVyZW50IGxpbmVzLlxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RhdGUucmVzdWx0ICs9IGNvbW1vbi5yZXBlYXQoXCJcXG5cIiwgZW1wdHlMaW5lcyk7XG4gICAgICB9XG5cbiAgICAgIC8vIExpdGVyYWwgc3R5bGU6IGp1c3QgYWRkIGV4YWN0IG51bWJlciBvZiBsaW5lIGJyZWFrcyBiZXR3ZWVuIGNvbnRlbnQgbGluZXMuXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEtlZXAgYWxsIGxpbmUgYnJlYWtzIGV4Y2VwdCB0aGUgaGVhZGVyIGxpbmUgYnJlYWsuXG4gICAgICBzdGF0ZS5yZXN1bHQgKz0gY29tbW9uLnJlcGVhdChcbiAgICAgICAgXCJcXG5cIixcbiAgICAgICAgZGlkUmVhZENvbnRlbnQgPyAxICsgZW1wdHlMaW5lcyA6IGVtcHR5TGluZXMsXG4gICAgICApO1xuICAgIH1cblxuICAgIGRpZFJlYWRDb250ZW50ID0gdHJ1ZTtcbiAgICBkZXRlY3RlZEluZGVudCA9IHRydWU7XG4gICAgZW1wdHlMaW5lcyA9IDA7XG4gICAgY29uc3QgY2FwdHVyZVN0YXJ0ID0gc3RhdGUucG9zaXRpb247XG5cbiAgICB3aGlsZSAoIWlzRU9MKGNoKSAmJiBjaCAhPT0gMCkge1xuICAgICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KCsrc3RhdGUucG9zaXRpb24pO1xuICAgIH1cblxuICAgIGNhcHR1cmVTZWdtZW50KHN0YXRlLCBjYXB0dXJlU3RhcnQsIHN0YXRlLnBvc2l0aW9uLCBmYWxzZSk7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gcmVhZEJsb2NrU2VxdWVuY2Uoc3RhdGU6IExvYWRlclN0YXRlLCBub2RlSW5kZW50OiBudW1iZXIpOiBib29sZWFuIHtcbiAgbGV0IGxpbmU6IG51bWJlcixcbiAgICBmb2xsb3dpbmc6IG51bWJlcixcbiAgICBkZXRlY3RlZCA9IGZhbHNlLFxuICAgIGNoOiBudW1iZXI7XG4gIGNvbnN0IHRhZyA9IHN0YXRlLnRhZyxcbiAgICBhbmNob3IgPSBzdGF0ZS5hbmNob3IsXG4gICAgcmVzdWx0OiB1bmtub3duW10gPSBbXTtcblxuICBpZiAoXG4gICAgc3RhdGUuYW5jaG9yICE9PSBudWxsICYmXG4gICAgdHlwZW9mIHN0YXRlLmFuY2hvciAhPT0gXCJ1bmRlZmluZWRcIiAmJlxuICAgIHR5cGVvZiBzdGF0ZS5hbmNob3JNYXAgIT09IFwidW5kZWZpbmVkXCJcbiAgKSB7XG4gICAgc3RhdGUuYW5jaG9yTWFwW3N0YXRlLmFuY2hvcl0gPSByZXN1bHQ7XG4gIH1cblxuICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24pO1xuXG4gIHdoaWxlIChjaCAhPT0gMCkge1xuICAgIGlmIChjaCAhPT0gMHgyZCAvKiAtICovKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBmb2xsb3dpbmcgPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KHN0YXRlLnBvc2l0aW9uICsgMSk7XG5cbiAgICBpZiAoIWlzV3NPckVvbChmb2xsb3dpbmcpKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBkZXRlY3RlZCA9IHRydWU7XG4gICAgc3RhdGUucG9zaXRpb24rKztcblxuICAgIGlmIChza2lwU2VwYXJhdGlvblNwYWNlKHN0YXRlLCB0cnVlLCAtMSkpIHtcbiAgICAgIGlmIChzdGF0ZS5saW5lSW5kZW50IDw9IG5vZGVJbmRlbnQpIHtcbiAgICAgICAgcmVzdWx0LnB1c2gobnVsbCk7XG4gICAgICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdChzdGF0ZS5wb3NpdGlvbik7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxpbmUgPSBzdGF0ZS5saW5lO1xuICAgIGNvbXBvc2VOb2RlKHN0YXRlLCBub2RlSW5kZW50LCBDT05URVhUX0JMT0NLX0lOLCBmYWxzZSwgdHJ1ZSk7XG4gICAgcmVzdWx0LnB1c2goc3RhdGUucmVzdWx0KTtcbiAgICBza2lwU2VwYXJhdGlvblNwYWNlKHN0YXRlLCB0cnVlLCAtMSk7XG5cbiAgICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24pO1xuXG4gICAgaWYgKChzdGF0ZS5saW5lID09PSBsaW5lIHx8IHN0YXRlLmxpbmVJbmRlbnQgPiBub2RlSW5kZW50KSAmJiBjaCAhPT0gMCkge1xuICAgICAgcmV0dXJuIHRocm93RXJyb3Ioc3RhdGUsIFwiYmFkIGluZGVudGF0aW9uIG9mIGEgc2VxdWVuY2UgZW50cnlcIik7XG4gICAgfSBlbHNlIGlmIChzdGF0ZS5saW5lSW5kZW50IDwgbm9kZUluZGVudCkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgaWYgKGRldGVjdGVkKSB7XG4gICAgc3RhdGUudGFnID0gdGFnO1xuICAgIHN0YXRlLmFuY2hvciA9IGFuY2hvcjtcbiAgICBzdGF0ZS5raW5kID0gXCJzZXF1ZW5jZVwiO1xuICAgIHN0YXRlLnJlc3VsdCA9IHJlc3VsdDtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHJlYWRCbG9ja01hcHBpbmcoXG4gIHN0YXRlOiBMb2FkZXJTdGF0ZSxcbiAgbm9kZUluZGVudDogbnVtYmVyLFxuICBmbG93SW5kZW50OiBudW1iZXIsXG4pOiBib29sZWFuIHtcbiAgY29uc3QgdGFnID0gc3RhdGUudGFnLFxuICAgIGFuY2hvciA9IHN0YXRlLmFuY2hvcixcbiAgICByZXN1bHQgPSB7fSxcbiAgICBvdmVycmlkYWJsZUtleXMgPSB7fTtcbiAgbGV0IGZvbGxvd2luZzogbnVtYmVyLFxuICAgIGFsbG93Q29tcGFjdCA9IGZhbHNlLFxuICAgIGxpbmU6IG51bWJlcixcbiAgICBwb3M6IG51bWJlcixcbiAgICBrZXlUYWcgPSBudWxsLFxuICAgIGtleU5vZGUgPSBudWxsLFxuICAgIHZhbHVlTm9kZSA9IG51bGwsXG4gICAgYXRFeHBsaWNpdEtleSA9IGZhbHNlLFxuICAgIGRldGVjdGVkID0gZmFsc2UsXG4gICAgY2g6IG51bWJlcjtcblxuICBpZiAoXG4gICAgc3RhdGUuYW5jaG9yICE9PSBudWxsICYmXG4gICAgdHlwZW9mIHN0YXRlLmFuY2hvciAhPT0gXCJ1bmRlZmluZWRcIiAmJlxuICAgIHR5cGVvZiBzdGF0ZS5hbmNob3JNYXAgIT09IFwidW5kZWZpbmVkXCJcbiAgKSB7XG4gICAgc3RhdGUuYW5jaG9yTWFwW3N0YXRlLmFuY2hvcl0gPSByZXN1bHQ7XG4gIH1cblxuICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24pO1xuXG4gIHdoaWxlIChjaCAhPT0gMCkge1xuICAgIGZvbGxvd2luZyA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24gKyAxKTtcbiAgICBsaW5lID0gc3RhdGUubGluZTsgLy8gU2F2ZSB0aGUgY3VycmVudCBsaW5lLlxuICAgIHBvcyA9IHN0YXRlLnBvc2l0aW9uO1xuXG4gICAgLy9cbiAgICAvLyBFeHBsaWNpdCBub3RhdGlvbiBjYXNlLiBUaGVyZSBhcmUgdHdvIHNlcGFyYXRlIGJsb2NrczpcbiAgICAvLyBmaXJzdCBmb3IgdGhlIGtleSAoZGVub3RlZCBieSBcIj9cIikgYW5kIHNlY29uZCBmb3IgdGhlIHZhbHVlIChkZW5vdGVkIGJ5IFwiOlwiKVxuICAgIC8vXG4gICAgaWYgKChjaCA9PT0gMHgzZiB8fCAvKiA/ICovIGNoID09PSAweDNhKSAmJiAvKiA6ICovIGlzV3NPckVvbChmb2xsb3dpbmcpKSB7XG4gICAgICBpZiAoY2ggPT09IDB4M2YgLyogPyAqLykge1xuICAgICAgICBpZiAoYXRFeHBsaWNpdEtleSkge1xuICAgICAgICAgIHN0b3JlTWFwcGluZ1BhaXIoXG4gICAgICAgICAgICBzdGF0ZSxcbiAgICAgICAgICAgIHJlc3VsdCxcbiAgICAgICAgICAgIG92ZXJyaWRhYmxlS2V5cyxcbiAgICAgICAgICAgIGtleVRhZyBhcyBzdHJpbmcsXG4gICAgICAgICAgICBrZXlOb2RlLFxuICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICApO1xuICAgICAgICAgIGtleVRhZyA9IGtleU5vZGUgPSB2YWx1ZU5vZGUgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgZGV0ZWN0ZWQgPSB0cnVlO1xuICAgICAgICBhdEV4cGxpY2l0S2V5ID0gdHJ1ZTtcbiAgICAgICAgYWxsb3dDb21wYWN0ID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSBpZiAoYXRFeHBsaWNpdEtleSkge1xuICAgICAgICAvLyBpLmUuIDB4M0EvKiA6ICovID09PSBjaGFyYWN0ZXIgYWZ0ZXIgdGhlIGV4cGxpY2l0IGtleS5cbiAgICAgICAgYXRFeHBsaWNpdEtleSA9IGZhbHNlO1xuICAgICAgICBhbGxvd0NvbXBhY3QgPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRocm93RXJyb3IoXG4gICAgICAgICAgc3RhdGUsXG4gICAgICAgICAgXCJpbmNvbXBsZXRlIGV4cGxpY2l0IG1hcHBpbmcgcGFpcjsgYSBrZXkgbm9kZSBpcyBtaXNzZWQ7IG9yIGZvbGxvd2VkIGJ5IGEgbm9uLXRhYnVsYXRlZCBlbXB0eSBsaW5lXCIsXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIHN0YXRlLnBvc2l0aW9uICs9IDE7XG4gICAgICBjaCA9IGZvbGxvd2luZztcblxuICAgICAgLy9cbiAgICAgIC8vIEltcGxpY2l0IG5vdGF0aW9uIGNhc2UuIEZsb3ctc3R5bGUgbm9kZSBhcyB0aGUga2V5IGZpcnN0LCB0aGVuIFwiOlwiLCBhbmQgdGhlIHZhbHVlLlxuICAgICAgLy9cbiAgICB9IGVsc2UgaWYgKGNvbXBvc2VOb2RlKHN0YXRlLCBmbG93SW5kZW50LCBDT05URVhUX0ZMT1dfT1VULCBmYWxzZSwgdHJ1ZSkpIHtcbiAgICAgIGlmIChzdGF0ZS5saW5lID09PSBsaW5lKSB7XG4gICAgICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdChzdGF0ZS5wb3NpdGlvbik7XG5cbiAgICAgICAgd2hpbGUgKGlzV2hpdGVTcGFjZShjaCkpIHtcbiAgICAgICAgICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoKytzdGF0ZS5wb3NpdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoY2ggPT09IDB4M2EgLyogOiAqLykge1xuICAgICAgICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdCgrK3N0YXRlLnBvc2l0aW9uKTtcblxuICAgICAgICAgIGlmICghaXNXc09yRW9sKGNoKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRocm93RXJyb3IoXG4gICAgICAgICAgICAgIHN0YXRlLFxuICAgICAgICAgICAgICBcImEgd2hpdGVzcGFjZSBjaGFyYWN0ZXIgaXMgZXhwZWN0ZWQgYWZ0ZXIgdGhlIGtleS12YWx1ZSBzZXBhcmF0b3Igd2l0aGluIGEgYmxvY2sgbWFwcGluZ1wiLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoYXRFeHBsaWNpdEtleSkge1xuICAgICAgICAgICAgc3RvcmVNYXBwaW5nUGFpcihcbiAgICAgICAgICAgICAgc3RhdGUsXG4gICAgICAgICAgICAgIHJlc3VsdCxcbiAgICAgICAgICAgICAgb3ZlcnJpZGFibGVLZXlzLFxuICAgICAgICAgICAgICBrZXlUYWcgYXMgc3RyaW5nLFxuICAgICAgICAgICAgICBrZXlOb2RlLFxuICAgICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGtleVRhZyA9IGtleU5vZGUgPSB2YWx1ZU5vZGUgPSBudWxsO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGRldGVjdGVkID0gdHJ1ZTtcbiAgICAgICAgICBhdEV4cGxpY2l0S2V5ID0gZmFsc2U7XG4gICAgICAgICAgYWxsb3dDb21wYWN0ID0gZmFsc2U7XG4gICAgICAgICAga2V5VGFnID0gc3RhdGUudGFnO1xuICAgICAgICAgIGtleU5vZGUgPSBzdGF0ZS5yZXN1bHQ7XG4gICAgICAgIH0gZWxzZSBpZiAoZGV0ZWN0ZWQpIHtcbiAgICAgICAgICByZXR1cm4gdGhyb3dFcnJvcihcbiAgICAgICAgICAgIHN0YXRlLFxuICAgICAgICAgICAgXCJjYW4gbm90IHJlYWQgYW4gaW1wbGljaXQgbWFwcGluZyBwYWlyOyBhIGNvbG9uIGlzIG1pc3NlZFwiLFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RhdGUudGFnID0gdGFnO1xuICAgICAgICAgIHN0YXRlLmFuY2hvciA9IGFuY2hvcjtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTsgLy8gS2VlcCB0aGUgcmVzdWx0IG9mIGBjb21wb3NlTm9kZWAuXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoZGV0ZWN0ZWQpIHtcbiAgICAgICAgcmV0dXJuIHRocm93RXJyb3IoXG4gICAgICAgICAgc3RhdGUsXG4gICAgICAgICAgXCJjYW4gbm90IHJlYWQgYSBibG9jayBtYXBwaW5nIGVudHJ5OyBhIG11bHRpbGluZSBrZXkgbWF5IG5vdCBiZSBhbiBpbXBsaWNpdCBrZXlcIixcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXRlLnRhZyA9IHRhZztcbiAgICAgICAgc3RhdGUuYW5jaG9yID0gYW5jaG9yO1xuICAgICAgICByZXR1cm4gdHJ1ZTsgLy8gS2VlcCB0aGUgcmVzdWx0IG9mIGBjb21wb3NlTm9kZWAuXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGJyZWFrOyAvLyBSZWFkaW5nIGlzIGRvbmUuIEdvIHRvIHRoZSBlcGlsb2d1ZS5cbiAgICB9XG5cbiAgICAvL1xuICAgIC8vIENvbW1vbiByZWFkaW5nIGNvZGUgZm9yIGJvdGggZXhwbGljaXQgYW5kIGltcGxpY2l0IG5vdGF0aW9ucy5cbiAgICAvL1xuICAgIGlmIChzdGF0ZS5saW5lID09PSBsaW5lIHx8IHN0YXRlLmxpbmVJbmRlbnQgPiBub2RlSW5kZW50KSB7XG4gICAgICBpZiAoXG4gICAgICAgIGNvbXBvc2VOb2RlKHN0YXRlLCBub2RlSW5kZW50LCBDT05URVhUX0JMT0NLX09VVCwgdHJ1ZSwgYWxsb3dDb21wYWN0KVxuICAgICAgKSB7XG4gICAgICAgIGlmIChhdEV4cGxpY2l0S2V5KSB7XG4gICAgICAgICAga2V5Tm9kZSA9IHN0YXRlLnJlc3VsdDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWx1ZU5vZGUgPSBzdGF0ZS5yZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKCFhdEV4cGxpY2l0S2V5KSB7XG4gICAgICAgIHN0b3JlTWFwcGluZ1BhaXIoXG4gICAgICAgICAgc3RhdGUsXG4gICAgICAgICAgcmVzdWx0LFxuICAgICAgICAgIG92ZXJyaWRhYmxlS2V5cyxcbiAgICAgICAgICBrZXlUYWcgYXMgc3RyaW5nLFxuICAgICAgICAgIGtleU5vZGUsXG4gICAgICAgICAgdmFsdWVOb2RlLFxuICAgICAgICAgIGxpbmUsXG4gICAgICAgICAgcG9zLFxuICAgICAgICApO1xuICAgICAgICBrZXlUYWcgPSBrZXlOb2RlID0gdmFsdWVOb2RlID0gbnVsbDtcbiAgICAgIH1cblxuICAgICAgc2tpcFNlcGFyYXRpb25TcGFjZShzdGF0ZSwgdHJ1ZSwgLTEpO1xuICAgICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KHN0YXRlLnBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICBpZiAoc3RhdGUubGluZUluZGVudCA+IG5vZGVJbmRlbnQgJiYgY2ggIT09IDApIHtcbiAgICAgIHJldHVybiB0aHJvd0Vycm9yKHN0YXRlLCBcImJhZCBpbmRlbnRhdGlvbiBvZiBhIG1hcHBpbmcgZW50cnlcIik7XG4gICAgfSBlbHNlIGlmIChzdGF0ZS5saW5lSW5kZW50IDwgbm9kZUluZGVudCkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy9cbiAgLy8gRXBpbG9ndWUuXG4gIC8vXG5cbiAgLy8gU3BlY2lhbCBjYXNlOiBsYXN0IG1hcHBpbmcncyBub2RlIGNvbnRhaW5zIG9ubHkgdGhlIGtleSBpbiBleHBsaWNpdCBub3RhdGlvbi5cbiAgaWYgKGF0RXhwbGljaXRLZXkpIHtcbiAgICBzdG9yZU1hcHBpbmdQYWlyKFxuICAgICAgc3RhdGUsXG4gICAgICByZXN1bHQsXG4gICAgICBvdmVycmlkYWJsZUtleXMsXG4gICAgICBrZXlUYWcgYXMgc3RyaW5nLFxuICAgICAga2V5Tm9kZSxcbiAgICAgIG51bGwsXG4gICAgKTtcbiAgfVxuXG4gIC8vIEV4cG9zZSB0aGUgcmVzdWx0aW5nIG1hcHBpbmcuXG4gIGlmIChkZXRlY3RlZCkge1xuICAgIHN0YXRlLnRhZyA9IHRhZztcbiAgICBzdGF0ZS5hbmNob3IgPSBhbmNob3I7XG4gICAgc3RhdGUua2luZCA9IFwibWFwcGluZ1wiO1xuICAgIHN0YXRlLnJlc3VsdCA9IHJlc3VsdDtcbiAgfVxuXG4gIHJldHVybiBkZXRlY3RlZDtcbn1cblxuZnVuY3Rpb24gcmVhZFRhZ1Byb3BlcnR5KHN0YXRlOiBMb2FkZXJTdGF0ZSk6IGJvb2xlYW4ge1xuICBsZXQgcG9zaXRpb246IG51bWJlcixcbiAgICBpc1ZlcmJhdGltID0gZmFsc2UsXG4gICAgaXNOYW1lZCA9IGZhbHNlLFxuICAgIHRhZ0hhbmRsZSA9IFwiXCIsXG4gICAgdGFnTmFtZTogc3RyaW5nLFxuICAgIGNoOiBudW1iZXI7XG5cbiAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KHN0YXRlLnBvc2l0aW9uKTtcblxuICBpZiAoY2ggIT09IDB4MjEgLyogISAqLykgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChzdGF0ZS50YWcgIT09IG51bGwpIHtcbiAgICByZXR1cm4gdGhyb3dFcnJvcihzdGF0ZSwgXCJkdXBsaWNhdGlvbiBvZiBhIHRhZyBwcm9wZXJ0eVwiKTtcbiAgfVxuXG4gIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdCgrK3N0YXRlLnBvc2l0aW9uKTtcblxuICBpZiAoY2ggPT09IDB4M2MgLyogPCAqLykge1xuICAgIGlzVmVyYmF0aW0gPSB0cnVlO1xuICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdCgrK3N0YXRlLnBvc2l0aW9uKTtcbiAgfSBlbHNlIGlmIChjaCA9PT0gMHgyMSAvKiAhICovKSB7XG4gICAgaXNOYW1lZCA9IHRydWU7XG4gICAgdGFnSGFuZGxlID0gXCIhIVwiO1xuICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdCgrK3N0YXRlLnBvc2l0aW9uKTtcbiAgfSBlbHNlIHtcbiAgICB0YWdIYW5kbGUgPSBcIiFcIjtcbiAgfVxuXG4gIHBvc2l0aW9uID0gc3RhdGUucG9zaXRpb247XG5cbiAgaWYgKGlzVmVyYmF0aW0pIHtcbiAgICBkbyB7XG4gICAgICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoKytzdGF0ZS5wb3NpdGlvbik7XG4gICAgfSB3aGlsZSAoY2ggIT09IDAgJiYgY2ggIT09IDB4M2UgLyogPiAqLyk7XG5cbiAgICBpZiAoc3RhdGUucG9zaXRpb24gPCBzdGF0ZS5sZW5ndGgpIHtcbiAgICAgIHRhZ05hbWUgPSBzdGF0ZS5pbnB1dC5zbGljZShwb3NpdGlvbiwgc3RhdGUucG9zaXRpb24pO1xuICAgICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KCsrc3RhdGUucG9zaXRpb24pO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhyb3dFcnJvcihcbiAgICAgICAgc3RhdGUsXG4gICAgICAgIFwidW5leHBlY3RlZCBlbmQgb2YgdGhlIHN0cmVhbSB3aXRoaW4gYSB2ZXJiYXRpbSB0YWdcIixcbiAgICAgICk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHdoaWxlIChjaCAhPT0gMCAmJiAhaXNXc09yRW9sKGNoKSkge1xuICAgICAgaWYgKGNoID09PSAweDIxIC8qICEgKi8pIHtcbiAgICAgICAgaWYgKCFpc05hbWVkKSB7XG4gICAgICAgICAgdGFnSGFuZGxlID0gc3RhdGUuaW5wdXQuc2xpY2UocG9zaXRpb24gLSAxLCBzdGF0ZS5wb3NpdGlvbiArIDEpO1xuXG4gICAgICAgICAgaWYgKCFQQVRURVJOX1RBR19IQU5ETEUudGVzdCh0YWdIYW5kbGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhyb3dFcnJvcihcbiAgICAgICAgICAgICAgc3RhdGUsXG4gICAgICAgICAgICAgIFwibmFtZWQgdGFnIGhhbmRsZSBjYW5ub3QgY29udGFpbiBzdWNoIGNoYXJhY3RlcnNcIixcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaXNOYW1lZCA9IHRydWU7XG4gICAgICAgICAgcG9zaXRpb24gPSBzdGF0ZS5wb3NpdGlvbiArIDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIHRocm93RXJyb3IoXG4gICAgICAgICAgICBzdGF0ZSxcbiAgICAgICAgICAgIFwidGFnIHN1ZmZpeCBjYW5ub3QgY29udGFpbiBleGNsYW1hdGlvbiBtYXJrc1wiLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KCsrc3RhdGUucG9zaXRpb24pO1xuICAgIH1cblxuICAgIHRhZ05hbWUgPSBzdGF0ZS5pbnB1dC5zbGljZShwb3NpdGlvbiwgc3RhdGUucG9zaXRpb24pO1xuXG4gICAgaWYgKFBBVFRFUk5fRkxPV19JTkRJQ0FUT1JTLnRlc3QodGFnTmFtZSkpIHtcbiAgICAgIHJldHVybiB0aHJvd0Vycm9yKFxuICAgICAgICBzdGF0ZSxcbiAgICAgICAgXCJ0YWcgc3VmZml4IGNhbm5vdCBjb250YWluIGZsb3cgaW5kaWNhdG9yIGNoYXJhY3RlcnNcIixcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRhZ05hbWUgJiYgIVBBVFRFUk5fVEFHX1VSSS50ZXN0KHRhZ05hbWUpKSB7XG4gICAgcmV0dXJuIHRocm93RXJyb3IoXG4gICAgICBzdGF0ZSxcbiAgICAgIGB0YWcgbmFtZSBjYW5ub3QgY29udGFpbiBzdWNoIGNoYXJhY3RlcnM6ICR7dGFnTmFtZX1gLFxuICAgICk7XG4gIH1cblxuICBpZiAoaXNWZXJiYXRpbSkge1xuICAgIHN0YXRlLnRhZyA9IHRhZ05hbWU7XG4gIH0gZWxzZSBpZiAoXG4gICAgdHlwZW9mIHN0YXRlLnRhZ01hcCAhPT0gXCJ1bmRlZmluZWRcIiAmJlxuICAgIGhhc093bihzdGF0ZS50YWdNYXAsIHRhZ0hhbmRsZSlcbiAgKSB7XG4gICAgc3RhdGUudGFnID0gc3RhdGUudGFnTWFwW3RhZ0hhbmRsZV0gKyB0YWdOYW1lO1xuICB9IGVsc2UgaWYgKHRhZ0hhbmRsZSA9PT0gXCIhXCIpIHtcbiAgICBzdGF0ZS50YWcgPSBgISR7dGFnTmFtZX1gO1xuICB9IGVsc2UgaWYgKHRhZ0hhbmRsZSA9PT0gXCIhIVwiKSB7XG4gICAgc3RhdGUudGFnID0gYHRhZzp5YW1sLm9yZywyMDAyOiR7dGFnTmFtZX1gO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiB0aHJvd0Vycm9yKHN0YXRlLCBgdW5kZWNsYXJlZCB0YWcgaGFuZGxlIFwiJHt0YWdIYW5kbGV9XCJgKTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiByZWFkQW5jaG9yUHJvcGVydHkoc3RhdGU6IExvYWRlclN0YXRlKTogYm9vbGVhbiB7XG4gIGxldCBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24pO1xuICBpZiAoY2ggIT09IDB4MjYgLyogJiAqLykgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChzdGF0ZS5hbmNob3IgIT09IG51bGwpIHtcbiAgICByZXR1cm4gdGhyb3dFcnJvcihzdGF0ZSwgXCJkdXBsaWNhdGlvbiBvZiBhbiBhbmNob3IgcHJvcGVydHlcIik7XG4gIH1cbiAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KCsrc3RhdGUucG9zaXRpb24pO1xuXG4gIGNvbnN0IHBvc2l0aW9uID0gc3RhdGUucG9zaXRpb247XG4gIHdoaWxlIChjaCAhPT0gMCAmJiAhaXNXc09yRW9sKGNoKSAmJiAhaXNGbG93SW5kaWNhdG9yKGNoKSkge1xuICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdCgrK3N0YXRlLnBvc2l0aW9uKTtcbiAgfVxuXG4gIGlmIChzdGF0ZS5wb3NpdGlvbiA9PT0gcG9zaXRpb24pIHtcbiAgICByZXR1cm4gdGhyb3dFcnJvcihcbiAgICAgIHN0YXRlLFxuICAgICAgXCJuYW1lIG9mIGFuIGFuY2hvciBub2RlIG11c3QgY29udGFpbiBhdCBsZWFzdCBvbmUgY2hhcmFjdGVyXCIsXG4gICAgKTtcbiAgfVxuXG4gIHN0YXRlLmFuY2hvciA9IHN0YXRlLmlucHV0LnNsaWNlKHBvc2l0aW9uLCBzdGF0ZS5wb3NpdGlvbik7XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiByZWFkQWxpYXMoc3RhdGU6IExvYWRlclN0YXRlKTogYm9vbGVhbiB7XG4gIGxldCBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24pO1xuXG4gIGlmIChjaCAhPT0gMHgyYSAvKiAqICovKSByZXR1cm4gZmFsc2U7XG5cbiAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KCsrc3RhdGUucG9zaXRpb24pO1xuICBjb25zdCBfcG9zaXRpb24gPSBzdGF0ZS5wb3NpdGlvbjtcblxuICB3aGlsZSAoY2ggIT09IDAgJiYgIWlzV3NPckVvbChjaCkgJiYgIWlzRmxvd0luZGljYXRvcihjaCkpIHtcbiAgICBjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoKytzdGF0ZS5wb3NpdGlvbik7XG4gIH1cblxuICBpZiAoc3RhdGUucG9zaXRpb24gPT09IF9wb3NpdGlvbikge1xuICAgIHJldHVybiB0aHJvd0Vycm9yKFxuICAgICAgc3RhdGUsXG4gICAgICBcIm5hbWUgb2YgYW4gYWxpYXMgbm9kZSBtdXN0IGNvbnRhaW4gYXQgbGVhc3Qgb25lIGNoYXJhY3RlclwiLFxuICAgICk7XG4gIH1cblxuICBjb25zdCBhbGlhcyA9IHN0YXRlLmlucHV0LnNsaWNlKF9wb3NpdGlvbiwgc3RhdGUucG9zaXRpb24pO1xuICBpZiAoXG4gICAgdHlwZW9mIHN0YXRlLmFuY2hvck1hcCAhPT0gXCJ1bmRlZmluZWRcIiAmJlxuICAgICFoYXNPd24oc3RhdGUuYW5jaG9yTWFwLCBhbGlhcylcbiAgKSB7XG4gICAgcmV0dXJuIHRocm93RXJyb3Ioc3RhdGUsIGB1bmlkZW50aWZpZWQgYWxpYXMgXCIke2FsaWFzfVwiYCk7XG4gIH1cblxuICBpZiAodHlwZW9mIHN0YXRlLmFuY2hvck1hcCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHN0YXRlLnJlc3VsdCA9IHN0YXRlLmFuY2hvck1hcFthbGlhc107XG4gIH1cbiAgc2tpcFNlcGFyYXRpb25TcGFjZShzdGF0ZSwgdHJ1ZSwgLTEpO1xuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gY29tcG9zZU5vZGUoXG4gIHN0YXRlOiBMb2FkZXJTdGF0ZSxcbiAgcGFyZW50SW5kZW50OiBudW1iZXIsXG4gIG5vZGVDb250ZXh0OiBudW1iZXIsXG4gIGFsbG93VG9TZWVrOiBib29sZWFuLFxuICBhbGxvd0NvbXBhY3Q6IGJvb2xlYW4sXG4pOiBib29sZWFuIHtcbiAgbGV0IGFsbG93QmxvY2tTY2FsYXJzOiBib29sZWFuLFxuICAgIGFsbG93QmxvY2tDb2xsZWN0aW9uczogYm9vbGVhbixcbiAgICBpbmRlbnRTdGF0dXMgPSAxLCAvLyAxOiB0aGlzPnBhcmVudCwgMDogdGhpcz1wYXJlbnQsIC0xOiB0aGlzPHBhcmVudFxuICAgIGF0TmV3TGluZSA9IGZhbHNlLFxuICAgIGhhc0NvbnRlbnQgPSBmYWxzZSxcbiAgICB0eXBlOiBUeXBlLFxuICAgIGZsb3dJbmRlbnQ6IG51bWJlcixcbiAgICBibG9ja0luZGVudDogbnVtYmVyO1xuXG4gIGlmIChzdGF0ZS5saXN0ZW5lciAmJiBzdGF0ZS5saXN0ZW5lciAhPT0gbnVsbCkge1xuICAgIHN0YXRlLmxpc3RlbmVyKFwib3BlblwiLCBzdGF0ZSk7XG4gIH1cblxuICBzdGF0ZS50YWcgPSBudWxsO1xuICBzdGF0ZS5hbmNob3IgPSBudWxsO1xuICBzdGF0ZS5raW5kID0gbnVsbDtcbiAgc3RhdGUucmVzdWx0ID0gbnVsbDtcblxuICBjb25zdCBhbGxvd0Jsb2NrU3R5bGVzID1cbiAgICAoYWxsb3dCbG9ja1NjYWxhcnMgPSBhbGxvd0Jsb2NrQ29sbGVjdGlvbnMgPVxuICAgICAgQ09OVEVYVF9CTE9DS19PVVQgPT09IG5vZGVDb250ZXh0IHx8IENPTlRFWFRfQkxPQ0tfSU4gPT09IG5vZGVDb250ZXh0KTtcblxuICBpZiAoYWxsb3dUb1NlZWspIHtcbiAgICBpZiAoc2tpcFNlcGFyYXRpb25TcGFjZShzdGF0ZSwgdHJ1ZSwgLTEpKSB7XG4gICAgICBhdE5ld0xpbmUgPSB0cnVlO1xuXG4gICAgICBpZiAoc3RhdGUubGluZUluZGVudCA+IHBhcmVudEluZGVudCkge1xuICAgICAgICBpbmRlbnRTdGF0dXMgPSAxO1xuICAgICAgfSBlbHNlIGlmIChzdGF0ZS5saW5lSW5kZW50ID09PSBwYXJlbnRJbmRlbnQpIHtcbiAgICAgICAgaW5kZW50U3RhdHVzID0gMDtcbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUubGluZUluZGVudCA8IHBhcmVudEluZGVudCkge1xuICAgICAgICBpbmRlbnRTdGF0dXMgPSAtMTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAoaW5kZW50U3RhdHVzID09PSAxKSB7XG4gICAgd2hpbGUgKHJlYWRUYWdQcm9wZXJ0eShzdGF0ZSkgfHwgcmVhZEFuY2hvclByb3BlcnR5KHN0YXRlKSkge1xuICAgICAgaWYgKHNraXBTZXBhcmF0aW9uU3BhY2Uoc3RhdGUsIHRydWUsIC0xKSkge1xuICAgICAgICBhdE5ld0xpbmUgPSB0cnVlO1xuICAgICAgICBhbGxvd0Jsb2NrQ29sbGVjdGlvbnMgPSBhbGxvd0Jsb2NrU3R5bGVzO1xuXG4gICAgICAgIGlmIChzdGF0ZS5saW5lSW5kZW50ID4gcGFyZW50SW5kZW50KSB7XG4gICAgICAgICAgaW5kZW50U3RhdHVzID0gMTtcbiAgICAgICAgfSBlbHNlIGlmIChzdGF0ZS5saW5lSW5kZW50ID09PSBwYXJlbnRJbmRlbnQpIHtcbiAgICAgICAgICBpbmRlbnRTdGF0dXMgPSAwO1xuICAgICAgICB9IGVsc2UgaWYgKHN0YXRlLmxpbmVJbmRlbnQgPCBwYXJlbnRJbmRlbnQpIHtcbiAgICAgICAgICBpbmRlbnRTdGF0dXMgPSAtMTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYWxsb3dCbG9ja0NvbGxlY3Rpb25zID0gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKGFsbG93QmxvY2tDb2xsZWN0aW9ucykge1xuICAgIGFsbG93QmxvY2tDb2xsZWN0aW9ucyA9IGF0TmV3TGluZSB8fCBhbGxvd0NvbXBhY3Q7XG4gIH1cblxuICBpZiAoaW5kZW50U3RhdHVzID09PSAxIHx8IENPTlRFWFRfQkxPQ0tfT1VUID09PSBub2RlQ29udGV4dCkge1xuICAgIGNvbnN0IGNvbmQgPSBDT05URVhUX0ZMT1dfSU4gPT09IG5vZGVDb250ZXh0IHx8XG4gICAgICBDT05URVhUX0ZMT1dfT1VUID09PSBub2RlQ29udGV4dDtcbiAgICBmbG93SW5kZW50ID0gY29uZCA/IHBhcmVudEluZGVudCA6IHBhcmVudEluZGVudCArIDE7XG5cbiAgICBibG9ja0luZGVudCA9IHN0YXRlLnBvc2l0aW9uIC0gc3RhdGUubGluZVN0YXJ0O1xuXG4gICAgaWYgKGluZGVudFN0YXR1cyA9PT0gMSkge1xuICAgICAgaWYgKFxuICAgICAgICAoYWxsb3dCbG9ja0NvbGxlY3Rpb25zICYmXG4gICAgICAgICAgKHJlYWRCbG9ja1NlcXVlbmNlKHN0YXRlLCBibG9ja0luZGVudCkgfHxcbiAgICAgICAgICAgIHJlYWRCbG9ja01hcHBpbmcoc3RhdGUsIGJsb2NrSW5kZW50LCBmbG93SW5kZW50KSkpIHx8XG4gICAgICAgIHJlYWRGbG93Q29sbGVjdGlvbihzdGF0ZSwgZmxvd0luZGVudClcbiAgICAgICkge1xuICAgICAgICBoYXNDb250ZW50ID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAoYWxsb3dCbG9ja1NjYWxhcnMgJiYgcmVhZEJsb2NrU2NhbGFyKHN0YXRlLCBmbG93SW5kZW50KSkgfHxcbiAgICAgICAgICByZWFkU2luZ2xlUXVvdGVkU2NhbGFyKHN0YXRlLCBmbG93SW5kZW50KSB8fFxuICAgICAgICAgIHJlYWREb3VibGVRdW90ZWRTY2FsYXIoc3RhdGUsIGZsb3dJbmRlbnQpXG4gICAgICAgICkge1xuICAgICAgICAgIGhhc0NvbnRlbnQgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKHJlYWRBbGlhcyhzdGF0ZSkpIHtcbiAgICAgICAgICBoYXNDb250ZW50ID0gdHJ1ZTtcblxuICAgICAgICAgIGlmIChzdGF0ZS50YWcgIT09IG51bGwgfHwgc3RhdGUuYW5jaG9yICE9PSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhyb3dFcnJvcihcbiAgICAgICAgICAgICAgc3RhdGUsXG4gICAgICAgICAgICAgIFwiYWxpYXMgbm9kZSBzaG91bGQgbm90IGhhdmUgQW55IHByb3BlcnRpZXNcIixcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIHJlYWRQbGFpblNjYWxhcihzdGF0ZSwgZmxvd0luZGVudCwgQ09OVEVYVF9GTE9XX0lOID09PSBub2RlQ29udGV4dClcbiAgICAgICAgKSB7XG4gICAgICAgICAgaGFzQ29udGVudCA9IHRydWU7XG5cbiAgICAgICAgICBpZiAoc3RhdGUudGFnID09PSBudWxsKSB7XG4gICAgICAgICAgICBzdGF0ZS50YWcgPSBcIj9cIjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhdGUuYW5jaG9yICE9PSBudWxsICYmIHR5cGVvZiBzdGF0ZS5hbmNob3JNYXAgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICBzdGF0ZS5hbmNob3JNYXBbc3RhdGUuYW5jaG9yXSA9IHN0YXRlLnJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoaW5kZW50U3RhdHVzID09PSAwKSB7XG4gICAgICAvLyBTcGVjaWFsIGNhc2U6IGJsb2NrIHNlcXVlbmNlcyBhcmUgYWxsb3dlZCB0byBoYXZlIHNhbWUgaW5kZW50YXRpb24gbGV2ZWwgYXMgdGhlIHBhcmVudC5cbiAgICAgIC8vIGh0dHA6Ly93d3cueWFtbC5vcmcvc3BlYy8xLjIvc3BlYy5odG1sI2lkMjc5OTc4NFxuICAgICAgaGFzQ29udGVudCA9IGFsbG93QmxvY2tDb2xsZWN0aW9ucyAmJlxuICAgICAgICByZWFkQmxvY2tTZXF1ZW5jZShzdGF0ZSwgYmxvY2tJbmRlbnQpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChzdGF0ZS50YWcgIT09IG51bGwgJiYgc3RhdGUudGFnICE9PSBcIiFcIikge1xuICAgIGlmIChzdGF0ZS50YWcgPT09IFwiP1wiKSB7XG4gICAgICBmb3IgKFxuICAgICAgICBsZXQgdHlwZUluZGV4ID0gMCwgdHlwZVF1YW50aXR5ID0gc3RhdGUuaW1wbGljaXRUeXBlcy5sZW5ndGg7XG4gICAgICAgIHR5cGVJbmRleCA8IHR5cGVRdWFudGl0eTtcbiAgICAgICAgdHlwZUluZGV4KytcbiAgICAgICkge1xuICAgICAgICB0eXBlID0gc3RhdGUuaW1wbGljaXRUeXBlc1t0eXBlSW5kZXhdO1xuXG4gICAgICAgIC8vIEltcGxpY2l0IHJlc29sdmluZyBpcyBub3QgYWxsb3dlZCBmb3Igbm9uLXNjYWxhciB0eXBlcywgYW5kICc/J1xuICAgICAgICAvLyBub24tc3BlY2lmaWMgdGFnIGlzIG9ubHkgYXNzaWduZWQgdG8gcGxhaW4gc2NhbGFycy4gU28sIGl0IGlzbid0XG4gICAgICAgIC8vIG5lZWRlZCB0byBjaGVjayBmb3IgJ2tpbmQnIGNvbmZvcm1pdHkuXG5cbiAgICAgICAgaWYgKHR5cGUucmVzb2x2ZShzdGF0ZS5yZXN1bHQpKSB7XG4gICAgICAgICAgLy8gYHN0YXRlLnJlc3VsdGAgdXBkYXRlZCBpbiByZXNvbHZlciBpZiBtYXRjaGVkXG4gICAgICAgICAgc3RhdGUucmVzdWx0ID0gdHlwZS5jb25zdHJ1Y3Qoc3RhdGUucmVzdWx0KTtcbiAgICAgICAgICBzdGF0ZS50YWcgPSB0eXBlLnRhZztcbiAgICAgICAgICBpZiAoc3RhdGUuYW5jaG9yICE9PSBudWxsICYmIHR5cGVvZiBzdGF0ZS5hbmNob3JNYXAgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIHN0YXRlLmFuY2hvck1hcFtzdGF0ZS5hbmNob3JdID0gc3RhdGUucmVzdWx0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoXG4gICAgICBoYXNPd24oc3RhdGUudHlwZU1hcFtzdGF0ZS5raW5kIHx8IFwiZmFsbGJhY2tcIl0sIHN0YXRlLnRhZylcbiAgICApIHtcbiAgICAgIHR5cGUgPSBzdGF0ZS50eXBlTWFwW3N0YXRlLmtpbmQgfHwgXCJmYWxsYmFja1wiXVtzdGF0ZS50YWddO1xuXG4gICAgICBpZiAoc3RhdGUucmVzdWx0ICE9PSBudWxsICYmIHR5cGUua2luZCAhPT0gc3RhdGUua2luZCkge1xuICAgICAgICByZXR1cm4gdGhyb3dFcnJvcihcbiAgICAgICAgICBzdGF0ZSxcbiAgICAgICAgICBgdW5hY2NlcHRhYmxlIG5vZGUga2luZCBmb3IgITwke3N0YXRlLnRhZ30+IHRhZzsgaXQgc2hvdWxkIGJlIFwiJHt0eXBlLmtpbmR9XCIsIG5vdCBcIiR7c3RhdGUua2luZH1cImAsXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGlmICghdHlwZS5yZXNvbHZlKHN0YXRlLnJlc3VsdCkpIHtcbiAgICAgICAgLy8gYHN0YXRlLnJlc3VsdGAgdXBkYXRlZCBpbiByZXNvbHZlciBpZiBtYXRjaGVkXG4gICAgICAgIHJldHVybiB0aHJvd0Vycm9yKFxuICAgICAgICAgIHN0YXRlLFxuICAgICAgICAgIGBjYW5ub3QgcmVzb2x2ZSBhIG5vZGUgd2l0aCAhPCR7c3RhdGUudGFnfT4gZXhwbGljaXQgdGFnYCxcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXRlLnJlc3VsdCA9IHR5cGUuY29uc3RydWN0KHN0YXRlLnJlc3VsdCk7XG4gICAgICAgIGlmIChzdGF0ZS5hbmNob3IgIT09IG51bGwgJiYgdHlwZW9mIHN0YXRlLmFuY2hvck1hcCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgIHN0YXRlLmFuY2hvck1hcFtzdGF0ZS5hbmNob3JdID0gc3RhdGUucmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aHJvd0Vycm9yKHN0YXRlLCBgdW5rbm93biB0YWcgITwke3N0YXRlLnRhZ30+YCk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHN0YXRlLmxpc3RlbmVyICYmIHN0YXRlLmxpc3RlbmVyICE9PSBudWxsKSB7XG4gICAgc3RhdGUubGlzdGVuZXIoXCJjbG9zZVwiLCBzdGF0ZSk7XG4gIH1cbiAgcmV0dXJuIHN0YXRlLnRhZyAhPT0gbnVsbCB8fCBzdGF0ZS5hbmNob3IgIT09IG51bGwgfHwgaGFzQ29udGVudDtcbn1cblxuZnVuY3Rpb24gcmVhZERvY3VtZW50KHN0YXRlOiBMb2FkZXJTdGF0ZSk6IHZvaWQge1xuICBjb25zdCBkb2N1bWVudFN0YXJ0ID0gc3RhdGUucG9zaXRpb247XG4gIGxldCBwb3NpdGlvbjogbnVtYmVyLFxuICAgIGRpcmVjdGl2ZU5hbWU6IHN0cmluZyxcbiAgICBkaXJlY3RpdmVBcmdzOiBzdHJpbmdbXSxcbiAgICBoYXNEaXJlY3RpdmVzID0gZmFsc2UsXG4gICAgY2g6IG51bWJlcjtcblxuICBzdGF0ZS52ZXJzaW9uID0gbnVsbDtcbiAgc3RhdGUuY2hlY2tMaW5lQnJlYWtzID0gc3RhdGUubGVnYWN5O1xuICBzdGF0ZS50YWdNYXAgPSB7fTtcbiAgc3RhdGUuYW5jaG9yTWFwID0ge307XG5cbiAgd2hpbGUgKChjaCA9IHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24pKSAhPT0gMCkge1xuICAgIHNraXBTZXBhcmF0aW9uU3BhY2Uoc3RhdGUsIHRydWUsIC0xKTtcblxuICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdChzdGF0ZS5wb3NpdGlvbik7XG5cbiAgICBpZiAoc3RhdGUubGluZUluZGVudCA+IDAgfHwgY2ggIT09IDB4MjUgLyogJSAqLykge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgaGFzRGlyZWN0aXZlcyA9IHRydWU7XG4gICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KCsrc3RhdGUucG9zaXRpb24pO1xuICAgIHBvc2l0aW9uID0gc3RhdGUucG9zaXRpb247XG5cbiAgICB3aGlsZSAoY2ggIT09IDAgJiYgIWlzV3NPckVvbChjaCkpIHtcbiAgICAgIGNoID0gc3RhdGUuaW5wdXQuY2hhckNvZGVBdCgrK3N0YXRlLnBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICBkaXJlY3RpdmVOYW1lID0gc3RhdGUuaW5wdXQuc2xpY2UocG9zaXRpb24sIHN0YXRlLnBvc2l0aW9uKTtcbiAgICBkaXJlY3RpdmVBcmdzID0gW107XG5cbiAgICBpZiAoZGlyZWN0aXZlTmFtZS5sZW5ndGggPCAxKSB7XG4gICAgICByZXR1cm4gdGhyb3dFcnJvcihcbiAgICAgICAgc3RhdGUsXG4gICAgICAgIFwiZGlyZWN0aXZlIG5hbWUgbXVzdCBub3QgYmUgbGVzcyB0aGFuIG9uZSBjaGFyYWN0ZXIgaW4gbGVuZ3RoXCIsXG4gICAgICApO1xuICAgIH1cblxuICAgIHdoaWxlIChjaCAhPT0gMCkge1xuICAgICAgd2hpbGUgKGlzV2hpdGVTcGFjZShjaCkpIHtcbiAgICAgICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KCsrc3RhdGUucG9zaXRpb24pO1xuICAgICAgfVxuXG4gICAgICBpZiAoY2ggPT09IDB4MjMgLyogIyAqLykge1xuICAgICAgICBkbyB7XG4gICAgICAgICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KCsrc3RhdGUucG9zaXRpb24pO1xuICAgICAgICB9IHdoaWxlIChjaCAhPT0gMCAmJiAhaXNFT0woY2gpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGlmIChpc0VPTChjaCkpIGJyZWFrO1xuXG4gICAgICBwb3NpdGlvbiA9IHN0YXRlLnBvc2l0aW9uO1xuXG4gICAgICB3aGlsZSAoY2ggIT09IDAgJiYgIWlzV3NPckVvbChjaCkpIHtcbiAgICAgICAgY2ggPSBzdGF0ZS5pbnB1dC5jaGFyQ29kZUF0KCsrc3RhdGUucG9zaXRpb24pO1xuICAgICAgfVxuXG4gICAgICBkaXJlY3RpdmVBcmdzLnB1c2goc3RhdGUuaW5wdXQuc2xpY2UocG9zaXRpb24sIHN0YXRlLnBvc2l0aW9uKSk7XG4gICAgfVxuXG4gICAgaWYgKGNoICE9PSAwKSByZWFkTGluZUJyZWFrKHN0YXRlKTtcblxuICAgIGlmIChoYXNPd24oZGlyZWN0aXZlSGFuZGxlcnMsIGRpcmVjdGl2ZU5hbWUpKSB7XG4gICAgICBkaXJlY3RpdmVIYW5kbGVyc1tkaXJlY3RpdmVOYW1lXShzdGF0ZSwgZGlyZWN0aXZlTmFtZSwgLi4uZGlyZWN0aXZlQXJncyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93V2FybmluZyhzdGF0ZSwgYHVua25vd24gZG9jdW1lbnQgZGlyZWN0aXZlIFwiJHtkaXJlY3RpdmVOYW1lfVwiYCk7XG4gICAgfVxuICB9XG5cbiAgc2tpcFNlcGFyYXRpb25TcGFjZShzdGF0ZSwgdHJ1ZSwgLTEpO1xuXG4gIGlmIChcbiAgICBzdGF0ZS5saW5lSW5kZW50ID09PSAwICYmXG4gICAgc3RhdGUuaW5wdXQuY2hhckNvZGVBdChzdGF0ZS5wb3NpdGlvbikgPT09IDB4MmQgLyogLSAqLyAmJlxuICAgIHN0YXRlLmlucHV0LmNoYXJDb2RlQXQoc3RhdGUucG9zaXRpb24gKyAxKSA9PT0gMHgyZCAvKiAtICovICYmXG4gICAgc3RhdGUuaW5wdXQuY2hhckNvZGVBdChzdGF0ZS5wb3NpdGlvbiArIDIpID09PSAweDJkIC8qIC0gKi9cbiAgKSB7XG4gICAgc3RhdGUucG9zaXRpb24gKz0gMztcbiAgICBza2lwU2VwYXJhdGlvblNwYWNlKHN0YXRlLCB0cnVlLCAtMSk7XG4gIH0gZWxzZSBpZiAoaGFzRGlyZWN0aXZlcykge1xuICAgIHJldHVybiB0aHJvd0Vycm9yKHN0YXRlLCBcImRpcmVjdGl2ZXMgZW5kIG1hcmsgaXMgZXhwZWN0ZWRcIik7XG4gIH1cblxuICBjb21wb3NlTm9kZShzdGF0ZSwgc3RhdGUubGluZUluZGVudCAtIDEsIENPTlRFWFRfQkxPQ0tfT1VULCBmYWxzZSwgdHJ1ZSk7XG4gIHNraXBTZXBhcmF0aW9uU3BhY2Uoc3RhdGUsIHRydWUsIC0xKTtcblxuICBpZiAoXG4gICAgc3RhdGUuY2hlY2tMaW5lQnJlYWtzICYmXG4gICAgUEFUVEVSTl9OT05fQVNDSUlfTElORV9CUkVBS1MudGVzdChcbiAgICAgIHN0YXRlLmlucHV0LnNsaWNlKGRvY3VtZW50U3RhcnQsIHN0YXRlLnBvc2l0aW9uKSxcbiAgICApXG4gICkge1xuICAgIHRocm93V2FybmluZyhzdGF0ZSwgXCJub24tQVNDSUkgbGluZSBicmVha3MgYXJlIGludGVycHJldGVkIGFzIGNvbnRlbnRcIik7XG4gIH1cblxuICBzdGF0ZS5kb2N1bWVudHMucHVzaChzdGF0ZS5yZXN1bHQpO1xuXG4gIGlmIChzdGF0ZS5wb3NpdGlvbiA9PT0gc3RhdGUubGluZVN0YXJ0ICYmIHRlc3REb2N1bWVudFNlcGFyYXRvcihzdGF0ZSkpIHtcbiAgICBpZiAoc3RhdGUuaW5wdXQuY2hhckNvZGVBdChzdGF0ZS5wb3NpdGlvbikgPT09IDB4MmUgLyogLiAqLykge1xuICAgICAgc3RhdGUucG9zaXRpb24gKz0gMztcbiAgICAgIHNraXBTZXBhcmF0aW9uU3BhY2Uoc3RhdGUsIHRydWUsIC0xKTtcbiAgICB9XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHN0YXRlLnBvc2l0aW9uIDwgc3RhdGUubGVuZ3RoIC0gMSkge1xuICAgIHJldHVybiB0aHJvd0Vycm9yKFxuICAgICAgc3RhdGUsXG4gICAgICBcImVuZCBvZiB0aGUgc3RyZWFtIG9yIGEgZG9jdW1lbnQgc2VwYXJhdG9yIGlzIGV4cGVjdGVkXCIsXG4gICAgKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm47XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9hZERvY3VtZW50cyhpbnB1dDogc3RyaW5nLCBvcHRpb25zPzogTG9hZGVyU3RhdGVPcHRpb25zKTogdW5rbm93bltdIHtcbiAgaW5wdXQgPSBTdHJpbmcoaW5wdXQpO1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICBpZiAoaW5wdXQubGVuZ3RoICE9PSAwKSB7XG4gICAgLy8gQWRkIHRhaWxpbmcgYFxcbmAgaWYgbm90IGV4aXN0c1xuICAgIGlmIChcbiAgICAgIGlucHV0LmNoYXJDb2RlQXQoaW5wdXQubGVuZ3RoIC0gMSkgIT09IDB4MGEgLyogTEYgKi8gJiZcbiAgICAgIGlucHV0LmNoYXJDb2RlQXQoaW5wdXQubGVuZ3RoIC0gMSkgIT09IDB4MGQgLyogQ1IgKi9cbiAgICApIHtcbiAgICAgIGlucHV0ICs9IFwiXFxuXCI7XG4gICAgfVxuXG4gICAgLy8gU3RyaXAgQk9NXG4gICAgaWYgKGlucHV0LmNoYXJDb2RlQXQoMCkgPT09IDB4ZmVmZikge1xuICAgICAgaW5wdXQgPSBpbnB1dC5zbGljZSgxKTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBzdGF0ZSA9IG5ldyBMb2FkZXJTdGF0ZShpbnB1dCwgb3B0aW9ucyk7XG5cbiAgLy8gVXNlIDAgYXMgc3RyaW5nIHRlcm1pbmF0b3IuIFRoYXQgc2lnbmlmaWNhbnRseSBzaW1wbGlmaWVzIGJvdW5kcyBjaGVjay5cbiAgc3RhdGUuaW5wdXQgKz0gXCJcXDBcIjtcblxuICB3aGlsZSAoc3RhdGUuaW5wdXQuY2hhckNvZGVBdChzdGF0ZS5wb3NpdGlvbikgPT09IDB4MjAgLyogU3BhY2UgKi8pIHtcbiAgICBzdGF0ZS5saW5lSW5kZW50ICs9IDE7XG4gICAgc3RhdGUucG9zaXRpb24gKz0gMTtcbiAgfVxuXG4gIHdoaWxlIChzdGF0ZS5wb3NpdGlvbiA8IHN0YXRlLmxlbmd0aCAtIDEpIHtcbiAgICByZWFkRG9jdW1lbnQoc3RhdGUpO1xuICB9XG5cbiAgcmV0dXJuIHN0YXRlLmRvY3VtZW50cztcbn1cblxuZXhwb3J0IHR5cGUgQ2JGdW5jdGlvbiA9IChkb2M6IHVua25vd24pID0+IHZvaWQ7XG5mdW5jdGlvbiBpc0NiRnVuY3Rpb24oZm46IHVua25vd24pOiBmbiBpcyBDYkZ1bmN0aW9uIHtcbiAgcmV0dXJuIHR5cGVvZiBmbiA9PT0gXCJmdW5jdGlvblwiO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZEFsbDxUIGV4dGVuZHMgQ2JGdW5jdGlvbiB8IExvYWRlclN0YXRlT3B0aW9ucz4oXG4gIGlucHV0OiBzdHJpbmcsXG4gIGl0ZXJhdG9yT3JPcHRpb24/OiBULFxuICBvcHRpb25zPzogTG9hZGVyU3RhdGVPcHRpb25zLFxuKTogVCBleHRlbmRzIENiRnVuY3Rpb24gPyB2b2lkIDogdW5rbm93bltdIHtcbiAgaWYgKCFpc0NiRnVuY3Rpb24oaXRlcmF0b3JPck9wdGlvbikpIHtcbiAgICByZXR1cm4gbG9hZERvY3VtZW50cyhpbnB1dCwgaXRlcmF0b3JPck9wdGlvbiBhcyBMb2FkZXJTdGF0ZU9wdGlvbnMpIGFzIEFueTtcbiAgfVxuXG4gIGNvbnN0IGRvY3VtZW50cyA9IGxvYWREb2N1bWVudHMoaW5wdXQsIG9wdGlvbnMpO1xuICBjb25zdCBpdGVyYXRvciA9IGl0ZXJhdG9yT3JPcHRpb247XG4gIGZvciAobGV0IGluZGV4ID0gMCwgbGVuZ3RoID0gZG9jdW1lbnRzLmxlbmd0aDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICBpdGVyYXRvcihkb2N1bWVudHNbaW5kZXhdKTtcbiAgfVxuXG4gIHJldHVybiB2b2lkIDAgYXMgQW55O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9hZChpbnB1dDogc3RyaW5nLCBvcHRpb25zPzogTG9hZGVyU3RhdGVPcHRpb25zKTogdW5rbm93biB7XG4gIGNvbnN0IGRvY3VtZW50cyA9IGxvYWREb2N1bWVudHMoaW5wdXQsIG9wdGlvbnMpO1xuXG4gIGlmIChkb2N1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChkb2N1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGRvY3VtZW50c1swXTtcbiAgfVxuICB0aHJvdyBuZXcgWUFNTEVycm9yKFxuICAgIFwiZXhwZWN0ZWQgYSBzaW5nbGUgZG9jdW1lbnQgaW4gdGhlIHN0cmVhbSwgYnV0IGZvdW5kIG1vcmVcIixcbiAgKTtcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwrQkFBK0I7QUFDL0Isb0ZBQW9GO0FBQ3BGLDBFQUEwRTtBQUMxRSwwRUFBMEU7QUFFMUUsU0FBUyxTQUFTLFFBQVEsYUFBYSxDQUFDO0FBQ3hDLFNBQVMsSUFBSSxRQUFRLFlBQVksQ0FBQztBQUVsQyxZQUFZLE1BQU0sTUFBTSxhQUFhLENBQUM7QUFDdEMsU0FBUyxXQUFXLFFBQXdDLG1CQUFtQixDQUFDO0FBS2hGLE1BQU0sRUFBRSxNQUFNLENBQUEsRUFBRSxHQUFHLE1BQU0sQUFBQztBQUUxQixNQUFNLGVBQWUsR0FBRyxDQUFDLEFBQUM7QUFDMUIsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLEFBQUM7QUFDM0IsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLEFBQUM7QUFDM0IsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLEFBQUM7QUFFNUIsTUFBTSxhQUFhLEdBQUcsQ0FBQyxBQUFDO0FBQ3hCLE1BQU0sY0FBYyxHQUFHLENBQUMsQUFBQztBQUN6QixNQUFNLGFBQWEsR0FBRyxDQUFDLEFBQUM7QUFFeEIsTUFBTSxxQkFBcUIsR0FDekIsb0NBQW9DO3FJQUNpRyxBQUFDO0FBQ3hJLE1BQU0sNkJBQTZCLHVCQUF1QixBQUFDO0FBQzNELE1BQU0sdUJBQXVCLGdCQUFnQixBQUFDO0FBQzlDLE1BQU0sa0JBQWtCLDJCQUEyQixBQUFDO0FBQ3BELE1BQU0sZUFBZSxxRkFDK0QsQUFBQztBQUVyRixTQUFTLE1BQU0sQ0FBQyxHQUFZLEVBQVU7SUFDcEMsT0FBTyxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Q0FDNUM7QUFFRCxTQUFTLEtBQUssQ0FBQyxDQUFTLEVBQVc7SUFDakMsT0FBTyxDQUFDLEtBQUssSUFBSSxJQUFJLFFBQVEsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLFFBQVEsQ0FBVCxDQUFVO0NBQ25EO0FBRUQsU0FBUyxZQUFZLENBQUMsQ0FBUyxFQUFXO0lBQ3hDLE9BQU8sQ0FBQyxLQUFLLElBQUksSUFBSSxTQUFTLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxXQUFXLENBQVosQ0FBYTtDQUN2RDtBQUVELFNBQVMsU0FBUyxDQUFDLENBQVMsRUFBVztJQUNyQyxPQUNFLENBQUMsS0FBSyxJQUFJLENBQUMsU0FBUyxLQUNwQixDQUFDLEtBQUssSUFBSSxDQUFDLFdBQVcsQ0FBWixJQUNWLENBQUMsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFULElBQ1YsQ0FBQyxLQUFLLElBQUksQ0FBQyxRQUFRLENBQVQsQ0FDVjtDQUNIO0FBRUQsU0FBUyxlQUFlLENBQUMsQ0FBUyxFQUFXO0lBQzNDLE9BQ0UsQ0FBQyxLQUFLLElBQUksQ0FBQyxPQUFPLEtBQ2xCLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLElBQ1YsQ0FBQyxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsSUFDVixDQUFDLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixJQUNWLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLENBQ1Y7Q0FDSDtBQUVELFNBQVMsV0FBVyxDQUFDLENBQVMsRUFBVTtJQUN0QyxJQUFJLElBQUksSUFBSSxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7UUFDMUMsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDO0tBQ2pCO0lBRUQsTUFBTSxFQUFFLEdBQUcsQ0FBQyxHQUFHLElBQUksQUFBQztJQUVwQixJQUFJLElBQUksSUFBSSxPQUFPLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7UUFDNUMsT0FBTyxFQUFFLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztLQUN2QjtJQUVELE9BQU8sQ0FBQyxDQUFDLENBQUM7Q0FDWDtBQUVELFNBQVMsYUFBYSxDQUFDLENBQVMsRUFBVTtJQUN4QyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7UUFDdEIsT0FBTyxDQUFDLENBQUM7S0FDVjtJQUNELElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFBVTtRQUN0QixPQUFPLENBQUMsQ0FBQztLQUNWO0lBQ0QsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixFQUFVO1FBQ3RCLE9BQU8sQ0FBQyxDQUFDO0tBQ1Y7SUFDRCxPQUFPLENBQUMsQ0FBQztDQUNWO0FBRUQsU0FBUyxlQUFlLENBQUMsQ0FBUyxFQUFVO0lBQzFDLElBQUksSUFBSSxJQUFJLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQVIsRUFBVTtRQUMxQyxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUM7S0FDakI7SUFFRCxPQUFPLENBQUMsQ0FBQyxDQUFDO0NBQ1g7QUFFRCxTQUFTLG9CQUFvQixDQUFDLENBQVMsRUFBVTtJQUMvQyxPQUFPLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ2IsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsU0FBUyxDQUFWLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsV0FBVyxDQUFaLEdBQ1YsR0FBRyxHQUNILENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsR0FBRyxHQUNILENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsTUFBTSxHQUNOLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsUUFBUSxHQUNSLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQ1YsUUFBUSxHQUNSLEVBQUUsQ0FBQztDQUNSO0FBRUQsU0FBUyxpQkFBaUIsQ0FBQyxDQUFTLEVBQVU7SUFDNUMsSUFBSSxDQUFDLElBQUksTUFBTSxFQUFFO1FBQ2YsT0FBTyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQy9CO0lBQ0QsK0JBQStCO0lBQy9CLDRFQUE0RTtJQUM1RSxPQUFPLE1BQU0sQ0FBQyxZQUFZLENBQ3hCLENBQUMsQUFBQyxDQUFDLEdBQUcsUUFBUSxJQUFLLEVBQUUsQ0FBQyxHQUFHLE1BQU0sRUFDL0IsQ0FBQyxBQUFDLENBQUMsR0FBRyxRQUFRLEdBQUksTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUNuQyxDQUFDO0NBQ0g7QUFFRCxNQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQVM7SUFBRSxNQUFNLEVBQUUsR0FBRztDQUFFLENBQUMsQUFBQyxFQUFDLDJCQUEyQjtBQUMxRixNQUFNLGVBQWUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFTO0lBQUUsTUFBTSxFQUFFLEdBQUc7Q0FBRSxDQUFDLEFBQUM7QUFDNUQsSUFBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBRTtJQUM1QixpQkFBaUIsQ0FBQyxDQUFDLENBQUMsR0FBRyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3ZELGVBQWUsQ0FBQyxDQUFDLENBQUMsR0FBRyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztDQUM5QztBQUVELFNBQVMsYUFBYSxDQUFDLEtBQWtCLEVBQUUsT0FBZSxFQUFhO0lBQ3JFLE9BQU8sSUFBSSxTQUFTLENBQ2xCLE9BQU8sRUFDUCxJQUFJLElBQUksQ0FDTixLQUFLLENBQUMsUUFBUSxFQUNkLEtBQUssQ0FBQyxLQUFLLEVBQ1gsS0FBSyxDQUFDLFFBQVEsRUFDZCxLQUFLLENBQUMsSUFBSSxFQUNWLEtBQUssQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FDakMsQ0FDRixDQUFDO0NBQ0g7QUFFRCxTQUFTLFVBQVUsQ0FBQyxLQUFrQixFQUFFLE9BQWUsRUFBUztJQUM5RCxNQUFNLGFBQWEsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7Q0FDckM7QUFFRCxTQUFTLFlBQVksQ0FBQyxLQUFrQixFQUFFLE9BQWUsRUFBUTtJQUMvRCxJQUFJLEtBQUssQ0FBQyxTQUFTLEVBQUU7UUFDbkIsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGFBQWEsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztLQUMzRDtDQUNGO0FBVUQsTUFBTSxpQkFBaUIsR0FBc0I7SUFDM0MsSUFBSSxFQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxJQUFJLEFBQVUsRUFBRTtRQUNwQyxJQUFJLEtBQUssQ0FBQyxPQUFPLEtBQUssSUFBSSxFQUFFO1lBQzFCLE9BQU8sVUFBVSxDQUFDLEtBQUssRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDO1NBQzVEO1FBRUQsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtZQUNyQixPQUFPLFVBQVUsQ0FBQyxLQUFLLEVBQUUsNkNBQTZDLENBQUMsQ0FBQztTQUN6RTtRQUVELE1BQU0sS0FBSyxHQUFHLHVCQUF1QixJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEFBQUM7UUFDbkQsSUFBSSxLQUFLLEtBQUssSUFBSSxFQUFFO1lBQ2xCLE9BQU8sVUFBVSxDQUFDLEtBQUssRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO1NBQ3ZFO1FBRUQsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQUFBQztRQUNyQyxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxBQUFDO1FBQ3JDLElBQUksS0FBSyxLQUFLLENBQUMsRUFBRTtZQUNmLE9BQU8sVUFBVSxDQUFDLEtBQUssRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDO1NBQ3ZFO1FBRUQsS0FBSyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEIsS0FBSyxDQUFDLGVBQWUsR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2xDLElBQUksS0FBSyxLQUFLLENBQUMsSUFBSSxLQUFLLEtBQUssQ0FBQyxFQUFFO1lBQzlCLE9BQU8sWUFBWSxDQUFDLEtBQUssRUFBRSwwQ0FBMEMsQ0FBQyxDQUFDO1NBQ3hFO0tBQ0Y7SUFFRCxHQUFHLEVBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxHQUFHLElBQUksQUFBVSxFQUFRO1FBQ3pDLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDckIsT0FBTyxVQUFVLENBQUMsS0FBSyxFQUFFLDZDQUE2QyxDQUFDLENBQUM7U0FDekU7UUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLEFBQUM7UUFDdkIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxBQUFDO1FBRXZCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDcEMsT0FBTyxVQUFVLENBQ2YsS0FBSyxFQUNMLDZEQUE2RCxDQUM5RCxDQUFDO1NBQ0g7UUFFRCxJQUFJLEtBQUssQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLEVBQUU7WUFDaEQsT0FBTyxVQUFVLENBQ2YsS0FBSyxFQUNMLENBQUMsMkNBQTJDLEVBQUUsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUNuRSxDQUFDO1NBQ0g7UUFFRCxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNqQyxPQUFPLFVBQVUsQ0FDZixLQUFLLEVBQ0wsOERBQThELENBQy9ELENBQUM7U0FDSDtRQUVELElBQUksT0FBTyxLQUFLLENBQUMsTUFBTSxLQUFLLFdBQVcsRUFBRTtZQUN2QyxLQUFLLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQztTQUNuQjtRQUNELEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDO0tBQy9CO0NBQ0YsQUFBQztBQUVGLFNBQVMsY0FBYyxDQUNyQixLQUFrQixFQUNsQixLQUFhLEVBQ2IsR0FBVyxFQUNYLFNBQWtCLEVBQ1o7SUFDTixJQUFJLE1BQU0sQUFBUSxBQUFDO0lBQ25CLElBQUksS0FBSyxHQUFHLEdBQUcsRUFBRTtRQUNmLE1BQU0sR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFdkMsSUFBSSxTQUFTLEVBQUU7WUFDYixJQUNFLElBQUksUUFBUSxHQUFHLENBQUMsRUFBRSxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFDeEMsUUFBUSxHQUFHLE1BQU0sRUFDakIsUUFBUSxFQUFFLENBQ1Y7Z0JBQ0EsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQUFBQztnQkFDOUMsSUFDRSxDQUFDLENBQUMsU0FBUyxLQUFLLElBQUksSUFBSyxJQUFJLElBQUksU0FBUyxJQUFJLFNBQVMsSUFBSSxRQUFRLEFBQUMsQ0FBQyxFQUNyRTtvQkFDQSxPQUFPLFVBQVUsQ0FBQyxLQUFLLEVBQUUsK0JBQStCLENBQUMsQ0FBQztpQkFDM0Q7YUFDRjtTQUNGLE1BQU0sSUFBSSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDN0MsT0FBTyxVQUFVLENBQUMsS0FBSyxFQUFFLDhDQUE4QyxDQUFDLENBQUM7U0FDMUU7UUFFRCxLQUFLLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQztLQUN4QjtDQUNGO0FBRUQsU0FBUyxhQUFhLENBQ3BCLEtBQWtCLEVBQ2xCLFdBQXdCLEVBQ3hCLE1BQW1CLEVBQ25CLGVBQXFDLEVBQy9CO0lBQ04sSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUU7UUFDNUIsT0FBTyxVQUFVLENBQ2YsS0FBSyxFQUNMLG1FQUFtRSxDQUNwRSxDQUFDO0tBQ0g7SUFFRCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxBQUFDO0lBQ2pDLElBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUU7UUFDL0MsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxBQUFDO1FBQ3BCLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxFQUFFO1lBQzdCLFdBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxBQUFDLE1BQU0sQUFBZ0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNoRCxlQUFlLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDO1NBQzdCO0tBQ0Y7Q0FDRjtBQUVELFNBQVMsZ0JBQWdCLENBQ3ZCLEtBQWtCLEVBQ2xCLE1BQTBCLEVBQzFCLGVBQXFDLEVBQ3JDLE1BQXFCLEVBQ3JCLE9BQVksRUFDWixTQUFrQixFQUNsQixTQUFrQixFQUNsQixRQUFpQixFQUNKO0lBQ2Isa0VBQWtFO0lBQ2xFLDRFQUE0RTtJQUM1RSxtRUFBbUU7SUFDbkUsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQzFCLE9BQU8sR0FBRyxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFOUMsSUFBSyxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUUsUUFBUSxHQUFHLE9BQU8sQ0FBQyxNQUFNLEVBQUUsS0FBSyxHQUFHLFFBQVEsRUFBRSxLQUFLLEVBQUUsQ0FBRTtZQUN4RSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUU7Z0JBQ2pDLE9BQU8sVUFBVSxDQUFDLEtBQUssRUFBRSw2Q0FBNkMsQ0FBQyxDQUFDO2FBQ3pFO1lBRUQsSUFDRSxPQUFPLE9BQU8sS0FBSyxRQUFRLElBQzNCLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxpQkFBaUIsRUFDNUM7Z0JBQ0EsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLGlCQUFpQixDQUFDO2FBQ3BDO1NBQ0Y7S0FDRjtJQUVELHVEQUF1RDtJQUN2RCxzREFBc0Q7SUFDdEQsb0VBQW9FO0lBQ3BFLElBQUksT0FBTyxPQUFPLEtBQUssUUFBUSxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxpQkFBaUIsRUFBRTtRQUN4RSxPQUFPLEdBQUcsaUJBQWlCLENBQUM7S0FDN0I7SUFFRCxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBRTFCLElBQUksTUFBTSxLQUFLLElBQUksRUFBRTtRQUNuQixNQUFNLEdBQUcsRUFBRSxDQUFDO0tBQ2I7SUFFRCxJQUFJLE1BQU0sS0FBSyx5QkFBeUIsRUFBRTtRQUN4QyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDNUIsSUFDRSxJQUFJLE1BQUssR0FBRyxDQUFDLEVBQUUsU0FBUSxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQzFDLE1BQUssR0FBRyxTQUFRLEVBQ2hCLE1BQUssRUFBRSxDQUNQO2dCQUNBLGFBQWEsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLFNBQVMsQ0FBQyxNQUFLLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQzthQUNqRTtTQUNGLE1BQU07WUFDTCxhQUFhLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQWlCLGVBQWUsQ0FBQyxDQUFDO1NBQ3pFO0tBQ0YsTUFBTTtRQUNMLElBQ0UsQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUNYLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxPQUFPLENBQUMsSUFDakMsTUFBTSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsRUFDdkI7WUFDQSxLQUFLLENBQUMsSUFBSSxHQUFHLFNBQVMsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDO1lBQ3JDLEtBQUssQ0FBQyxRQUFRLEdBQUcsUUFBUSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUM7WUFDNUMsT0FBTyxVQUFVLENBQUMsS0FBSyxFQUFFLHdCQUF3QixDQUFDLENBQUM7U0FDcEQ7UUFDRCxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsU0FBUyxDQUFDO1FBQzVCLE9BQU8sZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0tBQ2pDO0lBRUQsT0FBTyxNQUFNLENBQUM7Q0FDZjtBQUVELFNBQVMsYUFBYSxDQUFDLEtBQWtCLEVBQVE7SUFDL0MsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxBQUFDO0lBRWxELElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxRQUFRLENBQVQsRUFBVztRQUN4QixLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7S0FDbEIsTUFBTSxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFULEVBQVc7UUFDL0IsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2pCLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxLQUFLLElBQUksQ0FBQyxRQUFRLENBQVQsRUFBVztZQUM1RCxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7U0FDbEI7S0FDRixNQUFNO1FBQ0wsT0FBTyxVQUFVLENBQUMsS0FBSyxFQUFFLDBCQUEwQixDQUFDLENBQUM7S0FDdEQ7SUFFRCxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQztJQUNoQixLQUFLLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7Q0FDbEM7QUFFRCxTQUFTLG1CQUFtQixDQUMxQixLQUFrQixFQUNsQixhQUFzQixFQUN0QixXQUFtQixFQUNYO0lBQ1IsSUFBSSxVQUFVLEdBQUcsQ0FBQyxFQUNoQixFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxBQUFDO0lBRTlDLE1BQU8sRUFBRSxLQUFLLENBQUMsQ0FBRTtRQUNmLE1BQU8sWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFFO1lBQ3ZCLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUMvQztRQUVELElBQUksYUFBYSxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7WUFDeEMsR0FBRztnQkFDRCxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7YUFDL0MsT0FBUSxFQUFFLEtBQUssSUFBSSxJQUFJLFFBQVEsQ0FBQyxFQUFFLEtBQUssSUFBSSxJQUFJLFFBQVEsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFFO1NBQ3BFO1FBRUQsSUFBSSxLQUFLLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDYixhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFckIsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUM1QyxVQUFVLEVBQUUsQ0FBQztZQUNiLEtBQUssQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDO1lBRXJCLE1BQU8sRUFBRSxLQUFLLElBQUksQ0FBQyxXQUFXLENBQVosQ0FBYztnQkFDOUIsS0FBSyxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNuQixFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7YUFDL0M7U0FDRixNQUFNO1lBQ0wsTUFBTTtTQUNQO0tBQ0Y7SUFFRCxJQUNFLFdBQVcsS0FBSyxDQUFDLENBQUMsSUFDbEIsVUFBVSxLQUFLLENBQUMsSUFDaEIsS0FBSyxDQUFDLFVBQVUsR0FBRyxXQUFXLEVBQzlCO1FBQ0EsWUFBWSxDQUFDLEtBQUssRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO0tBQzlDO0lBRUQsT0FBTyxVQUFVLENBQUM7Q0FDbkI7QUFFRCxTQUFTLHFCQUFxQixDQUFDLEtBQWtCLEVBQVc7SUFDMUQsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDLFFBQVEsQUFBQztJQUMvQixJQUFJLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQUFBQztJQUUzQyx5REFBeUQ7SUFDekQsdUVBQXVFO0lBQ3ZFLElBQ0UsQ0FBQyxFQUFFLEtBQUssSUFBSSxJQUFJLE9BQU8sQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLElBQ3BDLEVBQUUsS0FBSyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLElBQzVDLEVBQUUsS0FBSyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLEVBQzVDO1FBQ0EsU0FBUyxJQUFJLENBQUMsQ0FBQztRQUVmLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUV2QyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksU0FBUyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQzdCLE9BQU8sSUFBSSxDQUFDO1NBQ2I7S0FDRjtJQUVELE9BQU8sS0FBSyxDQUFDO0NBQ2Q7QUFFRCxTQUFTLGdCQUFnQixDQUFDLEtBQWtCLEVBQUUsS0FBYSxFQUFRO0lBQ2pFLElBQUksS0FBSyxLQUFLLENBQUMsRUFBRTtRQUNmLEtBQUssQ0FBQyxNQUFNLElBQUksR0FBRyxDQUFDO0tBQ3JCLE1BQU0sSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFO1FBQ3BCLEtBQUssQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO0tBQ2hEO0NBQ0Y7QUFFRCxTQUFTLGVBQWUsQ0FDdEIsS0FBa0IsRUFDbEIsVUFBa0IsRUFDbEIsb0JBQTZCLEVBQ3BCO0lBQ1QsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQUFBQztJQUN4QixNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsTUFBTSxBQUFDO0lBQzVCLElBQUksRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQUFBQztJQUVoRCxJQUNFLFNBQVMsQ0FBQyxFQUFFLENBQUMsSUFDYixlQUFlLENBQUMsRUFBRSxDQUFDLElBQ25CLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLElBQ1gsRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsSUFDWCxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixJQUNYLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLElBQ1gsRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsSUFDWCxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixJQUNYLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLElBQ1gsRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsSUFDWCxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixJQUNYLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLElBQ1gsRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFDWDtRQUNBLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxJQUFJLFNBQVMsQUFBUSxBQUFDO0lBQ3RCLElBQUksRUFBRSxLQUFLLElBQUksSUFBSSxPQUFPLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFBVTtRQUM5QyxTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUV2RCxJQUNFLFNBQVMsQ0FBQyxTQUFTLENBQUMsSUFDbkIsb0JBQW9CLElBQUksZUFBZSxDQUFDLFNBQVMsQ0FBQyxBQUFDLEVBQ3BEO1lBQ0EsT0FBTyxLQUFLLENBQUM7U0FDZDtLQUNGO0lBRUQsS0FBSyxDQUFDLElBQUksR0FBRyxRQUFRLENBQUM7SUFDdEIsS0FBSyxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7SUFDbEIsSUFBSSxVQUFVLEFBQVEsRUFDcEIsWUFBWSxHQUFJLFVBQVUsR0FBRyxLQUFLLENBQUMsUUFBUSxBQUFDLEFBQUM7SUFDL0MsSUFBSSxpQkFBaUIsR0FBRyxLQUFLLEFBQUM7SUFDOUIsSUFBSSxJQUFJLEdBQUcsQ0FBQyxBQUFDO0lBQ2IsTUFBTyxFQUFFLEtBQUssQ0FBQyxDQUFFO1FBQ2YsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixFQUFVO1lBQ3ZCLFNBQVMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRXZELElBQ0UsU0FBUyxDQUFDLFNBQVMsQ0FBQyxJQUNuQixvQkFBb0IsSUFBSSxlQUFlLENBQUMsU0FBUyxDQUFDLEFBQUMsRUFDcEQ7Z0JBQ0EsTUFBTTthQUNQO1NBQ0YsTUFBTSxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7WUFDOUIsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsQUFBQztZQUU3RCxJQUFJLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRTtnQkFDeEIsTUFBTTthQUNQO1NBQ0YsTUFBTSxJQUNMLEFBQUMsS0FBSyxDQUFDLFFBQVEsS0FBSyxLQUFLLENBQUMsU0FBUyxJQUFJLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxJQUNsRSxvQkFBb0IsSUFBSSxlQUFlLENBQUMsRUFBRSxDQUFDLEFBQUMsRUFDN0M7WUFDQSxNQUFNO1NBQ1AsTUFBTSxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUMsRUFBRTtZQUNwQixJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztZQUNsQixNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsU0FBUyxBQUFDO1lBQ2xDLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxVQUFVLEFBQUM7WUFDcEMsbUJBQW1CLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXRDLElBQUksS0FBSyxDQUFDLFVBQVUsSUFBSSxVQUFVLEVBQUU7Z0JBQ2xDLGlCQUFpQixHQUFHLElBQUksQ0FBQztnQkFDekIsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDNUMsU0FBUzthQUNWLE1BQU07Z0JBQ0wsS0FBSyxDQUFDLFFBQVEsR0FBRyxVQUFVLENBQUM7Z0JBQzVCLEtBQUssQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO2dCQUNsQixLQUFLLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztnQkFDNUIsS0FBSyxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7Z0JBQzlCLE1BQU07YUFDUDtTQUNGO1FBRUQsSUFBSSxpQkFBaUIsRUFBRTtZQUNyQixjQUFjLENBQUMsS0FBSyxFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdkQsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUM7WUFDM0MsWUFBWSxHQUFHLFVBQVUsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO1lBQzNDLGlCQUFpQixHQUFHLEtBQUssQ0FBQztTQUMzQjtRQUVELElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDckIsVUFBVSxHQUFHLEtBQUssQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO1NBQ2pDO1FBRUQsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0tBQy9DO0lBRUQsY0FBYyxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBRXZELElBQUksS0FBSyxDQUFDLE1BQU0sRUFBRTtRQUNoQixPQUFPLElBQUksQ0FBQztLQUNiO0lBRUQsS0FBSyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDbEIsS0FBSyxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7SUFDdEIsT0FBTyxLQUFLLENBQUM7Q0FDZDtBQUVELFNBQVMsc0JBQXNCLENBQzdCLEtBQWtCLEVBQ2xCLFVBQWtCLEVBQ1Q7SUFDVCxJQUFJLEVBQUUsRUFBRSxZQUFZLEVBQUUsVUFBVSxBQUFDO0lBRWpDLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7SUFFNUMsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixFQUFVO1FBQ3ZCLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxLQUFLLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQztJQUN0QixLQUFLLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUNsQixLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDakIsWUFBWSxHQUFHLFVBQVUsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO0lBRTNDLE1BQU8sQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFFO1FBQzFELElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFBVTtZQUN2QixjQUFjLENBQUMsS0FBSyxFQUFFLFlBQVksRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzFELEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUU5QyxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7Z0JBQ3ZCLFlBQVksR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO2dCQUM5QixLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ2pCLFVBQVUsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO2FBQzdCLE1BQU07Z0JBQ0wsT0FBTyxJQUFJLENBQUM7YUFDYjtTQUNGLE1BQU0sSUFBSSxLQUFLLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDcEIsY0FBYyxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3RELGdCQUFnQixDQUFDLEtBQUssRUFBRSxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDdkUsWUFBWSxHQUFHLFVBQVUsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO1NBQzVDLE1BQU0sSUFDTCxLQUFLLENBQUMsUUFBUSxLQUFLLEtBQUssQ0FBQyxTQUFTLElBQ2xDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxFQUM1QjtZQUNBLE9BQU8sVUFBVSxDQUNmLEtBQUssRUFDTCw4REFBOEQsQ0FDL0QsQ0FBQztTQUNILE1BQU07WUFDTCxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDakIsVUFBVSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7U0FDN0I7S0FDRjtJQUVELE9BQU8sVUFBVSxDQUNmLEtBQUssRUFDTCw0REFBNEQsQ0FDN0QsQ0FBQztDQUNIO0FBRUQsU0FBUyxzQkFBc0IsQ0FDN0IsS0FBa0IsRUFDbEIsVUFBa0IsRUFDVDtJQUNULElBQUksRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQUFBQztJQUVoRCxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7UUFDdkIsT0FBTyxLQUFLLENBQUM7S0FDZDtJQUVELEtBQUssQ0FBQyxJQUFJLEdBQUcsUUFBUSxDQUFDO0lBQ3RCLEtBQUssQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDO0lBQ2xCLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNqQixJQUFJLFVBQVUsQUFBUSxFQUNwQixZQUFZLEdBQUksVUFBVSxHQUFHLEtBQUssQ0FBQyxRQUFRLEFBQUMsQUFBQztJQUMvQyxJQUFJLEdBQUcsQUFBUSxBQUFDO0lBQ2hCLE1BQU8sQ0FBQyxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFFO1FBQzFELElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFBVTtZQUN2QixjQUFjLENBQUMsS0FBSyxFQUFFLFlBQVksRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQzFELEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNqQixPQUFPLElBQUksQ0FBQztTQUNiO1FBQ0QsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixFQUFVO1lBQ3ZCLGNBQWMsQ0FBQyxLQUFLLEVBQUUsWUFBWSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDMUQsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRTlDLElBQUksS0FBSyxDQUFDLEVBQUUsQ0FBQyxFQUFFO2dCQUNiLG1CQUFtQixDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFFOUMsNERBQTREO2FBQzdELE1BQU0sSUFBSSxFQUFFLEdBQUcsR0FBRyxJQUFJLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxFQUFFO2dCQUM1QyxLQUFLLENBQUMsTUFBTSxJQUFJLGVBQWUsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDcEMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO2FBQ2xCLE1BQU0sSUFBSSxDQUFDLEdBQUcsR0FBRyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUU7Z0JBQ3hDLElBQUksU0FBUyxHQUFHLEdBQUcsQUFBQztnQkFDcEIsSUFBSSxTQUFTLEdBQUcsQ0FBQyxBQUFDO2dCQUVsQixNQUFPLFNBQVMsR0FBRyxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUU7b0JBQ2pDLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFFOUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUU7d0JBQ2hDLFNBQVMsR0FBRyxDQUFDLFNBQVMsSUFBSSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7cUJBQ3BDLE1BQU07d0JBQ0wsT0FBTyxVQUFVLENBQUMsS0FBSyxFQUFFLGdDQUFnQyxDQUFDLENBQUM7cUJBQzVEO2lCQUNGO2dCQUVELEtBQUssQ0FBQyxNQUFNLElBQUksaUJBQWlCLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBRTdDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQzthQUNsQixNQUFNO2dCQUNMLE9BQU8sVUFBVSxDQUFDLEtBQUssRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO2FBQ3JEO1lBRUQsWUFBWSxHQUFHLFVBQVUsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO1NBQzVDLE1BQU0sSUFBSSxLQUFLLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDcEIsY0FBYyxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO1lBQ3RELGdCQUFnQixDQUFDLEtBQUssRUFBRSxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDdkUsWUFBWSxHQUFHLFVBQVUsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO1NBQzVDLE1BQU0sSUFDTCxLQUFLLENBQUMsUUFBUSxLQUFLLEtBQUssQ0FBQyxTQUFTLElBQ2xDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxFQUM1QjtZQUNBLE9BQU8sVUFBVSxDQUNmLEtBQUssRUFDTCw4REFBOEQsQ0FDL0QsQ0FBQztTQUNILE1BQU07WUFDTCxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDakIsVUFBVSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7U0FDN0I7S0FDRjtJQUVELE9BQU8sVUFBVSxDQUNmLEtBQUssRUFDTCw0REFBNEQsQ0FDN0QsQ0FBQztDQUNIO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxLQUFrQixFQUFFLFVBQWtCLEVBQVc7SUFDM0UsSUFBSSxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxBQUFDO0lBQ2hELElBQUksVUFBVSxBQUFRLEFBQUM7SUFDdkIsSUFBSSxTQUFTLEdBQUcsSUFBSSxBQUFDO0lBQ3JCLElBQUksTUFBTSxHQUFlLEVBQUUsQUFBQztJQUM1QixJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7UUFDdkIsVUFBVSxHQUFHLElBQUksQ0FBQyxDQUFDLE9BQU87UUFDMUIsU0FBUyxHQUFHLEtBQUssQ0FBQztRQUNsQixNQUFNLEdBQUcsRUFBRSxDQUFDO0tBQ2IsTUFBTSxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7UUFDOUIsVUFBVSxHQUFHLElBQUksQ0FBQyxDQUFDLE9BQU87S0FDM0IsTUFBTTtRQUNMLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxJQUNFLEtBQUssQ0FBQyxNQUFNLEtBQUssSUFBSSxJQUNyQixPQUFPLEtBQUssQ0FBQyxNQUFNLElBQUksV0FBVyxJQUNsQyxPQUFPLEtBQUssQ0FBQyxTQUFTLElBQUksV0FBVyxFQUNyQztRQUNBLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQztLQUN4QztJQUVELEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUU5QyxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxFQUNuQixNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sQUFBQztJQUN4QixJQUFJLFFBQVEsR0FBRyxJQUFJLEFBQUM7SUFDcEIsSUFBSSxTQUFTLEVBQ1gsT0FBTyxFQUNQLE1BQU0sR0FBbUIsT0FBTyxHQUFHLFNBQVMsR0FBRyxJQUFJLEFBQUMsRUFDcEQsY0FBYyxBQUFTLEVBQ3ZCLE1BQU0sR0FBSSxjQUFjLEdBQUcsS0FBSyxBQUFDLEFBQUM7SUFDcEMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxFQUNmLElBQUksR0FBRyxDQUFDLEFBQUM7SUFDWCxNQUFNLGVBQWUsR0FBeUIsRUFBRSxBQUFDO0lBQ2pELE1BQU8sRUFBRSxLQUFLLENBQUMsQ0FBRTtRQUNmLG1CQUFtQixDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFN0MsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUU1QyxJQUFJLEVBQUUsS0FBSyxVQUFVLEVBQUU7WUFDckIsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2pCLEtBQUssQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1lBQ2hCLEtBQUssQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1lBQ3RCLEtBQUssQ0FBQyxJQUFJLEdBQUcsU0FBUyxHQUFHLFNBQVMsR0FBRyxVQUFVLENBQUM7WUFDaEQsS0FBSyxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7WUFDdEIsT0FBTyxJQUFJLENBQUM7U0FDYjtRQUNELElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDYixPQUFPLFVBQVUsQ0FBQyxLQUFLLEVBQUUsOENBQThDLENBQUMsQ0FBQztTQUMxRTtRQUVELE1BQU0sR0FBRyxPQUFPLEdBQUcsU0FBUyxHQUFHLElBQUksQ0FBQztRQUNwQyxNQUFNLEdBQUcsY0FBYyxHQUFHLEtBQUssQ0FBQztRQUVoQyxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7WUFDdkIsU0FBUyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFFdkQsSUFBSSxTQUFTLENBQUMsU0FBUyxDQUFDLEVBQUU7Z0JBQ3hCLE1BQU0sR0FBRyxjQUFjLEdBQUcsSUFBSSxDQUFDO2dCQUMvQixLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ2pCLG1CQUFtQixDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7YUFDOUM7U0FDRjtRQUVELElBQUksR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ2xCLFdBQVcsQ0FBQyxLQUFLLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDN0QsTUFBTSxHQUFHLEtBQUssQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDO1FBQzNCLE9BQU8sR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO1FBQ3ZCLG1CQUFtQixDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFN0MsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUU1QyxJQUFJLENBQUMsY0FBYyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFBVTtZQUNsRSxNQUFNLEdBQUcsSUFBSSxDQUFDO1lBQ2QsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzlDLG1CQUFtQixDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7WUFDN0MsV0FBVyxDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztZQUM3RCxTQUFTLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztTQUMxQjtRQUVELElBQUksU0FBUyxFQUFFO1lBQ2IsZ0JBQWdCLENBQ2QsS0FBSyxFQUNMLE1BQU0sRUFDTixlQUFlLEVBQ2YsTUFBTSxFQUNOLE9BQU8sRUFDUCxTQUFTLENBQ1YsQ0FBQztTQUNILE1BQU0sSUFBSSxNQUFNLEVBQUU7WUFDakIsQUFBQyxNQUFNLENBQW1CLElBQUksQ0FDNUIsZ0JBQWdCLENBQ2QsS0FBSyxFQUNMLElBQUksRUFDSixlQUFlLEVBQ2YsTUFBTSxFQUNOLE9BQU8sRUFDUCxTQUFTLENBQ1YsQ0FDRixDQUFDO1NBQ0gsTUFBTTtZQUNMLEFBQUMsTUFBTSxDQUFrQixJQUFJLENBQUMsT0FBTyxDQUFlLENBQUM7U0FDdEQ7UUFFRCxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRTdDLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFNUMsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixFQUFVO1lBQ3ZCLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFDaEIsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1NBQy9DLE1BQU07WUFDTCxRQUFRLEdBQUcsS0FBSyxDQUFDO1NBQ2xCO0tBQ0Y7SUFFRCxPQUFPLFVBQVUsQ0FDZixLQUFLLEVBQ0wsdURBQXVELENBQ3hELENBQUM7Q0FDSDtBQUVELFNBQVMsZUFBZSxDQUFDLEtBQWtCLEVBQUUsVUFBa0IsRUFBVztJQUN4RSxJQUFJLFFBQVEsR0FBRyxhQUFhLEVBQzFCLGNBQWMsR0FBRyxLQUFLLEVBQ3RCLGNBQWMsR0FBRyxLQUFLLEVBQ3RCLFVBQVUsR0FBRyxVQUFVLEVBQ3ZCLFVBQVUsR0FBRyxDQUFDLEVBQ2QsY0FBYyxHQUFHLEtBQUssQUFBQztJQUV6QixJQUFJLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEFBQUM7SUFFaEQsSUFBSSxPQUFPLEdBQUcsS0FBSyxBQUFDO0lBQ3BCLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFBVTtRQUN2QixPQUFPLEdBQUcsS0FBSyxDQUFDO0tBQ2pCLE1BQU0sSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixFQUFVO1FBQzlCLE9BQU8sR0FBRyxJQUFJLENBQUM7S0FDaEIsTUFBTTtRQUNMLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxLQUFLLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQztJQUN0QixLQUFLLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUVsQixJQUFJLEdBQUcsR0FBRyxDQUFDLEFBQUM7SUFDWixNQUFPLEVBQUUsS0FBSyxDQUFDLENBQUU7UUFDZixFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFOUMsSUFBSSxFQUFFLEtBQUssSUFBSSxJQUFJLE9BQU8sQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixFQUFVO1lBQzlDLElBQUksYUFBYSxLQUFLLFFBQVEsRUFBRTtnQkFDOUIsUUFBUSxHQUFHLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEdBQVcsYUFBYSxHQUFHLGNBQWMsQ0FBQzthQUNqRSxNQUFNO2dCQUNMLE9BQU8sVUFBVSxDQUFDLEtBQUssRUFBRSxzQ0FBc0MsQ0FBQyxDQUFDO2FBQ2xFO1NBQ0YsTUFBTSxJQUFJLENBQUMsR0FBRyxHQUFHLGVBQWUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUMzQyxJQUFJLEdBQUcsS0FBSyxDQUFDLEVBQUU7Z0JBQ2IsT0FBTyxVQUFVLENBQ2YsS0FBSyxFQUNMLDhFQUE4RSxDQUMvRSxDQUFDO2FBQ0gsTUFBTSxJQUFJLENBQUMsY0FBYyxFQUFFO2dCQUMxQixVQUFVLEdBQUcsVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7Z0JBQ2xDLGNBQWMsR0FBRyxJQUFJLENBQUM7YUFDdkIsTUFBTTtnQkFDTCxPQUFPLFVBQVUsQ0FBQyxLQUFLLEVBQUUsMkNBQTJDLENBQUMsQ0FBQzthQUN2RTtTQUNGLE1BQU07WUFDTCxNQUFNO1NBQ1A7S0FDRjtJQUVELElBQUksWUFBWSxDQUFDLEVBQUUsQ0FBQyxFQUFFO1FBQ3BCLEdBQUc7WUFDRCxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7U0FDL0MsT0FBUSxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUU7UUFFM0IsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixFQUFVO1lBQ3ZCLEdBQUc7Z0JBQ0QsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2FBQy9DLE9BQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBRTtTQUNsQztLQUNGO0lBRUQsTUFBTyxFQUFFLEtBQUssQ0FBQyxDQUFFO1FBQ2YsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3JCLEtBQUssQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDO1FBRXJCLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFNUMsTUFDRSxDQUFDLENBQUMsY0FBYyxJQUFJLEtBQUssQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDLElBQ2xELEVBQUUsS0FBSyxJQUFJLENBQUMsV0FBVyxDQUFaLENBQ1g7WUFDQSxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDbkIsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1NBQy9DO1FBRUQsSUFBSSxDQUFDLGNBQWMsSUFBSSxLQUFLLENBQUMsVUFBVSxHQUFHLFVBQVUsRUFBRTtZQUNwRCxVQUFVLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQztTQUMvQjtRQUVELElBQUksS0FBSyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQ2IsVUFBVSxFQUFFLENBQUM7WUFDYixTQUFTO1NBQ1Y7UUFFRCxxQkFBcUI7UUFDckIsSUFBSSxLQUFLLENBQUMsVUFBVSxHQUFHLFVBQVUsRUFBRTtZQUNqQyx3QkFBd0I7WUFDeEIsSUFBSSxRQUFRLEtBQUssYUFBYSxFQUFFO2dCQUM5QixLQUFLLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQzNCLElBQUksRUFDSixjQUFjLEdBQUcsQ0FBQyxHQUFHLFVBQVUsR0FBRyxVQUFVLENBQzdDLENBQUM7YUFDSCxNQUFNLElBQUksUUFBUSxLQUFLLGFBQWEsRUFBRTtnQkFDckMsSUFBSSxjQUFjLEVBQUU7b0JBQ2xCLHdDQUF3QztvQkFDeEMsS0FBSyxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUM7aUJBQ3RCO2FBQ0Y7WUFHRCxNQUFNO1NBQ1A7UUFFRCx1REFBdUQ7UUFDdkQsSUFBSSxPQUFPLEVBQUU7WUFDWCxtRkFBbUY7WUFDbkYsSUFBSSxZQUFZLENBQUMsRUFBRSxDQUFDLEVBQUU7Z0JBQ3BCLGNBQWMsR0FBRyxJQUFJLENBQUM7Z0JBQ3RCLHNEQUFzRDtnQkFDdEQsS0FBSyxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUMzQixJQUFJLEVBQ0osY0FBYyxHQUFHLENBQUMsR0FBRyxVQUFVLEdBQUcsVUFBVSxDQUM3QyxDQUFDO1lBRUYsOEJBQThCO2FBQy9CLE1BQU0sSUFBSSxjQUFjLEVBQUU7Z0JBQ3pCLGNBQWMsR0FBRyxLQUFLLENBQUM7Z0JBQ3ZCLEtBQUssQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRXBELG1EQUFtRDthQUNwRCxNQUFNLElBQUksVUFBVSxLQUFLLENBQUMsRUFBRTtnQkFDM0IsSUFBSSxjQUFjLEVBQUU7b0JBQ2xCLHlEQUF5RDtvQkFDekQsS0FBSyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUM7aUJBQ3JCO1lBRUQscURBQXFEO2FBQ3RELE1BQU07Z0JBQ0wsS0FBSyxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxVQUFVLENBQUMsQ0FBQzthQUNqRDtRQUVELDZFQUE2RTtTQUM5RSxNQUFNO1lBQ0wscURBQXFEO1lBQ3JELEtBQUssQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FDM0IsSUFBSSxFQUNKLGNBQWMsR0FBRyxDQUFDLEdBQUcsVUFBVSxHQUFHLFVBQVUsQ0FDN0MsQ0FBQztTQUNIO1FBRUQsY0FBYyxHQUFHLElBQUksQ0FBQztRQUN0QixjQUFjLEdBQUcsSUFBSSxDQUFDO1FBQ3RCLFVBQVUsR0FBRyxDQUFDLENBQUM7UUFDZixNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsUUFBUSxBQUFDO1FBRXBDLE1BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBRTtZQUM3QixFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7U0FDL0M7UUFFRCxjQUFjLENBQUMsS0FBSyxFQUFFLFlBQVksRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO0tBQzVEO0lBRUQsT0FBTyxJQUFJLENBQUM7Q0FDYjtBQUVELFNBQVMsaUJBQWlCLENBQUMsS0FBa0IsRUFBRSxVQUFrQixFQUFXO0lBQzFFLElBQUksSUFBSSxBQUFRLEVBQ2QsU0FBUyxBQUFRLEVBQ2pCLFFBQVEsR0FBRyxLQUFLLEVBQ2hCLEVBQUUsQUFBUSxBQUFDO0lBQ2IsTUFBTSxHQUFHLEdBQUcsS0FBSyxDQUFDLEdBQUcsRUFDbkIsTUFBTSxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQ3JCLE1BQU0sR0FBYyxFQUFFLEFBQUM7SUFFekIsSUFDRSxLQUFLLENBQUMsTUFBTSxLQUFLLElBQUksSUFDckIsT0FBTyxLQUFLLENBQUMsTUFBTSxLQUFLLFdBQVcsSUFDbkMsT0FBTyxLQUFLLENBQUMsU0FBUyxLQUFLLFdBQVcsRUFDdEM7UUFDQSxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxNQUFNLENBQUM7S0FDeEM7SUFFRCxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRTVDLE1BQU8sRUFBRSxLQUFLLENBQUMsQ0FBRTtRQUNmLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFBVTtZQUN2QixNQUFNO1NBQ1A7UUFFRCxTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUV2RCxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFO1lBQ3pCLE1BQU07U0FDUDtRQUVELFFBQVEsR0FBRyxJQUFJLENBQUM7UUFDaEIsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRWpCLElBQUksbUJBQW1CLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3hDLElBQUksS0FBSyxDQUFDLFVBQVUsSUFBSSxVQUFVLEVBQUU7Z0JBQ2xDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ2xCLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7Z0JBQzVDLFNBQVM7YUFDVjtTQUNGO1FBRUQsSUFBSSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDbEIsV0FBVyxDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlELE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzFCLG1CQUFtQixDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVyQyxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTVDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEVBQUU7WUFDdEUsT0FBTyxVQUFVLENBQUMsS0FBSyxFQUFFLHFDQUFxQyxDQUFDLENBQUM7U0FDakUsTUFBTSxJQUFJLEtBQUssQ0FBQyxVQUFVLEdBQUcsVUFBVSxFQUFFO1lBQ3hDLE1BQU07U0FDUDtLQUNGO0lBRUQsSUFBSSxRQUFRLEVBQUU7UUFDWixLQUFLLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNoQixLQUFLLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUN0QixLQUFLLENBQUMsSUFBSSxHQUFHLFVBQVUsQ0FBQztRQUN4QixLQUFLLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUN0QixPQUFPLElBQUksQ0FBQztLQUNiO0lBQ0QsT0FBTyxLQUFLLENBQUM7Q0FDZDtBQUVELFNBQVMsZ0JBQWdCLENBQ3ZCLEtBQWtCLEVBQ2xCLFVBQWtCLEVBQ2xCLFVBQWtCLEVBQ1Q7SUFDVCxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsR0FBRyxFQUNuQixNQUFNLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFDckIsTUFBTSxHQUFHLEVBQUUsRUFDWCxlQUFlLEdBQUcsRUFBRSxBQUFDO0lBQ3ZCLElBQUksU0FBUyxBQUFRLEVBQ25CLFlBQVksR0FBRyxLQUFLLEVBQ3BCLElBQUksQUFBUSxFQUNaLEdBQUcsQUFBUSxFQUNYLE1BQU0sR0FBRyxJQUFJLEVBQ2IsT0FBTyxHQUFHLElBQUksRUFDZCxTQUFTLEdBQUcsSUFBSSxFQUNoQixhQUFhLEdBQUcsS0FBSyxFQUNyQixRQUFRLEdBQUcsS0FBSyxFQUNoQixFQUFFLEFBQVEsQUFBQztJQUViLElBQ0UsS0FBSyxDQUFDLE1BQU0sS0FBSyxJQUFJLElBQ3JCLE9BQU8sS0FBSyxDQUFDLE1BQU0sS0FBSyxXQUFXLElBQ25DLE9BQU8sS0FBSyxDQUFDLFNBQVMsS0FBSyxXQUFXLEVBQ3RDO1FBQ0EsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDO0tBQ3hDO0lBRUQsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUU1QyxNQUFPLEVBQUUsS0FBSyxDQUFDLENBQUU7UUFDZixTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN2RCxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLHlCQUF5QjtRQUM1QyxHQUFHLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQztRQUVyQixFQUFFO1FBQ0YseURBQXlEO1FBQ3pELCtFQUErRTtRQUMvRSxFQUFFO1FBQ0YsSUFBSSxDQUFDLEVBQUUsS0FBSyxJQUFJLElBQUksT0FBTyxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsSUFBSSxPQUFPLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFO1lBQ3hFLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFBVTtnQkFDdkIsSUFBSSxhQUFhLEVBQUU7b0JBQ2pCLGdCQUFnQixDQUNkLEtBQUssRUFDTCxNQUFNLEVBQ04sZUFBZSxFQUNmLE1BQU0sRUFDTixPQUFPLEVBQ1AsSUFBSSxDQUNMLENBQUM7b0JBQ0YsTUFBTSxHQUFHLE9BQU8sR0FBRyxTQUFTLEdBQUcsSUFBSSxDQUFDO2lCQUNyQztnQkFFRCxRQUFRLEdBQUcsSUFBSSxDQUFDO2dCQUNoQixhQUFhLEdBQUcsSUFBSSxDQUFDO2dCQUNyQixZQUFZLEdBQUcsSUFBSSxDQUFDO2FBQ3JCLE1BQU0sSUFBSSxhQUFhLEVBQUU7Z0JBQ3hCLHlEQUF5RDtnQkFDekQsYUFBYSxHQUFHLEtBQUssQ0FBQztnQkFDdEIsWUFBWSxHQUFHLElBQUksQ0FBQzthQUNyQixNQUFNO2dCQUNMLE9BQU8sVUFBVSxDQUNmLEtBQUssRUFDTCxtR0FBbUcsQ0FDcEcsQ0FBQzthQUNIO1lBRUQsS0FBSyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUM7WUFDcEIsRUFBRSxHQUFHLFNBQVMsQ0FBQztRQUVmLEVBQUU7UUFDRixxRkFBcUY7UUFDckYsRUFBRTtTQUNILE1BQU0sSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLEVBQUU7WUFDeEUsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLElBQUksRUFBRTtnQkFDdkIsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFFNUMsTUFBTyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUU7b0JBQ3ZCLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztpQkFDL0M7Z0JBRUQsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixFQUFVO29CQUN2QixFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBRTlDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLEVBQUU7d0JBQ2xCLE9BQU8sVUFBVSxDQUNmLEtBQUssRUFDTCx5RkFBeUYsQ0FDMUYsQ0FBQztxQkFDSDtvQkFFRCxJQUFJLGFBQWEsRUFBRTt3QkFDakIsZ0JBQWdCLENBQ2QsS0FBSyxFQUNMLE1BQU0sRUFDTixlQUFlLEVBQ2YsTUFBTSxFQUNOLE9BQU8sRUFDUCxJQUFJLENBQ0wsQ0FBQzt3QkFDRixNQUFNLEdBQUcsT0FBTyxHQUFHLFNBQVMsR0FBRyxJQUFJLENBQUM7cUJBQ3JDO29CQUVELFFBQVEsR0FBRyxJQUFJLENBQUM7b0JBQ2hCLGFBQWEsR0FBRyxLQUFLLENBQUM7b0JBQ3RCLFlBQVksR0FBRyxLQUFLLENBQUM7b0JBQ3JCLE1BQU0sR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDO29CQUNuQixPQUFPLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztpQkFDeEIsTUFBTSxJQUFJLFFBQVEsRUFBRTtvQkFDbkIsT0FBTyxVQUFVLENBQ2YsS0FBSyxFQUNMLDBEQUEwRCxDQUMzRCxDQUFDO2lCQUNILE1BQU07b0JBQ0wsS0FBSyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7b0JBQ2hCLEtBQUssQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO29CQUN0QixPQUFPLElBQUksQ0FBQyxDQUFDLG9DQUFvQztpQkFDbEQ7YUFDRixNQUFNLElBQUksUUFBUSxFQUFFO2dCQUNuQixPQUFPLFVBQVUsQ0FDZixLQUFLLEVBQ0wsZ0ZBQWdGLENBQ2pGLENBQUM7YUFDSCxNQUFNO2dCQUNMLEtBQUssQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO2dCQUNoQixLQUFLLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztnQkFDdEIsT0FBTyxJQUFJLENBQUMsQ0FBQyxvQ0FBb0M7YUFDbEQ7U0FDRixNQUFNO1lBQ0wsTUFBTSxDQUFDLHVDQUF1QztTQUMvQztRQUVELEVBQUU7UUFDRixnRUFBZ0U7UUFDaEUsRUFBRTtRQUNGLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxJQUFJLElBQUksS0FBSyxDQUFDLFVBQVUsR0FBRyxVQUFVLEVBQUU7WUFDeEQsSUFDRSxXQUFXLENBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsWUFBWSxDQUFDLEVBQ3JFO2dCQUNBLElBQUksYUFBYSxFQUFFO29CQUNqQixPQUFPLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztpQkFDeEIsTUFBTTtvQkFDTCxTQUFTLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztpQkFDMUI7YUFDRjtZQUVELElBQUksQ0FBQyxhQUFhLEVBQUU7Z0JBQ2xCLGdCQUFnQixDQUNkLEtBQUssRUFDTCxNQUFNLEVBQ04sZUFBZSxFQUNmLE1BQU0sRUFDTixPQUFPLEVBQ1AsU0FBUyxFQUNULElBQUksRUFDSixHQUFHLENBQ0osQ0FBQztnQkFDRixNQUFNLEdBQUcsT0FBTyxHQUFHLFNBQVMsR0FBRyxJQUFJLENBQUM7YUFDckM7WUFFRCxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckMsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUM3QztRQUVELElBQUksS0FBSyxDQUFDLFVBQVUsR0FBRyxVQUFVLElBQUksRUFBRSxLQUFLLENBQUMsRUFBRTtZQUM3QyxPQUFPLFVBQVUsQ0FBQyxLQUFLLEVBQUUsb0NBQW9DLENBQUMsQ0FBQztTQUNoRSxNQUFNLElBQUksS0FBSyxDQUFDLFVBQVUsR0FBRyxVQUFVLEVBQUU7WUFDeEMsTUFBTTtTQUNQO0tBQ0Y7SUFFRCxFQUFFO0lBQ0YsWUFBWTtJQUNaLEVBQUU7SUFFRixnRkFBZ0Y7SUFDaEYsSUFBSSxhQUFhLEVBQUU7UUFDakIsZ0JBQWdCLENBQ2QsS0FBSyxFQUNMLE1BQU0sRUFDTixlQUFlLEVBQ2YsTUFBTSxFQUNOLE9BQU8sRUFDUCxJQUFJLENBQ0wsQ0FBQztLQUNIO0lBRUQsZ0NBQWdDO0lBQ2hDLElBQUksUUFBUSxFQUFFO1FBQ1osS0FBSyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDaEIsS0FBSyxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDdEIsS0FBSyxDQUFDLElBQUksR0FBRyxTQUFTLENBQUM7UUFDdkIsS0FBSyxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7S0FDdkI7SUFFRCxPQUFPLFFBQVEsQ0FBQztDQUNqQjtBQUVELFNBQVMsZUFBZSxDQUFDLEtBQWtCLEVBQVc7SUFDcEQsSUFBSSxRQUFRLEFBQVEsRUFDbEIsVUFBVSxHQUFHLEtBQUssRUFDbEIsT0FBTyxHQUFHLEtBQUssRUFDZixTQUFTLEdBQUcsRUFBRSxFQUNkLE9BQU8sQUFBUSxFQUNmLEVBQUUsQUFBUSxBQUFDO0lBRWIsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUU1QyxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVUsT0FBTyxLQUFLLENBQUM7SUFFdEMsSUFBSSxLQUFLLENBQUMsR0FBRyxLQUFLLElBQUksRUFBRTtRQUN0QixPQUFPLFVBQVUsQ0FBQyxLQUFLLEVBQUUsK0JBQStCLENBQUMsQ0FBQztLQUMzRDtJQUVELEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUU5QyxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7UUFDdkIsVUFBVSxHQUFHLElBQUksQ0FBQztRQUNsQixFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7S0FDL0MsTUFBTSxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7UUFDOUIsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNmLFNBQVMsR0FBRyxJQUFJLENBQUM7UUFDakIsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0tBQy9DLE1BQU07UUFDTCxTQUFTLEdBQUcsR0FBRyxDQUFDO0tBQ2pCO0lBRUQsUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUM7SUFFMUIsSUFBSSxVQUFVLEVBQUU7UUFDZCxHQUFHO1lBQ0QsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1NBQy9DLE9BQVEsRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixDQUFVO1FBRTFDLElBQUksS0FBSyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFO1lBQ2pDLE9BQU8sR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3RELEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUMvQyxNQUFNO1lBQ0wsT0FBTyxVQUFVLENBQ2YsS0FBSyxFQUNMLG9EQUFvRCxDQUNyRCxDQUFDO1NBQ0g7S0FDRixNQUFNO1FBQ0wsTUFBTyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFFO1lBQ2pDLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFBVTtnQkFDdkIsSUFBSSxDQUFDLE9BQU8sRUFBRTtvQkFDWixTQUFTLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBUSxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUVoRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFO3dCQUN2QyxPQUFPLFVBQVUsQ0FDZixLQUFLLEVBQ0wsaURBQWlELENBQ2xELENBQUM7cUJBQ0g7b0JBRUQsT0FBTyxHQUFHLElBQUksQ0FBQztvQkFDZixRQUFRLEdBQUcsS0FBSyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7aUJBQy9CLE1BQU07b0JBQ0wsT0FBTyxVQUFVLENBQ2YsS0FBSyxFQUNMLDZDQUE2QyxDQUM5QyxDQUFDO2lCQUNIO2FBQ0Y7WUFFRCxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7U0FDL0M7UUFFRCxPQUFPLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUV0RCxJQUFJLHVCQUF1QixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUN6QyxPQUFPLFVBQVUsQ0FDZixLQUFLLEVBQ0wscURBQXFELENBQ3RELENBQUM7U0FDSDtLQUNGO0lBRUQsSUFBSSxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQzdDLE9BQU8sVUFBVSxDQUNmLEtBQUssRUFDTCxDQUFDLHlDQUF5QyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQ3RELENBQUM7S0FDSDtJQUVELElBQUksVUFBVSxFQUFFO1FBQ2QsS0FBSyxDQUFDLEdBQUcsR0FBRyxPQUFPLENBQUM7S0FDckIsTUFBTSxJQUNMLE9BQU8sS0FBSyxDQUFDLE1BQU0sS0FBSyxXQUFXLElBQ25DLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxFQUMvQjtRQUNBLEtBQUssQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxPQUFPLENBQUM7S0FDL0MsTUFBTSxJQUFJLFNBQVMsS0FBSyxHQUFHLEVBQUU7UUFDNUIsS0FBSyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO0tBQzNCLE1BQU0sSUFBSSxTQUFTLEtBQUssSUFBSSxFQUFFO1FBQzdCLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO0tBQzVDLE1BQU07UUFDTCxPQUFPLFVBQVUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyx1QkFBdUIsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUNsRTtJQUVELE9BQU8sSUFBSSxDQUFDO0NBQ2I7QUFFRCxTQUFTLGtCQUFrQixDQUFDLEtBQWtCLEVBQVc7SUFDdkQsSUFBSSxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxBQUFDO0lBQ2hELElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFBVSxPQUFPLEtBQUssQ0FBQztJQUV0QyxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssSUFBSSxFQUFFO1FBQ3pCLE9BQU8sVUFBVSxDQUFDLEtBQUssRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO0tBQy9EO0lBQ0QsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRTlDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLEFBQUM7SUFDaEMsTUFBTyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFFO1FBQ3pELEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztLQUMvQztJQUVELElBQUksS0FBSyxDQUFDLFFBQVEsS0FBSyxRQUFRLEVBQUU7UUFDL0IsT0FBTyxVQUFVLENBQ2YsS0FBSyxFQUNMLDREQUE0RCxDQUM3RCxDQUFDO0tBQ0g7SUFFRCxLQUFLLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDM0QsT0FBTyxJQUFJLENBQUM7Q0FDYjtBQUVELFNBQVMsU0FBUyxDQUFDLEtBQWtCLEVBQVc7SUFDOUMsSUFBSSxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxBQUFDO0lBRWhELElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFBVSxPQUFPLEtBQUssQ0FBQztJQUV0QyxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDOUMsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLFFBQVEsQUFBQztJQUVqQyxNQUFPLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsRUFBRSxDQUFDLENBQUU7UUFDekQsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0tBQy9DO0lBRUQsSUFBSSxLQUFLLENBQUMsUUFBUSxLQUFLLFNBQVMsRUFBRTtRQUNoQyxPQUFPLFVBQVUsQ0FDZixLQUFLLEVBQ0wsMkRBQTJELENBQzVELENBQUM7S0FDSDtJQUVELE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEFBQUM7SUFDM0QsSUFDRSxPQUFPLEtBQUssQ0FBQyxTQUFTLEtBQUssV0FBVyxJQUN0QyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxFQUMvQjtRQUNBLE9BQU8sVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQzNEO0lBRUQsSUFBSSxPQUFPLEtBQUssQ0FBQyxTQUFTLEtBQUssV0FBVyxFQUFFO1FBQzFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztLQUN2QztJQUNELG1CQUFtQixDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyQyxPQUFPLElBQUksQ0FBQztDQUNiO0FBRUQsU0FBUyxXQUFXLENBQ2xCLEtBQWtCLEVBQ2xCLFlBQW9CLEVBQ3BCLFdBQW1CLEVBQ25CLFdBQW9CLEVBQ3BCLFlBQXFCLEVBQ1o7SUFDVCxJQUFJLGlCQUFpQixBQUFTLEVBQzVCLHFCQUFxQixBQUFTLEVBQzlCLFlBQVksR0FBRyxDQUFDLEVBQ2hCLFNBQVMsR0FBRyxLQUFLLEVBQ2pCLFVBQVUsR0FBRyxLQUFLLEVBQ2xCLElBQUksQUFBTSxFQUNWLFVBQVUsQUFBUSxFQUNsQixXQUFXLEFBQVEsQUFBQztJQUV0QixJQUFJLEtBQUssQ0FBQyxRQUFRLElBQUksS0FBSyxDQUFDLFFBQVEsS0FBSyxJQUFJLEVBQUU7UUFDN0MsS0FBSyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FDL0I7SUFFRCxLQUFLLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQztJQUNqQixLQUFLLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztJQUNwQixLQUFLLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztJQUNsQixLQUFLLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQztJQUVwQixNQUFNLGdCQUFnQixHQUNuQixpQkFBaUIsR0FBRyxxQkFBcUIsR0FDeEMsaUJBQWlCLEtBQUssV0FBVyxJQUFJLGdCQUFnQixLQUFLLFdBQVcsQUFBQyxBQUFDO0lBRTNFLElBQUksV0FBVyxFQUFFO1FBQ2YsSUFBSSxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDeEMsU0FBUyxHQUFHLElBQUksQ0FBQztZQUVqQixJQUFJLEtBQUssQ0FBQyxVQUFVLEdBQUcsWUFBWSxFQUFFO2dCQUNuQyxZQUFZLEdBQUcsQ0FBQyxDQUFDO2FBQ2xCLE1BQU0sSUFBSSxLQUFLLENBQUMsVUFBVSxLQUFLLFlBQVksRUFBRTtnQkFDNUMsWUFBWSxHQUFHLENBQUMsQ0FBQzthQUNsQixNQUFNLElBQUksS0FBSyxDQUFDLFVBQVUsR0FBRyxZQUFZLEVBQUU7Z0JBQzFDLFlBQVksR0FBRyxDQUFDLENBQUMsQ0FBQzthQUNuQjtTQUNGO0tBQ0Y7SUFFRCxJQUFJLFlBQVksS0FBSyxDQUFDLEVBQUU7UUFDdEIsTUFBTyxlQUFlLENBQUMsS0FBSyxDQUFDLElBQUksa0JBQWtCLENBQUMsS0FBSyxDQUFDLENBQUU7WUFDMUQsSUFBSSxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ3hDLFNBQVMsR0FBRyxJQUFJLENBQUM7Z0JBQ2pCLHFCQUFxQixHQUFHLGdCQUFnQixDQUFDO2dCQUV6QyxJQUFJLEtBQUssQ0FBQyxVQUFVLEdBQUcsWUFBWSxFQUFFO29CQUNuQyxZQUFZLEdBQUcsQ0FBQyxDQUFDO2lCQUNsQixNQUFNLElBQUksS0FBSyxDQUFDLFVBQVUsS0FBSyxZQUFZLEVBQUU7b0JBQzVDLFlBQVksR0FBRyxDQUFDLENBQUM7aUJBQ2xCLE1BQU0sSUFBSSxLQUFLLENBQUMsVUFBVSxHQUFHLFlBQVksRUFBRTtvQkFDMUMsWUFBWSxHQUFHLENBQUMsQ0FBQyxDQUFDO2lCQUNuQjthQUNGLE1BQU07Z0JBQ0wscUJBQXFCLEdBQUcsS0FBSyxDQUFDO2FBQy9CO1NBQ0Y7S0FDRjtJQUVELElBQUkscUJBQXFCLEVBQUU7UUFDekIscUJBQXFCLEdBQUcsU0FBUyxJQUFJLFlBQVksQ0FBQztLQUNuRDtJQUVELElBQUksWUFBWSxLQUFLLENBQUMsSUFBSSxpQkFBaUIsS0FBSyxXQUFXLEVBQUU7UUFDM0QsTUFBTSxJQUFJLEdBQUcsZUFBZSxLQUFLLFdBQVcsSUFDMUMsZ0JBQWdCLEtBQUssV0FBVyxBQUFDO1FBQ25DLFVBQVUsR0FBRyxJQUFJLEdBQUcsWUFBWSxHQUFHLFlBQVksR0FBRyxDQUFDLENBQUM7UUFFcEQsV0FBVyxHQUFHLEtBQUssQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQztRQUUvQyxJQUFJLFlBQVksS0FBSyxDQUFDLEVBQUU7WUFDdEIsSUFDRSxBQUFDLHFCQUFxQixJQUNwQixDQUFDLGlCQUFpQixDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsSUFDcEMsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxVQUFVLENBQUMsQ0FBQyxJQUNyRCxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLEVBQ3JDO2dCQUNBLFVBQVUsR0FBRyxJQUFJLENBQUM7YUFDbkIsTUFBTTtnQkFDTCxJQUNFLEFBQUMsaUJBQWlCLElBQUksZUFBZSxDQUFDLEtBQUssRUFBRSxVQUFVLENBQUMsSUFDeEQsc0JBQXNCLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxJQUN6QyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLEVBQ3pDO29CQUNBLFVBQVUsR0FBRyxJQUFJLENBQUM7aUJBQ25CLE1BQU0sSUFBSSxTQUFTLENBQUMsS0FBSyxDQUFDLEVBQUU7b0JBQzNCLFVBQVUsR0FBRyxJQUFJLENBQUM7b0JBRWxCLElBQUksS0FBSyxDQUFDLEdBQUcsS0FBSyxJQUFJLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxJQUFJLEVBQUU7d0JBQy9DLE9BQU8sVUFBVSxDQUNmLEtBQUssRUFDTCwyQ0FBMkMsQ0FDNUMsQ0FBQztxQkFDSDtpQkFDRixNQUFNLElBQ0wsZUFBZSxDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsZUFBZSxLQUFLLFdBQVcsQ0FBQyxFQUNuRTtvQkFDQSxVQUFVLEdBQUcsSUFBSSxDQUFDO29CQUVsQixJQUFJLEtBQUssQ0FBQyxHQUFHLEtBQUssSUFBSSxFQUFFO3dCQUN0QixLQUFLLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztxQkFDakI7aUJBQ0Y7Z0JBRUQsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQyxTQUFTLEtBQUssV0FBVyxFQUFFO29CQUNuRSxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO2lCQUM5QzthQUNGO1NBQ0YsTUFBTSxJQUFJLFlBQVksS0FBSyxDQUFDLEVBQUU7WUFDN0IsMEZBQTBGO1lBQzFGLG1EQUFtRDtZQUNuRCxVQUFVLEdBQUcscUJBQXFCLElBQ2hDLGlCQUFpQixDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsQ0FBQztTQUN6QztLQUNGO0lBRUQsSUFBSSxLQUFLLENBQUMsR0FBRyxLQUFLLElBQUksSUFBSSxLQUFLLENBQUMsR0FBRyxLQUFLLEdBQUcsRUFBRTtRQUMzQyxJQUFJLEtBQUssQ0FBQyxHQUFHLEtBQUssR0FBRyxFQUFFO1lBQ3JCLElBQ0UsSUFBSSxTQUFTLEdBQUcsQ0FBQyxFQUFFLFlBQVksR0FBRyxLQUFLLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFDNUQsU0FBUyxHQUFHLFlBQVksRUFDeEIsU0FBUyxFQUFFLENBQ1g7Z0JBQ0EsSUFBSSxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBRXRDLGtFQUFrRTtnQkFDbEUsbUVBQW1FO2dCQUNuRSx5Q0FBeUM7Z0JBRXpDLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUU7b0JBQzlCLGdEQUFnRDtvQkFDaEQsS0FBSyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDNUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO29CQUNyQixJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssSUFBSSxJQUFJLE9BQU8sS0FBSyxDQUFDLFNBQVMsS0FBSyxXQUFXLEVBQUU7d0JBQ25FLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7cUJBQzlDO29CQUNELE1BQU07aUJBQ1A7YUFDRjtTQUNGLE1BQU0sSUFDTCxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFDMUQ7WUFDQSxJQUFJLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLFVBQVUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUUxRCxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssSUFBSSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssS0FBSyxDQUFDLElBQUksRUFBRTtnQkFDckQsT0FBTyxVQUFVLENBQ2YsS0FBSyxFQUNMLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUNuRyxDQUFDO2FBQ0g7WUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQy9CLGdEQUFnRDtnQkFDaEQsT0FBTyxVQUFVLENBQ2YsS0FBSyxFQUNMLENBQUMsNkJBQTZCLEVBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FDMUQsQ0FBQzthQUNILE1BQU07Z0JBQ0wsS0FBSyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDNUMsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLElBQUksSUFBSSxPQUFPLEtBQUssQ0FBQyxTQUFTLEtBQUssV0FBVyxFQUFFO29CQUNuRSxLQUFLLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDO2lCQUM5QzthQUNGO1NBQ0YsTUFBTTtZQUNMLE9BQU8sVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDLGNBQWMsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDekQ7S0FDRjtJQUVELElBQUksS0FBSyxDQUFDLFFBQVEsSUFBSSxLQUFLLENBQUMsUUFBUSxLQUFLLElBQUksRUFBRTtRQUM3QyxLQUFLLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztLQUNoQztJQUNELE9BQU8sS0FBSyxDQUFDLEdBQUcsS0FBSyxJQUFJLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxJQUFJLElBQUksVUFBVSxDQUFDO0NBQ2xFO0FBRUQsU0FBUyxZQUFZLENBQUMsS0FBa0IsRUFBUTtJQUM5QyxNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsUUFBUSxBQUFDO0lBQ3JDLElBQUksUUFBUSxBQUFRLEVBQ2xCLGFBQWEsQUFBUSxFQUNyQixhQUFhLEFBQVUsRUFDdkIsYUFBYSxHQUFHLEtBQUssRUFDckIsRUFBRSxBQUFRLEFBQUM7SUFFYixLQUFLLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztJQUNyQixLQUFLLENBQUMsZUFBZSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7SUFDckMsS0FBSyxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7SUFDbEIsS0FBSyxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7SUFFckIsTUFBTyxDQUFDLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUU7UUFDMUQsbUJBQW1CLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXJDLEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFNUMsSUFBSSxLQUFLLENBQUMsVUFBVSxHQUFHLENBQUMsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixFQUFVO1lBQy9DLE1BQU07U0FDUDtRQUVELGFBQWEsR0FBRyxJQUFJLENBQUM7UUFDckIsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlDLFFBQVEsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO1FBRTFCLE1BQU8sRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBRTtZQUNqQyxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7U0FDL0M7UUFFRCxhQUFhLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1RCxhQUFhLEdBQUcsRUFBRSxDQUFDO1FBRW5CLElBQUksYUFBYSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDNUIsT0FBTyxVQUFVLENBQ2YsS0FBSyxFQUNMLDhEQUE4RCxDQUMvRCxDQUFDO1NBQ0g7UUFFRCxNQUFPLEVBQUUsS0FBSyxDQUFDLENBQUU7WUFDZixNQUFPLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBRTtnQkFDdkIsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2FBQy9DO1lBRUQsSUFBSSxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixFQUFVO2dCQUN2QixHQUFHO29CQUNELEVBQUUsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztpQkFDL0MsT0FBUSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFFO2dCQUNqQyxNQUFNO2FBQ1A7WUFFRCxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNO1lBRXJCLFFBQVEsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDO1lBRTFCLE1BQU8sRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBRTtnQkFDakMsRUFBRSxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2FBQy9DO1lBRUQsYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7U0FDakU7UUFFRCxJQUFJLEVBQUUsS0FBSyxDQUFDLEVBQUUsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRW5DLElBQUksTUFBTSxDQUFDLGlCQUFpQixFQUFFLGFBQWEsQ0FBQyxFQUFFO1lBQzVDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxDQUFDLEtBQUssRUFBRSxhQUFhLEtBQUssYUFBYSxDQUFDLENBQUM7U0FDMUUsTUFBTTtZQUNMLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQyw0QkFBNEIsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUN0RTtLQUNGO0lBRUQsbUJBQW1CLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXJDLElBQ0UsS0FBSyxDQUFDLFVBQVUsS0FBSyxDQUFDLElBQ3RCLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLElBQy9DLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBUixJQUNuRCxLQUFLLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxPQUFPLENBQVIsRUFDbkQ7UUFDQSxLQUFLLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQztRQUNwQixtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDdEMsTUFBTSxJQUFJLGFBQWEsRUFBRTtRQUN4QixPQUFPLFVBQVUsQ0FBQyxLQUFLLEVBQUUsaUNBQWlDLENBQUMsQ0FBQztLQUM3RDtJQUVELFdBQVcsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLFVBQVUsR0FBRyxDQUFDLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3pFLG1CQUFtQixDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVyQyxJQUNFLEtBQUssQ0FBQyxlQUFlLElBQ3JCLDZCQUE2QixDQUFDLElBQUksQ0FDaEMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FDakQsRUFDRDtRQUNBLFlBQVksQ0FBQyxLQUFLLEVBQUUsa0RBQWtELENBQUMsQ0FBQztLQUN6RTtJQUVELEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUVuQyxJQUFJLEtBQUssQ0FBQyxRQUFRLEtBQUssS0FBSyxDQUFDLFNBQVMsSUFBSSxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsRUFBRTtRQUN0RSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxJQUFJLENBQUMsT0FBTyxDQUFSLEVBQVU7WUFDM0QsS0FBSyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUM7WUFDcEIsbUJBQW1CLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ3RDO1FBQ0QsT0FBTztLQUNSO0lBRUQsSUFBSSxLQUFLLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1FBQ3JDLE9BQU8sVUFBVSxDQUNmLEtBQUssRUFDTCx1REFBdUQsQ0FDeEQsQ0FBQztLQUNILE1BQU07UUFDTCxPQUFPO0tBQ1I7Q0FDRjtBQUVELFNBQVMsYUFBYSxDQUFDLEtBQWEsRUFBRSxPQUE0QixFQUFhO0lBQzdFLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdEIsT0FBTyxHQUFHLE9BQU8sSUFBSSxFQUFFLENBQUM7SUFFeEIsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtRQUN0QixpQ0FBaUM7UUFDakMsSUFDRSxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLFFBQVEsS0FDcEQsS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxRQUFRLENBQVQsRUFDM0M7WUFDQSxLQUFLLElBQUksSUFBSSxDQUFDO1NBQ2Y7UUFFRCxZQUFZO1FBQ1osSUFBSSxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxLQUFLLE1BQU0sRUFBRTtZQUNsQyxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUN4QjtLQUNGO0lBRUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxXQUFXLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxBQUFDO0lBRTlDLDBFQUEwRTtJQUMxRSxLQUFLLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQztJQUVwQixNQUFPLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsS0FBSyxJQUFJLENBQUMsV0FBVyxDQUFaLENBQWM7UUFDbEUsS0FBSyxDQUFDLFVBQVUsSUFBSSxDQUFDLENBQUM7UUFDdEIsS0FBSyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUM7S0FDckI7SUFFRCxNQUFPLEtBQUssQ0FBQyxRQUFRLEdBQUcsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUU7UUFDeEMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQ3JCO0lBRUQsT0FBTyxLQUFLLENBQUMsU0FBUyxDQUFDO0NBQ3hCO0FBR0QsU0FBUyxZQUFZLENBQUMsRUFBVyxFQUFvQjtJQUNuRCxPQUFPLE9BQU8sRUFBRSxLQUFLLFVBQVUsQ0FBQztDQUNqQztBQUVELE9BQU8sU0FBUyxPQUFPLENBQ3JCLEtBQWEsRUFDYixnQkFBb0IsRUFDcEIsT0FBNEIsRUFDYTtJQUN6QyxJQUFJLENBQUMsWUFBWSxDQUFDLGdCQUFnQixDQUFDLEVBQUU7UUFDbkMsT0FBTyxhQUFhLENBQUMsS0FBSyxFQUFFLGdCQUFnQixDQUF1QixDQUFRO0tBQzVFO0lBRUQsTUFBTSxTQUFTLEdBQUcsYUFBYSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQUFBQztJQUNoRCxNQUFNLFFBQVEsR0FBRyxnQkFBZ0IsQUFBQztJQUNsQyxJQUFLLElBQUksS0FBSyxHQUFHLENBQUMsRUFBRSxNQUFNLEdBQUcsU0FBUyxDQUFDLE1BQU0sRUFBRSxLQUFLLEdBQUcsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFFO1FBQ3RFLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztLQUM1QjtJQUVELE9BQU8sS0FBSyxDQUFDLENBQVE7Q0FDdEI7QUFFRCxPQUFPLFNBQVMsSUFBSSxDQUFDLEtBQWEsRUFBRSxPQUE0QixFQUFXO0lBQ3pFLE1BQU0sU0FBUyxHQUFHLGFBQWEsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLEFBQUM7SUFFaEQsSUFBSSxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtRQUMxQixPQUFPO0tBQ1I7SUFDRCxJQUFJLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQzFCLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ3JCO0lBQ0QsTUFBTSxJQUFJLFNBQVMsQ0FDakIsMERBQTBELENBQzNELENBQUM7Q0FDSCJ9