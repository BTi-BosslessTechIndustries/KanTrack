/***********************
 * EXPORT/IMPORT FUNCTIONS
 ***********************/
import jsPDF from 'jspdf';
import * as state from './state.js';
import { getImage, storeImage, getNotebookImage, storeNotebookImage } from './database.js';
import {
  getColumnName,
  getCurrentDate,
  escapeHtml,
  formatTime,
  getImageDimensions,
} from './utils.js';
import { getPriorityLabel } from './priority.js';
import {
  getAllTasks,
  getAllTags,
  getAllNotebookItems,
  getAllClocks,
  saveTasks,
  saveTags,
  saveNotebookItems,
  saveClocks,
} from './repository.js';
import { validateImportFile, extractImportSummary } from './import-validator.js';
import { encryptWorkspace, decryptWorkspace, computeHash } from './crypto.js';
import { showError, showSuccess } from './notifications.js';

const APP_VERSION = '1.0.0';
const VALID_COLUMNS = ['todo', 'inProgress', 'onHold', 'done'];

/***********************
 * PDF EXPORT (Individual Task)
 ***********************/
export async function exportTaskAsPDF(taskId = null) {
  const id = taskId || state.currentTaskId;
  if (!id) return;

  const task = state.notesData.find(t => t.id === id);
  if (!task) return;

  const doc = new jsPDF();

  let yPos = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;

  // Title (split to fit page width)
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  const titleLines = doc.splitTextToSize(task.title, maxWidth);
  titleLines.forEach(line => {
    doc.text(line, margin, yPos);
    yPos += 10;
  });
  yPos += 2;

  // Priority
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  const priorityColor =
    task.priority === 'high'
      ? [244, 67, 54]
      : task.priority === 'low'
        ? [76, 175, 80]
        : task.priority === 'medium'
          ? [255, 152, 0]
          : [128, 128, 128];
  doc.setTextColor(...priorityColor);
  doc.text(`Priority: ${getPriorityLabel(task.priority)}`, margin, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 8;

  // Timer
  doc.text(`Total Worked Time: ${formatTime(task.timer || 0)}`, margin, yPos);
  yPos += 15;

  // Merge timeline (notes + history) in chronological order
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('Timeline:', margin, yPos);
  yPos += 8;

  if (task.actions && task.actions.length > 0) {
    for (const action of task.actions) {
      if (yPos > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPos = 20;
      }

      if (action.type === 'note') {
        // This is a note entry
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(76, 175, 80); // Green for notes
        doc.text(`[${action.timestamp}] Note added:`, margin, yPos);
        yPos += 6;

        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(0, 0, 0); // Reset to black for content

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = action.notesHTML;

        const childNodes = tempDiv.childNodes;
        for (let i = 0; i < childNodes.length; i++) {
          const node = childNodes[i];

          if (node.nodeName === 'IMG') {
            try {
              let imgSrc = null;

              // Try to get from IndexedDB first using imageId
              if (node.dataset.imageId) {
                imgSrc = await getImage(id, node.dataset.imageId);
              }

              // If not found, try data-src attribute
              if (!imgSrc && node.dataset.src) {
                imgSrc = node.dataset.src;
              }

              // Fallback to src if still not found
              if (!imgSrc) {
                imgSrc = node.src;
              }

              if (imgSrc && imgSrc.startsWith('data:')) {
                // Calculate proper dimensions maintaining aspect ratio
                const dimensions = await getImageDimensions(imgSrc);

                const imgMaxWidth = 150;
                const imgMaxHeight = 100;

                // Scale down to fit within max dimensions while maintaining aspect ratio
                const widthRatio = imgMaxWidth / dimensions.width;
                const heightRatio = imgMaxHeight / dimensions.height;
                const scale = Math.min(widthRatio, heightRatio, 1); // Don't scale up

                const imgWidth = dimensions.width * scale;
                const imgHeight = dimensions.height * scale;

                if (yPos + imgHeight > doc.internal.pageSize.getHeight() - 20) {
                  doc.addPage();
                  yPos = 20;
                }

                doc.addImage(imgSrc, 'PNG', margin, yPos, imgWidth, imgHeight);
                yPos += imgHeight + 5;
              }
            } catch (err) {
              console.error('Error adding image to PDF:', err);
            }
          } else if (node.textContent && node.textContent.trim()) {
            const text = node.textContent.trim();
            const lines = doc.splitTextToSize(text, maxWidth);

            lines.forEach(line => {
              if (yPos > doc.internal.pageSize.getHeight() - 20) {
                doc.addPage();
                yPos = 20;
              }
              doc.text(line, margin, yPos);
              yPos += 7;
            });
          }
        }

        yPos += 5;
      } else {
        // Regular history action with color coding
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        // Set color based on action type
        switch (action.type) {
          case 'created':
            doc.setTextColor(33, 150, 243); // Blue
            break;
          case 'deleted':
            doc.setTextColor(244, 67, 54); // Red
            break;
          case 'status':
            doc.setTextColor(156, 39, 176); // Purple
            break;
          case 'timer':
            doc.setTextColor(255, 152, 0); // Orange
            break;
          case 'priority':
            doc.setTextColor(38, 198, 218); // Cyan
            break;
          case 'subtask':
            doc.setTextColor(236, 64, 122); // Pink for sub-tasks
            break;
          default:
            doc.setTextColor(0, 0, 0); // Black
        }

        doc.text(`[${action.timestamp}] ${action.action}`, margin, yPos);
        doc.setTextColor(0, 0, 0); // Reset to black
        yPos += 6;
      }
    }
  } else {
    doc.setFontSize(11);
    doc.text('No timeline events', margin, yPos);
    yPos += 10;
  }

  const filename = `${task.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
  doc.save(filename);
}

/***********************
 * HTML EXPORT/IMPORT (Full Board)
 ***********************/
export async function exportBoardAsHTML() {
  const exportData = {
    exportDate: new Date().toISOString(),
    tasks: [],
  };

  for (const task of state.notesData) {
    const taskExport = { ...task };

    if (task.noteEntries && task.noteEntries.length > 0) {
      taskExport.noteEntriesWithImages = [];
      for (const entry of task.noteEntries) {
        const entryExport = { ...entry };
        if (entry.images && entry.images.length > 0) {
          entryExport.imageData = {};
          for (const imageId of entry.images) {
            const dataUrl = await getImage(task.id, imageId);
            if (dataUrl) {
              entryExport.imageData[imageId] = dataUrl;
            }
          }
        }
        taskExport.noteEntriesWithImages.push(entryExport);
      }
      delete taskExport.noteEntries;
    }

    exportData.tasks.push(taskExport);
  }

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Kanban Board Export - ${getCurrentDate()}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #1e1e1e; color: #e0e0e0; padding: 20px; }
    h1 { color: #4caf50; }
    .task { background: #2c2c2c; padding: 15px; margin: 10px 0; border-radius: 5px; }
    .task h3 { color: #4caf50; margin-top: 0; }
    img { max-width: 100%; margin: 10px 0; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>Kanban Board Export</h1>
  <p>Export Date: ${new Date().toLocaleString()}</p>
  <script type="application/json" id="kanbanData">
${JSON.stringify(exportData, null, 2)}
  </script>
  <div id="preview">
    ${generatePreviewHTML(exportData.tasks)}
  </div>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Kanban_Board_${getCurrentDate()}.html`;
  link.click();
}

function generatePreviewHTML(tasks) {
  let html = '';

  tasks.forEach(task => {
    if (task.deleted) return;

    const priorityColor =
      task.priority === 'high'
        ? '#f44336'
        : task.priority === 'low'
          ? '#4caf50'
          : task.priority === 'medium'
            ? '#ff9800'
            : 'rgba(255, 255, 255, 0.5)';

    html += `<div class="task">
      <h3>${escapeHtml(task.title)} - ${getColumnName(task.column)}</h3>
      <p><strong>Priority:</strong> <span style="color: ${priorityColor}">${getPriorityLabel(task.priority)}</span></p>
      <p><strong>Timer:</strong> ${formatTime(task.timer || 0)}</p>
    </div>`;
  });

  return html || '<p>No tasks to display</p>';
}

/***********************
 * WORKSPACE JSON EXPORT (.kantrack.json)
 ***********************/

/**
 * Build the workspace payload object.
 * mode = 'full'        — includes images embedded as base64 in noteEntries
 * mode = 'lightweight' — data only, no image data
 */
async function _buildWorkspacePayload(mode) {
  const tasks = await getAllTasks();
  const tags = await getAllTags();
  const notebook_items = await getAllNotebookItems();
  const clocks = (await getAllClocks()) || [];

  // For full export, embed images into note entries and notebook pages
  let exportTasks = tasks;
  let exportNotebookItems = notebook_items;
  if (mode === 'full') {
    exportTasks = [];
    for (const task of tasks) {
      const taskExport = { ...task };
      if (task.noteEntries && task.noteEntries.length > 0) {
        taskExport.noteEntries = [];
        for (const entry of task.noteEntries) {
          const entryExport = { ...entry };
          if (entry.images && entry.images.length > 0) {
            entryExport.imageData = {};
            for (const imageId of entry.images) {
              const dataUrl = await getImage(task.id, imageId);
              if (dataUrl) entryExport.imageData[imageId] = dataUrl;
            }
          }
          taskExport.noteEntries.push(entryExport);
        }
      }
      exportTasks.push(taskExport);
    }

    exportNotebookItems = [];
    for (const item of notebook_items) {
      const itemExport = { ...item };
      if (item.images && item.images.length > 0) {
        itemExport.imageData = {};
        for (const imageId of item.images) {
          const dataUrl = await getNotebookImage(item.id, imageId);
          if (dataUrl) itemExport.imageData[imageId] = dataUrl;
        }
      }
      exportNotebookItems.push(itemExport);
    }
  }

  return {
    formatVersion: 1,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    tasks: exportTasks,
    tags,
    notebook_items: exportNotebookItems,
    clocks,
    settings: {},
    integrity: {
      tasks_count: exportTasks.length,
      tasks_hash: await computeHash(exportTasks),
    },
  };
}

/**
 * Serialize a payload object to JSON, offloading to a Web Worker when available
 * to avoid blocking the main thread on large workspaces.
 * Falls back to synchronous JSON.stringify in environments without Worker support.
 * @param {object} payload
 * @returns {Promise<string>} JSON string
 */
async function _serializeViaWorker(payload) {
  if (typeof Worker === 'undefined') {
    return JSON.stringify(payload, null, 2);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/export-worker.js', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = e => {
      worker.terminate();
      if (e.data.type === 'done') resolve(e.data.jsonString);
      else reject(new Error(e.data.message ?? 'Worker serialization failed'));
    };
    worker.onerror = err => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ type: 'serialize', payload });
  });
}

