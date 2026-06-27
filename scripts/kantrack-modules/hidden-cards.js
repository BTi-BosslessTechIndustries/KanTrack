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
import { t } from './i18n.js';

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
 *
 * Hiding is only allowed from the "To Do" and "On Hold" columns; cards in
 * "In Progress" or "Done" cannot be hidden.
 */
export function hideCard(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task || task.hidden) return;
  if (task.column !== 'todo' && task.column !== 'onHold') return;

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
  dialog.className = 'kt-hidden-modal';

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
            task => `
        <li class="kt-hidden-row" data-row-id="${escapeHtml(task.id)}">
          <label>
            <input type="checkbox" class="kt-hidden-row-check" data-id="${escapeHtml(task.id)}">
            <span class="kt-hidden-row-title">${escapeHtml(task.title)}</span>
          </label>
          <span class="kt-hidden-row-meta">
            <span class="kt-hidden-column-badge">${escapeHtml(getColumnName(task.column))}</span>
            <button data-show-id="${escapeHtml(task.id)}" class="kt-hidden-show-btn">${escapeHtml(t('hiddenCards.showBtn'))}</button>
          </span>
        </li>`
          )
          .join('')
      : `<li class="kt-hidden-empty">${escapeHtml(t('hiddenCards.empty'))}</li>`;

    const filterNoticeHtml = filterQuery
      ? `<p class="kt-hidden-filter-notice">${escapeHtml(t('hiddenCards.filteredBy', { query: filterQuery }))} <a href="#" id="kt-hidden-clear-filter">${escapeHtml(t('hiddenCards.clearFilter'))}</a></p>`
      : '';

    dialog.innerHTML = `
      <div class="kt-hidden-header">
        <div class="kt-hidden-title">
          <span class="kt-hidden-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-4.5-11-4.5s1.6-3 4-5.5"></path>
              <path d="M9.9 4.24A9.97 9.97 0 0 1 12 4c7 0 11 4.5 11 4.5s-1.6 3-4 5.5"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          </span>
          <h3>${escapeHtml(t('hiddenCards.title'))} <span class="kt-hidden-count-badge">${all.length}</span></h3>
        </div>
        <span class="kt-hidden-close-x" id="kt-hidden-close">&times;</span>
      </div>
      ${filterNoticeHtml}
      <div class="kt-hidden-toolbar">
        <button id="kt-hidden-select-all" class="kt-hidden-btn">${escapeHtml(t('hiddenCards.selectAll'))}</button>
        <button id="kt-hidden-show-selected" class="kt-hidden-btn kt-hidden-btn-primary">${escapeHtml(t('hiddenCards.showSelected'))}</button>
      </div>
      <ul class="kt-hidden-list">${rowsHtml}</ul>
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
      selectAllBtn.textContent = allChecked
        ? t('hiddenCards.selectAll')
        : t('hiddenCards.deselectAll');
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
