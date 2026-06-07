/***********************
 * DONE COLUMN CAPACITY
 * Enforces a hard cap on the number of cards allowed in the Done column.
 * When the cap is reached, the oldest cards are flagged for permanent
 * deletion via a blocking pop-up that offers PDF export first.
 ***********************/
import JSZip from 'jszip';
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { getMetaValue, setMetaValue, deleteTaskImages } from './database.js';
import { updateColumnCounts } from './search.js';
import { renderTagFilterButtons } from './tags.js';
import { purgeUndoHistoryForTaskIds } from './undo.js';
import { exportTaskAsPDF, generateTaskPDFBlob } from './export.js';
import { escapeHtml, debugWarn } from './utils.js';

export const DONE_CAP = 30;
export const DONE_TRIM_COUNT = 15;

/**
 * Pure selection: if the Done column (excluding deleted tasks) is at or over
 * DONE_CAP, returns its oldest DONE_TRIM_COUNT tasks sorted ascending by
 * doneAt (oldest first). Returns an empty array otherwise.
 *
 * Any Done task missing `doneAt` is defensively stamped with Date.now() and
 * persisted before sorting, so selection is always well-defined even for
 * stragglers that slipped past the migration (Task 5).
 *
 * @param {object[]} notesData
 * @returns {object[]}
 */
export function selectDoneOverflow(notesData) {
  const doneTasks = notesData.filter(t => !t.deleted && t.column === 'done');
  if (doneTasks.length < DONE_CAP) return [];

  let needsSave = false;
  for (const task of doneTasks) {
    if (task.doneAt == null) {
      task.doneAt = Date.now();
      needsSave = true;
    }
  }
  if (needsSave) saveNotesToLocalStorage();

  return [...doneTasks].sort((a, b) => a.doneAt - b.doneAt).slice(0, DONE_TRIM_COUNT);
}

const DONE_AT_BACKFILL_FLAG = 'doneAtBackfillCompletedAt';

/**
 * One-time migration: stamps `doneAt = Date.now()` onto every pre-existing
 * Done-column task that doesn't already have one, then sets a meta flag so
 * this never runs again. Touches no other field on any task. Safe to call on
 * every load — it's a no-op once the flag is set.
 *
 * Mirrors the `lastCompactedAt` one-time-flag pattern in compaction.js/database.js.
 * Wrapped in try/catch + debugWarn: a failed backfill never blocks app load,
 * and simply retries on the next load since the flag won't have been written.
 */
export async function backfillDoneTimestamps() {
  try {
    const alreadyDone = await getMetaValue(DONE_AT_BACKFILL_FLAG);
    if (alreadyDone != null) return;

    let changed = false;
    // Intentionally includes deleted tasks too — a stamp now means a Trash restore later won't need its own backfill.
    for (const task of state.notesData) {
      if (task.column === 'done' && task.doneAt == null) {
        task.doneAt = Date.now();
        changed = true;
      }
    }
    if (changed) saveNotesToLocalStorage();

    await setMetaValue(DONE_AT_BACKFILL_FLAG, Date.now());
  } catch (e) {
    debugWarn('[done-capacity] doneAt backfill failed (will retry on next load):', e);
  }
}

/**
 * Permanently deletes the given tasks: removes them from notesData, deletes
 * their images, persists, purges undo/redo history referencing them, and
 * notifies the UI via the existing `kantrack:taskRemoved` event so the
 * relevant column's virtual list (or DOM node) refreshes.
 *
 * By design there is NO Trash entry, NO recordAction, and NO "Deleted"
 * history line — this is irreversible, exactly like the spec requires.
 *
 * @param {object[]} tasks
 */
export async function deleteDoneOverflowTasks(tasks) {
  if (tasks.length === 0) return;

  const ids = tasks.map(t => t.id);
  const idSet = new Set(ids);

  state.setNotesData(state.notesData.filter(t => !idSet.has(t.id)));
  saveNotesToLocalStorage();

  for (const id of ids) {
    try {
      await deleteTaskImages(id);
    } catch (e) {
      debugWarn(`[done-capacity] Failed to delete images for task ${id}:`, e);
    }
  }

  purgeUndoHistoryForTaskIds(idSet);

  for (const id of ids) {
    window.dispatchEvent(new CustomEvent('kantrack:taskRemoved', { detail: { taskId: id } }));
  }

  updateColumnCounts();
  renderTagFilterButtons();
}

let _capacityDialogOpen = false;

/**
 * Runs the capacity check: if the Done column (excluding deleted tasks) is at
 * or over DONE_CAP, opens the blocking pop-up listing the oldest DONE_TRIM_COUNT
 * cards (a no-op if the dialog is already open). Returns true if the dialog
 * was opened (or already open) for this check, false if the column is under
 * the cap — callers use this to decide whether to suppress other prompts that
 * would otherwise stack on top of the blocking dialog.
 *
 * @returns {boolean}
 */
