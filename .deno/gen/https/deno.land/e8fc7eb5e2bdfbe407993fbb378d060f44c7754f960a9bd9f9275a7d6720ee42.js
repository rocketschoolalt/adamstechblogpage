// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright Joyent, Inc. and other Node contributors.
// deno-lint-ignore-file no-inner-declarations
import { core } from "./_core.ts";
import { validateCallback } from "./internal/validators.mjs";
import { _exiting } from "./_process/exiting.ts";
import { FixedQueue } from "./internal/fixed_queue.ts";
const queue = new FixedQueue();
// deno-lint-ignore no-explicit-any
let _nextTick;
if (typeof core.setNextTickCallback !== "undefined") {
    function runNextTicks() {
        // FIXME(bartlomieju): Deno currently doesn't unhandled rejections
        // if (!hasTickScheduled() && !hasRejectionToWarn())
        //   runMicrotasks();
        // if (!hasTickScheduled() && !hasRejectionToWarn())
        //   return;
        if (!core.hasTickScheduled()) {
            core.runMicrotasks();
        }
        if (!core.hasTickScheduled()) {
            return true;
        }
        processTicksAndRejections();
        return true;
    }
    function processTicksAndRejections() {
        let tock;
        do {
            // deno-lint-ignore no-cond-assign
            while(tock = queue.shift()){
                // FIXME(bartlomieju): Deno currently doesn't support async hooks
                // const asyncId = tock[async_id_symbol];
                // emitBefore(asyncId, tock[trigger_async_id_symbol], tock);
                try {
                    const callback = tock.callback;
                    if (tock.args === undefined) {
                        callback();
                    } else {
                        const args = tock.args;
                        switch(args.length){
                            case 1:
                                callback(args[0]);
                                break;
                            case 2:
                                callback(args[0], args[1]);
                                break;
                            case 3:
                                callback(args[0], args[1], args[2]);
                                break;
                            case 4:
                                callback(args[0], args[1], args[2], args[3]);
                                break;
                            default:
                                callback(...args);
                        }
                    }
                } finally{
                // FIXME(bartlomieju): Deno currently doesn't support async hooks
                // if (destroyHooksExist())
                // emitDestroy(asyncId);
                }
            // FIXME(bartlomieju): Deno currently doesn't support async hooks
            // emitAfter(asyncId);
            }
            core.runMicrotasks();
        // FIXME(bartlomieju): Deno currently doesn't unhandled rejections
        // } while (!queue.isEmpty() || processPromiseRejections());
        }while (!queue.isEmpty())
        core.setHasTickScheduled(false);
    // FIXME(bartlomieju): Deno currently doesn't unhandled rejections
    // setHasRejectionToWarn(false);
    }
    core.setNextTickCallback(processTicksAndRejections);
    core.setMacrotaskCallback(runNextTicks);
    function __nextTickNative(callback, ...args) {
        validateCallback(callback);
        if (_exiting) {
            return;
        }
        // TODO(bartlomieju): seems superfluous if we don't depend on `arguments`
        let args_;
        switch(args.length){
            case 0:
                break;
            case 1:
                args_ = [
                    args[0]
                ];
                break;
            case 2:
                args_ = [
                    args[0],
                    args[1]
                ];
                break;
            case 3:
                args_ = [
                    args[0],
                    args[1],
                    args[2]
                ];
                break;
            default:
                args_ = new Array(args.length);
                for(let i = 0; i < args.length; i++){
                    args_[i] = args[i];
                }
        }
        if (queue.isEmpty()) {
            core.setHasTickScheduled(true);
        }
        // FIXME(bartlomieju): Deno currently doesn't support async hooks
        // const asyncId = newAsyncId();
        // const triggerAsyncId = getDefaultTriggerAsyncId();
        const tickObject = {
            // FIXME(bartlomieju): Deno currently doesn't support async hooks
            // [async_id_symbol]: asyncId,
            // [trigger_async_id_symbol]: triggerAsyncId,
            callback,
            args: args_
        };
        // FIXME(bartlomieju): Deno currently doesn't support async hooks
        // if (initHooksExist())
        //   emitInit(asyncId, 'TickObject', triggerAsyncId, tickObject);
        queue.push(tickObject);
    }
    _nextTick = __nextTickNative;
} else {
    function __nextTickQueueMicrotask(callback, ...args) {
        if (args) {
            queueMicrotask(()=>callback.call(this, ...args));
        } else {
            queueMicrotask(callback);
        }
    }
    _nextTick = __nextTickQueueMicrotask;
}
export function nextTick(callback, ...args) {
    _nextTick(callback, ...args);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvX25leHRfdGljay50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG5cbi8vIGRlbm8tbGludC1pZ25vcmUtZmlsZSBuby1pbm5lci1kZWNsYXJhdGlvbnNcblxuaW1wb3J0IHsgY29yZSB9IGZyb20gXCIuL19jb3JlLnRzXCI7XG5pbXBvcnQgeyB2YWxpZGF0ZUNhbGxiYWNrIH0gZnJvbSBcIi4vaW50ZXJuYWwvdmFsaWRhdG9ycy5tanNcIjtcbmltcG9ydCB7IF9leGl0aW5nIH0gZnJvbSBcIi4vX3Byb2Nlc3MvZXhpdGluZy50c1wiO1xuaW1wb3J0IHsgRml4ZWRRdWV1ZSB9IGZyb20gXCIuL2ludGVybmFsL2ZpeGVkX3F1ZXVlLnRzXCI7XG5cbmludGVyZmFjZSBUb2NrIHtcbiAgY2FsbGJhY2s6ICguLi5hcmdzOiBBcnJheTx1bmtub3duPikgPT4gdm9pZDtcbiAgYXJnczogQXJyYXk8dW5rbm93bj47XG59XG5cbmNvbnN0IHF1ZXVlID0gbmV3IEZpeGVkUXVldWUoKTtcblxuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmxldCBfbmV4dFRpY2s6IGFueTtcblxuaWYgKHR5cGVvZiBjb3JlLnNldE5leHRUaWNrQ2FsbGJhY2sgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgZnVuY3Rpb24gcnVuTmV4dFRpY2tzKCkge1xuICAgIC8vIEZJWE1FKGJhcnRsb21pZWp1KTogRGVubyBjdXJyZW50bHkgZG9lc24ndCB1bmhhbmRsZWQgcmVqZWN0aW9uc1xuICAgIC8vIGlmICghaGFzVGlja1NjaGVkdWxlZCgpICYmICFoYXNSZWplY3Rpb25Ub1dhcm4oKSlcbiAgICAvLyAgIHJ1bk1pY3JvdGFza3MoKTtcbiAgICAvLyBpZiAoIWhhc1RpY2tTY2hlZHVsZWQoKSAmJiAhaGFzUmVqZWN0aW9uVG9XYXJuKCkpXG4gICAgLy8gICByZXR1cm47XG4gICAgaWYgKCFjb3JlLmhhc1RpY2tTY2hlZHVsZWQoKSkge1xuICAgICAgY29yZS5ydW5NaWNyb3Rhc2tzKCk7XG4gICAgfVxuICAgIGlmICghY29yZS5oYXNUaWNrU2NoZWR1bGVkKCkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHByb2Nlc3NUaWNrc0FuZFJlamVjdGlvbnMoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHByb2Nlc3NUaWNrc0FuZFJlamVjdGlvbnMoKSB7XG4gICAgbGV0IHRvY2s7XG4gICAgZG8ge1xuICAgICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1jb25kLWFzc2lnblxuICAgICAgd2hpbGUgKHRvY2sgPSBxdWV1ZS5zaGlmdCgpKSB7XG4gICAgICAgIC8vIEZJWE1FKGJhcnRsb21pZWp1KTogRGVubyBjdXJyZW50bHkgZG9lc24ndCBzdXBwb3J0IGFzeW5jIGhvb2tzXG4gICAgICAgIC8vIGNvbnN0IGFzeW5jSWQgPSB0b2NrW2FzeW5jX2lkX3N5bWJvbF07XG4gICAgICAgIC8vIGVtaXRCZWZvcmUoYXN5bmNJZCwgdG9ja1t0cmlnZ2VyX2FzeW5jX2lkX3N5bWJvbF0sIHRvY2spO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY2FsbGJhY2sgPSAodG9jayBhcyBUb2NrKS5jYWxsYmFjaztcbiAgICAgICAgICBpZiAoKHRvY2sgYXMgVG9jaykuYXJncyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBhcmdzID0gKHRvY2sgYXMgVG9jaykuYXJncztcbiAgICAgICAgICAgIHN3aXRjaCAoYXJncy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGFyZ3NbMF0pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soYXJnc1swXSwgYXJnc1sxXSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhhcmdzWzBdLCBhcmdzWzFdLCBhcmdzWzJdKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgY2FzZSA0OlxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGFyZ3NbM10pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKC4uLmFyZ3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAvLyBGSVhNRShiYXJ0bG9taWVqdSk6IERlbm8gY3VycmVudGx5IGRvZXNuJ3Qgc3VwcG9ydCBhc3luYyBob29rc1xuICAgICAgICAgIC8vIGlmIChkZXN0cm95SG9va3NFeGlzdCgpKVxuICAgICAgICAgIC8vIGVtaXREZXN0cm95KGFzeW5jSWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRklYTUUoYmFydGxvbWllanUpOiBEZW5vIGN1cnJlbnRseSBkb2Vzbid0IHN1cHBvcnQgYXN5bmMgaG9va3NcbiAgICAgICAgLy8gZW1pdEFmdGVyKGFzeW5jSWQpO1xuICAgICAgfVxuICAgICAgY29yZS5ydW5NaWNyb3Rhc2tzKCk7XG4gICAgICAvLyBGSVhNRShiYXJ0bG9taWVqdSk6IERlbm8gY3VycmVudGx5IGRvZXNuJ3QgdW5oYW5kbGVkIHJlamVjdGlvbnNcbiAgICAgIC8vIH0gd2hpbGUgKCFxdWV1ZS5pc0VtcHR5KCkgfHwgcHJvY2Vzc1Byb21pc2VSZWplY3Rpb25zKCkpO1xuICAgIH0gd2hpbGUgKCFxdWV1ZS5pc0VtcHR5KCkpO1xuICAgIGNvcmUuc2V0SGFzVGlja1NjaGVkdWxlZChmYWxzZSk7XG4gICAgLy8gRklYTUUoYmFydGxvbWllanUpOiBEZW5vIGN1cnJlbnRseSBkb2Vzbid0IHVuaGFuZGxlZCByZWplY3Rpb25zXG4gICAgLy8gc2V0SGFzUmVqZWN0aW9uVG9XYXJuKGZhbHNlKTtcbiAgfVxuXG4gIGNvcmUuc2V0TmV4dFRpY2tDYWxsYmFjayhwcm9jZXNzVGlja3NBbmRSZWplY3Rpb25zKTtcbiAgY29yZS5zZXRNYWNyb3Rhc2tDYWxsYmFjayhydW5OZXh0VGlja3MpO1xuXG4gIGZ1bmN0aW9uIF9fbmV4dFRpY2tOYXRpdmU8VCBleHRlbmRzIEFycmF5PHVua25vd24+PihcbiAgICB0aGlzOiB1bmtub3duLFxuICAgIGNhbGxiYWNrOiAoLi4uYXJnczogVCkgPT4gdm9pZCxcbiAgICAuLi5hcmdzOiBUXG4gICkge1xuICAgIHZhbGlkYXRlQ2FsbGJhY2soY2FsbGJhY2spO1xuXG4gICAgaWYgKF9leGl0aW5nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gVE9ETyhiYXJ0bG9taWVqdSk6IHNlZW1zIHN1cGVyZmx1b3VzIGlmIHdlIGRvbid0IGRlcGVuZCBvbiBgYXJndW1lbnRzYFxuICAgIGxldCBhcmdzXztcbiAgICBzd2l0Y2ggKGFyZ3MubGVuZ3RoKSB7XG4gICAgICBjYXNlIDA6XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAxOlxuICAgICAgICBhcmdzXyA9IFthcmdzWzBdXTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDI6XG4gICAgICAgIGFyZ3NfID0gW2FyZ3NbMF0sIGFyZ3NbMV1dO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzpcbiAgICAgICAgYXJnc18gPSBbYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXV07XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgYXJnc18gPSBuZXcgQXJyYXkoYXJncy5sZW5ndGgpO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBhcmdzX1tpXSA9IGFyZ3NbaV07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocXVldWUuaXNFbXB0eSgpKSB7XG4gICAgICBjb3JlLnNldEhhc1RpY2tTY2hlZHVsZWQodHJ1ZSk7XG4gICAgfVxuICAgIC8vIEZJWE1FKGJhcnRsb21pZWp1KTogRGVubyBjdXJyZW50bHkgZG9lc24ndCBzdXBwb3J0IGFzeW5jIGhvb2tzXG4gICAgLy8gY29uc3QgYXN5bmNJZCA9IG5ld0FzeW5jSWQoKTtcbiAgICAvLyBjb25zdCB0cmlnZ2VyQXN5bmNJZCA9IGdldERlZmF1bHRUcmlnZ2VyQXN5bmNJZCgpO1xuICAgIGNvbnN0IHRpY2tPYmplY3QgPSB7XG4gICAgICAvLyBGSVhNRShiYXJ0bG9taWVqdSk6IERlbm8gY3VycmVudGx5IGRvZXNuJ3Qgc3VwcG9ydCBhc3luYyBob29rc1xuICAgICAgLy8gW2FzeW5jX2lkX3N5bWJvbF06IGFzeW5jSWQsXG4gICAgICAvLyBbdHJpZ2dlcl9hc3luY19pZF9zeW1ib2xdOiB0cmlnZ2VyQXN5bmNJZCxcbiAgICAgIGNhbGxiYWNrLFxuICAgICAgYXJnczogYXJnc18sXG4gICAgfTtcbiAgICAvLyBGSVhNRShiYXJ0bG9taWVqdSk6IERlbm8gY3VycmVudGx5IGRvZXNuJ3Qgc3VwcG9ydCBhc3luYyBob29rc1xuICAgIC8vIGlmIChpbml0SG9va3NFeGlzdCgpKVxuICAgIC8vICAgZW1pdEluaXQoYXN5bmNJZCwgJ1RpY2tPYmplY3QnLCB0cmlnZ2VyQXN5bmNJZCwgdGlja09iamVjdCk7XG4gICAgcXVldWUucHVzaCh0aWNrT2JqZWN0KTtcbiAgfVxuICBfbmV4dFRpY2sgPSBfX25leHRUaWNrTmF0aXZlO1xufSBlbHNlIHtcbiAgZnVuY3Rpb24gX19uZXh0VGlja1F1ZXVlTWljcm90YXNrPFQgZXh0ZW5kcyBBcnJheTx1bmtub3duPj4oXG4gICAgdGhpczogdW5rbm93bixcbiAgICBjYWxsYmFjazogKC4uLmFyZ3M6IFQpID0+IHZvaWQsXG4gICAgLi4uYXJnczogVFxuICApIHtcbiAgICBpZiAoYXJncykge1xuICAgICAgcXVldWVNaWNyb3Rhc2soKCkgPT4gY2FsbGJhY2suY2FsbCh0aGlzLCAuLi5hcmdzKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHF1ZXVlTWljcm90YXNrKGNhbGxiYWNrKTtcbiAgICB9XG4gIH1cblxuICBfbmV4dFRpY2sgPSBfX25leHRUaWNrUXVldWVNaWNyb3Rhc2s7XG59XG5cbi8vIGBuZXh0VGljaygpYCB3aWxsIG5vdCBlbnF1ZXVlIGFueSBjYWxsYmFjayB3aGVuIHRoZSBwcm9jZXNzIGlzIGFib3V0IHRvXG4vLyBleGl0IHNpbmNlIHRoZSBjYWxsYmFjayB3b3VsZCBub3QgaGF2ZSBhIGNoYW5jZSB0byBiZSBleGVjdXRlZC5cbmV4cG9ydCBmdW5jdGlvbiBuZXh0VGljayh0aGlzOiB1bmtub3duLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQ7XG5leHBvcnQgZnVuY3Rpb24gbmV4dFRpY2s8VCBleHRlbmRzIEFycmF5PHVua25vd24+PihcbiAgdGhpczogdW5rbm93bixcbiAgY2FsbGJhY2s6ICguLi5hcmdzOiBUKSA9PiB2b2lkLFxuICAuLi5hcmdzOiBUXG4pOiB2b2lkO1xuZXhwb3J0IGZ1bmN0aW9uIG5leHRUaWNrPFQgZXh0ZW5kcyBBcnJheTx1bmtub3duPj4oXG4gIHRoaXM6IHVua25vd24sXG4gIGNhbGxiYWNrOiAoLi4uYXJnczogVCkgPT4gdm9pZCxcbiAgLi4uYXJnczogVFxuKSB7XG4gIF9uZXh0VGljayhjYWxsYmFjaywgLi4uYXJncyk7XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLHNEQUFzRDtBQUV0RCw4Q0FBOEM7QUFFOUMsU0FBUyxJQUFJLFFBQVEsWUFBWSxDQUFDO0FBQ2xDLFNBQVMsZ0JBQWdCLFFBQVEsMkJBQTJCLENBQUM7QUFDN0QsU0FBUyxRQUFRLFFBQVEsdUJBQXVCLENBQUM7QUFDakQsU0FBUyxVQUFVLFFBQVEsMkJBQTJCLENBQUM7QUFPdkQsTUFBTSxLQUFLLEdBQUcsSUFBSSxVQUFVLEVBQUUsQUFBQztBQUUvQixtQ0FBbUM7QUFDbkMsSUFBSSxTQUFTLEFBQUssQUFBQztBQUVuQixJQUFJLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixLQUFLLFdBQVcsRUFBRTtJQUNuRCxTQUFTLFlBQVksR0FBRztRQUN0QixrRUFBa0U7UUFDbEUsb0RBQW9EO1FBQ3BELHFCQUFxQjtRQUNyQixvREFBb0Q7UUFDcEQsWUFBWTtRQUNaLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsRUFBRTtZQUM1QixJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7U0FDdEI7UUFDRCxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEVBQUU7WUFDNUIsT0FBTyxJQUFJLENBQUM7U0FDYjtRQUVELHlCQUF5QixFQUFFLENBQUM7UUFDNUIsT0FBTyxJQUFJLENBQUM7S0FDYjtJQUVELFNBQVMseUJBQXlCLEdBQUc7UUFDbkMsSUFBSSxJQUFJLEFBQUM7UUFDVCxHQUFHO1lBQ0Qsa0NBQWtDO1lBQ2xDLE1BQU8sSUFBSSxHQUFHLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBRTtnQkFDM0IsaUVBQWlFO2dCQUNqRSx5Q0FBeUM7Z0JBQ3pDLDREQUE0RDtnQkFFNUQsSUFBSTtvQkFDRixNQUFNLFFBQVEsR0FBRyxBQUFDLElBQUksQ0FBVSxRQUFRLEFBQUM7b0JBQ3pDLElBQUksQUFBQyxJQUFJLENBQVUsSUFBSSxLQUFLLFNBQVMsRUFBRTt3QkFDckMsUUFBUSxFQUFFLENBQUM7cUJBQ1osTUFBTTt3QkFDTCxNQUFNLElBQUksR0FBRyxBQUFDLElBQUksQ0FBVSxJQUFJLEFBQUM7d0JBQ2pDLE9BQVEsSUFBSSxDQUFDLE1BQU07NEJBQ2pCLEtBQUssQ0FBQztnQ0FDSixRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0NBQ2xCLE1BQU07NEJBQ1IsS0FBSyxDQUFDO2dDQUNKLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0NBQzNCLE1BQU07NEJBQ1IsS0FBSyxDQUFDO2dDQUNKLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dDQUNwQyxNQUFNOzRCQUNSLEtBQUssQ0FBQztnQ0FDSixRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0NBQzdDLE1BQU07NEJBQ1I7Z0NBQ0UsUUFBUSxJQUFJLElBQUksQ0FBQyxDQUFDO3lCQUNyQjtxQkFDRjtpQkFDRixRQUFTO2dCQUNSLGlFQUFpRTtnQkFDakUsMkJBQTJCO2dCQUMzQix3QkFBd0I7aUJBQ3pCO1lBRUQsaUVBQWlFO1lBQ2pFLHNCQUFzQjthQUN2QjtZQUNELElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNyQixrRUFBa0U7UUFDbEUsNERBQTREO1NBQzdELE9BQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUU7UUFDM0IsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2hDLGtFQUFrRTtJQUNsRSxnQ0FBZ0M7S0FDakM7SUFFRCxJQUFJLENBQUMsbUJBQW1CLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUNwRCxJQUFJLENBQUMsb0JBQW9CLENBQUMsWUFBWSxDQUFDLENBQUM7SUFFeEMsU0FBUyxnQkFBZ0IsQ0FFdkIsUUFBOEIsRUFDOUIsR0FBRyxJQUFJLEFBQUcsRUFDVjtRQUNBLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRTNCLElBQUksUUFBUSxFQUFFO1lBQ1osT0FBTztTQUNSO1FBRUQseUVBQXlFO1FBQ3pFLElBQUksS0FBSyxBQUFDO1FBQ1YsT0FBUSxJQUFJLENBQUMsTUFBTTtZQUNqQixLQUFLLENBQUM7Z0JBQ0osTUFBTTtZQUNSLEtBQUssQ0FBQztnQkFDSixLQUFLLEdBQUc7b0JBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztpQkFBQyxDQUFDO2dCQUNsQixNQUFNO1lBQ1IsS0FBSyxDQUFDO2dCQUNKLEtBQUssR0FBRztvQkFBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7aUJBQUMsQ0FBQztnQkFDM0IsTUFBTTtZQUNSLEtBQUssQ0FBQztnQkFDSixLQUFLLEdBQUc7b0JBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7aUJBQUMsQ0FBQztnQkFDcEMsTUFBTTtZQUNSO2dCQUNFLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQy9CLElBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFFO29CQUNwQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2lCQUNwQjtTQUNKO1FBRUQsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDbkIsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ2hDO1FBQ0QsaUVBQWlFO1FBQ2pFLGdDQUFnQztRQUNoQyxxREFBcUQ7UUFDckQsTUFBTSxVQUFVLEdBQUc7WUFDakIsaUVBQWlFO1lBQ2pFLDhCQUE4QjtZQUM5Qiw2Q0FBNkM7WUFDN0MsUUFBUTtZQUNSLElBQUksRUFBRSxLQUFLO1NBQ1osQUFBQztRQUNGLGlFQUFpRTtRQUNqRSx3QkFBd0I7UUFDeEIsaUVBQWlFO1FBQ2pFLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7S0FDeEI7SUFDRCxTQUFTLEdBQUcsZ0JBQWdCLENBQUM7Q0FDOUIsTUFBTTtJQUNMLFNBQVMsd0JBQXdCLENBRS9CLFFBQThCLEVBQzlCLEdBQUcsSUFBSSxBQUFHLEVBQ1Y7UUFDQSxJQUFJLElBQUksRUFBRTtZQUNSLGNBQWMsQ0FBQyxJQUFNLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7U0FDcEQsTUFBTTtZQUNMLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUMxQjtLQUNGO0lBRUQsU0FBUyxHQUFHLHdCQUF3QixDQUFDO0NBQ3RDO0FBVUQsT0FBTyxTQUFTLFFBQVEsQ0FFdEIsUUFBOEIsRUFDOUIsR0FBRyxJQUFJLEFBQUcsRUFDVjtJQUNBLFNBQVMsQ0FBQyxRQUFRLEtBQUssSUFBSSxDQUFDLENBQUM7Q0FDOUIifQ==