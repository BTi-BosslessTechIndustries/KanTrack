/**
 * Unit tests for timer.js — addTime(), quickAddTime(), LONG_PRESS_THRESHOLD.
 *
 * All DOM side-effects (getElementById, updateNoteCardDisplay, saveNotesToLocalStorage)
 * and module dependencies are mocked. The mutable mockState object is created via
 * vi.hoisted() so it is accessible inside vi.mock() factory closures, allowing
 * individual tests to set currentTaskId and notesData per-case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── mutable mock for state.js ────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  currentTaskId: null,
  notesData: [],
  setModalHasChanges: vi.fn(),
  pushToModalPendingActions: vi.fn(),
}));

vi.mock('../scripts/kantrack-modules/state.js', () => mockState);
vi.mock('../scripts/kantrack-modules/storage.js', () => ({
  saveNotesToLocalStorage: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/tasks.js', () => ({
  updateNoteCardDisplay: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/context-menu.js', () => ({
  showContextMenu: vi.fn(),
  closeActiveMenu: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/undo.js', () => ({
  recordAction: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/utils.js', () => ({
  formatTime: vi.fn(m => `${m}m`),
  deepClone: obj => JSON.parse(JSON.stringify(obj)),
}));

import { addTime, quickAddTime, LONG_PRESS_THRESHOLD } from '../scripts/kantrack-modules/timer.js';

// ─── helper ───────────────────────────────────────────────────────────────────

function makeTask(overrides = {}) {
  return { id: 'task-1', timer: 0, actions: [], ...overrides };
}

beforeEach(() => {
  // addTime() calls document.getElementById — set up document so it resolves
  // under Vitest module isolation (setup.js global is not reliably propagated).
  global.document = { getElementById: vi.fn(() => null) };
  mockState.currentTaskId = null;
  mockState.notesData = [];
  vi.clearAllMocks();
});

// ─── LONG_PRESS_THRESHOLD ─────────────────────────────────────────────────────

describe('LONG_PRESS_THRESHOLD', () => {
  it('is a positive number', () => {
    expect(LONG_PRESS_THRESHOLD).toBeGreaterThan(0);
  });

  it('is 300 ms', () => {
    expect(LONG_PRESS_THRESHOLD).toBe(300);
  });
});

// ─── addTime ──────────────────────────────────────────────────────────────────

describe('addTime', () => {
  it('does nothing when no task is open (currentTaskId is null)', () => {
    mockState.notesData = [makeTask()];
    expect(() => addTime(10)).not.toThrow();
    expect(mockState.notesData[0].timer).toBe(0);
  });

  it('does nothing when the current task ID is not found in notesData', () => {
    mockState.currentTaskId = 'ghost-id';
    mockState.notesData = [makeTask({ id: 'task-1' })];
    expect(() => addTime(10)).not.toThrow();
    expect(mockState.notesData[0].timer).toBe(0);
  });

  it('adds minutes to the task timer', () => {
    const task = makeTask({ timer: 10 });
    mockState.currentTaskId = 'task-1';
    mockState.notesData = [task];
    addTime(5);
    expect(task.timer).toBe(15);
  });

  it('initialises timer from 0 when task.timer is 0', () => {
    const task = makeTask({ timer: 0 });
    mockState.currentTaskId = 'task-1';
    mockState.notesData = [task];
    addTime(30);
    expect(task.timer).toBe(30);
  });

  it('handles undefined task.timer gracefully (treats it as 0)', () => {
    const task = makeTask({ timer: undefined });
    mockState.currentTaskId = 'task-1';
    mockState.notesData = [task];
    addTime(20);
    expect(task.timer).toBe(20);
  });

  it('timer is clamped to 0 when subtracting more than the current value', () => {
    const task = makeTask({ timer: 5 });
    mockState.currentTaskId = 'task-1';
    mockState.notesData = [task];
    addTime(-20);
    expect(task.timer).toBe(0);
  });

  it('exact cancellation results in 0, not negative', () => {
    const task = makeTask({ timer: 10 });
    mockState.currentTaskId = 'task-1';
    mockState.notesData = [task];
    addTime(-10);
    expect(task.timer).toBe(0);
  });

  it('marks the modal as having unsaved changes', () => {
    const task = makeTask();
    mockState.currentTaskId = 'task-1';
    mockState.notesData = [task];
    addTime(5);
    expect(mockState.setModalHasChanges).toHaveBeenCalledWith(true);
  });

  it('pushes a pending action that mentions the number of minutes added', () => {
    const task = makeTask();
    mockState.currentTaskId = 'task-1';
    mockState.notesData = [task];
    addTime(15);
    expect(mockState.pushToModalPendingActions).toHaveBeenCalledOnce();
    const [arg] = mockState.pushToModalPendingActions.mock.calls[0];
    expect(arg.action).toMatch(/15/);
  });

  it('pending action says "Added" when time is positive', () => {
    const task = makeTask();
    mockState.currentTaskId = 'task-1';
    mockState.notesData = [task];
    addTime(10);
    const [arg] = mockState.pushToModalPendingActions.mock.calls[0];
    expect(arg.action).toMatch(/[Aa]dded/);
  });

  it('pending action says "Removed" when time is negative', () => {
    const task = makeTask({ timer: 60 });
    mockState.currentTaskId = 'task-1';
    mockState.notesData = [task];
    addTime(-10);
    const [arg] = mockState.pushToModalPendingActions.mock.calls[0];
    expect(arg.action).toMatch(/[Rr]emoved/);
  });
});

// ─── quickAddTime ─────────────────────────────────────────────────────────────

describe('quickAddTime', () => {
  it('does nothing when the task ID is not found', () => {
    mockState.notesData = [makeTask({ id: 'task-1' })];
    expect(() => quickAddTime('missing', 10)).not.toThrow();
    expect(mockState.notesData[0].timer).toBe(0);
  });

  it('adds minutes to the task timer', () => {
    const task = makeTask({ timer: 20 });
    mockState.notesData = [task];
    quickAddTime('task-1', 10);
    expect(task.timer).toBe(30);
  });

  it('timer is clamped to 0 when subtracting more than the current value', () => {
    const task = makeTask({ timer: 3 });
    mockState.notesData = [task];
    quickAddTime('task-1', -10);
    expect(task.timer).toBe(0);
  });

  it('appends an action entry of type "timer" to task.actions', () => {
    const task = makeTask();
    mockState.notesData = [task];
    quickAddTime('task-1', 5);
    expect(task.actions).toHaveLength(1);
    expect(task.actions[0].type).toBe('timer');
  });

  it('action description mentions the number of minutes', () => {
    const task = makeTask();
    mockState.notesData = [task];
    quickAddTime('task-1', 30);
    expect(task.actions[0].action).toMatch(/30/);
  });

  it('action description says "Removed" when subtracting time', () => {
    const task = makeTask({ timer: 60 });
    mockState.notesData = [task];
    quickAddTime('task-1', -15);
    expect(task.actions[0].action).toMatch(/[Rr]emoved/);
  });
});
