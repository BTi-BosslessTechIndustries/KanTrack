/***********************
 * KANBAN.JS - Main Entry Point
 * ES Module Version
 ***********************/

// Import all modules
import * as state from './kantrack-modules/state.js';
import { initIndexedDB } from './kantrack-modules/database.js';
import {
  loadNotesFromLocalStorage,
  saveNotesToLocalStorage,
  loadNotebookFromLocalStorage,
  loadPermanentNotes,
  savePermanentNotes,
  setAutoSaveCallback
} from './kantrack-modules/storage.js';
import {
  loadClocks,
  openAddClockModal,
  closeAddClockModal,
  selectClockType,
  filterTimezones,
  addTimezoneClock,
  addChronometer,
  deleteClock,
  startChronometer,
  pauseChronometer,
  resetChronometer
} from './kantrack-modules/clocks.js';
import {
  openTaskModal,
  closeTaskModal,
  enableTitleEdit,
  clearNotes,
  toggleHistory,
  saveAndCloseModal
} from './kantrack-modules/modal.js';
import {
  addNote,
  deleteTaskFromModal,
  createNoteElement,
  updateNoteCardDisplay
} from './kantrack-modules/tasks.js';
import { setupDragAndDrop } from './kantrack-modules/drag-drop.js';
import {
  addSubKanbanItem,
  toggleSubKanban
} from './kantrack-modules/sub-kanban.js';
import { addTime } from './kantrack-modules/timer.js';
import { setModalPriority } from './kantrack-modules/priority.js';
import {
  setupClipboardPaste,
  openImageViewer,
  closeImageModal,
  zoomImage,
  resetZoom
} from './kantrack-modules/images.js';
import {
  exportTaskAsPDF,
  exportBoardAsHTML,
  importBoardFromFile
} from './kantrack-modules/export.js';
import { sortAllColumnsByPriority, sortColumnByPriority } from './kantrack-modules/sorting.js';
import {
  toggleNotebookSidebar,
  renderNotebookTree,
  createNotebookItem,
  deletePageFromModal,
  closePageModal,
  saveAndClosePage,
  contextMenuAction,
  filterNotebookItems,
  setupNotebookEventListeners,
  importNotebookFromZip
} from './kantrack-modules/notebook.js';
import {
  exportPageAsPDF,
  exportAllNotebook
} from './kantrack-modules/notebook-export.js';

// New feature imports
import { showNotification, showSuccess, showError, warnIfStorageHigh, checkStorageQuota, getStorageBreakdown, logStorageDiagnostics } from './kantrack-modules/notifications.js';
import { initSearch, setSearchTerm, setColumnFilter, clearFilters, applyFilters } from './kantrack-modules/search.js';
import { initTags, renderTagSelector, renderTaskTagsHTML, cleanupUnusedTags, renderTagFilterButtons } from './kantrack-modules/tags.js';
import { renderDueDatePicker, renderDueDateHTML } from './kantrack-modules/due-dates.js';
import { initUndo, undo, redo, getTrashedTasks, restoreFromTrash, permanentlyDelete, emptyTrash, getTrashCount, moveToTrash } from './kantrack-modules/undo.js';
import { showLoading, hideLoading } from './kantrack-modules/loading.js';
import { debounce } from './kantrack-modules/utils.js';

/***********************
 * EXPOSE FUNCTIONS TO GLOBAL SCOPE
 * (For HTML onclick handlers)
 ***********************/

// Clocks
window.openAddClockModal = openAddClockModal;
window.closeAddClockModal = closeAddClockModal;
window.selectClockType = selectClockType;
window.filterTimezones = filterTimezones;
window.addTimezoneClock = addTimezoneClock;
window.addChronometer = addChronometer;
window.deleteClock = deleteClock;
window.startChronometer = startChronometer;
window.pauseChronometer = pauseChronometer;
window.resetChronometer = resetChronometer;

// Task Modal
window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.enableTitleEdit = enableTitleEdit;
window.clearNotes = clearNotes;
window.toggleHistory = toggleHistory;
window.saveAndCloseModal = saveAndCloseModal;
window.deleteTaskFromModal = deleteTaskFromModal;

// Tasks
window.addNote = addNote;

// Sub-Kanban
window.addSubKanbanItem = addSubKanbanItem;
window.toggleSubKanban = toggleSubKanban;

// Timer
window.addTime = addTime;

// Priority
window.setModalPriority = setModalPriority;

// Images
window.openImageViewer = openImageViewer;
window.closeImageModal = closeImageModal;
window.zoomImage = zoomImage;
window.resetZoom = resetZoom;

