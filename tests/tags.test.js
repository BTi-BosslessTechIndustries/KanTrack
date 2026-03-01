// tags.js has a module-level tagDefinitions array.
//
// Strategy:
//   - Mock repository.js so getAllTags returns [] — this causes initTags() to
//     set tagDefinitions = [], giving us a clean slate before each test.
//   - After the reset, call createTag() directly to set up specific tags.
//     createTag() pushes to tagDefinitions without the filtering logic that
//     loadTagDefinitions() applies (which would discard non-pinned unused tags).
//   - Mock saveTags from repository so createTag() side-effects are swallowed.
//   - state.js and storage.js are imported by tags.js but the functions under
//     test never reach those paths — import them as-is (setup.js mocks
//     localStorage globally, so storage.js is safe in Node).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../scripts/kantrack-modules/repository.js', () => ({
  getAllTags: vi.fn(),
  saveTags: vi.fn(),
  // saveTasks is needed by storage.js (which deleteTag calls via saveNotesToLocalStorage)
  saveTasks: vi.fn(),
}));

// state.js is mocked so that the same notesData array is shared between
// the test file and the tags.js module under test (live-binding guarantee).
vi.mock('../scripts/kantrack-modules/state.js', () => ({ notesData: [] }));

import { getAllTags } from '../scripts/kantrack-modules/repository.js';
import * as state from '../scripts/kantrack-modules/state.js';
import {
  initTags,
  createTag,
  getTagDefinitions,
  getTagById,
  getTagColor,
  getPinnedTags,
  setTagPinned,
  toggleTagPinned,
  updateTag,
  deleteTag,
  cleanupUnusedTags,
  addTagToTask,
  removeTagFromTask,
  getTaskTags,
  TAG_COLORS,
  MAX_TAGS_PER_TASK,
} from '../scripts/kantrack-modules/tags.js';

// Reset tagDefinitions and notesData to an empty slate before every test.
beforeEach(async () => {
  getAllTags.mockResolvedValue([]);
  await initTags();
  state.notesData.length = 0;
});

// ─── getTagDefinitions ────────────────────────────────────────────────────────

describe('getTagDefinitions', () => {
  it('returns an empty array when no tags exist', () => {
    expect(getTagDefinitions()).toEqual([]);
  });

  it('returns all tags that have been created', () => {
    createTag('Bug', 0, true);
    createTag('Feature', 1, false);
    expect(getTagDefinitions()).toHaveLength(2);
  });

  it('returns a copy — mutating the result does not affect internal state', () => {
    createTag('Bug', 0, true);
    const defs = getTagDefinitions();
    defs.push({ id: 'fake', name: 'Fake', colorIndex: 0, pinned: false });
    expect(getTagDefinitions()).toHaveLength(1);
  });
});

// ─── getTagById ───────────────────────────────────────────────────────────────

describe('getTagById', () => {
  beforeEach(() => {
    createTag('Bug', 0, true);
    createTag('Feature', 1, false);
  });

  it('returns the correct tag for a known id', () => {
    const tag = getTagById('bug');
    expect(tag).toBeDefined();
    expect(tag.name).toBe('Bug');
  });

  it('returns undefined for an unknown id', () => {
    expect(getTagById('does-not-exist')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getTagById('')).toBeUndefined();
  });

  it('finds tags regardless of pinned state', () => {
    expect(getTagById('bug')).toBeDefined(); // pinned
    expect(getTagById('feature')).toBeDefined(); // not pinned
  });
});

// ─── getTagColor ──────────────────────────────────────────────────────────────

