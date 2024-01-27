// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.
// Based on https://github.com/golang/go/blob/0452f9460f50f0f0aba18df43dc2b31906fb66cc/src/io/io.go
// Copyright 2009 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
import { Buffer } from "./buffer.ts";
/** Reader utility for strings */ export class StringReader extends Buffer {
    constructor(s){
        super(new TextEncoder().encode(s).buffer);
    }
}
/** Reader utility for combining multiple readers */ export class MultiReader {
    readers;
    currentIndex = 0;
    constructor(...readers){
        this.readers = readers;
    }
    async read(p) {
        const r = this.readers[this.currentIndex];
        if (!r) return null;
        const result = await r.read(p);
        if (result === null) {
            this.currentIndex++;
            return 0;
        }
        return result;
    }
}
/**
 * A `LimitedReader` reads from `reader` but limits the amount of data returned to just `limit` bytes.
 * Each call to `read` updates `limit` to reflect the new amount remaining.
 * `read` returns `null` when `limit` <= `0` or
 * when the underlying `reader` returns `null`.
 */ export class LimitedReader {
    reader;
    limit;
    constructor(reader, limit){
        this.reader = reader;
        this.limit = limit;
    }
    async read(p) {
        if (this.limit <= 0) {
            return null;
        }
        if (p.length > this.limit) {
            p = p.subarray(0, this.limit);
        }
        const n = await this.reader.read(p);
        if (n == null) {
            return null;
        }
        this.limit -= n;
        return n;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjExOC4wL2lvL3JlYWRlcnMudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMSB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cbi8vIEJhc2VkIG9uIGh0dHBzOi8vZ2l0aHViLmNvbS9nb2xhbmcvZ28vYmxvYi8wNDUyZjk0NjBmNTBmMGYwYWJhMThkZjQzZGMyYjMxOTA2ZmI2NmNjL3NyYy9pby9pby5nb1xuLy8gQ29weXJpZ2h0IDIwMDkgVGhlIEdvIEF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vLyBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhIEJTRC1zdHlsZVxuLy8gbGljZW5zZSB0aGF0IGNhbiBiZSBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlLlxuXG5pbXBvcnQgeyBCdWZmZXIgfSBmcm9tIFwiLi9idWZmZXIudHNcIjtcblxuLyoqIFJlYWRlciB1dGlsaXR5IGZvciBzdHJpbmdzICovXG5leHBvcnQgY2xhc3MgU3RyaW5nUmVhZGVyIGV4dGVuZHMgQnVmZmVyIHtcbiAgY29uc3RydWN0b3Ioczogc3RyaW5nKSB7XG4gICAgc3VwZXIobmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKHMpLmJ1ZmZlcik7XG4gIH1cbn1cblxuLyoqIFJlYWRlciB1dGlsaXR5IGZvciBjb21iaW5pbmcgbXVsdGlwbGUgcmVhZGVycyAqL1xuZXhwb3J0IGNsYXNzIE11bHRpUmVhZGVyIGltcGxlbWVudHMgRGVuby5SZWFkZXIge1xuICBwcml2YXRlIHJlYWRvbmx5IHJlYWRlcnM6IERlbm8uUmVhZGVyW107XG4gIHByaXZhdGUgY3VycmVudEluZGV4ID0gMDtcblxuICBjb25zdHJ1Y3RvciguLi5yZWFkZXJzOiBEZW5vLlJlYWRlcltdKSB7XG4gICAgdGhpcy5yZWFkZXJzID0gcmVhZGVycztcbiAgfVxuXG4gIGFzeW5jIHJlYWQocDogVWludDhBcnJheSk6IFByb21pc2U8bnVtYmVyIHwgbnVsbD4ge1xuICAgIGNvbnN0IHIgPSB0aGlzLnJlYWRlcnNbdGhpcy5jdXJyZW50SW5kZXhdO1xuICAgIGlmICghcikgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgci5yZWFkKHApO1xuICAgIGlmIChyZXN1bHQgPT09IG51bGwpIHtcbiAgICAgIHRoaXMuY3VycmVudEluZGV4Kys7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxufVxuXG4vKipcbiAqIEEgYExpbWl0ZWRSZWFkZXJgIHJlYWRzIGZyb20gYHJlYWRlcmAgYnV0IGxpbWl0cyB0aGUgYW1vdW50IG9mIGRhdGEgcmV0dXJuZWQgdG8ganVzdCBgbGltaXRgIGJ5dGVzLlxuICogRWFjaCBjYWxsIHRvIGByZWFkYCB1cGRhdGVzIGBsaW1pdGAgdG8gcmVmbGVjdCB0aGUgbmV3IGFtb3VudCByZW1haW5pbmcuXG4gKiBgcmVhZGAgcmV0dXJucyBgbnVsbGAgd2hlbiBgbGltaXRgIDw9IGAwYCBvclxuICogd2hlbiB0aGUgdW5kZXJseWluZyBgcmVhZGVyYCByZXR1cm5zIGBudWxsYC5cbiAqL1xuZXhwb3J0IGNsYXNzIExpbWl0ZWRSZWFkZXIgaW1wbGVtZW50cyBEZW5vLlJlYWRlciB7XG4gIGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkZXI6IERlbm8uUmVhZGVyLCBwdWJsaWMgbGltaXQ6IG51bWJlcikge31cblxuICBhc3luYyByZWFkKHA6IFVpbnQ4QXJyYXkpOiBQcm9taXNlPG51bWJlciB8IG51bGw+IHtcbiAgICBpZiAodGhpcy5saW1pdCA8PSAwKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAocC5sZW5ndGggPiB0aGlzLmxpbWl0KSB7XG4gICAgICBwID0gcC5zdWJhcnJheSgwLCB0aGlzLmxpbWl0KTtcbiAgICB9XG4gICAgY29uc3QgbiA9IGF3YWl0IHRoaXMucmVhZGVyLnJlYWQocCk7XG4gICAgaWYgKG4gPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgdGhpcy5saW1pdCAtPSBuO1xuICAgIHJldHVybiBuO1xuICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsRUFBMEUsQUFBMUUsd0VBQTBFO0FBQzFFLEVBQW1HLEFBQW5HLGlHQUFtRztBQUNuRyxFQUFzRCxBQUF0RCxvREFBc0Q7QUFDdEQsRUFBcUQsQUFBckQsbURBQXFEO0FBQ3JELEVBQWlELEFBQWpELCtDQUFpRDtBQUVqRCxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQWE7QUFFcEMsRUFBaUMsQUFBakMsNkJBQWlDLEFBQWpDLEVBQWlDLENBQ2pDLE1BQU0sT0FBTyxZQUFZLFNBQVMsTUFBTTtnQkFDMUIsQ0FBUyxDQUFFLENBQUM7UUFDdEIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEdBQUcsTUFBTSxDQUFDLENBQUMsRUFBRSxNQUFNO0lBQzFDLENBQUM7O0FBR0gsRUFBb0QsQUFBcEQsZ0RBQW9ELEFBQXBELEVBQW9ELENBQ3BELE1BQU0sT0FBTyxXQUFXO0lBQ0wsT0FBTztJQUNoQixZQUFZLEdBQUcsQ0FBQzttQkFFVCxPQUFPLENBQWlCLENBQUM7UUFDdEMsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPO0lBQ3hCLENBQUM7VUFFSyxJQUFJLENBQUMsQ0FBYSxFQUEwQixDQUFDO1FBQ2pELEtBQUssQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsWUFBWTtRQUN4QyxFQUFFLEdBQUcsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxJQUFJO1FBQ25CLEtBQUssQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM3QixFQUFFLEVBQUUsTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3BCLElBQUksQ0FBQyxZQUFZO1lBQ2pCLE1BQU0sQ0FBQyxDQUFDO1FBQ1YsQ0FBQztRQUNELE1BQU0sQ0FBQyxNQUFNO0lBQ2YsQ0FBQzs7QUFHSCxFQUtHLEFBTEg7Ozs7O0NBS0csQUFMSCxFQUtHLENBQ0gsTUFBTSxPQUFPLGFBQWE7SUFDTCxNQUFtQjtJQUFTLEtBQWE7Z0JBQXpDLE1BQW1CLEVBQVMsS0FBYSxDQUFFLENBQUM7YUFBNUMsTUFBbUIsR0FBbkIsTUFBbUI7YUFBUyxLQUFhLEdBQWIsS0FBYTtJQUFHLENBQUM7VUFFMUQsSUFBSSxDQUFDLENBQWEsRUFBMEIsQ0FBQztRQUNqRCxFQUFFLEVBQUUsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUNwQixNQUFNLENBQUMsSUFBSTtRQUNiLENBQUM7UUFFRCxFQUFFLEVBQUUsQ0FBQyxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDMUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLO1FBQzlCLENBQUM7UUFDRCxLQUFLLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2xDLEVBQUUsRUFBRSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7WUFDZCxNQUFNLENBQUMsSUFBSTtRQUNiLENBQUM7UUFFRCxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUM7UUFDZixNQUFNLENBQUMsQ0FBQztJQUNWLENBQUMifQ==