/***********************
 * INDEXEDDB SETUP
 * With improved error handling
 ***********************/
import { db, setDb, notesData, notebookItems } from './state.js';
import { showError, showWarning } from './notifications.js';
import { debugWarn } from './utils.js';

const DB_VERSION = 3;

// Data schema version — separate from IDB's structural DB_VERSION.
// Increment this when the shape of stored records changes.
// Each integer bump maps to a migrate_vN_to_vN1() function below.
const DATA_SCHEMA_VERSION = 1;

export function initIndexedDB() {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open('KanbanDB', DB_VERSION);

      request.onerror = () => {
        debugWarn('IndexedDB error:', request.error);
        showError('Failed to open image database. Images may not persist.');
        reject(request.error);
      };

      request.onsuccess = () => {
        setDb(request.result);
        resolve(request.result);
      };

      request.onupgradeneeded = event => {
        const database = event.target.result;

        // v1 store (keep existing)
        if (!database.objectStoreNames.contains('images')) {
          database.createObjectStore('images', { keyPath: 'id' });
        }

        // v2 stores (new in Phase 0)
        if (!database.objectStoreNames.contains('tasks')) {
          database.createObjectStore('tasks', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('notebook_items')) {
          database.createObjectStore('notebook_items', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('tags')) {
          database.createObjectStore('tags', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('clocks')) {
          database.createObjectStore('clocks', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('trash')) {
          database.createObjectStore('trash', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('undo_history')) {
          database.createObjectStore('undo_history', { keyPath: 'seq', autoIncrement: true });
        }
        if (!database.objectStoreNames.contains('meta')) {
          database.createObjectStore('meta', { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains('prefs')) {
          database.createObjectStore('prefs', { keyPath: 'key' });
        }

        // v3 stores (Phase 3 — Operation Log)
        if (!database.objectStoreNames.contains('oplog')) {
          database.createObjectStore('oplog', { keyPath: 'opId' });
        }
      };
    } catch (e) {
      debugWarn('IndexedDB initialization error:', e);
      showError('Image storage is not available in this browser.');
      reject(e);
    }
  });
}

// ==================== IDB HELPERS ====================

/**
 * Get a single value by key from an IDB store
 */
export function idbGet(storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all values from an IDB store
 */
export function idbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Put a single value into an IDB store
 */
export function idbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a value by key from an IDB store
 */
export function idbDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all values from an IDB store
 */
export function idbClear(storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Bulk put values into an IDB store in a single transaction
 */
export function idbBulkPut(storeName, values) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);

    for (const value of values) {
      store.put(value);
    }
  });
}

/**
 * Clear and bulk put values into an IDB store in a single atomic transaction.
 * Safer than calling idbClear + idbBulkPut separately.
 */
export function idbClearAndBulkPut(storeName, values) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);

    const clearRequest = store.clear();
    clearRequest.onsuccess = () => {
      for (const value of values) {
        store.put(value);
      }
    };
  });
}

// ==================== MIGRATION ====================

/**
 * Migrate data from localStorage to IndexedDB.
 * Idempotent — safe to call multiple times.
 * Does NOT delete localStorage keys (kept as read-only backup).
 */
