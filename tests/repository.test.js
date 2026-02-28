/**
 * Tests for repository.js — persistence abstraction layer.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetLocalStorage } from './setup.js';

vi.mock('../scripts/kantrack-modules/notifications.js', () => ({
  showError: vi.fn(),
  showWarning: vi.fn(),
  showNotification: vi.fn(),
  showSuccess: vi.fn(),
}));

import { initIndexedDB, idbGetAll, idbBulkPut } from '../scripts/kantrack-modules/database.js';
import {
  getAllTasks,
  saveTasks,
  getAllNotebookItems,
  saveNotebookItems,
  getAllTags,
  saveTags,
  getAllClocks,
  saveClocks,
  getAllTrash,
  saveTrash,
  getAllUndoHistory,
  saveUndoHistory,
  safeGetItem,
  safeSetItem,
  getUIPref,
  setUIPref,
  setAutoSaveCallback,
} from '../scripts/kantrack-modules/repository.js';

// ---------------------------------------------------------------------------
// Wait for fire-and-forget IDB writes
// ---------------------------------------------------------------------------
const flushPromises = () => new Promise(resolve => setTimeout(resolve, 50));

// ---------------------------------------------------------------------------
// Fresh DB + localStorage before every test
// ---------------------------------------------------------------------------
beforeEach(async () => {
  global.indexedDB = new IDBFactory();
  resetLocalStorage();
  await initIndexedDB();
});

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const validTask = (id = 'task-1') => ({
  id,
  title: 'Test Task',
  column: 'todo',
  noteEntries: [],
  tags: [],
  timer: 0,
  actions: [{ action: 'Created', timestamp: '1/1/2024', type: 'created' }],
});

const validNotebookItem = (id = 'page-1') => ({
  id,
  type: 'page',
  parentId: null,
  name: 'My Page',
  order: 0,
  content: '<p>Hello</p>',
  images: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// ===========================================================================
// getAllTasks
// ===========================================================================
describe('getAllTasks', () => {
  it('reads tasks from IDB when populated', async () => {
    await idbBulkPut('tasks', [validTask('idb-task')]);
    const tasks = await getAllTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('idb-task');
  });

  it('falls back to localStorage when IDB is empty', async () => {
    localStorage.setItem('kanbanNotes', JSON.stringify([validTask('ls-task')]));
    const tasks = await getAllTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('ls-task');
  });

  it('returns empty array when both sources are empty', async () => {
    const tasks = await getAllTasks();
    expect(tasks).toHaveLength(0);
  });

  it('prefers IDB over localStorage when both have data', async () => {
    await idbBulkPut('tasks', [validTask('idb-wins')]);
    localStorage.setItem('kanbanNotes', JSON.stringify([validTask('ls-loses')]));
    const tasks = await getAllTasks();
    expect(tasks.find(t => t.id === 'idb-wins')).toBeDefined();
    expect(tasks.find(t => t.id === 'ls-loses')).toBeUndefined();
  });

  it('filters out tasks with invalid columns', async () => {
    await idbBulkPut('tasks', [
      validTask('good'),
      { id: 'bad', title: 'Bad', column: 'nonexistent', noteEntries: [], tags: [] },
    ]);
    const tasks = await getAllTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('good');
  });

  it('filters out deleted tasks', async () => {
    await idbBulkPut('tasks', [validTask('keep'), { ...validTask('del'), deleted: true }]);
    const tasks = await getAllTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('keep');
  });

  it('filters out tasks without a title', async () => {
    await idbBulkPut('tasks', [
      validTask('has-title'),
      { id: 'no-title', title: '', column: 'todo', noteEntries: [], tags: [] },
    ]);
    const tasks = await getAllTasks();
    expect(tasks.every(t => t.title)).toBe(true);
  });

  it('migrates old single-note format to noteEntries array', async () => {
    const old = {
      id: 'old-fmt',
      title: 'Old',
      column: 'todo',
      notes: '<p>legacy</p>',
      tags: [],
      actions: [{ timestamp: '1/1/2024' }],
    };
    localStorage.setItem('kanbanNotes', JSON.stringify([old]));
    const tasks = await getAllTasks();
    const t = tasks.find(t => t.id === 'old-fmt');
    expect(t).toBeDefined();
    expect(t.noteEntries).toHaveLength(1);
    expect(t.noteEntries[0].notesHTML).toBe('<p>legacy</p>');
    expect(t.notes).toBeUndefined();
  });

  it('adds an empty tags array to tasks that lack one', async () => {
    await idbBulkPut('tasks', [
      { id: 'no-tags', title: 'No Tags', column: 'todo', noteEntries: [] },
    ]);
    const tasks = await getAllTasks();
    expect(tasks[0].tags).toEqual([]);
  });
});

// ===========================================================================
// saveTasks
// ===========================================================================
describe('saveTasks', () => {
  it('writes tasks to localStorage synchronously', () => {
    saveTasks([validTask('t1')]);
    const stored = JSON.parse(localStorage.getItem('kanbanNotes'));
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('t1');
  });

  it('writes tasks to IDB asynchronously', async () => {
    saveTasks([validTask('t-idb')]);
    await flushPromises();
    const idbTasks = await idbGetAll('tasks');
    expect(idbTasks).toHaveLength(1);
    expect(idbTasks[0].id).toBe('t-idb');
  });

  it('replaces old IDB tasks (not appending)', async () => {
    saveTasks([validTask('first')]);
    await flushPromises();
    saveTasks([validTask('second')]);
    await flushPromises();
    const idbTasks = await idbGetAll('tasks');
    expect(idbTasks).toHaveLength(1);
    expect(idbTasks[0].id).toBe('second');
  });

  it('calls the auto-save callback', () => {
    const cb = vi.fn();
    setAutoSaveCallback(cb);
    saveTasks([validTask()]);
    expect(cb).toHaveBeenCalledTimes(1);
    setAutoSaveCallback(null); // cleanup
  });
});

// ===========================================================================
// getAllNotebookItems / saveNotebookItems
// ===========================================================================
describe('notebook items', () => {
  it('getAllNotebookItems reads from IDB when populated', async () => {
    await idbBulkPut('notebook_items', [validNotebookItem('idb-page')]);
    const items = await getAllNotebookItems();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('idb-page');
  });

  it('getAllNotebookItems falls back to localStorage', async () => {
    localStorage.setItem('notebookItems', JSON.stringify([validNotebookItem('ls-page')]));
    const items = await getAllNotebookItems();
    expect(items[0].id).toBe('ls-page');
  });

  it('saveNotebookItems writes to localStorage', () => {
    saveNotebookItems([validNotebookItem('nb-1')]);
    const stored = JSON.parse(localStorage.getItem('notebookItems'));
    expect(stored).toHaveLength(1);
  });

  it('saveNotebookItems writes to IDB async', async () => {
    saveNotebookItems([validNotebookItem('nb-idb')]);
    await flushPromises();
    const idbItems = await idbGetAll('notebook_items');
    expect(idbItems[0].id).toBe('nb-idb');
  });
});

// ===========================================================================
// getAllTags / saveTags
// ===========================================================================
describe('tags', () => {
  const tag = { id: 'work', name: 'Work', colorIndex: 3, pinned: false };

  it('getAllTags returns empty array when no data', async () => {
    const tags = await getAllTags();
    expect(tags).toEqual([]);
  });

  it('getAllTags reads from IDB', async () => {
    await idbBulkPut('tags', [tag]);
    const tags = await getAllTags();
    expect(tags[0].id).toBe('work');
  });

  it('getAllTags falls back to localStorage', async () => {
    localStorage.setItem('kantrackTags', JSON.stringify([tag]));
    const tags = await getAllTags();
    expect(tags[0].id).toBe('work');
  });

  it('saveTags writes to localStorage', () => {
    saveTags([tag]);
    const stored = JSON.parse(localStorage.getItem('kantrackTags'));
    expect(stored[0].id).toBe('work');
  });

  it('saveTags writes to IDB async', async () => {
    saveTags([tag]);
    await flushPromises();
    const idbTags = await idbGetAll('tags');
    expect(idbTags[0].id).toBe('work');
  });
});

// ===========================================================================
// getAllClocks / saveClocks
// ===========================================================================
describe('clocks', () => {
  const clock = { id: 'c1', type: 'timezone', name: 'Paris', timezone: 'Europe/Paris' };

  it('getAllClocks returns null when no data', async () => {
    const clocks = await getAllClocks();
    expect(clocks).toBeNull();
  });

  it('getAllClocks reads from IDB sorted by order', async () => {
    await idbBulkPut('clocks', [
      { ...clock, id: 'c2', order: 1 },
      { ...clock, id: 'c1', order: 0 },
    ]);
    const clocks = await getAllClocks();
    expect(clocks[0].id).toBe('c1');
    expect(clocks[1].id).toBe('c2');
  });

  it('getAllClocks falls back to localStorage', async () => {
    localStorage.setItem('kanbanClocks', JSON.stringify([clock]));
    const clocks = await getAllClocks();
    expect(clocks[0].id).toBe('c1');
  });

  it('saveClocks writes to localStorage', () => {
    saveClocks([clock]);
    const stored = JSON.parse(localStorage.getItem('kanbanClocks'));
    expect(stored[0].id).toBe('c1');
  });

  it('saveClocks adds order field when writing to IDB', async () => {
    saveClocks([clock, { ...clock, id: 'c2', name: 'NY' }]);
    await flushPromises();
    const idbClocks = await idbGetAll('clocks');
    const sorted = idbClocks.sort((a, b) => a.order - b.order);
    expect(sorted[0].order).toBe(0);
    expect(sorted[1].order).toBe(1);
  });
});

// ===========================================================================
// getAllTrash / saveTrash
// ===========================================================================
describe('trash', () => {
  const trashedTask = { id: 't1', title: 'Gone', column: 'todo', trashedAt: Date.now() };

  it('getAllTrash returns empty array when no data', async () => {
    const trash = await getAllTrash();
    expect(trash).toEqual([]);
  });

  it('getAllTrash reads from IDB sorted newest-first', async () => {
    const older = { ...trashedTask, id: 't-old', trashedAt: 1000 };
    const newer = { ...trashedTask, id: 't-new', trashedAt: 9000 };
    await idbBulkPut('trash', [older, newer]);
    const trash = await getAllTrash();
    expect(trash[0].id).toBe('t-new');
  });

  it('getAllTrash falls back to localStorage', async () => {
    localStorage.setItem('kantrackTrash', JSON.stringify([trashedTask]));
    const trash = await getAllTrash();
    expect(trash[0].id).toBe('t1');
  });

  it('saveTrash writes to localStorage', () => {
    saveTrash([trashedTask]);
    const stored = JSON.parse(localStorage.getItem('kantrackTrash'));
    expect(stored[0].id).toBe('t1');
  });

  it('saveTrash writes to IDB async', async () => {
    saveTrash([trashedTask]);
    await flushPromises();
    const idbTrash = await idbGetAll('trash');
    expect(idbTrash[0].id).toBe('t1');
  });
});

// ===========================================================================
// getAllUndoHistory / saveUndoHistory
// ===========================================================================
describe('undo history', () => {
  const entry = {
    action: { type: 'move', taskId: 't1', description: 'Move' },
    savedAt: Date.now(),
  };

  it('getAllUndoHistory returns empty array when no data', async () => {
    const hist = await getAllUndoHistory();
    expect(hist).toEqual([]);
  });

  it('getAllUndoHistory reads from IDB', async () => {
    await idbBulkPut('undo_history', [entry]);
    const hist = await getAllUndoHistory();
    expect(hist).toHaveLength(1);
    expect(hist[0].action.type).toBe('move');
  });

  it('saveUndoHistory writes to IDB async', async () => {
    saveUndoHistory([entry]);
    await flushPromises();
    const idbHist = await idbGetAll('undo_history');
    expect(idbHist).toHaveLength(1);
  });
});

// ===========================================================================
// safeGetItem / safeSetItem
// ===========================================================================
describe('safeGetItem / safeSetItem', () => {
  it('safeSetItem stores JSON-stringified value', () => {
    safeSetItem('foo', { bar: 42 });
    expect(localStorage.getItem('foo')).toBe('{"bar":42}');
  });

  it('safeGetItem returns parsed value', () => {
    localStorage.setItem('foo', '{"bar":42}');
    expect(safeGetItem('foo', null)).toEqual({ bar: 42 });
  });

  it('safeGetItem returns defaultValue when key is missing', () => {
    expect(safeGetItem('missing', 'default')).toBe('default');
  });

  it('safeGetItem returns defaultValue on parse error', () => {
    localStorage.setItem('bad', 'not-json{{{');
    expect(safeGetItem('bad', 'fallback')).toBe('fallback');
  });
});

// ===========================================================================
// getUIPref / setUIPref
// ===========================================================================
describe('getUIPref / setUIPref', () => {
  it('setUIPref persists and getUIPref retrieves value', () => {
    setUIPref('sidebarOpen', true);
    expect(getUIPref('sidebarOpen', false)).toBe(true);
  });

  it('getUIPref returns defaultValue when key is absent', () => {
    expect(getUIPref('nonexistent', 99)).toBe(99);
  });
});
