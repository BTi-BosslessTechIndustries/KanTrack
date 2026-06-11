/***********************
 * HIDDEN CARDS
 * Lets users hide cards from the board (e.g. long-stalled "On Hold" items)
 * without deleting them, and bring them back individually or in bulk via the
 * Hidden Cards modal.
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { recordAction } from './undo.js';
import { deepClone, escapeHtml, getColumnName } from './utils.js';
import { getSearchableText } from './search.js';

/**
 * Hide a task: marks it hidden, records an undoable action, and notifies the
 * UI to re-render its column and the hidden-count badge.
 *
 * `hidden`/`hiddenAt` are normalized to concrete values (false/null) before
 * the very first hide if they're undefined, so both `previousState` and
 * `newState` snapshots contain these keys. The generic undo/redo apply
 * functions only assign keys present in the snapshot, so a key that's
 * *added* by this action (rather than changed) would never be reverted on
 * undo otherwise.
 */
export function hideCard(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task || task.hidden) return;

  if (task.hidden === undefined) task.hidden = false;
  if (task.hiddenAt === undefined) task.hiddenAt = null;

  const previousState = deepClone(task);

  task.hidden = true;
  task.hiddenAt = Date.now();

  if (!task.actions) task.actions = [];
  task.actions.push({
    action: 'Card hidden',
    timestamp: new Date().toLocaleString(),
    type: 'hidden',
  });

  recordAction({
    type: 'hidden',
    taskId,
    previousState,
    newState: deepClone(task),
    description: `Hide "${task.title.substring(0, 30)}"`,
  });

  saveNotesToLocalStorage();
  _notifyChanged(taskId, task.column);
}

/**
 * Show a previously hidden task: clears `hidden`, records an undoable
 * action, and notifies the UI.
 */
export function showCard(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task || !task.hidden) return;

  const previousState = deepClone(task);

  task.hidden = false;
  task.hiddenAt = null;

  if (!task.actions) task.actions = [];
  task.actions.push({
    action: 'Card shown',
    timestamp: new Date().toLocaleString(),
    type: 'hidden',
  });

  recordAction({
    type: 'hidden',
    taskId,
    previousState,
    newState: deepClone(task),
    description: `Show "${task.title.substring(0, 30)}"`,
  });

  saveNotesToLocalStorage();
  _notifyChanged(taskId, task.column);
}

/**
 * Show multiple hidden tasks at once (e.g. "Show Selected" in the modal).
 * Each task gets its own undo entry.
 */
export function showCards(taskIds) {
  taskIds.forEach(id => showCard(id));
}

/** All currently hidden, non-deleted tasks, most-recently-hidden first. */
export function getHiddenTasks() {
  return state.notesData
    .filter(t => t.hidden && !t.deleted)
    .sort((a, b) => (b.hiddenAt ?? 0) - (a.hiddenAt ?? 0));
}

export function getHiddenCount() {
  return getHiddenTasks().length;
}

/** How many hidden tasks match the given search query. */
export function countHiddenMatches(query) {
  const term = query.toLowerCase().trim();
  if (!term) return 0;
  return getHiddenTasks().filter(t => getSearchableText(t).includes(term)).length;
}

function _notifyChanged(taskId, column) {
  window.dispatchEvent(
    new CustomEvent('kantrack:taskUpdated', { detail: { taskId, oldColumn: column } })
  );
  window.dispatchEvent(new Event('kantrack:updateColumnCounts'));
  window.dispatchEvent(new Event('kantrack:updateHiddenCount'));
}

let _hiddenModalOpen = false;

/**
 * Open the "Hidden Cards" modal: lists every hidden task with a per-row
 * "Show" button, checkboxes for multi-select, "Select All" and "Show
 * Selected". If `initialQuery` is non-empty, the list starts filtered to
 * titles/notes/tags matching it (with a "Clear filter" link), driven from
 * the search-hint link (see kantrack.js).
 * @param {string} [initialQuery]
 */
