import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import * as state from '../scripts/kantrack-modules/state.js';
import { resetLocalStorage } from './setup.js';

vi.mock('../scripts/kantrack-modules/notifications.js', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showAutoSaveIndicator: vi.fn(),
}));

import { selectDoneOverflow } from '../scripts/kantrack-modules/done-capacity.js';

function doneTask(id, doneAt) {
  return {
    id,
    title: `Task ${id}`,
    column: 'done',
    noteEntries: [],
    tags: [],
    timer: 0,
    actions: [],
    doneAt,
  };
}

describe('selectDoneOverflow', () => {
  beforeEach(() => {
    global.indexedDB = new IDBFactory();
    resetLocalStorage();
    state.setNotesData([]);
  });

  it('returns an empty array when the Done column is below the cap', () => {
    const tasks = Array.from({ length: 29 }, (_, i) => doneTask(`t${i}`, 1000 + i));
    state.setNotesData(tasks);

    expect(selectDoneOverflow(state.notesData)).toEqual([]);
  });

  it('returns the oldest 15 Done tasks, sorted ascending by doneAt, when at the cap', () => {
    // 30 tasks with doneAt values 1000..1029 in shuffled order
    const tasks = Array.from({ length: 30 }, (_, i) => doneTask(`t${i}`, 1029 - i));
    state.setNotesData(tasks);

    const overflow = selectDoneOverflow(state.notesData);

    expect(overflow).toHaveLength(15);
    // The 15 oldest are doneAt 1000..1014, which correspond to ids t29..t15
    expect(overflow.map(t => t.doneAt)).toEqual([
      1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014,
    ]);
    // Result must be sorted ascending
    for (let i = 1; i < overflow.length; i++) {
      expect(overflow[i].doneAt).toBeGreaterThanOrEqual(overflow[i - 1].doneAt);
    }
  });

  it('still returns 15 when the column has overshot the cap (bulk arrival)', () => {
    const tasks = Array.from({ length: 35 }, (_, i) => doneTask(`t${i}`, 1000 + i));
    state.setNotesData(tasks);

    expect(selectDoneOverflow(state.notesData)).toHaveLength(15);
  });

  it('ignores deleted tasks and tasks in other columns', () => {
    const tasks = [
      ...Array.from({ length: 28 }, (_, i) => doneTask(`d${i}`, 1000 + i)),
      { ...doneTask('trashed', 5000), deleted: true },
      { ...doneTask('elsewhere', 6000), column: 'todo' },
    ];
    state.setNotesData(tasks);

    // Only 28 *eligible* Done tasks — below the cap, so no overflow
    expect(selectDoneOverflow(state.notesData)).toEqual([]);
  });

  it('backfills a missing doneAt on stragglers before sorting, and persists the change', () => {
    const tasks = [
      ...Array.from({ length: 29 }, (_, i) => doneTask(`t${i}`, 1000 + i)),
      doneTask('straggler', undefined),
    ];
    state.setNotesData(tasks);

    const before = Date.now();
    const overflow = selectDoneOverflow(state.notesData);
    const after = Date.now();

    const straggler = state.notesData.find(t => t.id === 'straggler');
    expect(straggler.doneAt).toBeGreaterThanOrEqual(before);
    expect(straggler.doneAt).toBeLessThanOrEqual(after);
    // It now has the largest doneAt, so it must NOT be among the oldest 15
    expect(overflow.find(t => t.id === 'straggler')).toBeUndefined();
  });
});
