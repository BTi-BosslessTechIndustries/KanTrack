/**
 * Compaction worker — filter computation for oplog compaction.
 * IDB reads and deletes stay on the main thread; only the CPU-bound
 * filter step runs here.
 *
 * Protocol:
 *   Main → Worker : { type: 'compact', entries: OplogEntry[], cutoffMs: number }
 *   Worker → Main : { type: 'result', deleteIds: string[] }
 *
 * compactEntries is exported so it can be unit-tested directly in Vitest.
 */

/**
 * Return the opIds of entries that should be deleted.
 * Deletes entries that are both (a) undone and (b) older than cutoffMs.
 * @param {Array<{opId: string, undone: boolean, timestamp: number}>} entries
 * @param {number} cutoffMs  Unix timestamp; entries older than this may be deleted
 * @returns {string[]} array of opIds to delete
 */
export function compactEntries(entries, cutoffMs) {
  return entries.filter(e => e.undone === true && e.timestamp < cutoffMs).map(e => e.opId);
}

// Only wire up the message handler when running as a Web Worker (not in Node tests)
if (typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined') {
  self.onmessage = e => {
    const { type, entries, cutoffMs } = e.data;
    if (type !== 'compact') return;
    self.postMessage({ type: 'result', deleteIds: compactEntries(entries, cutoffMs) });
  };
}
