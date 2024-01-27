// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.
import { deferred } from "./deferred.ts";
/** The MuxAsyncIterator class multiplexes multiple async iterators into a
 * single stream. It currently makes an assumption:
 * - The final result (the value returned and not yielded from the iterator)
 *   does not matter; if there is any, it is discarded.
 */ export class MuxAsyncIterator {
    iteratorCount = 0;
    yields = [];
    // deno-lint-ignore no-explicit-any
    throws = [];
    signal = deferred();
    add(iterable) {
        ++this.iteratorCount;
        this.callIteratorNext(iterable[Symbol.asyncIterator]());
    }
    async callIteratorNext(iterator) {
        try {
            const { value , done  } = await iterator.next();
            if (done) {
                --this.iteratorCount;
            } else {
                this.yields.push({
                    iterator,
                    value
                });
            }
        } catch (e) {
            this.throws.push(e);
        }
        this.signal.resolve();
    }
    async *iterate() {
        while(this.iteratorCount > 0){
            // Sleep until any of the wrapped iterators yields.
            await this.signal;
            // Note that while we're looping over `yields`, new items may be added.
            for(let i = 0; i < this.yields.length; i++){
                const { iterator , value  } = this.yields[i];
                yield value;
                this.callIteratorNext(iterator);
            }
            if (this.throws.length) {
                for (const e of this.throws){
                    throw e;
                }
                this.throws.length = 0;
            }
            // Clear the `yields` list and reset the `signal` promise.
            this.yields.length = 0;
            this.signal = deferred();
        }
    }
    [Symbol.asyncIterator]() {
        return this.iterate();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjEyMC4wL2FzeW5jL211eF9hc3luY19pdGVyYXRvci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAxOC0yMDIxIHRoZSBEZW5vIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuaW1wb3J0IHsgRGVmZXJyZWQsIGRlZmVycmVkIH0gZnJvbSBcIi4vZGVmZXJyZWQudHNcIjtcblxuaW50ZXJmYWNlIFRhZ2dlZFlpZWxkZWRWYWx1ZTxUPiB7XG4gIGl0ZXJhdG9yOiBBc3luY0l0ZXJhdG9yPFQ+O1xuICB2YWx1ZTogVDtcbn1cblxuLyoqIFRoZSBNdXhBc3luY0l0ZXJhdG9yIGNsYXNzIG11bHRpcGxleGVzIG11bHRpcGxlIGFzeW5jIGl0ZXJhdG9ycyBpbnRvIGFcbiAqIHNpbmdsZSBzdHJlYW0uIEl0IGN1cnJlbnRseSBtYWtlcyBhbiBhc3N1bXB0aW9uOlxuICogLSBUaGUgZmluYWwgcmVzdWx0ICh0aGUgdmFsdWUgcmV0dXJuZWQgYW5kIG5vdCB5aWVsZGVkIGZyb20gdGhlIGl0ZXJhdG9yKVxuICogICBkb2VzIG5vdCBtYXR0ZXI7IGlmIHRoZXJlIGlzIGFueSwgaXQgaXMgZGlzY2FyZGVkLlxuICovXG5leHBvcnQgY2xhc3MgTXV4QXN5bmNJdGVyYXRvcjxUPiBpbXBsZW1lbnRzIEFzeW5jSXRlcmFibGU8VD4ge1xuICBwcml2YXRlIGl0ZXJhdG9yQ291bnQgPSAwO1xuICBwcml2YXRlIHlpZWxkczogQXJyYXk8VGFnZ2VkWWllbGRlZFZhbHVlPFQ+PiA9IFtdO1xuICAvLyBkZW5vLWxpbnQtaWdub3JlIG5vLWV4cGxpY2l0LWFueVxuICBwcml2YXRlIHRocm93czogYW55W10gPSBbXTtcbiAgcHJpdmF0ZSBzaWduYWw6IERlZmVycmVkPHZvaWQ+ID0gZGVmZXJyZWQoKTtcblxuICBhZGQoaXRlcmFibGU6IEFzeW5jSXRlcmFibGU8VD4pOiB2b2lkIHtcbiAgICArK3RoaXMuaXRlcmF0b3JDb3VudDtcbiAgICB0aGlzLmNhbGxJdGVyYXRvck5leHQoaXRlcmFibGVbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjYWxsSXRlcmF0b3JOZXh0KFxuICAgIGl0ZXJhdG9yOiBBc3luY0l0ZXJhdG9yPFQ+LFxuICApIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyB2YWx1ZSwgZG9uZSB9ID0gYXdhaXQgaXRlcmF0b3IubmV4dCgpO1xuICAgICAgaWYgKGRvbmUpIHtcbiAgICAgICAgLS10aGlzLml0ZXJhdG9yQ291bnQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnlpZWxkcy5wdXNoKHsgaXRlcmF0b3IsIHZhbHVlIH0pO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHRoaXMudGhyb3dzLnB1c2goZSk7XG4gICAgfVxuICAgIHRoaXMuc2lnbmFsLnJlc29sdmUoKTtcbiAgfVxuXG4gIGFzeW5jICppdGVyYXRlKCk6IEFzeW5jSXRlcmFibGVJdGVyYXRvcjxUPiB7XG4gICAgd2hpbGUgKHRoaXMuaXRlcmF0b3JDb3VudCA+IDApIHtcbiAgICAgIC8vIFNsZWVwIHVudGlsIGFueSBvZiB0aGUgd3JhcHBlZCBpdGVyYXRvcnMgeWllbGRzLlxuICAgICAgYXdhaXQgdGhpcy5zaWduYWw7XG5cbiAgICAgIC8vIE5vdGUgdGhhdCB3aGlsZSB3ZSdyZSBsb29waW5nIG92ZXIgYHlpZWxkc2AsIG5ldyBpdGVtcyBtYXkgYmUgYWRkZWQuXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMueWllbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHsgaXRlcmF0b3IsIHZhbHVlIH0gPSB0aGlzLnlpZWxkc1tpXTtcbiAgICAgICAgeWllbGQgdmFsdWU7XG4gICAgICAgIHRoaXMuY2FsbEl0ZXJhdG9yTmV4dChpdGVyYXRvcik7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnRocm93cy5sZW5ndGgpIHtcbiAgICAgICAgZm9yIChjb25zdCBlIG9mIHRoaXMudGhyb3dzKSB7XG4gICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnRocm93cy5sZW5ndGggPSAwO1xuICAgICAgfVxuICAgICAgLy8gQ2xlYXIgdGhlIGB5aWVsZHNgIGxpc3QgYW5kIHJlc2V0IHRoZSBgc2lnbmFsYCBwcm9taXNlLlxuICAgICAgdGhpcy55aWVsZHMubGVuZ3RoID0gMDtcbiAgICAgIHRoaXMuc2lnbmFsID0gZGVmZXJyZWQoKTtcbiAgICB9XG4gIH1cblxuICBbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk6IEFzeW5jSXRlcmF0b3I8VD4ge1xuICAgIHJldHVybiB0aGlzLml0ZXJhdGUoKTtcbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxTQUFtQixRQUFRLFFBQVEsZUFBZSxDQUFDO0FBT25EOzs7O0dBSUcsQ0FDSCxPQUFPLE1BQU0sZ0JBQWdCO0lBQzNCLEFBQVEsYUFBYSxHQUFHLENBQUMsQ0FBQztJQUMxQixBQUFRLE1BQU0sR0FBaUMsRUFBRSxDQUFDO0lBQ2xELG1DQUFtQztJQUNuQyxBQUFRLE1BQU0sR0FBVSxFQUFFLENBQUM7SUFDM0IsQUFBUSxNQUFNLEdBQW1CLFFBQVEsRUFBRSxDQUFDO0lBRTVDLEdBQUcsQ0FBQyxRQUEwQixFQUFRO1FBQ3BDLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQztRQUNyQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7S0FDekQ7SUFFRCxNQUFjLGdCQUFnQixDQUM1QixRQUEwQixFQUMxQjtRQUNBLElBQUk7WUFDRixNQUFNLEVBQUUsS0FBSyxDQUFBLEVBQUUsSUFBSSxDQUFBLEVBQUUsR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQUFBQztZQUM5QyxJQUFJLElBQUksRUFBRTtnQkFDUixFQUFFLElBQUksQ0FBQyxhQUFhLENBQUM7YUFDdEIsTUFBTTtnQkFDTCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztvQkFBRSxRQUFRO29CQUFFLEtBQUs7aUJBQUUsQ0FBQyxDQUFDO2FBQ3ZDO1NBQ0YsQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUNWLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ3JCO1FBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztLQUN2QjtJQUVELE9BQU8sT0FBTyxHQUE2QjtRQUN6QyxNQUFPLElBQUksQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFFO1lBQzdCLG1EQUFtRDtZQUNuRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUM7WUFFbEIsdUVBQXVFO1lBQ3ZFLElBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBRTtnQkFDM0MsTUFBTSxFQUFFLFFBQVEsQ0FBQSxFQUFFLEtBQUssQ0FBQSxFQUFFLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQUFBQztnQkFDM0MsTUFBTSxLQUFLLENBQUM7Z0JBQ1osSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxDQUFDO2FBQ2pDO1lBRUQsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRTtnQkFDdEIsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFFO29CQUMzQixNQUFNLENBQUMsQ0FBQztpQkFDVDtnQkFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7YUFDeEI7WUFDRCwwREFBMEQ7WUFDMUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxNQUFNLEdBQUcsUUFBUSxFQUFFLENBQUM7U0FDMUI7S0FDRjtJQUVELENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxHQUFxQjtRQUN6QyxPQUFPLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztLQUN2QjtDQUNGIn0=