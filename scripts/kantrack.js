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
  saveNotebookToLocalStorage,
  loadPermanentNotes,
  savePermanentNotes,
  setAutoSaveCallback,
  flushPendingIDBWrites,
  safeGetItem,
  safeSetItem,
} from './kantrack-modules/storage.js';
import {
  loadClocks,
  openAddClockModal,
  closeAddClockModal,
  selectClockType,
  filterTimezones,
  addTimezoneClock,
  addChronometer,
  resetToCurrentTime,
  renderClocks,
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
import {
  addSubKanbanItem,
  toggleSubKanban,
  renderSubKanban,
} from './kantrack-modules/sub-kanban.js';
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
  showError,
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
  updateColumnCounts,
} from './kantrack-modules/search.js';
import {
  initTags,
  renderTagSelector,
  renderTaskTagsHTML,
  cleanupUnusedTags,
  renderTagFilterButtons,
  registerRecordAction,
  createTag,
} from './kantrack-modules/tags.js';
import { renderDueDatePicker, renderDueDateHTML } from './kantrack-modules/due-dates.js';
import {
  initUndo,
  undo,
  redo,
  recordAction,
  getTrashedTasks,
  restoreFromTrash,
  permanentlyDelete,
  emptyTrash,
  getTrashCount,
} from './kantrack-modules/undo.js';
import {
  debounce,
  createFocusTrap,
  applyLanguageAttrs,
  setActiveLanguageCode,
} from './kantrack-modules/utils.js';
import { setLanguage, applyTranslations, t } from './kantrack-modules/i18n.js';
import { scheduleCompaction } from './kantrack-modules/compaction.js';
import { checkDoneCapacity, backfillDoneTimestamps } from './kantrack-modules/done-capacity.js';
import {
  getHiddenCount,
  showHiddenCardsModal,
  countHiddenMatches,
} from './kantrack-modules/hidden-cards.js';
import { registerAction, initRouter } from './kantrack-modules/router.js';
import { dispatch, TASK_SET_ALL } from './kantrack-modules/store.js';

/***********************
 * HEADER LOGO POSITIONING
 * Centers the logo at the midpoint between the Support Us button's right edge
 * and the leftmost visible element in the right section (Add Clock or Undo).
 ***********************/
function positionHeaderLogo() {
  const header = document.querySelector('.top-header');
  const supportBtn = document.querySelector('.support-us-btn');
  const logoCenter = document.querySelector('.header-center');
  const addClockBtn = document.getElementById('headerAddClockBtn');
  const undoBtn = document.getElementById('undoBtn');

  if (!header || !supportBtn || !logoCenter || !addClockBtn || !undoBtn) return;

  const clockGroupEl = document.getElementById('headerClockGroup');
  const clockGroupVisible = clockGroupEl && getComputedStyle(clockGroupEl).display !== 'none';
  const rightAnchorEl = clockGroupVisible ? addClockBtn : undoBtn;

  const headerRect = header.getBoundingClientRect();
  const leftAnchorX = supportBtn.getBoundingClientRect().right - headerRect.left;
  const rightAnchorX = rightAnchorEl.getBoundingClientRect().left - headerRect.left;

  const centerWidth = logoCenter.getBoundingClientRect().width;
  logoCenter.style.left = (leftAnchorX + rightAnchorX) / 2 - centerWidth / 2 + 'px';
}

/***********************
 * CARD SIZE
 ***********************/
function applyCardSize(size) {
  document.body.classList.remove('card-size-small', 'card-size-large');
  if (size === 'small') document.body.classList.add('card-size-small');
  if (size === 'large') document.body.classList.add('card-size-large');
  document.querySelectorAll('[data-action="cardSize:set"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.actionParam === size);
  });
}

/***********************
 * THEME (Light / Dark / System)
 ***********************/
const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function getEffectiveTheme(mode) {
  if (mode === 'system') {
    return window.matchMedia(THEME_MEDIA_QUERY).matches ? 'dark' : 'light';
  }
  return mode;
}

