/***********************
 * HIDDEN CARDS
 * Lets users hide cards from the board (e.g. long-stalled "On Hold" items)
 * without deleting them, and bring them back individually or in bulk via the
 * Hidden Cards modal.
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { recordAction } from './undo.js';
import { deepClone } from './utils.js';
import { getSearchableText } from './search.js';

/**
 * Hide a task: marks it hidden, records an undoable action, and notifies the
 * UI to re-render its column and the hidden-count badge.
 *
 * `hidden`/`hiddenAt` are normalized to concrete values (false/null) before
 * the very first hide if they're undefined, so both `previousState` and
 * `newState` snapshots contain these keys. The generic undo/redo apply
 * functions only assign keys present in the snapshot, so a key that's
 * *added* by this action (rather than changed) would never be reverted on
 * undo otherwise.
 */
export function hideCard(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task || task.hidden) return;

  if (task.hidden === undefined) task.hidden = false;
  if (task.hiddenAt === undefined) task.hiddenAt = null;

  const previousState = deepClone(task);

  task.hidden = true;
  task.hiddenAt = Date.now();

  if (!task.actions) task.actions = [];
  task.actions.push({
    action: 'Card hidden',
    timestamp: new Date().toLocaleString(),
    type: 'hidden',
  });

  recordAction({
    type: 'hidden',
    taskId,
    previousState,
    newState: deepClone(task),
    description: `Hide "${task.title.substring(0, 30)}"`,
  });

  saveNotesToLocalStorage();
  _notifyChanged(taskId, task.column);
}

/**
 * Show a previously hidden task: clears `hidden`, records an undoable
 * action, and notifies the UI.
 */
export function showCard(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task || !task.hidden) return;

  const previousState = deepClone(task);

  task.hidden = false;
  task.hiddenAt = null;

  if (!task.actions) task.actions = [];
  task.actions.push({
    action: 'Card shown',
    timestamp: new Date().toLocaleString(),
    type: 'hidden',
  });

  recordAction({
    type: 'hidden',
    taskId,
    previousState,
    newState: deepClone(task),
    description: `Show "${task.title.substring(0, 30)}"`,
  });

  saveNotesToLocalStorage();
  _notifyChanged(taskId, task.column);
}

/**
 * Show multiple hidden tasks at once (e.g. "Show Selected" in the modal).
 * Each task gets its own undo entry.
 */
export function showCards(taskIds) {
  taskIds.forEach(id => showCard(id));
}

/** All currently hidden, non-deleted tasks, most-recently-hidden first. */
export function getHiddenTasks() {
  return state.notesData
    .filter(t => t.hidden && !t.deleted)
    .sort((a, b) => (b.hiddenAt ?? 0) - (a.hiddenAt ?? 0));
}

export function getHiddenCount() {
  return getHiddenTasks().length;
}

/** How many hidden tasks match the given search query. */
export function countHiddenMatches(query) {
  const term = query.toLowerCase().trim();
  if (!term) return 0;
  return getHiddenTasks().filter(t => getSearchableText(t).includes(term)).length;
}

function _notifyChanged(taskId, column) {
  window.dispatchEvent(
    new CustomEvent('kantrack:taskUpdated', { detail: { taskId, oldColumn: column } })
  );
  window.dispatchEvent(new Event('kantrack:updateColumnCounts'));
  window.dispatchEvent(new Event('kantrack:updateHiddenCount'));
}
