/***********************
 * STORAGE — thin compatibility shim
 * All persistence logic lives in repository.js.
 * This shim adds state.js interaction for backwards compatibility.
 ***********************/
import { notesData, setNotesData, notebookItems, setNotebookItems } from './state.js';
import {
  getAllTasks,
  saveTasks as _saveTasks,
  getAllNotebookItems,
  saveNotebookItems as _saveNotebookItems,
  setAutoSaveCallback,
  flushPendingIDBWrites,
  loadPermanentNotes,
  savePermanentNotes,
  safeGetItem,
  safeSetItem,
} from './repository.js';

// Re-export helpers that have no state interaction
export {
  setAutoSaveCallback,
  flushPendingIDBWrites,
  loadPermanentNotes,
  savePermanentNotes,
  safeGetItem,
  safeSetItem,
};

// ---------------------------------------------------------------------------
// Tasks — wrap with state interaction
// ---------------------------------------------------------------------------

export async function loadNotesFromLocalStorage() {
  const tasks = await getAllTasks();
  setNotesData(tasks);
  return notesData;
}

export function saveNotesToLocalStorage() {
  // repository.js's saveTasks already triggers onAutoSaveCallback
  return _saveTasks([...notesData]);
}

// ---------------------------------------------------------------------------
// Notebook items — wrap with state interaction
// ---------------------------------------------------------------------------

export async function loadNotebookFromLocalStorage() {
  const items = await getAllNotebookItems();
  // Strip page content from in-memory items — loaded lazily in openPageModal()
  setNotebookItems(items.map(({ content: _c, ...meta }) => meta));
  return notebookItems;
}

export function saveNotebookToLocalStorage() {
  return _saveNotebookItems([...notebookItems]);
}
