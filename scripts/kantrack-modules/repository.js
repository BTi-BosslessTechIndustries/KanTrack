/***********************
 * REPOSITORY — persistence abstraction
 * Single source of truth for all localStorage / IDB business-data access.
 *
 * Rules:
 *  - This file and database.js are the ONLY places that touch localStorage
 *    or IndexedDB for business data.
 *  - This file does NOT import from state.js — it is a pure persistence layer.
 *
 * Exception: storage-monitor.js imports idbPut from database.js directly
 *   for the `meta` store (infrastructure monitoring, not business data).
 *   That is intentional and documented here.
 ***********************/

import {
  idbGet,
  idbGetAll,
  idbClearAndBulkPut,
  idbGetAllOplog,
  idbPutOplog,
  idbDeleteOplog,
  idbDeleteAllUndoneOplog,
} from './database.js';
import { debugWarn } from './utils.js';
import { showError } from './notifications.js';

// Auto-save indicator callback (registered by kantrack.js)
let onAutoSaveCallback = null;

// Debounce timers for IDB writes (300ms — batches rapid sequential saves)
let _saveTasksTimer = null;
let _saveNotebookTimer = null;

export function setAutoSaveCallback(fn) {
  onAutoSaveCallback = fn;
}

// ==================== TASKS ====================

/**
 * Load all tasks. localStorage primary (always sync-written by saveTasks()),
 * IDB fallback (async-written with 300 ms debounce, may lag on fresh load).
 * Migrates old single-note format and cleans up invalid entries.
 */
export async function getAllTasks() {
  let tasks = [];

  try {
    const saved = localStorage.getItem('kanbanNotes');
    if (saved) {
      tasks = JSON.parse(saved);
    } else {
      // localStorage empty — fall back to IDB (handles first load / privacy-cleared LS)
      const idbTasks = await idbGetAll('tasks');
      if (idbTasks && idbTasks.length > 0) {
        tasks = idbTasks;
      }
    }
  } catch (e) {
    debugWarn('Error loading tasks from localStorage, trying IDB:', e);
    try {
      const idbTasks = await idbGetAll('tasks');
      if (idbTasks && idbTasks.length > 0) tasks = idbTasks;
    } catch (idbError) {
      debugWarn('Error loading tasks from IDB:', idbError);
      showError('Failed to load saved tasks. Data may be corrupted.');
      return [];
    }
  }

  // Migrate old format (single notes field → noteEntries array)
  tasks.forEach(task => {
    if (task.notes && !task.noteEntries) {
      task.noteEntries = [
        {
          timestamp: task.actions?.[0]?.timestamp || new Date().toLocaleString(),
          notesHTML: task.notes,
          images: task.images || [],
        },
      ];
      delete task.notes;
    }
    if (!task.noteEntries) task.noteEntries = [];
    if (!task.tags) task.tags = [];
  });

  return _cleanupTasks(tasks);
}

function _cleanupTasks(tasks) {
  const validColumns = ['todo', 'inProgress', 'onHold', 'done'];
  const seenIds = new Set();
  const beforeCount = tasks.length;

  const cleaned = tasks.filter(task => {
    if (!task.id) return false;
    if (seenIds.has(task.id)) return false;
    seenIds.add(task.id);
    if (!task.title || task.title.trim() === '') return false;
    if (!task.column || !validColumns.includes(task.column)) return false;
    if (task.deleted) return false;
    return true;
  });

  if (cleaned.length !== beforeCount) {
    debugWarn(`Cleaned up ${beforeCount - cleaned.length} invalid/duplicate tasks`);
    try {
      localStorage.setItem('kanbanNotes', JSON.stringify(cleaned));
    } catch (_) {
      /* non-critical */
    }
  }

  return cleaned;
}

/**
 * Save tasks to localStorage (sync) and IDB (async, fire-and-forget).
 * Triggers auto-save indicator callback.
 */
export function saveTasks(tasks) {
  try {
    localStorage.setItem('kanbanNotes', JSON.stringify(tasks));

    const snapshot = [...tasks];
    if (_saveTasksTimer !== null) clearTimeout(_saveTasksTimer);
    _saveTasksTimer = setTimeout(() => {
      _saveTasksTimer = null;
      idbClearAndBulkPut('tasks', snapshot).catch(e =>
        debugWarn('IDB task save error (non-fatal):', e)
      );
    }, 300);

    if (onAutoSaveCallback) onAutoSaveCallback();
    return true;
  } catch (e) {
    debugWarn('Error saving tasks:', e);
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      showError('Storage full! Please export and delete some tasks to free up space.');
    } else {
      showError('Failed to save tasks. Please try again.');
    }
    return false;
  }
}

// ==================== NOTEBOOK ITEMS ====================

/**
 * Load all notebook items. IDB primary, localStorage fallback.
 */
