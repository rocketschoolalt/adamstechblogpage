// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.
import { Buffer } from "../io/buffer.ts";
const DEFAULT_CHUNK_SIZE = 16640;
const DEFAULT_BUFFER_SIZE = 32 * 1024;
function isCloser(value) {
    return typeof value === "object" && value != null && "close" in value && // deno-lint-ignore no-explicit-any
    typeof value["close"] === "function";
}
/** Create a `Deno.Reader` from an iterable of `Uint8Array`s.
 *
 * ```ts
 *      import { readerFromIterable } from "./conversion.ts";
 *
 *      const file = await Deno.open("metrics.txt", { write: true });
 *      const reader = readerFromIterable((async function* () {
 *        while (true) {
 *          await new Promise((r) => setTimeout(r, 1000));
 *          const message = `data: ${JSON.stringify(Deno.metrics())}\n\n`;
 *          yield new TextEncoder().encode(message);
 *        }
 *      })());
 *      await Deno.copy(reader, file);
 * ```
 */ export function readerFromIterable(iterable) {
    const iterator = iterable[Symbol.asyncIterator]?.() ?? iterable[Symbol.iterator]?.();
    const buffer = new Buffer();
    return {
        async read (p) {
            if (buffer.length == 0) {
                const result = await iterator.next();
                if (result.done) {
                    return null;
                } else {
                    if (result.value.byteLength <= p.byteLength) {
                        p.set(result.value);
                        return result.value.byteLength;
                    }
                    p.set(result.value.subarray(0, p.byteLength));
                    await writeAll(buffer, result.value.subarray(p.byteLength));
                    return p.byteLength;
                }
            } else {
                const n = await buffer.read(p);
                if (n == null) {
                    return this.read(p);
                }
                return n;
            }
        }
    };
}
/** Create a `Writer` from a `WritableStreamDefaultWriter`. */ export function writerFromStreamWriter(streamWriter) {
    return {
        async write (p) {
            await streamWriter.ready;
            await streamWriter.write(p);
            return p.length;
        }
    };
}
/** Create a `Reader` from a `ReadableStreamDefaultReader`. */ export function readerFromStreamReader(streamReader) {
    const buffer = new Buffer();
    return {
        async read (p) {
            if (buffer.empty()) {
                const res = await streamReader.read();
                if (res.done) {
                    return null; // EOF
                }
                await writeAll(buffer, res.value);
            }
            return buffer.read(p);
        }
    };
}
/** Create a `WritableStream` from a `Writer`. */ export function writableStreamFromWriter(writer, options = {
}) {
    const { autoClose =true  } = options;
    return new WritableStream({
        async write (chunk, controller) {
            try {
                await writeAll(writer, chunk);
            } catch (e) {
                controller.error(e);
                if (isCloser(writer) && autoClose) {
                    writer.close();
                }
            }
        },
        close () {
            if (isCloser(writer) && autoClose) {
                writer.close();
            }
        },
        abort () {
            if (isCloser(writer) && autoClose) {
                writer.close();
            }
        }
    });
}
/** Create a `ReadableStream` from any kind of iterable.
 *
 * ```ts
 *      import { readableStreamFromIterable } from "./conversion.ts";
 *
 *      const r1 = readableStreamFromIterable(["foo, bar, baz"]);
 *      const r2 = readableStreamFromIterable(async function* () {
 *        await new Promise(((r) => setTimeout(r, 1000)));
 *        yield "foo";
 *        await new Promise(((r) => setTimeout(r, 1000)));
 *        yield "bar";
 *        await new Promise(((r) => setTimeout(r, 1000)));
 *        yield "baz";
 *      }());
 * ```
 *
 * If the produced iterator (`iterable[Symbol.asyncIterator]()` or
 * `iterable[Symbol.iterator]()`) is a generator, or more specifically is found
 * to have a `.throw()` method on it, that will be called upon
 * `readableStream.cancel()`. This is the case for the second input type above:
 *
 * ```ts
 * import { readableStreamFromIterable } from "./conversion.ts";
 *
 * const r3 = readableStreamFromIterable(async function* () {
 *   try {
 *     yield "foo";
 *   } catch (error) {
 *     console.log(error); // Error: Cancelled by consumer.
 *   }
 * }());
 * const reader = r3.getReader();
 * console.log(await reader.read()); // { value: "foo", done: false }
 * await reader.cancel(new Error("Cancelled by consumer."));
 * ```
 */ export function readableStreamFromIterable(iterable) {
    const iterator = iterable[Symbol.asyncIterator]?.() ?? iterable[Symbol.iterator]?.();
    return new ReadableStream({
        async pull (controller) {
            const { value , done  } = await iterator.next();
            if (done) {
                controller.close();
            } else {
                controller.enqueue(value);
            }
        },
        async cancel (reason) {
            if (typeof iterator.throw == "function") {
                try {
                    await iterator.throw(reason);
                } catch  {
                }
            }
        }
    });
}
/**
 * Create a `ReadableStream<Uint8Array>` from from a `Deno.Reader`.
 *
 * When the pull algorithm is called on the stream, a chunk from the reader
 * will be read.  When `null` is returned from the reader, the stream will be
 * closed along with the reader (if it is also a `Deno.Closer`).
 *
 * An example converting a `Deno.File` into a readable stream:
 *
 * ```ts
 * import { readableStreamFromReader } from "./mod.ts";
 *
 * const file = await Deno.open("./file.txt", { read: true });
 * const fileStream = readableStreamFromReader(file);
 * ```
 */ export function readableStreamFromReader(reader, options = {
}) {
    const { autoClose =true , chunkSize =DEFAULT_CHUNK_SIZE , strategy ,  } = options;
    return new ReadableStream({
        async pull (controller) {
            const chunk = new Uint8Array(chunkSize);
            try {
                const read = await reader.read(chunk);
                if (read === null) {
                    if (isCloser(reader) && autoClose) {
                        reader.close();
                    }
                    controller.close();
                    return;
                }
                controller.enqueue(chunk.subarray(0, read));
            } catch (e) {
                controller.error(e);
                if (isCloser(reader)) {
                    reader.close();
                }
            }
        },
        cancel () {
            if (isCloser(reader) && autoClose) {
                reader.close();
            }
        }
    }, strategy);
}
/** Read Reader `r` until EOF (`null`) and resolve to the content as
 * Uint8Array`.
 *
 * ```ts
 * import { Buffer } from "../io/buffer.ts";
 * import { readAll } from "./conversion.ts";
 *
 * // Example from stdin
 * const stdinContent = await readAll(Deno.stdin);
 *
 * // Example from file
 * const file = await Deno.open("my_file.txt", {read: true});
 * const myFileContent = await readAll(file);
 * Deno.close(file.rid);
 *
 * // Example from buffer
 * const myData = new Uint8Array(100);
 * // ... fill myData array with data
 * const reader = new Buffer(myData.buffer);
 * const bufferContent = await readAll(reader);
 * ```
 */ export async function readAll(r) {
    const buf = new Buffer();
    await buf.readFrom(r);
    return buf.bytes();
}
/** Synchronously reads Reader `r` until EOF (`null`) and returns the content
 * as `Uint8Array`.
 *
 * ```ts
 * import { Buffer } from "../io/buffer.ts";
 * import { readAllSync } from "./conversion.ts";
 *
 * // Example from stdin
 * const stdinContent = readAllSync(Deno.stdin);
 *
 * // Example from file
 * const file = Deno.openSync("my_file.txt", {read: true});
 * const myFileContent = readAllSync(file);
 * Deno.close(file.rid);
 *
 * // Example from buffer
 * const myData = new Uint8Array(100);
 * // ... fill myData array with data
 * const reader = new Buffer(myData.buffer);
 * const bufferContent = readAllSync(reader);
 * ```
 */ export function readAllSync(r) {
    const buf = new Buffer();
    buf.readFromSync(r);
    return buf.bytes();
}
/** Write all the content of the array buffer (`arr`) to the writer (`w`).
 *
 * ```ts
 * import { Buffer } from "../io/buffer.ts";
 * import { writeAll } from "./conversion.ts";

 * // Example writing to stdout
 * let contentBytes = new TextEncoder().encode("Hello World");
 * await writeAll(Deno.stdout, contentBytes);
 *
 * // Example writing to file
 * contentBytes = new TextEncoder().encode("Hello World");
 * const file = await Deno.open('test.file', {write: true});
 * await writeAll(file, contentBytes);
 * Deno.close(file.rid);
 *
 * // Example writing to buffer
 * contentBytes = new TextEncoder().encode("Hello World");
 * const writer = new Buffer();
 * await writeAll(writer, contentBytes);
 * console.log(writer.bytes().length);  // 11
 * ```
 */ export async function writeAll(w, arr) {
    let nwritten = 0;
    while(nwritten < arr.length){
        nwritten += await w.write(arr.subarray(nwritten));
    }
}
/** Synchronously write all the content of the array buffer (`arr`) to the
 * writer (`w`).
 *
 * ```ts
 * import { Buffer } from "../io/buffer.ts";
 * import { writeAllSync } from "./conversion.ts";
 *
 * // Example writing to stdout
 * let contentBytes = new TextEncoder().encode("Hello World");
 * writeAllSync(Deno.stdout, contentBytes);
 *
 * // Example writing to file
 * contentBytes = new TextEncoder().encode("Hello World");
 * const file = Deno.openSync('test.file', {write: true});
 * writeAllSync(file, contentBytes);
 * Deno.close(file.rid);
 *
 * // Example writing to buffer
 * contentBytes = new TextEncoder().encode("Hello World");
 * const writer = new Buffer();
 * writeAllSync(writer, contentBytes);
 * console.log(writer.bytes().length);  // 11
 * ```
 */ export function writeAllSync(w, arr) {
    let nwritten = 0;
    while(nwritten < arr.length){
        nwritten += w.writeSync(arr.subarray(nwritten));
    }
}
/** Turns a Reader, `r`, into an async iterator.
 *
 * ```ts
 * import { iterateReader } from "./conversion.ts";
 *
 * let f = await Deno.open("/etc/passwd");
 * for await (const chunk of iterateReader(f)) {
 *   console.log(chunk);
 * }
 * f.close();
 * ```
 *
 * Second argument can be used to tune size of a buffer.
 * Default size of the buffer is 32kB.
 *
 * ```ts
 * import { iterateReader } from "./conversion.ts";
 *
 * let f = await Deno.open("/etc/passwd");
 * const it = iterateReader(f, {
 *   bufSize: 1024 * 1024
 * });
 * for await (const chunk of it) {
 *   console.log(chunk);
 * }
 * f.close();
 * ```
 *
 * Iterator uses an internal buffer of fixed size for efficiency; it returns
 * a view on that buffer on each iteration. It is therefore caller's
 * responsibility to copy contents of the buffer if needed; otherwise the
 * next iteration will overwrite contents of previously returned chunk.
 */ export async function* iterateReader(r, options) {
    const bufSize = options?.bufSize ?? DEFAULT_BUFFER_SIZE;
    const b = new Uint8Array(bufSize);
    while(true){
        const result = await r.read(b);
        if (result === null) {
            break;
        }
        yield b.subarray(0, result);
    }
}
/** Turns a ReaderSync, `r`, into an iterator.
 *
 * ```ts
 * import { iterateReaderSync } from "./conversion.ts";
 *
 * let f = Deno.openSync("/etc/passwd");
 * for (const chunk of iterateReaderSync(f)) {
 *   console.log(chunk);
 * }
 * f.close();
 * ```
 *
 * Second argument can be used to tune size of a buffer.
 * Default size of the buffer is 32kB.
 *
 * ```ts
 * import { iterateReaderSync } from "./conversion.ts";

 * let f = await Deno.open("/etc/passwd");
 * const iter = iterateReaderSync(f, {
 *   bufSize: 1024 * 1024
 * });
 * for (const chunk of iter) {
 *   console.log(chunk);
 * }
 * f.close();
 * ```
 *
 * Iterator uses an internal buffer of fixed size for efficiency; it returns
 * a view on that buffer on each iteration. It is therefore caller's
 * responsibility to copy contents of the buffer if needed; otherwise the
 * next iteration will overwrite contents of previously returned chunk.
 */ export function* iterateReaderSync(r, options) {
    const bufSize = options?.bufSize ?? DEFAULT_BUFFER_SIZE;
    const b = new Uint8Array(bufSize);
    while(true){
        const result = r.readSync(b);
        if (result === null) {
            break;
        }
        yield b.subarray(0, result);
    }
}
/** Copies from `src` to `dst` until either EOF (`null`) is read from `src` or
 * an error occurs. It resolves to the number of bytes copied or rejects with
 * the first error encountered while copying.
 *
 * ```ts
 * import { copy } from "./conversion.ts";
 *
 * const source = await Deno.open("my_file.txt");
 * const bytesCopied1 = await copy(source, Deno.stdout);
 * const destination = await Deno.create("my_file_2.txt");
 * const bytesCopied2 = await copy(source, destination);
 * ```
 *
 * @param src The source to copy from
 * @param dst The destination to copy to
 * @param options Can be used to tune size of the buffer. Default size is 32kB
 */ export async function copy(src, dst, options) {
    let n = 0;
    const bufSize = options?.bufSize ?? DEFAULT_BUFFER_SIZE;
    const b = new Uint8Array(bufSize);
    let gotEOF = false;
    while(gotEOF === false){
        const result = await src.read(b);
        if (result === null) {
            gotEOF = true;
        } else {
            let nwritten = 0;
            while(nwritten < result){
                nwritten += await dst.write(b.subarray(nwritten, result));
            }
            n += nwritten;
        }
    }
    return n;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjExOC4wL3N0cmVhbXMvY29udmVyc2lvbi50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIxIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG5pbXBvcnQgeyBCdWZmZXIgfSBmcm9tIFwiLi4vaW8vYnVmZmVyLnRzXCI7XG5cbmNvbnN0IERFRkFVTFRfQ0hVTktfU0laRSA9IDE2XzY0MDtcbmNvbnN0IERFRkFVTFRfQlVGRkVSX1NJWkUgPSAzMiAqIDEwMjQ7XG5cbmZ1bmN0aW9uIGlzQ2xvc2VyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgRGVuby5DbG9zZXIge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmIHZhbHVlICE9IG51bGwgJiYgXCJjbG9zZVwiIGluIHZhbHVlICYmXG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICB0eXBlb2YgKHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIGFueT4pW1wiY2xvc2VcIl0gPT09IFwiZnVuY3Rpb25cIjtcbn1cblxuLyoqIENyZWF0ZSBhIGBEZW5vLlJlYWRlcmAgZnJvbSBhbiBpdGVyYWJsZSBvZiBgVWludDhBcnJheWBzLlxuICpcbiAqIGBgYHRzXG4gKiAgICAgIGltcG9ydCB7IHJlYWRlckZyb21JdGVyYWJsZSB9IGZyb20gXCIuL2NvbnZlcnNpb24udHNcIjtcbiAqXG4gKiAgICAgIGNvbnN0IGZpbGUgPSBhd2FpdCBEZW5vLm9wZW4oXCJtZXRyaWNzLnR4dFwiLCB7IHdyaXRlOiB0cnVlIH0pO1xuICogICAgICBjb25zdCByZWFkZXIgPSByZWFkZXJGcm9tSXRlcmFibGUoKGFzeW5jIGZ1bmN0aW9uKiAoKSB7XG4gKiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAqICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDEwMDApKTtcbiAqICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBgZGF0YTogJHtKU09OLnN0cmluZ2lmeShEZW5vLm1ldHJpY3MoKSl9XFxuXFxuYDtcbiAqICAgICAgICAgIHlpZWxkIG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShtZXNzYWdlKTtcbiAqICAgICAgICB9XG4gKiAgICAgIH0pKCkpO1xuICogICAgICBhd2FpdCBEZW5vLmNvcHkocmVhZGVyLCBmaWxlKTtcbiAqIGBgYFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZGVyRnJvbUl0ZXJhYmxlKFxuICBpdGVyYWJsZTogSXRlcmFibGU8VWludDhBcnJheT4gfCBBc3luY0l0ZXJhYmxlPFVpbnQ4QXJyYXk+LFxuKTogRGVuby5SZWFkZXIge1xuICBjb25zdCBpdGVyYXRvcjogSXRlcmF0b3I8VWludDhBcnJheT4gfCBBc3luY0l0ZXJhdG9yPFVpbnQ4QXJyYXk+ID1cbiAgICAoaXRlcmFibGUgYXMgQXN5bmNJdGVyYWJsZTxVaW50OEFycmF5PilbU3ltYm9sLmFzeW5jSXRlcmF0b3JdPy4oKSA/P1xuICAgICAgKGl0ZXJhYmxlIGFzIEl0ZXJhYmxlPFVpbnQ4QXJyYXk+KVtTeW1ib2wuaXRlcmF0b3JdPy4oKTtcbiAgY29uc3QgYnVmZmVyID0gbmV3IEJ1ZmZlcigpO1xuICByZXR1cm4ge1xuICAgIGFzeW5jIHJlYWQocDogVWludDhBcnJheSk6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4ge1xuICAgICAgaWYgKGJ1ZmZlci5sZW5ndGggPT0gMCkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBpdGVyYXRvci5uZXh0KCk7XG4gICAgICAgIGlmIChyZXN1bHQuZG9uZSkge1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChyZXN1bHQudmFsdWUuYnl0ZUxlbmd0aCA8PSBwLmJ5dGVMZW5ndGgpIHtcbiAgICAgICAgICAgIHAuc2V0KHJlc3VsdC52YWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0LnZhbHVlLmJ5dGVMZW5ndGg7XG4gICAgICAgICAgfVxuICAgICAgICAgIHAuc2V0KHJlc3VsdC52YWx1ZS5zdWJhcnJheSgwLCBwLmJ5dGVMZW5ndGgpKTtcbiAgICAgICAgICBhd2FpdCB3cml0ZUFsbChidWZmZXIsIHJlc3VsdC52YWx1ZS5zdWJhcnJheShwLmJ5dGVMZW5ndGgpKTtcbiAgICAgICAgICByZXR1cm4gcC5ieXRlTGVuZ3RoO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBuID0gYXdhaXQgYnVmZmVyLnJlYWQocCk7XG4gICAgICAgIGlmIChuID09IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWFkKHApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG5cbi8qKiBDcmVhdGUgYSBgV3JpdGVyYCBmcm9tIGEgYFdyaXRhYmxlU3RyZWFtRGVmYXVsdFdyaXRlcmAuICovXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVyRnJvbVN0cmVhbVdyaXRlcihcbiAgc3RyZWFtV3JpdGVyOiBXcml0YWJsZVN0cmVhbURlZmF1bHRXcml0ZXI8VWludDhBcnJheT4sXG4pOiBEZW5vLldyaXRlciB7XG4gIHJldHVybiB7XG4gICAgYXN5bmMgd3JpdGUocDogVWludDhBcnJheSk6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgICBhd2FpdCBzdHJlYW1Xcml0ZXIucmVhZHk7XG4gICAgICBhd2FpdCBzdHJlYW1Xcml0ZXIud3JpdGUocCk7XG4gICAgICByZXR1cm4gcC5sZW5ndGg7XG4gICAgfSxcbiAgfTtcbn1cblxuLyoqIENyZWF0ZSBhIGBSZWFkZXJgIGZyb20gYSBgUmVhZGFibGVTdHJlYW1EZWZhdWx0UmVhZGVyYC4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkZXJGcm9tU3RyZWFtUmVhZGVyKFxuICBzdHJlYW1SZWFkZXI6IFJlYWRhYmxlU3RyZWFtRGVmYXVsdFJlYWRlcjxVaW50OEFycmF5Pixcbik6IERlbm8uUmVhZGVyIHtcbiAgY29uc3QgYnVmZmVyID0gbmV3IEJ1ZmZlcigpO1xuXG4gIHJldHVybiB7XG4gICAgYXN5bmMgcmVhZChwOiBVaW50OEFycmF5KTogUHJvbWlzZTxudW1iZXIgfCBudWxsPiB7XG4gICAgICBpZiAoYnVmZmVyLmVtcHR5KCkpIHtcbiAgICAgICAgY29uc3QgcmVzID0gYXdhaXQgc3RyZWFtUmVhZGVyLnJlYWQoKTtcbiAgICAgICAgaWYgKHJlcy5kb25lKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7IC8vIEVPRlxuICAgICAgICB9XG5cbiAgICAgICAgYXdhaXQgd3JpdGVBbGwoYnVmZmVyLCByZXMudmFsdWUpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYnVmZmVyLnJlYWQocCk7XG4gICAgfSxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXcml0YWJsZVN0cmVhbUZyb21Xcml0ZXJPcHRpb25zIHtcbiAgLyoqXG4gICAqIElmIHRoZSBgd3JpdGVyYCBpcyBhbHNvIGEgYERlbm8uQ2xvc2VyYCwgYXV0b21hdGljYWxseSBjbG9zZSB0aGUgYHdyaXRlcmBcbiAgICogd2hlbiB0aGUgc3RyZWFtIGlzIGNsb3NlZCwgYWJvcnRlZCwgb3IgYSB3cml0ZSBlcnJvciBvY2N1cnMuXG4gICAqXG4gICAqIERlZmF1bHRzIHRvIGB0cnVlYC4gKi9cbiAgYXV0b0Nsb3NlPzogYm9vbGVhbjtcbn1cblxuLyoqIENyZWF0ZSBhIGBXcml0YWJsZVN0cmVhbWAgZnJvbSBhIGBXcml0ZXJgLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdyaXRhYmxlU3RyZWFtRnJvbVdyaXRlcihcbiAgd3JpdGVyOiBEZW5vLldyaXRlcixcbiAgb3B0aW9uczogV3JpdGFibGVTdHJlYW1Gcm9tV3JpdGVyT3B0aW9ucyA9IHt9LFxuKTogV3JpdGFibGVTdHJlYW08VWludDhBcnJheT4ge1xuICBjb25zdCB7IGF1dG9DbG9zZSA9IHRydWUgfSA9IG9wdGlvbnM7XG5cbiAgcmV0dXJuIG5ldyBXcml0YWJsZVN0cmVhbSh7XG4gICAgYXN5bmMgd3JpdGUoY2h1bmssIGNvbnRyb2xsZXIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHdyaXRlQWxsKHdyaXRlciwgY2h1bmspO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBjb250cm9sbGVyLmVycm9yKGUpO1xuICAgICAgICBpZiAoaXNDbG9zZXIod3JpdGVyKSAmJiBhdXRvQ2xvc2UpIHtcbiAgICAgICAgICB3cml0ZXIuY2xvc2UoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgY2xvc2UoKSB7XG4gICAgICBpZiAoaXNDbG9zZXIod3JpdGVyKSAmJiBhdXRvQ2xvc2UpIHtcbiAgICAgICAgd3JpdGVyLmNsb3NlKCk7XG4gICAgICB9XG4gICAgfSxcbiAgICBhYm9ydCgpIHtcbiAgICAgIGlmIChpc0Nsb3Nlcih3cml0ZXIpICYmIGF1dG9DbG9zZSkge1xuICAgICAgICB3cml0ZXIuY2xvc2UoKTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcbn1cblxuLyoqIENyZWF0ZSBhIGBSZWFkYWJsZVN0cmVhbWAgZnJvbSBhbnkga2luZCBvZiBpdGVyYWJsZS5cbiAqXG4gKiBgYGB0c1xuICogICAgICBpbXBvcnQgeyByZWFkYWJsZVN0cmVhbUZyb21JdGVyYWJsZSB9IGZyb20gXCIuL2NvbnZlcnNpb24udHNcIjtcbiAqXG4gKiAgICAgIGNvbnN0IHIxID0gcmVhZGFibGVTdHJlYW1Gcm9tSXRlcmFibGUoW1wiZm9vLCBiYXIsIGJhelwiXSk7XG4gKiAgICAgIGNvbnN0IHIyID0gcmVhZGFibGVTdHJlYW1Gcm9tSXRlcmFibGUoYXN5bmMgZnVuY3Rpb24qICgpIHtcbiAqICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgoKHIpID0+IHNldFRpbWVvdXQociwgMTAwMCkpKTtcbiAqICAgICAgICB5aWVsZCBcImZvb1wiO1xuICogICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKCgocikgPT4gc2V0VGltZW91dChyLCAxMDAwKSkpO1xuICogICAgICAgIHlpZWxkIFwiYmFyXCI7XG4gKiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKChyKSA9PiBzZXRUaW1lb3V0KHIsIDEwMDApKSk7XG4gKiAgICAgICAgeWllbGQgXCJiYXpcIjtcbiAqICAgICAgfSgpKTtcbiAqIGBgYFxuICpcbiAqIElmIHRoZSBwcm9kdWNlZCBpdGVyYXRvciAoYGl0ZXJhYmxlW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSgpYCBvclxuICogYGl0ZXJhYmxlW1N5bWJvbC5pdGVyYXRvcl0oKWApIGlzIGEgZ2VuZXJhdG9yLCBvciBtb3JlIHNwZWNpZmljYWxseSBpcyBmb3VuZFxuICogdG8gaGF2ZSBhIGAudGhyb3coKWAgbWV0aG9kIG9uIGl0LCB0aGF0IHdpbGwgYmUgY2FsbGVkIHVwb25cbiAqIGByZWFkYWJsZVN0cmVhbS5jYW5jZWwoKWAuIFRoaXMgaXMgdGhlIGNhc2UgZm9yIHRoZSBzZWNvbmQgaW5wdXQgdHlwZSBhYm92ZTpcbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgcmVhZGFibGVTdHJlYW1Gcm9tSXRlcmFibGUgfSBmcm9tIFwiLi9jb252ZXJzaW9uLnRzXCI7XG4gKlxuICogY29uc3QgcjMgPSByZWFkYWJsZVN0cmVhbUZyb21JdGVyYWJsZShhc3luYyBmdW5jdGlvbiogKCkge1xuICogICB0cnkge1xuICogICAgIHlpZWxkIFwiZm9vXCI7XG4gKiAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gKiAgICAgY29uc29sZS5sb2coZXJyb3IpOyAvLyBFcnJvcjogQ2FuY2VsbGVkIGJ5IGNvbnN1bWVyLlxuICogICB9XG4gKiB9KCkpO1xuICogY29uc3QgcmVhZGVyID0gcjMuZ2V0UmVhZGVyKCk7XG4gKiBjb25zb2xlLmxvZyhhd2FpdCByZWFkZXIucmVhZCgpKTsgLy8geyB2YWx1ZTogXCJmb29cIiwgZG9uZTogZmFsc2UgfVxuICogYXdhaXQgcmVhZGVyLmNhbmNlbChuZXcgRXJyb3IoXCJDYW5jZWxsZWQgYnkgY29uc3VtZXIuXCIpKTtcbiAqIGBgYFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZGFibGVTdHJlYW1Gcm9tSXRlcmFibGU8VD4oXG4gIGl0ZXJhYmxlOiBJdGVyYWJsZTxUPiB8IEFzeW5jSXRlcmFibGU8VD4sXG4pOiBSZWFkYWJsZVN0cmVhbTxUPiB7XG4gIGNvbnN0IGl0ZXJhdG9yOiBJdGVyYXRvcjxUPiB8IEFzeW5jSXRlcmF0b3I8VD4gPVxuICAgIChpdGVyYWJsZSBhcyBBc3luY0l0ZXJhYmxlPFQ+KVtTeW1ib2wuYXN5bmNJdGVyYXRvcl0/LigpID8/XG4gICAgICAoaXRlcmFibGUgYXMgSXRlcmFibGU8VD4pW1N5bWJvbC5pdGVyYXRvcl0/LigpO1xuICByZXR1cm4gbmV3IFJlYWRhYmxlU3RyZWFtKHtcbiAgICBhc3luYyBwdWxsKGNvbnRyb2xsZXIpIHtcbiAgICAgIGNvbnN0IHsgdmFsdWUsIGRvbmUgfSA9IGF3YWl0IGl0ZXJhdG9yLm5leHQoKTtcbiAgICAgIGlmIChkb25lKSB7XG4gICAgICAgIGNvbnRyb2xsZXIuY2xvc2UoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnRyb2xsZXIuZW5xdWV1ZSh2YWx1ZSk7XG4gICAgICB9XG4gICAgfSxcbiAgICBhc3luYyBjYW5jZWwocmVhc29uKSB7XG4gICAgICBpZiAodHlwZW9mIGl0ZXJhdG9yLnRocm93ID09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IGl0ZXJhdG9yLnRocm93KHJlYXNvbik7XG4gICAgICAgIH0gY2F0Y2ggeyAvKiBgaXRlcmF0b3IudGhyb3coKWAgYWx3YXlzIHRocm93cyBvbiBzaXRlLiBXZSBjYXRjaCBpdC4gKi8gfVxuICAgICAgfVxuICAgIH0sXG4gIH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlYWRhYmxlU3RyZWFtRnJvbVJlYWRlck9wdGlvbnMge1xuICAvKiogSWYgdGhlIGByZWFkZXJgIGlzIGFsc28gYSBgRGVuby5DbG9zZXJgLCBhdXRvbWF0aWNhbGx5IGNsb3NlIHRoZSBgcmVhZGVyYFxuICAgKiB3aGVuIGBFT0ZgIGlzIGVuY291bnRlcmVkLCBvciBhIHJlYWQgZXJyb3Igb2NjdXJzLlxuICAgKlxuICAgKiBEZWZhdWx0cyB0byBgdHJ1ZWAuICovXG4gIGF1dG9DbG9zZT86IGJvb2xlYW47XG5cbiAgLyoqIFRoZSBzaXplIG9mIGNodW5rcyB0byBhbGxvY2F0ZSB0byByZWFkLCB0aGUgZGVmYXVsdCBpcyB+MTZLaUIsIHdoaWNoIGlzXG4gICAqIHRoZSBtYXhpbXVtIHNpemUgdGhhdCBEZW5vIG9wZXJhdGlvbnMgY2FuIGN1cnJlbnRseSBzdXBwb3J0LiAqL1xuICBjaHVua1NpemU/OiBudW1iZXI7XG5cbiAgLyoqIFRoZSBxdWV1aW5nIHN0cmF0ZWd5IHRvIGNyZWF0ZSB0aGUgYFJlYWRhYmxlU3RyZWFtYCB3aXRoLiAqL1xuICBzdHJhdGVneT86IHsgaGlnaFdhdGVyTWFyaz86IG51bWJlciB8IHVuZGVmaW5lZDsgc2l6ZT86IHVuZGVmaW5lZCB9O1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5PmAgZnJvbSBmcm9tIGEgYERlbm8uUmVhZGVyYC5cbiAqXG4gKiBXaGVuIHRoZSBwdWxsIGFsZ29yaXRobSBpcyBjYWxsZWQgb24gdGhlIHN0cmVhbSwgYSBjaHVuayBmcm9tIHRoZSByZWFkZXJcbiAqIHdpbGwgYmUgcmVhZC4gIFdoZW4gYG51bGxgIGlzIHJldHVybmVkIGZyb20gdGhlIHJlYWRlciwgdGhlIHN0cmVhbSB3aWxsIGJlXG4gKiBjbG9zZWQgYWxvbmcgd2l0aCB0aGUgcmVhZGVyIChpZiBpdCBpcyBhbHNvIGEgYERlbm8uQ2xvc2VyYCkuXG4gKlxuICogQW4gZXhhbXBsZSBjb252ZXJ0aW5nIGEgYERlbm8uRmlsZWAgaW50byBhIHJlYWRhYmxlIHN0cmVhbTpcbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgcmVhZGFibGVTdHJlYW1Gcm9tUmVhZGVyIH0gZnJvbSBcIi4vbW9kLnRzXCI7XG4gKlxuICogY29uc3QgZmlsZSA9IGF3YWl0IERlbm8ub3BlbihcIi4vZmlsZS50eHRcIiwgeyByZWFkOiB0cnVlIH0pO1xuICogY29uc3QgZmlsZVN0cmVhbSA9IHJlYWRhYmxlU3RyZWFtRnJvbVJlYWRlcihmaWxlKTtcbiAqIGBgYFxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZGFibGVTdHJlYW1Gcm9tUmVhZGVyKFxuICByZWFkZXI6IERlbm8uUmVhZGVyIHwgKERlbm8uUmVhZGVyICYgRGVuby5DbG9zZXIpLFxuICBvcHRpb25zOiBSZWFkYWJsZVN0cmVhbUZyb21SZWFkZXJPcHRpb25zID0ge30sXG4pOiBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5PiB7XG4gIGNvbnN0IHtcbiAgICBhdXRvQ2xvc2UgPSB0cnVlLFxuICAgIGNodW5rU2l6ZSA9IERFRkFVTFRfQ0hVTktfU0laRSxcbiAgICBzdHJhdGVneSxcbiAgfSA9IG9wdGlvbnM7XG5cbiAgcmV0dXJuIG5ldyBSZWFkYWJsZVN0cmVhbSh7XG4gICAgYXN5bmMgcHVsbChjb250cm9sbGVyKSB7XG4gICAgICBjb25zdCBjaHVuayA9IG5ldyBVaW50OEFycmF5KGNodW5rU2l6ZSk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZWFkID0gYXdhaXQgcmVhZGVyLnJlYWQoY2h1bmspO1xuICAgICAgICBpZiAocmVhZCA9PT0gbnVsbCkge1xuICAgICAgICAgIGlmIChpc0Nsb3NlcihyZWFkZXIpICYmIGF1dG9DbG9zZSkge1xuICAgICAgICAgICAgcmVhZGVyLmNsb3NlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRyb2xsZXIuY2xvc2UoKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKGNodW5rLnN1YmFycmF5KDAsIHJlYWQpKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29udHJvbGxlci5lcnJvcihlKTtcbiAgICAgICAgaWYgKGlzQ2xvc2VyKHJlYWRlcikpIHtcbiAgICAgICAgICByZWFkZXIuY2xvc2UoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgY2FuY2VsKCkge1xuICAgICAgaWYgKGlzQ2xvc2VyKHJlYWRlcikgJiYgYXV0b0Nsb3NlKSB7XG4gICAgICAgIHJlYWRlci5jbG9zZSgpO1xuICAgICAgfVxuICAgIH0sXG4gIH0sIHN0cmF0ZWd5KTtcbn1cblxuLyoqIFJlYWQgUmVhZGVyIGByYCB1bnRpbCBFT0YgKGBudWxsYCkgYW5kIHJlc29sdmUgdG8gdGhlIGNvbnRlbnQgYXNcbiAqIFVpbnQ4QXJyYXlgLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBCdWZmZXIgfSBmcm9tIFwiLi4vaW8vYnVmZmVyLnRzXCI7XG4gKiBpbXBvcnQgeyByZWFkQWxsIH0gZnJvbSBcIi4vY29udmVyc2lvbi50c1wiO1xuICpcbiAqIC8vIEV4YW1wbGUgZnJvbSBzdGRpblxuICogY29uc3Qgc3RkaW5Db250ZW50ID0gYXdhaXQgcmVhZEFsbChEZW5vLnN0ZGluKTtcbiAqXG4gKiAvLyBFeGFtcGxlIGZyb20gZmlsZVxuICogY29uc3QgZmlsZSA9IGF3YWl0IERlbm8ub3BlbihcIm15X2ZpbGUudHh0XCIsIHtyZWFkOiB0cnVlfSk7XG4gKiBjb25zdCBteUZpbGVDb250ZW50ID0gYXdhaXQgcmVhZEFsbChmaWxlKTtcbiAqIERlbm8uY2xvc2UoZmlsZS5yaWQpO1xuICpcbiAqIC8vIEV4YW1wbGUgZnJvbSBidWZmZXJcbiAqIGNvbnN0IG15RGF0YSA9IG5ldyBVaW50OEFycmF5KDEwMCk7XG4gKiAvLyAuLi4gZmlsbCBteURhdGEgYXJyYXkgd2l0aCBkYXRhXG4gKiBjb25zdCByZWFkZXIgPSBuZXcgQnVmZmVyKG15RGF0YS5idWZmZXIpO1xuICogY29uc3QgYnVmZmVyQ29udGVudCA9IGF3YWl0IHJlYWRBbGwocmVhZGVyKTtcbiAqIGBgYFxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZEFsbChyOiBEZW5vLlJlYWRlcik6IFByb21pc2U8VWludDhBcnJheT4ge1xuICBjb25zdCBidWYgPSBuZXcgQnVmZmVyKCk7XG4gIGF3YWl0IGJ1Zi5yZWFkRnJvbShyKTtcbiAgcmV0dXJuIGJ1Zi5ieXRlcygpO1xufVxuXG4vKiogU3luY2hyb25vdXNseSByZWFkcyBSZWFkZXIgYHJgIHVudGlsIEVPRiAoYG51bGxgKSBhbmQgcmV0dXJucyB0aGUgY29udGVudFxuICogYXMgYFVpbnQ4QXJyYXlgLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBCdWZmZXIgfSBmcm9tIFwiLi4vaW8vYnVmZmVyLnRzXCI7XG4gKiBpbXBvcnQgeyByZWFkQWxsU3luYyB9IGZyb20gXCIuL2NvbnZlcnNpb24udHNcIjtcbiAqXG4gKiAvLyBFeGFtcGxlIGZyb20gc3RkaW5cbiAqIGNvbnN0IHN0ZGluQ29udGVudCA9IHJlYWRBbGxTeW5jKERlbm8uc3RkaW4pO1xuICpcbiAqIC8vIEV4YW1wbGUgZnJvbSBmaWxlXG4gKiBjb25zdCBmaWxlID0gRGVuby5vcGVuU3luYyhcIm15X2ZpbGUudHh0XCIsIHtyZWFkOiB0cnVlfSk7XG4gKiBjb25zdCBteUZpbGVDb250ZW50ID0gcmVhZEFsbFN5bmMoZmlsZSk7XG4gKiBEZW5vLmNsb3NlKGZpbGUucmlkKTtcbiAqXG4gKiAvLyBFeGFtcGxlIGZyb20gYnVmZmVyXG4gKiBjb25zdCBteURhdGEgPSBuZXcgVWludDhBcnJheSgxMDApO1xuICogLy8gLi4uIGZpbGwgbXlEYXRhIGFycmF5IHdpdGggZGF0YVxuICogY29uc3QgcmVhZGVyID0gbmV3IEJ1ZmZlcihteURhdGEuYnVmZmVyKTtcbiAqIGNvbnN0IGJ1ZmZlckNvbnRlbnQgPSByZWFkQWxsU3luYyhyZWFkZXIpO1xuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkQWxsU3luYyhyOiBEZW5vLlJlYWRlclN5bmMpOiBVaW50OEFycmF5IHtcbiAgY29uc3QgYnVmID0gbmV3IEJ1ZmZlcigpO1xuICBidWYucmVhZEZyb21TeW5jKHIpO1xuICByZXR1cm4gYnVmLmJ5dGVzKCk7XG59XG5cbi8qKiBXcml0ZSBhbGwgdGhlIGNvbnRlbnQgb2YgdGhlIGFycmF5IGJ1ZmZlciAoYGFycmApIHRvIHRoZSB3cml0ZXIgKGB3YCkuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IEJ1ZmZlciB9IGZyb20gXCIuLi9pby9idWZmZXIudHNcIjtcbiAqIGltcG9ydCB7IHdyaXRlQWxsIH0gZnJvbSBcIi4vY29udmVyc2lvbi50c1wiO1xuXG4gKiAvLyBFeGFtcGxlIHdyaXRpbmcgdG8gc3Rkb3V0XG4gKiBsZXQgY29udGVudEJ5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFwiSGVsbG8gV29ybGRcIik7XG4gKiBhd2FpdCB3cml0ZUFsbChEZW5vLnN0ZG91dCwgY29udGVudEJ5dGVzKTtcbiAqXG4gKiAvLyBFeGFtcGxlIHdyaXRpbmcgdG8gZmlsZVxuICogY29udGVudEJ5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFwiSGVsbG8gV29ybGRcIik7XG4gKiBjb25zdCBmaWxlID0gYXdhaXQgRGVuby5vcGVuKCd0ZXN0LmZpbGUnLCB7d3JpdGU6IHRydWV9KTtcbiAqIGF3YWl0IHdyaXRlQWxsKGZpbGUsIGNvbnRlbnRCeXRlcyk7XG4gKiBEZW5vLmNsb3NlKGZpbGUucmlkKTtcbiAqXG4gKiAvLyBFeGFtcGxlIHdyaXRpbmcgdG8gYnVmZmVyXG4gKiBjb250ZW50Qnl0ZXMgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXCJIZWxsbyBXb3JsZFwiKTtcbiAqIGNvbnN0IHdyaXRlciA9IG5ldyBCdWZmZXIoKTtcbiAqIGF3YWl0IHdyaXRlQWxsKHdyaXRlciwgY29udGVudEJ5dGVzKTtcbiAqIGNvbnNvbGUubG9nKHdyaXRlci5ieXRlcygpLmxlbmd0aCk7ICAvLyAxMVxuICogYGBgXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3cml0ZUFsbCh3OiBEZW5vLldyaXRlciwgYXJyOiBVaW50OEFycmF5KSB7XG4gIGxldCBud3JpdHRlbiA9IDA7XG4gIHdoaWxlIChud3JpdHRlbiA8IGFyci5sZW5ndGgpIHtcbiAgICBud3JpdHRlbiArPSBhd2FpdCB3LndyaXRlKGFyci5zdWJhcnJheShud3JpdHRlbikpO1xuICB9XG59XG5cbi8qKiBTeW5jaHJvbm91c2x5IHdyaXRlIGFsbCB0aGUgY29udGVudCBvZiB0aGUgYXJyYXkgYnVmZmVyIChgYXJyYCkgdG8gdGhlXG4gKiB3cml0ZXIgKGB3YCkuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IEJ1ZmZlciB9IGZyb20gXCIuLi9pby9idWZmZXIudHNcIjtcbiAqIGltcG9ydCB7IHdyaXRlQWxsU3luYyB9IGZyb20gXCIuL2NvbnZlcnNpb24udHNcIjtcbiAqXG4gKiAvLyBFeGFtcGxlIHdyaXRpbmcgdG8gc3Rkb3V0XG4gKiBsZXQgY29udGVudEJ5dGVzID0gbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKFwiSGVsbG8gV29ybGRcIik7XG4gKiB3cml0ZUFsbFN5bmMoRGVuby5zdGRvdXQsIGNvbnRlbnRCeXRlcyk7XG4gKlxuICogLy8gRXhhbXBsZSB3cml0aW5nIHRvIGZpbGVcbiAqIGNvbnRlbnRCeXRlcyA9IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZShcIkhlbGxvIFdvcmxkXCIpO1xuICogY29uc3QgZmlsZSA9IERlbm8ub3BlblN5bmMoJ3Rlc3QuZmlsZScsIHt3cml0ZTogdHJ1ZX0pO1xuICogd3JpdGVBbGxTeW5jKGZpbGUsIGNvbnRlbnRCeXRlcyk7XG4gKiBEZW5vLmNsb3NlKGZpbGUucmlkKTtcbiAqXG4gKiAvLyBFeGFtcGxlIHdyaXRpbmcgdG8gYnVmZmVyXG4gKiBjb250ZW50Qnl0ZXMgPSBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoXCJIZWxsbyBXb3JsZFwiKTtcbiAqIGNvbnN0IHdyaXRlciA9IG5ldyBCdWZmZXIoKTtcbiAqIHdyaXRlQWxsU3luYyh3cml0ZXIsIGNvbnRlbnRCeXRlcyk7XG4gKiBjb25zb2xlLmxvZyh3cml0ZXIuYnl0ZXMoKS5sZW5ndGgpOyAgLy8gMTFcbiAqIGBgYFxuICovXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVBbGxTeW5jKHc6IERlbm8uV3JpdGVyU3luYywgYXJyOiBVaW50OEFycmF5KTogdm9pZCB7XG4gIGxldCBud3JpdHRlbiA9IDA7XG4gIHdoaWxlIChud3JpdHRlbiA8IGFyci5sZW5ndGgpIHtcbiAgICBud3JpdHRlbiArPSB3LndyaXRlU3luYyhhcnIuc3ViYXJyYXkobndyaXR0ZW4pKTtcbiAgfVxufVxuXG4vKiogVHVybnMgYSBSZWFkZXIsIGByYCwgaW50byBhbiBhc3luYyBpdGVyYXRvci5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgaXRlcmF0ZVJlYWRlciB9IGZyb20gXCIuL2NvbnZlcnNpb24udHNcIjtcbiAqXG4gKiBsZXQgZiA9IGF3YWl0IERlbm8ub3BlbihcIi9ldGMvcGFzc3dkXCIpO1xuICogZm9yIGF3YWl0IChjb25zdCBjaHVuayBvZiBpdGVyYXRlUmVhZGVyKGYpKSB7XG4gKiAgIGNvbnNvbGUubG9nKGNodW5rKTtcbiAqIH1cbiAqIGYuY2xvc2UoKTtcbiAqIGBgYFxuICpcbiAqIFNlY29uZCBhcmd1bWVudCBjYW4gYmUgdXNlZCB0byB0dW5lIHNpemUgb2YgYSBidWZmZXIuXG4gKiBEZWZhdWx0IHNpemUgb2YgdGhlIGJ1ZmZlciBpcyAzMmtCLlxuICpcbiAqIGBgYHRzXG4gKiBpbXBvcnQgeyBpdGVyYXRlUmVhZGVyIH0gZnJvbSBcIi4vY29udmVyc2lvbi50c1wiO1xuICpcbiAqIGxldCBmID0gYXdhaXQgRGVuby5vcGVuKFwiL2V0Yy9wYXNzd2RcIik7XG4gKiBjb25zdCBpdCA9IGl0ZXJhdGVSZWFkZXIoZiwge1xuICogICBidWZTaXplOiAxMDI0ICogMTAyNFxuICogfSk7XG4gKiBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIGl0KSB7XG4gKiAgIGNvbnNvbGUubG9nKGNodW5rKTtcbiAqIH1cbiAqIGYuY2xvc2UoKTtcbiAqIGBgYFxuICpcbiAqIEl0ZXJhdG9yIHVzZXMgYW4gaW50ZXJuYWwgYnVmZmVyIG9mIGZpeGVkIHNpemUgZm9yIGVmZmljaWVuY3k7IGl0IHJldHVybnNcbiAqIGEgdmlldyBvbiB0aGF0IGJ1ZmZlciBvbiBlYWNoIGl0ZXJhdGlvbi4gSXQgaXMgdGhlcmVmb3JlIGNhbGxlcidzXG4gKiByZXNwb25zaWJpbGl0eSB0byBjb3B5IGNvbnRlbnRzIG9mIHRoZSBidWZmZXIgaWYgbmVlZGVkOyBvdGhlcndpc2UgdGhlXG4gKiBuZXh0IGl0ZXJhdGlvbiB3aWxsIG92ZXJ3cml0ZSBjb250ZW50cyBvZiBwcmV2aW91c2x5IHJldHVybmVkIGNodW5rLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24qIGl0ZXJhdGVSZWFkZXIoXG4gIHI6IERlbm8uUmVhZGVyLFxuICBvcHRpb25zPzoge1xuICAgIGJ1ZlNpemU/OiBudW1iZXI7XG4gIH0sXG4pOiBBc3luY0l0ZXJhYmxlSXRlcmF0b3I8VWludDhBcnJheT4ge1xuICBjb25zdCBidWZTaXplID0gb3B0aW9ucz8uYnVmU2l6ZSA/PyBERUZBVUxUX0JVRkZFUl9TSVpFO1xuICBjb25zdCBiID0gbmV3IFVpbnQ4QXJyYXkoYnVmU2l6ZSk7XG4gIHdoaWxlICh0cnVlKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgci5yZWFkKGIpO1xuICAgIGlmIChyZXN1bHQgPT09IG51bGwpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHlpZWxkIGIuc3ViYXJyYXkoMCwgcmVzdWx0KTtcbiAgfVxufVxuXG4vKiogVHVybnMgYSBSZWFkZXJTeW5jLCBgcmAsIGludG8gYW4gaXRlcmF0b3IuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IGl0ZXJhdGVSZWFkZXJTeW5jIH0gZnJvbSBcIi4vY29udmVyc2lvbi50c1wiO1xuICpcbiAqIGxldCBmID0gRGVuby5vcGVuU3luYyhcIi9ldGMvcGFzc3dkXCIpO1xuICogZm9yIChjb25zdCBjaHVuayBvZiBpdGVyYXRlUmVhZGVyU3luYyhmKSkge1xuICogICBjb25zb2xlLmxvZyhjaHVuayk7XG4gKiB9XG4gKiBmLmNsb3NlKCk7XG4gKiBgYGBcbiAqXG4gKiBTZWNvbmQgYXJndW1lbnQgY2FuIGJlIHVzZWQgdG8gdHVuZSBzaXplIG9mIGEgYnVmZmVyLlxuICogRGVmYXVsdCBzaXplIG9mIHRoZSBidWZmZXIgaXMgMzJrQi5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgaXRlcmF0ZVJlYWRlclN5bmMgfSBmcm9tIFwiLi9jb252ZXJzaW9uLnRzXCI7XG5cbiAqIGxldCBmID0gYXdhaXQgRGVuby5vcGVuKFwiL2V0Yy9wYXNzd2RcIik7XG4gKiBjb25zdCBpdGVyID0gaXRlcmF0ZVJlYWRlclN5bmMoZiwge1xuICogICBidWZTaXplOiAxMDI0ICogMTAyNFxuICogfSk7XG4gKiBmb3IgKGNvbnN0IGNodW5rIG9mIGl0ZXIpIHtcbiAqICAgY29uc29sZS5sb2coY2h1bmspO1xuICogfVxuICogZi5jbG9zZSgpO1xuICogYGBgXG4gKlxuICogSXRlcmF0b3IgdXNlcyBhbiBpbnRlcm5hbCBidWZmZXIgb2YgZml4ZWQgc2l6ZSBmb3IgZWZmaWNpZW5jeTsgaXQgcmV0dXJuc1xuICogYSB2aWV3IG9uIHRoYXQgYnVmZmVyIG9uIGVhY2ggaXRlcmF0aW9uLiBJdCBpcyB0aGVyZWZvcmUgY2FsbGVyJ3NcbiAqIHJlc3BvbnNpYmlsaXR5IHRvIGNvcHkgY29udGVudHMgb2YgdGhlIGJ1ZmZlciBpZiBuZWVkZWQ7IG90aGVyd2lzZSB0aGVcbiAqIG5leHQgaXRlcmF0aW9uIHdpbGwgb3ZlcndyaXRlIGNvbnRlbnRzIG9mIHByZXZpb3VzbHkgcmV0dXJuZWQgY2h1bmsuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiogaXRlcmF0ZVJlYWRlclN5bmMoXG4gIHI6IERlbm8uUmVhZGVyU3luYyxcbiAgb3B0aW9ucz86IHtcbiAgICBidWZTaXplPzogbnVtYmVyO1xuICB9LFxuKTogSXRlcmFibGVJdGVyYXRvcjxVaW50OEFycmF5PiB7XG4gIGNvbnN0IGJ1ZlNpemUgPSBvcHRpb25zPy5idWZTaXplID8/IERFRkFVTFRfQlVGRkVSX1NJWkU7XG4gIGNvbnN0IGIgPSBuZXcgVWludDhBcnJheShidWZTaXplKTtcbiAgd2hpbGUgKHRydWUpIHtcbiAgICBjb25zdCByZXN1bHQgPSByLnJlYWRTeW5jKGIpO1xuICAgIGlmIChyZXN1bHQgPT09IG51bGwpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHlpZWxkIGIuc3ViYXJyYXkoMCwgcmVzdWx0KTtcbiAgfVxufVxuXG4vKiogQ29waWVzIGZyb20gYHNyY2AgdG8gYGRzdGAgdW50aWwgZWl0aGVyIEVPRiAoYG51bGxgKSBpcyByZWFkIGZyb20gYHNyY2Agb3JcbiAqIGFuIGVycm9yIG9jY3Vycy4gSXQgcmVzb2x2ZXMgdG8gdGhlIG51bWJlciBvZiBieXRlcyBjb3BpZWQgb3IgcmVqZWN0cyB3aXRoXG4gKiB0aGUgZmlyc3QgZXJyb3IgZW5jb3VudGVyZWQgd2hpbGUgY29weWluZy5cbiAqXG4gKiBgYGB0c1xuICogaW1wb3J0IHsgY29weSB9IGZyb20gXCIuL2NvbnZlcnNpb24udHNcIjtcbiAqXG4gKiBjb25zdCBzb3VyY2UgPSBhd2FpdCBEZW5vLm9wZW4oXCJteV9maWxlLnR4dFwiKTtcbiAqIGNvbnN0IGJ5dGVzQ29waWVkMSA9IGF3YWl0IGNvcHkoc291cmNlLCBEZW5vLnN0ZG91dCk7XG4gKiBjb25zdCBkZXN0aW5hdGlvbiA9IGF3YWl0IERlbm8uY3JlYXRlKFwibXlfZmlsZV8yLnR4dFwiKTtcbiAqIGNvbnN0IGJ5dGVzQ29waWVkMiA9IGF3YWl0IGNvcHkoc291cmNlLCBkZXN0aW5hdGlvbik7XG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0gc3JjIFRoZSBzb3VyY2UgdG8gY29weSBmcm9tXG4gKiBAcGFyYW0gZHN0IFRoZSBkZXN0aW5hdGlvbiB0byBjb3B5IHRvXG4gKiBAcGFyYW0gb3B0aW9ucyBDYW4gYmUgdXNlZCB0byB0dW5lIHNpemUgb2YgdGhlIGJ1ZmZlci4gRGVmYXVsdCBzaXplIGlzIDMya0JcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvcHkoXG4gIHNyYzogRGVuby5SZWFkZXIsXG4gIGRzdDogRGVuby5Xcml0ZXIsXG4gIG9wdGlvbnM/OiB7XG4gICAgYnVmU2l6ZT86IG51bWJlcjtcbiAgfSxcbik6IFByb21pc2U8bnVtYmVyPiB7XG4gIGxldCBuID0gMDtcbiAgY29uc3QgYnVmU2l6ZSA9IG9wdGlvbnM/LmJ1ZlNpemUgPz8gREVGQVVMVF9CVUZGRVJfU0laRTtcbiAgY29uc3QgYiA9IG5ldyBVaW50OEFycmF5KGJ1ZlNpemUpO1xuICBsZXQgZ290RU9GID0gZmFsc2U7XG4gIHdoaWxlIChnb3RFT0YgPT09IGZhbHNlKSB7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc3JjLnJlYWQoYik7XG4gICAgaWYgKHJlc3VsdCA9PT0gbnVsbCkge1xuICAgICAgZ290RU9GID0gdHJ1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGV0IG53cml0dGVuID0gMDtcbiAgICAgIHdoaWxlIChud3JpdHRlbiA8IHJlc3VsdCkge1xuICAgICAgICBud3JpdHRlbiArPSBhd2FpdCBkc3Qud3JpdGUoYi5zdWJhcnJheShud3JpdHRlbiwgcmVzdWx0KSk7XG4gICAgICB9XG4gICAgICBuICs9IG53cml0dGVuO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbjtcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxFQUEwRSxBQUExRSx3RUFBMEU7QUFFMUUsTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFpQjtBQUV4QyxLQUFLLENBQUMsa0JBQWtCLEdBQUcsS0FBTTtBQUNqQyxLQUFLLENBQUMsbUJBQW1CLEdBQUcsRUFBRSxHQUFHLElBQUk7U0FFNUIsUUFBUSxDQUFDLEtBQWMsRUFBd0IsQ0FBQztJQUN2RCxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssS0FBSyxDQUFRLFdBQUksS0FBSyxJQUFJLElBQUksSUFBSSxDQUFPLFVBQUksS0FBSyxJQUNuRSxFQUFtQyxBQUFuQyxpQ0FB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