function applyTheme(mode) {
  const effective = getEffectiveTheme(mode);
  document.body.classList.toggle('theme-light', effective === 'light');
  document.querySelectorAll('[data-action="theme:set"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.actionParam === mode);
  });
}

function initThemeSystemListener() {
  window.matchMedia(THEME_MEDIA_QUERY).addEventListener('change', () => {
    if (safeGetItem('themeMode', 'system') === 'system') {
      applyTheme('system');
    }
  });
}

const LANGUAGE_FIELD_SELECTORS = [
  '#newNote',
  '#modalTitle',
  '#modalNotesEditor',
  '#newSubTaskInput',
  '#permanentNotes',
  '#temporaryNotes',
  '#pageModalTitle',
  '#pageEditor',
];

function applyLanguageSettings(code) {
  setActiveLanguageCode(code);
  LANGUAGE_FIELD_SELECTORS.forEach(sel => {
    document.querySelectorAll(sel).forEach(applyLanguageAttrs);
  });
  document.querySelectorAll('.sub-kanban-item-title, .tree-item-name').forEach(applyLanguageAttrs);
}

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

// Card size
registerAction('cardSize:set', param => {
  applyCardSize(param);
  safeSetItem('cardSize', param);
});

// Theme (Light / Dark / System)
registerAction('theme:set', mode => {
  applyTheme(mode);
  safeSetItem('themeMode', mode);
});

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
registerAction('history:undo', () => {
  undo();
  checkDoneCapacity();
});
registerAction('history:redo', () => {
  redo();
  checkDoneCapacity();
});

// Trash panel
registerAction('trash:togglePanel', () => toggleTrashPanel());
registerAction('hidden:open', () => showHiddenCardsModal());
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
registerAction('clock:resetClocks', () => resetToCurrentTime());

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
registerAction('board:exportEverything', async () => {
  try {
    await exportWorkspaceAsJSON('full');
    await exportAllNotebook();
  } catch (err) {
    showError('Export failed: ' + err.message);
  }
});
registerAction('board:triggerImport', () => document.getElementById('importFile').click());

// Image viewer
registerAction('image:closeModal', () => closeImageModal());
registerAction('image:zoom', param => zoomImage(Number(param)));
registerAction('image:resetZoom', () => resetZoom());

// Storage diagnostics (console-access helpers - not in router, kept on window for dev tooling)
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

function updateHiddenCountBadge() {
  const count = getHiddenCount();
  const countBadge = document.getElementById('hiddenCount');

  if (countBadge) {
    countBadge.textContent = count;
    countBadge.style.display = count > 0 ? 'flex' : 'none';
  }
}

function updateHiddenSearchHint(query) {
  const hint = document.getElementById('hiddenSearchHint');
  if (!hint) return;

  const term = (query || '').trim();
  const count = term ? countHiddenMatches(term) : 0;

  if (count === 0) {
    hint.style.display = 'none';
    hint.innerHTML = '';
    return;
  }

  hint.style.display = 'block';
  hint.innerHTML = `${count} hidden card${count === 1 ? '' : 's'} also match - <a href="#" id="hiddenSearchHintLink">View</a>`;
  hint.querySelector('#hiddenSearchHintLink').addEventListener('click', e => {
    e.preventDefault();
    showHiddenCardsModal(term);
  });
}

