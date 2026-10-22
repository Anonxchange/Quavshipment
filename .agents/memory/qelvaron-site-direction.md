---
name: Qelvaron site direction
description: User's direction for adapting the supplied Webflow export as the Qelvaron site.
---

Use the supplied Webflow exports as the site's actual pages and preserve the theme's design and header treatment. Make only targeted brand and contact changes unless the user gives additional direction or screenshots.

The main navigation should contain Home, Services, About Us, Contact Us, How It Works, and Tracking. Keep links local to this site and remove the cart completely. The site should remain suitable for static deployment on Vercel.

Use the homepage header and footer as the shared chrome on every route. Keep Privacy Policy, Terms & Conditions, Blog, and Career in the footer rather than the primary navigation. Legal pages may adjust navigation text color for contrast on their light backgrounds, but should keep the same header structure and footer content.

**Why:** The user clarified that the Webflow export is a theme they are already building with and requested local links, six navigation items, cart removal, and Vercel support. They later asked for the homepage header/footer across every page and specified that Privacy Policy, Terms, Blog, and Career belong in the footer. The homepage is the chosen source, with a contrast adjustment because white links were faint on legal-page backgrounds.

**How to apply:** Continue adapting the exported HTML and stylesheet rather than replacing them with a new design. Keep shared chrome sourced from the homepage, retain the active navigation state per route, and use screenshots from the user to guide later asset replacements.
