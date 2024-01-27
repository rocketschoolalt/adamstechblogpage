// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
import Dirent from "./_fs_dirent.ts";
import { assert } from "../../_util/assert.ts";
export default class Dir {
    #dirPath;
    #syncIterator;
    #asyncIterator;
    constructor(path){
        this.#dirPath = path;
    }
    get path() {
        if (this.#dirPath instanceof Uint8Array) {
            return new TextDecoder().decode(this.#dirPath);
        }
        return this.#dirPath;
    }
    // deno-lint-ignore no-explicit-any
    read(callback) {
        return new Promise((resolve, reject)=>{
            if (!this.#asyncIterator) {
                this.#asyncIterator = Deno.readDir(this.path)[Symbol.asyncIterator]();
            }
            assert(this.#asyncIterator);
            this.#asyncIterator.next().then(({ value  })=>{
                resolve(value ? value : null);
                if (callback) {
                    callback(null, value ? value : null);
                }
            }, (err)=>{
                if (callback) {
                    callback(err);
                }
                reject(err);
            });
        });
    }
    readSync() {
        if (!this.#syncIterator) {
            this.#syncIterator = Deno.readDirSync(this.path)[Symbol.iterator]();
        }
        const file = this.#syncIterator.next().value;
        return file ? new Dirent(file) : null;
    }
    /**
   * Unlike Node, Deno does not require managing resource ids for reading
   * directories, and therefore does not need to close directories when
   * finished reading.
   */ // deno-lint-ignore no-explicit-any
    close(callback) {
        return new Promise((resolve)=>{
            if (callback) {
                callback(null);
            }
            resolve();
        });
    }
    /**
   * Unlike Node, Deno does not require managing resource ids for reading
   * directories, and therefore does not need to close directories when
   * finished reading
   */ closeSync() {
    //No op
    }
    async *[Symbol.asyncIterator]() {
        try {
            while(true){
                const dirent = await this.read();
                if (dirent === null) {
                    break;
                }
                yield dirent;
            }
        } finally{
            await this.close();
        }
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvX2ZzL19mc19kaXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cbmltcG9ydCBEaXJlbnQgZnJvbSBcIi4vX2ZzX2RpcmVudC50c1wiO1xuaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcIi4uLy4uL191dGlsL2Fzc2VydC50c1wiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEaXIge1xuICAjZGlyUGF0aDogc3RyaW5nIHwgVWludDhBcnJheTtcbiAgI3N5bmNJdGVyYXRvciE6IEl0ZXJhdG9yPERlbm8uRGlyRW50cnk+IHwgbnVsbDtcbiAgI2FzeW5jSXRlcmF0b3IhOiBBc3luY0l0ZXJhdG9yPERlbm8uRGlyRW50cnk+IHwgbnVsbDtcblxuICBjb25zdHJ1Y3RvcihwYXRoOiBzdHJpbmcgfCBVaW50OEFycmF5KSB7XG4gICAgdGhpcy4jZGlyUGF0aCA9IHBhdGg7XG4gIH1cblxuICBnZXQgcGF0aCgpOiBzdHJpbmcge1xuICAgIGlmICh0aGlzLiNkaXJQYXRoIGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuICAgICAgcmV0dXJuIG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZSh0aGlzLiNkaXJQYXRoKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuI2RpclBhdGg7XG4gIH1cblxuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICByZWFkKGNhbGxiYWNrPzogKC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkKTogUHJvbWlzZTxEaXJlbnQgfCBudWxsPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGlmICghdGhpcy4jYXN5bmNJdGVyYXRvcikge1xuICAgICAgICB0aGlzLiNhc3luY0l0ZXJhdG9yID0gRGVuby5yZWFkRGlyKHRoaXMucGF0aClbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk7XG4gICAgICB9XG4gICAgICBhc3NlcnQodGhpcy4jYXN5bmNJdGVyYXRvcik7XG4gICAgICB0aGlzLiNhc3luY0l0ZXJhdG9yXG4gICAgICAgIC5uZXh0KClcbiAgICAgICAgLnRoZW4oKHsgdmFsdWUgfSkgPT4ge1xuICAgICAgICAgIHJlc29sdmUodmFsdWUgPyB2YWx1ZSA6IG51bGwpO1xuICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2sobnVsbCwgdmFsdWUgPyB2YWx1ZSA6IG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgKGVycikgPT4ge1xuICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcmVhZFN5bmMoKTogRGlyZW50IHwgbnVsbCB7XG4gICAgaWYgKCF0aGlzLiNzeW5jSXRlcmF0b3IpIHtcbiAgICAgIHRoaXMuI3N5bmNJdGVyYXRvciA9IERlbm8ucmVhZERpclN5bmModGhpcy5wYXRoKSFbU3ltYm9sLml0ZXJhdG9yXSgpO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGU6IERlbm8uRGlyRW50cnkgPSB0aGlzLiNzeW5jSXRlcmF0b3IubmV4dCgpLnZhbHVlO1xuXG4gICAgcmV0dXJuIGZpbGUgPyBuZXcgRGlyZW50KGZpbGUpIDogbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBVbmxpa2UgTm9kZSwgRGVubyBkb2VzIG5vdCByZXF1aXJlIG1hbmFnaW5nIHJlc291cmNlIGlkcyBmb3IgcmVhZGluZ1xuICAgKiBkaXJlY3RvcmllcywgYW5kIHRoZXJlZm9yZSBkb2VzIG5vdCBuZWVkIHRvIGNsb3NlIGRpcmVjdG9yaWVzIHdoZW5cbiAgICogZmluaXNoZWQgcmVhZGluZy5cbiAgICovXG4gIC8vIGRlbm8tbGludC1pZ25vcmUgbm8tZXhwbGljaXQtYW55XG4gIGNsb3NlKGNhbGxiYWNrPzogKC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICB9XG4gICAgICByZXNvbHZlKCk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogVW5saWtlIE5vZGUsIERlbm8gZG9lcyBub3QgcmVxdWlyZSBtYW5hZ2luZyByZXNvdXJjZSBpZHMgZm9yIHJlYWRpbmdcbiAgICogZGlyZWN0b3JpZXMsIGFuZCB0aGVyZWZvcmUgZG9lcyBub3QgbmVlZCB0byBjbG9zZSBkaXJlY3RvcmllcyB3aGVuXG4gICAqIGZpbmlzaGVkIHJlYWRpbmdcbiAgICovXG4gIGNsb3NlU3luYygpOiB2b2lkIHtcbiAgICAvL05vIG9wXG4gIH1cblxuICBhc3luYyAqW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSgpOiBBc3luY0l0ZXJhYmxlSXRlcmF0b3I8RGlyZW50PiB7XG4gICAgdHJ5IHtcbiAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgIGNvbnN0IGRpcmVudDogRGlyZW50IHwgbnVsbCA9IGF3YWl0IHRoaXMucmVhZCgpO1xuICAgICAgICBpZiAoZGlyZW50ID09PSBudWxsKSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgeWllbGQgZGlyZW50O1xuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICBhd2FpdCB0aGlzLmNsb3NlKCk7XG4gICAgfVxuICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLE9BQU8sTUFBTSxNQUFNLGlCQUFpQixDQUFDO0FBQ3JDLFNBQVMsTUFBTSxRQUFRLHVCQUF1QixDQUFDO0FBRS9DLGVBQWUsTUFBTSxH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