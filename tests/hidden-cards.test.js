import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import * as state from '../scripts/kantrack-modules/state.js';
import { resetLocalStorage } from './setup.js';

vi.mock('../scripts/kantrack-modules/notifications.js', () => ({
  showNotification: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showAutoSaveIndicator: vi.fn(),
}));

import {
  hideCard,
  showCard,
  showCards,
  getHiddenTasks,
  getHiddenCount,
  countHiddenMatches,
} from '../scripts/kantrack-modules/hidden-cards.js';
import { initUndo, undo, redo, canUndo, recordAction } from '../scripts/kantrack-modules/undo.js';
import { initIndexedDB } from '../scripts/kantrack-modules/database.js';
import { deepClone } from '../scripts/kantrack-modules/utils.js';

function task(id, overrides = {}) {
  return {
    id,
    title: `Task ${id}`,
    column: 'onHold',
    noteEntries: [],
    tags: [],
    timer: 0,
    actions: [],
    ...overrides,
  };
}

describe('hideCard / showCard', () => {
  beforeEach(async () => {
    // Flush any pending fire-and-forget oplog writes from the previous test
    // before swapping in a fresh IDBFactory, so they don't leak into the new DB.
    await new Promise(resolve => setTimeout(resolve, 0));
    global.indexedDB = new IDBFactory();
    resetLocalStorage();
    state.setNotesData([]);
    await initIndexedDB();
    await initUndo();
  });

  it('marks a task hidden and stamps hiddenAt', () => {
    state.setNotesData([task('a')]);
    hideCard('a');
    const t = state.notesData.find(x => x.id === 'a');
    expect(t.hidden).toBe(true);
    expect(typeof t.hiddenAt).toBe('number');
  });

  it('is a no-op for an already-hidden task', () => {
    state.setNotesData([task('a', { hidden: true, hiddenAt: 123 })]);
    hideCard('a');
    expect(state.notesData[0].hiddenAt).toBe(123);
  });

  it('is a no-op for a task in the In Progress column', () => {
    state.setNotesData([task('a', { column: 'inProgress' })]);
    hideCard('a');
    expect(state.notesData[0].hidden).toBeFalsy();
    expect(canUndo()).toBe(false);
  });

  it('is a no-op for a task in the Done column', () => {
    state.setNotesData([task('a', { column: 'done' })]);
    hideCard('a');
    expect(state.notesData[0].hidden).toBeFalsy();
    expect(canUndo()).toBe(false);
  });

  it('hides a task in the To Do column', () => {
    state.setNotesData([task('a', { column: 'todo' })]);
    hideCard('a');
    expect(state.notesData[0].hidden).toBe(true);
  });

  it('records an undo entry that restores the task to visible', () => {
    state.setNotesData([task('a')]);
    hideCard('a');
    expect(canUndo()).toBe(true);

    undo();
    expect(state.notesData.find(x => x.id === 'a').hidden).toBe(false);
  });

  it('redo re-hides the task', () => {
    state.setNotesData([task('a')]);
    hideCard('a');
    undo();
    redo();
    expect(state.notesData.find(x => x.id === 'a').hidden).toBe(true);
  });

  it('showCard clears hidden and is undoable', () => {
    state.setNotesData([task('a', { hidden: true, hiddenAt: 999 })]);
    showCard('a');
    expect(state.notesData[0].hidden).toBe(false);

    undo();
    expect(state.notesData.find(x => x.id === 'a').hidden).toBe(true);
  });

  it('showCard is a no-op for a task that is not hidden', () => {
    state.setNotesData([task('a')]);
    showCard('a');
    expect(canUndo()).toBe(false);
  });
});