export async function getAllNotebookItems() {
  let items = [];

  try {
    const idbItems = await idbGetAll('notebook_items');
    if (idbItems && idbItems.length > 0) {
      items = idbItems;
    } else {
      const saved = localStorage.getItem('notebookItems');
      if (saved) items = JSON.parse(saved);
    }
  } catch (e) {
    debugWarn('Error loading notebook from IDB, trying localStorage:', e);
    try {
      const saved = localStorage.getItem('notebookItems');
      if (saved) items = JSON.parse(saved);
    } catch (lsError) {
      debugWarn('Error loading notebook from localStorage:', lsError);
      showError('Failed to load notebook. Data may be corrupted.');
      return [];
    }
  }

  return items;
}

/**
 * Save notebook items to localStorage (sync) and IDB (async, fire-and-forget).
 */
export function saveNotebookItems(items) {
  try {
    localStorage.setItem('notebookItems', JSON.stringify(items));

    const snapshot = [...items];
    if (_saveNotebookTimer !== null) clearTimeout(_saveNotebookTimer);
    _saveNotebookTimer = setTimeout(() => {
      _saveNotebookTimer = null;
      idbClearAndBulkPut('notebook_items', snapshot).catch(e =>
        debugWarn('IDB notebook save error (non-fatal):', e)
      );
    }, 300);

    return true;
  } catch (e) {
    debugWarn('Error saving notebook:', e);
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      showError('Storage full! Please export and delete some pages to free up space.');
    } else {
      showError('Failed to save notebook. Please try again.');
    }
    return false;
  }
}

/**
 * Fetch the HTML content of a single notebook page from IDB.
 * Falls back to localStorage if IDB has no entry for this id.
 * Used by openPageModal() for lazy content loading.
 */
export async function getNotebookItemContent(id) {
  try {
    const item = await idbGet('notebook_items', id);
    if (item?.content != null) return item.content;
  } catch (_) {
    /* fall through to localStorage */
  }

  try {
    const saved = localStorage.getItem('notebookItems');
    if (saved) {
      const items = JSON.parse(saved);
      const found = items.find(i => i.id === id);
      return found?.content ?? '';
    }
  } catch (_) {
    /* non-critical */
  }

  return '';
}

// ==================== TAGS ====================

/**
 * Load all tag definitions. IDB primary, localStorage fallback.
 */
