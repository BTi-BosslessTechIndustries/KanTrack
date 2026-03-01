/***********************
 * SORTING FUNCTIONS
 * Handles priority-based sorting of tasks within columns
 ***********************/

// Callback registered by tasks.js so VirtualList handles DOM ordering
let _vlUpdater = null;

/**
 * Register a callback invoked by sortColumnByPriority when VL is active.
 * tasks.js calls this during initVirtualLists.
 * @param {(columnId: string) => void} fn
 */
export function registerVLUpdater(fn) {
  _vlUpdater = fn;
}

/**
 * Get the sort order value for a priority
 * For standard columns: High (0) > Medium (1) > Low (2) > None (3)
 * For "todo" column: None (0) > High (1) > Medium (2) > Low (3)
 */
export function getPrioritySortValue(priority, isTodoColumn) {
  if (isTodoColumn) {
    // In To Do: None/null at top, then High > Medium > Low
    switch (priority) {
      case null:
      case undefined:
        return 0; // None at top
      case 'high':
        return 1;
      case 'medium':
        return 2;
      case 'low':
        return 3;
      default:
        return 0;
    }
  } else {
    // In other columns: High > Medium > Low > None
    switch (priority) {
      case 'high':
        return 0;
      case 'medium':
        return 1;
      case 'low':
        return 2;
      case null:
      case undefined:
      default:
        return 3; // None at bottom
    }
  }
}

/**
 * Sort tasks within a specific column by priority.
 * When a VL updater is registered, delegates to it (data-level sort + re-render).
 * Falls back to DOM-based sort when VL is not active.
 * @param {string} columnId - The column ID to sort ('todo', 'inProgress', 'onHold', 'done')
 */
export function sortColumnByPriority(columnId) {
  if (_vlUpdater) {
    _vlUpdater(columnId);
    return;
  }

  // DOM-based fallback (used before VL is initialized)
  const column = document.getElementById(columnId);
  if (!column) return;

  const isTodoColumn = columnId === 'todo';
  const tasks = Array.from(column.querySelectorAll('.note'));

  if (tasks.length <= 1) return;

  tasks.sort((a, b) => {
    const priorityA = getTaskPriorityFromElement(a);
    const priorityB = getTaskPriorityFromElement(b);
    return (
      getPrioritySortValue(priorityA, isTodoColumn) - getPrioritySortValue(priorityB, isTodoColumn)
    );
  });

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
