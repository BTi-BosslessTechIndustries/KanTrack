/***********************
 * UNDO/REDO SYSTEM
 * Action history and undo/redo functionality
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { showNotification } from './notifications.js';
import {
  cleanupUnusedTags,
  renderTagFilterButtons,
  restoreTagDefinition,
  removeTagDefinitionById,
} from './tags.js';
import {
  getAllTrash,
  saveTrash as _saveTrash,
  getAllOplogEntries,
  appendOplogEntry,
  updateOplogEntry,
  clearUndoneOplogEntries,
} from './repository.js';
import { getOrCreateDeviceId, getMetaLamport, setMetaValue } from './database.js';
import { debugWarn } from './utils.js';

// Action history stacks (in-memory, fast; oplog is the durable backing store)
const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 200;

// Oplog infrastructure (cached from IDB on init)
let _deviceId = null;
let _lamportClock = 0;

// Trash for deleted tasks
let trashedTasks = [];
const TRASH_SOFT_CAP = 200;

// Track the active keyboard listener so re-initialisation doesn't stack duplicates
let _keydownListener = null;

/**
 * Initialize undo system
 */
export async function initUndo() {
  // Clear in-memory stacks so re-initialisation starts fresh
  undoStack.length = 0;
  redoStack.length = 0;

  // Cache oplog infrastructure values from IDB
  _deviceId = await getOrCreateDeviceId();
  _lamportClock = await getMetaLamport();

  await loadTrash();
  await _loadStacksFromOplog();

  // Remove any previous keyboard listener before adding a fresh one
  if (_keydownListener) {
    document.removeEventListener('keydown', _keydownListener);
  }
  _keydownListener = handleKeyboardShortcuts;
  document.addEventListener('keydown', _keydownListener);
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
 * Record an undoable action.
 * @param {Object} action - The action to record
 * @param {string} action.type - Action type: 'create', 'delete', 'move', 'update', 'priority', 'timer'
 * @param {string} action.taskId - The task ID affected
 * @param {Object} action.previousState - State before the action
 * @param {Object} action.newState - State after the action
 * @param {string} action.description - Human-readable description
 */
export function recordAction(action) {
  const opId = crypto.randomUUID();

  undoStack.push({
    ...action,
    timestamp: Date.now(),
    opId,
  });

  // Limit stack size
  while (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }

  // Clear redo stack when new action is recorded
  redoStack.length = 0;

  // Write to oplog (fire-and-forget)
  _writeOplogEntry(action, opId, false);

  // Clear any abandoned redo ops from oplog (fire-and-forget)
  clearUndoneOplogEntries();
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
    // Mark as undone in oplog with timestamp so redo order survives reload
    if (action.opId) {
      updateOplogEntry(action.opId, { undone: true, undoneAt: Date.now() });
    }
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
    // Mark as not undone in oplog (fire-and-forget)
    if (action.opId) {
      updateOplogEntry(action.opId, { undone: false });
    }
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
        renderTagFilterButtons();
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
        cleanupUnusedTags();
        renderTagFilterButtons();
        window.dispatchEvent(
          new CustomEvent('kantrack:taskRemoved', {
            detail: { taskId: action.taskId },
          })
        );
      }
      break;

    case 'tagDelete': {
      // Restore the tag definition and the tags arrays of every affected task
      restoreTagDefinition(action.tagDefinition);
      action.affectedTasks.forEach(({ taskId, previousTags }) => {
        const t = state.notesData.find(n => n.id === taskId);
        if (t) t.tags = [...previousTags];
      });
      saveNotesToLocalStorage();
      renderTagFilterButtons();
      window.dispatchEvent(
        new CustomEvent('kantrack:tagsRestored', {
          detail: { affectedTaskIds: action.affectedTasks.map(t => t.taskId) },
        })
      );
      break;
    }

    case 'subtask':
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
    case 'delete': {
      // Delete the task again — mark as deleted and move back to trash
      const taskToDelete = state.notesData.find(t => t.id === action.taskId);
      if (taskToDelete) {
        moveToTrash(JSON.parse(JSON.stringify(taskToDelete)));
        taskToDelete.deleted = true;
        saveNotesToLocalStorage();
        renderTagFilterButtons();
        window.dispatchEvent(
          new CustomEvent('kantrack:taskRemoved', {
            detail: { taskId: action.taskId },
          })
        );
      }
      break;
    }

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
        renderTagFilterButtons();
        window.dispatchEvent(
          new CustomEvent('kantrack:taskRestored', {
            detail: { taskId: action.taskId },
          })
        );
      }
      break;

    case 'tagDelete': {
      // Re-apply the deletion: remove definition and strip tag from tasks
      removeTagDefinitionById(action.tagDefinition.id);
      action.affectedTasks.forEach(({ taskId }) => {
        const t = state.notesData.find(n => n.id === taskId);
        if (t && t.tags) {
          t.tags = t.tags.filter(tagId => tagId !== action.tagDefinition.id);
        }
      });
      saveNotesToLocalStorage();
      renderTagFilterButtons();
      window.dispatchEvent(
        new CustomEvent('kantrack:tagsRestored', {
          detail: { affectedTaskIds: action.affectedTasks.map(t => t.taskId) },
        })
      );
      break;
    }

    case 'subtask':
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

