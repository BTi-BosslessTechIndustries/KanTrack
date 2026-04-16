/***********************
 * KANTRACK.JS - Main Entry Point
 * ES Module Version
 ***********************/

// Import all modules
import * as state from './kantrack-modules/state.js';
import { initIndexedDB, runDataMigrations } from './kantrack-modules/database.js';
import { requestDurableStorage, initStorageMonitor } from './kantrack-modules/storage-monitor.js';
import {
  loadNotesFromLocalStorage,
  saveNotesToLocalStorage,
  loadNotebookFromLocalStorage,
  loadPermanentNotes,
  savePermanentNotes,
  setAutoSaveCallback,
} from './kantrack-modules/storage.js';
import {
  loadClocks,
  openAddClockModal,
  closeAddClockModal,
  selectClockType,
  filterTimezones,
  addTimezoneClock,
  addChronometer,
} from './kantrack-modules/clocks.js';
import {
  openTaskModal,
  closeTaskModal,
  enableTitleEdit,
  clearNotes,
  toggleHistory,
  saveModal,
  saveAndCloseModal,
} from './kantrack-modules/modal.js';
import {
  addNote,
  deleteTaskFromModal,
  createNoteElement,
  updateNoteCardDisplay,
  initVirtualLists,
  updateColumnVirtualList,
  getColumnVirtualList,
} from './kantrack-modules/tasks.js';
import { setupDragAndDrop } from './kantrack-modules/drag-drop.js';
import { addSubKanbanItem, toggleSubKanban } from './kantrack-modules/sub-kanban.js';
import { addTime } from './kantrack-modules/timer.js';
import { setModalPriority } from './kantrack-modules/priority.js';
import {
  setupClipboardPaste,
  closeImageModal,
  zoomImage,
  resetZoom,
} from './kantrack-modules/images.js';
import {
  exportTaskAsPDF,
  exportBoardAsHTML,
  exportWorkspaceAsJSON,
  exportWorkspaceAsEncrypted,
  importBoardFromFile,
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
  importNotebookFromZip,
} from './kantrack-modules/notebook.js';
import { exportPageAsPDF, exportAllNotebook } from './kantrack-modules/notebook-export.js';
import {
  showSuccess,
  checkStorageQuota,
  getStorageBreakdown,
  logStorageDiagnostics,
} from './kantrack-modules/notifications.js';
import {
  initSearch,
  setSearchTerm,
  setColumnFilter,
  clearFilters,
  applyFilters,
} from './kantrack-modules/search.js';
import {
  initTags,
  renderTagSelector,
  renderTaskTagsHTML,
  cleanupUnusedTags,
  renderTagFilterButtons,
} from './kantrack-modules/tags.js';
import { renderDueDatePicker, renderDueDateHTML } from './kantrack-modules/due-dates.js';
import {
  initUndo,
  undo,
  redo,
  getTrashedTasks,
  restoreFromTrash,
  permanentlyDelete,
  emptyTrash,
  getTrashCount,
} from './kantrack-modules/undo.js';
import { debounce, createFocusTrap } from './kantrack-modules/utils.js';
import { scheduleCompaction } from './kantrack-modules/compaction.js';
import { registerAction, initRouter } from './kantrack-modules/router.js';
import { dispatch, TASK_SET_ALL } from './kantrack-modules/store.js';

/***********************
 * ABOUT MODAL
 ***********************/
let _aboutTrap = null;
let _aboutReturnFocus = null;

function openAboutModal() {
  const modal = document.getElementById('aboutModal');
  if (!modal) return;
  _aboutReturnFocus = document.activeElement;
  modal.style.display = 'flex';
  _aboutTrap = createFocusTrap(modal);
  _aboutTrap.activate();
  // Reset scroll AFTER the focus trap focuses its first element (focus() causes
  // the browser to scroll that element into view, which we must undo here).
  const content = modal.querySelector('.modal-content');
  if (content) content.scrollTop = 0;
}

function closeAboutModal() {
  const modal = document.getElementById('aboutModal');
  if (!modal) return;
  _aboutTrap?.deactivate();
  _aboutTrap = null;
  modal.style.display = 'none';
  _aboutReturnFocus?.focus();
  _aboutReturnFocus = null;
}

/***********************
 * SUPPORT MODAL
 ***********************/
let _supportTrap = null;
let _supportReturnFocus = null;

