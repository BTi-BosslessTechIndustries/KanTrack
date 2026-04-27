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
  getNotebookItemContent,
  saveNotebookContentBackup,
  deleteNotebookContentBackup,
  getAllTags,
  saveTags,
  getAllClocks,
  saveClocks,
  getAllTrash,
  saveTrash,
  getAllUndoHistory,
  saveUndoHistory,
  getAllOplogEntries,
  appendOplogEntry,
  updateOplogEntry,
  clearUndoneOplogEntries,
  deleteOplogEntriesOlderThan,
  safeGetItem,
  safeSetItem,
  getUIPref,
  setUIPref,
  setAutoSaveCallback,
  flushPendingIDBWrites,
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

  it('prefers localStorage over IDB when both have data (localStorage is always the freshest sync write)', async () => {
    await idbBulkPut('tasks', [validTask('idb-stale')]);
    localStorage.setItem('kanbanNotes', JSON.stringify([validTask('ls-wins')]));
    const tasks = await getAllTasks();
    expect(tasks.find(t => t.id === 'ls-wins')).toBeDefined();
    expect(tasks.find(t => t.id === 'idb-stale')).toBeUndefined();
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

  it('keeps soft-deleted tasks (undo system needs them for redo)', async () => {
    await idbBulkPut('tasks', [validTask('keep'), { ...validTask('del'), deleted: true }]);
    const tasks = await getAllTasks();
    expect(tasks).toHaveLength(2);
    expect(tasks.find(t => t.id === 'del')).toBeDefined();
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

  it('writes tasks to IDB after debounce fires', async () => {
    vi.useFakeTimers();
    saveTasks([validTask('t-idb')]);
    await vi.advanceTimersByTimeAsync(350);
    const idbTasks = await idbGetAll('tasks');
    expect(idbTasks).toHaveLength(1);
    expect(idbTasks[0].id).toBe('t-idb');
    vi.useRealTimers();
  });

  it('replaces old IDB tasks (not appending)', async () => {
    vi.useFakeTimers();
    saveTasks([validTask('first')]);
    await vi.advanceTimersByTimeAsync(350);
    saveTasks([validTask('second')]);
    await vi.advanceTimersByTimeAsync(350);
    const idbTasks = await idbGetAll('tasks');
    expect(idbTasks).toHaveLength(1);
    expect(idbTasks[0].id).toBe('second');
    vi.useRealTimers();
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
// saveTasks — debounce behaviour
// ===========================================================================
describe('saveTasks — debounced IDB writes', () => {
  it('does not write to IDB before the debounce timer fires', async () => {
    vi.useFakeTimers();
    saveTasks([validTask('early')]);
    // Timer hasn't fired yet — IDB should be empty
    const idbTasks = await idbGetAll('tasks');
    expect(idbTasks).toHaveLength(0);
    vi.useRealTimers();
  });

  it('coalesces rapid calls and writes only the last snapshot', async () => {
    vi.useFakeTimers();
    saveTasks([validTask('call-1')]);
    await vi.advanceTimersByTimeAsync(100); // partial — no fire yet
    saveTasks([validTask('call-2')]); // resets timer
    await vi.advanceTimersByTimeAsync(100); // still < 300ms from last call
    expect(await idbGetAll('tasks')).toHaveLength(0); // not yet
    await vi.advanceTimersByTimeAsync(250); // total 350ms from last call — fires
    const idbTasks = await idbGetAll('tasks');
    expect(idbTasks).toHaveLength(1);
    expect(idbTasks[0].id).toBe('call-2'); // last call's snapshot wins
    vi.useRealTimers();
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

  it('saveNotebookItems writes to IDB after debounce fires', async () => {
    vi.useFakeTimers();
    saveNotebookItems([validNotebookItem('nb-idb')]);
    await vi.advanceTimersByTimeAsync(350);
    const idbItems = await idbGetAll('notebook_items');
    expect(idbItems[0].id).toBe('nb-idb');
    vi.useRealTimers();
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
    flushPendingIDBWrites();
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

// ===========================================================================
// Phase 3: oplog repository functions
// ===========================================================================

const makeOplogEntry = (opId, lamport = 1, undone = false, timestampOverride = null) => ({
  opId,
  deviceId: 'test-device',
  lamport,
  timestamp: timestampOverride ?? Date.now(),
  entityType: 'task',
  entityId: 'task-1',
  actionType: 'update',
  patch: { column: { prev: 'todo', next: 'done' } },
  description: `Op ${opId}`,
  undone,
  prevHash: null,
  hash: null,
  _action: { type: 'move', taskId: 'task-1', description: `Op ${opId}` },
});

describe('getAllOplogEntries', () => {
  it('returns empty array when oplog is empty', async () => {
    const entries = await getAllOplogEntries();
    expect(entries).toEqual([]);
  });

  it('returns all entries sorted by lamport ascending', async () => {
    await idbBulkPut('oplog', [
      makeOplogEntry('op-3', 3),
      makeOplogEntry('op-1', 1),
      makeOplogEntry('op-2', 2),
    ]);
    const entries = await getAllOplogEntries();
    expect(entries).toHaveLength(3);
    expect(entries.map(e => e.lamport)).toEqual([1, 2, 3]);
  });
});

describe('appendOplogEntry', () => {
  it('writes an entry to the oplog store', async () => {
    await appendOplogEntry(makeOplogEntry('op-new', 5));
    const stored = await idbGetAll('oplog');
    expect(stored).toHaveLength(1);
    expect(stored[0].opId).toBe('op-new');
  });

  it('does not throw on a second call with a different opId', async () => {
    await appendOplogEntry(makeOplogEntry('op-a', 1));
    await expect(appendOplogEntry(makeOplogEntry('op-b', 2))).resolves.toBeUndefined();
    const stored = await idbGetAll('oplog');
    expect(stored).toHaveLength(2);
  });
});

describe('updateOplogEntry', () => {
  it('merges changes into an existing entry', async () => {
    await appendOplogEntry(makeOplogEntry('op-upd', 1, false));
    await updateOplogEntry('op-upd', { undone: true });
    const all = await idbGetAll('oplog');
    expect(all[0].undone).toBe(true);
  });

  it('does nothing when the opId does not exist', async () => {
    await expect(updateOplogEntry('ghost-op', { undone: true })).resolves.toBeUndefined();
    const all = await idbGetAll('oplog');
    expect(all).toHaveLength(0);
  });

  it('preserves un-changed fields after update', async () => {
    await appendOplogEntry(makeOplogEntry('op-p', 7, false));
    await updateOplogEntry('op-p', { undone: true });
    const all = await idbGetAll('oplog');
    expect(all[0].lamport).toBe(7);
    expect(all[0].deviceId).toBe('test-device');
  });
});

describe('clearUndoneOplogEntries', () => {
  it('deletes all entries where undone is true', async () => {
    await idbBulkPut('oplog', [
      makeOplogEntry('op-keep', 1, false),
      makeOplogEntry('op-del', 2, true),
    ]);
    await clearUndoneOplogEntries();
    const all = await idbGetAll('oplog');
    expect(all).toHaveLength(1);
    expect(all[0].opId).toBe('op-keep');
  });

  it('is safe when there are no undone entries', async () => {
    await idbBulkPut('oplog', [makeOplogEntry('op-x', 1, false)]);
    await expect(clearUndoneOplogEntries()).resolves.toBeUndefined();
    expect(await idbGetAll('oplog')).toHaveLength(1);
  });

  it('resolves cleanly on an empty oplog', async () => {
    await expect(clearUndoneOplogEntries()).resolves.toBeUndefined();
  });
});

describe('deleteOplogEntriesOlderThan', () => {
  it('deletes only undone entries older than the cutoff', async () => {
    const oldTime = Date.now() - 10_000;
    const nowTime = Date.now();
    await idbBulkPut('oplog', [
      makeOplogEntry('old-undone', 1, true, oldTime),
      makeOplogEntry('old-done', 2, false, oldTime),
      makeOplogEntry('new-undone', 3, true, nowTime),
    ]);
    await deleteOplogEntriesOlderThan(Date.now() - 5_000); // cutoff = 5 seconds ago
    const remaining = await idbGetAll('oplog');
    const ids = remaining.map(e => e.opId);
    expect(ids).toContain('old-done');
    expect(ids).toContain('new-undone');
    expect(ids).not.toContain('old-undone');
  });

  it('does nothing when all undone entries are within the cutoff window', async () => {
    await idbBulkPut('oplog', [makeOplogEntry('recent-undone', 1, true, Date.now())]);
    await deleteOplogEntriesOlderThan(Date.now() - 60_000); // 1 minute ago — recent entry is newer
    expect(await idbGetAll('oplog')).toHaveLength(1);
  });

  it('resolves cleanly on an empty oplog', async () => {
    await expect(deleteOplogEntriesOlderThan(Date.now())).resolves.toBeUndefined();
  });
});

// ===========================================================================
// getNotebookItemContent — IDB → notebookItems localStorage → notebookContent_<id>
// ===========================================================================
describe('getNotebookItemContent', () => {
  it('returns empty string when all sources are empty', async () => {
    const content = await getNotebookItemContent('page-missing');
    expect(content).toBe('');
  });

  it('returns content from IDB when available', async () => {
    await idbBulkPut('notebook_items', [validNotebookItem('idb-page')]);
    const content = await getNotebookItemContent('idb-page');
    expect(content).toBe('<p>Hello</p>');
  });

  it('falls back to notebookItems localStorage when IDB is empty', async () => {
    localStorage.setItem(
      'notebookItems',
      JSON.stringify([{ ...validNotebookItem('ls-page'), content: '<p>from-ls</p>' }])
    );
    const content = await getNotebookItemContent('ls-page');
    expect(content).toBe('<p>from-ls</p>');
  });

  it('falls back to notebookContent_<id> when both IDB and notebookItems are empty', async () => {
    localStorage.setItem('notebookContent_backup-page', '<p>backup content</p>');
    const content = await getNotebookItemContent('backup-page');
    expect(content).toBe('<p>backup content</p>');
  });

  it('prefers IDB content over the notebookContent_<id> backup', async () => {
    await idbBulkPut('notebook_items', [
      { ...validNotebookItem('prefer-idb'), content: '<p>idb-wins</p>' },
    ]);
    localStorage.setItem('notebookContent_prefer-idb', '<p>backup-loses</p>');
    const content = await getNotebookItemContent('prefer-idb');
    expect(content).toBe('<p>idb-wins</p>');
  });

  it('prefers notebookItems localStorage over the notebookContent_<id> backup', async () => {
    localStorage.setItem(
      'notebookItems',
      JSON.stringify([{ ...validNotebookItem('ls-wins'), content: '<p>ls-content</p>' }])
    );
    localStorage.setItem('notebookContent_ls-wins', '<p>backup-loses</p>');
    const content = await getNotebookItemContent('ls-wins');
    expect(content).toBe('<p>ls-content</p>');
  });
});

// ===========================================================================
// saveNotebookContentBackup / deleteNotebookContentBackup
// ===========================================================================
describe('saveNotebookContentBackup', () => {
  it('writes raw HTML to the notebookContent_<id> key', () => {
    saveNotebookContentBackup('page-1', '<p>my content</p>');
    expect(localStorage.getItem('notebookContent_page-1')).toBe('<p>my content</p>');
  });

  it('overwrites existing backup on a second call', () => {
    saveNotebookContentBackup('page-1', '<p>first</p>');
    saveNotebookContentBackup('page-1', '<p>updated</p>');
    expect(localStorage.getItem('notebookContent_page-1')).toBe('<p>updated</p>');
  });

  it('stores raw HTML — not JSON-wrapped', () => {
    const html = '<p>raw &amp; unencoded</p>';
    saveNotebookContentBackup('page-raw', html);
    expect(localStorage.getItem('notebookContent_page-raw')).toBe(html);
  });
});

describe('deleteNotebookContentBackup', () => {
  it('removes the notebookContent_<id> key', () => {
    localStorage.setItem('notebookContent_del-page', '<p>to be deleted</p>');
    deleteNotebookContentBackup('del-page');
    expect(localStorage.getItem('notebookContent_del-page')).toBeNull();
  });

  it('is a no-op when the key does not exist', () => {
    expect(() => deleteNotebookContentBackup('ghost-page')).not.toThrow();
    expect(localStorage.getItem('notebookContent_ghost-page')).toBeNull();
  });
});