// ==================== OPLOG HELPERS ====================

/**
 * Increment the in-memory Lamport clock and persist asynchronously.
 */
function _nextLamport() {
  _lamportClock += 1;
  setMetaValue('lamportClock', _lamportClock);
  return _lamportClock;
}

/**
 * Map an undo action type string to an OplogActionType.
 */
function _mapActionType(type) {
  if (type === 'create') return 'create';
  if (type === 'delete') return 'delete';
  if (type === 'move') return 'move';
  return 'update';
}

/**
 * Compute a field-level diff between two task snapshots.
 * For create/delete, stores the full entity under _fullState.
 */
function _buildPatch(previousState, newState) {
  if (!previousState && newState) {
    return { _fullState: { prev: null, next: newState } };
  }
  if (previousState && !newState) {
    return { _fullState: { prev: previousState, next: null } };
  }
  if (!previousState && !newState) {
    return {};
  }
  const patch = {};
  const allKeys = new Set([...Object.keys(previousState), ...Object.keys(newState)]);
  for (const key of allKeys) {
    if (JSON.stringify(previousState[key]) !== JSON.stringify(newState[key])) {
      patch[key] = { prev: previousState[key], next: newState[key] };
    }
  }
  return patch;
}

/**
 * Build and persist an oplog entry (async, always fire-and-forget).
 */
async function _writeOplogEntry(action, opId, undone) {
  try {
    const entry = {
      opId,
      deviceId: _deviceId,
      lamport: _nextLamport(),
      timestamp: Date.now(),
      entityType: 'task',
      entityId: action.taskId,
      actionType: _mapActionType(action.type),
      patch: _buildPatch(action.previousState, action.newState),
      description: action.description || '',
      undone,
      prevHash: null,
      hash: null,
      _action: {
        type: action.type,
        taskId: action.taskId,
        previousState: action.previousState,
        newState: action.newState,
        description: action.description,
      },
    };
    await appendOplogEntry(entry);
  } catch (e) {
    debugWarn('Failed to write oplog entry (non-fatal):', e);
  }
}

/**
 * Rebuild the in-memory undo/redo stacks from the persisted oplog.
 * Replaces the old undo_history store approach.
 */
async function _loadStacksFromOplog() {
  try {
    const entries = await getAllOplogEntries(); // sorted by lamport asc
    const applied = entries.filter(e => !e.undone);
    // Any undone entry with Lamport < max(applied Lamport) is a phantom left
    // by a crash before clearUndoneOplogEntries() completed — discard it.
    const maxAppliedLamport = applied.length > 0 ? Math.max(...applied.map(e => e.lamport)) : -1;
    // Sort undone entries by undoneAt so the most recently undone ends up last
    // (stack.pop() must return the most recently undone action first)
    const undone = entries
      .filter(e => e.undone && e.lamport > maxAppliedLamport)
      .sort((a, b) => (a.undoneAt ?? a.lamport) - (b.undoneAt ?? b.lamport));

    undoStack.push(
      ...applied.slice(-MAX_HISTORY).map(e => ({
        ...(e._action || {}),
        opId: e.opId,
        timestamp: e.timestamp,
      }))
    );

    redoStack.push(
      ...undone.slice(-MAX_HISTORY).map(e => ({
        ...(e._action || {}),
        opId: e.opId,
        timestamp: e.timestamp,
      }))
    );
  } catch (e) {
    debugWarn('Failed to load stacks from oplog (non-fatal):', e);
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

    // Also remove the soft-deleted entry from state so cleanupUnusedTags works correctly
    const notesIndex = state.notesData.findIndex(t => t.id === taskId);
    if (notesIndex !== -1) {
      state.notesData.splice(notesIndex, 1);
      saveNotesToLocalStorage();
    }

    // Purge undo/redo history referencing this task so "permanent" is truly permanent
    _purgeStacksForIds(new Set([taskId]));

    return true;
  }
  return false;
}

/**
 * Empty the trash
 */
export function emptyTrash() {
  const trashedIds = trashedTasks.map(t => t.id);
  trashedTasks = [];
  saveTrash();

  // Remove all soft-deleted entries from state
  if (trashedIds.length > 0) {
    const idSet = new Set(trashedIds);
    const filtered = state.notesData.filter(t => !idSet.has(t.id));
    if (filtered.length !== state.notesData.length) {
      state.setNotesData(filtered);
      saveNotesToLocalStorage();
    }

    // Purge undo/redo history referencing any permanently deleted task
    _purgeStacksForIds(idSet);
  }
}

function _purgeStacksForIds(idSet) {
  const keep = action => !idSet.has(action.taskId);
  const before = undoStack.length + redoStack.length;
  undoStack.splice(0, undoStack.length, ...undoStack.filter(keep));
  redoStack.splice(0, redoStack.length, ...redoStack.filter(keep));
  if (undoStack.length + redoStack.length !== before) {
    clearUndoneOplogEntries();
  }
}

/**
 * Get trash count
 */
export function getTrashCount() {
  return trashedTasks.length;
}