/**
 * Download the workspace as a .kantrack.json file.
 * @param {'full'|'lightweight'} mode
 */
export async function exportWorkspaceAsJSON(mode = 'full') {
  const payload = await _buildWorkspacePayload(mode);
  const jsonString = await _serializeViaWorker(payload);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const suffix = mode === 'lightweight' ? '_lite' : '';
  link.download = `KanTrack_${getCurrentDate()}${suffix}.kantrack.json`;
  link.click();
}

/**
 * Show a passphrase dialog, then encrypt and download as .kantrack.enc.
 */
export async function exportWorkspaceAsEncrypted() {
  _showPassphraseDialog({
    title: 'Set export passphrase',
    message: 'If you lose this passphrase, the file cannot be opened. Keep it safe.',
    confirmLabel: 'Download encrypted',
    onConfirm: async passphrase => {
      if (!passphrase) {
        showError('Passphrase cannot be empty.');
        return;
      }
      try {
        const payload = await _buildWorkspacePayload('full');
        const jsonString = await _serializeViaWorker(payload);
        const encrypted = await encryptWorkspace(jsonString, passphrase);
        const blob = new Blob([encrypted], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `KanTrack_${getCurrentDate()}.kantrack.enc`;
        link.click();
      } catch (err) {
        showError('Encryption failed: ' + err.message);
      }
    },
    onCancel: () => {},
  });
}

/***********************
 * WORKSPACE IMPORT (.kantrack.json / .kantrack.enc)
 ***********************/

// Main import handler - routes to appropriate parser based on file type
export async function importBoardFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.kantrack.json')) {
    await _importWorkspaceFromJSON(file);
  } else if (fileName.endsWith('.kantrack.enc')) {
    await _importWorkspaceFromEnc(file);
  } else if (fileName.endsWith('.html')) {
    await importBoardFromHTML(file);
  } else if (fileName.endsWith('.txt')) {
    await importBoardFromTXT(file);
  } else {
    alert('Unsupported file type. Please use .kantrack.json, .kantrack.enc, .html, or .txt files.');
  }

  // Reset file input
  event.target.value = '';
}

