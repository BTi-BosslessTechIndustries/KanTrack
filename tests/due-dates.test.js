// due-dates.js imports state, storage, utils, and undo.
// We mock those so we can test all pure + state-dependent functions.
// state.notesData is a mutable array on the shared mock object — tests
// push tasks in and clear them in beforeEach.

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

import * as mockState from '../scripts/kantrack-modules/state.js';
import { saveNotesToLocalStorage } from '../scripts/kantrack-modules/storage.js';
import { recordAction } from '../scripts/kantrack-modules/undo.js';
import {
  formatDueDate,
  formatRelativeDueDate,
  sortByDueDate,
  isOverdue,
  isDueToday,
  isDueSoon,
  getDueDateStatus,
  getDueDate,
  getOverdueTasks,
  getTasksDueToday,
  getTasksDueSoon,
  setDueDate,
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

// ─── helpers (state tests) ────────────────────────────────────────────────────

/** Build a minimal task object for state-based tests. */
function makeTask(id, dueDate, column = 'todo') {
  return { id, dueDate, column, actions: [] };
}

// Pinned system time for all state-based tests (noon UTC avoids boundary drift).
const FIXED_NOW = new Date('2024-06-15T12:00:00Z');

// ─── isOverdue ────────────────────────────────────────────────────────────────

describe('isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    mockState.notesData.length = 0;
  });
  afterEach(() => {
    mockState.notesData.length = 0;
    vi.useRealTimers();
  });

  it('returns false for an unknown task id', () => {
    expect(isOverdue('nonexistent')).toBe(false);
  });

  it('returns false when task has no due date', () => {
    mockState.notesData.push(makeTask('t1', null));
    expect(isOverdue('t1')).toBe(false);
  });

  it('returns false when task is in the done column', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-10', 'done'));
    expect(isOverdue('t1')).toBe(false);
  });

  it('returns true for a past due date on an active task', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-10'));
    expect(isOverdue('t1')).toBe(true);
  });

  it("returns false for today's date (not strictly before today)", () => {
    mockState.notesData.push(makeTask('t1', '2024-06-15'));
    expect(isOverdue('t1')).toBe(false);
  });

  it('returns false for a future due date', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-20'));
    expect(isOverdue('t1')).toBe(false);
  });
});

// ─── isDueToday ───────────────────────────────────────────────────────────────

describe('isDueToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    mockState.notesData.length = 0;
  });
  afterEach(() => {
    mockState.notesData.length = 0;
    vi.useRealTimers();
  });

  it('returns false for an unknown task id', () => {
    expect(isDueToday('nonexistent')).toBe(false);
  });

  it('returns false when task has no due date', () => {
    mockState.notesData.push(makeTask('t1', null));
    expect(isDueToday('t1')).toBe(false);
  });

  it('returns false when task is in the done column', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-15', 'done'));
    expect(isDueToday('t1')).toBe(false);
  });

  it("returns true for today's date", () => {
    mockState.notesData.push(makeTask('t1', '2024-06-15'));
    expect(isDueToday('t1')).toBe(true);
  });

  it('returns false for yesterday', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-14'));
    expect(isDueToday('t1')).toBe(false);
  });

  it('returns false for tomorrow', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-16'));
    expect(isDueToday('t1')).toBe(false);
  });
});

// ─── isDueSoon ────────────────────────────────────────────────────────────────

