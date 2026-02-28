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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — database.js is not yet typed
import { idbGetAll, idbClearAndBulkPut } from './database.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — utils.js is not yet typed
import { debugWarn } from './utils.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — notifications.js is not yet typed
import { showError } from './notifications.js';

import type { Task, Tag, NotebookItem, Clock, UndoEntry } from './types.js';

// Auto-save indicator callback (registered by kantrack.js)
let onAutoSaveCallback: (() => void) | null = null;

export function setAutoSaveCallback(fn: () => void): void {
  onAutoSaveCallback = fn;
}

// ==================== TASKS ====================

/**
 * Load all tasks. IDB primary, localStorage fallback.
 * Migrates old single-note format and cleans up invalid entries.
 */
export async function getAllTasks(): Promise<Task[]> {
  let tasks: Task[] = [];

  try {
    const idbTasks = (await idbGetAll('tasks')) as Task[];
    if (idbTasks && idbTasks.length > 0) {
      tasks = idbTasks;
    } else {
      const saved = localStorage.getItem('kanbanNotes');
      if (saved) {
        tasks = JSON.parse(saved) as Task[];
      }
    }
  } catch (e) {
    debugWarn('Error loading tasks from IDB, trying localStorage:', e);
    try {
      const saved = localStorage.getItem('kanbanNotes');
      if (saved) tasks = JSON.parse(saved) as Task[];
    } catch (lsError) {
      debugWarn('Error loading tasks from localStorage:', lsError);
      showError('Failed to load saved tasks. Data may be corrupted.');
      return [];
    }
  }

  // Migrate old format (single notes field → noteEntries array)
  tasks.forEach(task => {
    const legacy = task as Task & { notes?: string; images?: string[] };
    if (legacy.notes && !task.noteEntries) {
      task.noteEntries = [
        {
          timestamp: task.actions?.[0]?.timestamp || new Date().toLocaleString(),
          notesHTML: legacy.notes,
          images: legacy.images || [],
        },
      ];
      delete legacy.notes;
    }
    if (!task.noteEntries) task.noteEntries = [];
    if (!task.tags) task.tags = [];
  });

  return _cleanupTasks(tasks);
}

