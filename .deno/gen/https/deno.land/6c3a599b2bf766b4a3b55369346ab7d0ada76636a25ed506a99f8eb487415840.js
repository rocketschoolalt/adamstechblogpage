// Copyright 2018-2022 the Deno authors. All rights reserved. MIT license.
import { notImplemented } from "../_utils.ts";
export default class Dirent {
    constructor(entry){
        this.entry = entry;
    }
    isBlockDevice() {
        notImplemented("Deno does not yet support identification of block devices");
        return false;
    }
    isCharacterDevice() {
        notImplemented("Deno does not yet support identification of character devices");
        return false;
    }
    isDirectory() {
        return this.entry.isDirectory;
    }
    isFIFO() {
        notImplemented("Deno does not yet support identification of FIFO named pipes");
        return false;
    }
    isFile() {
        return this.entry.isFile;
    }
    isSocket() {
        notImplemented("Deno does not yet support identification of sockets");
        return false;
    }
    isSymbolicLink() {
        return this.entry.isSymlink;
    }
    get name() {
        return this.entry.name;
    }
    entry;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3N0ZEAwLjE0Ny4wL25vZGUvX2ZzL19mc19kaXJlbnQudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQ29weXJpZ2h0IDIwMTgtMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cbmltcG9ydCB7IG5vdEltcGxlbWVudGVkIH0gZnJvbSBcIi4uL191dGlscy50c1wiO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEaXJlbnQge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIGVudHJ5OiBEZW5vLkRpckVudHJ5KSB7fVxuXG4gIGlzQmxvY2tEZXZpY2UoKTogYm9vbGVhbiB7XG4gICAgbm90SW1wbGVtZW50ZWQoXCJEZW5vIGRvZXMgbm90IHlldCBzdXBwb3J0IGlkZW50aWZpY2F0aW9uIG9mIGJsb2NrIGRldmljZXNcIik7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaXNDaGFyYWN0ZXJEZXZpY2UoKTogYm9vbGVhbiB7XG4gICAgbm90SW1wbGVtZW50ZWQoXG4gICAgICBcIkRlbm8gZG9lcyBub3QgeWV0IHN1cHBvcnQgaWRlbnRpZmljYXRpb24gb2YgY2hhcmFjdGVyIGRldmljZXNcIixcbiAgICApO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlzRGlyZWN0b3J5KCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLmVudHJ5LmlzRGlyZWN0b3J5O1xuICB9XG5cbiAgaXNGSUZPKCk6IGJvb2xlYW4ge1xuICAgIG5vdEltcGxlbWVudGVkKFxuICAgICAgXCJEZW5vIGRvZXMgbm90IHlldCBzdXBwb3J0IGlkZW50aWZpY2F0aW9uIG9mIEZJRk8gbmFtZWQgcGlwZXNcIixcbiAgICApO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlzRmlsZSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5lbnRyeS5pc0ZpbGU7XG4gIH1cblxuICBpc1NvY2tldCgpOiBib29sZWFuIHtcbiAgICBub3RJbXBsZW1lbnRlZChcIkRlbm8gZG9lcyBub3QgeWV0IHN1cHBvcnQgaWRlbnRpZmljYXRpb24gb2Ygc29ja2V0c1wiKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpc1N5bWJvbGljTGluaygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5lbnRyeS5pc1N5bWxpbms7XG4gIH1cblxuICBnZXQgbmFtZSgpOiBzdHJpbmcgfCBudWxsIHtcbiAgICByZXR1cm4gdGhpcy5lbnRyeS5uYW1lO1xuICB9XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsMEVBQTBFO0FBQzFFLFNBQVMsY0FBYyxRQUFRLGNBQWMsQ0FBQztBQUU5QyxlQUFlLE1BQU0sTUFBTTtJQUN6QixZQUFvQixLQUFvQixDQUFFO2FBQXRCLEtBQW9CLEdBQXBCLEtBQW9CO0tBQUk7SUFFNUMsYUFBYSxHQUFZO1FBQ3ZCLGNBQWMsQ0FBQywyREFBMkQsQ0FBQyxDQUFDO1FBQzVFLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxpQkFBaUIsR0FBWTtRQUMzQixjQUFjLENBQ1osK0RBQStELENBQ2hFLENBQUM7UUFDRixPQUFPLEtBQUssQ0FBQztLQUNkO0lBRUQsV0FBVyxHQUFZO1FBQ3JCLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUM7S0FDL0I7SUFFRCxNQUFNLEdBQVk7UUFDaEIsY0FBYyxDQUNaLDhEQUE4RCxDQUMvRCxDQUFDO1FBQ0YsT0FBTyxLQUFLLENBQUM7S0FDZDtJQUVELE1BQU0sR0FBWTtRQUNoQixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDO0tBQzFCO0lBRUQsUUFBUSxHQUFZO1FBQ2xCLGNBQWMsQ0FBQyxxREFBcUQsQ0FBQyxDQUFDO1FBQ3RFLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxjQUFjLEdBQVk7UUFDeEIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQztLQUM3QjtJQUVELElBQUksSUFBSSxHQUFrQjtRQUN4QixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO0tBQ3hCO0lBeENtQixLQUFvQjtDQXlDekMsQ0FBQSJ9