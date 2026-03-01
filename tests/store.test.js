/**
 * Tests for store.js — minimal flux-like state management.
 *
 * store.js is pure JS with no DOM/IDB dependencies, so no mocks needed.
 * Module-level state persists within a file, so each test resets via
 * dispatch({ type: TASK_SET_ALL, payload: [] }).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dispatch,
  getState,
  subscribe,
  TASK_SET_ALL,
  TASK_ADD,
  TASK_UPDATE,
  TASK_MOVE,
  TASK_DELETE,
} from '../scripts/kantrack-modules/store.js';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------
const task = (id = 't1', column = 'todo') => ({
  id,
  title: 'Test Task',
  column,
  noteEntries: [],
  tags: [],
  timer: 0,
});

// ---------------------------------------------------------------------------
// Reset store state before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  dispatch({ type: TASK_SET_ALL, payload: [] });
});

// ===========================================================================
// getState
// ===========================================================================
describe('getState', () => {
  it('returns an object with a tasks array', () => {
    const state = getState();
    expect(state).toHaveProperty('tasks');
    expect(Array.isArray(state.tasks)).toBe(true);
  });

  it('returns an empty tasks array on fresh / reset store', () => {
    expect(getState().tasks).toHaveLength(0);
  });

  it('returns a frozen object — direct mutation is silently ignored', () => {
    dispatch({ type: TASK_SET_ALL, payload: [task()] });
    const state = getState();
    expect(Object.isFrozen(state)).toBe(true);
    // Attempting mutation in strict mode would throw; in sloppy mode it silently fails.
    // Either way the state should remain unchanged.
    try {
      state.tasks = [];
    } catch (_) {
      /* strict mode */
    }
    expect(getState().tasks).toHaveLength(1);
  });
});

// ===========================================================================
// TASK_SET_ALL
// ===========================================================================
describe('TASK_SET_ALL', () => {
  it('replaces all tasks with the provided payload', () => {
    dispatch({ type: TASK_SET_ALL, payload: [task('a'), task('b')] });
    expect(getState().tasks).toHaveLength(2);
    expect(getState().tasks[0].id).toBe('a');
    expect(getState().tasks[1].id).toBe('b');
  });

  it('replaces existing tasks — not appending', () => {
    dispatch({ type: TASK_SET_ALL, payload: [task('first')] });
    dispatch({ type: TASK_SET_ALL, payload: [task('second')] });
    expect(getState().tasks).toHaveLength(1);
    expect(getState().tasks[0].id).toBe('second');
  });

  it('accepts an empty array to clear all tasks', () => {
    dispatch({ type: TASK_SET_ALL, payload: [task()] });
    dispatch({ type: TASK_SET_ALL, payload: [] });
    expect(getState().tasks).toHaveLength(0);
  });
});

// ===========================================================================
// TASK_ADD
// ===========================================================================
describe('TASK_ADD', () => {
  it('appends a task to the list', () => {
    dispatch({ type: TASK_ADD, payload: task('new') });
    expect(getState().tasks).toHaveLength(1);
    expect(getState().tasks[0].id).toBe('new');
  });

  it('appends without removing existing tasks', () => {
    dispatch({ type: TASK_SET_ALL, payload: [task('a')] });
    dispatch({ type: TASK_ADD, payload: task('b') });
    expect(getState().tasks).toHaveLength(2);
  });

  it('preserves insertion order', () => {
    dispatch({ type: TASK_ADD, payload: task('first') });
    dispatch({ type: TASK_ADD, payload: task('second') });
    const ids = getState().tasks.map(t => t.id);
    expect(ids).toEqual(['first', 'second']);
  });
});

// ===========================================================================
// TASK_UPDATE
// ===========================================================================
describe('TASK_UPDATE', () => {
  beforeEach(() => {
    dispatch({ type: TASK_SET_ALL, payload: [task('u1'), task('u2')] });
  });

  it('merges payload fields into the matching task', () => {
    dispatch({ type: TASK_UPDATE, payload: { id: 'u1', title: 'Updated' } });
    const updated = getState().tasks.find(t => t.id === 'u1');
    expect(updated.title).toBe('Updated');
  });

  it('does not affect other tasks', () => {
    dispatch({ type: TASK_UPDATE, payload: { id: 'u1', title: 'Changed' } });
    const other = getState().tasks.find(t => t.id === 'u2');
    expect(other.title).toBe('Test Task');
  });

  it('preserves existing fields not in the payload', () => {
    dispatch({ type: TASK_UPDATE, payload: { id: 'u1', timer: 30 } });
    const updated = getState().tasks.find(t => t.id === 'u1');
    expect(updated.title).toBe('Test Task');
    expect(updated.timer).toBe(30);
  });

  it('does nothing when no task matches the id', () => {
    dispatch({ type: TASK_UPDATE, payload: { id: 'nonexistent', title: 'Ghost' } });
    expect(getState().tasks).toHaveLength(2);
    expect(getState().tasks.every(t => t.title === 'Test Task')).toBe(true);
  });
});