// Export/Import
window.exportTaskAsPDF = exportTaskAsPDF;
window.exportBoardAsHTML = exportBoardAsHTML;
window.importBoardFromFile = importBoardFromFile;

// Notebook
window.toggleNotebookSidebar = toggleNotebookSidebar;
window.createNotebookItem = createNotebookItem;
window.deletePageFromModal = deletePageFromModal;
window.closePageModal = closePageModal;
window.saveAndClosePage = saveAndClosePage;
window.contextMenuAction = contextMenuAction;
window.filterNotebookItems = filterNotebookItems;
window.exportPageAsPDF = exportPageAsPDF;
window.exportAllNotebook = exportAllNotebook;
window.importNotebookFromZip = importNotebookFromZip;

// Undo/Redo
window.undo = undo;
window.redo = redo;

// Trash
window.toggleTrashPanel = toggleTrashPanel;
window.restoreFromTrashUI = restoreFromTrashUI;
window.permanentDeleteUI = permanentDeleteUI;
window.emptyAllTrash = emptyAllTrash;

// Search
window.clearFilters = clearFilters;

// Storage diagnostics (for debugging storage issues from console)
window.checkStorageQuota = checkStorageQuota;
window.getStorageBreakdown = getStorageBreakdown;
window.logStorageDiagnostics = logStorageDiagnostics;

/***********************
 * TRASH PANEL FUNCTIONS
 ***********************/
function toggleTrashPanel() {
  const panel = document.getElementById('trashPanel');
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    renderTrashList();
  } else {
    panel.style.display = 'none';
  }
}

function updateTrashCount() {
  const trashed = getTrashedTasks();
  const countBadge = document.getElementById('trashCount');

  if (countBadge) {
    countBadge.textContent = trashed.length;
    countBadge.style.display = trashed.length > 0 ? 'flex' : 'none';
  }
}

// Expose globally so it can be called from other modules
window.updateTrashCount = updateTrashCount;

