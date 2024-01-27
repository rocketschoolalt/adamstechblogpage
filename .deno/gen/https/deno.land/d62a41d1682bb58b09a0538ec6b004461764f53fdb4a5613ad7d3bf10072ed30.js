const objectCloneMemo = new WeakMap();
function cloneArrayBuffer(srcBuffer, srcByteOffset, srcLength, // deno-lint-ignore no-explicit-any
_cloneConstructor) {
    // this function fudges the return type but SharedArrayBuffer is disabled for a while anyway
    return srcBuffer.slice(srcByteOffset, srcByteOffset + srcLength);
}
/** A loose approximation for structured cloning, used when the `Deno.core`
 * APIs are not available. */ // deno-lint-ignore no-explicit-any
function cloneValue(value) {
    switch(typeof value){
        case "number":
        case "string":
        case "boolean":
        case "undefined":
        case "bigint":
            return value;
        case "object":
            {
                if (objectCloneMemo.has(value)) {
                    return objectCloneMemo.get(value);
                }
                if (value === null) {
                    return value;
                }
                if (value instanceof Date) {
                    return new Date(value.valueOf());
                }
                if (value instanceof RegExp) {
                    return new RegExp(value);
                }
                if (value instanceof SharedArrayBuffer) {
                    return value;
                }
                if (value instanceof ArrayBuffer) {
                    const cloned = cloneArrayBuffer(value, 0, value.byteLength, ArrayBuffer);
                    objectCloneMemo.set(value, cloned);
                    return cloned;
                }
                if (ArrayBuffer.isView(value)) {
                    const clonedBuffer = cloneValue(value.buffer);
                    // Use DataViewConstructor type purely for type-checking, can be a
                    // DataView or TypedArray.  They use the same constructor signature,
                    // only DataView has a length in bytes and TypedArrays use a length in
                    // terms of elements, so we adjust for that.
                    let length;
                    if (value instanceof DataView) {
                        length = value.byteLength;
                    } else {
                        // deno-lint-ignore no-explicit-any
                        length = value.length;
                    }
                    // deno-lint-ignore no-explicit-any
                    return new value.constructor(clonedBuffer, value.byteOffset, length);
                }
                if (value instanceof Map) {
                    const clonedMap = new Map();
                    objectCloneMemo.set(value, clonedMap);
                    value.forEach((v, k)=>{
                        clonedMap.set(cloneValue(k), cloneValue(v));
                    });
                    return clonedMap;
                }
                if (value instanceof Set) {
                    // assumes that cloneValue still takes only one argument
                    const clonedSet = new Set([
                        ...value
                    ].map(cloneValue));
                    objectCloneMemo.set(value, clonedSet);
                    return clonedSet;
                }
                // default for objects
                // deno-lint-ignore no-explicit-any
                const clonedObj = {
                };
                objectCloneMemo.set(value, clonedObj);
                const sourceKeys = Object.getOwnPropertyNames(value);
                for (const key of sourceKeys){
                    clonedObj[key] = cloneValue(value[key]);
                }
                Reflect.setPrototypeOf(clonedObj, Reflect.getPrototypeOf(value));
                return clonedObj;
            }
        case "symbol":
        case "function":
        default:
            throw new DOMException("Uncloneable value in stream", "DataCloneError");
    }
}
const core = Deno?.core;
const structuredClone = // deno-lint-ignore no-explicit-any
(globalThis).structuredClone;
/**
 * Provides structured cloning
 * @param value
 * @returns
 */ function sc(value) {
    return structuredClone ? structuredClone(value) : core ? core.deserialize(core.serialize(value)) : cloneValue(value);
}
/** Clones a state object, skipping any values that cannot be cloned. */ // deno-lint-ignore no-explicit-any
export function cloneState(state) {
    const clone = {
    };
    for (const [key, value] of Object.entries(state)){
        try {
            const clonedValue = sc(value);
            clone[key] = clonedValue;
        } catch  {
        // we just no-op values that cannot be cloned
        }
    }
    return clone;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMC4xLjAvc3RydWN0dXJlZF9jbG9uZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIxIHRoZSBvYWsgYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbmV4cG9ydCB0eXBlIFN0cnVjdHVyZWRDbG9uYWJsZSA9XG4gIHwgeyBba2V5OiBzdHJpbmddOiBTdHJ1Y3R1cmVkQ2xvbmFibGUgfVxuICB8IEFycmF5PFN0cnVjdHVyZWRDbG9uYWJsZT5cbiAgfCBBcnJheUJ1ZmZlclxuICB8IEFycmF5QnVmZmVyVmlld1xuICB8IEJpZ0ludFxuICB8IGJpZ2ludFxuICB8IEJsb2JcbiAgLy8gZGVuby1saW50LWlnbm9yZSBiYW4tdHlwZXNcbiAgfCBCb29sZWFuXG4gIHwgYm9vbGVhblxuICB8IERhdGVcbiAgfCBFcnJvclxuICB8IEV2YWxFcnJvclxuICB8IE1hcDxTdHJ1Y3R1cmVkQ2xvbmFibGUsIFN0cnVjdHVyZWRDbG9uYWJsZT5cbiAgLy8gZGVuby1saW50LWlnbm9yZSBiYW4tdHlwZXNcbiAgfCBOdW1iZXJcbiAgfCBudW1iZXJcbiAgfCBSYW5nZUVycm9yXG4gIHwgUmVmZXJlbmNlRXJyb3JcbiAgfCBSZWdFeHBcbiAgfCBTZXQ8U3RydWN0dXJlZENsb25hYmxlPlxuICAvLyBkZW5vLWxpbnQtaWdub3JlIGJhbi10eXBlc1xuICB8IFN0cmluZ1xuICB8IHN0cmluZ1xuICB8IFN5bnRheEVycm9yXG4gIHwgVHlwZUVycm9yXG4gIHwgVVJJRXJyb3I7XG5cbmRlY2xhcmUgZ2xvYmFsIHtcbiAgbmFtZXNwYWNlIERlbm8ge1xuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tdmFyXG4gICAgdmFyIGNvcmU6IHtcbiAgICAgIGRlc2VyaWFsaXplKHZhbHVlOiB1bmtub3duKTogU3RydWN0dXJlZENsb25hYmxlO1xuICAgICAgc2VyaWFsaXplKHZhbHVlOiBTdHJ1Y3R1cmVkQ2xvbmFibGUpOiB1bmtub3duO1xuICAgIH07XG4gIH1cbn1cblxuY29uc3Qgb2JqZWN0Q2xvbmVNZW1vID0gbmV3IFdlYWtNYXAoKTtcblxuZnVuY3Rpb24gY2xvbmVBcnJheUJ1ZmZlcihcbiAgc3JjQnVmZmVyOiBBcnJheUJ1ZmZlcixcbiAgc3JjQnl0ZU9mZnNldDogbnVtYmVyLFxuICBzcmNMZW5ndGg6IG51bWJlcixcbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgX2Nsb25lQ29uc3RydWN0b3I6IGFueSxcbikge1xuICAvLyB0aGlzIGZ1bmN0aW9uIGZ1ZGdlcyB0aGUgcmV0dXJuIHR5cGUgYnV0IFNoYXJlZEFycmF5QnVmZmVyIGlzIGRpc2FibGVkIGZvciBhIHdoaWxlIGFueXdheVxuICByZXR1cm4gc3JjQnVmZmVyLnNsaWNlKFxuICAgIHNyY0J5dGVPZmZzZXQsXG4gICAgc3JjQnl0ZU9mZnNldCArIHNyY0xlbmd0aCxcbiAgKTtcbn1cblxuLyoqIEEgbG9vc2UgYXBwcm94aW1hdGlvbiBmb3Igc3RydWN0dXJlZCBjbG9uaW5nLCB1c2VkIHdoZW4gdGhlIGBEZW5vLmNvcmVgXG4gKiBBUElzIGFyZSBub3QgYXZhaWxhYmxlLiAqL1xuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmZ1bmN0aW9uIGNsb25lVmFsdWUodmFsdWU6IGFueSk6IGFueSB7XG4gIHN3aXRjaCAodHlwZW9mIHZhbHVlKSB7XG4gICAgY2FzZSBcIm51bWJlclwiOlxuICAgIGNhc2UgXCJzdHJpbmdcIjpcbiAgICBjYXNlIFwiYm9vbGVhblwiOlxuICAgIGNhc2UgXCJ1bmRlZmluZWRcIjpcbiAgICBjYXNlIFwiYmlnaW50XCI6XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgY2FzZSBcIm9iamVjdFwiOiB7XG4gICAgICBpZiAob2JqZWN0Q2xvbmVNZW1vLmhhcyh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIG9iamVjdENsb25lTWVtby5nZXQodmFsdWUpO1xuICAgICAgfVxuICAgICAgaWYgKHZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgIH1cbiAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlLnZhbHVlT2YoKSk7XG4gICAgICB9XG4gICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgICAgcmV0dXJuIG5ldyBSZWdFeHAodmFsdWUpO1xuICAgICAgfVxuICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgU2hhcmVkQXJyYXlCdWZmZXIpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfVxuICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcbiAgICAgICAgY29uc3QgY2xvbmVkID0gY2xvbmVBcnJheUJ1ZmZlcihcbiAgICAgICAgICB2YWx1ZSxcbiAgICAgICAgICAwLFxuICAgICAgICAgIHZhbHVlLmJ5dGVMZW5ndGgsXG4gICAgICAgICAgQXJyYXlCdWZmZXIsXG4gICAgICAgICk7XG4gICAgICAgIG9iamVjdENsb25lTWVtby5zZXQodmFsdWUsIGNsb25lZCk7XG4gICAgICAgIHJldHVybiBjbG9uZWQ7XG4gICAgICB9XG4gICAgICBpZiAoQXJyYXlCdWZmZXIuaXNWaWV3KHZhbHVlKSkge1xuICAgICAgICBjb25zdCBjbG9uZWRCdWZmZXIgPSBjbG9uZVZhbHVlKHZhbHVlLmJ1ZmZlcik7XG4gICAgICAgIC8vIFVzZSBEYXRhVmlld0NvbnN0cnVjdG9yIHR5cGUgcHVyZWx5IGZvciB0eXBlLWNoZWNraW5nLCBjYW4gYmUgYVxuICAgICAgICAvLyBEYXRhVmlldyBvciBUeXBlZEFycmF5LiAgVGhleSB1c2UgdGhlIHNhbWUgY29uc3RydWN0b3Igc2lnbmF0dXJlLFxuICAgICAgICAvLyBvbmx5IERhdGFWaWV3IGhhcyBhIGxlbmd0aCBpbiBieXRlcyBhbmQgVHlwZWRBcnJheXMgdXNlIGEgbGVuZ3RoIGluXG4gICAgICAgIC8vIHRlcm1zIG9mIGVsZW1lbnRzLCBzbyB3ZSBhZGp1c3QgZm9yIHRoYXQuXG4gICAgICAgIGxldCBsZW5ndGg7XG4gICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGFWaWV3KSB7XG4gICAgICAgICAgbGVuZ3RoID0gdmFsdWUuYnl0ZUxlbmd0aDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgICAgICAgIGxlbmd0aCA9ICh2YWx1ZSBhcyBhbnkpLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgICAgICByZXR1cm4gbmV3ICh2YWx1ZS5jb25zdHJ1Y3RvciBhcyBhbnkpKFxuICAgICAgICAgIGNsb25lZEJ1ZmZlcixcbiAgICAgICAgICB2YWx1ZS5ieXRlT2Zmc2V0LFxuICAgICAgICAgIGxlbmd0aCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIE1hcCkge1xuICAgICAgICBjb25zdCBjbG9uZWRNYXAgPSBuZXcgTWFwKCk7XG4gICAgICAgIG9iamVjdENsb25lTWVtby5zZXQodmFsdWUsIGNsb25lZE1hcCk7XG4gICAgICAgIHZhbHVlLmZvckVhY2goKHYsIGspID0+IHtcbiAgICAgICAgICBjbG9uZWRNYXAuc2V0KGNsb25lVmFsdWUoayksIGNsb25lVmFsdWUodikpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGNsb25lZE1hcDtcbiAgICAgIH1cbiAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIFNldCkge1xuICAgICAgICAvLyBhc3N1bWVzIHRoYXQgY2xvbmVWYWx1ZSBzdGlsbCB0YWtlcyBvbmx5IG9uZSBhcmd1bWVudFxuICAgICAgICBjb25zdCBjbG9uZWRTZXQgPSBuZXcgU2V0KFsuLi52YWx1ZV0ubWFwKGNsb25lVmFsdWUpKTtcbiAgICAgICAgb2JqZWN0Q2xvbmVNZW1vLnNldCh2YWx1ZSwgY2xvbmVkU2V0KTtcbiAgICAgICAgcmV0dXJuIGNsb25lZFNldDtcbiAgICAgIH1cblxuICAgICAgLy8gZGVmYXVsdCBmb3Igb2JqZWN0c1xuICAgICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICAgIGNvbnN0IGNsb25lZE9iajogUmVjb3JkPGFueSwgYW55PiA9IHt9O1xuICAgICAgb2JqZWN0Q2xvbmVNZW1vLnNldCh2YWx1ZSwgY2xvbmVkT2JqKTtcbiAgICAgIGNvbnN0IHNvdXJjZUtleXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh2YWx1ZSk7XG4gICAgICBmb3IgKGNvbnN0IGtleSBvZiBzb3VyY2VLZXlzKSB7XG4gICAgICAgIGNsb25lZE9ialtrZXldID0gY2xvbmVWYWx1ZSh2YWx1ZVtrZXldKTtcbiAgICAgIH1cbiAgICAgIFJlZmxlY3Quc2V0UHJvdG90eXBlT2YoY2xvbmVkT2JqLCBSZWZsZWN0LmdldFByb3RvdHlwZU9mKHZhbHVlKSk7XG4gICAgICByZXR1cm4gY2xvbmVkT2JqO1xuICAgIH1cbiAgICBjYXNlIFwic3ltYm9sXCI6XG4gICAgY2FzZSBcImZ1bmN0aW9uXCI6XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBET01FeGNlcHRpb24oXCJVbmNsb25lYWJsZSB2YWx1ZSBpbiBzdHJlYW1cIiwgXCJEYXRhQ2xvbmVFcnJvclwiKTtcbiAgfVxufVxuXG5jb25zdCBjb3JlID0gRGVubz8uY29yZTtcbmNvbnN0IHN0cnVjdHVyZWRDbG9uZTogKCh2YWx1ZTogdW5rbm93bikgPT4gdW5rbm93bikgfCB1bmRlZmluZWQgPVxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAoZ2xvYmFsVGhpcyBhcyBhbnkpLnN0cnVjdHVyZWRDbG9uZTtcblxuLyoqXG4gKiBQcm92aWRlcyBzdHJ1Y3R1cmVkIGNsb25pbmdcbiAqIEBwYXJhbSB2YWx1ZVxuICogQHJldHVybnNcbiAqL1xuZnVuY3Rpb24gc2M8VCBleHRlbmRzIFN0cnVjdHVyZWRDbG9uYWJsZT4odmFsdWU6IFQpOiBUIHtcbiAgcmV0dXJuIHN0cnVjdHVyZWRDbG9uZVxuICAgID8gc3RydWN0dXJlZENsb25lKHZhbHVlKVxuICAgIDogY29yZVxuICAgID8gY29yZS5kZXNlcmlhbGl6ZShjb3JlLnNlcmlhbGl6ZSh2YWx1ZSkpXG4gICAgOiBjbG9uZVZhbHVlKHZhbHVlKTtcbn1cblxuLyoqIENsb25lcyBhIHN0YXRlIG9iamVjdCwgc2tpcHBpbmcgYW55IHZhbHVlcyB0aGF0IGNhbm5vdCBiZSBjbG9uZWQuICovXG4vLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuZXhwb3J0IGZ1bmN0aW9uIGNsb25lU3RhdGU8UyBleHRlbmRzIFJlY29yZDxzdHJpbmcsIGFueT4+KHN0YXRlOiBTKTogUyB7XG4gIGNvbnN0IGNsb25lID0ge30gYXMgUztcbiAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoc3RhdGUpKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGNsb25lZFZhbHVlID0gc2ModmFsdWUpO1xuICAgICAgY2xvbmVba2V5IGFzIGtleW9mIFNdID0gY2xvbmVkVmFsdWU7XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyB3ZSBqdXN0IG5vLW9wIHZhbHVlcyB0aGF0IGNhbm5vdCBiZSBjbG9uZWRcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNsb25lO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQXlDQSxLQUFLLENBQUMsZUFBZSxHQUFHLEdBQUcsQ0FBQyxPQUFPO1NBRTFCLGdCQUFnQixDQUN2QixTQUFzQixFQUN0QixhQUFxQixFQUNyQixTQUFpQixFQUNqQixFQUFtQyxBQUFuQyxpQ0FBbUM7QUFDbkMsaUJBQXNCLEVBQ3RCLENBQUM7SUFDRCxFQUE0RixBQUE1RiwwRkFBNEY7SUFDNUYsTUFBTSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQ3BCLGFBQWEsRUFDYixhQUFhLEdBQUcsU0FBUztBQUU3QixDQUFDO0FBRUQsRUFDNkIsQUFEN0I7MkJBQzZCLEFBRDdCLEVBQzZCLENBQzdCLEVBQW1DLEFBQW5DLGlDQUFtQztTQUMxQixVQUFVLENBQUMsS0FBVSxFQUFPLENBQUM7SUFDcEMsTUFBTSxDQUFFLE1BQU0sQ0FBQyxLQUFLO1FBQ2xCLElBQUksQ0FBQyxDQUFRO1FBQ2IsSUFBSSxDQUFDLENBQVE7UUFDYixJQUFJLENBQUMsQ0FBUztRQUNkLElBQUksQ0FBQyxDQUFXO1FBQ2hCLElBQUksQ0FBQyxDQUFRO1lBQ1gsTUFBTSxDQUFDLEtBQUs7UUFDZCxJQUFJLENBQUMsQ0FBUTtZQUFFLENBQUM7Z0JBQ2QsRUFBRSxFQUFFLGVBQWUsQ0FBQyxHQUFHLENBQUMsS0FBSyxHQUFHLENBQUM7b0JBQy9CLE1BQU0sQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLEtBQUs7Z0JBQ2xDLENBQUM7Z0JBQ0QsRUFBRSxFQUFFLEtBQUssS0FBSyxJQUFJLEVBQUUsQ0FBQztvQkFDbkIsTUFBTSxDQUFDLEtBQUs7Z0JBQ2QsQ0FBQztnQkFDRCxFQUFFLEVBQUUsS0FBSyxZQUFZLElBQUksRUFBRSxDQUFDO29CQUMxQixNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTztnQkFDL0IsQ0FBQztnQkFDRCxFQUFFLEVBQUUsS0FBSyxZQUFZLE1BQU0sRUFBRSxDQUFDO29CQUM1QixNQUFNLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO2dCQUN6QixDQUFDO2dCQUNELEVBQUUsRUFBRSxLQUFLLFlBQVksaUJBQWlCLEVBQUUsQ0FBQztvQkFDdkMsTUFBTSxDQUFDLEtBQUs7Z0JBQ2QsQ0FBQztnQkFDRCxFQUFFLEVBQUUsS0FBSyxZQUFZLFdBQVcsRUFBRSxDQUFDO29CQUNqQyxLQUFLLENBQUMsTUFBTSxHQUFHLGdCQUFnQixDQUM3QixLQUFLLEVBQ0wsQ0FBQyxFQUNELEtBQUssQ0FBQyxVQUFVLEVBQ2hCLFdBQVc7b0JBRWIsZUFBZSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTTtvQkFDakMsTUFBTSxDQUFDLE1BQU07Z0JBQ2YsQ0FBQztnQkFDRCxFQUFFLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQztvQkFDOUIsS0FBSyxDQUFDLFlBQVksR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLE1BQU07b0JBQzVDLEVBQWtFLEFBQWxFLGdFQUFrRTtvQkFDbEUsRUFBb0UsQUFBcEUsa0VBQW9FO29CQUNwRSxFQUFzRSxBQUF0RSxvRUFBc0U7b0JBQ3RFLEVBQTRDLEFBQTVDLDBDQUE0QztvQkFDNUMsR0FBRyxDQUFDLE1BQU07b0JBQ1YsRUFBRSxFQUFFLEtBQUssWUFBWSxRQUFRLEVBQUUsQ0FBQzt3QkFDOUIsTUFBTSxHQUFHLEtBQUssQ0FBQyxVQUFVO29CQUMzQixDQUFDLE1BQU0sQ0FBQzt3QkFDTixFQUFtQyxBQUFuQyxpQ0FBbUM7d0JBQ25DLE1BQU0sR0FBSSxLQUFLLENBQVMsTUFBTTtvQkFDaEMsQ0FBQztvQkFDRCxFQUFtQyxBQUFuQyxpQ0FBbUM7b0JBQ25DLE1BQU0sQ0FBQyxHQUFHLENBQUUsS0FBSyxDQUFDLFdBQVcsQ0FDM0IsWUFBWSxFQUNaLEtBQUssQ0FBQyxVQUFVLEVBQ2hCLE1BQU07Z0JBRVYsQ0FBQztnQkFDRCxFQUFFLEVBQUUsS0FBSyxZQUFZLEdBQUcsRUFBRSxDQUFDO29CQUN6QixLQUFLLENBQUMsU0FBUyxHQUFHLEdBQUcsQ0FBQyxHQUFHO29CQUN6QixlQUFlLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxTQUFTO29CQUNwQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUssQ0FBQzt3QkFDdkIsU0FBUyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxDQUFDO29CQUMzQyxDQUFDO29CQUNELE1BQU0sQ0FBQyxTQUFTO2dCQUNsQixDQUFDO2dCQUNELEVBQUUsRUFBRSxLQUFLLFlBQVksR0FBRyxFQUFFLENBQUM7b0JBQ3pCLEVBQXdELEFBQXhELHNEQUF3RDtvQkFDeEQsS0FBSyxDQUFDLFNBQVMsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7MkJBQUcsS0FBSztvQkFBQSxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQVU7b0JBQ25ELGVBQWUsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFNBQVM7b0JBQ3BDLE1BQU0sQ0FBQyxTQUFTO2dCQUNsQixDQUFDO2dCQUVELEVBQXNCLEFBQXRCLG9CQUFzQjtnQkFDdEIsRUFBbUMsQUFBbkMsaUNBQW1DO2dCQUNuQyxLQUFLLENBQUMsU0FBUyxHQUFxQixDQUFDO2dCQUFBLENBQUM7Z0JBQ3RDLGVBQWUsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFNBQVM7Z0JBQ3BDLEtBQUssQ0FBQyxVQUFVLEdBQUcsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEtBQUs7Z0JBQ25ELEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRyxJQUFJLFVBQVUsQ0FBRSxDQUFDO29CQUM3QixTQUFTLENBQUMsR0FBRyxJQUFJLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRztnQkFDdkMsQ0FBQztnQkFDRCxPQUFPLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsY0FBYyxDQUFDLEtBQUs7Z0JBQzlELE1BQU0sQ0FBQyxTQUFTO1lBQ2xCLENBQUM7UUFDRCxJQUFJLENBQUMsQ0FBUTtRQUNiLElBQUksQ0FBQyxDQUFVOztZQUViLEtBQUssQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQTZCLDhCQUFFLENBQWdCOztBQUU1RSxDQUFDO0FBRUQsS0FBSyxDQUFDLElBQUksR0FBRyxJQUFJLEVBQUUsSUFBSTtBQUN2QixLQUFLLENBQUMsZUFBZSxHQUNuQixFQUFtQyxBQUFuQyxpQ0FBbUM7Q0FDbEMsVUFBVSxFQUFTLGVBQWU7QUFFckMsRUFJRyxBQUpIOzs7O0NBSUcsQUFKSCxFQUlHLFVBQ00sRUFBRSxDQUErQixLQUFRLEVBQUssQ0FBQztJQUN0RCxNQUFNLENBQUMsZUFBZSxHQUNsQixlQUFlLENBQUMsS0FBSyxJQUNyQixJQUFJLEdBQ0osSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssS0FDckMsVUFBVSxDQUFDLEtBQUs7QUFDdEIsQ0FBQztBQUVELEVBQXdFLEFBQXhFLG9FQUF3RSxBQUF4RSxFQUF3RSxDQUN4RSxFQUFtQyxBQUFuQyxpQ0FBbUM7QUFDbkMsTUFBTSxVQUFVLFVBQVUsQ0FBZ0MsS0FBUSxFQUFLLENBQUM7SUFDdEUsS0FBSyxDQUFDLEtBQUssR0FBRyxDQUFDO0lBQUEsQ0FBQztJQUNoQixHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxLQUFLLEtBQUssTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUcsQ0FBQztRQUNqRCxHQUFHLENBQUMsQ0FBQztZQUNILEtBQUssQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDLEtBQUs7WUFDNUIsS0FBSyxDQUFDLEdBQUcsSUFBZSxXQUFXO1FBQ3JDLENBQUMsQ0FBQyxLQUFLLEVBQUMsQ0FBQztRQUNQLEVBQTZDLEFBQTdDLDJDQUE2QztRQUMvQyxDQUFDO0lBQ0gsQ0FBQztJQUNELE1BQU0sQ0FBQyxLQUFLO0FBQ2QsQ0FBQyJ9