// ===========================================================================
// TASK_MOVE
// ===========================================================================
describe('TASK_MOVE', () => {
  beforeEach(() => {
    dispatch({ type: TASK_SET_ALL, payload: [task('m1', 'todo'), task('m2', 'inProgress')] });
  });

  it('changes the column of the matching task', () => {
    dispatch({ type: TASK_MOVE, payload: { taskId: 'm1', column: 'done' } });
    expect(getState().tasks.find(t => t.id === 'm1').column).toBe('done');
  });

  it('does not change other tasks', () => {
    dispatch({ type: TASK_MOVE, payload: { taskId: 'm1', column: 'done' } });
    expect(getState().tasks.find(t => t.id === 'm2').column).toBe('inProgress');
  });

  it('does nothing when no task matches the taskId', () => {
    dispatch({ type: TASK_MOVE, payload: { taskId: 'ghost', column: 'done' } });
    expect(getState().tasks[0].column).toBe('todo');
    expect(getState().tasks[1].column).toBe('inProgress');
  });
});

// ===========================================================================
// TASK_DELETE
// ===========================================================================
describe('TASK_DELETE', () => {
  beforeEach(() => {
    dispatch({ type: TASK_SET_ALL, payload: [task('d1'), task('d2'), task('d3')] });
  });

  it('removes the matching task', () => {
    dispatch({ type: TASK_DELETE, payload: { taskId: 'd2' } });
    expect(getState().tasks.find(t => t.id === 'd2')).toBeUndefined();
  });

  it('leaves other tasks intact', () => {
    dispatch({ type: TASK_DELETE, payload: { taskId: 'd2' } });
    const ids = getState().tasks.map(t => t.id);
    expect(ids).toEqual(['d1', 'd3']);
  });

  it('does nothing when task id does not exist', () => {
    dispatch({ type: TASK_DELETE, payload: { taskId: 'nonexistent' } });
    expect(getState().tasks).toHaveLength(3);
  });
});

// ===========================================================================
// Unknown action
// ===========================================================================
describe('unknown action', () => {
  it('returns state unchanged for an unrecognised action type', () => {
    dispatch({ type: TASK_SET_ALL, payload: [task('x')] });
    dispatch({ type: 'TOTALLY_UNKNOWN', payload: {} });
    expect(getState().tasks).toHaveLength(1);
    expect(getState().tasks[0].id).toBe('x');
  });
});

// ===========================================================================
// subscribe / unsubscribe
// ===========================================================================
describe('subscribe', () => {
  it('calls the subscriber after every dispatch', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);

    dispatch({ type: TASK_ADD, payload: task('s1') });
    dispatch({ type: TASK_ADD, payload: task('s2') });

    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
  });

  it('passes the new state to the subscriber', () => {
    let received = null;
    const unsub = subscribe(state => {
      received = state;
    });

    dispatch({ type: TASK_SET_ALL, payload: [task('check')] });

    expect(received).not.toBeNull();
    expect(received.tasks[0].id).toBe('check');
    unsub();
  });

  it('stops calling the subscriber after unsubscribe', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);

    dispatch({ type: TASK_ADD, payload: task('before') });
    unsub();
    dispatch({ type: TASK_ADD, payload: task('after') });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports multiple independent subscribers', () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubA = subscribe(listenerA);
    const unsubB = subscribe(listenerB);

    dispatch({ type: TASK_ADD, payload: task() });

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });

  it('unsubscribing one listener does not affect others', () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubA = subscribe(listenerA);
    const unsubB = subscribe(listenerB);

    unsubA();
    dispatch({ type: TASK_ADD, payload: task() });

    expect(listenerA).not.toHaveBeenCalled();
    expect(listenerB).toHaveBeenCalledTimes(1);
    unsubB();
  });
});

// ===========================================================================
// State immutability (reducers must not mutate)
// ===========================================================================
describe('state immutability', () => {
  it('each dispatch produces a new state reference', () => {
    const before = getState();
    dispatch({ type: TASK_ADD, payload: task('immut') });
    const after = getState();
    expect(before).not.toBe(after);
  });

  it('tasks array is a new reference after each mutating dispatch', () => {
    dispatch({ type: TASK_SET_ALL, payload: [task('ref1')] });
    const arrayBefore = getState().tasks;
    dispatch({ type: TASK_ADD, payload: task('ref2') });
    const arrayAfter = getState().tasks;
    expect(arrayBefore).not.toBe(arrayAfter);
  });
});
