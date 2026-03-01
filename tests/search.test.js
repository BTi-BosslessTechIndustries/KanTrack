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
  registerVLUpdaterForFilters,
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