export async function getAllTags() {
  try {
    const idbTags = await idbGetAll('tags');
    if (idbTags && idbTags.length > 0) return idbTags;

    const saved = localStorage.getItem('kantrackTags');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    debugWarn('Error loading tags from IDB:', e);
    try {
      const saved = localStorage.getItem('kantrackTags');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  }
}

/**
 * Save tag definitions to localStorage (sync) and IDB (async, fire-and-forget).
 */
export function saveTags(tags) {
  try {
    localStorage.setItem('kantrackTags', JSON.stringify(tags));

    const snapshot = [...tags];
    idbClearAndBulkPut('tags', snapshot).catch(e =>
      debugWarn('IDB tags save error (non-fatal):', e)
    );
  } catch (e) {
    debugWarn('Error saving tags:', e);
  }
}

// ==================== CLOCKS ====================

/**
 * Load all clocks. IDB primary (sorted by order), localStorage fallback.
 * Returns null if no clocks found — caller should initialise defaults.
 */
export async function getAllClocks() {
  try {
    const idbClocks = await idbGetAll('clocks');
    if (idbClocks && idbClocks.length > 0) {
      idbClocks.sort((a, b) => (a.order || 0) - (b.order || 0));
      return idbClocks;
    }

    const saved = localStorage.getItem('kanbanClocks');
    if (saved) return JSON.parse(saved);

    return null; // caller should initialise defaults
  } catch (e) {
    debugWarn('Error loading clocks from IDB:', e);
    const saved = localStorage.getItem('kanbanClocks');
    return saved ? JSON.parse(saved) : null;
  }
}

/**
 * Save clocks. Adds `order` field for IDB; saves without order to localStorage.
 */
export function saveClocks(clocks) {
  try {
    localStorage.setItem('kanbanClocks', JSON.stringify(clocks));

    const clocksWithOrder = clocks.map((c, i) => ({ ...c, order: i }));
    idbClearAndBulkPut('clocks', clocksWithOrder).catch(e =>
      debugWarn('IDB clocks save error (non-fatal):', e)
    );
  } catch (e) {
    debugWarn('Error saving clocks:', e);
  }
}

// ==================== TRASH ====================

/**
 * Load all trashed tasks. IDB primary (sorted newest-first), localStorage fallback.
 */
export async function getAllTrash() {
  try {
    const idbTrash = await idbGetAll('trash');
    if (idbTrash && idbTrash.length > 0) {
      return idbTrash.sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
    }

    const saved = localStorage.getItem('kantrackTrash');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    debugWarn('Error loading trash from IDB:', e);
    try {
      const saved = localStorage.getItem('kantrackTrash');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  }
}

/**
 * Save trash items to localStorage (sync) and IDB (async, fire-and-forget).
 */
export function saveTrash(items) {
  try {
    localStorage.setItem('kantrackTrash', JSON.stringify(items));

    const snapshot = [...items];
    idbClearAndBulkPut('trash', snapshot).catch(e =>
      debugWarn('IDB trash save error (non-fatal):', e)
    );
  } catch (e) {
    debugWarn('Error saving trash:', e);
  }
}

// ==================== UNDO HISTORY ====================

/**
 * Load all undo history entries from IDB.
 */
export async function getAllUndoHistory() {
  try {
    return await idbGetAll('undo_history');
  } catch (e) {
    debugWarn('Error loading undo history (non-fatal):', e);
    return [];
  }
}

/**
 * Save undo history entries to IDB (async, fire-and-forget).
 */
export function saveUndoHistory(entries) {
  idbClearAndBulkPut('undo_history', entries).catch(e =>
    debugWarn('IDB undo history save error (non-fatal):', e)
  );
}

// ==================== OPLOG (Phase 3) ====================

/**
 * Load all oplog entries sorted by Lamport clock ascending.
 */
export async function getAllOplogEntries() {
  try {
    const entries = await idbGetAllOplog();
    return entries.sort((a, b) => a.lamport - b.lamport);
  } catch (e) {
    debugWarn('Error loading oplog entries (non-fatal):', e);
    return [];
  }
}

/**
 * Append a new oplog entry.
 */
export async function appendOplogEntry(entry) {
  try {
    await idbPutOplog(entry);
  } catch (e) {
    debugWarn('Error appending oplog entry (non-fatal):', e);
  }
}

/**
 * Update an existing oplog entry by merging changes into it.
 */
export async function updateOplogEntry(opId, changes) {
  try {
    const entries = await idbGetAllOplog();
    const existing = entries.find(e => e.opId === opId);
    if (!existing) return;
    await idbPutOplog({ ...existing, ...changes });
  } catch (e) {
    debugWarn('Error updating oplog entry (non-fatal):', e);
  }
}

/**
 * Delete all oplog entries where undone === true (clears redo history).
 */
export async function clearUndoneOplogEntries() {
  try {
    await idbDeleteAllUndoneOplog();
  } catch (e) {
    debugWarn('Error clearing undone oplog entries (non-fatal):', e);
  }
}

/**
 * Delete oplog entries that are older than cutoffMs AND undone.
 * Used by compaction.js.
 */
export async function deleteOplogEntriesOlderThan(cutoffMs) {
  try {
    const entries = await idbGetAllOplog();
    const toDelete = entries.filter(e => e.undone && e.timestamp < cutoffMs);
    for (const entry of toDelete) {
      await idbDeleteOplog(entry.opId);
    }
  } catch (e) {
    debugWarn('Error deleting old oplog entries (non-fatal):', e);
  }
}

// ==================== PERMANENT NOTES ====================

/**
 * Load permanent notes textarea from localStorage.
 * DOM-coupled — only call from browser context.
 */
export function loadPermanentNotes() {
  try {
    const savedNotes = localStorage.getItem('permanentNotes');
    const el = document.getElementById('permanentNotes');
    if (el && savedNotes) el.value = savedNotes;
  } catch (e) {
    debugWarn('Error loading permanent notes:', e);
  }
}

/**
 * Save permanent notes textarea to localStorage.
 * DOM-coupled — only call from browser context.
 */
export function savePermanentNotes() {
  try {
    const el = document.getElementById('permanentNotes');
    if (el) localStorage.setItem('permanentNotes', el.value);
    return true;
  } catch (e) {
    debugWarn('Error saving permanent notes:', e);
    return false;
  }
}

// ==================== UI PREFERENCES ====================

/**
 * Get a UI preference from localStorage.
 */
export function getUIPref(key, defaultValue = null) {
  return safeGetItem(key, defaultValue);
}

/**
 * Set a UI preference in localStorage.
 */
export function setUIPref(key, value) {
  safeSetItem(key, value);
}

// ==================== SAFE STORAGE HELPERS ====================

/**
 * Safely get and JSON-parse an item from localStorage.
 */
export function safeGetItem(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item !== null ? JSON.parse(item) : defaultValue;
  } catch (e) {
    debugWarn(`Error reading ${key} from localStorage:`, e);
    return defaultValue;
  }
}

/**
 * Safely JSON-stringify and set an item in localStorage.
 */
export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    debugWarn(`Error writing ${key} to localStorage:`, e);
    return false;
  }
}
