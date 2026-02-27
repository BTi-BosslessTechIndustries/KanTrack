/***********************
 * INDEXEDDB SETUP
 * With improved error handling
 ***********************/
import { db, setDb, notesData, notebookItems } from './state.js';
import { showError, showWarning } from './notifications.js';
import { debugWarn } from './utils.js';

export function initIndexedDB() {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open('KanbanDB', 1);

      request.onerror = () => {
        debugWarn('IndexedDB error:', request.error);
        showError('Failed to open image database. Images may not persist.');
        reject(request.error);
      };

      request.onsuccess = () => {
        setDb(request.result);
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains('images')) {
          database.createObjectStore('images', { keyPath: 'id' });
        }
      };
    } catch (e) {
      debugWarn('IndexedDB initialization error:', e);
      showError('Image storage is not available in this browser.');
      reject(e);
    }
  });
}

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
