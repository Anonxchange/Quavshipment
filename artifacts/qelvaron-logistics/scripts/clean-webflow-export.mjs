import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(import.meta.dirname, '..');
const pagePaths = [
  'index.html',
  'public/about/index.html',
  'public/services/index.html',
  'public/contact/index.html',
  'public/how-it-works/index.html',
];
const appScript = '<script src="/qelvaron-pages.js" defer></script>';

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

for (const pagePath of pagePaths) {
  const filePath = resolve(appRoot, pagePath);
  const original = readFileSync(filePath, 'utf8');
  const { html: withoutChallenge, removed } = removeInjectedChallenge(
    original,
    pagePath,
  );
  const withoutOldScript = withoutChallenge.replaceAll(appScript, '');
  const closingBody = withoutOldScript.lastIndexOf('</body>');
  if (closingBody < 0) {
    throw new Error(`Could not find the end of the page body in ${pagePath}`);
  }

  const normalized =
    withoutOldScript.slice(0, closingBody) +
    appScript +
    withoutOldScript.slice(closingBody);
  if (normalized !== original) {
    writeFileSync(filePath, normalized);
  }
  if (removed > 0) {
    console.info(`Removed ${removed} injected challenge block(s) from ${pagePath}.`);
  }
}
