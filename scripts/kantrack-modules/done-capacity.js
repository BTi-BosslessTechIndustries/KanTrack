/***********************
 * DONE COLUMN CAPACITY
 * Enforces a hard cap on the number of cards allowed in the Done column.
 * When the cap is reached, the oldest cards are flagged for permanent
 * deletion via a blocking pop-up that offers PDF export first.
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';

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
