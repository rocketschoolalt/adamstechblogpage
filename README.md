# Minimal Blog Template

Minimal boilerplate blogging. All you need is one boilerplate JavaScript file that has 2 lines of code:

```javascript
import blog from "https://deno.land/x/blog/blog.tsx";

blog();
```

## Getting started
To initialize your own blog you can run following script:

```shell
$ deno run -r --allow-read --allow-write https://deno.land/x/blog/init.ts ./directory/for/blog/
```

This command will setup a blog with a "Hello world" post so you can start writing right away.

Start local server with live reload:

```shell
$ deno task dev
```

To ensure the best development experience, make sure to follow Set up your environment from the Deno Manual.

## Configuration
You can customize your blog as follows:

```javascript
import blog, { ga, redirects } from "https://deno.land/x/blog/blog.tsx";
import { unocss_opts } from "./unocss.ts";

blog({
  author: "Dino",
  title: "My Blog",
  description: "The blog description.",
  avatar: "avatar.png",
  avatarClass: "rounded-full",
  links: [
    { title: "Email", url: "mailto:bot@deno.com" },
    { title: "GitHub", url: "https://github.com/denobot" },
    { title: "Twitter", url: "https://twitter.com/denobot" },
  ],
  lang: "en",
  dateStyle: "long", // localised format based on https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
  middlewares: [
    ga("UA-XXXXXXXX-X"),
    redirects({
      "/foo": "/my_post",
      // you can skip leading slashes too
      "bar": "my_post2",
    }),
  ],
  unocss: unocss_opts, // check https://github.com/unocss/unocss
  favicon: "favicon.ico",
});
```

## Customize the header and footer
By default, we render the header and footer with builtin template using the blog settings. You can customize them as follows:

```javascript
/** @jsx h */

import blog, { h } from "https://deno.land/x/blog/blog.tsx";

blog({
  title: "My Blog",
  header: <header>Your custom header</header>,
  showHeaderOnPostPage: true, // by default, the header will only show on home, set showHeaderOnPostPage to true to make it show on each post page
  section: <section>Your custom section</section>,
  footer: <footer>Your custom footer</footer>,
});
```

Beware to use .tsx extension to this extent.

[Learn more here.](https://github.com/denoland/deno_blog)