/** Read a .kantrack.json file and run the import flow. */
async function _importWorkspaceFromJSON(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const parsed = JSON.parse(e.target.result);
      await _runImportFlow(parsed);
    } catch (err) {
      showError('Could not read file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

/** Read a .kantrack.enc file, prompt for passphrase, decrypt, then run the import flow. */
async function _importWorkspaceFromEnc(file) {
  const reader = new FileReader();
  reader.onload = e => {
    _showPassphraseDialog({
      title: 'Enter passphrase',
      message: 'This file is encrypted. Enter the passphrase used when it was exported.',
      confirmLabel: 'Decrypt and import',
      onConfirm: async passphrase => {
        try {
          const jsonString = await decryptWorkspace(e.target.result, passphrase);
          const parsed = JSON.parse(jsonString);
          await _runImportFlow(parsed);
        } catch (err) {
          showError('Incorrect passphrase or corrupted file.');
        }
      },
      onCancel: () => {},
    });
  };
  reader.readAsArrayBuffer(file);
}

/** Validate → preview dialog → apply import. */
async function _runImportFlow(parsed) {
  const { valid, errors, warnings } = validateImportFile(parsed);
  if (!valid) {
    showError('Import failed: ' + errors.join(' '));
    return;
  }

  const summary = extractImportSummary(parsed);

  _showImportPreviewDialog(summary, warnings, {
    onMerge: async () => {
      await _applyImport(parsed, 'merge');
      location.reload();
    },
    onReplace: async () => {
      await _autoBackup();
      // Brief delay lets the backup download initiate before the page navigates away
      await new Promise(resolve => setTimeout(resolve, 300));
      await _applyImport(parsed, 'replace');
      location.reload();
    },
    onCancel: () => {},
  });
}

/** Silently export current data as a lightweight backup before Replace. */
async function _autoBackup() {
  try {
    const payload = await _buildWorkspacePayload('lightweight');
    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `KanTrack_backup_${getCurrentDate()}.kantrack.json`;
    link.click();
  } catch (_) {
    // Non-critical — backup failure should not block the import
  }
}

/** Apply imported data to IDB stores. mode: 'replace' | 'merge'. */
async function _applyImport(data, mode) {
  // Restore images FIRST (before saving) so imageData is never serialised
  // into the IDB stores — images belong only in the images store.
  for (const task of data.tasks ?? []) {
    for (const entry of task.noteEntries || []) {
      if (entry.imageData) {
        for (const [imageId, dataUrl] of Object.entries(entry.imageData)) {
          await storeImage(task.id, imageId, dataUrl);
        }
      }
    }
  }

  for (const item of data.notebook_items ?? []) {
    if (item.imageData) {
      for (const [imageId, dataUrl] of Object.entries(item.imageData)) {
        await storeNotebookImage(item.id, imageId, dataUrl);
      }
    }
  }

  // Build clean task objects: normalise columns, strip imageData from note entries
  const tasks = (data.tasks ?? []).map(t => ({
    ...t,
    column: VALID_COLUMNS.includes(t.column) ? t.column : 'todo',
    noteEntries: (t.noteEntries || []).map(({ imageData: _stripped, ...entry }) => entry),
  }));

  const tags = data.tags ?? [];
  // Strip imageData from notebook items before saving to IDB
  const notebookItems = (data.notebook_items ?? []).map(
    ({ imageData: _stripped, ...item }) => item
  );
  const clocks = data.clocks ?? [];

  if (mode === 'replace') {
    saveTasks(tasks);
    saveTags(tags);
    saveNotebookItems(notebookItems);
    if (clocks.length > 0) saveClocks(clocks);
  } else {
    // Merge: add only items whose ID is not already in the current store
    const [existingTasks, existingTags, existingPages, existingClocks] = await Promise.all([
      getAllTasks(),
      getAllTags(),
      getAllNotebookItems(),
      getAllClocks().then(r => r || []),
    ]);

    const existingTaskIds = new Set(existingTasks.map(t => t.id));
    const existingTagIds = new Set(existingTags.map(t => t.id));
    const existingPageIds = new Set(existingPages.map(p => p.id));
    const existingClockIds = new Set(existingClocks.map(c => c.id));

    saveTasks([...existingTasks, ...tasks.filter(t => !existingTaskIds.has(t.id))]);
    saveTags([...existingTags, ...tags.filter(t => !existingTagIds.has(t.id))]);
    saveNotebookItems([...existingPages, ...notebookItems.filter(p => !existingPageIds.has(p.id))]);
    if (clocks.length > 0) {
      saveClocks([...existingClocks, ...clocks.filter(c => !existingClockIds.has(c.id))]);
    }
  }
}

/***********************
 * UI DIALOGS (dynamically created, no static HTML required)
 ***********************/

/**
 * Show a calm import preview dialog with entity counts and optional warnings.
 * @param {{ tasks, tags, pages, clocks }} summary
 * @param {string[]} warnings
 * @param {{ onMerge, onReplace, onCancel }} callbacks
 */
function _showImportPreviewDialog(summary, warnings, { onMerge, onReplace, onCancel }) {
  const dialog = document.createElement('dialog');
  dialog.style.cssText =
    'background:#2c2c2c;color:#e0e0e0;border:1px solid #555;border-radius:8px;padding:24px;max-width:420px;width:90%;font-family:inherit';

  const counts = [
    summary.tasks > 0 && `${summary.tasks} task${summary.tasks !== 1 ? 's' : ''}`,
    summary.tags > 0 && `${summary.tags} tag${summary.tags !== 1 ? 's' : ''}`,
    summary.pages > 0 && `${summary.pages} notebook page${summary.pages !== 1 ? 's' : ''}`,
    summary.clocks > 0 && `${summary.clocks} clock${summary.clocks !== 1 ? 's' : ''}`,
  ].filter(Boolean);

  const countHtml =
    counts.length > 0
      ? `<ul style="margin:8px 0 0 16px;padding:0">${counts.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`
      : '<p style="margin:8px 0 0">No data found in this file.</p>';

  const warningHtml =
    warnings.length > 0
      ? `<p style="margin:16px 0 0;color:#ffb74d;font-size:0.9em">Note: ${escapeHtml(warnings.join(' '))}</p>`
      : '';

  dialog.innerHTML = `
    <h3 style="margin:0 0 12px;color:#4caf50">Import workspace</h3>
    <p style="margin:0">This file contains:</p>
    ${countHtml}
    ${warningHtml}
    <p style="margin:16px 0 8px">How would you like to import?</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      <button id="kt-import-merge" style="flex:1;padding:8px 12px;background:#3a3a3a;color:#e0e0e0;border:1px solid #555;border-radius:4px;cursor:pointer">Merge with current</button>
      <button id="kt-import-replace" style="flex:1;padding:8px 12px;background:#3a3a3a;color:#e0e0e0;border:1px solid #555;border-radius:4px;cursor:pointer">Replace all</button>
      <button id="kt-import-cancel" style="padding:8px 12px;background:transparent;color:#aaa;border:1px solid #555;border-radius:4px;cursor:pointer">Cancel</button>
    </div>
    <p style="margin:12px 0 0;font-size:0.8em;color:#888">Replace will download a backup of your current data first.</p>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  const close = () => {
    dialog.close();
    dialog.remove();
  };

  dialog.querySelector('#kt-import-merge').addEventListener('click', () => {
    close();
    onMerge();
  });
  dialog.querySelector('#kt-import-replace').addEventListener('click', () => {
    close();
    onReplace();
  });
  dialog.querySelector('#kt-import-cancel').addEventListener('click', () => {
    close();
    onCancel();
  });
}

/**
 * Show a passphrase input dialog.
 * @param {{ title, message, confirmLabel, onConfirm, onCancel }} opts
 */
function _showPassphraseDialog({ title, message, confirmLabel, onConfirm, onCancel }) {
  const dialog = document.createElement('dialog');
  dialog.style.cssText =
    'background:#2c2c2c;color:#e0e0e0;border:1px solid #555;border-radius:8px;padding:24px;max-width:380px;width:90%;font-family:inherit';

  dialog.innerHTML = `
    <h3 style="margin:0 0 12px;color:#4caf50">${escapeHtml(title)}</h3>
    <p style="margin:0 0 12px;font-size:0.9em;color:#aaa">${escapeHtml(message)}</p>
    <input id="kt-passphrase" type="password" placeholder="Passphrase"
      style="width:100%;box-sizing:border-box;padding:8px;background:#1e1e1e;color:#e0e0e0;border:1px solid #555;border-radius:4px;font-size:1em">
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button id="kt-pass-cancel" style="padding:8px 14px;background:transparent;color:#aaa;border:1px solid #555;border-radius:4px;cursor:pointer">Cancel</button>
      <button id="kt-pass-confirm" style="padding:8px 14px;background:#4caf50;color:#fff;border:none;border-radius:4px;cursor:pointer">${escapeHtml(confirmLabel)}</button>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  const input = dialog.querySelector('#kt-passphrase');
  const close = () => {
    dialog.close();
    dialog.remove();
  };

  dialog.querySelector('#kt-pass-confirm').addEventListener('click', () => {
    const passphrase = input.value;
    close();
    onConfirm(passphrase);
  });

  dialog.querySelector('#kt-pass-cancel').addEventListener('click', () => {
    close();
    onCancel();
  });

  // Allow Enter key to confirm
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const passphrase = input.value;
      close();
      onConfirm(passphrase);
    }
  });

  input.focus();
}