export async function migrateLocalStorageToIDB() {
  try {
    // Check if migration already done
    const migrationDone = await idbGet('meta', 'migrationDone');
    if (migrationDone?.value === true) {
      return;
    }

    // Migrate tasks
    const tasksInIDB = await idbGetAll('tasks');
    if (tasksInIDB.length === 0) {
      const saved = localStorage.getItem('kanbanNotes');
      if (saved) {
        const tasks = JSON.parse(saved);
        if (Array.isArray(tasks) && tasks.length > 0) {
          await idbBulkPut('tasks', tasks);
        }
      }
    }

    // Migrate clocks (add order field to preserve array order)
    const clocksInIDB = await idbGetAll('clocks');
    if (clocksInIDB.length === 0) {
      const saved = localStorage.getItem('kanbanClocks');
      if (saved) {
        const clocks = JSON.parse(saved);
        if (Array.isArray(clocks) && clocks.length > 0) {
          const clocksWithOrder = clocks.map((c, i) => ({ ...c, order: i }));
          await idbBulkPut('clocks', clocksWithOrder);
        }
      }
    }

    // Migrate tags
    const tagsInIDB = await idbGetAll('tags');
    if (tagsInIDB.length === 0) {
      const saved = localStorage.getItem('kantrackTags');
      if (saved) {
        const tags = JSON.parse(saved);
        if (Array.isArray(tags) && tags.length > 0) {
          await idbBulkPut('tags', tags);
        }
      }
    }

    // Migrate trash
    const trashInIDB = await idbGetAll('trash');
    if (trashInIDB.length === 0) {
      const saved = localStorage.getItem('kantrackTrash');
      if (saved) {
        const trash = JSON.parse(saved);
        if (Array.isArray(trash) && trash.length > 0) {
          await idbBulkPut('trash', trash);
        }
      }
    }

    // Migrate notebook items
    const notebookInIDB = await idbGetAll('notebook_items');
    if (notebookInIDB.length === 0) {
      const saved = localStorage.getItem('notebookItems');
      if (saved) {
        const items = JSON.parse(saved);
        if (Array.isArray(items) && items.length > 0) {
          await idbBulkPut('notebook_items', items);
        }
      }
    }

    // Mark migration as done
    await idbPut('meta', { key: 'migrationDone', value: true, migratedAt: Date.now() });

    debugWarn('LocalStorage → IDB migration complete');
  } catch (e) {
    debugWarn('Migration error (non-fatal, localStorage fallback active):', e);
    // Don't throw — app can still function from localStorage fallback
  }
}

// ==================== DATA SCHEMA MIGRATION RUNNER ====================

/**
 * Sequential data migration runner.
 *
 * Reads the current data schema version from the meta store and runs every
 * pending migration function in order until we reach DATA_SCHEMA_VERSION.
 * Each migration is idempotent and only runs once.
 *
 * To add a future migration:
 *   1. Increment DATA_SCHEMA_VERSION at the top of this file.
 *   2. Add a `migrate_vN_to_vN1(db)` function below.
 *   3. Add a `case N:` branch in the switch inside runDataMigrations().
 */
export async function runDataMigrations() {
  try {
    const versionRecord = await idbGet('meta', 'schemaVersion');
    let currentVersion = versionRecord?.value ?? 0;

    if (currentVersion >= DATA_SCHEMA_VERSION) return;

    while (currentVersion < DATA_SCHEMA_VERSION) {
      switch (currentVersion) {
        case 0:
          await migrate_v0_to_v1();
          break;
        default:
          debugWarn(`No migration defined from data schema v${currentVersion}`);
          currentVersion = DATA_SCHEMA_VERSION; // safety: stop loop
          continue;
      }
      currentVersion++;
    }

    await idbPut('meta', {
      key: 'schemaVersion',
      value: DATA_SCHEMA_VERSION,
      migratedAt: Date.now(),
    });
    debugWarn(`Data schema migrated to v${DATA_SCHEMA_VERSION}`);
  } catch (e) {
    debugWarn('Data migration runner error (non-fatal):', e);
  }
}

/**
 * v0 → v1: Copy business data from localStorage into IDB stores.
 * Delegates to migrateLocalStorageToIDB() which handles its own idempotency
 * via the migrationDone flag, so this is safe to call multiple times.
 */
async function migrate_v0_to_v1() {
  await migrateLocalStorageToIDB();
}

// ==================== IMAGE STORAGE ====================

// Store image in IndexedDB
export async function storeImage(taskId, imageId, dataUrl) {
  try {
    if (!db) await initIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['images'], 'readwrite');
      const store = transaction.objectStore('images');
      const request = store.put({ id: `${taskId}_${imageId}`, dataUrl });
      request.onsuccess = () => resolve();
      request.onerror = () => {
        debugWarn('Error storing image:', request.error);
        reject(request.error);
      };
    });
  } catch (e) {
    debugWarn('Error storing image:', e);
    throw e;
  }
}

// Get image from IndexedDB
export async function getImage(taskId, imageId) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['images'], 'readonly');
    const store = transaction.objectStore('images');
    const request = store.get(`${taskId}_${imageId}`);
    request.onsuccess = () => resolve(request.result?.dataUrl || null);
    request.onerror = () => reject(request.error);
  });
}

