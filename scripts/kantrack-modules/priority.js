/***********************
 * PRIORITY FUNCTIONS
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { updateNoteCardDisplay } from './tasks.js';
import { sortColumnByPriority } from './sorting.js';
import { showContextMenu } from './context-menu.js';
import { recordAction } from './undo.js';
import { deepClone } from './utils.js';

// Priority definitions (centralized)
export const PRIORITIES = [
  { value: null, label: 'None', color: 'rgba(255, 255, 255, 0.5)' },
  { value: 'low', label: 'Low', color: '#4caf50' },
  { value: 'medium', label: 'Medium', color: '#ff9800' },
  { value: 'high', label: 'High', color: '#f44336' }
];

export function getPriorityLabel(priority) {
  const found = PRIORITIES.find(p => p.value === priority);
  return found ? found.label : 'None';
}

export function getPriorityColor(priority) {
  const found = PRIORITIES.find(p => p.value === priority);
  return found ? found.color : PRIORITIES[0].color;
}

export function showQuickPriorityMenu(taskId, buttonElement) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task) return;

  const items = PRIORITIES.map(priority => ({
    label: priority.label,
    value: priority.value,
    color: priority.color,
    active: task.priority === priority.value
  }));

  showContextMenu({
    anchorElement: buttonElement,
    menuClass: 'quick-priority-menu',
    items,
    onSelect: (value) => {
      quickSetPriority(taskId, value);
    }
  });
}

export function quickSetPriority(taskId, priority) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task) return;

  const oldPriority = task.priority;
  if (oldPriority === priority) return;

  // Record for undo before modifying
  const previousState = deepClone(task);

  task.priority = priority;

  const timestamp = new Date().toLocaleString();
  task.actions.push({
    action: `Priority changed from ${getPriorityLabel(oldPriority)} to ${getPriorityLabel(priority)}`,
    timestamp,
    type: 'priority'
  });

  // Record action for undo/redo
  recordAction({
    type: 'priority',
    taskId: taskId,
    previousState: previousState,
    newState: deepClone(task),
    description: `Change priority to ${getPriorityLabel(priority)}`
  });

  saveNotesToLocalStorage();
  updateNoteCardDisplay(taskId);
  updateNoteCardPriority(taskId);

  // Re-sort the column after priority change
  sortColumnByPriority(task.column);
}

export function updateNoteCardPriority(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task) return;

  const noteElement = document.querySelector(`[data-id="${taskId}"]`);
  if (!noteElement) return;

  // Update priority class
  noteElement.classList.remove('priority-low', 'priority-medium', 'priority-high');
  if (task.priority) {
    noteElement.classList.add(`priority-${task.priority}`);
  }

  // Update priority display text
  const priorityDisplay = noteElement.querySelector('.priority-display');
  if (priorityDisplay) {
    priorityDisplay.textContent = `Priority: ${getPriorityLabel(task.priority)}`;
  }

  // Update priority button color
  const priorityButton = noteElement.querySelector('.edit-delete button:first-child');
  if (priorityButton) {
    priorityButton.style.color = getPriorityColor(task.priority);
  }
}

export function setModalPriority(priority) {
  if (!state.currentTaskId) return;

  state.setCurrentModalPriority(priority);
  state.setModalHasChanges(true);

  // Update the label
  const priorityLabel = document.getElementById('modalPriorityLabel');
  if (priorityLabel) {
    priorityLabel.textContent = getPriorityLabel(priority);
  }

  // Update button states
  updateModalPriorityButtons(priority);
}

export function updateModalPriorityButtons(priority) {
  const buttons = document.querySelectorAll('.priority-controls .priority-btn');
  buttons.forEach(btn => {
    const btnPriority = btn.dataset.priority;
    // Handle null priority matching "none" button
    const isMatch = (priority === null && btnPriority === 'none') || btnPriority === priority;
    if (isMatch) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}