// Import from HTML (current format and old SkoiZz94.github.io format)
async function importBoardFromHTML(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const htmlContent = e.target.result;
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      const dataScript = doc.getElementById('kanbanData');

      if (!dataScript) {
        alert('Invalid import file: No data found');
        return;
      }

      const importData = JSON.parse(dataScript.textContent);

      if (!importData.tasks) {
        alert('Invalid import file: No tasks found');
        return;
      }

      // Column display-name → ID map for old format compatibility
      const columnNameMap = {
        'To Do': 'todo',
        'In Progress': 'inProgress',
        'On Hold': 'onHold',
        Done: 'done',
      };

      if (
        confirm(
          `This will replace your current board with ${importData.tasks.length} tasks.\n\nContinue?`
        )
      ) {
        const processedTasks = [];

        for (const task of importData.tasks) {
          if (task.deleted) continue;

          // New format: noteEntriesWithImages → noteEntries
          if (task.noteEntriesWithImages) {
            task.noteEntries = [];
            for (const entry of task.noteEntriesWithImages) {
              if (entry.imageData) {
                for (const [imageId, dataUrl] of Object.entries(entry.imageData)) {
                  await storeImage(String(task.id), imageId, dataUrl);
                }
                delete entry.imageData;
              }
              task.noteEntries.push(entry);
            }
            delete task.noteEntriesWithImages;
          }

          // Old format: notes string → noteEntries array
          if (task.notes && !task.noteEntries) {
            task.noteEntries = [
              {
                timestamp: task.actions?.[0]?.timestamp || new Date().toLocaleString(),
                notesHTML: task.notes,
                images: task.images || [],
              },
            ];
            delete task.notes;
            delete task.images;
          }

          // Normalise column — handle both IDs and display names from old version
          const column = VALID_COLUMNS.includes(task.column)
            ? task.column
            : columnNameMap[task.column] || 'todo';

          processedTasks.push({
            ...task,
            id: String(task.id),
            column,
            noteEntries: task.noteEntries || [],
            tags: task.tags || [],
            actions: task.actions || [
              { action: 'Imported', timestamp: new Date().toLocaleString(), type: 'created' },
            ],
            timer: task.timer || 0,
            priority: task.priority || null,
            deleted: false,
          });
        }

        saveTasks(processedTasks);
        alert('Board imported successfully! The page will now reload.');
        location.reload();
      }
    } catch (err) {
      console.error('Import error:', err);
      alert('Error importing file: ' + err.message);
    }
  };

  reader.readAsText(file);
}

