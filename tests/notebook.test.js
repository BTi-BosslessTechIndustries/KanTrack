/**
 * Tests for notebook.js: pure tree-query functions.
 *
 * Only getChildItems() is testable as a unit test — it's a pure filter+sort
 * over state.notebookItems with no DOM or async I/O. Everything else in this
 * module (tree rendering, page editor, drag-and-drop, ZIP import/export, context
 * menus) is DOM/IDB/JSZip-heavy orchestration that belongs in E2E tests (see
 * tests/e2e/header.spec.js and notebook-import-export.spec.js).
 *
 * Heavy module-level imports (jszip, database, images, mentions, notebook-export,
 * sanitize) are mocked so the module loads cleanly in Node without build artefacts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as state from '../scripts/kantrack-modules/state.js';

vi.mock('jszip', () => ({ default: class MockJSZip {} }));
vi.mock('../scripts/kantrack-modules/database.js', () => ({
  storeNotebookImage: vi.fn(),
  getNotebookImage: vi.fn(),
  deletePageImages: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/images.js', () => ({ openImageViewer: vi.fn() }));
vi.mock('../scripts/kantrack-modules/mentions.js', () => ({
  initMentionHandler: vi.fn(),
  setOpenPageModal: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/notebook-export.js', () => ({ exportFolderAsZip: vi.fn() }));
vi.mock('../scripts/kantrack-modules/sanitize.js', () => ({ sanitizeHTML: vi.fn(html => html) }));
vi.mock('../scripts/kantrack-modules/repository.js', () => ({
  getUIPref: vi.fn(),
  setUIPref: vi.fn(),
  getNotebookItemContent: vi.fn(),
  saveNotebookContentBackup: vi.fn(),
  deleteNotebookContentBackup: vi.fn(),
  getAllNotebookItems: vi.fn(),
  saveNotebookItems: vi.fn(),
}));

import { getChildItems } from '../scripts/kantrack-modules/notebook.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function folder(id, parentId, order, name = `Folder ${id}`) {
  return { id, type: 'folder', parentId, name, order };
}

function page(id, parentId, order, name = `Page ${id}`) {
  return { id, type: 'page', parentId, name, order };
}

beforeEach(() => {
  state.setNotebookItems([]);
});

// ── getChildItems ─────────────────────────────────────────────────────────────

describe('getChildItems', () => {
  it('returns an empty array when there are no items', () => {
    expect(getChildItems(null)).toEqual([]);
  });

  it('returns an empty array when no item has a matching parentId', () => {
    state.setNotebookItems([folder('f1', null, 0), page('p1', 'f1', 0)]);
    expect(getChildItems('missing-parent')).toEqual([]);
  });

  it('returns only items whose parentId matches, ignoring others', () => {
    state.setNotebookItems([
      folder('f1', null, 0),
      page('p1', 'f1', 0),
      page('p2', 'other-parent', 0),
      folder('f2', null, 1),
    ]);
    const children = getChildItems('f1');
    expect(children.map(i => i.id)).toEqual(['p1']);
  });

  it('returns root-level items when parentId is null', () => {
    state.setNotebookItems([folder('f1', null, 1), page('p1', 'f1', 0), folder('f2', null, 0)]);
    const roots = getChildItems(null);
    expect(roots.map(i => i.id)).toEqual(['f2', 'f1']);
  });

  it('sorts results by their order field ascending', () => {
    state.setNotebookItems([page('p3', 'f1', 2), page('p1', 'f1', 0), page('p2', 'f1', 1)]);
    expect(getChildItems('f1').map(i => i.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('does not mutate the underlying notebookItems array', () => {
    const items = [page('p2', 'f1', 1), page('p1', 'f1', 0)];
    state.setNotebookItems(items);
    getChildItems('f1');
    expect(items.map(i => i.id)).toEqual(['p2', 'p1']);
  });
});
