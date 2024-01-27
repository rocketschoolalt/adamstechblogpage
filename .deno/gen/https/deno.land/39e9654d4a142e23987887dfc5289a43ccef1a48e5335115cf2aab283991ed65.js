// Copyright 2018-2021 the oak authors. All rights reserved. MIT license.
// This was inspired by [keygrip](https://github.com/crypto-utils/keygrip/)
// which allows signing of data (cookies) to prevent tampering, but also allows
// for easy key rotation without needing to resign the data.
import { compare } from "./tssCompare.ts";
import { encodeBase64Safe, importKey, sign } from "./util.ts";
export class KeyStack {
    #cryptoKeys = new Map();
    #keys;
    async #toCryptoKey(key) {
        if (!this.#cryptoKeys.has(key)) {
            this.#cryptoKeys.set(key, await importKey(key));
        }
        return this.#cryptoKeys.get(key);
    }
    get length() {
        return this.#keys.length;
    }
    /** A class which accepts an array of keys that are used to sign and verify
   * data and allows easy key rotation without invalidation of previously signed
   * data.
   *
   * @param keys An array of keys, of which the index 0 will be used to sign
   *             data, but verification can happen against any key.
   */ constructor(keys){
        if (!(0 in keys)) {
            throw new TypeError("keys must contain at least one value");
        }
        this.#keys = keys;
    }
    /** Take `data` and return a SHA256 HMAC digest that uses the current 0 index
   * of the `keys` passed to the constructor.  This digest is in the form of a
   * URL safe base64 encoded string. */ async sign(data) {
        const key = await this.#toCryptoKey(this.#keys[0]);
        return encodeBase64Safe(await sign(data, key));
    }
    /** Given `data` and a `digest`, verify that one of the `keys` provided the
   * constructor was used to generate the `digest`.  Returns `true` if one of
   * the keys was used, otherwise `false`. */ async verify(data, digest) {
        return await this.indexOf(data, digest) > -1;
    }
    /** Given `data` and a `digest`, return the current index of the key in the
   * `keys` passed the constructor that was used to generate the digest.  If no
   * key can be found, the method returns `-1`. */ async indexOf(data, digest) {
        for(let i = 0; i < this.#keys.length; i++){
            const cryptoKey = await this.#toCryptoKey(this.#keys[i]);
            if (await compare(digest, encodeBase64Safe(await sign(data, cryptoKey)))) {
                return i;
            }
        }
        return -1;
    }
    [Symbol.for("Deno.customInspect")](inspect) {
        return `${this.constructor.name} ${inspect({
            length: this.length
        })}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvb2FrQHYxMC4xLjAva2V5U3RhY2sudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMSB0aGUgb2FrIGF1dGhvcnMuIEFsbCByaWdodHMgcmVzZXJ2ZWQuIE1JVCBsaWNlbnNlLlxuXG4vLyBUaGlzIHdhcyBpbnNwaXJlZCBieSBba2V5Z3JpcF0oaHR0cHM6Ly9naXRodWIuY29tL2NyeXB0by11dGlscy9rZXlncmlwLylcbi8vIHdoaWNoIGFsbG93cyBzaWduaW5nIG9mIGRhdGEgKGNvb2tpZXMpIHRvIHByZXZlbnQgdGFtcGVyaW5nLCBidXQgYWxzbyBhbGxvd3Ncbi8vIGZvciBlYXN5IGtleSByb3RhdGlvbiB3aXRob3V0IG5lZWRpbmcgdG8gcmVzaWduIHRoZSBkYXRhLlxuXG5pbXBvcnQgeyBjb21wYXJlIH0gZnJvbSBcIi4vdHNzQ29tcGFyZS50c1wiO1xuaW1wb3J0IHsgZW5jb2RlQmFzZTY0U2FmZSwgaW1wb3J0S2V5LCBzaWduIH0gZnJvbSBcIi4vdXRpbC50c1wiO1xuaW1wb3J0IHR5cGUgeyBEYXRhLCBLZXkgfSBmcm9tIFwiLi90eXBlcy5kLnRzXCI7XG5cbmV4cG9ydCBjbGFzcyBLZXlTdGFjayB7XG4gICNjcnlwdG9LZXlzID0gbmV3IE1hcDxLZXksIENyeXB0b0tleT4oKTtcbiAgI2tleXM6IEtleVtdO1xuXG4gIGFzeW5jICN0b0NyeXB0b0tleShrZXk6IEtleSk6IFByb21pc2U8Q3J5cHRvS2V5PiB7XG4gICAgaWYgKCF0aGlzLiNjcnlwdG9LZXlzLmhhcyhrZXkpKSB7XG4gICAgICB0aGlzLiNjcnlwdG9LZXlzLnNldChrZXksIGF3YWl0IGltcG9ydEtleShrZXkpKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuI2NyeXB0b0tleXMuZ2V0KGtleSkhO1xuICB9XG5cbiAgZ2V0IGxlbmd0aCgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiNrZXlzLmxlbmd0aDtcbiAgfVxuXG4gIC8qKiBBIGNsYXNzIHdoaWNoIGFjY2VwdHMgYW4gYXJyYXkgb2Yga2V5cyB0aGF0IGFyZSB1c2VkIHRvIHNpZ24gYW5kIHZlcmlmeVxuICAgKiBkYXRhIGFuZCBhbGxvd3MgZWFzeSBrZXkgcm90YXRpb24gd2l0aG91dCBpbnZhbGlkYXRpb24gb2YgcHJldmlvdXNseSBzaWduZWRcbiAgICogZGF0YS5cbiAgICpcbiAgICogQHBhcmFtIGtleXMgQW4gYXJyYXkgb2Yga2V5cywgb2Ygd2hpY2ggdGhlIGluZGV4IDAgd2lsbCBiZSB1c2VkIHRvIHNpZ25cbiAgICogICAgICAgICAgICAgZGF0YSwgYnV0IHZlcmlmaWNhdGlvbiBjYW4gaGFwcGVuIGFnYWluc3QgYW55IGtleS5cbiAgICovXG4gIGNvbnN0cnVjdG9yKGtleXM6IEtleVtdKSB7XG4gICAgaWYgKCEoMCBpbiBrZXlzKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcImtleXMgbXVzdCBjb250YWluIGF0IGxlYXN0IG9uZSB2YWx1ZVwiKTtcbiAgICB9XG4gICAgdGhpcy4ja2V5cyA9IGtleXM7XG4gIH1cblxuICAvKiogVGFrZSBgZGF0YWAgYW5kIHJldHVybiBhIFNIQTI1NiBITUFDIGRpZ2VzdCB0aGF0IHVzZXMgdGhlIGN1cnJlbnQgMCBpbmRleFxuICAgKiBvZiB0aGUgYGtleXNgIHBhc3NlZCB0byB0aGUgY29uc3RydWN0b3IuICBUaGlzIGRpZ2VzdCBpcyBpbiB0aGUgZm9ybSBvZiBhXG4gICAqIFVSTCBzYWZlIGJhc2U2NCBlbmNvZGVkIHN0cmluZy4gKi9cbiAgYXN5bmMgc2lnbihkYXRhOiBEYXRhKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBrZXkgPSBhd2FpdCB0aGlzLiN0b0NyeXB0b0tleSh0aGlzLiNrZXlzWzBdKTtcbiAgICByZXR1cm4gZW5jb2RlQmFzZTY0U2FmZShhd2FpdCBzaWduKGRhdGEsIGtleSkpO1xuICB9XG5cbiAgLyoqIEdpdmVuIGBkYXRhYCBhbmQgYSBgZGlnZXN0YCwgdmVyaWZ5IHRoYXQgb25lIG9mIHRoZSBga2V5c2AgcHJvdmlkZWQgdGhlXG4gICAqIGNvbnN0cnVjdG9yIHdhcyB1c2VkIHRvIGdlbmVyYXRlIHRoZSBgZGlnZXN0YC4gIFJldHVybnMgYHRydWVgIGlmIG9uZSBvZlxuICAgKiB0aGUga2V5cyB3YXMgdXNlZCwgb3RoZXJ3aXNlIGBmYWxzZWAuICovXG4gIGFzeW5jIHZlcmlmeShkYXRhOiBEYXRhLCBkaWdlc3Q6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiAoYXdhaXQgdGhpcy5pbmRleE9mKGRhdGEsIGRpZ2VzdCkpID4gLTE7XG4gIH1cblxuICAvKiogR2l2ZW4gYGRhdGFgIGFuZCBhIGBkaWdlc3RgLCByZXR1cm4gdGhlIGN1cnJlbnQgaW5kZXggb2YgdGhlIGtleSBpbiB0aGVcbiAgICogYGtleXNgIHBhc3NlZCB0aGUgY29uc3RydWN0b3IgdGhhdCB3YXMgdXNlZCB0byBnZW5lcmF0ZSB0aGUgZGlnZXN0LiAgSWYgbm9cbiAgICoga2V5IGNhbiBiZSBmb3VuZCwgdGhlIG1ldGhvZCByZXR1cm5zIGAtMWAuICovXG4gIGFzeW5jIGluZGV4T2YoZGF0YTogRGF0YSwgZGlnZXN0OiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy4ja2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgY3J5cHRvS2V5ID0gYXdhaXQgdGhpcy4jdG9DcnlwdG9LZXkodGhpcy4ja2V5c1tpXSk7XG4gICAgICBpZiAoXG4gICAgICAgIGF3YWl0IGNvbXBhcmUoZGlnZXN0LCBlbmNvZGVCYXNlNjRTYWZlKGF3YWl0IHNpZ24oZGF0YSwgY3J5cHRvS2V5KSkpXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIGk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiAtMTtcbiAgfVxuXG4gIFtTeW1ib2wuZm9yKFwiRGVuby5jdXN0b21JbnNwZWN0XCIpXShpbnNwZWN0OiAodmFsdWU6IHVua25vd24pID0+IHN0cmluZykge1xuICAgIHJldHVybiBgJHt0aGlzLmNvbnN0cnVjdG9yLm5hbWV9ICR7XG4gICAgICBpbnNwZWN0KHtcbiAgICAgICAgbGVuZ3RoOiB0aGlzLmxlbmd0aCxcbiAgICAgIH0pXG4gICAgfWA7XG4gIH1cbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxFQUF5RSxBQUF6RSx1RUFBeUU7QUFFekUsRUFBMkUsQUFBM0UseUVBQTJFO0FBQzNFLEVBQStFLEFBQS9FLDZFQUErRTtBQUMvRSxFQUE0RCxBQUE1RCwwREFBNEQ7QUFFNUQsTUFBTSxHQUFHLE9BQU8sUUFBUSxDQUFpQjtBQUN6QyxNQUFNLEdBQUcsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLElBQUksUUFBUSxDQUFXO0FBRzdELE1BQU0sT0FBTyxRQUFRO0lBQ25CLENBQUMsVUFBVSxHQUFHLEdBQUcsQ0FBQyxHQUFHO0lBQ3JCLENBQUMsSUFBSTtVQUVDLENBQUMsV0FBVyxDQUFDLEdBQVEsRUFBc0IsQ0FBQztRQUNoRCxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQztZQUMvQixJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQUc7UUFDL0MsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUc7SUFDakMsQ0FBQztRQUVHLE1BQU0sR0FBVyxDQUFDO1FBQ3BCLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTTtJQUMxQixDQUFDO0lBRUQsRUFNRyxBQU5IOzs7Ozs7R0FNRyxBQU5ILEVBTUcsYUFDUyxJQUFXLENBQUUsQ0FBQztRQUN4QixFQUFFLElBQUksQ0FBQyxJQUFJLElBQUksR0FBRyxDQUFDO1lBQ2pCLEtBQUssQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQXNDO1FBQzVELENBQUM7UUFDRCxJQUFJLENBQUMsQ0FBQyxJQUFJLEdBQUcsSUFBSTtJQUNuQixDQUFDO0lBRUQsRUFFcUMsQUFGckM7O3FDQUVxQyxBQUZyQyxFQUVxQyxPQUMvQixJQUFJLENBQUMsSUFBVSxFQUFtQixDQUFDO1FBQ3ZDLEtBQUssQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRCxNQUFNLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRztJQUM5QyxDQUFDO0lBRUQsRUFFMkMsQUFGM0M7OzJDQUUyQyxBQUYzQyxFQUUyQyxPQUNyQyxNQUFNLENBQUMsSUFBVSxFQUFFLE1BQWMsRUFBb0IsQ0FBQztRQUMxRCxNQUFNLENBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLE1BQU0sS0FBTSxDQUFDO0lBQ2hELENBQUM7SUFFRCxFQUVnRCxBQUZoRDs7Z0RBRWdELEFBRmhELEVBRWdELE9BQzFDLE9BQU8sQ0FBQyxJQUFVLEVBQUUsTUFBYyxFQUFtQixDQUFDO1FBQzFELEdBQUcsQ0FBRSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUksQ0FBQztZQUMzQyxLQUFLLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdEQsRUFBRSxFQUNBLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLFNBQVMsS0FDakUsQ0FBQztnQkFDRCxNQUFNLENBQUMsQ0FBQztZQUNWLENBQUM7UUFDSCxDQUFDO1FBQ0QsTUFBTSxFQUFFLENBQUM7SUFDWCxDQUFDO0tBRUEsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFvQixzQkFBRyxPQUFtQyxFQUFFLENBQUM7UUFDdkUsTUFBTSxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsRUFDL0IsT0FBTyxDQUFDLENBQUM7WUFDUCxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07UUFDckIsQ0FBQztJQUVMLENBQUMifQ==