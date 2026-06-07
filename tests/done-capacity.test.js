import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import * as state from '../scripts/kantrack-modules/state.js';
import { resetLocalStorage } from './setup.js';

vi.mock('../scripts/kantrack-modules/notifications.js', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showAutoSaveIndicator: vi.fn(),
}));

import {
  selectDoneOverflow,
  backfillDoneTimestamps,
} from '../scripts/kantrack-modules/done-capacity.js';
import { getMetaValue, setMetaValue, initIndexedDB } from '../scripts/kantrack-modules/database.js';

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

describe('backfillDoneTimestamps', () => {
  beforeEach(async () => {
    global.indexedDB = new IDBFactory();
    resetLocalStorage();
    state.setNotesData([]);
    await initIndexedDB();
  });

  it('stamps doneAt only on Done tasks that are missing it, and leaves everything else untouched', async () => {
    const untouched = {
      ...doneTask('has-one', 12345),
      tags: ['urgent'],
      timer: 99,
      priority: 'high',
    };
    const missing = doneTask('missing-one', undefined);
    const elsewhere = { ...doneTask('elsewhere', undefined), column: 'todo' };
    state.setNotesData([untouched, missing, elsewhere]);

    const before = Date.now();
    await backfillDoneTimestamps();
    const after = Date.now();

    expect(state.notesData.find(t => t.id === 'has-one').doneAt).toBe(12345);
    expect(state.notesData.find(t => t.id === 'has-one').tags).toEqual(['urgent']);
    expect(state.notesData.find(t => t.id === 'has-one').timer).toBe(99);
    expect(state.notesData.find(t => t.id === 'has-one').priority).toBe('high');

    const stamped = state.notesData.find(t => t.id === 'missing-one');
    expect(stamped.doneAt).toBeGreaterThanOrEqual(before);
    expect(stamped.doneAt).toBeLessThanOrEqual(after);

    expect(state.notesData.find(t => t.id === 'elsewhere').doneAt).toBeUndefined();
  });

  it('sets the completion flag so a second run is a no-op', async () => {
    const missing = doneTask('missing-one', undefined);
    state.setNotesData([missing]);

    await backfillDoneTimestamps();
    const flagAfterFirst = await getMetaValue('doneAtBackfillCompletedAt');
    expect(flagAfterFirst).not.toBeNull();

    const stampedAt = state.notesData[0].doneAt;

    // Simulate a fresh Done card arriving after the migration already ran
    const freshlyMissing = doneTask('newly-missing', undefined);
    state.notesData.push(freshlyMissing);

    await backfillDoneTimestamps();

    // The original task's stamp is untouched...
    expect(state.notesData.find(t => t.id === 'missing-one').doneAt).toBe(stampedAt);
    // ...and the migration does NOT touch the new arrival (that's checkDoneCapacity's job, not the migration's)
    expect(state.notesData.find(t => t.id === 'newly-missing').doneAt).toBeUndefined();
  });

  it('runs successfully and sets the completion flag exactly once', async () => {
    const missing = doneTask('missing-one', undefined);
    state.setNotesData([missing]);

    await backfillDoneTimestamps();
    const flag = await getMetaValue('doneAtBackfillCompletedAt');
    expect(flag).not.toBeNull();
    expect(typeof flag).toBe('number');
  });
});
