/**
 * Tests for notebook-export.js: pure tree-traversal functions.
 *
 * Only getAllDescendants() and getItemPath() are testable as unit tests —
 * both are pure traversals over state.notebookItems with no DOM or network I/O.
 * The async export functions (exportFolderAsZip, exportAllNotebook, etc.) depend
 * on jsPDF, JSZip, and the real IDB, so they belong in E2E tests.
 *
 * Heavy module-level imports (jspdf, jszip, database.js, repository.js) are
 * mocked so the module loads cleanly in Node without build artefacts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as state from '../scripts/kantrack-modules/state.js';

vi.mock('jspdf', () => ({ default: class MockJsPDF {} }));
vi.mock('jszip', () => ({ default: class MockJSZip {} }));
vi.mock('../scripts/kantrack-modules/database.js', () => ({ getNotebookImage: vi.fn() }));
vi.mock('../scripts/kantrack-modules/utils.js', () => ({ getImageDimensions: vi.fn() }));
vi.mock('../scripts/kantrack-modules/repository.js', () => ({ getNotebookItemContent: vi.fn() }));

import { getAllDescendants, getItemPath } from '../scripts/kantrack-modules/notebook-export.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function folder(id, parentId = null, name = `Folder ${id}`) {
  return { id, type: 'folder', parentId, name };
}

function page(id, parentId = null, name = `Page ${id}`) {
  return { id, type: 'page', parentId, name };
}

beforeEach(() => {
  state.setNotebookItems([]);
});

// ── getAllDescendants ─────────────────────────────────────────────────────────

describe('getAllDescendants', () => {
  it('returns an empty array for a non-existent parent', () => {
    state.setNotebookItems([]);
    expect(getAllDescendants('ghost')).toEqual([]);
  });

  it('returns an empty array for a folder with no children', () => {
    state.setNotebookItems([folder('f1')]);
    expect(getAllDescendants('f1')).toEqual([]);
  });

  it('returns direct page children of a folder', () => {
    state.setNotebookItems([folder('f1'), page('p1', 'f1'), page('p2', 'f1')]);
    const result = getAllDescendants('f1');
    expect(result).toHaveLength(2);
    expect(result.map(i => i.id)).toEqual(expect.arrayContaining(['p1', 'p2']));
  });

  it('returns direct folder children of a folder', () => {
    state.setNotebookItems([folder('root'), folder('sub1', 'root'), folder('sub2', 'root')]);
    const result = getAllDescendants('root');
    expect(result.map(i => i.id)).toEqual(expect.arrayContaining(['sub1', 'sub2']));
  });

  it('recursively returns grandchildren', () => {
    state.setNotebookItems([folder('root'), folder('child', 'root'), page('grand', 'child')]);
    const result = getAllDescendants('root');
    expect(result.map(i => i.id)).toEqual(expect.arrayContaining(['child', 'grand']));
    expect(result).toHaveLength(2);
  });

  it('recursively returns deeply nested items', () => {
    state.setNotebookItems([folder('a'), folder('b', 'a'), folder('c', 'b'), page('d', 'c')]);
    const result = getAllDescendants('a');
    expect(result.map(i => i.id)).toEqual(expect.arrayContaining(['b', 'c', 'd']));
    expect(result).toHaveLength(3);
  });

  it('does not include items from sibling branches', () => {
    state.setNotebookItems([
      folder('root'),
      folder('branch-a', 'root'),
      folder('branch-b', 'root'),
      page('p-a', 'branch-a'),
      page('p-b', 'branch-b'),
    ]);
    const result = getAllDescendants('branch-a');
    expect(result.map(i => i.id)).toContain('p-a');
    expect(result.map(i => i.id)).not.toContain('p-b');
    expect(result.map(i => i.id)).not.toContain('branch-b');
  });

  it('does not include the parent folder itself', () => {
    state.setNotebookItems([folder('f1'), page('p1', 'f1')]);
    const result = getAllDescendants('f1');
    expect(result.map(i => i.id)).not.toContain('f1');
  });
});

// ── getItemPath ───────────────────────────────────────────────────────────────

describe('getItemPath', () => {
  it('returns empty string for a non-existent item', () => {
    state.setNotebookItems([]);
    expect(getItemPath('ghost')).toBe('');
  });

  it('returns just the item name for a root-level item', () => {
    state.setNotebookItems([page('p1', null, 'My Note')]);
    expect(getItemPath('p1')).toBe('My Note');
  });

  it('returns folder/page path for a one-level-deep page', () => {
    state.setNotebookItems([folder('f1', null, 'Projects'), page('p1', 'f1', 'Alpha')]);
    expect(getItemPath('p1')).toBe('Projects/Alpha');
  });

  it('builds a multi-level path for deeply nested items', () => {
    state.setNotebookItems([
      folder('a', null, 'Work'),
      folder('b', 'a', 'Q1'),
      page('c', 'b', 'Plan'),
    ]);
    expect(getItemPath('c')).toBe('Work/Q1/Plan');
  });

  it('returns path for a folder (not just pages)', () => {
    state.setNotebookItems([folder('root', null, 'Root'), folder('child', 'root', 'Child')]);
    expect(getItemPath('child')).toBe('Root/Child');
  });

  it('sanitizes special characters in names (replaces with _)', () => {
    state.setNotebookItems([page('p1', null, 'My/Note:Title')]);
    // The sanitizer replaces non-alphanumeric/space chars with _
    const path = getItemPath('p1');
    expect(path).not.toContain('/My/Note');
    expect(path).toMatch(/^[a-zA-Z0-9 _]+$/);
  });

  it('returns the folder path itself when called with a folder id', () => {
    state.setNotebookItems([folder('f1', null, 'Archive')]);
    expect(getItemPath('f1')).toBe('Archive');
  });
});
