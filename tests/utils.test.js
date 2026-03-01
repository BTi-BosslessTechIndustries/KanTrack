import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getColumnName,
  getCurrentDate,
  escapeHtml,
  formatTime,
  deepClone,
  sanitizeFilename,
  validateTitle,
  debounce,
  throttle,
  MAX_TITLE_LENGTH,
} from '../scripts/kantrack-modules/utils.js';

// ─── getColumnName ────────────────────────────────────────────────────────────

describe('getColumnName', () => {
  it('returns "To Do" for "todo"', () => {
    expect(getColumnName('todo')).toBe('To Do');
  });
  it('returns "In Progress" for "inProgress"', () => {
    expect(getColumnName('inProgress')).toBe('In Progress');
  });
  it('returns "Done" for "done"', () => {
    expect(getColumnName('done')).toBe('Done');
  });
  it('returns "On Hold" for "onHold"', () => {
    expect(getColumnName('onHold')).toBe('On Hold');
  });
  it('returns empty string for unknown column id', () => {
    expect(getColumnName('unknown')).toBe('');
  });
  it('returns empty string for empty string', () => {
    expect(getColumnName('')).toBe('');
  });
});

// ─── getCurrentDate ───────────────────────────────────────────────────────────

describe('getCurrentDate', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    expect(getCurrentDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("returns today's local date", () => {
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(getCurrentDate()).toBe(expected);
  });
});

// ─── escapeHtml ───────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes &', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });
  it('escapes <', () => {
    expect(escapeHtml('a<b')).toBe('a&lt;b');
  });
  it('escapes >', () => {
    expect(escapeHtml('a>b')).toBe('a&gt;b');
  });
  it('escapes "', () => {
    expect(escapeHtml('a"b')).toBe('a&quot;b');
  });
  it("escapes '", () => {
    expect(escapeHtml("a'b")).toBe('a&#039;b');
  });
  it('escapes all special chars in a single string', () => {
    expect(escapeHtml('<div class="x">\'a\' & b</div>')).toBe(
      '&lt;div class=&quot;x&quot;&gt;&#039;a&#039; &amp; b&lt;/div&gt;'
    );
  });
  it('leaves plain strings unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

// ─── formatTime ───────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('formats 0 minutes as "0m"', () => {
    expect(formatTime(0)).toBe('0m');
  });
  it('formats 1 minute as "1m"', () => {
    expect(formatTime(1)).toBe('1m');
  });
  it('formats 59 minutes as "59m"', () => {
    expect(formatTime(59)).toBe('59m');
  });
  it('formats exactly 60 minutes as "1h"', () => {
    expect(formatTime(60)).toBe('1h');
  });
  it('formats 61 minutes as "1h 1m"', () => {
    expect(formatTime(61)).toBe('1h 1m');
  });
  it('formats 90 minutes as "1h 30m"', () => {
    expect(formatTime(90)).toBe('1h 30m');
  });
  it('formats 120 minutes as "2h"', () => {
    expect(formatTime(120)).toBe('2h');
  });
  it('formats 125 minutes as "2h 5m"', () => {
    expect(formatTime(125)).toBe('2h 5m');
  });
});

// ─── deepClone ────────────────────────────────────────────────────────────────

describe('deepClone', () => {
  it('returns null unchanged', () => {
    expect(deepClone(null)).toBe(null);
  });
  it('returns numbers unchanged', () => {
    expect(deepClone(42)).toBe(42);
  });
  it('returns strings unchanged', () => {
    expect(deepClone('hello')).toBe('hello');
  });
  it('returns a different reference for objects', () => {
    const obj = { a: 1 };
    const clone = deepClone(obj);
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
  });
  it('deep clones nested objects — mutating clone does not affect original', () => {
    const obj = { a: { b: { c: 3 } } };
    const clone = deepClone(obj);
    clone.a.b.c = 99;
    expect(obj.a.b.c).toBe(3);
  });
  it('clones arrays of objects correctly', () => {
    const arr = [{ id: 1 }, { id: 2 }];
    const clone = deepClone(arr);
    clone[0].id = 99;
    expect(arr[0].id).toBe(1);
  });
  it('clones an empty object', () => {
    expect(deepClone({})).toEqual({});
  });
  it('clones an empty array', () => {
    expect(deepClone([])).toEqual([]);
  });
});

// ─── sanitizeFilename ─────────────────────────────────────────────────────────

describe('sanitizeFilename', () => {
  it('replaces < and > with dashes', () => {
    expect(sanitizeFilename('file<name>')).toBe('file-name-');
  });
  it('replaces forward and back slashes', () => {
    expect(sanitizeFilename('path/to\\file')).toBe('path-to-file');
  });
  it('replaces colon with dash', () => {
    expect(sanitizeFilename('my:file')).toBe('my-file');
  });
  it('replaces double-quote with dash', () => {
    expect(sanitizeFilename('my"file')).toBe('my-file');
  });
  it('replaces spaces with underscores', () => {
    expect(sanitizeFilename('my file name')).toBe('my_file_name');
  });
  it('collapses multiple spaces into one underscore', () => {
    expect(sanitizeFilename('a  b')).toBe('a_b');
  });
  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('');
  });
  it('truncates to 100 characters', () => {
    const long = 'a'.repeat(150);
    expect(sanitizeFilename(long).length).toBe(100);
  });
  it('leaves a clean filename unchanged', () => {
    expect(sanitizeFilename('my-task_2024.pdf')).toBe('my-task_2024.pdf');
  });
});

// ─── validateTitle ────────────────────────────────────────────────────────────

describe('validateTitle', () => {
  it('returns the title as-is when within limit', () => {
    expect(validateTitle('My Task')).toBe('My Task');
  });
  it('trims leading and trailing whitespace', () => {
    expect(validateTitle('  hello  ')).toBe('hello');
  });
  it('truncates titles exceeding MAX_TITLE_LENGTH', () => {
    const long = 'a'.repeat(MAX_TITLE_LENGTH + 10);
    expect(validateTitle(long).length).toBe(MAX_TITLE_LENGTH);
  });
  it('returns empty string for empty input', () => {
    expect(validateTitle('')).toBe('');
  });
  it('returns empty string for whitespace-only input', () => {
    expect(validateTitle('   ')).toBe('');
  });
  it('returns empty string for null', () => {
    expect(validateTitle(null)).toBe('');
  });
  it('returns empty string for undefined', () => {
    expect(validateTitle(undefined)).toBe('');
  });
});

// ─── debounce ─────────────────────────────────────────────────────────────────

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not call the function immediately', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls the function once after the wait period', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls only once for rapid successive invocations', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets the timer when called again before wait expires', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(50);
    debounced(); // reset
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled(); // still waiting
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes arguments through to the wrapped function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a', 42);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('a', 42);
  });
});

// ─── throttle ─────────────────────────────────────────────────────────────────

describe('throttle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls the function immediately on first invocation', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('suppresses subsequent calls within the throttle window', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows another call after the throttle window expires', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled();
    vi.advanceTimersByTime(100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('passes arguments through to the wrapped function', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled('hello');
    expect(fn).toHaveBeenCalledWith('hello');
  });
});
