import blog from "https://deno.land/x/blog@0.3.3/blog.tsx";

blog({
  title: "The Advancements of Technology: Tech News, Parts, and Accessories",
  author: "Adam Ahmed",
  avatar: "./pfp.jpg",
  avatarClass: "full",
  links: [
    { title: "Email", url: "mailto:adam@readisten.com" },
    { title: "GitHub", url: "https://github.com/rocketspot" },
  ],
  background: "#fff"
});

if (typeof window !== 'undefined') {
 class SeoManager {
    setTitle(title: string) {
        document.title = title;
    }

    setMetaTag(name: string, content: string) {
        let headElements = document.getElementsByTagName('head')[0];
        let existingMetaTag = Array.from(headElements.getElementsByTagName('meta')).find(meta => meta.getAttribute('name') === name);
        
        if (existingMetaTag) {
            existingMetaTag.setAttribute('content', content);
        } else {
            let metaTag = document.createElement('meta');
            metaTag.setAttribute('name', name);
            metaTag.setAttribute('content', content);
            headElements.appendChild(metaTag);
        }
    }
}

let seoManager = new SeoManager();

seoManager.setMetaTag('keywords', 'technology news, tech trends, latest gadgets, tech innovations, tech blog');
seoManager.setMetaTag('canonical', 'https://adamstechblog.deno.dev');
seoManager.setMetaTag('og:title', 'Latest Tech News & Advancements - The Advancements of Technology: Adams Tech Blog');
seoManager.setMetaTag('og:description', 'Discover the latest trends and innovations in technology on our blog.');
seoManager.setMetaTag('og:image', 'https://adamstechblog.deno.dev/');
seoManager.setMetaTag('og:url', 'https://adamstechblog.deno.dev');
seoManager.setMetaTag('og:image', 'https://adamstechblog.deno.dev/posts/pfp.jpg');
seoManager.setMetaTag('og:url', 'https://adamstechblog.deno.dev');
seoManager.setMetaTag('og:type', 'website');
seoManager.setMetaTag('twitter:card', 'summary_large_image');
seoManager.setMetaTag('twitter:title', 'Latest Tech News & Advancements - The Advancements of Technology: Adams Tech Blog');
seoManager.setMetaTag('twitter:description', 'Explore the forefront of technology with our in-depth analysis and news.');
seoManager.setMetaTag('author', 'Adam Ahmed');   
}