// Import from TXT (old format - backward compatibility)
async function importBoardFromTXT(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const txtContent = e.target.result;

      // Parse the text format
      const sections = txtContent.split('----------------------').filter(s => s.trim().length > 0);
      const convertedTasks = [];

      // Helper function to map column names to IDs
      function mapColumnToId(columnName) {
        const mapping = {
          'To Do': 'todo',
          'In Progress': 'inProgress',
          'On Hold': 'onHold',
          Done: 'done',
        };
        return mapping[columnName] || 'todo';
      }

      // Helper function to parse action type from action text
      function parseActionType(actionText) {
        if (actionText.includes('Created')) return 'created';
        if (actionText.includes('Moved')) return 'moved';
        if (actionText.includes('Edited Notes')) return 'edited';
        if (actionText.includes('Timer')) return 'timer';
        return 'other';
      }

      // Parse each section
      for (let section of sections) {
        const lines = section
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0);

        let title = 'Untitled';
        let notes = '';
        let column = 'todo';
        let actions = [];
        let inActionsSection = false;
        let hasValidData = false;

        for (let line of lines) {
          // Skip header and footer lines
          if (line.includes('Kanban Board Export') || line === 'Deleted Items:') {
            continue;
          }

          if (line.startsWith('Title: ')) {
            title = line.substring(7).trim();
            hasValidData = true;
          } else if (line.startsWith('Notes: ')) {
            notes = line.substring(7).trim();
            if (notes === 'No additional notes') {
              notes = '';
            }
          } else if (line.startsWith('Current Column: ')) {
            const columnName = line.substring(16).trim();
            column = mapColumnToId(columnName);
          } else if (line === 'Actions:') {
            inActionsSection = true;
          } else if (inActionsSection && line.startsWith('- ')) {
            // Parse action line
            const actionText = line.substring(2).trim();

            // Extract timestamp (text after " at ")
            let timestamp = new Date().toLocaleString();
            const atIndex = actionText.lastIndexOf(' at ');
            if (atIndex !== -1) {
              timestamp = actionText.substring(atIndex + 4).trim();
            }

            actions.push({
              action: actionText,
              timestamp: timestamp,
              type: parseActionType(actionText),
            });
          }
        }

        // Only create task if we found valid data
        if (!hasValidData) {
          continue;
        }

        // Create the task object with exact same structure as new notes
        const newTask = {
          id: crypto.randomUUID(),
          title: title,
          noteEntries: [],
          timer: 0,
          priority: null,
          column: column,
          actions:
            actions.length > 0
              ? actions
              : [
                  {
                    action: 'Created (imported from TXT)',
                    timestamp: new Date().toLocaleString(),
                    type: 'created',
                  },
                ],
        };

        // If there are notes, add them as a note entry
        if (notes && notes.length > 0) {
          newTask.noteEntries.push({
            timestamp: actions.length > 0 ? actions[0].timestamp : new Date().toLocaleString(),
            notesHTML: notes,
            images: [],
          });
        }

        convertedTasks.push(newTask);
      }

      if (convertedTasks.length === 0) {
        alert('No valid tasks found in TXT file');
        return;
      }

      if (
        confirm(
          `This will replace your current board with ${convertedTasks.length} imported tasks.\n\nContinue?`
        )
      ) {
        saveTasks(convertedTasks);
        alert('Board imported successfully from TXT! The page will now reload.');
        location.reload();
      }
    } catch (err) {
      console.error('TXT Import error:', err);
      alert('Error importing TXT file: ' + err.message);
    }
  };

  reader.readAsText(file);
}
