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

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../scripts/kantrack-modules/repository.js', () => ({
  getAllTags: vi.fn(),
  saveTags: vi.fn(),
  // Other repository exports referenced by tags.js are not needed
}));

// utils.js has no DOM/side-effect issues — import directly.
// state.js is safe to import directly (tested separately, no DOM side effects).

import { getAllTags } from '../scripts/kantrack-modules/repository.js';
import {
  initTags,
  createTag,
  getTagDefinitions,
  getTagById,
  getTagColor,
  getPinnedTags,
  TAG_COLORS,
  MAX_TAGS_PER_TASK,
} from '../scripts/kantrack-modules/tags.js';

// Reset tagDefinitions to an empty slate before every test.
beforeEach(async () => {
  getAllTags.mockResolvedValue([]);
  await initTags();
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
