/***********************
 * TASK CRUD & RENDERING
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { deleteTaskImages } from './database.js';
import {
  getColumnName,
  formatTime,
  getFirstLine,
  validateTitle,
  MAX_TITLE_LENGTH,
} from './utils.js';
import { getPriorityLabel, getPriorityColor, showQuickPriorityMenu } from './priority.js';
import { sortColumnByPriority, registerVLUpdater, getPrioritySortValue } from './sorting.js';
import { checkTaskVisibility, registerVLUpdaterForFilters } from './search.js';
import { VirtualList } from './virtual-list.js';
import { showQuickTimeMenu, LONG_PRESS_THRESHOLD } from './timer.js';
import { exportTaskAsPDF } from './export.js';
import { enableTouchDrag, setDraggedItemRef } from './drag-drop.js';
import { moveToTrash, recordAction } from './undo.js';
import {
  renderTaskTagsHTML,
  getTaskTags,
  cleanupUnusedTags,
  renderTagFilterButtons,
} from './tags.js';
import { renderDueDateHTML, getDueDateStatus } from './due-dates.js';
import { deepClone } from './utils.js';

// Forward declaration for openTaskModal (will be set from modal.js)
let openTaskModalFn = null;
export function setOpenTaskModal(fn) {
  openTaskModalFn = fn;
}

// Forward declaration for deactivateTaskModalTrap (will be set from kantrack.js)
let _deactivateModalTrap = null;
export function setDeactivateModalTrap(fn) {
  _deactivateModalTrap = fn;
}

// ── Virtual List ──────────────────────────────────────────────
const COLUMN_IDS = ['todo', 'inProgress', 'onHold', 'done'];
const _virtualListMap = new Map(); // Map<columnId, VirtualList>

/**
 * Create one VirtualList per column and register VL callbacks with sorting + search.
 * Called once during bootstrap, replacing the manual forEach card-append loop.
 * @param {object[]} notes  Full notesData array (all tasks, including deleted)
 */
export function initVirtualLists(notes) {
  for (const columnId of COLUMN_IDS) {
    const colEl = document.getElementById(columnId);
    if (!colEl) continue;
    const isTodo = columnId === 'todo';
    const columnTasks = notes
      .filter(t => !t.deleted && t.column === columnId)
      .sort((a, b) => {
        const diff =
          getPrioritySortValue(a.priority, isTodo) - getPrioritySortValue(b.priority, isTodo);
        return diff !== 0 ? diff : _noteIndex(a.id, notes) - _noteIndex(b.id, notes);
      });
    _virtualListMap.set(columnId, new VirtualList(colEl, columnTasks, createNoteElement));
  }
  // Register callbacks so sorting.js and search.js delegate to VL
  registerVLUpdater(updateColumnVirtualList);
  registerVLUpdaterForFilters(updateColumnVirtualList);
}

/**
 * Re-sort and re-filter a column's task list, then push it to the VirtualList.
 * No-op if the VL for this column hasn't been initialized yet.
 * @param {string} columnId
 */
export function updateColumnVirtualList(columnId) {
  const vl = _virtualListMap.get(columnId);
  if (!vl) return;

  const isTodo = columnId === 'todo';
  const all = state.notesData;

  let columnTasks = all.filter(t => !t.deleted && t.column === columnId);

  // Priority sort (data-level)
  columnTasks.sort((a, b) => {
    const diff =
      getPrioritySortValue(a.priority, isTodo) - getPrioritySortValue(b.priority, isTodo);
    return diff !== 0 ? diff : _noteIndex(a.id, all) - _noteIndex(b.id, all);
  });

  // Apply search / tag / column filters
  columnTasks = columnTasks.filter(t => checkTaskVisibility(t));

  vl.update(columnTasks);
}

/**
 * Return the VirtualList for a column, or null if not initialized.
 * @param {string} columnId
 * @returns {VirtualList|null}
 */
export function getColumnVirtualList(columnId) {
  return _virtualListMap.get(columnId) ?? null;
}

/** Index of task in data array — used as stable secondary sort key. */
function _noteIndex(id, arr) {
  return arr.findIndex(t => t.id === id);
}