export function showHiddenCardsModal(initialQuery = '') {
  if (_hiddenModalOpen) return;
  _hiddenModalOpen = true;

  const dialog = document.createElement('dialog');
  dialog.id = 'kt-hidden-modal';
  dialog.style.cssText =
    'background:#2c2c2c;color:#e0e0e0;border:1px solid #555;border-radius:8px;padding:24px;max-width:480px;width:90%;font-family:inherit';

  dialog.addEventListener('close', () => {
    _hiddenModalOpen = false;
    dialog.remove();
  });

  let filterQuery = (initialQuery || '').toLowerCase().trim();

  function render() {
    const all = getHiddenTasks();
    const rows = filterQuery ? all.filter(t => getSearchableText(t).includes(filterQuery)) : all;

    const rowsHtml = rows.length
      ? rows
          .map(
            t => `
        <li data-row-id="${escapeHtml(t.id)}" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #444">
          <label style="display:flex;align-items:center;gap:8px;overflow:hidden;flex:1;cursor:pointer">
            <input type="checkbox" class="kt-hidden-row-check" data-id="${escapeHtml(t.id)}">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.title)}</span>
          </label>
          <span style="flex-shrink:0;display:flex;align-items:center;gap:8px">
            <span style="color:#aaa;font-size:0.85em">${escapeHtml(getColumnName(t.column))}</span>
            <button data-show-id="${escapeHtml(t.id)}" style="padding:4px 10px;background:#3a3a3a;color:#e0e0e0;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:0.85em">Show</button>
          </span>
        </li>`
          )
          .join('')
      : '<li style="padding:12px 0;color:#aaa;text-align:center">No hidden cards</li>';

    const filterNoticeHtml = filterQuery
      ? `<p style="margin:0 0 8px;font-size:0.85em;color:#aaa">Filtered by "${escapeHtml(filterQuery)}" — <a href="#" id="kt-hidden-clear-filter" style="color:#9cc4ff">Clear filter</a></p>`
      : '';

    dialog.innerHTML = `
      <h3 style="margin:0 0 12px">Hidden Cards (${all.length})</h3>
      ${filterNoticeHtml}
      <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
        <button id="kt-hidden-select-all" style="padding:4px 10px;background:#3a3a3a;color:#e0e0e0;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:0.85em">Select All</button>
        <button id="kt-hidden-show-selected" style="padding:4px 10px;background:#3a3a3a;color:#e0e0e0;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:0.85em">Show Selected</button>
        <span style="flex:1"></span>
        <button id="kt-hidden-close" style="padding:4px 10px;background:#3a3a3a;color:#e0e0e0;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:0.85em">Close</button>
      </div>
      <ul style="list-style:none;margin:0;padding:0;max-height:240px;overflow-y:auto">${rowsHtml}</ul>
    `;

    dialog.querySelector('#kt-hidden-close').addEventListener('click', () => dialog.close());

    const clearLink = dialog.querySelector('#kt-hidden-clear-filter');
    if (clearLink) {
      clearLink.addEventListener('click', e => {
        e.preventDefault();
        filterQuery = '';
        render();
      });
    }

    dialog.querySelectorAll('[data-show-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        showCard(btn.getAttribute('data-show-id'));
        render();
      });
    });

    const selectAllBtn = dialog.querySelector('#kt-hidden-select-all');
    selectAllBtn.addEventListener('click', () => {
      const checks = dialog.querySelectorAll('.kt-hidden-row-check');
      const allChecked = checks.length > 0 && Array.from(checks).every(c => c.checked);
      checks.forEach(c => (c.checked = !allChecked));
      selectAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    });

    dialog.querySelector('#kt-hidden-show-selected').addEventListener('click', () => {
      const ids = Array.from(dialog.querySelectorAll('.kt-hidden-row-check:checked')).map(c =>
        c.getAttribute('data-id')
      );
      if (ids.length === 0) return;
      showCards(ids);
      render();
    });
  }

  render();

  document.body.appendChild(dialog);
  dialog.showModal();
}
