// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.
import { assert } from "../_util/assert.ts";
import { BytesList } from "../bytes/bytes_list.ts";
import { concat, copy } from "../bytes/mod.ts";
// MIN_READ is the minimum ArrayBuffer size passed to a read call by
// buffer.ReadFrom. As long as the Buffer has at least MIN_READ bytes beyond
// what is required to hold the contents of r, readFrom() will not grow the
// underlying buffer.
const MIN_READ = 32 * 1024;
const MAX_SIZE = 2 ** 32 - 2;
/** A variable-sized buffer of bytes with `read()` and `write()` methods.
 *
 * Buffer is almost always used with some I/O like files and sockets. It allows
 * one to buffer up a download from a socket. Buffer grows and shrinks as
 * necessary.
 *
 * Buffer is NOT the same thing as Node's Buffer. Node's Buffer was created in
 * 2009 before JavaScript had the concept of ArrayBuffers. It's simply a
 * non-standard ArrayBuffer.
 *
 * ArrayBuffer is a fixed memory allocation. Buffer is implemented on top of
 * ArrayBuffer.
 *
 * Based on [Go Buffer](https://golang.org/pkg/bytes/#Buffer). */ export class Buffer {
    #buf;
    #off = 0;
    constructor(ab){
        this.#buf = ab === undefined ? new Uint8Array(0) : new Uint8Array(ab);
    }
    /** Returns a slice holding the unread portion of the buffer.
   *
   * The slice is valid for use only until the next buffer modification (that
   * is, only until the next call to a method like `read()`, `write()`,
   * `reset()`, or `truncate()`). If `options.copy` is false the slice aliases the buffer content at
   * least until the next buffer modification, so immediate changes to the
   * slice will affect the result of future reads.
   * @param options Defaults to `{ copy: true }`
   */ bytes(options = {
        copy: true
    }) {
        if (options.copy === false) return this.#buf.subarray(this.#off);
        return this.#buf.slice(this.#off);
    }
    /** Returns whether the unread portion of the buffer is empty. */ empty() {
        return this.#buf.byteLength <= this.#off;
    }
    /** A read only number of bytes of the unread portion of the buffer. */ get length() {
        return this.#buf.byteLength - this.#off;
    }
    /** The read only capacity of the buffer's underlying byte slice, that is,
   * the total space allocated for the buffer's data. */ get capacity() {
        return this.#buf.buffer.byteLength;
    }
    /** Discards all but the first `n` unread bytes from the buffer but
   * continues to use the same allocated storage. It throws if `n` is
   * negative or greater than the length of the buffer. */ truncate(n) {
        if (n === 0) {
            this.reset();
            return;
        }
        if (n < 0 || n > this.length) {
            throw Error("bytes.Buffer: truncation out of range");
        }
        this.#reslice(this.#off + n);
    }
    reset() {
        this.#reslice(0);
        this.#off = 0;
    }
     #tryGrowByReslice(n) {
        const l = this.#buf.byteLength;
        if (n <= this.capacity - l) {
            this.#reslice(l + n);
            return l;
        }
        return -1;
    }
     #reslice(len) {
        assert(len <= this.#buf.buffer.byteLength);
        this.#buf = new Uint8Array(this.#buf.buffer, 0, len);
    }
    /** Reads the next `p.length` bytes from the buffer or until the buffer is
   * drained. Returns the number of bytes read. If the buffer has no data to
   * return, the return is EOF (`null`). */ readSync(p) {
        if (this.empty()) {
            // Buffer is empty, reset to recover space.
            this.reset();
            if (p.byteLength === 0) {
                // this edge case is tested in 'bufferReadEmptyAtEOF' test
                return 0;
            }
            return null;
        }
        const nread = copy(this.#buf.subarray(this.#off), p);
        this.#off += nread;
        return nread;
    }
    /** Reads the next `p.length` bytes from the buffer or until the buffer is
   * drained. Resolves to the number of bytes read. If the buffer has no
   * data to return, resolves to EOF (`null`).
   *
   * NOTE: This methods reads bytes synchronously; it's provided for
   * compatibility with `Reader` interfaces.
   */ read(p) {
        const rr = this.readSync(p);
        return Promise.resolve(rr);
    }
    writeSync(p) {
        const m = this.#grow(p.byteLength);
        return copy(p, this.#buf, m);
    }
    /** NOTE: This methods writes bytes synchronously; it's provided for
   * compatibility with `Writer` interface. */ write(p) {
        const n = this.writeSync(p);
        return Promise.resolve(n);
    }
     #grow(n) {
        const m = this.length;
        // If buffer is empty, reset to recover space.
        if (m === 0 && this.#off !== 0) {
            this.reset();
        }
        // Fast: Try to grow by means of a reslice.
        const i = this.#tryGrowByReslice(n);
        if (i >= 0) {
            return i;
        }
        const c = this.capacity;
        if (n <= Math.floor(c / 2) - m) {
            // We can slide things down instead of allocating a new
            // ArrayBuffer. We only need m+n <= c to slide, but
            // we instead let capacity get twice as large so we
            // don't spend all our time copying.
            copy(this.#buf.subarray(this.#off), this.#buf);
        } else if (c + n > MAX_SIZE) {
            throw new Error("The buffer cannot be grown beyond the maximum size.");
        } else {
            // Not enough space anywhere, we need to allocate.
            const buf = new Uint8Array(Math.min(2 * c + n, MAX_SIZE));
            copy(this.#buf.subarray(this.#off), buf);
            this.#buf = buf;
        }
        // Restore this.#off and len(this.#buf).
        this.#off = 0;
        this.#reslice(Math.min(m + n, MAX_SIZE));
        return m;
    }
    /** Grows the buffer's capacity, if necessary, to guarantee space for
   * another `n` bytes. After `.grow(n)`, at least `n` bytes can be written to
   * the buffer without another allocation. If `n` is negative, `.grow()` will
   * throw. If the buffer can't grow it will throw an error.
   *
   * Based on Go Lang's
   * [Buffer.Grow](https://golang.org/pkg/bytes/#Buffer.Grow). */ grow(n) {
        if (n < 0) {
            throw Error("Buffer.grow: negative count");
        }
        const m = this.#grow(n);
        this.#reslice(m);
    }
    /** Reads data from `r` until EOF (`null`) and appends it to the buffer,
   * growing the buffer as needed. It resolves to the number of bytes read.
   * If the buffer becomes too large, `.readFrom()` will reject with an error.
   *
   * Based on Go Lang's
   * [Buffer.ReadFrom](https://golang.org/pkg/bytes/#Buffer.ReadFrom). */ async readFrom(r) {
        let n = 0;
        const tmp = new Uint8Array(MIN_READ);
        while(true){
            const shouldGrow = this.capacity - this.length < MIN_READ;
            // read into tmp buffer if there's not enough room
            // otherwise read directly into the internal buffer
            const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
            const nread = await r.read(buf);
            if (nread === null) {
                return n;
            }
            // write will grow if needed
            if (shouldGrow) this.writeSync(buf.subarray(0, nread));
            else this.#reslice(this.length + nread);
            n += nread;
        }
    }
    /** Reads data from `r` until EOF (`null`) and appends it to the buffer,
   * growing the buffer as needed. It returns the number of bytes read. If the
   * buffer becomes too large, `.readFromSync()` will throw an error.
   *
   * Based on Go Lang's
   * [Buffer.ReadFrom](https://golang.org/pkg/bytes/#Buffer.ReadFrom). */ readFromSync(r) {
        let n = 0;
        const tmp = new Uint8Array(MIN_READ);
        while(true){
            const shouldGrow = this.capacity - this.length < MIN_READ;
            // read into tmp buffer if there's not enough room
            // otherwise read directly into the internal buffer
            const buf = shouldGrow ? tmp : new Uint8Array(this.#buf.buffer, this.length);
            const nread = r.readSync(buf);
            if (nread === null) {
                return n;
            }
            // write will grow if needed
            if (shouldGrow) this.writeSync(buf.subarray(0, nread));
            else this.#reslice(this.length + nread);
            n += nread;
        }
    }
}
const DEFAULT_BUF_SIZE = 4096;
const MIN_BUF_SIZE = 16;
const MAX_CONSECUTIVE_EMPTY_READS = 100;
const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);
export class BufferFullError extends Error {
    partial;
    name = "BufferFullError";
    constructor(partial){
        super("Buffer full");
        this.partial = partial;
    }
}
export class PartialReadError extends Error {
    name = "PartialReadError";
    partial;
    constructor(){
        super("Encountered UnexpectedEof, data only partially read");
    }
}
/** BufReader implements buffering for a Reader object. */ export class BufReader {
    #buf;
    #rd;
    #r = 0;
    #w = 0;
    #eof = false;
    // private lastByte: number;
    // private lastCharSize: number;
    /** return new BufReader unless r is BufReader */ static create(r, size = DEFAULT_BUF_SIZE) {
        return r instanceof BufReader ? r : new BufReader(r, size);
    }
    constructor(rd, size = DEFAULT_BUF_SIZE){
        if (size < MIN_BUF_SIZE) {
            size = MIN_BUF_SIZE;
        }
        this.#reset(new Uint8Array(size), rd);
    }
    /** Returns the size of the underlying buffer in bytes. */ size() {
        return this.#buf.byteLength;
    }
    buffered() {
        return this.#w - this.#r;
    }
    // Reads a new chunk into the buffer.
    #fill = async ()=>{
        // Slide existing data to beginning.
        if (this.#r > 0) {
            this.#buf.copyWithin(0, this.#r, this.#w);
            this.#w -= this.#r;
            this.#r = 0;
        }
        if (this.#w >= this.#buf.byteLength) {
            throw Error("bufio: tried to fill full buffer");
        }
        // Read new data: try a limited number of times.
        for(let i = MAX_CONSECUTIVE_EMPTY_READS; i > 0; i--){
            const rr = await this.#rd.read(this.#buf.subarray(this.#w));
            if (rr === null) {
                this.#eof = true;
                return;
            }
            assert(rr >= 0, "negative read");
            this.#w += rr;
            if (rr > 0) {
                return;
            }
        }
        throw new Error(`No progress after ${MAX_CONSECUTIVE_EMPTY_READS} read() calls`);
    };
    /** Discards any buffered data, resets all state, and switches
   * the buffered reader to read from r.
   */ reset(r) {
        this.#reset(this.#buf, r);
    }
    #reset = (buf, rd)=>{
        this.#buf = buf;
        this.#rd = rd;
        this.#eof = false;
    // this.lastByte = -1;
    // this.lastCharSize = -1;
    };
    /** reads data into p.
   * It returns the number of bytes read into p.
   * The bytes are taken from at most one Read on the underlying Reader,
   * hence n may be less than len(p).
   * To read exactly len(p) bytes, use io.ReadFull(b, p).
   */ async read(p) {
        let rr = p.byteLength;
        if (p.byteLength === 0) return rr;
        if (this.#r === this.#w) {
            if (p.byteLength >= this.#buf.byteLength) {
                // Large read, empty buffer.
                // Read directly into p to avoid copy.
                const rr = await this.#rd.read(p);
                const nread = rr ?? 0;
                assert(nread >= 0, "negative read");
                // if (rr.nread > 0) {
                //   this.lastByte = p[rr.nread - 1];
                //   this.lastCharSize = -1;
                // }
                return rr;
            }
            // One read.
            // Do not use this.fill, which will loop.
            this.#r = 0;
            this.#w = 0;
            rr = await this.#rd.read(this.#buf);
            if (rr === 0 || rr === null) return rr;
            assert(rr >= 0, "negative read");
            this.#w += rr;
        }
        // copy as much as we can
        const copied = copy(this.#buf.subarray(this.#r, this.#w), p, 0);
        this.#r += copied;
        // this.lastByte = this.buf[this.r - 1];
        // this.lastCharSize = -1;
        return copied;
    }
    /** reads exactly `p.length` bytes into `p`.
   *
   * If successful, `p` is returned.
   *
   * If the end of the underlying stream has been reached, and there are no more
   * bytes available in the buffer, `readFull()` returns `null` instead.
   *
   * An error is thrown if some bytes could be read, but not enough to fill `p`
   * entirely before the underlying stream reported an error or EOF. Any error
   * thrown will have a `partial` property that indicates the slice of the
   * buffer that has been successfully filled with data.
   *
   * Ported from https://golang.org/pkg/io/#ReadFull
   */ async readFull(p) {
        let bytesRead = 0;
        while(bytesRead < p.length){
            try {
                const rr = await this.read(p.subarray(bytesRead));
                if (rr === null) {
                    if (bytesRead === 0) {
                        return null;
                    } else {
                        throw new PartialReadError();
                    }
                }
                bytesRead += rr;
            } catch (err) {
                if (err instanceof PartialReadError) {
                    err.partial = p.subarray(0, bytesRead);
                } else if (err instanceof Error) {
                    const e = new PartialReadError();
                    e.partial = p.subarray(0, bytesRead);
                    e.stack = err.stack;
                    e.message = err.message;
                    e.cause = err.cause;
                    throw err;
                }
                throw err;
            }
        }
        return p;
    }
    /** Returns the next byte [0, 255] or `null`. */ async readByte() {
        while(this.#r === this.#w){
            if (this.#eof) return null;
            await this.#fill(); // buffer is empty.
        }
        const c = this.#buf[this.#r];
        this.#r++;
        // this.lastByte = c;
        return c;
    }
    /** readString() reads until the first occurrence of delim in the input,
   * returning a string containing the data up to and including the delimiter.
   * If ReadString encounters an error before finding a delimiter,
   * it returns the data read before the error and the error itself
   * (often `null`).
   * ReadString returns err != nil if and only if the returned data does not end
   * in delim.
   * For simple uses, a Scanner may be more convenient.
   */ async readString(delim) {
        if (delim.length !== 1) {
            throw new Error("Delimiter should be a single character");
        }
        const buffer = await this.readSlice(delim.charCodeAt(0));
        if (buffer === null) return null;
        return new TextDecoder().decode(buffer);
    }
    /** `readLine()` is a low-level line-reading primitive. Most callers should
   * use `readString('\n')` instead or use a Scanner.
   *
   * `readLine()` tries to return a single line, not including the end-of-line
   * bytes. If the line was too long for the buffer then `more` is set and the
   * beginning of the line is returned. The rest of the line will be returned
   * from future calls. `more` will be false when returning the last fragment
   * of the line. The returned buffer is only valid until the next call to
   * `readLine()`.
   *
   * The text returned from ReadLine does not include the line end ("\r\n" or
   * "\n").
   *
   * When the end of the underlying stream is reached, the final bytes in the
   * stream are returned. No indication or error is given if the input ends
   * without a final line end. When there are no more trailing bytes to read,
   * `readLine()` returns `null`.
   *
   * Calling `unreadByte()` after `readLine()` will always unread the last byte
   * read (possibly a character belonging to the line end) even if that byte is
   * not part of the line returned by `readLine()`.
   */ async readLine() {
        let line = null;
        try {
            line = await this.readSlice(LF);
        } catch (err) {
            if (err instanceof Deno.errors.BadResource) {
                throw err;
            }
            let partial;
            if (err instanceof PartialReadError) {
                partial = err.partial;
                assert(partial instanceof Uint8Array, "bufio: caught error from `readSlice()` without `partial` property");
            }
            // Don't throw if `readSlice()` failed with `BufferFullError`, instead we
            // just return whatever is available and set the `more` flag.
            if (!(err instanceof BufferFullError)) {
                throw err;
            }
            partial = err.partial;
            // Handle the case where "\r\n" straddles the buffer.
            if (!this.#eof && partial && partial.byteLength > 0 && partial[partial.byteLength - 1] === CR) {
                // Put the '\r' back on buf and drop it from line.
                // Let the next call to ReadLine check for "\r\n".
                assert(this.#r > 0, "bufio: tried to rewind past start of buffer");
                this.#r--;
                partial = partial.subarray(0, partial.byteLength - 1);
            }
            if (partial) {
                return {
                    line: partial,
                    more: !this.#eof
                };
            }
        }
        if (line === null) {
            return null;
        }
        if (line.byteLength === 0) {
            return {
                line,
                more: false
            };
        }
        if (line[line.byteLength - 1] == LF) {
            let drop = 1;
            if (line.byteLength > 1 && line[line.byteLength - 2] === CR) {
                drop = 2;
            }
            line = line.subarray(0, line.byteLength - drop);
        }
        return {
            line,
            more: false
        };
    }
    /** `readSlice()` reads until the first occurrence of `delim` in the input,
   * returning a slice pointing at the bytes in the buffer. The bytes stop
   * being valid at the next read.
   *
   * If `readSlice()` encounters an error before finding a delimiter, or the
   * buffer fills without finding a delimiter, it throws an error with a
   * `partial` property that contains the entire buffer.
   *
   * If `readSlice()` encounters the end of the underlying stream and there are
   * any bytes left in the buffer, the rest of the buffer is returned. In other
   * words, EOF is always treated as a delimiter. Once the buffer is empty,
   * it returns `null`.
   *
   * Because the data returned from `readSlice()` will be overwritten by the
   * next I/O operation, most clients should use `readString()` instead.
   */ async readSlice(delim) {
        let s = 0; // search start index
        let slice;
        while(true){
            // Search buffer.
            let i = this.#buf.subarray(this.#r + s, this.#w).indexOf(delim);
            if (i >= 0) {
                i += s;
                slice = this.#buf.subarray(this.#r, this.#r + i + 1);
                this.#r += i + 1;
                break;
            }
            // EOF?
            if (this.#eof) {
                if (this.#r === this.#w) {
                    return null;
                }
                slice = this.#buf.subarray(this.#r, this.#w);
                this.#r = this.#w;
                break;
            }
            // Buffer full?
            if (this.buffered() >= this.#buf.byteLength) {
                this.#r = this.#w;
                // #4521 The internal buffer should not be reused across reads because it causes corruption of data.
                const oldbuf = this.#buf;
                const newbuf = this.#buf.slice(0);
                this.#buf = newbuf;
                throw new BufferFullError(oldbuf);
            }
            s = this.#w - this.#r; // do not rescan area we scanned before
            // Buffer is not full.
            try {
                await this.#fill();
            } catch (err) {
                if (err instanceof PartialReadError) {
                    err.partial = slice;
                } else if (err instanceof Error) {
                    const e = new PartialReadError();
                    e.partial = slice;
                    e.stack = err.stack;
                    e.message = err.message;
                    e.cause = err.cause;
                    throw err;
                }
                throw err;
            }
        }
        // Handle last byte, if any.
        // const i = slice.byteLength - 1;
        // if (i >= 0) {
        //   this.lastByte = slice[i];
        //   this.lastCharSize = -1
        // }
        return slice;
    }
    /** `peek()` returns the next `n` bytes without advancing the reader. The
   * bytes stop being valid at the next read call.
   *
   * When the end of the underlying stream is reached, but there are unread
   * bytes left in the buffer, those bytes are returned. If there are no bytes
   * left in the buffer, it returns `null`.
   *
   * If an error is encountered before `n` bytes are available, `peek()` throws
   * an error with the `partial` property set to a slice of the buffer that
   * contains the bytes that were available before the error occurred.
   */ async peek(n) {
        if (n < 0) {
            throw Error("negative count");
        }
        let avail = this.#w - this.#r;
        while(avail < n && avail < this.#buf.byteLength && !this.#eof){
            try {
                await this.#fill();
            } catch (err) {
                if (err instanceof PartialReadError) {
                    err.partial = this.#buf.subarray(this.#r, this.#w);
                } else if (err instanceof Error) {
                    const e = new PartialReadError();
                    e.partial = this.#buf.subarray(this.#r, this.#w);
                    e.stack = err.stack;
                    e.message = err.message;
                    e.cause = err.cause;
                    throw err;
                }
                throw err;
            }
            avail = this.#w - this.#r;
        }
        if (avail === 0 && this.#eof) {
            return null;
        } else if (avail < n && this.#eof) {
            return this.#buf.subarray(this.#r, this.#r + avail);
        } else if (avail < n) {
            throw new BufferFullError(this.#buf.subarray(this.#r, this.#w));
        }
        return this.#buf.subarray(this.#r, this.#r + n);
    }
}
class AbstractBufBase {
    buf;
    usedBufferBytes = 0;
    err = null;
    constructor(buf){
        this.buf = buf;
    }
    /** Size returns the size of the underlying buffer in bytes. */ size() {
        return this.buf.byteLength;
    }
    /** Returns how many bytes are unused in the buffer. */ available() {
        return this.buf.byteLength - this.usedBufferBytes;
    }
    /** buffered returns the number of bytes that have been written into the
   * current buffer.
   */ buffered() {
        return this.usedBufferBytes;
    }
}
/** BufWriter implements buffering for an deno.Writer object.
 * If an error occurs writing to a Writer, no more data will be
 * accepted and all subsequent writes, and flush(), will return the error.
 * After all data has been written, the client should call the
 * flush() method to guarantee all data has been forwarded to
 * the underlying deno.Writer.
 */ export class BufWriter extends AbstractBufBase {
    #writer;
    /** return new BufWriter unless writer is BufWriter */ static create(writer, size = DEFAULT_BUF_SIZE) {
        return writer instanceof BufWriter ? writer : new BufWriter(writer, size);
    }
    constructor(writer, size = DEFAULT_BUF_SIZE){
        if (size <= 0) {
            size = DEFAULT_BUF_SIZE;
        }
        const buf = new Uint8Array(size);
        super(buf);
        this.#writer = writer;
    }
    /** Discards any unflushed buffered data, clears any error, and
   * resets buffer to write its output to w.
   */ reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.#writer = w;
    }
    /** Flush writes any buffered data to the underlying io.Writer. */ async flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            const p = this.buf.subarray(0, this.usedBufferBytes);
            let nwritten = 0;
            while(nwritten < p.length){
                nwritten += await this.#writer.write(p.subarray(nwritten));
            }
        } catch (e) {
            if (e instanceof Error) {
                this.err = e;
            }
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    /** Writes the contents of `data` into the buffer.  If the contents won't fully
   * fit into the buffer, those bytes that can are copied into the buffer, the
   * buffer is the flushed to the writer and the remaining bytes are copied into
   * the now empty buffer.
   *
   * @return the number of bytes written to the buffer.
   */ async write(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                // Large write, empty buffer.
                // Write directly from data to avoid copy.
                try {
                    numBytesWritten = await this.#writer.write(data);
                } catch (e) {
                    if (e instanceof Error) {
                        this.err = e;
                    }
                    throw e;
                }
            } else {
                numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                await this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
/** BufWriterSync implements buffering for a deno.WriterSync object.
 * If an error occurs writing to a WriterSync, no more data will be
 * accepted and all subsequent writes, and flush(), will return the error.
 * After all data has been written, the client should call the
 * flush() method to guarantee all data has been forwarded to
 * the underlying deno.WriterSync.
 */ export class BufWriterSync extends AbstractBufBase {
    #writer;
    /** return new BufWriterSync unless writer is BufWriterSync */ static create(writer, size = DEFAULT_BUF_SIZE) {
        return writer instanceof BufWriterSync ? writer : new BufWriterSync(writer, size);
    }
    constructor(writer, size = DEFAULT_BUF_SIZE){
        if (size <= 0) {
            size = DEFAULT_BUF_SIZE;
        }
        const buf = new Uint8Array(size);
        super(buf);
        this.#writer = writer;
    }
    /** Discards any unflushed buffered data, clears any error, and
   * resets buffer to write its output to w.
   */ reset(w) {
        this.err = null;
        this.usedBufferBytes = 0;
        this.#writer = w;
    }
    /** Flush writes any buffered data to the underlying io.WriterSync. */ flush() {
        if (this.err !== null) throw this.err;
        if (this.usedBufferBytes === 0) return;
        try {
            const p = this.buf.subarray(0, this.usedBufferBytes);
            let nwritten = 0;
            while(nwritten < p.length){
                nwritten += this.#writer.writeSync(p.subarray(nwritten));
            }
        } catch (e) {
            if (e instanceof Error) {
                this.err = e;
            }
            throw e;
        }
        this.buf = new Uint8Array(this.buf.length);
        this.usedBufferBytes = 0;
    }
    /** Writes the contents of `data` into the buffer.  If the contents won't fully
   * fit into the buffer, those bytes that can are copied into the buffer, the
   * buffer is the flushed to the writer and the remaining bytes are copied into
   * the now empty buffer.
   *
   * @return the number of bytes written to the buffer.
   */ writeSync(data) {
        if (this.err !== null) throw this.err;
        if (data.length === 0) return 0;
        let totalBytesWritten = 0;
        let numBytesWritten = 0;
        while(data.byteLength > this.available()){
            if (this.buffered() === 0) {
                // Large write, empty buffer.
                // Write directly from data to avoid copy.
                try {
                    numBytesWritten = this.#writer.writeSync(data);
                } catch (e) {
                    if (e instanceof Error) {
                        this.err = e;
                    }
                    throw e;
                }
            } else {
                numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
                this.usedBufferBytes += numBytesWritten;
                this.flush();
            }
            totalBytesWritten += numBytesWritten;
            data = data.subarray(numBytesWritten);
        }
        numBytesWritten = copy(data, this.buf, this.usedBufferBytes);
        this.usedBufferBytes += numBytesWritten;
        totalBytesWritten += numBytesWritten;
        return totalBytesWritten;
    }
}
/** Generate longest proper prefix which is also suffix array. */ function createLPS(pat) {
    const lps = new Uint8Array(pat.length);
    lps[0] = 0;
    let prefixEnd = 0;
    let i = 1;
    while(i < lps.length){
        if (pat[i] == pat[prefixEnd]) {
            prefixEnd++;
            lps[i] = prefixEnd;
            i++;
        } else if (prefixEnd === 0) {
            lps[i] = 0;
            i++;
        } else {
            prefixEnd = lps[prefixEnd - 1];
        }
    }
    return lps;
}
/** Read delimited bytes from a Reader. */ export async function* readDelim(reader, delim) {
    // Avoid unicode problems
    const delimLen = delim.length;
    const delimLPS = createLPS(delim);
    const chunks = new BytesList();
    const bufSize = Math.max(1024, delimLen + 1);
    // Modified KMP
    let inspectIndex = 0;
    let matchIndex = 0;
    while(true){
        const inspectArr = new Uint8Array(bufSize);
        const result = await reader.read(inspectArr);
        if (result === null) {
            // Yield last chunk.
            yield chunks.concat();
            return;
        } else if (result < 0) {
            // Discard all remaining and silently fail.
            return;
        }
        chunks.add(inspectArr, 0, result);
        let localIndex = 0;
        while(inspectIndex < chunks.size()){
            if (inspectArr[localIndex] === delim[matchIndex]) {
                inspectIndex++;
                localIndex++;
                matchIndex++;
                if (matchIndex === delimLen) {
                    // Full match
                    const matchEnd = inspectIndex - delimLen;
                    const readyBytes = chunks.slice(0, matchEnd);
                    yield readyBytes;
                    // Reset match, different from KMP.
                    chunks.shift(inspectIndex);
                    inspectIndex = 0;
                    matchIndex = 0;
                }
            } else {
                if (matchIndex === 0) {
                    inspectIndex++;
                    localIndex++;
                } else {
                    matchIndex = delimLPS[matchIndex - 1];
                }
            }
        }
    }
}
/** Read delimited strings from a Reader. */ export async function* readStringDelim(reader, delim, decoderOpts) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder(decoderOpts?.encoding, decoderOpts);
    for await (const chunk of readDelim(reader, encoder.encode(delim))){
        yield decoder.decode(chunk);
    }
}
/** Read strings line-by-line from a Reader. */ export async function* readLines(reader, decoderOpts) {
    const bufReader = new BufReader(reader);
    let chunks = [];
    const decoder = new TextDecoder(decoderOpts?.encoding, decoderOpts);
    while(true){
        const res = await bufReader.readLine();
        if (!res) {
            if (chunks.length > 0) {
                yield decoder.decode(concat(...chunks));
            }
            break;
        }
        chunks.push(res.line);
        if (!res.more) {
            yield decoder.decode(concat(...chunks));
            chunks = [];
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjExOC4wL2lvL2J1ZmZlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIxIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcIi4uL191dGlsL2Fzc2VydC50c1wiO1xuaW1wb3J0IHsgQnl0ZXNMaXN0IH0gZnJvbSBcIi4uL2J5dGVzL2J5dGVzX2xpc3QudHNcIjtcbmltcG9ydCB7IGNvbmNhdCwgY29weSB9IGZyb20gXCIuLi9ieXRlcy9tb2QudHNcIjtcbmltcG9ydCB0eXBlIHsgUmVhZGVyLCBSZWFkZXJTeW5jLCBXcml0ZXIsIFdyaXRlclN5bmMgfSBmcm9tIFwiLi90eXBlcy5kLnRzXCI7XG5cbi8vIE1JTl9SRUFEIGlzIHRoZSBtaW5pbXVtIEFycmF5QnVmZmVyIHNpemUgcGFzc2VkIHRvIGEgcmVhZCBjYWxsIGJ5XG4vLyBidWZmZXIuUmVhZEZyb20uIEFzIGxvbmcgYXMgdGhlIEJ1ZmZlciBoYXMgYXQgbGVhc3QgTUlOX1JFQUQgYnl0ZXMgYmV5b25kXG4vLyB3aGF0IGlzIHJlcXVpcmVkIHRvIGhvbGQgdGhlIGNvbnRlbnRzIG9mIHIsIHJlYWRGcm9tKCkgd2lsbCBub3QgZ3JvdyB0aGVcbi8vIHVuZGVybHlpbmcgYnVmZmVyLlxuY29uc3QgTUlOX1JFQUQgPSAzMiAqIDEwMjQ7XG5jb25zdCBNQVhfU0laRSA9IDIgKiogMzIgLSAyO1xuXG4vKiogQSB2YXJpYWJsZS1zaXplZCBidWZmZXIgb2YgYnl0ZXMgd2l0aCBgcmVhZCgpYCBhbmQgYHdyaXRlKClgIG1ldGhvZHMuXG4gKlxuICogQnVmZmVyIGlzIGFsbW9zdCBhbHdheXMgdXNlZCB3aXRoIHNvbWUgSS9PIGxpa2UgZmlsZXMgYW5kIHNvY2tldHMuIEl0IGFsbG93c1xuICogb25lIHRvIGJ1ZmZlciB1cCBhIGRvd25sb2FkIGZyb20gYSBzb2NrZXQuIEJ1ZmZlciBncm93cyBhbmQgc2hyaW5rcyBhc1xuICogbmVjZXNzYXJ5LlxuICpcbiAqIEJ1ZmZlciBpcyBOT1QgdGhlIHNhbWUgdGhpbmcgYXMgTm9kZSdzIEJ1ZmZlci4gTm9kZSdzIEJ1ZmZlciB3YXMgY3JlYXRlZCBpblxuICogMjAwOSBiZWZvcmUgSmF2YVNjcmlwdCBoYWQgdGhlIGNvbmNlcHQgb2YgQXJyYXlCdWZmZXJzLiBJdCdzIHNpbXBseSBhXG4gKiBub24tc3RhbmRhcmQgQXJyYXlCdWZmZXIuXG4gKlxuICogQXJyYXlCdWZmZXIgaXMgYSBmaXhlZCBtZW1vcnkgYWxsb2NhdGlvbi4gQnVmZmVyIGlzIGltcGxlbWVudGVkIG9uIHRvcCBvZlxuICogQXJyYXlCdWZmZXIuXG4gKlxuICogQmFzZWQgb24gW0dvIEJ1ZmZlcl0oaHR0cHM6Ly9nb2xhbmcub3JnL3BrZy9ieXRlcy8jQnVmZmVyKS4gKi9cblxuZXhwb3J0IGNsYXNzIEJ1ZmZlciB7XG4gICNidWY6IFVpbnQ4QXJyYXk7IC8vIGNvbnRlbnRzIGFyZSB0aGUgYnl0ZXMgYnVmW29mZiA6IGxlbihidWYpXVxuICAjb2ZmID0gMDsgLy8gcmVhZCBhdCBidWZbb2ZmXSwgd3JpdGUgYXQgYnVmW2J1Zi5ieXRlTGVuZ3RoXVxuXG4gIGNvbnN0cnVjdG9yKGFiPzogQXJyYXlCdWZmZXJMaWtlIHwgQXJyYXlMaWtlPG51bWJlcj4pIHtcbiAgICB0aGlzLiNidWYgPSBhYiA9PT0gdW5kZWZpbmVkID8gbmV3IFVpbnQ4QXJyYXkoMCkgOiBuZXcgVWludDhBcnJheShhYik7XG4gIH1cblxuICAvKiogUmV0dXJucyBhIHNsaWNlIGhvbGRpbmcgdGhlIHVucmVhZCBwb3J0aW9uIG9mIHRoZSBidWZmZXIuXG4gICAqXG4gICAqIFRoZSBzbGljZSBpcyB2YWxpZCBmb3IgdXNlIG9ubHkgdW50aWwgdGhlIG5leHQgYnVmZmVyIG1vZGlmaWNhdGlvbiAodGhhdFxuICAgKiBpcywgb25seSB1bnRpbCB0aGUgbmV4dCBjYWxsIHRvIGEgbWV0aG9kIGxpa2UgYHJlYWQoKWAsIGB3cml0ZSgpYCxcbiAgICogYHJlc2V0KClgLCBvciBgdHJ1bmNhdGUoKWApLiBJZiBgb3B0aW9ucy5jb3B5YCBpcyBmYWxzZSB0aGUgc2xpY2UgYWxpYXNlcyB0aGUgYnVmZmVyIGNvbnRlbnQgYXRcbiAgICogbGVhc3QgdW50aWwgdGhlIG5leHQgYnVmZmVyIG1vZGlmaWNhdGlvbiwgc28gaW1tZWRpYXRlIGNoYW5nZXMgdG8gdGhlXG4gICAqIHNsaWNlIHdpbGwgYWZmZWN0IHRoZSByZXN1bHQgb2YgZnV0dXJlIHJlYWRzLlxuICAgKiBAcGFyYW0gb3B0aW9ucyBEZWZhdWx0cyB0byBgeyBjb3B5OiB0cnVlIH1gXG4gICAqL1xuICBieXRlcyhvcHRpb25zID0geyBjb3B5OiB0cnVlIH0pOiBVaW50OEFycmF5IHtcbiAgICBpZiAob3B0aW9ucy5jb3B5ID09PSBmYWxzZSkgcmV0dXJuIHRoaXMuI2J1Zi5zdWJhcnJheSh0aGlzLiNvZmYpO1xuICAgIHJldHVybiB0aGlzLiNidWYuc2xpY2UodGhpcy4jb2ZmKTtcbiAgfVxuXG4gIC8qKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHVucmVhZCBwb3J0aW9uIG9mIHRoZSBidWZmZXIgaXMgZW1wdHkuICovXG4gIGVtcHR5KCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLiNidWYuYnl0ZUxlbmd0aCA8PSB0aGlzLiNvZmY7XG4gIH1cblxuICAvKiogQSByZWFkIG9ubHkgbnVtYmVyIG9mIGJ5dGVzIG9mIHRoZSB1bnJlYWQgcG9ydGlvbiBvZiB0aGUgYnVmZmVyLiAqL1xuICBnZXQgbGVuZ3RoKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuI2J1Zi5ieXRlTGVuZ3RoIC0gdGhpcy4jb2ZmO1xuICB9XG5cbiAgLyoqIFRoZSByZWFkIG9ubHkgY2FwYWNpdHkgb2YgdGhlIGJ1ZmZlcidzIHVuZGVybHlpbmcgYnl0ZSBzbGljZSwgdGhhdCBpcyxcbiAgICogdGhlIHRvdGFsIHNwYWNlIGFsbG9jYXRlZCBmb3IgdGhlIGJ1ZmZlcidzIGRhdGEuICovXG4gIGdldCBjYXBhY2l0eSgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiNidWYuYnVmZmVyLmJ5dGVMZW5ndGg7XG4gIH1cblxuICAvKiogRGlzY2FyZHMgYWxsIGJ1dCB0aGUgZmlyc3QgYG5gIHVucmVhZCBieXRlcyBmcm9tIHRoZSBidWZmZXIgYnV0XG4gICAqIGNvbnRpbnVlcyB0byB1c2UgdGhlIHNhbWUgYWxsb2NhdGVkIHN0b3JhZ2UuIEl0IHRocm93cyBpZiBgbmAgaXNcbiAgICogbmVnYXRpdmUgb3IgZ3JlYXRlciB0aGFuIHRoZSBsZW5ndGggb2YgdGhlIGJ1ZmZlci4gKi9cbiAgdHJ1bmNhdGUobjogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKG4gPT09IDApIHtcbiAgICAgIHRoaXMucmVzZXQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKG4gPCAwIHx8IG4gPiB0aGlzLmxlbmd0aCkge1xuICAgICAgdGhyb3cgRXJyb3IoXCJieXRlcy5CdWZmZXI6IHRydW5jYXRpb24gb3V0IG9mIHJhbmdlXCIpO1xuICAgIH1cbiAgICB0aGlzLiNyZXNsaWNlKHRoaXMuI29mZiArIG4pO1xuICB9XG5cbiAgcmVzZXQoKTogdm9pZCB7XG4gICAgdGhpcy4jcmVzbGljZSgwKTtcbiAgICB0aGlzLiNvZmYgPSAwO1xuICB9XG5cbiAgI3RyeUdyb3dCeVJlc2xpY2UobjogbnVtYmVyKSB7XG4gICAgY29uc3QgbCA9IHRoaXMuI2J1Zi5ieXRlTGVuZ3RoO1xuICAgIGlmIChuIDw9IHRoaXMuY2FwYWNpdHkgLSBsKSB7XG4gICAgICB0aGlzLiNyZXNsaWNlKGwgKyBuKTtcbiAgICAgIHJldHVybiBsO1xuICAgIH1cbiAgICByZXR1cm4gLTE7XG4gIH1cblxuICAjcmVzbGljZShsZW46IG51bWJlcikge1xuICAgIGFzc2VydChsZW4gPD0gdGhpcy4jYnVmLmJ1ZmZlci5ieXRlTGVuZ3RoKTtcbiAgICB0aGlzLiNidWYgPSBuZXcgVWludDhBcnJheSh0aGlzLiNidWYuYnVmZmVyLCAwLCBsZW4pO1xuICB9XG5cbiAgLyoqIFJlYWRzIHRoZSBuZXh0IGBwLmxlbmd0aGAgYnl0ZXMgZnJvbSB0aGUgYnVmZmVyIG9yIHVudGlsIHRoZSBidWZmZXIgaXNcbiAgICogZHJhaW5lZC4gUmV0dXJucyB0aGUgbnVtYmVyIG9mIGJ5dGVzIHJlYWQuIElmIHRoZSBidWZmZXIgaGFzIG5vIGRhdGEgdG9cbiAgICogcmV0dXJuLCB0aGUgcmV0dXJuIGlzIEVPRiAoYG51bGxgKS4gKi9cbiAgcmVhZFN5bmMocDogVWludDhBcnJheSk6IG51bWJlciB8IG51bGwge1xuICAgIGlmICh0aGlzLmVtcHR5KCkpIHtcbiAgICAgIC8vIEJ1ZmZlciBpcyBlbXB0eSwgcmVzZXQgdG8gcmVjb3ZlciBzcGFjZS5cbiAgICAgIHRoaXMucmVzZXQoKTtcbiAgICAgIGlmIChwLmJ5dGVMZW5ndGggPT09IDApIHtcbiAgICAgICAgLy8gdGhpcyBlZGdlIGNhc2UgaXMgdGVzdGVkIGluICdidWZmZXJSZWFkRW1wdHlBdEVPRicgdGVzdFxuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBjb25zdCBucmVhZCA9IGNvcHkodGhpcy4jYnVmLnN1YmFycmF5KHRoaXMuI29mZiksIHApO1xuICAgIHRoaXMuI29mZiArPSBucmVhZDtcbiAgICByZXR1cm4gbnJlYWQ7XG4gIH1cblxuICAvKiogUmVhZHMgdGhlIG5leHQgYHAubGVuZ3RoYCBieXRlcyBmcm9tIHRoZSBidWZmZXIgb3IgdW50aWwgdGhlIGJ1ZmZlciBpc1xuICAgKiBkcmFpbmVkLiBSZXNvbHZlcyB0byB0aGUgbnVtYmVyIG9mIGJ5dGVzIHJlYWQuIElmIHRoZSBidWZmZXIgaGFzIG5vXG4gICAqIGRhdGEgdG8gcmV0dXJuLCByZXNvbHZlcyB0byBFT0YgKGBudWxsYCkuXG4gICAqXG4gICAqIE5PVEU6IFRoaXMgbWV0aG9kcyByZWFkcyBieXRlcyBzeW5jaHJvbm91c2x5OyBpdCdzIHByb3ZpZGVkIGZvclxuICAgKiBjb21wYXRpYmlsaXR5IHdpdGggYFJlYWRlcmAgaW50ZXJmYWNlcy5cbiAgICovXG4gIHJlYWQocDogVWludDhBcnJheSk6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4ge1xuICAgIGNvbnN0IHJyID0gdGhpcy5yZWFkU3luYyhwKTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJyKTtcbiAgfVxuXG4gIHdyaXRlU3luYyhwOiBVaW50OEFycmF5KTogbnVtYmVyIHtcbiAgICBjb25zdCBtID0gdGhpcy4jZ3JvdyhwLmJ5dGVMZW5ndGgpO1xuICAgIHJldHVybiBjb3B5KHAsIHRoaXMuI2J1ZiwgbSk7XG4gIH1cblxuICAvKiogTk9URTogVGhpcyBtZXRob2RzIHdyaXRlcyBieXRlcyBzeW5jaHJvbm91c2x5OyBpdCdzIHByb3ZpZGVkIGZvclxuICAgKiBjb21wYXRpYmlsaXR5IHdpdGggYFdyaXRlcmAgaW50ZXJmYWNlLiAqL1xuICB3cml0ZShwOiBVaW50OEFycmF5KTogUHJvbWlzZTxudW1iZXI+IHtcbiAgICBjb25zdCBuID0gdGhpcy53cml0ZVN5bmMocCk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShuKTtcbiAgfVxuXG4gICNncm93KG46IG51bWJlcikge1xuICAgIGNvbnN0IG0gPSB0aGlzLmxlbmd0aDtcbiAgICAvLyBJZiBidWZmZXIgaXMgZW1wdHksIHJlc2V0IHRvIHJlY292ZXIgc3BhY2UuXG4gICAgaWYgKG0gPT09IDAgJiYgdGhpcy4jb2ZmICE9PSAwKSB7XG4gICAgICB0aGlzLnJlc2V0KCk7XG4gICAgfVxuICAgIC8vIEZhc3Q6IFRyeSB0byBncm93IGJ5IG1lYW5zIG9mIGEgcmVzbGljZS5cbiAgICBjb25zdCBpID0gdGhpcy4jdHJ5R3Jvd0J5UmVzbGljZShuKTtcbiAgICBpZiAoaSA+PSAwKSB7XG4gICAgICByZXR1cm4gaTtcbiAgICB9XG4gICAgY29uc3QgYyA9IHRoaXMuY2FwYWNpdHk7XG4gICAgaWYgKG4gPD0gTWF0aC5mbG9vcihjIC8gMikgLSBtKSB7XG4gICAgICAvLyBXZSBjYW4gc2xpZGUgdGhpbmdzIGRvd24gaW5zdGVhZCBvZiBhbGxvY2F0aW5nIGEgbmV3XG4gICAgICAvLyBBcnJheUJ1ZmZlci4gV2Ugb25seSBuZWVkIG0rbiA8PSBjIHRvIHNsaWRlLCBidXRcbiAgICAgIC8vIHdlIGluc3RlYWQgbGV0IGNhcGFjaXR5IGdldCB0d2ljZSBhcyBsYXJnZSBzbyB3ZVxuICAgICAgLy8gZG9uJ3Qgc3BlbmQgYWxsIG91ciB0aW1lIGNvcHlpbmcuXG4gICAgICBjb3B5KHRoaXMuI2J1Zi5zdWJhcnJheSh0aGlzLiNvZmYpLCB0aGlzLiNidWYpO1xuICAgIH0gZWxzZSBpZiAoYyArIG4gPiBNQVhfU0laRSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlIGJ1ZmZlciBjYW5ub3QgYmUgZ3Jvd24gYmV5b25kIHRoZSBtYXhpbXVtIHNpemUuXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBOb3QgZW5vdWdoIHNwYWNlIGFueXdoZXJlLCB3ZSBuZWVkIHRvIGFsbG9jYXRlLlxuICAgICAgY29uc3QgYnVmID0gbmV3IFVpbnQ4QXJyYXkoTWF0aC5taW4oMiAqIGMgKyBuLCBNQVhfU0laRSkpO1xuICAgICAgY29weSh0aGlzLiNidWYuc3ViYXJyYXkodGhpcy4jb2ZmKSwgYnVmKTtcbiAgICAgIHRoaXMuI2J1ZiA9IGJ1ZjtcbiAgICB9XG4gICAgLy8gUmVzdG9yZSB0aGlzLiNvZmYgYW5kIGxlbih0aGlzLiNidWYpLlxuICAgIHRoaXMuI29mZiA9IDA7XG4gICAgdGhpcy4jcmVzbGljZShNYXRoLm1pbihtICsgbiwgTUFYX1NJWkUpKTtcbiAgICByZXR1cm4gbTtcbiAgfVxuXG4gIC8qKiBHcm93cyB0aGUgYnVmZmVyJ3MgY2FwYWNpdHksIGlmIG5lY2Vzc2FyeSwgdG8gZ3VhcmFudGVlIHNwYWNlIGZvclxuICAgKiBhbm90aGVyIGBuYCBieXRlcy4gQWZ0ZXIgYC5ncm93KG4pYCwgYXQgbGVhc3QgYG5gIGJ5dGVzIGNhbiBiZSB3cml0dGVuIHRvXG4gICAqIHRoZSBidWZmZXIgd2l0aG91dCBhbm90aGVyIGFsbG9jYXRpb24uIElmIGBuYCBpcyBuZWdhdGl2ZSwgYC5ncm93KClgIHdpbGxcbiAgICogdGhyb3cuIElmIHRoZSBidWZmZXIgY2FuJ3QgZ3JvdyBpdCB3aWxsIHRocm93IGFuIGVycm9yLlxuICAgKlxuICAgKiBCYXNlZCBvbiBHbyBMYW5nJ3NcbiAgICogW0J1ZmZlci5Hcm93XShodHRwczovL2dvbGFuZy5vcmcvcGtnL2J5dGVzLyNCdWZmZXIuR3JvdykuICovXG4gIGdyb3cobjogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKG4gPCAwKSB7XG4gICAgICB0aHJvdyBFcnJvcihcIkJ1ZmZlci5ncm93OiBuZWdhdGl2ZSBjb3VudFwiKTtcbiAgICB9XG4gICAgY29uc3QgbSA9IHRoaXMuI2dyb3cobik7XG4gICAgdGhpcy4jcmVzbGljZShtKTtcbiAgfVxuXG4gIC8qKiBSZWFkcyBkYXRhIGZyb20gYHJgIHVudGlsIEVPRiAoYG51bGxgKSBhbmQgYXBwZW5kcyBpdCB0byB0aGUgYnVmZmVyLFxuICAgKiBncm93aW5nIHRoZSBidWZmZXIgYXMgbmVlZGVkLiBJdCByZXNvbHZlcyB0byB0aGUgbnVtYmVyIG9mIGJ5dGVzIHJlYWQuXG4gICAqIElmIHRoZSBidWZmZXIgYmVjb21lcyB0b28gbGFyZ2UsIGAucmVhZEZyb20oKWAgd2lsbCByZWplY3Qgd2l0aCBhbiBlcnJvci5cbiAgICpcbiAgICogQmFzZWQgb24gR28gTGFuZydzXG4gICAqIFtCdWZmZXIuUmVhZEZyb21dKGh0dHBzOi8vZ29sYW5nLm9yZy9wa2cvYnl0ZXMvI0J1ZmZlci5SZWFkRnJvbSkuICovXG4gIGFzeW5jIHJlYWRGcm9tKHI6IFJlYWRlcik6IFByb21pc2U8bnVtYmVyPiB7XG4gICAgbGV0IG4gPSAwO1xuICAgIGNvbnN0IHRtcCA9IG5ldyBVaW50OEFycmF5KE1JTl9SRUFEKTtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3Qgc2hvdWxkR3JvdyA9IHRoaXMuY2FwYWNpdHkgLSB0aGlzLmxlbmd0aCA8IE1JTl9SRUFEO1xuICAgICAgLy8gcmVhZCBpbnRvIHRtcCBidWZmZXIgaWYgdGhlcmUncyBub3QgZW5vdWdoIHJvb21cbiAgICAgIC8vIG90aGVyd2lzZSByZWFkIGRpcmVjdGx5IGludG8gdGhlIGludGVybmFsIGJ1ZmZlclxuICAgICAgY29uc3QgYnVmID0gc2hvdWxkR3Jvd1xuICAgICAgICA/IHRtcFxuICAgICAgICA6IG5ldyBVaW50OEFycmF5KHRoaXMuI2J1Zi5idWZmZXIsIHRoaXMubGVuZ3RoKTtcblxuICAgICAgY29uc3QgbnJlYWQgPSBhd2FpdCByLnJlYWQoYnVmKTtcbiAgICAgIGlmIChucmVhZCA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gbjtcbiAgICAgIH1cblxuICAgICAgLy8gd3JpdGUgd2lsbCBncm93IGlmIG5lZWRlZFxuICAgICAgaWYgKHNob3VsZEdyb3cpIHRoaXMud3JpdGVTeW5jKGJ1Zi5zdWJhcnJheSgwLCBucmVhZCkpO1xuICAgICAgZWxzZSB0aGlzLiNyZXNsaWNlKHRoaXMubGVuZ3RoICsgbnJlYWQpO1xuXG4gICAgICBuICs9IG5yZWFkO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBSZWFkcyBkYXRhIGZyb20gYHJgIHVudGlsIEVPRiAoYG51bGxgKSBhbmQgYXBwZW5kcyBpdCB0byB0aGUgYnVmZmVyLFxuICAgKiBncm93aW5nIHRoZSBidWZmZXIgYXMgbmVlZGVkLiBJdCByZXR1cm5zIHRoZSBudW1iZXIgb2YgYnl0ZXMgcmVhZC4gSWYgdGhlXG4gICAqIGJ1ZmZlciBiZWNvbWVzIHRvbyBsYXJnZSwgYC5yZWFkRnJvbVN5bmMoKWAgd2lsbCB0aHJvdyBhbiBlcnJvci5cbiAgICpcbiAgICogQmFzZWQgb24gR28gTGFuZydzXG4gICAqIFtCdWZmZXIuUmVhZEZyb21dKGh0dHBzOi8vZ29sYW5nLm9yZy9wa2cvYnl0ZXMvI0J1ZmZlci5SZWFkRnJvbSkuICovXG4gIHJlYWRGcm9tU3luYyhyOiBSZWFkZXJTeW5jKTogbnVtYmVyIHtcbiAgICBsZXQgbiA9IDA7XG4gICAgY29uc3QgdG1wID0gbmV3IFVpbnQ4QXJyYXkoTUlOX1JFQUQpO1xuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBjb25zdCBzaG91bGRHcm93ID0gdGhpcy5jYXBhY2l0eSAtIHRoaXMubGVuZ3RoIDwgTUlOX1JFQUQ7XG4gICAgICAvLyByZWFkIGludG8gdG1wIGJ1ZmZlciBpZiB0aGVyZSdzIG5vdCBlbm91Z2ggcm9vbVxuICAgICAgLy8gb3RoZXJ3aXNlIHJlYWQgZGlyZWN0bHkgaW50byB0aGUgaW50ZXJuYWwgYnVmZmVyXG4gICAgICBjb25zdCBidWYgPSBzaG91bGRHcm93XG4gICAgICAgID8gdG1wXG4gICAgICAgIDogbmV3IFVpbnQ4QXJyYXkodGhpcy4jYnVmLmJ1ZmZlciwgdGhpcy5sZW5ndGgpO1xuXG4gICAgICBjb25zdCBucmVhZCA9IHIucmVhZFN5bmMoYnVmKTtcbiAgICAgIGlmIChucmVhZCA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gbjtcbiAgICAgIH1cblxuICAgICAgLy8gd3JpdGUgd2lsbCBncm93IGlmIG5lZWRlZFxuICAgICAgaWYgKHNob3VsZEdyb3cpIHRoaXMud3JpdGVTeW5jKGJ1Zi5zdWJhcnJheSgwLCBucmVhZCkpO1xuICAgICAgZWxzZSB0aGlzLiNyZXNsaWNlKHRoaXMubGVuZ3RoICsgbnJlYWQpO1xuXG4gICAgICBuICs9IG5yZWFkO1xuICAgIH1cbiAgfVxufVxuXG5jb25zdCBERUZBVUxUX0JVRl9TSVpFID0gNDA5NjtcbmNvbnN0IE1JTl9CVUZfU0laRSA9IDE2O1xuY29uc3QgTUFYX0NPTlNFQ1VUSVZFX0VNUFRZX1JFQURTID0gMTAwO1xuY29uc3QgQ1IgPSBcIlxcclwiLmNoYXJDb2RlQXQoMCk7XG5jb25zdCBMRiA9IFwiXFxuXCIuY2hhckNvZGVBdCgwKTtcblxuZXhwb3J0IGNsYXNzIEJ1ZmZlckZ1bGxFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgbmFtZSA9IFwiQnVmZmVyRnVsbEVycm9yXCI7XG4gIGNvbnN0cnVjdG9yKHB1YmxpYyBwYXJ0aWFsOiBVaW50OEFycmF5KSB7XG4gICAgc3VwZXIoXCJCdWZmZXIgZnVsbFwiKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgUGFydGlhbFJlYWRFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgbmFtZSA9IFwiUGFydGlhbFJlYWRFcnJvclwiO1xuICBwYXJ0aWFsPzogVWludDhBcnJheTtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgc3VwZXIoXCJFbmNvdW50ZXJlZCBVbmV4cGVjdGVkRW9mLCBkYXRhIG9ubHkgcGFydGlhbGx5IHJlYWRcIik7XG4gIH1cbn1cblxuLyoqIFJlc3VsdCB0eXBlIHJldHVybmVkIGJ5IG9mIEJ1ZlJlYWRlci5yZWFkTGluZSgpLiAqL1xuZXhwb3J0IGludGVyZmFjZSBSZWFkTGluZVJlc3VsdCB7XG4gIGxpbmU6IFVpbnQ4QXJyYXk7XG4gIG1vcmU6IGJvb2xlYW47XG59XG5cbi8qKiBCdWZSZWFkZXIgaW1wbGVtZW50cyBidWZmZXJpbmcgZm9yIGEgUmVhZGVyIG9iamVjdC4gKi9cbmV4cG9ydCBjbGFzcyBCdWZSZWFkZXIgaW1wbGVtZW50cyBSZWFkZXIge1xuICAjYnVmITogVWludDhBcnJheTtcbiAgI3JkITogUmVhZGVyOyAvLyBSZWFkZXIgcHJvdmlkZWQgYnkgY2FsbGVyLlxuICAjciA9IDA7IC8vIGJ1ZiByZWFkIHBvc2l0aW9uLlxuICAjdyA9IDA7IC8vIGJ1ZiB3cml0ZSBwb3NpdGlvbi5cbiAgI2VvZiA9IGZhbHNlO1xuICAvLyBwcml2YXRlIGxhc3RCeXRlOiBudW1iZXI7XG4gIC8vIHByaXZhdGUgbGFzdENoYXJTaXplOiBudW1iZXI7XG5cbiAgLyoqIHJldHVybiBuZXcgQnVmUmVhZGVyIHVubGVzcyByIGlzIEJ1ZlJlYWRlciAqL1xuICBzdGF0aWMgY3JlYXRlKHI6IFJlYWRlciwgc2l6ZTogbnVtYmVyID0gREVGQVVMVF9CVUZfU0laRSk6IEJ1ZlJlYWRlciB7XG4gICAgcmV0dXJuIHIgaW5zdGFuY2VvZiBCdWZSZWFkZXIgPyByIDogbmV3IEJ1ZlJlYWRlcihyLCBzaXplKTtcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKHJkOiBSZWFkZXIsIHNpemU6IG51bWJlciA9IERFRkFVTFRfQlVGX1NJWkUpIHtcbiAgICBpZiAoc2l6ZSA8IE1JTl9CVUZfU0laRSkge1xuICAgICAgc2l6ZSA9IE1JTl9CVUZfU0laRTtcbiAgICB9XG4gICAgdGhpcy4jcmVzZXQobmV3IFVpbnQ4QXJyYXkoc2l6ZSksIHJkKTtcbiAgfVxuXG4gIC8qKiBSZXR1cm5zIHRoZSBzaXplIG9mIHRoZSB1bmRlcmx5aW5nIGJ1ZmZlciBpbiBieXRlcy4gKi9cbiAgc2l6ZSgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiNidWYuYnl0ZUxlbmd0aDtcbiAgfVxuXG4gIGJ1ZmZlcmVkKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuI3cgLSB0aGlzLiNyO1xuICB9XG5cbiAgLy8gUmVhZHMgYSBuZXcgY2h1bmsgaW50byB0aGUgYnVmZmVyLlxuICAjZmlsbCA9IGFzeW5jICgpID0+IHtcbiAgICAvLyBTbGlkZSBleGlzdGluZyBkYXRhIHRvIGJlZ2lubmluZy5cbiAgICBpZiAodGhpcy4jciA+IDApIHtcbiAgICAgIHRoaXMuI2J1Zi5jb3B5V2l0aGluKDAsIHRoaXMuI3IsIHRoaXMuI3cpO1xuICAgICAgdGhpcy4jdyAtPSB0aGlzLiNyO1xuICAgICAgdGhpcy4jciA9IDA7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuI3cgPj0gdGhpcy4jYnVmLmJ5dGVMZW5ndGgpIHtcbiAgICAgIHRocm93IEVycm9yKFwiYnVmaW86IHRyaWVkIHRvIGZpbGwgZnVsbCBidWZmZXJcIik7XG4gICAgfVxuXG4gICAgLy8gUmVhZCBuZXcgZGF0YTogdHJ5IGEgbGltaXRlZCBudW1iZXIgb2YgdGltZXMuXG4gICAgZm9yIChsZXQgaSA9IE1BWF9DT05TRUNVVElWRV9FTVBUWV9SRUFEUzsgaSA+IDA7IGktLSkge1xuICAgICAgY29uc3QgcnIgPSBhd2FpdCB0aGlzLiNyZC5yZWFkKHRoaXMuI2J1Zi5zdWJhcnJheSh0aGlzLiN3KSk7XG4gICAgICBpZiAocnIgPT09IG51bGwpIHtcbiAgICAgICAgdGhpcy4jZW9mID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgYXNzZXJ0KHJyID49IDAsIFwibmVnYXRpdmUgcmVhZFwiKTtcbiAgICAgIHRoaXMuI3cgKz0gcnI7XG4gICAgICBpZiAocnIgPiAwKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgTm8gcHJvZ3Jlc3MgYWZ0ZXIgJHtNQVhfQ09OU0VDVVRJVkVfRU1QVFlfUkVBRFN9IHJlYWQoKSBjYWxsc2AsXG4gICAgKTtcbiAgfTtcblxuICAvKiogRGlzY2FyZHMgYW55IGJ1ZmZlcmVkIGRhdGEsIHJlc2V0cyBhbGwgc3RhdGUsIGFuZCBzd2l0Y2hlc1xuICAgKiB0aGUgYnVmZmVyZWQgcmVhZGVyIHRvIHJlYWQgZnJvbSByLlxuICAgKi9cbiAgcmVzZXQocjogUmVhZGVyKTogdm9pZCB7XG4gICAgdGhpcy4jcmVzZXQodGhpcy4jYnVmLCByKTtcbiAgfVxuXG4gICNyZXNldCA9IChidWY6IFVpbnQ4QXJyYXksIHJkOiBSZWFkZXIpOiB2b2lkID0+IHtcbiAgICB0aGlzLiNidWYgPSBidWY7XG4gICAgdGhpcy4jcmQgPSByZDtcbiAgICB0aGlzLiNlb2YgPSBmYWxzZTtcbiAgICAvLyB0aGlzLmxhc3RCeXRlID0gLTE7XG4gICAgLy8gdGhpcy5sYXN0Q2hhclNpemUgPSAtMTtcbiAgfTtcblxuICAvKiogcmVhZHMgZGF0YSBpbnRvIHAuXG4gICAqIEl0IHJldHVybnMgdGhlIG51bWJlciBvZiBieXRlcyByZWFkIGludG8gcC5cbiAgICogVGhlIGJ5dGVzIGFyZSB0YWtlbiBmcm9tIGF0IG1vc3Qgb25lIFJlYWQgb24gdGhlIHVuZGVybHlpbmcgUmVhZGVyLFxuICAgKiBoZW5jZSBuIG1heSBiZSBsZXNzIHRoYW4gbGVuKHApLlxuICAgKiBUbyByZWFkIGV4YWN0bHkgbGVuKHApIGJ5dGVzLCB1c2UgaW8uUmVhZEZ1bGwoYiwgcCkuXG4gICAqL1xuICBhc3luYyByZWFkKHA6IFVpbnQ4QXJyYXkpOiBQcm9taXNlPG51bWJlciB8IG51bGw+IHtcbiAgICBsZXQgcnI6IG51bWJlciB8IG51bGwgPSBwLmJ5dGVMZW5ndGg7XG4gICAgaWYgKHAuYnl0ZUxlbmd0aCA9PT0gMCkgcmV0dXJuIHJyO1xuXG4gICAgaWYgKHRoaXMuI3IgPT09IHRoaXMuI3cpIHtcbiAgICAgIGlmIChwLmJ5dGVMZW5ndGggPj0gdGhpcy4jYnVmLmJ5dGVMZW5ndGgpIHtcbiAgICAgICAgLy8gTGFyZ2UgcmVhZCwgZW1wdHkgYnVmZmVyLlxuICAgICAgICAvLyBSZWFkIGRpcmVjdGx5IGludG8gcCB0byBhdm9pZCBjb3B5LlxuICAgICAgICBjb25zdCByciA9IGF3YWl0IHRoaXMuI3JkLnJlYWQocCk7XG4gICAgICAgIGNvbnN0IG5yZWFkID0gcnIgPz8gMDtcbiAgICAgICAgYXNzZXJ0KG5yZWFkID49IDAsIFwibmVnYXRpdmUgcmVhZFwiKTtcbiAgICAgICAgLy8gaWYgKHJyLm5yZWFkID4gMCkge1xuICAgICAgICAvLyAgIHRoaXMubGFzdEJ5dGUgPSBwW3JyLm5yZWFkIC0gMV07XG4gICAgICAgIC8vICAgdGhpcy5sYXN0Q2hhclNpemUgPSAtMTtcbiAgICAgICAgLy8gfVxuICAgICAgICByZXR1cm4gcnI7XG4gICAgICB9XG5cbiAgICAgIC8vIE9uZSByZWFkLlxuICAgICAgLy8gRG8gbm90IHVzZSB0aGlzLmZpbGwsIHdoaWNoIHdpbGwgbG9vcC5cbiAgICAgIHRoaXMuI3IgPSAwO1xuICAgICAgdGhpcy4jdyA9IDA7XG4gICAgICByciA9IGF3YWl0IHRoaXMuI3JkLnJlYWQodGhpcy4jYnVmKTtcbiAgICAgIGlmIChyciA9PT0gMCB8fCByciA9PT0gbnVsbCkgcmV0dXJuIHJyO1xuICAgICAgYXNzZXJ0KHJyID49IDAsIFwibmVnYXRpdmUgcmVhZFwiKTtcbiAgICAgIHRoaXMuI3cgKz0gcnI7XG4gICAgfVxuXG4gICAgLy8gY29weSBhcyBtdWNoIGFzIHdlIGNhblxuICAgIGNvbnN0IGNvcGllZCA9IGNvcHkodGhpcy4jYnVmLnN1YmFycmF5KHRoaXMuI3IsIHRoaXMuI3cpLCBwLCAwKTtcbiAgICB0aGlzLiNyICs9IGNvcGllZDtcbiAgICAvLyB0aGlzLmxhc3RCeXRlID0gdGhpcy5idWZbdGhpcy5yIC0gMV07XG4gICAgLy8gdGhpcy5sYXN0Q2hhclNpemUgPSAtMTtcbiAgICByZXR1cm4gY29waWVkO1xuICB9XG5cbiAgLyoqIHJlYWRzIGV4YWN0bHkgYHAubGVuZ3RoYCBieXRlcyBpbnRvIGBwYC5cbiAgICpcbiAgICogSWYgc3VjY2Vzc2Z1bCwgYHBgIGlzIHJldHVybmVkLlxuICAgKlxuICAgKiBJZiB0aGUgZW5kIG9mIHRoZSB1bmRlcmx5aW5nIHN0cmVhbSBoYXMgYmVlbiByZWFjaGVkLCBhbmQgdGhlcmUgYXJlIG5vIG1vcmVcbiAgICogYnl0ZXMgYXZhaWxhYmxlIGluIHRoZSBidWZmZXIsIGByZWFkRnVsbCgpYCByZXR1cm5zIGBudWxsYCBpbnN0ZWFkLlxuICAgKlxuICAgKiBBbiBlcnJvciBpcyB0aHJvd24gaWYgc29tZSBieXRlcyBjb3VsZCBiZSByZWFkLCBidXQgbm90IGVub3VnaCB0byBmaWxsIGBwYFxuICAgKiBlbnRpcmVseSBiZWZvcmUgdGhlIHVuZGVybHlpbmcgc3RyZWFtIHJlcG9ydGVkIGFuIGVycm9yIG9yIEVPRi4gQW55IGVycm9yXG4gICAqIHRocm93biB3aWxsIGhhdmUgYSBgcGFydGlhbGAgcHJvcGVydHkgdGhhdCBpbmRpY2F0ZXMgdGhlIHNsaWNlIG9mIHRoZVxuICAgKiBidWZmZXIgdGhhdCBoYXMgYmVlbiBzdWNjZXNzZnVsbHkgZmlsbGVkIHdpdGggZGF0YS5cbiAgICpcbiAgICogUG9ydGVkIGZyb20gaHR0cHM6Ly9nb2xhbmcub3JnL3BrZy9pby8jUmVhZEZ1bGxcbiAgICovXG4gIGFzeW5jIHJlYWRGdWxsKHA6IFVpbnQ4QXJyYXkpOiBQcm9taXNlPFVpbnQ4QXJyYXkgfCBudWxsPiB7XG4gICAgbGV0IGJ5dGVzUmVhZCA9IDA7XG4gICAgd2hpbGUgKGJ5dGVzUmVhZCA8IHAubGVuZ3RoKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByciA9IGF3YWl0IHRoaXMucmVhZChwLnN1YmFycmF5KGJ5dGVzUmVhZCkpO1xuICAgICAgICBpZiAocnIgPT09IG51bGwpIHtcbiAgICAgICAgICBpZiAoYnl0ZXNSZWFkID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnRpYWxSZWFkRXJyb3IoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYnl0ZXNSZWFkICs9IHJyO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGlmIChlcnIgaW5zdGFuY2VvZiBQYXJ0aWFsUmVhZEVycm9yKSB7XG4gICAgICAgICAgZXJyLnBhcnRpYWwgPSBwLnN1YmFycmF5KDAsIGJ5dGVzUmVhZCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZXJyIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgICBjb25zdCBlID0gbmV3IFBhcnRpYWxSZWFkRXJyb3IoKTtcbiAgICAgICAgICBlLnBhcnRpYWwgPSBwLnN1YmFycmF5KDAsIGJ5dGVzUmVhZCk7XG4gICAgICAgICAgZS5zdGFjayA9IGVyci5zdGFjaztcbiAgICAgICAgICBlLm1lc3NhZ2UgPSBlcnIubWVzc2FnZTtcbiAgICAgICAgICBlLmNhdXNlID0gZXJyLmNhdXNlO1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBwO1xuICB9XG5cbiAgLyoqIFJldHVybnMgdGhlIG5leHQgYnl0ZSBbMCwgMjU1XSBvciBgbnVsbGAuICovXG4gIGFzeW5jIHJlYWRCeXRlKCk6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4ge1xuICAgIHdoaWxlICh0aGlzLiNyID09PSB0aGlzLiN3KSB7XG4gICAgICBpZiAodGhpcy4jZW9mKSByZXR1cm4gbnVsbDtcbiAgICAgIGF3YWl0IHRoaXMuI2ZpbGwoKTsgLy8gYnVmZmVyIGlzIGVtcHR5LlxuICAgIH1cbiAgICBjb25zdCBjID0gdGhpcy4jYnVmW3RoaXMuI3JdO1xuICAgIHRoaXMuI3IrKztcbiAgICAvLyB0aGlzLmxhc3RCeXRlID0gYztcbiAgICByZXR1cm4gYztcbiAgfVxuXG4gIC8qKiByZWFkU3RyaW5nKCkgcmVhZHMgdW50aWwgdGhlIGZpcnN0IG9jY3VycmVuY2Ugb2YgZGVsaW0gaW4gdGhlIGlucHV0LFxuICAgKiByZXR1cm5pbmcgYSBzdHJpbmcgY29udGFpbmluZyB0aGUgZGF0YSB1cCB0byBhbmQgaW5jbHVkaW5nIHRoZSBkZWxpbWl0ZXIuXG4gICAqIElmIFJlYWRTdHJpbmcgZW5jb3VudGVycyBhbiBlcnJvciBiZWZvcmUgZmluZGluZyBhIGRlbGltaXRlcixcbiAgICogaXQgcmV0dXJucyB0aGUgZGF0YSByZWFkIGJlZm9yZSB0aGUgZXJyb3IgYW5kIHRoZSBlcnJvciBpdHNlbGZcbiAgICogKG9mdGVuIGBudWxsYCkuXG4gICAqIFJlYWRTdHJpbmcgcmV0dXJucyBlcnIgIT0gbmlsIGlmIGFuZCBvbmx5IGlmIHRoZSByZXR1cm5lZCBkYXRhIGRvZXMgbm90IGVuZFxuICAgKiBpbiBkZWxpbS5cbiAgICogRm9yIHNpbXBsZSB1c2VzLCBhIFNjYW5uZXIgbWF5IGJlIG1vcmUgY29udmVuaWVudC5cbiAgICovXG4gIGFzeW5jIHJlYWRTdHJpbmcoZGVsaW06IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICAgIGlmIChkZWxpbS5sZW5ndGggIT09IDEpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkRlbGltaXRlciBzaG91bGQgYmUgYSBzaW5nbGUgY2hhcmFjdGVyXCIpO1xuICAgIH1cbiAgICBjb25zdCBidWZmZXIgPSBhd2FpdCB0aGlzLnJlYWRTbGljZShkZWxpbS5jaGFyQ29kZUF0KDApKTtcbiAgICBpZiAoYnVmZmVyID09PSBudWxsKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGJ1ZmZlcik7XG4gIH1cblxuICAvKiogYHJlYWRMaW5lKClgIGlzIGEgbG93LWxldmVsIGxpbmUtcmVhZGluZyBwcmltaXRpdmUuIE1vc3QgY2FsbGVycyBzaG91bGRcbiAgICogdXNlIGByZWFkU3RyaW5nKCdcXG4nKWAgaW5zdGVhZCBvciB1c2UgYSBTY2FubmVyLlxuICAgKlxuICAgKiBgcmVhZExpbmUoKWAgdHJpZXMgdG8gcmV0dXJuIGEgc2luZ2xlIGxpbmUsIG5vdCBpbmNsdWRpbmcgdGhlIGVuZC1vZi1saW5lXG4gICAqIGJ5dGVzLiBJZiB0aGUgbGluZSB3YXMgdG9vIGxvbmcgZm9yIHRoZSBidWZmZXIgdGhlbiBgbW9yZWAgaXMgc2V0IGFuZCB0aGVcbiAgICogYmVnaW5uaW5nIG9mIHRoZSBsaW5lIGlzIHJldHVybmVkLiBUaGUgcmVzdCBvZiB0aGUgbGluZSB3aWxsIGJlIHJldHVybmVkXG4gICAqIGZyb20gZnV0dXJlIGNhbGxzLiBgbW9yZWAgd2lsbCBiZSBmYWxzZSB3aGVuIHJldHVybmluZyB0aGUgbGFzdCBmcmFnbWVudFxuICAgKiBvZiB0aGUgbGluZS4gVGhlIHJldHVybmVkIGJ1ZmZlciBpcyBvbmx5IHZhbGlkIHVudGlsIHRoZSBuZXh0IGNhbGwgdG9cbiAgICogYHJlYWRMaW5lKClgLlxuICAgKlxuICAgKiBUaGUgdGV4dCByZXR1cm5lZCBmcm9tIFJlYWRMaW5lIGRvZXMgbm90IGluY2x1ZGUgdGhlIGxpbmUgZW5kIChcIlxcclxcblwiIG9yXG4gICAqIFwiXFxuXCIpLlxuICAgKlxuICAgKiBXaGVuIHRoZSBlbmQgb2YgdGhlIHVuZGVybHlpbmcgc3RyZWFtIGlzIHJlYWNoZWQsIHRoZSBmaW5hbCBieXRlcyBpbiB0aGVcbiAgICogc3RyZWFtIGFyZSByZXR1cm5lZC4gTm8gaW5kaWNhdGlvbiBvciBlcnJvciBpcyBnaXZlbiBpZiB0aGUgaW5wdXQgZW5kc1xuICAgKiB3aXRob3V0IGEgZmluYWwgbGluZSBlbmQuIFdoZW4gdGhlcmUgYXJlIG5vIG1vcmUgdHJhaWxpbmcgYnl0ZXMgdG8gcmVhZCxcbiAgICogYHJlYWRMaW5lKClgIHJldHVybnMgYG51bGxgLlxuICAgKlxuICAgKiBDYWxsaW5nIGB1bnJlYWRCeXRlKClgIGFmdGVyIGByZWFkTGluZSgpYCB3aWxsIGFsd2F5cyB1bnJlYWQgdGhlIGxhc3QgYnl0ZVxuICAgKiByZWFkIChwb3NzaWJseSBhIGNoYXJhY3RlciBiZWxvbmdpbmcgdG8gdGhlIGxpbmUgZW5kKSBldmVuIGlmIHRoYXQgYnl0ZSBpc1xuICAgKiBub3QgcGFydCBvZiB0aGUgbGluZSByZXR1cm5lZCBieSBgcmVhZExpbmUoKWAuXG4gICAqL1xuICBhc3luYyByZWFkTGluZSgpOiBQcm9taXNlPFJlYWRMaW5lUmVzdWx0IHwgbnVsbD4ge1xuICAgIGxldCBsaW5lOiBVaW50OEFycmF5IHwgbnVsbCA9IG51bGw7XG5cbiAgICB0cnkge1xuICAgICAgbGluZSA9IGF3YWl0IHRoaXMucmVhZFNsaWNlKExGKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmIChlcnIgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5CYWRSZXNvdXJjZSkge1xuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9XG4gICAgICBsZXQgcGFydGlhbDtcbiAgICAgIGlmIChlcnIgaW5zdGFuY2VvZiBQYXJ0aWFsUmVhZEVycm9yKSB7XG4gICAgICAgIHBhcnRpYWwgPSBlcnIucGFydGlhbDtcbiAgICAgICAgYXNzZXJ0KFxuICAgICAgICAgIHBhcnRpYWwgaW5zdGFuY2VvZiBVaW50OEFycmF5LFxuICAgICAgICAgIFwiYnVmaW86IGNhdWdodCBlcnJvciBmcm9tIGByZWFkU2xpY2UoKWAgd2l0aG91dCBgcGFydGlhbGAgcHJvcGVydHlcIixcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgLy8gRG9uJ3QgdGhyb3cgaWYgYHJlYWRTbGljZSgpYCBmYWlsZWQgd2l0aCBgQnVmZmVyRnVsbEVycm9yYCwgaW5zdGVhZCB3ZVxuICAgICAgLy8ganVzdCByZXR1cm4gd2hhdGV2ZXIgaXMgYXZhaWxhYmxlIGFuZCBzZXQgdGhlIGBtb3JlYCBmbGFnLlxuICAgICAgaWYgKCEoZXJyIGluc3RhbmNlb2YgQnVmZmVyRnVsbEVycm9yKSkge1xuICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9XG5cbiAgICAgIHBhcnRpYWwgPSBlcnIucGFydGlhbDtcblxuICAgICAgLy8gSGFuZGxlIHRoZSBjYXNlIHdoZXJlIFwiXFxyXFxuXCIgc3RyYWRkbGVzIHRoZSBidWZmZXIuXG4gICAgICBpZiAoXG4gICAgICAgICF0aGlzLiNlb2YgJiYgcGFydGlhbCAmJlxuICAgICAgICBwYXJ0aWFsLmJ5dGVMZW5ndGggPiAwICYmXG4gICAgICAgIHBhcnRpYWxbcGFydGlhbC5ieXRlTGVuZ3RoIC0gMV0gPT09IENSXG4gICAgICApIHtcbiAgICAgICAgLy8gUHV0IHRoZSAnXFxyJyBiYWNrIG9uIGJ1ZiBhbmQgZHJvcCBpdCBmcm9tIGxpbmUuXG4gICAgICAgIC8vIExldCB0aGUgbmV4dCBjYWxsIHRvIFJlYWRMaW5lIGNoZWNrIGZvciBcIlxcclxcblwiLlxuICAgICAgICBhc3NlcnQodGhpcy4jciA+IDAsIFwiYnVmaW86IHRyaWVkIHRvIHJld2luZCBwYXN0IHN0YXJ0IG9mIGJ1ZmZlclwiKTtcbiAgICAgICAgdGhpcy4jci0tO1xuICAgICAgICBwYXJ0aWFsID0gcGFydGlhbC5zdWJhcnJheSgwLCBwYXJ0aWFsLmJ5dGVMZW5ndGggLSAxKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHBhcnRpYWwpIHtcbiAgICAgICAgcmV0dXJuIHsgbGluZTogcGFydGlhbCwgbW9yZTogIXRoaXMuI2VvZiB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChsaW5lID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAobGluZS5ieXRlTGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4geyBsaW5lLCBtb3JlOiBmYWxzZSB9O1xuICAgIH1cblxuICAgIGlmIChsaW5lW2xpbmUuYnl0ZUxlbmd0aCAtIDFdID09IExGKSB7XG4gICAgICBsZXQgZHJvcCA9IDE7XG4gICAgICBpZiAobGluZS5ieXRlTGVuZ3RoID4gMSAmJiBsaW5lW2xpbmUuYnl0ZUxlbmd0aCAtIDJdID09PSBDUikge1xuICAgICAgICBkcm9wID0gMjtcbiAgICAgIH1cbiAgICAgIGxpbmUgPSBsaW5lLnN1YmFycmF5KDAsIGxpbmUuYnl0ZUxlbmd0aCAtIGRyb3ApO1xuICAgIH1cbiAgICByZXR1cm4geyBsaW5lLCBtb3JlOiBmYWxzZSB9O1xuICB9XG5cbiAgLyoqIGByZWFkU2xpY2UoKWAgcmVhZHMgdW50aWwgdGhlIGZpcnN0IG9jY3VycmVuY2Ugb2YgYGRlbGltYCBpbiB0aGUgaW5wdXQsXG4gICAqIHJldHVybmluZyBhIHNsaWNlIHBvaW50aW5nIGF0IHRoZSBieXRlcyBpbiB0aGUgYnVmZmVyLiBUaGUgYnl0ZXMgc3RvcFxuICAgKiBiZWluZyB2YWxpZCBhdCB0aGUgbmV4dCByZWFkLlxuICAgKlxuICAgKiBJZiBgcmVhZFNsaWNlKClgIGVuY291bnRlcnMgYW4gZXJyb3IgYmVmb3JlIGZpbmRpbmcgYSBkZWxpbWl0ZXIsIG9yIHRoZVxuICAgKiBidWZmZXIgZmlsbHMgd2l0aG91dCBmaW5kaW5nIGEgZGVsaW1pdGVyLCBpdCB0aHJvd3MgYW4gZXJyb3Igd2l0aCBhXG4gICAqIGBwYXJ0aWFsYCBwcm9wZXJ0eSB0aGF0IGNvbnRhaW5zIHRoZSBlbnRpcmUgYnVmZmVyLlxuICAgKlxuICAgKiBJZiBgcmVhZFNsaWNlKClgIGVuY291bnRlcnMgdGhlIGVuZCBvZiB0aGUgdW5kZXJseWluZyBzdHJlYW0gYW5kIHRoZXJlIGFyZVxuICAgKiBhbnkgYnl0ZXMgbGVmdCBpbiB0aGUgYnVmZmVyLCB0aGUgcmVzdCBvZiB0aGUgYnVmZmVyIGlzIHJldHVybmVkLiBJbiBvdGhlclxuICAgKiB3b3JkcywgRU9GIGlzIGFsd2F5cyB0cmVhdGVkIGFzIGEgZGVsaW1pdGVyLiBPbmNlIHRoZSBidWZmZXIgaXMgZW1wdHksXG4gICAqIGl0IHJldHVybnMgYG51bGxgLlxuICAgKlxuICAgKiBCZWNhdXNlIHRoZSBkYXRhIHJldHVybmVkIGZyb20gYHJlYWRTbGljZSgpYCB3aWxsIGJlIG92ZXJ3cml0dGVuIGJ5IHRoZVxuICAgKiBuZXh0IEkvTyBvcGVyYXRpb24sIG1vc3QgY2xpZW50cyBzaG91bGQgdXNlIGByZWFkU3RyaW5nKClgIGluc3RlYWQuXG4gICAqL1xuICBhc3luYyByZWFkU2xpY2UoZGVsaW06IG51bWJlcik6IFByb21pc2U8VWludDhBcnJheSB8IG51bGw+IHtcbiAgICBsZXQgcyA9IDA7IC8vIHNlYXJjaCBzdGFydCBpbmRleFxuICAgIGxldCBzbGljZTogVWludDhBcnJheSB8IHVuZGVmaW5lZDtcblxuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAvLyBTZWFyY2ggYnVmZmVyLlxuICAgICAgbGV0IGkgPSB0aGlzLiNidWYuc3ViYXJyYXkodGhpcy4jciArIHMsIHRoaXMuI3cpLmluZGV4T2YoZGVsaW0pO1xuICAgICAgaWYgKGkgPj0gMCkge1xuICAgICAgICBpICs9IHM7XG4gICAgICAgIHNsaWNlID0gdGhpcy4jYnVmLnN1YmFycmF5KHRoaXMuI3IsIHRoaXMuI3IgKyBpICsgMSk7XG4gICAgICAgIHRoaXMuI3IgKz0gaSArIDE7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICAvLyBFT0Y/XG4gICAgICBpZiAodGhpcy4jZW9mKSB7XG4gICAgICAgIGlmICh0aGlzLiNyID09PSB0aGlzLiN3KSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgc2xpY2UgPSB0aGlzLiNidWYuc3ViYXJyYXkodGhpcy4jciwgdGhpcy4jdyk7XG4gICAgICAgIHRoaXMuI3IgPSB0aGlzLiN3O1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgLy8gQnVmZmVyIGZ1bGw/XG4gICAgICBpZiAodGhpcy5idWZmZXJlZCgpID49IHRoaXMuI2J1Zi5ieXRlTGVuZ3RoKSB7XG4gICAgICAgIHRoaXMuI3IgPSB0aGlzLiN3O1xuICAgICAgICAvLyAjNDUyMSBUaGUgaW50ZXJuYWwgYnVmZmVyIHNob3VsZCBub3QgYmUgcmV1c2VkIGFjcm9zcyByZWFkcyBiZWNhdXNlIGl0IGNhdXNlcyBjb3JydXB0aW9uIG9mIGRhdGEuXG4gICAgICAgIGNvbnN0IG9sZGJ1ZiA9IHRoaXMuI2J1ZjtcbiAgICAgICAgY29uc3QgbmV3YnVmID0gdGhpcy4jYnVmLnNsaWNlKDApO1xuICAgICAgICB0aGlzLiNidWYgPSBuZXdidWY7XG4gICAgICAgIHRocm93IG5ldyBCdWZmZXJGdWxsRXJyb3Iob2xkYnVmKTtcbiAgICAgIH1cblxuICAgICAgcyA9IHRoaXMuI3cgLSB0aGlzLiNyOyAvLyBkbyBub3QgcmVzY2FuIGFyZWEgd2Ugc2Nhbm5lZCBiZWZvcmVcblxuICAgICAgLy8gQnVmZmVyIGlzIG5vdCBmdWxsLlxuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy4jZmlsbCgpO1xuICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgIGlmIChlcnIgaW5zdGFuY2VvZiBQYXJ0aWFsUmVhZEVycm9yKSB7XG4gICAgICAgICAgZXJyLnBhcnRpYWwgPSBzbGljZTtcbiAgICAgICAgfSBlbHNlIGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICAgIGNvbnN0IGUgPSBuZXcgUGFydGlhbFJlYWRFcnJvcigpO1xuICAgICAgICAgIGUucGFydGlhbCA9IHNsaWNlO1xuICAgICAgICAgIGUuc3RhY2sgPSBlcnIuc3RhY2s7XG4gICAgICAgICAgZS5tZXNzYWdlID0gZXJyLm1lc3NhZ2U7XG4gICAgICAgICAgZS5jYXVzZSA9IGVyci5jYXVzZTtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEhhbmRsZSBsYXN0IGJ5dGUsIGlmIGFueS5cbiAgICAvLyBjb25zdCBpID0gc2xpY2UuYnl0ZUxlbmd0aCAtIDE7XG4gICAgLy8gaWYgKGkgPj0gMCkge1xuICAgIC8vICAgdGhpcy5sYXN0Qnl0ZSA9IHNsaWNlW2ldO1xuICAgIC8vICAgdGhpcy5sYXN0Q2hhclNpemUgPSAtMVxuICAgIC8vIH1cblxuICAgIHJldHVybiBzbGljZTtcbiAgfVxuXG4gIC8qKiBgcGVlaygpYCByZXR1cm5zIHRoZSBuZXh0IGBuYCBieXRlcyB3aXRob3V0IGFkdmFuY2luZyB0aGUgcmVhZGVyLiBUaGVcbiAgICogYnl0ZXMgc3RvcCBiZWluZyB2YWxpZCBhdCB0aGUgbmV4dCByZWFkIGNhbGwuXG4gICAqXG4gICAqIFdoZW4gdGhlIGVuZCBvZiB0aGUgdW5kZXJseWluZyBzdHJlYW0gaXMgcmVhY2hlZCwgYnV0IHRoZXJlIGFyZSB1bnJlYWRcbiAgICogYnl0ZXMgbGVmdCBpbiB0aGUgYnVmZmVyLCB0aG9zZSBieXRlcyBhcmUgcmV0dXJuZWQuIElmIHRoZXJlIGFyZSBubyBieXRlc1xuICAgKiBsZWZ0IGluIHRoZSBidWZmZXIsIGl0IHJldHVybnMgYG51bGxgLlxuICAgKlxuICAgKiBJZiBhbiBlcnJvciBpcyBlbmNvdW50ZXJlZCBiZWZvcmUgYG5gIGJ5dGVzIGFyZSBhdmFpbGFibGUsIGBwZWVrKClgIHRocm93c1xuICAgKiBhbiBlcnJvciB3aXRoIHRoZSBgcGFydGlhbGAgcHJvcGVydHkgc2V0IHRvIGEgc2xpY2Ugb2YgdGhlIGJ1ZmZlciB0aGF0XG4gICAqIGNvbnRhaW5zIHRoZSBieXRlcyB0aGF0IHdlcmUgYXZhaWxhYmxlIGJlZm9yZSB0aGUgZXJyb3Igb2NjdXJyZWQuXG4gICAqL1xuICBhc3luYyBwZWVrKG46IG51bWJlcik6IFByb21pc2U8VWludDhBcnJheSB8IG51bGw+IHtcbiAgICBpZiAobiA8IDApIHtcbiAgICAgIHRocm93IEVycm9yKFwibmVnYXRpdmUgY291bnRcIik7XG4gICAgfVxuXG4gICAgbGV0IGF2YWlsID0gdGhpcy4jdyAtIHRoaXMuI3I7XG4gICAgd2hpbGUgKGF2YWlsIDwgbiAmJiBhdmFpbCA8IHRoaXMuI2J1Zi5ieXRlTGVuZ3RoICYmICF0aGlzLiNlb2YpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMuI2ZpbGwoKTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBpZiAoZXJyIGluc3RhbmNlb2YgUGFydGlhbFJlYWRFcnJvcikge1xuICAgICAgICAgIGVyci5wYXJ0aWFsID0gdGhpcy4jYnVmLnN1YmFycmF5KHRoaXMuI3IsIHRoaXMuI3cpO1xuICAgICAgICB9IGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgICAgY29uc3QgZSA9IG5ldyBQYXJ0aWFsUmVhZEVycm9yKCk7XG4gICAgICAgICAgZS5wYXJ0aWFsID0gdGhpcy4jYnVmLnN1YmFycmF5KHRoaXMuI3IsIHRoaXMuI3cpO1xuICAgICAgICAgIGUuc3RhY2sgPSBlcnIuc3RhY2s7XG4gICAgICAgICAgZS5tZXNzYWdlID0gZXJyLm1lc3NhZ2U7XG4gICAgICAgICAgZS5jYXVzZSA9IGVyci5jYXVzZTtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgfVxuICAgICAgYXZhaWwgPSB0aGlzLiN3IC0gdGhpcy4jcjtcbiAgICB9XG5cbiAgICBpZiAoYXZhaWwgPT09IDAgJiYgdGhpcy4jZW9mKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9IGVsc2UgaWYgKGF2YWlsIDwgbiAmJiB0aGlzLiNlb2YpIHtcbiAgICAgIHJldHVybiB0aGlzLiNidWYuc3ViYXJyYXkodGhpcy4jciwgdGhpcy4jciArIGF2YWlsKTtcbiAgICB9IGVsc2UgaWYgKGF2YWlsIDwgbikge1xuICAgICAgdGhyb3cgbmV3IEJ1ZmZlckZ1bGxFcnJvcih0aGlzLiNidWYuc3ViYXJyYXkodGhpcy4jciwgdGhpcy4jdykpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLiNidWYuc3ViYXJyYXkodGhpcy4jciwgdGhpcy4jciArIG4pO1xuICB9XG59XG5cbmFic3RyYWN0IGNsYXNzIEFic3RyYWN0QnVmQmFzZSB7XG4gIGJ1ZjogVWludDhBcnJheTtcbiAgdXNlZEJ1ZmZlckJ5dGVzID0gMDtcbiAgZXJyOiBFcnJvciB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKGJ1ZjogVWludDhBcnJheSkge1xuICAgIHRoaXMuYnVmID0gYnVmO1xuICB9XG5cbiAgLyoqIFNpemUgcmV0dXJucyB0aGUgc2l6ZSBvZiB0aGUgdW5kZXJseWluZyBidWZmZXIgaW4gYnl0ZXMuICovXG4gIHNpemUoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5idWYuYnl0ZUxlbmd0aDtcbiAgfVxuXG4gIC8qKiBSZXR1cm5zIGhvdyBtYW55IGJ5dGVzIGFyZSB1bnVzZWQgaW4gdGhlIGJ1ZmZlci4gKi9cbiAgYXZhaWxhYmxlKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuYnVmLmJ5dGVMZW5ndGggLSB0aGlzLnVzZWRCdWZmZXJCeXRlcztcbiAgfVxuXG4gIC8qKiBidWZmZXJlZCByZXR1cm5zIHRoZSBudW1iZXIgb2YgYnl0ZXMgdGhhdCBoYXZlIGJlZW4gd3JpdHRlbiBpbnRvIHRoZVxuICAgKiBjdXJyZW50IGJ1ZmZlci5cbiAgICovXG4gIGJ1ZmZlcmVkKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMudXNlZEJ1ZmZlckJ5dGVzO1xuICB9XG59XG5cbi8qKiBCdWZXcml0ZXIgaW1wbGVtZW50cyBidWZmZXJpbmcgZm9yIGFuIGRlbm8uV3JpdGVyIG9iamVjdC5cbiAqIElmIGFuIGVycm9yIG9jY3VycyB3cml0aW5nIHRvIGEgV3JpdGVyLCBubyBtb3JlIGRhdGEgd2lsbCBiZVxuICogYWNjZXB0ZWQgYW5kIGFsbCBzdWJzZXF1ZW50IHdyaXRlcywgYW5kIGZsdXNoKCksIHdpbGwgcmV0dXJuIHRoZSBlcnJvci5cbiAqIEFmdGVyIGFsbCBkYXRhIGhhcyBiZWVuIHdyaXR0ZW4sIHRoZSBjbGllbnQgc2hvdWxkIGNhbGwgdGhlXG4gKiBmbHVzaCgpIG1ldGhvZCB0byBndWFyYW50ZWUgYWxsIGRhdGEgaGFzIGJlZW4gZm9yd2FyZGVkIHRvXG4gKiB0aGUgdW5kZXJseWluZyBkZW5vLldyaXRlci5cbiAqL1xuZXhwb3J0IGNsYXNzIEJ1ZldyaXRlciBleHRlbmRzIEFic3RyYWN0QnVmQmFzZSBpbXBsZW1lbnRzIFdyaXRlciB7XG4gICN3cml0ZXI6IFdyaXRlcjtcblxuICAvKiogcmV0dXJuIG5ldyBCdWZXcml0ZXIgdW5sZXNzIHdyaXRlciBpcyBCdWZXcml0ZXIgKi9cbiAgc3RhdGljIGNyZWF0ZSh3cml0ZXI6IFdyaXRlciwgc2l6ZTogbnVtYmVyID0gREVGQVVMVF9CVUZfU0laRSk6IEJ1ZldyaXRlciB7XG4gICAgcmV0dXJuIHdyaXRlciBpbnN0YW5jZW9mIEJ1ZldyaXRlciA/IHdyaXRlciA6IG5ldyBCdWZXcml0ZXIod3JpdGVyLCBzaXplKTtcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKHdyaXRlcjogV3JpdGVyLCBzaXplOiBudW1iZXIgPSBERUZBVUxUX0JVRl9TSVpFKSB7XG4gICAgaWYgKHNpemUgPD0gMCkge1xuICAgICAgc2l6ZSA9IERFRkFVTFRfQlVGX1NJWkU7XG4gICAgfVxuICAgIGNvbnN0IGJ1ZiA9IG5ldyBVaW50OEFycmF5KHNpemUpO1xuICAgIHN1cGVyKGJ1Zik7XG4gICAgdGhpcy4jd3JpdGVyID0gd3JpdGVyO1xuICB9XG5cbiAgLyoqIERpc2NhcmRzIGFueSB1bmZsdXNoZWQgYnVmZmVyZWQgZGF0YSwgY2xlYXJzIGFueSBlcnJvciwgYW5kXG4gICAqIHJlc2V0cyBidWZmZXIgdG8gd3JpdGUgaXRzIG91dHB1dCB0byB3LlxuICAgKi9cbiAgcmVzZXQodzogV3JpdGVyKTogdm9pZCB7XG4gICAgdGhpcy5lcnIgPSBudWxsO1xuICAgIHRoaXMudXNlZEJ1ZmZlckJ5dGVzID0gMDtcbiAgICB0aGlzLiN3cml0ZXIgPSB3O1xuICB9XG5cbiAgLyoqIEZsdXNoIHdyaXRlcyBhbnkgYnVmZmVyZWQgZGF0YSB0byB0aGUgdW5kZXJseWluZyBpby5Xcml0ZXIuICovXG4gIGFzeW5jIGZsdXNoKCkge1xuICAgIGlmICh0aGlzLmVyciAhPT0gbnVsbCkgdGhyb3cgdGhpcy5lcnI7XG4gICAgaWYgKHRoaXMudXNlZEJ1ZmZlckJ5dGVzID09PSAwKSByZXR1cm47XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgcCA9IHRoaXMuYnVmLnN1YmFycmF5KDAsIHRoaXMudXNlZEJ1ZmZlckJ5dGVzKTtcbiAgICAgIGxldCBud3JpdHRlbiA9IDA7XG4gICAgICB3aGlsZSAobndyaXR0ZW4gPCBwLmxlbmd0aCkge1xuICAgICAgICBud3JpdHRlbiArPSBhd2FpdCB0aGlzLiN3cml0ZXIud3JpdGUocC5zdWJhcnJheShud3JpdHRlbikpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgdGhpcy5lcnIgPSBlO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG5cbiAgICB0aGlzLmJ1ZiA9IG5ldyBVaW50OEFycmF5KHRoaXMuYnVmLmxlbmd0aCk7XG4gICAgdGhpcy51c2VkQnVmZmVyQnl0ZXMgPSAwO1xuICB9XG5cbiAgLyoqIFdyaXRlcyB0aGUgY29udGVudHMgb2YgYGRhdGFgIGludG8gdGhlIGJ1ZmZlci4gIElmIHRoZSBjb250ZW50cyB3b24ndCBmdWxseVxuICAgKiBmaXQgaW50byB0aGUgYnVmZmVyLCB0aG9zZSBieXRlcyB0aGF0IGNhbiBhcmUgY29waWVkIGludG8gdGhlIGJ1ZmZlciwgdGhlXG4gICAqIGJ1ZmZlciBpcyB0aGUgZmx1c2hlZCB0byB0aGUgd3JpdGVyIGFuZCB0aGUgcmVtYWluaW5nIGJ5dGVzIGFyZSBjb3BpZWQgaW50b1xuICAgKiB0aGUgbm93IGVtcHR5IGJ1ZmZlci5cbiAgICpcbiAgICogQHJldHVybiB0aGUgbnVtYmVyIG9mIGJ5dGVzIHdyaXR0ZW4gdG8gdGhlIGJ1ZmZlci5cbiAgICovXG4gIGFzeW5jIHdyaXRlKGRhdGE6IFVpbnQ4QXJyYXkpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIGlmICh0aGlzLmVyciAhPT0gbnVsbCkgdGhyb3cgdGhpcy5lcnI7XG4gICAgaWYgKGRhdGEubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcblxuICAgIGxldCB0b3RhbEJ5dGVzV3JpdHRlbiA9IDA7XG4gICAgbGV0IG51bUJ5dGVzV3JpdHRlbiA9IDA7XG4gICAgd2hpbGUgKGRhdGEuYnl0ZUxlbmd0aCA+IHRoaXMuYXZhaWxhYmxlKCkpIHtcbiAgICAgIGlmICh0aGlzLmJ1ZmZlcmVkKCkgPT09IDApIHtcbiAgICAgICAgLy8gTGFyZ2Ugd3JpdGUsIGVtcHR5IGJ1ZmZlci5cbiAgICAgICAgLy8gV3JpdGUgZGlyZWN0bHkgZnJvbSBkYXRhIHRvIGF2b2lkIGNvcHkuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgbnVtQnl0ZXNXcml0dGVuID0gYXdhaXQgdGhpcy4jd3JpdGVyLndyaXRlKGRhdGEpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgaWYgKGUgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICAgICAgdGhpcy5lcnIgPSBlO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBudW1CeXRlc1dyaXR0ZW4gPSBjb3B5KGRhdGEsIHRoaXMuYnVmLCB0aGlzLnVzZWRCdWZmZXJCeXRlcyk7XG4gICAgICAgIHRoaXMudXNlZEJ1ZmZlckJ5dGVzICs9IG51bUJ5dGVzV3JpdHRlbjtcbiAgICAgICAgYXdhaXQgdGhpcy5mbHVzaCgpO1xuICAgICAgfVxuICAgICAgdG90YWxCeXRlc1dyaXR0ZW4gKz0gbnVtQnl0ZXNXcml0dGVuO1xuICAgICAgZGF0YSA9IGRhdGEuc3ViYXJyYXkobnVtQnl0ZXNXcml0dGVuKTtcbiAgICB9XG5cbiAgICBudW1CeXRlc1dyaXR0ZW4gPSBjb3B5KGRhdGEsIHRoaXMuYnVmLCB0aGlzLnVzZWRCdWZmZXJCeXRlcyk7XG4gICAgdGhpcy51c2VkQnVmZmVyQnl0ZXMgKz0gbnVtQnl0ZXNXcml0dGVuO1xuICAgIHRvdGFsQnl0ZXNXcml0dGVuICs9IG51bUJ5dGVzV3JpdHRlbjtcbiAgICByZXR1cm4gdG90YWxCeXRlc1dyaXR0ZW47XG4gIH1cbn1cblxuLyoqIEJ1ZldyaXRlclN5bmMgaW1wbGVtZW50cyBidWZmZXJpbmcgZm9yIGEgZGVuby5Xcml0ZXJTeW5jIG9iamVjdC5cbiAqIElmIGFuIGVycm9yIG9jY3VycyB3cml0aW5nIHRvIGEgV3JpdGVyU3luYywgbm8gbW9yZSBkYXRhIHdpbGwgYmVcbiAqIGFjY2VwdGVkIGFuZCBhbGwgc3Vic2VxdWVudCB3cml0ZXMsIGFuZCBmbHVzaCgpLCB3aWxsIHJldHVybiB0aGUgZXJyb3IuXG4gKiBBZnRlciBhbGwgZGF0YSBoYXMgYmVlbiB3cml0dGVuLCB0aGUgY2xpZW50IHNob3VsZCBjYWxsIHRoZVxuICogZmx1c2goKSBtZXRob2QgdG8gZ3VhcmFudGVlIGFsbCBkYXRhIGhhcyBiZWVuIGZvcndhcmRlZCB0b1xuICogdGhlIHVuZGVybHlpbmcgZGVuby5Xcml0ZXJTeW5jLlxuICovXG5leHBvcnQgY2xhc3MgQnVmV3JpdGVyU3luYyBleHRlbmRzIEFic3RyYWN0QnVmQmFzZSBpbXBsZW1lbnRzIFdyaXRlclN5bmMge1xuICAjd3JpdGVyOiBXcml0ZXJTeW5jO1xuXG4gIC8qKiByZXR1cm4gbmV3IEJ1ZldyaXRlclN5bmMgdW5sZXNzIHdyaXRlciBpcyBCdWZXcml0ZXJTeW5jICovXG4gIHN0YXRpYyBjcmVhdGUoXG4gICAgd3JpdGVyOiBXcml0ZXJTeW5jLFxuICAgIHNpemU6IG51bWJlciA9IERFRkFVTFRfQlVGX1NJWkUsXG4gICk6IEJ1ZldyaXRlclN5bmMge1xuICAgIHJldHVybiB3cml0ZXIgaW5zdGFuY2VvZiBCdWZXcml0ZXJTeW5jXG4gICAgICA/IHdyaXRlclxuICAgICAgOiBuZXcgQnVmV3JpdGVyU3luYyh3cml0ZXIsIHNpemUpO1xuICB9XG5cbiAgY29uc3RydWN0b3Iod3JpdGVyOiBXcml0ZXJTeW5jLCBzaXplOiBudW1iZXIgPSBERUZBVUxUX0JVRl9TSVpFKSB7XG4gICAgaWYgKHNpemUgPD0gMCkge1xuICAgICAgc2l6ZSA9IERFRkFVTFRfQlVGX1NJWkU7XG4gICAgfVxuICAgIGNvbnN0IGJ1ZiA9IG5ldyBVaW50OEFycmF5KHNpemUpO1xuICAgIHN1cGVyKGJ1Zik7XG4gICAgdGhpcy4jd3JpdGVyID0gd3JpdGVyO1xuICB9XG5cbiAgLyoqIERpc2NhcmRzIGFueSB1bmZsdXNoZWQgYnVmZmVyZWQgZGF0YSwgY2xlYXJzIGFueSBlcnJvciwgYW5kXG4gICAqIHJlc2V0cyBidWZmZXIgdG8gd3JpdGUgaXRzIG91dHB1dCB0byB3LlxuICAgKi9cbiAgcmVzZXQodzogV3JpdGVyU3luYyk6IHZvaWQge1xuICAgIHRoaXMuZXJyID0gbnVsbDtcbiAgICB0aGlzLnVzZWRCdWZmZXJCeXRlcyA9IDA7XG4gICAgdGhpcy4jd3JpdGVyID0gdztcbiAgfVxuXG4gIC8qKiBGbHVzaCB3cml0ZXMgYW55IGJ1ZmZlcmVkIGRhdGEgdG8gdGhlIHVuZGVybHlpbmcgaW8uV3JpdGVyU3luYy4gKi9cbiAgZmx1c2goKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuZXJyICE9PSBudWxsKSB0aHJvdyB0aGlzLmVycjtcbiAgICBpZiAodGhpcy51c2VkQnVmZmVyQnl0ZXMgPT09IDApIHJldHVybjtcblxuICAgIHRyeSB7XG4gICAgICBjb25zdCBwID0gdGhpcy5idWYuc3ViYXJyYXkoMCwgdGhpcy51c2VkQnVmZmVyQnl0ZXMpO1xuICAgICAgbGV0IG53cml0dGVuID0gMDtcbiAgICAgIHdoaWxlIChud3JpdHRlbiA8IHAubGVuZ3RoKSB7XG4gICAgICAgIG53cml0dGVuICs9IHRoaXMuI3dyaXRlci53cml0ZVN5bmMocC5zdWJhcnJheShud3JpdHRlbikpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgdGhpcy5lcnIgPSBlO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG5cbiAgICB0aGlzLmJ1ZiA9IG5ldyBVaW50OEFycmF5KHRoaXMuYnVmLmxlbmd0aCk7XG4gICAgdGhpcy51c2VkQnVmZmVyQnl0ZXMgPSAwO1xuICB9XG5cbiAgLyoqIFdyaXRlcyB0aGUgY29udGVudHMgb2YgYGRhdGFgIGludG8gdGhlIGJ1ZmZlci4gIElmIHRoZSBjb250ZW50cyB3b24ndCBmdWxseVxuICAgKiBmaXQgaW50byB0aGUgYnVmZmVyLCB0aG9zZSBieXRlcyB0aGF0IGNhbiBhcmUgY29waWVkIGludG8gdGhlIGJ1ZmZlciwgdGhlXG4gICAqIGJ1ZmZlciBpcyB0aGUgZmx1c2hlZCB0byB0aGUgd3JpdGVyIGFuZCB0aGUgcmVtYWluaW5nIGJ5dGVzIGFyZSBjb3BpZWQgaW50b1xuICAgKiB0aGUgbm93IGVtcHR5IGJ1ZmZlci5cbiAgICpcbiAgICogQHJldHVybiB0aGUgbnVtYmVyIG9mIGJ5dGVzIHdyaXR0ZW4gdG8gdGhlIGJ1ZmZlci5cbiAgICovXG4gIHdyaXRlU3luYyhkYXRhOiBVaW50OEFycmF5KTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy5lcnIgIT09IG51bGwpIHRocm93IHRoaXMuZXJyO1xuICAgIGlmIChkYXRhLmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG5cbiAgICBsZXQgdG90YWxCeXRlc1dyaXR0ZW4gPSAwO1xuICAgIGxldCBudW1CeXRlc1dyaXR0ZW4gPSAwO1xuICAgIHdoaWxlIChkYXRhLmJ5dGVMZW5ndGggPiB0aGlzLmF2YWlsYWJsZSgpKSB7XG4gICAgICBpZiAodGhpcy5idWZmZXJlZCgpID09PSAwKSB7XG4gICAgICAgIC8vIExhcmdlIHdyaXRlLCBlbXB0eSBidWZmZXIuXG4gICAgICAgIC8vIFdyaXRlIGRpcmVjdGx5IGZyb20gZGF0YSB0byBhdm9pZCBjb3B5LlxuICAgICAgICB0cnkge1xuICAgICAgICAgIG51bUJ5dGVzV3JpdHRlbiA9IHRoaXMuI3dyaXRlci53cml0ZVN5bmMoZGF0YSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBpZiAoZSBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgICAgICB0aGlzLmVyciA9IGU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG51bUJ5dGVzV3JpdHRlbiA9IGNvcHkoZGF0YSwgdGhpcy5idWYsIHRoaXMudXNlZEJ1ZmZlckJ5dGVzKTtcbiAgICAgICAgdGhpcy51c2VkQnVmZmVyQnl0ZXMgKz0gbnVtQnl0ZXNXcml0dGVuO1xuICAgICAgICB0aGlzLmZsdXNoKCk7XG4gICAgICB9XG4gICAgICB0b3RhbEJ5dGVzV3JpdHRlbiArPSBudW1CeXRlc1dyaXR0ZW47XG4gICAgICBkYXRhID0gZGF0YS5zdWJhcnJheShudW1CeXRlc1dyaXR0ZW4pO1xuICAgIH1cblxuICAgIG51bUJ5dGVzV3JpdHRlbiA9IGNvcHkoZGF0YSwgdGhpcy5idWYsIHRoaXMudXNlZEJ1ZmZlckJ5dGVzKTtcbiAgICB0aGlzLnVzZWRCdWZmZXJCeXRlcyArPSBudW1CeXRlc1dyaXR0ZW47XG4gICAgdG90YWxCeXRlc1dyaXR0ZW4gKz0gbnVtQnl0ZXNXcml0dGVuO1xuICAgIHJldHVybiB0b3RhbEJ5dGVzV3JpdHRlbjtcbiAgfVxufVxuXG4vKiogR2VuZXJhdGUgbG9uZ2VzdCBwcm9wZXIgcHJlZml4IHdoaWNoIGlzIGFsc28gc3VmZml4IGFycmF5LiAqL1xuZnVuY3Rpb24gY3JlYXRlTFBTKHBhdDogVWludDhBcnJheSk6IFVpbnQ4QXJyYXkge1xuICBjb25zdCBscHMgPSBuZXcgVWludDhBcnJheShwYXQubGVuZ3RoKTtcbiAgbHBzWzBdID0gMDtcbiAgbGV0IHByZWZpeEVuZCA9IDA7XG4gIGxldCBpID0gMTtcbiAgd2hpbGUgKGkgPCBscHMubGVuZ3RoKSB7XG4gICAgaWYgKHBhdFtpXSA9PSBwYXRbcHJlZml4RW5kXSkge1xuICAgICAgcHJlZml4RW5kKys7XG4gICAgICBscHNbaV0gPSBwcmVmaXhFbmQ7XG4gICAgICBpKys7XG4gICAgfSBlbHNlIGlmIChwcmVmaXhFbmQgPT09IDApIHtcbiAgICAgIGxwc1tpXSA9IDA7XG4gICAgICBpKys7XG4gICAgfSBlbHNlIHtcbiAgICAgIHByZWZpeEVuZCA9IGxwc1twcmVmaXhFbmQgLSAxXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGxwcztcbn1cblxuLyoqIFJlYWQgZGVsaW1pdGVkIGJ5dGVzIGZyb20gYSBSZWFkZXIuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24qIHJlYWREZWxpbShcbiAgcmVhZGVyOiBSZWFkZXIsXG4gIGRlbGltOiBVaW50OEFycmF5LFxuKTogQXN5bmNJdGVyYWJsZUl0ZXJhdG9yPFVpbnQ4QXJyYXk+IHtcbiAgLy8gQXZvaWQgdW5pY29kZSBwcm9ibGVtc1xuICBjb25zdCBkZWxpbUxlbiA9IGRlbGltLmxlbmd0aDtcbiAgY29uc3QgZGVsaW1MUFMgPSBjcmVhdGVMUFMoZGVsaW0pO1xuICBjb25zdCBjaHVua3MgPSBuZXcgQnl0ZXNMaXN0KCk7XG4gIGNvbnN0IGJ1ZlNpemUgPSBNYXRoLm1heCgxMDI0LCBkZWxpbUxlbiArIDEpO1xuXG4gIC8vIE1vZGlmaWVkIEtNUFxuICBsZXQgaW5zcGVjdEluZGV4ID0gMDtcbiAgbGV0IG1hdGNoSW5kZXggPSAwO1xuICB3aGlsZSAodHJ1ZSkge1xuICAgIGNvbnN0IGluc3BlY3RBcnIgPSBuZXcgVWludDhBcnJheShidWZTaXplKTtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCByZWFkZXIucmVhZChpbnNwZWN0QXJyKTtcbiAgICBpZiAocmVzdWx0ID09PSBudWxsKSB7XG4gICAgICAvLyBZaWVsZCBsYXN0IGNodW5rLlxuICAgICAgeWllbGQgY2h1bmtzLmNvbmNhdCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZiAocmVzdWx0IDwgMCkge1xuICAgICAgLy8gRGlzY2FyZCBhbGwgcmVtYWluaW5nIGFuZCBzaWxlbnRseSBmYWlsLlxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjaHVua3MuYWRkKGluc3BlY3RBcnIsIDAsIHJlc3VsdCk7XG4gICAgbGV0IGxvY2FsSW5kZXggPSAwO1xuICAgIHdoaWxlIChpbnNwZWN0SW5kZXggPCBjaHVua3Muc2l6ZSgpKSB7XG4gICAgICBpZiAoaW5zcGVjdEFycltsb2NhbEluZGV4XSA9PT0gZGVsaW1bbWF0Y2hJbmRleF0pIHtcbiAgICAgICAgaW5zcGVjdEluZGV4Kys7XG4gICAgICAgIGxvY2FsSW5kZXgrKztcbiAgICAgICAgbWF0Y2hJbmRleCsrO1xuICAgICAgICBpZiAobWF0Y2hJbmRleCA9PT0gZGVsaW1MZW4pIHtcbiAgICAgICAgICAvLyBGdWxsIG1hdGNoXG4gICAgICAgICAgY29uc3QgbWF0Y2hFbmQgPSBpbnNwZWN0SW5kZXggLSBkZWxpbUxlbjtcbiAgICAgICAgICBjb25zdCByZWFkeUJ5dGVzID0gY2h1bmtzLnNsaWNlKDAsIG1hdGNoRW5kKTtcbiAgICAgICAgICB5aWVsZCByZWFkeUJ5dGVzO1xuICAgICAgICAgIC8vIFJlc2V0IG1hdGNoLCBkaWZmZXJlbnQgZnJvbSBLTVAuXG4gICAgICAgICAgY2h1bmtzLnNoaWZ0KGluc3BlY3RJbmRleCk7XG4gICAgICAgICAgaW5zcGVjdEluZGV4ID0gMDtcbiAgICAgICAgICBtYXRjaEluZGV4ID0gMDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKG1hdGNoSW5kZXggPT09IDApIHtcbiAgICAgICAgICBpbnNwZWN0SW5kZXgrKztcbiAgICAgICAgICBsb2NhbEluZGV4Kys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbWF0Y2hJbmRleCA9IGRlbGltTFBTW21hdGNoSW5kZXggLSAxXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vKiogUmVhZCBkZWxpbWl0ZWQgc3RyaW5ncyBmcm9tIGEgUmVhZGVyLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uKiByZWFkU3RyaW5nRGVsaW0oXG4gIHJlYWRlcjogUmVhZGVyLFxuICBkZWxpbTogc3RyaW5nLFxuICBkZWNvZGVyT3B0cz86IHtcbiAgICBlbmNvZGluZz86IHN0cmluZztcbiAgICBmYXRhbD86IGJvb2xlYW47XG4gICAgaWdub3JlQk9NPzogYm9vbGVhbjtcbiAgfSxcbik6IEFzeW5jSXRlcmFibGVJdGVyYXRvcjxzdHJpbmc+IHtcbiAgY29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpO1xuICBjb25zdCBkZWNvZGVyID0gbmV3IFRleHREZWNvZGVyKGRlY29kZXJPcHRzPy5lbmNvZGluZywgZGVjb2Rlck9wdHMpO1xuICBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIHJlYWREZWxpbShyZWFkZXIsIGVuY29kZXIuZW5jb2RlKGRlbGltKSkpIHtcbiAgICB5aWVsZCBkZWNvZGVyLmRlY29kZShjaHVuayk7XG4gIH1cbn1cblxuLyoqIFJlYWQgc3RyaW5ncyBsaW5lLWJ5LWxpbmUgZnJvbSBhIFJlYWRlci4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiogcmVhZExpbmVzKFxuICByZWFkZXI6IFJlYWRlcixcbiAgZGVjb2Rlck9wdHM/OiB7XG4gICAgZW5jb2Rpbmc/OiBzdHJpbmc7XG4gICAgZmF0YWw/OiBib29sZWFuO1xuICAgIGlnbm9yZUJPTT86IGJvb2xlYW47XG4gIH0sXG4pOiBBc3luY0l0ZXJhYmxlSXRlcmF0b3I8c3RyaW5nPiB7XG4gIGNvbnN0IGJ1ZlJlYWRlciA9IG5ldyBCdWZSZWFkZXIocmVhZGVyKTtcbiAgbGV0IGNodW5rczogVWludDhBcnJheVtdID0gW107XG4gIGNvbnN0IGRlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoZGVjb2Rlck9wdHM/LmVuY29kaW5nLCBkZWNvZGVyT3B0cyk7XG4gIHdoaWxlICh0cnVlKSB7XG4gICAgY29uc3QgcmVzID0gYXdhaXQgYnVmUmVhZGVyLnJlYWRMaW5lKCk7XG4gICAgaWYgKCFyZXMpIHtcbiAgICAgIGlmIChjaHVua3MubGVuZ3RoID4gMCkge1xuICAgICAgICB5aWVsZCBkZWNvZGVyLmRlY29kZShjb25jYXQoLi4uY2h1bmtzKSk7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICB9XG4gICAgY2h1bmtzLnB1c2gocmVzLmxpbmUpO1xuICAgIGlmICghcmVzLm1vcmUpIHtcbiAgICAgIHlpZWxkIGRlY29kZXIuZGVjb2RlKGNvbmNhdCguLi5jaHVua3MpKTtcbiAgICAgIGNodW5rcyA9IFtdO1xuICAgIH1cbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLEVBQTBFLEFBQTFFLHdFQUEwRTtBQUMxRSxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQW9CO0FBQzNDLE1BQU0sR0FBRyxTQUFTLFFBQVEsQ0FBd0I7QUFDbEQsTUFBTSxHQUFHLE1BQU0sRUFBRSxJQUFJLFFBQVEsQ0FBaUI7QUFHOUMsRUFBb0UsQUFBcEUsa0VBQW9FO0FBQ3BFLEVBQTRFLEFBQTVFLDBFQUE0RTtBQUM1RSxFQUEyRSxBQUEzRSx5RUFBMkU7QUFDM0UsRUFBcUIsQUFBckIsbUJBQXFCO0FBQ3JCLEtBQUssQ0FBQyxRQUFRLEdBQUcsRUFBRSxHQUFHLElBQUk7QUFDMUIsS0FBSyxDQUFDLFFBQVEsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUM7QUFFNUIsRUFhaUUsQUFiakU7Ozs7Ozs7Ozs7Ozs7K0RBYWlFLEFBYmpFLEVBYWlFLENBRWpFLE1BQU0sT0FBTyxNQUFNO0lBQ2pCLENBQUMsR0FBRztJ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