function _cleanupTasks(tasks: Task[]): Task[] {
  const validColumns = ['todo', 'inProgress', 'onHold', 'done'];
  const seenIds = new Set<string>();
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
export function saveTasks(tasks: Task[]): boolean {
  try {
    localStorage.setItem('kanbanNotes', JSON.stringify(tasks));

    const snapshot = [...tasks];
    (idbClearAndBulkPut('tasks', snapshot) as Promise<void>).catch((e: unknown) =>
      debugWarn('IDB task save error (non-fatal):', e)
    );

    if (onAutoSaveCallback) onAutoSaveCallback();
    return true;
  } catch (e) {
    debugWarn('Error saving tasks:', e);
    const err = e as { name?: string; code?: number };
    if (err.name === 'QuotaExceededError' || err.code === 22) {
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
export async function getAllNotebookItems(): Promise<NotebookItem[]> {
  let items: NotebookItem[] = [];

  try {
    const idbItems = (await idbGetAll('notebook_items')) as NotebookItem[];
    if (idbItems && idbItems.length > 0) {
      items = idbItems;
    } else {
      const saved = localStorage.getItem('notebookItems');
      if (saved) items = JSON.parse(saved) as NotebookItem[];
    }
  } catch (e) {
    debugWarn('Error loading notebook from IDB, trying localStorage:', e);
    try {
      const saved = localStorage.getItem('notebookItems');
      if (saved) items = JSON.parse(saved) as NotebookItem[];
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
export function saveNotebookItems(items: NotebookItem[]): boolean {
  try {
    localStorage.setItem('notebookItems', JSON.stringify(items));

    const snapshot = [...items];
    (idbClearAndBulkPut('notebook_items', snapshot) as Promise<void>).catch((e: unknown) =>
      debugWarn('IDB notebook save error (non-fatal):', e)
    );

    return true;
  } catch (e) {
    debugWarn('Error saving notebook:', e);
    const err = e as { name?: string; code?: number };
    if (err.name === 'QuotaExceededError' || err.code === 22) {
      showError('Storage full! Please export and delete some pages to free up space.');
    } else {
      showError('Failed to save notebook. Please try again.');
    }
    return false;
  }
}

// ==================== TAGS ====================

/**
 * Load all tag definitions. IDB primary, localStorage fallback.
 */
export async function getAllTags(): Promise<Tag[]> {
  try {
    const idbTags = (await idbGetAll('tags')) as Tag[];
    if (idbTags && idbTags.length > 0) return idbTags;

    const saved = localStorage.getItem('kantrackTags');
    return saved ? (JSON.parse(saved) as Tag[]) : [];
  } catch (e) {
    debugWarn('Error loading tags from IDB:', e);
    try {
      const saved = localStorage.getItem('kantrackTags');
      return saved ? (JSON.parse(saved) as Tag[]) : [];
    } catch (_) {
      return [];
    }
  }
}

/**
 * Save tag definitions to localStorage (sync) and IDB (async, fire-and-forget).
 */
export function saveTags(tags: Tag[]): void {
  try {
    localStorage.setItem('kantrackTags', JSON.stringify(tags));

    const snapshot = [...tags];
    (idbClearAndBulkPut('tags', snapshot) as Promise<void>).catch((e: unknown) =>
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
export async function getAllClocks(): Promise<Clock[] | null> {
  try {
    const idbClocks = (await idbGetAll('clocks')) as Clock[];
    if (idbClocks && idbClocks.length > 0) {
      idbClocks.sort((a, b) => (a.order || 0) - (b.order || 0));
      return idbClocks;
    }

    const saved = localStorage.getItem('kanbanClocks');
    if (saved) return JSON.parse(saved) as Clock[];

    return null; // caller should initialise defaults
  } catch (e) {
    debugWarn('Error loading clocks from IDB:', e);
    const saved = localStorage.getItem('kanbanClocks');
    return saved ? (JSON.parse(saved) as Clock[]) : null;
  }
}

/**
 * Save clocks. Adds `order` field for IDB; saves without order to localStorage.
 */
export function saveClocks(clocks: Clock[]): void {
  try {
    localStorage.setItem('kanbanClocks', JSON.stringify(clocks));

    const clocksWithOrder = clocks.map((c, i) => ({ ...c, order: i }));
    (idbClearAndBulkPut('clocks', clocksWithOrder) as Promise<void>).catch((e: unknown) =>
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
export async function getAllTrash(): Promise<Task[]> {
  try {
    const idbTrash = (await idbGetAll('trash')) as Task[];
    if (idbTrash && idbTrash.length > 0) {
      return idbTrash.sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
    }

    const saved = localStorage.getItem('kantrackTrash');
    return saved ? (JSON.parse(saved) as Task[]) : [];
  } catch (e) {
    debugWarn('Error loading trash from IDB:', e);
    try {
      const saved = localStorage.getItem('kantrackTrash');
      return saved ? (JSON.parse(saved) as Task[]) : [];
    } catch (_) {
      return [];
    }
  }
}

/**
 * Save trash items to localStorage (sync) and IDB (async, fire-and-forget).
 */
export function saveTrash(items: Task[]): void {
  try {
    localStorage.setItem('kantrackTrash', JSON.stringify(items));

    const snapshot = [...items];
    (idbClearAndBulkPut('trash', snapshot) as Promise<void>).catch((e: unknown) =>
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
export async function getAllUndoHistory(): Promise<UndoEntry[]> {
  try {
    return (await idbGetAll('undo_history')) as UndoEntry[];
  } catch (e) {
    debugWarn('Error loading undo history (non-fatal):', e);
    return [];
  }
}

/**
 * Save undo history entries to IDB (async, fire-and-forget).
 */
export function saveUndoHistory(entries: UndoEntry[]): void {
  (idbClearAndBulkPut('undo_history', entries) as Promise<void>).catch((e: unknown) =>
    debugWarn('IDB undo history save error (non-fatal):', e)
  );
}

// ==================== PERMANENT NOTES ====================

/**
 * Load permanent notes textarea from localStorage.
 * DOM-coupled — only call from browser context.
 */
export function loadPermanentNotes(): void {
  try {
    const savedNotes = localStorage.getItem('permanentNotes');
    const el = document.getElementById('permanentNotes') as HTMLTextAreaElement | null;
    if (el && savedNotes) el.value = savedNotes;
  } catch (e) {
    debugWarn('Error loading permanent notes:', e);
  }
}

/**
 * Save permanent notes textarea to localStorage.
 * DOM-coupled — only call from browser context.
 */
export function savePermanentNotes(): boolean {
  try {
    const el = document.getElementById('permanentNotes') as HTMLTextAreaElement | null;
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
export function getUIPref<T>(key: string, defaultValue: T = null as unknown as T): T {
  return safeGetItem<T>(key, defaultValue);
}

/**
 * Set a UI preference in localStorage.
 */
export function setUIPref(key: string, value: unknown): void {
  safeSetItem(key, value);
}

// ==================== SAFE STORAGE HELPERS ====================

/**
 * Safely get and JSON-parse an item from localStorage.
 */
export function safeGetItem<T>(key: string, defaultValue: T = null as unknown as T): T {
  try {
    const item = localStorage.getItem(key);
    return item !== null ? (JSON.parse(item) as T) : defaultValue;
  } catch (e) {
    debugWarn(`Error reading ${key} from localStorage:`, e);
    return defaultValue;
  }
}

/**
 * Safely JSON-stringify and set an item in localStorage.
 */
export function safeSetItem(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    debugWarn(`Error writing ${key} to localStorage:`, e);
    return false;
  }
}
