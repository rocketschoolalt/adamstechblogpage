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

// Defining the SeoTagsManager class
class SeoTagsManager {
    /**
     * Sets or updates a meta tag in the document head.
     * @param name The name of the meta tag.
     * @param content The content of the meta tag.
     */
    setMetaTag(name: string, content: string) {
        let meta = document.querySelector(`meta[name="${name}"]`);
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', name);
            document.getElementsByTagName('head')[0].appendChild(meta);
        }
        meta.setAttribute('content', content);
    }

    /**
     * Sets the title of the document.
     * @param title The title text.
     */
    setTitle(title: string) {
        document.title = title;
    }

    // You can add more methods here for other SEO-related functionalities
}

// Using the SeoTagsManager class

// Create an instance of the SeoTagsManager
const seoManager = new SeoTagsManager();

// Set the page title
seoManager.setTitle('Latest Tech News & Advancements - The Advancements of Technology: Adams Tech Blog');

// Set meta tags
seoManager.setMetaTag('description', 'Stay ahead of the curve with cutting-edge tech news and insights. Explore in-depth articles, latest trends, and groundbreaking advancements in technology. Your go-to source for all things tech!');
// Add more tags as needed

seoManager.setMetaTag('keywords', 'technology news, tech trends, latest gadgets, tech innovations, tech blog');
seoManager.setMetaTag('canonical', 'https://www.adamstechblog.deno.dev');
seoManager.setMetaTag('og:title', 'Latest Tech News & Advancements - The Advancements of Technology: Adams Tech Blog');
seoManager.setMetaTag('og:description', 'Discover the latest trends and innovations in technology on our blog.');
seoManager.setMetaTag('og:image', 'https://www.adamstechblog.deno.dev/');
seoManager.setMetaTag('og:url', 'https://www.yourtechblog.com');
seoManager.setMetaTag('og:type', 'website');