export function addNote() {
  const input = document.getElementById('newNote');
  if (!input) return;
  const noteText = validateTitle(input.value);
  if (noteText.trim() !== '') {
    const id = crypto.randomUUID();
    const timestamp = new Date().toLocaleString();
    const newNote = {
      id,
      title: noteText,
      noteEntries: [],
      timer: 0,
      priority: null,
      tags: [],
      dueDate: null,
      column: 'todo',
      actions: [{ action: 'Created', timestamp, type: 'created' }],
    };

    // Record for undo
    recordAction({
      type: 'create',
      taskId: id,
      previousState: null,
      newState: deepClone(newNote),
      description: `Create task "${noteText.substring(0, 30)}..."`,
    });

    state.pushToNotesData(newNote);
    saveNotesToLocalStorage();

    if (_virtualListMap.size > 0) {
      updateColumnVirtualList('todo');
    } else {
      const noteElement = createNoteElement(newNote);
      const todoCol = document.getElementById('todo');
      if (todoCol) {
        todoCol.appendChild(noteElement);
        sortColumnByPriority('todo');
        if (!checkTaskVisibility(newNote)) {
          noteElement.style.display = 'none';
        }
      }
    }

    // Update column counts
    window.dispatchEvent(new Event('kantrack:updateColumnCounts'));

    input.value = '';
  }
}

export function deleteTaskFromModal() {
  if (!state.currentTaskId) return;

  if (confirm('Are you sure you want to delete this task?')) {
    const taskIdToDelete = state.currentTaskId;
    const task = state.notesData.find(t => t.id === taskIdToDelete);
    if (!task) return;

    const shouldExport = confirm('Do you want to export this task as PDF before deleting?');

    // Close modal first — deactivate focus trap before hiding
    state.setModalHasChanges(false); // Prevent unsaved changes warning
    _deactivateModalTrap?.();
    const modal = document.getElementById('taskModal');
    if (modal) modal.style.display = 'none';
    state.setCurrentTaskId(null);

    // Handle export and deletion
    if (shouldExport) {
      // Export PDF then delete (deleteNote adds the 'Deleted' history entry itself)
      exportTaskAsPDF(taskIdToDelete).then(() => {
        deleteNote(taskIdToDelete, true);
      });
    } else {
      // Just delete
      deleteNote(taskIdToDelete, true);
    }
  }
}

export async function deleteNote(id, addToHistory = true) {
  const noteIndex = state.notesData.findIndex(n => n.id === id);
  if (noteIndex !== -1) {
    const task = state.notesData[noteIndex];

    // Record for undo before modifying
    recordAction({
      type: 'delete',
      taskId: id,
      previousState: deepClone(task),
      newState: null,
      description: `Delete task "${task.title.substring(0, 30)}..."`,
    });

    const taskColumn = task.column; // save before modifying task
    task.deleted = true;

    if (addToHistory) {
      const timestamp = new Date().toLocaleString();
      task.actions.push({ action: 'Deleted', timestamp, type: 'deleted' });
    }

    // Move to trash AFTER adding the Deleted history entry so the trash copy includes it
    moveToTrash(deepClone(task));

    await deleteTaskImages(id);

    saveNotesToLocalStorage();

    if (_virtualListMap.size > 0) {
      updateColumnVirtualList(taskColumn);
    } else {
      const domEl = document.querySelector(`[data-id='${id}']`);
      if (domEl) domEl.remove();
    }

    // Refresh filter bar — frequency changes when a task is removed
    renderTagFilterButtons();

    // Update column counts and trash badge
    window.dispatchEvent(new Event('kantrack:updateColumnCounts'));
    window.dispatchEvent(new Event('kantrack:updateTrashCount'));
  }
}

export function updateNoteColumn(id, oldColumn, newColumn) {
  const note = state.notesData.find(n => n.id === id);

  if (note && oldColumn !== newColumn) {
    // Record for undo before modifying
    const previousState = deepClone(note);

    note.column = newColumn;
    const timestamp = new Date().toLocaleString();

    // Ensure actions array exists (for imported or legacy data)
    if (!note.actions) {
      note.actions = [];
    }

    note.actions.push({
      action: `Moved from ${getColumnName(oldColumn)} to ${getColumnName(newColumn)}`,
      timestamp,
      type: 'status',
    });

    // Record action for undo/redo
    recordAction({
      type: 'move',
      taskId: id,
      previousState: previousState,
      newState: deepClone(note),
      description: `Move "${note.title.substring(0, 20)}..." to ${getColumnName(newColumn)}`,
    });

    saveNotesToLocalStorage();

    if (newColumn === 'done') {
      // Use requestAnimationFrame to ensure we're outside the drag event context
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (confirm(`Task "${note.title}" moved to Done.\n\nDo you want to export it as PDF?`)) {
            exportTaskAsPDF(id);
          }
        }, 100);
      });
    }
  }
}

