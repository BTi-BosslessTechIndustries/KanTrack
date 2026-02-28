// due-dates.js imports state, storage, utils, and undo.
// We mock those so we can test the three pure functions in isolation:
//   formatDueDate, formatRelativeDueDate, sortByDueDate.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../scripts/kantrack-modules/state.js', () => ({ notesData: [] }));
vi.mock('../scripts/kantrack-modules/storage.js', () => ({
  saveNotesToLocalStorage: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/utils.js', () => ({
  escapeHtml: str => String(str),
  deepClone: obj => JSON.parse(JSON.stringify(obj)),
}));
vi.mock('../scripts/kantrack-modules/undo.js', () => ({
  recordAction: vi.fn(),
}));

import {
  formatDueDate,
  formatRelativeDueDate,
  sortByDueDate,
} from '../scripts/kantrack-modules/due-dates.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Format a Date as a local YYYY-MM-DD string (matching getCurrentDate logic). */
function toLocalDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Return a local date offset by `days` from a base date. */
function offsetDate(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// ─── formatDueDate ────────────────────────────────────────────────────────────

describe('formatDueDate', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns empty string for null', () => {
    expect(formatDueDate(null)).toBe('');
  });
  it('returns empty string for undefined', () => {
    expect(formatDueDate(undefined)).toBe('');
  });
  it('returns empty string for empty string', () => {
    expect(formatDueDate('')).toBe('');
  });

  it('returns "Today" when the date string matches today', () => {
    // Set system time to noon UTC to avoid day-boundary timezone issues
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const today = new Date();
    expect(formatDueDate(toLocalDateStr(today))).toBe('Today');
  });

  it('returns "Tomorrow" when the date string is one day ahead', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const today = new Date();
    const tomorrow = offsetDate(today, 1);
    expect(formatDueDate(toLocalDateStr(tomorrow))).toBe('Tomorrow');
  });

  it('returns a non-empty string for a past date', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    expect(formatDueDate('2024-01-10')).toBeTruthy();
  });

  it('returns a non-empty string for a future date (not today or tomorrow)', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    expect(formatDueDate('2024-12-25')).toBeTruthy();
  });

  it('includes the year for dates in a different year', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const result = formatDueDate('2020-03-15');
    expect(result).toMatch(/2020/);
  });
});

// ─── formatRelativeDueDate ────────────────────────────────────────────────────

describe('formatRelativeDueDate', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns empty string for null', () => {
    expect(formatRelativeDueDate(null)).toBe('');
  });
  it('returns empty string for empty string', () => {
    expect(formatRelativeDueDate('')).toBe('');
  });

  it('returns "Today" for today\'s date', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const today = new Date();
    expect(formatRelativeDueDate(toLocalDateStr(today))).toBe('Today');
  });

  it('returns "Tomorrow" for tomorrow\'s date', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const today = new Date();
    const tomorrow = offsetDate(today, 1);
    expect(formatRelativeDueDate(toLocalDateStr(tomorrow))).toBe('Tomorrow');
  });

  it('returns "Yesterday" for yesterday\'s date', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const today = new Date();
    const yesterday = offsetDate(today, -1);
    expect(formatRelativeDueDate(toLocalDateStr(yesterday))).toBe('Yesterday');
  });

  it('returns "in N days" for a future date more than 1 day away', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const today = new Date();
    const future = offsetDate(today, 5);
    expect(formatRelativeDueDate(toLocalDateStr(future))).toBe('in 5 days');
  });

  it('returns "N days ago" for a past date more than 1 day away', () => {
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'));
    const today = new Date();
    const past = offsetDate(today, -3);
    expect(formatRelativeDueDate(toLocalDateStr(past))).toBe('3 days ago');
  });
});

// ─── sortByDueDate ────────────────────────────────────────────────────────────

const task = (id, dueDate) => ({ id, dueDate });

describe('sortByDueDate', () => {
  it('returns an empty array for empty input', () => {
    expect(sortByDueDate([])).toEqual([]);
  });

  it('returns a single-item array unchanged', () => {
    const tasks = [task('a', '2024-06-10')];
    expect(sortByDueDate(tasks)).toEqual(tasks);
  });

  it('does not mutate the original array', () => {
    const tasks = [task('b', '2024-06-20'), task('a', '2024-06-10')];
    const original = [...tasks];
    sortByDueDate(tasks);
    expect(tasks).toEqual(original);
  });

  it('sorts ascending: earlier dates first', () => {
    const tasks = [task('c', '2024-06-20'), task('a', '2024-06-10'), task('b', '2024-06-15')];
    const sorted = sortByDueDate(tasks, true);
    expect(sorted.map(t => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts descending: later dates first', () => {
    const tasks = [task('a', '2024-06-10'), task('c', '2024-06-20'), task('b', '2024-06-15')];
    const sorted = sortByDueDate(tasks, false);
    expect(sorted.map(t => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('ascending: tasks without a due date go to the end', () => {
    const tasks = [task('no-date', null), task('early', '2024-06-10'), task('late', '2024-06-20')];
    const sorted = sortByDueDate(tasks, true);
    expect(sorted[sorted.length - 1].id).toBe('no-date');
  });

  it('descending: tasks without a due date go to the front', () => {
    const tasks = [task('early', '2024-06-10'), task('no-date', null), task('late', '2024-06-20')];
    const sorted = sortByDueDate(tasks, false);
    expect(sorted[0].id).toBe('no-date');
  });

  it('keeps two tasks with no due date in stable relative order', () => {
    const tasks = [task('x', null), task('y', null)];
    const sorted = sortByDueDate(tasks, true);
    expect(sorted.map(t => t.id)).toEqual(['x', 'y']);
  });

  it('default parameter sorts ascending', () => {
    const tasks = [task('b', '2024-06-20'), task('a', '2024-06-10')];
    const sorted = sortByDueDate(tasks);
    expect(sorted[0].id).toBe('a');
  });
});
