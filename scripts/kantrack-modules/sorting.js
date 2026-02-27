/***********************
 * SORTING FUNCTIONS
 * Handles priority-based sorting of tasks within columns
 ***********************/

/**
 * Get the sort order value for a priority
 * For standard columns: High (0) > Medium (1) > Low (2) > None (3)
 * For "todo" column: None (0) > High (1) > Medium (2) > Low (3)
 */
function getPrioritySortValue(priority, isTodoColumn) {
  if (isTodoColumn) {
    // In To Do: None/null at top, then High > Medium > Low
    switch (priority) {
      case null:
      case undefined:
        return 0; // None at top
      case 'high': return 1;
      case 'medium': return 2;
      case 'low': return 3;
      default: return 0;
    }
  } else {
    // In other columns: High > Medium > Low > None
    switch (priority) {
      case 'high': return 0;
      case 'medium': return 1;
      case 'low': return 2;
      case null:
      case undefined:
      default:
        return 3; // None at bottom
    }
  }
}

/**
 * Sort tasks within a specific column by priority
 * @param {string} columnId - The column ID to sort ('todo', 'inProgress', 'onHold', 'done')
 */
export function sortColumnByPriority(columnId) {
  const column = document.getElementById(columnId);
  if (!column) return;

  const isTodoColumn = columnId === 'todo';
  const tasks = Array.from(column.querySelectorAll('.note'));

  if (tasks.length <= 1) return;

  // Sort tasks based on priority
  tasks.sort((a, b) => {
    const taskAId = parseFloat(a.dataset.id);
    const taskBId = parseFloat(b.dataset.id);

    // Get priority from the task's class or data
    const priorityA = getTaskPriorityFromElement(a);
    const priorityB = getTaskPriorityFromElement(b);

    const sortValueA = getPrioritySortValue(priorityA, isTodoColumn);
    const sortValueB = getPrioritySortValue(priorityB, isTodoColumn);

    // Primary sort: by priority
    if (sortValueA !== sortValueB) {
      return sortValueA - sortValueB;
    }

    // Secondary sort: by creation time (newer tasks first within same priority)
    return taskBId - taskAId;
  });

  // Re-append tasks in sorted order
  tasks.forEach(task => column.appendChild(task));
}

/**
 * Get the priority of a task from its DOM element
 * @param {HTMLElement} taskElement - The task DOM element
 * @returns {string|null} - The priority value ('high', 'medium', 'low', or null)
 */
function getTaskPriorityFromElement(taskElement) {
  if (taskElement.classList.contains('priority-high')) return 'high';
  if (taskElement.classList.contains('priority-medium')) return 'medium';
  if (taskElement.classList.contains('priority-low')) return 'low';
  return null;
}

/**
 * Sort all columns by priority
 */
export function sortAllColumnsByPriority() {
  const columnIds = ['todo', 'inProgress', 'onHold', 'done'];
  columnIds.forEach(columnId => sortColumnByPriority(columnId));
}
