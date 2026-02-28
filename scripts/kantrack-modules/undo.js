/***********************
 * UNDO/REDO SYSTEM
 * Action history and undo/redo functionality
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { showNotification } from './notifications.js';
import {
  getAllTrash,
  saveTrash as _saveTrash,
  getAllUndoHistory,
  saveUndoHistory,
} from './repository.js';
import { debugWarn } from './utils.js';

// Action history stacks
const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 200;

// Trash for deleted tasks
let trashedTasks = [];
const TRASH_SOFT_CAP = 200;

/**
 * Initialize undo system
 */
export async function initUndo() {
  // Clear in-memory stacks so re-initialisation starts fresh
  undoStack.length = 0;
  redoStack.length = 0;
  await loadTrash();
  await loadUndoHistory();

  // Setup keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);
}

/**
 * Handle keyboard shortcuts for undo/redo
 */
function handleKeyboardShortcuts(e) {
  // Check if we're in an input field
  if (
    e.target.tagName === 'INPUT' ||
    e.target.tagName === 'TEXTAREA' ||
    e.target.isContentEditable
  ) {
    return;
  }

  // Ctrl/Cmd + Z = Undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  }

  // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = Redo
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    redo();
  }
}

/**
 * Record an undoable action
 * @param {Object} action - The action to record
 * @param {string} action.type - Action type: 'create', 'delete', 'move', 'update', 'priority', 'timer'
 * @param {Object} action.taskId - The task ID affected
 * @param {Object} action.previousState - State before the action
 * @param {Object} action.newState - State after the action
 * @param {string} action.description - Human-readable description
 */
export function recordAction(action) {
  undoStack.push({
    ...action,
    timestamp: Date.now(),
  });

  // Limit stack size
  while (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }

  // Clear redo stack when new action is recorded
  redoStack.length = 0;

  // Persist undo history to IDB (fire-and-forget)
  saveUndoHistoryToIDB();
}

/**
 * Undo the last action
 */
export function undo() {
  if (undoStack.length === 0) {
    showNotification('Nothing to undo', 'info', 2000);
    return false;
  }

  const action = undoStack.pop();
  redoStack.push(action);

  try {
    applyUndo(action);
    showNotification(`Undone: ${action.description}`, 'info', 2000);
    saveUndoHistoryToIDB();
    return true;
  } catch (e) {
    console.error('Undo failed:', e);
    showNotification('Undo failed', 'error', 3000);
    return false;
  }
}

/**
 * Redo the last undone action
 */
export function redo() {
  if (redoStack.length === 0) {
    showNotification('Nothing to redo', 'info', 2000);
    return false;
  }

  const action = redoStack.pop();
  undoStack.push(action);

  try {
    applyRedo(action);
    showNotification(`Redone: ${action.description}`, 'info', 2000);
    saveUndoHistoryToIDB();
    return true;
  } catch (e) {
    console.error('Redo failed:', e);
    showNotification('Redo failed', 'error', 3000);
    return false;
  }
}

/**
 * Apply undo for an action
 */
function applyUndo(action) {
  switch (action.type) {
    case 'delete':
      // Restore deleted task
      if (action.previousState) {
        // First, remove any existing task with this ID (the deleted version)
        const existingIndex = state.notesData.findIndex(t => t.id === action.taskId);
        if (existingIndex !== -1) {
          state.notesData.splice(existingIndex, 1);
        }
        // Add the restored task
        state.notesData.push(action.previousState);
        saveNotesToLocalStorage();
        // Trigger UI refresh
        window.dispatchEvent(
          new CustomEvent('kantrack:taskRestored', {
            detail: { taskId: action.taskId },
          })
        );
      }
      break;

    case 'create':
      // Remove created task
      const createIndex = state.notesData.findIndex(t => t.id === action.taskId);
      if (createIndex !== -1) {
        state.notesData.splice(createIndex, 1);
        saveNotesToLocalStorage();
        window.dispatchEvent(
          new CustomEvent('kantrack:taskRemoved', {
            detail: { taskId: action.taskId },
          })
        );
      }
      break;

    case 'move':
    case 'update':
    case 'priority':
    case 'timer':
    case 'tags':
    case 'dueDate':
    case 'notes':
    case 'title':
      // Restore previous state
      const task = state.notesData.find(t => t.id === action.taskId);
      if (task && action.previousState) {
        const oldColumn = task.column;
        // Deep copy the previous state to avoid reference issues
        const prevState = JSON.parse(JSON.stringify(action.previousState));
        Object.keys(prevState).forEach(key => {
          task[key] = prevState[key];
        });
        saveNotesToLocalStorage();
        window.dispatchEvent(
          new CustomEvent('kantrack:taskUpdated', {
            detail: { taskId: action.taskId, oldColumn: oldColumn },
          })
        );
      }
      break;
  }
}

