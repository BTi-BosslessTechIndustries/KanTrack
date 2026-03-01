/**
 * Allowlist-based HTML sanitizer for user-generated rich-text content.
 *
 * Applied before any stored HTML is written back to the live DOM so that
 * malicious payloads embedded in crafted import files cannot execute.
 *
 * Strategy:
 *  - Parse with DOMParser (never evaluates scripts in the parsed document)
 *  - Walk every element bottom-up (leaves first); remove elements not on the
 *    allowlist by unwrapping their text children in place.
 *  - Strip all on* event-handler attributes from every element.
 *  - Validate <a href> (http/https/# only) and <img src> (blob:/data:image/ only).
 */

const ALLOWED_TAGS = new Set([
  'b',
  'i',
  'u',
  'em',
  'strong',
  's',
  'strike',
  'sub',
  'sup',
  'br',
  'p',
  'div',
  'span',
  'font',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'img',
  'figure',
  'figcaption',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]);

// Per-tag allowed attributes (in addition to ALLOWED_GLOBAL_ATTRS)
const ALLOWED_ATTRS_BY_TAG = {
  img: ['src', 'alt', 'width', 'height', 'data-image-id'],
  a: ['href', 'target', 'rel'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  font: ['color', 'size', 'face'],
};

const ALLOWED_GLOBAL_ATTRS = new Set(['class', 'style', 'dir', 'lang']);

/**
 * Sanitize an HTML string using an allowlist of safe tags and attributes.
 *
 * @param {string} html - Raw HTML string (from stored note/notebook content)
 * @returns {string} Sanitized HTML safe to assign to element.innerHTML
 */
export function sanitizeHTML(html) {
  if (!html) return '';

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Process bottom-up (leaves first) so that when a disallowed element is
  // unwrapped, its already-sanitized children land safely in the parent.
  for (const el of Array.from(doc.body.querySelectorAll('*')).reverse()) {
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap: hoist children into parent, then remove the disallowed element
      while (el.firstChild) {
        el.parentNode.insertBefore(el.firstChild, el);
      }
      el.parentNode.removeChild(el);
      continue;
    }

    // Strip disallowed and event-handler attributes
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      const perTag = ALLOWED_ATTRS_BY_TAG[tag] || [];
      if (!ALLOWED_GLOBAL_ATTRS.has(name) && !perTag.includes(name)) {
        el.removeAttribute(attr.name);
      }
    }

    // Validate <a> href — allow http, https, and fragment (#) only
    if (tag === 'a') {
      const href = (el.getAttribute('href') || '').trim();
      if (href) {
        const lower = href.toLowerCase();
        if (
          !lower.startsWith('http://') &&
          !lower.startsWith('https://') &&
          !lower.startsWith('#')
        ) {
          el.removeAttribute('href');
        }
      }
      el.setAttribute('rel', 'noopener noreferrer');
    }

    // Validate <img> src — allow blob: and data:image/ only (our stored images)
    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      if (!src.startsWith('blob:') && !src.startsWith('data:image/')) {
        el.removeAttribute('src');
      }
    }
  }

  return doc.body.innerHTML;
}
