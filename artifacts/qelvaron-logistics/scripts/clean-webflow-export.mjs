import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(import.meta.dirname, '..');
const pagePaths = [
  'index.html',
  'public/about/index.html',
  'public/services/index.html',
  'public/contact/index.html',
  'public/how-it-works/index.html',
  'public/blog/index.html',
  'public/career/index.html',
];
const appScript = '<script src="/qelvaron-pages.js" defer></script>';
const localStylesheets = [
  '<link href="/assets/qelvaron-webflow.css" rel="stylesheet">',
  '<link href="/assets/qelvaron-nav-overrides.css" rel="stylesheet">',
  '<link href="/assets/qelvaron-content-overrides.css" rel="stylesheet">',
];
const contentOverrides = '<link href="/assets/qelvaron-content-overrides.css" rel="stylesheet">';
const homeHtml = readFileSync(resolve(appRoot, 'index.html'), 'utf8');
const homeFavicons =
  homeHtml.match(
    /<link\b(?=[^>]*\brel=["'](?:icon|apple-touch-icon)["'])[^>]*>/gi,
  ) ?? [];

if (homeFavicons.length === 0) {
  throw new Error('Could not find the homepage favicon links.');
}

const navigationItems = [
  { href: '/', label: 'Home', page: 'home' },
  { href: '/services/', label: 'Services', page: 'services' },
  { href: '/about/', label: 'About Us', page: 'about' },
  { href: '/contact/', label: 'Contact Us', page: 'contact' },
  { href: '/how-it-works/', label: 'How It Works', page: 'how-it-works' },
  { href: '/blog/', label: 'Blog', page: 'blog' },
  { href: '/career/', label: 'Career', page: 'career' },
  { href: '/#tracking', label: 'Tracking', page: 'tracking' },
];

function removeInjectedChallenge(html, pagePath) {
  let cleaned = html;
  let removed = 0;
  const widgetTag =
    /<div\b(?=[^>]*\bid="cf-chl-widget-[^"]+")[^>]*>/i;

  while (widgetTag.test(cleaned)) {
    const widget = widgetTag.exec(cleaned);
    const widgetStart = widget.index;
    const widgetEnd = widgetStart + widget[0].length;
    const previousMarkup = cleaned.slice(0, widgetStart);
    const wrapperPrefix = /(?:<div>\s*)+$/i.exec(previousMarkup);
    const wrapperCount = wrapperPrefix
      ? (wrapperPrefix[0].match(/<div>/gi) ?? []).length
      : 0;
    const blockStart = wrapperPrefix
      ? widgetStart - wrapperPrefix[0].length
      : widgetStart;

    const innerDocumentEnd = cleaned.indexOf('</body></html>', widgetEnd);
    if (innerDocumentEnd < 0) {
      throw new Error(`Could not find the end of a challenge block in ${pagePath}`);
    }

    let blockEnd = innerDocumentEnd + '</body></html>'.length;
    for (let index = 0; index <= wrapperCount; index++) {
      const closingWrapper = /^\s*<\/div\s*>/i.exec(cleaned.slice(blockEnd));
      if (!closingWrapper) {
        throw new Error(`Could not close a challenge block in ${pagePath}`);
      }
      blockEnd += closingWrapper[0].length;
    }

    cleaned = cleaned.slice(0, blockStart) + cleaned.slice(blockEnd);
    removed += 1;
  }

  return { html: cleaned, removed };
}

function removeCommerceCart(html, pagePath) {
  const cartWrapper =
    /<div\b(?=[^>]*\bdata-node-type=["']commerce-cart-wrapper["'])[^>]*>/i.exec(
      html,
    );
  if (!cartWrapper) return { html, removed: false };

  const tagPattern =
    /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = cartWrapper.index;
  let depth = 0;
  let end = -1;

  for (let match; (match = tagPattern.exec(html)); ) {
    const tag = match[0];
    if (tag.startsWith('<!--') || /^<(?:script|style)\b/i.test(tag)) continue;
    if (/^<\/div\b/i.test(tag)) {
      depth -= 1;
    } else if (!/\/\s*>$/.test(tag)) {
      depth += 1;
    }
    if (depth === 0) {
      end = tagPattern.lastIndex;
      break;
    }
  }

  if (end === -1) {
    throw new Error(`Could not find the end of the commerce cart in ${pagePath}`);
  }

  return {
    html: html.slice(0, cartWrapper.index) + html.slice(end),
    removed: true,
  };
}

function stripInjectedScripts(html) {
  return html
    .replace(
      /<script\b(?=[^>]*\bsrc=["'][^"']*validation-worker\.createsomething\.workers\.dev\/app-validator\/snippet\/review\.js[^"']*["'])[^>]*>[\s\S]*?<\/script>/gi,
      '',
    )
    .replace(
      /<script\b(?=[^>]*\bsrc=["']https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js[^"']*["'])[^>]*>[\s\S]*?<\/script>/gi,
      '',
    )
    .replace(
      /<script\b[^>]*>[\s\S]*?__WEBFLOW_CURRENCY_SETTINGS[\s\S]*?<\/script>/gi,
      '',
    )
    .replace(/<script\b[^>]*>[\s\S]*?__WF_REVIEW_BRIDGE[\s\S]*?<\/script>/gi, '');
}

function normalizeBrand(html) {
  const brandLink = /<a\b(?=[^>]*\bclass=["'][^"']*\bbrand-link\b[^"']*["'])[^>]*>[\s\S]*?<\/a>/i.exec(
    html,
  );
  if (!brandLink) return html;

  const openingTag = /^<a\b[^>]*>/i.exec(brandLink[0])?.[0];
  if (!openingTag) return html;
  const localOpeningTag = openingTag.replace(
    /\bhref=(["'])[^"']*\1/i,
    'href="/"',
  );
  const logoClasses = [
    ...brandLink[0].matchAll(
      /<img\b[^>]*\bclass=["']([^"']*\bbrand-logo\b[^"']*)["'][^>]*>/gi,
    ),
  ].map((match) => match[1]);
  const lightClass = logoClasses[0] ?? 'brand-logo base';
  const darkClass = logoClasses[1] ?? 'brand-logo secondary';
  const replacement = `${localOpeningTag}<img loading="lazy" src="/qelvaron-logo-light.svg" alt="Qelvaron Global Logistics logo." class="${lightClass}"><img loading="lazy" src="/qelvaron-logo-dark.svg" alt="Qelvaron Global Logistics logo." class="${darkClass}"></a>`;

  return html.replace(brandLink[0], replacement);
}

function normalizeNavigation(html, pagePath) {
  const nav = /<nav\b(?=[^>]*\bclass=["'][^"']*\bnav-menu\b[^"']*["'])[^>]*>[\s\S]*?<\/nav>/i.exec(
    html,
  );
  if (!nav) {
    throw new Error(`Could not find the main navigation in ${pagePath}`);
  }

  const openingTag = /^<nav\b[^>]*>/i.exec(nav[0])?.[0];
  const linkClass =
    /<a\b[^>]*\bclass=["']([^"']*\bnav-link\b[^"']*)["'][^>]*>/i.exec(
      nav[0],
    )?.[1] ?? 'nav-link';
  const slashClass =
    /<div\b[^>]*\bclass=["']([^"']*\bnav-slash\b[^"']*)["'][^>]*>/i.exec(
      nav[0],
    )?.[1] ?? 'nav-slash';
  if (!openingTag) {
    throw new Error(`Could not read the main navigation in ${pagePath}`);
  }

  const currentPage =
    pagePath === 'index.html' ? 'home' : pagePath.split('/')[1] ?? '';
  const links = navigationItems
    .map(({ href, label, page }, index) => {
      const current = page === currentPage ? ' aria-current="page"' : '';
      const link = `<a nav-link="" href="${href}" class="${linkClass}" aria-label="${label}"${current}><span class="gsap_split_word gsap_split_word1" aria-hidden="true">${label}</span></a>`;
      const slash =
        index < navigationItems.length - 1
          ? `<div class="${slashClass}">/</div>`
          : '';
      return link + slash;
    })
    .join('');

  return html.replace(nav[0], `${openingTag}${links}</nav>`);
}

function localizeThemeLinks(html) {
  const routeMap = new Map([
    ['about', '/about/'],
    ['services', '/services/'],
    ['contact', '/contact/'],
    ['how-it-works', '/how-it-works/'],
    ['blog', '/blog/'],
    ['career', '/career/'],
    ['tracking', '/#tracking'],
  ]);

  return html.replace(
    /(\bhref\s*=\s*)(["'])https?:\/\/carrgoflow\.webflow\.io([^"']*)\2/gi,
    (_match, attribute, quote, remainder) => {
      const url = new URL(remainder || '/', 'https://carrgoflow.webflow.io');
      const segments = url.pathname.split('/').filter(Boolean);
      const first = segments[0] ?? '';
      let localPath = '/';

      if (first === 'tracking' || url.hash.toLowerCase() === '#tracking') {
        localPath = '/#tracking';
      } else if (routeMap.has(first)) {
        localPath = routeMap.get(first);
      } else if (!first) {
        localPath = '/';
      }

      if (url.hash && localPath !== '/#tracking') {
        localPath += url.hash;
      }

      return `${attribute}${quote}${localPath}${quote}`;
    },
  );
}

function updatePageTitle(html, pagePath) {
  const title =
    pagePath === 'public/blog/index.html'
      ? 'Blog | Qelvaron Global Logistics'
      : pagePath === 'public/career/index.html'
        ? 'Career | Qelvaron Global Logistics'
        : null;
  if (!title) return html;

  const updatedTitle = html.replace(
    /<title\b[^>]*>[\s\S]*?<\/title>/i,
    `<title>${title}</title>`,
  );
  return updatedTitle.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (!/\b(?:property|name)=["'](?:og:title|twitter:title)["']/i.test(tag)) {
      return tag;
    }
    return tag.replace(/\bcontent=(["'])[^"']*\1/i, `content="${title}"`);
  });
}

function removeThemeStylesheets(html) {
  let cleaned = html.replace(
    /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']https:\/\/cdn\.prod\.website-files\.com\/[^"']+\.css(?:\?[^"']*)?["'])[^>]*>\s*/gi,
    '',
  );
  for (const stylesheet of localStylesheets) {
    const href = /href=["']([^"']+)["']/i.exec(stylesheet)?.[1];
    if (!href) continue;
    const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(
      new RegExp(
        `<link\\b(?=[^>]*\\bhref=["']${escapedHref}["'])[^>]*>\\s*`,
        'gi',
      ),
      '',
    );
  }
  return cleaned;
}

for (const pagePath of pagePaths) {
  const filePath = resolve(appRoot, pagePath);
  const original = readFileSync(filePath, 'utf8');
  const { html: withoutCart, removed: cartRemoved } = removeCommerceCart(
    original,
    pagePath,
  );
  const { html: withoutChallenge, removed } = removeInjectedChallenge(
    withoutCart,
    pagePath,
  );
  let normalized = stripInjectedScripts(withoutChallenge)
    .replaceAll(appScript, '')
    .replace(/\bdata-wf-domain=(["'])[^"']*\1/i, 'data-wf-domain=""')
    .replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi, '')
    .replace(
      /<meta\b(?=[^>]*\bproperty=["']og:url["'])[^>]*>/gi,
      '',
    );
  normalized = updatePageTitle(normalized, pagePath);
  normalized = normalizeBrand(normalized);
  normalized = normalizeNavigation(normalized, pagePath);
  normalized = localizeThemeLinks(normalized)
    .replace(/https?:\/\/carrgoflow\.webflow\.io/gi, '')
    .replace(/CarrgoFlow/gi, 'Qelvaron')
    .replace(/Cargoflow/gi, 'Qelvaron')
    .replace(/\bGoflow\b/gi, 'Qelvaron')
    .replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi, '');
  normalized = removeThemeStylesheets(normalized);
  const withoutOldFavicons = normalized.replace(
    /<link\b(?=[^>]*\brel=["'](?:icon|apple-touch-icon)["'])[^>]*>/gi,
    '',
  );
  const withoutOldOverrides = withoutOldFavicons.replaceAll(
    contentOverrides,
    '',
  );
  const closingHead = withoutOldOverrides.indexOf('</head>');
  const closingBody = withoutOldOverrides.lastIndexOf('</body>');
  if (closingHead < 0) {
    throw new Error(`Could not find the end of the page head in ${pagePath}`);
  }
  if (closingBody < 0) {
    throw new Error(`Could not find the end of the page body in ${pagePath}`);
  }

  const normalizedHead =
    withoutOldOverrides.slice(0, closingHead) +
    homeFavicons.join('') +
    localStylesheets.join('') +
    withoutOldOverrides.slice(closingHead);
  const normalizedPage =
    normalizedHead.slice(0, normalizedHead.lastIndexOf('</body>')) +
    appScript +
    normalizedHead.slice(normalizedHead.lastIndexOf('</body>'));
  if (normalizedPage !== original) {
    writeFileSync(filePath, normalizedPage);
  }
  if (cartRemoved) {
    console.log(`Removed commerce cart from ${pagePath}.`);
  }
  if (removed > 0) {
    console.info(`Removed ${removed} injected challenge block(s) from ${pagePath}.`);
  }
}
