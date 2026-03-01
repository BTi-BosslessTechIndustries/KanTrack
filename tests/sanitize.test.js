/**
 * Unit tests for the sanitizeHTML allowlist-based HTML sanitizer.
 * Uses the jsdom environment so that DOMParser and DOM APIs are available.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { sanitizeHTML } from '../scripts/kantrack-modules/sanitize.js';

// ── No-op for safe / expected content ────────────────────────────────────────

describe('sanitizeHTML — safe content passes through', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeHTML('')).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeHTML(null)).toBe('');
    expect(sanitizeHTML(undefined)).toBe('');
  });

  it('preserves plain text', () => {
    const result = sanitizeHTML('Hello world');
    expect(result).toContain('Hello world');
  });

  it('preserves allowed formatting tags', () => {
    const html = '<b>bold</b> <i>italic</i> <u>under</u>';
    const result = sanitizeHTML(html);
    expect(result).toContain('<b>bold</b>');
    expect(result).toContain('<i>italic</i>');
    expect(result).toContain('<u>under</u>');
  });

  it('preserves <br> tags', () => {
    expect(sanitizeHTML('line1<br>line2')).toContain('<br>');
  });

  it('preserves <ul>/<li> lists', () => {
    const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    const result = sanitizeHTML(html);
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>Item 1</li>');
  });

  it('preserves <img> with blob: src', () => {
    const html = '<img src="blob:http://localhost/abc" alt="img">';
    expect(sanitizeHTML(html)).toContain('src="blob:');
  });

  it('preserves <img> with data:image/ src', () => {
    const html = '<img src="data:image/png;base64,abc" alt="img">';
    expect(sanitizeHTML(html)).toContain('src="data:image/');
  });

  it('preserves data-image-id attribute on <img>', () => {
    const html = '<img src="blob:x" data-image-id="img-123">';
    expect(sanitizeHTML(html)).toContain('data-image-id="img-123"');
  });

  it('preserves <a> with https href', () => {
    const html = '<a href="https://example.com">link</a>';
    expect(sanitizeHTML(html)).toContain('href="https://example.com"');
  });

  it('preserves <a> with http href', () => {
    const html = '<a href="http://example.com">link</a>';
    expect(sanitizeHTML(html)).toContain('href="http://example.com"');
  });

  it('preserves <a> with # fragment href', () => {
    const html = '<a href="#section">jump</a>';
    expect(sanitizeHTML(html)).toContain('href="#section"');
  });
});

// ── Event handlers are stripped ───────────────────────────────────────────────

describe('sanitizeHTML — event handlers stripped', () => {
  it('strips onclick', () => {
    const html = '<b onclick="alert(1)">text</b>';
    expect(sanitizeHTML(html)).not.toContain('onclick');
    expect(sanitizeHTML(html)).toContain('text');
  });

  it('strips onerror on img', () => {
    const html = '<img src="blob:x" onerror="alert(1)">';
    expect(sanitizeHTML(html)).not.toContain('onerror');
  });

  it('strips onload', () => {
    const html = '<div onload="alert(1)">content</div>';
    expect(sanitizeHTML(html)).not.toContain('onload');
    expect(sanitizeHTML(html)).toContain('content');
  });

  it('strips arbitrary on* attributes', () => {
    const html = '<p onmouseover="evil()" onfocus="evil()">text</p>';
    const result = sanitizeHTML(html);
    expect(result).not.toContain('onmouseover');
    expect(result).not.toContain('onfocus');
    expect(result).toContain('text');
  });
});

// ── Disallowed tags unwrapped ─────────────────────────────────────────────────

describe('sanitizeHTML — disallowed tags unwrapped', () => {
  it('strips <script> and keeps no content', () => {
    const html = '<script>alert(1)</script>';
    const result = sanitizeHTML(html);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
  });

  it('strips <iframe>', () => {
    const html = '<iframe src="evil.html"></iframe>';
    expect(sanitizeHTML(html)).not.toContain('iframe');
  });

  it('strips <object>', () => {
    expect(sanitizeHTML('<object data="evil"></object>')).not.toContain('object');
  });

  it('unwraps disallowed tag but keeps inner text', () => {
    const html = '<custom-el>keep this text</custom-el>';
    const result = sanitizeHTML(html);
    expect(result).not.toContain('custom-el');
    expect(result).toContain('keep this text');
  });
});

// ── Dangerous URL schemes ─────────────────────────────────────────────────────

describe('sanitizeHTML — dangerous URL schemes', () => {
  it('removes javascript: href from <a>', () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHTML(html);
    expect(result).not.toContain('javascript:');
    expect(result).toContain('click');
  });

  it('removes data:text/html src from <img>', () => {
    const html = '<img src="data:text/html,<script>evil()</script>">';
    expect(sanitizeHTML(html)).not.toContain('data:text/html');
  });

  it('removes vbscript: href from <a>', () => {
    const html = '<a href="vbscript:evil">click</a>';
    expect(sanitizeHTML(html)).not.toContain('vbscript:');
  });

  it('adds rel="noopener noreferrer" to <a> tags', () => {
    const html = '<a href="https://example.com">link</a>';
    expect(sanitizeHTML(html)).toContain('rel="noopener noreferrer"');
  });
});

// ── Nested / mixed content ────────────────────────────────────────────────────

describe('sanitizeHTML — nested content', () => {
  it('sanitizes nested event handlers inside allowed tags', () => {
    const html = '<ul><li onclick="evil()">item</li></ul>';
    const result = sanitizeHTML(html);
    expect(result).not.toContain('onclick');
    expect(result).toContain('<li>item</li>');
  });

  it('strips inner script inside allowed wrapper', () => {
    const html = '<div><script>evil()</script>safe text</div>';
    const result = sanitizeHTML(html);
    expect(result).not.toContain('script');
    expect(result).toContain('safe text');
  });

  it('handles deeply nested disallowed tags', () => {
    const html = '<b><em><bad-tag onclick="x()">text</bad-tag></em></b>';
    const result = sanitizeHTML(html);
    expect(result).not.toContain('bad-tag');
    expect(result).not.toContain('onclick');
    expect(result).toContain('text');
  });
});