export function createNoteElement(content) {
  const note = document.createElement('div');
  note.classList.add('note');
  // Add priority class for color tint (only if priority is set)
  if (content.priority) {
    note.classList.add(`priority-${content.priority}`);
  }
  note.draggable = true;
  note.tabIndex = 0;
  note.dataset.id = content.id;

  note.style.cursor = 'pointer';
  note.onclick = e => {
    if (!e.target.closest('button') && !e.target.closest('.quick-time-menu')) {
      if (openTaskModalFn) openTaskModalFn(content.id);
    }
  };
  note.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button')) {
      e.preventDefault();
      if (openTaskModalFn) openTaskModalFn(content.id);
    }
  });

  const noteContent = document.createElement('div');
  noteContent.classList.add('note-content');

  const titleSpan = document.createElement('strong');
  titleSpan.textContent = content.title;
  noteContent.appendChild(titleSpan);

  const noteText = document.createElement('div');
  noteText.classList.add('note-text');
  if (content.noteEntries && content.noteEntries.length > 0) {
    const latestNote = content.noteEntries[content.noteEntries.length - 1];
    const firstLine = getFirstLine(latestNote.notesHTML);
    noteText.textContent = firstLine;
  } else {
    noteText.textContent = 'No additional notes';
  }

  const timestamp = document.createElement('div');
  timestamp.classList.add('timestamp');
  timestamp.textContent = `Created: ${content.actions?.[0]?.timestamp || ''}`;

  const priorityDisplay = document.createElement('div');
  priorityDisplay.classList.add('priority-display');
  priorityDisplay.textContent = `Priority: ${getPriorityLabel(content.priority)}`;

  const workedTime = document.createElement('div');
  workedTime.classList.add('worked-time');
  workedTime.textContent = `Worked Time: ${formatTime(content.timer || 0)}`;

  const editDeleteContainer = document.createElement('div');
  editDeleteContainer.classList.add('edit-delete');

  const priorityButton = document.createElement('button');
  priorityButton.textContent = '🏷️';
  priorityButton.style.color = getPriorityColor(content.priority);
  priorityButton.title = 'Set Priority';
  priorityButton.onclick = function (e) {
    e.stopPropagation();
    showQuickPriorityMenu(content.id, priorityButton);
  };
  // iOS touch support
  priorityButton.addEventListener('touchend', function (e) {
    e.stopPropagation();
    e.preventDefault();
    showQuickPriorityMenu(content.id, priorityButton);
  });

  const timerButton = document.createElement('button');
  timerButton.textContent = '⏱️';
  timerButton.style.color = '#ff9800';
  timerButton.title = 'Quick Add Time (Long press to subtract)';

  // Long press detection
  let pressTimer = null;
  let isLongPress = false;

  timerButton.onmousedown = function (e) {
    e.stopPropagation();
    isLongPress = false;
    pressTimer = setTimeout(() => {
      isLongPress = true;
      showQuickTimeMenu(content.id, timerButton, true); // subtract mode
    }, LONG_PRESS_THRESHOLD);
  };

  timerButton.onmouseup = function (e) {
    e.stopPropagation();
    clearTimeout(pressTimer);
    if (!isLongPress) {
      showQuickTimeMenu(content.id, timerButton, false); // add mode
    }
  };

  // Prevent click event after long press to avoid closing menu
  timerButton.onclick = function (e) {
    if (isLongPress) {
      e.stopPropagation();
      e.preventDefault();
      return false;
    }
  };

  timerButton.onmouseleave = function () {
    if (!isLongPress) {
      clearTimeout(pressTimer);
    }
  };

  timerButton.onmouseout = function () {
    if (!isLongPress) {
      clearTimeout(pressTimer);
    }
  };

  // Touch support for long press
  timerButton.ontouchstart = function (e) {
    e.stopPropagation();
    isLongPress = false;
    pressTimer = setTimeout(() => {
      isLongPress = true;
      showQuickTimeMenu(content.id, timerButton, true); // subtract mode
    }, LONG_PRESS_THRESHOLD);
  };

  timerButton.ontouchend = function (e) {
    e.stopPropagation();
    clearTimeout(pressTimer);
    if (!isLongPress) {
      showQuickTimeMenu(content.id, timerButton, false); // add mode
    }
  };

  const deleteButton = document.createElement('button');
  deleteButton.textContent = '❌';
  deleteButton.style.color = '#e57373';
  deleteButton.title = 'Delete';
  const handleDelete = async function (e) {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this task?')) {
      const task = state.notesData.find(t => t.id === content.id);
      if (!task) return;

      const shouldExport = confirm('Do you want to export this task as PDF before deleting?');

      if (shouldExport) {
        // Add deletion to history
        const timestamp = new Date().toLocaleString();
        task.actions.push({ action: 'Deleted', timestamp, type: 'deleted' });
        saveNotesToLocalStorage();

        // Export PDF
        await exportTaskAsPDF(content.id);
      }

      // Delete task
      await deleteNote(content.id, !shouldExport);
    }
  };
  deleteButton.onclick = handleDelete;
  // iOS touch support
  deleteButton.addEventListener('touchend', function (e) {
    e.preventDefault();
    handleDelete(e);
  });

  [priorityButton, timerButton, deleteButton].forEach(btn => {
    btn.draggable = false;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener(
      'touchstart',
      e => {
        e.stopPropagation();
      },
      { passive: true }
    );
  });

  editDeleteContainer.appendChild(priorityButton);
  editDeleteContainer.appendChild(timerButton);
  editDeleteContainer.appendChild(deleteButton);

  note.appendChild(noteContent);
  note.appendChild(noteText);

  // Add tags display
  const tagsHtml = renderTaskTagsHTML(content.id);
  if (tagsHtml) {
    const tagsContainer = document.createElement('div');
    tagsContainer.innerHTML = tagsHtml;
    note.appendChild(tagsContainer.firstChild);
  }

  // Add due date display
  const dueDateHtml = renderDueDateHTML(content.id);
  if (dueDateHtml) {
    const dueDateContainer = document.createElement('div');
    dueDateContainer.innerHTML = dueDateHtml;
    note.appendChild(dueDateContainer.firstChild);

    // Add due date status class to card if needed
    const status = getDueDateStatus(content.id);
    if (status === 'overdue') {
      note.classList.add('task-overdue');
    } else if (status === 'today') {
      note.classList.add('task-due-today');
    }
  }

  note.appendChild(timestamp);
  note.appendChild(priorityDisplay);
  note.appendChild(workedTime);

  // Add sub-task indicator if task has sub-items
  if (content.subKanban && content.subKanban.items && content.subKanban.items.length > 0) {
    const subTaskIndicator = document.createElement('div');
    subTaskIndicator.classList.add('sub-task-indicator');
    const totalSubTasks = content.subKanban.items.length;
    const doneSubTasks = content.subKanban.items.filter(i => i.column === 'done').length;
    subTaskIndicator.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="9" y1="9" x2="15" y2="9"></line>
        <line x1="9" y1="13" x2="15" y2="13"></line>
        <line x1="9" y1="17" x2="13" y2="17"></line>
      </svg>
      <span>${doneSubTasks}/${totalSubTasks} sub-tasks</span>
    `;
    note.appendChild(subTaskIndicator);
  }

  note.appendChild(editDeleteContainer);

  note.addEventListener('dragstart', e => {
    if (e.target.closest('button')) {
      e.preventDefault();
      return;
    }
    setDraggedItemRef(note);
  });

  enableTouchDrag(note, openTaskModalFn);

  return note;
}

export function updateNoteCardDisplay(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task) return;

  const noteElement = document.querySelector(`[data-id="${taskId}"]`);
  if (!noteElement) return;

  // Update title
  const titleEl = noteElement.querySelector('.note-content strong');
  if (titleEl && titleEl.textContent !== task.title) {
    titleEl.textContent = task.title;
  }

  const noteText = noteElement.querySelector('.note-text');
  if (noteText) {
    // Show first line of latest note
    if (task.noteEntries && task.noteEntries.length > 0) {
      const latestNote = task.noteEntries[task.noteEntries.length - 1];
      const firstLine = getFirstLine(latestNote.notesHTML);
      noteText.textContent = firstLine;
    } else {
      noteText.textContent = 'No additional notes';
    }
  }

  // Update timer badge
  const timerBadge = noteElement.querySelector('.timer-badge');
  if (timerBadge) {
    timerBadge.textContent = formatTime(task.timer || 0);
  }

  // Update worked time display
  const workedTime = noteElement.querySelector('.worked-time');
  if (workedTime) {
    workedTime.textContent = `Worked Time: ${formatTime(task.timer || 0)}`;
  }

  // Update priority display
  noteElement.classList.remove('priority-low', 'priority-medium', 'priority-high');
  if (task.priority) {
    noteElement.classList.add(`priority-${task.priority}`);
  }

  const priorityDisplay = noteElement.querySelector('.priority-display');
  if (priorityDisplay) {
    const priorityLabels = { low: 'Low', medium: 'Medium', high: 'High' };
    priorityDisplay.textContent = `Priority: ${priorityLabels[task.priority] || 'None'}`;
  }

  // Update tags display
  let tagsDisplay = noteElement.querySelector('.task-tags');
  const tagsHtml = renderTaskTagsHTML(taskId);
  if (tagsHtml) {
    if (!tagsDisplay) {
      // No existing tags - insert after noteText
      const container = document.createElement('div');
      container.innerHTML = tagsHtml;
      const noteText = noteElement.querySelector('.note-text');
      if (noteText) {
        if (noteText.nextSibling) {
          noteElement.insertBefore(container.firstChild, noteText.nextSibling);
        } else {
          noteElement.appendChild(container.firstChild);
        }
      }
    } else {
      // Replace existing tags
      const container = document.createElement('div');
      container.innerHTML = tagsHtml;
      tagsDisplay.replaceWith(container.firstChild);
    }
  } else if (tagsDisplay) {
    tagsDisplay.remove();
  }

  // Update due date display
  let dueDateDisplay = noteElement.querySelector('.task-due-date');
  const dueDateHtml = renderDueDateHTML(taskId);
  if (dueDateHtml) {
    if (!dueDateDisplay) {
      const container = document.createElement('div');
      container.innerHTML = dueDateHtml;
      const tagsEl = noteElement.querySelector('.task-tags');
      const noteText = noteElement.querySelector('.note-text');
      if (tagsEl) {
        tagsEl.after(container.firstChild);
      } else if (noteText) {
        noteText.after(container.firstChild);
      }
    } else {
      const container = document.createElement('div');
      container.innerHTML = dueDateHtml;
      dueDateDisplay.replaceWith(container.firstChild);
    }

    // Update due date status classes
    const status = getDueDateStatus(taskId);
    noteElement.classList.toggle('task-overdue', status === 'overdue');
    noteElement.classList.toggle('task-due-today', status === 'today');
  } else if (dueDateDisplay) {
    dueDateDisplay.remove();
    noteElement.classList.remove('task-overdue');
    noteElement.classList.remove('task-due-today');
  }

  // Update sub-task indicator
  let subTaskIndicator = noteElement.querySelector('.sub-task-indicator');
  if (task.subKanban && task.subKanban.items && task.subKanban.items.length > 0) {
    const totalSubTasks = task.subKanban.items.length;
    const doneSubTasks = task.subKanban.items.filter(i => i.column === 'done').length;

    if (!subTaskIndicator) {
      subTaskIndicator = document.createElement('div');
      subTaskIndicator.classList.add('sub-task-indicator');
      const editDelete = noteElement.querySelector('.edit-delete');
      if (editDelete) {
        noteElement.insertBefore(subTaskIndicator, editDelete);
      } else {
        noteElement.appendChild(subTaskIndicator);
      }
    }

    subTaskIndicator.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="9" y1="9" x2="15" y2="9"></line>
        <line x1="9" y1="13" x2="15" y2="13"></line>
        <line x1="9" y1="17" x2="13" y2="17"></line>
      </svg>
      <span>${doneSubTasks}/${totalSubTasks} sub-tasks</span>
    `;
  } else if (subTaskIndicator) {
    subTaskIndicator.remove();
  }
}
