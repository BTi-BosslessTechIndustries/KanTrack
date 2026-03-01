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

// ==================== INITIAL STATE ====================

const initialState = {
  tasks: [],
};

// ==================== ACTION TYPES ====================

export const TASK_SET_ALL = 'TASK_SET_ALL';
export const TASK_ADD = 'TASK_ADD';
export const TASK_UPDATE = 'TASK_UPDATE';
export const TASK_MOVE = 'TASK_MOVE';
export const TASK_DELETE = 'TASK_DELETE';

// ==================== REDUCER ====================

function reducer(state, action) {
  switch (action.type) {
    case TASK_SET_ALL:
      return { ...state, tasks: action.payload };

    case TASK_ADD:
      return { ...state, tasks: [...state.tasks, action.payload] };

    case TASK_UPDATE: {
      const update = action.payload;
      return {
        ...state,
        tasks: state.tasks.map(t => (t.id === update.id ? { ...t, ...update } : t)),
      };
    }

    case TASK_MOVE: {
      const { taskId, column } = action.payload;
      return {
        ...state,
        tasks: state.tasks.map(t => (t.id === taskId ? { ...t, column } : t)),
      };
    }

    case TASK_DELETE: {
      const { taskId } = action.payload;
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

let state = initialState;

const listeners = new Set();

/**
 * Return a shallow-frozen snapshot of current state.
 * Prevents callers from accidentally mutating store state.
 */
export const getState = () => Object.freeze({ ...state });

/**
 * Dispatch an action. Runs the reducer and notifies all subscribers.
 */
export function dispatch(action) {
  state = reducer(state, action);
  listeners.forEach(fn => fn(state));
}

/**
 * Subscribe to state changes.
 * @returns {Function} Unsubscribe function.
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
