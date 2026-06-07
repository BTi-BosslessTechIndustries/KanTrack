/***********************
 * DONE COLUMN CAPACITY
 * Enforces a hard cap on the number of cards allowed in the Done column.
 * When the cap is reached, the oldest cards are flagged for permanent
 * deletion via a blocking pop-up that offers PDF export first.
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { getMetaValue, setMetaValue } from './database.js';
import { debugWarn } from './utils.js';

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
