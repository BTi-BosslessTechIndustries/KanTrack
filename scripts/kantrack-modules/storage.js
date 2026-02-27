/***********************
 * STORAGE FUNCTIONS
 * With error handling and storage quota management
 ***********************/
import { notesData, setNotesData, notebookItems, setNotebookItems } from './state.js';
import { showError, showWarning, checkStorageQuota } from './notifications.js';
import { debugWarn } from './utils.js';

// Auto-save callback (set by kantrack.js)
let onAutoSaveCallback = null;

export function setAutoSaveCallback(callback) {
  onAutoSaveCallback = callback;
}

export function loadNotesFromLocalStorage() {
  try {
    const savedNotes = localStorage.getItem('kanbanNotes');
    if (savedNotes) {
      let parsedNotes = JSON.parse(savedNotes);

      // Migrate old format (single notes field) to new format (noteEntries array)
      parsedNotes.forEach(note => {
        if (note.notes && !note.noteEntries) {
          note.noteEntries = [{
            timestamp: note.actions?.[0]?.timestamp || new Date().toLocaleString(),
            notesHTML: note.notes,
            images: note.images || []
          }];
          delete note.notes;
        }
        if (!note.noteEntries) {
          note.noteEntries = [];
        }
        // Ensure tags array exists
        if (!note.tags) {
          note.tags = [];
        }
      });

      // Cleanup: Remove duplicates, invalid entries, and orphaned tasks
      parsedNotes = cleanupNotesData(parsedNotes);

      setNotesData(parsedNotes);
    }
  } catch (e) {
    debugWarn('Error loading notes from localStorage:', e);
    showError('Failed to load saved tasks. Data may be corrupted.');
    setNotesData([]);
  }
  return notesData;
}

/**
 * Clean up notes data by removing duplicates and invalid entries
 */
function cleanupNotesData(notes) {
  const validColumns = ['todo', 'inProgress', 'onHold', 'done'];
  const seenIds = new Set();
  const beforeCount = notes.length;

  const cleanedNotes = notes.filter(note => {
    // Skip if no ID
    if (!note.id) return false;

    // Skip if already seen (duplicate)
    if (seenIds.has(note.id)) return false;
    seenIds.add(note.id);

    // Skip if no title
    if (!note.title || note.title.trim() === '') return false;

    // Skip if invalid column
    if (!note.column || !validColumns.includes(note.column)) return false;

    // Skip if marked as deleted
    if (note.deleted) return false;

    return true;
  });

  // Save if any entries were removed
  if (cleanedNotes.length !== beforeCount) {
    debugWarn(`Cleaned up ${beforeCount - cleanedNotes.length} invalid/duplicate tasks`);
    localStorage.setItem('kanbanNotes', JSON.stringify(cleanedNotes));
  }

  return cleanedNotes;
}

export function saveNotesToLocalStorage() {
  try {
    const dataString = JSON.stringify(notesData);
    localStorage.setItem('kanbanNotes', dataString);

    // Check storage quota after save
    const quota = checkStorageQuota();
    if (quota.percentage >= 90) {
      showWarning(`Storage almost full (${quota.percentage}%). Consider exporting old tasks.`);
    }

    // Trigger auto-save callback if set
    if (onAutoSaveCallback) {
      onAutoSaveCallback();
    }

    return true;
  } catch (e) {
    debugWarn('Error saving notes to localStorage:', e);

    // Check if it's a quota exceeded error
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      showError('Storage full! Please export and delete some tasks to free up space.');
    } else {
      showError('Failed to save tasks. Please try again.');
    }
    return false;
  }
}

export function loadNotebookFromLocalStorage() {
  try {
    const saved = localStorage.getItem('notebookItems');
    if (saved) {
      setNotebookItems(JSON.parse(saved));
    } else {
      setNotebookItems([]);
    }
  } catch (e) {
    debugWarn('Error loading notebook from localStorage:', e);
    showError('Failed to load notebook. Data may be corrupted.');
    setNotebookItems([]);
  }
  return notebookItems;
}

export function saveNotebookToLocalStorage() {
  try {
    localStorage.setItem('notebookItems', JSON.stringify(notebookItems));
    return true;
  } catch (e) {
    debugWarn('Error saving notebook to localStorage:', e);

    if (e.name === 'QuotaExceededError' || e.code === 22) {
      showError('Storage full! Please export and delete some pages to free up space.');
    } else {
      showError('Failed to save notebook. Please try again.');
    }
    return false;
  }
}

export function loadPermanentNotes() {
  try {
    const savedNotes = localStorage.getItem('permanentNotes');
    const permanentNotesField = document.getElementById('permanentNotes');
    if (permanentNotesField && savedNotes) {
      permanentNotesField.value = savedNotes;
    }
  } catch (e) {
    debugWarn('Error loading permanent notes:', e);
  }
}

export function savePermanentNotes() {
  try {
    const permanentNotesField = document.getElementById('permanentNotes');
    if (permanentNotesField) {
      localStorage.setItem('permanentNotes', permanentNotesField.value);
    }
    return true;
  } catch (e) {
    debugWarn('Error saving permanent notes:', e);
    return false;
  }
}

/**
 * Safely get item from localStorage
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
 * Safely set item in localStorage
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
