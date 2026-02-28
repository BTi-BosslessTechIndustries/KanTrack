/**
 * Tests for storage.js — IDB-first loading with localStorage fallback.
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
  loadNotesFromLocalStorage,
  saveNotesToLocalStorage,
  loadNotebookFromLocalStorage,
  saveNotebookToLocalStorage,
} from '../scripts/kantrack-modules/storage.js';
import * as state from '../scripts/kantrack-modules/state.js';

// ---------------------------------------------------------------------------
// Wait for fire-and-forget IDB writes
// ---------------------------------------------------------------------------
const flushPromises = () => new Promise(resolve => setTimeout(resolve, 50));

// ---------------------------------------------------------------------------
// Fresh DB + state before every test
// ---------------------------------------------------------------------------
beforeEach(async () => {
  global.indexedDB = new IDBFactory();
  resetLocalStorage();
  state.setNotesData([]);
  state.setNotebookItems([]);
  await initIndexedDB();
});

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------
const validTask = (id = 'task-1') => ({
  id,
  title: 'Test Task',
  column: 'todo',
  noteEntries: [],
  tags: [],
  timer: 0,
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

// ---------------------------------------------------------------------------
// loadNotesFromLocalStorage — IDB primary source
// ---------------------------------------------------------------------------
describe('loadNotesFromLocalStorage', () => {
  it('reads tasks from IDB when the tasks store is populated', async () => {
    await idbBulkPut('tasks', [validTask('idb-task')]);

    const notes = await loadNotesFromLocalStorage();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe('idb-task');
  });

  it('falls back to localStorage when the IDB tasks store is empty', async () => {
    localStorage.setItem('kanbanNotes', JSON.stringify([validTask('ls-task')]));

    const notes = await loadNotesFromLocalStorage();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe('ls-task');
  });

  it('returns an empty array when both IDB and localStorage are empty', async () => {
    const notes = await loadNotesFromLocalStorage();
    expect(notes).toHaveLength(0);
  });

  it('filters out tasks with invalid columns (cleanupNotesData)', async () => {
    await idbBulkPut('tasks', [
      validTask('good'),
      { id: 'bad', title: 'Bad Column', column: 'nonexistent', noteEntries: [], tags: [] },
    ]);

    const notes = await loadNotesFromLocalStorage();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe('good');
  });

  it('filters out tasks marked as deleted', async () => {
    await idbBulkPut('tasks', [validTask('keep'), { ...validTask('del'), deleted: true }]);

    const notes = await loadNotesFromLocalStorage();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe('keep');
  });

  it('filters out tasks without a title', async () => {
    await idbBulkPut('tasks', [
      validTask('has-title'),
      { id: 'no-title', title: '', column: 'todo', noteEntries: [], tags: [] },
    ]);

    const notes = await loadNotesFromLocalStorage();
    expect(notes.every(n => n.title)).toBe(true);
  });

  it('migrates old single-note format (notes field → noteEntries array)', async () => {
    const oldFormat = {
      id: 'old-fmt',
      title: 'Old Task',
      column: 'todo',
      notes: '<p>legacy note</p>',
      tags: [],
      actions: [{ timestamp: '1/1/2024' }],
    };
    localStorage.setItem('kanbanNotes', JSON.stringify([oldFormat]));

    const notes = await loadNotesFromLocalStorage();
    const task = notes.find(n => n.id === 'old-fmt');
    expect(task).toBeDefined();
    expect(task.noteEntries).toHaveLength(1);
    expect(task.noteEntries[0].notesHTML).toBe('<p>legacy note</p>');
    expect(task.notes).toBeUndefined();
  });

  it('adds an empty tags array to tasks that lack one', async () => {
    await idbBulkPut('tasks', [
      { id: 'no-tags', title: 'No Tags', column: 'todo', noteEntries: [] },
    ]);

    const notes = await loadNotesFromLocalStorage();
    expect(notes[0].tags).toEqual([]);
  });

  it('prefers IDB over localStorage when both have data', async () => {
    await idbBulkPut('tasks', [validTask('idb-wins')]);
    localStorage.setItem('kanbanNotes', JSON.stringify([validTask('ls-loses')]));

    const notes = await loadNotesFromLocalStorage();
    expect(notes.find(n => n.id === 'idb-wins')).toBeDefined();
    expect(notes.find(n => n.id === 'ls-loses')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// saveNotesToLocalStorage — writes to both localStorage and IDB
// ---------------------------------------------------------------------------
describe('saveNotesToLocalStorage', () => {
  it('writes tasks to localStorage synchronously', () => {
    state.setNotesData([validTask()]);
    saveNotesToLocalStorage();

    const stored = JSON.parse(localStorage.getItem('kanbanNotes'));
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('task-1');
  });

  it('writes tasks to the IDB tasks store (async)', async () => {
    state.setNotesData([validTask('saved-idb')]);
    saveNotesToLocalStorage();
    await flushPromises();

    const idbTasks = await idbGetAll('tasks');
    expect(idbTasks).toHaveLength(1);
    expect(idbTasks[0].id).toBe('saved-idb');
  });

  it('replaces old IDB tasks on each save (not appending)', async () => {
    state.setNotesData([validTask('first')]);
    saveNotesToLocalStorage();
    await flushPromises();

    state.setNotesData([validTask('second')]);
    saveNotesToLocalStorage();
    await flushPromises();

    const idbTasks = await idbGetAll('tasks');
    expect(idbTasks).toHaveLength(1);
    expect(idbTasks[0].id).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// loadNotebookFromLocalStorage
// ---------------------------------------------------------------------------
describe('loadNotebookFromLocalStorage', () => {
  it('reads notebook items from IDB when populated', async () => {
    await idbBulkPut('notebook_items', [validNotebookItem('idb-page')]);

    const items = await loadNotebookFromLocalStorage();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('idb-page');
  });

  it('falls back to localStorage when IDB notebook_items store is empty', async () => {
    localStorage.setItem('notebookItems', JSON.stringify([validNotebookItem('ls-page')]));

    const items = await loadNotebookFromLocalStorage();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('ls-page');
  });

  it('returns empty array when both sources are empty', async () => {
    const items = await loadNotebookFromLocalStorage();
    expect(items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// saveNotebookToLocalStorage
// ---------------------------------------------------------------------------
describe('saveNotebookToLocalStorage', () => {
  it('writes notebook items to localStorage synchronously', () => {
    state.setNotebookItems([validNotebookItem()]);
    saveNotebookToLocalStorage();

    const stored = JSON.parse(localStorage.getItem('notebookItems'));
    expect(stored).toHaveLength(1);
  });

  it('writes notebook items to IDB (async)', async () => {
    state.setNotebookItems([validNotebookItem('nb-idb')]);
    saveNotebookToLocalStorage();
    await flushPromises();

    const idbItems = await idbGetAll('notebook_items');
    expect(idbItems).toHaveLength(1);
    expect(idbItems[0].id).toBe('nb-idb');
  });
});