describe('getTagColor', () => {
  beforeEach(() => {
    createTag('Bug', 0, true); // colorIndex 0 → red
    createTag('Feature', 3, false); // colorIndex 3 → green
  });

  it("returns the color matching the tag's colorIndex", () => {
    expect(getTagColor('bug')).toEqual(TAG_COLORS[0]);
    expect(getTagColor('feature')).toEqual(TAG_COLORS[3]);
  });

  it('returns the default gray color for an unknown tag id', () => {
    // Fallback is TAG_COLORS[9] (gray)
    expect(getTagColor('unknown-id')).toEqual(TAG_COLORS[9]);
  });

  it('returned color objects have "color" and "bg" properties', () => {
    const color = getTagColor('bug');
    expect(color).toHaveProperty('color');
    expect(color).toHaveProperty('bg');
  });
});

// ─── getPinnedTags ────────────────────────────────────────────────────────────

describe('getPinnedTags', () => {
  it('returns an empty array when there are no tags', () => {
    expect(getPinnedTags()).toEqual([]);
  });

  it('returns only the pinned tags', () => {
    createTag('Bug', 0, true); // pinned
    createTag('Feature', 1, false); // not pinned
    createTag('Docs', 2, true); // pinned

    const pinned = getPinnedTags();
    expect(pinned).toHaveLength(2);
    expect(pinned.map(t => t.name)).toContain('Bug');
    expect(pinned.map(t => t.name)).toContain('Docs');
  });

  it('does not include non-pinned tags', () => {
    createTag('Bug', 0, true);
    createTag('Feature', 1, false);

    const pinned = getPinnedTags();
    expect(pinned.map(t => t.name)).not.toContain('Feature');
  });

  it('returns an empty array when all tags are unpinned', () => {
    createTag('Feature', 1, false);
    createTag('Chore', 2, false);
    expect(getPinnedTags()).toEqual([]);
  });
});

// ─── createTag (side-effects used in setup above, also tested directly) ───────

describe('createTag', () => {
  it('returns the created tag object', () => {
    const tag = createTag('Bug', 0, true);
    expect(tag).not.toBeNull();
    expect(tag.name).toBe('Bug');
    expect(tag.colorIndex).toBe(0);
    expect(tag.pinned).toBe(true);
  });

  it('generates an id from the name', () => {
    const tag = createTag('My Feature', 1, false);
    expect(tag.id).toBe('my-feature');
  });

  it('returns null for a duplicate name (same generated id)', () => {
    createTag('Bug', 0, true);
    const duplicate = createTag('Bug', 2, false);
    expect(duplicate).toBeNull();
  });

  it('clamps colorIndex to valid range', () => {
    const tag = createTag('Over', 99, false);
    expect(tag.colorIndex).toBeLessThanOrEqual(TAG_COLORS.length - 1);

    const tag2 = createTag('Under', -5, false);
    expect(tag2.colorIndex).toBeGreaterThanOrEqual(0);
  });

  it('adds the tag to the definitions list', () => {
    createTag('NewTag', 0, false);
    expect(getTagDefinitions()).toHaveLength(1);
  });

  it('respects MAX_TAGS_PER_TASK constant being exported', () => {
    expect(MAX_TAGS_PER_TASK).toBeGreaterThan(0);
  });
});

// ─── helpers (mutation tests) ─────────────────────────────────────────────────

function makeTaskWithTags(id, tags = []) {
  return { id, tags, column: 'todo', actions: [] };
}

// ─── toggleTagPinned ──────────────────────────────────────────────────────────

describe('toggleTagPinned', () => {
  it('returns false for an unknown tag id', () => {
    expect(toggleTagPinned('nonexistent')).toBe(false);
  });

  it('toggles pinned from false to true and returns the new state', () => {
    createTag('Toggle', 0, false);
    expect(toggleTagPinned('toggle')).toBe(true);
    expect(getTagById('toggle').pinned).toBe(true);
  });

  it('toggles pinned from true to false', () => {
    createTag('Toggle', 0, true);
    expect(toggleTagPinned('toggle')).toBe(false);
    expect(getTagById('toggle').pinned).toBe(false);
  });
});

// ─── setTagPinned ─────────────────────────────────────────────────────────────