describe('isDueSoon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    mockState.notesData.length = 0;
  });
  afterEach(() => {
    mockState.notesData.length = 0;
    vi.useRealTimers();
  });

  it('returns false for an unknown task id', () => {
    expect(isDueSoon('nonexistent')).toBe(false);
  });

  it('returns false when task has no due date', () => {
    mockState.notesData.push(makeTask('t1', null));
    expect(isDueSoon('t1')).toBe(false);
  });

  it('returns false when task is in the done column', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-16', 'done'));
    expect(isDueSoon('t1')).toBe(false);
  });

  it('returns false for today (due > today is required)', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-15'));
    expect(isDueSoon('t1')).toBe(false);
  });

  it('returns true for tomorrow (1 day away)', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-16'));
    expect(isDueSoon('t1')).toBe(true);
  });

  it('returns true for exactly 3 days away', () => {
    // 2024-06-18 midnight UTC <= threeDays (2024-06-18 noon UTC)
    mockState.notesData.push(makeTask('t1', '2024-06-18'));
    expect(isDueSoon('t1')).toBe(true);
  });

  it('returns false for 4 days away', () => {
    // 2024-06-19 midnight UTC > threeDays (2024-06-18 noon UTC)
    mockState.notesData.push(makeTask('t1', '2024-06-19'));
    expect(isDueSoon('t1')).toBe(false);
  });

  it('returns false for a past date', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-10'));
    expect(isDueSoon('t1')).toBe(false);
  });
});

// ─── getDueDateStatus ─────────────────────────────────────────────────────────

describe('getDueDateStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    mockState.notesData.length = 0;
  });
  afterEach(() => {
    mockState.notesData.length = 0;
    vi.useRealTimers();
  });

  it('returns "overdue" for a past-due active task', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-10'));
    expect(getDueDateStatus('t1')).toBe('overdue');
  });

  it('returns "today" for a task due today', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-15'));
    expect(getDueDateStatus('t1')).toBe('today');
  });

  it('returns "soon" for a task due within 3 days (not today)', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-17'));
    expect(getDueDateStatus('t1')).toBe('soon');
  });

  it('returns "normal" for a far-future due date', () => {
    mockState.notesData.push(makeTask('t1', '2024-09-01'));
    expect(getDueDateStatus('t1')).toBe('normal');
  });

  it('returns "normal" for a task with no due date', () => {
    mockState.notesData.push(makeTask('t1', null));
    expect(getDueDateStatus('t1')).toBe('normal');
  });

  it('returns "normal" for a done task regardless of past due date', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-10', 'done'));
    expect(getDueDateStatus('t1')).toBe('normal');
  });
});

// ─── getDueDate ───────────────────────────────────────────────────────────────

describe('getDueDate', () => {
  beforeEach(() => {
    mockState.notesData.length = 0;
  });
  afterEach(() => {
    mockState.notesData.length = 0;
  });

  it('returns null for an unknown task', () => {
    expect(getDueDate('nonexistent')).toBeNull();
  });

  it('returns null when task has no due date', () => {
    mockState.notesData.push(makeTask('t1', null));
    expect(getDueDate('t1')).toBeNull();
  });

  it('returns the due date string when set', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-15'));
    expect(getDueDate('t1')).toBe('2024-06-15');
  });
});

// ─── getOverdueTasks ──────────────────────────────────────────────────────────

describe('getOverdueTasks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    mockState.notesData.length = 0;
  });
  afterEach(() => {
    mockState.notesData.length = 0;
    vi.useRealTimers();
  });

  it('returns empty array when there are no tasks', () => {
    expect(getOverdueTasks()).toEqual([]);
  });

  it('returns only active overdue tasks', () => {
    mockState.notesData.push(
      makeTask('past', '2024-06-10'),
      makeTask('today', '2024-06-15'),
      makeTask('future', '2024-09-01'),
      makeTask('done-past', '2024-06-10', 'done')
    );
    expect(getOverdueTasks().map(t => t.id)).toEqual(['past']);
  });

  it('excludes done tasks even when past due date', () => {
    mockState.notesData.push(makeTask('done', '2024-06-10', 'done'));
    expect(getOverdueTasks()).toHaveLength(0);
  });

  it('excludes tasks with no due date', () => {
    mockState.notesData.push(makeTask('no-date', null));
    expect(getOverdueTasks()).toHaveLength(0);
  });
});

// ─── getTasksDueToday ─────────────────────────────────────────────────────────

