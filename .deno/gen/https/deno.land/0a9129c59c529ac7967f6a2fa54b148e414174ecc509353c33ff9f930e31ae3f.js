import { yamlParse } from "./deps.ts";
const reFrontmatter = /^---([\s\S]*?)^---$([\s\S]*)/m;
/**
 * Parses the front matter of the input string and returns the
 * parse result object.
 *
 * When front matter pattern is not found, then it returns the
 * result with empty data and input text as content.
 *
 * The front matter string is parsed as yaml.
 *
 * If the front matter yaml has an syntax error of yaml,
 * then this function throws the error.
 */ export function parse(text) {
    if (!reFrontmatter.test(text)) {
        return {
            data: undefined,
            content: text
        };
    }
    const [_, yaml, content] = text.match(reFrontmatter);
    return {
        data: yamlParse(yaml.trim()),
        content: content.trim()
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvZnJvbnRtYXR0ZXJAdjAuMS40L21vZC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB5YW1sUGFyc2UgfSBmcm9tIFwiLi9kZXBzLnRzXCI7XG5cbmV4cG9ydCB0eXBlIFBhcnNlUmVzdWx0ID0ge1xuICBkYXRhOiB1bmtub3duO1xuICBjb250ZW50OiBzdHJpbmc7XG59O1xuXG5jb25zdCByZUZyb250bWF0dGVyID0gL14tLS0oW1xcc1xcU10qPyleLS0tJChbXFxzXFxTXSopL207XG5cbi8qKlxuICogUGFyc2VzIHRoZSBmcm9udCBtYXR0ZXIgb2YgdGhlIGlucHV0IHN0cmluZyBhbmQgcmV0dXJucyB0aGVcbiAqIHBhcnNlIHJlc3VsdCBvYmplY3QuXG4gKlxuICogV2hlbiBmcm9udCBtYXR0ZXIgcGF0dGVybiBpcyBub3QgZm91bmQsIHRoZW4gaXQgcmV0dXJucyB0aGVcbiAqIHJlc3VsdCB3aXRoIGVtcHR5IGRhdGEgYW5kIGlucHV0IHRleHQgYXMgY29udGVudC5cbiAqXG4gKiBUaGUgZnJvbnQgbWF0dGVyIHN0cmluZyBpcyBwYXJzZWQgYXMgeWFtbC5cbiAqXG4gKiBJZiB0aGUgZnJvbnQgbWF0dGVyIHlhbWwgaGFzIGFuIHN5bnRheCBlcnJvciBvZiB5YW1sLFxuICogdGhlbiB0aGlzIGZ1bmN0aW9uIHRocm93cyB0aGUgZXJyb3IuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZSh0ZXh0OiBzdHJpbmcpOiBQYXJzZVJlc3VsdCB7XG4gIGlmICghcmVGcm9udG1hdHRlci50ZXN0KHRleHQpKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGRhdGE6IHVuZGVmaW5lZCxcbiAgICAgIGNvbnRlbnQ6IHRleHQsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IFtfLCB5YW1sLCBjb250ZW50XSA9IHRleHQubWF0Y2gocmVGcm9udG1hdHRlcikhO1xuXG4gIHJldHVybiB7XG4gICAgZGF0YTogeWFtbFBhcnNlKHlhbWwudHJpbSgpKSxcbiAgICBjb250ZW50OiBjb250ZW50LnRyaW0oKSxcbiAgfTtcbn1cbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxTQUFTLFNBQVMsUUFBUSxXQUFXLENBQUM7QUFPdEMsTUFBTSxhQUFhLGtDQUFrQyxBQUFDO0FBRXREOzs7Ozs7Ozs7OztHQVdHLENBQ0gsT0FBTyxTQUFTLEtBQUssQ0FBQyxJQUFZLEVBQWU7SUFDL0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDN0IsT0FBTztZQUNMLElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLElBQUk7U0FDZCxDQUFDO0tBQ0g7SUFFRCxNQUFNLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxBQUFDLEFBQUM7SUFFdEQsT0FBTztRQUNMLElBQUksRUFBRSxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzVCLE9BQU8sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFO0tBQ3hCLENBQUM7Q0FDSCJ9