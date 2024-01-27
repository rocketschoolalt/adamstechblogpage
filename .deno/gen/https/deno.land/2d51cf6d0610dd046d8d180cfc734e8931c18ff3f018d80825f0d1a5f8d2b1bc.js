// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright Joyent, Inc. and Node.js contributors. All rights reserved. MIT license.
import * as DenoUnstable from "../_deno_unstable.ts";
import { warnNotImplemented } from "./_utils.ts";
import { EventEmitter } from "./events.ts";
import { validateString } from "./internal/validators.mjs";
import { ERR_INVALID_ARG_TYPE, ERR_UNKNOWN_SIGNAL } from "./internal/errors.ts";
import { getOptionValue } from "./internal/options.ts";
import { assert } from "../_util/assert.ts";
import { fromFileUrl, join } from "../path/mod.ts";
import { arch, chdir, cwd, env, nextTick as _nextTick, pid, platform, version, versions } from "./_process/process.ts";
import { _exiting } from "./_process/exiting.ts";
export { _nextTick as nextTick, arch, chdir, cwd, env, pid, platform, version, versions };
import { stderr as stderr_, stdin as stdin_, stdout as stdout_ } from "./_process/streams.mjs";
// TODO(kt3k): Give better types to stdio objects
// deno-lint-ignore no-explicit-any
const stderr = stderr_;
// deno-lint-ignore no-explicit-any
const stdin = stdin_;
// deno-lint-ignore no-explicit-any
const stdout = stdout_;
export { stderr, stdin, stdout };
import { getBinding } from "./internal_binding/mod.ts";
import { buildAllowedFlags } from "./internal/process/per_thread.mjs";
const notImplementedEvents = [
    "beforeExit",
    "disconnect",
    "message",
    "multipleResolves",
    "rejectionHandled",
    "uncaughtException",
    "uncaughtExceptionMonitor",
    "unhandledRejection",
    "worker", 
];
// The first 2 items are placeholders.
// They will be overwritten by the below Object.defineProperty calls.
const argv = [
    "",
    "",
    ...Deno.args
];
// Overwrites the 1st item with getter.
Object.defineProperty(argv, "0", {
    get: Deno.execPath
});
// Overwrites the 2st item with getter.
Object.defineProperty(argv, "1", {
    get: ()=>{
        if (Deno.mainModule.startsWith("file:")) {
            return fromFileUrl(Deno.mainModule);
        } else {
            return join(Deno.cwd(), "$deno$node.js");
        }
    }
});
/** https://nodejs.org/api/process.html#process_process_exit_code */ export const exit = (code)=>{
    if (code || code === 0) {
        if (typeof code === "string") {
            const parsedCode = parseInt(code);
            process.exitCode = isNaN(parsedCode) ? undefined : parsedCode;
        } else {
            process.exitCode = code;
        }
    }
    if (!process._exiting) {
        process._exiting = true;
        process.emit("exit", process.exitCode || 0);
    }
    Deno.exit(process.exitCode || 0);
};
function addReadOnlyProcessAlias(name, option, enumerable = true) {
    const value = getOptionValue(option);
    if (value) {
        Object.defineProperty(process, name, {
            writable: false,
            configurable: true,
            enumerable,
            value
        });
    }
}
function createWarningObject(warning, type, code, // deno-lint-ignore ban-types
ctor, detail) {
    assert(typeof warning === "string");
    // deno-lint-ignore no-explicit-any
    const warningErr = new Error(warning);
    warningErr.name = String(type || "Warning");
    if (code !== undefined) {
        warningErr.code = code;
    }
    if (detail !== undefined) {
        warningErr.detail = detail;
    }
    // @ts-ignore this function is not available in lib.dom.d.ts
    Error.captureStackTrace(warningErr, ctor || process.emitWarning);
    return warningErr;
}
function doEmitWarning(warning) {
    process.emit("warning", warning);
}
/** https://nodejs.org/api/process.html#process_process_emitwarning_warning_options */ export function emitWarning(warning, type, code, // deno-lint-ignore ban-types
ctor) {
    let detail;
    if (type !== null && typeof type === "object" && !Array.isArray(type)) {
        ctor = type.ctor;
        code = type.code;
        if (typeof type.detail === "string") {
            detail = type.detail;
        }
        type = type.type || "Warning";
    } else if (typeof type === "function") {
        ctor = type;
        code = undefined;
        type = "Warning";
    }
    if (type !== undefined) {
        validateString(type, "type");
    }
    if (typeof code === "function") {
        ctor = code;
        code = undefined;
    } else if (code !== undefined) {
        validateString(code, "code");
    }
    if (typeof warning === "string") {
        warning = createWarningObject(warning, type, code, ctor, detail);
    } else if (!(warning instanceof Error)) {
        throw new ERR_INVALID_ARG_TYPE("warning", [
            "Error",
            "string"
        ], warning);
    }
    if (warning.name === "DeprecationWarning") {
        // deno-lint-ignore no-explicit-any
        if (process.noDeprecation) {
            return;
        }
        // deno-lint-ignore no-explicit-any
        if (process.throwDeprecation) {
            // Delay throwing the error to guarantee that all former warnings were
            // properly logged.
            return process.nextTick(()=>{
                throw warning;
            });
        }
    }
    process.nextTick(doEmitWarning, warning);
}
function hrtime(time) {
    const milli = performance.now();
    const sec = Math.floor(milli / 1000);
    const nano = Math.floor(milli * 1_000_000 - sec * 1_000_000_000);
    if (!time) {
        return [
            sec,
            nano
        ];
    }
    const [prevSec, prevNano] = time;
    return [
        sec - prevSec,
        nano - prevNano
    ];
}
hrtime.bigint = function() {
    const [sec, nano] = hrtime();
    return BigInt(sec) * 1_000_000_000n + BigInt(nano);
};
function memoryUsage() {
    return {
        ...Deno.memoryUsage(),
        arrayBuffers: 0
    };
}
memoryUsage.rss = function() {
    return memoryUsage().rss;
};
export function kill(pid, sig = "SIGTERM") {
    if (pid != (pid | 0)) {
        throw new ERR_INVALID_ARG_TYPE("pid", "number", pid);
    }
    if (typeof sig === "string") {
        try {
            Deno.kill(pid, sig);
        } catch (e) {
            if (e instanceof TypeError) {
                throw new ERR_UNKNOWN_SIGNAL(sig);
            }
            throw e;
        }
    } else {
        throw new ERR_UNKNOWN_SIGNAL(sig.toString());
    }
    return true;
}
class Process extends EventEmitter {
    constructor(){
        super();
        globalThis.addEventListener("unload", ()=>{
            if (!process._exiting) {
                process._exiting = true;
                super.emit("exit", process.exitCode || 0);
            }
        });
    }
    /** https://nodejs.org/api/process.html#process_process_arch */ arch = arch;
    /**
   * https://nodejs.org/api/process.html#process_process_argv
   * Read permissions are required in order to get the executable route
   */ argv = argv;
    /** https://nodejs.org/api/process.html#process_process_chdir_directory */ chdir = chdir;
    /** https://nodejs.org/api/process.html#processconfig */ config = {
        target_defaults: {},
        variables: {}
    };
    /** https://nodejs.org/api/process.html#process_process_cwd */ cwd = cwd;
    /**
   * https://nodejs.org/api/process.html#process_process_env
   * Requires env permissions
   */ env = env;
    /** https://nodejs.org/api/process.html#process_process_execargv */ execArgv = [];
    /** https://nodejs.org/api/process.html#process_process_exit_code */ exit = exit;
    _exiting = _exiting;
    /** https://nodejs.org/api/process.html#processexitcode_1 */ exitCode = undefined;
    // Typed as any to avoid importing "module" module for types
    // deno-lint-ignore no-explicit-any
    mainModule = undefined;
    /** https://nodejs.org/api/process.html#process_process_nexttick_callback_args */ nextTick = _nextTick;
    // deno-lint-ignore no-explicit-any
    on(event, listener) {
        if (notImplementedEvents.includes(event)) {
            warnNotImplemented(`process.on("${event}")`);
            super.on(event, listener);
        } else if (event.startsWith("SIG")) {
            if (event === "SIGBREAK" && Deno.build.os !== "windows") {
            // Ignores SIGBREAK if the platform is not windows.
            } else {
                DenoUnstable.addSignalListener(event, listener);
            }
        } else {
            super.on(event, listener);
        }
        return this;
    }
    // deno-lint-ignore no-explicit-any
    off(event, listener) {
        if (notImplementedEvents.includes(event)) {
            warnNotImplemented(`process.off("${event}")`);
            super.off(event, listener);
        } else if (event.startsWith("SIG")) {
            if (event === "SIGBREAK" && Deno.build.os !== "windows") {
            // Ignores SIGBREAK if the platform is not windows.
            } else {
                DenoUnstable.removeSignalListener(event, listener);
            }
        } else {
            super.off(event, listener);
        }
        return this;
    }
    // deno-lint-ignore no-explicit-any
    emit(event, ...args) {
        if (event.startsWith("SIG")) {
            if (event === "SIGBREAK" && Deno.build.os !== "windows") {
            // Ignores SIGBREAK if the platform is not windows.
            } else {
                Deno.kill(Deno.pid, event);
            }
        } else {
            return super.emit(event, ...args);
        }
        return true;
    }
    prependListener(event, // deno-lint-ignore no-explicit-any
    listener) {
        if (notImplementedEvents.includes(event)) {
            warnNotImplemented(`process.prependListener("${event}")`);
            super.prependListener(event, listener);
        } else if (event.startsWith("SIG")) {
            if (event === "SIGBREAK" && Deno.build.os !== "windows") {
            // Ignores SIGBREAK if the platform is not windows.
            } else {
                DenoUnstable.addSignalListener(event, listener);
            }
        } else {
            super.prependListener(event, listener);
        }
        return this;
    }
    /** https://nodejs.org/api/process.html#process_process_pid */ pid = pid;
    /** https://nodejs.org/api/process.html#process_process_platform */ platform = platform;
    addListener(event, // deno-lint-ignore no-explicit-any
    listener) {
        if (notImplementedEvents.includes(event)) {
            warnNotImplemented(`process.addListener("${event}")`);
        }
        return this.on(event, listener);
    }
    removeListener(event, // deno-lint-ignore no-explicit-any
    listener) {
        if (notImplementedEvents.includes(event)) {
            warnNotImplemented(`process.removeListener("${event}")`);
        }
        return this.off(event, listener);
    }
    /**
   * Returns the current high-resolution real time in a [seconds, nanoseconds]
   * tuple.
   *
   * Note: You need to give --allow-hrtime permission to Deno to actually get
   * nanoseconds precision values. If you don't give 'hrtime' permission, the returned
   * values only have milliseconds precision.
   *
   * `time` is an optional parameter that must be the result of a previous process.hrtime() call to diff with the current time.
   *
   * These times are relative to an arbitrary time in the past, and not related to the time of day and therefore not subject to clock drift. The primary use is for measuring performance between intervals.
   * https://nodejs.org/api/process.html#process_process_hrtime_time
   */ hrtime = hrtime;
    /** https://nodejs.org/api/process.html#processkillpid-signal */ kill = kill;
    memoryUsage = memoryUsage;
    /** https://nodejs.org/api/process.html#process_process_stderr */ stderr = stderr;
    /** https://nodejs.org/api/process.html#process_process_stdin */ stdin = stdin;
    /** https://nodejs.org/api/process.html#process_process_stdout */ stdout = stdout;
    /** https://nodejs.org/api/process.html#process_process_version */ version = version;
    /** https://nodejs.org/api/process.html#process_process_versions */ versions = versions;
    /** https://nodejs.org/api/process.html#process_process_emitwarning_warning_options */ emitWarning = emitWarning;
    binding(name) {
        return getBinding(name);
    }
    /** https://nodejs.org/api/process.html#processumaskmask */ umask() {
        // Always return the system default umask value.
        // We don't use Deno.umask here because it has a race
        // condition bug.
        // See https://github.com/denoland/deno_std/issues/1893#issuecomment-1032897779
        return 0o22;
    }
    /** https://nodejs.org/api/process.html#processgetuid */ getuid() {
        // TODO(kt3k): return user id in mac and linux
        return NaN;
    }
    /** https://nodejs.org/api/process.html#processgetgid */ getgid() {
        // TODO(kt3k): return group id in mac and linux
        return NaN;
    }
    // TODO(kt3k): Implement this when we added -e option to node compat mode
    _eval = undefined;
    /** https://nodejs.org/api/process.html#processexecpath */ get execPath() {
        return argv[0];
    }
    #startTime = Date.now();
    /** https://nodejs.org/api/process.html#processuptime */ uptime() {
        return (Date.now() - this.#startTime) / 1000;
    }
    #allowedFlags = buildAllowedFlags();
    /** https://nodejs.org/api/process.html#processallowednodeenvironmentflags */ get allowedNodeEnvironmentFlags() {
        return this.#allowedFlags;
    }
    features = {
        inspector: false
    };
}
/** https://nodejs.org/api/process.html#process_process */ const process = new Process();
Object.defineProperty(process, Symbol.toStringTag, {
    enumerable: false,
    writable: true,
    configurable: false,
    value: "process"
});
addReadOnlyProcessAlias("noDeprecation", "--no-deprecation");
addReadOnlyProcessAlias("throwDeprecation", "--throw-deprecation");
export const removeListener = process.removeListener;
export const removeAllListeners = process.removeAllListeners;
export default process;
//TODO(Soremwar)
//Remove on 1.0
//Kept for backwards compatibility with std
export { process };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvcHJvY2Vzcy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIyIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgTm9kZS5qcyBjb250cmlidXRvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuaW1wb3J0ICogYXMgRGVub1Vuc3RhYmxlIGZyb20gXCIuLi9fZGVub191bnN0YWJsZS50c1wiO1xuaW1wb3J0IHsgd2Fybk5vdEltcGxlbWVudGVkIH0gZnJvbSBcIi4vX3V0aWxzLnRzXCI7XG5pbXBvcnQgeyBFdmVudEVtaXR0ZXIgfSBmcm9tIFwiLi9ldmVudHMudHNcIjtcbmltcG9ydCB7IHZhbGlkYXRlU3RyaW5nIH0gZnJvbSBcIi4vaW50ZXJuYWwvdmFsaWRhdG9ycy5tanNcIjtcbmltcG9ydCB7IEVSUl9JTlZBTElEX0FSR19UWVBFLCBFUlJfVU5LTk9XTl9TSUdOQUwgfSBmcm9tIFwiLi9pbnRlcm5hbC9lcnJvcnMudHNcIjtcbmltcG9ydCB7IGdldE9wdGlvblZhbHVlIH0gZnJvbSBcIi4vaW50ZXJuYWwvb3B0aW9ucy50c1wiO1xuaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcIi4uL191dGlsL2Fzc2VydC50c1wiO1xuaW1wb3J0IHsgZnJvbUZpbGVVcmwsIGpvaW4gfSBmcm9tIFwiLi4vcGF0aC9tb2QudHNcIjtcbmltcG9ydCB7XG4gIGFyY2gsXG4gIGNoZGlyLFxuICBjd2QsXG4gIGVudixcbiAgbmV4dFRpY2sgYXMgX25leHRUaWNrLFxuICBwaWQsXG4gIHBsYXRmb3JtLFxuICB2ZXJzaW9uLFxuICB2ZXJzaW9ucyxcbn0gZnJvbSBcIi4vX3Byb2Nlc3MvcHJvY2Vzcy50c1wiO1xuaW1wb3J0IHsgX2V4aXRpbmcgfSBmcm9tIFwiLi9fcHJvY2Vzcy9leGl0aW5nLnRzXCI7XG5leHBvcnQge1xuICBfbmV4dFRpY2sgYXMgbmV4dFRpY2ssXG4gIGFyY2gsXG4gIGNoZGlyLFxuICBjd2QsXG4gIGVudixcbiAgcGlkLFxuICBwbGF0Zm9ybSxcbiAgdmVyc2lvbixcbiAgdmVyc2lvbnMsXG59O1xuaW1wb3J0IHtcbiAgc3RkZXJyIGFzIHN0ZGVycl8sXG4gIHN0ZGluIGFzIHN0ZGluXyxcbiAgc3Rkb3V0IGFzIHN0ZG91dF8sXG59IGZyb20gXCIuL19wcm9jZXNzL3N0cmVhbXMubWpzXCI7XG4vLyBUT0RPKGt0M2spOiBHaXZlIGJldHRlciB0eXBlcyB0byBzdGRpbyBvYmplY3RzXG4vLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuY29uc3Qgc3RkZXJyID0gc3RkZXJyXyBhcyBhbnk7XG4vLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuY29uc3Qgc3RkaW4gPSBzdGRpbl8gYXMgYW55O1xuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmNvbnN0IHN0ZG91dCA9IHN0ZG91dF8gYXMgYW55O1xuZXhwb3J0IHsgc3RkZXJyLCBzdGRpbiwgc3Rkb3V0IH07XG5pbXBvcnQgeyBnZXRCaW5kaW5nIH0gZnJvbSBcIi4vaW50ZXJuYWxfYmluZGluZy9tb2QudHNcIjtcbmltcG9ydCB0eXBlIHsgQmluZGluZ05hbWUgfSBmcm9tIFwiLi9pbnRlcm5hbF9iaW5kaW5nL21vZC50c1wiO1xuaW1wb3J0IHsgYnVpbGRBbGxvd2VkRmxhZ3MgfSBmcm9tIFwiLi9pbnRlcm5hbC9wcm9jZXNzL3Blcl90aHJlYWQubWpzXCI7XG5cbmNvbnN0IG5vdEltcGxlbWVudGVkRXZlbnRzID0gW1xuICBcImJlZm9yZUV4aXRcIixcbiAgXCJkaXNjb25uZWN0XCIsXG4gIFwibWVzc2FnZVwiLFxuICBcIm11bHRpcGxlUmVzb2x2ZXNcIixcbiAgXCJyZWplY3Rpb25IYW5kbGVkXCIsXG4gIFwidW5jYXVnaHRFeGNlcHRpb25cIixcbiAgXCJ1bmNhdWdodEV4Y2VwdGlvbk1vbml0b3JcIixcbiAgXCJ1bmhhbmRsZWRSZWplY3Rpb25cIixcbiAgXCJ3b3JrZXJcIixcbl07XG5cbi8vIFRoZSBmaXJzdCAyIGl0ZW1zIGFyZSBwbGFjZWhvbGRlcnMuXG4vLyBUaGV5IHdpbGwgYmUgb3ZlcndyaXR0ZW4gYnkgdGhlIGJlbG93IE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBjYWxscy5cbmNvbnN0IGFyZ3YgPSBbXCJcIiwgXCJcIiwgLi4uRGVuby5hcmdzXTtcbi8vIE92ZXJ3cml0ZXMgdGhlIDFzdCBpdGVtIHdpdGggZ2V0dGVyLlxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGFyZ3YsIFwiMFwiLCB7IGdldDogRGVuby5leGVjUGF0aCB9KTtcbi8vIE92ZXJ3cml0ZXMgdGhlIDJzdCBpdGVtIHdpdGggZ2V0dGVyLlxuT2JqZWN0LmRlZmluZVByb3BlcnR5KGFyZ3YsIFwiMVwiLCB7XG4gIGdldDogKCkgPT4ge1xuICAgIGlmIChEZW5vLm1haW5Nb2R1bGUuc3RhcnRzV2l0aChcImZpbGU6XCIpKSB7XG4gICAgICByZXR1cm4gZnJvbUZpbGVVcmwoRGVuby5tYWluTW9kdWxlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGpvaW4oRGVuby5jd2QoKSwgXCIkZGVubyRub2RlLmpzXCIpO1xuICAgIH1cbiAgfSxcbn0pO1xuXG4vKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX2V4aXRfY29kZSAqL1xuZXhwb3J0IGNvbnN0IGV4aXQgPSAoY29kZT86IG51bWJlciB8IHN0cmluZykgPT4ge1xuICBpZiAoY29kZSB8fCBjb2RlID09PSAwKSB7XG4gICAgaWYgKHR5cGVvZiBjb2RlID09PSBcInN0cmluZ1wiKSB7XG4gICAgICBjb25zdCBwYXJzZWRDb2RlID0gcGFyc2VJbnQoY29kZSk7XG4gICAgICBwcm9jZXNzLmV4aXRDb2RlID0gaXNOYU4ocGFyc2VkQ29kZSkgPyB1bmRlZmluZWQgOiBwYXJzZWRDb2RlO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9jZXNzLmV4aXRDb2RlID0gY29kZTtcbiAgICB9XG4gIH1cblxuICBpZiAoIXByb2Nlc3MuX2V4aXRpbmcpIHtcbiAgICBwcm9jZXNzLl9leGl0aW5nID0gdHJ1ZTtcbiAgICBwcm9jZXNzLmVtaXQoXCJleGl0XCIsIHByb2Nlc3MuZXhpdENvZGUgfHwgMCk7XG4gIH1cblxuICBEZW5vLmV4aXQocHJvY2Vzcy5leGl0Q29kZSB8fCAwKTtcbn07XG5cbmZ1bmN0aW9uIGFkZFJlYWRPbmx5UHJvY2Vzc0FsaWFzKFxuICBuYW1lOiBzdHJpbmcsXG4gIG9wdGlvbjogc3RyaW5nLFxuICBlbnVtZXJhYmxlID0gdHJ1ZSxcbikge1xuICBjb25zdCB2YWx1ZSA9IGdldE9wdGlvblZhbHVlKG9wdGlvbik7XG5cbiAgaWYgKHZhbHVlKSB7XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHByb2Nlc3MsIG5hbWUsIHtcbiAgICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgIGVudW1lcmFibGUsXG4gICAgICB2YWx1ZSxcbiAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVXYXJuaW5nT2JqZWN0KFxuICB3YXJuaW5nOiBzdHJpbmcsXG4gIHR5cGU6IHN0cmluZyxcbiAgY29kZT86IHN0cmluZyxcbiAgLy8gZGVuby1saW50LWlnbm9yZSBiYW4tdHlwZXNcbiAgY3Rvcj86IEZ1bmN0aW9uLFxuICBkZXRhaWw/OiBzdHJpbmcsXG4pOiBFcnJvciB7XG4gIGFzc2VydCh0eXBlb2Ygd2FybmluZyA9PT0gXCJzdHJpbmdcIik7XG5cbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgY29uc3Qgd2FybmluZ0VycjogYW55ID0gbmV3IEVycm9yKHdhcm5pbmcpO1xuICB3YXJuaW5nRXJyLm5hbWUgPSBTdHJpbmcodHlwZSB8fCBcIldhcm5pbmdcIik7XG5cbiAgaWYgKGNvZGUgIT09IHVuZGVmaW5lZCkge1xuICAgIHdhcm5pbmdFcnIuY29kZSA9IGNvZGU7XG4gIH1cbiAgaWYgKGRldGFpbCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgd2FybmluZ0Vyci5kZXRhaWwgPSBkZXRhaWw7XG4gIH1cblxuICAvLyBAdHMtaWdub3JlIHRoaXMgZnVuY3Rpb24gaXMgbm90IGF2YWlsYWJsZSBpbiBsaWIuZG9tLmQudHNcbiAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2Uod2FybmluZ0VyciwgY3RvciB8fCBwcm9jZXNzLmVtaXRXYXJuaW5nKTtcblxuICByZXR1cm4gd2FybmluZ0Vycjtcbn1cblxuZnVuY3Rpb24gZG9FbWl0V2FybmluZyh3YXJuaW5nOiBFcnJvcikge1xuICBwcm9jZXNzLmVtaXQoXCJ3YXJuaW5nXCIsIHdhcm5pbmcpO1xufVxuXG4vKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX2VtaXR3YXJuaW5nX3dhcm5pbmdfb3B0aW9ucyAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVtaXRXYXJuaW5nKFxuICB3YXJuaW5nOiBzdHJpbmcgfCBFcnJvcixcbiAgdHlwZTpcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIGJhbi10eXBlc1xuICAgIHwgeyB0eXBlOiBzdHJpbmc7IGRldGFpbDogc3RyaW5nOyBjb2RlOiBzdHJpbmc7IGN0b3I6IEZ1bmN0aW9uIH1cbiAgICB8IHN0cmluZ1xuICAgIHwgbnVsbCxcbiAgY29kZT86IHN0cmluZyxcbiAgLy8gZGVuby1saW50LWlnbm9yZSBiYW4tdHlwZXNcbiAgY3Rvcj86IEZ1bmN0aW9uLFxuKSB7XG4gIGxldCBkZXRhaWw7XG5cbiAgaWYgKHR5cGUgIT09IG51bGwgJiYgdHlwZW9mIHR5cGUgPT09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkodHlwZSkpIHtcbiAgICBjdG9yID0gdHlwZS5jdG9yO1xuICAgIGNvZGUgPSB0eXBlLmNvZGU7XG5cbiAgICBpZiAodHlwZW9mIHR5cGUuZGV0YWlsID09PSBcInN0cmluZ1wiKSB7XG4gICAgICBkZXRhaWwgPSB0eXBlLmRldGFpbDtcbiAgICB9XG5cbiAgICB0eXBlID0gdHlwZS50eXBlIHx8IFwiV2FybmluZ1wiO1xuICB9IGVsc2UgaWYgKHR5cGVvZiB0eXBlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICBjdG9yID0gdHlwZTtcbiAgICBjb2RlID0gdW5kZWZpbmVkO1xuICAgIHR5cGUgPSBcIldhcm5pbmdcIjtcbiAgfVxuXG4gIGlmICh0eXBlICE9PSB1bmRlZmluZWQpIHtcbiAgICB2YWxpZGF0ZVN0cmluZyh0eXBlLCBcInR5cGVcIik7XG4gIH1cblxuICBpZiAodHlwZW9mIGNvZGUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgIGN0b3IgPSBjb2RlO1xuICAgIGNvZGUgPSB1bmRlZmluZWQ7XG4gIH0gZWxzZSBpZiAoY29kZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgdmFsaWRhdGVTdHJpbmcoY29kZSwgXCJjb2RlXCIpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiB3YXJuaW5nID09PSBcInN0cmluZ1wiKSB7XG4gICAgd2FybmluZyA9IGNyZWF0ZVdhcm5pbmdPYmplY3Qod2FybmluZywgdHlwZSBhcyBzdHJpbmcsIGNvZGUsIGN0b3IsIGRldGFpbCk7XG4gIH0gZWxzZSBpZiAoISh3YXJuaW5nIGluc3RhbmNlb2YgRXJyb3IpKSB7XG4gICAgdGhyb3cgbmV3IEVSUl9JTlZBTElEX0FSR19UWVBFKFwid2FybmluZ1wiLCBbXCJFcnJvclwiLCBcInN0cmluZ1wiXSwgd2FybmluZyk7XG4gIH1cblxuICBpZiAod2FybmluZy5uYW1lID09PSBcIkRlcHJlY2F0aW9uV2FybmluZ1wiKSB7XG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICBpZiAoKHByb2Nlc3MgYXMgYW55KS5ub0RlcHJlY2F0aW9uKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICBpZiAoKHByb2Nlc3MgYXMgYW55KS50aHJvd0RlcHJlY2F0aW9uKSB7XG4gICAgICAvLyBEZWxheSB0aHJvd2luZyB0aGUgZXJyb3IgdG8gZ3VhcmFudGVlIHRoYXQgYWxsIGZvcm1lciB3YXJuaW5ncyB3ZXJlXG4gICAgICAvLyBwcm9wZXJseSBsb2dnZWQuXG4gICAgICByZXR1cm4gcHJvY2Vzcy5uZXh0VGljaygoKSA9PiB7XG4gICAgICAgIHRocm93IHdhcm5pbmc7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBwcm9jZXNzLm5leHRUaWNrKGRvRW1pdFdhcm5pbmcsIHdhcm5pbmcpO1xufVxuXG5mdW5jdGlvbiBocnRpbWUodGltZT86IFtudW1iZXIsIG51bWJlcl0pOiBbbnVtYmVyLCBudW1iZXJdIHtcbiAgY29uc3QgbWlsbGkgPSBwZXJmb3JtYW5jZS5ub3coKTtcbiAgY29uc3Qgc2VjID0gTWF0aC5mbG9vcihtaWxsaSAvIDEwMDApO1xuICBjb25zdCBuYW5vID0gTWF0aC5mbG9vcihtaWxsaSAqIDFfMDAwXzAwMCAtIHNlYyAqIDFfMDAwXzAwMF8wMDApO1xuICBpZiAoIXRpbWUpIHtcbiAgICByZXR1cm4gW3NlYywgbmFub107XG4gIH1cbiAgY29uc3QgW3ByZXZTZWMsIHByZXZOYW5vXSA9IHRpbWU7XG4gIHJldHVybiBbc2VjIC0gcHJldlNlYywgbmFubyAtIHByZXZOYW5vXTtcbn1cblxuaHJ0aW1lLmJpZ2ludCA9IGZ1bmN0aW9uICgpOiBCaWdJbnQge1xuICBjb25zdCBbc2VjLCBuYW5vXSA9IGhydGltZSgpO1xuICByZXR1cm4gQmlnSW50KHNlYykgKiAxXzAwMF8wMDBfMDAwbiArIEJpZ0ludChuYW5vKTtcbn07XG5cbmZ1bmN0aW9uIG1lbW9yeVVzYWdlKCk6IHtcbiAgcnNzOiBudW1iZXI7XG4gIGhlYXBUb3RhbDogbnVtYmVyO1xuICBoZWFwVXNlZDogbnVtYmVyO1xuICBleHRlcm5hbDogbnVtYmVyO1xuICBhcnJheUJ1ZmZlcnM6IG51bWJlcjtcbn0ge1xuICByZXR1cm4ge1xuICAgIC4uLkRlbm8ubWVtb3J5VXNhZ2UoKSxcbiAgICBhcnJheUJ1ZmZlcnM6IDAsXG4gIH07XG59XG5cbm1lbW9yeVVzYWdlLnJzcyA9IGZ1bmN0aW9uICgpOiBudW1iZXIge1xuICByZXR1cm4gbWVtb3J5VXNhZ2UoKS5yc3M7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24ga2lsbChwaWQ6IG51bWJlciwgc2lnOiBEZW5vLlNpZ25hbCB8IG51bWJlciA9IFwiU0lHVEVSTVwiKSB7XG4gIGlmIChwaWQgIT0gKHBpZCB8IDApKSB7XG4gICAgdGhyb3cgbmV3IEVSUl9JTlZBTElEX0FSR19UWVBFKFwicGlkXCIsIFwibnVtYmVyXCIsIHBpZCk7XG4gIH1cblxuICBpZiAodHlwZW9mIHNpZyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHRyeSB7XG4gICAgICBEZW5vLmtpbGwocGlkLCBzaWcpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlIGluc3RhbmNlb2YgVHlwZUVycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFUlJfVU5LTk9XTl9TSUdOQUwoc2lnKTtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFUlJfVU5LTk9XTl9TSUdOQUwoc2lnLnRvU3RyaW5nKCkpO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59XG5cbmNsYXNzIFByb2Nlc3MgZXh0ZW5kcyBFdmVudEVtaXR0ZXIge1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcigpO1xuXG4gICAgZ2xvYmFsVGhpcy5hZGRFdmVudExpc3RlbmVyKFwidW5sb2FkXCIsICgpID0+IHtcbiAgICAgIGlmICghcHJvY2Vzcy5fZXhpdGluZykge1xuICAgICAgICBwcm9jZXNzLl9leGl0aW5nID0gdHJ1ZTtcbiAgICAgICAgc3VwZXIuZW1pdChcImV4aXRcIiwgcHJvY2Vzcy5leGl0Q29kZSB8fCAwKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfYXJjaCAqL1xuICBhcmNoID0gYXJjaDtcblxuICAvKipcbiAgICogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX2FyZ3ZcbiAgICogUmVhZCBwZXJtaXNzaW9ucyBhcmUgcmVxdWlyZWQgaW4gb3JkZXIgdG8gZ2V0IHRoZSBleGVjdXRhYmxlIHJvdXRlXG4gICAqL1xuICBhcmd2ID0gYXJndjtcblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX2NoZGlyX2RpcmVjdG9yeSAqL1xuICBjaGRpciA9IGNoZGlyO1xuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzY29uZmlnICovXG4gIGNvbmZpZyA9IHtcbiAgICB0YXJnZXRfZGVmYXVsdHM6IHt9LFxuICAgIHZhcmlhYmxlczoge30sXG4gIH07XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19jd2QgKi9cbiAgY3dkID0gY3dkO1xuXG4gIC8qKlxuICAgKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfZW52XG4gICAqIFJlcXVpcmVzIGVudiBwZXJtaXNzaW9uc1xuICAgKi9cbiAgZW52ID0gZW52O1xuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfZXhlY2FyZ3YgKi9cbiAgZXhlY0FyZ3Y6IHN0cmluZ1tdID0gW107XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19leGl0X2NvZGUgKi9cbiAgZXhpdCA9IGV4aXQ7XG5cbiAgX2V4aXRpbmcgPSBfZXhpdGluZztcblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc2V4aXRjb2RlXzEgKi9cbiAgZXhpdENvZGU6IHVuZGVmaW5lZCB8IG51bWJlciA9IHVuZGVmaW5lZDtcblxuICAvLyBUeXBlZCBhcyBhbnkgdG8gYXZvaWQgaW1wb3J0aW5nIFwibW9kdWxlXCIgbW9kdWxlIGZvciB0eXBlc1xuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBtYWluTW9kdWxlOiBhbnkgPSB1bmRlZmluZWQ7XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19uZXh0dGlja19jYWxsYmFja19hcmdzICovXG4gIG5leHRUaWNrID0gX25leHRUaWNrO1xuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfZXZlbnRzICovXG4gIG92ZXJyaWRlIG9uKGV2ZW50OiBcImV4aXRcIiwgbGlzdGVuZXI6IChjb2RlOiBudW1iZXIpID0+IHZvaWQpOiB0aGlzO1xuICBvdmVycmlkZSBvbihcbiAgICBldmVudDogdHlwZW9mIG5vdEltcGxlbWVudGVkRXZlbnRzW251bWJlcl0sXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBiYW4tdHlwZXNcbiAgICBsaXN0ZW5lcjogRnVuY3Rpb24sXG4gICk6IHRoaXM7XG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIG92ZXJyaWRlIG9uKGV2ZW50OiBzdHJpbmcsIGxpc3RlbmVyOiAoLi4uYXJnczogYW55W10pID0+IHZvaWQpOiB0aGlzIHtcbiAgICBpZiAobm90SW1wbGVtZW50ZWRFdmVudHMuaW5jbHVkZXMoZXZlbnQpKSB7XG4gICAgICB3YXJuTm90SW1wbGVtZW50ZWQoYHByb2Nlc3Mub24oXCIke2V2ZW50fVwiKWApO1xuICAgICAgc3VwZXIub24oZXZlbnQsIGxpc3RlbmVyKTtcbiAgICB9IGVsc2UgaWYgKGV2ZW50LnN0YXJ0c1dpdGgoXCJTSUdcIikpIHtcbiAgICAgIGlmIChldmVudCA9PT0gXCJTSUdCUkVBS1wiICYmIERlbm8uYnVpbGQub3MgIT09IFwid2luZG93c1wiKSB7XG4gICAgICAgIC8vIElnbm9yZXMgU0lHQlJFQUsgaWYgdGhlIHBsYXRmb3JtIGlzIG5vdCB3aW5kb3dzLlxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgRGVub1Vuc3RhYmxlLmFkZFNpZ25hbExpc3RlbmVyKGV2ZW50IGFzIERlbm8uU2lnbmFsLCBsaXN0ZW5lcik7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHN1cGVyLm9uKGV2ZW50LCBsaXN0ZW5lcik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBvdmVycmlkZSBvZmYoZXZlbnQ6IFwiZXhpdFwiLCBsaXN0ZW5lcjogKGNvZGU6IG51bWJlcikgPT4gdm9pZCk6IHRoaXM7XG4gIG92ZXJyaWRlIG9mZihcbiAgICBldmVudDogdHlwZW9mIG5vdEltcGxlbWVudGVkRXZlbnRzW251bWJlcl0sXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBiYW4tdHlwZXNcbiAgICBsaXN0ZW5lcjogRnVuY3Rpb24sXG4gICk6IHRoaXM7XG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIG92ZXJyaWRlIG9mZihldmVudDogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkKTogdGhpcyB7XG4gICAgaWYgKG5vdEltcGxlbWVudGVkRXZlbnRzLmluY2x1ZGVzKGV2ZW50KSkge1xuICAgICAgd2Fybk5vdEltcGxlbWVudGVkKGBwcm9jZXNzLm9mZihcIiR7ZXZlbnR9XCIpYCk7XG4gICAgICBzdXBlci5vZmYoZXZlbnQsIGxpc3RlbmVyKTtcbiAgICB9IGVsc2UgaWYgKGV2ZW50LnN0YXJ0c1dpdGgoXCJTSUdcIikpIHtcbiAgICAgIGlmIChldmVudCA9PT0gXCJTSUdCUkVBS1wiICYmIERlbm8uYnVpbGQub3MgIT09IFwid2luZG93c1wiKSB7XG4gICAgICAgIC8vIElnbm9yZXMgU0lHQlJFQUsgaWYgdGhlIHBsYXRmb3JtIGlzIG5vdCB3aW5kb3dzLlxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgRGVub1Vuc3RhYmxlLnJlbW92ZVNpZ25hbExpc3RlbmVyKGV2ZW50IGFzIERlbm8uU2lnbmFsLCBsaXN0ZW5lcik7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHN1cGVyLm9mZihldmVudCwgbGlzdGVuZXIpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgb3ZlcnJpZGUgZW1pdChldmVudDogc3RyaW5nLCAuLi5hcmdzOiBhbnlbXSk6IGJvb2xlYW4ge1xuICAgIGlmIChldmVudC5zdGFydHNXaXRoKFwiU0lHXCIpKSB7XG4gICAgICBpZiAoZXZlbnQgPT09IFwiU0lHQlJFQUtcIiAmJiBEZW5vLmJ1aWxkLm9zICE9PSBcIndpbmRvd3NcIikge1xuICAgICAgICAvLyBJZ25vcmVzIFNJR0JSRUFLIGlmIHRoZSBwbGF0Zm9ybSBpcyBub3Qgd2luZG93cy5cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIERlbm8ua2lsbChEZW5vLnBpZCwgZXZlbnQgYXMgRGVuby5TaWduYWwpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gc3VwZXIuZW1pdChldmVudCwgLi4uYXJncyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBvdmVycmlkZSBwcmVwZW5kTGlzdGVuZXIoXG4gICAgZXZlbnQ6IFwiZXhpdFwiLFxuICAgIGxpc3RlbmVyOiAoY29kZTogbnVtYmVyKSA9PiB2b2lkLFxuICApOiB0aGlzO1xuICBvdmVycmlkZSBwcmVwZW5kTGlzdGVuZXIoXG4gICAgZXZlbnQ6IHR5cGVvZiBub3RJbXBsZW1lbnRlZEV2ZW50c1tudW1iZXJdLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgYmFuLXR5cGVzXG4gICAgbGlzdGVuZXI6IEZ1bmN0aW9uLFxuICApOiB0aGlzO1xuICBvdmVycmlkZSBwcmVwZW5kTGlzdGVuZXIoXG4gICAgZXZlbnQ6IHN0cmluZyxcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIGxpc3RlbmVyOiAoLi4uYXJnczogYW55W10pID0+IHZvaWQsXG4gICk6IHRoaXMge1xuICAgIGlmIChub3RJbXBsZW1lbnRlZEV2ZW50cy5pbmNsdWRlcyhldmVudCkpIHtcbiAgICAgIHdhcm5Ob3RJbXBsZW1lbnRlZChgcHJvY2Vzcy5wcmVwZW5kTGlzdGVuZXIoXCIke2V2ZW50fVwiKWApO1xuICAgICAgc3VwZXIucHJlcGVuZExpc3RlbmVyKGV2ZW50LCBsaXN0ZW5lcik7XG4gICAgfSBlbHNlIGlmIChldmVudC5zdGFydHNXaXRoKFwiU0lHXCIpKSB7XG4gICAgICBpZiAoZXZlbnQgPT09IFwiU0lHQlJFQUtcIiAmJiBEZW5vLmJ1aWxkLm9zICE9PSBcIndpbmRvd3NcIikge1xuICAgICAgICAvLyBJZ25vcmVzIFNJR0JSRUFLIGlmIHRoZSBwbGF0Zm9ybSBpcyBub3Qgd2luZG93cy5cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIERlbm9VbnN0YWJsZS5hZGRTaWduYWxMaXN0ZW5lcihldmVudCBhcyBEZW5vLlNpZ25hbCwgbGlzdGVuZXIpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzdXBlci5wcmVwZW5kTGlzdGVuZXIoZXZlbnQsIGxpc3RlbmVyKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfcGlkICovXG4gIHBpZCA9IHBpZDtcblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX3BsYXRmb3JtICovXG4gIHBsYXRmb3JtID0gcGxhdGZvcm07XG5cbiAgb3ZlcnJpZGUgYWRkTGlzdGVuZXIoZXZlbnQ6IFwiZXhpdFwiLCBsaXN0ZW5lcjogKGNvZGU6IG51bWJlcikgPT4gdm9pZCk6IHRoaXM7XG4gIG92ZXJyaWRlIGFkZExpc3RlbmVyKFxuICAgIGV2ZW50OiB0eXBlb2Ygbm90SW1wbGVtZW50ZWRFdmVudHNbbnVtYmVyXSxcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIGJhbi10eXBlc1xuICAgIGxpc3RlbmVyOiBGdW5jdGlvbixcbiAgKTogdGhpcztcbiAgb3ZlcnJpZGUgYWRkTGlzdGVuZXIoXG4gICAgZXZlbnQ6IHN0cmluZyxcbiAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICAgIGxpc3RlbmVyOiAoLi4uYXJnczogYW55W10pID0+IHZvaWQsXG4gICk6IHRoaXMge1xuICAgIGlmIChub3RJbXBsZW1lbnRlZEV2ZW50cy5pbmNsdWRlcyhldmVudCkpIHtcbiAgICAgIHdhcm5Ob3RJbXBsZW1lbnRlZChgcHJvY2Vzcy5hZGRMaXN0ZW5lcihcIiR7ZXZlbnR9XCIpYCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMub24oZXZlbnQsIGxpc3RlbmVyKTtcbiAgfVxuXG4gIG92ZXJyaWRlIHJlbW92ZUxpc3RlbmVyKFxuICAgIGV2ZW50OiBcImV4aXRcIixcbiAgICBsaXN0ZW5lcjogKGNvZGU6IG51bWJlcikgPT4gdm9pZCxcbiAgKTogdGhpcztcbiAgb3ZlcnJpZGUgcmVtb3ZlTGlzdGVuZXIoXG4gICAgZXZlbnQ6IHR5cGVvZiBub3RJbXBsZW1lbnRlZEV2ZW50c1tudW1iZXJdLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgYmFuLXR5cGVzXG4gICAgbGlzdGVuZXI6IEZ1bmN0aW9uLFxuICApOiB0aGlzO1xuICBvdmVycmlkZSByZW1vdmVMaXN0ZW5lcihcbiAgICBldmVudDogc3RyaW5nLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgbGlzdGVuZXI6ICguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCxcbiAgKTogdGhpcyB7XG4gICAgaWYgKG5vdEltcGxlbWVudGVkRXZlbnRzLmluY2x1ZGVzKGV2ZW50KSkge1xuICAgICAgd2Fybk5vdEltcGxlbWVudGVkKGBwcm9jZXNzLnJlbW92ZUxpc3RlbmVyKFwiJHtldmVudH1cIilgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5vZmYoZXZlbnQsIGxpc3RlbmVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IGhpZ2gtcmVzb2x1dGlvbiByZWFsIHRpbWUgaW4gYSBbc2Vjb25kcywgbmFub3NlY29uZHNdXG4gICAqIHR1cGxlLlxuICAgKlxuICAgKiBOb3RlOiBZb3UgbmVlZCB0byBnaXZlIC0tYWxsb3ctaHJ0aW1lIHBlcm1pc3Npb24gdG8gRGVubyB0byBhY3R1YWxseSBnZXRcbiAgICogbmFub3NlY29uZHMgcHJlY2lzaW9uIHZhbHVlcy4gSWYgeW91IGRvbid0IGdpdmUgJ2hydGltZScgcGVybWlzc2lvbiwgdGhlIHJldHVybmVkXG4gICAqIHZhbHVlcyBvbmx5IGhhdmUgbWlsbGlzZWNvbmRzIHByZWNpc2lvbi5cbiAgICpcbiAgICogYHRpbWVgIGlzIGFuIG9wdGlvbmFsIHBhcmFtZXRlciB0aGF0IG11c3QgYmUgdGhlIHJlc3VsdCBvZiBhIHByZXZpb3VzIHByb2Nlc3MuaHJ0aW1lKCkgY2FsbCB0byBkaWZmIHdpdGggdGhlIGN1cnJlbnQgdGltZS5cbiAgICpcbiAgICogVGhlc2UgdGltZXMgYXJlIHJlbGF0aXZlIHRvIGFuIGFyYml0cmFyeSB0aW1lIGluIHRoZSBwYXN0LCBhbmQgbm90IHJlbGF0ZWQgdG8gdGhlIHRpbWUgb2YgZGF5IGFuZCB0aGVyZWZvcmUgbm90IHN1YmplY3QgdG8gY2xvY2sgZHJpZnQuIFRoZSBwcmltYXJ5IHVzZSBpcyBmb3IgbWVhc3VyaW5nIHBlcmZvcm1hbmNlIGJldHdlZW4gaW50ZXJ2YWxzLlxuICAgKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfaHJ0aW1lX3RpbWVcbiAgICovXG4gIGhydGltZSA9IGhydGltZTtcblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc2tpbGxwaWQtc2lnbmFsICovXG4gIGtpbGwgPSBraWxsO1xuXG4gIG1lbW9yeVVzYWdlID0gbWVtb3J5VXNhZ2U7XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19zdGRlcnIgKi9cbiAgc3RkZXJyID0gc3RkZXJyO1xuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3Nfc3RkaW4gKi9cbiAgc3RkaW4gPSBzdGRpbjtcblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX3N0ZG91dCAqL1xuICBzdGRvdXQgPSBzdGRvdXQ7XG5cbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc192ZXJzaW9uICovXG4gIHZlcnNpb24gPSB2ZXJzaW9uO1xuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfdmVyc2lvbnMgKi9cbiAgdmVyc2lvbnMgPSB2ZXJzaW9ucztcblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc19wcm9jZXNzX2VtaXR3YXJuaW5nX3dhcm5pbmdfb3B0aW9ucyAqL1xuICBlbWl0V2FybmluZyA9IGVtaXRXYXJuaW5nO1xuXG4gIGJpbmRpbmcobmFtZTogQmluZGluZ05hbWUpIHtcbiAgICByZXR1cm4gZ2V0QmluZGluZyhuYW1lKTtcbiAgfVxuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzdW1hc2ttYXNrICovXG4gIHVtYXNrKCkge1xuICAgIC8vIEFsd2F5cyByZXR1cm4gdGhlIHN5c3RlbSBkZWZhdWx0IHVtYXNrIHZhbHVlLlxuICAgIC8vIFdlIGRvbid0IHVzZSBEZW5vLnVtYXNrIGhlcmUgYmVjYXVzZSBpdCBoYXMgYSByYWNlXG4gICAgLy8gY29uZGl0aW9uIGJ1Zy5cbiAgICAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2Rlbm9sYW5kL2Rlbm9fc3RkL2lzc3Vlcy8xODkzI2lzc3VlY29tbWVudC0xMDMyODk3Nzc5XG4gICAgcmV0dXJuIDBvMjI7XG4gIH1cblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc2dldHVpZCAqL1xuICBnZXR1aWQoKTogbnVtYmVyIHtcbiAgICAvLyBUT0RPKGt0M2spOiByZXR1cm4gdXNlciBpZCBpbiBtYWMgYW5kIGxpbnV4XG4gICAgcmV0dXJuIE5hTjtcbiAgfVxuXG4gIC8qKiBodHRwczovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzZ2V0Z2lkICovXG4gIGdldGdpZCgpOiBudW1iZXIge1xuICAgIC8vIFRPRE8oa3Qzayk6IHJldHVybiBncm91cCBpZCBpbiBtYWMgYW5kIGxpbnV4XG4gICAgcmV0dXJuIE5hTjtcbiAgfVxuXG4gIC8vIFRPRE8oa3Qzayk6IEltcGxlbWVudCB0aGlzIHdoZW4gd2UgYWRkZWQgLWUgb3B0aW9uIHRvIG5vZGUgY29tcGF0IG1vZGVcbiAgX2V2YWw6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc2V4ZWNwYXRoICovXG4gIGdldCBleGVjUGF0aCgpIHtcbiAgICByZXR1cm4gYXJndlswXTtcbiAgfVxuXG4gICNzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAvKiogaHR0cHM6Ly9ub2RlanMub3JnL2FwaS9wcm9jZXNzLmh0bWwjcHJvY2Vzc3VwdGltZSAqL1xuICB1cHRpbWUoKSB7XG4gICAgcmV0dXJuIChEYXRlLm5vdygpIC0gdGhpcy4jc3RhcnRUaW1lKSAvIDEwMDA7XG4gIH1cblxuICAjYWxsb3dlZEZsYWdzID0gYnVpbGRBbGxvd2VkRmxhZ3MoKTtcbiAgLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NhbGxvd2Vkbm9kZWVudmlyb25tZW50ZmxhZ3MgKi9cbiAgZ2V0IGFsbG93ZWROb2RlRW52aXJvbm1lbnRGbGFncygpIHtcbiAgICByZXR1cm4gdGhpcy4jYWxsb3dlZEZsYWdzO1xuICB9XG5cbiAgZmVhdHVyZXMgPSB7IGluc3BlY3RvcjogZmFsc2UgfTtcbn1cblxuLyoqIGh0dHBzOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2VzcyAqL1xuY29uc3QgcHJvY2VzcyA9IG5ldyBQcm9jZXNzKCk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShwcm9jZXNzLCBTeW1ib2wudG9TdHJpbmdUYWcsIHtcbiAgZW51bWVyYWJsZTogZmFsc2UsXG4gIHdyaXRhYmxlOiB0cnVlLFxuICBjb25maWd1cmFibGU6IGZhbHNlLFxuICB2YWx1ZTogXCJwcm9jZXNzXCIsXG59KTtcblxuYWRkUmVhZE9ubHlQcm9jZXNzQWxpYXMoXCJub0RlcHJlY2F0aW9uXCIsIFwiLS1uby1kZXByZWNhdGlvblwiKTtcbmFkZFJlYWRPbmx5UHJvY2Vzc0FsaWFzKFwidGhyb3dEZXByZWNhdGlvblwiLCBcIi0tdGhyb3ctZGVwcmVjYXRpb25cIik7XG5cbmV4cG9ydCBjb25zdCByZW1vdmVMaXN0ZW5lciA9IHByb2Nlc3MucmVtb3ZlTGlzdGVuZXI7XG5leHBvcnQgY29uc3QgcmVtb3ZlQWxsTGlzdGVuZXJzID0gcHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnM7XG5cbmV4cG9ydCBkZWZhdWx0IHByb2Nlc3M7XG5cbi8vVE9ETyhTb3JlbXdhcilcbi8vUmVtb3ZlIG9uIDEuMFxuLy9LZXB0IGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSB3aXRoIHN0ZFxuZXhwb3J0IHsgcHJvY2VzcyB9O1xuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxxRkFBcUY7QUFDckYsWUFBWSxZQUFZLE1BQU0sc0JBQXNCLENBQUM7QUFDckQsU0FBUyxrQkFBa0IsUUFBUSxhQUFhLENBQUM7QUFDakQsU0FBUyxZQUFZLFFBQVEsYUFBYSxDQUFDO0FBQzNDLFNBQVMsY0FBYyxRQUFRLDJCQUEyQixDQUFDO0FBQzNELFNBQVMsb0JBQW9CLEVBQUUsa0JBQWtCLFFBQVEsc0JBQXNCLENBQUM7QUFDaEYsU0FBUyxjQUFjLFFBQVEsdUJBQXVCLENBQUM7QUFDdkQsU0FBUyxNQUFNLFFBQVEsb0JBQW9CLENBQUM7QUFDNUMsU0FBUyxXQUFXLEVBQUUsSUFBSSxRQUFRLGdCQUFnQixDQUFDO0FBQ25ELFNBQ0UsSUFBSSxFQUNKLEtBQUssRUFDTCxHQUFHLEVBQ0gsR0FBRyxFQUNILFFBQVEsSUFBSSxTQUFTLEVBQ3JCLEdBQUcsRUFDSCxRQUFRLEVBQ1IsT0FBTyxFQUNQLFFBQVEsUUFDSCx1QkFBdUIsQ0FBQztBQUMvQixTQUFTLFFBQVEsUUFBUSx1QkFBdUIsQ0FBQztBQUNqRCxTQUNFLFNBQVMsSUFBSSxRQUFRLEVBQ3JCLElBQUksRUFDSixLQUFLLEVBQ0wsR0FBRyxFQUNILEdBQUcsRUFDSCxHQUFHLEVBQ0gsUUFBUSxFQUNSLE9BQU8sRUFDUCxRQUFRLEdBQ1I7QUFDRixTQUNFLE1BQU0sSUFBSSxPQUFPLEVBQ2pCLEtBQUssSUFBSSxNQUFNLEVBQ2YsTUFBTSxJQUFJLE9BQU8sUUFDWix3QkFBd0IsQ0FBQztBQUNoQyxpREFBaUQ7QUFDakQsbUNBQW1DO0FBQ25DLE1BQU0sTUFBTSxHQUFHLE9BQU8sQUFBTyxBQUFDO0FBQzlCLG1DQUFtQztBQUNuQyxNQUFNLEtBQUssR0FBRyxNQUFNLEFBQU8sQUFBQztBQUM1QixtQ0FBbUM7QUFDbkMsTUFBTSxNQUFNLEdBQUcsT0FBTyxBQUFPLEFBQUM7QUFDOUIsU0FBUyxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sR0FBRztBQUNqQyxTQUFTLFVBQVUsUUFBUSwyQkFBMkIsQ0FBQztBQUV2RCxTQUFTLGlCQUFpQixRQUFRLG1DQUFtQyxDQUFDO0FBRXRFLE1BQU0sb0JBQW9CLEdBQUc7SUFDM0IsWUFBWTtJQUNaLFlBQVk7SUFDWixTQUFTO0lBQ1Qsa0JBQWtCO0lBQ2xCLGtCQUFrQjtJQUNsQixtQkFBbUI7SUFDbkIsMEJBQTBCO0lBQzFCLG9CQUFvQjtJQUNwQixRQUFRO0NBQ1QsQUFBQztBQUVGLHNDQUFzQztBQUN0QyxxRUFBcUU7QUFDckUsTUFBTSxJQUFJLEdBQUc7SUFBQyxFQUFFO0lBQUUsRUFBRTtPQUFLLElBQUksQ0FBQyxJQUFJO0NBQUMsQUFBQztBQUNwQyx1Q0FBdUM7QUFDdkMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFO0lBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxRQUFRO0NBQUUsQ0FBQyxDQUFDO0FBQ3pELHVDQUF1QztBQUN2QyxNQUFNLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUU7SUFDL0IsR0FBRyxFQUFFLElBQU07UUFDVCxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1lBQ3ZDLE9BQU8sV0FBVyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztTQUNyQyxNQUFNO1lBQ0wsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1NBQzFDO0tBQ0Y7Q0FDRixDQUFDLENBQUM7QUFFSCxvRUFBb0UsQ0FDcEUsT0FBTyxNQUFNLElBQUksR0FBRyxDQUFDLElBQXNCLEdBQUs7SUFDOUMsSUFBSSxJQUFJLElBQUksSUFBSSxLQUFLLENBQUMsRUFBRTtRQUN0QixJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRTtZQUM1QixNQUFNLFVBQVUsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLEFBQUM7WUFDbEMsT0FBTyxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLEdBQUcsU0FBUyxHQUFHLFVBQVUsQ0FBQztTQUMvRCxNQUFNO1lBQ0wsT0FBTyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7U0FDekI7S0FDRjtJQUVELElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFO1FBQ3JCLE9BQU8sQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1FBQ3hCLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUM7S0FDN0M7SUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUM7Q0FDbEMsQ0FBQztBQUVGLFNBQVMsdUJBQXVCLENBQzlCLElBQVksRUFDWixNQUFjLEVBQ2QsVUFBVSxHQUFHLElBQUksRUFDakI7SUFDQSxNQUFNLEtBQUssR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDLEFBQUM7SUFFckMsSUFBSSxLQUFLLEVBQUU7UUFDVCxNQUFNLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUU7WUFDbkMsUUFBUSxFQUFFLEtBQUs7WUFDZixZQUFZLEVBQUUsSUFBSTtZQUNsQixVQUFVO1lBQ1YsS0FBSztTQUNOLENBQUMsQ0FBQztLQUNKO0NBQ0Y7QUFFRCxTQUFTLG1CQUFtQixDQUMxQixPQUFlLEVBQ2YsSUFBWSxFQUNaLElBQWEsRUFDYiw2QkFBNkI7QUFDN0IsSUFBZSxFQUNmLE1BQWUsRUFDUjtJQUNQLE1BQU0sQ0FBQyxPQUFPLE9BQU8sS0FBSyxRQUFRLENBQUMsQ0FBQztJQUVwQyxtQ0FBbUM7SUFDbkMsTUFBTSxVQUFVLEdBQVEsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLEFBQUM7SUFDM0MsVUFBVSxDQUFDLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxJQUFJLFNBQVMsQ0FBQyxDQUFDO0lBRTVDLElBQUksSUFBSSxLQUFLLFNBQVMsRUFBRTtRQUN0QixVQUFVLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztLQUN4QjtJQUNELElBQUksTUFBTSxLQUFLLFNBQVMsRUFBRTtRQUN4QixVQUFVLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztLQUM1QjtJQUVELDREQUE0RDtJQUM1RCxLQUFLLENBQUMsaUJBQWlCLENBQUMsVUFBVSxFQUFFLElBQUksSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7SUFFakUsT0FBTyxVQUFVLENBQUM7Q0FDbkI7QUFFRCxTQUFTLGFBQWEsQ0FBQyxPQUFjLEVBQUU7SUFDckMsT0FBTyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7Q0FDbEM7QUFFRCxzRkFBc0YsQ0FDdEYsT0FBTyxTQUFTLFdBQVcsQ0FDekIsT0FBdUIsRUFDdkIsSUFJUSxFQUNSLElBQWEsRUFDYiw2QkFBNkI7QUFDN0IsSUFBZSxFQUNmO0lBQ0EsSUFBSSxNQUFNLEFBQUM7SUFFWCxJQUFJLElBQUksS0FBSyxJQUFJLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNyRSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztRQUNqQixJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztRQUVqQixJQUFJLE9BQU8sSUFBSSxDQUFDLE1BQU0sS0FBSyxRQUFRLEVBQUU7WUFDbkMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7U0FDdEI7UUFFRCxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksSUFBSSxTQUFTLENBQUM7S0FDL0IsTUFBTSxJQUFJLE9BQU8sSUFBSSxLQUFLLFVBQVUsRUFBRTtRQUNyQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ1osSUFBSSxHQUFHLFNBQVMsQ0FBQztRQUNqQixJQUFJLEdBQUcsU0FBUyxDQUFDO0tBQ2xCO0lBRUQsSUFBSSxJQUFJLEtBQUssU0FBUyxFQUFFO1FBQ3RCLGNBQWMsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7S0FDOUI7SUFFRCxJQUFJLE9BQU8sSUFBSSxLQUFLLFVBQVUsRUFBRTtRQUM5QixJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ1osSUFBSSxHQUFHLFNBQVMsQ0FBQztLQUNsQixNQUFNLElBQUksSUFBSSxLQUFLLFNBQVMsRUFBRTtRQUM3QixjQUFjLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0tBQzlCO0lBRUQsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUU7UUFDL0IsT0FBTyxHQUFHLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQVksSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztLQUM1RSxNQUFNLElBQUksQ0FBQyxDQUFDLE9BQU8sWUFBWSxLQUFLLENBQUMsRUFBRTtRQUN0QyxNQUFNLElBQUksb0JBQW9CLENBQUMsU0FBUyxFQUFFO1lBQUMsT0FBTztZQUFFLFFBQVE7U0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0tBQ3pFO0lBRUQsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLG9CQUFvQixFQUFFO1FBQ3pDLG1DQUFtQztRQUNuQyxJQUFJLEFBQUMsT0FBTyxDQUFTLGFBQWEsRUFBRTtZQUNsQyxPQUFPO1NBQ1I7UUFFRCxtQ0FBbUM7UUFDbkMsSUFBSSxBQUFDLE9BQU8sQ0FBUyxnQkFBZ0IsRUFBRTtZQUNyQyxzRUFBc0U7WUFDdEUsbUJBQW1CO1lBQ25CLE9BQU8sT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFNO2dCQUM1QixNQUFNLE9BQU8sQ0FBQzthQUNmLENBQUMsQ0FBQztTQUNKO0tBQ0Y7SUFFRCxPQUFPLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQztDQUMxQztBQUVELFNBQVMsTUFBTSxDQUFDLElBQXVCLEVBQW9CO0lBQ3pELE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxHQUFHLEVBQUUsQUFBQztJQUNoQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsQUFBQztJQUNyQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxTQUFTLEdBQUcsR0FBRyxHQUFHLGFBQWEsQ0FBQyxBQUFDO0lBQ2pFLElBQUksQ0FBQyxJQUFJLEVBQUU7UUFDVCxPQUFPO1lBQUMsR0FBRztZQUFFLElBQUk7U0FBQyxDQUFDO0tBQ3BCO0lBQ0QsTUFBTSxDQUFDLE9BQU8sRUFBRSxRQUFRLENBQUMsR0FBRyxJQUFJLEFBQUM7SUFDakMsT0FBTztRQUFDLEdBQUcsR0FBRyxPQUFPO1FBQUUsSUFBSSxHQUFHLFFBQVE7S0FBQyxDQUFDO0NBQ3pDO0FBRUQsTUFBTSxDQUFDLE1BQU0sR0FBRyxXQUFvQjtJQUNsQyxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxHQUFHLE1BQU0sRUFBRSxBQUFDO0lBQzdCLE9BQU8sTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLGNBQWMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7Q0FDcEQsQ0FBQztBQUVGLFNBQVMsV0FBVyxHQU1sQjtJQUNBLE9BQU87UUFDTCxHQUFHLElBQUksQ0FBQyxXQUFXLEVBQUU7UUFDckIsWUFBWSxFQUFFLENBQUM7S0FDaEIsQ0FBQztDQUNIO0FBRUQsV0FBVyxDQUFDLEdBQUcsR0FBRyxXQUFvQjtJQUNwQyxPQUFPLFdBQVcsRUFBRSxDQUFDLEdBQUcsQ0FBQztDQUMxQixDQUFDO0FBRUYsT0FBTyxTQUFTLElBQUksQ0FBQyxHQUFXLEVBQUUsR0FBeUIsR0FBRyxTQUFTLEVBQUU7SUFDdkUsSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEVBQUU7UUFDcEIsTUFBTSxJQUFJLG9CQUFvQixDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUM7S0FDdEQ7SUFFRCxJQUFJLE9BQU8sR0FBRyxLQUFLLFFBQVEsRUFBRTtRQUMzQixJQUFJO1lBQ0YsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7U0FDckIsQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUNWLElBQUksQ0FBQyxZQUFZLFNBQVMsRUFBRTtnQkFDMUIsTUFBTSxJQUFJLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQ25DO1lBQ0QsTUFBTSxDQUFDLENBQUM7U0FDVDtLQUNGLE1BQU07UUFDTCxNQUFNLElBQUksa0JBQWtCLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7S0FDOUM7SUFFRCxPQUFPLElBQUksQ0FBQztDQUNiO0FBRUQsTUFBTSxPQUFPLFNBQVMsWUFBWTtJQUNoQyxhQUFjO1FBQ1osS0FBSyxFQUFFLENBQUM7UUFFUixVQUFVLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFFLElBQU07WUFDMUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUU7Z0JBQ3JCLE9BQU8sQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO2dCQUN4QixLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxDQUFDO2FBQzNDO1NBQ0YsQ0FBQyxDQUFDO0tBQ0o7SUFFRCwrREFBK0QsQ0FDL0QsSUFBSSxHQUFHLElBQUksQ0FBQztJQUVaOzs7S0FHRyxDQUNILElBQUksR0FBRyxJQUFJLENBQUM7SUFFWiwwRUFBMEUsQ0FDMUUsS0FBSyxHQUFHLEtBQUssQ0FBQztJQUVkLHdEQUF3RCxDQUN4RCxNQUFNLEdBQUc7UUFDUCxlQUFlLEVBQUUsRUFBRTtRQUNuQixTQUFTLEVBQUUsRUFBRTtLQUNkLENBQUM7SUFFRiw4REFBOEQsQ0FDOUQsR0FBRyxHQUFHLEdBQUcsQ0FBQztJQUVWOzs7S0FHRyxDQUNILEdBQUcsR0FBRyxHQUFHLENBQUM7SUFFVixtRUFBbUUsQ0FDbkUsUUFBUSxHQUFhLEVBQUUsQ0FBQztJQUV4QixvRUFBb0UsQ0FDcEUsSUFBSSxHQUFHLElBQUksQ0FBQztJQUVaLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFFcEIsNERBQTRELENBQzVELFFBQVEsR0FBdUIsU0FBUyxDQUFDO0lBRXpDLDREQUE0RDtJQUM1RCxtQ0FBbUM7SUFDbkMsVUFBVSxHQUFRLFNBQVMsQ0FBQztJQUU1QixpRkFBaUYsQ0FDakYsUUFBUSxHQUFHLFNBQVMsQ0FBQztJQVNyQixtQ0FBbUM7SUFDbkMsQUFBUyxFQUFFLENBQUMsS0FBYSxFQUFFLFFBQWtDLEVBQVE7UUFDbkUsSUFBSSxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDeEMsa0JBQWtCLENBQUMsQ0FBQyxZQUFZLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDN0MsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7U0FDM0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDbEMsSUFBSSxLQUFLLEtBQUssVUFBVSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxLQUFLLFNBQVMsRUFBRTtZQUN2RCxtREFBbUQ7YUFDcEQsTUFBTTtnQkFDTCxZQUFZLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFpQixRQUFRLENBQUMsQ0FBQzthQUNoRTtTQUNGLE1BQU07WUFDTCxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztTQUMzQjtRQUVELE9BQU8sSUFBSSxDQUFDO0tBQ2I7SUFRRCxtQ0FBbUM7SUFDbkMsQUFBUyxHQUFHLENBQUMsS0FBYSxFQUFFLFFBQWtDLEVBQVE7UUFDcEUsSUFBSSxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDeEMsa0JBQWtCLENBQUMsQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDOUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7U0FDNUIsTUFBTSxJQUFJLEtBQUssQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDbEMsSUFBSSxLQUFLLEtBQUssVUFBVSxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxLQUFLLFNBQVMsRUFBRTtZQUN2RCxtREFBbUQ7YUFDcEQsTUFBTTtnQkFDTCxZQUFZLENBQUMsb0JBQW9CLENBQUMsS0FBSyxFQUFpQixRQUFRLENBQUMsQ0FBQzthQUNuRTtTQUNGLE1BQU07WUFDTCxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztTQUM1QjtRQUVELE9BQU8sSUFBSSxDQUFDO0tBQ2I7SUFFRCxtQ0FBbUM7SUFDbkMsQUFBUyxJQUFJLENBQUMsS0FBYSxFQUFFLEdBQUcsSUFBSSxBQUFPLEVBQVc7UUFDcEQsSUFBSSxLQUFLLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQzNCLElBQUksS0FBSyxLQUFLLFVBQVUsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxTQUFTLEVBQUU7WUFDdkQsbURBQW1EO2FBQ3BELE1BQU07Z0JBQ0wsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBZ0IsQ0FBQzthQUMzQztTQUNGLE1BQU07WUFDTCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFDO1NBQ25DO1FBRUQsT0FBTyxJQUFJLENBQUM7S0FDYjtJQVdELEFBQVMsZUFBZSxDQUN0QixLQUFhLEVBQ2IsbUNBQW1DO0lBQ25DLFFBQWtDLEVBQzVCO1FBQ04sSUFBSSxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDeEMsa0JBQWtCLENBQUMsQ0FBQyx5QkFBeUIsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxRCxLQUFLLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztTQUN4QyxNQUFNLElBQUksS0FBSyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUNsQyxJQUFJLEtBQUssS0FBSyxVQUFVLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssU0FBUyxFQUFFO1lBQ3ZELG1EQUFtRDthQUNwRCxNQUFNO2dCQUNMLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLEVBQWlCLFFBQVEsQ0FBQyxDQUFDO2FBQ2hFO1NBQ0YsTUFBTTtZQUNMLEtBQUssQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1NBQ3hDO1FBRUQsT0FBTyxJQUFJLENBQUM7S0FDYjtJQUVELDhEQUE4RCxDQUM5RCxHQUFHLEdBQUcsR0FBRyxDQUFDO0lBRVYsbUVBQW1FLENBQ25FLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFRcEIsQUFBUyxXQUFXLENBQ2xCLEtBQWEsRUFDYixtQ0FBbUM7SUFDbkMsUUFBa0MsRUFDNUI7UUFDTixJQUFJLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUN4QyxrQkFBa0IsQ0FBQyxDQUFDLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1NBQ3ZEO1FBRUQsT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztLQUNqQztJQVdELEFBQVMsY0FBYyxDQUNyQixLQUFhLEVBQ2IsbUNBQW1DO0lBQ25DLFFBQWtDLEVBQzVCO1FBQ04sSUFBSSxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDeEMsa0JBQWtCLENBQUMsQ0FBQyx3QkFBd0IsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztTQUMxRDtRQUVELE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7S0FDbEM7SUFFRDs7Ozs7Ozs7Ozs7O0tBWUcsQ0FDSCxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBRWhCLGdFQUFnRSxDQUNoRSxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBRVosV0FBVyxHQUFHLFdBQVcsQ0FBQztJQUUxQixpRUFBaUUsQ0FDakUsTUFBTSxHQUFHLE1BQU0sQ0FBQztJQUVoQixnRUFBZ0UsQ0FDaEUsS0FBSyxHQUFHLEtBQUssQ0FBQztJQUVkLGlFQUFpRSxDQUNqRSxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBRWhCLGtFQUFrRSxDQUNsRSxPQUFPLEdBQUcsT0FBTyxDQUFDO0lBRWxCLG1FQUFtRSxDQUNuRSxRQUFRLEdBQUcsUUFBUSxDQUFDO0lBRXBCLHNGQUFzRixDQUN0RixXQUFXLEdBQUcsV0FBVyxDQUFDO0lBRTFCLE9BQU8sQ0FBQyxJQUFpQixFQUFFO1FBQ3pCLE9BQU8sVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3pCO0lBRUQsMkRBQTJELENBQzNELEtBQUssR0FBRztRQUNOLGdEQUFnRDtRQUNoRCxxREFBcUQ7UUFDckQsaUJBQWlCO1FBQ2pCLCtFQUErRTtRQUMvRSxPQUFPLElBQUksQ0FBQztLQUNiO0lBRUQsd0RBQXdELENBQ3hELE1BQU0sR0FBVztRQUNmLDhDQUE4QztRQUM5QyxPQUFPLEdBQUcsQ0FBQztLQUNaO0lBRUQsd0RBQXdELENBQ3hELE1BQU0sR0FBVztRQUNmLCtDQUErQztRQUMvQyxPQUFPLEdBQUcsQ0FBQztLQUNaO0lBRUQseUVBQXlFO0lBQ3pFLEtBQUssR0FBdUIsU0FBUyxDQUFDO0lBRXRDLDBEQUEwRCxDQUMxRCxJQUFJLFFBQVEsR0FBRztRQUNiLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ2hCO0lBRUQsQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3hCLHdEQUF3RCxDQUN4RCxNQUFNLEdBQUc7UUFDUCxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLElBQUksQ0FBQztLQUM5QztJQUVELENBQUMsWUFBWSxHQUFHLGlCQUFpQixFQUFFLENBQUM7SUFDcEMsNkVBQTZFLENBQzdFLElBQUksMkJBQTJCLEdBQUc7UUFDaEMsT0FBTyxJQUFJLENBQUMsQ0FBQyxZQUFZLENBQUM7S0FDM0I7SUFFRCxRQUFRLEdBQUc7UUFBRSxTQUFTLEVBQUUsS0FBSztLQUFFLENBQUM7Q0FDakM7QUFFRCwwREFBMEQsQ0FDMUQsTUFBTSxPQUFPLEdBQUcsSUFBSSxPQUFPLEVBQUUsQUFBQztBQUU5QixNQUFNLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsV0FBVyxFQUFFO0lBQ2pELFVBQVUsRUFBRSxLQUFLO0lBQ2pCLFFBQVEsRUFBRSxJQUFJO0lBQ2QsWUFBWSxFQUFFLEtBQUs7SUFDbkIsS0FBSyxFQUFFLFNBQVM7Q0FDakIsQ0FBQyxDQUFDO0FBRUgsdUJBQXVCLENBQUMsZUFBZSxFQUFFLGtCQUFrQixDQUFDLENBQUM7QUFDN0QsdUJBQXVCLENBQUMsa0JBQWtCLEVBQUUscUJBQXFCLENBQUMsQ0FBQztBQUVuRSxPQUFPLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxjQUFjLENBQUM7QUFDckQsT0FBTyxNQUFNLGtCQUFrQixHQUFHLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQztBQUU3RCxlQUFlLE9BQU8sQ0FBQztBQUV2QixnQkFBZ0I7QUFDaEIsZUFBZTtBQUNmLDJDQUEyQztBQUMzQyxTQUFTLE9BQU8sR0FBRyJ9