/***********************
 * STORE — minimal flux-like state management
 *
 * No external dependencies. ~30 lines of core logic.
 * Side effects (IDB writes, DOM events) must be triggered by middleware
 * or store subscribers — never inside reducers.
 *
 * Reducers are pure functions: (state, action) => newState
 * State is frozen on read to prevent accidental mutation.
 *
 * Usage:
 *   import { dispatch, getState, subscribe, TASK_SET_ALL } from './store.js';
 *   dispatch({ type: TASK_SET_ALL, payload: tasks });
 *   const { tasks } = getState();
 *   const unsub = subscribe(state => renderBoard(state.tasks));
 ***********************/

import type { Task } from './types.js';

// ==================== INITIAL STATE ====================

interface AppState {
  tasks: Task[];
}

const initialState: AppState = {
  tasks: [],
};

// ==================== ACTION TYPES ====================

export const TASK_SET_ALL = 'TASK_SET_ALL';
export const TASK_ADD = 'TASK_ADD';
export const TASK_UPDATE = 'TASK_UPDATE';
export const TASK_MOVE = 'TASK_MOVE';
export const TASK_DELETE = 'TASK_DELETE';

interface StoreAction {
  type: string;
  payload?: unknown;
}

// ==================== REDUCER ====================

function reducer(state: AppState, action: StoreAction): AppState {
  switch (action.type) {
    case TASK_SET_ALL:
      return { ...state, tasks: action.payload as Task[] };

    case TASK_ADD:
      return { ...state, tasks: [...state.tasks, action.payload as Task] };

    case TASK_UPDATE: {
      const update = action.payload as Partial<Task> & { id: string };
      return {
        ...state,
        tasks: state.tasks.map(t => (t.id === update.id ? { ...t, ...update } : t)),
      };
    }

    case TASK_MOVE: {
      const { taskId, column } = action.payload as { taskId: string; column: Task['column'] };
      return {
        ...state,
        tasks: state.tasks.map(t => (t.id === taskId ? { ...t, column } : t)),
      };
    }

    case TASK_DELETE: {
      const { taskId } = action.payload as { taskId: string };
      return {
        ...state,
        tasks: state.tasks.filter(t => t.id !== taskId),
      };
    }

    default:
      return state;
  }
}

// ==================== STORE ====================

let state: AppState = initialState;

type Listener = (state: Readonly<AppState>) => void;
const listeners = new Set<Listener>();

/**
 * Return a shallow-frozen snapshot of current state.
 * Prevents callers from accidentally mutating store state.
 */
export const getState = (): Readonly<AppState> => Object.freeze({ ...state });

/**
 * Dispatch an action. Runs the reducer and notifies all subscribers.
 */
export function dispatch(action: StoreAction): void {
  state = reducer(state, action);
  listeners.forEach(fn => fn(state));
}

/**
 * Subscribe to state changes.
 * @returns Unsubscribe function.
 */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
