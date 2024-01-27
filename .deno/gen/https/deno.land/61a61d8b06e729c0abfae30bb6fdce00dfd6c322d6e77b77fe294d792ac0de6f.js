// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.
// This module is browser compatible. Do not rely on good formatting of values
// for AssertionError messages in browsers.
import { bgGreen, bgRed, bold, gray, green, red, stripColor, white } from "../fmt/colors.ts";
import { diff, diffstr, DiffType } from "./_diff.ts";
const CAN_NOT_DISPLAY = "[Cannot display]";
export class AssertionError extends Error {
    name = "AssertionError";
    constructor(message){
        super(message);
    }
}
/**
 * Converts the input into a string. Objects, Sets and Maps are sorted so as to
 * make tests less flaky
 * @param v Value to be formatted
 */ export function _format(v) {
    // deno-lint-ignore no-explicit-any
    const { Deno  } = globalThis;
    return typeof Deno?.inspect === "function" ? Deno.inspect(v, {
        depth: Infinity,
        sorted: true,
        trailingComma: true,
        compact: false,
        iterableLimit: Infinity
    }) : `"${String(v).replace(/(?=["\\])/g, "\\")}"`;
}
/**
 * Colors the output of assertion diffs
 * @param diffType Difference type, either added or removed
 */ function createColor(diffType, { background =false  } = {
}) {
    switch(diffType){
        case DiffType.added:
            return (s)=>background ? bgGreen(white(s)) : green(bold(s))
            ;
        case DiffType.removed:
            return (s)=>background ? bgRed(white(s)) : red(bold(s))
            ;
        default:
            return white;
    }
}
/**
 * Prefixes `+` or `-` in diff output
 * @param diffType Difference type, either added or removed
 */ function createSign(diffType) {
    switch(diffType){
        case DiffType.added:
            return "+   ";
        case DiffType.removed:
            return "-   ";
        default:
            return "    ";
    }
}
function buildMessage(diffResult, { stringDiff =false  } = {
}) {
    const messages = [], diffMessages = [];
    messages.push("");
    messages.push("");
    messages.push(`    ${gray(bold("[Diff]"))} ${red(bold("Actual"))} / ${green(bold("Expected"))}`);
    messages.push("");
    messages.push("");
    diffResult.forEach((result)=>{
        const c = createColor(result.type);
        const line = result.details?.map((detail)=>detail.type !== DiffType.common ? createColor(detail.type, {
                background: true
            })(detail.value) : detail.value
        ).join("") ?? result.value;
        diffMessages.push(c(`${createSign(result.type)}${line}`));
    });
    messages.push(...stringDiff ? [
        diffMessages.join("")
    ] : diffMessages);
    messages.push("");
    return messages;
}
function isKeyedCollection(x) {
    return [
        Symbol.iterator,
        "size"
    ].every((k)=>k in x
    );
}
/**
 * Deep equality comparison used in assertions
 * @param c actual value
 * @param d expected value
 */ export function equal(c, d) {
    const seen = new Map();
    return (function compare(a, b) {
        // Have to render RegExp & Date for string comparison
        // unless it's mistreated as object
        if (a && b && (a instanceof RegExp && b instanceof RegExp || a instanceof URL && b instanceof URL)) {
            return String(a) === String(b);
        }
        if (a instanceof Date && b instanceof Date) {
            const aTime = a.getTime();
            const bTime = b.getTime();
            // Check for NaN equality manually since NaN is not
            // equal to itself.
            if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
                return true;
            }
            return a.getTime() === b.getTime();
        }
        if (Object.is(a, b)) {
            return true;
        }
        if (a && typeof a === "object" && b && typeof b === "object") {
            if (a && b && !constructorsEqual(a, b)) {
                return false;
            }
            if (a instanceof WeakMap || b instanceof WeakMap) {
                if (!(a instanceof WeakMap && b instanceof WeakMap)) return false;
                throw new TypeError("cannot compare WeakMap instances");
            }
            if (a instanceof WeakSet || b instanceof WeakSet) {
                if (!(a instanceof WeakSet && b instanceof WeakSet)) return false;
                throw new TypeError("cannot compare WeakSet instances");
            }
            if (seen.get(a) === b) {
                return true;
            }
            if (Object.keys(a || {
            }).length !== Object.keys(b || {
            }).length) {
                return false;
            }
            if (isKeyedCollection(a) && isKeyedCollection(b)) {
                if (a.size !== b.size) {
                    return false;
                }
                let unmatchedEntries = a.size;
                for (const [aKey, aValue] of a.entries()){
                    for (const [bKey, bValue] of b.entries()){
                        /* Given that Map keys can be references, we need
             * to ensure that they are also deeply equal */ if (aKey === aValue && bKey === bValue && compare(aKey, bKey) || compare(aKey, bKey) && compare(aValue, bValue)) {
                            unmatchedEntries--;
                        }
                    }
                }
                return unmatchedEntries === 0;
            }
            const merged = {
                ...a,
                ...b
            };
            for (const key of [
                ...Object.getOwnPropertyNames(merged),
                ...Object.getOwnPropertySymbols(merged), 
            ]){
                if (!compare(a && a[key], b && b[key])) {
                    return false;
                }
                if (key in a && !(key in b) || key in b && !(key in a)) {
                    return false;
                }
            }
            seen.set(a, b);
            if (a instanceof WeakRef || b instanceof WeakRef) {
                if (!(a instanceof WeakRef && b instanceof WeakRef)) return false;
                return compare(a.deref(), b.deref());
            }
            return true;
        }
        return false;
    })(c, d);
}
// deno-lint-ignore ban-types
function constructorsEqual(a, b) {
    return a.constructor === b.constructor || a.constructor === Object && !b.constructor || !a.constructor && b.constructor === Object;
}
/** Make an assertion, error will be thrown if `expr` does not have truthy value. */ export function assert(expr, msg = "") {
    if (!expr) {
        throw new AssertionError(msg);
    }
}
export function assertEquals(actual, expected, msg) {
    if (equal(actual, expected)) {
        return;
    }
    let message = "";
    const actualString = _format(actual);
    const expectedString = _format(expected);
    try {
        const stringDiff = typeof actual === "string" && typeof expected === "string";
        const diffResult = stringDiff ? diffstr(actual, expected) : diff(actualString.split("\n"), expectedString.split("\n"));
        const diffMsg = buildMessage(diffResult, {
            stringDiff
        }).join("\n");
        message = `Values are not equal:\n${diffMsg}`;
    } catch  {
        message = `\n${red(CAN_NOT_DISPLAY)} + \n\n`;
    }
    if (msg) {
        message = msg;
    }
    throw new AssertionError(message);
}
export function assertNotEquals(actual, expected, msg) {
    if (!equal(actual, expected)) {
        return;
    }
    let actualString;
    let expectedString;
    try {
        actualString = String(actual);
    } catch  {
        actualString = "[Cannot display]";
    }
    try {
        expectedString = String(expected);
    } catch  {
        expectedString = "[Cannot display]";
    }
    if (!msg) {
        msg = `actual: ${actualString} expected: ${expectedString}`;
    }
    throw new AssertionError(msg);
}
export function assertStrictEquals(actual, expected, msg) {
    if (actual === expected) {
        return;
    }
    let message;
    if (msg) {
        message = msg;
    } else {
        const actualString = _format(actual);
        const expectedString = _format(expected);
        if (actualString === expectedString) {
            const withOffset = actualString.split("\n").map((l)=>`    ${l}`
            ).join("\n");
            message = `Values have the same structure but are not reference-equal:\n\n${red(withOffset)}\n`;
        } else {
            try {
                const stringDiff = typeof actual === "string" && typeof expected === "string";
                const diffResult = stringDiff ? diffstr(actual, expected) : diff(actualString.split("\n"), expectedString.split("\n"));
                const diffMsg = buildMessage(diffResult, {
                    stringDiff
                }).join("\n");
                message = `Values are not strictly equal:\n${diffMsg}`;
            } catch  {
                message = `\n${red(CAN_NOT_DISPLAY)} + \n\n`;
            }
        }
    }
    throw new AssertionError(message);
}
export function assertNotStrictEquals(actual, expected, msg) {
    if (actual !== expected) {
        return;
    }
    throw new AssertionError(msg ?? `Expected "actual" to be strictly unequal to: ${_format(actual)}\n`);
}
/**
 * Make an assertion that actual is not null or undefined.
 * If not then throw.
 */ export function assertExists(actual, msg) {
    if (actual === undefined || actual === null) {
        if (!msg) {
            msg = `actual: "${actual}" expected to not be null or undefined`;
        }
        throw new AssertionError(msg);
    }
}
/**
 * Make an assertion that actual includes expected. If not
 * then throw.
 */ export function assertStringIncludes(actual, expected, msg) {
    if (!actual.includes(expected)) {
        if (!msg) {
            msg = `actual: "${actual}" expected to contain: "${expected}"`;
        }
        throw new AssertionError(msg);
    }
}
export function assertArrayIncludes(actual, expected, msg) {
    const missing = [];
    for(let i = 0; i < expected.length; i++){
        let found = false;
        for(let j = 0; j < actual.length; j++){
            if (equal(expected[i], actual[j])) {
                found = true;
                break;
            }
        }
        if (!found) {
            missing.push(expected[i]);
        }
    }
    if (missing.length === 0) {
        return;
    }
    if (!msg) {
        msg = `actual: "${_format(actual)}" expected to include: "${_format(expected)}"\nmissing: ${_format(missing)}`;
    }
    throw new AssertionError(msg);
}
/**
 * Make an assertion that `actual` match RegExp `expected`. If not
 * then throw.
 */ export function assertMatch(actual, expected, msg) {
    if (!expected.test(actual)) {
        if (!msg) {
            msg = `actual: "${actual}" expected to match: "${expected}"`;
        }
        throw new AssertionError(msg);
    }
}
/**
 * Make an assertion that `actual` not match RegExp `expected`. If match
 * then throw.
 */ export function assertNotMatch(actual, expected, msg) {
    if (expected.test(actual)) {
        if (!msg) {
            msg = `actual: "${actual}" expected to not match: "${expected}"`;
        }
        throw new AssertionError(msg);
    }
}
/**
 * Make an assertion that `actual` object is a subset of `expected` object, deeply.
 * If not, then throw.
 */ export function assertObjectMatch(// deno-lint-ignore no-explicit-any
actual, expected) {
    const seen = new WeakMap();
    function filter(a, b) {
        // If the actual value is an array, let assertEquals do the assertion.
        if (Array.isArray(a)) {
            return a;
        }
        // Prevent infinite loop with circular references with same filter
        if (seen.has(a) && seen.get(a) === b) {
            return a;
        }
        seen.set(a, b);
        // Filter keys and symbols which are present in both actual and expected
        const filtered = {
        };
        const entries = [
            ...Object.getOwnPropertyNames(a),
            ...Object.getOwnPropertySymbols(a), 
        ].filter((key)=>key in b
        ).map((key)=>[
                key,
                a[key]
            ]
        );
        for (const [key, value] of entries){
            // On array references, build a filtered array and filter nested objects inside
            if (Array.isArray(value)) {
                const subset = b[key];
                if (Array.isArray(subset)) {
                    filtered[key] = value.slice(0, subset.length).map((element, index)=>{
                        const subsetElement = subset[index];
                        if (typeof subsetElement === "object" && subsetElement) {
                            return filter(element, subsetElement);
                        }
                        return element;
                    });
                    continue;
                }
            } else if (typeof value === "object") {
                const subset = b[key];
                if (typeof subset === "object" && subset) {
                    filtered[key] = filter(value, subset);
                    continue;
                }
            }
            filtered[key] = value;
        }
        return filtered;
    }
    return assertEquals(// get the intersection of "actual" and "expected"
    // side effect: all the instances' constructor field is "Object" now.
    filter(actual, expected), // set (nested) instances' constructor field to be "Object" without changing expected value.
    // see https://github.com/denoland/deno_std/pull/1419
    filter(expected, expected));
}
/**
 * Forcefully throws a failed assertion
 */ export function fail(msg) {
    assert(false, `Failed assertion${msg ? `: ${msg}` : "."}`);
}
/**
 * Make an assertion that `error` is an `Error`.
 * If not then an error will be thrown.
 * An error class and a string that should be included in the
 * error message can also be asserted.
 */ export function assertIsError(error, // deno-lint-ignore no-explicit-any
ErrorClass, msgIncludes, msg) {
    if (error instanceof Error === false) {
        throw new AssertionError(`Expected "error" to be an Error object.`);
    }
    if (ErrorClass && !(error instanceof ErrorClass)) {
        msg = `Expected error to be instance of "${ErrorClass.name}", but was "${typeof error === "object" ? error?.constructor?.name : "[not an object]"}"${msg ? `: ${msg}` : "."}`;
        throw new AssertionError(msg);
    }
    if (msgIncludes && (!(error instanceof Error) || !stripColor(error.message).includes(stripColor(msgIncludes)))) {
        msg = `Expected error message to include "${msgIncludes}", but got "${error instanceof Error ? error.message : "[not an Error]"}"${msg ? `: ${msg}` : "."}`;
        throw new AssertionError(msg);
    }
}
export function assertThrows(fn, errorClassOrCallback, msgIncludesOrMsg, msg) {
    // deno-lint-ignore no-explicit-any
    let ErrorClass = undefined;
    let msgIncludes = undefined;
    let errorCallback;
    if (errorClassOrCallback == null || errorClassOrCallback.prototype instanceof Error || errorClassOrCallback.prototype === Error.prototype) {
        // deno-lint-ignore no-explicit-any
        ErrorClass = errorClassOrCallback;
        msgIncludes = msgIncludesOrMsg;
        errorCallback = null;
    } else {
        errorCallback = errorClassOrCallback;
        msg = msgIncludesOrMsg;
    }
    let doesThrow = false;
    try {
        fn();
    } catch (error) {
        if (error instanceof Error === false) {
            throw new AssertionError("A non-Error object was thrown.");
        }
        assertIsError(error, ErrorClass, msgIncludes, msg);
        if (typeof errorCallback == "function") {
            errorCallback(error);
        }
        doesThrow = true;
    }
    if (!doesThrow) {
        msg = `Expected function to throw${msg ? `: ${msg}` : "."}`;
        throw new AssertionError(msg);
    }
}
export async function assertRejects(fn, errorClassOrCallback, msgIncludesOrMsg, msg) {
    // deno-lint-ignore no-explicit-any
    let ErrorClass = undefined;
    let msgIncludes = undefined;
    let errorCallback;
    if (errorClassOrCallback == null || errorClassOrCallback.prototype instanceof Error || errorClassOrCallback.prototype === Error.prototype) {
        // deno-lint-ignore no-explicit-any
        ErrorClass = errorClassOrCallback;
        msgIncludes = msgIncludesOrMsg;
        errorCallback = null;
    } else {
        errorCallback = errorClassOrCallback;
        msg = msgIncludesOrMsg;
    }
    let doesThrow = false;
    try {
        await fn();
    } catch (error) {
        if (error instanceof Error === false) {
            throw new AssertionError("A non-Error object was thrown or rejected.");
        }
        assertIsError(error, ErrorClass, msgIncludes, msg);
        if (typeof errorCallback == "function") {
            errorCallback(error);
        }
        doesThrow = true;
    }
    if (!doesThrow) {
        msg = `Expected function to throw${msg ? `: ${msg}` : "."}`;
        throw new AssertionError(msg);
    }
}
/** Use this to stub out methods that will throw when invoked. */ export function unimplemented(msg) {
    throw new AssertionError(msg || "unimplemented");
}
/** Use this to assert unreachable code. */ export function unreachable() {
    throw new AssertionError("unreachable");
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjExOC4wL3Rlc3RpbmcvYXNzZXJ0cy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIxIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gVGhpcyBtb2R1bGUgaXMgYnJvd3NlciBjb21wYXRpYmxlLiBEbyBub3QgcmVseSBvbiBnb29kIGZvcm1hdHRpbmcgb2YgdmFsdWVzXG4vLyBmb3IgQXNzZXJ0aW9uRXJyb3IgbWVzc2FnZXMgaW4gYnJvd3NlcnMuXG5cbmltcG9ydCB7XG4gIGJnR3JlZW4sXG4gIGJnUmVkLFxuICBib2xkLFxuICBncmF5LFxuICBncmVlbixcbiAgcmVkLFxuICBzdHJpcENvbG9yLFxuICB3aGl0ZSxcbn0gZnJvbSBcIi4uL2ZtdC9jb2xvcnMudHNcIjtcbmltcG9ydCB7IGRpZmYsIERpZmZSZXN1bHQsIGRpZmZzdHIsIERpZmZUeXBlIH0gZnJvbSBcIi4vX2RpZmYudHNcIjtcblxuY29uc3QgQ0FOX05PVF9ESVNQTEFZID0gXCJbQ2Fubm90IGRpc3BsYXldXCI7XG5cbmV4cG9ydCBjbGFzcyBBc3NlcnRpb25FcnJvciBleHRlbmRzIEVycm9yIHtcbiAgbmFtZSA9IFwiQXNzZXJ0aW9uRXJyb3JcIjtcbiAgY29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nKSB7XG4gICAgc3VwZXIobWVzc2FnZSk7XG4gIH1cbn1cblxuLyoqXG4gKiBDb252ZXJ0cyB0aGUgaW5wdXQgaW50byBhIHN0cmluZy4gT2JqZWN0cywgU2V0cyBhbmQgTWFwcyBhcmUgc29ydGVkIHNvIGFzIHRvXG4gKiBtYWtlIHRlc3RzIGxlc3MgZmxha3lcbiAqIEBwYXJhbSB2IFZhbHVlIHRvIGJlIGZvcm1hdHRlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gX2Zvcm1hdCh2OiB1bmtub3duKTogc3RyaW5nIHtcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgY29uc3QgeyBEZW5vIH0gPSBnbG9iYWxUaGlzIGFzIGFueTtcbiAgcmV0dXJuIHR5cGVvZiBEZW5vPy5pbnNwZWN0ID09PSBcImZ1bmN0aW9uXCJcbiAgICA/IERlbm8uaW5zcGVjdCh2LCB7XG4gICAgICBkZXB0aDogSW5maW5pdHksXG4gICAgICBzb3J0ZWQ6IHRydWUsXG4gICAgICB0cmFpbGluZ0NvbW1hOiB0cnVlLFxuICAgICAgY29tcGFjdDogZmFsc2UsXG4gICAgICBpdGVyYWJsZUxpbWl0OiBJbmZpbml0eSxcbiAgICB9KVxuICAgIDogYFwiJHtTdHJpbmcodikucmVwbGFjZSgvKD89W1wiXFxcXF0pL2csIFwiXFxcXFwiKX1cImA7XG59XG5cbi8qKlxuICogQ29sb3JzIHRoZSBvdXRwdXQgb2YgYXNzZXJ0aW9uIGRpZmZzXG4gKiBAcGFyYW0gZGlmZlR5cGUgRGlmZmVyZW5jZSB0eXBlLCBlaXRoZXIgYWRkZWQgb3IgcmVtb3ZlZFxuICovXG5mdW5jdGlvbiBjcmVhdGVDb2xvcihcbiAgZGlmZlR5cGU6IERpZmZUeXBlLFxuICB7IGJhY2tncm91bmQgPSBmYWxzZSB9ID0ge30sXG4pOiAoczogc3RyaW5nKSA9PiBzdHJpbmcge1xuICBzd2l0Y2ggKGRpZmZUeXBlKSB7XG4gICAgY2FzZSBEaWZmVHlwZS5hZGRlZDpcbiAgICAgIHJldHVybiAoczogc3RyaW5nKTogc3RyaW5nID0+XG4gICAgICAgIGJhY2tncm91bmQgPyBiZ0dyZWVuKHdoaXRlKHMpKSA6IGdyZWVuKGJvbGQocykpO1xuICAgIGNhc2UgRGlmZlR5cGUucmVtb3ZlZDpcbiAgICAgIHJldHVybiAoczogc3RyaW5nKTogc3RyaW5nID0+IGJhY2tncm91bmQgPyBiZ1JlZCh3aGl0ZShzKSkgOiByZWQoYm9sZChzKSk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB3aGl0ZTtcbiAgfVxufVxuXG4vKipcbiAqIFByZWZpeGVzIGArYCBvciBgLWAgaW4gZGlmZiBvdXRwdXRcbiAqIEBwYXJhbSBkaWZmVHlwZSBEaWZmZXJlbmNlIHR5cGUsIGVpdGhlciBhZGRlZCBvciByZW1vdmVkXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVNpZ24oZGlmZlR5cGU6IERpZmZUeXBlKTogc3RyaW5nIHtcbiAgc3dpdGNoIChkaWZmVHlwZSkge1xuICAgIGNhc2UgRGlmZlR5cGUuYWRkZWQ6XG4gICAgICByZXR1cm4gXCIrICAgXCI7XG4gICAgY2FzZSBEaWZmVHlwZS5yZW1vdmVkOlxuICAgICAgcmV0dXJuIFwiLSAgIFwiO1xuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gXCIgICAgXCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gYnVpbGRNZXNzYWdlKFxuICBkaWZmUmVzdWx0OiBSZWFkb25seUFycmF5PERpZmZSZXN1bHQ8c3RyaW5nPj4sXG4gIHsgc3RyaW5nRGlmZiA9IGZhbHNlIH0gPSB7fSxcbik6IHN0cmluZ1tdIHtcbiAgY29uc3QgbWVzc2FnZXM6IHN0cmluZ1tdID0gW10sIGRpZmZNZXNzYWdlczogc3RyaW5nW10gPSBbXTtcbiAgbWVzc2FnZXMucHVzaChcIlwiKTtcbiAgbWVzc2FnZXMucHVzaChcIlwiKTtcbiAgbWVzc2FnZXMucHVzaChcbiAgICBgICAgICR7Z3JheShib2xkKFwiW0RpZmZdXCIpKX0gJHtyZWQoYm9sZChcIkFjdHVhbFwiKSl9IC8gJHtcbiAgICAgIGdyZWVuKGJvbGQoXCJFeHBlY3RlZFwiKSlcbiAgICB9YCxcbiAgKTtcbiAgbWVzc2FnZXMucHVzaChcIlwiKTtcbiAgbWVzc2FnZXMucHVzaChcIlwiKTtcbiAgZGlmZlJlc3VsdC5mb3JFYWNoKChyZXN1bHQ6IERpZmZSZXN1bHQ8c3RyaW5nPik6IHZvaWQgPT4ge1xuICAgIGNvbnN0IGMgPSBjcmVhdGVDb2xvcihyZXN1bHQudHlwZSk7XG4gICAgY29uc3QgbGluZSA9IHJlc3VsdC5kZXRhaWxzPy5tYXAoKGRldGFpbCkgPT5cbiAgICAgIGRldGFpbC50eXBlICE9PSBEaWZmVHlwZS5jb21tb25cbiAgICAgICAgPyBjcmVhdGVDb2xvcihkZXRhaWwudHlwZSwgeyBiYWNrZ3JvdW5kOiB0cnVlIH0pKGRldGFpbC52YWx1ZSlcbiAgICAgICAgOiBkZXRhaWwudmFsdWVcbiAgICApLmpvaW4oXCJcIikgPz8gcmVzdWx0LnZhbHVlO1xuICAgIGRpZmZNZXNzYWdlcy5wdXNoKGMoYCR7Y3JlYXRlU2lnbihyZXN1bHQudHlwZSl9JHtsaW5lfWApKTtcbiAgfSk7XG4gIG1lc3NhZ2VzLnB1c2goLi4uKHN0cmluZ0RpZmYgPyBbZGlmZk1lc3NhZ2VzLmpvaW4oXCJcIildIDogZGlmZk1lc3NhZ2VzKSk7XG4gIG1lc3NhZ2VzLnB1c2goXCJcIik7XG5cbiAgcmV0dXJuIG1lc3NhZ2VzO1xufVxuXG5mdW5jdGlvbiBpc0tleWVkQ29sbGVjdGlvbih4OiB1bmtub3duKTogeCBpcyBTZXQ8dW5rbm93bj4ge1xuICByZXR1cm4gW1N5bWJvbC5pdGVyYXRvciwgXCJzaXplXCJdLmV2ZXJ5KChrKSA9PiBrIGluICh4IGFzIFNldDx1bmtub3duPikpO1xufVxuXG4vKipcbiAqIERlZXAgZXF1YWxpdHkgY29tcGFyaXNvbiB1c2VkIGluIGFzc2VydGlvbnNcbiAqIEBwYXJhbSBjIGFjdHVhbCB2YWx1ZVxuICogQHBhcmFtIGQgZXhwZWN0ZWQgdmFsdWVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVxdWFsKGM6IHVua25vd24sIGQ6IHVua25vd24pOiBib29sZWFuIHtcbiAgY29uc3Qgc2VlbiA9IG5ldyBNYXAoKTtcbiAgcmV0dXJuIChmdW5jdGlvbiBjb21wYXJlKGE6IHVua25vd24sIGI6IHVua25vd24pOiBib29sZWFuIHtcbiAgICAvLyBIYXZlIHRvIHJlbmRlciBSZWdFeHAgJiBEYXRlIGZvciBzdHJpbmcgY29tcGFyaXNvblxuICAgIC8vIHVubGVzcyBpdCdzIG1pc3RyZWF0ZWQgYXMgb2JqZWN0XG4gICAgaWYgKFxuICAgICAgYSAmJlxuICAgICAgYiAmJlxuICAgICAgKChhIGluc3RhbmNlb2YgUmVnRXhwICYmIGIgaW5zdGFuY2VvZiBSZWdFeHApIHx8XG4gICAgICAgIChhIGluc3RhbmNlb2YgVVJMICYmIGIgaW5zdGFuY2VvZiBVUkwpKVxuICAgICkge1xuICAgICAgcmV0dXJuIFN0cmluZyhhKSA9PT0gU3RyaW5nKGIpO1xuICAgIH1cbiAgICBpZiAoYSBpbnN0YW5jZW9mIERhdGUgJiYgYiBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIGNvbnN0IGFUaW1lID0gYS5nZXRUaW1lKCk7XG4gICAgICBjb25zdCBiVGltZSA9IGIuZ2V0VGltZSgpO1xuICAgICAgLy8gQ2hlY2sgZm9yIE5hTiBlcXVhbGl0eSBtYW51YWxseSBzaW5jZSBOYU4gaXMgbm90XG4gICAgICAvLyBlcXVhbCB0byBpdHNlbGYuXG4gICAgICBpZiAoTnVtYmVyLmlzTmFOKGFUaW1lKSAmJiBOdW1iZXIuaXNOYU4oYlRpbWUpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGEuZ2V0VGltZSgpID09PSBiLmdldFRpbWUoKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5pcyhhLCBiKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmIChhICYmIHR5cGVvZiBhID09PSBcIm9iamVjdFwiICYmIGIgJiYgdHlwZW9mIGIgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgIGlmIChhICYmIGIgJiYgIWNvbnN0cnVjdG9yc0VxdWFsKGEsIGIpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIGlmIChhIGluc3RhbmNlb2YgV2Vha01hcCB8fCBiIGluc3RhbmNlb2YgV2Vha01hcCkge1xuICAgICAgICBpZiAoIShhIGluc3RhbmNlb2YgV2Vha01hcCAmJiBiIGluc3RhbmNlb2YgV2Vha01hcCkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcImNhbm5vdCBjb21wYXJlIFdlYWtNYXAgaW5zdGFuY2VzXCIpO1xuICAgICAgfVxuICAgICAgaWYgKGEgaW5zdGFuY2VvZiBXZWFrU2V0IHx8IGIgaW5zdGFuY2VvZiBXZWFrU2V0KSB7XG4gICAgICAgIGlmICghKGEgaW5zdGFuY2VvZiBXZWFrU2V0ICYmIGIgaW5zdGFuY2VvZiBXZWFrU2V0KSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwiY2Fubm90IGNvbXBhcmUgV2Vha1NldCBpbnN0YW5jZXNcIik7XG4gICAgICB9XG4gICAgICBpZiAoc2Vlbi5nZXQoYSkgPT09IGIpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgICBpZiAoT2JqZWN0LmtleXMoYSB8fCB7fSkubGVuZ3RoICE9PSBPYmplY3Qua2V5cyhiIHx8IHt9KS5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgaWYgKGlzS2V5ZWRDb2xsZWN0aW9uKGEpICYmIGlzS2V5ZWRDb2xsZWN0aW9uKGIpKSB7XG4gICAgICAgIGlmIChhLnNpemUgIT09IGIuc2l6ZSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB1bm1hdGNoZWRFbnRyaWVzID0gYS5zaXplO1xuXG4gICAgICAgIGZvciAoY29uc3QgW2FLZXksIGFWYWx1ZV0gb2YgYS5lbnRyaWVzKCkpIHtcbiAgICAgICAgICBmb3IgKGNvbnN0IFtiS2V5LCBiVmFsdWVdIG9mIGIuZW50cmllcygpKSB7XG4gICAgICAgICAgICAvKiBHaXZlbiB0aGF0IE1hcCBrZXlzIGNhbiBiZSByZWZlcmVuY2VzLCB3ZSBuZWVkXG4gICAgICAgICAgICAgKiB0byBlbnN1cmUgdGhhdCB0aGV5IGFyZSBhbHNvIGRlZXBseSBlcXVhbCAqL1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAoYUtleSA9PT0gYVZhbHVlICYmIGJLZXkgPT09IGJWYWx1ZSAmJiBjb21wYXJlKGFLZXksIGJLZXkpKSB8fFxuICAgICAgICAgICAgICAoY29tcGFyZShhS2V5LCBiS2V5KSAmJiBjb21wYXJlKGFWYWx1ZSwgYlZhbHVlKSlcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICB1bm1hdGNoZWRFbnRyaWVzLS07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHVubWF0Y2hlZEVudHJpZXMgPT09IDA7XG4gICAgICB9XG4gICAgICBjb25zdCBtZXJnZWQgPSB7IC4uLmEsIC4uLmIgfTtcbiAgICAgIGZvciAoXG4gICAgICAgIGNvbnN0IGtleSBvZiBbXG4gICAgICAgICAgLi4uT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMobWVyZ2VkKSxcbiAgICAgICAgICAuLi5PYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKG1lcmdlZCksXG4gICAgICAgIF1cbiAgICAgICkge1xuICAgICAgICB0eXBlIEtleSA9IGtleW9mIHR5cGVvZiBtZXJnZWQ7XG4gICAgICAgIGlmICghY29tcGFyZShhICYmIGFba2V5IGFzIEtleV0sIGIgJiYgYltrZXkgYXMgS2V5XSkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCgoa2V5IGluIGEpICYmICghKGtleSBpbiBiKSkpIHx8ICgoa2V5IGluIGIpICYmICghKGtleSBpbiBhKSkpKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBzZWVuLnNldChhLCBiKTtcbiAgICAgIGlmIChhIGluc3RhbmNlb2YgV2Vha1JlZiB8fCBiIGluc3RhbmNlb2YgV2Vha1JlZikge1xuICAgICAgICBpZiAoIShhIGluc3RhbmNlb2YgV2Vha1JlZiAmJiBiIGluc3RhbmNlb2YgV2Vha1JlZikpIHJldHVybiBmYWxzZTtcbiAgICAgICAgcmV0dXJuIGNvbXBhcmUoYS5kZXJlZigpLCBiLmRlcmVmKCkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfSkoYywgZCk7XG59XG5cbi8vIGRlbm8tbGludC1pZ25vcmUgYmFuLXR5cGVzXG5mdW5jdGlvbiBjb25zdHJ1Y3RvcnNFcXVhbChhOiBvYmplY3QsIGI6IG9iamVjdCkge1xuICByZXR1cm4gYS5jb25zdHJ1Y3RvciA9PT0gYi5jb25zdHJ1Y3RvciB8fFxuICAgIGEuY29uc3RydWN0b3IgPT09IE9iamVjdCAmJiAhYi5jb25zdHJ1Y3RvciB8fFxuICAgICFhLmNvbnN0cnVjdG9yICYmIGIuY29uc3RydWN0b3IgPT09IE9iamVjdDtcbn1cblxuLyoqIE1ha2UgYW4gYXNzZXJ0aW9uLCBlcnJvciB3aWxsIGJlIHRocm93biBpZiBgZXhwcmAgZG9lcyBub3QgaGF2ZSB0cnV0aHkgdmFsdWUuICovXG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0KGV4cHI6IHVua25vd24sIG1zZyA9IFwiXCIpOiBhc3NlcnRzIGV4cHIge1xuICBpZiAoIWV4cHIpIHtcbiAgICB0aHJvdyBuZXcgQXNzZXJ0aW9uRXJyb3IobXNnKTtcbiAgfVxufVxuXG4vKipcbiAqIE1ha2UgYW4gYXNzZXJ0aW9uIHRoYXQgYGFjdHVhbGAgYW5kIGBleHBlY3RlZGAgYXJlIGVxdWFsLCBkZWVwbHkuIElmIG5vdFxuICogZGVlcGx5IGVxdWFsLCB0aGVuIHRocm93LlxuICpcbiAqIFR5cGUgcGFyYW1ldGVyIGNhbiBiZSBzcGVjaWZpZWQgdG8gZW5zdXJlIHZhbHVlcyB1bmRlciBjb21wYXJpc29uIGhhdmUgdGhlIHNhbWUgdHlwZS5cbiAqIEZvciBleGFtcGxlOlxuICogYGBgdHNcbiAqIGltcG9ydCB7IGFzc2VydEVxdWFscyB9IGZyb20gXCIuL2Fzc2VydHMudHNcIjtcbiAqXG4gKiBhc3NlcnRFcXVhbHM8bnVtYmVyPigxLCAyKVxuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnRFcXVhbHMoXG4gIGFjdHVhbDogdW5rbm93bixcbiAgZXhwZWN0ZWQ6IHVua25vd24sXG4gIG1zZz86IHN0cmluZyxcbik6IHZvaWQ7XG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0RXF1YWxzPFQ+KGFjdHVhbDogVCwgZXhwZWN0ZWQ6IFQsIG1zZz86IHN0cmluZyk6IHZvaWQ7XG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0RXF1YWxzKFxuICBhY3R1YWw6IHVua25vd24sXG4gIGV4cGVjdGVkOiB1bmtub3duLFxuICBtc2c/OiBzdHJpbmcsXG4pOiB2b2lkIHtcbiAgaWYgKGVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxldCBtZXNzYWdlID0gXCJcIjtcbiAgY29uc3QgYWN0dWFsU3RyaW5nID0gX2Zvcm1hdChhY3R1YWwpO1xuICBjb25zdCBleHBlY3RlZFN0cmluZyA9IF9mb3JtYXQoZXhwZWN0ZWQpO1xuICB0cnkge1xuICAgIGNvbnN0IHN0cmluZ0RpZmYgPSAodHlwZW9mIGFjdHVhbCA9PT0gXCJzdHJpbmdcIikgJiZcbiAgICAgICh0eXBlb2YgZXhwZWN0ZWQgPT09IFwic3RyaW5nXCIpO1xuICAgIGNvbnN0IGRpZmZSZXN1bHQgPSBzdHJpbmdEaWZmXG4gICAgICA/IGRpZmZzdHIoYWN0dWFsIGFzIHN0cmluZywgZXhwZWN0ZWQgYXMgc3RyaW5nKVxuICAgICAgOiBkaWZmKGFjdHVhbFN0cmluZy5zcGxpdChcIlxcblwiKSwgZXhwZWN0ZWRTdHJpbmcuc3BsaXQoXCJcXG5cIikpO1xuICAgIGNvbnN0IGRpZmZNc2cgPSBidWlsZE1lc3NhZ2UoZGlmZlJlc3VsdCwgeyBzdHJpbmdEaWZmIH0pLmpvaW4oXCJcXG5cIik7XG4gICAgbWVzc2FnZSA9IGBWYWx1ZXMgYXJlIG5vdCBlcXVhbDpcXG4ke2RpZmZNc2d9YDtcbiAgfSBjYXRjaCB7XG4gICAgbWVzc2FnZSA9IGBcXG4ke3JlZChDQU5fTk9UX0RJU1BMQVkpfSArIFxcblxcbmA7XG4gIH1cbiAgaWYgKG1zZykge1xuICAgIG1lc3NhZ2UgPSBtc2c7XG4gIH1cbiAgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKG1lc3NhZ2UpO1xufVxuXG4vKipcbiAqIE1ha2UgYW4gYXNzZXJ0aW9uIHRoYXQgYGFjdHVhbGAgYW5kIGBleHBlY3RlZGAgYXJlIG5vdCBlcXVhbCwgZGVlcGx5LlxuICogSWYgbm90IHRoZW4gdGhyb3cuXG4gKlxuICogVHlwZSBwYXJhbWV0ZXIgY2FuIGJlIHNwZWNpZmllZCB0byBlbnN1cmUgdmFsdWVzIHVuZGVyIGNvbXBhcmlzb24gaGF2ZSB0aGUgc2FtZSB0eXBlLlxuICogRm9yIGV4YW1wbGU6XG4gKiBgYGB0c1xuICogaW1wb3J0IHsgYXNzZXJ0Tm90RXF1YWxzIH0gZnJvbSBcIi4vYXNzZXJ0cy50c1wiO1xuICpcbiAqIGFzc2VydE5vdEVxdWFsczxudW1iZXI+KDEsIDIpXG4gKiBgYGBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFzc2VydE5vdEVxdWFscyhcbiAgYWN0dWFsOiB1bmtub3duLFxuICBleHBlY3RlZDogdW5rbm93bixcbiAgbXNnPzogc3RyaW5nLFxuKTogdm9pZDtcbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnROb3RFcXVhbHM8VD4oYWN0dWFsOiBULCBleHBlY3RlZDogVCwgbXNnPzogc3RyaW5nKTogdm9pZDtcbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnROb3RFcXVhbHMoXG4gIGFjdHVhbDogdW5rbm93bixcbiAgZXhwZWN0ZWQ6IHVua25vd24sXG4gIG1zZz86IHN0cmluZyxcbik6IHZvaWQge1xuICBpZiAoIWVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxldCBhY3R1YWxTdHJpbmc6IHN0cmluZztcbiAgbGV0IGV4cGVjdGVkU3RyaW5nOiBzdHJpbmc7XG4gIHRyeSB7XG4gICAgYWN0dWFsU3RyaW5nID0gU3RyaW5nKGFjdHVhbCk7XG4gIH0gY2F0Y2gge1xuICAgIGFjdHVhbFN0cmluZyA9IFwiW0Nhbm5vdCBkaXNwbGF5XVwiO1xuICB9XG4gIHRyeSB7XG4gICAgZXhwZWN0ZWRTdHJpbmcgPSBTdHJpbmcoZXhwZWN0ZWQpO1xuICB9IGNhdGNoIHtcbiAgICBleHBlY3RlZFN0cmluZyA9IFwiW0Nhbm5vdCBkaXNwbGF5XVwiO1xuICB9XG4gIGlmICghbXNnKSB7XG4gICAgbXNnID0gYGFjdHVhbDogJHthY3R1YWxTdHJpbmd9IGV4cGVjdGVkOiAke2V4cGVjdGVkU3RyaW5nfWA7XG4gIH1cbiAgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKG1zZyk7XG59XG5cbi8qKlxuICogTWFrZSBhbiBhc3NlcnRpb24gdGhhdCBgYWN0dWFsYCBhbmQgYGV4cGVjdGVkYCBhcmUgc3RyaWN0bHkgZXF1YWwuIElmXG4gKiBub3QgdGhlbiB0aHJvdy5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgYXNzZXJ0U3RyaWN0RXF1YWxzIH0gZnJvbSBcIi4vYXNzZXJ0cy50c1wiO1xuICpcbiAqIGFzc2VydFN0cmljdEVxdWFscygxLCAyKVxuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnRTdHJpY3RFcXVhbHMoXG4gIGFjdHVhbDogdW5rbm93bixcbiAgZXhwZWN0ZWQ6IHVua25vd24sXG4gIG1zZz86IHN0cmluZyxcbik6IHZvaWQ7XG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0U3RyaWN0RXF1YWxzPFQ+KFxuICBhY3R1YWw6IFQsXG4gIGV4cGVjdGVkOiBULFxuICBtc2c/OiBzdHJpbmcsXG4pOiB2b2lkO1xuZXhwb3J0IGZ1bmN0aW9uIGFzc2VydFN0cmljdEVxdWFscyhcbiAgYWN0dWFsOiB1bmtub3duLFxuICBleHBlY3RlZDogdW5rbm93bixcbiAgbXNnPzogc3RyaW5nLFxuKTogdm9pZCB7XG4gIGlmIChhY3R1YWwgPT09IGV4cGVjdGVkKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGV0IG1lc3NhZ2U6IHN0cmluZztcblxuICBpZiAobXNnKSB7XG4gICAgbWVzc2FnZSA9IG1zZztcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBhY3R1YWxTdHJpbmcgPSBfZm9ybWF0KGFjdHVhbCk7XG4gICAgY29uc3QgZXhwZWN0ZWRTdHJpbmcgPSBfZm9ybWF0KGV4cGVjdGVkKTtcblxuICAgIGlmIChhY3R1YWxTdHJpbmcgPT09IGV4cGVjdGVkU3RyaW5nKSB7XG4gICAgICBjb25zdCB3aXRoT2Zmc2V0ID0gYWN0dWFsU3RyaW5nXG4gICAgICAgIC5zcGxpdChcIlxcblwiKVxuICAgICAgICAubWFwKChsKSA9PiBgICAgICR7bH1gKVxuICAgICAgICAuam9pbihcIlxcblwiKTtcbiAgICAgIG1lc3NhZ2UgPVxuICAgICAgICBgVmFsdWVzIGhhdmUgdGhlIHNhbWUgc3RydWN0dXJlIGJ1dCBhcmUgbm90IHJlZmVyZW5jZS1lcXVhbDpcXG5cXG4ke1xuICAgICAgICAgIHJlZCh3aXRoT2Zmc2V0KVxuICAgICAgICB9XFxuYDtcbiAgICB9IGVsc2Uge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc3RyaW5nRGlmZiA9ICh0eXBlb2YgYWN0dWFsID09PSBcInN0cmluZ1wiKSAmJlxuICAgICAgICAgICh0eXBlb2YgZXhwZWN0ZWQgPT09IFwic3RyaW5nXCIpO1xuICAgICAgICBjb25zdCBkaWZmUmVzdWx0ID0gc3RyaW5nRGlmZlxuICAgICAgICAgID8gZGlmZnN0cihhY3R1YWwgYXMgc3RyaW5nLCBleHBlY3RlZCBhcyBzdHJpbmcpXG4gICAgICAgICAgOiBkaWZmKGFjdHVhbFN0cmluZy5zcGxpdChcIlxcblwiKSwgZXhwZWN0ZWRTdHJpbmcuc3BsaXQoXCJcXG5cIikpO1xuICAgICAgICBjb25zdCBkaWZmTXNnID0gYnVpbGRNZXNzYWdlKGRpZmZSZXN1bHQsIHsgc3RyaW5nRGlmZiB9KS5qb2luKFwiXFxuXCIpO1xuICAgICAgICBtZXNzYWdlID0gYFZhbHVlcyBhcmUgbm90IHN0cmljdGx5IGVxdWFsOlxcbiR7ZGlmZk1zZ31gO1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIG1lc3NhZ2UgPSBgXFxuJHtyZWQoQ0FOX05PVF9ESVNQTEFZKX0gKyBcXG5cXG5gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBBc3NlcnRpb25FcnJvcihtZXNzYWdlKTtcbn1cblxuLyoqXG4gKiBNYWtlIGFuIGFzc2VydGlvbiB0aGF0IGBhY3R1YWxgIGFuZCBgZXhwZWN0ZWRgIGFyZSBub3Qgc3RyaWN0bHkgZXF1YWwuXG4gKiBJZiB0aGUgdmFsdWVzIGFyZSBzdHJpY3RseSBlcXVhbCB0aGVuIHRocm93LlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBhc3NlcnROb3RTdHJpY3RFcXVhbHMgfSBmcm9tIFwiLi9hc3NlcnRzLnRzXCI7XG4gKlxuICogYXNzZXJ0Tm90U3RyaWN0RXF1YWxzKDEsIDEpXG4gKiBgYGBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFzc2VydE5vdFN0cmljdEVxdWFscyhcbiAgYWN0dWFsOiB1bmtub3duLFxuICBleHBlY3RlZDogdW5rbm93bixcbiAgbXNnPzogc3RyaW5nLFxuKTogdm9pZDtcbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnROb3RTdHJpY3RFcXVhbHM8VD4oXG4gIGFjdHVhbDogVCxcbiAgZXhwZWN0ZWQ6IFQsXG4gIG1zZz86IHN0cmluZyxcbik6IHZvaWQ7XG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0Tm90U3RyaWN0RXF1YWxzKFxuICBhY3R1YWw6IHVua25vd24sXG4gIGV4cGVjdGVkOiB1bmtub3duLFxuICBtc2c/OiBzdHJpbmcsXG4pOiB2b2lkIHtcbiAgaWYgKGFjdHVhbCAhPT0gZXhwZWN0ZWQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aHJvdyBuZXcgQXNzZXJ0aW9uRXJyb3IoXG4gICAgbXNnID8/IGBFeHBlY3RlZCBcImFjdHVhbFwiIHRvIGJlIHN0cmljdGx5IHVuZXF1YWwgdG86ICR7X2Zvcm1hdChhY3R1YWwpfVxcbmAsXG4gICk7XG59XG5cbi8qKlxuICogTWFrZSBhbiBhc3NlcnRpb24gdGhhdCBhY3R1YWwgaXMgbm90IG51bGwgb3IgdW5kZWZpbmVkLlxuICogSWYgbm90IHRoZW4gdGhyb3cuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnRFeGlzdHM8VD4oXG4gIGFjdHVhbDogVCxcbiAgbXNnPzogc3RyaW5nLFxuKTogYXNzZXJ0cyBhY3R1YWwgaXMgTm9uTnVsbGFibGU8VD4ge1xuICBpZiAoYWN0dWFsID09PSB1bmRlZmluZWQgfHwgYWN0dWFsID09PSBudWxsKSB7XG4gICAgaWYgKCFtc2cpIHtcbiAgICAgIG1zZyA9IGBhY3R1YWw6IFwiJHthY3R1YWx9XCIgZXhwZWN0ZWQgdG8gbm90IGJlIG51bGwgb3IgdW5kZWZpbmVkYDtcbiAgICB9XG4gICAgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKG1zZyk7XG4gIH1cbn1cblxuLyoqXG4gKiBNYWtlIGFuIGFzc2VydGlvbiB0aGF0IGFjdHVhbCBpbmNsdWRlcyBleHBlY3RlZC4gSWYgbm90XG4gKiB0aGVuIHRocm93LlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0U3RyaW5nSW5jbHVkZXMoXG4gIGFjdHVhbDogc3RyaW5nLFxuICBleHBlY3RlZDogc3RyaW5nLFxuICBtc2c/OiBzdHJpbmcsXG4pOiB2b2lkIHtcbiAgaWYgKCFhY3R1YWwuaW5jbHVkZXMoZXhwZWN0ZWQpKSB7XG4gICAgaWYgKCFtc2cpIHtcbiAgICAgIG1zZyA9IGBhY3R1YWw6IFwiJHthY3R1YWx9XCIgZXhwZWN0ZWQgdG8gY29udGFpbjogXCIke2V4cGVjdGVkfVwiYDtcbiAgICB9XG4gICAgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKG1zZyk7XG4gIH1cbn1cblxuLyoqXG4gKiBNYWtlIGFuIGFzc2VydGlvbiB0aGF0IGBhY3R1YWxgIGluY2x1ZGVzIHRoZSBgZXhwZWN0ZWRgIHZhbHVlcy5cbiAqIElmIG5vdCB0aGVuIGFuIGVycm9yIHdpbGwgYmUgdGhyb3duLlxuICpcbiAqIFR5cGUgcGFyYW1ldGVyIGNhbiBiZSBzcGVjaWZpZWQgdG8gZW5zdXJlIHZhbHVlcyB1bmRlciBjb21wYXJpc29uIGhhdmUgdGhlIHNhbWUgdHlwZS5cbiAqIEZvciBleGFtcGxlOlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBhc3NlcnRBcnJheUluY2x1ZGVzIH0gZnJvbSBcIi4vYXNzZXJ0cy50c1wiO1xuICpcbiAqIGFzc2VydEFycmF5SW5jbHVkZXM8bnVtYmVyPihbMSwgMl0sIFsyXSlcbiAqIGBgYFxuICovXG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0QXJyYXlJbmNsdWRlcyhcbiAgYWN0dWFsOiBBcnJheUxpa2U8dW5rbm93bj4sXG4gIGV4cGVjdGVkOiBBcnJheUxpa2U8dW5rbm93bj4sXG4gIG1zZz86IHN0cmluZyxcbik6IHZvaWQ7XG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0QXJyYXlJbmNsdWRlczxUPihcbiAgYWN0dWFsOiBBcnJheUxpa2U8VD4sXG4gIGV4cGVjdGVkOiBBcnJheUxpa2U8VD4sXG4gIG1zZz86IHN0cmluZyxcbik6IHZvaWQ7XG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0QXJyYXlJbmNsdWRlcyhcbiAgYWN0dWFsOiBBcnJheUxpa2U8dW5rbm93bj4sXG4gIGV4cGVjdGVkOiBBcnJheUxpa2U8dW5rbm93bj4sXG4gIG1zZz86IHN0cmluZyxcbik6IHZvaWQge1xuICBjb25zdCBtaXNzaW5nOiB1bmtub3duW10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBleHBlY3RlZC5sZW5ndGg7IGkrKykge1xuICAgIGxldCBmb3VuZCA9IGZhbHNlO1xuICAgIGZvciAobGV0IGogPSAwOyBqIDwgYWN0dWFsLmxlbmd0aDsgaisrKSB7XG4gICAgICBpZiAoZXF1YWwoZXhwZWN0ZWRbaV0sIGFjdHVhbFtqXSkpIHtcbiAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFmb3VuZCkge1xuICAgICAgbWlzc2luZy5wdXNoKGV4cGVjdGVkW2ldKTtcbiAgICB9XG4gIH1cbiAgaWYgKG1pc3NpbmcubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghbXNnKSB7XG4gICAgbXNnID0gYGFjdHVhbDogXCIke19mb3JtYXQoYWN0dWFsKX1cIiBleHBlY3RlZCB0byBpbmNsdWRlOiBcIiR7XG4gICAgICBfZm9ybWF0KGV4cGVjdGVkKVxuICAgIH1cIlxcbm1pc3Npbmc6ICR7X2Zvcm1hdChtaXNzaW5nKX1gO1xuICB9XG4gIHRocm93IG5ldyBBc3NlcnRpb25FcnJvcihtc2cpO1xufVxuXG4vKipcbiAqIE1ha2UgYW4gYXNzZXJ0aW9uIHRoYXQgYGFjdHVhbGAgbWF0Y2ggUmVnRXhwIGBleHBlY3RlZGAuIElmIG5vdFxuICogdGhlbiB0aHJvdy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFzc2VydE1hdGNoKFxuICBhY3R1YWw6IHN0cmluZyxcbiAgZXhwZWN0ZWQ6IFJlZ0V4cCxcbiAgbXNnPzogc3RyaW5nLFxuKTogdm9pZCB7XG4gIGlmICghZXhwZWN0ZWQudGVzdChhY3R1YWwpKSB7XG4gICAgaWYgKCFtc2cpIHtcbiAgICAgIG1zZyA9IGBhY3R1YWw6IFwiJHthY3R1YWx9XCIgZXhwZWN0ZWQgdG8gbWF0Y2g6IFwiJHtleHBlY3RlZH1cImA7XG4gICAgfVxuICAgIHRocm93IG5ldyBBc3NlcnRpb25FcnJvcihtc2cpO1xuICB9XG59XG5cbi8qKlxuICogTWFrZSBhbiBhc3NlcnRpb24gdGhhdCBgYWN0dWFsYCBub3QgbWF0Y2ggUmVnRXhwIGBleHBlY3RlZGAuIElmIG1hdGNoXG4gKiB0aGVuIHRocm93LlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0Tm90TWF0Y2goXG4gIGFjdHVhbDogc3RyaW5nLFxuICBleHBlY3RlZDogUmVnRXhwLFxuICBtc2c/OiBzdHJpbmcsXG4pOiB2b2lkIHtcbiAgaWYgKGV4cGVjdGVkLnRlc3QoYWN0dWFsKSkge1xuICAgIGlmICghbXNnKSB7XG4gICAgICBtc2cgPSBgYWN0dWFsOiBcIiR7YWN0dWFsfVwiIGV4cGVjdGVkIHRvIG5vdCBtYXRjaDogXCIke2V4cGVjdGVkfVwiYDtcbiAgICB9XG4gICAgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKG1zZyk7XG4gIH1cbn1cblxuLyoqXG4gKiBNYWtlIGFuIGFzc2VydGlvbiB0aGF0IGBhY3R1YWxgIG9iamVjdCBpcyBhIHN1YnNldCBvZiBgZXhwZWN0ZWRgIG9iamVjdCwgZGVlcGx5LlxuICogSWYgbm90LCB0aGVuIHRocm93LlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0T2JqZWN0TWF0Y2goXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIGFjdHVhbDogUmVjb3JkPFByb3BlcnR5S2V5LCBhbnk+LFxuICBleHBlY3RlZDogUmVjb3JkPFByb3BlcnR5S2V5LCB1bmtub3duPixcbik6IHZvaWQge1xuICB0eXBlIGxvb3NlID0gUmVjb3JkPFByb3BlcnR5S2V5LCB1bmtub3duPjtcbiAgY29uc3Qgc2VlbiA9IG5ldyBXZWFrTWFwKCk7XG4gIGZ1bmN0aW9uIGZpbHRlcihhOiBsb29zZSwgYjogbG9vc2UpOiBsb29zZSB7XG4gICAgLy8gSWYgdGhlIGFjdHVhbCB2YWx1ZSBpcyBhbiBhcnJheSwgbGV0IGFzc2VydEVxdWFscyBkbyB0aGUgYXNzZXJ0aW9uLlxuICAgIGlmIChBcnJheS5pc0FycmF5KGEpKSB7XG4gICAgICByZXR1cm4gYTtcbiAgICB9XG5cbiAgICAvLyBQcmV2ZW50IGluZmluaXRlIGxvb3Agd2l0aCBjaXJjdWxhciByZWZlcmVuY2VzIHdpdGggc2FtZSBmaWx0ZXJcbiAgICBpZiAoKHNlZW4uaGFzKGEpKSAmJiAoc2Vlbi5nZXQoYSkgPT09IGIpKSB7XG4gICAgICByZXR1cm4gYTtcbiAgICB9XG4gICAgc2Vlbi5zZXQoYSwgYik7XG4gICAgLy8gRmlsdGVyIGtleXMgYW5kIHN5bWJvbHMgd2hpY2ggYXJlIHByZXNlbnQgaW4gYm90aCBhY3R1YWwgYW5kIGV4cGVjdGVkXG4gICAgY29uc3QgZmlsdGVyZWQgPSB7fSBhcyBsb29zZTtcbiAgICBjb25zdCBlbnRyaWVzID0gW1xuICAgICAgLi4uT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMoYSksXG4gICAgICAuLi5PYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKGEpLFxuICAgIF1cbiAgICAgIC5maWx0ZXIoKGtleSkgPT4ga2V5IGluIGIpXG4gICAgICAubWFwKChrZXkpID0+IFtrZXksIGFba2V5IGFzIHN0cmluZ11dKSBhcyBBcnJheTxbc3RyaW5nLCB1bmtub3duXT47XG4gICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgZW50cmllcykge1xuICAgICAgLy8gT24gYXJyYXkgcmVmZXJlbmNlcywgYnVpbGQgYSBmaWx0ZXJlZCBhcnJheSBhbmQgZmlsdGVyIG5lc3RlZCBvYmplY3RzIGluc2lkZVxuICAgICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgIGNvbnN0IHN1YnNldCA9IChiIGFzIGxvb3NlKVtrZXldO1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShzdWJzZXQpKSB7XG4gICAgICAgICAgZmlsdGVyZWRba2V5XSA9IHZhbHVlXG4gICAgICAgICAgICAuc2xpY2UoMCwgc3Vic2V0Lmxlbmd0aClcbiAgICAgICAgICAgIC5tYXAoKGVsZW1lbnQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IHN1YnNldEVsZW1lbnQgPSBzdWJzZXRbaW5kZXhdO1xuICAgICAgICAgICAgICBpZiAoKHR5cGVvZiBzdWJzZXRFbGVtZW50ID09PSBcIm9iamVjdFwiKSAmJiAoc3Vic2V0RWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmlsdGVyKGVsZW1lbnQsIHN1YnNldEVsZW1lbnQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBlbGVtZW50O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgIH0gLy8gT24gbmVzdGVkIG9iamVjdHMgcmVmZXJlbmNlcywgYnVpbGQgYSBmaWx0ZXJlZCBvYmplY3QgcmVjdXJzaXZlbHlcbiAgICAgIGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICBjb25zdCBzdWJzZXQgPSAoYiBhcyBsb29zZSlba2V5XTtcbiAgICAgICAgaWYgKCh0eXBlb2Ygc3Vic2V0ID09PSBcIm9iamVjdFwiKSAmJiAoc3Vic2V0KSkge1xuICAgICAgICAgIGZpbHRlcmVkW2tleV0gPSBmaWx0ZXIodmFsdWUgYXMgbG9vc2UsIHN1YnNldCBhcyBsb29zZSk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGZpbHRlcmVkW2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZpbHRlcmVkO1xuICB9XG4gIHJldHVybiBhc3NlcnRFcXVhbHMoXG4gICAgLy8gZ2V0IHRoZSBpbnRlcnNlY3Rpb24gb2YgXCJhY3R1YWxcIiBhbmQgXCJleHBlY3RlZFwiXG4gICAgLy8gc2lkZSBlZmZlY3Q6IGFsbCB0aGUgaW5zdGFuY2VzJyBjb25zdHJ1Y3RvciBmaWVsZCBpcyBcIk9iamVjdFwiIG5vdy5cbiAgICBmaWx0ZXIoYWN0dWFsLCBleHBlY3RlZCksXG4gICAgLy8gc2V0IChuZXN0ZWQpIGluc3RhbmNlcycgY29uc3RydWN0b3IgZmllbGQgdG8gYmUgXCJPYmplY3RcIiB3aXRob3V0IGNoYW5naW5nIGV4cGVjdGVkIHZhbHVlLlxuICAgIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vZGVub2xhbmQvZGVub19zdGQvcHVsbC8xNDE5XG4gICAgZmlsdGVyKGV4cGVjdGVkLCBleHBlY3RlZCksXG4gICk7XG59XG5cbi8qKlxuICogRm9yY2VmdWxseSB0aHJvd3MgYSBmYWlsZWQgYXNzZXJ0aW9uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmYWlsKG1zZz86IHN0cmluZyk6IG5ldmVyIHtcbiAgYXNzZXJ0KGZhbHNlLCBgRmFpbGVkIGFzc2VydGlvbiR7bXNnID8gYDogJHttc2d9YCA6IFwiLlwifWApO1xufVxuXG4vKipcbiAqIE1ha2UgYW4gYXNzZXJ0aW9uIHRoYXQgYGVycm9yYCBpcyBhbiBgRXJyb3JgLlxuICogSWYgbm90IHRoZW4gYW4gZXJyb3Igd2lsbCBiZSB0aHJvd24uXG4gKiBBbiBlcnJvciBjbGFzcyBhbmQgYSBzdHJpbmcgdGhhdCBzaG91bGQgYmUgaW5jbHVkZWQgaW4gdGhlXG4gKiBlcnJvciBtZXNzYWdlIGNhbiBhbHNvIGJlIGFzc2VydGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0SXNFcnJvcjxFIGV4dGVuZHMgRXJyb3IgPSBFcnJvcj4oXG4gIGVycm9yOiB1bmtub3duLFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBFcnJvckNsYXNzPzogbmV3ICguLi5hcmdzOiBhbnlbXSkgPT4gRSxcbiAgbXNnSW5jbHVkZXM/OiBzdHJpbmcsXG4gIG1zZz86IHN0cmluZyxcbik6IGFzc2VydHMgZXJyb3IgaXMgRSB7XG4gIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yID09PSBmYWxzZSkge1xuICAgIHRocm93IG5ldyBBc3NlcnRpb25FcnJvcihgRXhwZWN0ZWQgXCJlcnJvclwiIHRvIGJlIGFuIEVycm9yIG9iamVjdC5gKTtcbiAgfVxuICBpZiAoRXJyb3JDbGFzcyAmJiAhKGVycm9yIGluc3RhbmNlb2YgRXJyb3JDbGFzcykpIHtcbiAgICBtc2cgPSBgRXhwZWN0ZWQgZXJyb3IgdG8gYmUgaW5zdGFuY2Ugb2YgXCIke0Vycm9yQ2xhc3MubmFtZX1cIiwgYnV0IHdhcyBcIiR7XG4gICAgICB0eXBlb2YgZXJyb3IgPT09IFwib2JqZWN0XCIgPyBlcnJvcj8uY29uc3RydWN0b3I/Lm5hbWUgOiBcIltub3QgYW4gb2JqZWN0XVwiXG4gICAgfVwiJHttc2cgPyBgOiAke21zZ31gIDogXCIuXCJ9YDtcbiAgICB0aHJvdyBuZXcgQXNzZXJ0aW9uRXJyb3IobXNnKTtcbiAgfVxuICBpZiAoXG4gICAgbXNnSW5jbHVkZXMgJiYgKCEoZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikgfHxcbiAgICAgICFzdHJpcENvbG9yKGVycm9yLm1lc3NhZ2UpLmluY2x1ZGVzKHN0cmlwQ29sb3IobXNnSW5jbHVkZXMpKSlcbiAgKSB7XG4gICAgbXNnID0gYEV4cGVjdGVkIGVycm9yIG1lc3NhZ2UgdG8gaW5jbHVkZSBcIiR7bXNnSW5jbHVkZXN9XCIsIGJ1dCBnb3QgXCIke1xuICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBcIltub3QgYW4gRXJyb3JdXCJcbiAgICB9XCIke21zZyA/IGA6ICR7bXNnfWAgOiBcIi5cIn1gO1xuICAgIHRocm93IG5ldyBBc3NlcnRpb25FcnJvcihtc2cpO1xuICB9XG59XG5cbi8qKlxuICogRXhlY3V0ZXMgYSBmdW5jdGlvbiwgZXhwZWN0aW5nIGl0IHRvIHRocm93LiAgSWYgaXQgZG9lcyBub3QsIHRoZW4gaXRcbiAqIHRocm93cy4gQW4gZXJyb3IgY2xhc3MgYW5kIGEgc3RyaW5nIHRoYXQgc2hvdWxkIGJlIGluY2x1ZGVkIGluIHRoZVxuICogZXJyb3IgbWVzc2FnZSBjYW4gYWxzbyBiZSBhc3NlcnRlZC4gT3IgeW91IGNhbiBwYXNzIGFcbiAqIGNhbGxiYWNrIHdoaWNoIHdpbGwgYmUgcGFzc2VkIHRoZSBlcnJvciwgdXN1YWxseSB0byBhcHBseSBzb21lIGN1c3RvbVxuICogYXNzZXJ0aW9ucyBvbiBpdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFzc2VydFRocm93czxFIGV4dGVuZHMgRXJyb3IgPSBFcnJvcj4oXG4gIGZuOiAoKSA9PiB1bmtub3duLFxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBFcnJvckNsYXNzPzogbmV3ICguLi5hcmdzOiBhbnlbXSkgPT4gRSxcbiAgbXNnSW5jbHVkZXM/OiBzdHJpbmcsXG4gIG1zZz86IHN0cmluZyxcbik6IHZvaWQ7XG5leHBvcnQgZnVuY3Rpb24gYXNzZXJ0VGhyb3dzKFxuICBmbjogKCkgPT4gdW5rbm93bixcbiAgZXJyb3JDYWxsYmFjazogKGU6IEVycm9yKSA9PiB1bmtub3duLFxuICBtc2c/OiBzdHJpbmcsXG4pOiB2b2lkO1xuZXhwb3J0IGZ1bmN0aW9uIGFzc2VydFRocm93czxFIGV4dGVuZHMgRXJyb3IgPSBFcnJvcj4oXG4gIGZuOiAoKSA9PiB1bmtub3duLFxuICBlcnJvckNsYXNzT3JDYWxsYmFjaz86XG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICB8IChuZXcgKC4uLmFyZ3M6IGFueVtdKSA9PiBFKVxuICAgIHwgKChlOiBFcnJvcikgPT4gdW5rbm93biksXG4gIG1zZ0luY2x1ZGVzT3JNc2c/OiBzdHJpbmcsXG4gIG1zZz86IHN0cmluZyxcbik6IHZvaWQge1xuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBsZXQgRXJyb3JDbGFzczogKG5ldyAoLi4uYXJnczogYW55W10pID0+IEUpIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICBsZXQgbXNnSW5jbHVkZXM6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgbGV0IGVycm9yQ2FsbGJhY2s7XG4gIGlmIChcbiAgICBlcnJvckNsYXNzT3JDYWxsYmFjayA9PSBudWxsIHx8XG4gICAgZXJyb3JDbGFzc09yQ2FsbGJhY2sucHJvdG90eXBlIGluc3RhbmNlb2YgRXJyb3IgfHxcbiAgICBlcnJvckNsYXNzT3JDYWxsYmFjay5wcm90b3R5cGUgPT09IEVycm9yLnByb3RvdHlwZVxuICApIHtcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIEVycm9yQ2xhc3MgPSBlcnJvckNsYXNzT3JDYWxsYmFjayBhcyBuZXcgKC4uLmFyZ3M6IGFueVtdKSA9PiBFO1xuICAgIG1zZ0luY2x1ZGVzID0gbXNnSW5jbHVkZXNPck1zZztcbiAgICBlcnJvckNhbGxiYWNrID0gbnVsbDtcbiAgfSBlbHNlIHtcbiAgICBlcnJvckNhbGxiYWNrID0gZXJyb3JDbGFzc09yQ2FsbGJhY2sgYXMgKGU6IEVycm9yKSA9PiB1bmtub3duO1xuICAgIG1zZyA9IG1zZ0luY2x1ZGVzT3JNc2c7XG4gIH1cbiAgbGV0IGRvZXNUaHJvdyA9IGZhbHNlO1xuICB0cnkge1xuICAgIGZuKCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPT09IGZhbHNlKSB7XG4gICAgICB0aHJvdyBuZXcgQXNzZXJ0aW9uRXJyb3IoXCJBIG5vbi1FcnJvciBvYmplY3Qgd2FzIHRocm93bi5cIik7XG4gICAgfVxuICAgIGFzc2VydElzRXJyb3IoXG4gICAgICBlcnJvcixcbiAgICAgIEVycm9yQ2xhc3MsXG4gICAgICBtc2dJbmNsdWRlcyxcbiAgICAgIG1zZyxcbiAgICApO1xuICAgIGlmICh0eXBlb2YgZXJyb3JDYWxsYmFjayA9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgIGVycm9yQ2FsbGJhY2soZXJyb3IpO1xuICAgIH1cbiAgICBkb2VzVGhyb3cgPSB0cnVlO1xuICB9XG4gIGlmICghZG9lc1Rocm93KSB7XG4gICAgbXNnID0gYEV4cGVjdGVkIGZ1bmN0aW9uIHRvIHRocm93JHttc2cgPyBgOiAke21zZ31gIDogXCIuXCJ9YDtcbiAgICB0aHJvdyBuZXcgQXNzZXJ0aW9uRXJyb3IobXNnKTtcbiAgfVxufVxuXG4vKipcbiAqIEV4ZWN1dGVzIGEgZnVuY3Rpb24gd2hpY2ggcmV0dXJucyBhIHByb21pc2UsIGV4cGVjdGluZyBpdCB0byB0aHJvdyBvciByZWplY3QuXG4gKiBJZiBpdCBkb2VzIG5vdCwgdGhlbiBpdCB0aHJvd3MuIEFuIGVycm9yIGNsYXNzIGFuZCBhIHN0cmluZyB0aGF0IHNob3VsZCBiZVxuICogaW5jbHVkZWQgaW4gdGhlIGVycm9yIG1lc3NhZ2UgY2FuIGFsc28gYmUgYXNzZXJ0ZWQuIE9yIHlvdSBjYW4gcGFzcyBhXG4gKiBjYWxsYmFjayB3aGljaCB3aWxsIGJlIHBhc3NlZCB0aGUgZXJyb3IsIHVzdWFsbHkgdG8gYXBwbHkgc29tZSBjdXN0b21cbiAqIGFzc2VydGlvbnMgb24gaXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnRSZWplY3RzPEUgZXh0ZW5kcyBFcnJvciA9IEVycm9yPihcbiAgZm46ICgpID0+IFByb21pc2U8dW5rbm93bj4sXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIEVycm9yQ2xhc3M/OiBuZXcgKC4uLmFyZ3M6IGFueVtdKSA9PiBFLFxuICBtc2dJbmNsdWRlcz86IHN0cmluZyxcbiAgbXNnPzogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPjtcbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnRSZWplY3RzKFxuICBmbjogKCkgPT4gUHJvbWlzZTx1bmtub3duPixcbiAgZXJyb3JDYWxsYmFjazogKGU6IEVycm9yKSA9PiB1bmtub3duLFxuICBtc2c/OiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+O1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFzc2VydFJlamVjdHM8RSBleHRlbmRzIEVycm9yID0gRXJyb3I+KFxuICBmbjogKCkgPT4gUHJvbWlzZTx1bmtub3duPixcbiAgZXJyb3JDbGFzc09yQ2FsbGJhY2s/OlxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgfCAobmV3ICguLi5hcmdzOiBhbnlbXSkgPT4gRSlcbiAgICB8ICgoZTogRXJyb3IpID0+IHVua25vd24pLFxuICBtc2dJbmNsdWRlc09yTXNnPzogc3RyaW5nLFxuICBtc2c/OiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgbGV0IEVycm9yQ2xhc3M6IChuZXcgKC4uLmFyZ3M6IGFueVtdKSA9PiBFKSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgbGV0IG1zZ0luY2x1ZGVzOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gIGxldCBlcnJvckNhbGxiYWNrO1xuICBpZiAoXG4gICAgZXJyb3JDbGFzc09yQ2FsbGJhY2sgPT0gbnVsbCB8fFxuICAgIGVycm9yQ2xhc3NPckNhbGxiYWNrLnByb3RvdHlwZSBpbnN0YW5jZW9mIEVycm9yIHx8XG4gICAgZXJyb3JDbGFzc09yQ2FsbGJhY2sucHJvdG90eXBlID09PSBFcnJvci5wcm90b3R5cGVcbiAgKSB7XG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICBFcnJvckNsYXNzID0gZXJyb3JDbGFzc09yQ2FsbGJhY2sgYXMgbmV3ICguLi5hcmdzOiBhbnlbXSkgPT4gRTtcbiAgICBtc2dJbmNsdWRlcyA9IG1zZ0luY2x1ZGVzT3JNc2c7XG4gICAgZXJyb3JDYWxsYmFjayA9IG51bGw7XG4gIH0gZWxzZSB7XG4gICAgZXJyb3JDYWxsYmFjayA9IGVycm9yQ2xhc3NPckNhbGxiYWNrIGFzIChlOiBFcnJvcikgPT4gdW5rbm93bjtcbiAgICBtc2cgPSBtc2dJbmNsdWRlc09yTXNnO1xuICB9XG4gIGxldCBkb2VzVGhyb3cgPSBmYWxzZTtcbiAgdHJ5IHtcbiAgICBhd2FpdCBmbigpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yID09PSBmYWxzZSkge1xuICAgICAgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKFwiQSBub24tRXJyb3Igb2JqZWN0IHdhcyB0aHJvd24gb3IgcmVqZWN0ZWQuXCIpO1xuICAgIH1cbiAgICBhc3NlcnRJc0Vycm9yKFxuICAgICAgZXJyb3IsXG4gICAgICBFcnJvckNsYXNzLFxuICAgICAgbXNnSW5jbHVkZXMsXG4gICAgICBtc2csXG4gICAgKTtcbiAgICBpZiAodHlwZW9mIGVycm9yQ2FsbGJhY2sgPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICBlcnJvckNhbGxiYWNrKGVycm9yKTtcbiAgICB9XG4gICAgZG9lc1Rocm93ID0gdHJ1ZTtcbiAgfVxuICBpZiAoIWRvZXNUaHJvdykge1xuICAgIG1zZyA9IGBFeHBlY3RlZCBmdW5jdGlvbiB0byB0aHJvdyR7bXNnID8gYDogJHttc2d9YCA6IFwiLlwifWA7XG4gICAgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKG1zZyk7XG4gIH1cbn1cblxuLyoqIFVzZSB0aGlzIHRvIHN0dWIgb3V0IG1ldGhvZHMgdGhhdCB3aWxsIHRocm93IHdoZW4gaW52b2tlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1bmltcGxlbWVudGVkKG1zZz86IHN0cmluZyk6IG5ldmVyIHtcbiAgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKG1zZyB8fCBcInVuaW1wbGVtZW50ZWRcIik7XG59XG5cbi8qKiBVc2UgdGhpcyB0byBhc3NlcnQgdW5yZWFjaGFibGUgY29kZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1bnJlYWNoYWJsZSgpOiBuZXZlciB7XG4gIHRocm93IG5ldyBBc3NlcnRpb25FcnJvcihcInVucmVhY2hhYmxlXCIpO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLEVBQTBFLEFBQTFFLHdFQUEwRTtBQUMxRSxFQUE4RSxBQUE5RSw0RUFBOEU7QUFDOUUsRUFBMkMsQUFBM0MseUNBQTJDO0FBRTNDLE1BQU0sR0FDSixPQUFPLEVBQ1AsS0FBSyxFQUNMLElBQUksRUFDSixJQUFJLEVBQ0osS0FBSyxFQUNMLEdBQUcsRUFDSCxVQUFVLEVBQ1YsS0FBSyxRQUNBLENBQWtCO0FBQ3pCLE1BQU0sR0FBRyxJQUFJLEVBQWMsT0FBTyxFQUFFLFFBQVEsUUFBUSxDQUFZO0FBRWhFLEtBQUssQ0FBQyxlQUFlLEdBQUcsQ0FBa0I7QUFFMUMsTUFBTSxPQUFPLGNBQWMsU0FBUyxLQUFLO0lBQ3ZDLElBQUksR0FBRyxDQUFnQjtnQkFDWCxPQUFlLENBQUUsQ0FBQztRQUM1QixLQUFLLENBQUMsT0FBTztJQUNmLENBQUM7O0FBR0gsRUFJRyxBQUpIOzs7O0NBSUcsQUFKSCxFQUlHLENBQ0gsTUFBTSxVQUFVLE9BQU8sQ0FBQyxDQUFVLEVBQVUsQ0FBQztJQUMzQyxFQUFtQyxBQUFuQyxpQ0FBbUM7SUFDbkMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUMsQ0FBQyxHQUFHLFVBQVU7SUFDM0IsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsT0FBTyxLQUFLLENBQVUsWUFD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