describe('setTagPinned', () => {
  it('returns false for an unknown tag id', () => {
    expect(setTagPinned('nonexistent', true)).toBe(false);
  });

  it('sets pinned to true', () => {
    createTag('Settable', 0, false);
    expect(setTagPinned('settable', true)).toBe(true);
    expect(getTagById('settable').pinned).toBe(true);
  });

  it('sets pinned to false', () => {
    createTag('Settable', 0, true);
    expect(setTagPinned('settable', false)).toBe(true);
    expect(getTagById('settable').pinned).toBe(false);
  });
});

// ─── updateTag ────────────────────────────────────────────────────────────────

describe('updateTag', () => {
  it('returns false for an unknown tag id', () => {
    expect(updateTag('nonexistent', { name: 'X' })).toBe(false);
  });

  it('updates the name field', () => {
    createTag('Old Name', 0);
    updateTag('old-name', { name: 'New Name' });
    expect(getTagById('old-name').name).toBe('New Name');
  });

  it('updates the colorIndex field', () => {
    createTag('Color Tag', 0);
    updateTag('color-tag', { colorIndex: 5 });
    expect(getTagById('color-tag').colorIndex).toBe(5);
  });

  it('merges updates without removing other fields', () => {
    createTag('Full Tag', 3, true);
    updateTag('full-tag', { colorIndex: 7 });
    const tag = getTagById('full-tag');
    expect(tag.name).toBe('Full Tag');
    expect(tag.pinned).toBe(true);
    expect(tag.colorIndex).toBe(7);
  });

  it('returns true on success', () => {
    createTag('Success', 0);
    expect(updateTag('success', { colorIndex: 1 })).toBe(true);
  });
});

// ─── deleteTag ────────────────────────────────────────────────────────────────

describe('deleteTag', () => {
  it('returns false for an unknown tag id', () => {
    expect(deleteTag('nonexistent')).toBe(false);
  });

  it('removes the tag from definitions', () => {
    createTag('To Delete', 0);
    deleteTag('to-delete');
    expect(getTagDefinitions()).toHaveLength(0);
  });

  it('returns true on success', () => {
    createTag('Del', 0);
    expect(deleteTag('del')).toBe(true);
  });

  it('removes the deleted tag from all task tag arrays', () => {
    createTag('Bug', 0);
    state.notesData.push(makeTaskWithTags('t1', ['bug', 'other']));
    deleteTag('bug');
    expect(state.notesData[0].tags).toEqual(['other']);
  });

  it('leaves tasks that do not have the deleted tag untouched', () => {
    createTag('Bug', 0);
    state.notesData.push(makeTaskWithTags('t1', ['other']));
    deleteTag('bug');
    expect(state.notesData[0].tags).toEqual(['other']);
  });
});

// ─── cleanupUnusedTags ────────────────────────────────────────────────────────

describe('cleanupUnusedTags', () => {
  it('removes unpinned tags not used by any task', () => {
    createTag('Unused', 0, false);
    cleanupUnusedTags();
    expect(getTagDefinitions()).toHaveLength(0);
  });

  it('keeps pinned tags even when unused', () => {
    createTag('Pinned', 0, true);
    cleanupUnusedTags();
    expect(getTagDefinitions()).toHaveLength(1);
  });

  it('keeps unpinned tags used by at least one task', () => {
    createTag('In Use', 0, false); // id → 'in-use'
    state.notesData.push(makeTaskWithTags('t1', ['in-use']));
    cleanupUnusedTags();
    expect(getTagDefinitions()).toHaveLength(1);
  });

  it('removes unused unpinned while keeping used unpinned in one pass', () => {
    createTag('Used', 0, false);
    createTag('Unused', 1, false);
    state.notesData.push(makeTaskWithTags('t1', ['used']));
    cleanupUnusedTags();
    expect(getTagDefinitions().map(t => t.id)).toEqual(['used']);
  });
});