function openSupportModal() {
  const modal = document.getElementById('supportModal');
  if (!modal) return;
  _supportReturnFocus = document.activeElement;
  modal.style.display = 'flex';
  _supportTrap = createFocusTrap(modal);
  _supportTrap.activate();
  const content = modal.querySelector('.modal-content');
  if (content) content.scrollTop = 0;
}

function closeSupportModal() {
  const modal = document.getElementById('supportModal');
  if (!modal) return;
  _supportTrap?.deactivate();
  _supportTrap = null;
  modal.style.display = 'none';
  _supportReturnFocus?.focus();
  _supportReturnFocus = null;
}

/***********************
 * HEADER MENU DROPDOWN
 ***********************/
function toggleHeaderMenu() {
  const dropdown = document.getElementById('headerDropdown');
  const btn = document.getElementById('headerMenuBtn');
  if (!dropdown) return;
  const open = dropdown.style.display !== 'none' && dropdown.style.display !== '';
  dropdown.style.display = open ? 'none' : 'block';
  if (btn) btn.setAttribute('aria-expanded', String(!open));
}

function closeHeaderMenu() {
  const dropdown = document.getElementById('headerDropdown');
  const btn = document.getElementById('headerMenuBtn');
  if (dropdown) dropdown.style.display = 'none';
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

/***********************
 * SHORTCUTS DIALOG
 ***********************/
let _shortcutsTrap = null;
let _shortcutsReturnFocus = null;

function openShortcutsDialog() {
  const modal = document.getElementById('shortcutsModal');
  if (!modal) return;
  _shortcutsReturnFocus = document.activeElement;
  modal.style.display = 'flex';
  _shortcutsTrap = createFocusTrap(modal);
  _shortcutsTrap.activate();
}

function closeShortcutsDialog() {
  const modal = document.getElementById('shortcutsModal');
  if (!modal) return;
  _shortcutsTrap?.deactivate();
  _shortcutsTrap = null;
  modal.style.display = 'none';
  _shortcutsReturnFocus?.focus();
  _shortcutsReturnFocus = null;
}

/***********************
 * ACTION REGISTRATIONS
 * Maps data-action strings to handler functions.
 * Replaces all window.* exports and inline onclick handlers.
 ***********************/

// Shortcuts dialog
registerAction('shortcuts:close', () => closeShortcutsDialog());
registerAction('shortcuts:open', () => openShortcutsDialog());

// About modal
registerAction('about:open', () => openAboutModal());
registerAction('about:close', () => closeAboutModal());

// Support modal
registerAction('support:open', () => openSupportModal());
registerAction('support:close', () => closeSupportModal());

// Header menu dropdown
registerAction('menu:toggle', () => toggleHeaderMenu());

// History
registerAction('history:undo', () => undo());
registerAction('history:redo', () => redo());

// Trash panel
registerAction('trash:togglePanel', () => toggleTrashPanel());
registerAction('trash:emptyAll', () => emptyAllTrash());
registerAction('trash:restore', param => restoreFromTrashUI(param));
registerAction('trash:permanentDelete', param => permanentDeleteUI(param));

// Notebook
registerAction('notebook:toggleSidebar', () => toggleNotebookSidebar());
registerAction('notebook:createFolder', () => createNotebookItem('folder', null));
registerAction('notebook:createPage', () => createNotebookItem('page', null));
registerAction('notebook:triggerImport', () =>
  document.getElementById('notebookImportFile').click()
);
registerAction('notebook:exportAll', () => exportAllNotebook());
registerAction('notebook:contextMenu', param => contextMenuAction(param));
registerAction('notebook:closePage', () => closePageModal());
registerAction('notebook:savePage', () => saveAndClosePage());
registerAction('notebook:exportPagePDF', () => exportPageAsPDF());
registerAction('notebook:deletePage', () => deletePageFromModal());

// Clocks
registerAction('clock:openModal', () => openAddClockModal());
registerAction('clock:closeModal', () => closeAddClockModal());
registerAction('clock:selectType', param => selectClockType(param));
registerAction('clock:addTimezone', () => addTimezoneClock());
registerAction('clock:addChronometer', () => addChronometer());

// Tasks
registerAction('task:add', () => addNote());
registerAction('task:closeModal', () => closeTaskModal());
registerAction('task:saveModal', () => saveAndCloseModal());
registerAction('task:saveModalOnly', () => saveModal());
registerAction('task:exportPDF', () => exportTaskAsPDF());
registerAction('task:deleteModal', () => deleteTaskFromModal());
registerAction('task:clearNotes', () => clearNotes());
registerAction('task:setPriority', param => setModalPriority(param === 'none' ? null : param));
registerAction('task:addTime', param => addTime(Number(param)));
registerAction('task:toggleSubKanban', () => toggleSubKanban());
registerAction('task:addSubItem', () => addSubKanbanItem());
registerAction('task:toggleHistory', () => toggleHistory());

// Board
registerAction('board:exportJSON', () => exportWorkspaceAsJSON('full'));
registerAction('board:exportJSONLite', () => exportWorkspaceAsJSON('lightweight'));
registerAction('board:exportEncrypted', () => exportWorkspaceAsEncrypted());
registerAction('board:exportHTML', () => exportBoardAsHTML());
registerAction('board:triggerImport', () => document.getElementById('importFile').click());

// Image viewer
registerAction('image:closeModal', () => closeImageModal());
registerAction('image:zoom', param => zoomImage(Number(param)));
registerAction('image:resetZoom', () => resetZoom());

// Storage diagnostics (console-access helpers — not in router, kept on window for dev tooling)
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

function renderTrashList() {
  const list = document.getElementById('trashList');
  const trashed = getTrashedTasks();

  updateTrashCount();

  if (trashed.length === 0) {
    list.innerHTML = '<div class="trash-empty-message">Trash is empty</div>';
    return;
  }

  list.innerHTML = trashed
    .map(
      task => `
    <div class="trash-item" data-id="${task.id}">
      <div class="trash-item-info">
        <div class="trash-item-title">${escapeHtmlLocal(task.title)}</div>
        <div class="trash-item-date">Deleted: ${formatTrashDate(task.trashedAt)}</div>
      </div>
      <div class="trash-item-actions">
        <button class="restore-btn" data-action="trash:restore" data-action-param="${task.id}">Restore</button>
        <button class="permanent-delete-btn" data-action="trash:permanentDelete" data-action-param="${task.id}">Delete</button>
      </div>
    </div>
  `
    )
    .join('');
}

function restoreFromTrashUI(taskId) {
  // Handle both old numeric IDs (timestamp strings) and new UUID string IDs
  const id = /^\d+$/.test(String(taskId)) ? parseInt(taskId, 10) : taskId;
  const task = restoreFromTrash(id);
  if (task) {
    delete task.deleted;

    // Add a history entry so the task log shows the restoration
    if (!task.actions) task.actions = [];
    task.actions.push({
      action: 'Restored from trash',
      timestamp: new Date().toLocaleString(),
      type: 'status',
    });

    // Replace the soft-deleted entry in state.notesData rather than pushing a
    // second copy — the original entry (with deleted:true) is still in the array.
    const existingIndex = state.notesData.findIndex(t => t.id === task.id);
    if (existingIndex !== -1) {
      state.notesData.splice(existingIndex, 1, task);
    } else {
      state.notesData.push(task);
    }
    saveNotesToLocalStorage();

    if (getColumnVirtualList(task.column)) {
      updateColumnVirtualList(task.column);
    } else {
      const noteElement = createNoteElement(task);
      const col = document.getElementById(task.column);
      if (col) col.appendChild(noteElement);
      sortAllColumnsByPriority();
    }

    applyFilters();
    updateColumnCounts();
    renderTagFilterButtons();
    renderTrashList();
    showSuccess('Task restored');
  }
}

function permanentDeleteUI(taskId) {
  // Handle both old numeric IDs (timestamp strings) and new UUID string IDs
  const id = /^\d+$/.test(String(taskId)) ? parseInt(taskId, 10) : taskId;
  if (confirm('Permanently delete this task? This cannot be undone.')) {
    permanentlyDelete(id);
    cleanupUnusedTags();
    renderTagFilterButtons();
    renderTrashList();
    showSuccess('Task permanently deleted');
  }
}

function emptyAllTrash() {
  const count = getTrashCount();
  if (count === 0) return;

  if (confirm(`Permanently delete all ${count} item(s) in trash? This cannot be undone.`)) {
    emptyTrash();
    cleanupUnusedTags();
    renderTagFilterButtons();
    renderTrashList();
    showSuccess('Trash emptied');
  }
}

function formatTrashDate(timestamp) {
  const date = new Date(timestamp);
  return (
    date.toLocaleDateString() +
    ' ' +
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
}

function escapeHtmlLocal(str) {
  return String(str).replace(
    /[&<>"']/g,
    s =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[s]
  );
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

    let countSpan = header.querySelector('.column-count');
    if (!countSpan) {
      countSpan = document.createElement('span');
      countSpan.className = 'column-count';
      header.appendChild(countSpan);
    }

    let taskCount;
    if (getColumnVirtualList(columnId)) {
      // Data-based counting — DOM only holds a window of cards
      taskCount = state.notesData.filter(t => !t.deleted && t.column === columnId).length;
    } else {
      const allNoteElements = Array.from(column.querySelectorAll('.note'));
      taskCount = allNoteElements.filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }).length;
    }

    countSpan.textContent = taskCount > 0 ? `(${taskCount})` : '';
  });
}

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
  // Initialize the router (single delegated click listener)
  initRouter();

  await initIndexedDB();
  await runDataMigrations();

  // Set up auto-save callback before any saves can fire
  setAutoSaveCallback(showAutoSaveIndicator);

  // Load tasks first (required by initTags for getUsedTagIds)
  const notes = await loadNotesFromLocalStorage();

  // Seed the store with the initial task set
  dispatch({ type: TASK_SET_ALL, payload: notes });

  // Create one VirtualList per column; registers sort+filter callbacks
  initVirtualLists(notes);

  // Initialize feature modules (after tasks are loaded)
  await initTags();
  renderTagFilterButtons();
  await initUndo();
  scheduleCompaction();
  initSearch();

  // Load clocks (async)
  await loadClocks();

  // Clean up any orphan tags (tags not used by any task)
  cleanupUnusedTags();

  // Sort all columns by priority after loading
  sortAllColumnsByPriority();

  // Apply any active filters (this also updates column counts)
  applyFilters();

  // Storage monitoring — background, fire-and-forget
  requestDurableStorage();
  initStorageMonitor();

  // Render trash count
  renderTrashList();

  setupDragAndDrop();
  setupClipboardPaste();
  loadPermanentNotes();

  // ── Non-click event listeners (formerly inline oninput/onchange/ondblclick/onkeydown) ──

  // Task add on Enter key
  const newNoteInput = document.getElementById('newNote');
  if (newNoteInput) {
    newNoteInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') addNote();
    });
  }

  // Sub-task add on Enter key
  const newSubTaskInput = document.getElementById('newSubTaskInput');
  if (newSubTaskInput) {
    newSubTaskInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') addSubKanbanItem();
    });
  }

  // Modal title double-click to enable editing
  const modalTitle = document.getElementById('modalTitle');
  if (modalTitle) {
    modalTitle.addEventListener('dblclick', () => enableTitleEdit());
  }

  // Notebook search input
  const notebookSearchInput = document.getElementById('notebookSearchInput');
  if (notebookSearchInput) {
    notebookSearchInput.addEventListener('input', () => filterNotebookItems());
  }

  // Notebook file import trigger
  const notebookImportFile = document.getElementById('notebookImportFile');
  if (notebookImportFile) {
    notebookImportFile.addEventListener('change', e => importNotebookFromZip(e));
  }

  // Board file import trigger
  const importFileInput = document.getElementById('importFile');
  if (importFileInput) {
    importFileInput.addEventListener('change', e => importBoardFromFile(e));
  }

  // Timezone search input
  const clockTimezoneSearch = document.getElementById('clockTimezoneSearch');
  if (clockTimezoneSearch) {
    clockTimezoneSearch.addEventListener('input', () => filterTimezones());
  }

  // Search input handling
  const searchInput = document.getElementById('taskSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  if (searchInput) {
    const debouncedSearch = debounce(value => {
      setSearchTerm(value);
      clearSearchBtn.style.display = value ? 'block' : 'none';
    }, 200);

    searchInput.addEventListener('input', e => {
      debouncedSearch(e.target.value);
    });

    searchInput.addEventListener('keydown', e => {
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

  // ── Global keyboard shortcuts ──

  function isAnyModalOpen() {
    const ids = [
      'taskModal',
      'pageModal',
      'imageModal',
      'addClockModal',
      'shortcutsModal',
      'aboutModal',
      'supportModal',
    ];
    return ids.some(id => {
      const el = document.getElementById(id);
      return el && el.style.display !== 'none' && el.style.display !== '';
    });
  }

  // ESC — close whatever is open, in priority order
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const taskModal = document.getElementById('taskModal');
    const pageModal = document.getElementById('pageModal');
    const imageModal = document.getElementById('imageModal');
    const clockModal = document.getElementById('addClockModal');
    const shortcutsModal = document.getElementById('shortcutsModal');
    const trashPanel = document.getElementById('trashPanel');
    const isOpen = el => el && el.style.display !== 'none' && el.style.display !== '';
    if (isOpen(taskModal)) {
      closeTaskModal();
      return;
    }
    if (isOpen(pageModal)) {
      closePageModal();
      return;
    }
    if (isOpen(imageModal)) {
      closeImageModal();
      return;
    }
    if (isOpen(clockModal)) {
      closeAddClockModal();
      return;
    }
    if (isOpen(shortcutsModal)) {
      closeShortcutsDialog();
      return;
    }
    const aboutModal = document.getElementById('aboutModal');
    if (isOpen(aboutModal)) {
      closeAboutModal();
      return;
    }
    const supportModal = document.getElementById('supportModal');
    if (isOpen(supportModal)) {
      closeSupportModal();
      return;
    }
    if (isOpen(trashPanel)) toggleTrashPanel();
  });

  // N → focus new task input; / → focus search; ? → open shortcuts dialog
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    const inInput =
      tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
    if (inInput || isAnyModalOpen()) return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      document.getElementById('newNote')?.focus();
    } else if (e.key === '/') {
      e.preventDefault();
      document.getElementById('taskSearchInput')?.focus();
    } else if (e.key === '?') {
      e.preventDefault();
      openShortcutsDialog();
    }
  });

  // Arrow key card navigation — delegated on the board container
  const board = document.querySelector('.kanban-board');
  if (board) {
    board.addEventListener('keydown', e => {
      const card = document.activeElement;
      if (!card?.classList.contains('note')) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const COLS = ['todo', 'inProgress', 'onHold', 'done'];
      const currentCol = card.closest('.column');
      const cards = Array.from(currentCol.querySelectorAll('.note'));
      const idx = cards.indexOf(card);
      if (e.key === 'ArrowDown') {
        cards[idx + 1]?.focus();
      } else if (e.key === 'ArrowUp') {
        cards[idx - 1]?.focus();
      } else {
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const nextId = COLS[COLS.indexOf(currentCol.id) + dir];
        if (nextId) document.querySelector(`#${nextId} .note`)?.focus();
      }
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

  // ── Custom event listeners from other modules ──

  // tasks.js dispatches these instead of calling window.updateColumnCounts / window.updateTrashCount
  window.addEventListener('kantrack:updateColumnCounts', () => updateColumnCounts());
  window.addEventListener('kantrack:updateTrashCount', () => {
    updateTrashCount();
    renderTrashList();
  });

  // ── Task lifecycle events from undo system ──

  window.addEventListener('kantrack:taskRestored', e => {
    const task = state.notesData.find(t => t.id === e.detail.taskId);
    if (task && !task.deleted) {
      if (getColumnVirtualList(task.column)) {
        updateColumnVirtualList(task.column);
      } else {
        const noteElement = createNoteElement(task);
        const col = document.getElementById(task.column);
        if (col) col.appendChild(noteElement);
        sortAllColumnsByPriority();
      }
      applyFilters();
    }
  });

  window.addEventListener('kantrack:taskRemoved', e => {
    const taskId = e.detail.taskId;
    // Task may have been spliced from notesData (undo of create) or marked deleted (redo of delete)
    const task = state.notesData.find(t => t.id === taskId);
    if (getColumnVirtualList(task?.column ?? 'todo')) {
      // Update all columns — we may not know the exact column if task was spliced out
      const COLUMN_IDS = ['todo', 'inProgress', 'onHold', 'done'];
      COLUMN_IDS.forEach(col => updateColumnVirtualList(col));
    } else {
      const noteElement = document.querySelector(`[data-id="${taskId}"]`);
      if (noteElement) noteElement.remove();
    }
  });

  window.addEventListener('kantrack:taskUpdated', e => {
    const task = state.notesData.find(t => t.id === e.detail.taskId);
    if (!task) return;

    if (getColumnVirtualList(task.column)) {
      if (e.detail.oldColumn && e.detail.oldColumn !== task.column) {
        updateColumnVirtualList(e.detail.oldColumn);
      }
      updateColumnVirtualList(task.column);
    } else {
      if (e.detail.oldColumn && e.detail.oldColumn !== task.column) {
        const noteElement = document.querySelector(`[data-id="${e.detail.taskId}"]`);
        if (noteElement) {
          const newCol = document.getElementById(task.column);
          if (newCol) newCol.appendChild(noteElement);
        }
        sortColumnByPriority(task.column);
        sortColumnByPriority(e.detail.oldColumn);
      }
      updateNoteCardDisplay(e.detail.taskId);
      sortColumnByPriority(task.column);
    }
    applyFilters();
    updateColumnCounts();
  });

  // ── Header menu: close when clicking outside ──

  document.addEventListener('click', e => {
    const wrapper = document.getElementById('headerMenuWrapper');
    if (wrapper && !wrapper.contains(e.target)) closeHeaderMenu();
  });

  // ── Modal backdrop: click outside to close ──

  document.addEventListener('click', e => {
    const taskModal = document.getElementById('taskModal');
    const imageModal = document.getElementById('imageModal');
    const addClockModal = document.getElementById('addClockModal');
    const pageModal = document.getElementById('pageModal');
    const shortcutsModal = document.getElementById('shortcutsModal');
    const aboutModal = document.getElementById('aboutModal');

    if (e.target === shortcutsModal) {
      closeShortcutsDialog();
      return;
    }

    if (e.target === aboutModal) {
      closeAboutModal();
      return;
    }

    const supportModal = document.getElementById('supportModal');
    if (e.target === supportModal) {
      closeSupportModal();
      return;
    }

    if (e.target === addClockModal) {
      closeAddClockModal();
      return;
    }

    if (e.target === imageModal) {
      closeImageModal();
      return;
    }

    if (e.target === pageModal) {
      closePageModal();
      return;
    }

    if (e.target === taskModal) {
      const task = state.notesData.find(t => t.id === state.currentTaskId);
      const notesEditor = document.getElementById('modalNotesEditor');
      const hasTextContent = notesEditor && notesEditor.textContent.trim().length > 0;
      const hasImages = notesEditor && notesEditor.querySelectorAll('img').length > 0;
      const hasNoteChanges =
        notesEditor && notesEditor.innerHTML.trim() && (hasTextContent || hasImages);
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
          taskModal.style.display = 'none';
          state.setCurrentTaskId(null);
        }
      } else {
        closeTaskModal();
      }
    }
  });

  // ── iOS Safari touch support ──

  // Clock add button (div, not button — needs touchend for iOS)
  const clockAddButton = document.querySelector('.clock-add-button');
  if (clockAddButton) {
    clockAddButton.addEventListener('touchend', e => {
      if (!e.target.closest('button')) {
        e.preventDefault();
        openAddClockModal();
      }
    });
  }

  // Modal close buttons on iOS
  document.querySelectorAll('.modal-close').forEach(closeBtn => {
    closeBtn.addEventListener('touchend', e => {
      e.preventDefault();
      const modal = closeBtn.closest('.modal');
      if (modal) {
        if (modal.id === 'taskModal') closeTaskModal();
        else if (modal.id === 'imageModal') closeImageModal();
        else if (modal.id === 'addClockModal') closeAddClockModal();
        else if (modal.id === 'pageModal') closePageModal();
        else if (modal.id === 'aboutModal') closeAboutModal();
        else if (modal.id === 'supportModal') closeSupportModal();
        else if (modal.id === 'shortcutsModal') closeShortcutsDialog();
      }
    });
  });

  // Modal backdrop tap-to-close on iOS
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('touchend', e => {
      if (e.target === modal) {
        e.preventDefault();
        if (modal.id === 'taskModal') {
          const task = state.notesData.find(t => t.id === state.currentTaskId);
          const notesEditor = document.getElementById('modalNotesEditor');
          const hasTextContent = notesEditor && notesEditor.textContent.trim().length > 0;
          const hasImages = notesEditor && notesEditor.querySelectorAll('img').length > 0;
          const hasNoteChanges =
            notesEditor && notesEditor.innerHTML.trim() && (hasTextContent || hasImages);
          const hasTimerChanges = task && (task.timer || 0) !== state.originalTimerValue;
          const hasPriorityChanges = state.currentModalPriority !== state.originalPriorityValue;
          const hasRealChanges = hasNoteChanges || hasTimerChanges || hasPriorityChanges;

          if (state.modalHasChanges && hasRealChanges) {
            if (
              confirm('You have unsaved changes. Are you sure you want to close without saving?')
            ) {
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

  // Initialize notebook (must be last — depends on other modules being ready)
  await loadNotebookFromLocalStorage();
  renderNotebookTree();
  setupNotebookEventListeners();
});