function renderTrashList() {
  const list = document.getElementById('trashList');
  const trashed = getTrashedTasks();

  updateTrashCount();

  if (trashed.length === 0) {
    list.innerHTML = `<div class="trash-empty-message">${escapeHtmlLocal(t('trashPanel.empty'))}</div>`;
    return;
  }

  list.innerHTML = trashed
    .map(
      task => `
    <div class="trash-item" data-id="${task.id}">
      <div class="trash-item-info">
        <div class="trash-item-title">${escapeHtmlLocal(task.title)}</div>
        <div class="trash-item-date">${escapeHtmlLocal(t('trashPanel.deletedOn', { date: formatTrashDate(task.trashedAt) }))}</div>
      </div>
      <div class="trash-item-actions">
        <button class="restore-btn" data-action="trash:restore" data-action-param="${task.id}">${escapeHtmlLocal(t('trashPanel.restore'))}</button>
        <button class="permanent-delete-btn" data-action="trash:permanentDelete" data-action-param="${task.id}">${escapeHtmlLocal(t('trashPanel.delete'))}</button>
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
    // second copy - the original entry (with deleted:true) is still in the array.
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
    checkDoneCapacity();
    if (task.hidden) {
      window.dispatchEvent(new Event('kantrack:updateHiddenCount'));
    }
    showSuccess(t('trashPanel.taskRestored'));
  }
}

function permanentDeleteUI(taskId) {
  // Handle both old numeric IDs (timestamp strings) and new UUID string IDs
  const id = /^\d+$/.test(String(taskId)) ? parseInt(taskId, 10) : taskId;
  if (confirm(t('trashPanel.confirmDeleteOne'))) {
    permanentlyDelete(id);
    cleanupUnusedTags();
    renderTagFilterButtons();
    renderTrashList();
    showSuccess(t('trashPanel.taskDeleted'));
  }
}

function emptyAllTrash() {
  const count = getTrashCount();
  if (count === 0) return;

  if (confirm(t('trashPanel.confirmEmptyAll', { count }))) {
    emptyTrash();
    cleanupUnusedTags();
    renderTagFilterButtons();
    renderTrashList();
    showSuccess(t('trashPanel.emptied'));
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
 * NAVIGATION GUARD
 ***********************/
window.addEventListener('beforeunload', function (e) {
  flushPendingIDBWrites();
  e.preventDefault();
  e.returnValue = '';
});

/***********************
 * DEMO BOARD SEED
 * Populates the board with realistic demo data on first visit (empty board only).
 ***********************/
function seedDemoBoard() {
  // Create demo tags
  createTag('Compliance', 2); // amber
  createTag('Analytics', 5); // blue
  createTag('Platform', 3); // green

  const twoDaysFromNow = new Date(Date.now() + 2 * 86_400_000).toISOString().split('T')[0];

  // Helper: timestamp N days ago at a given hour:minute
  const ago = (days, h = 9, m = 0) => {
    const d = new Date(Date.now() - days * 86_400_000);
    d.setHours(h, m, 0, 0);
    return d.toLocaleString();
  };

  const note1HTML =
    '<p>Revenue variance: −$42k vs forecast. Main driver is timing on enterprise renewals — 3 accounts pushed to Q4 by procurement. COGS came in $18k under budget; ops ran lean in September. Net effect: EBITDA within acceptable range. No restatement needed. Sending summary to CFO this afternoon.</p>';
  const note2HTML =
    '<p>Reviewed 4 data categories. Transaction logs: compliant at 7-year retention. Analytics events: non-compliant — currently indefinite, needs 90-day rolling cap. Marketing email logs: borderline, legal recommends 2-year. Customer PII export process exists but SLA documentation is missing — raised ticket with engineering. Full report drafted, waiting on legal sign-off.</p>';
  const note3HTML =
    '<p>Data model wired to Snowflake staging. 30-day rolling cash position working correctly. Issue: AR aging buckets show negative amounts above $500k — sign convention mismatch in source GL. Blocked on accounting confirmation before pushing to prod. Also need design sign-off on the breakdown table layout.</p>';
  const note4HTML =
    "<p>Historical load complete for FY2022–2024. FY2025 YTD at ~40%. Blocker: intercompany elimination account codes don't map 1:1 to new chart of accounts. Building manual mapping table — ~2–3h work. This is a risk to the deadline; escalating to ops lead if not resolved by EOD tomorrow.</p>";

  const demoTasks = [
    {
      id: crypto.randomUUID(),
      title: 'Reconcile Q3 P&L against actuals',
      timer: 118,
      priority: 'low',
      tags: ['analytics'],
      dueDate: null,
      column: 'done',
      _demo: true,
      noteEntries: [{ timestamp: ago(5, 10, 30), notesHTML: note1HTML, images: [] }],
      actions: [
        { action: 'Created', timestamp: ago(5, 8, 45), type: 'created' },
        { action: 'Added tag "Analytics"', timestamp: ago(5, 8, 46), type: 'tag' },
        { type: 'note', timestamp: ago(5, 10, 30), notesHTML: note1HTML, images: [] },
        { action: 'Added 118 minute(s) to timer', timestamp: ago(5, 10, 30), type: 'timer' },
        { action: 'Priority changed from None to Low', timestamp: ago(5, 14, 0), type: 'priority' },
        { action: 'Moved to Done', timestamp: ago(5, 16, 15), type: 'status' },
      ],
    },
    {
      id: crypto.randomUUID(),
      title: 'Audit data retention policies for GDPR',
      timer: 74,
      priority: 'medium',
      tags: ['compliance'],
      dueDate: null,
      column: 'done',
      _demo: true,
      noteEntries: [{ timestamp: ago(4, 11, 15), notesHTML: note2HTML, images: [] }],
      actions: [
        { action: 'Created', timestamp: ago(4, 9, 0), type: 'created' },
        { action: 'Added tag "Compliance"', timestamp: ago(4, 9, 1), type: 'tag' },
        {
          action: 'Priority changed from None to Medium',
          timestamp: ago(4, 9, 5),
          type: 'priority',
        },
        { type: 'note', timestamp: ago(4, 11, 15), notesHTML: note2HTML, images: [] },
        { action: 'Added 74 minute(s) to timer', timestamp: ago(4, 11, 15), type: 'timer' },
        { action: 'Moved to Done', timestamp: ago(4, 15, 30), type: 'status' },
      ],
    },
    {
      id: crypto.randomUUID(),
      title: 'Build automated cash flow dashboard',
      timer: 93,
      priority: 'high',
      tags: ['analytics', 'platform'],
      dueDate: null,
      column: 'inProgress',
      _demo: true,
      noteEntries: [{ timestamp: ago(3, 15, 45), notesHTML: note3HTML, images: [] }],
      actions: [
        { action: 'Created', timestamp: ago(3, 10, 0), type: 'created' },
        { action: 'Added tag "Analytics"', timestamp: ago(3, 10, 1), type: 'tag' },
        { action: 'Added tag "Platform"', timestamp: ago(3, 10, 1), type: 'tag' },
        {
          action: 'Priority changed from None to High',
          timestamp: ago(3, 10, 5),
          type: 'priority',
        },
        { type: 'note', timestamp: ago(3, 15, 45), notesHTML: note3HTML, images: [] },
        { action: 'Added 93 minute(s) to timer', timestamp: ago(3, 15, 45), type: 'timer' },
      ],
    },
    {
      id: crypto.randomUUID(),
      title: 'Migrate legacy GL to new data warehouse',
      timer: 61,
      priority: 'medium',
      tags: ['platform'],
      dueDate: twoDaysFromNow,
      column: 'inProgress',
      _demo: true,
      noteEntries: [{ timestamp: ago(2, 14, 0), notesHTML: note4HTML, images: [] }],
      actions: [
        { action: 'Created', timestamp: ago(2, 9, 30), type: 'created' },
        { action: 'Added tag "Platform"', timestamp: ago(2, 9, 31), type: 'tag' },
        {
          action: 'Priority changed from None to Medium',
          timestamp: ago(2, 9, 35),
          type: 'priority',
        },
        { action: `Due date set to ${twoDaysFromNow}`, timestamp: ago(2, 9, 36), type: 'dueDate' },
        { type: 'note', timestamp: ago(2, 14, 0), notesHTML: note4HTML, images: [] },
        { action: 'Added 61 minute(s) to timer', timestamp: ago(2, 14, 0), type: 'timer' },
      ],
    },
    {
      id: crypto.randomUUID(),
      title: 'Implement IFRS 17 reporting module',
      noteEntries: [],
      timer: 0,
      priority: 'high',
      tags: ['compliance', 'platform'],
      dueDate: null,
      column: 'todo',
      _demo: true,
      subKanban: {
        enabled: true,
        items: [
          {
            id: crypto.randomUUID(),
            title: 'Define calculation engine',
            column: 'done',
            createdAt: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            title: 'Schema migration',
            column: 'inProgress',
            createdAt: new Date().toISOString(),
          },
          {
            id: crypto.randomUUID(),
            title: 'Audit trail logging',
            column: 'todo',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      actions: [
        { action: 'Created', timestamp: ago(1, 11, 0), type: 'created' },
        { action: 'Added tag "Compliance"', timestamp: ago(1, 11, 1), type: 'tag' },
        { action: 'Added tag "Platform"', timestamp: ago(1, 11, 1), type: 'tag' },
        {
          action: 'Priority changed from None to High',
          timestamp: ago(1, 11, 5),
          type: 'priority',
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      title: 'Document model validation framework',
      noteEntries: [],
      timer: 0,
      priority: 'low',
      tags: ['compliance', 'analytics'],
      dueDate: null,
      column: 'todo',
      _demo: true,
      actions: [
        { action: 'Created', timestamp: ago(1, 11, 30), type: 'created' },
        { action: 'Added tag "Compliance"', timestamp: ago(1, 11, 31), type: 'tag' },
        { action: 'Added tag "Analytics"', timestamp: ago(1, 11, 31), type: 'tag' },
      ],
    },
  ];

  state.setNotesData(demoTasks);
  void saveNotesToLocalStorage();
  dispatch({ type: TASK_SET_ALL, payload: [...state.notesData] });
  ['todo', 'inProgress', 'onHold', 'done'].forEach(col => updateColumnVirtualList(col));
  window.dispatchEvent(new Event('kantrack:updateColumnCounts'));
  renderTagFilterButtons();

  // Seed demo notebook
  const ts2 = new Date().toISOString();
  const demoFolderId = crypto.randomUUID();
  const demoNotebook = [
    {
      id: demoFolderId,
      type: 'folder',
      parentId: null,
      name: 'Q4 Finance Ops',
      order: 0,
      createdAt: ts2,
      updatedAt: ts2,
      expanded: true,
      _demo: true,
    },
    {
      id: crypto.randomUUID(),
      type: 'page',
      parentId: demoFolderId,
      name: 'Regulatory Checklist',
      order: 0,
      createdAt: ts2,
      updatedAt: ts2,
      content:
        '<h2>IFRS 17 Readiness</h2><p>Target go-live: end of Q4. Key outstanding items:</p><ul><li>Calculation engine sign-off from actuarial team — pending review</li><li>Schema migration dry-run scheduled for staging environment</li><li>Audit trail must capture every contract modification with user ID and timestamp</li></ul><h2>GDPR — Data Retention</h2><p>Retention audit completed. Action items:</p><ul><li>Customer transaction records: 7-year retention confirmed, archival pipeline in place</li><li>Analytics event logs: reduce to 90-day rolling window — engineering ticket raised</li><li>DPA with new BI vendor requires legal sign-off before data transfer</li></ul>',
      images: [],
      _demo: true,
    },
    {
      id: crypto.randomUUID(),
      type: 'page',
      parentId: demoFolderId,
      name: 'Architecture Decisions',
      order: 1,
      createdAt: ts2,
      updatedAt: ts2,
      content:
        '<h2>Data Warehouse Migration</h2><p>Moving from legacy Oracle GL to Snowflake. Rationale:</p><ul><li>Column-store compression reduces storage cost ~60% on historical data</li><li>Native support for time-travel queries — critical for period-end reconciliation</li><li>Separation of compute and storage allows burst scaling during month-end close</li></ul><h2>Reporting Pipeline</h2><p>Decision: batch over real-time for financial reports.</p><ul><li>Real-time adds complexity without user benefit — finance runs reports at close, not live</li><li>dbt for transformation layer — version-controlled, testable, auditable</li><li>Airflow DAGs for orchestration, 15-min SLA on overnight runs</li></ul><h2>Open Questions</h2><p>Row-level security strategy for multi-entity P&L access not yet finalised. Need input from InfoSec before Q4 freeze.</p>',
      images: [],
      _demo: true,
    },
  ];
  demoNotebook.forEach(item => state.pushToNotebookItems(item));
  saveNotebookToLocalStorage();

  // Insert dismissible banner before the board
  const banner = document.createElement('div');
  banner.id = 'kt-demo-banner';
  banner.className = 'kt-demo-banner';
  banner.innerHTML =
    '<span>Demo board — explore KanTrack freely, then clear when ready.</span>' +
    '<button class="kt-demo-dismiss-btn" id="kt-demo-dismiss">Clear demo data</button>';

  document.querySelector('.kanban-board')?.insertAdjacentElement('beforebegin', banner);

  document.getElementById('kt-demo-dismiss')?.addEventListener('click', () => {
    state.setNotesData(state.notesData.filter(t => !t._demo));
    void saveNotesToLocalStorage();
    dispatch({ type: TASK_SET_ALL, payload: [...state.notesData] });
    ['todo', 'inProgress', 'onHold', 'done'].forEach(col => updateColumnVirtualList(col));
    window.dispatchEvent(new Event('kantrack:updateColumnCounts'));
    state.setNotebookItems(state.notebookItems.filter(i => !i._demo));
    saveNotebookToLocalStorage();
    renderNotebookTree();
    safeSetItem('kt_demo_dismissed', '1');
    banner.remove();
  });
}

/***********************
 * BOOTSTRAP
 ***********************/
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize the router (single delegated click listener)
  initRouter();

  // Apply saved card size before first render
  applyCardSize(safeGetItem('cardSize', 'medium'));

  // Apply saved theme (default: follow OS) before first render
  applyTheme(safeGetItem('themeMode', 'system'));
  initThemeSystemListener();

  // Apply saved card content language (default: system, no override)
  const savedLanguage = safeGetItem('cardLanguage', 'system');
  applyLanguageSettings(savedLanguage);
  setLanguage(savedLanguage);
  applyTranslations(document);
  const cardLanguageSelect = document.getElementById('cardLanguageSelect');
  if (cardLanguageSelect) {
    cardLanguageSelect.value = savedLanguage;
    cardLanguageSelect.addEventListener('change', e => {
      applyLanguageSettings(e.target.value);
      setLanguage(e.target.value);
      safeSetItem('cardLanguage', e.target.value);
      renderClocks();
    });
  }

  // Attach interaction listeners before any awaits so they are ready as soon
  // as the page reports "top-header visible" (used as the test readiness marker).
  // setupDragAndDrop only attaches dragover/drop to static .column elements, so
  // it is safe to call before data is loaded.
  setupDragAndDrop();

  const importFileInput = document.getElementById('importFile');
  if (importFileInput) {
    importFileInput.addEventListener('change', e => importBoardFromFile(e));
  }

  await initIndexedDB();
  await runDataMigrations();

  // Load and render notebook tree early so tree items are in the DOM as soon
  // as possible (reduces timing window in tests that check lang attributes).
  await loadNotebookFromLocalStorage();
  renderNotebookTree();

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

  // Seed demo board on first visit (after initTags + initVirtualLists).
  // Use live state.notesData instead of the stale notes snapshot so that any
  // task added by the user (or test) during the async init window is not wiped.
  if (state.notesData.length === 0 && safeGetItem('kt_demo_dismissed') !== '1') {
    seedDemoBoard();
  }

  await initUndo();
  registerRecordAction(recordAction);
  scheduleCompaction();
  initSearch();

  // One-time backfill for pre-existing Done cards, then evaluate the cap
  // on every load (self-correcting: re-flags the current oldest 15 if the
  // user closed the tab without clicking Delete last time).
  await backfillDoneTimestamps();
  checkDoneCapacity();

  // Load clocks (async)
  await loadClocks();

  // Signal that the board is fully ready: VirtualLists initialized, tasks
  // loaded, demo board seeded, and all async init operations complete.
  // Tests wait for this before interacting with cards to avoid races with
  // the async init window (IDB load, undo/oplog, backfill, clocks).
  document.body.dataset.appReady = 'true';

  // Position logo now that clock state is known, then track continuously
  positionHeaderLogo();

  let _logoRafId = null;
  function scheduleLogoPosition() {
    if (_logoRafId !== null) return;
    _logoRafId = requestAnimationFrame(() => {
      _logoRafId = null;
      positionHeaderLogo();
    });
  }

  // Real-time tracking on viewport resize
  window.addEventListener('resize', scheduleLogoPosition);

  // Track element size changes: catches the support button's 200ms padding transition
  // at the 700px breakpoint, and any size changes in the right anchors
  const _logoRO = new ResizeObserver(scheduleLogoPosition);
  _logoRO.observe(document.querySelector('.support-us-btn'));
  _logoRO.observe(document.getElementById('headerAddClockBtn'));
  _logoRO.observe(document.getElementById('undoBtn'));

  // Track body class changes for clock group visibility toggle
  new MutationObserver(scheduleLogoPosition).observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });

  // Clean up any orphan tags (tags not used by any task)
  cleanupUnusedTags();

  // Sort all columns by priority after loading
  sortAllColumnsByPriority();

  // Apply any active filters (this also updates column counts)
  applyFilters();

  // Storage monitoring - background, fire-and-forget
  requestDurableStorage();
  initStorageMonitor();

  // Render trash count
  renderTrashList();

  // Render hidden-cards count
  updateHiddenCountBadge();

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
      updateHiddenSearchHint(value);
    }, 200);

    searchInput.addEventListener('input', e => {
      debouncedSearch(e.target.value);
    });

    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        setSearchTerm('');
        clearSearchBtn.style.display = 'none';
        updateHiddenSearchHint('');
        searchInput.blur();
      }
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      setSearchTerm('');
      clearSearchBtn.style.display = 'none';
      updateHiddenSearchHint('');
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

  // ESC - close whatever is open, in priority order
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

  // Arrow key card navigation - delegated on the board container
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
  window.addEventListener('kantrack:updateHiddenCount', () => updateHiddenCountBadge());

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
      // Update all columns - we may not know the exact column if task was spliced out
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

    // If the updated task is currently open in the modal, refresh its sub-kanban panel
    if (state.currentTaskId === e.detail.taskId) {
      renderSubKanban(task);
    }

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

  window.addEventListener('kantrack:tagsRestored', e => {
    const affectedIds = e.detail?.affectedTaskIds ?? [];
    if (affectedIds.length === 0) return;
    if (getColumnVirtualList('todo')) {
      const columnsToUpdate = new Set();
      affectedIds.forEach(taskId => {
        const task = state.notesData.find(t => t.id === taskId);
        if (task && !task.deleted) columnsToUpdate.add(task.column);
      });
      columnsToUpdate.forEach(col => updateColumnVirtualList(col));
    } else {
      affectedIds.forEach(taskId => updateNoteCardDisplay(taskId));
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

  // Clock add button (div, not button - needs touchend for iOS)
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

  // Set up notebook event listeners (notebook items already loaded+rendered above)
  setupNotebookEventListeners();

  // Signals that async bootstrap (IDB load, clocks render, event listeners)
  // has fully completed. .top-header is static markup visible before this
  // point, so tests must wait on this marker rather than header visibility
  // when they depend on late-attached listeners (e.g. #importFile) or
  // async-rendered DOM (e.g. .clock-time).
  document.body.setAttribute('data-app-ready', 'true');
});
