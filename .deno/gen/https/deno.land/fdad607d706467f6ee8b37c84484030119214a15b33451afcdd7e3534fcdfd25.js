// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.
import { copy as copyBytes } from "../bytes/mod.ts";
import { assert } from "../testing/asserts.ts";
const DEFAULT_BUFFER_SIZE = 32 * 1024;
/**
 * Read a range of bytes from a file or other resource that is readable and
 * seekable.  The range start and end are inclusive of the bytes within that
 * range.
 *
 * ```ts
 * import { assertEquals } from "../testing/asserts.ts";
 * import { readRange } from "./files.ts";
 *
 * // Read the first 10 bytes of a file
 * const file = await Deno.open("example.txt", { read: true });
 * const bytes = await readRange(file, { start: 0, end: 9 });
 * assertEquals(bytes.length, 10);
 * ```
 */ export async function readRange(r, range) {
    // byte ranges are inclusive, so we have to add one to the end
    let length = range.end - range.start + 1;
    assert(length > 0, "Invalid byte range was passed.");
    await r.seek(range.start, Deno.SeekMode.Start);
    const result = new Uint8Array(length);
    let off = 0;
    while(length){
        const p = new Uint8Array(Math.min(length, DEFAULT_BUFFER_SIZE));
        const nread = await r.read(p);
        assert(nread !== null, "Unexpected EOF reach while reading a range.");
        assert(nread > 0, "Unexpected read of 0 bytes while reading a range.");
        copyBytes(p, result, off);
        off += nread;
        length -= nread;
        assert(length >= 0, "Unexpected length remaining after reading range.");
    }
    return result;
}
/**
 * Read a range of bytes synchronously from a file or other resource that is
 * readable and seekable.  The range start and end are inclusive of the bytes
 * within that range.
 *
 * ```ts
 * import { assertEquals } from "../testing/asserts.ts";
 * import { readRangeSync } from "./files.ts";
 *
 * // Read the first 10 bytes of a file
 * const file = Deno.openSync("example.txt", { read: true });
 * const bytes = readRangeSync(file, { start: 0, end: 9 });
 * assertEquals(bytes.length, 10);
 * ```
 */ export function readRangeSync(r, range) {
    // byte ranges are inclusive, so we have to add one to the end
    let length = range.end - range.start + 1;
    assert(length > 0, "Invalid byte range was passed.");
    r.seekSync(range.start, Deno.SeekMode.Start);
    const result = new Uint8Array(length);
    let off = 0;
    while(length){
        const p = new Uint8Array(Math.min(length, DEFAULT_BUFFER_SIZE));
        const nread = r.readSync(p);
        assert(nread !== null, "Unexpected EOF reach while reading a range.");
        assert(nread > 0, "Unexpected read of 0 bytes while reading a range.");
        copyBytes(p, result, off);
        off += nread;
        length -= nread;
        assert(length >= 0, "Unexpected length remaining after reading range.");
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjExOC4wL2lvL2ZpbGVzLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjEgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG5cbmltcG9ydCB7IGNvcHkgYXMgY29weUJ5dGVzIH0gZnJvbSBcIi4uL2J5dGVzL21vZC50c1wiO1xuaW1wb3J0IHsgYXNzZXJ0IH0gZnJvbSBcIi4uL3Rlc3RpbmcvYXNzZXJ0cy50c1wiO1xuXG5jb25zdCBERUZBVUxUX0JVRkZFUl9TSVpFID0gMzIgKiAxMDI0O1xuXG5leHBvcnQgaW50ZXJmYWNlIEJ5dGVSYW5nZSB7XG4gIC8qKiBUaGUgMCBiYXNlZCBpbmRleCBvZiB0aGUgc3RhcnQgYnl0ZSBmb3IgYSByYW5nZS4gKi9cbiAgc3RhcnQ6IG51bWJlcjtcblxuICAvKiogVGhlIDAgYmFzZWQgaW5kZXggb2YgdGhlIGVuZCBieXRlIGZvciBhIHJhbmdlLCB3aGljaCBpcyBpbmNsdXNpdmUuICovXG4gIGVuZDogbnVtYmVyO1xufVxuXG4vKipcbiAqIFJlYWQgYSByYW5nZSBvZiBieXRlcyBmcm9tIGEgZmlsZSBvciBvdGhlciByZXNvdXJjZSB0aGF0IGlzIHJlYWRhYmxlIGFuZFxuICogc2Vla2FibGUuICBUaGUgcmFuZ2Ugc3RhcnQgYW5kIGVuZCBhcmUgaW5jbHVzaXZlIG9mIHRoZSBieXRlcyB3aXRoaW4gdGhhdFxuICogcmFuZ2UuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IGFzc2VydEVxdWFscyB9IGZyb20gXCIuLi90ZXN0aW5nL2Fzc2VydHMudHNcIjtcbiAqIGltcG9ydCB7IHJlYWRSYW5nZSB9IGZyb20gXCIuL2ZpbGVzLnRzXCI7XG4gKlxuICogLy8gUmVhZCB0aGUgZmlyc3QgMTAgYnl0ZXMgb2YgYSBmaWxlXG4gKiBjb25zdCBmaWxlID0gYXdhaXQgRGVuby5vcGVuKFwiZXhhbXBsZS50eHRcIiwgeyByZWFkOiB0cnVlIH0pO1xuICogY29uc3QgYnl0ZXMgPSBhd2FpdCByZWFkUmFuZ2UoZmlsZSwgeyBzdGFydDogMCwgZW5kOiA5IH0pO1xuICogYXNzZXJ0RXF1YWxzKGJ5dGVzLmxlbmd0aCwgMTApO1xuICogYGBgXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWFkUmFuZ2UoXG4gIHI6IERlbm8uUmVhZGVyICYgRGVuby5TZWVrZXIsXG4gIHJhbmdlOiBCeXRlUmFuZ2UsXG4pOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcbiAgLy8gYnl0ZSByYW5nZXMgYXJlIGluY2x1c2l2ZSwgc28gd2UgaGF2ZSB0byBhZGQgb25lIHRvIHRoZSBlbmRcbiAgbGV0IGxlbmd0aCA9IHJhbmdlLmVuZCAtIHJhbmdlLnN0YXJ0ICsgMTtcbiAgYXNzZXJ0KGxlbmd0aCA+IDAsIFwiSW52YWxpZCBieXRlIHJhbmdlIHdhcyBwYXNzZWQuXCIpO1xuICBhd2FpdCByLnNlZWsocmFuZ2Uuc3RhcnQsIERlbm8uU2Vla01vZGUuU3RhcnQpO1xuICBjb25zdCByZXN1bHQgPSBuZXcgVWludDhBcnJheShsZW5ndGgpO1xuICBsZXQgb2ZmID0gMDtcbiAgd2hpbGUgKGxlbmd0aCkge1xuICAgIGNvbnN0IHAgPSBuZXcgVWludDhBcnJheShNYXRoLm1pbihsZW5ndGgsIERFRkFVTFRfQlVGRkVSX1NJWkUpKTtcbiAgICBjb25zdCBucmVhZCA9IGF3YWl0IHIucmVhZChwKTtcbiAgICBhc3NlcnQobnJlYWQgIT09IG51bGwsIFwiVW5leHBlY3RlZCBFT0YgcmVhY2ggd2hpbGUgcmVhZGluZyBhIHJhbmdlLlwiKTtcbiAgICBhc3NlcnQobnJlYWQgPiAwLCBcIlVuZXhwZWN0ZWQgcmVhZCBvZiAwIGJ5dGVzIHdoaWxlIHJlYWRpbmcgYSByYW5nZS5cIik7XG4gICAgY29weUJ5dGVzKHAsIHJlc3VsdCwgb2ZmKTtcbiAgICBvZmYgKz0gbnJlYWQ7XG4gICAgbGVuZ3RoIC09IG5yZWFkO1xuICAgIGFzc2VydChsZW5ndGggPj0gMCwgXCJVbmV4cGVjdGVkIGxlbmd0aCByZW1haW5pbmcgYWZ0ZXIgcmVhZGluZyByYW5nZS5cIik7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBSZWFkIGEgcmFuZ2Ugb2YgYnl0ZXMgc3luY2hyb25vdXNseSBmcm9tIGEgZmlsZSBvciBvdGhlciByZXNvdXJjZSB0aGF0IGlzXG4gKiByZWFkYWJsZSBhbmQgc2Vla2FibGUuICBUaGUgcmFuZ2Ugc3RhcnQgYW5kIGVuZCBhcmUgaW5jbHVzaXZlIG9mIHRoZSBieXRlc1xuICogd2l0aGluIHRoYXQgcmFuZ2UuXG4gKlxuICogYGBgdHNcbiAqIGltcG9ydCB7IGFzc2VydEVxdWFscyB9IGZyb20gXCIuLi90ZXN0aW5nL2Fzc2VydHMudHNcIjtcbiAqIGltcG9ydCB7IHJlYWRSYW5nZVN5bmMgfSBmcm9tIFwiLi9maWxlcy50c1wiO1xuICpcbiAqIC8vIFJlYWQgdGhlIGZpcnN0IDEwIGJ5dGVzIG9mIGEgZmlsZVxuICogY29uc3QgZmlsZSA9IERlbm8ub3BlblN5bmMoXCJleGFtcGxlLnR4dFwiLCB7IHJlYWQ6IHRydWUgfSk7XG4gKiBjb25zdCBieXRlcyA9IHJlYWRSYW5nZVN5bmMoZmlsZSwgeyBzdGFydDogMCwgZW5kOiA5IH0pO1xuICogYXNzZXJ0RXF1YWxzKGJ5dGVzLmxlbmd0aCwgMTApO1xuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkUmFuZ2VTeW5jKFxuICByOiBEZW5vLlJlYWRlclN5bmMgJiBEZW5vLlNlZWtlclN5bmMsXG4gIHJhbmdlOiBCeXRlUmFuZ2UsXG4pOiBVaW50OEFycmF5IHtcbiAgLy8gYnl0ZSByYW5nZXMgYXJlIGluY2x1c2l2ZSwgc28gd2UgaGF2ZSB0byBhZGQgb25lIHRvIHRoZSBlbmRcbiAgbGV0IGxlbmd0aCA9IHJhbmdlLmVuZCAtIHJhbmdlLnN0YXJ0ICsgMTtcbiAgYXNzZXJ0KGxlbmd0aCA+IDAsIFwiSW52YWxpZCBieXRlIHJhbmdlIHdhcyBwYXNzZWQuXCIpO1xuICByLnNlZWtTeW5jKHJhbmdlLnN0YXJ0LCBEZW5vLlNlZWtNb2RlLlN0YXJ0KTtcbiAgY29uc3QgcmVzdWx0ID0gbmV3IFVpbnQ4QXJyYXkobGVuZ3RoKTtcbiAgbGV0IG9mZiA9IDA7XG4gIHdoaWxlIChsZW5ndGgpIHtcbiAgICBjb25zdCBwID0gbmV3IFVpbnQ4QXJyYXkoTWF0aC5taW4obGVuZ3RoLCBERUZBVUxUX0JVRkZFUl9TSVpFKSk7XG4gICAgY29uc3QgbnJlYWQgPSByLnJlYWRTeW5jKHApO1xuICAgIGFzc2VydChucmVhZCAhPT0gbnVsbCwgXCJVbmV4cGVjdGVkIEVPRiByZWFjaCB3aGlsZSByZWFkaW5nIGEgcmFuZ2UuXCIpO1xuICAgIGFzc2VydChucmVhZCA+IDAsIFwiVW5leHBlY3RlZCByZWFkIG9mIDAgYnl0ZXMgd2hpbGUgcmVhZGluZyBhIHJhbmdlLlwiKTtcbiAgICBjb3B5Qnl0ZXMocCwgcmVzdWx0LCBvZmYpO1xuICAgIG9mZiArPSBucmVhZDtcbiAgICBsZW5ndGggLT0gbnJlYWQ7XG4gICAgYXNzZXJ0KGxlbmd0aCA+PSAwLCBcIlVuZXhwZWN0ZWQgbGVuZ3RoIHJlbWFpbmluZyBhZnRlciByZWFkaW5nIHJhbmdlLlwiKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLEVBQTBFLEFBQTFFLHdFQUEwRTtBQUUxRSxNQUFNLEdBQUcsSUFBSSxJQUFJLFNBQVMsUUFBUSxDQUFpQjtBQUNuRCxNQUFNLEdBQUcsTUFBTSxRQUFRLENBQXVCO0FBRTlDLEtBQUssQ0FBQyxtQkFBbUIsR0FBRyxFQUFFLEdBQUcsSUFBSTtBQVVyQyxFQWNHLEFBZEg7Ozs7Ozs7Ozs7Ozs7O0NBY0csQUFkSCxFQWNHLENBQ0gsTUFBTSxnQkFBZ0IsU0FBUyxDQUM3QixDQUE0QixFQUM1QixLQUFnQixFQUNLLENBQUM7SUFDdEIsRUFBOEQsQUFBOUQsNERBQThEO0lBQzlELEdBQUcsQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUM7SUFDeEMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBZ0M7SUFDbkQsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUs7SUFDN0MsS0FBSyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU07SUFDcEMsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDO1VBQ0osTUFBTSxDQUFFLENBQUM7UUFDZCxLQUFLLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzdELEtBQUssQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1QixNQUFNLENBQUMsS0FBSyxLQUFLLElBQUksRUFBRSxDQUE2QztRQUNwRSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUMsRUFBRSxDQUFtRDtRQUNyRSxTQUFTLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxHQUFHO1FBQ3hCLEdBQUcsSUFBSSxLQUFLO1FBQ1osTUFBTSxJQUFJLEtBQUs7UUFDZixNQUFNLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFrRDtJQUN4RSxDQUFDO0lBQ0QsTUFBTSxDQUFDLE1BQU07QUFDZixDQUFDO0FBRUQsRUFjRyxBQWRIOzs7Ozs7Ozs7Ozs7OztDQWNHLEFBZEgsRUFjRyxDQUNILE1BQU0sVUFBVSxhQUFhLENBQzNCLENBQW9DLEVBQ3BDLEtBQWdCLEVBQ0osQ0FBQztJQUNiLEVBQThELEFBQTlELDREQUE4RDtJQUM5RCxHQUFHLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLEtBQUssR0FBRyxDQUFDO0lBQ3hDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQWdDO0lBQ25ELENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUs7SUFDM0MsS0FBSyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU07SUFDcEMsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDO1VBQ0osTUFBTSxDQUFFLENBQUM7UUFDZCxLQUFLLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsbUJBQW1CO1FBQzdELEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFCLE1BQU0sQ0FBQyxLQUFLLEtBQUssSUFBSSxFQUFFLENBQTZDO1FBQ3BFLE1BQU0sQ0FBQyxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQW1EO1FBQ3JFLFNBQVMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEdBQUc7UUFDeEIsR0FBRyxJQUFJLEtBQUs7UUFDWixNQUFNLElBQUksS0FBSztRQUNmLE1BQU0sQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFLENBQWtEO0lBQ3hFLENBQUM7SUFDRCxNQUFNLENBQUMsTUFBTTtBQUNmLENBQUMifQ==