describe('getHiddenTasks / getHiddenCount', () => {
  beforeEach(async () => {
    // Flush any pending fire-and-forget oplog writes from the previous test
    // before swapping in a fresh IDBFactory, so they don't leak into the new DB.
    await new Promise(resolve => setTimeout(resolve, 0));
    global.indexedDB = new IDBFactory();
    resetLocalStorage();
    state.setNotesData([]);
    await initIndexedDB();
    await initUndo();
  });

  it('returns only hidden, non-deleted tasks, most-recently-hidden first', () => {
    state.setNotesData([
      task('a', { hidden: true, hiddenAt: 100 }),
      task('b'),
      task('c', { hidden: true, hiddenAt: 200 }),
      task('d', { hidden: true, hiddenAt: 50, deleted: true }),
    ]);

    expect(getHiddenTasks().map(t => t.id)).toEqual(['c', 'a']);
    expect(getHiddenCount()).toBe(2);
  });
});

describe('showCards', () => {
  beforeEach(async () => {
    // Flush any pending fire-and-forget oplog writes from the previous test
    // before swapping in a fresh IDBFactory, so they don't leak into the new DB.
    await new Promise(resolve => setTimeout(resolve, 0));
    global.indexedDB = new IDBFactory();
    resetLocalStorage();
    state.setNotesData([]);
    await initIndexedDB();
    await initUndo();
  });

  it('shows every task in the given list', () => {
    state.setNotesData([
      task('a', { hidden: true, hiddenAt: 1 }),
      task('b', { hidden: true, hiddenAt: 2 }),
      task('c', { hidden: true, hiddenAt: 3 }),
    ]);

    showCards(['a', 'b']);

    expect(state.notesData.find(t => t.id === 'a').hidden).toBe(false);
    expect(state.notesData.find(t => t.id === 'b').hidden).toBe(false);
    expect(state.notesData.find(t => t.id === 'c').hidden).toBe(true);
  });

  it('records one undo entry per task (undo restores them one at a time)', () => {
    state.setNotesData([
      task('a', { hidden: true, hiddenAt: 1 }),
      task('b', { hidden: true, hiddenAt: 2 }),
    ]);

    showCards(['a', 'b']);

    undo();
    expect(state.notesData.find(t => t.id === 'b').hidden).toBe(true);
    expect(state.notesData.find(t => t.id === 'a').hidden).toBe(false);

    undo();
    expect(state.notesData.find(t => t.id === 'a').hidden).toBe(true);
  });
});

describe('countHiddenMatches', () => {
  beforeEach(async () => {
    // Flush any pending fire-and-forget oplog writes from the previous test
    // before swapping in a fresh IDBFactory, so they don't leak into the new DB.
    await new Promise(resolve => setTimeout(resolve, 0));
    global.indexedDB = new IDBFactory();
    resetLocalStorage();
    state.setNotesData([]);
    await initIndexedDB();
    await initUndo();
  });

  it('counts hidden tasks whose searchable text matches the query', () => {
    state.setNotesData([
      task('a', { title: 'Renew domain', hidden: true, hiddenAt: 1 }),
      task('b', { title: 'Renew SSL cert', hidden: true, hiddenAt: 2 }),
      task('c', { title: 'Other task', hidden: true, hiddenAt: 3 }),
      task('d', { title: 'Renew visible', hidden: false }),
    ]);

    expect(countHiddenMatches('renew')).toBe(2);
    expect(countHiddenMatches('')).toBe(0);
    expect(countHiddenMatches('zzz')).toBe(0);
  });
});

describe('hide then delete interaction', () => {
  beforeEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    global.indexedDB = new IDBFactory();
    resetLocalStorage();
    state.setNotesData([]);
    await initIndexedDB();
    await initUndo();
  });

  it('preserves the hidden flag when undoing the deletion of a hidden task', () => {
    state.setNotesData([task('a')]);
    hideCard('a');

    // Simulate deleteNote('a'): record a 'delete' action with a snapshot
    // taken while the task is still hidden, then mark it deleted.
    const t = state.notesData.find(x => x.id === 'a');
    recordAction({
      type: 'delete',
      taskId: 'a',
      previousState: deepClone(t),
      newState: null,
      description: 'Delete task "Task a"',
    });
    t.deleted = true;

    // Undo the delete: the restored task should still be hidden.
    undo();
    const restored = state.notesData.find(x => x.id === 'a');
    expect(restored.deleted).toBeUndefined();
    expect(restored.hidden).toBe(true);
    expect(getHiddenTasks().map(x => x.id)).toEqual(['a']);
  });
});