// Delete all images for a task
export async function deleteTaskImages(taskId) {
  if (!db) await initIndexedDB();
  const task = notesData.find(t => t.id === taskId);
  if (!task || !task.noteEntries) return;

  const transaction = db.transaction(['images'], 'readwrite');
  const store = transaction.objectStore('images');

  task.noteEntries.forEach(entry => {
    if (entry.images) {
      entry.images.forEach(imageId => {
        store.delete(`${taskId}_${imageId}`);
      });
    }
  });
}

// Store notebook image in IndexedDB
export async function storeNotebookImage(pageId, imageId, dataUrl) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['images'], 'readwrite');
    const store = transaction.objectStore('images');
    const request = store.put({ id: `notebook_${pageId}_${imageId}`, dataUrl });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Get notebook image from IndexedDB
export async function getNotebookImage(pageId, imageId) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['images'], 'readonly');
    const store = transaction.objectStore('images');
    const request = store.get(`notebook_${pageId}_${imageId}`);
    request.onsuccess = () => resolve(request.result?.dataUrl || null);
    request.onerror = () => reject(request.error);
  });
}

// Delete all images for a page
export async function deletePageImages(pageId) {
  if (!db) await initIndexedDB();
  const page = notebookItems.find(p => p.id === pageId);
  if (!page || !page.images) return;

  const transaction = db.transaction(['images'], 'readwrite');
  const store = transaction.objectStore('images');

  for (const imageId of page.images) {
    store.delete(`notebook_${pageId}_${imageId}`);
  }
}

// Delete images by task ID and image IDs (for note entry deletion)
export async function deleteImagesByIds(taskId, imageIds) {
  if (!db) await initIndexedDB();
  const transaction = db.transaction(['images'], 'readwrite');
  const store = transaction.objectStore('images');
  for (const imageId of imageIds) {
    store.delete(`${taskId}_${imageId}`);
  }
}

// ==================== META HELPERS ====================

/**
 * Read a value from the meta store by key. Returns null if not found.
 */
export async function getMetaValue(key) {
  try {
    const record = await idbGet('meta', key);
    return record?.value ?? null;
  } catch (e) {
    debugWarn(`getMetaValue(${key}) failed (non-fatal):`, e);
    return null;
  }
}

/**
 * Write a value to the meta store (fire-and-forget async).
 */
export function setMetaValue(key, value) {
  idbPut('meta', { key, value }).catch(e =>
    debugWarn(`setMetaValue(${key}) failed (non-fatal):`, e)
  );
}

/**
 * Get the deviceId from meta, creating it if it doesn't exist yet.
 */
export async function getOrCreateDeviceId() {
  const existing = await getMetaValue('deviceId');
  if (existing) return existing;
  const newId = crypto.randomUUID();
  await idbPut('meta', { key: 'deviceId', value: newId });
  return newId;
}

/**
 * Read the current Lamport clock from meta. Returns 0 if not set.
 */
export async function getMetaLamport() {
  const value = await getMetaValue('lamportClock');
  return typeof value === 'number' ? value : 0;
}

// ==================== OPLOG IDB HELPERS ====================

/**
 * Get all oplog entries.
 */
export function idbGetAllOplog() {
  return idbGetAll('oplog');
}

/**
 * Write a single oplog entry.
 */
export function idbPutOplog(entry) {
  return idbPut('oplog', entry);
}

/**
 * Delete a single oplog entry by opId.
 */
export function idbDeleteOplog(opId) {
  return idbDelete('oplog', opId);
}

/**
 * Delete all oplog entries where undone === true in a single transaction.
 */
export function idbDeleteAllUndoneOplog() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['oplog'], 'readwrite');
    const store = transaction.objectStore('oplog');

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);

    const request = store.getAll();
    request.onsuccess = () => {
      const undoneEntries = request.result.filter(e => e.undone === true);
      for (const entry of undoneEntries) {
        store.delete(entry.opId);
      }
    };
    request.onerror = () => reject(request.error);
  });
}