export function checkDoneCapacity() {
  if (_capacityDialogOpen) return true;

  const overflow = selectDoneOverflow(state.notesData);
  if (overflow.length === 0) return false;

  _capacityDialogOpen = true;
  _showCapacityDialog(overflow);
  return true;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Human-readable "how long has this been in Done" string, e.g. "5 days",
 * "1 day", or "less than a day".
 * @param {object} task
 * @returns {string}
 */
function _formatTimeInDone(task) {
  const days = Math.floor((Date.now() - (task.doneAt ?? Date.now())) / ONE_DAY_MS);
  if (days <= 0) return 'less than a day';
  if (days === 1) return '1 day';
  return `${days} days`;
}

/**
 * Build and show the blocking "Done column limit reached" dialog.
 * Cannot be dismissed except by clicking Delete: no close control, Escape is
 * blocked via `cancel` preventDefault, and there is no click-outside handler.
 * @param {object[]} tasks - the oldest DONE_TRIM_COUNT Done tasks, oldest first
 */
function _showCapacityDialog(tasks) {
  const dialog = document.createElement('dialog');
  dialog.style.cssText =
    'background:#2c2c2c;color:#e0e0e0;border:1px solid #555;border-radius:8px;padding:24px;max-width:480px;width:90%;font-family:inherit';

  dialog.addEventListener('cancel', e => e.preventDefault());

  const rowsHtml = tasks
    .map(
      t => `
        <li style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #444">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.title)}</span>
          <span style="flex-shrink:0;display:flex;align-items:center;gap:8px">
            <span style="color:#aaa;font-size:0.85em">${escapeHtml(_formatTimeInDone(t))}</span>
            <button data-export-id="${escapeHtml(t.id)}" style="padding:4px 10px;background:#3a3a3a;color:#e0e0e0;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:0.85em">Export PDF</button>
          </span>
        </li>`
    )
    .join('');

  dialog.innerHTML = `
    <h3 style="margin:0 0 12px;color:#f44336">Done column limit reached</h3>
    <p style="margin:0 0 12px">The Done column has reached ${DONE_CAP} cards. The ${DONE_TRIM_COUNT} oldest will be permanently deleted.</p>
    <ul style="list-style:none;margin:0 0 16px;padding:0;max-height:240px;overflow-y:auto">${rowsHtml}</ul>
    <div style="display:flex;gap:8px;justify-content:space-between;align-items:center">
      <button id="kt-capacity-export-all" style="padding:8px 14px;background:#3a3a3a;color:#e0e0e0;border:1px solid #555;border-radius:4px;cursor:pointer">Export All (.zip)</button>
      <button id="kt-capacity-delete" style="padding:8px 14px;background:#f44336;color:#fff;border:none;border-radius:4px;cursor:pointer">Delete</button>
    </div>
    <p id="kt-capacity-status" style="margin:12px 0 0;font-size:0.85em;color:#aaa;min-height:1em"></p>
  `;

  document.body.appendChild(dialog);
  dialog.showModal();

  const statusEl = dialog.querySelector('#kt-capacity-status');

  dialog.querySelectorAll('[data-export-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      exportTaskAsPDF(btn.getAttribute('data-export-id'));
      btn.textContent = 'DONE';
      btn.disabled = true;
      btn.style.cssText =
        'padding:4px 10px;background:#1e3a2f;color:var(--success-color);border:1px solid var(--success-color);border-radius:4px;font-weight:600;font-size:0.85em;cursor:default';
    });
  });

  const exportAllBtn = dialog.querySelector('#kt-capacity-export-all');
  exportAllBtn.addEventListener('click', async () => {
    statusEl.textContent = 'Building zip…';
    try {
      await _exportTasksAsZip(tasks);
      statusEl.textContent = 'Zip downloaded.';
      exportAllBtn.textContent = 'DONE';
      exportAllBtn.disabled = true;
      exportAllBtn.style.cssText =
        'padding:8px 14px;background:#1e3a2f;color:var(--success-color);border:1px solid var(--success-color);border-radius:4px;font-weight:600;cursor:default';
    } catch (e) {
      debugWarn('[done-capacity] Export-all failed:', e);
      statusEl.textContent =
        'Export failed — you can still export cards individually or click Delete.';
    }
  });

  dialog.querySelector('#kt-capacity-delete').addEventListener('click', async () => {
    await deleteDoneOverflowTasks(tasks);
    dialog.close();
    dialog.remove();
    _capacityDialogOpen = false;
  });
}

/**
 * Generates one PDF per task and bundles them into a single .zip download,
 * mirroring the export pattern in notebook-export.js (generatePagePDFBlob +
 * JSZip + object-URL download).
 * @param {object[]} tasks
 */
async function _exportTasksAsZip(tasks) {
  const zip = new JSZip();

  for (const task of tasks) {
    const blob = await generateTaskPDFBlob(task.id);
    if (blob) {
      const safeName = task.title.replace(/[^a-z0-9]/gi, '_');
      zip.file(`${safeName}_${task.id}.pdf`, blob);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Done_Cards_Export.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
