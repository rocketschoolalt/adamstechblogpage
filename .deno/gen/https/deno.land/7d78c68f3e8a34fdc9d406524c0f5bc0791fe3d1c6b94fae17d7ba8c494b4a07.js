import { emojify, htmlEscape, Marked, Prism, sanitizeHtml } from "./deps.ts";
import { CSS } from "./style.js";
export { CSS };
class Renderer extends Marked.Renderer {
    heading(text, level, raw, slugger) {
        const slug = slugger.slug(raw);
        return `<h${level} id="${slug}"><a class="anchor" aria-hidden="true" tabindex="-1" href="#${slug}"><svg class="octicon octicon-link" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z"></path></svg></a>${text}</h${level}>`;
    }
    code(code, language) {
        // a language of `ts, ignore` should really be `ts`
        language = language?.split(",")?.[0];
        const grammar = language && Object.hasOwnProperty.call(Prism.languages, language) ? Prism.languages[language] : undefined;
        if (grammar === undefined) {
            return `<pre><code>${htmlEscape(code)}</code></pre>`;
        }
        const html = Prism.highlight(code, grammar, language);
        return `<div class="highlight highlight-source-${language}"><pre>${html}</pre></div>`;
    }
    link(href, title, text) {
        if (href.startsWith("#")) {
            return `<a href="${href}" title="${title}">${text}</a>`;
        }
        return `<a href="${href}" title="${title}" rel="noopener noreferrer">${text}</a>`;
    }
}
export function render(markdown, opts = {}) {
    markdown = emojify(markdown);
    const html = Marked.marked(markdown, {
        baseUrl: opts.baseUrl,
        gfm: true,
        renderer: new Renderer()
    });
    const allowedTags = sanitizeHtml.defaults.allowedTags.concat([
        "img",
        "video",
        "svg",
        "path", 
    ]);
    if (opts.allowIframes) {
        allowedTags.push("iframe");
    }
    return sanitizeHtml(html, {
        allowedTags,
        allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            img: [
                "src",
                "alt",
                "height",
                "width",
                "align"
            ],
            video: [
                "src",
                "alt",
                "height",
                "width",
                "autoplay",
                "muted",
                "loop",
                "playsinline", 
            ],
            a: [
                "id",
                "aria-hidden",
                "href",
                "tabindex",
                "rel"
            ],
            svg: [
                "viewbox",
                "width",
                "height",
                "aria-hidden"
            ],
            path: [
                "fill-rule",
                "d"
            ],
            h1: [
                "id"
            ],
            h2: [
                "id"
            ],
            h3: [
                "id"
            ],
            h4: [
                "id"
            ],
            h5: [
                "id"
            ],
            h6: [
                "id"
            ],
            iframe: [
                "src",
                "width",
                "height"
            ]
        },
        allowedClasses: {
            div: [
                "highlight"
            ],
            span: [
                "token",
                "keyword",
                "operator",
                "number",
                "boolean",
                "function",
                "string",
                "comment",
                "class-name",
                "regex",
                "regex-delimiter",
                "tag",
                "attr-name",
                "punctuation",
                "script-punctuation",
                "script",
                "plain-text",
                "property", 
            ],
            a: [
                "anchor"
            ],
            svg: [
                "octicon",
                "octicon-link"
            ]
        },
        allowProtocolRelative: false
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvZ2ZtQDAuMS4yMC9tb2QudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZW1vamlmeSwgaHRtbEVzY2FwZSwgTWFya2VkLCBQcmlzbSwgc2FuaXRpemVIdG1sIH0gZnJvbSBcIi4vZGVwcy50c1wiO1xuaW1wb3J0IHsgQ1NTIH0gZnJvbSBcIi4vc3R5bGUuanNcIjtcbmV4cG9ydCB7IENTUyB9O1xuXG5jbGFzcyBSZW5kZXJlciBleHRlbmRzIE1hcmtlZC5SZW5kZXJlciB7XG4gIGhlYWRpbmcoXG4gICAgdGV4dDogc3RyaW5nLFxuICAgIGxldmVsOiAxIHwgMiB8IDMgfCA0IHwgNSB8IDYsXG4gICAgcmF3OiBzdHJpbmcsXG4gICAgc2x1Z2dlcjogTWFya2VkLlNsdWdnZXIsXG4gICk6IHN0cmluZyB7XG4gICAgY29uc3Qgc2x1ZyA9IHNsdWdnZXIuc2x1ZyhyYXcpO1xuICAgIHJldHVybiBgPGgke2xldmVsfSBpZD1cIiR7c2x1Z31cIj48YSBjbGFzcz1cImFuY2hvclwiIGFyaWEtaGlkZGVuPVwidHJ1ZVwiIHRhYmluZGV4PVwiLTFcIiBocmVmPVwiIyR7c2x1Z31cIj48c3ZnIGNsYXNzPVwib2N0aWNvbiBvY3RpY29uLWxpbmtcIiB2aWV3Qm94PVwiMCAwIDE2IDE2XCIgd2lkdGg9XCIxNlwiIGhlaWdodD1cIjE2XCIgYXJpYS1oaWRkZW49XCJ0cnVlXCI+PHBhdGggZmlsbC1ydWxlPVwiZXZlbm9kZFwiIGQ9XCJNNy43NzUgMy4yNzVhLjc1Ljc1IDAgMDAxLjA2IDEuMDZsMS4yNS0xLjI1YTIgMiAwIDExMi44MyAyLjgzbC0yLjUgMi41YTIgMiAwIDAxLTIuODMgMCAuNzUuNzUgMCAwMC0xLjA2IDEuMDYgMy41IDMuNSAwIDAwNC45NSAwbDIuNS0yLjVhMy41IDMuNSAwIDAwLTQuOTUtNC45NWwtMS4yNSAxLjI1em0tNC42OSA5LjY0YTIgMiAwIDAxMC0yLjgzbDIuNS0yLjVhMiAyIDAgMDEyLjgzIDAgLjc1Ljc1IDAgMDAxLjA2LTEuMDYgMy41IDMuNSAwIDAwLTQuOTUgMGwtMi41IDIuNWEzLjUgMy41IDAgMDA0Ljk1IDQuOTVsMS4yNS0xLjI1YS43NS43NSAwIDAwLTEuMDYtMS4wNmwtMS4yNSAxLjI1YTIgMiAwIDAxLTIuODMgMHpcIj48L3BhdGg+PC9zdmc+PC9hPiR7dGV4dH08L2gke2xldmVsfT5gO1xuICB9XG5cbiAgY29kZShjb2RlOiBzdHJpbmcsIGxhbmd1YWdlPzogc3RyaW5nKSB7XG4gICAgLy8gYSBsYW5ndWFnZSBvZiBgdHMsIGlnbm9yZWAgc2hvdWxkIHJlYWxseSBiZSBgdHNgXG4gICAgbGFuZ3VhZ2UgPSBsYW5ndWFnZT8uc3BsaXQoXCIsXCIpPy5bMF07XG4gICAgY29uc3QgZ3JhbW1hciA9XG4gICAgICBsYW5ndWFnZSAmJiBPYmplY3QuaGFzT3duUHJvcGVydHkuY2FsbChQcmlzbS5sYW5ndWFnZXMsIGxhbmd1YWdlKVxuICAgICAgICA/IFByaXNtLmxhbmd1YWdlc1tsYW5ndWFnZV1cbiAgICAgICAgOiB1bmRlZmluZWQ7XG4gICAgaWYgKGdyYW1tYXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIGA8cHJlPjxjb2RlPiR7aHRtbEVzY2FwZShjb2RlKX08L2NvZGU+PC9wcmU+YDtcbiAgICB9XG4gICAgY29uc3QgaHRtbCA9IFByaXNtLmhpZ2hsaWdodChjb2RlLCBncmFtbWFyLCBsYW5ndWFnZSEpO1xuICAgIHJldHVybiBgPGRpdiBjbGFzcz1cImhpZ2hsaWdodCBoaWdobGlnaHQtc291cmNlLSR7bGFuZ3VhZ2V9XCI+PHByZT4ke2h0bWx9PC9wcmU+PC9kaXY+YDtcbiAgfVxuXG4gIGxpbmsoaHJlZjogc3RyaW5nLCB0aXRsZTogc3RyaW5nLCB0ZXh0OiBzdHJpbmcpIHtcbiAgICBpZiAoaHJlZi5zdGFydHNXaXRoKFwiI1wiKSkge1xuICAgICAgcmV0dXJuIGA8YSBocmVmPVwiJHtocmVmfVwiIHRpdGxlPVwiJHt0aXRsZX1cIj4ke3RleHR9PC9hPmA7XG4gICAgfVxuICAgIHJldHVybiBgPGEgaHJlZj1cIiR7aHJlZn1cIiB0aXRsZT1cIiR7dGl0bGV9XCIgcmVsPVwibm9vcGVuZXIgbm9yZWZlcnJlclwiPiR7dGV4dH08L2E+YDtcbiAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlbmRlck9wdGlvbnMge1xuICBiYXNlVXJsPzogc3RyaW5nO1xuICBhbGxvd0lmcmFtZXM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyKG1hcmtkb3duOiBzdHJpbmcsIG9wdHM6IFJlbmRlck9wdGlvbnMgPSB7fSk6IHN0cmluZyB7XG4gIG1hcmtkb3duID0gZW1vamlmeShtYXJrZG93bik7XG5cbiAgY29uc3QgaHRtbCA9IE1hcmtlZC5tYXJrZWQobWFya2Rvd24sIHtcbiAgICBiYXNlVXJsOiBvcHRzLmJhc2VVcmwsXG4gICAgZ2ZtOiB0cnVlLFxuICAgIHJlbmRlcmVyOiBuZXcgUmVuZGVyZXIoKSxcbiAgfSk7XG5cbiAgY29uc3QgYWxsb3dlZFRhZ3MgPSBzYW5pdGl6ZUh0bWwuZGVmYXVsdHMuYWxsb3dlZFRhZ3MuY29uY2F0KFtcbiAgICBcImltZ1wiLFxuICAgIFwidmlkZW9cIixcbiAgICBcInN2Z1wiLFxuICAgIFwicGF0aFwiLFxuICBdKTtcbiAgaWYgKG9wdHMuYWxsb3dJZnJhbWVzKSB7XG4gICAgYWxsb3dlZFRhZ3MucHVzaChcImlmcmFtZVwiKTtcbiAgfVxuXG4gIHJldHVybiBzYW5pdGl6ZUh0bWwoaHRtbCwge1xuICAgIGFsbG93ZWRUYWdzLFxuICAgIGFsbG93ZWRBdHRyaWJ1dGVzOiB7XG4gICAgICAuLi5zYW5pdGl6ZUh0bWwuZGVmYXVsdHMuYWxsb3dlZEF0dHJpYnV0ZXMsXG4gICAgICBpbWc6IFtcInNyY1wiLCBcImFsdFwiLCBcImhlaWdodFwiLCBcIndpZHRoXCIsIFwiYWxpZ25cIl0sXG4gICAgICB2aWRlbzogW1xuICAgICAgICBcInNyY1wiLFxuICAgICAgICBcImFsdFwiLFxuICAgICAgICBcImhlaWdodFwiLFxuICAgICAgICBcIndpZHRoXCIsXG4gICAgICAgIFwiYXV0b3BsYXlcIixcbiAgICAgICAgXCJtdXRlZFwiLFxuICAgICAgICBcImxvb3BcIixcbiAgICAgICAgXCJwbGF5c2lubGluZVwiLFxuICAgICAgXSxcbiAgICAgIGE6IFtcImlkXCIsIFwiYXJpYS1oaWRkZW5cIiwgXCJocmVmXCIsIFwidGFiaW5kZXhcIiwgXCJyZWxcIl0sXG4gICAgICBzdmc6IFtcInZpZXdib3hcIiwgXCJ3aWR0aFwiLCBcImhlaWdodFwiLCBcImFyaWEtaGlkZGVuXCJdLFxuICAgICAgcGF0aDogW1wiZmlsbC1ydWxlXCIsIFwiZFwiXSxcbiAgICAgIGgxOiBbXCJpZFwiXSxcbiAgICAgIGgyOiBbXCJpZFwiXSxcbiAgICAgIGgzOiBbXCJpZFwiXSxcbiAgICAgIGg0OiBbXCJpZFwiXSxcbiAgICAgIGg1OiBbXCJpZFwiXSxcbiAgICAgIGg2OiBbXCJpZFwiXSxcbiAgICAgIGlmcmFtZTogW1wic3JjXCIsIFwid2lkdGhcIiwgXCJoZWlnaHRcIl0sIC8vIE9ubHkgdXNlZCB3aGVuIGlmcmFtZSB0YWdzIGFyZSBhbGxvd2VkIGluIHRoZSBmaXJzdCBwbGFjZS5cbiAgICB9LFxuICAgIGFsbG93ZWRDbGFzc2VzOiB7XG4gICAgICBkaXY6IFtcImhpZ2hsaWdodFwiXSxcbiAgICAgIHNwYW46IFtcbiAgICAgICAgXCJ0b2tlblwiLFxuICAgICAgICBcImtleXdvcmRcIixcbiAgICAgICAgXCJvcGVyYXRvclwiLFxuICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgXCJmdW5jdGlvblwiLFxuICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICBcImNvbW1lbnRcIixcbiAgICAgICAgXCJjbGFzcy1uYW1lXCIsXG4gICAgICAgIFwicmVnZXhcIixcbiAgICAgICAgXCJyZWdleC1kZWxpbWl0ZXJcIixcbiAgICAgICAgXCJ0YWdcIixcbiAgICAgICAgXCJhdHRyLW5hbWVcIixcbiAgICAgICAgXCJwdW5jdHVhdGlvblwiLFxuICAgICAgICBcInNjcmlwdC1wdW5jdHVhdGlvblwiLFxuICAgICAgICBcInNjcmlwdFwiLFxuICAgICAgICBcInBsYWluLXRleHRcIixcbiAgICAgICAgXCJwcm9wZXJ0eVwiLFxuICAgICAgXSxcbiAgICAgIGE6IFtcImFuY2hvclwiXSxcbiAgICAgIHN2ZzogW1wib2N0aWNvblwiLCBcIm9jdGljb24tbGlua1wiXSxcbiAgICB9LFxuICAgIGFsbG93UHJvdG9jb2xSZWxhdGl2ZTogZmFsc2UsXG4gIH0pO1xufVxuIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFNBQVMsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFlBQVksUUFBUSxXQUFXLENBQUM7QUFDN0UsU0FBUyxHQUFHLFFBQVEsWUFBWSxDQUFDO0FBQ2pDLFNBQVMsR0FBRyxHQUFHO0FBRWYsTUFBTSxRQUFRLFNBQVMsTUFBTSxDQUFDLFFBQVE7SUFDcEMsT0FBTyxDQUNMLElBQVksRUFDWixLQUE0QixFQUM1QixHQUFXLEVBQ1gsT0FBdUIsRUFDZjtRQUNSLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEFBQUM7UUFDL0IsT0FBTyxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyw0REFBNEQsRUFBRSxJQUFJLENBQUMsaWZBQWlmLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDeG1CO0lBRUQsSUFBSSxDQUFDLElBQVksRUFBRSxRQUFpQixFQUFFO1FBQ3BDLG1EQUFtRDtRQUNuRCxRQUFRLEdBQUcsUUFBUSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sT0FBTyxHQUNYLFFBQVEsSUFBSSxNQUFNLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLFFB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