describe('getTasksDueToday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    mockState.notesData.length = 0;
  });
  afterEach(() => {
    mockState.notesData.length = 0;
    vi.useRealTimers();
  });

  it('returns empty array when there are no tasks', () => {
    expect(getTasksDueToday()).toEqual([]);
  });

  it('returns only active tasks due today', () => {
    mockState.notesData.push(
      makeTask('past', '2024-06-10'),
      makeTask('today', '2024-06-15'),
      makeTask('future', '2024-09-01'),
      makeTask('done-today', '2024-06-15', 'done')
    );
    expect(getTasksDueToday().map(t => t.id)).toEqual(['today']);
  });

  it('excludes done tasks due today', () => {
    mockState.notesData.push(makeTask('done', '2024-06-15', 'done'));
    expect(getTasksDueToday()).toHaveLength(0);
  });
});

// ─── getTasksDueSoon ──────────────────────────────────────────────────────────

describe('getTasksDueSoon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    mockState.notesData.length = 0;
  });
  afterEach(() => {
    mockState.notesData.length = 0;
    vi.useRealTimers();
  });

  it('returns empty array when there are no tasks', () => {
    expect(getTasksDueSoon()).toEqual([]);
  });

  it('returns tasks due within 3 days (after today, excluding done)', () => {
    mockState.notesData.push(
      makeTask('past', '2024-06-10'),
      makeTask('today', '2024-06-15'),
      makeTask('tomorrow', '2024-06-16'),
      makeTask('in3', '2024-06-18'),
      makeTask('in4', '2024-06-19'),
      makeTask('done-tmrw', '2024-06-16', 'done')
    );
    expect(getTasksDueSoon().map(t => t.id)).toEqual(['tomorrow', 'in3']);
  });

  it('excludes done tasks', () => {
    mockState.notesData.push(makeTask('done', '2024-06-16', 'done'));
    expect(getTasksDueSoon()).toHaveLength(0);
  });
});

// ─── setDueDate ───────────────────────────────────────────────────────────────

describe('setDueDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    mockState.notesData.length = 0;
    vi.clearAllMocks();
  });
  afterEach(() => {
    mockState.notesData.length = 0;
    vi.useRealTimers();
  });

  it('returns false for an unknown task id', () => {
    expect(setDueDate('nonexistent', '2024-06-20')).toBe(false);
  });

  it('returns true without mutation when the date is unchanged', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-20'));
    expect(setDueDate('t1', '2024-06-20')).toBe(true);
    expect(mockState.notesData[0].actions).toHaveLength(0);
  });

  it('sets a new due date when none existed before', () => {
    mockState.notesData.push(makeTask('t1', null));
    expect(setDueDate('t1', '2024-06-20')).toBe(true);
    expect(mockState.notesData[0].dueDate).toBe('2024-06-20');
  });

  it('records a history entry with type "dueDate" when setting for the first time', () => {
    mockState.notesData.push(makeTask('t1', null));
    setDueDate('t1', '2024-06-20');
    const actions = mockState.notesData[0].actions;
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('dueDate');
  });

  it('clears an existing due date when given null', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-20'));
    expect(setDueDate('t1', null)).toBe(true);
    expect(mockState.notesData[0].dueDate).toBeNull();
  });

  it('records a "removed" history entry when clearing the due date', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-20'));
    setDueDate('t1', null);
    expect(mockState.notesData[0].actions[0].action).toMatch(/removed/i);
  });

  it('updates an existing due date to a new one', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-10'));
    expect(setDueDate('t1', '2024-06-25')).toBe(true);
    expect(mockState.notesData[0].dueDate).toBe('2024-06-25');
  });

  it('records a "changed" history entry when updating an existing due date', () => {
    mockState.notesData.push(makeTask('t1', '2024-06-10'));
    setDueDate('t1', '2024-06-25');
    expect(mockState.notesData[0].actions[0].action).toMatch(/changed/i);
  });

  it('calls saveNotesToLocalStorage after a successful change', () => {
    mockState.notesData.push(makeTask('t1', null));
    setDueDate('t1', '2024-06-20');
    expect(saveNotesToLocalStorage).toHaveBeenCalledOnce();
  });

  it('calls recordAction after a successful change', () => {
    mockState.notesData.push(makeTask('t1', null));
    setDueDate('t1', '2024-06-20');
    expect(recordAction).toHaveBeenCalledOnce();
  });
});
