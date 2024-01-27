// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
/* Copyright 1998 by the Massachusetts Institute of Technology.
 *
 * Permission to use, copy, modify, and distribute this
 * software and its documentation for any purpose and without
 * fee is hereby granted, provided that the above copyright
 * notice appear in all copies and that both that copyright
 * notice and this permission notice appear in supporting
 * documentation, and that the name of M.I.T. not be used in
 * advertising or publicity pertaining to distribution of the
 * software without specific, written prior permission.
 * M.I.T. makes no representations about the suitability of
 * this software for any purpose.  It is provided "as is"
 * without express or implied warranty.
 */ // REF: https://github.com/nodejs/node/blob/master/deps/cares/include/ares.h#L190
export const ARES_AI_CANONNAME = 1 << 0;
export const ARES_AI_NUMERICHOST = 1 << 1;
export const ARES_AI_PASSIVE = 1 << 2;
export const ARES_AI_NUMERICSERV = 1 << 3;
export const AI_V4MAPPED = 1 << 4;
export const AI_ALL = 1 << 5;
export const AI_ADDRCONFIG = 1 << 6;
export const ARES_AI_NOSORT = 1 << 7;
export const ARES_AI_ENVHOSTS = 1 << 8;
// REF: https://github.com/nodejs/node/blob/master/deps/cares/src/lib/ares_strerror.c
export function ares_strerror(code) {
    /* Return a string literal from a table. */ const errorText = [
        "Successful completion",
        "DNS server returned answer with no data",
        "DNS server claims query was misformatted",
        "DNS server returned general failure",
        "Domain name not found",
        "DNS server does not implement requested operation",
        "DNS server refused query",
        "Misformatted DNS query",
        "Misformatted domain name",
        "Unsupported address family",
        "Misformatted DNS reply",
        "Could not contact DNS servers",
        "Timeout while contacting DNS servers",
        "End of file",
        "Error reading file",
        "Out of memory",
        "Channel is being destroyed",
        "Misformatted string",
        "Illegal flags specified",
        "Given hostname is not numeric",
        "Illegal hints flags specified",
        "c-ares library initialization not yet performed",
        "Error loading iphlpapi.dll",
        "Could not find GetNetworkParams function",
        "DNS query cancelled", 
    ];
    if (code >= 0 && code < errorText.length) {
        return errorText[code];
    } else {
        return "unknown";
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvaW50ZXJuYWxfYmluZGluZy9hcmVzLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIENvcHlyaWdodCAyMDE4LTIwMjIgdGhlIERlbm8gYXV0aG9ycy4gQWxsIHJpZ2h0cyByZXNlcnZlZC4gTUlUIGxpY2Vuc2UuXG4vKiBDb3B5cmlnaHQgMTk5OCBieSB0aGUgTWFzc2FjaHVzZXR0cyBJbnN0aXR1dGUgb2YgVGVjaG5vbG9neS5cbiAqXG4gKiBQZXJtaXNzaW9uIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBhbmQgZGlzdHJpYnV0ZSB0aGlzXG4gKiBzb2Z0d2FyZSBhbmQgaXRzIGRvY3VtZW50YXRpb24gZm9yIGFueSBwdXJwb3NlIGFuZCB3aXRob3V0XG4gKiBmZWUgaXMgaGVyZWJ5IGdyYW50ZWQsIHByb3ZpZGVkIHRoYXQgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogbm90aWNlIGFwcGVhciBpbiBhbGwgY29waWVzIGFuZCB0aGF0IGJvdGggdGhhdCBjb3B5cmlnaHRcbiAqIG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBhcHBlYXIgaW4gc3VwcG9ydGluZ1xuICogZG9jdW1lbnRhdGlvbiwgYW5kIHRoYXQgdGhlIG5hbWUgb2YgTS5JLlQuIG5vdCBiZSB1c2VkIGluXG4gKiBhZHZlcnRpc2luZyBvciBwdWJsaWNpdHkgcGVydGFpbmluZyB0byBkaXN0cmlidXRpb24gb2YgdGhlXG4gKiBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljLCB3cml0dGVuIHByaW9yIHBlcm1pc3Npb24uXG4gKiBNLkkuVC4gbWFrZXMgbm8gcmVwcmVzZW50YXRpb25zIGFib3V0IHRoZSBzdWl0YWJpbGl0eSBvZlxuICogdGhpcyBzb2Z0d2FyZSBmb3IgYW55IHB1cnBvc2UuICBJdCBpcyBwcm92aWRlZCBcImFzIGlzXCJcbiAqIHdpdGhvdXQgZXhwcmVzcyBvciBpbXBsaWVkIHdhcnJhbnR5LlxuICovXG5cbi8vIFJFRjogaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2Jsb2IvbWFzdGVyL2RlcHMvY2FyZXMvaW5jbHVkZS9hcmVzLmgjTDE5MFxuXG5leHBvcnQgY29uc3QgQVJFU19BSV9DQU5PTk5BTUUgPSAxIDw8IDA7XG5leHBvcnQgY29uc3QgQVJFU19BSV9OVU1FUklDSE9TVCA9IDEgPDwgMTtcbmV4cG9ydCBjb25zdCBBUkVTX0FJX1BBU1NJVkUgPSAxIDw8IDI7XG5leHBvcnQgY29uc3QgQVJFU19BSV9OVU1FUklDU0VSViA9IDEgPDwgMztcbmV4cG9ydCBjb25zdCBBSV9WNE1BUFBFRCA9IDEgPDwgNDtcbmV4cG9ydCBjb25zdCBBSV9BTEwgPSAxIDw8IDU7XG5leHBvcnQgY29uc3QgQUlfQUREUkNPTkZJRyA9IDEgPDwgNjtcbmV4cG9ydCBjb25zdCBBUkVTX0FJX05PU09SVCA9IDEgPDwgNztcbmV4cG9ydCBjb25zdCBBUkVTX0FJX0VOVkhPU1RTID0gMSA8PCA4O1xuXG4vLyBSRUY6IGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9ibG9iL21hc3Rlci9kZXBzL2NhcmVzL3NyYy9saWIvYXJlc19zdHJlcnJvci5jXG5cbmV4cG9ydCBmdW5jdGlvbiBhcmVzX3N0cmVycm9yKGNvZGU6IG51bWJlcikge1xuICAvKiBSZXR1cm4gYSBzdHJpbmcgbGl0ZXJhbCBmcm9tIGEgdGFibGUuICovXG4gIGNvbnN0IGVycm9yVGV4dCA9IFtcbiAgICBcIlN1Y2Nlc3NmdWwgY29tcGxldGlvblwiLFxuICAgIFwiRE5TIHNlcnZlciByZXR1cm5lZCBhbnN3ZXIgd2l0aCBubyBkYXRhXCIsXG4gICAgXCJETlMgc2VydmVyIGNsYWltcyBxdWVyeSB3YXMgbWlzZm9ybWF0dGVkXCIsXG4gICAgXCJETlMgc2VydmVyIHJldHVybmVkIGdlbmVyYWwgZmFpbHVyZVwiLFxuICAgIFwiRG9tYWluIG5hbWUgbm90IGZvdW5kXCIsXG4gICAgXCJETlMgc2VydmVyIGRvZXMgbm90IGltcGxlbWVudCByZXF1ZXN0ZWQgb3BlcmF0aW9uXCIsXG4gICAgXCJETlMgc2VydmVyIHJlZnVzZWQgcXVlcnlcIixcbiAgICBcIk1pc2Zvcm1hdHRlZCBETlMgcXVlcnlcIixcbiAgICBcIk1pc2Zvcm1hdHRlZCBkb21haW4gbmFtZVwiLFxuICAgIFwiVW5zdXBwb3J0ZWQgYWRkcmVzcyBmYW1pbHlcIixcbiAgICBcIk1pc2Zvcm1hdHRlZCBETlMgcmVwbHlcIixcbiAgICBcIkNvdWxkIG5vdCBjb250YWN0IEROUyBzZXJ2ZXJzXCIsXG4gICAgXCJUaW1lb3V0IHdoaWxlIGNvbnRhY3RpbmcgRE5TIHNlcnZlcnNcIixcbiAgICBcIkVuZCBvZiBmaWxlXCIsXG4gICAgXCJFcnJvciByZWFkaW5nIGZpbGVcIixcbiAgICBcIk91dCBvZiBtZW1vcnlcIixcbiAgICBcIkNoYW5uZWwgaXMgYmVpbmcgZGVzdHJveWVkXCIsXG4gICAgXCJNaXNmb3JtYXR0ZWQgc3RyaW5nXCIsXG4gICAgXCJJbGxlZ2FsIGZsYWdzIHNwZWNpZmllZFwiLFxuICAgIFwiR2l2ZW4gaG9zdG5hbWUgaXMgbm90IG51bWVyaWNcIixcbiAgICBcIklsbGVnYWwgaGludHMgZmxhZ3Mgc3BlY2lmaWVkXCIsXG4gICAgXCJjLWFyZXMgbGlicmFyeSBpbml0aWFsaXphdGlvbiBub3QgeWV0IHBlcmZvcm1lZFwiLFxuICAgIFwiRXJyb3IgbG9hZGluZyBpcGhscGFwaS5kbGxcIixcbiAgICBcIkNvdWxkIG5vdCBmaW5kIEdldE5ldHdvcmtQYXJhbXMgZnVuY3Rpb25cIixcbiAgICBcIkROUyBxdWVyeSBjYW5jZWxsZWRcIixcbiAgXTtcblxuICBpZiAoY29kZSA+PSAwICYmIGNvZGUgPCBlcnJvclRleHQubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGVycm9yVGV4dFtjb2RlXTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gXCJ1bmtub3duXCI7XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSwwRUFBMEU7QUFDMUU7Ozs7Ozs7Ozs7Ozs7R0FhRyxDQUVILGlGQUFpRjtBQUVqRixPQUFPLE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN4QyxPQUFPLE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUMxQyxPQUFPLE1BQU0sZUFBZSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDdEMsT0FBTyxNQUFNLG1CQUFtQixHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDMUMsT0FBTyxNQUFNLFdBQVcsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2xDLE9BQU8sTUFBTSxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUM3QixPQUFPLE1BQU0sYUFBYSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDcEMsT0FBTyxNQUFNLGNBQWMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3JDLE9BQU8sTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBRXZDLHFGQUFxRjtBQUVyRixPQUFPLFNBQVMsYUFBYSxDQUFDLElBQVksRUFBRTtJQUMxQywyQ0FBMkMsQ0FDM0MsTUFBTSxTQUFTLEdBQUc7UUFDaEIsdUJBQXVCO1FBQ3ZCLHlDQUF5QztRQUN6QywwQ0FBMEM7UUFDMUMscUNBQXFDO1FBQ3JDLHVCQUF1QjtRQUN2QixtREFBbUQ7UUFDbkQsMEJBQTBCO1FBQzFCLHdCQUF3QjtRQUN4QiwwQkFBMEI7UUFDMUIsNEJBQTRCO1FBQzVCLHdCQUF3QjtRQUN4QiwrQkFBK0I7UUFDL0Isc0NBQXNDO1FBQ3RDLGFBQWE7UUFDYixvQkFBb0I7UUFDcEIsZUFBZTtRQUNmLDRCQUE0QjtRQUM1QixxQkFBcUI7UUFDckIseUJBQXlCO1FBQ3pCLCtCQUErQjtRQUMvQiwrQkFBK0I7UUFDL0IsaURBQWlEO1FBQ2pELDRCQUE0QjtRQUM1QiwwQ0FBMEM7UUFDMUMscUJBQXFCO0tBQ3RCLEFBQUM7SUFFRixJQUFJLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxHQUFHLFNBQVMsQ0FBQyxNQUFNLEVBQUU7UUFDeEMsT0FBTyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDeEIsTUFBTTtRQUNMLE9BQU8sU0FBUyxDQUFDO0tBQ2xCO0NBQ0YifQ==