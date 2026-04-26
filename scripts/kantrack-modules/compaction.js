/***********************
 * OPLOG COMPACTION
 * Keeps the oplog bounded over time by removing entries that are
 * no longer needed for undo/redo or future sync.
 *
 * Rules (Phase 3):
 *  - Keep all entries from the last 7 days unconditionally.
 *  - Drop entries older than 7 days that are marked undone (abandoned redo history).
 *  - Never compact entries newer than lastSyncedLamport (reserved for Phase 10).
 *
 * Compaction runs during idle time so it never blocks the UI.
 * The filter computation is offloaded to a Web Worker when available.
 ***********************/
import { idbGetAllOplog, idbDeleteOplogBatch, setMetaValue, getMetaValue } from './database.js';
import { debugWarn } from './utils.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Delegate the filter step to a Web Worker.
 * Falls back to inline filter when Worker is unavailable.
 * @param {object[]} entries
 * @param {number} cutoff
 * @param {number} lastSyncedLamport
 * @returns {Promise<string[]>} opIds to delete
 */
function _filterViaWorker(entries, cutoff, lastSyncedLamport) {
  const inlineFilter = () =>
    entries
      .filter(
        e =>
          e.undone === true &&
          e.timestamp < cutoff &&
          (lastSyncedLamport === null || e.lamport > lastSyncedLamport)
      )
      .map(e => e.opId);

  if (typeof Worker === 'undefined') {
    return Promise.resolve(inlineFilter());
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/compaction-worker.js', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = e => {
      worker.terminate();
      if (e.data.type === 'result') resolve(e.data.deleteIds);
      else reject(new Error('Compaction worker returned unexpected message'));
    };
    worker.onerror = err => {
      worker.terminate();
      debugWarn('[compaction] Worker error, falling back to inline filter:', err);
      resolve(inlineFilter());
    };
    worker.postMessage({ type: 'compact', entries, cutoffMs: cutoff, lastSyncedLamport });
  });
}

/**
 * Schedule compaction to run during browser idle time.
 * Falls back to a short timeout in environments without requestIdleCallback.
 */
export function scheduleCompaction() {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => runCompaction(), { timeout: 30_000 });
  } else {
    setTimeout(runCompaction, 5_000);
  }
}

/**
 * Run oplog compaction. Silently swallows errors — compaction is best-effort.
 */
async function runCompaction() {
  try {
    const [entries, lastSyncedLamport] = await Promise.all([
      idbGetAllOplog(),
      getMetaValue('lastSyncedLamport'),
    ]);
    const cutoff = Date.now() - SEVEN_DAYS_MS;

    const toDelete = await _filterViaWorker(entries, cutoff, lastSyncedLamport);

    await idbDeleteOplogBatch(toDelete);

    await setMetaValue('lastCompactedAt', Date.now());

    if (toDelete.length > 0) {
      debugWarn(`[compaction] Removed ${toDelete.length} stale oplog entries`);
    }
  } catch (e) {
    debugWarn('[compaction] Failed silently:', e);
  }
}
