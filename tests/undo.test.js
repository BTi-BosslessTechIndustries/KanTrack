/**
 * Tests for undo.js — trash (no hard cap) + undo history persistence.
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
  initUndo,
  moveToTrash,
  getTrashedTasks,
  restoreFromTrash,
  permanentlyDelete,
  emptyTrash,
  getTrashCount,
  recordAction,
  canUndo,
  getUndoRedoStatus,
} from '../scripts/kantrack-modules/undo.js';
import * as state from '../scripts/kantrack-modules/state.js';

// ---------------------------------------------------------------------------
// Wait for fire-and-forget async IDB writes to complete
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
  await initUndo(); // loads trash + undo history from (empty) IDB
});

// ---------------------------------------------------------------------------
// Trash: no hard 20-item cap
// ---------------------------------------------------------------------------
describe('trash cap behaviour', () => {
  it('can hold more than 20 items (old hard cap removed)', () => {
    for (let i = 0; i < 25; i++) {
      moveToTrash({ id: `task-${i}`, title: `Task ${i}`, column: 'todo' });
    }
    expect(getTrashCount()).toBe(25);
  });

  it('maintains most-recently-deleted order (newest first)', () => {
    for (let i = 0; i < 5; i++) {
      moveToTrash({ id: `task-${i}`, title: `Task ${i}`, column: 'todo' });
    }
    const trashed = getTrashedTasks();
    expect(trashed[0].id).toBe('task-4'); // last added = first in list
  });

  it('enforces the 200-item soft cap (201st item is silently dropped)', () => {
    for (let i = 0; i < 201; i++) {
      moveToTrash({ id: `task-${i}`, title: `Task ${i}`, column: 'todo' });
    }
    expect(getTrashCount()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Trash: restore / permanent delete / empty
// ---------------------------------------------------------------------------
describe('trash operations', () => {
  it('restores a task from trash and removes it from the trash list', () => {
    const task = { id: 'restore-me', title: 'Restore Me', column: 'done' };
    moveToTrash(task);
    const restored = restoreFromTrash('restore-me');
    expect(restored.id).toBe('restore-me');
    expect(restored.trashedAt).toBeUndefined();
    expect(getTrashCount()).toBe(0);
  });

  it('permanently deletes a task from trash', () => {
    moveToTrash({ id: 'perm-del', title: 'Gone Forever', column: 'todo' });
    permanentlyDelete('perm-del');
    expect(getTrashCount()).toBe(0);
  });

  it('empties all trash', () => {
    moveToTrash({ id: 't1', title: 'A', column: 'todo' });
    moveToTrash({ id: 't2', title: 'B', column: 'todo' });
    emptyTrash();
    expect(getTrashCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Trash: IDB persistence
// ---------------------------------------------------------------------------
describe('trash IDB persistence', () => {
  it('writes trashed items to the IDB trash store', async () => {
    moveToTrash({ id: 'idb-trash-1', title: 'Persisted', column: 'inProgress' });
    await flushPromises();

    const stored = await idbGetAll('trash');
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('idb-trash-1');
    expect(stored[0]).toHaveProperty('trashedAt');
  });

  it('loads trashed items from IDB on startup (simulates page reload)', async () => {
    // Pre-populate trash store as if a previous session had run
    await idbBulkPut('trash', [
      { id: 'prev-session-task', title: 'Before Reload', column: 'done', trashedAt: Date.now() },
    ]);

    // Fresh module init (simulates page load)
    await initUndo();

    expect(getTrashCount()).toBe(1);
    expect(getTrashedTasks()[0].id).toBe('prev-session-task');
  });

  it('correctly persists trash after restore (removed item not in IDB)', async () => {
    moveToTrash({ id: 'will-restore', title: 'Temporary', column: 'todo' });
    restoreFromTrash('will-restore');
    await flushPromises();

    const stored = await idbGetAll('trash');
    expect(stored).toHaveLength(0);
  });

  it('correctly persists trash after emptyTrash', async () => {
    moveToTrash({ id: 't1', title: 'A', column: 'todo' });
    moveToTrash({ id: 't2', title: 'B', column: 'todo' });
    emptyTrash();
    await flushPromises();

    const stored = await idbGetAll('trash');
    expect(stored).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Undo history: oplog persistence (Phase 3)
// ---------------------------------------------------------------------------
describe('undo history IDB persistence', () => {
  const makeAction = n => ({
    type: 'move',
    taskId: `task-${n}`,
    previousState: { column: 'todo' },
    newState: { column: 'done' },
    description: `Move task ${n}`,
  });

  // Build a minimal oplog entry for pre-population in tests.
  const makeOplogEntry = (n, lamport, undone = false) => ({
    opId: `op-${n}`,
    deviceId: 'test-device',
    lamport,
    timestamp: Date.now(),
    entityType: 'task',
    entityId: `task-${n}`,
    actionType: 'update',
    patch: {},
    description: `Move task ${n}`,
    undone,
    prevHash: null,
    hash: null,
    _action: makeAction(n),
  });

  it('recordAction adds to undoStack and writes to oplog', async () => {
    recordAction(makeAction(1));
    expect(canUndo()).toBe(true);
    await flushPromises();

    const entries = await idbGetAll('oplog');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]._action.description).toBe('Move task 1');
  });

  it('undo history is restored from oplog on startup (simulates page reload)', async () => {
    // Pre-populate oplog as a previous session would have
    await idbBulkPut('oplog', [makeOplogEntry(42, 1, false)]);

    // Fresh init
    await initUndo();

    const status = getUndoRedoStatus();
    expect(status.canUndo).toBe(true);
    expect(status.lastUndo).toBe('Move task 42');
  });

  it('preserves undo action order across oplog save/load', async () => {
    await idbBulkPut('oplog', [
      makeOplogEntry(1, 1, false),
      makeOplogEntry(2, 2, false),
      makeOplogEntry(3, 3, false),
    ]);

    await initUndo();

    const status = getUndoRedoStatus();
    expect(status.undoCount).toBeGreaterThanOrEqual(3);
    expect(status.lastUndo).toBe('Move task 3'); // highest lamport = most recent
  });

  it('does not exceed MAX_HISTORY (200) when loading from oplog', async () => {
    const entries = Array.from({ length: 250 }, (_, i) => makeOplogEntry(i, i + 1, false));
    await idbBulkPut('oplog', entries);

    await initUndo();

    const { undoCount } = getUndoRedoStatus();
    expect(undoCount).toBeLessThanOrEqual(200);
  });
});
