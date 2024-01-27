// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
// Copyright Joyent, Inc. and other Node contributors.
// Currently optimal queue size, tested on V8 6.0 - 6.6. Must be power of two.
const kSize = 2048;
const kMask = kSize - 1;
// The FixedQueue is implemented as a singly-linked list of fixed-size
// circular buffers. It looks something like this:
//
//  head                                                       tail
//    |                                                          |
//    v                                                          v
// +-----------+ <-----\       +-----------+ <------\         +-----------+
// |  [null]   |        \----- |   next    |         \------- |   next    |
// +-----------+               +-----------+                  +-----------+
// |   item    | <-- bottom    |   item    | <-- bottom       |  [empty]  |
// |   item    |               |   item    |                  |  [empty]  |
// |   item    |               |   item    |                  |  [empty]  |
// |   item    |               |   item    |                  |  [empty]  |
// |   item    |               |   item    |       bottom --> |   item    |
// |   item    |               |   item    |                  |   item    |
// |    ...    |               |    ...    |                  |    ...    |
// |   item    |               |   item    |                  |   item    |
// |   item    |               |   item    |                  |   item    |
// |  [empty]  | <-- top       |   item    |                  |   item    |
// |  [empty]  |               |   item    |                  |   item    |
// |  [empty]  |               |  [empty]  | <-- top  top --> |  [empty]  |
// +-----------+               +-----------+                  +-----------+
//
// Or, if there is only one circular buffer, it looks something
// like either of these:
//
//  head   tail                                 head   tail
//    |     |                                     |     |
//    v     v                                     v     v
// +-----------+                               +-----------+
// |  [null]   |                               |  [null]   |
// +-----------+                               +-----------+
// |  [empty]  |                               |   item    |
// |  [empty]  |                               |   item    |
// |   item    | <-- bottom            top --> |  [empty]  |
// |   item    |                               |  [empty]  |
// |  [empty]  | <-- top            bottom --> |   item    |
// |  [empty]  |                               |   item    |
// +-----------+                               +-----------+
//
// Adding a value means moving `top` forward by one, removing means
// moving `bottom` forward by one. After reaching the end, the queue
// wraps around.
//
// When `top === bottom` the current queue is empty and when
// `top + 1 === bottom` it's full. This wastes a single space of storage
// but allows much quicker checks.
class FixedCircularBuffer {
    bottom;
    top;
    list;
    next;
    constructor(){
        this.bottom = 0;
        this.top = 0;
        this.list = new Array(kSize);
        this.next = null;
    }
    isEmpty() {
        return this.top === this.bottom;
    }
    isFull() {
        return (this.top + 1 & kMask) === this.bottom;
    }
    push(data) {
        this.list[this.top] = data;
        this.top = this.top + 1 & kMask;
    }
    shift() {
        const nextItem = this.list[this.bottom];
        if (nextItem === undefined) {
            return null;
        }
        this.list[this.bottom] = undefined;
        this.bottom = this.bottom + 1 & kMask;
        return nextItem;
    }
}
export class FixedQueue {
    head;
    tail;
    constructor(){
        this.head = this.tail = new FixedCircularBuffer();
    }
    isEmpty() {
        return this.head.isEmpty();
    }
    push(data) {
        if (this.head.isFull()) {
            // Head is full: Creates a new queue, sets the old queue's `.next` to it,
            // and sets it as the new main queue.
            this.head = this.head.next = new FixedCircularBuffer();
        }
        this.head.push(data);
    }
    shift() {
        const tail = this.tail;
        const next = tail.shift();
        if (tail.isEmpty() && tail.next !== null) {
            // If there is another queue, it forms the new tail.
            this.tail = tail.next;
        }
        return next;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvaW50ZXJuYWwvZml4ZWRfcXVldWUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cbi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuXG4vLyBDdXJyZW50bHkgb3B0aW1hbCBxdWV1ZSBzaXplLCB0ZXN0ZWQgb24gVjggNi4wIC0gNi42LiBNdXN0IGJlIHBvd2VyIG9mIHR3by5cbmNvbnN0IGtTaXplID0gMjA0ODtcbmNvbnN0IGtNYXNrID0ga1NpemUgLSAxO1xuXG4vLyBUaGUgRml4ZWRRdWV1ZSBpcyBpbXBsZW1lbnRlZCBhcyBhIHNpbmdseS1saW5rZWQgbGlzdCBvZiBmaXhlZC1zaXplXG4vLyBjaXJjdWxhciBidWZmZXJzLiBJdCBsb29rcyBzb21ldGhpbmcgbGlrZSB0aGlzOlxuLy9cbi8vICBoZWFkICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhaWxcbi8vICAgIHwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfFxuLy8gICAgdiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2XG4vLyArLS0tLS0tLS0tLS0rIDwtLS0tLVxcICAgICAgICstLS0tLS0tLS0tLSsgPC0tLS0tLVxcICAgICAgICAgKy0tLS0tLS0tLS0tK1xuLy8gfCAgW251bGxdICAgfCAgICAgICAgXFwtLS0tLSB8ICAgbmV4dCAgICB8ICAgICAgICAgXFwtLS0tLS0tIHwgICBuZXh0ICAgIHxcbi8vICstLS0tLS0tLS0tLSsgICAgICAgICAgICAgICArLS0tLS0tLS0tLS0rICAgICAgICAgICAgICAgICAgKy0tLS0tLS0tLS0tK1xuLy8gfCAgIGl0ZW0gICAgfCA8LS0gYm90dG9tICAgIHwgICBpdGVtICAgIHwgPC0tIGJvdHRvbSAgICAgICB8ICBbZW1wdHldICB8XG4vLyB8ICAgaXRlbSAgICB8ICAgICAgICAgICAgICAgfCAgIGl0ZW0gICAgfCAgICAgICAgICAgICAgICAgIHwgIFtlbXB0eV0gIHxcbi8vIHwgICBpdGVtICAgIHwgICAgICAgICAgICAgICB8ICAgaXRlbSAgICB8ICAgICAgICAgICAgICAgICAgfCAgW2VtcHR5XSAgfFxuLy8gfCAgIGl0ZW0gICAgfCAgICAgICAgICAgICAgIHwgICBpdGVtICAgIHwgICAgICAgICAgICAgICAgICB8ICBbZW1wdHldICB8XG4vLyB8ICAgaXRlbSAgICB8ICAgICAgICAgICAgICAgfCAgIGl0ZW0gICAgfCAgICAgICBib3R0b20gLS0+IHwgICBpdGVtICAgIHxcbi8vIHwgICBpdGVtICAgIHwgICAgICAgICAgICAgICB8ICAgaXRlbSAgICB8ICAgICAgICAgICAgICAgICAgfCAgIGl0ZW0gICAgfFxuLy8gfCAgICAuLi4gICAgfCAgICAgICAgICAgICAgIHwgICAgLi4uICAgIHwgICAgICAgICAgICAgICAgICB8ICAgIC4uLiAgICB8XG4vLyB8ICAgaXRlbSAgICB8ICAgICAgICAgICAgICAgfCAgIGl0ZW0gICAgfCAgICAgICAgICAgICAgICAgIHwgICBpdGVtICAgIHxcbi8vIHwgICBpdGVtICAgIHwgICAgICAgICAgICAgICB8ICAgaXRlbSAgICB8ICAgICAgICAgICAgICAgICAgfCAgIGl0ZW0gICAgfFxuLy8gfCAgW2VtcHR5XSAgfCA8LS0gdG9wICAgICAgIHwgICBpdGVtICAgIHwgICAgICAgICAgICAgICAgICB8ICAgaXRlbSAgICB8XG4vLyB8ICBbZW1wdHldICB8ICAgICAgICAgICAgICAgfCAgIGl0ZW0gICAgfCAgICAgICAgICAgICAgICAgIHwgICBpdGVtICAgIHxcbi8vIHwgIFtlbXB0eV0gIHwgICAgICAgICAgICAgICB8ICBbZW1wdHldICB8IDwtLSB0b3AgIHRvcCAtLT4gfCAgW2VtcHR5XSAgfFxuLy8gKy0tLS0tLS0tLS0tKyAgICAgICAgICAgICAgICstLS0tLS0tLS0tLSsgICAgICAgICAgICAgICAgICArLS0tLS0tLS0tLS0rXG4vL1xuLy8gT3IsIGlmIHRoZXJlIGlzIG9ubHkgb25lIGNpcmN1bGFyIGJ1ZmZlciwgaXQgbG9va3Mgc29tZXRoaW5nXG4vLyBsaWtlIGVpdGhlciBvZiB0aGVzZTpcbi8vXG4vLyAgaGVhZCAgIHRhaWwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoZWFkICAgdGFpbFxuLy8gICAgfCAgICAgfCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8ICAgICB8XG4vLyAgICB2ICAgICB2ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHYgICAgIHZcbi8vICstLS0tLS0tLS0tLSsgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKy0tLS0tLS0tLS0tK1xuLy8gfCAgW251bGxdICAgfCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8ICBbbnVsbF0gICB8XG4vLyArLS0tLS0tLS0tLS0rICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICstLS0tLS0tLS0tLStcbi8vIHwgIFtlbXB0eV0gIHwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfCAgIGl0ZW0gICAgfFxuLy8gfCAgW2VtcHR5XSAgfCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8ICAgaXRlbSAgICB8XG4vLyB8ICAgaXRlbSAgICB8IDwtLSBib3R0b20gICAgICAgICAgICB0b3AgLS0+IHwgIFtlbXB0eV0gIHxcbi8vIHwgICBpdGVtICAgIHwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfCAgW2VtcHR5XSAgfFxuLy8gfCAgW2VtcHR5XSAgfCA8LS0gdG9wICAgICAgICAgICAgYm90dG9tIC0tPiB8ICAgaXRlbSAgICB8XG4vLyB8ICBbZW1wdHldICB8ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHwgICBpdGVtICAgIHxcbi8vICstLS0tLS0tLS0tLSsgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKy0tLS0tLS0tLS0tK1xuLy9cbi8vIEFkZGluZyBhIHZhbHVlIG1lYW5zIG1vdmluZyBgdG9wYCBmb3J3YXJkIGJ5IG9uZSwgcmVtb3ZpbmcgbWVhbnNcbi8vIG1vdmluZyBgYm90dG9tYCBmb3J3YXJkIGJ5IG9uZS4gQWZ0ZXIgcmVhY2hpbmcgdGhlIGVuZCwgdGhlIHF1ZXVlXG4vLyB3cmFwcyBhcm91bmQuXG4vL1xuLy8gV2hlbiBgdG9wID09PSBib3R0b21gIHRoZSBjdXJyZW50IHF1ZXVlIGlzIGVtcHR5IGFuZCB3aGVuXG4vLyBgdG9wICsgMSA9PT0gYm90dG9tYCBpdCdzIGZ1bGwuIFRoaXMgd2FzdGVzIGEgc2luZ2xlIHNwYWNlIG9mIHN0b3JhZ2Vcbi8vIGJ1dCBhbGxvd3MgbXVjaCBxdWlja2VyIGNoZWNrcy5cblxuY2xhc3MgRml4ZWRDaXJjdWxhckJ1ZmZlciB7XG4gIGJvdHRvbTogbnVtYmVyO1xuICB0b3A6IG51bWJlcjtcbiAgbGlzdDogdW5kZWZpbmVkIHwgQXJyYXk8dW5rbm93bj47XG4gIG5leHQ6IEZpeGVkQ2lyY3VsYXJCdWZmZXIgfCBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuYm90dG9tID0gMDtcbiAgICB0aGlzLnRvcCA9IDA7XG4gICAgdGhpcy5saXN0ID0gbmV3IEFycmF5KGtTaXplKTtcbiAgICB0aGlzLm5leHQgPSBudWxsO1xuICB9XG5cbiAgaXNFbXB0eSgpIHtcbiAgICByZXR1cm4gdGhpcy50b3AgPT09IHRoaXMuYm90dG9tO1xuICB9XG5cbiAgaXNGdWxsKCkge1xuICAgIHJldHVybiAoKHRoaXMudG9wICsgMSkgJiBrTWFzaykgPT09IHRoaXMuYm90dG9tO1xuICB9XG5cbiAgcHVzaChkYXRhOiB1bmtub3duKSB7XG4gICAgdGhpcy5saXN0IVt0aGlzLnRvcF0gPSBkYXRhO1xuICAgIHRoaXMudG9wID0gKHRoaXMudG9wICsgMSkgJiBrTWFzaztcbiAgfVxuXG4gIHNoaWZ0KCkge1xuICAgIGNvbnN0IG5leHRJdGVtID0gdGhpcy5saXN0IVt0aGlzLmJvdHRvbV07XG4gICAgaWYgKG5leHRJdGVtID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICB0aGlzLmxpc3QhW3RoaXMuYm90dG9tXSA9IHVuZGVmaW5lZDtcbiAgICB0aGlzLmJvdHRvbSA9ICh0aGlzLmJvdHRvbSArIDEpICYga01hc2s7XG4gICAgcmV0dXJuIG5leHRJdGVtO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBGaXhlZFF1ZXVlIHtcbiAgaGVhZDogRml4ZWRDaXJjdWxhckJ1ZmZlcjtcbiAgdGFpbDogRml4ZWRDaXJjdWxhckJ1ZmZlcjtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmhlYWQgPSB0aGlzLnRhaWwgPSBuZXcgRml4ZWRDaXJjdWxhckJ1ZmZlcigpO1xuICB9XG5cbiAgaXNFbXB0eSgpIHtcbiAgICByZXR1cm4gdGhpcy5oZWFkLmlzRW1wdHkoKTtcbiAgfVxuXG4gIHB1c2goZGF0YTogdW5rbm93bikge1xuICAgIGlmICh0aGlzLmhlYWQuaXNGdWxsKCkpIHtcbiAgICAgIC8vIEhlYWQgaXMgZnVsbDogQ3JlYXRlcyBhIG5ldyBxdWV1ZSwgc2V0cyB0aGUgb2xkIHF1ZXVlJ3MgYC5uZXh0YCB0byBpdCxcbiAgICAgIC8vIGFuZCBzZXRzIGl0IGFzIHRoZSBuZXcgbWFpbiBxdWV1ZS5cbiAgICAgIHRoaXMuaGVhZCA9IHRoaXMuaGVhZC5uZXh0ID0gbmV3IEZpeGVkQ2lyY3VsYXJCdWZmZXIoKTtcbiAgICB9XG4gICAgdGhpcy5oZWFkLnB1c2goZGF0YSk7XG4gIH1cblxuICBzaGlmdCgpIHtcbiAgICBjb25zdCB0YWlsID0gdGhpcy50YWlsO1xuICAgIGNvbnN0IG5leHQgPSB0YWlsLnNoaWZ0KCk7XG4gICAgaWYgKHRhaWwuaXNFbXB0eSgpICYmIHRhaWwubmV4dCAhPT0gbnVsbCkge1xuICAgICAgLy8gSWYgdGhlcmUgaXMgYW5vdGhlciBxdWV1ZSwgaXQgZm9ybXMgdGhlIG5ldyB0YWlsLlxuICAgICAgdGhpcy50YWlsID0gdGFpbC5uZXh0O1xuICAgIH1cbiAgICByZXR1cm4gbmV4dDtcbiAgfVxufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLDBFQUEwRTtBQUMxRSxzREFBc0Q7QUFFdEQsOEVBQThFO0FBQzlFLE1BQU0sS0FBSyxHQUFHLElBQUksQUFBQztBQUNuQixNQUFNLEtBQUssR0FBRyxLQUFLLEdBQUcsQ0FBQyxBQUFDO0FBRXhCLHNFQUFzRTtBQUN0RSxrREFBa0Q7QUFDbEQsRUFBRTtBQUNGLG1FQUFtRTtBQUNuRSxrRUFBa0U7QUFDbEUsa0VBQWtFO0FBQ2xFLDJFQUEyRTtBQUMzRSwyRUFBMkU7QUFDM0UsMkVBQTJFO0FBQzNFLDJFQUEyRTtBQUMzRSwyRUFBMkU7QUFDM0UsMkVBQTJFO0FBQzNFLDJFQUEyRTtBQUMzRSwyRUFBMkU7QUFDM0UsMkVBQTJFO0FBQzNFLDJFQUEyRTtBQUMzRSwyRUFBMkU7QUFDM0UsMkVBQTJFO0FBQzNFLDJFQUEyRTtBQUMzRSwyRUFBMkU7QUFDM0UsMkVBQTJFO0FBQzNFLDJFQUEyRTtBQUMzRSxFQUFFO0FBQ0YsK0RBQStEO0FBQy9ELHdCQUF3QjtBQUN4QixFQUFFO0FBQ0YsMkRBQTJEO0FBQzNELHlEQUF5RDtBQUN6RCx5REFBeUQ7QUFDekQsNERBQTREO0FBQzVELDREQUE0RDtBQUM1RCw0REFBNEQ7QUFDNUQsNERBQTREO0FBQzVELDREQUE0RDtBQUM1RCw0REFBNEQ7QUFDNUQsNERBQTREO0FBQzVELDREQUE0RDtBQUM1RCw0REFBNEQ7QUFDNUQsNERBQTREO0FBQzVELEVBQUU7QUFDRixtRUFBbUU7QUFDbkUsb0VBQW9FO0FBQ3BFLGdCQUFnQjtBQUNoQixFQUFFO0FBQ0YsNERBQTREO0FBQzVELHdFQUF3RTtB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