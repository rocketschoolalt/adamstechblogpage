// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright Node.js contributors. All rights reserved. MIT License.
/** NOT IMPLEMENTED
 * ERR_MANIFEST_ASSERT_INTEGRITY
 * ERR_QUICSESSION_VERSION_NEGOTIATION
 * ERR_REQUIRE_ESM
 * ERR_TLS_CERT_ALTNAME_INVALID
 * ERR_WORKER_INVALID_EXEC_ARGV
 * ERR_WORKER_PATH
 * ERR_QUIC_ERROR
 * ERR_SYSTEM_ERROR //System error, shouldn't ever happen inside Deno
 * ERR_TTY_INIT_FAILED //System error, shouldn't ever happen inside Deno
 * ERR_INVALID_PACKAGE_CONFIG // package.json stuff, probably useless
 */ import { getSystemErrorName } from "../util.ts";
import { inspect } from "../internal/util/inspect.mjs";
import { codes } from "./error_codes.ts";
import { codeMap, errorMap, mapSysErrnoToUvErrno } from "../internal_binding/uv.ts";
import { assert } from "../../_util/assert.ts";
import { isWindows } from "../../_util/os.ts";
import { os as osConstants } from "../internal_binding/constants.ts";
const { errno: { ENOTDIR , ENOENT  } ,  } = osConstants;
import { hideStackFrames } from "./hide_stack_frames.ts";
export { errorMap };
const kIsNodeError = Symbol("kIsNodeError");
/**
 * @see https://github.com/nodejs/node/blob/f3eb224/lib/internal/errors.js
 */ const classRegExp = /^([A-Z][a-z0-9]*)+$/;
