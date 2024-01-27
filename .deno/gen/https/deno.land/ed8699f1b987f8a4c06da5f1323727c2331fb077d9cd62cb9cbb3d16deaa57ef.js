// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright Joyent and Node contributors. All rights reserved. MIT license.
// deno-lint-ignore-file
import { isAnyArrayBuffer, isArrayBufferView, isBigIntObject, isBooleanObject, isBoxedPrimitive, isDate, isFloat32Array, isFloat64Array, isMap, isNativeError, isNumberObject, isRegExp, isSet, isStringObject, isSymbolObject, isTypedArray } from "./types.ts";
import { Buffer } from "../../_buffer.mjs";
import { getOwnNonIndexProperties, ONLY_ENUMERABLE, SKIP_SYMBOLS } from "../../internal_binding/util.ts";
var valueType;
(function(valueType) {
    valueType[valueType["noIterator"] = 0] = "noIterator";
    valueType[valueType["isArray"] = 1] = "isArray";
    valueType[valueType["isSet"] = 2] = "isSet";
    valueType[valueType["isMap"] = 3] = "isMap";
})(valueType || (valueType = {}));
let memo;
export function isDeepStrictEqual(val1, val2) {
    return innerDeepEqual(val1, val2, true);
}
export function isDeepEqual(val1, val2) {
    return innerDeepEqual(val1, val2, false);
}
function innerDeepEqual(val1, val2, strict, memos = memo) {
    // Basic case covered by Strict Equality Comparison
    if (val1 === val2) {
        if (val1 !== 0) return true;
        return strict ? Object.is(val1, val2) : true;
    }
    if (strict) {
        // Cases where the values are not objects
        // If both values are Not a Number NaN
        if (typeof val1 !== "object") {
            return typeof val1 === "number" && Number.isNaN(val1) && Number.isNaN(val2);
        }
        // If either value is null
        if (typeof val2 !== "object" || val1 === null || val2 === null) {
            return false;
        }
        // If the prototype are not the same
        if (Object.getPrototypeOf(val1) !== Object.getPrototypeOf(val2)) {
            return false;
        }
    } else {
        // Non strict case where values are either null or NaN
        if (val1 === null || typeof val1 !== "object") {
            if (val2 === null || typeof val2 !== "object") {
                return val1 == val2 || Number.isNaN(val1) && Number.isNaN(val2);
            }
            return false;
        }
        if (val2 === null || typeof val2 !== "object") {
            return false;
        }
    }
    const val1Tag = Object.prototype.toString.call(val1);
    const val2Tag = Object.prototype.toString.call(val2);
    // prototype must be Strictly Equal
    if (val1Tag !== val2Tag) {
        return false;
    }
    // handling when values are array
    if (Array.isArray(val1)) {
        // quick rejection cases
        if (!Array.isArray(val2) || val1.length !== val2.length) {
            return false;
        }
        const filter = strict ? ONLY_ENUMERABLE : ONLY_ENUMERABLE | SKIP_SYMBOLS;
        const keys1 = getOwnNonIndexProperties(val1, filter);
        const keys2 = getOwnNonIndexProperties(val2, filter);
        if (keys1.length !== keys2.length) {
            return false;
        }
        return keyCheck(val1, val2, strict, memos, valueType.isArray, keys1);
    } else if (val1Tag === "[object Object]") {
        return keyCheck(val1, val2, strict, memos, valueType.noIterator);
    } else if (val1 instanceof Date) {
        if (!(val2 instanceof Date) || val1.getTime() !== val2.getTime()) {
            return false;
        }
    } else if (val1 instanceof RegExp) {
        if (!(val2 instanceof RegExp) || !areSimilarRegExps(val1, val2)) {
            return false;
        }
    } else if (isNativeError(val1) || val1 instanceof Error) {
        // stack may or may not be same, hence it shouldn't be compared
        if (// How to handle the type errors here
        (!isNativeError(val2) && !(val2 instanceof Error)) || val1.message !== val2.message || val1.name !== val2.name) {
            return false;
        }
    } else if (isArrayBufferView(val1)) {
        const TypedArrayPrototypeGetSymbolToStringTag = (val)=>Object.getOwnPropertySymbols(val).map((item)=>item.toString()).toString();
        if (isTypedArray(val1) && isTypedArray(val2) && TypedArrayPrototypeGetSymbolToStringTag(val1) !== TypedArrayPrototypeGetSymbolToStringTag(val2)) {
            return false;
        }
        if (!strict && (isFloat32Array(val1) || isFloat64Array(val1))) {
            if (!areSimilarFloatArrays(val1, val2)) {
                return false;
            }
        } else if (!areSimilarTypedArrays(val1, val2)) {
            return false;
        }
        const filter1 = strict ? ONLY_ENUMERABLE : ONLY_ENUMERABLE | SKIP_SYMBOLS;
        const keysVal1 = getOwnNonIndexProperties(val1, filter1);
        const keysVal2 = getOwnNonIndexProperties(val2, filter1);
        if (keysVal1.length !== keysVal2.length) {
            return false;
        }
        return keyCheck(val1, val2, strict, memos, valueType.noIterator, keysVal1);
    } else if (isSet(val1)) {
        if (!isSet(val2) || val1.size !== val2.size) {
            return false;
        }
        return keyCheck(val1, val2, strict, memos, valueType.isSet);
    } else if (isMap(val1)) {
        if (!isMap(val2) || val1.size !== val2.size) {
            return false;
        }
        return keyCheck(val1, val2, strict, memos, valueType.isMap);
    } else if (isAnyArrayBuffer(val1)) {
        if (!isAnyArrayBuffer(val2) || !areEqualArrayBuffers(val1, val2)) {
            return false;
        }
    } else if (isBoxedPrimitive(val1)) {
        if (!isEqualBoxedPrimitive(val1, val2)) {
            return false;
        }
    } else if (Array.isArray(val2) || isArrayBufferView(val2) || isSet(val2) || isMap(val2) || isDate(val2) || isRegExp(val2) || isAnyArrayBuffer(val2) || isBoxedPrimitive(val2) || isNativeError(val2) || val2 instanceof Error) {
        return false;
    }
    return keyCheck(val1, val2, strict, memos, valueType.noIterator);
}
function keyCheck(val1, val2, strict, memos, iterationType, aKeys = []) {
    if (arguments.length === 5) {
        aKeys = Object.keys(val1);
        const bKeys = Object.keys(val2);
        // The pair must have the same number of owned properties.
        if (aKeys.length !== bKeys.length) {
            return false;
        }
    }
    // Cheap key test
    let i = 0;
    for(; i < aKeys.length; i++){
        if (!val2.propertyIsEnumerable(aKeys[i])) {
            return false;
        }
    }
    if (strict && arguments.length === 5) {
        const symbolKeysA = Object.getOwnPropertySymbols(val1);
        if (symbolKeysA.length !== 0) {
            let count = 0;
            for(i = 0; i < symbolKeysA.length; i++){
                const key = symbolKeysA[i];
                if (val1.propertyIsEnumerable(key)) {
                    if (!val2.propertyIsEnumerable(key)) {
                        return false;
                    }
                    // added toString here
                    aKeys.push(key.toString());
                    count++;
                } else if (val2.propertyIsEnumerable(key)) {
                    return false;
                }
            }
            const symbolKeysB = Object.getOwnPropertySymbols(val2);
            if (symbolKeysA.length !== symbolKeysB.length && getEnumerables(val2, symbolKeysB).length !== count) {
                return false;
            }
        } else {
            const symbolKeysB1 = Object.getOwnPropertySymbols(val2);
            if (symbolKeysB1.length !== 0 && getEnumerables(val2, symbolKeysB1).length !== 0) {
                return false;
            }
        }
    }
    if (aKeys.length === 0 && (iterationType === valueType.noIterator || iterationType === valueType.isArray && val1.length === 0 || val1.size === 0)) {
        return true;
    }
    if (memos === undefined) {
        memos = {
            val1: new Map(),
            val2: new Map(),
            position: 0
        };
    } else {
        const val2MemoA = memos.val1.get(val1);
        if (val2MemoA !== undefined) {
            const val2MemoB = memos.val2.get(val2);
            if (val2MemoB !== undefined) {
                return val2MemoA === val2MemoB;
            }
        }
        memos.position++;
    }
    memos.val1.set(val1, memos.position);
    memos.val2.set(val2, memos.position);
    const areEq = objEquiv(val1, val2, strict, aKeys, memos, iterationType);
    memos.val1.delete(val1);
    memos.val2.delete(val2);
    return areEq;
}
function areSimilarRegExps(a, b) {
    return a.source === b.source && a.flags === b.flags && a.lastIndex === b.lastIndex;
}
// TODO(standvpmnt): add type for arguments
function areSimilarFloatArrays(arr1, arr2) {
    if (arr1.byteLength !== arr2.byteLength) {
        return false;
    }
    for(let i = 0; i < arr1.byteLength; i++){
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }
    return true;
}
// TODO(standvpmnt): add type for arguments
function areSimilarTypedArrays(arr1, arr2) {
    if (arr1.byteLength !== arr2.byteLength) {
        return false;
    }
    return Buffer.compare(new Uint8Array(arr1.buffer, arr1.byteOffset, arr1.byteLength), new Uint8Array(arr2.buffer, arr2.byteOffset, arr2.byteLength)) === 0;
}
// TODO(standvpmnt): add type for arguments
function areEqualArrayBuffers(buf1, buf2) {
    return buf1.byteLength === buf2.byteLength && Buffer.compare(new Uint8Array(buf1), new Uint8Array(buf2)) === 0;
}
// TODO(standvpmnt):  this check of getOwnPropertySymbols and getOwnPropertyNames
// length is sufficient to handle the current test case, however this will fail
// to catch a scenario wherein the getOwnPropertySymbols and getOwnPropertyNames
// length is the same(will be very contrived but a possible shortcoming
function isEqualBoxedPrimitive(a, b) {
    if (Object.getOwnPropertyNames(a).length !== Object.getOwnPropertyNames(b).length) {
        return false;
    }
    if (Object.getOwnPropertySymbols(a).length !== Object.getOwnPropertySymbols(b).length) {
        return false;
    }
    if (isNumberObject(a)) {
        return isNumberObject(b) && Object.is(Number.prototype.valueOf.call(a), Number.prototype.valueOf.call(b));
    }
    if (isStringObject(a)) {
        return isStringObject(b) && String.prototype.valueOf.call(a) === String.prototype.valueOf.call(b);
    }
    if (isBooleanObject(a)) {
        return isBooleanObject(b) && Boolean.prototype.valueOf.call(a) === Boolean.prototype.valueOf.call(b);
    }
    if (isBigIntObject(a)) {
        return isBigIntObject(b) && BigInt.prototype.valueOf.call(a) === BigInt.prototype.valueOf.call(b);
    }
    if (isSymbolObject(a)) {
        return isSymbolObject(b) && Symbol.prototype.valueOf.call(a) === Symbol.prototype.valueOf.call(b);
    }
    // assert.fail(`Unknown boxed type ${val1}`);
    // return false;
    throw Error(`Unknown boxed type`);
}
function getEnumerables(val, keys) {
    return keys.filter((key)=>val.propertyIsEnumerable(key));
}
function objEquiv(obj1, obj2, strict, keys, memos, iterationType) {
    let i = 0;
    if (iterationType === valueType.isSet) {
        if (!setEquiv(obj1, obj2, strict, memos)) {
            return false;
        }
    } else if (iterationType === valueType.isMap) {
        if (!mapEquiv(obj1, obj2, strict, memos)) {
            return false;
        }
    } else if (iterationType === valueType.isArray) {
        for(; i < obj1.length; i++){
            if (obj1.hasOwnProperty(i)) {
                if (!obj2.hasOwnProperty(i) || !innerDeepEqual(obj1[i], obj2[i], strict, memos)) {
                    return false;
                }
            } else if (obj2.hasOwnProperty(i)) {
                return false;
            } else {
                const keys1 = Object.keys(obj1);
                for(; i < keys1.length; i++){
                    const key = keys1[i];
                    if (!obj2.hasOwnProperty(key) || !innerDeepEqual(obj1[key], obj2[key], strict, memos)) {
                        return false;
                    }
                }
                if (keys1.length !== Object.keys(obj2).length) {
                    return false;
                }
                if (keys1.length !== Object.keys(obj2).length) {
                    return false;
                }
                return true;
            }
        }
    }
    // Expensive test
    for(i = 0; i < keys.length; i++){
        const key1 = keys[i];
        if (!innerDeepEqual(obj1[key1], obj2[key1], strict, memos)) {
            return false;
        }
    }
    return true;
}
function findLooseMatchingPrimitives(primitive) {
    switch(typeof primitive){
        case "undefined":
            return null;
        case "object":
            return undefined;
        case "symbol":
            return false;
        case "string":
            primitive = +primitive;
        case "number":
            if (Number.isNaN(primitive)) {
                return false;
            }
    }
    return true;
}
function setMightHaveLoosePrim(set1, set2, primitive) {
    const altValue = findLooseMatchingPrimitives(primitive);
    if (altValue != null) return altValue;
    return set2.has(altValue) && !set1.has(altValue);
}
function setHasEqualElement(set, val1, strict, memos) {
    for (const val2 of set){
        if (innerDeepEqual(val1, val2, strict, memos)) {
            set.delete(val2);
            return true;
        }
    }
    return false;
}
function setEquiv(set1, set2, strict, memos) {
    let set = null;
    for (const item of set1){
        if (typeof item === "object" && item !== null) {
            if (set === null) {
                // What is SafeSet from primordials?
                // set = new SafeSet();
                set = new Set();
            }
            set.add(item);
        } else if (!set2.has(item)) {
            if (strict) return false;
            if (!setMightHaveLoosePrim(set1, set2, item)) {
                return false;
            }
            if (set === null) {
                set = new Set();
            }
            set.add(item);
        }
    }
    if (set !== null) {
        for (const item1 of set2){
            if (typeof item1 === "object" && item1 !== null) {
                if (!setHasEqualElement(set, item1, strict, memos)) return false;
            } else if (!strict && !set1.has(item1) && !setHasEqualElement(set, item1, strict, memos)) {
                return false;
            }
        }
        return set.size === 0;
    }
    return true;
}
// TODO(standvpmnt): add types for argument
function mapMightHaveLoosePrimitive(map1, map2, primitive, item, memos) {
    const altValue = findLooseMatchingPrimitives(primitive);
    if (altValue != null) {
        return altValue;
    }
    const curB = map2.get(altValue);
    if (curB === undefined && !map2.has(altValue) || !innerDeepEqual(item, curB, false, memo)) {
        return false;
    }
    return !map1.has(altValue) && innerDeepEqual(item, curB, false, memos);
}
function mapEquiv(map1, map2, strict, memos) {
    let set = null;
    for (const { 0: key , 1: item1  } of map1){
        if (typeof key === "object" && key !== null) {
            if (set === null) {
                set = new Set();
            }
            set.add(key);
        } else {
            const item2 = map2.get(key);
            if (item2 === undefined && !map2.has(key) || !innerDeepEqual(item1, item2, strict, memos)) {
                if (strict) return false;
                if (!mapMightHaveLoosePrimitive(map1, map2, key, item1, memos)) {
                    return false;
                }
                if (set === null) {
                    set = new Set();
                }
                set.add(key);
            }
        }
    }
    if (set !== null) {
        for (const { 0: key1 , 1: item  } of map2){
            if (typeof key1 === "object" && key1 !== null) {
                if (!mapHasEqualEntry(set, map1, key1, item, strict, memos)) {
                    return false;
                }
            } else if (!strict && (!map1.has(key1) || !innerDeepEqual(map1.get(key1), item, false, memos)) && !mapHasEqualEntry(set, map1, key1, item, false, memos)) {
                return false;
            }
        }
        return set.size === 0;
    }
    return true;
}
function mapHasEqualEntry(set, map, key1, item1, strict, memos) {
    for (const key2 of set){
        if (innerDeepEqual(key1, key2, strict, memos) && innerDeepEqual(item1, map.get(key2), strict, memos)) {
            set.delete(key2);
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvaW50ZXJuYWwvdXRpbC9jb21wYXJpc29ucy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IEpveWVudCBhbmQgTm9kZSBjb250cmlidXRvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG4vLyBkZW5vLWxpbnQtaWdub3JlLWZpbGVcbmltcG9ydCB7XG4gIGlzQW55QXJyYXlCdWZmZXIsXG4gIGlzQXJyYXlCdWZmZXJWaWV3LFxuICBpc0JpZ0ludE9iamVjdCxcbiAgaXNCb29sZWFuT2JqZWN0LFxuICBpc0JveGVkUHJpbWl0aXZlLFxuICBpc0RhdGUsXG4gIGlzRmxvYXQzMkFycmF5LFxuICBpc0Zsb2F0NjRBcnJheSxcbiAgaXNNYXAsXG4gIGlzTmF0aXZlRXJyb3IsXG4gIGlzTnVtYmVyT2JqZWN0LFxuICBpc1JlZ0V4cCxcbiAgaXNTZXQsXG4gIGlzU3RyaW5nT2JqZWN0LFxuICBpc1N5bWJvbE9iamVjdCxcbiAgaXNUeXBlZEFycmF5LFxufSBmcm9tIFwiLi90eXBlcy50c1wiO1xuXG5pbXBvcnQgeyBCdWZmZXIgfSBmcm9tIFwiLi4vLi4vX2J1ZmZlci5tanNcIjtcbmltcG9ydCB7XG4gIGdldE93bk5vbkluZGV4UHJvcGVydGllcyxcbiAgT05MWV9FTlVNRVJBQkxFLFxuICBTS0lQX1NZTUJPTFMsXG59IGZyb20gXCIuLi8uLi9pbnRlcm5hbF9iaW5kaW5nL3V0aWwudHNcIjtcblxuZW51bSB2YWx1ZVR5cGUge1xuICBub0l0ZXJhdG9yLFxuICBpc0FycmF5LFxuICBpc1NldCxcbiAgaXNNYXAsXG59XG5cbmludGVyZmFjZSBNZW1vIHtcbiAgdmFsMTogTWFwPHVua25vd24sIHVua25vd24+O1xuICB2YWwyOiBNYXA8dW5rbm93biwgdW5rbm93bj47XG4gIHBvc2l0aW9uOiBudW1iZXI7XG59XG5sZXQgbWVtbzogTWVtbztcblxuZXhwb3J0IGZ1bmN0aW9uIGlzRGVlcFN0cmljdEVxdWFsKHZhbDE6IHVua25vd24sIHZhbDI6IHVua25vd24pOiBib29sZWFuIHtcbiAgcmV0dXJuIGlubmVyRGVlcEVxdWFsKHZhbDEsIHZhbDIsIHRydWUpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGlzRGVlcEVxdWFsKHZhbDE6IHVua25vd24sIHZhbDI6IHVua25vd24pOiBib29sZWFuIHtcbiAgcmV0dXJuIGlubmVyRGVlcEVxdWFsKHZhbDEsIHZhbDIsIGZhbHNlKTtcbn1cblxuZnVuY3Rpb24gaW5uZXJEZWVwRXF1YWwoXG4gIHZhbDE6IHVua25vd24sXG4gIHZhbDI6IHVua25vd24sXG4gIHN0cmljdDogYm9vbGVhbixcbiAgbWVtb3MgPSBtZW1vLFxuKTogYm9vbGVhbiB7XG4gIC8vIEJhc2ljIGNhc2UgY292ZXJlZCBieSBTdHJpY3QgRXF1YWxpdHkgQ29tcGFyaXNvblxuICBpZiAodmFsMSA9PT0gdmFsMikge1xuICAgIGlmICh2YWwxICE9PSAwKSByZXR1cm4gdHJ1ZTtcbiAgICByZXR1cm4gc3RyaWN0ID8gT2JqZWN0LmlzKHZhbDEsIHZhbDIpIDogdHJ1ZTtcbiAgfVxuICBpZiAoc3RyaWN0KSB7XG4gICAgLy8gQ2FzZXMgd2hlcmUgdGhlIHZhbHVlcyBhcmUgbm90IG9iamVjdHNcbiAgICAvLyBJZiBib3RoIHZhbHVlcyBhcmUgTm90IGEgTnVtYmVyIE5hTlxuICAgIGlmICh0eXBlb2YgdmFsMSAhPT0gXCJvYmplY3RcIikge1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgdHlwZW9mIHZhbDEgPT09IFwibnVtYmVyXCIgJiYgTnVtYmVyLmlzTmFOKHZhbDEpICYmIE51bWJlci5pc05hTih2YWwyKVxuICAgICAgKTtcbiAgICB9XG4gICAgLy8gSWYgZWl0aGVyIHZhbHVlIGlzIG51bGxcbiAgICBpZiAodHlwZW9mIHZhbDIgIT09IFwib2JqZWN0XCIgfHwgdmFsMSA9PT0gbnVsbCB8fCB2YWwyID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIElmIHRoZSBwcm90b3R5cGUgYXJlIG5vdCB0aGUgc2FtZVxuICAgIGlmIChPYmplY3QuZ2V0UHJvdG90eXBlT2YodmFsMSkgIT09IE9iamVjdC5nZXRQcm90b3R5cGVPZih2YWwyKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICAvLyBOb24gc3RyaWN0IGNhc2Ugd2hlcmUgdmFsdWVzIGFyZSBlaXRoZXIgbnVsbCBvciBOYU5cbiAgICBpZiAodmFsMSA9PT0gbnVsbCB8fCB0eXBlb2YgdmFsMSAhPT0gXCJvYmplY3RcIikge1xuICAgICAgaWYgKHZhbDIgPT09IG51bGwgfHwgdHlwZW9mIHZhbDIgIT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgcmV0dXJuIHZhbDEgPT0gdmFsMiB8fCAoTnVtYmVyLmlzTmFOKHZhbDEpICYmIE51bWJlci5pc05hTih2YWwyKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICh2YWwyID09PSBudWxsIHx8IHR5cGVvZiB2YWwyICE9PSBcIm9iamVjdFwiKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgdmFsMVRhZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWwxKTtcbiAgY29uc3QgdmFsMlRhZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWwyKTtcblxuICAvLyBwcm90b3R5cGUgbXVzdCBiZSBTdHJpY3RseSBFcXVhbFxuICBpZiAoXG4gICAgdmFsMVRhZyAhPT0gdmFsMlRhZ1xuICApIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvLyBoYW5kbGluZyB3aGVuIHZhbHVlcyBhcmUgYXJyYXlcbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsMSkpIHtcbiAgICAvLyBxdWljayByZWplY3Rpb24gY2FzZXNcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkodmFsMikgfHwgdmFsMS5sZW5ndGggIT09IHZhbDIubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGZpbHRlciA9IHN0cmljdCA/IE9OTFlfRU5VTUVSQUJMRSA6IE9OTFlfRU5VTUVSQUJMRSB8IFNLSVBfU1lNQk9MUztcbiAgICBjb25zdCBrZXlzMSA9IGdldE93bk5vbkluZGV4UHJvcGVydGllcyh2YWwxLCBmaWx0ZXIpO1xuICAgIGNvbnN0IGtleXMyID0gZ2V0T3duTm9uSW5kZXhQcm9wZXJ0aWVzKHZhbDIsIGZpbHRlcik7XG4gICAgaWYgKGtleXMxLmxlbmd0aCAhPT0ga2V5czIubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBrZXlDaGVjayh2YWwxLCB2YWwyLCBzdHJpY3QsIG1lbW9zLCB2YWx1ZVR5cGUuaXNBcnJheSwga2V5czEpO1xuICB9IGVsc2UgaWYgKHZhbDFUYWcgPT09IFwiW29iamVjdCBPYmplY3RdXCIpIHtcbiAgICByZXR1cm4ga2V5Q2hlY2soXG4gICAgICB2YWwxIGFzIG9iamVjdCxcbiAgICAgIHZhbDIgYXMgb2JqZWN0LFxuICAgICAgc3RyaWN0LFxuICAgICAgbWVtb3MsXG4gICAgICB2YWx1ZVR5cGUubm9JdGVyYXRvcixcbiAgICApO1xuICB9IGVsc2UgaWYgKHZhbDEgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgaWYgKCEodmFsMiBpbnN0YW5jZW9mIERhdGUpIHx8IHZhbDEuZ2V0VGltZSgpICE9PSB2YWwyLmdldFRpbWUoKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfSBlbHNlIGlmICh2YWwxIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgaWYgKCEodmFsMiBpbnN0YW5jZW9mIFJlZ0V4cCkgfHwgIWFyZVNpbWlsYXJSZWdFeHBzKHZhbDEsIHZhbDIpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9IGVsc2UgaWYgKGlzTmF0aXZlRXJyb3IodmFsMSkgfHwgdmFsMSBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgLy8gc3RhY2sgbWF5IG9yIG1heSBub3QgYmUgc2FtZSwgaGVuY2UgaXQgc2hvdWxkbid0IGJlIGNvbXBhcmVkXG4gICAgaWYgKFxuICAgICAgLy8gSG93IHRvIGhhbmRsZSB0aGUgdHlwZSBlcnJvcnMgaGVyZVxuICAgICAgKCFpc05hdGl2ZUVycm9yKHZhbDIpICYmICEodmFsMiBpbnN0YW5jZW9mIEVycm9yKSkgfHxcbiAgICAgICh2YWwxIGFzIEVycm9yKS5tZXNzYWdlICE9PSAodmFsMiBhcyBFcnJvcikubWVzc2FnZSB8fFxuICAgICAgKHZhbDEgYXMgRXJyb3IpLm5hbWUgIT09ICh2YWwyIGFzIEVycm9yKS5uYW1lXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9IGVsc2UgaWYgKGlzQXJyYXlCdWZmZXJWaWV3KHZhbDEpKSB7XG4gICAgY29uc3QgVHlwZWRBcnJheVByb3RvdHlwZUdldFN5bWJvbFRvU3RyaW5nVGFnID0gKHZhbDogW10pID0+XG4gICAgICBPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKHZhbClcbiAgICAgICAgLm1hcCgoaXRlbSkgPT4gaXRlbS50b1N0cmluZygpKVxuICAgICAgICAudG9TdHJpbmcoKTtcbiAgICBpZiAoXG4gICAgICBpc1R5cGVkQXJyYXkodmFsMSkgJiZcbiAgICAgIGlzVHlwZWRBcnJheSh2YWwyKSAmJlxuICAgICAgKFR5cGVkQXJyYXlQcm90b3R5cGVHZXRTeW1ib2xUb1N0cmluZ1RhZyh2YWwxIGFzIFtdKSAhPT1cbiAgICAgICAgVHlwZWRBcnJheVByb3RvdHlwZUdldFN5bWJvbFRvU3RyaW5nVGFnKHZhbDIgYXMgW10pKVxuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGlmICghc3RyaWN0ICYmIChpc0Zsb2F0MzJBcnJheSh2YWwxKSB8fCBpc0Zsb2F0NjRBcnJheSh2YWwxKSkpIHtcbiAgICAgIGlmICghYXJlU2ltaWxhckZsb2F0QXJyYXlzKHZhbDEsIHZhbDIpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKCFhcmVTaW1pbGFyVHlwZWRBcnJheXModmFsMSwgdmFsMikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgZmlsdGVyID0gc3RyaWN0ID8gT05MWV9FTlVNRVJBQkxFIDogT05MWV9FTlVNRVJBQkxFIHwgU0tJUF9TWU1CT0xTO1xuICAgIGNvbnN0IGtleXNWYWwxID0gZ2V0T3duTm9uSW5kZXhQcm9wZXJ0aWVzKHZhbDEgYXMgb2JqZWN0LCBmaWx0ZXIpO1xuICAgIGNvbnN0IGtleXNWYWwyID0gZ2V0T3duTm9uSW5kZXhQcm9wZXJ0aWVzKHZhbDIgYXMgb2JqZWN0LCBmaWx0ZXIpO1xuICAgIGlmIChrZXlzVmFsMS5sZW5ndGggIT09IGtleXNWYWwyLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4ga2V5Q2hlY2soXG4gICAgICB2YWwxIGFzIG9iamVjdCxcbiAgICAgIHZhbDIgYXMgb2JqZWN0LFxuICAgICAgc3RyaWN0LFxuICAgICAgbWVtb3MsXG4gICAgICB2YWx1ZVR5cGUubm9JdGVyYXRvcixcbiAgICAgIGtleXNWYWwxLFxuICAgICk7XG4gIH0gZWxzZSBpZiAoaXNTZXQodmFsMSkpIHtcbiAgICBpZiAoXG4gICAgICAhaXNTZXQodmFsMikgfHxcbiAgICAgICh2YWwxIGFzIFNldDx1bmtub3duPikuc2l6ZSAhPT0gKHZhbDIgYXMgU2V0PHVua25vd24+KS5zaXplXG4gICAgKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBrZXlDaGVjayhcbiAgICAgIHZhbDEgYXMgb2JqZWN0LFxuICAgICAgdmFsMiBhcyBvYmplY3QsXG4gICAgICBzdHJpY3QsXG4gICAgICBtZW1vcyxcbiAgICAgIHZhbHVlVHlwZS5pc1NldCxcbiAgICApO1xuICB9IGVsc2UgaWYgKGlzTWFwKHZhbDEpKSB7XG4gICAgaWYgKFxuICAgICAgIWlzTWFwKHZhbDIpIHx8XG4gICAgICAodmFsMSBhcyBTZXQ8dW5rbm93bj4pLnNpemUgIT09ICh2YWwyIGFzIFNldDx1bmtub3duPikuc2l6ZVxuICAgICkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4ga2V5Q2hlY2soXG4gICAgICB2YWwxIGFzIG9iamVjdCxcbiAgICAgIHZhbDIgYXMgb2JqZWN0LFxuICAgICAgc3RyaWN0LFxuICAgICAgbWVtb3MsXG4gICAgICB2YWx1ZVR5cGUuaXNNYXAsXG4gICAgKTtcbiAgfSBlbHNlIGlmIChpc0FueUFycmF5QnVmZmVyKHZhbDEpKSB7XG4gICAgaWYgKCFpc0FueUFycmF5QnVmZmVyKHZhbDIpIHx8ICFhcmVFcXVhbEFycmF5QnVmZmVycyh2YWwxLCB2YWwyKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfSBlbHNlIGlmIChpc0JveGVkUHJpbWl0aXZlKHZhbDEpKSB7XG4gICAgaWYgKCFpc0VxdWFsQm94ZWRQcmltaXRpdmUodmFsMSwgdmFsMikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoXG4gICAgQXJyYXkuaXNBcnJheSh2YWwyKSB8fFxuICAgIGlzQXJyYXlCdWZmZXJWaWV3KHZhbDIpIHx8XG4gICAgaXNTZXQodmFsMikgfHxcbiAgICBpc01hcCh2YWwyKSB8fFxuICAgIGlzRGF0ZSh2YWwyKSB8fFxuICAgIGlzUmVnRXhwKHZhbDIpIHx8XG4gICAgaXNBbnlBcnJheUJ1ZmZlcih2YWwyKSB8fFxuICAgIGlzQm94ZWRQcmltaXRpdmUodmFsMikgfHxcbiAgICBpc05hdGl2ZUVycm9yKHZhbDIpIHx8XG4gICAgdmFsMiBpbnN0YW5jZW9mIEVycm9yXG4gICkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4ga2V5Q2hlY2soXG4gICAgdmFsMSBhcyBvYmplY3QsXG4gICAgdmFsMiBhcyBvYmplY3QsXG4gICAgc3RyaWN0LFxuICAgIG1lbW9zLFxuICAgIHZhbHVlVHlwZS5ub0l0ZXJhdG9yLFxuICApO1xufVxuXG5mdW5jdGlvbiBrZXlDaGVjayhcbiAgdmFsMTogb2JqZWN0LFxuICB2YWwyOiBvYmplY3QsXG4gIHN0cmljdDogYm9vbGVhbixcbiAgbWVtb3M6IE1lbW8sXG4gIGl0ZXJhdGlvblR5cGU6IHZhbHVlVHlwZSxcbiAgYUtleXM6IChzdHJpbmcgfCBzeW1ib2wpW10gPSBbXSxcbikge1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gNSkge1xuICAgIGFLZXlzID0gT2JqZWN0LmtleXModmFsMSk7XG4gICAgY29uc3QgYktleXMgPSBPYmplY3Qua2V5cyh2YWwyKTtcblxuICAgIC8vIFRoZSBwYWlyIG11c3QgaGF2ZSB0aGUgc2FtZSBudW1iZXIgb2Ygb3duZWQgcHJvcGVydGllcy5cbiAgICBpZiAoYUtleXMubGVuZ3RoICE9PSBiS2V5cy5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvLyBDaGVhcCBrZXkgdGVzdFxuICBsZXQgaSA9IDA7XG4gIGZvciAoOyBpIDwgYUtleXMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoIXZhbDIucHJvcGVydHlJc0VudW1lcmFibGUoYUtleXNbaV0pKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgaWYgKHN0cmljdCAmJiBhcmd1bWVudHMubGVuZ3RoID09PSA1KSB7XG4gICAgY29uc3Qgc3ltYm9sS2V5c0EgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKHZhbDEpO1xuICAgIGlmIChzeW1ib2xLZXlzQS5sZW5ndGggIT09IDApIHtcbiAgICAgIGxldCBjb3VudCA9IDA7XG4gICAgICBmb3IgKGkgPSAwOyBpIDwgc3ltYm9sS2V5c0EubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3Qga2V5ID0gc3ltYm9sS2V5c0FbaV07XG4gICAgICAgIGlmICh2YWwxLnByb3BlcnR5SXNFbnVtZXJhYmxlKGtleSkpIHtcbiAgICAgICAgICBpZiAoIXZhbDIucHJvcGVydHlJc0VudW1lcmFibGUoa2V5KSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBhZGRlZCB0b1N0cmluZyBoZXJlXG4gICAgICAgICAgYUtleXMucHVzaChrZXkudG9TdHJpbmcoKSk7XG4gICAgICAgICAgY291bnQrKztcbiAgICAgICAgfSBlbHNlIGlmICh2YWwyLnByb3BlcnR5SXNFbnVtZXJhYmxlKGtleSkpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IHN5bWJvbEtleXNCID0gT2JqZWN0LmdldE93blByb3BlcnR5U3ltYm9scyh2YWwyKTtcbiAgICAgIGlmIChcbiAgICAgICAgc3ltYm9sS2V5c0EubGVuZ3RoICE9PSBzeW1ib2xLZXlzQi5sZW5ndGggJiZcbiAgICAgICAgZ2V0RW51bWVyYWJsZXModmFsMiwgc3ltYm9sS2V5c0IpLmxlbmd0aCAhPT0gY291bnRcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHN5bWJvbEtleXNCID0gT2JqZWN0LmdldE93blByb3BlcnR5U3ltYm9scyh2YWwyKTtcbiAgICAgIGlmIChcbiAgICAgICAgc3ltYm9sS2V5c0IubGVuZ3RoICE9PSAwICYmXG4gICAgICAgIGdldEVudW1lcmFibGVzKHZhbDIsIHN5bWJvbEtleXNCKS5sZW5ndGggIT09IDBcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChcbiAgICBhS2V5cy5sZW5ndGggPT09IDAgJiZcbiAgICAoaXRlcmF0aW9uVHlwZSA9PT0gdmFsdWVUeXBlLm5vSXRlcmF0b3IgfHxcbiAgICAgIChpdGVyYXRpb25UeXBlID09PSB2YWx1ZVR5cGUuaXNBcnJheSAmJiAodmFsMSBhcyBbXSkubGVuZ3RoID09PSAwKSB8fFxuICAgICAgKHZhbDEgYXMgU2V0PHVua25vd24+KS5zaXplID09PSAwKVxuICApIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmIChtZW1vcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgbWVtb3MgPSB7XG4gICAgICB2YWwxOiBuZXcgTWFwKCksXG4gICAgICB2YWwyOiBuZXcgTWFwKCksXG4gICAgICBwb3NpdGlvbjogMCxcbiAgICB9O1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHZhbDJNZW1vQSA9IG1lbW9zLnZhbDEuZ2V0KHZhbDEpO1xuICAgIGlmICh2YWwyTWVtb0EgIT09IHVuZGVmaW5lZCkge1xuICAgICAgY29uc3QgdmFsMk1lbW9CID0gbWVtb3MudmFsMi5nZXQodmFsMik7XG4gICAgICBpZiAodmFsMk1lbW9CICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIHZhbDJNZW1vQSA9PT0gdmFsMk1lbW9CO1xuICAgICAgfVxuICAgIH1cbiAgICBtZW1vcy5wb3NpdGlvbisrO1xuICB9XG5cbiAgbWVtb3MudmFsMS5zZXQodmFsMSwgbWVtb3MucG9zaXRpb24pO1xuICBtZW1vcy52YWwyLnNldCh2YWwyLCBtZW1vcy5wb3NpdGlvbik7XG5cbiAgY29uc3QgYXJlRXEgPSBvYmpFcXVpdih2YWwxLCB2YWwyLCBzdHJpY3QsIGFLZXlzLCBtZW1vcywgaXRlcmF0aW9uVHlwZSk7XG5cbiAgbWVtb3MudmFsMS5kZWxldGUodmFsMSk7XG4gIG1lbW9zLnZhbDIuZGVsZXRlKHZhbDIpO1xuXG4gIHJldHVybiBhcmVFcTtcbn1cblxuZnVuY3Rpb24gYXJlU2ltaWxhclJlZ0V4cHMoYTogUmVnRXhwLCBiOiBSZWdFeHApIHtcbiAgcmV0dXJuIGEuc291cmNlID09PSBiLnNvdXJjZSAmJiBhLmZsYWdzID09PSBiLmZsYWdzICYmXG4gICAgYS5sYXN0SW5kZXggPT09IGIubGFzdEluZGV4O1xufVxuXG4vLyBUT0RPKHN0YW5kdnBtbnQpOiBhZGQgdHlwZSBmb3IgYXJndW1lbnRzXG5mdW5jdGlvbiBhcmVTaW1pbGFyRmxvYXRBcnJheXMoYXJyMTogYW55LCBhcnIyOiBhbnkpOiBib29sZWFuIHtcbiAgaWYgKGFycjEuYnl0ZUxlbmd0aCAhPT0gYXJyMi5ieXRlTGVuZ3RoKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYXJyMS5ieXRlTGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoYXJyMVtpXSAhPT0gYXJyMltpXSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gVE9ETyhzdGFuZHZwbW50KTogYWRkIHR5cGUgZm9yIGFyZ3VtZW50c1xuZnVuY3Rpb24gYXJlU2ltaWxhclR5cGVkQXJyYXlzKGFycjE6IGFueSwgYXJyMjogYW55KTogYm9vbGVhbiB7XG4gIGlmIChhcnIxLmJ5dGVMZW5ndGggIT09IGFycjIuYnl0ZUxlbmd0aCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gKFxuICAgIEJ1ZmZlci5jb21wYXJlKFxuICAgICAgbmV3IFVpbnQ4QXJyYXkoYXJyMS5idWZmZXIsIGFycjEuYnl0ZU9mZnNldCwgYXJyMS5ieXRlTGVuZ3RoKSxcbiAgICAgIG5ldyBVaW50OEFycmF5KGFycjIuYnVmZmVyLCBhcnIyLmJ5dGVPZmZzZXQsIGFycjIuYnl0ZUxlbmd0aCksXG4gICAgKSA9PT0gMFxuICApO1xufVxuLy8gVE9ETyhzdGFuZHZwbW50KTogYWRkIHR5cGUgZm9yIGFyZ3VtZW50c1xuZnVuY3Rpb24gYXJlRXF1YWxBcnJheUJ1ZmZlcnMoYnVmMTogYW55LCBidWYyOiBhbnkpOiBib29sZWFuIHtcbiAgcmV0dXJuIChcbiAgICBidWYxLmJ5dGVMZW5ndGggPT09IGJ1ZjIuYnl0ZUxlbmd0aCAmJlxuICAgIEJ1ZmZlci5jb21wYXJlKG5ldyBVaW50OEFycmF5KGJ1ZjEpLCBuZXcgVWludDhBcnJheShidWYyKSkgPT09IDBcbiAgKTtcbn1cblxuLy8gVE9ETyhzdGFuZHZwbW50KTogIHRoaXMgY2hlY2sgb2YgZ2V0T3duUHJvcGVydHlTeW1ib2xzIGFuZCBnZXRPd25Qcm9wZXJ0eU5hbWVzXG4vLyBsZW5ndGggaXMgc3VmZmljaWVudCB0byBoYW5kbGUgdGhlIGN1cnJlbnQgdGVzdCBjYXNlLCBob3dldmVyIHRoaXMgd2lsbCBmYWlsXG4vLyB0byBjYXRjaCBhIHNjZW5hcmlvIHdoZXJlaW4gdGhlIGdldE93blByb3BlcnR5U3ltYm9scyBhbmQgZ2V0T3duUHJvcGVydHlOYW1lc1xuLy8gbGVuZ3RoIGlzIHRoZSBzYW1lKHdpbGwgYmUgdmVyeSBjb250cml2ZWQgYnV0IGEgcG9zc2libGUgc2hvcnRjb21pbmdcbmZ1bmN0aW9uIGlzRXF1YWxCb3hlZFByaW1pdGl2ZShhOiBhbnksIGI6IGFueSk6IGJvb2xlYW4ge1xuICBpZiAoXG4gICAgT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMoYSkubGVuZ3RoICE9PVxuICAgICAgT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMoYikubGVuZ3RoXG4gICkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoXG4gICAgT2JqZWN0LmdldE93blByb3BlcnR5U3ltYm9scyhhKS5sZW5ndGggIT09XG4gICAgICBPYmplY3QuZ2V0T3duUHJvcGVydHlTeW1ib2xzKGIpLmxlbmd0aFxuICApIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGlzTnVtYmVyT2JqZWN0KGEpKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIGlzTnVtYmVyT2JqZWN0KGIpICYmXG4gICAgICBPYmplY3QuaXMoXG4gICAgICAgIE51bWJlci5wcm90b3R5cGUudmFsdWVPZi5jYWxsKGEpLFxuICAgICAgICBOdW1iZXIucHJvdG90eXBlLnZhbHVlT2YuY2FsbChiKSxcbiAgICAgIClcbiAgICApO1xuICB9XG4gIGlmIChpc1N0cmluZ09iamVjdChhKSkge1xuICAgIHJldHVybiAoXG4gICAgICBpc1N0cmluZ09iamVjdChiKSAmJlxuICAgICAgKFN0cmluZy5wcm90b3R5cGUudmFsdWVPZi5jYWxsKGEpID09PSBTdHJpbmcucHJvdG90eXBlLnZhbHVlT2YuY2FsbChiKSlcbiAgICApO1xuICB9XG4gIGlmIChpc0Jvb2xlYW5PYmplY3QoYSkpIHtcbiAgICByZXR1cm4gKFxuICAgICAgaXNCb29sZWFuT2JqZWN0KGIpICYmXG4gICAgICAoQm9vbGVhbi5wcm90b3R5cGUudmFsdWVPZi5jYWxsKGEpID09PSBCb29sZWFuLnByb3RvdHlwZS52YWx1ZU9mLmNhbGwoYikpXG4gICAgKTtcbiAgfVxuICBpZiAoaXNCaWdJbnRPYmplY3QoYSkpIHtcbiAgICByZXR1cm4gKFxuICAgICAgaXNCaWdJbnRPYmplY3QoYikgJiZcbiAgICAgIChCaWdJbnQucHJvdG90eXBlLnZhbHVlT2YuY2FsbChhKSA9PT0gQmlnSW50LnByb3RvdHlwZS52YWx1ZU9mLmNhbGwoYikpXG4gICAgKTtcbiAgfVxuICBpZiAoaXNTeW1ib2xPYmplY3QoYSkpIHtcbiAgICByZXR1cm4gKFxuICAgICAgaXNTeW1ib2xPYmplY3QoYikgJiZcbiAgICAgIChTeW1ib2wucHJvdG90eXBlLnZhbHVlT2YuY2FsbChhKSA9PT1cbiAgICAgICAgU3ltYm9sLnByb3RvdHlwZS52YWx1ZU9mLmNhbGwoYikpXG4gICAgKTtcbiAgfVxuICAvLyBhc3NlcnQuZmFpbChgVW5rbm93biBib3hlZCB0eXBlICR7dmFsMX1gKTtcbiAgLy8gcmV0dXJuIGZhbHNlO1xuICB0aHJvdyBFcnJvcihgVW5rbm93biBib3hlZCB0eXBlYCk7XG59XG5cbmZ1bmN0aW9uIGdldEVudW1lcmFibGVzKHZhbDogYW55LCBrZXlzOiBhbnkpIHtcbiAgcmV0dXJuIGtleXMuZmlsdGVyKChrZXk6IHN0cmluZykgPT4gdmFsLnByb3BlcnR5SXNFbnVtZXJhYmxlKGtleSkpO1xufVxuXG5mdW5jdGlvbiBvYmpFcXVpdihcbiAgb2JqMTogYW55LFxuICBvYmoyOiBhbnksXG4gIHN0cmljdDogYm9vbGVhbixcbiAga2V5czogYW55LFxuICBtZW1vczogTWVtbyxcbiAgaXRlcmF0aW9uVHlwZTogdmFsdWVUeXBlLFxuKTogYm9vbGVhbiB7XG4gIGxldCBpID0gMDtcblxuICBpZiAoaXRlcmF0aW9uVHlwZSA9PT0gdmFsdWVUeXBlLmlzU2V0KSB7XG4gICAgaWYgKCFzZXRFcXVpdihvYmoxLCBvYmoyLCBzdHJpY3QsIG1lbW9zKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfSBlbHNlIGlmIChpdGVyYXRpb25UeXBlID09PSB2YWx1ZVR5cGUuaXNNYXApIHtcbiAgICBpZiAoIW1hcEVxdWl2KG9iajEsIG9iajIsIHN0cmljdCwgbWVtb3MpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9IGVsc2UgaWYgKGl0ZXJhdGlvblR5cGUgPT09IHZhbHVlVHlwZS5pc0FycmF5KSB7XG4gICAgZm9yICg7IGkgPCBvYmoxLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAob2JqMS5oYXNPd25Qcm9wZXJ0eShpKSkge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgIW9iajIuaGFzT3duUHJvcGVydHkoaSkgfHxcbiAgICAgICAgICAhaW5uZXJEZWVwRXF1YWwob2JqMVtpXSwgb2JqMltpXSwgc3RyaWN0LCBtZW1vcylcbiAgICAgICAgKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKG9iajIuaGFzT3duUHJvcGVydHkoaSkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3Qga2V5czEgPSBPYmplY3Qua2V5cyhvYmoxKTtcbiAgICAgICAgZm9yICg7IGkgPCBrZXlzMS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGNvbnN0IGtleSA9IGtleXMxW2ldO1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICFvYmoyLmhhc093blByb3BlcnR5KGtleSkgfHxcbiAgICAgICAgICAgICFpbm5lckRlZXBFcXVhbChvYmoxW2tleV0sIG9iajJba2V5XSwgc3RyaWN0LCBtZW1vcylcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGtleXMxLmxlbmd0aCAhPT0gT2JqZWN0LmtleXMob2JqMikubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChrZXlzMS5sZW5ndGggIT09IE9iamVjdC5rZXlzKG9iajIpLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBFeHBlbnNpdmUgdGVzdFxuICBmb3IgKGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGtleSA9IGtleXNbaV07XG4gICAgaWYgKCFpbm5lckRlZXBFcXVhbChvYmoxW2tleV0sIG9iajJba2V5XSwgc3RyaWN0LCBtZW1vcykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGZpbmRMb29zZU1hdGNoaW5nUHJpbWl0aXZlcyhcbiAgcHJpbWl0aXZlOiB1bmtub3duLFxuKTogYm9vbGVhbiB8IG51bGwgfCB1bmRlZmluZWQge1xuICBzd2l0Y2ggKHR5cGVvZiBwcmltaXRpdmUpIHtcbiAgICBjYXNlIFwidW5kZWZpbmVkXCI6XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICBjYXNlIFwib2JqZWN0XCI6XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIGNhc2UgXCJzeW1ib2xcIjpcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjYXNlIFwic3RyaW5nXCI6XG4gICAgICBwcmltaXRpdmUgPSArcHJpbWl0aXZlO1xuICAgIGNhc2UgXCJudW1iZXJcIjpcbiAgICAgIGlmIChOdW1iZXIuaXNOYU4ocHJpbWl0aXZlKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHNldE1pZ2h0SGF2ZUxvb3NlUHJpbShcbiAgc2V0MTogU2V0PHVua25vd24+LFxuICBzZXQyOiBTZXQ8dW5rbm93bj4sXG4gIHByaW1pdGl2ZTogYW55LFxuKSB7XG4gIGNvbnN0IGFsdFZhbHVlID0gZmluZExvb3NlTWF0Y2hpbmdQcmltaXRpdmVzKHByaW1pdGl2ZSk7XG4gIGlmIChhbHRWYWx1ZSAhPSBudWxsKSByZXR1cm4gYWx0VmFsdWU7XG5cbiAgcmV0dXJuIHNldDIuaGFzKGFsdFZhbHVlKSAmJiAhc2V0MS5oYXMoYWx0VmFsdWUpO1xufVxuXG5mdW5jdGlvbiBzZXRIYXNFcXVhbEVsZW1lbnQoXG4gIHNldDogYW55LFxuICB2YWwxOiBhbnksXG4gIHN0cmljdDogYm9vbGVhbixcbiAgbWVtb3M6IE1lbW8sXG4pOiBib29sZWFuIHtcbiAgZm9yIChjb25zdCB2YWwyIG9mIHNldCkge1xuICAgIGlmIChpbm5lckRlZXBFcXVhbCh2YWwxLCB2YWwyLCBzdHJpY3QsIG1lbW9zKSkge1xuICAgICAgc2V0LmRlbGV0ZSh2YWwyKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gc2V0RXF1aXYoc2V0MTogYW55LCBzZXQyOiBhbnksIHN0cmljdDogYm9vbGVhbiwgbWVtb3M6IE1lbW8pOiBib29sZWFuIHtcbiAgbGV0IHNldCA9IG51bGw7XG4gIGZvciAoY29uc3QgaXRlbSBvZiBzZXQxKSB7XG4gICAgaWYgKHR5cGVvZiBpdGVtID09PSBcIm9iamVjdFwiICYmIGl0ZW0gIT09IG51bGwpIHtcbiAgICAgIGlmIChzZXQgPT09IG51bGwpIHtcbiAgICAgICAgLy8gV2hhdCBpcyBTYWZlU2V0IGZyb20gcHJpbW9yZGlhbHM/XG4gICAgICAgIC8vIHNldCA9IG5ldyBTYWZlU2V0KCk7XG4gICAgICAgIHNldCA9IG5ldyBTZXQoKTtcbiAgICAgIH1cbiAgICAgIHNldC5hZGQoaXRlbSk7XG4gICAgfSBlbHNlIGlmICghc2V0Mi5oYXMoaXRlbSkpIHtcbiAgICAgIGlmIChzdHJpY3QpIHJldHVybiBmYWxzZTtcblxuICAgICAgaWYgKCFzZXRNaWdodEhhdmVMb29zZVByaW0oc2V0MSwgc2V0MiwgaXRlbSkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBpZiAoc2V0ID09PSBudWxsKSB7XG4gICAgICAgIHNldCA9IG5ldyBTZXQoKTtcbiAgICAgIH1cbiAgICAgIHNldC5hZGQoaXRlbSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHNldCAhPT0gbnVsbCkge1xuICAgIGZvciAoY29uc3QgaXRlbSBvZiBzZXQyKSB7XG4gICAgICBpZiAodHlwZW9mIGl0ZW0gPT09IFwib2JqZWN0XCIgJiYgaXRlbSAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoIXNldEhhc0VxdWFsRWxlbWVudChzZXQsIGl0ZW0sIHN0cmljdCwgbWVtb3MpKSByZXR1cm4gZmFsc2U7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAhc3RyaWN0ICYmXG4gICAgICAgICFzZXQxLmhhcyhpdGVtKSAmJlxuICAgICAgICAhc2V0SGFzRXF1YWxFbGVtZW50KHNldCwgaXRlbSwgc3RyaWN0LCBtZW1vcylcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzZXQuc2l6ZSA9PT0gMDtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyBUT0RPKHN0YW5kdnBtbnQpOiBhZGQgdHlwZXMgZm9yIGFyZ3VtZW50XG5mdW5jdGlvbiBtYXBNaWdodEhhdmVMb29zZVByaW1pdGl2ZShcbiAgbWFwMTogTWFwPHVua25vd24sIHVua25vd24+LFxuICBtYXAyOiBNYXA8dW5rbm93biwgdW5rbm93bj4sXG4gIHByaW1pdGl2ZTogYW55LFxuICBpdGVtOiBhbnksXG4gIG1lbW9zOiBNZW1vLFxuKTogYm9vbGVhbiB7XG4gIGNvbnN0IGFsdFZhbHVlID0gZmluZExvb3NlTWF0Y2hpbmdQcmltaXRpdmVzKHByaW1pdGl2ZSk7XG4gIGlmIChhbHRWYWx1ZSAhPSBudWxsKSB7XG4gICAgcmV0dXJuIGFsdFZhbHVlO1xuICB9XG4gIGNvbnN0IGN1ckIgPSBtYXAyLmdldChhbHRWYWx1ZSk7XG4gIGlmIChcbiAgICAoY3VyQiA9PT0gdW5kZWZpbmVkICYmICFtYXAyLmhhcyhhbHRWYWx1ZSkpIHx8XG4gICAgIWlubmVyRGVlcEVxdWFsKGl0ZW0sIGN1ckIsIGZhbHNlLCBtZW1vKVxuICApIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuICFtYXAxLmhhcyhhbHRWYWx1ZSkgJiYgaW5uZXJEZWVwRXF1YWwoaXRlbSwgY3VyQiwgZmFsc2UsIG1lbW9zKTtcbn1cblxuZnVuY3Rpb24gbWFwRXF1aXYobWFwMTogYW55LCBtYXAyOiBhbnksIHN0cmljdDogYm9vbGVhbiwgbWVtb3M6IE1lbW8pOiBib29sZWFuIHtcbiAgbGV0IHNldCA9IG51bGw7XG5cbiAgZm9yIChjb25zdCB7IDA6IGtleSwgMTogaXRlbTEgfSBvZiBtYXAxKSB7XG4gICAgaWYgKHR5cGVvZiBrZXkgPT09IFwib2JqZWN0XCIgJiYga2V5ICE9PSBudWxsKSB7XG4gICAgICBpZiAoc2V0ID09PSBudWxsKSB7XG4gICAgICAgIHNldCA9IG5ldyBTZXQoKTtcbiAgICAgIH1cbiAgICAgIHNldC5hZGQoa2V5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgaXRlbTIgPSBtYXAyLmdldChrZXkpO1xuICAgICAgaWYgKFxuICAgICAgICAoXG4gICAgICAgICAgKGl0ZW0yID09PSB1bmRlZmluZWQgJiYgIW1hcDIuaGFzKGtleSkpIHx8XG4gICAgICAgICAgIWlubmVyRGVlcEVxdWFsKGl0ZW0xLCBpdGVtMiwgc3RyaWN0LCBtZW1vcylcbiAgICAgICAgKVxuICAgICAgKSB7XG4gICAgICAgIGlmIChzdHJpY3QpIHJldHVybiBmYWxzZTtcbiAgICAgICAgaWYgKCFtYXBNaWdodEhhdmVMb29zZVByaW1pdGl2ZShtYXAxLCBtYXAyLCBrZXksIGl0ZW0xLCBtZW1vcykpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNldCA9PT0gbnVsbCkge1xuICAgICAgICAgIHNldCA9IG5ldyBTZXQoKTtcbiAgICAgICAgfVxuICAgICAgICBzZXQuYWRkKGtleSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKHNldCAhPT0gbnVsbCkge1xuICAgIGZvciAoY29uc3QgeyAwOiBrZXksIDE6IGl0ZW0gfSBvZiBtYXAyKSB7XG4gICAgICBpZiAodHlwZW9mIGtleSA9PT0gXCJvYmplY3RcIiAmJiBrZXkgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKCFtYXBIYXNFcXVhbEVudHJ5KHNldCwgbWFwMSwga2V5LCBpdGVtLCBzdHJpY3QsIG1lbW9zKSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgIXN0cmljdCAmJiAoIW1hcDEuaGFzKGtleSkgfHxcbiAgICAgICAgICAhaW5uZXJEZWVwRXF1YWwobWFwMS5nZXQoa2V5KSwgaXRlbSwgZmFsc2UsIG1lbW9zKSkgJiZcbiAgICAgICAgIW1hcEhhc0VxdWFsRW50cnkoc2V0LCBtYXAxLCBrZXksIGl0ZW0sIGZhbHNlLCBtZW1vcylcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzZXQuc2l6ZSA9PT0gMDtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBtYXBIYXNFcXVhbEVudHJ5KFxuICBzZXQ6IGFueSxcbiAgbWFwOiBhbnksXG4gIGtleTE6IGFueSxcbiAgaXRlbTE6IGFueSxcbiAgc3RyaWN0OiBib29sZWFuLFxuICBtZW1vczogTWVtbyxcbik6IGJvb2xlYW4ge1xuICBmb3IgKGNvbnN0IGtleTIgb2Ygc2V0KSB7XG4gICAgaWYgKFxuICAgICAgaW5uZXJEZWVwRXF1YWwoa2V5MSwga2V5Miwgc3RyaWN0LCBtZW1vcykgJiZcbiAgICAgIGlubmVyRGVlcEVxdWFsKGl0ZW0xLCBtYXAuZ2V0KGtleTIpLCBzdHJpY3QsIG1lbW9zKVxuICAgICkge1xuICAgICAgc2V0LmRlbGV0ZShrZXkyKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLDRFQUE0RTtBQUU1RSx3QkFBd0I7QUFDeEIsU0FDRSxnQkFBZ0IsRUFDaEIsaUJBQWlCLEVBQ2pCLGNBQWMsRUFDZCxlQUFlLEVBQ2YsZ0JBQWdCLEVBQ2hCLE1BQU0sRUFDTixjQUFjLEVBQ2QsY0FBYyxFQUNkLEtBQUssRUFDTCxhQUFhLEVBQ2IsY0FBYyxFQUNkLFFBQVEsRUFDUixLQUFLLEVBQ0wsY0FBYyxFQUNkLGNBQWMsRUFDZCxZQUFZLFFBQ1AsWUFBWSxDQUFDO0FBRXBCLFNBQVMsTUFBTSxRQUFRLG1CQUFtQixDQUFDO0FBQzNDLFNBQ0Usd0JBQXdCLEVBQ3hCLGVBQWUsRUFDZixZQUFZLFFBQ1AsZ0NBQWdDLENBQUM7SUFFeEMsU0FLQztVQUxJLFNBQVM7SUFBVCxTQUFTLENBQVQsU0FBUyxDQUNaLFlBQVUsSUFBVixDQUFVLElBQVYsWUFBVTtJQURQLFNBQVMsQ0FBVCxTQUFTLENBRVosU0FBTyxJQUFQLENBQU8sSUFBUCxTQUFPO0lBRkosU0FBUyxDQUFULFNBQVMsQ0FHWixPQUFLLElBQUwsQ0FBSyxJQUFMLE9BQUs7SUFIRixTQUFTLENBQVQsU0FBUyxDQUlaLE9BQUss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