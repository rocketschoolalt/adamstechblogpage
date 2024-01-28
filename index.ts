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

// Set the page title
seoManager.setTitle('Your Tech Blog Title');

// Set meta tags
seoManager.setMetaTag('description', 'Latest insights and news on technology and advancements. Stay up-to-date with tech trends and developments.');
seoManager.setMetaTag('keywords', 'technology, tech news, gadgets, innovations');
// Add other meta tags as necessary
