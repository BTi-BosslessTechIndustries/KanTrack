/**
 * Tests for notifications.js.
 *
 * Pure functions (checkStorageQuota, getStorageBreakdown) use only the
 * localStorage stub from setup.js and need no DOM.
 *
 * showNotification and its convenience wrappers create DOM nodes, so those
 * tests use a real JSDOM environment.
 */
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import {
  checkStorageQuota,
  getStorageBreakdown,
  showNotification,
  showSuccess,
  showError,
  showWarning,
  showInfo,
} from '../scripts/kantrack-modules/notifications.js';

// ── checkStorageQuota ────────────────────────────────────────────────────────

describe('checkStorageQuota', () => {
  beforeEach(() => resetLocalStorage());

  it('returns 0 bytes and 0 percentage when localStorage is empty', () => {
    const result = checkStorageQuota();
    expect(result.usedBytes).toBe(0);
    expect(result.usedMB).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it('always returns limitMB of 5', () => {
    expect(checkStorageQuota().limitMB).toBe(5);
  });

  it('counts stored KanTrack key sizes (UTF-16: 2 bytes per char)', () => {
    localStorage.setItem('kanbanNotes', 'x'.repeat(1000));
    const result = checkStorageQuota();
    expect(result.usedBytes).toBe(1000 * 2);
  });

  it('accumulates multiple KanTrack keys', () => {
    localStorage.setItem('kanbanNotes', 'a'.repeat(500));
    localStorage.setItem('permanentNotes', 'b'.repeat(300));
    const result = checkStorageQuota();
    expect(result.usedBytes).toBe((500 + 300) * 2);
  });

  it('ignores keys not in the KanTrack whitelist', () => {
    localStorage.setItem('kanbanNotes', 'x'.repeat(100));
    const baseline = checkStorageQuota().usedBytes;
    localStorage.setItem('some-other-app-key', 'y'.repeat(10000));
    const after = checkStorageQuota().usedBytes;
    expect(after).toBe(baseline);
  });

  it('percentage is proportional to usage against a 5 MB limit', () => {
    const limitBytes = 5 * 1024 * 1024;
    const halfMBChars = Math.round((limitBytes * 0.1) / 2); // 10% usage
    localStorage.setItem('kanbanNotes', 'x'.repeat(halfMBChars));
    const result = checkStorageQuota();
    expect(result.percentage).toBeCloseTo(10, 0);
  });
});

// ── getStorageBreakdown ──────────────────────────────────────────────────────

describe('getStorageBreakdown', () => {
  beforeEach(() => resetLocalStorage());

  it('returns an object with a _total key', () => {
    expect(getStorageBreakdown()).toHaveProperty('_total');
  });

  it('_total.bytes is 0 when localStorage is empty', () => {
    expect(getStorageBreakdown()._total.bytes).toBe(0);
  });

  it('includes an entry for each non-empty KanTrack key', () => {
    localStorage.setItem('kanbanNotes', 'a'.repeat(100));
    const breakdown = getStorageBreakdown();
    expect(breakdown).toHaveProperty('kanbanNotes');
    expect(breakdown.kanbanNotes.bytes).toBe(100 * 2);
    expect(typeof breakdown.kanbanNotes.kb).toBe('string');
    expect(typeof breakdown.kanbanNotes.mb).toBe('string');
  });

  it('omits keys that have no stored value', () => {
    const breakdown = getStorageBreakdown();
    const dataKeys = Object.keys(breakdown).filter(k => k !== '_total');
    expect(dataKeys).toHaveLength(0);
  });

  it('_total.bytes equals the sum of all individual key bytes', () => {
    localStorage.setItem('kanbanNotes', 'a'.repeat(200));
    localStorage.setItem('permanentNotes', 'b'.repeat(300));
    const breakdown = getStorageBreakdown();
    const summed = Object.entries(breakdown)
      .filter(([k]) => k !== '_total')
      .reduce((acc, [, v]) => acc + v.bytes, 0);
    expect(breakdown._total.bytes).toBe(summed);
  });
});

// ── showNotification and convenience wrappers (DOM) ──────────────────────────

describe('showNotification (DOM)', () => {
  let jsdomDoc;

  beforeAll(() => {
    const { window } = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    jsdomDoc = window.document;
    vi.stubGlobal('document', jsdomDoc);
    vi.stubGlobal('requestAnimationFrame', cb => cb());
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    const container = jsdomDoc.getElementById('notificationContainer');
    if (container) container.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a DIV element', () => {
    const el = showNotification('hello');
    expect(el.tagName).toBe('DIV');
  });

  it('contains the message text', () => {
    const el = showNotification('Test message');
    expect(el.textContent).toContain('Test message');
  });

  it('HTML-escapes the message so no raw script tags appear in innerHTML', () => {
    const el = showNotification('<script>evil()</script>');
    expect(el.innerHTML).not.toContain('<script>');
    expect(el.textContent).toContain('<script>evil()</script>');
  });

  it('adds notification-success class for type "success"', () => {
    expect(showNotification('ok', 'success').classList.contains('notification-success')).toBe(true);
  });

  it('adds notification-error class for type "error"', () => {
    expect(showNotification('err', 'error').classList.contains('notification-error')).toBe(true);
  });

  it('adds notification-warning class for type "warning"', () => {
    expect(showNotification('warn', 'warning').classList.contains('notification-warning')).toBe(
      true
    );
  });

  it('defaults to notification-info when type is unrecognised', () => {
    expect(showNotification('note', 'bogus').classList.contains('notification-info')).toBe(true);
  });

  it('notification is inside document.body after creation', () => {
    const el = showNotification('visible');
    expect(jsdomDoc.body.contains(el)).toBe(true);
  });

  it('auto-dismisses and removes element from DOM after duration + animation delay', () => {
    const el = showNotification('temp', 'info', 1000);
    expect(jsdomDoc.body.contains(el)).toBe(true);
    vi.advanceTimersByTime(1000 + 350);
    expect(jsdomDoc.body.contains(el)).toBe(false);
  });

  it('does NOT auto-dismiss when duration is 0', () => {
    const el = showNotification('permanent', 'info', 0);
    vi.advanceTimersByTime(60000);
    expect(jsdomDoc.body.contains(el)).toBe(true);
  });

  it('showSuccess produces a success-typed notification', () => {
    expect(showSuccess('good').classList.contains('notification-success')).toBe(true);
  });

  it('showError produces an error-typed notification', () => {
    expect(showError('bad').classList.contains('notification-error')).toBe(true);
  });

  it('showWarning produces a warning-typed notification', () => {
    expect(showWarning('caution').classList.contains('notification-warning')).toBe(true);
  });

  it('showInfo produces an info-typed notification', () => {
    expect(showInfo('fyi').classList.contains('notification-info')).toBe(true);
  });
});
