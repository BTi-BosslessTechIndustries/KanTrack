/**
 * Unit tests for search.js — checkTaskVisibility pure filter logic.
 *
 * The filter-setter functions (setSearchTerm, setColumnFilter, setTagFilter,
 * clearFilters) call document.querySelectorAll and document.getElementById
 * for DOM side-effects (button highlights, column counts). The global document
 * stub in tests/setup.js covers getElementById but not querySelectorAll, so
 * we extend it here with a no-op stub that satisfies the calls without a DOM.
 */

// Extend the document stub before any module-level code runs
global.document.querySelectorAll = () => ({ forEach: () => {} });

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkTaskVisibility,
  clearFilters,
  setSearchTerm,
  setColumnFilter,
  setTagFilter,
  toggleTagFilter,
  registerVLUpdaterForFilters,
  getFilterState,
  hasActiveFilters,
} from '../scripts/kantrack-modules/search.js';

// Keep applyFilters in DOM-fallback mode (VL not active in unit tests)
registerVLUpdaterForFilters(null);

const makeTask = (overrides = {}) => ({
  id: 'task-1',
  title: 'Test task',
  tags: [],
  priority: null,
  column: 'todo',
  deleted: false,
  noteEntries: [],
  ...overrides,
});

beforeEach(() => clearFilters());

// ── Basic visibility ──────────────────────────────────────────

describe('checkTaskVisibility — no active filters', () => {
  it('returns true for a normal task', () => {
    expect(checkTaskVisibility(makeTask())).toBe(true);
  });

  it('returns false for a deleted task', () => {
    expect(checkTaskVisibility(makeTask({ deleted: true }))).toBe(false);
  });
});

// ── Column filter ─────────────────────────────────────────────

describe('checkTaskVisibility — column filter', () => {
  it('returns false when task column does not match the active column filter', () => {
    setColumnFilter('done');
    expect(checkTaskVisibility(makeTask({ column: 'todo' }))).toBe(false);
  });

  it('returns true when task column matches the active column filter', () => {
    setColumnFilter('todo');
    expect(checkTaskVisibility(makeTask({ column: 'todo' }))).toBe(true);
  });

  it('returns true for any column when column filter is null (no filter)', () => {
    setColumnFilter(null);
    expect(checkTaskVisibility(makeTask({ column: 'done' }))).toBe(true);
  });
});

// ── Search term ───────────────────────────────────────────────

describe('checkTaskVisibility — search term', () => {
  it('returns false when search term does not appear in the title', () => {
    setSearchTerm('xyz');
    expect(checkTaskVisibility(makeTask({ title: 'My task' }))).toBe(false);
  });

  it('returns true when search term appears in the title', () => {
    setSearchTerm('my task');
    expect(checkTaskVisibility(makeTask({ title: 'My task' }))).toBe(true);
  });

  it('performs case-insensitive title matching', () => {
    setSearchTerm('TEST');
    expect(checkTaskVisibility(makeTask({ title: 'Test task' }))).toBe(true);
  });

  // Note: searching note-entry HTML content relies on getTextPreview() which
  // uses document.createElement to parse HTML — not testable in the Node
  // environment. That path is covered by E2E tests.

  it('returns true when search matches priority text', () => {
    setSearchTerm('high');
    expect(checkTaskVisibility(makeTask({ priority: 'high' }))).toBe(true);
  });

  it('returns false after clearing the search term', () => {
    setSearchTerm('xyz');
    expect(checkTaskVisibility(makeTask({ title: 'My task' }))).toBe(false);
    setSearchTerm('');
    expect(checkTaskVisibility(makeTask({ title: 'My task' }))).toBe(true);
  });
});

// ── Tag filter ────────────────────────────────────────────────

describe('checkTaskVisibility — tag filter', () => {
  it('returns false when tag filter is active but task has no matching tag', () => {
    setTagFilter(['tag-a']);
    expect(checkTaskVisibility(makeTask({ tags: ['tag-b'] }))).toBe(false);
  });

  it('returns true when the task has a matching tag', () => {
    setTagFilter(['tag-a']);
    expect(checkTaskVisibility(makeTask({ tags: ['tag-a'] }))).toBe(true);
  });

  it('returns false when task has no tags and a tag filter is active', () => {
    setTagFilter(['tag-a']);
    expect(checkTaskVisibility(makeTask({ tags: [] }))).toBe(false);
  });

  it('returns true if at least one task tag matches the filter (OR logic)', () => {
    setTagFilter(['tag-x']);
    expect(checkTaskVisibility(makeTask({ tags: ['tag-a', 'tag-x'] }))).toBe(true);
  });
});

// ── Combined filters ──────────────────────────────────────────