/**
 * Apply redo for an action
 */
function applyRedo(action) {
  switch (action.type) {
    case 'delete':
      // Delete the task again - mark as deleted
      const taskToDelete = state.notesData.find(t => t.id === action.taskId);
      if (taskToDelete) {
        taskToDelete.deleted = true;
        saveNotesToLocalStorage();
        window.dispatchEvent(
          new CustomEvent('kantrack:taskRemoved', {
            detail: { taskId: action.taskId },
          })
        );
      }
      break;

    case 'create':
      // Recreate the task
      if (action.newState) {
        // Remove any existing deleted version first
        const existingIndex = state.notesData.findIndex(t => t.id === action.taskId);
        if (existingIndex !== -1) {
          state.notesData.splice(existingIndex, 1);
        }
        state.notesData.push(action.newState);
        saveNotesToLocalStorage();
        window.dispatchEvent(
          new CustomEvent('kantrack:taskRestored', {
            detail: { taskId: action.taskId },
          })
        );
      }
      break;

    case 'move':
    case 'update':
    case 'priority':
    case 'timer':
    case 'tags':
    case 'dueDate':
    case 'notes':
    case 'title':
      // Apply new state
      const redoTask = state.notesData.find(t => t.id === action.taskId);
      if (redoTask && action.newState) {
        const oldColumn = redoTask.column;
        // Deep copy the new state to avoid reference issues
        const newState = JSON.parse(JSON.stringify(action.newState));
        Object.keys(newState).forEach(key => {
          redoTask[key] = newState[key];
        });
        saveNotesToLocalStorage();
        window.dispatchEvent(
          new CustomEvent('kantrack:taskUpdated', {
            detail: { taskId: action.taskId, oldColumn: oldColumn },
          })
        );
      }
      break;
  }
}

/**
 * Check if undo is available
 */
export function canUndo() {
  return undoStack.length > 0;
}

/**
 * Check if redo is available
 */
export function canRedo() {
  return redoStack.length > 0;
}

/**
 * Get undo/redo status
 */
export function getUndoRedoStatus() {
  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoCount: undoStack.length,
    redoCount: redoStack.length,
    lastUndo: undoStack.length > 0 ? undoStack[undoStack.length - 1].description : null,
    lastRedo: redoStack.length > 0 ? redoStack[redoStack.length - 1].description : null,
  };
}

// ==================== UNDO HISTORY PERSISTENCE ====================

/**
 * Save the current undoStack via repository.js (fire-and-forget)
 */
function saveUndoHistoryToIDB() {
  const entries = undoStack.map(action => ({ action, savedAt: Date.now() }));
  saveUndoHistory(entries);
}

/**
 * Load undo history from IDB into undoStack
 */
async function loadUndoHistory() {
  const entries = await getAllUndoHistory();
  if (entries && entries.length > 0) {
    // entries are in insertion order (autoIncrement seq ensures this)
    // Take last MAX_HISTORY entries
    const recent = entries.slice(-MAX_HISTORY);
    undoStack.push(...recent.map(e => e.action));
  }
}

// ==================== TRASH SYSTEM ====================

/**
 * Load trashed tasks from IDB (with localStorage fallback) via repository.js
 */
async function loadTrash() {
  trashedTasks = await getAllTrash();
}

/**
 * Save trash via repository.js
 */
function saveTrash() {
  _saveTrash([...trashedTasks]);
}

/**
 * Move a task to trash
 */
export function moveToTrash(task) {
  if (!task) return;

  trashedTasks.unshift({
    ...task,
    trashedAt: Date.now(),
  });

  // Soft cap at 200 items — silently trim oldest
  while (trashedTasks.length > TRASH_SOFT_CAP) {
    trashedTasks.pop();
  }

  saveTrash();
}

/**
 * Restore a task from trash
 */
export function restoreFromTrash(taskId) {
  const index = trashedTasks.findIndex(t => t.id === taskId);
  if (index === -1) return null;

  const task = trashedTasks.splice(index, 1)[0];
  delete task.trashedAt;

  saveTrash();
  return task;
}

/**
 * Get all trashed tasks
 */
export function getTrashedTasks() {
  return [...trashedTasks];
}

/**
 * Permanently delete a task from trash
 */
export function permanentlyDelete(taskId) {
  const index = trashedTasks.findIndex(t => t.id === taskId);
  if (index !== -1) {
    trashedTasks.splice(index, 1);
    saveTrash();
    return true;
  }
  return false;
}

/**
 * Empty the trash
 */
export function emptyTrash() {
  trashedTasks = [];
  saveTrash();
}

/**
 * Get trash count
 */
export function getTrashCount() {
  return trashedTasks.length;
}
