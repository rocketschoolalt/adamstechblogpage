// Copyright 2022 the Deno authors. All rights reserved. MIT license.
/** @jsx h */ /// <reference no-default-lib="true"/>
/// <reference lib="dom" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
import { callsites, createReporter, dirname, Feed, Fragment, fromFileUrl, frontMatter, gfm, h, html, join, relative, removeMarkdown, serve, serveDir, walk } from "./deps.ts";
import { Index, PostPage } from "./components.tsx";
export { Fragment, h };
const IS_DEV = Deno.args.includes("--dev") && "watchFs" in Deno;
const POSTS = new Map();
const HMR_SOCKETS = new Set();
const HMR_CLIENT = `let socket;
let reconnectTimer;

const wsOrigin = window.location.origin
  .replace("http", "ws")
  .replace("https", "wss");
const hmrUrl = wsOrigin + "/hmr";

hmrSocket();

function hmrSocket(callback) {
  if (socket) {
    socket.close();
  }

  socket = new WebSocket(hmrUrl);
  socket.addEventListener("open", callback);
  socket.addEventListener("message", (event) => {
    if (event.data === "refresh") {
      console.log("refreshings");
      window.location.reload();
    }
  });

  socket.addEventListener("close", () => {
    console.log("reconnecting...");
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      hmrSocket(() => {
        window.location.reload();
      });
    }, 1000);
  });
}
`;
/** The main function of the library.
 *
 * ```jsx
 * import blog, { ga } from "https://deno.land/x/blog/blog.tsx";
 *
 * blog({
 *   title: "My Blog",
 *   description: "The blog description.",
 *   avatar: "./avatar.png",
 *   middlewares: [
 *     ga("GA-ANALYTICS-KEY"),
 *   ],
 * });
 * ```
 */ export default async function blog(settings) {
    const url = callsites()[1].getFileName();
    const blogState = await configureBlog(url, IS_DEV, settings);
    const blogHandler = createBlogHandler(blogState);
    serve(blogHandler);
};
export function createBlogHandler(state) {
    const inner = handler;
    const withMiddlewares = composeMiddlewares(state);
    return function handler(req, connInfo) {
        // Redirect requests that end with a trailing slash
        // to their non-trailing slash counterpart.
        // Ex: /about/ -> /about
        const url = new URL(req.url);
        if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
            url.pathname = url.pathname.slice(0, -1);
            return Response.redirect(url.href, 307);
        }
        return withMiddlewares(req, connInfo, inner);
    };
}
function composeMiddlewares(state) {
    return (req, connInfo, inner)=>{
        const mws = state.middlewares?.reverse();
        const handlers = [];
        const ctx = {
            next () {
                const handler = handlers.shift();
                return Promise.resolve(handler());
            },
            connInfo,
            state
        };
        if (mws) {
            for (const mw of mws){
                handlers.push(()=>mw(req, ctx));
            }
        }
        handlers.push(()=>inner(req, ctx));
        const handler = handlers.shift();
        return handler();
    };
}
export async function configureBlog(url, isDev, settings) {
    let directory;
    try {
        const blogPath = fromFileUrl(url);
        directory = dirname(blogPath);
    } catch (e) {
        console.log(e);
        throw new Error("Cannot run blog from a remote URL.");
    }
    const state = {
        directory,
        ...settings
    };
    await loadContent(directory, isDev);
    return state;
}
async function loadContent(blogDirectory, isDev) {
    // Read posts from the current directory and store them in memory.
    const postsDirectory = join(blogDirectory, "posts");
    // TODO(@satyarohith): not efficient for large number of posts.
    for await (const entry of walk(postsDirectory)){
        if (entry.isFile && entry.path.endsWith(".md")) {
            await loadPost(postsDirectory, entry.path);
        }
    }
    if (isDev) {
        watchForChanges(postsDirectory).catch(()=>{});
    }
}
// Watcher watches for .md file changes and updates the posts.
async function watchForChanges(postsDirectory) {
    const watcher = Deno.watchFs(postsDirectory);
    for await (const event of watcher){
        if (event.kind === "modify" || event.kind === "create") {
            for (const path of event.paths){
                if (path.endsWith(".md")) {
                    await loadPost(postsDirectory, path);
                    HMR_SOCKETS.forEach((socket)=>{
                        socket.send("refresh");
                    });
                }
            }
        }
    }
}
async function loadPost(postsDirectory, path) {
    const contents = await Deno.readTextFile(path);
    let pathname = "/" + relative(postsDirectory, path);
    // Remove .md extension.
    pathname = pathname.slice(0, -3);
    const { content , data  } = frontMatter(contents);
    let snippet = ((data.snippet ?? data.abstract) ?? data.summary) ?? data.description;
    if (!snippet) {
        const maybeSnippet = content.split("\n\n")[0];
        if (maybeSnippet) {
            snippet = removeMarkdown(maybeSnippet.replace("\n", " "));
        } else {
            snippet = "";
        }
    }
    const post = {
        title: data.title ?? "Untitled",
        author: data.author,
        // Note: users can override path of a blog post using
        // pathname in front matter.
        pathname: data.pathname ?? pathname,
        publishDate: new Date(data.publish_date),
        snippet,
        markdown: content,
        coverHtml: data.cover_html,
        background: data.background,
        ogImage: data["og:image"]
    };
    POSTS.set(pathname, post);
    console.log("Load: ", post.pathname);
}
export async function handler(req, ctx) {
    const { state: blogState  } = ctx;
    const { pathname  } = new URL(req.url);
    if (pathname === "/feed") {
        return serveRSS(req, blogState, POSTS);
    }
    if (IS_DEV) {
        if (pathname == "/hmr.js") {
            return new Response(HMR_CLIENT, {
                headers: {
                    "content-type": "application/javascript"
                }
            });
        }
        if (pathname == "/hmr") {
            const { response , socket  } = Deno.upgradeWebSocket(req);
            HMR_SOCKETS.add(socket);
            socket.onclose = ()=>{
                HMR_SOCKETS.delete(socket);
            };
            return response;
        }
    }
    if (pathname === "/") {
        return html({
            title: blogState.title ?? "My Blog",
            meta: {
                "description": blogState.description,
                "og:title": blogState.title,
                "og:description": blogState.description,
                "og:image": blogState.ogImage ?? blogState.cover,
                "twitter:title": blogState.title,
                "twitter:description": blogState.description,
                "twitter:image": blogState.ogImage ?? blogState.cover,
                "twitter:card": blogState.ogImage ? "summary_large_image" : undefined
            },
            styles: [
                ...blogState.style ? [
                    blogState.style
                ] : [],
                ...blogState.background ? [
                    `body{background:${blogState.background};}`
                ] : [], 
            ],
            scripts: IS_DEV ? [
                {
                    src: "/hmr.js"
                }
            ] : undefined,
            body: /*#__PURE__*/ h(Index, {
                state: blogState,
                posts: POSTS
            })
        });
    }
    const post = POSTS.get(pathname);
    if (post) {
        return html({
            title: post.title,
            meta: {
                "description": post.snippet,
                "og:title": post.title,
                "og:description": post.snippet,
                "og:image": post.ogImage,
                "twitter:title": post.title,
                "twitter:description": post.snippet,
                "twitter:image": post.ogImage,
                "twitter:card": post.ogImage ? "summary_large_image" : undefined
            },
            styles: [
                gfm.CSS,
                `.markdown-body { --color-canvas-default: transparent; --color-canvas-subtle: #edf0f2; --color-border-muted: rgba(128,128,128,0.2); } .markdown-body img + p { margin-top: 16px; }`,
                ...blogState.style ? [
                    blogState.style
                ] : [],
                ...post.background ? [
                    `body{background:${post.background};}`
                ] : blogState.background ? [
                    `body{background:${blogState.background};}`
                ] : [], 
            ],
            scripts: IS_DEV ? [
                {
                    src: "/hmr.js"
                }
            ] : undefined,
            body: /*#__PURE__*/ h(PostPage, {
                post: post,
                state: blogState
            })
        });
    }
    let fsRoot = blogState.directory;
    try {
        await Deno.lstat(join(blogState.directory, "./posts", pathname));
        fsRoot = join(blogState.directory, "./posts");
    } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) {
            console.error(e);
            return new Response(e.message, {
                status: 500
            });
        }
    }
    return serveDir(req, {
        fsRoot
    });
}
/** Serves the rss/atom feed of the blog. */ function serveRSS(req, state, posts) {
    const url = new URL(req.url);
    const origin = url.origin;
    const copyright = `Copyright ${new Date().getFullYear()} ${origin}`;
    const feed = new Feed({
        title: state.title ?? "Blog",
        description: state.description,
        id: `${origin}/blog`,
        link: `${origin}/blog`,
        language: "en",
        favicon: `${origin}/favicon.ico`,
        copyright: copyright,
        generator: "Feed (https://github.com/jpmonette/feed) for Deno",
        feedLinks: {
            atom: `${origin}/feed`
        }
    });
    for (const [_key, post] of posts.entries()){
        const item = {
            id: `${origin}/${post.title}`,
            title: post.title,
            description: post.snippet,
            date: post.publishDate,
            link: `${origin}${post.pathname}`,
            author: post.author?.split(",").map((author)=>({
                    name: author.trim()
                })),
            image: post.ogImage,
            copyright,
            published: post.publishDate
        };
        feed.addItem(item);
    }
    const atomFeed = feed.atom1();
    return new Response(atomFeed, {
        headers: {
            "content-type": "application/atom+xml; charset=utf-8"
        }
    });
}
export function ga(gaKey) {
    if (gaKey.length === 0) {
        throw new Error("GA key cannot be empty.");
    }
    const gaReporter = createReporter({
        id: gaKey
    });
    return async function(request, ctx) {
        let err;
        let res;
        const start = performance.now();
        try {
            res = await ctx.next();
        } catch (e) {
            err = e;
            res = new Response("Internal server error", {
                status: 500
            });
        } finally{
            if (gaReporter) {
                gaReporter(request, ctx.connInfo, res, start, err);
            }
        }
        return res;
    };
}
export function redirects(redirectMap) {
    return async function(req, ctx) {
        const { pathname  } = new URL(req.url);
        let maybeRedirect = redirectMap[pathname];
        if (!maybeRedirect) {
            // trim leading slash
            maybeRedirect = redirectMap[pathname.slice(1)];
        }
        if (maybeRedirect) {
            if (!maybeRedirect.startsWith("/")) {
                maybeRedirect = "/" + maybeRedirect;
            }
            return new Response(null, {
                status: 307,
                headers: {
                    "location": maybeRedirect
                }
            });
        }
        return await ctx.next();
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImh0dHBzOi8vZGVuby5sYW5kL3gvYmxvZ0AwLjMuMy9ibG9nLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgMjAyMiB0aGUgRGVubyBhdXRob3JzLiBBbGwgcmlnaHRzIHJlc2VydmVkLiBNSVQgbGljZW5zZS5cblxuLyoqIEBqc3ggaCAqL1xuLy8vIDxyZWZlcmVuY2Ugbm8tZGVmYXVsdC1saWI9XCJ0cnVlXCIvPlxuLy8vIDxyZWZlcmVuY2UgbGliPVwiZG9tXCIgLz5cbi8vLyA8cmVmZXJlbmNlIGxpYj1cImRvbS5hc3luY2l0ZXJhYmxlXCIgLz5cbi8vLyA8cmVmZXJlbmNlIGxpYj1cImRlbm8ubnNcIiAvPlxuXG5pbXBvcnQge1xuICBjYWxsc2l0ZXMsXG4gIGNyZWF0ZVJlcG9ydGVyLFxuICBkaXJuYW1lLFxuICBGZWVkLFxuICBGcmFnbWVudCxcbiAgZnJvbUZpbGVVcmwsXG4gIGZyb250TWF0dGVyLFxuICBnZm0sXG4gIGgsXG4gIGh0bWwsXG4gIGpvaW4sXG4gIHJlbGF0aXZlLFxuICByZW1vdmVNYXJrZG93bixcbiAgc2VydmUsXG4gIHNlcnZlRGlyLFxuICB3YWxrLFxufSBmcm9tIFwiLi9kZXBzLnRzXCI7XG5pbXBvcnQgeyBJbmRleCwgUG9zdFBhZ2UgfSBmcm9tIFwiLi9jb21wb25lbnRzLnRzeFwiO1xuaW1wb3J0IHR5cGUgeyBDb25uSW5mbywgRmVlZEl0ZW0gfSBmcm9tIFwiLi9kZXBzLnRzXCI7XG5pbXBvcnQgdHlwZSB7XG4gIEJsb2dDb250ZXh0LFxuICBCbG9nTWlkZGxld2FyZSxcbiAgQmxvZ1NldHRpbmdzLFxuICBCbG9nU3RhdGUsXG4gIFBvc3QsXG59IGZyb20gXCIuL3R5cGVzLmQudHNcIjtcblxuZXhwb3J0IHsgRnJhZ21lbnQsIGggfTtcblxuY29uc3QgSVNfREVWID0gRGVuby5hcmdzLmluY2x1ZGVzKFwiLS1kZXZcIikgJiYgXCJ3YXRjaEZzXCIgaW4gRGVubztcbmNvbnN0IFBPU1RTID0gbmV3IE1hcDxzdHJpbmcsIFBvc3Q+KCk7XG5jb25zdCBITVJfU09DS0VUUzogU2V0PFdlYlNvY2tldD4gPSBuZXcgU2V0KCk7XG5cbmNvbnN0IEhNUl9DTElFTlQgPSBgbGV0IHNvY2tldDtcbmxldCByZWNvbm5lY3RUaW1lcjtcblxuY29uc3Qgd3NPcmlnaW4gPSB3aW5kb3cubG9jYXRpb24ub3JpZ2luXG4gIC5yZXBsYWNlKFwiaHR0cFwiLCBcIndzXCIpXG4gIC5yZXBsYWNlKFwiaHR0cHNcIiwgXCJ3c3NcIik7XG5jb25zdCBobXJVcmwgPSB3c09yaWdpbiArIFwiL2htclwiO1xuXG5obXJTb2NrZXQoKTtcblxuZnVuY3Rpb24gaG1yU29ja2V0KGNhbGxiYWNrKSB7XG4gIGlmIChzb2NrZXQpIHtcbiAgICBzb2NrZXQuY2xvc2UoKTtcbiAgfVxuXG4gIHNvY2tldCA9IG5ldyBXZWJTb2NrZXQoaG1yVXJsKTtcbiAgc29ja2V0LmFkZEV2ZW50TGlzdGVuZXIoXCJvcGVuXCIsIGNhbGxiYWNrKTtcbiAgc29ja2V0LmFkZEV2ZW50TGlzdGVuZXIoXCJtZXNzYWdlXCIsIChldmVudCkgPT4ge1xuICAgIGlmIChldmVudC5kYXRhID09PSBcInJlZnJlc2hcIikge1xuICAgICAgY29uc29sZS5sb2coXCJyZWZyZXNoaW5nc1wiKTtcbiAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcbiAgICB9XG4gIH0pO1xuXG4gIHNvY2tldC5hZGRFdmVudExpc3RlbmVyKFwiY2xvc2VcIiwgKCkgPT4ge1xuICAgIGNvbnNvbGUubG9nKFwicmVjb25uZWN0aW5nLi4uXCIpO1xuICAgIGNsZWFyVGltZW91dChyZWNvbm5lY3RUaW1lcik7XG4gICAgcmVjb25uZWN0VGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGhtclNvY2tldCgoKSA9PiB7XG4gICAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcbiAgICAgIH0pO1xuICAgIH0sIDEwMDApO1xuICB9KTtcbn1cbmA7XG5cbi8qKiBUaGUgbWFpbiBmdW5jdGlvbiBvZiB0aGUgbGlicmFyeS5cbiAqXG4gKiBgYGBqc3hcbiAqIGltcG9ydCBibG9nLCB7IGdhIH0gZnJvbSBcImh0dHBzOi8vZGVuby5sYW5kL3gvYmxvZy9ibG9nLnRzeFwiO1xuICpcbiAqIGJsb2coe1xuICogICB0aXRsZTogXCJNeSBCbG9nXCIsXG4gKiAgIGRlc2NyaXB0aW9uOiBcIlRoZSBibG9nIGRlc2NyaXB0aW9uLlwiLFxuICogICBhdmF0YXI6IFwiLi9hdmF0YXIucG5nXCIsXG4gKiAgIG1pZGRsZXdhcmVzOiBbXG4gKiAgICAgZ2EoXCJHQS1BTkFMWVRJQ1MtS0VZXCIpLFxuICogICBdLFxuICogfSk7XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGRlZmF1bHQgYXN5bmMgZnVuY3Rpb24gYmxvZyhzZXR0aW5ncz86IEJsb2dTZXR0aW5ncykge1xuICBjb25zdCB1cmwgPSBjYWxsc2l0ZXMoKVsxXS5nZXRGaWxlTmFtZSgpITtcbiAgY29uc3QgYmxvZ1N0YXRlID0gYXdhaXQgY29uZmlndXJlQmxvZyh1cmwsIElTX0RFViwgc2V0dGluZ3MpO1xuXG4gIGNvbnN0IGJsb2dIYW5kbGVyID0gY3JlYXRlQmxvZ0hhbmRsZXIoYmxvZ1N0YXRlKTtcbiAgc2VydmUoYmxvZ0hhbmRsZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQmxvZ0hhbmRsZXIoc3RhdGU6IEJsb2dTdGF0ZSkge1xuICBjb25zdCBpbm5lciA9IGhhbmRsZXI7XG4gIGNvbnN0IHdpdGhNaWRkbGV3YXJlcyA9IGNvbXBvc2VNaWRkbGV3YXJlcyhzdGF0ZSk7XG4gIHJldHVybiBmdW5jdGlvbiBoYW5kbGVyKHJlcTogUmVxdWVzdCwgY29ubkluZm86IENvbm5JbmZvKSB7XG4gICAgLy8gUmVkaXJlY3QgcmVxdWVzdHMgdGhhdCBlbmQgd2l0aCBhIHRyYWlsaW5nIHNsYXNoXG4gICAgLy8gdG8gdGhlaXIgbm9uLXRyYWlsaW5nIHNsYXNoIGNvdW50ZXJwYXJ0LlxuICAgIC8vIEV4OiAvYWJvdXQvIC0+IC9hYm91dFxuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocmVxLnVybCk7XG4gICAgaWYgKHVybC5wYXRobmFtZS5sZW5ndGggPiAxICYmIHVybC5wYXRobmFtZS5lbmRzV2l0aChcIi9cIikpIHtcbiAgICAgIHVybC5wYXRobmFtZSA9IHVybC5wYXRobmFtZS5zbGljZSgwLCAtMSk7XG4gICAgICByZXR1cm4gUmVzcG9uc2UucmVkaXJlY3QodXJsLmhyZWYsIDMwNyk7XG4gICAgfVxuICAgIHJldHVybiB3aXRoTWlkZGxld2FyZXMocmVxLCBjb25uSW5mbywgaW5uZXIpO1xuICB9O1xufVxuXG5mdW5jdGlvbiBjb21wb3NlTWlkZGxld2FyZXMoc3RhdGU6IEJsb2dTdGF0ZSkge1xuICByZXR1cm4gKFxuICAgIHJlcTogUmVxdWVzdCxcbiAgICBjb25uSW5mbzogQ29ubkluZm8sXG4gICAgaW5uZXI6IChyZXE6IFJlcXVlc3QsIGN0eDogQmxvZ0NvbnRleHQpID0+IFByb21pc2U8UmVzcG9uc2U+LFxuICApID0+IHtcbiAgICBjb25zdCBtd3MgPSBzdGF0ZS5taWRkbGV3YXJlcz8ucmV2ZXJzZSgpO1xuXG4gICAgY29uc3QgaGFuZGxlcnM6ICgoKSA9PiBSZXNwb25zZSB8IFByb21pc2U8UmVzcG9uc2U+KVtdID0gW107XG5cbiAgICBjb25zdCBjdHggPSB7XG4gICAgICBuZXh0KCkge1xuICAgICAgICBjb25zdCBoYW5kbGVyID0gaGFuZGxlcnMuc2hpZnQoKSE7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoaGFuZGxlcigpKTtcbiAgICAgIH0sXG4gICAgICBjb25uSW5mbyxcbiAgICAgIHN0YXRlLFxuICAgIH07XG5cbiAgICBpZiAobXdzKSB7XG4gICAgICBmb3IgKGNvbnN0IG13IG9mIG13cykge1xuICAgICAgICBoYW5kbGVycy5wdXNoKCgpID0+IG13KHJlcSwgY3R4KSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaGFuZGxlcnMucHVzaCgoKSA9PiBpbm5lcihyZXEsIGN0eCkpO1xuXG4gICAgY29uc3QgaGFuZGxlciA9IGhhbmRsZXJzLnNoaWZ0KCkhO1xuICAgIHJldHVybiBoYW5kbGVyKCk7XG4gIH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25maWd1cmVCbG9nKFxuICB1cmw6IHN0cmluZyxcbiAgaXNEZXY6IGJvb2xlYW4sXG4gIHNldHRpbmdzPzogQmxvZ1NldHRpbmdzLFxuKTogUHJvbWlzZTxCbG9nU3RhdGU+IHtcbiAgbGV0IGRpcmVjdG9yeTtcblxuICB0cnkge1xuICAgIGNvbnN0IGJsb2dQYXRoID0gZnJvbUZpbGVVcmwodXJsKTtcbiAgICBkaXJlY3RvcnkgPSBkaXJuYW1lKGJsb2dQYXRoKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUubG9nKGUpO1xuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBydW4gYmxvZyBmcm9tIGEgcmVtb3RlIFVSTC5cIik7XG4gIH1cblxuICBjb25zdCBzdGF0ZTogQmxvZ1N0YXRlID0ge1xuICAgIGRpcmVjdG9yeSxcbiAgICAuLi5zZXR0aW5ncyxcbiAgfTtcblxuICBhd2FpdCBsb2FkQ29udGVudChkaXJlY3RvcnksIGlzRGV2KTtcblxuICByZXR1cm4gc3RhdGU7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRDb250ZW50KGJsb2dEaXJlY3Rvcnk6IHN0cmluZywgaXNEZXY6IGJvb2xlYW4pIHtcbiAgLy8gUmVhZCBwb3N0cyBmcm9tIHRoZSBjdXJyZW50IGRpcmVjdG9yeSBhbmQgc3RvcmUgdGhlbSBpbiBtZW1vcnkuXG4gIGNvbnN0IHBvc3RzRGlyZWN0b3J5ID0gam9pbihibG9nRGlyZWN0b3J5LCBcInBvc3RzXCIpO1xuXG4gIC8vIFRPRE8oQHNhdHlhcm9oaXRoKTogbm90IGVmZmljaWVudCBmb3IgbGFyZ2UgbnVtYmVyIG9mIHBvc3RzLlxuICBmb3IgYXdhaXQgKFxuICAgIGNvbnN0IGVudHJ5IG9mIHdhbGsocG9zdHNEaXJlY3RvcnkpXG4gICkge1xuICAgIGlmIChlbnRyeS5pc0ZpbGUgJiYgZW50cnkucGF0aC5lbmRzV2l0aChcIi5tZFwiKSkge1xuICAgICAgYXdhaXQgbG9hZFBvc3QocG9zdHNEaXJlY3RvcnksIGVudHJ5LnBhdGgpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpc0Rldikge1xuICAgIHdhdGNoRm9yQ2hhbmdlcyhwb3N0c0RpcmVjdG9yeSkuY2F0Y2goKCkgPT4ge30pO1xuICB9XG59XG5cbi8vIFdhdGNoZXIgd2F0Y2hlcyBmb3IgLm1kIGZpbGUgY2hhbmdlcyBhbmQgdXBkYXRlcyB0aGUgcG9zdHMuXG5hc3luYyBmdW5jdGlvbiB3YXRjaEZvckNoYW5nZXMocG9zdHNEaXJlY3Rvcnk6IHN0cmluZykge1xuICBjb25zdCB3YXRjaGVyID0gRGVuby53YXRjaEZzKHBvc3RzRGlyZWN0b3J5KTtcbiAgZm9yIGF3YWl0IChjb25zdCBldmVudCBvZiB3YXRjaGVyKSB7XG4gICAgaWYgKGV2ZW50LmtpbmQgPT09IFwibW9kaWZ5XCIgfHwgZXZlbnQua2luZCA9PT0gXCJjcmVhdGVcIikge1xuICAgICAgZm9yIChjb25zdCBwYXRoIG9mIGV2ZW50LnBhdGhzKSB7XG4gICAgICAgIGlmIChwYXRoLmVuZHNXaXRoKFwiLm1kXCIpKSB7XG4gICAgICAgICAgYXdhaXQgbG9hZFBvc3QocG9zdHNEaXJlY3RvcnksIHBhdGgpO1xuICAgICAgICAgIEhNUl9TT0NLRVRTLmZvckVhY2goKHNvY2tldCkgPT4ge1xuICAgICAgICAgICAgc29ja2V0LnNlbmQoXCJyZWZyZXNoXCIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxvYWRQb3N0KHBvc3RzRGlyZWN0b3J5OiBzdHJpbmcsIHBhdGg6IHN0cmluZykge1xuICBjb25zdCBjb250ZW50cyA9IGF3YWl0IERlbm8ucmVhZFRleHRGaWxlKHBhdGgpO1xuICBsZXQgcGF0aG5hbWUgPSBcIi9cIiArIHJlbGF0aXZlKHBvc3RzRGlyZWN0b3J5LCBwYXRoKTtcbiAgLy8gUmVtb3ZlIC5tZCBleHRlbnNpb24uXG4gIHBhdGhuYW1lID0gcGF0aG5hbWUuc2xpY2UoMCwgLTMpO1xuXG4gIGNvbnN0IHsgY29udGVudCwgZGF0YSB9ID0gZnJvbnRNYXR0ZXIoY29udGVudHMpIGFzIHtcbiAgICBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAgIGNvbnRlbnQ6IHN0cmluZztcbiAgfTtcblxuICBsZXQgc25pcHBldCA9IGRhdGEuc25pcHBldCA/PyBkYXRhLmFic3RyYWN0ID8/IGRhdGEuc3VtbWFyeSA/P1xuICAgIGRhdGEuZGVzY3JpcHRpb247XG4gIGlmICghc25pcHBldCkge1xuICAgIGNvbnN0IG1heWJlU25pcHBldCA9IGNvbnRlbnQuc3BsaXQoXCJcXG5cXG5cIilbMF07XG4gICAgaWYgKG1heWJlU25pcHBldCkge1xuICAgICAgc25pcHBldCA9IHJlbW92ZU1hcmtkb3duKG1heWJlU25pcHBldC5yZXBsYWNlKFwiXFxuXCIsIFwiIFwiKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNuaXBwZXQgPSBcIlwiO1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHBvc3Q6IFBvc3QgPSB7XG4gICAgdGl0bGU6IGRhdGEudGl0bGUgPz8gXCJVbnRpdGxlZFwiLFxuICAgIGF1dGhvcjogZGF0YS5hdXRob3IsXG4gICAgLy8gTm90ZTogdXNlcnMgY2FuIG92ZXJyaWRlIHBhdGggb2YgYSBibG9nIHBvc3QgdXNpbmdcbiAgICAvLyBwYXRobmFtZSBpbiBmcm9udCBtYXR0ZXIuXG4gICAgcGF0aG5hbWU6IGRhdGEucGF0aG5hbWUgPz8gcGF0aG5hbWUsXG4gICAgcHVibGlzaERhdGU6IG5ldyBEYXRlKGRhdGEucHVibGlzaF9kYXRlKSxcbiAgICBzbmlwcGV0LFxuICAgIG1hcmtkb3duOiBjb250ZW50LFxuICAgIGNvdmVySHRtbDogZGF0YS5jb3Zlcl9odG1sLFxuICAgIGJhY2tncm91bmQ6IGRhdGEuYmFja2dyb3VuZCxcbiAgICBvZ0ltYWdlOiBkYXRhW1wib2c6aW1hZ2VcIl0sXG4gIH07XG4gIFBPU1RTLnNldChwYXRobmFtZSwgcG9zdCk7XG4gIGNvbnNvbGUubG9nKFwiTG9hZDogXCIsIHBvc3QucGF0aG5hbWUpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlcihcbiAgcmVxOiBSZXF1ZXN0LFxuICBjdHg6IEJsb2dDb250ZXh0LFxuKSB7XG4gIGNvbnN0IHsgc3RhdGU6IGJsb2dTdGF0ZSB9ID0gY3R4O1xuICBjb25zdCB7IHBhdGhuYW1lIH0gPSBuZXcgVVJMKHJlcS51cmwpO1xuXG4gIGlmIChwYXRobmFtZSA9PT0gXCIvZmVlZFwiKSB7XG4gICAgcmV0dXJuIHNlcnZlUlNTKHJlcSwgYmxvZ1N0YXRlLCBQT1NUUyk7XG4gIH1cblxuICBpZiAoSVNfREVWKSB7XG4gICAgaWYgKHBhdGhuYW1lID09IFwiL2htci5qc1wiKSB7XG4gICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKEhNUl9DTElFTlQsIHtcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIFwiY29udGVudC10eXBlXCI6IFwiYXBwbGljYXRpb24vamF2YXNjcmlwdFwiLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHBhdGhuYW1lID09IFwiL2htclwiKSB7XG4gICAgICBjb25zdCB7IHJlc3BvbnNlLCBzb2NrZXQgfSA9IERlbm8udXBncmFkZVdlYlNvY2tldChyZXEpO1xuICAgICAgSE1SX1NPQ0tFVFMuYWRkKHNvY2tldCk7XG4gICAgICBzb2NrZXQub25jbG9zZSA9ICgpID0+IHtcbiAgICAgICAgSE1SX1NPQ0tFVFMuZGVsZXRlKHNvY2tldCk7XG4gICAgICB9O1xuXG4gICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgfVxuICB9XG5cbiAgaWYgKHBhdGhuYW1lID09PSBcIi9cIikge1xuICAgIHJldHVybiBodG1sKHtcbiAgICAgIHRpdGxlOiBibG9nU3RhdGUudGl0bGUgPz8gXCJNeSBCbG9nXCIsXG4gICAgICBtZXRhOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogYmxvZ1N0YXRlLmRlc2NyaXB0aW9uLFxuICAgICAgICBcIm9nOnRpdGxlXCI6IGJsb2dTdGF0ZS50aXRsZSxcbiAgICAgICAgXCJvZzpkZXNjcmlwdGlvblwiOiBibG9nU3RhdGUuZGVzY3JpcHRpb24sXG4gICAgICAgIFwib2c6aW1hZ2VcIjogYmxvZ1N0YXRlLm9nSW1hZ2UgPz8gYmxvZ1N0YXRlLmNvdmVyLFxuICAgICAgICBcInR3aXR0ZXI6dGl0bGVcIjogYmxvZ1N0YXRlLnRpdGxlLFxuICAgICAgICBcInR3aXR0ZXI6ZGVzY3JpcHRpb25cIjogYmxvZ1N0YXRlLmRlc2NyaXB0aW9uLFxuICAgICAgICBcInR3aXR0ZXI6aW1hZ2VcIjogYmxvZ1N0YXRlLm9nSW1hZ2UgPz8gYmxvZ1N0YXRlLmNvdmVyLFxuICAgICAgICBcInR3aXR0ZXI6Y2FyZFwiOiBibG9nU3RhdGUub2dJbWFnZSA/IFwic3VtbWFyeV9sYXJnZV9pbWFnZVwiIDogdW5kZWZpbmVkLFxuICAgICAgfSxcbiAgICAgIHN0eWxlczogW1xuICAgICAgICAuLi4oYmxvZ1N0YXRlLnN0eWxlID8gW2Jsb2dTdGF0ZS5zdHlsZV0gOiBbXSksXG4gICAgICAgIC4uLihibG9nU3RhdGUuYmFja2dyb3VuZFxuICAgICAgICAgID8gW2Bib2R5e2JhY2tncm91bmQ6JHtibG9nU3RhdGUuYmFja2dyb3VuZH07fWBdXG4gICAgICAgICAgOiBbXSksXG4gICAgICBdLFxuICAgICAgc2NyaXB0czogSVNfREVWID8gW3sgc3JjOiBcIi9obXIuanNcIiB9XSA6IHVuZGVmaW5lZCxcbiAgICAgIGJvZHk6IChcbiAgICAgICAgPEluZGV4XG4gICAgICAgICAgc3RhdGU9e2Jsb2dTdGF0ZX1cbiAgICAgICAgICBwb3N0cz17UE9TVFN9XG4gICAgICAgIC8+XG4gICAgICApLFxuICAgIH0pO1xuICB9XG5cbiAgY29uc3QgcG9zdCA9IFBPU1RTLmdldChwYXRobmFtZSk7XG4gIGlmIChwb3N0KSB7XG4gICAgcmV0dXJuIGh0bWwoe1xuICAgICAgdGl0bGU6IHBvc3QudGl0bGUsXG4gICAgICBtZXRhOiB7XG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogcG9zdC5zbmlwcGV0LFxuICAgICAgICBcIm9nOnRpdGxlXCI6IHBvc3QudGl0bGUsXG4gICAgICAgIFwib2c6ZGVzY3JpcHRpb25cIjogcG9zdC5zbmlwcGV0LFxuICAgICAgICBcIm9nOmltYWdlXCI6IHBvc3Qub2dJbWFnZSxcbiAgICAgICAgXCJ0d2l0dGVyOnRpdGxlXCI6IHBvc3QudGl0bGUsXG4gICAgICAgIFwidHdpdHRlcjpkZXNjcmlwdGlvblwiOiBwb3N0LnNuaXBwZXQsXG4gICAgICAgIFwidHdpdHRlcjppbWFnZVwiOiBwb3N0Lm9nSW1hZ2UsXG4gICAgICAgIFwidHdpdHRlcjpjYXJkXCI6IHBvc3Qub2dJbWFnZSA/IFwic3VtbWFyeV9sYXJnZV9pbWFnZVwiIDogdW5kZWZpbmVkLFxuICAgICAgfSxcbiAgICAgIHN0eWxlczogW1xuICAgICAgICBnZm0uQ1NTLFxuICAgICAgICBgLm1hcmtkb3duLWJvZHkgeyAtLWNvbG9yLWNhbnZhcy1kZWZhdWx0OiB0cmFuc3BhcmVudDsgLS1jb2xvci1jYW52YXMtc3VidGxlOiAjZWRmMGYyOyAtLWNvbG9yLWJvcmRlci1tdXRlZDogcmdiYSgxMjgsMTI4LDEyOCwwLjIpOyB9IC5tYXJrZG93bi1ib2R5IGltZyArIHAgeyBtYXJnaW4tdG9wOiAxNnB4OyB9YCxcbiAgICAgICAgLi4uKGJsb2dTdGF0ZS5zdHlsZSA/IFtibG9nU3RhdGUuc3R5bGVdIDogW10pLFxuICAgICAgICAuLi4ocG9zdC5iYWNrZ3JvdW5kID8gW2Bib2R5e2JhY2tncm91bmQ6JHtwb3N0LmJhY2tncm91bmR9O31gXSA6IChcbiAgICAgICAgICBibG9nU3RhdGUuYmFja2dyb3VuZFxuICAgICAgICAgICAgPyBbYGJvZHl7YmFja2dyb3VuZDoke2Jsb2dTdGF0ZS5iYWNrZ3JvdW5kfTt9YF1cbiAgICAgICAgICAgIDogW11cbiAgICAgICAgKSksXG4gICAgICBdLFxuICAgICAgc2NyaXB0czogSVNfREVWID8gW3sgc3JjOiBcIi9obXIuanNcIiB9XSA6IHVuZGVmaW5lZCxcbiAgICAgIGJvZHk6IDxQb3N0UGFnZSBwb3N0PXtwb3N0fSBzdGF0ZT17YmxvZ1N0YXRlfSAvPixcbiAgICB9KTtcbiAgfVxuXG4gIGxldCBmc1Jvb3QgPSBibG9nU3RhdGUuZGlyZWN0b3J5O1xuICB0cnkge1xuICAgIGF3YWl0IERlbm8ubHN0YXQoam9pbihibG9nU3RhdGUuZGlyZWN0b3J5LCBcIi4vcG9zdHNcIiwgcGF0aG5hbWUpKTtcbiAgICBmc1Jvb3QgPSBqb2luKGJsb2dTdGF0ZS5kaXJlY3RvcnksIFwiLi9wb3N0c1wiKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGlmICghKGUgaW5zdGFuY2VvZiBEZW5vLmVycm9ycy5Ob3RGb3VuZCkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZSk7XG4gICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKGUubWVzc2FnZSwgeyBzdGF0dXM6IDUwMCB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gc2VydmVEaXIocmVxLCB7IGZzUm9vdCB9KTtcbn1cblxuLyoqIFNlcnZlcyB0aGUgcnNzL2F0b20gZmVlZCBvZiB0aGUgYmxvZy4gKi9cbmZ1bmN0aW9uIHNlcnZlUlNTKFxuICByZXE6IFJlcXVlc3QsXG4gIHN0YXRlOiBCbG9nU3RhdGUsXG4gIHBvc3RzOiBNYXA8c3RyaW5nLCBQb3N0Pixcbik6IFJlc3BvbnNlIHtcbiAgY29uc3QgdXJsID0gbmV3IFVSTChyZXEudXJsKTtcbiAgY29uc3Qgb3JpZ2luID0gdXJsLm9yaWdpbjtcbiAgY29uc3QgY29weXJpZ2h0ID0gYENvcHlyaWdodCAke25ldyBEYXRlKCkuZ2V0RnVsbFllYXIoKX0gJHtvcmlnaW59YDtcbiAgY29uc3QgZmVlZCA9IG5ldyBGZWVkKHtcbiAgICB0aXRsZTogc3RhdGUudGl0bGUgPz8gXCJCbG9nXCIsXG4gICAgZGVzY3JpcHRpb246IHN0YXRlLmRlc2NyaXB0aW9uLFxuICAgIGlkOiBgJHtvcmlnaW59L2Jsb2dgLFxuICAgIGxpbms6IGAke29yaWdpbn0vYmxvZ2AsXG4gICAgbGFuZ3VhZ2U6IFwiZW5cIixcbiAgICBmYXZpY29uOiBgJHtvcmlnaW59L2Zhdmljb24uaWNvYCxcbiAgICBjb3B5cmlnaHQ6IGNvcHlyaWdodCxcbiAgICBnZW5lcmF0b3I6IFwiRmVlZCAoaHR0cHM6Ly9naXRodWIuY29tL2pwbW9uZXR0ZS9mZWVkKSBmb3IgRGVub1wiLFxuICAgIGZlZWRMaW5rczoge1xuICAgICAgYXRvbTogYCR7b3JpZ2lufS9mZWVkYCxcbiAgICB9LFxuICB9KTtcblxuICBmb3IgKGNvbnN0IFtfa2V5LCBwb3N0XSBvZiBwb3N0cy5lbnRyaWVzKCkpIHtcbiAgICBjb25zdCBpdGVtOiBGZWVkSXRlbSA9IHtcbiAgICAgIGlkOiBgJHtvcmlnaW59LyR7cG9zdC50aXRsZX1gLFxuICAgICAgdGl0bGU6IHBvc3QudGl0bGUsXG4gICAgICBkZXNjcmlwdGlvbjogcG9zdC5zbmlwcGV0LFxuICAgICAgZGF0ZTogcG9zdC5wdWJsaXNoRGF0ZSxcbiAgICAgIGxpbms6IGAke29yaWdpbn0ke3Bvc3QucGF0aG5hbWV9YCxcbiAgICAgIGF1dGhvcjogcG9zdC5hdXRob3I/LnNwbGl0KFwiLFwiKS5tYXAoKGF1dGhvcjogc3RyaW5nKSA9PiAoe1xuICAgICAgICBuYW1lOiBhdXRob3IudHJpbSgpLFxuICAgICAgfSkpLFxuICAgICAgaW1hZ2U6IHBvc3Qub2dJbWFnZSxcbiAgICAgIGNvcHlyaWdodCxcbiAgICAgIHB1Ymxpc2hlZDogcG9zdC5wdWJsaXNoRGF0ZSxcbiAgICB9O1xuICAgIGZlZWQuYWRkSXRlbShpdGVtKTtcbiAgfVxuXG4gIGNvbnN0IGF0b21GZWVkID0gZmVlZC5hdG9tMSgpO1xuICByZXR1cm4gbmV3IFJlc3BvbnNlKGF0b21GZWVkLCB7XG4gICAgaGVhZGVyczoge1xuICAgICAgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9hdG9tK3htbDsgY2hhcnNldD11dGYtOFwiLFxuICAgIH0sXG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2EoZ2FLZXk6IHN0cmluZyk6IEJsb2dNaWRkbGV3YXJlIHtcbiAgaWYgKGdhS2V5Lmxlbmd0aCA9PT0gMCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIkdBIGtleSBjYW5ub3QgYmUgZW1wdHkuXCIpO1xuICB9XG5cbiAgY29uc3QgZ2FSZXBvcnRlciA9IGNyZWF0ZVJlcG9ydGVyKHsgaWQ6IGdhS2V5IH0pO1xuXG4gIHJldHVybiBhc3luYyBmdW5jdGlvbiAoXG4gICAgcmVxdWVzdDogUmVxdWVzdCxcbiAgICBjdHg6IEJsb2dDb250ZXh0LFxuICApOiBQcm9taXNlPFJlc3BvbnNlPiB7XG4gICAgbGV0IGVycjogdW5kZWZpbmVkIHwgRXJyb3I7XG4gICAgbGV0IHJlczogdW5kZWZpbmVkIHwgUmVzcG9uc2U7XG5cbiAgICBjb25zdCBzdGFydCA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIHRyeSB7XG4gICAgICByZXMgPSBhd2FpdCBjdHgubmV4dCgpIGFzIFJlc3BvbnNlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGVyciA9IGU7XG4gICAgICByZXMgPSBuZXcgUmVzcG9uc2UoXCJJbnRlcm5hbCBzZXJ2ZXIgZXJyb3JcIiwge1xuICAgICAgICBzdGF0dXM6IDUwMCxcbiAgICAgIH0pO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBpZiAoZ2FSZXBvcnRlcikge1xuICAgICAgICBnYVJlcG9ydGVyKHJlcXVlc3QsIGN0eC5jb25uSW5mbywgcmVzISwgc3RhcnQsIGVycik7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXM7XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWRpcmVjdHMocmVkaXJlY3RNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBCbG9nTWlkZGxld2FyZSB7XG4gIHJldHVybiBhc3luYyBmdW5jdGlvbiAocmVxOiBSZXF1ZXN0LCBjdHg6IEJsb2dDb250ZXh0KTogUHJvbWlzZTxSZXNwb25zZT4ge1xuICAgIGNvbnN0IHsgcGF0aG5hbWUgfSA9IG5ldyBVUkwocmVxLnVybCk7XG5cbiAgICBsZXQgbWF5YmVSZWRpcmVjdCA9IHJlZGlyZWN0TWFwW3BhdGhuYW1lXTtcblxuICAgIGlmICghbWF5YmVSZWRpcmVjdCkge1xuICAgICAgLy8gdHJpbSBsZWFkaW5nIHNsYXNoXG4gICAgICBtYXliZVJlZGlyZWN0ID0gcmVkaXJlY3RNYXBbcGF0aG5hbWUuc2xpY2UoMSldO1xuICAgIH1cblxuICAgIGlmIChtYXliZVJlZGlyZWN0KSB7XG4gICAgICBpZiAoIW1heWJlUmVkaXJlY3Quc3RhcnRzV2l0aChcIi9cIikpIHtcbiAgICAgICAgbWF5YmVSZWRpcmVjdCA9IFwiL1wiICsgbWF5YmVSZWRpcmVjdDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShudWxsLCB7XG4gICAgICAgIHN0YXR1czogMzA3LFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgXCJsb2NhdGlvblwiOiBtYXliZVJlZGlyZWN0LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGF3YWl0IGN0eC5uZXh0KCk7XG4gIH07XG59XG4iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEscUVBQXFFO0FBRXJFLGFBQWEsQ0FDYixzQ0FBc0M7QUFDdEMsMkJBQTJCO0FBQzNCLHlDQUF5QztBQUN6QywrQkFBK0I7QUFFL0IsU0FDRSxTQUFTLEVBQ1QsY0FBYyxFQUNkLE9BQU8sRUFDUCxJQUFJLEVBQ0osUUFBUSxFQUNSLFdBQVcsRUFDWCxXQUFXLEVBQ1gsR0FBRyxFQUNILENBQUMsRUFDRCxJQUFJLEVBQ0osSUFBSSxFQUNKLFFBQVEsRUFDUixjQUFjLEVBQ2QsS0FBSyxFQUNMLFFBQVEsRUFDUixJQUFJLFFBQ0MsV0FBVyxDQUFDO0FBQ25CLFNBQVMsS0FBSyxFQUFFLFFBQVEsUUFBUSxrQkFBa0IsQ0FBQztBQVVuRCxTQUFTLFFBQVEsRUFBRSxDQUFDLEdBQUc7QUFFdkIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksU0FBUyxJQUFJLElBQUksQUFBQztBQUNoRSxNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsRUFBZ0IsQUFBQztBQUN0QyxNQUFNLFdBQVcsR0FBbUIsSUFBSSxHQUFHLEVBQUUsQUFBQztBQUU5QyxNQUFNLFVBQVUsR0FBRyxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBa0NwQixDQUFDLEFBQUM7QUFFRjs7Ozs7Ozs7Ozs7Ozs7R0FjRyxDQUNILGVBQWUsZUFBZSxJQUFJLENBQUMsUUFBdUIsRUFBRTtJQUMxRCxNQUFNLEdBQUcsR0FBRyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQUFBQyxBQUFDO0lBQzFDLE1BQU0sU0FBUyxHQUFHLE1BQU0sYUFBYSxDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsUUFBUSxDQUFDLEFBQUM7SUFFN0QsTUFBTSxXQUFXLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEFBQUM7SUFDakQsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0NBQ3BCLENBQUE7QUFFRCxPQUFPLFNBQVMsaUJBQWlCLENBQUMsS0FBZ0IsRUFBRTtJQUNsRCxNQUFNLEtBQUssR0FBRyxPQUFPLEFBQUM7SUFDdEIsTUFBTSxlQUFlLEdBQUcsa0JBQWtCLENBQUMsS0FBSyxDQUFDLEFBQUM7SUFDbEQsT0FBTyxTQUFTLE9BQU8sQ0FBQyxHQUFZLEVBQUUsUUFBa0IsRUFBRTtRQUN4RCxtREFBbUQ7UUFDbkQsMkNBQTJDO1FBQzNDLHdCQUF3QjtRQUN4QixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEFBQUM7UUFDN0IsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUU7WUFDekQsR0FBRyxDQUFDLFFBQVEsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6QyxPQUFPLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztTQUN6QztRQUNELE9BQU8sZUFBZSxDQUFDLEdBQUcsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FDOUMsQ0FBQztDQUNIO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxLQUFnQixFQUFFO0lBQzVDLE9BQU8sQ0FDTCxHQUFZLEVBQ1osUUFBa0IsRUFDbEIsS0FBNEQsR0FDekQ7UUFDSCxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsV0FBVyxFQUFFLE9BQU8sRUFBRSxBQUFDO1FBRXpDLE1BQU0sUUFBUSxHQUEyQyxFQUFFLEFBQUM7UUFFNUQsTUFBTSxHQUFHLEdBQUc7WUFDVixJQUFJLElBQUc7Z0JBQ0wsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLEtBQUssRUFBRSxBQUFDLEFBQUM7Z0JBQ2xDLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO2FBQ25DO1lBQ0QsUUFBUTtZQUNSLEtBQUs7U0FDTixBQUFDO1FBRUYsSUFBSSxHQUFHLEVBQUU7WUFDUCxLQUFLLE1BQU0sRUFBRSxJQUFJLEdBQUcsQ0FBRTtnQkFDcEIsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFNLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQzthQUNuQztTQUNGO1FBRUQsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFNLEtBQUssQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUVyQyxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsS0FBSyxFQUFFLEFBQUMsQUFBQztRQUNsQyxPQUFPLE9BQU8sRUFBRSxDQUFDO0tBQ2xCLENBQUM7Q0FDSDtBQUVELE9BQU8sZUFBZSxhQUFhLENBQ2pDLEdBQVcsRUFDWCxLQUFjLEVBQ2QsUUFBdUIsRUFDSDtJQUNwQixJQUFJLFNBQVMsQUFBQztJQUVkLElBQUk7UUFDRixNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLEFBQUM7UUFDbEMsU0FBUyxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztLQUMvQixDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ1YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztLQUN2RDtJQUVELE1BQU0sS0FBSyxHQUFjO1FBQ3ZCLFNBQVM7UUFDVCxHQUFHLFFBQVE7S0FDWixBQUFDO0lBRUYsTUFBTSxXQUFXLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBRXBDLE9BQU8sS0FBSyxDQUFDO0NBQ2Q7QUFFRCxlQUFlLFdBQVcsQ0FBQyxhQUFxQixFQUFFLEtBQWMsRUFBRTtJQUNoRSxrRUFBa0U7SUFDbEUsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUMsQUFBQztJQUVwRCwrREFBK0Q7SUFDL0QsV0FDRSxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLENBQ25DO1FBQ0EsSUFBSSxLQUFLLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQzlDLE1BQU0sUUFBUSxDQUFDLGNBQWMsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDNUM7S0FDRjtJQUVELElBQUksS0FBSyxFQUFFO1FBQ1QsZUFBZSxDQUFDLGNBQWMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFNLEVBQUUsQ0FBQyxDQUFDO0tBQ2pEO0NBQ0Y7QUFFRCw4REFBOEQ7QUFDOUQsZUFBZSxlQUFlLENBQUMsY0FBc0IsRUFBRTtJQUNyRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxBQUFDO0lBQzdDLFdBQVcsTUFBTSxLQUFLLElBQUksT0FBTyxDQUFFO1FBQ2pDLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUU7WUFDdEQsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFFO2dCQUM5QixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUU7b0JBQ3hCLE1BQU0sUUFBUSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDckMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sR0FBSzt3QkFDOUIsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztxQkFDeEIsQ0FBQyxDQUFDO2lCQUNKO2FBQ0Y7U0FDRjtLQUNGO0NBQ0Y7QUFFRCxlQUFlLFFBQVEsQ0FBQyxjQUFzQixFQUFFLElBQVksRUFBRTtJQUM1RCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEFBQUM7SUFDL0MsSUFBSSxRQUFRLEdBQUcsR0FBRyxHQUFHLFFBQVEsQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLEFBQUM7SUFDcEQsd0JBQXdCO0lBQ3hCLFFBQVEsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRWpDLE1BQU0sRUFBRSxPQUFPLENBQUEsRUFBRSxJQUFJLENBQUEsRUFBRSxHQUFHLFdBQVcsQ0FBQyxRQUFRLENBQUMsQUFHOUMsQUFBQztJQUVGLElBQUksT0FBTyxHQUFHLENBQUEsQ0FBQSxJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUEsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFBLElBQ3pELElBQUksQ0FBQyxXQUFXLEFBQUM7SUFDbkIsSUFBSSxDQUFDLE9BQU8sRUFBRTtRQUNaLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEFBQUM7UUFDOUMsSUFBSSxZQUFZLEVBQUU7WUFDaEIsT0FBTyxHQUFHLGNBQWMsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1NBQzNELE1BQU07WUFDTCxPQUFPLEdBQUcsRUFBRSxDQUFDO1NBQ2Q7S0FDRjtJQUVELE1BQU0sSUFBSSxHQUFTO1FBQ2pCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxJQUFJLFVBQVU7UUFDL0IsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO1FBQ25CLHFEQUFxRDtRQUNyRCw0QkFBNEI7UUFDNUIsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLElBQUksUUFBUTtRQUNuQyxXQUFXLEVBQUUsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQztRQUN4QyxPQUFPO1FBQ1AsUUFBUSxFQUFFLE9BQU87UUFDakIsU0FBUyxFQUFFLElBQUksQ0FBQyxVQUFVO1FBQzFCLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVTtRQUMzQixPQUFPLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQztLQUMxQixBQUFDO0lBQ0YsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDMUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0NBQ3RDO0FBRUQsT0FBTyxlQUFlLE9BQU8sQ0FDM0IsR0FBWSxFQUNaLEdBQWdCLEVBQ2hCO0lBQ0EsTUFBTSxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUEsRUFBRSxHQUFHLEdBQUcsQUFBQztJQUNqQyxNQUFNLEVBQUUsUUFBUSxDQUFBLEVBQUUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEFBQUM7SUFFdEMsSUFBSSxRQUFRLEtBQUssT0FBTyxFQUFFO1FBQ3hCLE9BQU8sUUFBUSxDQUFDLEdBQUcsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FDeEM7SUFFRCxJQUFJLE1BQU0sRUFBRTtRQUNWLElBQUksUUFBUSxJQUFJLFNBQVMsRUFBRTtZQUN6QixPQUFPLElBQUksUUFBUSxDQUFDLFVBQVUsRUFBRTtnQkFDOUIsT0FBTyxFQUFFO29CQUNQLGNBQWMsRUFBRSx3QkFBd0I7aUJBQ3pDO2FBQ0YsQ0FBQyxDQUFDO1NBQ0o7UUFFRCxJQUFJLFFBQVEsSUFBSSxNQUFNLEVBQUU7WUFDdEIsTUFBTSxFQUFFLFFBQVEsQ0FBQSxFQUFFLE1BQU0sQ0FBQSxFQUFFLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxBQUFDO1lBQ3hELFdBQVcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDeEIsTUFBTSxDQUFDLE9BQU8sR0FBRyxJQUFNO2dCQUNyQixXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2FBQzVCLENBQUM7WUFFRixPQUFPLFFBQVEsQ0FBQztTQUNqQjtLQUNGO0lBRUQsSUFBSSxRQUFRLEtBQUssR0FBRyxFQUFFO1FBQ3BCLE9BQU8sSUFBSSxDQUFDO1lBQ1YsS0FBSyxFQUFFLFNBQVMsQ0FBQyxLQUFLLElBQUksU0FBUztZQUNuQyxJQUFJLEVBQUU7Z0JBQ0osYUFBYSxFQUFFLFNBQVMsQ0FBQyxXQUFXO2dCQUNwQyxVQUFVLEVBQUUsU0FBUyxDQUFDLEtBQUs7Z0JBQzNCLGdCQUFnQixFQUFFLFNBQVMsQ0FBQyxXQUFXO2dCQUN2QyxVQUFVLEVBQUUsU0FBUyxDQUFDLE9BQU8sSUFBSSxTQUFTLENBQUMsS0FBSztnQkFDaEQsZUFBZSxFQUFFLFNBQVMsQ0FBQyxLQUFLO2dCQUNoQyxxQkFBcUIsRUFBRSxTQUFTLENBQUMsV0FBVztnQkFDNUMsZUFBZSxFQUFFLFNBQVMsQ0FBQyxPQUFPLElBQUksU0FBUyxDQUFDLEtBQUs7Z0JBQ3JELGNBQWMsRUFBRSxTQUFTLENBQUMsT0FBTyxHQUFHLHFCQUFxQixHQUFHLFNBQVM7YUFDdEU7WUFDRCxNQUFNLEVBQUU7bUJBQ0YsU0FBUyxDQUFDLEtBQUssR0FBRztvQkFBQyxTQUFTLENBQUMsS0FBSztpQkFBQyxHQUFHLEVBQUU7bUJBQ3hDLFNBQVMsQ0FBQyxVQUFVLEdBQ3BCO29CQUFDLENBQUMsZ0JBQWdCLEVBQUUsU0FBUyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7aUJBQUMsR0FDN0MsRUFBRTthQUNQO1lBQ0QsT0FBTyxFQUFFLE1BQU0sR0FBRztnQkFBQztvQkFBRSxHQUFHLEVBQUUsU0FBUztpQkFBRTthQUFDLEdBQUcsU0FBUztZQUNsRCxJQUFJLGdCQUNGLEFBMVNSLENBQWEsQ0EwU0osS0FBSztnQkFDSixLQUFLLEVBQUUsU0FBUztnQkFDaEIsS0FBSyxFQUFFLEtBQUs7Y0FDWjtTQUVMLENBQUMsQ0FBQztLQUNKO0lBRUQsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQUFBQztJQUNqQyxJQUFJLElBQUksRUFBRTtRQUNSLE9BQU8sSUFBSSxDQUFDO1lBQ1YsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1lBQ2pCLElBQUksRUFBRTtnQkFDSixhQUFhLEVBQUUsSUFBSSxDQUFDLE9BQU87Z0JBQzNCLFVBQVUsRUFBRSxJQUFJLENBQUMsS0FBSztnQkFDdEIsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLE9BQU87Z0JBQzlCLFVBQVUsRUFBRSxJQUFJLENBQUMsT0FBTztnQkFDeEIsZUFBZSxFQUFFLElBQUksQ0FBQyxLQUFLO2dCQUMzQixxQkFBcUIsRUFBRSxJQUFJLENBQUMsT0FBTztnQkFDbkMsZUFBZSxFQUFFLElBQUksQ0FBQyxPQUFPO2dCQUM3QixjQUFjLEVBQUUsSUFBSSxDQUFDLE9BQU8sR0FBRyxxQkFBcUIsR0FBRyxTQUFTO2FBQ2pFO1lBQ0QsTUFBTSxFQUFFO2dCQUNOLEdBQUcsQ0FBQyxHQUFHO2dCQUNQLENBQUMsaUxBQWlMLENBQUM7bUJBQy9LLFNBQVMsQ0FBQyxLQUFLLEdBQUc7b0JBQUMsU0FBUyxDQUFDLEtBQUs7aUJBQUMsR0FBRyxFQUFFO21CQUN4QyxJQUFJLENBQUMsVUFBVSxHQUFHO29CQUFDLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7aUJBQUMsR0FDNUQsU0FBUyxDQUFDLFVBQVUsR0FDaEI7b0JBQUMsQ0FBQyxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztpQkFBQyxHQUM3QyxFQUFFLEFBQ1A7YUFDRjtZQUNELE9BQU8sRUFBRSxNQUFNLEdBQUc7Z0JBQUM7b0JBQUUsR0FBRyxFQUFFLFNBQVM7aUJBQUU7YUFBQyxHQUFHLFNBQVM7WUFDbEQsSUFBSSxnQkFBRSxBQTNVWixDQUFhLENBMlVBLFFBQVE7Z0JBQUMsSUFBSSxFQUFFLElBQUk7Z0JBQUUsS0FBSyxFQUFFLFNBQVM7Y0FBSTtTQUNqRCxDQUFDLENBQUM7S0FDSjtJQUVELElBQUksTUFBTSxHQUFHLFNBQVMsQ0FBQyxTQUFTLEFBQUM7SUFDakMsSUFBSTtRQUNGLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUNqRSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7S0FDL0MsQ0FBQyxPQUFPLENBQUMsRUFBRTtRQUNWLElBQUksQ0FBQyxDQUFDLENBQUMsWUFBWSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQ3hDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDakIsT0FBTyxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFO2dCQUFFLE1BQU0sRUFBRSxHQUFHO2FBQUUsQ0FBQyxDQUFDO1NBQ2pEO0tBQ0Y7SUFFRCxPQUFPLFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFBRSxNQUFNO0tBQUUsQ0FBQyxDQUFDO0NBQ2xDO0FBRUQsNENBQTRDLENBQzVDLFNBQVMsUUFBUSxDQUNmLEdBQVksRUFDWixLQUFnQixFQUNoQixLQUF3QixFQUNkO0lBQ1YsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxBQUFDO0lBQzdCLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLEFBQUM7SUFDMUIsTUFBTSxTQUFTLEdBQUcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQUFBQztJQUNwRSxNQUFNLElBQUksR0FBRyxJQUFJLElBQUksQ0FBQztRQUNwQixLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUssSUFBSSxNQUFNO1FBQzVCLFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVztRQUM5QixFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDcEIsSUFBSSxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ3RCLFFBQVEsRUFBRSxJQUFJO1FBQ2QsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsWUFBWSxDQUFDO1FBQ2hDLFNBQVMsRUFBRSxTQUFTO1FBQ3BCLFNBQVMsRUFBRSxtREFBbUQ7UUFDOUQsU0FBUyxFQUFFO1lBQ1QsSUFBSSxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDO1NBQ3ZCO0tBQ0YsQ0FBQyxBQUFDO0lBRUgsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBRTtRQUMxQyxNQUFNLElBQUksR0FBYTtZQUNyQixFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzdCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztZQUNqQixXQUFXLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDekIsSUFBSSxFQUFFLElBQUksQ0FBQyxXQUFXO1lBQ3RCLElBQUksRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFjLEdBQUssQ0FBQztvQkFDdkQsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLEVBQUU7aUJBQ3BCLENBQUMsQ0FBQztZQUNILEtBQUssRUFBRSxJQUFJLENBQUMsT0FBTztZQUNuQixTQUFTO1lBQ1QsU0FBUyxFQUFFLElBQUksQ0FBQyxXQUFXO1NBQzVCLEFBQUM7UUFDRixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3BCO0lBRUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxBQUFDO0lBQzlCLE9BQU8sSUFBSSxRQUFRLENBQUMsUUFBUSxFQUFFO1FBQzVCLE9BQU8sRUFBRTtZQUNQLGNBQWMsRUFBRSxxQ0FBcUM7U0FDdEQ7S0FDRixDQUFDLENBQUM7Q0FDSjtBQUVELE9BQU8sU0FBUyxFQUFFLENBQUMsS0FBYSxFQUFrQjtJQUNoRCxJQUFJLEtBQUssQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQ3RCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztLQUM1QztJQUVELE1BQU0sVUFBVSxHQUFHLGNBQWMsQ0FBQztRQUFFLEVBQUUsRUFBRSxLQUFLO0tBQUUsQ0FBQyxBQUFDO0lBRWpELE9BQU8sZUFDTCxPQUFnQixFQUNoQixHQUFnQixFQUNHO1FBQ25CLElBQUksR0FBRyxBQUFtQixBQUFDO1FBQzNCLElBQUksR0FBRyxBQUFzQixBQUFDO1FBRTlCLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxHQUFHLEVBQUUsQUFBQztRQUNoQyxJQUFJO1lBQ0YsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDLElBQUksRUFBRSxBQUFZLENBQUM7U0FDcEMsQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUNWLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFDUixHQUFHLEdBQUcsSUFBSSxRQUFRLENBQUMsdUJBQXVCLEVBQUU7Z0JBQzFDLE1BQU0sRUFBRSxHQUFHO2FBQ1osQ0FBQyxDQUFDO1NBQ0osUUFBUztZQUNSLElBQUksVUFBVSxFQUFFO2dCQUNkLFVBQVUsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsRUFBRSxHQUFHLEVBQUcsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2FBQ3JEO1NBQ0Y7UUFDRCxPQUFPLEdBQUcsQ0FBQztLQUNaLENBQUM7Q0FDSDtBQUVELE9BQU8sU0FBUyxTQUFTLENBQUMsV0FBbUMsRUFBa0I7SUFDN0UsT0FBTyxlQUFnQixHQUFZLEVBQUUsR0FBZ0IsRUFBcUI7UUFDeEUsTUFBTSxFQUFFLFFBQVEsQ0FBQSxFQUFFLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxBQUFDO1FBRXRDLElBQUksYUFBYSxHQUFHLFdBQVcsQ0FBQyxRQUFRLENBQUMsQUFBQztRQUUxQyxJQUFJLENBQUMsYUFBYSxFQUFFO1lBQ2xCLHFCQUFxQjtZQUNyQixhQUFhLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNoRDtRQUVELElBQUksYUFBYSxFQUFFO1lBQ2pCLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFO2dCQUNsQyxhQUFhLEdBQUcsR0FBRyxHQUFHLGFBQWEsQ0FBQzthQUNyQztZQUVELE9BQU8sSUFBSSxRQUFRLENBQUMsSUFBSSxFQUFFO2dCQUN4QixNQUFNLEVBQUUsR0FBRztnQkFDWCxPQUFPLEVBQUU7b0JBQ1AsVUFBVSxFQUFFLGFBQWE7aUJBQzFCO2FBQ0YsQ0FBQyxDQUFDO1NBQ0o7UUFFRCxPQUFPLE1BQU0sR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO0tBQ3pCLENBQUM7Q0FDSCJ9