describe('checkTaskVisibility — combined filters', () => {
  it('returns false when search matches but column filter does not', () => {
    setSearchTerm('my task');
    setColumnFilter('done');
    expect(checkTaskVisibility(makeTask({ title: 'My task', column: 'todo' }))).toBe(false);
  });

  it('returns true only when all active filters are satisfied', () => {
    setSearchTerm('my task');
    setColumnFilter('todo');
    expect(checkTaskVisibility(makeTask({ title: 'My task', column: 'todo' }))).toBe(true);
  });
});

// ── Search term edge cases ────────────────────────────────────

describe('checkTaskVisibility — search term edge cases', () => {
  it('handles regex-special characters in the search term without throwing', () => {
    setSearchTerm('(high)');
    expect(() => checkTaskVisibility(makeTask({ title: 'My task' }))).not.toThrow();
  });

  it('whitespace-only search is treated as no filter (all tasks remain visible)', () => {
    setSearchTerm('   ');
    expect(checkTaskVisibility(makeTask({ title: 'Any task' }))).toBe(true);
  });

  it('returns true for a task whose title contains regex-special characters', () => {
    setSearchTerm('a+b');
    expect(checkTaskVisibility(makeTask({ title: 'Task a+b done' }))).toBe(true);
  });

  it('a bracket character in the search term does not break plain-text matching', () => {
    setSearchTerm('[bug]');
    expect(checkTaskVisibility(makeTask({ title: 'Fix [bug] in auth' }))).toBe(true);
    expect(checkTaskVisibility(makeTask({ title: 'Unrelated task' }))).toBe(false);
  });
});

// ── toggleTagFilter ───────────────────────────────────────────

describe('toggleTagFilter', () => {
  it('adds a tag to the filter when it is not already active', () => {
    toggleTagFilter('tag-a');
    expect(checkTaskVisibility(makeTask({ tags: ['tag-a'] }))).toBe(true);
    expect(checkTaskVisibility(makeTask({ tags: ['tag-b'] }))).toBe(false);
  });

  it('removes a tag from the filter when it is already active', () => {
    toggleTagFilter('tag-a'); // add
    toggleTagFilter('tag-a'); // remove
    // No tag filter active → any task is visible regardless of tags
    expect(checkTaskVisibility(makeTask({ tags: [] }))).toBe(true);
  });

  it('supports multiple tags active simultaneously (AND logic — task must have all)', () => {
    toggleTagFilter('tag-a');
    toggleTagFilter('tag-b');
    // task with only one of the selected tags is hidden
    expect(checkTaskVisibility(makeTask({ tags: ['tag-a'] }))).toBe(false);
    expect(checkTaskVisibility(makeTask({ tags: ['tag-b'] }))).toBe(false);
    // task with both selected tags is visible
    expect(checkTaskVisibility(makeTask({ tags: ['tag-a', 'tag-b'] }))).toBe(true);
    // task with neither is hidden
    expect(checkTaskVisibility(makeTask({ tags: ['tag-c'] }))).toBe(false);
  });
});

// ── getFilterState ────────────────────────────────────────────

describe('getFilterState', () => {
  it('returns empty filter state when no filters are set', () => {
    const s = getFilterState();
    expect(s.searchTerm).toBe('');
    expect(s.columnFilter).toBeNull();
    expect(s.tagFilter).toEqual([]);
  });

  it('reflects the current search term', () => {
    setSearchTerm('hello');
    expect(getFilterState().searchTerm).toBe('hello');
  });

  it('reflects the current column filter', () => {
    setColumnFilter('done');
    expect(getFilterState().columnFilter).toBe('done');
  });

  it('returns a copy of tagFilter so mutating the result does not affect state', () => {
    setTagFilter(['tag-x']);
    const s = getFilterState();
    s.tagFilter.push('tag-y'); // mutate the returned copy
    expect(getFilterState().tagFilter).toEqual(['tag-x']); // internal state unchanged
  });
});

// ── hasActiveFilters ──────────────────────────────────────────

describe('hasActiveFilters', () => {
  it('returns false when no filters are active', () => {
    expect(hasActiveFilters()).toBe(false);
  });

  it('returns true after setting a search term', () => {
    setSearchTerm('foo');
    expect(hasActiveFilters()).toBe(true);
  });

  it('returns true after setting a column filter', () => {
    setColumnFilter('inProgress');
    expect(hasActiveFilters()).toBe(true);
  });

  it('returns true after setting a tag filter', () => {
    setTagFilter(['tag-z']);
    expect(hasActiveFilters()).toBe(true);
  });

  it('returns false after clearFilters resets everything', () => {
    setSearchTerm('foo');
    setColumnFilter('done');
    setTagFilter(['tag-z']);
    clearFilters();
    expect(hasActiveFilters()).toBe(false);
  });
});