/**
 * @see https://github.com/nodejs/node/blob/f3eb224/lib/internal/errors.js
 * @description Sorted by a rough estimate on most frequently used entries.
 */ const kTypes = [
    "string",
    "function",
    "number",
    "object",
    // Accept 'Function' and 'Object' as alternative to the lower cased version.
    "Function",
    "Object",
    "boolean",
    "bigint",
    "symbol", 
];
// Node uses an AbortError that isn't exactly the same as the DOMException
// to make usage of the error in userland and readable-stream easier.
// It is a regular error with `.code` and `.name`.
export class AbortError extends Error {
    code;
    constructor(){
        super("The operation was aborted");
        this.code = "ABORT_ERR";
        this.name = "AbortError";
    }
}
let maxStack_ErrorName;
let maxStack_ErrorMessage;
/**
 * Returns true if `err.name` and `err.message` are equal to engine-specific
 * values indicating max call stack size has been exceeded.
 * "Maximum call stack size exceeded" in V8.
 */ export function isStackOverflowError(err) {
    if (maxStack_ErrorMessage === undefined) {
        try {
            // deno-lint-ignore no-inner-declarations
            function overflowStack() {
                overflowStack();
            }
            overflowStack();
        // deno-lint-ignore no-explicit-any
        } catch (err1) {
            maxStack_ErrorMessage = err1.message;
            maxStack_ErrorName = err1.name;
        }
    }
    return err && err.name === maxStack_ErrorName && err.message === maxStack_ErrorMessage;
}
function addNumericalSeparator(val) {
    let res = "";
    let i = val.length;
    const start = val[0] === "-" ? 1 : 0;
    for(; i >= start + 4; i -= 3){
        res = `_${val.slice(i - 3, i)}${res}`;
    }
    return `${val.slice(0, i)}${res}`;
}
const captureLargerStackTrace = hideStackFrames(function captureLargerStackTrace(err) {
    // @ts-ignore this function is not available in lib.dom.d.ts
    Error.captureStackTrace(err);
    return err;
});
/**
 * This creates an error compatible with errors produced in the C++
 * This function should replace the deprecated
 * `exceptionWithHostPort()` function.
 *
 * @param err A libuv error number
 * @param syscall
 * @param address
 * @param port
 * @return The error.
 */ export const uvExceptionWithHostPort = hideStackFrames(function uvExceptionWithHostPort(err, syscall, address, port) {
    const { 0: code , 1: uvmsg  } = uvErrmapGet(err) || uvUnmappedError;
    const message = `${syscall} ${code}: ${uvmsg}`;
    let details = "";
    if (port && port > 0) {
        details = ` ${address}:${port}`;
    } else if (address) {
        details = ` ${address}`;
    }
    // deno-lint-ignore no-explicit-any
    const ex = new Error(`${message}${details}`);
    ex.code = code;
    ex.errno = err;
    ex.syscall = syscall;
    ex.address = address;
    if (port) {
        ex.port = port;
    }
    return captureLargerStackTrace(ex);
});
/**
 * This used to be `util._errnoException()`.
 *
 * @param err A libuv error number
 * @param syscall
 * @param original
 * @return A `ErrnoException`
 */ export const errnoException = hideStackFrames(function errnoException(err, syscall, original) {
    const code = getSystemErrorName(err);
    const message = original ? `${syscall} ${code} ${original}` : `${syscall} ${code}`;
    // deno-lint-ignore no-explicit-any
    const ex = new Error(message);
    ex.errno = err;
    ex.code = code;
    ex.syscall = syscall;
    return captureLargerStackTrace(ex);
});
function uvErrmapGet(name) {
    return errorMap.get(name);
}
const uvUnmappedError = [
    "UNKNOWN",
    "unknown error"
];
/**
 * This creates an error compatible with errors produced in the C++
 * function UVException using a context object with data assembled in C++.
 * The goal is to migrate them to ERR_* errors later when compatibility is
 * not a concern.
 *
 * @param ctx
 * @return The error.
 */ export const uvException = hideStackFrames(function uvException(ctx) {
    const { 0: code , 1: uvmsg  } = uvErrmapGet(ctx.errno) || uvUnmappedError;
    let message = `${code}: ${ctx.message || uvmsg}, ${ctx.syscall}`;
    let path;
    let dest;
    if (ctx.path) {
        path = ctx.path.toString();
        message += ` '${path}'`;
    }
    if (ctx.dest) {
        dest = ctx.dest.toString();
        message += ` -> '${dest}'`;
    }
    // deno-lint-ignore no-explicit-any
    const err = new Error(message);
    for (const prop of Object.keys(ctx)){
        if (prop === "message" || prop === "path" || prop === "dest") {
            continue;
        }
        err[prop] = ctx[prop];
    }
    err.code = code;
    if (path) {
        err.path = path;
    }
    if (dest) {
        err.dest = dest;
    }
    return captureLargerStackTrace(err);
});
/**
 * Deprecated, new function is `uvExceptionWithHostPort()`
 * New function added the error description directly
 * from C++. this method for backwards compatibility
 * @param err A libuv error number
 * @param syscall
 * @param address
 * @param port
 * @param additional
 */ export const exceptionWithHostPort = hideStackFrames(function exceptionWithHostPort(err, syscall, address, port, additional) {
    const code = getSystemErrorName(err);
    let details = "";
    if (port && port > 0) {
        details = ` ${address}:${port}`;
    } else if (address) {
        details = ` ${address}`;
    }
    if (additional) {
        details += ` - Local (${additional})`;
    }
    // deno-lint-ignore no-explicit-any
    const ex = new Error(`${syscall} ${code}${details}`);
    ex.errno = err;
    ex.code = code;
    ex.syscall = syscall;
    ex.address = address;
    if (port) {
        ex.port = port;
    }
    return captureLargerStackTrace(ex);
});
/**
 * @param code A libuv error number or a c-ares error code
 * @param syscall
 * @param hostname
 */ export const dnsException = hideStackFrames(function(code, syscall, hostname) {
    let errno;
    // If `code` is of type number, it is a libuv error number, else it is a
    // c-ares error code.
    if (typeof code === "number") {
        errno = code;
        // ENOTFOUND is not a proper POSIX error, but this error has been in place
        // long enough that it's not practical to remove it.
        if (code === codeMap.get("EAI_NODATA") || code === codeMap.get("EAI_NONAME")) {
            code = "ENOTFOUND"; // Fabricated error name.
        } else {
            code = getSystemErrorName(code);
        }
    }
    const message = `${syscall} ${code}${hostname ? ` ${hostname}` : ""}`;
    // deno-lint-ignore no-explicit-any
    const ex = new Error(message);
    ex.errno = errno;
    ex.code = code;
    ex.syscall = syscall;
    if (hostname) {
        ex.hostname = hostname;
    }
    return captureLargerStackTrace(ex);
});
/**
 * All error instances in Node have additional methods and properties
 * This export class is meant to be extended by these instances abstracting native JS error instances
 */ export class NodeErrorAbstraction extends Error {
    code;
    constructor(name, code, message){
        super(message);
        this.code = code;
        this.name = name;
        //This number changes depending on the name of this class
        //20 characters as of now
        this.stack = this.stack && `${name} [${this.code}]${this.stack.slice(20)}`;
    }
    toString() {
        return `${this.name} [${this.code}]: ${this.message}`;
    }
}
export class NodeError extends NodeErrorAbstraction {
    constructor(code, message){
        super(Error.prototype.name, code, message);
    }
}
export class NodeSyntaxError extends NodeErrorAbstraction {
    constructor(code, message){
        super(SyntaxError.prototype.name, code, message);
        Object.setPrototypeOf(this, SyntaxError.prototype);
        this.toString = function() {
            return `${this.name} [${this.code}]: ${this.message}`;
        };
    }
}
export class NodeRangeError extends NodeErrorAbstraction {
    constructor(code, message){
        super(RangeError.prototype.name, code, message);
        Object.setPrototypeOf(this, RangeError.prototype);
        this.toString = function() {
            return `${this.name} [${this.code}]: ${this.message}`;
        };
    }
}
export class NodeTypeError extends NodeErrorAbstraction {
    constructor(code, message){
        super(TypeError.prototype.name, code, message);
        Object.setPrototypeOf(this, TypeError.prototype);
        this.toString = function() {
            return `${this.name} [${this.code}]: ${this.message}`;
        };
    }
}
export class NodeURIError extends NodeErrorAbstraction {
    constructor(code, message){
        super(URIError.prototype.name, code, message);
        Object.setPrototypeOf(this, URIError.prototype);
        this.toString = function() {
            return `${this.name} [${this.code}]: ${this.message}`;
        };
    }
}
// A specialized Error that includes an additional info property with
// additional information about the error condition.
// It has the properties present in a UVException but with a custom error
// message followed by the uv error code and uv error message.
// It also has its own error code with the original uv error context put into
// `err.info`.
// The context passed into this error must have .code, .syscall and .message,
// and may have .path and .dest.
class NodeSystemError extends NodeErrorAbstraction {
    constructor(key, context, msgPrefix){
        let message = `${msgPrefix}: ${context.syscall} returned ` + `${context.code} (${context.message})`;
        if (context.path !== undefined) {
            message += ` ${context.path}`;
        }
        if (context.dest !== undefined) {
            message += ` => ${context.dest}`;
        }
        super("SystemError", key, message);
        captureLargerStackTrace(this);
        Object.defineProperties(this, {
            [kIsNodeError]: {
                value: true,
                enumerable: false,
                writable: false,
                configurable: true
            },
            info: {
                value: context,
                enumerable: true,
                configurable: true,
                writable: false
            },
            errno: {
                get () {
                    return context.errno;
                },
                set: (value)=>{
                    context.errno = value;
                },
                enumerable: true,
                configurable: true
            },
            syscall: {
                get () {
                    return context.syscall;
                },
                set: (value)=>{
                    context.syscall = value;
                },
                enumerable: true,
                configurable: true
            }
        });
        if (context.path !== undefined) {
            Object.defineProperty(this, "path", {
                get () {
                    return context.path;
                },
                set: (value)=>{
                    context.path = value;
                },
                enumerable: true,
                configurable: true
            });
        }
        if (context.dest !== undefined) {
            Object.defineProperty(this, "dest", {
                get () {
                    return context.dest;
                },
                set: (value)=>{
                    context.dest = value;
                },
                enumerable: true,
                configurable: true
            });
        }
    }
    toString() {
        return `${this.name} [${this.code}]: ${this.message}`;
    }
}
function makeSystemErrorWithCode(key, msgPrfix) {
    return class NodeError extends NodeSystemError {
        constructor(ctx){
            super(key, ctx, msgPrfix);
        }
    };
}
export const ERR_FS_EISDIR = makeSystemErrorWithCode("ERR_FS_EISDIR", "Path is a directory");
function createInvalidArgType(name, expected) {
    // https://github.com/nodejs/node/blob/f3eb224/lib/internal/errors.js#L1037-L1087
    expected = Array.isArray(expected) ? expected : [
        expected
    ];
    let msg = "The ";
    if (name.endsWith(" argument")) {
        // For cases like 'first argument'
        msg += `${name} `;
    } else {
        const type = name.includes(".") ? "property" : "argument";
        msg += `"${name}" ${type} `;
    }
    msg += "must be ";
    const types = [];
    const instances = [];
    const other = [];
    for (const value of expected){
        if (kTypes.includes(value)) {
            types.push(value.toLocaleLowerCase());
        } else if (classRegExp.test(value)) {
            instances.push(value);
        } else {
            other.push(value);
        }
    }
    // Special handle `object` in case other instances are allowed to outline
    // the differences between each other.
    if (instances.length > 0) {
        const pos = types.indexOf("object");
        if (pos !== -1) {
            types.splice(pos, 1);
            instances.push("Object");
        }
    }
    if (types.length > 0) {
        if (types.length > 2) {
            const last = types.pop();
            msg += `one of type ${types.join(", ")}, or ${last}`;
        } else if (types.length === 2) {
            msg += `one of type ${types[0]} or ${types[1]}`;
        } else {
            msg += `of type ${types[0]}`;
        }
        if (instances.length > 0 || other.length > 0) {
            msg += " or ";
        }
    }
    if (instances.length > 0) {
        if (instances.length > 2) {
            const last1 = instances.pop();
            msg += `an instance of ${instances.join(", ")}, or ${last1}`;
        } else {
            msg += `an instance of ${instances[0]}`;
            if (instances.length === 2) {
                msg += ` or ${instances[1]}`;
            }
        }
        if (other.length > 0) {
            msg += " or ";
        }
    }
    if (other.length > 0) {
        if (other.length > 2) {
            const last2 = other.pop();
            msg += `one of ${other.join(", ")}, or ${last2}`;
        } else if (other.length === 2) {
            msg += `one of ${other[0]} or ${other[1]}`;
        } else {
            if (other[0].toLowerCase() !== other[0]) {
                msg += "an ";
            }
            msg += `${other[0]}`;
        }
    }
    return msg;
}
export class ERR_INVALID_ARG_TYPE_RANGE extends NodeRangeError {
    constructor(name, expected, actual){
        const msg = createInvalidArgType(name, expected);
        super("ERR_INVALID_ARG_TYPE", `${msg}.${invalidArgTypeHelper(actual)}`);
    }
}
export class ERR_INVALID_ARG_TYPE extends NodeTypeError {
    constructor(name, expected, actual){
        const msg = createInvalidArgType(name, expected);
        super("ERR_INVALID_ARG_TYPE", `${msg}.${invalidArgTypeHelper(actual)}`);
    }
    static RangeError = ERR_INVALID_ARG_TYPE_RANGE;
}
class ERR_INVALID_ARG_VALUE_RANGE extends NodeRangeError {
    constructor(name, value, reason = "is invalid"){
        const type = name.includes(".") ? "property" : "argument";
        const inspected = inspect(value);
        super("ERR_INVALID_ARG_VALUE", `The ${type} '${name}' ${reason}. Received ${inspected}`);
    }
}
export class ERR_INVALID_ARG_VALUE extends NodeTypeError {
    constructor(name, value, reason = "is invalid"){
        const type = name.includes(".") ? "property" : "argument";
        const inspected = inspect(value);
        super("ERR_INVALID_ARG_VALUE", `The ${type} '${name}' ${reason}. Received ${inspected}`);
    }
    static RangeError = ERR_INVALID_ARG_VALUE_RANGE;
}
// A helper function to simplify checking for ERR_INVALID_ARG_TYPE output.
// deno-lint-ignore no-explicit-any
function invalidArgTypeHelper(input) {
    if (input == null) {
        return ` Received ${input}`;
    }
    if (typeof input === "function" && input.name) {
        return ` Received function ${input.name}`;
    }
    if (typeof input === "object") {
        if (input.constructor && input.constructor.name) {
            return ` Received an instance of ${input.constructor.name}`;
        }
        return ` Received ${inspect(input, {
            depth: -1
        })}`;
    }
    let inspected = inspect(input, {
        colors: false
    });
    if (inspected.length > 25) {
        inspected = `${inspected.slice(0, 25)}...`;
    }
    return ` Received type ${typeof input} (${inspected})`;
}
export class ERR_OUT_OF_RANGE extends RangeError {
    code = "ERR_OUT_OF_RANGE";
    constructor(str, range, input, replaceDefaultBoolean = false){
        assert(range, 'Missing "range" argument');
        let msg = replaceDefaultBoolean ? str : `The value of "${str}" is out of range.`;
        let received;
        if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
            received = addNumericalSeparator(String(input));
        } else if (typeof input === "bigint") {
            received = String(input);
            if (input > 2n ** 32n || input < -(2n ** 32n)) {
                received = addNumericalSeparator(received);
            }
            received += "n";
        } else {
            received = inspect(input);
        }
        msg += ` It must be ${range}. Received ${received}`;
        super(msg);
        const { name  } = this;
        // Add the error code to the name to include it in the stack trace.
        this.name = `${name} [${this.code}]`;
        // Access the stack to generate the error message including the error code from the name.
        this.stack;
        // Reset the name to the actual name.
        this.name = name;
    }
}
export class ERR_AMBIGUOUS_ARGUMENT extends NodeTypeError {
    constructor(x, y){
        super("ERR_AMBIGUOUS_ARGUMENT", `The "${x}" argument is ambiguous. ${y}`);
    }
}
export class ERR_ARG_NOT_ITERABLE extends NodeTypeError {
    constructor(x){
        super("ERR_ARG_NOT_ITERABLE", `${x} must be iterable`);
    }
}
export class ERR_ASSERTION extends NodeError {
    constructor(x){
        super("ERR_ASSERTION", `${x}`);
    }
}
export class ERR_ASYNC_CALLBACK extends NodeTypeError {
    constructor(x){
        super("ERR_ASYNC_CALLBACK", `${x} must be a function`);
    }
}
export class ERR_ASYNC_TYPE extends NodeTypeError {
    constructor(x){
        super("ERR_ASYNC_TYPE", `Invalid name for async "type": ${x}`);
    }
}
export class ERR_BROTLI_INVALID_PARAM extends NodeRangeError {
    constructor(x){
        super("ERR_BROTLI_INVALID_PARAM", `${x} is not a valid Brotli parameter`);
    }
}
export class ERR_BUFFER_OUT_OF_BOUNDS extends NodeRangeError {
    constructor(name){
        super("ERR_BUFFER_OUT_OF_BOUNDS", name ? `"${name}" is outside of buffer bounds` : "Attempt to access memory outside buffer bounds");
    }
}
export class ERR_BUFFER_TOO_LARGE extends NodeRangeError {
    constructor(x){
        super("ERR_BUFFER_TOO_LARGE", `Cannot create a Buffer larger than ${x} bytes`);
    }
}
export class ERR_CANNOT_WATCH_SIGINT extends NodeError {
    constructor(){
        super("ERR_CANNOT_WATCH_SIGINT", "Cannot watch for SIGINT signals");
    }
}
export class ERR_CHILD_CLOSED_BEFORE_REPLY extends NodeError {
    constructor(){
        super("ERR_CHILD_CLOSED_BEFORE_REPLY", "Child closed before reply received");
    }
}
export class ERR_CHILD_PROCESS_IPC_REQUIRED extends NodeError {
    constructor(x){
        super("ERR_CHILD_PROCESS_IPC_REQUIRED", `Forked processes must have an IPC channel, missing value 'ipc' in ${x}`);
    }
}
export class ERR_CHILD_PROCESS_STDIO_MAXBUFFER extends NodeRangeError {
    constructor(x){
        super("ERR_CHILD_PROCESS_STDIO_MAXBUFFER", `${x} maxBuffer length exceeded`);
    }
}
export class ERR_CONSOLE_WRITABLE_STREAM extends NodeTypeError {
    constructor(x){
        super("ERR_CONSOLE_WRITABLE_STREAM", `Console expects a writable stream instance for ${x}`);
    }
}
export class ERR_CONTEXT_NOT_INITIALIZED extends NodeError {
    constructor(){
        super("ERR_CONTEXT_NOT_INITIALIZED", "context used is not initialized");
    }
}
export class ERR_CPU_USAGE extends NodeError {
    constructor(x){
        super("ERR_CPU_USAGE", `Unable to obtain cpu usage ${x}`);
    }
}
export class ERR_CRYPTO_CUSTOM_ENGINE_NOT_SUPPORTED extends NodeError {
    constructor(){
        super("ERR_CRYPTO_CUSTOM_ENGINE_NOT_SUPPORTED", "Custom engines not supported by this OpenSSL");
    }
}
export class ERR_CRYPTO_ECDH_INVALID_FORMAT extends NodeTypeError {
    constructor(x){
        super("ERR_CRYPTO_ECDH_INVALID_FORMAT", `Invalid ECDH format: ${x}`);
    }
}
export class ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY extends NodeError {
    constructor(){
        super("ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY", "Public key is not valid for specified curve");
    }
}
export class ERR_CRYPTO_ENGINE_UNKNOWN extends NodeError {
    constructor(x){
        super("ERR_CRYPTO_ENGINE_UNKNOWN", `Engine "${x}" was not found`);
    }
}
export class ERR_CRYPTO_FIPS_FORCED extends NodeError {
    constructor(){
        super("ERR_CRYPTO_FIPS_FORCED", "Cannot set FIPS mode, it was forced with --force-fips at startup.");
    }
}
export class ERR_CRYPTO_FIPS_UNAVAILABLE extends NodeError {
    constructor(){
        super("ERR_CRYPTO_FIPS_UNAVAILABLE", "Cannot set FIPS mode in a non-FIPS build.");
    }
}
export class ERR_CRYPTO_HASH_FINALIZED extends NodeError {
    constructor(){
        super("ERR_CRYPTO_HASH_FINALIZED", "Digest already called");
    }
}
export class ERR_CRYPTO_HASH_UPDATE_FAILED extends NodeError {
    constructor(){
        super("ERR_CRYPTO_HASH_UPDATE_FAILED", "Hash update failed");
    }
}
export class ERR_CRYPTO_INCOMPATIBLE_KEY extends NodeError {
    constructor(x, y){
        super("ERR_CRYPTO_INCOMPATIBLE_KEY", `Incompatible ${x}: ${y}`);
    }
}
export class ERR_CRYPTO_INCOMPATIBLE_KEY_OPTIONS extends NodeError {
    constructor(x, y){
        super("ERR_CRYPTO_INCOMPATIBLE_KEY_OPTIONS", `The selected key encoding ${x} ${y}.`);
    }
}
export class ERR_CRYPTO_INVALID_DIGEST extends NodeTypeError {
    constructor(x){
        super("ERR_CRYPTO_INVALID_DIGEST", `Invalid digest: ${x}`);
    }
}
export class ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE extends NodeTypeError {
    constructor(x, y){
        super("ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE", `Invalid key object type ${x}, expected ${y}.`);
    }
}
export class ERR_CRYPTO_INVALID_STATE extends NodeError {
    constructor(x){
        super("ERR_CRYPTO_INVALID_STATE", `Invalid state for operation ${x}`);
    }
}
export class ERR_CRYPTO_PBKDF2_ERROR extends NodeError {
    constructor(){
        super("ERR_CRYPTO_PBKDF2_ERROR", "PBKDF2 error");
    }
}
export class ERR_CRYPTO_SCRYPT_INVALID_PARAMETER extends NodeError {
    constructor(){
        super("ERR_CRYPTO_SCRYPT_INVALID_PARAMETER", "Invalid scrypt parameter");
    }
}
export class ERR_CRYPTO_SCRYPT_NOT_SUPPORTED extends NodeError {
    constructor(){
        super("ERR_CRYPTO_SCRYPT_NOT_SUPPORTED", "Scrypt algorithm not supported");
    }
}
export class ERR_CRYPTO_SIGN_KEY_REQUIRED extends NodeError {
    constructor(){
        super("ERR_CRYPTO_SIGN_KEY_REQUIRED", "No key provided to sign");
    }
}
export class ERR_DIR_CLOSED extends NodeError {
    constructor(){
        super("ERR_DIR_CLOSED", "Directory handle was closed");
    }
}
export class ERR_DIR_CONCURRENT_OPERATION extends NodeError {
    constructor(){
        super("ERR_DIR_CONCURRENT_OPERATION", "Cannot do synchronous work on directory handle with concurrent asynchronous operations");
    }
}
export class ERR_DNS_SET_SERVERS_FAILED extends NodeError {
    constructor(x, y){
        super("ERR_DNS_SET_SERVERS_FAILED", `c-ares failed to set servers: "${x}" [${y}]`);
    }
}
export class ERR_DOMAIN_CALLBACK_NOT_AVAILABLE extends NodeError {
    constructor(){
        super("ERR_DOMAIN_CALLBACK_NOT_AVAILABLE", "A callback was registered through " + "process.setUncaughtExceptionCaptureCallback(), which is mutually " + "exclusive with using the `domain` module");
    }
}
export class ERR_DOMAIN_CANNOT_SET_UNCAUGHT_EXCEPTION_CAPTURE extends NodeError {
    constructor(){
        super("ERR_DOMAIN_CANNOT_SET_UNCAUGHT_EXCEPTION_CAPTURE", "The `domain` module is in use, which is mutually exclusive with calling " + "process.setUncaughtExceptionCaptureCallback()");
    }
}
export class ERR_ENCODING_INVALID_ENCODED_DATA extends NodeErrorAbstraction {
    errno;
    constructor(encoding, ret){
        super(TypeError.prototype.name, "ERR_ENCODING_INVALID_ENCODED_DATA", `The encoded data was not valid for encoding ${encoding}`);
        Object.setPrototypeOf(this, TypeError.prototype);
        this.errno = ret;
    }
}
export class ERR_ENCODING_NOT_SUPPORTED extends NodeRangeError {
    constructor(x){
        super("ERR_ENCODING_NOT_SUPPORTED", `The "${x}" encoding is not supported`);
    }
}
export class ERR_EVAL_ESM_CANNOT_PRINT extends NodeError {
    constructor(){
        super("ERR_EVAL_ESM_CANNOT_PRINT", `--print cannot be used with ESM input`);
    }
}
export class ERR_EVENT_RECURSION extends NodeError {
    constructor(x){
        super("ERR_EVENT_RECURSION", `The event "${x}" is already being dispatched`);
    }
}
export class ERR_FEATURE_UNAVAILABLE_ON_PLATFORM extends NodeTypeError {
    constructor(x){
        super("ERR_FEATURE_UNAVAILABLE_ON_PLATFORM", `The feature ${x} is unavailable on the current platform, which is being used to run Node.js`);
    }
}
export class ERR_FS_FILE_TOO_LARGE extends NodeRangeError {
    constructor(x){
        super("ERR_FS_FILE_TOO_LARGE", `File size (${x}) is greater than 2 GB`);
    }
}
export class ERR_FS_INVALID_SYMLINK_TYPE extends NodeError {
    constructor(x){
        super("ERR_FS_INVALID_SYMLINK_TYPE", `Symlink type must be one of "dir", "file", or "junction". Received "${x}"`);
    }
}
export class ERR_HTTP2_ALTSVC_INVALID_ORIGIN extends NodeTypeError {
    constructor(){
        super("ERR_HTTP2_ALTSVC_INVALID_ORIGIN", `HTTP/2 ALTSVC frames require a valid origin`);
    }
}
export class ERR_HTTP2_ALTSVC_LENGTH extends NodeTypeError {
    constructor(){
        super("ERR_HTTP2_ALTSVC_LENGTH", `HTTP/2 ALTSVC frames are limited to 16382 bytes`);
    }
}
export class ERR_HTTP2_CONNECT_AUTHORITY extends NodeError {
    constructor(){
        super("ERR_HTTP2_CONNECT_AUTHORITY", `:authority header is required for CONNECT requests`);
    }
}
export class ERR_HTTP2_CONNECT_PATH extends NodeError {
    constructor(){
        super("ERR_HTTP2_CONNECT_PATH", `The :path header is forbidden for CONNECT requests`);
    }
}
export class ERR_HTTP2_CONNECT_SCHEME extends NodeError {
    constructor(){
        super("ERR_HTTP2_CONNECT_SCHEME", `The :scheme header is forbidden for CONNECT requests`);
    }
}
export class ERR_HTTP2_GOAWAY_SESSION extends NodeError {
    constructor(){
        super("ERR_HTTP2_GOAWAY_SESSION", `New streams cannot be created after receiving a GOAWAY`);
    }
}
export class ERR_HTTP2_HEADERS_AFTER_RESPOND extends NodeError {
    constructor(){
        super("ERR_HTTP2_HEADERS_AFTER_RESPOND", `Cannot specify additional headers after response initiated`);
    }
}
export class ERR_HTTP2_HEADERS_SENT extends NodeError {
    constructor(){
        super("ERR_HTTP2_HEADERS_SENT", `Response has already been initiated.`);
    }
}
export class ERR_HTTP2_HEADER_SINGLE_VALUE extends NodeTypeError {
    constructor(x){
        super("ERR_HTTP2_HEADER_SINGLE_VALUE", `Header field "${x}" must only have a single value`);
    }
}
export class ERR_HTTP2_INFO_STATUS_NOT_ALLOWED extends NodeRangeError {
    constructor(){
        super("ERR_HTTP2_INFO_STATUS_NOT_ALLOWED", `Informational status codes cannot be used`);
    }
}
export class ERR_HTTP2_INVALID_CONNECTION_HEADERS extends NodeTypeError {
    constructor(x){
        super("ERR_HTTP2_INVALID_CONNECTION_HEADERS", `HTTP/1 Connection specific headers are forbidden: "${x}"`);
    }
}
export class ERR_HTTP2_INVALID_HEADER_VALUE extends NodeTypeError {
    constructor(x, y){
        super("ERR_HTTP2_INVALID_HEADER_VALUE", `Invalid value "${x}" for header "${y}"`);
    }
}
export class ERR_HTTP2_INVALID_INFO_STATUS extends NodeRangeError {
    constructor(x){
        super("ERR_HTTP2_INVALID_INFO_STATUS", `Invalid informational status code: ${x}`);
    }
}
export class ERR_HTTP2_INVALID_ORIGIN extends NodeTypeError {
    constructor(){
        super("ERR_HTTP2_INVALID_ORIGIN", `HTTP/2 ORIGIN frames require a valid origin`);
    }
}
export class ERR_HTTP2_INVALID_PACKED_SETTINGS_LENGTH extends NodeRangeError {
    constructor(){
        super("ERR_HTTP2_INVALID_PACKED_SETTINGS_LENGTH", `Packed settings length must be a multiple of six`);
    }
}
export class ERR_HTTP2_INVALID_PSEUDOHEADER extends NodeTypeError {
    constructor(x){
        super("ERR_HTTP2_INVALID_PSEUDOHEADER", `"${x}" is an invalid pseudoheader or is used incorrectly`);
    }
}
export class ERR_HTTP2_INVALID_SESSION extends NodeError {
    constructor(){
        super("ERR_HTTP2_INVALID_SESSION", `The session has been destroyed`);
    }
}
export class ERR_HTTP2_INVALID_STREAM extends NodeError {
    constructor(){
        super("ERR_HTTP2_INVALID_STREAM", `The stream has been destroyed`);
    }
}
export class ERR_HTTP2_MAX_PENDING_SETTINGS_ACK extends NodeError {
    constructor(){
        super("ERR_HTTP2_MAX_PENDING_SETTINGS_ACK", `Maximum number of pending settings acknowledgements`);
    }
}
export class ERR_HTTP2_NESTED_PUSH extends NodeError {
    constructor(){
        super("ERR_HTTP2_NESTED_PUSH", `A push stream cannot initiate another push stream.`);
    }
}
export class ERR_HTTP2_NO_SOCKET_MANIPULATION extends NodeError {
    constructor(){
        super("ERR_HTTP2_NO_SOCKET_MANIPULATION", `HTTP/2 sockets should not be directly manipulated (e.g. read and written)`);
    }
}
export class ERR_HTTP2_ORIGIN_LENGTH extends NodeTypeError {
    constructor(){
        super("ERR_HTTP2_ORIGIN_LENGTH", `HTTP/2 ORIGIN frames are limited to 16382 bytes`);
    }
}
export class ERR_HTTP2_OUT_OF_STREAMS extends NodeError {
    constructor(){
        super("ERR_HTTP2_OUT_OF_STREAMS", `No stream ID is available because maximum stream ID has been reached`);
    }
}
export class ERR_HTTP2_PAYLOAD_FORBIDDEN extends NodeError {
    constructor(x){
        super("ERR_HTTP2_PAYLOAD_FORBIDDEN", `Responses with ${x} status must not have a payload`);
    }
}
export class ERR_HTTP2_PING_CANCEL extends NodeError {
    constructor(){
        super("ERR_HTTP2_PING_CANCEL", `HTTP2 ping cancelled`);
    }
}
export class ERR_HTTP2_PING_LENGTH extends NodeRangeError {
    constructor(){
        super("ERR_HTTP2_PING_LENGTH", `HTTP2 ping payload must be 8 bytes`);
    }
}
export class ERR_HTTP2_PSEUDOHEADER_NOT_ALLOWED extends NodeTypeError {
    constructor(){
        super("ERR_HTTP2_PSEUDOHEADER_NOT_ALLOWED", `Cannot set HTTP/2 pseudo-headers`);
    }
}
export class ERR_HTTP2_PUSH_DISABLED extends NodeError {
    constructor(){
        super("ERR_HTTP2_PUSH_DISABLED", `HTTP/2 client has disabled push streams`);
    }
}
export class ERR_HTTP2_SEND_FILE extends NodeError {
    constructor(){
        super("ERR_HTTP2_SEND_FILE", `Directories cannot be sent`);
    }
}
export class ERR_HTTP2_SEND_FILE_NOSEEK extends NodeError {
    constructor(){
        super("ERR_HTTP2_SEND_FILE_NOSEEK", `Offset or length can only be specified for regular files`);
    }
}
export class ERR_HTTP2_SESSION_ERROR extends NodeError {
    constructor(x){
        super("ERR_HTTP2_SESSION_ERROR", `Session closed with error code ${x}`);
    }
}
export class ERR_HTTP2_SETTINGS_CANCEL extends NodeError {
    constructor(){
        super("ERR_HTTP2_SETTINGS_CANCEL", `HTTP2 session settings canceled`);
    }
}
export class ERR_HTTP2_SOCKET_BOUND extends NodeError {
    constructor(){
        super("ERR_HTTP2_SOCKET_BOUND", `The socket is already bound to an Http2Session`);
    }
}
export class ERR_HTTP2_SOCKET_UNBOUND extends NodeError {
    constructor(){
        super("ERR_HTTP2_SOCKET_UNBOUND", `The socket has been disconnected from the Http2Session`);
    }
}
export class ERR_HTTP2_STATUS_101 extends NodeError {
    constructor(){
        super("ERR_HTTP2_STATUS_101", `HTTP status code 101 (Switching Protocols) is forbidden in HTTP/2`);
    }
}
export class ERR_HTTP2_STATUS_INVALID extends NodeRangeError {
    constructor(x){
        super("ERR_HTTP2_STATUS_INVALID", `Invalid status code: ${x}`);
    }
}
export class ERR_HTTP2_STREAM_ERROR extends NodeError {
    constructor(x){
        super("ERR_HTTP2_STREAM_ERROR", `Stream closed with error code ${x}`);
    }
}
export class ERR_HTTP2_STREAM_SELF_DEPENDENCY extends NodeError {
    constructor(){
        super("ERR_HTTP2_STREAM_SELF_DEPENDENCY", `A stream cannot depend on itself`);
    }
}
export class ERR_HTTP2_TRAILERS_ALREADY_SENT extends NodeError {
    constructor(){
        super("ERR_HTTP2_TRAILERS_ALREADY_SENT", `Trailing headers have already been sent`);
    }
}
export class ERR_HTTP2_TRAILERS_NOT_READY extends NodeError {
    constructor(){
        super("ERR_HTTP2_TRAILERS_NOT_READY", `Trailing headers cannot be sent until after the wantTrailers event is emitted`);
    }
}
export class ERR_HTTP2_UNSUPPORTED_PROTOCOL extends NodeError {
    constructor(x){
        super("ERR_HTTP2_UNSUPPORTED_PROTOCOL", `protocol "${x}" is unsupported.`);
    }
}
export class ERR_HTTP_HEADERS_SENT extends NodeError {
    constructor(x){
        super("ERR_HTTP_HEADERS_SENT", `Cannot ${x} headers after they are sent to the client`);
    }
}
export class ERR_HTTP_INVALID_HEADER_VALUE extends NodeTypeError {
    constructor(x, y){
        super("ERR_HTTP_INVALID_HEADER_VALUE", `Invalid value "${x}" for header "${y}"`);
    }
}
export class ERR_HTTP_INVALID_STATUS_CODE extends NodeRangeError {
    constructor(x){
        super("ERR_HTTP_INVALID_STATUS_CODE", `Invalid status code: ${x}`);
    }
}
export class ERR_HTTP_SOCKET_ENCODING extends NodeError {
    constructor(){
        super("ERR_HTTP_SOCKET_ENCODING", `Changing the socket encoding is not allowed per RFC7230 Section 3.`);
    }
}
export class ERR_HTTP_TRAILER_INVALID extends NodeError {
    constructor(){
        super("ERR_HTTP_TRAILER_INVALID", `Trailers are invalid with this transfer encoding`);
    }
}
export class ERR_INCOMPATIBLE_OPTION_PAIR extends NodeTypeError {
    constructor(x, y){
        super("ERR_INCOMPATIBLE_OPTION_PAIR", `Option "${x}" cannot be used in combination with option "${y}"`);
    }
}
export class ERR_INPUT_TYPE_NOT_ALLOWED extends NodeError {
    constructor(){
        super("ERR_INPUT_TYPE_NOT_ALLOWED", `--input-type can only be used with string input via --eval, --print, or STDIN`);
    }
}
export class ERR_INSPECTOR_ALREADY_ACTIVATED extends NodeError {
    constructor(){
        super("ERR_INSPECTOR_ALREADY_ACTIVATED", `Inspector is already activated. Close it with inspector.close() before activating it again.`);
    }
}
export class ERR_INSPECTOR_ALREADY_CONNECTED extends NodeError {
    constructor(x){
        super("ERR_INSPECTOR_ALREADY_CONNECTED", `${x} is already connected`);
    }
}
export class ERR_INSPECTOR_CLOSED extends NodeError {
    constructor(){
        super("ERR_INSPECTOR_CLOSED", `Session was closed`);
    }
}
export class ERR_INSPECTOR_COMMAND extends NodeError {
    constructor(x, y){
        super("ERR_INSPECTOR_COMMAND", `Inspector error ${x}: ${y}`);
    }
}
export class ERR_INSPECTOR_NOT_ACTIVE extends NodeError {
    constructor(){
        super("ERR_INSPECTOR_NOT_ACTIVE", `Inspector is not active`);
    }
}
export class ERR_INSPECTOR_NOT_AVAILABLE extends NodeError {
    constructor(){
        super("ERR_INSPECTOR_NOT_AVAILABLE", `Inspector is not available`);
    }
}
export class ERR_INSPECTOR_NOT_CONNECTED extends NodeError {
    constructor(){
        super("ERR_INSPECTOR_NOT_CONNECTED", `Session is not connected`);
    }
}
export class ERR_INSPECTOR_NOT_WORKER extends NodeError {
    constructor(){
        super("ERR_INSPECTOR_NOT_WORKER", `Current thread is not a worker`);
    }
}
export class ERR_INVALID_ASYNC_ID extends NodeRangeError {
    constructor(x, y){
        super("ERR_INVALID_ASYNC_ID", `Invalid ${x} value: ${y}`);
    }
}
export class ERR_INVALID_BUFFER_SIZE extends NodeRangeError {
    constructor(x){
        super("ERR_INVALID_BUFFER_SIZE", `Buffer size must be a multiple of ${x}`);
    }
}
export class ERR_INVALID_CALLBACK extends NodeTypeError {
    constructor(object){
        super("ERR_INVALID_CALLBACK", `Callback must be a function. Received ${inspect(object)}`);
    }
}
export class ERR_INVALID_CURSOR_POS extends NodeTypeError {
    constructor(){
        super("ERR_INVALID_CURSOR_POS", `Cannot set cursor row without setting its column`);
    }
}
export class ERR_INVALID_FD extends NodeRangeError {
    constructor(x){
        super("ERR_INVALID_FD", `"fd" must be a positive integer: ${x}`);
    }
}
export class ERR_INVALID_FD_TYPE extends NodeTypeError {
    constructor(x){
        super("ERR_INVALID_FD_TYPE", `Unsupported fd type: ${x}`);
    }
}
export class ERR_INVALID_FILE_URL_HOST extends NodeTypeError {
    constructor(x){
        super("ERR_INVALID_FILE_URL_HOST", `File URL host must be "localhost" or empty on ${x}`);
    }
}
export class ERR_INVALID_FILE_URL_PATH extends NodeTypeError {
    constructor(x){
        super("ERR_INVALID_FILE_URL_PATH", `File URL path ${x}`);
    }
}
export class ERR_INVALID_HANDLE_TYPE extends NodeTypeError {
    constructor(){
        super("ERR_INVALID_HANDLE_TYPE", `This handle type cannot be sent`);
    }
}
export class ERR_INVALID_HTTP_TOKEN extends NodeTypeError {
    constructor(x, y){
        super("ERR_INVALID_HTTP_TOKEN", `${x} must be a valid HTTP token ["${y}"]`);
    }
}
export class ERR_INVALID_IP_ADDRESS extends NodeTypeError {
    constructor(x){
        super("ERR_INVALID_IP_ADDRESS", `Invalid IP address: ${x}`);
    }
}
export class ERR_INVALID_OPT_VALUE_ENCODING extends NodeTypeError {
    constructor(x){
        super("ERR_INVALID_OPT_VALUE_ENCODING", `The value "${x}" is invalid for option "encoding"`);
    }
}
export class ERR_INVALID_PERFORMANCE_MARK extends NodeError {
    constructor(x){
        super("ERR_INVALID_PERFORMANCE_MARK", `The "${x}" performance mark has not been set`);
    }
}
export class ERR_INVALID_PROTOCOL extends NodeTypeError {
    constructor(x, y){
        super("ERR_INVALID_PROTOCOL", `Protocol "${x}" not supported. Expected "${y}"`);
    }
}
export class ERR_INVALID_REPL_EVAL_CONFIG extends NodeTypeError {
    constructor(){
        super("ERR_INVALID_REPL_EVAL_CONFIG", `Cannot specify both "breakEvalOnSigint" and "eval" for REPL`);
    }
}
export class ERR_INVALID_REPL_INPUT extends NodeTypeError {
    constructor(x){
        super("ERR_INVALID_REPL_INPUT", `${x}`);
    }
}
export class ERR_INVALID_SYNC_FORK_INPUT extends NodeTypeError {
    constructor(x){
        super("ERR_INVALID_SYNC_FORK_INPUT", `Asynchronous forks do not support Buffer, TypedArray, DataView or string input: ${x}`);
    }
}
export class ERR_INVALID_THIS extends NodeTypeError {
    constructor(x){
        super("ERR_INVALID_THIS", `Value of "this" must be of type ${x}`);
    }
}
export class ERR_INVALID_TUPLE extends NodeTypeError {
    constructor(x, y){
        super("ERR_INVALID_TUPLE", `${x} must be an iterable ${y} tuple`);
    }
}
export class ERR_INVALID_URI extends NodeURIError {
    constructor(){
        super("ERR_INVALID_URI", `URI malformed`);
    }
}
export class ERR_IPC_CHANNEL_CLOSED extends NodeError {
    constructor(){
        super("ERR_IPC_CHANNEL_CLOSED", `Channel closed`);
    }
}
export class ERR_IPC_DISCONNECTED extends NodeError {
    constructor(){
        super("ERR_IPC_DISCONNECTED", `IPC channel is already disconnected`);
    }
}
export class ERR_IPC_ONE_PIPE extends NodeError {
    constructor(){
        super("ERR_IPC_ONE_PIPE", `Child process can have only one IPC pipe`);
    }
}
export class ERR_IPC_SYNC_FORK extends NodeError {
    constructor(){
        super("ERR_IPC_SYNC_FORK", `IPC cannot be used with synchronous forks`);
    }
}
export class ERR_MANIFEST_DEPENDENCY_MISSING extends NodeError {
    constructor(x, y){
        super("ERR_MANIFEST_DEPENDENCY_MISSING", `Manifest resource ${x} does not list ${y} as a dependency specifier`);
    }
}
export class ERR_MANIFEST_INTEGRITY_MISMATCH extends NodeSyntaxError {
    constructor(x){
        super("ERR_MANIFEST_INTEGRITY_MISMATCH", `Manifest resource ${x} has multiple entries but integrity lists do not match`);
    }
}
export class ERR_MANIFEST_INVALID_RESOURCE_FIELD extends NodeTypeError {
    constructor(x, y){
        super("ERR_MANIFEST_INVALID_RESOURCE_FIELD", `Manifest resource ${x} has invalid property value for ${y}`);
    }
}
export class ERR_MANIFEST_TDZ extends NodeError {
    constructor(){
        super("ERR_MANIFEST_TDZ", `Manifest initialization has not yet run`);
    }
}
export class ERR_MANIFEST_UNKNOWN_ONERROR extends NodeSyntaxError {
    constructor(x){
        super("ERR_MANIFEST_UNKNOWN_ONERROR", `Manifest specified unknown error behavior "${x}".`);
    }
}
export class ERR_METHOD_NOT_IMPLEMENTED extends NodeError {
    constructor(x){
        super("ERR_METHOD_NOT_IMPLEMENTED", `The ${x} method is not implemented`);
    }
}
export class ERR_MISSING_ARGS extends NodeTypeError {
    constructor(...args){
        let msg = "The ";
        const len = args.length;
        const wrap = (a)=>`"${a}"`;
        args = args.map((a)=>Array.isArray(a) ? a.map(wrap).join(" or ") : wrap(a));
        switch(len){
            case 1:
                msg += `${args[0]} argument`;
                break;
            case 2:
                msg += `${args[0]} and ${args[1]} arguments`;
                break;
            default:
                msg += args.slice(0, len - 1).join(", ");
                msg += `, and ${args[len - 1]} arguments`;
                break;
        }
        super("ERR_MISSING_ARGS", `${msg} must be specified`);
    }
}
export class ERR_MISSING_OPTION extends NodeTypeError {
    constructor(x){
        super("ERR_MISSING_OPTION", `${x} is required`);
    }
}
export class ERR_MULTIPLE_CALLBACK extends NodeError {
    constructor(){
        super("ERR_MULTIPLE_CALLBACK", `Callback called multiple times`);
    }
}
export class ERR_NAPI_CONS_FUNCTION extends NodeTypeError {
    constructor(){
        super("ERR_NAPI_CONS_FUNCTION", `Constructor must be a function`);
    }
}
export class ERR_NAPI_INVALID_DATAVIEW_ARGS extends NodeRangeError {
    constructor(){
        super("ERR_NAPI_INVALID_DATAVIEW_ARGS", `byte_offset + byte_length should be less than or equal to the size in bytes of the array passed in`);
    }
}
export class ERR_NAPI_INVALID_TYPEDARRAY_ALIGNMENT extends NodeRangeError {
    constructor(x, y){
        super("ERR_NAPI_INVALID_TYPEDARRAY_ALIGNMENT", `start offset of ${x} should be a multiple of ${y}`);
    }
}
export class ERR_NAPI_INVALID_TYPEDARRAY_LENGTH extends NodeRangeError {
    constructor(){
        super("ERR_NAPI_INVALID_TYPEDARRAY_LENGTH", `Invalid typed array length`);
    }
}
export class ERR_NO_CRYPTO extends NodeError {
    constructor(){
        super("ERR_NO_CRYPTO", `Node.js is not compiled with OpenSSL crypto support`);
    }
}
export class ERR_NO_ICU extends NodeTypeError {
    constructor(x){
        super("ERR_NO_ICU", `${x} is not supported on Node.js compiled without ICU`);
    }
}
export class ERR_QUICCLIENTSESSION_FAILED extends NodeError {
    constructor(x){
        super("ERR_QUICCLIENTSESSION_FAILED", `Failed to create a new QuicClientSession: ${x}`);
    }
}
export class ERR_QUICCLIENTSESSION_FAILED_SETSOCKET extends NodeError {
    constructor(){
        super("ERR_QUICCLIENTSESSION_FAILED_SETSOCKET", `Failed to set the QuicSocket`);
    }
}
export class ERR_QUICSESSION_DESTROYED extends NodeError {
    constructor(x){
        super("ERR_QUICSESSION_DESTROYED", `Cannot call ${x} after a QuicSession has been destroyed`);
    }
}
export class ERR_QUICSESSION_INVALID_DCID extends NodeError {
    constructor(x){
        super("ERR_QUICSESSION_INVALID_DCID", `Invalid DCID value: ${x}`);
    }
}
export class ERR_QUICSESSION_UPDATEKEY extends NodeError {
    constructor(){
        super("ERR_QUICSESSION_UPDATEKEY", `Unable to update QuicSession keys`);
    }
}
export class ERR_QUICSOCKET_DESTROYED extends NodeError {
    constructor(x){
        super("ERR_QUICSOCKET_DESTROYED", `Cannot call ${x} after a QuicSocket has been destroyed`);
    }
}
export class ERR_QUICSOCKET_INVALID_STATELESS_RESET_SECRET_LENGTH extends NodeError {
    constructor(){
        super("ERR_QUICSOCKET_INVALID_STATELESS_RESET_SECRET_LENGTH", `The stateResetToken must be exactly 16-bytes in length`);
    }
}
export class ERR_QUICSOCKET_LISTENING extends NodeError {
    constructor(){
        super("ERR_QUICSOCKET_LISTENING", `This QuicSocket is already listening`);
    }
}
export class ERR_QUICSOCKET_UNBOUND extends NodeError {
    constructor(x){
        super("ERR_QUICSOCKET_UNBOUND", `Cannot call ${x} before a QuicSocket has been bound`);
    }
}
export class ERR_QUICSTREAM_DESTROYED extends NodeError {
    constructor(x){
        super("ERR_QUICSTREAM_DESTROYED", `Cannot call ${x} after a QuicStream has been destroyed`);
    }
}
export class ERR_QUICSTREAM_INVALID_PUSH extends NodeError {
    constructor(){
        super("ERR_QUICSTREAM_INVALID_PUSH", `Push streams are only supported on client-initiated, bidirectional streams`);
    }
}
export class ERR_QUICSTREAM_OPEN_FAILED extends NodeError {
    constructor(){
        super("ERR_QUICSTREAM_OPEN_FAILED", `Opening a new QuicStream failed`);
    }
}
export class ERR_QUICSTREAM_UNSUPPORTED_PUSH extends NodeError {
    constructor(){
        super("ERR_QUICSTREAM_UNSUPPORTED_PUSH", `Push streams are not supported on this QuicSession`);
    }
}
export class ERR_QUIC_TLS13_REQUIRED extends NodeError {
    constructor(){
        super("ERR_QUIC_TLS13_REQUIRED", `QUIC requires TLS version 1.3`);
    }
}
export class ERR_SCRIPT_EXECUTION_INTERRUPTED extends NodeError {
    constructor(){
        super("ERR_SCRIPT_EXECUTION_INTERRUPTED", "Script execution was interrupted by `SIGINT`");
    }
}
export class ERR_SERVER_ALREADY_LISTEN extends NodeError {
    constructor(){
        super("ERR_SERVER_ALREADY_LISTEN", `Listen method has been called more than once without closing.`);
    }
}
export class ERR_SERVER_NOT_RUNNING extends NodeError {
    constructor(){
        super("ERR_SERVER_NOT_RUNNING", `Server is not running.`);
    }
}
export class ERR_SOCKET_ALREADY_BOUND extends NodeError {
    constructor(){
        super("ERR_SOCKET_ALREADY_BOUND", `Socket is already bound`);
    }
}
export class ERR_SOCKET_BAD_BUFFER_SIZE extends NodeTypeError {
    constructor(){
        super("ERR_SOCKET_BAD_BUFFER_SIZE", `Buffer size must be a positive integer`);
    }
}
export class ERR_SOCKET_BAD_PORT extends NodeRangeError {
    constructor(name, port, allowZero = true){
        assert(typeof allowZero === "boolean", "The 'allowZero' argument must be of type boolean.");
        const operator = allowZero ? ">=" : ">";
        super("ERR_SOCKET_BAD_PORT", `${name} should be ${operator} 0 and < 65536. Received ${port}.`);
    }
}
export class ERR_SOCKET_BAD_TYPE extends NodeTypeError {
    constructor(){
        super("ERR_SOCKET_BAD_TYPE", `Bad socket type specified. Valid types are: udp4, udp6`);
    }
}
export class ERR_SOCKET_BUFFER_SIZE extends NodeSystemError {
    constructor(ctx){
        super("ERR_SOCKET_BUFFER_SIZE", ctx, "Could not get or set buffer size");
    }
}
export class ERR_SOCKET_CLOSED extends NodeError {
    constructor(){
        super("ERR_SOCKET_CLOSED", `Socket is closed`);
    }
}
export class ERR_SOCKET_DGRAM_IS_CONNECTED extends NodeError {
    constructor(){
        super("ERR_SOCKET_DGRAM_IS_CONNECTED", `Already connected`);
    }
}
export class ERR_SOCKET_DGRAM_NOT_CONNECTED extends NodeError {
    constructor(){
        super("ERR_SOCKET_DGRAM_NOT_CONNECTED", `Not connected`);
    }
}
export class ERR_SOCKET_DGRAM_NOT_RUNNING extends NodeError {
    constructor(){
        super("ERR_SOCKET_DGRAM_NOT_RUNNING", `Not running`);
    }
}
export class ERR_SRI_PARSE extends NodeSyntaxError {
    constructor(name, char, position){
        super("ERR_SRI_PARSE", `Subresource Integrity string ${name} had an unexpected ${char} at position ${position}`);
    }
}
export class ERR_STREAM_ALREADY_FINISHED extends NodeError {
    constructor(x){
        super("ERR_STREAM_ALREADY_FINISHED", `Cannot call ${x} after a stream was finished`);
    }
}
export class ERR_STREAM_CANNOT_PIPE extends NodeError {
    constructor(){
        super("ERR_STREAM_CANNOT_PIPE", `Cannot pipe, not readable`);
    }
}
export class ERR_STREAM_DESTROYED extends NodeError {
    constructor(x){
        super("ERR_STREAM_DESTROYED", `Cannot call ${x} after a stream was destroyed`);
    }
}
export class ERR_STREAM_NULL_VALUES extends NodeTypeError {
    constructor(){
        super("ERR_STREAM_NULL_VALUES", `May not write null values to stream`);
    }
}
export class ERR_STREAM_PREMATURE_CLOSE extends NodeError {
    constructor(){
        super("ERR_STREAM_PREMATURE_CLOSE", `Premature close`);
    }
}
export class ERR_STREAM_PUSH_AFTER_EOF extends NodeError {
    constructor(){
        super("ERR_STREAM_PUSH_AFTER_EOF", `stream.push() after EOF`);
    }
}
export class ERR_STREAM_UNSHIFT_AFTER_END_EVENT extends NodeError {
    constructor(){
        super("ERR_STREAM_UNSHIFT_AFTER_END_EVENT", `stream.unshift() after end event`);
    }
}
export class ERR_STREAM_WRAP extends NodeError {
    constructor(){
        super("ERR_STREAM_WRAP", `Stream has StringDecoder set or is in objectMode`);
    }
}
export class ERR_STREAM_WRITE_AFTER_END extends NodeError {
    constructor(){
        super("ERR_STREAM_WRITE_AFTER_END", `write after end`);
    }
}
export class ERR_SYNTHETIC extends NodeError {
    constructor(){
        super("ERR_SYNTHETIC", `JavaScript Callstack`);
    }
}
export class ERR_TLS_CERT_ALTNAME_INVALID extends NodeError {
    reason;
    host;
    cert;
    constructor(reason, host, cert){
        super("ERR_TLS_CERT_ALTNAME_INVALID", `Hostname/IP does not match certificate's altnames: ${reason}`);
        this.reason = reason;
        this.host = host;
        this.cert = cert;
    }
}
export class ERR_TLS_DH_PARAM_SIZE extends NodeError {
    constructor(x){
        super("ERR_TLS_DH_PARAM_SIZE", `DH parameter size ${x} is less than 2048`);
    }
}
export class ERR_TLS_HANDSHAKE_TIMEOUT extends NodeError {
    constructor(){
        super("ERR_TLS_HANDSHAKE_TIMEOUT", `TLS handshake timeout`);
    }
}
export class ERR_TLS_INVALID_CONTEXT extends NodeTypeError {
    constructor(x){
        super("ERR_TLS_INVALID_CONTEXT", `${x} must be a SecureContext`);
    }
}
export class ERR_TLS_INVALID_STATE extends NodeError {
    constructor(){
        super("ERR_TLS_INVALID_STATE", `TLS socket connection must be securely established`);
    }
}
export class ERR_TLS_INVALID_PROTOCOL_VERSION extends NodeTypeError {
    constructor(protocol, x){
        super("ERR_TLS_INVALID_PROTOCOL_VERSION", `${protocol} is not a valid ${x} TLS protocol version`);
    }
}
export class ERR_TLS_PROTOCOL_VERSION_CONFLICT extends NodeTypeError {
    constructor(prevProtocol, protocol){
        super("ERR_TLS_PROTOCOL_VERSION_CONFLICT", `TLS protocol version ${prevProtocol} conflicts with secureProtocol ${protocol}`);
    }
}
export class ERR_TLS_RENEGOTIATION_DISABLED extends NodeError {
    constructor(){
        super("ERR_TLS_RENEGOTIATION_DISABLED", `TLS session renegotiation disabled for this socket`);
    }
}
export class ERR_TLS_REQUIRED_SERVER_NAME extends NodeError {
    constructor(){
        super("ERR_TLS_REQUIRED_SERVER_NAME", `"servername" is required parameter for Server.addContext`);
    }
}
export class ERR_TLS_SESSION_ATTACK extends NodeError {
    constructor(){
        super("ERR_TLS_SESSION_ATTACK", `TLS session renegotiation attack detected`);
    }
}
export class ERR_TLS_SNI_FROM_SERVER extends NodeError {
    constructor(){
        super("ERR_TLS_SNI_FROM_SERVER", `Cannot issue SNI from a TLS server-side socket`);
    }
}
export class ERR_TRACE_EVENTS_CATEGORY_REQUIRED extends NodeTypeError {
    constructor(){
        super("ERR_TRACE_EVENTS_CATEGORY_REQUIRED", `At least one category is required`);
    }
}
export class ERR_TRACE_EVENTS_UNAVAILABLE extends NodeError {
    constructor(){
        super("ERR_TRACE_EVENTS_UNAVAILABLE", `Trace events are unavailable`);
    }
}
export class ERR_UNAVAILABLE_DURING_EXIT extends NodeError {
    constructor(){
        super("ERR_UNAVAILABLE_DURING_EXIT", `Cannot call function in process exit handler`);
    }
}
export class ERR_UNCAUGHT_EXCEPTION_CAPTURE_ALREADY_SET extends NodeError {
    constructor(){
        super("ERR_UNCAUGHT_EXCEPTION_CAPTURE_ALREADY_SET", "`process.setupUncaughtExceptionCapture()` was called while a capture callback was already active");
    }
}
export class ERR_UNESCAPED_CHARACTERS extends NodeTypeError {
    constructor(x){
        super("ERR_UNESCAPED_CHARACTERS", `${x} contains unescaped characters`);
    }
}
export class ERR_UNHANDLED_ERROR extends NodeError {
    constructor(x){
        super("ERR_UNHANDLED_ERROR", `Unhandled error. (${x})`);
    }
}
export class ERR_UNKNOWN_BUILTIN_MODULE extends NodeError {
    constructor(x){
        super("ERR_UNKNOWN_BUILTIN_MODULE", `No such built-in module: ${x}`);
    }
}
export class ERR_UNKNOWN_CREDENTIAL extends NodeError {
    constructor(x, y){
        super("ERR_UNKNOWN_CREDENTIAL", `${x} identifier does not exist: ${y}`);
    }
}
export class ERR_UNKNOWN_ENCODING extends NodeTypeError {
    constructor(x){
        super("ERR_UNKNOWN_ENCODING", `Unknown encoding: ${x}`);
    }
}
export class ERR_UNKNOWN_FILE_EXTENSION extends NodeTypeError {
    constructor(x, y){
        super("ERR_UNKNOWN_FILE_EXTENSION", `Unknown file extension "${x}" for ${y}`);
    }
}
export class ERR_UNKNOWN_MODULE_FORMAT extends NodeRangeError {
    constructor(x){
        super("ERR_UNKNOWN_MODULE_FORMAT", `Unknown module format: ${x}`);
    }
}
export class ERR_UNKNOWN_SIGNAL extends NodeTypeError {
    constructor(x){
        super("ERR_UNKNOWN_SIGNAL", `Unknown signal: ${x}`);
    }
}
export class ERR_UNSUPPORTED_DIR_IMPORT extends NodeError {
    constructor(x, y){
        super("ERR_UNSUPPORTED_DIR_IMPORT", `Directory import '${x}' is not supported resolving ES modules, imported from ${y}`);
    }
}
export class ERR_UNSUPPORTED_ESM_URL_SCHEME extends NodeError {
    constructor(){
        super("ERR_UNSUPPORTED_ESM_URL_SCHEME", `Only file and data URLs are supported by the default ESM loader`);
    }
}
export class ERR_V8BREAKITERATOR extends NodeError {
    constructor(){
        super("ERR_V8BREAKITERATOR", `Full ICU data not installed. See https://github.com/nodejs/node/wiki/Intl`);
    }
}
export class ERR_VALID_PERFORMANCE_ENTRY_TYPE extends NodeError {
    constructor(){
        super("ERR_VALID_PERFORMANCE_ENTRY_TYPE", `At least one valid performance entry type is required`);
    }
}
export class ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING extends NodeTypeError {
    constructor(){
        super("ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING", `A dynamic import callback was not specified.`);
    }
}
export class ERR_VM_MODULE_ALREADY_LINKED extends NodeError {
    constructor(){
        super("ERR_VM_MODULE_ALREADY_LINKED", `Module has already been linked`);
    }
}
export class ERR_VM_MODULE_CANNOT_CREATE_CACHED_DATA extends NodeError {
    constructor(){
        super("ERR_VM_MODULE_CANNOT_CREATE_CACHED_DATA", `Cached data cannot be created for a module which has been evaluated`);
    }
}
export class ERR_VM_MODULE_DIFFERENT_CONTEXT extends NodeError {
    constructor(){
        super("ERR_VM_MODULE_DIFFERENT_CONTEXT", `Linked modules must use the same context`);
    }
}
export class ERR_VM_MODULE_LINKING_ERRORED extends NodeError {
    constructor(){
        super("ERR_VM_MODULE_LINKING_ERRORED", `Linking has already failed for the provided module`);
    }
}
export class ERR_VM_MODULE_NOT_MODULE extends NodeError {
    constructor(){
        super("ERR_VM_MODULE_NOT_MODULE", `Provided module is not an instance of Module`);
    }
}
export class ERR_VM_MODULE_STATUS extends NodeError {
    constructor(x){
        super("ERR_VM_MODULE_STATUS", `Module status ${x}`);
    }
}
export class ERR_WASI_ALREADY_STARTED extends NodeError {
    constructor(){
        super("ERR_WASI_ALREADY_STARTED", `WASI instance has already started`);
    }
}
export class ERR_WORKER_INIT_FAILED extends NodeError {
    constructor(x){
        super("ERR_WORKER_INIT_FAILED", `Worker initialization failure: ${x}`);
    }
}
export class ERR_WORKER_NOT_RUNNING extends NodeError {
    constructor(){
        super("ERR_WORKER_NOT_RUNNING", `Worker instance not running`);
    }
}
export class ERR_WORKER_OUT_OF_MEMORY extends NodeError {
    constructor(x){
        super("ERR_WORKER_OUT_OF_MEMORY", `Worker terminated due to reaching memory limit: ${x}`);
    }
}
export class ERR_WORKER_UNSERIALIZABLE_ERROR extends NodeError {
    constructor(){
        super("ERR_WORKER_UNSERIALIZABLE_ERROR", `Serializing an uncaught exception failed`);
    }
}
export class ERR_WORKER_UNSUPPORTED_EXTENSION extends NodeTypeError {
    constructor(x){
        super("ERR_WORKER_UNSUPPORTED_EXTENSION", `The worker script extension must be ".js", ".mjs", or ".cjs". Received "${x}"`);
    }
}
export class ERR_WORKER_UNSUPPORTED_OPERATION extends NodeTypeError {
    constructor(x){
        super("ERR_WORKER_UNSUPPORTED_OPERATION", `${x} is not supported in workers`);
    }
}
export class ERR_ZLIB_INITIALIZATION_FAILED extends NodeError {
    constructor(){
        super("ERR_ZLIB_INITIALIZATION_FAILED", `Initialization failed`);
    }
}
export class ERR_FALSY_VALUE_REJECTION extends NodeError {
    reason;
    constructor(reason){
        super("ERR_FALSY_VALUE_REJECTION", "Promise was rejected with falsy value");
        this.reason = reason;
    }
}
export class ERR_HTTP2_INVALID_SETTING_VALUE extends NodeRangeError {
    actual;
    min;
    max;
    constructor(name, actual, min, max){
        super("ERR_HTTP2_INVALID_SETTING_VALUE", `Invalid value for setting "${name}": ${actual}`);
        this.actual = actual;
        if (min !== undefined) {
            this.min = min;
            this.max = max;
        }
    }
}
export class ERR_HTTP2_STREAM_CANCEL extends NodeError {
    cause;
    constructor(error){
        super("ERR_HTTP2_STREAM_CANCEL", typeof error.message === "string" ? `The pending stream has been canceled (caused by: ${error.message})` : "The pending stream has been canceled");
        if (error) {
            this.cause = error;
        }
    }
}
export class ERR_INVALID_ADDRESS_FAMILY extends NodeRangeError {
    host;
    port;
    constructor(addressType, host, port){
        super("ERR_INVALID_ADDRESS_FAMILY", `Invalid address family: ${addressType} ${host}:${port}`);
        this.host = host;
        this.port = port;
    }
}
export class ERR_INVALID_CHAR extends NodeTypeError {
    constructor(name, field){
        super("ERR_INVALID_CHAR", field ? `Invalid character in ${name}` : `Invalid character in ${name} ["${field}"]`);
    }
}
export class ERR_INVALID_OPT_VALUE extends NodeTypeError {
    constructor(name, value){
        super("ERR_INVALID_OPT_VALUE", `The value "${value}" is invalid for option "${name}"`);
    }
}
export class ERR_INVALID_RETURN_PROPERTY extends NodeTypeError {
    constructor(input, name, prop, value){
        super("ERR_INVALID_RETURN_PROPERTY", `Expected a valid ${input} to be returned for the "${prop}" from the "${name}" function but got ${value}.`);
    }
}
// deno-lint-ignore no-explicit-any
function buildReturnPropertyType(value) {
    if (value && value.constructor && value.constructor.name) {
        return `instance of ${value.constructor.name}`;
    } else {
        return `type ${typeof value}`;
    }
}
export class ERR_INVALID_RETURN_PROPERTY_VALUE extends NodeTypeError {
    constructor(input, name, prop, value){
        super("ERR_INVALID_RETURN_PROPERTY_VALUE", `Expected ${input} to be returned for the "${prop}" from the "${name}" function but got ${buildReturnPropertyType(value)}.`);
    }
}
export class ERR_INVALID_RETURN_VALUE extends NodeTypeError {
    constructor(input, name, value){
        super("ERR_INVALID_RETURN_VALUE", `Expected ${input} to be returned from the "${name}" function but got ${buildReturnPropertyType(value)}.`);
    }
}
export class ERR_INVALID_URL extends NodeTypeError {
    input;
    constructor(input){
        super("ERR_INVALID_URL", `Invalid URL: ${input}`);
        this.input = input;
    }
}
export class ERR_INVALID_URL_SCHEME extends NodeTypeError {
    constructor(expected){
        expected = Array.isArray(expected) ? expected : [
            expected
        ];
        const res = expected.length === 2 ? `one of scheme ${expected[0]} or ${expected[1]}` : `of scheme ${expected[0]}`;
        super("ERR_INVALID_URL_SCHEME", `The URL must be ${res}`);
    }
}
export class ERR_MODULE_NOT_FOUND extends NodeError {
    constructor(path, base, type = "package"){
        super("ERR_MODULE_NOT_FOUND", `Cannot find ${type} '${path}' imported from ${base}`);
    }
}
export class ERR_INVALID_PACKAGE_CONFIG extends NodeError {
    constructor(path, base, message){
        const msg = `Invalid package config ${path}${base ? ` while importing ${base}` : ""}${message ? `. ${message}` : ""}`;
        super("ERR_INVALID_PACKAGE_CONFIG", msg);
    }
}
export class ERR_INVALID_MODULE_SPECIFIER extends NodeTypeError {
    constructor(request, reason, base){
        super("ERR_INVALID_MODULE_SPECIFIER", `Invalid module "${request}" ${reason}${base ? ` imported from ${base}` : ""}`);
    }
}
export class ERR_INVALID_PACKAGE_TARGET extends NodeError {
    constructor(pkgPath, key, // deno-lint-ignore no-explicit-any
    target, isImport, base){
        let msg;
        const relError = typeof target === "string" && !isImport && target.length && !target.startsWith("./");
        if (key === ".") {
            assert(isImport === false);
            msg = `Invalid "exports" main target ${JSON.stringify(target)} defined ` + `in the package config ${pkgPath}package.json${base ? ` imported from ${base}` : ""}${relError ? '; targets must start with "./"' : ""}`;
        } else {
            msg = `Invalid "${isImport ? "imports" : "exports"}" target ${JSON.stringify(target)} defined for '${key}' in the package config ${pkgPath}package.json${base ? ` imported from ${base}` : ""}${relError ? '; targets must start with "./"' : ""}`;
        }
        super("ERR_INVALID_PACKAGE_TARGET", msg);
    }
}
export class ERR_PACKAGE_IMPORT_NOT_DEFINED extends NodeTypeError {
    constructor(specifier, packagePath, base){
        const msg = `Package import specifier "${specifier}" is not defined${packagePath ? ` in package ${packagePath}package.json` : ""} imported from ${base}`;
        super("ERR_PACKAGE_IMPORT_NOT_DEFINED", msg);
    }
}
export class ERR_PACKAGE_PATH_NOT_EXPORTED extends NodeError {
    constructor(subpath, pkgPath, basePath){
        let msg;
        if (subpath === ".") {
            msg = `No "exports" main defined in ${pkgPath}package.json${basePath ? ` imported from ${basePath}` : ""}`;
        } else {
            msg = `Package subpath '${subpath}' is not defined by "exports" in ${pkgPath}package.json${basePath ? ` imported from ${basePath}` : ""}`;
        }
        super("ERR_PACKAGE_PATH_NOT_EXPORTED", msg);
    }
}
export class ERR_INTERNAL_ASSERTION extends NodeError {
    constructor(message){
        const suffix = "This is caused by either a bug in Node.js " + "or incorrect usage of Node.js internals.\n" + "Please open an issue with this stack trace at " + "https://github.com/nodejs/node/issues\n";
        super("ERR_INTERNAL_ASSERTION", message === undefined ? suffix : `${message}\n${suffix}`);
    }
}
// Using `fs.rmdir` on a path that is a file results in an ENOENT error on Windows and an ENOTDIR error on POSIX.
export class ERR_FS_RMDIR_ENOTDIR extends NodeSystemError {
    constructor(path){
        const code = isWindows ? "ENOENT" : "ENOTDIR";
        const ctx = {
            message: "not a directory",
            path,
            syscall: "rmdir",
            code,
            errno: isWindows ? ENOENT : ENOTDIR
        };
        super(code, ctx, "Path is not a directory");
    }
}
export function denoErrorToNodeError(e, ctx) {
    const errno = extractOsErrorNumberFromErrorMessage(e);
    if (typeof errno === "undefined") {
        return e;
    }
    const ex = uvException({
        errno: mapSysErrnoToUvErrno(errno),
        ...ctx
    });
    return ex;
}
function extractOsErrorNumberFromErrorMessage(e) {
    const match = e instanceof Error ? e.message.match(/\(os error (\d+)\)/) : false;
    if (match) {
        return +match[1];
    }
    return undefined;
}
export function connResetException(msg) {
    const ex = new Error(msg);
    // deno-lint-ignore no-explicit-any
    (ex).code = "ECONNRESET";
    return ex;
}
export function aggregateTwoErrors(innerError, outerError) {
    if (innerError && outerError && innerError !== outerError) {
        if (Array.isArray(outerError.errors)) {
            // If `outerError` is already an `AggregateError`.
            outerError.errors.push(innerError);
            return outerError;
        }
        // eslint-disable-next-line no-restricted-syntax
        const err = new AggregateError([
            outerError,
            innerError, 
        ], outerError.message);
        // deno-lint-ignore no-explicit-any
        (err).code = outerError.code;
        return err;
    }
    return innerError || outerError;
}
codes.ERR_IPC_CHANNEL_CLOSED = ERR_IPC_CHANNEL_CLOSED;
codes.ERR_INVALID_ARG_TYPE = ERR_INVALID_ARG_TYPE;
codes.ERR_INVALID_ARG_VALUE = ERR_INVALID_ARG_VALUE;
codes.ERR_INVALID_CALLBACK = ERR_INVALID_CALLBACK;
codes.ERR_OUT_OF_RANGE = ERR_OUT_OF_RANGE;
codes.ERR_SOCKET_BAD_PORT = ERR_SOCKET_BAD_PORT;
codes.ERR_BUFFER_OUT_OF_BOUNDS = ERR_BUFFER_OUT_OF_BOUNDS;
codes.ERR_UNKNOWN_ENCODING = ERR_UNKNOWN_ENCODING;
// TODO(kt3k): assign all error classes here.
/**
 * This creates a generic Node.js error.
 *
 * @param {string} message The error message.
 * @param {object} errorProperties Object with additional properties to be added to the error.
 * @returns {Error}
 */ const genericNodeError = hideStackFrames(function genericNodeError(message, errorProperties) {
    // eslint-disable-next-line no-restricted-syntax
    const err = new Error(message);
    Object.assign(err, errorProperties);
    return err;
});
export { codes, genericNodeError, hideStackFrames };
export default {
    AbortError,
    aggregateTwoErrors,
    codes,
    dnsException
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvaW50ZXJuYWwvZXJyb3JzLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjIgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vLyBDb3B5cmlnaHQgTm9kZS5qcyBjb250cmlidXRvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBMaWNlbnNlLlxuLyoqIE5PVCBJTVBMRU1FTlRFRFxuICogRVJSX01BTklGRVNUX0FTU0VSVF9JTlRFR1JJVFlcbiAqIEVSUl9RVUlDU0VTU0lPTl9WRVJTSU9OX05FR09USUFUSU9OXG4gKiBFUlJfUkVRVUlSRV9FU01cbiAqIEVSUl9UTFNfQ0VSVF9BTFROQU1FX0lOVkFMSURcbiAqIEVSUl9XT1JLRVJfSU5WQUxJRF9FWEVDX0FSR1ZcbiAqIEVSUl9XT1JLRVJfUEFUSFxuICogRVJSX1FVSUNfRVJST1JcbiAqIEVSUl9TWVNURU1fRVJST1IgLy9TeXN0ZW0gZXJyb3IsIHNob3VsZG4ndCBldmVyIGhhcHBlbiBpbnNpZGUgRGVub1xuICogRVJSX1RUWV9JTklUX0ZBSUxFRCAvL1N5c3RlbSBlcnJvciwgc2hvdWxkbid0IGV2ZXIgaGFwcGVuIGluc2lkZSBEZW5vXG4gKiBFUlJfSU5WQUxJRF9QQUNLQUdFX0NPTkZJRyAvLyBwYWNrYWdlLmpzb24gc3R1ZmYsIHByb2JhYmx5IHVzZWxlc3NcbiAqL1xuXG5pbXBvcnQgeyBnZXRTeXN0ZW1FcnJvck5hbWUgfSBmcm9tIFwiLi4vdXRpbC50c1wiO1xuaW1wb3J0IHsgaW5zcGVjdCB9IGZyb20gXCIuLi9pbnRlcm5hbC91dGlsL2luc3BlY3QubWpzXCI7XG5pbXBvcnQgeyBjb2RlcyB9IGZyb20gXCIuL2Vycm9yX2NvZGVzLnRzXCI7XG5pbXBvcnQge1xuICBjb2RlTWFwLFxuICBlcnJvck1hcCxcbiAgbWFwU3lzRXJybm9Ub1V2RXJybm8sXG59IGZyb20gXCIuLi9pbnRlcm5hbF9iaW5kaW5nL3V2LnRzXCI7XG5pbXBvcnQgeyBhc3NlcnQgfSBmcm9tIFwiLi4vLi4vX3V0aWwvYXNzZXJ0LnRzXCI7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tIFwiLi4vLi4vX3V0aWwvb3MudHNcIjtcbmltcG9ydCB7IG9zIGFzIG9zQ29uc3RhbnRzIH0gZnJvbSBcIi4uL2ludGVybmFsX2JpbmRpbmcvY29uc3RhbnRzLnRzXCI7XG5jb25zdCB7XG4gIGVycm5vOiB7IEVOT1RESVIsIEVOT0VOVCB9LFxufSA9IG9zQ29uc3RhbnRzO1xuaW1wb3J0IHsgaGlkZVN0YWNrRnJhbWVzIH0gZnJvbSBcIi4vaGlkZV9zdGFja19mcmFtZXMudHNcIjtcblxuZXhwb3J0IHsgZXJyb3JNYXAgfTtcblxuY29uc3Qga0lzTm9kZUVycm9yID0gU3ltYm9sKFwia0lzTm9kZUVycm9yXCIpO1xuXG4vKipcbiAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2Jsb2IvZjNlYjIyNC9saWIvaW50ZXJuYWwvZXJyb3JzLmpzXG4gKi9cbmNvbnN0IGNsYXNzUmVnRXhwID0gL14oW0EtWl1bYS16MC05XSopKyQvO1xuXG4vKipcbiAqIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2Jsb2IvZjNlYjIyNC9saWIvaW50ZXJuYWwvZXJyb3JzLmpzXG4gKiBAZGVzY3JpcHRpb24gU29ydGVkIGJ5IGEgcm91Z2ggZXN0aW1hdGUgb24gbW9zdCBmcmVxdWVudGx5IHVzZWQgZW50cmllcy5cbiAqL1xuY29uc3Qga1R5cGVzID0gW1xuICBcInN0cmluZ1wiLFxuICBcImZ1bmN0aW9uXCIsXG4gIFwibnVtYmVyXCIsXG4gIFwib2JqZWN0XCIsXG4gIC8vIEFjY2VwdCAnRnVuY3Rpb24nIGFuZCAnT2JqZWN0JyBhcyBhbHRlcm5hdGl2ZSB0byB0aGUgbG93ZXIgY2FzZWQgdmVyc2lvbi5cbiAgXCJGdW5jdGlvblwiLFxuICBcIk9iamVjdFwiLFxuICBcImJvb2xlYW5cIixcbiAgXCJiaWdpbnRcIixcbiAgXCJzeW1ib2xcIixcbl07XG5cbi8vIE5vZGUgdXNlcyBhbiBBYm9ydEVycm9yIHRoYXQgaXNuJ3QgZXhhY3RseSB0aGUgc2FtZSBhcyB0aGUgRE9NRXhjZXB0aW9uXG4vLyB0byBtYWtlIHVzYWdlIG9mIHRoZSBlcnJvciBpbiB1c2VybGFuZCBhbmQgcmVhZGFibGUtc3RyZWFtIGVhc2llci5cbi8vIEl0IGlzIGEgcmVndWxhciBlcnJvciB3aXRoIGAuY29kZWAgYW5kIGAubmFtZWAuXG5leHBvcnQgY2xhc3MgQWJvcnRFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29kZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiVGhlIG9wZXJhdGlvbiB3YXMgYWJvcnRlZFwiKTtcbiAgICB0aGlzLmNvZGUgPSBcIkFCT1JUX0VSUlwiO1xuICAgIHRoaXMubmFtZSA9IFwiQWJvcnRFcnJvclwiO1xuICB9XG59XG5cbi8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG50eXBlIEdlbmVyaWNGdW5jdGlvbiA9ICguLi5hcmdzOiBhbnlbXSkgPT4gYW55O1xuXG5sZXQgbWF4U3RhY2tfRXJyb3JOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5sZXQgbWF4U3RhY2tfRXJyb3JNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiBgZXJyLm5hbWVgIGFuZCBgZXJyLm1lc3NhZ2VgIGFyZSBlcXVhbCB0byBlbmdpbmUtc3BlY2lmaWNcbiAqIHZhbHVlcyBpbmRpY2F0aW5nIG1heCBjYWxsIHN0YWNrIHNpemUgaGFzIGJlZW4gZXhjZWVkZWQuXG4gKiBcIk1heGltdW0gY2FsbCBzdGFjayBzaXplIGV4Y2VlZGVkXCIgaW4gVjguXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1N0YWNrT3ZlcmZsb3dFcnJvcihlcnI6IEVycm9yKTogYm9vbGVhbiB7XG4gIGlmIChtYXhTdGFja19FcnJvck1lc3NhZ2UgPT09IHVuZGVmaW5lZCkge1xuICAgIHRyeSB7XG4gICAgICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWlubmVyLWRlY2xhcmF0aW9uc1xuICAgICAgZnVuY3Rpb24gb3ZlcmZsb3dTdGFjaygpIHtcbiAgICAgICAgb3ZlcmZsb3dTdGFjaygpO1xuICAgICAgfVxuICAgICAgb3ZlcmZsb3dTdGFjaygpO1xuICAgICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICB9IGNhdGNoIChlcnI6IGFueSkge1xuICAgICAgbWF4U3RhY2tfRXJyb3JNZXNzYWdlID0gZXJyLm1lc3NhZ2U7XG4gICAgICBtYXhTdGFja19FcnJvck5hbWUgPSBlcnIubmFtZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZXJyICYmIGVyci5uYW1lID09PSBtYXhTdGFja19FcnJvck5hbWUgJiZcbiAgICBlcnIubWVzc2FnZSA9PT0gbWF4U3RhY2tfRXJyb3JNZXNzYWdlO1xufVxuXG5mdW5jdGlvbiBhZGROdW1lcmljYWxTZXBhcmF0b3IodmFsOiBzdHJpbmcpIHtcbiAgbGV0IHJlcyA9IFwiXCI7XG4gIGxldCBpID0gdmFsLmxlbmd0aDtcbiAgY29uc3Qgc3RhcnQgPSB2YWxbMF0gPT09IFwiLVwiID8gMSA6IDA7XG4gIGZvciAoOyBpID49IHN0YXJ0ICsgNDsgaSAtPSAzKSB7XG4gICAgcmVzID0gYF8ke3ZhbC5zbGljZShpIC0gMywgaSl9JHtyZXN9YDtcbiAgfVxuICByZXR1cm4gYCR7dmFsLnNsaWNlKDAsIGkpfSR7cmVzfWA7XG59XG5cbmNvbnN0IGNhcHR1cmVMYXJnZXJTdGFja1RyYWNlID0gaGlkZVN0YWNrRnJhbWVzKFxuICBmdW5jdGlvbiBjYXB0dXJlTGFyZ2VyU3RhY2tUcmFjZShlcnIpIHtcbiAgICAvLyBAdHMtaWdub3JlIHRoaXMgZnVuY3Rpb24gaXMgbm90IGF2YWlsYWJsZSBpbiBsaWIuZG9tLmQudHNcbiAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZShlcnIpO1xuXG4gICAgcmV0dXJuIGVycjtcbiAgfSxcbik7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXJybm9FeGNlcHRpb24gZXh0ZW5kcyBFcnJvciB7XG4gIGVycm5vPzogbnVtYmVyO1xuICBjb2RlPzogc3RyaW5nO1xuICBwYXRoPzogc3RyaW5nO1xuICBzeXNjYWxsPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRoaXMgY3JlYXRlcyBhbiBlcnJvciBjb21wYXRpYmxlIHdpdGggZXJyb3JzIHByb2R1Y2VkIGluIHRoZSBDKytcbiAqIFRoaXMgZnVuY3Rpb24gc2hvdWxkIHJlcGxhY2UgdGhlIGRlcHJlY2F0ZWRcbiAqIGBleGNlcHRpb25XaXRoSG9zdFBvcnQoKWAgZnVuY3Rpb24uXG4gKlxuICogQHBhcmFtIGVyciBBIGxpYnV2IGVycm9yIG51bWJlclxuICogQHBhcmFtIHN5c2NhbGxcbiAqIEBwYXJhbSBhZGRyZXNzXG4gKiBAcGFyYW0gcG9ydFxuICogQHJldHVybiBUaGUgZXJyb3IuXG4gKi9cbmV4cG9ydCBjb25zdCB1dkV4Y2VwdGlvbldpdGhIb3N0UG9ydCA9IGhpZGVTdGFja0ZyYW1lcyhcbiAgZnVuY3Rpb24gdXZFeGNlcHRpb25XaXRoSG9zdFBvcnQoXG4gICAgZXJyOiBudW1iZXIsXG4gICAgc3lzY2FsbDogc3RyaW5nLFxuICAgIGFkZHJlc3M/OiBzdHJpbmcgfCBudWxsLFxuICAgIHBvcnQ/OiBudW1iZXIgfCBudWxsLFxuICApIHtcbiAgICBjb25zdCB7IDA6IGNvZGUsIDE6IHV2bXNnIH0gPSB1dkVycm1hcEdldChlcnIpIHx8IHV2VW5tYXBwZWRFcnJvcjtcbiAgICBjb25zdCBtZXNzYWdlID0gYCR7c3lzY2FsbH0gJHtjb2RlfTogJHt1dm1zZ31gO1xuICAgIGxldCBkZXRhaWxzID0gXCJcIjtcblxuICAgIGlmIChwb3J0ICYmIHBvcnQgPiAwKSB7XG4gICAgICBkZXRhaWxzID0gYCAke2FkZHJlc3N9OiR7cG9ydH1gO1xuICAgIH0gZWxzZSBpZiAoYWRkcmVzcykge1xuICAgICAgZGV0YWlscyA9IGAgJHthZGRyZXNzfWA7XG4gICAgfVxuXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICBjb25zdCBleDogYW55ID0gbmV3IEVycm9yKGAke21lc3NhZ2V9JHtkZXRhaWxzfWApO1xuICAgIGV4LmNvZGUgPSBjb2RlO1xuICAgIGV4LmVycm5vID0gZXJyO1xuICAgIGV4LnN5c2NhbGwgPSBzeXNjYWxsO1xuICAgIGV4LmFkZHJlc3MgPSBhZGRyZXNzO1xuXG4gICAgaWYgKHBvcnQpIHtcbiAgICAgIGV4LnBvcnQgPSBwb3J0O1xuICAgIH1cblxuICAgIHJldHVybiBjYXB0dXJlTGFyZ2VyU3RhY2tUcmFjZShleCk7XG4gIH0sXG4pO1xuXG4vKipcbiAqIFRoaXMgdXNlZCB0byBiZSBgdXRpbC5fZXJybm9FeGNlcHRpb24oKWAuXG4gKlxuICogQHBhcmFtIGVyciBBIGxpYnV2IGVycm9yIG51bWJlclxuICogQHBhcmFtIHN5c2NhbGxcbiAqIEBwYXJhbSBvcmlnaW5hbFxuICogQHJldHVybiBBIGBFcnJub0V4Y2VwdGlvbmBcbiAqL1xuZXhwb3J0IGNvbnN0IGVycm5vRXhjZXB0aW9uID0gaGlkZVN0YWNrRnJhbWVzKGZ1bmN0aW9uIGVycm5vRXhjZXB0aW9uKFxuICBlcnIsXG4gIHN5c2NhbGwsXG4gIG9yaWdpbmFsPyxcbik6IEVycm5vRXhjZXB0aW9uIHtcbiAgY29uc3QgY29kZSA9IGdldFN5c3RlbUVycm9yTmFtZShlcnIpO1xuICBjb25zdCBtZXNzYWdlID0gb3JpZ2luYWxcbiAgICA/IGAke3N5c2NhbGx9ICR7Y29kZX0gJHtvcmlnaW5hbH1gXG4gICAgOiBgJHtzeXNjYWxsfSAke2NvZGV9YDtcblxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBjb25zdCBleDogYW55ID0gbmV3IEVycm9yKG1lc3NhZ2UpO1xuICBleC5lcnJubyA9IGVycjtcbiAgZXguY29kZSA9IGNvZGU7XG4gIGV4LnN5c2NhbGwgPSBzeXNjYWxsO1xuXG4gIHJldHVybiBjYXB0dXJlTGFyZ2VyU3RhY2tUcmFjZShleCk7XG59KTtcblxuZnVuY3Rpb24gdXZFcnJtYXBHZXQobmFtZTogbnVtYmVyKSB7XG4gIHJldHVybiBlcnJvck1hcC5nZXQobmFtZSk7XG59XG5cbmNvbnN0IHV2VW5tYXBwZWRFcnJvciA9IFtcIlVOS05PV05cIiwgXCJ1bmtub3duIGVycm9yXCJdO1xuXG4vKipcbiAqIFRoaXMgY3JlYXRlcyBhbiBlcnJvciBjb21wYXRpYmxlIHdpdGggZXJyb3JzIHByb2R1Y2VkIGluIHRoZSBDKytcbiAqIGZ1bmN0aW9uIFVWRXhjZXB0aW9uIHVzaW5nIGEgY29udGV4dCBvYmplY3Qgd2l0aCBkYXRhIGFzc2VtYmxlZCBpbiBDKysuXG4gKiBUaGUgZ29hbCBpcyB0byBtaWdyYXRlIHRoZW0gdG8gRVJSXyogZXJyb3JzIGxhdGVyIHdoZW4gY29tcGF0aWJpbGl0eSBpc1xuICogbm90IGEgY29uY2Vybi5cbiAqXG4gKiBAcGFyYW0gY3R4XG4gKiBAcmV0dXJuIFRoZSBlcnJvci5cbiAqL1xuZXhwb3J0IGNvbnN0IHV2RXhjZXB0aW9uID0gaGlkZVN0YWNrRnJhbWVzKGZ1bmN0aW9uIHV2RXhjZXB0aW9uKGN0eCkge1xuICBjb25zdCB7IDA6IGNvZGUsIDE6IHV2bXNnIH0gPSB1dkVycm1hcEdldChjdHguZXJybm8pIHx8IHV2VW5tYXBwZWRFcnJvcjtcblxuICBsZXQgbWVzc2FnZSA9IGAke2NvZGV9OiAke2N0eC5tZXNzYWdlIHx8IHV2bXNnfSwgJHtjdHguc3lzY2FsbH1gO1xuXG4gIGxldCBwYXRoO1xuICBsZXQgZGVzdDtcblxuICBpZiAoY3R4LnBhdGgpIHtcbiAgICBwYXRoID0gY3R4LnBhdGgudG9TdHJpbmcoKTtcbiAgICBtZXNzYWdlICs9IGAgJyR7cGF0aH0nYDtcbiAgfVxuICBpZiAoY3R4LmRlc3QpIHtcbiAgICBkZXN0ID0gY3R4LmRlc3QudG9TdHJpbmcoKTtcbiAgICBtZXNzYWdlICs9IGAgLT4gJyR7ZGVzdH0nYDtcbiAgfVxuXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIGNvbnN0IGVycjogYW55ID0gbmV3IEVycm9yKG1lc3NhZ2UpO1xuXG4gIGZvciAoY29uc3QgcHJvcCBvZiBPYmplY3Qua2V5cyhjdHgpKSB7XG4gICAgaWYgKHByb3AgPT09IFwibWVzc2FnZVwiIHx8IHByb3AgPT09IFwicGF0aFwiIHx8IHByb3AgPT09IFwiZGVzdFwiKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBlcnJbcHJvcF0gPSBjdHhbcHJvcF07XG4gIH1cblxuICBlcnIuY29kZSA9IGNvZGU7XG5cbiAgaWYgKHBhdGgpIHtcbiAgICBlcnIucGF0aCA9IHBhdGg7XG4gIH1cblxuICBpZiAoZGVzdCkge1xuICAgIGVyci5kZXN0ID0gZGVzdDtcbiAgfVxuXG4gIHJldHVybiBjYXB0dXJlTGFyZ2VyU3RhY2tUcmFjZShlcnIpO1xufSk7XG5cbi8qKlxuICogRGVwcmVjYXRlZCwgbmV3IGZ1bmN0aW9uIGlzIGB1dkV4Y2VwdGlvbldpdGhIb3N0UG9ydCgpYFxuICogTmV3IGZ1bmN0aW9uIGFkZGVkIHRoZSBlcnJvciBkZXNjcmlwdGlvbiBkaXJlY3RseVxuICogZnJvbSBDKysuIHRoaXMgbWV0aG9kIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eVxuICogQHBhcmFtIGVyciBBIGxpYnV2IGVycm9yIG51bWJlclxuICogQHBhcmFtIHN5c2NhbGxcbiAqIEBwYXJhbSBhZGRyZXNzXG4gKiBAcGFyYW0gcG9ydFxuICogQHBhcmFtIGFkZGl0aW9uYWxcbiAqL1xuZXhwb3J0IGNvbnN0IGV4Y2VwdGlvbldpdGhIb3N0UG9ydCA9IGhpZGVTdGFja0ZyYW1lcyhcbiAgZnVuY3Rpb24gZXhjZXB0aW9uV2l0aEhvc3RQb3J0KFxuICAgIGVycjogbnVtYmVyLFxuICAgIHN5c2NhbGw6IHN0cmluZyxcbiAgICBhZGRyZXNzOiBzdHJpbmcsXG4gICAgcG9ydDogbnVtYmVyLFxuICAgIGFkZGl0aW9uYWw/OiBzdHJpbmcsXG4gICkge1xuICAgIGNvbnN0IGNvZGUgPSBnZXRTeXN0ZW1FcnJvck5hbWUoZXJyKTtcbiAgICBsZXQgZGV0YWlscyA9IFwiXCI7XG5cbiAgICBpZiAocG9ydCAmJiBwb3J0ID4gMCkge1xuICAgICAgZGV0YWlscyA9IGAgJHthZGRyZXNzfToke3BvcnR9YDtcbiAgICB9IGVsc2UgaWYgKGFkZHJlc3MpIHtcbiAgICAgIGRldGFpbHMgPSBgICR7YWRkcmVzc31gO1xuICAgIH1cblxuICAgIGlmIChhZGRpdGlvbmFsKSB7XG4gICAgICBkZXRhaWxzICs9IGAgLSBMb2NhbCAoJHthZGRpdGlvbmFsfSlgO1xuICAgIH1cblxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgY29uc3QgZXg6IGFueSA9IG5ldyBFcnJvcihgJHtzeXNjYWxsfSAke2NvZGV9JHtkZXRhaWxzfWApO1xuICAgIGV4LmVycm5vID0gZXJyO1xuICAgIGV4LmNvZGUgPSBjb2RlO1xuICAgIGV4LnN5c2NhbGwgPSBzeXNjYWxsO1xuICAgIGV4LmFkZHJlc3MgPSBhZGRyZXNzO1xuXG4gICAgaWYgKHBvcnQpIHtcbiAgICAgIGV4LnBvcnQgPSBwb3J0O1xuICAgIH1cblxuICAgIHJldHVybiBjYXB0dXJlTGFyZ2VyU3RhY2tUcmFjZShleCk7XG4gIH0sXG4pO1xuXG4vKipcbiAqIEBwYXJhbSBjb2RlIEEgbGlidXYgZXJyb3IgbnVtYmVyIG9yIGEgYy1hcmVzIGVycm9yIGNvZGVcbiAqIEBwYXJhbSBzeXNjYWxsXG4gKiBAcGFyYW0gaG9zdG5hbWVcbiAqL1xuZXhwb3J0IGNvbnN0IGRuc0V4Y2VwdGlvbiA9IGhpZGVTdGFja0ZyYW1lcyhmdW5jdGlvbiAoY29kZSwgc3lzY2FsbCwgaG9zdG5hbWUpIHtcbiAgbGV0IGVycm5vO1xuXG4gIC8vIElmIGBjb2RlYCBpcyBvZiB0eXBlIG51bWJlciwgaXQgaXMgYSBsaWJ1diBlcnJvciBudW1iZXIsIGVsc2UgaXQgaXMgYVxuICAvLyBjLWFyZXMgZXJyb3IgY29kZS5cbiAgaWYgKHR5cGVvZiBjb2RlID09PSBcIm51bWJlclwiKSB7XG4gICAgZXJybm8gPSBjb2RlO1xuICAgIC8vIEVOT1RGT1VORCBpcyBub3QgYSBwcm9wZXIgUE9TSVggZXJyb3IsIGJ1dCB0aGlzIGVycm9yIGhhcyBiZWVuIGluIHBsYWNlXG4gICAgLy8gbG9uZyBlbm91Z2ggdGhhdCBpdCdzIG5vdCBwcmFjdGljYWwgdG8gcmVtb3ZlIGl0LlxuICAgIGlmIChcbiAgICAgIGNvZGUgPT09IGNvZGVNYXAuZ2V0KFwiRUFJX05PREFUQVwiKSB8fFxuICAgICAgY29kZSA9PT0gY29kZU1hcC5nZXQoXCJFQUlfTk9OQU1FXCIpXG4gICAgKSB7XG4gICAgICBjb2RlID0gXCJFTk9URk9VTkRcIjsgLy8gRmFicmljYXRlZCBlcnJvciBuYW1lLlxuICAgIH0gZWxzZSB7XG4gICAgICBjb2RlID0gZ2V0U3lzdGVtRXJyb3JOYW1lKGNvZGUpO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IG1lc3NhZ2UgPSBgJHtzeXNjYWxsfSAke2NvZGV9JHtob3N0bmFtZSA/IGAgJHtob3N0bmFtZX1gIDogXCJcIn1gO1xuXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIGNvbnN0IGV4OiBhbnkgPSBuZXcgRXJyb3IobWVzc2FnZSk7XG4gIGV4LmVycm5vID0gZXJybm87XG4gIGV4LmNvZGUgPSBjb2RlO1xuICBleC5zeXNjYWxsID0gc3lzY2FsbDtcblxuICBpZiAoaG9zdG5hbWUpIHtcbiAgICBleC5ob3N0bmFtZSA9IGhvc3RuYW1lO1xuICB9XG5cbiAgcmV0dXJuIGNhcHR1cmVMYXJnZXJTdGFja1RyYWNlKGV4KTtcbn0pO1xuXG4vKipcbiAqIEFsbCBlcnJvciBpbnN0YW5jZXMgaW4gTm9kZSBoYXZlIGFkZGl0aW9uYWwgbWV0aG9kcyBhbmQgcHJvcGVydGllc1xuICogVGhpcyBleHBvcnQgY2xhc3MgaXMgbWVhbnQgdG8gYmUgZXh0ZW5kZWQgYnkgdGhlc2UgaW5zdGFuY2VzIGFic3RyYWN0aW5nIG5hdGl2ZSBKUyBlcnJvciBpbnN0YW5jZXNcbiAqL1xuZXhwb3J0IGNsYXNzIE5vZGVFcnJvckFic3RyYWN0aW9uIGV4dGVuZHMgRXJyb3Ige1xuICBjb2RlOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBjb2RlOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZykge1xuICAgIHN1cGVyKG1lc3NhZ2UpO1xuICAgIHRoaXMuY29kZSA9IGNvZGU7XG4gICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICAvL1RoaXMgbnVtYmVyIGNoYW5nZXMgZGVwZW5kaW5nIG9uIHRoZSBuYW1lIG9mIHRoaXMgY2xhc3NcbiAgICAvLzIwIGNoYXJhY3RlcnMgYXMgb2Ygbm93XG4gICAgdGhpcy5zdGFjayA9IHRoaXMuc3RhY2sgJiYgYCR7bmFtZX0gWyR7dGhpcy5jb2RlfV0ke3RoaXMuc3RhY2suc2xpY2UoMjApfWA7XG4gIH1cblxuICBvdmVycmlkZSB0b1N0cmluZygpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5uYW1lfSBbJHt0aGlzLmNvZGV9XTogJHt0aGlzLm1lc3NhZ2V9YDtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgTm9kZUVycm9yIGV4dGVuZHMgTm9kZUVycm9yQWJzdHJhY3Rpb24ge1xuICBjb25zdHJ1Y3Rvcihjb2RlOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZykge1xuICAgIHN1cGVyKEVycm9yLnByb3RvdHlwZS5uYW1lLCBjb2RlLCBtZXNzYWdlKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgTm9kZVN5bnRheEVycm9yIGV4dGVuZHMgTm9kZUVycm9yQWJzdHJhY3Rpb25cbiAgaW1wbGVtZW50cyBTeW50YXhFcnJvciB7XG4gIGNvbnN0cnVjdG9yKGNvZGU6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nKSB7XG4gICAgc3VwZXIoU3ludGF4RXJyb3IucHJvdG90eXBlLm5hbWUsIGNvZGUsIG1lc3NhZ2UpO1xuICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZih0aGlzLCBTeW50YXhFcnJvci5wcm90b3R5cGUpO1xuICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gYCR7dGhpcy5uYW1lfSBbJHt0aGlzLmNvZGV9XTogJHt0aGlzLm1lc3NhZ2V9YDtcbiAgICB9O1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBOb2RlUmFuZ2VFcnJvciBleHRlbmRzIE5vZGVFcnJvckFic3RyYWN0aW9uIHtcbiAgY29uc3RydWN0b3IoY29kZTogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpIHtcbiAgICBzdXBlcihSYW5nZUVycm9yLnByb3RvdHlwZS5uYW1lLCBjb2RlLCBtZXNzYWdlKTtcbiAgICBPYmplY3Quc2V0UHJvdG90eXBlT2YodGhpcywgUmFuZ2VFcnJvci5wcm90b3R5cGUpO1xuICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gYCR7dGhpcy5uYW1lfSBbJHt0aGlzLmNvZGV9XTogJHt0aGlzLm1lc3NhZ2V9YDtcbiAgICB9O1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBOb2RlVHlwZUVycm9yIGV4dGVuZHMgTm9kZUVycm9yQWJzdHJhY3Rpb24gaW1wbGVtZW50cyBUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcihjb2RlOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZykge1xuICAgIHN1cGVyKFR5cGVFcnJvci5wcm90b3R5cGUubmFtZSwgY29kZSwgbWVzc2FnZSk7XG4gICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKHRoaXMsIFR5cGVFcnJvci5wcm90b3R5cGUpO1xuICAgIHRoaXMudG9TdHJpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gYCR7dGhpcy5uYW1lfSBbJHt0aGlzLmNvZGV9XTogJHt0aGlzLm1lc3NhZ2V9YDtcbiAgICB9O1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBOb2RlVVJJRXJyb3IgZXh0ZW5kcyBOb2RlRXJyb3JBYnN0cmFjdGlvbiBpbXBsZW1lbnRzIFVSSUVycm9yIHtcbiAgY29uc3RydWN0b3IoY29kZTogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpIHtcbiAgICBzdXBlcihVUklFcnJvci5wcm90b3R5cGUubmFtZSwgY29kZSwgbWVzc2FnZSk7XG4gICAgT2JqZWN0LnNldFByb3RvdHlwZU9mKHRoaXMsIFVSSUVycm9yLnByb3RvdHlwZSk7XG4gICAgdGhpcy50b1N0cmluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIHJldHVybiBgJHt0aGlzLm5hbWV9IFske3RoaXMuY29kZX1dOiAke3RoaXMubWVzc2FnZX1gO1xuICAgIH07XG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb2RlU3lzdGVtRXJyb3JDdHgge1xuICBjb2RlOiBzdHJpbmc7XG4gIHN5c2NhbGw6IHN0cmluZztcbiAgbWVzc2FnZTogc3RyaW5nO1xuICBlcnJubzogbnVtYmVyO1xuICBwYXRoPzogc3RyaW5nO1xuICBkZXN0Pzogc3RyaW5nO1xufVxuLy8gQSBzcGVjaWFsaXplZCBFcnJvciB0aGF0IGluY2x1ZGVzIGFuIGFkZGl0aW9uYWwgaW5mbyBwcm9wZXJ0eSB3aXRoXG4vLyBhZGRpdGlvbmFsIGluZm9ybWF0aW9uIGFib3V0IHRoZSBlcnJvciBjb25kaXRpb24uXG4vLyBJdCBoYXMgdGhlIHByb3BlcnRpZXMgcHJlc2VudCBpbiBhIFVWRXhjZXB0aW9uIGJ1dCB3aXRoIGEgY3VzdG9tIGVycm9yXG4vLyBtZXNzYWdlIGZvbGxvd2VkIGJ5IHRoZSB1diBlcnJvciBjb2RlIGFuZCB1diBlcnJvciBtZXNzYWdlLlxuLy8gSXQgYWxzbyBoYXMgaXRzIG93biBlcnJvciBjb2RlIHdpdGggdGhlIG9yaWdpbmFsIHV2IGVycm9yIGNvbnRleHQgcHV0IGludG9cbi8vIGBlcnIuaW5mb2AuXG4vLyBUaGUgY29udGV4dCBwYXNzZWQgaW50byB0aGlzIGVycm9yIG11c3QgaGF2ZSAuY29kZSwgLnN5c2NhbGwgYW5kIC5tZXNzYWdlLFxuLy8gYW5kIG1heSBoYXZlIC5wYXRoIGFuZCAuZGVzdC5cbmNsYXNzIE5vZGVTeXN0ZW1FcnJvciBleHRlbmRzIE5vZGVFcnJvckFic3RyYWN0aW9uIHtcbiAgY29uc3RydWN0b3Ioa2V5OiBzdHJpbmcsIGNvbnRleHQ6IE5vZGVTeXN0ZW1FcnJvckN0eCwgbXNnUHJlZml4OiBzdHJpbmcpIHtcbiAgICBsZXQgbWVzc2FnZSA9IGAke21zZ1ByZWZpeH06ICR7Y29udGV4dC5zeXNjYWxsfSByZXR1cm5lZCBgICtcbiAgICAgIGAke2NvbnRleHQuY29kZX0gKCR7Y29udGV4dC5tZXNzYWdlfSlgO1xuXG4gICAgaWYgKGNvbnRleHQucGF0aCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBtZXNzYWdlICs9IGAgJHtjb250ZXh0LnBhdGh9YDtcbiAgICB9XG4gICAgaWYgKGNvbnRleHQuZGVzdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBtZXNzYWdlICs9IGAgPT4gJHtjb250ZXh0LmRlc3R9YDtcbiAgICB9XG5cbiAgICBzdXBlcihcIlN5c3RlbUVycm9yXCIsIGtleSwgbWVzc2FnZSk7XG5cbiAgICBjYXB0dXJlTGFyZ2VyU3RhY2tUcmFjZSh0aGlzKTtcblxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHRoaXMsIHtcbiAgICAgIFtrSXNOb2RlRXJyb3JdOiB7XG4gICAgICAgIHZhbHVlOiB0cnVlLFxuICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgd3JpdGFibGU6IGZhbHNlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICB9LFxuICAgICAgaW5mbzoge1xuICAgICAgICB2YWx1ZTogY29udGV4dCxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgICB3cml0YWJsZTogZmFsc2UsXG4gICAgICB9LFxuICAgICAgZXJybm86IHtcbiAgICAgICAgZ2V0KCkge1xuICAgICAgICAgIHJldHVybiBjb250ZXh0LmVycm5vO1xuICAgICAgICB9LFxuICAgICAgICBzZXQ6ICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIGNvbnRleHQuZXJybm8gPSB2YWx1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIHN5c2NhbGw6IHtcbiAgICAgICAgZ2V0KCkge1xuICAgICAgICAgIHJldHVybiBjb250ZXh0LnN5c2NhbGw7XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogKHZhbHVlKSA9PiB7XG4gICAgICAgICAgY29udGV4dC5zeXNjYWxsID0gdmFsdWU7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBpZiAoY29udGV4dC5wYXRoICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBcInBhdGhcIiwge1xuICAgICAgICBnZXQoKSB7XG4gICAgICAgICAgcmV0dXJuIGNvbnRleHQucGF0aDtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiAodmFsdWUpID0+IHtcbiAgICAgICAgICBjb250ZXh0LnBhdGggPSB2YWx1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKGNvbnRleHQuZGVzdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgXCJkZXN0XCIsIHtcbiAgICAgICAgZ2V0KCkge1xuICAgICAgICAgIHJldHVybiBjb250ZXh0LmRlc3Q7XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogKHZhbHVlKSA9PiB7XG4gICAgICAgICAgY29udGV4dC5kZXN0ID0gdmFsdWU7XG4gICAgICAgIH0sXG4gICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIG92ZXJyaWRlIHRvU3RyaW5nKCkge1xuICAgIHJldHVybiBgJHt0aGlzLm5hbWV9IFske3RoaXMuY29kZX1dOiAke3RoaXMubWVzc2FnZX1gO1xuICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VTeXN0ZW1FcnJvcldpdGhDb2RlKGtleTogc3RyaW5nLCBtc2dQcmZpeDogc3RyaW5nKSB7XG4gIHJldHVybiBjbGFzcyBOb2RlRXJyb3IgZXh0ZW5kcyBOb2RlU3lzdGVtRXJyb3Ige1xuICAgIGNvbnN0cnVjdG9yKGN0eDogTm9kZVN5c3RlbUVycm9yQ3R4KSB7XG4gICAgICBzdXBlcihrZXksIGN0eCwgbXNnUHJmaXgpO1xuICAgIH1cbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IEVSUl9GU19FSVNESVIgPSBtYWtlU3lzdGVtRXJyb3JXaXRoQ29kZShcbiAgXCJFUlJfRlNfRUlTRElSXCIsXG4gIFwiUGF0aCBpcyBhIGRpcmVjdG9yeVwiLFxuKTtcblxuZnVuY3Rpb24gY3JlYXRlSW52YWxpZEFyZ1R5cGUoXG4gIG5hbWU6IHN0cmluZyxcbiAgZXhwZWN0ZWQ6IHN0cmluZyB8IHN0cmluZ1tdLFxuKTogc3RyaW5nIHtcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2Jsb2IvZjNlYjIyNC9saWIvaW50ZXJuYWwvZXJyb3JzLmpzI0wxMDM3LUwxMDg3XG4gIGV4cGVjdGVkID0gQXJyYXkuaXNBcnJheShleHBlY3RlZCkgPyBleHBlY3RlZCA6IFtleHBlY3RlZF07XG4gIGxldCBtc2cgPSBcIlRoZSBcIjtcbiAgaWYgKG5hbWUuZW5kc1dpdGgoXCIgYXJndW1lbnRcIikpIHtcbiAgICAvLyBGb3IgY2FzZXMgbGlrZSAnZmlyc3QgYXJndW1lbnQnXG4gICAgbXNnICs9IGAke25hbWV9IGA7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgdHlwZSA9IG5hbWUuaW5jbHVkZXMoXCIuXCIpID8gXCJwcm9wZXJ0eVwiIDogXCJhcmd1bWVudFwiO1xuICAgIG1zZyArPSBgXCIke25hbWV9XCIgJHt0eXBlfSBgO1xuICB9XG4gIG1zZyArPSBcIm11c3QgYmUgXCI7XG5cbiAgY29uc3QgdHlwZXMgPSBbXTtcbiAgY29uc3QgaW5zdGFuY2VzID0gW107XG4gIGNvbnN0IG90aGVyID0gW107XG4gIGZvciAoY29uc3QgdmFsdWUgb2YgZXhwZWN0ZWQpIHtcbiAgICBpZiAoa1R5cGVzLmluY2x1ZGVzKHZhbHVlKSkge1xuICAgICAgdHlwZXMucHVzaCh2YWx1ZS50b0xvY2FsZUxvd2VyQ2FzZSgpKTtcbiAgICB9IGVsc2UgaWYgKGNsYXNzUmVnRXhwLnRlc3QodmFsdWUpKSB7XG4gICAgICBpbnN0YW5jZXMucHVzaCh2YWx1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG90aGVyLnB1c2godmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIC8vIFNwZWNpYWwgaGFuZGxlIGBvYmplY3RgIGluIGNhc2Ugb3RoZXIgaW5zdGFuY2VzIGFyZSBhbGxvd2VkIHRvIG91dGxpbmVcbiAgLy8gdGhlIGRpZmZlcmVuY2VzIGJldHdlZW4gZWFjaCBvdGhlci5cbiAgaWYgKGluc3RhbmNlcy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgcG9zID0gdHlwZXMuaW5kZXhPZihcIm9iamVjdFwiKTtcbiAgICBpZiAocG9zICE9PSAtMSkge1xuICAgICAgdHlwZXMuc3BsaWNlKHBvcywgMSk7XG4gICAgICBpbnN0YW5jZXMucHVzaChcIk9iamVjdFwiKTtcbiAgICB9XG4gIH1cblxuICBpZiAodHlwZXMubGVuZ3RoID4gMCkge1xuICAgIGlmICh0eXBlcy5sZW5ndGggPiAyKSB7XG4gICAgICBjb25zdCBsYXN0ID0gdHlwZXMucG9wKCk7XG4gICAgICBtc2cgKz0gYG9uZSBvZiB0eXBlICR7dHlwZXMuam9pbihcIiwgXCIpfSwgb3IgJHtsYXN0fWA7XG4gICAgfSBlbHNlIGlmICh0eXBlcy5sZW5ndGggPT09IDIpIHtcbiAgICAgIG1zZyArPSBgb25lIG9mIHR5cGUgJHt0eXBlc1swXX0gb3IgJHt0eXBlc1sxXX1gO1xuICAgIH0gZWxzZSB7XG4gICAgICBtc2cgKz0gYG9mIHR5cGUgJHt0eXBlc1swXX1gO1xuICAgIH1cbiAgICBpZiAoaW5zdGFuY2VzLmxlbmd0aCA+IDAgfHwgb3RoZXIubGVuZ3RoID4gMCkge1xuICAgICAgbXNnICs9IFwiIG9yIFwiO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpbnN0YW5jZXMubGVuZ3RoID4gMCkge1xuICAgIGlmIChpbnN0YW5jZXMubGVuZ3RoID4gMikge1xuICAgICAgY29uc3QgbGFzdCA9IGluc3RhbmNlcy5wb3AoKTtcbiAgICAgIG1zZyArPSBgYW4gaW5zdGFuY2Ugb2YgJHtpbnN0YW5jZXMuam9pbihcIiwgXCIpfSwgb3IgJHtsYXN0fWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIG1zZyArPSBgYW4gaW5zdGFuY2Ugb2YgJHtpbnN0YW5jZXNbMF19YDtcbiAgICAgIGlmIChpbnN0YW5jZXMubGVuZ3RoID09PSAyKSB7XG4gICAgICAgIG1zZyArPSBgIG9yICR7aW5zdGFuY2VzWzFdfWA7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChvdGhlci5sZW5ndGggPiAwKSB7XG4gICAgICBtc2cgKz0gXCIgb3IgXCI7XG4gICAgfVxuICB9XG5cbiAgaWYgKG90aGVyLmxlbmd0aCA+IDApIHtcbiAgICBpZiAob3RoZXIubGVuZ3RoID4gMikge1xuICAgICAgY29uc3QgbGFzdCA9IG90aGVyLnBvcCgpO1xuICAgICAgbXNnICs9IGBvbmUgb2YgJHtvdGhlci5qb2luKFwiLCBcIil9LCBvciAke2xhc3R9YDtcbiAgICB9IGVsc2UgaWYgKG90aGVyLmxlbmd0aCA9PT0gMikge1xuICAgICAgbXNnICs9IGBvbmUgb2YgJHtvdGhlclswXX0gb3IgJHtvdGhlclsxXX1gO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAob3RoZXJbMF0udG9Mb3dlckNhc2UoKSAhPT0gb3RoZXJbMF0pIHtcbiAgICAgICAgbXNnICs9IFwiYW4gXCI7XG4gICAgICB9XG4gICAgICBtc2cgKz0gYCR7b3RoZXJbMF19YDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbXNnO1xufVxuXG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfQVJHX1RZUEVfUkFOR0UgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZyB8IHN0cmluZ1tdLCBhY3R1YWw6IHVua25vd24pIHtcbiAgICBjb25zdCBtc2cgPSBjcmVhdGVJbnZhbGlkQXJnVHlwZShuYW1lLCBleHBlY3RlZCk7XG5cbiAgICBzdXBlcihcIkVSUl9JTlZBTElEX0FSR19UWVBFXCIsIGAke21zZ30uJHtpbnZhbGlkQXJnVHlwZUhlbHBlcihhY3R1YWwpfWApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9BUkdfVFlQRSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcgfCBzdHJpbmdbXSwgYWN0dWFsOiB1bmtub3duKSB7XG4gICAgY29uc3QgbXNnID0gY3JlYXRlSW52YWxpZEFyZ1R5cGUobmFtZSwgZXhwZWN0ZWQpO1xuXG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9BUkdfVFlQRVwiLCBgJHttc2d9LiR7aW52YWxpZEFyZ1R5cGVIZWxwZXIoYWN0dWFsKX1gKTtcbiAgfVxuXG4gIHN0YXRpYyBSYW5nZUVycm9yID0gRVJSX0lOVkFMSURfQVJHX1RZUEVfUkFOR0U7XG59XG5cbmNsYXNzIEVSUl9JTlZBTElEX0FSR19WQUxVRV9SQU5HRSBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgcmVhc29uOiBzdHJpbmcgPSBcImlzIGludmFsaWRcIikge1xuICAgIGNvbnN0IHR5cGUgPSBuYW1lLmluY2x1ZGVzKFwiLlwiKSA/IFwicHJvcGVydHlcIiA6IFwiYXJndW1lbnRcIjtcbiAgICBjb25zdCBpbnNwZWN0ZWQgPSBpbnNwZWN0KHZhbHVlKTtcblxuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5WQUxJRF9BUkdfVkFMVUVcIixcbiAgICAgIGBUaGUgJHt0eXBlfSAnJHtuYW1lfScgJHtyZWFzb259LiBSZWNlaXZlZCAke2luc3BlY3RlZH1gLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX0FSR19WQUxVRSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCByZWFzb246IHN0cmluZyA9IFwiaXMgaW52YWxpZFwiKSB7XG4gICAgY29uc3QgdHlwZSA9IG5hbWUuaW5jbHVkZXMoXCIuXCIpID8gXCJwcm9wZXJ0eVwiIDogXCJhcmd1bWVudFwiO1xuICAgIGNvbnN0IGluc3BlY3RlZCA9IGluc3BlY3QodmFsdWUpO1xuXG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlZBTElEX0FSR19WQUxVRVwiLFxuICAgICAgYFRoZSAke3R5cGV9ICcke25hbWV9JyAke3JlYXNvbn0uIFJlY2VpdmVkICR7aW5zcGVjdGVkfWAsXG4gICAgKTtcbiAgfVxuXG4gIHN0YXRpYyBSYW5nZUVycm9yID0gRVJSX0lOVkFMSURfQVJHX1ZBTFVFX1JBTkdFO1xufVxuXG4vLyBBIGhlbHBlciBmdW5jdGlvbiB0byBzaW1wbGlmeSBjaGVja2luZyBmb3IgRVJSX0lOVkFMSURfQVJHX1RZUEUgb3V0cHV0LlxuLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbmZ1bmN0aW9uIGludmFsaWRBcmdUeXBlSGVscGVyKGlucHV0OiBhbnkpIHtcbiAgaWYgKGlucHV0ID09IG51bGwpIHtcbiAgICByZXR1cm4gYCBSZWNlaXZlZCAke2lucHV0fWA7XG4gIH1cbiAgaWYgKHR5cGVvZiBpbnB1dCA9PT0gXCJmdW5jdGlvblwiICYmIGlucHV0Lm5hbWUpIHtcbiAgICByZXR1cm4gYCBSZWNlaXZlZCBmdW5jdGlvbiAke2lucHV0Lm5hbWV9YDtcbiAgfVxuICBpZiAodHlwZW9mIGlucHV0ID09PSBcIm9iamVjdFwiKSB7XG4gICAgaWYgKGlucHV0LmNvbnN0cnVjdG9yICYmIGlucHV0LmNvbnN0cnVjdG9yLm5hbWUpIHtcbiAgICAgIHJldHVybiBgIFJlY2VpdmVkIGFuIGluc3RhbmNlIG9mICR7aW5wdXQuY29uc3RydWN0b3IubmFtZX1gO1xuICAgIH1cbiAgICByZXR1cm4gYCBSZWNlaXZlZCAke2luc3BlY3QoaW5wdXQsIHsgZGVwdGg6IC0xIH0pfWA7XG4gIH1cbiAgbGV0IGluc3BlY3RlZCA9IGluc3BlY3QoaW5wdXQsIHsgY29sb3JzOiBmYWxzZSB9KTtcbiAgaWYgKGluc3BlY3RlZC5sZW5ndGggPiAyNSkge1xuICAgIGluc3BlY3RlZCA9IGAke2luc3BlY3RlZC5zbGljZSgwLCAyNSl9Li4uYDtcbiAgfVxuICByZXR1cm4gYCBSZWNlaXZlZCB0eXBlICR7dHlwZW9mIGlucHV0fSAoJHtpbnNwZWN0ZWR9KWA7XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfT1VUX09GX1JBTkdFIGV4dGVuZHMgUmFuZ2VFcnJvciB7XG4gIGNvZGUgPSBcIkVSUl9PVVRfT0ZfUkFOR0VcIjtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBzdHI6IHN0cmluZyxcbiAgICByYW5nZTogc3RyaW5nLFxuICAgIGlucHV0OiB1bmtub3duLFxuICAgIHJlcGxhY2VEZWZhdWx0Qm9vbGVhbiA9IGZhbHNlLFxuICApIHtcbiAgICBhc3NlcnQocmFuZ2UsICdNaXNzaW5nIFwicmFuZ2VcIiBhcmd1bWVudCcpO1xuICAgIGxldCBtc2cgPSByZXBsYWNlRGVmYXVsdEJvb2xlYW5cbiAgICAgID8gc3RyXG4gICAgICA6IGBUaGUgdmFsdWUgb2YgXCIke3N0cn1cIiBpcyBvdXQgb2YgcmFuZ2UuYDtcbiAgICBsZXQgcmVjZWl2ZWQ7XG4gICAgaWYgKE51bWJlci5pc0ludGVnZXIoaW5wdXQpICYmIE1hdGguYWJzKGlucHV0IGFzIG51bWJlcikgPiAyICoqIDMyKSB7XG4gICAgICByZWNlaXZlZCA9IGFkZE51bWVyaWNhbFNlcGFyYXRvcihTdHJpbmcoaW5wdXQpKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBpbnB1dCA9PT0gXCJiaWdpbnRcIikge1xuICAgICAgcmVjZWl2ZWQgPSBTdHJpbmcoaW5wdXQpO1xuICAgICAgaWYgKGlucHV0ID4gMm4gKiogMzJuIHx8IGlucHV0IDwgLSgybiAqKiAzMm4pKSB7XG4gICAgICAgIHJlY2VpdmVkID0gYWRkTnVtZXJpY2FsU2VwYXJhdG9yKHJlY2VpdmVkKTtcbiAgICAgIH1cbiAgICAgIHJlY2VpdmVkICs9IFwiblwiO1xuICAgIH0gZWxzZSB7XG4gICAgICByZWNlaXZlZCA9IGluc3BlY3QoaW5wdXQpO1xuICAgIH1cbiAgICBtc2cgKz0gYCBJdCBtdXN0IGJlICR7cmFuZ2V9LiBSZWNlaXZlZCAke3JlY2VpdmVkfWA7XG5cbiAgICBzdXBlcihtc2cpO1xuXG4gICAgY29uc3QgeyBuYW1lIH0gPSB0aGlzO1xuICAgIC8vIEFkZCB0aGUgZXJyb3IgY29kZSB0byB0aGUgbmFtZSB0byBpbmNsdWRlIGl0IGluIHRoZSBzdGFjayB0cmFjZS5cbiAgICB0aGlzLm5hbWUgPSBgJHtuYW1lfSBbJHt0aGlzLmNvZGV9XWA7XG4gICAgLy8gQWNjZXNzIHRoZSBzdGFjayB0byBnZW5lcmF0ZSB0aGUgZXJyb3IgbWVzc2FnZSBpbmNsdWRpbmcgdGhlIGVycm9yIGNvZGUgZnJvbSB0aGUgbmFtZS5cbiAgICB0aGlzLnN0YWNrO1xuICAgIC8vIFJlc2V0IHRoZSBuYW1lIHRvIHRoZSBhY3R1YWwgbmFtZS5cbiAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQU1CSUdVT1VTX0FSR1VNRU5UIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZywgeTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfQU1CSUdVT1VTX0FSR1VNRU5UXCIsIGBUaGUgXCIke3h9XCIgYXJndW1lbnQgaXMgYW1iaWd1b3VzLiAke3l9YCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9BUkdfTk9UX0lURVJBQkxFIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0FSR19OT1RfSVRFUkFCTEVcIiwgYCR7eH0gbXVzdCBiZSBpdGVyYWJsZWApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQVNTRVJUSU9OIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfQVNTRVJUSU9OXCIsIGAke3h9YCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9BU1lOQ19DQUxMQkFDSyBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9BU1lOQ19DQUxMQkFDS1wiLCBgJHt4fSBtdXN0IGJlIGEgZnVuY3Rpb25gKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0FTWU5DX1RZUEUgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfQVNZTkNfVFlQRVwiLCBgSW52YWxpZCBuYW1lIGZvciBhc3luYyBcInR5cGVcIjogJHt4fWApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQlJPVExJX0lOVkFMSURfUEFSQU0gZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0JST1RMSV9JTlZBTElEX1BBUkFNXCIsIGAke3h9IGlzIG5vdCBhIHZhbGlkIEJyb3RsaSBwYXJhbWV0ZXJgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0JVRkZFUl9PVVRfT0ZfQk9VTkRTIGV4dGVuZHMgTm9kZVJhbmdlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihuYW1lPzogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9CVUZGRVJfT1VUX09GX0JPVU5EU1wiLFxuICAgICAgbmFtZVxuICAgICAgICA/IGBcIiR7bmFtZX1cIiBpcyBvdXRzaWRlIG9mIGJ1ZmZlciBib3VuZHNgXG4gICAgICAgIDogXCJBdHRlbXB0IHRvIGFjY2VzcyBtZW1vcnkgb3V0c2lkZSBidWZmZXIgYm91bmRzXCIsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0JVRkZFUl9UT09fTEFSR0UgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfQlVGRkVSX1RPT19MQVJHRVwiLFxuICAgICAgYENhbm5vdCBjcmVhdGUgYSBCdWZmZXIgbGFyZ2VyIHRoYW4gJHt4fSBieXRlc2AsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NBTk5PVF9XQVRDSF9TSUdJTlQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9DQU5OT1RfV0FUQ0hfU0lHSU5UXCIsIFwiQ2Fubm90IHdhdGNoIGZvciBTSUdJTlQgc2lnbmFsc1wiKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NISUxEX0NMT1NFRF9CRUZPUkVfUkVQTFkgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0NISUxEX0NMT1NFRF9CRUZPUkVfUkVQTFlcIixcbiAgICAgIFwiQ2hpbGQgY2xvc2VkIGJlZm9yZSByZXBseSByZWNlaXZlZFwiLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DSElMRF9QUk9DRVNTX0lQQ19SRVFVSVJFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfQ0hJTERfUFJPQ0VTU19JUENfUkVRVUlSRURcIixcbiAgICAgIGBGb3JrZWQgcHJvY2Vzc2VzIG11c3QgaGF2ZSBhbiBJUEMgY2hhbm5lbCwgbWlzc2luZyB2YWx1ZSAnaXBjJyBpbiAke3h9YCxcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ0hJTERfUFJPQ0VTU19TVERJT19NQVhCVUZGRVIgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfQ0hJTERfUFJPQ0VTU19TVERJT19NQVhCVUZGRVJcIixcbiAgICAgIGAke3h9IG1heEJ1ZmZlciBsZW5ndGggZXhjZWVkZWRgLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DT05TT0xFX1dSSVRBQkxFX1NUUkVBTSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0NPTlNPTEVfV1JJVEFCTEVfU1RSRUFNXCIsXG4gICAgICBgQ29uc29sZSBleHBlY3RzIGEgd3JpdGFibGUgc3RyZWFtIGluc3RhbmNlIGZvciAke3h9YCxcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ09OVEVYVF9OT1RfSU5JVElBTElaRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9DT05URVhUX05PVF9JTklUSUFMSVpFRFwiLCBcImNvbnRleHQgdXNlZCBpcyBub3QgaW5pdGlhbGl6ZWRcIik7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DUFVfVVNBR0UgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9DUFVfVVNBR0VcIiwgYFVuYWJsZSB0byBvYnRhaW4gY3B1IHVzYWdlICR7eH1gKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NSWVBUT19DVVNUT01fRU5HSU5FX05PVF9TVVBQT1JURUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0NSWVBUT19DVVNUT01fRU5HSU5FX05PVF9TVVBQT1JURURcIixcbiAgICAgIFwiQ3VzdG9tIGVuZ2luZXMgbm90IHN1cHBvcnRlZCBieSB0aGlzIE9wZW5TU0xcIixcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX0VDREhfSU5WQUxJRF9GT1JNQVQgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfQ1JZUFRPX0VDREhfSU5WQUxJRF9GT1JNQVRcIiwgYEludmFsaWQgRUNESCBmb3JtYXQ6ICR7eH1gKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NSWVBUT19FQ0RIX0lOVkFMSURfUFVCTElDX0tFWSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfQ1JZUFRPX0VDREhfSU5WQUxJRF9QVUJMSUNfS0VZXCIsXG4gICAgICBcIlB1YmxpYyBrZXkgaXMgbm90IHZhbGlkIGZvciBzcGVjaWZpZWQgY3VydmVcIixcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX0VOR0lORV9VTktOT1dOIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfQ1JZUFRPX0VOR0lORV9VTktOT1dOXCIsIGBFbmdpbmUgXCIke3h9XCIgd2FzIG5vdCBmb3VuZGApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX0ZJUFNfRk9SQ0VEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9DUllQVE9fRklQU19GT1JDRURcIixcbiAgICAgIFwiQ2Fubm90IHNldCBGSVBTIG1vZGUsIGl0IHdhcyBmb3JjZWQgd2l0aCAtLWZvcmNlLWZpcHMgYXQgc3RhcnR1cC5cIixcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX0ZJUFNfVU5BVkFJTEFCTEUgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0NSWVBUT19GSVBTX1VOQVZBSUxBQkxFXCIsXG4gICAgICBcIkNhbm5vdCBzZXQgRklQUyBtb2RlIGluIGEgbm9uLUZJUFMgYnVpbGQuXCIsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NSWVBUT19IQVNIX0ZJTkFMSVpFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0NSWVBUT19IQVNIX0ZJTkFMSVpFRFwiLCBcIkRpZ2VzdCBhbHJlYWR5IGNhbGxlZFwiKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NSWVBUT19IQVNIX1VQREFURV9GQUlMRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9DUllQVE9fSEFTSF9VUERBVEVfRkFJTEVEXCIsIFwiSGFzaCB1cGRhdGUgZmFpbGVkXCIpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX0lOQ09NUEFUSUJMRV9LRVkgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcsIHk6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0NSWVBUT19JTkNPTVBBVElCTEVfS0VZXCIsIGBJbmNvbXBhdGlibGUgJHt4fTogJHt5fWApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX0lOQ09NUEFUSUJMRV9LRVlfT1BUSU9OUyBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZywgeTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9DUllQVE9fSU5DT01QQVRJQkxFX0tFWV9PUFRJT05TXCIsXG4gICAgICBgVGhlIHNlbGVjdGVkIGtleSBlbmNvZGluZyAke3h9ICR7eX0uYCxcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX0lOVkFMSURfRElHRVNUIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0NSWVBUT19JTlZBTElEX0RJR0VTVFwiLCBgSW52YWxpZCBkaWdlc3Q6ICR7eH1gKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NSWVBUT19JTlZBTElEX0tFWV9PQkpFQ1RfVFlQRSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcsIHk6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfQ1JZUFRPX0lOVkFMSURfS0VZX09CSkVDVF9UWVBFXCIsXG4gICAgICBgSW52YWxpZCBrZXkgb2JqZWN0IHR5cGUgJHt4fSwgZXhwZWN0ZWQgJHt5fS5gLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DUllQVE9fSU5WQUxJRF9TVEFURSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0NSWVBUT19JTlZBTElEX1NUQVRFXCIsIGBJbnZhbGlkIHN0YXRlIGZvciBvcGVyYXRpb24gJHt4fWApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfQ1JZUFRPX1BCS0RGMl9FUlJPUiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0NSWVBUT19QQktERjJfRVJST1JcIiwgXCJQQktERjIgZXJyb3JcIik7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9DUllQVE9fU0NSWVBUX0lOVkFMSURfUEFSQU1FVEVSIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfQ1JZUFRPX1NDUllQVF9JTlZBTElEX1BBUkFNRVRFUlwiLCBcIkludmFsaWQgc2NyeXB0IHBhcmFtZXRlclwiKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NSWVBUT19TQ1JZUFRfTk9UX1NVUFBPUlRFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0NSWVBUT19TQ1JZUFRfTk9UX1NVUFBPUlRFRFwiLCBcIlNjcnlwdCBhbGdvcml0aG0gbm90IHN1cHBvcnRlZFwiKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0NSWVBUT19TSUdOX0tFWV9SRVFVSVJFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0NSWVBUT19TSUdOX0tFWV9SRVFVSVJFRFwiLCBcIk5vIGtleSBwcm92aWRlZCB0byBzaWduXCIpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfRElSX0NMT1NFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0RJUl9DTE9TRURcIiwgXCJEaXJlY3RvcnkgaGFuZGxlIHdhcyBjbG9zZWRcIik7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9ESVJfQ09OQ1VSUkVOVF9PUEVSQVRJT04gZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0RJUl9DT05DVVJSRU5UX09QRVJBVElPTlwiLFxuICAgICAgXCJDYW5ub3QgZG8gc3luY2hyb25vdXMgd29yayBvbiBkaXJlY3RvcnkgaGFuZGxlIHdpdGggY29uY3VycmVudCBhc3luY2hyb25vdXMgb3BlcmF0aW9uc1wiLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9ETlNfU0VUX1NFUlZFUlNfRkFJTEVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0ROU19TRVRfU0VSVkVSU19GQUlMRURcIixcbiAgICAgIGBjLWFyZXMgZmFpbGVkIHRvIHNldCBzZXJ2ZXJzOiBcIiR7eH1cIiBbJHt5fV1gLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9ET01BSU5fQ0FMTEJBQ0tfTk9UX0FWQUlMQUJMRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfRE9NQUlOX0NBTExCQUNLX05PVF9BVkFJTEFCTEVcIixcbiAgICAgIFwiQSBjYWxsYmFjayB3YXMgcmVnaXN0ZXJlZCB0aHJvdWdoIFwiICtcbiAgICAgICAgXCJwcm9jZXNzLnNldFVuY2F1Z2h0RXhjZXB0aW9uQ2FwdHVyZUNhbGxiYWNrKCksIHdoaWNoIGlzIG11dHVhbGx5IFwiICtcbiAgICAgICAgXCJleGNsdXNpdmUgd2l0aCB1c2luZyB0aGUgYGRvbWFpbmAgbW9kdWxlXCIsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0RPTUFJTl9DQU5OT1RfU0VUX1VOQ0FVR0hUX0VYQ0VQVElPTl9DQVBUVVJFXG4gIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9ET01BSU5fQ0FOTk9UX1NFVF9VTkNBVUdIVF9FWENFUFRJT05fQ0FQVFVSRVwiLFxuICAgICAgXCJUaGUgYGRvbWFpbmAgbW9kdWxlIGlzIGluIHVzZSwgd2hpY2ggaXMgbXV0dWFsbHkgZXhjbHVzaXZlIHdpdGggY2FsbGluZyBcIiArXG4gICAgICAgIFwicHJvY2Vzcy5zZXRVbmNhdWdodEV4Y2VwdGlvbkNhcHR1cmVDYWxsYmFjaygpXCIsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0VOQ09ESU5HX0lOVkFMSURfRU5DT0RFRF9EQVRBIGV4dGVuZHMgTm9kZUVycm9yQWJzdHJhY3Rpb25cbiAgaW1wbGVtZW50cyBUeXBlRXJyb3Ige1xuICBlcnJubzogbnVtYmVyO1xuICBjb25zdHJ1Y3RvcihlbmNvZGluZzogc3RyaW5nLCByZXQ6IG51bWJlcikge1xuICAgIHN1cGVyKFxuICAgICAgVHlwZUVycm9yLnByb3RvdHlwZS5uYW1lLFxuICAgICAgXCJFUlJfRU5DT0RJTkdfSU5WQUxJRF9FTkNPREVEX0RBVEFcIixcbiAgICAgIGBUaGUgZW5jb2RlZCBkYXRhIHdhcyBub3QgdmFsaWQgZm9yIGVuY29kaW5nICR7ZW5jb2Rpbmd9YCxcbiAgICApO1xuICAgIE9iamVjdC5zZXRQcm90b3R5cGVPZih0aGlzLCBUeXBlRXJyb3IucHJvdG90eXBlKTtcblxuICAgIHRoaXMuZXJybm8gPSByZXQ7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9FTkNPRElOR19OT1RfU1VQUE9SVEVEIGV4dGVuZHMgTm9kZVJhbmdlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9FTkNPRElOR19OT1RfU1VQUE9SVEVEXCIsIGBUaGUgXCIke3h9XCIgZW5jb2RpbmcgaXMgbm90IHN1cHBvcnRlZGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0VWQUxfRVNNX0NBTk5PVF9QUklOVCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0VWQUxfRVNNX0NBTk5PVF9QUklOVFwiLCBgLS1wcmludCBjYW5ub3QgYmUgdXNlZCB3aXRoIEVTTSBpbnB1dGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0VWRU5UX1JFQ1VSU0lPTiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfRVZFTlRfUkVDVVJTSU9OXCIsXG4gICAgICBgVGhlIGV2ZW50IFwiJHt4fVwiIGlzIGFscmVhZHkgYmVpbmcgZGlzcGF0Y2hlZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9GRUFUVVJFX1VOQVZBSUxBQkxFX09OX1BMQVRGT1JNIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfRkVBVFVSRV9VTkFWQUlMQUJMRV9PTl9QTEFURk9STVwiLFxuICAgICAgYFRoZSBmZWF0dXJlICR7eH0gaXMgdW5hdmFpbGFibGUgb24gdGhlIGN1cnJlbnQgcGxhdGZvcm0sIHdoaWNoIGlzIGJlaW5nIHVzZWQgdG8gcnVuIE5vZGUuanNgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfRlNfRklMRV9UT09fTEFSR0UgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0ZTX0ZJTEVfVE9PX0xBUkdFXCIsIGBGaWxlIHNpemUgKCR7eH0pIGlzIGdyZWF0ZXIgdGhhbiAyIEdCYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfRlNfSU5WQUxJRF9TWU1MSU5LX1RZUEUgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0ZTX0lOVkFMSURfU1lNTElOS19UWVBFXCIsXG4gICAgICBgU3ltbGluayB0eXBlIG11c3QgYmUgb25lIG9mIFwiZGlyXCIsIFwiZmlsZVwiLCBvciBcImp1bmN0aW9uXCIuIFJlY2VpdmVkIFwiJHt4fVwiYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0FMVFNWQ19JTlZBTElEX09SSUdJTiBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX0FMVFNWQ19JTlZBTElEX09SSUdJTlwiLFxuICAgICAgYEhUVFAvMiBBTFRTVkMgZnJhbWVzIHJlcXVpcmUgYSB2YWxpZCBvcmlnaW5gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfQUxUU1ZDX0xFTkdUSCBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX0FMVFNWQ19MRU5HVEhcIixcbiAgICAgIGBIVFRQLzIgQUxUU1ZDIGZyYW1lcyBhcmUgbGltaXRlZCB0byAxNjM4MiBieXRlc2AsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9DT05ORUNUX0FVVEhPUklUWSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfQ09OTkVDVF9BVVRIT1JJVFlcIixcbiAgICAgIGA6YXV0aG9yaXR5IGhlYWRlciBpcyByZXF1aXJlZCBmb3IgQ09OTkVDVCByZXF1ZXN0c2AsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9DT05ORUNUX1BBVEggZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX0NPTk5FQ1RfUEFUSFwiLFxuICAgICAgYFRoZSA6cGF0aCBoZWFkZXIgaXMgZm9yYmlkZGVuIGZvciBDT05ORUNUIHJlcXVlc3RzYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0NPTk5FQ1RfU0NIRU1FIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9DT05ORUNUX1NDSEVNRVwiLFxuICAgICAgYFRoZSA6c2NoZW1lIGhlYWRlciBpcyBmb3JiaWRkZW4gZm9yIENPTk5FQ1QgcmVxdWVzdHNgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfR09BV0FZX1NFU1NJT04gZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX0dPQVdBWV9TRVNTSU9OXCIsXG4gICAgICBgTmV3IHN0cmVhbXMgY2Fubm90IGJlIGNyZWF0ZWQgYWZ0ZXIgcmVjZWl2aW5nIGEgR09BV0FZYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0hFQURFUlNfQUZURVJfUkVTUE9ORCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfSEVBREVSU19BRlRFUl9SRVNQT05EXCIsXG4gICAgICBgQ2Fubm90IHNwZWNpZnkgYWRkaXRpb25hbCBoZWFkZXJzIGFmdGVyIHJlc3BvbnNlIGluaXRpYXRlZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9IRUFERVJTX1NFTlQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9IVFRQMl9IRUFERVJTX1NFTlRcIiwgYFJlc3BvbnNlIGhhcyBhbHJlYWR5IGJlZW4gaW5pdGlhdGVkLmApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0hFQURFUl9TSU5HTEVfVkFMVUUgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9IRUFERVJfU0lOR0xFX1ZBTFVFXCIsXG4gICAgICBgSGVhZGVyIGZpZWxkIFwiJHt4fVwiIG11c3Qgb25seSBoYXZlIGEgc2luZ2xlIHZhbHVlYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0lORk9fU1RBVFVTX05PVF9BTExPV0VEIGV4dGVuZHMgTm9kZVJhbmdlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX0lORk9fU1RBVFVTX05PVF9BTExPV0VEXCIsXG4gICAgICBgSW5mb3JtYXRpb25hbCBzdGF0dXMgY29kZXMgY2Fubm90IGJlIHVzZWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfSU5WQUxJRF9DT05ORUNUSU9OX0hFQURFUlMgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9JTlZBTElEX0NPTk5FQ1RJT05fSEVBREVSU1wiLFxuICAgICAgYEhUVFAvMSBDb25uZWN0aW9uIHNwZWNpZmljIGhlYWRlcnMgYXJlIGZvcmJpZGRlbjogXCIke3h9XCJgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfSU5WQUxJRF9IRUFERVJfVkFMVUUgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX0lOVkFMSURfSEVBREVSX1ZBTFVFXCIsXG4gICAgICBgSW52YWxpZCB2YWx1ZSBcIiR7eH1cIiBmb3IgaGVhZGVyIFwiJHt5fVwiYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0lOVkFMSURfSU5GT19TVEFUVVMgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfSU5WQUxJRF9JTkZPX1NUQVRVU1wiLFxuICAgICAgYEludmFsaWQgaW5mb3JtYXRpb25hbCBzdGF0dXMgY29kZTogJHt4fWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9JTlZBTElEX09SSUdJTiBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX0lOVkFMSURfT1JJR0lOXCIsXG4gICAgICBgSFRUUC8yIE9SSUdJTiBmcmFtZXMgcmVxdWlyZSBhIHZhbGlkIG9yaWdpbmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9JTlZBTElEX1BBQ0tFRF9TRVRUSU5HU19MRU5HVEggZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfSU5WQUxJRF9QQUNLRURfU0VUVElOR1NfTEVOR1RIXCIsXG4gICAgICBgUGFja2VkIHNldHRpbmdzIGxlbmd0aCBtdXN0IGJlIGEgbXVsdGlwbGUgb2Ygc2l4YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0lOVkFMSURfUFNFVURPSEVBREVSIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfSU5WQUxJRF9QU0VVRE9IRUFERVJcIixcbiAgICAgIGBcIiR7eH1cIiBpcyBhbiBpbnZhbGlkIHBzZXVkb2hlYWRlciBvciBpcyB1c2VkIGluY29ycmVjdGx5YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0lOVkFMSURfU0VTU0lPTiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0hUVFAyX0lOVkFMSURfU0VTU0lPTlwiLCBgVGhlIHNlc3Npb24gaGFzIGJlZW4gZGVzdHJveWVkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfSU5WQUxJRF9TVFJFQU0gZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9IVFRQMl9JTlZBTElEX1NUUkVBTVwiLCBgVGhlIHN0cmVhbSBoYXMgYmVlbiBkZXN0cm95ZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9NQVhfUEVORElOR19TRVRUSU5HU19BQ0sgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX01BWF9QRU5ESU5HX1NFVFRJTkdTX0FDS1wiLFxuICAgICAgYE1heGltdW0gbnVtYmVyIG9mIHBlbmRpbmcgc2V0dGluZ3MgYWNrbm93bGVkZ2VtZW50c2AsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9ORVNURURfUFVTSCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfTkVTVEVEX1BVU0hcIixcbiAgICAgIGBBIHB1c2ggc3RyZWFtIGNhbm5vdCBpbml0aWF0ZSBhbm90aGVyIHB1c2ggc3RyZWFtLmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9OT19TT0NLRVRfTUFOSVBVTEFUSU9OIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9OT19TT0NLRVRfTUFOSVBVTEFUSU9OXCIsXG4gICAgICBgSFRUUC8yIHNvY2tldHMgc2hvdWxkIG5vdCBiZSBkaXJlY3RseSBtYW5pcHVsYXRlZCAoZS5nLiByZWFkIGFuZCB3cml0dGVuKWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9PUklHSU5fTEVOR1RIIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfT1JJR0lOX0xFTkdUSFwiLFxuICAgICAgYEhUVFAvMiBPUklHSU4gZnJhbWVzIGFyZSBsaW1pdGVkIHRvIDE2MzgyIGJ5dGVzYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX09VVF9PRl9TVFJFQU1TIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9PVVRfT0ZfU1RSRUFNU1wiLFxuICAgICAgYE5vIHN0cmVhbSBJRCBpcyBhdmFpbGFibGUgYmVjYXVzZSBtYXhpbXVtIHN0cmVhbSBJRCBoYXMgYmVlbiByZWFjaGVkYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX1BBWUxPQURfRk9SQklEREVOIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9QQVlMT0FEX0ZPUkJJRERFTlwiLFxuICAgICAgYFJlc3BvbnNlcyB3aXRoICR7eH0gc3RhdHVzIG11c3Qgbm90IGhhdmUgYSBwYXlsb2FkYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX1BJTkdfQ0FOQ0VMIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSFRUUDJfUElOR19DQU5DRUxcIiwgYEhUVFAyIHBpbmcgY2FuY2VsbGVkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfUElOR19MRU5HVEggZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0hUVFAyX1BJTkdfTEVOR1RIXCIsIGBIVFRQMiBwaW5nIHBheWxvYWQgbXVzdCBiZSA4IGJ5dGVzYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfUFNFVURPSEVBREVSX05PVF9BTExPV0VEIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfUFNFVURPSEVBREVSX05PVF9BTExPV0VEXCIsXG4gICAgICBgQ2Fubm90IHNldCBIVFRQLzIgcHNldWRvLWhlYWRlcnNgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfUFVTSF9ESVNBQkxFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0hUVFAyX1BVU0hfRElTQUJMRURcIiwgYEhUVFAvMiBjbGllbnQgaGFzIGRpc2FibGVkIHB1c2ggc3RyZWFtc2ApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX1NFTkRfRklMRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0hUVFAyX1NFTkRfRklMRVwiLCBgRGlyZWN0b3JpZXMgY2Fubm90IGJlIHNlbnRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9TRU5EX0ZJTEVfTk9TRUVLIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9TRU5EX0ZJTEVfTk9TRUVLXCIsXG4gICAgICBgT2Zmc2V0IG9yIGxlbmd0aCBjYW4gb25seSBiZSBzcGVjaWZpZWQgZm9yIHJlZ3VsYXIgZmlsZXNgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfU0VTU0lPTl9FUlJPUiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0hUVFAyX1NFU1NJT05fRVJST1JcIiwgYFNlc3Npb24gY2xvc2VkIHdpdGggZXJyb3IgY29kZSAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfU0VUVElOR1NfQ0FOQ0VMIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSFRUUDJfU0VUVElOR1NfQ0FOQ0VMXCIsIGBIVFRQMiBzZXNzaW9uIHNldHRpbmdzIGNhbmNlbGVkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfU09DS0VUX0JPVU5EIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9TT0NLRVRfQk9VTkRcIixcbiAgICAgIGBUaGUgc29ja2V0IGlzIGFscmVhZHkgYm91bmQgdG8gYW4gSHR0cDJTZXNzaW9uYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX1NPQ0tFVF9VTkJPVU5EIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9TT0NLRVRfVU5CT1VORFwiLFxuICAgICAgYFRoZSBzb2NrZXQgaGFzIGJlZW4gZGlzY29ubmVjdGVkIGZyb20gdGhlIEh0dHAyU2Vzc2lvbmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQMl9TVEFUVVNfMTAxIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQMl9TVEFUVVNfMTAxXCIsXG4gICAgICBgSFRUUCBzdGF0dXMgY29kZSAxMDEgKFN3aXRjaGluZyBQcm90b2NvbHMpIGlzIGZvcmJpZGRlbiBpbiBIVFRQLzJgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfU1RBVFVTX0lOVkFMSUQgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0hUVFAyX1NUQVRVU19JTlZBTElEXCIsIGBJbnZhbGlkIHN0YXR1cyBjb2RlOiAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfU1RSRUFNX0VSUk9SIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSFRUUDJfU1RSRUFNX0VSUk9SXCIsIGBTdHJlYW0gY2xvc2VkIHdpdGggZXJyb3IgY29kZSAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfU1RSRUFNX1NFTEZfREVQRU5ERU5DWSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfU1RSRUFNX1NFTEZfREVQRU5ERU5DWVwiLFxuICAgICAgYEEgc3RyZWFtIGNhbm5vdCBkZXBlbmQgb24gaXRzZWxmYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX1RSQUlMRVJTX0FMUkVBRFlfU0VOVCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfVFJBSUxFUlNfQUxSRUFEWV9TRU5UXCIsXG4gICAgICBgVHJhaWxpbmcgaGVhZGVycyBoYXZlIGFscmVhZHkgYmVlbiBzZW50YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX1RSQUlMRVJTX05PVF9SRUFEWSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUDJfVFJBSUxFUlNfTk9UX1JFQURZXCIsXG4gICAgICBgVHJhaWxpbmcgaGVhZGVycyBjYW5ub3QgYmUgc2VudCB1bnRpbCBhZnRlciB0aGUgd2FudFRyYWlsZXJzIGV2ZW50IGlzIGVtaXR0ZWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUDJfVU5TVVBQT1JURURfUFJPVE9DT0wgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9IVFRQMl9VTlNVUFBPUlRFRF9QUk9UT0NPTFwiLCBgcHJvdG9jb2wgXCIke3h9XCIgaXMgdW5zdXBwb3J0ZWQuYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUF9IRUFERVJTX1NFTlQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFBfSEVBREVSU19TRU5UXCIsXG4gICAgICBgQ2Fubm90ICR7eH0gaGVhZGVycyBhZnRlciB0aGV5IGFyZSBzZW50IHRvIHRoZSBjbGllbnRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSFRUUF9JTlZBTElEX0hFQURFUl9WQUxVRSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcsIHk6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUF9JTlZBTElEX0hFQURFUl9WQUxVRVwiLFxuICAgICAgYEludmFsaWQgdmFsdWUgXCIke3h9XCIgZm9yIGhlYWRlciBcIiR7eX1cImAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQX0lOVkFMSURfU1RBVFVTX0NPREUgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0hUVFBfSU5WQUxJRF9TVEFUVVNfQ09ERVwiLCBgSW52YWxpZCBzdGF0dXMgY29kZTogJHt4fWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFBfU09DS0VUX0VOQ09ESU5HIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9IVFRQX1NPQ0tFVF9FTkNPRElOR1wiLFxuICAgICAgYENoYW5naW5nIHRoZSBzb2NrZXQgZW5jb2RpbmcgaXMgbm90IGFsbG93ZWQgcGVyIFJGQzcyMzAgU2VjdGlvbiAzLmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9IVFRQX1RSQUlMRVJfSU5WQUxJRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSFRUUF9UUkFJTEVSX0lOVkFMSURcIixcbiAgICAgIGBUcmFpbGVycyBhcmUgaW52YWxpZCB3aXRoIHRoaXMgdHJhbnNmZXIgZW5jb2RpbmdgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5DT01QQVRJQkxFX09QVElPTl9QQUlSIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZywgeTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTkNPTVBBVElCTEVfT1BUSU9OX1BBSVJcIixcbiAgICAgIGBPcHRpb24gXCIke3h9XCIgY2Fubm90IGJlIHVzZWQgaW4gY29tYmluYXRpb24gd2l0aCBvcHRpb24gXCIke3l9XCJgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5QVVRfVFlQRV9OT1RfQUxMT1dFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5QVVRfVFlQRV9OT1RfQUxMT1dFRFwiLFxuICAgICAgYC0taW5wdXQtdHlwZSBjYW4gb25seSBiZSB1c2VkIHdpdGggc3RyaW5nIGlucHV0IHZpYSAtLWV2YWwsIC0tcHJpbnQsIG9yIFNURElOYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOU1BFQ1RPUl9BTFJFQURZX0FDVElWQVRFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5TUEVDVE9SX0FMUkVBRFlfQUNUSVZBVEVEXCIsXG4gICAgICBgSW5zcGVjdG9yIGlzIGFscmVhZHkgYWN0aXZhdGVkLiBDbG9zZSBpdCB3aXRoIGluc3BlY3Rvci5jbG9zZSgpIGJlZm9yZSBhY3RpdmF0aW5nIGl0IGFnYWluLmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlNQRUNUT1JfQUxSRUFEWV9DT05ORUNURUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9JTlNQRUNUT1JfQUxSRUFEWV9DT05ORUNURURcIiwgYCR7eH0gaXMgYWxyZWFkeSBjb25uZWN0ZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlNQRUNUT1JfQ0xPU0VEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5TUEVDVE9SX0NMT1NFRFwiLCBgU2Vzc2lvbiB3YXMgY2xvc2VkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5TUEVDVE9SX0NPTU1BTkQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0lOU1BFQ1RPUl9DT01NQU5EXCIsIGBJbnNwZWN0b3IgZXJyb3IgJHt4fTogJHt5fWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOU1BFQ1RPUl9OT1RfQUNUSVZFIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5TUEVDVE9SX05PVF9BQ1RJVkVcIiwgYEluc3BlY3RvciBpcyBub3QgYWN0aXZlYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5TUEVDVE9SX05PVF9BVkFJTEFCTEUgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9JTlNQRUNUT1JfTk9UX0FWQUlMQUJMRVwiLCBgSW5zcGVjdG9yIGlzIG5vdCBhdmFpbGFibGVgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlNQRUNUT1JfTk9UX0NPTk5FQ1RFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0lOU1BFQ1RPUl9OT1RfQ09OTkVDVEVEXCIsIGBTZXNzaW9uIGlzIG5vdCBjb25uZWN0ZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlNQRUNUT1JfTk9UX1dPUktFUiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0lOU1BFQ1RPUl9OT1RfV09SS0VSXCIsIGBDdXJyZW50IHRocmVhZCBpcyBub3QgYSB3b3JrZXJgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX0FTWU5DX0lEIGV4dGVuZHMgTm9kZVJhbmdlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcsIHk6IHN0cmluZyB8IG51bWJlcikge1xuICAgIHN1cGVyKFwiRVJSX0lOVkFMSURfQVNZTkNfSURcIiwgYEludmFsaWQgJHt4fSB2YWx1ZTogJHt5fWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfQlVGRkVSX1NJWkUgZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0lOVkFMSURfQlVGRkVSX1NJWkVcIiwgYEJ1ZmZlciBzaXplIG11c3QgYmUgYSBtdWx0aXBsZSBvZiAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9DQUxMQkFDSyBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihvYmplY3Q6IHVua25vd24pIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVkFMSURfQ0FMTEJBQ0tcIixcbiAgICAgIGBDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24uIFJlY2VpdmVkICR7aW5zcGVjdChvYmplY3QpfWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX0NVUlNPUl9QT1MgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlZBTElEX0NVUlNPUl9QT1NcIixcbiAgICAgIGBDYW5ub3Qgc2V0IGN1cnNvciByb3cgd2l0aG91dCBzZXR0aW5nIGl0cyBjb2x1bW5gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9GRCBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9GRFwiLCBgXCJmZFwiIG11c3QgYmUgYSBwb3NpdGl2ZSBpbnRlZ2VyOiAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9GRF9UWVBFIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0lOVkFMSURfRkRfVFlQRVwiLCBgVW5zdXBwb3J0ZWQgZmQgdHlwZTogJHt4fWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfRklMRV9VUkxfSE9TVCBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVkFMSURfRklMRV9VUkxfSE9TVFwiLFxuICAgICAgYEZpbGUgVVJMIGhvc3QgbXVzdCBiZSBcImxvY2FsaG9zdFwiIG9yIGVtcHR5IG9uICR7eH1gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9GSUxFX1VSTF9QQVRIIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0lOVkFMSURfRklMRV9VUkxfUEFUSFwiLCBgRmlsZSBVUkwgcGF0aCAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9IQU5ETEVfVFlQRSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9JTlZBTElEX0hBTkRMRV9UWVBFXCIsIGBUaGlzIGhhbmRsZSB0eXBlIGNhbm5vdCBiZSBzZW50YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9IVFRQX1RPS0VOIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZywgeTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9IVFRQX1RPS0VOXCIsIGAke3h9IG11c3QgYmUgYSB2YWxpZCBIVFRQIHRva2VuIFtcIiR7eX1cIl1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX0lQX0FERFJFU1MgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9JUF9BRERSRVNTXCIsIGBJbnZhbGlkIElQIGFkZHJlc3M6ICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX09QVF9WQUxVRV9FTkNPRElORyBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVkFMSURfT1BUX1ZBTFVFX0VOQ09ESU5HXCIsXG4gICAgICBgVGhlIHZhbHVlIFwiJHt4fVwiIGlzIGludmFsaWQgZm9yIG9wdGlvbiBcImVuY29kaW5nXCJgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9QRVJGT1JNQU5DRV9NQVJLIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlZBTElEX1BFUkZPUk1BTkNFX01BUktcIixcbiAgICAgIGBUaGUgXCIke3h9XCIgcGVyZm9ybWFuY2UgbWFyayBoYXMgbm90IGJlZW4gc2V0YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfUFJPVE9DT0wgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nLCB5OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVkFMSURfUFJPVE9DT0xcIixcbiAgICAgIGBQcm90b2NvbCBcIiR7eH1cIiBub3Qgc3VwcG9ydGVkLiBFeHBlY3RlZCBcIiR7eX1cImAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX1JFUExfRVZBTF9DT05GSUcgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlZBTElEX1JFUExfRVZBTF9DT05GSUdcIixcbiAgICAgIGBDYW5ub3Qgc3BlY2lmeSBib3RoIFwiYnJlYWtFdmFsT25TaWdpbnRcIiBhbmQgXCJldmFsXCIgZm9yIFJFUExgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9SRVBMX0lOUFVUIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0lOVkFMSURfUkVQTF9JTlBVVFwiLCBgJHt4fWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfU1lOQ19GT1JLX0lOUFVUIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5WQUxJRF9TWU5DX0ZPUktfSU5QVVRcIixcbiAgICAgIGBBc3luY2hyb25vdXMgZm9ya3MgZG8gbm90IHN1cHBvcnQgQnVmZmVyLCBUeXBlZEFycmF5LCBEYXRhVmlldyBvciBzdHJpbmcgaW5wdXQ6ICR7eH1gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9USElTIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX0lOVkFMSURfVEhJU1wiLCBgVmFsdWUgb2YgXCJ0aGlzXCIgbXVzdCBiZSBvZiB0eXBlICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX1RVUExFIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZywgeTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9UVVBMRVwiLCBgJHt4fSBtdXN0IGJlIGFuIGl0ZXJhYmxlICR7eX0gdHVwbGVgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX1VSSSBleHRlbmRzIE5vZGVVUklFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0lOVkFMSURfVVJJXCIsIGBVUkkgbWFsZm9ybWVkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfSVBDX0NIQU5ORUxfQ0xPU0VEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfSVBDX0NIQU5ORUxfQ0xPU0VEXCIsIGBDaGFubmVsIGNsb3NlZGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lQQ19ESVNDT05ORUNURUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9JUENfRElTQ09OTkVDVEVEXCIsIGBJUEMgY2hhbm5lbCBpcyBhbHJlYWR5IGRpc2Nvbm5lY3RlZGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lQQ19PTkVfUElQRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX0lQQ19PTkVfUElQRVwiLCBgQ2hpbGQgcHJvY2VzcyBjYW4gaGF2ZSBvbmx5IG9uZSBJUEMgcGlwZWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0lQQ19TWU5DX0ZPUksgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9JUENfU1lOQ19GT1JLXCIsIGBJUEMgY2Fubm90IGJlIHVzZWQgd2l0aCBzeW5jaHJvbm91cyBmb3Jrc2ApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX01BTklGRVNUX0RFUEVOREVOQ1lfTUlTU0lORyBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZywgeTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9NQU5JRkVTVF9ERVBFTkRFTkNZX01JU1NJTkdcIixcbiAgICAgIGBNYW5pZmVzdCByZXNvdXJjZSAke3h9IGRvZXMgbm90IGxpc3QgJHt5fSBhcyBhIGRlcGVuZGVuY3kgc3BlY2lmaWVyYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX01BTklGRVNUX0lOVEVHUklUWV9NSVNNQVRDSCBleHRlbmRzIE5vZGVTeW50YXhFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfTUFOSUZFU1RfSU5URUdSSVRZX01JU01BVENIXCIsXG4gICAgICBgTWFuaWZlc3QgcmVzb3VyY2UgJHt4fSBoYXMgbXVsdGlwbGUgZW50cmllcyBidXQgaW50ZWdyaXR5IGxpc3RzIGRvIG5vdCBtYXRjaGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9NQU5JRkVTVF9JTlZBTElEX1JFU09VUkNFX0ZJRUxEIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZywgeTogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9NQU5JRkVTVF9JTlZBTElEX1JFU09VUkNFX0ZJRUxEXCIsXG4gICAgICBgTWFuaWZlc3QgcmVzb3VyY2UgJHt4fSBoYXMgaW52YWxpZCBwcm9wZXJ0eSB2YWx1ZSBmb3IgJHt5fWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9NQU5JRkVTVF9URFogZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9NQU5JRkVTVF9URFpcIiwgYE1hbmlmZXN0IGluaXRpYWxpemF0aW9uIGhhcyBub3QgeWV0IHJ1bmApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX01BTklGRVNUX1VOS05PV05fT05FUlJPUiBleHRlbmRzIE5vZGVTeW50YXhFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfTUFOSUZFU1RfVU5LTk9XTl9PTkVSUk9SXCIsXG4gICAgICBgTWFuaWZlc3Qgc3BlY2lmaWVkIHVua25vd24gZXJyb3IgYmVoYXZpb3IgXCIke3h9XCIuYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX01FVEhPRF9OT1RfSU1QTEVNRU5URUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9NRVRIT0RfTk9UX0lNUExFTUVOVEVEXCIsIGBUaGUgJHt4fSBtZXRob2QgaXMgbm90IGltcGxlbWVudGVkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfTUlTU0lOR19BUkdTIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKC4uLmFyZ3M6IChzdHJpbmcgfCBzdHJpbmdbXSlbXSkge1xuICAgIGxldCBtc2cgPSBcIlRoZSBcIjtcblxuICAgIGNvbnN0IGxlbiA9IGFyZ3MubGVuZ3RoO1xuXG4gICAgY29uc3Qgd3JhcCA9IChhOiB1bmtub3duKSA9PiBgXCIke2F9XCJgO1xuXG4gICAgYXJncyA9IGFyZ3MubWFwKChhKSA9PlxuICAgICAgQXJyYXkuaXNBcnJheShhKSA/IGEubWFwKHdyYXApLmpvaW4oXCIgb3IgXCIpIDogd3JhcChhKVxuICAgICk7XG5cbiAgICBzd2l0Y2ggKGxlbikge1xuICAgICAgY2FzZSAxOlxuICAgICAgICBtc2cgKz0gYCR7YXJnc1swXX0gYXJndW1lbnRgO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgbXNnICs9IGAke2FyZ3NbMF19IGFuZCAke2FyZ3NbMV19IGFyZ3VtZW50c2A7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgbXNnICs9IGFyZ3Muc2xpY2UoMCwgbGVuIC0gMSkuam9pbihcIiwgXCIpO1xuICAgICAgICBtc2cgKz0gYCwgYW5kICR7YXJnc1tsZW4gLSAxXX0gYXJndW1lbnRzYDtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgc3VwZXIoXCJFUlJfTUlTU0lOR19BUkdTXCIsIGAke21zZ30gbXVzdCBiZSBzcGVjaWZpZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9NSVNTSU5HX09QVElPTiBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9NSVNTSU5HX09QVElPTlwiLCBgJHt4fSBpcyByZXF1aXJlZGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX01VTFRJUExFX0NBTExCQUNLIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfTVVMVElQTEVfQ0FMTEJBQ0tcIiwgYENhbGxiYWNrIGNhbGxlZCBtdWx0aXBsZSB0aW1lc2ApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX05BUElfQ09OU19GVU5DVElPTiBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9OQVBJX0NPTlNfRlVOQ1RJT05cIiwgYENvbnN0cnVjdG9yIG11c3QgYmUgYSBmdW5jdGlvbmApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX05BUElfSU5WQUxJRF9EQVRBVklFV19BUkdTIGV4dGVuZHMgTm9kZVJhbmdlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX05BUElfSU5WQUxJRF9EQVRBVklFV19BUkdTXCIsXG4gICAgICBgYnl0ZV9vZmZzZXQgKyBieXRlX2xlbmd0aCBzaG91bGQgYmUgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIHRoZSBzaXplIGluIGJ5dGVzIG9mIHRoZSBhcnJheSBwYXNzZWQgaW5gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfTkFQSV9JTlZBTElEX1RZUEVEQVJSQVlfQUxJR05NRU5UIGV4dGVuZHMgTm9kZVJhbmdlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcsIHk6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfTkFQSV9JTlZBTElEX1RZUEVEQVJSQVlfQUxJR05NRU5UXCIsXG4gICAgICBgc3RhcnQgb2Zmc2V0IG9mICR7eH0gc2hvdWxkIGJlIGEgbXVsdGlwbGUgb2YgJHt5fWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9OQVBJX0lOVkFMSURfVFlQRURBUlJBWV9MRU5HVEggZXh0ZW5kcyBOb2RlUmFuZ2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX05BUElfSU5WQUxJRF9UWVBFREFSUkFZX0xFTkdUSFwiLCBgSW52YWxpZCB0eXBlZCBhcnJheSBsZW5ndGhgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9OT19DUllQVE8gZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX05PX0NSWVBUT1wiLFxuICAgICAgYE5vZGUuanMgaXMgbm90IGNvbXBpbGVkIHdpdGggT3BlblNTTCBjcnlwdG8gc3VwcG9ydGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9OT19JQ1UgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9OT19JQ1VcIixcbiAgICAgIGAke3h9IGlzIG5vdCBzdXBwb3J0ZWQgb24gTm9kZS5qcyBjb21waWxlZCB3aXRob3V0IElDVWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9RVUlDQ0xJRU5UU0VTU0lPTl9GQUlMRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1FVSUNDTElFTlRTRVNTSU9OX0ZBSUxFRFwiLFxuICAgICAgYEZhaWxlZCB0byBjcmVhdGUgYSBuZXcgUXVpY0NsaWVudFNlc3Npb246ICR7eH1gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfUVVJQ0NMSUVOVFNFU1NJT05fRkFJTEVEX1NFVFNPQ0tFVCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfUVVJQ0NMSUVOVFNFU1NJT05fRkFJTEVEX1NFVFNPQ0tFVFwiLFxuICAgICAgYEZhaWxlZCB0byBzZXQgdGhlIFF1aWNTb2NrZXRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfUVVJQ1NFU1NJT05fREVTVFJPWUVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9RVUlDU0VTU0lPTl9ERVNUUk9ZRURcIixcbiAgICAgIGBDYW5ub3QgY2FsbCAke3h9IGFmdGVyIGEgUXVpY1Nlc3Npb24gaGFzIGJlZW4gZGVzdHJveWVkYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1FVSUNTRVNTSU9OX0lOVkFMSURfRENJRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX1FVSUNTRVNTSU9OX0lOVkFMSURfRENJRFwiLCBgSW52YWxpZCBEQ0lEIHZhbHVlOiAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfUVVJQ1NFU1NJT05fVVBEQVRFS0VZIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfUVVJQ1NFU1NJT05fVVBEQVRFS0VZXCIsIGBVbmFibGUgdG8gdXBkYXRlIFF1aWNTZXNzaW9uIGtleXNgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9RVUlDU09DS0VUX0RFU1RST1lFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfUVVJQ1NPQ0tFVF9ERVNUUk9ZRURcIixcbiAgICAgIGBDYW5ub3QgY2FsbCAke3h9IGFmdGVyIGEgUXVpY1NvY2tldCBoYXMgYmVlbiBkZXN0cm95ZWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfUVVJQ1NPQ0tFVF9JTlZBTElEX1NUQVRFTEVTU19SRVNFVF9TRUNSRVRfTEVOR1RIXG4gIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9RVUlDU09DS0VUX0lOVkFMSURfU1RBVEVMRVNTX1JFU0VUX1NFQ1JFVF9MRU5HVEhcIixcbiAgICAgIGBUaGUgc3RhdGVSZXNldFRva2VuIG11c3QgYmUgZXhhY3RseSAxNi1ieXRlcyBpbiBsZW5ndGhgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfUVVJQ1NPQ0tFVF9MSVNURU5JTkcgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9RVUlDU09DS0VUX0xJU1RFTklOR1wiLCBgVGhpcyBRdWljU29ja2V0IGlzIGFscmVhZHkgbGlzdGVuaW5nYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfUVVJQ1NPQ0tFVF9VTkJPVU5EIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9RVUlDU09DS0VUX1VOQk9VTkRcIixcbiAgICAgIGBDYW5ub3QgY2FsbCAke3h9IGJlZm9yZSBhIFF1aWNTb2NrZXQgaGFzIGJlZW4gYm91bmRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfUVVJQ1NUUkVBTV9ERVNUUk9ZRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1FVSUNTVFJFQU1fREVTVFJPWUVEXCIsXG4gICAgICBgQ2Fubm90IGNhbGwgJHt4fSBhZnRlciBhIFF1aWNTdHJlYW0gaGFzIGJlZW4gZGVzdHJveWVkYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1FVSUNTVFJFQU1fSU5WQUxJRF9QVVNIIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9RVUlDU1RSRUFNX0lOVkFMSURfUFVTSFwiLFxuICAgICAgYFB1c2ggc3RyZWFtcyBhcmUgb25seSBzdXBwb3J0ZWQgb24gY2xpZW50LWluaXRpYXRlZCwgYmlkaXJlY3Rpb25hbCBzdHJlYW1zYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1FVSUNTVFJFQU1fT1BFTl9GQUlMRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9RVUlDU1RSRUFNX09QRU5fRkFJTEVEXCIsIGBPcGVuaW5nIGEgbmV3IFF1aWNTdHJlYW0gZmFpbGVkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfUVVJQ1NUUkVBTV9VTlNVUFBPUlRFRF9QVVNIIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9RVUlDU1RSRUFNX1VOU1VQUE9SVEVEX1BVU0hcIixcbiAgICAgIGBQdXNoIHN0cmVhbXMgYXJlIG5vdCBzdXBwb3J0ZWQgb24gdGhpcyBRdWljU2Vzc2lvbmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9RVUlDX1RMUzEzX1JFUVVJUkVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfUVVJQ19UTFMxM19SRVFVSVJFRFwiLCBgUVVJQyByZXF1aXJlcyBUTFMgdmVyc2lvbiAxLjNgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TQ1JJUFRfRVhFQ1VUSU9OX0lOVEVSUlVQVEVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9TQ1JJUFRfRVhFQ1VUSU9OX0lOVEVSUlVQVEVEXCIsXG4gICAgICBcIlNjcmlwdCBleGVjdXRpb24gd2FzIGludGVycnVwdGVkIGJ5IGBTSUdJTlRgXCIsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TRVJWRVJfQUxSRUFEWV9MSVNURU4gZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1NFUlZFUl9BTFJFQURZX0xJU1RFTlwiLFxuICAgICAgYExpc3RlbiBtZXRob2QgaGFzIGJlZW4gY2FsbGVkIG1vcmUgdGhhbiBvbmNlIHdpdGhvdXQgY2xvc2luZy5gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfU0VSVkVSX05PVF9SVU5OSU5HIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfU0VSVkVSX05PVF9SVU5OSU5HXCIsIGBTZXJ2ZXIgaXMgbm90IHJ1bm5pbmcuYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfU09DS0VUX0FMUkVBRFlfQk9VTkQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9TT0NLRVRfQUxSRUFEWV9CT1VORFwiLCBgU29ja2V0IGlzIGFscmVhZHkgYm91bmRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TT0NLRVRfQkFEX0JVRkZFUl9TSVpFIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfU09DS0VUX0JBRF9CVUZGRVJfU0laRVwiLFxuICAgICAgYEJ1ZmZlciBzaXplIG11c3QgYmUgYSBwb3NpdGl2ZSBpbnRlZ2VyYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NPQ0tFVF9CQURfUE9SVCBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBwb3J0OiB1bmtub3duLCBhbGxvd1plcm8gPSB0cnVlKSB7XG4gICAgYXNzZXJ0KFxuICAgICAgdHlwZW9mIGFsbG93WmVybyA9PT0gXCJib29sZWFuXCIsXG4gICAgICBcIlRoZSAnYWxsb3daZXJvJyBhcmd1bWVudCBtdXN0IGJlIG9mIHR5cGUgYm9vbGVhbi5cIixcbiAgICApO1xuXG4gICAgY29uc3Qgb3BlcmF0b3IgPSBhbGxvd1plcm8gPyBcIj49XCIgOiBcIj5cIjtcblxuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfU09DS0VUX0JBRF9QT1JUXCIsXG4gICAgICBgJHtuYW1lfSBzaG91bGQgYmUgJHtvcGVyYXRvcn0gMCBhbmQgPCA2NTUzNi4gUmVjZWl2ZWQgJHtwb3J0fS5gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfU09DS0VUX0JBRF9UWVBFIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfU09DS0VUX0JBRF9UWVBFXCIsXG4gICAgICBgQmFkIHNvY2tldCB0eXBlIHNwZWNpZmllZC4gVmFsaWQgdHlwZXMgYXJlOiB1ZHA0LCB1ZHA2YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NPQ0tFVF9CVUZGRVJfU0laRSBleHRlbmRzIE5vZGVTeXN0ZW1FcnJvciB7XG4gIGNvbnN0cnVjdG9yKGN0eDogTm9kZVN5c3RlbUVycm9yQ3R4KSB7XG4gICAgc3VwZXIoXCJFUlJfU09DS0VUX0JVRkZFUl9TSVpFXCIsIGN0eCwgXCJDb3VsZCBub3QgZ2V0IG9yIHNldCBidWZmZXIgc2l6ZVwiKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TT0NLRVRfQ0xPU0VEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfU09DS0VUX0NMT1NFRFwiLCBgU29ja2V0IGlzIGNsb3NlZGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NPQ0tFVF9ER1JBTV9JU19DT05ORUNURUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9TT0NLRVRfREdSQU1fSVNfQ09OTkVDVEVEXCIsIGBBbHJlYWR5IGNvbm5lY3RlZGApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NPQ0tFVF9ER1JBTV9OT1RfQ09OTkVDVEVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfU09DS0VUX0RHUkFNX05PVF9DT05ORUNURURcIiwgYE5vdCBjb25uZWN0ZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TT0NLRVRfREdSQU1fTk9UX1JVTk5JTkcgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9TT0NLRVRfREdSQU1fTk9UX1JVTk5JTkdcIiwgYE5vdCBydW5uaW5nYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfU1JJX1BBUlNFIGV4dGVuZHMgTm9kZVN5bnRheEVycm9yIHtcbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBjaGFyOiBzdHJpbmcsIHBvc2l0aW9uOiBudW1iZXIpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1NSSV9QQVJTRVwiLFxuICAgICAgYFN1YnJlc291cmNlIEludGVncml0eSBzdHJpbmcgJHtuYW1lfSBoYWQgYW4gdW5leHBlY3RlZCAke2NoYXJ9IGF0IHBvc2l0aW9uICR7cG9zaXRpb259YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NUUkVBTV9BTFJFQURZX0ZJTklTSEVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9TVFJFQU1fQUxSRUFEWV9GSU5JU0hFRFwiLFxuICAgICAgYENhbm5vdCBjYWxsICR7eH0gYWZ0ZXIgYSBzdHJlYW0gd2FzIGZpbmlzaGVkYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NUUkVBTV9DQU5OT1RfUElQRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1NUUkVBTV9DQU5OT1RfUElQRVwiLCBgQ2Fubm90IHBpcGUsIG5vdCByZWFkYWJsZWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NUUkVBTV9ERVNUUk9ZRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1NUUkVBTV9ERVNUUk9ZRURcIixcbiAgICAgIGBDYW5ub3QgY2FsbCAke3h9IGFmdGVyIGEgc3RyZWFtIHdhcyBkZXN0cm95ZWRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfU1RSRUFNX05VTExfVkFMVUVTIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1NUUkVBTV9OVUxMX1ZBTFVFU1wiLCBgTWF5IG5vdCB3cml0ZSBudWxsIHZhbHVlcyB0byBzdHJlYW1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TVFJFQU1fUFJFTUFUVVJFX0NMT1NFIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfU1RSRUFNX1BSRU1BVFVSRV9DTE9TRVwiLCBgUHJlbWF0dXJlIGNsb3NlYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfU1RSRUFNX1BVU0hfQUZURVJfRU9GIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfU1RSRUFNX1BVU0hfQUZURVJfRU9GXCIsIGBzdHJlYW0ucHVzaCgpIGFmdGVyIEVPRmApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NUUkVBTV9VTlNISUZUX0FGVEVSX0VORF9FVkVOVCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfU1RSRUFNX1VOU0hJRlRfQUZURVJfRU5EX0VWRU5UXCIsXG4gICAgICBgc3RyZWFtLnVuc2hpZnQoKSBhZnRlciBlbmQgZXZlbnRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfU1RSRUFNX1dSQVAgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1NUUkVBTV9XUkFQXCIsXG4gICAgICBgU3RyZWFtIGhhcyBTdHJpbmdEZWNvZGVyIHNldCBvciBpcyBpbiBvYmplY3RNb2RlYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1NUUkVBTV9XUklURV9BRlRFUl9FTkQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9TVFJFQU1fV1JJVEVfQUZURVJfRU5EXCIsIGB3cml0ZSBhZnRlciBlbmRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9TWU5USEVUSUMgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9TWU5USEVUSUNcIiwgYEphdmFTY3JpcHQgQ2FsbHN0YWNrYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVExTX0NFUlRfQUxUTkFNRV9JTlZBTElEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgcmVhc29uOiBzdHJpbmc7XG4gIGhvc3Q6IHN0cmluZztcbiAgY2VydDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHJlYXNvbjogc3RyaW5nLCBob3N0OiBzdHJpbmcsIGNlcnQ6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVExTX0NFUlRfQUxUTkFNRV9JTlZBTElEXCIsXG4gICAgICBgSG9zdG5hbWUvSVAgZG9lcyBub3QgbWF0Y2ggY2VydGlmaWNhdGUncyBhbHRuYW1lczogJHtyZWFzb259YCxcbiAgICApO1xuICAgIHRoaXMucmVhc29uID0gcmVhc29uO1xuICAgIHRoaXMuaG9zdCA9IGhvc3Q7XG4gICAgdGhpcy5jZXJ0ID0gY2VydDtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9UTFNfREhfUEFSQU1fU0laRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX1RMU19ESF9QQVJBTV9TSVpFXCIsIGBESCBwYXJhbWV0ZXIgc2l6ZSAke3h9IGlzIGxlc3MgdGhhbiAyMDQ4YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVExTX0hBTkRTSEFLRV9USU1FT1VUIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfVExTX0hBTkRTSEFLRV9USU1FT1VUXCIsIGBUTFMgaGFuZHNoYWtlIHRpbWVvdXRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9UTFNfSU5WQUxJRF9DT05URVhUIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX1RMU19JTlZBTElEX0NPTlRFWFRcIiwgYCR7eH0gbXVzdCBiZSBhIFNlY3VyZUNvbnRleHRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9UTFNfSU5WQUxJRF9TVEFURSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVExTX0lOVkFMSURfU1RBVEVcIixcbiAgICAgIGBUTFMgc29ja2V0IGNvbm5lY3Rpb24gbXVzdCBiZSBzZWN1cmVseSBlc3RhYmxpc2hlZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9UTFNfSU5WQUxJRF9QUk9UT0NPTF9WRVJTSU9OIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHByb3RvY29sOiBzdHJpbmcsIHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVExTX0lOVkFMSURfUFJPVE9DT0xfVkVSU0lPTlwiLFxuICAgICAgYCR7cHJvdG9jb2x9IGlzIG5vdCBhIHZhbGlkICR7eH0gVExTIHByb3RvY29sIHZlcnNpb25gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVExTX1BST1RPQ09MX1ZFUlNJT05fQ09ORkxJQ1QgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IocHJldlByb3RvY29sOiBzdHJpbmcsIHByb3RvY29sOiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1RMU19QUk9UT0NPTF9WRVJTSU9OX0NPTkZMSUNUXCIsXG4gICAgICBgVExTIHByb3RvY29sIHZlcnNpb24gJHtwcmV2UHJvdG9jb2x9IGNvbmZsaWN0cyB3aXRoIHNlY3VyZVByb3RvY29sICR7cHJvdG9jb2x9YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1RMU19SRU5FR09USUFUSU9OX0RJU0FCTEVEIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9UTFNfUkVORUdPVElBVElPTl9ESVNBQkxFRFwiLFxuICAgICAgYFRMUyBzZXNzaW9uIHJlbmVnb3RpYXRpb24gZGlzYWJsZWQgZm9yIHRoaXMgc29ja2V0YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1RMU19SRVFVSVJFRF9TRVJWRVJfTkFNRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVExTX1JFUVVJUkVEX1NFUlZFUl9OQU1FXCIsXG4gICAgICBgXCJzZXJ2ZXJuYW1lXCIgaXMgcmVxdWlyZWQgcGFyYW1ldGVyIGZvciBTZXJ2ZXIuYWRkQ29udGV4dGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9UTFNfU0VTU0lPTl9BVFRBQ0sgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1RMU19TRVNTSU9OX0FUVEFDS1wiLFxuICAgICAgYFRMUyBzZXNzaW9uIHJlbmVnb3RpYXRpb24gYXR0YWNrIGRldGVjdGVkYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1RMU19TTklfRlJPTV9TRVJWRVIgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1RMU19TTklfRlJPTV9TRVJWRVJcIixcbiAgICAgIGBDYW5ub3QgaXNzdWUgU05JIGZyb20gYSBUTFMgc2VydmVyLXNpZGUgc29ja2V0YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1RSQUNFX0VWRU5UU19DQVRFR09SWV9SRVFVSVJFRCBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1RSQUNFX0VWRU5UU19DQVRFR09SWV9SRVFVSVJFRFwiLFxuICAgICAgYEF0IGxlYXN0IG9uZSBjYXRlZ29yeSBpcyByZXF1aXJlZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9UUkFDRV9FVkVOVFNfVU5BVkFJTEFCTEUgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcIkVSUl9UUkFDRV9FVkVOVFNfVU5BVkFJTEFCTEVcIiwgYFRyYWNlIGV2ZW50cyBhcmUgdW5hdmFpbGFibGVgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9VTkFWQUlMQUJMRV9EVVJJTkdfRVhJVCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVU5BVkFJTEFCTEVfRFVSSU5HX0VYSVRcIixcbiAgICAgIGBDYW5ub3QgY2FsbCBmdW5jdGlvbiBpbiBwcm9jZXNzIGV4aXQgaGFuZGxlcmAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9VTkNBVUdIVF9FWENFUFRJT05fQ0FQVFVSRV9BTFJFQURZX1NFVCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVU5DQVVHSFRfRVhDRVBUSU9OX0NBUFRVUkVfQUxSRUFEWV9TRVRcIixcbiAgICAgIFwiYHByb2Nlc3Muc2V0dXBVbmNhdWdodEV4Y2VwdGlvbkNhcHR1cmUoKWAgd2FzIGNhbGxlZCB3aGlsZSBhIGNhcHR1cmUgY2FsbGJhY2sgd2FzIGFscmVhZHkgYWN0aXZlXCIsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9VTkVTQ0FQRURfQ0hBUkFDVEVSUyBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9VTkVTQ0FQRURfQ0hBUkFDVEVSU1wiLCBgJHt4fSBjb250YWlucyB1bmVzY2FwZWQgY2hhcmFjdGVyc2ApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1VOSEFORExFRF9FUlJPUiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX1VOSEFORExFRF9FUlJPUlwiLCBgVW5oYW5kbGVkIGVycm9yLiAoJHt4fSlgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9VTktOT1dOX0JVSUxUSU5fTU9EVUxFIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoeDogc3RyaW5nKSB7XG4gICAgc3VwZXIoXCJFUlJfVU5LTk9XTl9CVUlMVElOX01PRFVMRVwiLCBgTm8gc3VjaCBidWlsdC1pbiBtb2R1bGU6ICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9VTktOT1dOX0NSRURFTlRJQUwgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcsIHk6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX1VOS05PV05fQ1JFREVOVElBTFwiLCBgJHt4fSBpZGVudGlmaWVyIGRvZXMgbm90IGV4aXN0OiAke3l9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVU5LTk9XTl9FTkNPRElORyBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9VTktOT1dOX0VOQ09ESU5HXCIsIGBVbmtub3duIGVuY29kaW5nOiAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVU5LTk9XTl9GSUxFX0VYVEVOU0lPTiBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcsIHk6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVU5LTk9XTl9GSUxFX0VYVEVOU0lPTlwiLFxuICAgICAgYFVua25vd24gZmlsZSBleHRlbnNpb24gXCIke3h9XCIgZm9yICR7eX1gLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVU5LTk9XTl9NT0RVTEVfRk9STUFUIGV4dGVuZHMgTm9kZVJhbmdlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9VTktOT1dOX01PRFVMRV9GT1JNQVRcIiwgYFVua25vd24gbW9kdWxlIGZvcm1hdDogJHt4fWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1VOS05PV05fU0lHTkFMIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFwiRVJSX1VOS05PV05fU0lHTkFMXCIsIGBVbmtub3duIHNpZ25hbDogJHt4fWApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1VOU1VQUE9SVEVEX0RJUl9JTVBPUlQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcsIHk6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVU5TVVBQT1JURURfRElSX0lNUE9SVFwiLFxuICAgICAgYERpcmVjdG9yeSBpbXBvcnQgJyR7eH0nIGlzIG5vdCBzdXBwb3J0ZWQgcmVzb2x2aW5nIEVTIG1vZHVsZXMsIGltcG9ydGVkIGZyb20gJHt5fWAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9VTlNVUFBPUlRFRF9FU01fVVJMX1NDSEVNRSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVU5TVVBQT1JURURfRVNNX1VSTF9TQ0hFTUVcIixcbiAgICAgIGBPbmx5IGZpbGUgYW5kIGRhdGEgVVJMcyBhcmUgc3VwcG9ydGVkIGJ5IHRoZSBkZWZhdWx0IEVTTSBsb2FkZXJgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVjhCUkVBS0lURVJBVE9SIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9WOEJSRUFLSVRFUkFUT1JcIixcbiAgICAgIGBGdWxsIElDVSBkYXRhIG5vdCBpbnN0YWxsZWQuIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvd2lraS9JbnRsYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1ZBTElEX1BFUkZPUk1BTkNFX0VOVFJZX1RZUEUgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1ZBTElEX1BFUkZPUk1BTkNFX0VOVFJZX1RZUEVcIixcbiAgICAgIGBBdCBsZWFzdCBvbmUgdmFsaWQgcGVyZm9ybWFuY2UgZW50cnkgdHlwZSBpcyByZXF1aXJlZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9WTV9EWU5BTUlDX0lNUE9SVF9DQUxMQkFDS19NSVNTSU5HIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVk1fRFlOQU1JQ19JTVBPUlRfQ0FMTEJBQ0tfTUlTU0lOR1wiLFxuICAgICAgYEEgZHluYW1pYyBpbXBvcnQgY2FsbGJhY2sgd2FzIG5vdCBzcGVjaWZpZWQuYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1ZNX01PRFVMRV9BTFJFQURZX0xJTktFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1ZNX01PRFVMRV9BTFJFQURZX0xJTktFRFwiLCBgTW9kdWxlIGhhcyBhbHJlYWR5IGJlZW4gbGlua2VkYCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVk1fTU9EVUxFX0NBTk5PVF9DUkVBVEVfQ0FDSEVEX0RBVEEgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1ZNX01PRFVMRV9DQU5OT1RfQ1JFQVRFX0NBQ0hFRF9EQVRBXCIsXG4gICAgICBgQ2FjaGVkIGRhdGEgY2Fubm90IGJlIGNyZWF0ZWQgZm9yIGEgbW9kdWxlIHdoaWNoIGhhcyBiZWVuIGV2YWx1YXRlZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9WTV9NT0RVTEVfRElGRkVSRU5UX0NPTlRFWFQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1ZNX01PRFVMRV9ESUZGRVJFTlRfQ09OVEVYVFwiLFxuICAgICAgYExpbmtlZCBtb2R1bGVzIG11c3QgdXNlIHRoZSBzYW1lIGNvbnRleHRgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfVk1fTU9EVUxFX0xJTktJTkdfRVJST1JFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfVk1fTU9EVUxFX0xJTktJTkdfRVJST1JFRFwiLFxuICAgICAgYExpbmtpbmcgaGFzIGFscmVhZHkgZmFpbGVkIGZvciB0aGUgcHJvdmlkZWQgbW9kdWxlYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1ZNX01PRFVMRV9OT1RfTU9EVUxFIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9WTV9NT0RVTEVfTk9UX01PRFVMRVwiLFxuICAgICAgYFByb3ZpZGVkIG1vZHVsZSBpcyBub3QgYW4gaW5zdGFuY2Ugb2YgTW9kdWxlYCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1ZNX01PRFVMRV9TVEFUVVMgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9WTV9NT0RVTEVfU1RBVFVTXCIsIGBNb2R1bGUgc3RhdHVzICR7eH1gKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9XQVNJX0FMUkVBRFlfU1RBUlRFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1dBU0lfQUxSRUFEWV9TVEFSVEVEXCIsIGBXQVNJIGluc3RhbmNlIGhhcyBhbHJlYWR5IHN0YXJ0ZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9XT1JLRVJfSU5JVF9GQUlMRUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9XT1JLRVJfSU5JVF9GQUlMRURcIiwgYFdvcmtlciBpbml0aWFsaXphdGlvbiBmYWlsdXJlOiAke3h9YCk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfV09SS0VSX05PVF9SVU5OSU5HIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFUlJfV09SS0VSX05PVF9SVU5OSU5HXCIsIGBXb3JrZXIgaW5zdGFuY2Ugbm90IHJ1bm5pbmdgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9XT1JLRVJfT1VUX09GX01FTU9SWSBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfV09SS0VSX09VVF9PRl9NRU1PUllcIixcbiAgICAgIGBXb3JrZXIgdGVybWluYXRlZCBkdWUgdG8gcmVhY2hpbmcgbWVtb3J5IGxpbWl0OiAke3h9YCxcbiAgICApO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX1dPUktFUl9VTlNFUklBTElaQUJMRV9FUlJPUiBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfV09SS0VSX1VOU0VSSUFMSVpBQkxFX0VSUk9SXCIsXG4gICAgICBgU2VyaWFsaXppbmcgYW4gdW5jYXVnaHQgZXhjZXB0aW9uIGZhaWxlZGAsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9XT1JLRVJfVU5TVVBQT1JURURfRVhURU5TSU9OIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHg6IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfV09SS0VSX1VOU1VQUE9SVEVEX0VYVEVOU0lPTlwiLFxuICAgICAgYFRoZSB3b3JrZXIgc2NyaXB0IGV4dGVuc2lvbiBtdXN0IGJlIFwiLmpzXCIsIFwiLm1qc1wiLCBvciBcIi5janNcIi4gUmVjZWl2ZWQgXCIke3h9XCJgLFxuICAgICk7XG4gIH1cbn1cbmV4cG9ydCBjbGFzcyBFUlJfV09SS0VSX1VOU1VQUE9SVEVEX09QRVJBVElPTiBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcih4OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX1dPUktFUl9VTlNVUFBPUlRFRF9PUEVSQVRJT05cIixcbiAgICAgIGAke3h9IGlzIG5vdCBzdXBwb3J0ZWQgaW4gd29ya2Vyc2AsXG4gICAgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9aTElCX0lOSVRJQUxJWkFUSU9OX0ZBSUxFRCBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKFwiRVJSX1pMSUJfSU5JVElBTElaQVRJT05fRkFJTEVEXCIsIGBJbml0aWFsaXphdGlvbiBmYWlsZWRgKTtcbiAgfVxufVxuZXhwb3J0IGNsYXNzIEVSUl9GQUxTWV9WQUxVRV9SRUpFQ1RJT04gZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICByZWFzb246IHN0cmluZztcbiAgY29uc3RydWN0b3IocmVhc29uOiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9GQUxTWV9WQUxVRV9SRUpFQ1RJT05cIiwgXCJQcm9taXNlIHdhcyByZWplY3RlZCB3aXRoIGZhbHN5IHZhbHVlXCIpO1xuICAgIHRoaXMucmVhc29uID0gcmVhc29uO1xuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX0lOVkFMSURfU0VUVElOR19WQUxVRSBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgYWN0dWFsOiB1bmtub3duO1xuICBtaW4/OiBudW1iZXI7XG4gIG1heD86IG51bWJlcjtcblxuICBjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIGFjdHVhbDogdW5rbm93biwgbWluPzogbnVtYmVyLCBtYXg/OiBudW1iZXIpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX0lOVkFMSURfU0VUVElOR19WQUxVRVwiLFxuICAgICAgYEludmFsaWQgdmFsdWUgZm9yIHNldHRpbmcgXCIke25hbWV9XCI6ICR7YWN0dWFsfWAsXG4gICAgKTtcbiAgICB0aGlzLmFjdHVhbCA9IGFjdHVhbDtcbiAgICBpZiAobWluICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHRoaXMubWluID0gbWluO1xuICAgICAgdGhpcy5tYXggPSBtYXg7XG4gICAgfVxuICB9XG59XG5leHBvcnQgY2xhc3MgRVJSX0hUVFAyX1NUUkVBTV9DQU5DRUwgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBvdmVycmlkZSBjYXVzZT86IEVycm9yO1xuICBjb25zdHJ1Y3RvcihlcnJvcjogRXJyb3IpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0hUVFAyX1NUUkVBTV9DQU5DRUxcIixcbiAgICAgIHR5cGVvZiBlcnJvci5tZXNzYWdlID09PSBcInN0cmluZ1wiXG4gICAgICAgID8gYFRoZSBwZW5kaW5nIHN0cmVhbSBoYXMgYmVlbiBjYW5jZWxlZCAoY2F1c2VkIGJ5OiAke2Vycm9yLm1lc3NhZ2V9KWBcbiAgICAgICAgOiBcIlRoZSBwZW5kaW5nIHN0cmVhbSBoYXMgYmVlbiBjYW5jZWxlZFwiLFxuICAgICk7XG4gICAgaWYgKGVycm9yKSB7XG4gICAgICB0aGlzLmNhdXNlID0gZXJyb3I7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9BRERSRVNTX0ZBTUlMWSBleHRlbmRzIE5vZGVSYW5nZUVycm9yIHtcbiAgaG9zdDogc3RyaW5nO1xuICBwb3J0OiBudW1iZXI7XG4gIGNvbnN0cnVjdG9yKGFkZHJlc3NUeXBlOiBzdHJpbmcsIGhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlZBTElEX0FERFJFU1NfRkFNSUxZXCIsXG4gICAgICBgSW52YWxpZCBhZGRyZXNzIGZhbWlseTogJHthZGRyZXNzVHlwZX0gJHtob3N0fToke3BvcnR9YCxcbiAgICApO1xuICAgIHRoaXMuaG9zdCA9IGhvc3Q7XG4gICAgdGhpcy5wb3J0ID0gcG9ydDtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfQ0hBUiBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIGZpZWxkPzogc3RyaW5nKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlZBTElEX0NIQVJcIixcbiAgICAgIGZpZWxkXG4gICAgICAgID8gYEludmFsaWQgY2hhcmFjdGVyIGluICR7bmFtZX1gXG4gICAgICAgIDogYEludmFsaWQgY2hhcmFjdGVyIGluICR7bmFtZX0gW1wiJHtmaWVsZH1cIl1gLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX09QVF9WQUxVRSBleHRlbmRzIE5vZGVUeXBlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9JTlZBTElEX09QVF9WQUxVRVwiLFxuICAgICAgYFRoZSB2YWx1ZSBcIiR7dmFsdWV9XCIgaXMgaW52YWxpZCBmb3Igb3B0aW9uIFwiJHtuYW1lfVwiYCxcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9SRVRVUk5fUFJPUEVSVFkgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoaW5wdXQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCBwcm9wOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIHtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVkFMSURfUkVUVVJOX1BST1BFUlRZXCIsXG4gICAgICBgRXhwZWN0ZWQgYSB2YWxpZCAke2lucHV0fSB0byBiZSByZXR1cm5lZCBmb3IgdGhlIFwiJHtwcm9wfVwiIGZyb20gdGhlIFwiJHtuYW1lfVwiIGZ1bmN0aW9uIGJ1dCBnb3QgJHt2YWx1ZX0uYCxcbiAgICApO1xuICB9XG59XG5cbi8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG5mdW5jdGlvbiBidWlsZFJldHVyblByb3BlcnR5VHlwZSh2YWx1ZTogYW55KSB7XG4gIGlmICh2YWx1ZSAmJiB2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5uYW1lKSB7XG4gICAgcmV0dXJuIGBpbnN0YW5jZSBvZiAke3ZhbHVlLmNvbnN0cnVjdG9yLm5hbWV9YDtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYHR5cGUgJHt0eXBlb2YgdmFsdWV9YDtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfUkVUVVJOX1BST1BFUlRZX1ZBTFVFIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcsIG5hbWU6IHN0cmluZywgcHJvcDogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5WQUxJRF9SRVRVUk5fUFJPUEVSVFlfVkFMVUVcIixcbiAgICAgIGBFeHBlY3RlZCAke2lucHV0fSB0byBiZSByZXR1cm5lZCBmb3IgdGhlIFwiJHtwcm9wfVwiIGZyb20gdGhlIFwiJHtuYW1lfVwiIGZ1bmN0aW9uIGJ1dCBnb3QgJHtcbiAgICAgICAgYnVpbGRSZXR1cm5Qcm9wZXJ0eVR5cGUoXG4gICAgICAgICAgdmFsdWUsXG4gICAgICAgIClcbiAgICAgIH0uYCxcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9SRVRVUk5fVkFMVUUgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoaW5wdXQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5WQUxJRF9SRVRVUk5fVkFMVUVcIixcbiAgICAgIGBFeHBlY3RlZCAke2lucHV0fSB0byBiZSByZXR1cm5lZCBmcm9tIHRoZSBcIiR7bmFtZX1cIiBmdW5jdGlvbiBidXQgZ290ICR7XG4gICAgICAgIGJ1aWxkUmV0dXJuUHJvcGVydHlUeXBlKFxuICAgICAgICAgIHZhbHVlLFxuICAgICAgICApXG4gICAgICB9LmAsXG4gICAgKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX0lOVkFMSURfVVJMIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGlucHV0OiBzdHJpbmc7XG4gIGNvbnN0cnVjdG9yKGlucHV0OiBzdHJpbmcpIHtcbiAgICBzdXBlcihcIkVSUl9JTlZBTElEX1VSTFwiLCBgSW52YWxpZCBVUkw6ICR7aW5wdXR9YCk7XG4gICAgdGhpcy5pbnB1dCA9IGlucHV0O1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9VUkxfU0NIRU1FIGV4dGVuZHMgTm9kZVR5cGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKGV4cGVjdGVkOiBzdHJpbmcgfCBbc3RyaW5nXSB8IFtzdHJpbmcsIHN0cmluZ10pIHtcbiAgICBleHBlY3RlZCA9IEFycmF5LmlzQXJyYXkoZXhwZWN0ZWQpID8gZXhwZWN0ZWQgOiBbZXhwZWN0ZWRdO1xuICAgIGNvbnN0IHJlcyA9IGV4cGVjdGVkLmxlbmd0aCA9PT0gMlxuICAgICAgPyBgb25lIG9mIHNjaGVtZSAke2V4cGVjdGVkWzBdfSBvciAke2V4cGVjdGVkWzFdfWBcbiAgICAgIDogYG9mIHNjaGVtZSAke2V4cGVjdGVkWzBdfWA7XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9VUkxfU0NIRU1FXCIsIGBUaGUgVVJMIG11c3QgYmUgJHtyZXN9YCk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9NT0RVTEVfTk9UX0ZPVU5EIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IocGF0aDogc3RyaW5nLCBiYXNlOiBzdHJpbmcsIHR5cGU6IHN0cmluZyA9IFwicGFja2FnZVwiKSB7XG4gICAgc3VwZXIoXG4gICAgICBcIkVSUl9NT0RVTEVfTk9UX0ZPVU5EXCIsXG4gICAgICBgQ2Fubm90IGZpbmQgJHt0eXBlfSAnJHtwYXRofScgaW1wb3J0ZWQgZnJvbSAke2Jhc2V9YCxcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfSU5WQUxJRF9QQUNLQUdFX0NPTkZJRyBleHRlbmRzIE5vZGVFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgYmFzZT86IHN0cmluZywgbWVzc2FnZT86IHN0cmluZykge1xuICAgIGNvbnN0IG1zZyA9IGBJbnZhbGlkIHBhY2thZ2UgY29uZmlnICR7cGF0aH0ke1xuICAgICAgYmFzZSA/IGAgd2hpbGUgaW1wb3J0aW5nICR7YmFzZX1gIDogXCJcIlxuICAgIH0ke21lc3NhZ2UgPyBgLiAke21lc3NhZ2V9YCA6IFwiXCJ9YDtcbiAgICBzdXBlcihcIkVSUl9JTlZBTElEX1BBQ0tBR0VfQ09ORklHXCIsIG1zZyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX01PRFVMRV9TUEVDSUZJRVIgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IocmVxdWVzdDogc3RyaW5nLCByZWFzb246IHN0cmluZywgYmFzZT86IHN0cmluZykge1xuICAgIHN1cGVyKFxuICAgICAgXCJFUlJfSU5WQUxJRF9NT0RVTEVfU1BFQ0lGSUVSXCIsXG4gICAgICBgSW52YWxpZCBtb2R1bGUgXCIke3JlcXVlc3R9XCIgJHtyZWFzb259JHtcbiAgICAgICAgYmFzZSA/IGAgaW1wb3J0ZWQgZnJvbSAke2Jhc2V9YCA6IFwiXCJcbiAgICAgIH1gLFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9JTlZBTElEX1BBQ0tBR0VfVEFSR0VUIGV4dGVuZHMgTm9kZUVycm9yIHtcbiAgY29uc3RydWN0b3IoXG4gICAgcGtnUGF0aDogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgdGFyZ2V0OiBhbnksXG4gICAgaXNJbXBvcnQ/OiBib29sZWFuLFxuICAgIGJhc2U/OiBzdHJpbmcsXG4gICkge1xuICAgIGxldCBtc2c6IHN0cmluZztcbiAgICBjb25zdCByZWxFcnJvciA9IHR5cGVvZiB0YXJnZXQgPT09IFwic3RyaW5nXCIgJiZcbiAgICAgICFpc0ltcG9ydCAmJlxuICAgICAgdGFyZ2V0Lmxlbmd0aCAmJlxuICAgICAgIXRhcmdldC5zdGFydHNXaXRoKFwiLi9cIik7XG4gICAgaWYgKGtleSA9PT0gXCIuXCIpIHtcbiAgICAgIGFzc2VydChpc0ltcG9ydCA9PT0gZmFsc2UpO1xuICAgICAgbXNnID0gYEludmFsaWQgXCJleHBvcnRzXCIgbWFpbiB0YXJnZXQgJHtKU09OLnN0cmluZ2lmeSh0YXJnZXQpfSBkZWZpbmVkIGAgK1xuICAgICAgICBgaW4gdGhlIHBhY2thZ2UgY29uZmlnICR7cGtnUGF0aH1wYWNrYWdlLmpzb24ke1xuICAgICAgICAgIGJhc2UgPyBgIGltcG9ydGVkIGZyb20gJHtiYXNlfWAgOiBcIlwiXG4gICAgICAgIH0ke3JlbEVycm9yID8gJzsgdGFyZ2V0cyBtdXN0IHN0YXJ0IHdpdGggXCIuL1wiJyA6IFwiXCJ9YDtcbiAgICB9IGVsc2Uge1xuICAgICAgbXNnID0gYEludmFsaWQgXCIke2lzSW1wb3J0ID8gXCJpbXBvcnRzXCIgOiBcImV4cG9ydHNcIn1cIiB0YXJnZXQgJHtcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkoXG4gICAgICAgICAgdGFyZ2V0LFxuICAgICAgICApXG4gICAgICB9IGRlZmluZWQgZm9yICcke2tleX0nIGluIHRoZSBwYWNrYWdlIGNvbmZpZyAke3BrZ1BhdGh9cGFja2FnZS5qc29uJHtcbiAgICAgICAgYmFzZSA/IGAgaW1wb3J0ZWQgZnJvbSAke2Jhc2V9YCA6IFwiXCJcbiAgICAgIH0ke3JlbEVycm9yID8gJzsgdGFyZ2V0cyBtdXN0IHN0YXJ0IHdpdGggXCIuL1wiJyA6IFwiXCJ9YDtcbiAgICB9XG4gICAgc3VwZXIoXCJFUlJfSU5WQUxJRF9QQUNLQUdFX1RBUkdFVFwiLCBtc2cpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFUlJfUEFDS0FHRV9JTVBPUlRfTk9UX0RFRklORUQgZXh0ZW5kcyBOb2RlVHlwZUVycm9yIHtcbiAgY29uc3RydWN0b3IoXG4gICAgc3BlY2lmaWVyOiBzdHJpbmcsXG4gICAgcGFja2FnZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICBiYXNlOiBzdHJpbmcsXG4gICkge1xuICAgIGNvbnN0IG1zZyA9IGBQYWNrYWdlIGltcG9ydCBzcGVjaWZpZXIgXCIke3NwZWNpZmllcn1cIiBpcyBub3QgZGVmaW5lZCR7XG4gICAgICBwYWNrYWdlUGF0aCA/IGAgaW4gcGFja2FnZSAke3BhY2thZ2VQYXRofXBhY2thZ2UuanNvbmAgOiBcIlwiXG4gICAgfSBpbXBvcnRlZCBmcm9tICR7YmFzZX1gO1xuXG4gICAgc3VwZXIoXCJFUlJfUEFDS0FHRV9JTVBPUlRfTk9UX0RFRklORURcIiwgbXNnKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRVJSX1BBQ0tBR0VfUEFUSF9OT1RfRVhQT1JURUQgZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihzdWJwYXRoOiBzdHJpbmcsIHBrZ1BhdGg6IHN0cmluZywgYmFzZVBhdGg/OiBzdHJpbmcpIHtcbiAgICBsZXQgbXNnOiBzdHJpbmc7XG4gICAgaWYgKHN1YnBhdGggPT09IFwiLlwiKSB7XG4gICAgICBtc2cgPSBgTm8gXCJleHBvcnRzXCIgbWFpbiBkZWZpbmVkIGluICR7cGtnUGF0aH1wYWNrYWdlLmpzb24ke1xuICAgICAgICBiYXNlUGF0aCA/IGAgaW1wb3J0ZWQgZnJvbSAke2Jhc2VQYXRofWAgOiBcIlwiXG4gICAgICB9YDtcbiAgICB9IGVsc2Uge1xuICAgICAgbXNnID1cbiAgICAgICAgYFBhY2thZ2Ugc3VicGF0aCAnJHtzdWJwYXRofScgaXMgbm90IGRlZmluZWQgYnkgXCJleHBvcnRzXCIgaW4gJHtwa2dQYXRofXBhY2thZ2UuanNvbiR7XG4gICAgICAgICAgYmFzZVBhdGggPyBgIGltcG9ydGVkIGZyb20gJHtiYXNlUGF0aH1gIDogXCJcIlxuICAgICAgICB9YDtcbiAgICB9XG5cbiAgICBzdXBlcihcIkVSUl9QQUNLQUdFX1BBVEhfTk9UX0VYUE9SVEVEXCIsIG1zZyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEVSUl9JTlRFUk5BTF9BU1NFUlRJT04gZXh0ZW5kcyBOb2RlRXJyb3Ige1xuICBjb25zdHJ1Y3RvcihtZXNzYWdlPzogc3RyaW5nKSB7XG4gICAgY29uc3Qgc3VmZml4ID0gXCJUaGlzIGlzIGNhdXNlZCBieSBlaXRoZXIgYSBidWcgaW4gTm9kZS5qcyBcIiArXG4gICAgICBcIm9yIGluY29ycmVjdCB1c2FnZSBvZiBOb2RlLmpzIGludGVybmFscy5cXG5cIiArXG4gICAgICBcIlBsZWFzZSBvcGVuIGFuIGlzc3VlIHdpdGggdGhpcyBzdGFjayB0cmFjZSBhdCBcIiArXG4gICAgICBcImh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXNcXG5cIjtcbiAgICBzdXBlcihcbiAgICAgIFwiRVJSX0lOVEVSTkFMX0FTU0VSVElPTlwiLFxuICAgICAgbWVzc2FnZSA9PT0gdW5kZWZpbmVkID8gc3VmZml4IDogYCR7bWVzc2FnZX1cXG4ke3N1ZmZpeH1gLFxuICAgICk7XG4gIH1cbn1cblxuLy8gVXNpbmcgYGZzLnJtZGlyYCBvbiBhIHBhdGggdGhhdCBpcyBhIGZpbGUgcmVzdWx0cyBpbiBhbiBFTk9FTlQgZXJyb3Igb24gV2luZG93cyBhbmQgYW4gRU5PVERJUiBlcnJvciBvbiBQT1NJWC5cbmV4cG9ydCBjbGFzcyBFUlJfRlNfUk1ESVJfRU5PVERJUiBleHRlbmRzIE5vZGVTeXN0ZW1FcnJvciB7XG4gIGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGNvZGUgPSBpc1dpbmRvd3MgPyBcIkVOT0VOVFwiIDogXCJFTk9URElSXCI7XG4gICAgY29uc3QgY3R4OiBOb2RlU3lzdGVtRXJyb3JDdHggPSB7XG4gICAgICBtZXNzYWdlOiBcIm5vdCBhIGRpcmVjdG9yeVwiLFxuICAgICAgcGF0aCxcbiAgICAgIHN5c2NhbGw6IFwicm1kaXJcIixcbiAgICAgIGNvZGUsXG4gICAgICBlcnJubzogaXNXaW5kb3dzID8gRU5PRU5UIDogRU5PVERJUixcbiAgICB9O1xuICAgIHN1cGVyKGNvZGUsIGN0eCwgXCJQYXRoIGlzIG5vdCBhIGRpcmVjdG9yeVwiKTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgVXZFeGNlcHRpb25Db250ZXh0IHtcbiAgc3lzY2FsbDogc3RyaW5nO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGRlbm9FcnJvclRvTm9kZUVycm9yKGU6IEVycm9yLCBjdHg6IFV2RXhjZXB0aW9uQ29udGV4dCkge1xuICBjb25zdCBlcnJubyA9IGV4dHJhY3RPc0Vycm9yTnVtYmVyRnJvbUVycm9yTWVzc2FnZShlKTtcbiAgaWYgKHR5cGVvZiBlcnJubyA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHJldHVybiBlO1xuICB9XG5cbiAgY29uc3QgZXggPSB1dkV4Y2VwdGlvbih7XG4gICAgZXJybm86IG1hcFN5c0Vycm5vVG9VdkVycm5vKGVycm5vKSxcbiAgICAuLi5jdHgsXG4gIH0pO1xuICByZXR1cm4gZXg7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RPc0Vycm9yTnVtYmVyRnJvbUVycm9yTWVzc2FnZShlOiB1bmtub3duKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgbWF0Y2ggPSBlIGluc3RhbmNlb2YgRXJyb3JcbiAgICA/IGUubWVzc2FnZS5tYXRjaCgvXFwob3MgZXJyb3IgKFxcZCspXFwpLylcbiAgICA6IGZhbHNlO1xuXG4gIGlmIChtYXRjaCkge1xuICAgIHJldHVybiArbWF0Y2hbMV07XG4gIH1cblxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29ublJlc2V0RXhjZXB0aW9uKG1zZzogc3RyaW5nKSB7XG4gIGNvbnN0IGV4ID0gbmV3IEVycm9yKG1zZyk7XG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIChleCBhcyBhbnkpLmNvZGUgPSBcIkVDT05OUkVTRVRcIjtcbiAgcmV0dXJuIGV4O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWdncmVnYXRlVHdvRXJyb3JzKFxuICBpbm5lckVycm9yOiBBZ2dyZWdhdGVFcnJvcixcbiAgb3V0ZXJFcnJvcjogQWdncmVnYXRlRXJyb3IgJiB7IGNvZGU6IHN0cmluZyB9LFxuKSB7XG4gIGlmIChpbm5lckVycm9yICYmIG91dGVyRXJyb3IgJiYgaW5uZXJFcnJvciAhPT0gb3V0ZXJFcnJvcikge1xuICAgIGlmIChBcnJheS5pc0FycmF5KG91dGVyRXJyb3IuZXJyb3JzKSkge1xuICAgICAgLy8gSWYgYG91dGVyRXJyb3JgIGlzIGFscmVhZHkgYW4gYEFnZ3JlZ2F0ZUVycm9yYC5cbiAgICAgIG91dGVyRXJyb3IuZXJyb3JzLnB1c2goaW5uZXJFcnJvcik7XG4gICAgICByZXR1cm4gb3V0ZXJFcnJvcjtcbiAgICB9XG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG4gICAgY29uc3QgZXJyID0gbmV3IEFnZ3JlZ2F0ZUVycm9yKFxuICAgICAgW1xuICAgICAgICBvdXRlckVycm9yLFxuICAgICAgICBpbm5lckVycm9yLFxuICAgICAgXSxcbiAgICAgIG91dGVyRXJyb3IubWVzc2FnZSxcbiAgICApO1xuICAgIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gICAgKGVyciBhcyBhbnkpLmNvZGUgPSBvdXRlckVycm9yLmNvZGU7XG4gICAgcmV0dXJuIGVycjtcbiAgfVxuICByZXR1cm4gaW5uZXJFcnJvciB8fCBvdXRlckVycm9yO1xufVxuY29kZXMuRVJSX0lQQ19DSEFOTkVMX0NMT1NFRCA9IEVSUl9JUENfQ0hBTk5FTF9DTE9TRUQ7XG5jb2Rlcy5FUlJfSU5WQUxJRF9BUkdfVFlQRSA9IEVSUl9JTlZBTElEX0FSR19UWVBFO1xuY29kZXMuRVJSX0lOVkFMSURfQVJHX1ZBTFVFID0gRVJSX0lOVkFMSURfQVJHX1ZBTFVFO1xuY29kZXMuRVJSX0lOVkFMSURfQ0FMTEJBQ0sgPSBFUlJfSU5WQUxJRF9DQUxMQkFDSztcbmNvZGVzLkVSUl9PVVRfT0ZfUkFOR0UgPSBFUlJfT1VUX09GX1JBTkdFO1xuY29kZXMuRVJSX1NPQ0tFVF9CQURfUE9SVCA9IEVSUl9TT0NLRVRfQkFEX1BPUlQ7XG5jb2Rlcy5FUlJfQlVGRkVSX09VVF9PRl9CT1VORFMgPSBFUlJfQlVGRkVSX09VVF9PRl9CT1VORFM7XG5jb2Rlcy5FUlJfVU5LTk9XTl9FTkNPRElORyA9IEVSUl9VTktOT1dOX0VOQ09ESU5HO1xuLy8gVE9ETyhrdDNrKTogYXNzaWduIGFsbCBlcnJvciBjbGFzc2VzIGhlcmUuXG5cbi8qKlxuICogVGhpcyBjcmVhdGVzIGEgZ2VuZXJpYyBOb2RlLmpzIGVycm9yLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlIFRoZSBlcnJvciBtZXNzYWdlLlxuICogQHBhcmFtIHtvYmplY3R9IGVycm9yUHJvcGVydGllcyBPYmplY3Qgd2l0aCBhZGRpdGlvbmFsIHByb3BlcnRpZXMgdG8gYmUgYWRkZWQgdG8gdGhlIGVycm9yLlxuICogQHJldHVybnMge0Vycm9yfVxuICovXG5jb25zdCBnZW5lcmljTm9kZUVycm9yID0gaGlkZVN0YWNrRnJhbWVzKFxuICBmdW5jdGlvbiBnZW5lcmljTm9kZUVycm9yKG1lc3NhZ2UsIGVycm9yUHJvcGVydGllcykge1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuICAgIGNvbnN0IGVyciA9IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICBPYmplY3QuYXNzaWduKGVyciwgZXJyb3JQcm9wZXJ0aWVzKTtcblxuICAgIHJldHVybiBlcnI7XG4gIH0sXG4pO1xuXG5leHBvcnQgeyBjb2RlcywgZ2VuZXJpY05vZGVFcnJvciwgaGlkZVN0YWNrRnJhbWVzIH07XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgQWJvcnRFcnJvcixcbiAgYWdncmVnYXRlVHdvRXJyb3JzLFxuICBjb2RlcyxcbiAgZG5zRXhjZXB0aW9uLFxufTtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFDMUUsb0VBQW9FO0FBQ3BFOzs7Ozs7Ozs7OztHQVdHLENBRUgsU0FBUyxrQkFBa0IsUUFBUSxZQUFZLENBQUM7QUFDaEQsU0FBUyxPQUFPLFFBQVEsOEJBQThCLENBQUM7QUFDdkQsU0FBUyxLQUFLLFFBQVEsa0JBQWtCLENBQUM7QUFDekMsU0FDRSxPQUFPLEVBQ1AsUUFBUSxFQUNSLG9CQUFvQixRQUNmLDJCQUEyQixDQUFDO0FBQ25DLFNBQVMsTUFBTSxRQUFRLHVCQUF1QixDQUFDO0FBQy9DLFNBQVMsU0FBUyxRQUFRLG1CQUFtQixDQUFDO0FBQzlDLFNBQVMsRUFBRSxJQUFJLFdBQVcsUUFBUSxrQ0FBa0MsQ0FBQztBQUNyRSxNQUFNLEVBQ0osS0FBSyxFQUFFLEVBQUUsT0FBTyxDQUFBLEVBQUUsTUFBTSxDQUFBLEVBQUUsQ0FBQSxJQUMzQixHQUFHLFdBQVcsQUFBQztBQUNoQixTQUFTLGVBQWUsUUFB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