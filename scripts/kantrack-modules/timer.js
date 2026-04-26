/***********************
 * TIMER FUNCTIONS
 ***********************/
import * as state from './state.js';
import { formatTime, deepClone } from './utils.js';
import { saveNotesToLocalStorage } from './storage.js';
import { updateNoteCardDisplay } from './tasks.js';
import { showContextMenu, closeActiveMenu } from './context-menu.js';
import { recordAction } from './undo.js';

// Long-press threshold reduced for better mobile UX
export const LONG_PRESS_THRESHOLD = 300;

export function addTime(minutes) {
  if (!state.currentTaskId) return;

  const task = state.notesData.find(t => t.id === state.currentTaskId);
  if (!task) return;

  task.timer = Math.max(0, (task.timer || 0) + minutes);

  // Mark modal as having changes
  state.setModalHasChanges(true);

  // Store action for later
  const timestamp = new Date().toLocaleString();
  const action =
    minutes > 0
      ? `Added ${minutes} minute(s) to timer`
      : `Removed ${Math.abs(minutes)} minute(s) from timer`;
  state.pushToModalPendingActions({ action, timestamp });

  const timerTotal = document.getElementById('modalTimerTotal');
  if (timerTotal) {
    timerTotal.textContent = formatTime(task.timer);
  }

  // Don't save immediately - wait for Save & Close
  updateNoteCardDisplay(state.currentTaskId);
}

export function showQuickTimeMenu(taskId, buttonElement, isSubtract = false) {
  const times = [1, 5, 10, 15, 30, 60];

  const items = times.map(minutes => ({
    label: isSubtract ? `-${minutes}m` : `+${minutes}m`,
    value: isSubtract ? -minutes : minutes,
  }));

  showContextMenu({
    anchorElement: buttonElement,
    menuClass: isSubtract ? 'quick-time-menu subtract' : 'quick-time-menu',
    items,
    onSelect: value => {
      quickAddTime(taskId, value);
    },
  });
}

export function quickAddTime(taskId, minutes) {
  if (!minutes) return;
  const task = state.notesData.find(t => t.id === taskId);
  if (!task) return;

  // Record for undo before modifying
  const previousState = deepClone(task);

  task.timer = Math.max(0, (task.timer || 0) + minutes);

  const timestamp = new Date().toLocaleString();
  const actionText =
    minutes > 0
      ? `Added ${minutes} minute(s) to timer`
      : `Removed ${Math.abs(minutes)} minute(s) from timer`;
  task.actions.push({ action: actionText, timestamp, type: 'timer' });

  // Record action for undo/redo
  recordAction({
    type: 'timer',
    taskId: taskId,
    previousState: previousState,
    newState: deepClone(task),
    description: actionText,
  });

  saveNotesToLocalStorage();
  updateNoteCardDisplay(taskId);
}
