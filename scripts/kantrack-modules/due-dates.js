/***********************
 * DUE DATES SYSTEM
 * Due date management and overdue detection
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { escapeHtml, deepClone } from './utils.js';
import { recordAction } from './undo.js';

/**
 * Set due date for a task
 * @param {string} taskId - Task ID
 * @param {string|null} dueDate - ISO date string or null to clear
 */
export function setDueDate(taskId, dueDate) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task) return false;

  const oldDate = task.dueDate;
  if (oldDate === dueDate) return true; // No change

  // Record for undo before modifying
  const previousState = deepClone(task);

  task.dueDate = dueDate;

  // Add to history
  const timestamp = new Date().toLocaleString();
  let actionDescription = 'Update due date';
  if (dueDate && !oldDate) {
    task.actions.push({
      action: `Due date set to ${formatDueDate(dueDate)}`,
      timestamp,
      type: 'dueDate',
    });
    actionDescription = `Set due date to ${formatDueDate(dueDate)}`;
  } else if (!dueDate && oldDate) {
    task.actions.push({
      action: 'Due date removed',
      timestamp,
      type: 'dueDate',
    });
    actionDescription = 'Remove due date';
  } else if (dueDate && oldDate && dueDate !== oldDate) {
    task.actions.push({
      action: `Due date changed from ${formatDueDate(oldDate)} to ${formatDueDate(dueDate)}`,
      timestamp,
      type: 'dueDate',
    });
    actionDescription = `Change due date to ${formatDueDate(dueDate)}`;
  }

  // Record action for undo/redo
  recordAction({
    type: 'dueDate',
    taskId: taskId,
    previousState: previousState,
    newState: deepClone(task),
    description: actionDescription,
  });

  saveNotesToLocalStorage();
  return true;
}

/**
 * Get due date for a task
 */
export function getDueDate(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  return task?.dueDate || null;
}

/**
 * Check if a task is overdue
 */
export function isOverdue(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task || !task.dueDate) return false;
  if (task.column === 'done') return false;

  const due = new Date(task.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return due < today;
}

/**
 * Check if a task is due today
 */
export function isDueToday(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task || !task.dueDate) return false;
  if (task.column === 'done') return false;

  const due = new Date(task.dueDate);
  const today = new Date();

  return due.toDateString() === today.toDateString();
}

/**
 * Check if a task is due soon (within 3 days)
 */
export function isDueSoon(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task || !task.dueDate) return false;
  if (task.column === 'done') return false;

  const due = new Date(task.dueDate);
  const today = new Date();
  const threeDays = new Date(today);
  threeDays.setDate(today.getDate() + 3);

  return due > today && due <= threeDays;
}

/**
 * Get due date status
 */
export function getDueDateStatus(taskId) {
  if (isOverdue(taskId)) return 'overdue';
  if (isDueToday(taskId)) return 'today';
  if (isDueSoon(taskId)) return 'soon';
  return 'normal';
}

/**
 * Format due date for display
 */
export function formatDueDate(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  // Check for today/tomorrow
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  }

  // Format as readable date
  const options = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== today.getFullYear()) {
    options.year = 'numeric';
  }

  return date.toLocaleDateString(undefined, options);
}

/**
 * Format relative due date (e.g., "in 3 days", "2 days ago")
 */
export function formatRelativeDueDate(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = date - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 0) return `in ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
}

/**
 * Render due date HTML for task card
 */
export function renderDueDateHTML(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task?.dueDate) return '';

  const status = getDueDateStatus(taskId);
  const formatted = formatDueDate(task.dueDate);

  const statusClasses = {
    overdue: 'due-date-overdue',
    today: 'due-date-today',
    soon: 'due-date-soon',
    normal: 'due-date-normal',
  };

  return `
    <div class="task-due-date ${statusClasses[status]}">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
      <span>${escapeHtml(formatted)}</span>
    </div>
  `;
}

/**
 * Render due date picker in modal
 */
export function renderDueDatePicker(taskId, container) {
  if (!container) return;

  const task = state.notesData.find(t => t.id === taskId);
  const currentDate = task?.dueDate || '';

  container.innerHTML = `
    <div class="due-date-picker">
      <label for="dueDateInput">Due Date:</label>
      <div class="due-date-input-wrapper">
        <input type="date" id="dueDateInput" value="${currentDate}">
        ${currentDate ? '<button id="clearDueDateBtn" class="clear-due-date" title="Clear due date">&times;</button>' : ''}
      </div>
      ${currentDate ? `<span class="due-date-preview ${getDueDateStatus(taskId)}">${formatRelativeDueDate(currentDate)}</span>` : ''}
    </div>
  `;

  // Setup event handlers
  const input = container.querySelector('#dueDateInput');
  const clearBtn = container.querySelector('#clearDueDateBtn');

  input?.addEventListener('change', () => {
    setDueDate(taskId, input.value || null);
    state.setModalHasChanges(true);
    renderDueDatePicker(taskId, container);
  });

  clearBtn?.addEventListener('click', () => {
    setDueDate(taskId, null);
    state.setModalHasChanges(true);
    renderDueDatePicker(taskId, container);
  });
}

/**
 * Get all overdue tasks
 */
export function getOverdueTasks() {
  return state.notesData.filter(
    task => !task.deleted && task.dueDate && isOverdue(task.id) && task.column !== 'done'
  );
}

/**
 * Get tasks due today
 */
export function getTasksDueToday() {
  return state.notesData.filter(
    task => !task.deleted && task.dueDate && isDueToday(task.id) && task.column !== 'done'
  );
}

/**
 * Get tasks due soon (within 3 days)
 */
export function getTasksDueSoon() {
  return state.notesData.filter(
    task => !task.deleted && task.dueDate && isDueSoon(task.id) && task.column !== 'done'
  );
}

/**
 * Sort tasks by due date
 */
export function sortByDueDate(tasks, ascending = true) {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return ascending ? 1 : -1;
    if (!b.dueDate) return ascending ? -1 : 1;

    const dateA = new Date(a.dueDate);
    const dateB = new Date(b.dueDate);

    return ascending ? dateA - dateB : dateB - dateA;
  });
}