function renderTrashList() {
  const list = document.getElementById('trashList');
  const trashed = getTrashedTasks();

  // Update the count badge
  updateTrashCount();

  if (trashed.length === 0) {
    list.innerHTML = '<div class="trash-empty-message">Trash is empty</div>';
    return;
  }

  list.innerHTML = trashed.map(task => `
    <div class="trash-item" data-id="${task.id}">
      <div class="trash-item-info">
        <div class="trash-item-title">${escapeHtmlLocal(task.title)}</div>
        <div class="trash-item-date">Deleted: ${formatTrashDate(task.trashedAt)}</div>
      </div>
      <div class="trash-item-actions">
        <button class="restore-btn" onclick="restoreFromTrashUI('${task.id}')">Restore</button>
        <button class="permanent-delete-btn" onclick="permanentDeleteUI('${task.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function restoreFromTrashUI(taskId) {
  // Convert string to number (task IDs are Date.now() timestamps)
  const numericId = typeof taskId === 'string' ? parseInt(taskId, 10) : taskId;
  const task = restoreFromTrash(numericId);
  if (task) {
    // Remove deleted flag
    delete task.deleted;

    state.notesData.push(task);
    saveNotesToLocalStorage();

    // Re-render the task
    const noteElement = createNoteElement(task);
    const col = document.getElementById(task.column);
    if (col) col.appendChild(noteElement);

    sortAllColumnsByPriority();
    applyFilters();
    updateColumnCounts();
    renderTrashList();
    showSuccess('Task restored');
  }
}

function permanentDeleteUI(taskId) {
  // Convert string to number
  const numericId = typeof taskId === 'string' ? parseInt(taskId, 10) : taskId;
  if (confirm('Permanently delete this task? This cannot be undone.')) {
    permanentlyDelete(numericId);
    renderTrashList();
    showSuccess('Task permanently deleted');
  }
}

function emptyAllTrash() {
  const count = getTrashCount();
  if (count === 0) return;

  if (confirm(`Permanently delete all ${count} item(s) in trash? This cannot be undone.`)) {
    emptyTrash();
    renderTrashList();
    showSuccess('Trash emptied');
  }
}

function formatTrashDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtmlLocal(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[s]));
}

/***********************
 * AUTO-SAVE INDICATOR
 ***********************/
function showAutoSaveIndicator() {
  const indicator = document.getElementById('autoSaveIndicator');
  if (indicator) {
    indicator.textContent = 'Saved';
    indicator.classList.add('visible', 'success');
    setTimeout(() => {
      indicator.classList.remove('visible', 'success');
    }, 2000);
  }
}

/***********************
 * COLUMN COUNTS
 ***********************/
function updateColumnCounts() {
  const columns = ['todo', 'inProgress', 'onHold', 'done'];

  columns.forEach(columnId => {
    const column = document.getElementById(columnId);
    if (!column) return;

    const header = column.querySelector('h2');
    if (!header) return;

    // Create or update count span
    let countSpan = header.querySelector('.column-count');
    if (!countSpan) {
      countSpan = document.createElement('span');
      countSpan.className = 'column-count';
      header.appendChild(countSpan);
    }

    // Count visible elements using computed style
    const allNoteElements = Array.from(column.querySelectorAll('.note'));
    const taskCount = allNoteElements.filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).length;

    countSpan.textContent = taskCount > 0 ? `(${taskCount})` : '';
  });
}

// Export for use in other modules
window.updateColumnCounts = updateColumnCounts;

// Make renderTagSelector and renderDueDatePicker available
window.renderTagSelector = renderTagSelector;
window.renderDueDatePicker = renderDueDatePicker;

/***********************
 * NAVIGATION GUARD
 ***********************/
window.addEventListener('beforeunload', function (e) {
  e.preventDefault();
  e.returnValue = '';
});

/***********************
 * BOOTSTRAP
 ***********************/
document.addEventListener('DOMContentLoaded', async () => {
  await initIndexedDB();
  loadClocks();

  // Initialize new feature modules
  initTags();
  renderTagFilterButtons();
  initUndo();
  initSearch();

  // Set up auto-save callback
  setAutoSaveCallback(showAutoSaveIndicator);

  // Load notes and render them
  const notes = loadNotesFromLocalStorage();
  notes.forEach(note => {
    if (!note.deleted) {
      const noteElement = createNoteElement(note);
      const col = document.getElementById(note.column);
      if (col) col.appendChild(noteElement);
    }
  });

  // Clean up any orphan tags (tags not used by any task)
  cleanupUnusedTags();

  // Sort all columns by priority after loading
  sortAllColumnsByPriority();

  // Apply any active filters (this also updates column counts)
  applyFilters();

  // Check storage quota on load
  warnIfStorageHigh();

  // Render trash count
  renderTrashList();

  setupDragAndDrop();
  setupClipboardPaste();
  loadPermanentNotes();

  const input = document.getElementById('newNote');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addNote();
    });
  }

  // Search input handling
  const searchInput = document.getElementById('taskSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  if (searchInput) {
    const debouncedSearch = debounce((value) => {
      setSearchTerm(value);
      clearSearchBtn.style.display = value ? 'block' : 'none';
    }, 200);

    searchInput.addEventListener('input', (e) => {
      debouncedSearch(e.target.value);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        setSearchTerm('');
        clearSearchBtn.style.display = 'none';
        searchInput.blur();
      }
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      setSearchTerm('');
      clearSearchBtn.style.display = 'none';
    });
  }

  // Column filter buttons
  document.querySelectorAll('.column-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.column-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setColumnFilter(btn.dataset.column || null);
    });
  });

  // Auto-save permanent notes on input
  const permanentNotesField = document.getElementById('permanentNotes');
  if (permanentNotesField) {
    permanentNotesField.addEventListener('input', savePermanentNotes);
  }

  // Listen for task events from undo system
  window.addEventListener('kantrack:taskRestored', (e) => {
    const task = state.notesData.find(t => t.id === e.detail.taskId);
    if (task && !task.deleted) {
      const noteElement = createNoteElement(task);
      const col = document.getElementById(task.column);
      if (col) col.appendChild(noteElement);
      sortAllColumnsByPriority();
      applyFilters();
    }
  });

  window.addEventListener('kantrack:taskRemoved', (e) => {
    const noteElement = document.querySelector(`[data-id="${e.detail.taskId}"]`);
    if (noteElement) {
      noteElement.remove();
    }
  });

  window.addEventListener('kantrack:taskUpdated', (e) => {
    const task = state.notesData.find(t => t.id === e.detail.taskId);
    if (!task) return;

    // If column changed (e.g., from undo of a move), relocate the card
    if (e.detail.oldColumn && e.detail.oldColumn !== task.column) {
      const noteElement = document.querySelector(`[data-id="${e.detail.taskId}"]`);
      if (noteElement) {
        const newCol = document.getElementById(task.column);
        if (newCol) {
          newCol.appendChild(noteElement);
        }
      }
      sortColumnByPriority(task.column);
      sortColumnByPriority(e.detail.oldColumn);
    }

    updateNoteCardDisplay(e.detail.taskId);
    sortColumnByPriority(task.column);
    applyFilters();
    updateColumnCounts();
  });

  // iOS Safari touch support for elements with onclick attributes
  const clockAddButton = document.querySelector('.clock-add-button');
  if (clockAddButton) {
    clockAddButton.addEventListener('touchend', (e) => {
      if (!e.target.closest('button')) {
        e.preventDefault();
        openAddClockModal();
      }
    });
  }

  // iOS touch support for modal close buttons
  document.querySelectorAll('.modal-close').forEach(closeBtn => {
    closeBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      const modal = closeBtn.closest('.modal');
      if (modal) {
        if (modal.id === 'taskModal') closeTaskModal();
        else if (modal.id === 'imageModal') closeImageModal();
        else if (modal.id === 'addClockModal') closeAddClockModal();
      }
    });
  });

  // iOS touch support for modal backdrop tap-to-close
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('touchend', (e) => {
      if (e.target === modal) {
        e.preventDefault();
        if (modal.id === 'taskModal') {
          // Use existing close logic with unsaved changes check
          const task = state.notesData.find(t => t.id === state.currentTaskId);
          const notesEditor = document.getElementById('modalNotesEditor');
          const hasTextContent = notesEditor && notesEditor.textContent.trim().length > 0;
          const hasImages = notesEditor && notesEditor.querySelectorAll('img').length > 0;
          const hasNoteChanges = notesEditor && notesEditor.innerHTML.trim() && (hasTextContent || hasImages);
          const hasTimerChanges = task && (task.timer || 0) !== state.originalTimerValue;
          const hasPriorityChanges = state.currentModalPriority !== state.originalPriorityValue;
          const hasRealChanges = hasNoteChanges || hasTimerChanges || hasPriorityChanges;

          if (state.modalHasChanges && hasRealChanges) {
            if (confirm('You have unsaved changes. Are you sure you want to close without saving?')) {
              if (task && hasTimerChanges) {
                task.timer = state.originalTimerValue;
                updateNoteCardDisplay(state.currentTaskId);
                saveNotesToLocalStorage();
              }
              state.setModalHasChanges(false);
              state.setModalPendingActions([]);
              state.setOriginalTimerValue(0);
              state.setOriginalPriorityValue(null);
              state.setCurrentModalPriority(null);
              modal.style.display = 'none';
              state.setCurrentTaskId(null);
            }
          } else {
            closeTaskModal();
          }
        } else if (modal.id === 'imageModal') {
          closeImageModal();
        } else if (modal.id === 'addClockModal') {
          closeAddClockModal();
        }
      }
    });
  });

  window.onclick = function(event) {
    const taskModal = document.getElementById('taskModal');
    const imageModal = document.getElementById('imageModal');
    const addClockModal = document.getElementById('addClockModal');

    if (event.target === addClockModal) {
      closeAddClockModal();
    }

    if (event.target === taskModal) {
      // Check if there are actual changes
      const task = state.notesData.find(t => t.id === state.currentTaskId);
      const notesEditor = document.getElementById('modalNotesEditor');

      const hasTextContent = notesEditor && notesEditor.textContent.trim().length > 0;
      const hasImages = notesEditor && notesEditor.querySelectorAll('img').length > 0;
      const hasNoteChanges = notesEditor && notesEditor.innerHTML.trim() && (hasTextContent || hasImages);
      const hasTimerChanges = task && (task.timer || 0) !== state.originalTimerValue;
      const hasPriorityChanges = state.currentModalPriority !== state.originalPriorityValue;
      const hasRealChanges = hasNoteChanges || hasTimerChanges || hasPriorityChanges;

      if (state.modalHasChanges && hasRealChanges) {
        if (confirm('You have unsaved changes. Are you sure you want to close without saving?')) {
          // Revert timer changes if closing without saving
          if (task && hasTimerChanges) {
            task.timer = state.originalTimerValue;
            updateNoteCardDisplay(state.currentTaskId);
            saveNotesToLocalStorage();
          }

          state.setModalHasChanges(false);
          state.setModalPendingActions([]);
          state.setOriginalTimerValue(0);
          state.setOriginalPriorityValue(null);
          state.setCurrentModalPriority(null);
          taskModal.style.display = 'none';
          state.setCurrentTaskId(null);
        }
      } else {
        closeTaskModal();
      }
    }
    if (event.target === imageModal) {
      closeImageModal();
    }

    // Page modal click outside
    const pageModal = document.getElementById('pageModal');
    if (event.target === pageModal) {
      closePageModal();
    }
  };

  // Initialize notebook
  loadNotebookFromLocalStorage();
  renderNotebookTree();
  setupNotebookEventListeners();
});