// ─── addTagToTask ─────────────────────────────────────────────────────────────

describe('addTagToTask', () => {
  it('returns false for an unknown task', () => {
    expect(addTagToTask('nonexistent', 'bug')).toBe(false);
  });

  it('adds a tag to a task', () => {
    state.notesData.push(makeTaskWithTags('t1', []));
    addTagToTask('t1', 'bug');
    expect(state.notesData[0].tags).toContain('bug');
  });

  it('returns true on success', () => {
    state.notesData.push(makeTaskWithTags('t1', []));
    expect(addTagToTask('t1', 'bug')).toBe(true);
  });

  it('does not add duplicate tags', () => {
    state.notesData.push(makeTaskWithTags('t1', ['bug']));
    addTagToTask('t1', 'bug');
    expect(state.notesData[0].tags.filter(t => t === 'bug')).toHaveLength(1);
  });

  it('returns false when task is at the MAX_TAGS_PER_TASK limit', () => {
    state.notesData.push(makeTaskWithTags('t1', ['a', 'b', 'c', 'd', 'e']));
    expect(addTagToTask('t1', 'f')).toBe(false);
    expect(state.notesData[0].tags).toHaveLength(MAX_TAGS_PER_TASK);
  });

  it('initialises task.tags if it is undefined', () => {
    const task = { id: 't1', column: 'todo', actions: [] };
    state.notesData.push(task);
    addTagToTask('t1', 'new-tag');
    expect(task.tags).toContain('new-tag');
  });
});

// ─── removeTagFromTask ────────────────────────────────────────────────────────

describe('removeTagFromTask', () => {
  it('returns false for an unknown task', () => {
    expect(removeTagFromTask('nonexistent', 'bug')).toBe(false);
  });

  it('removes the tag from the task', () => {
    state.notesData.push(makeTaskWithTags('t1', ['bug', 'feature']));
    removeTagFromTask('t1', 'bug');
    expect(state.notesData[0].tags).toEqual(['feature']);
  });

  it('returns true on success', () => {
    state.notesData.push(makeTaskWithTags('t1', ['bug']));
    expect(removeTagFromTask('t1', 'bug')).toBe(true);
  });

  it('is a no-op (returns true) when the tag is not on the task', () => {
    state.notesData.push(makeTaskWithTags('t1', ['feature']));
    expect(removeTagFromTask('t1', 'bug')).toBe(true);
    expect(state.notesData[0].tags).toEqual(['feature']);
  });

  it('returns false when task has no tags property', () => {
    const task = { id: 't1', column: 'todo', actions: [] };
    state.notesData.push(task);
    expect(removeTagFromTask('t1', 'bug')).toBe(false);
  });
});

// ─── getTaskTags ──────────────────────────────────────────────────────────────

describe('getTaskTags', () => {
  it('returns empty array for an unknown task', () => {
    expect(getTaskTags('nonexistent')).toEqual([]);
  });

  it('returns empty array when task has no tags', () => {
    state.notesData.push(makeTaskWithTags('t1', []));
    expect(getTaskTags('t1')).toEqual([]);
  });

  it('returns tag info for each tag on the task', () => {
    createTag('Bug', 0);
    state.notesData.push(makeTaskWithTags('t1', ['bug']));
    const tags = getTaskTags('t1');
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ id: 'bug', name: 'Bug' });
  });

  it('uses the tag id as name for tags with no definition', () => {
    state.notesData.push(makeTaskWithTags('t1', ['orphan-tag']));
    const tags = getTaskTags('t1');
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('orphan-tag');
  });

  it('includes color and bg properties from TAG_COLORS', () => {
    createTag('Feature', 3);
    state.notesData.push(makeTaskWithTags('t1', ['feature']));
    const tags = getTaskTags('t1');
    expect(tags[0]).toHaveProperty('color');
    expect(tags[0]).toHaveProperty('bg');
  });
});
