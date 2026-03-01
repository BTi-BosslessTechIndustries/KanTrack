/**
 * Tests for compactEntries() — the pure filter function exported from
 * compaction-worker.js. Tests run in Node via Vitest; no IDB or DOM needed.
 */
import { describe, it, expect } from 'vitest';
import { compactEntries } from '../scripts/workers/compaction-worker.js';

const CUTOFF = 1_000_000; // arbitrary cutoff ms

const makeEntry = (opId, undone, timestamp) => ({ opId, undone, timestamp });

describe('compactEntries', () => {
  it('returns empty array for empty oplog', () => {
    expect(compactEntries([], CUTOFF)).toEqual([]);
  });

  it('returns empty array when no entries are eligible for deletion', () => {
    const entries = [
      makeEntry('op-1', false, CUTOFF - 1000), // not undone → keep
      makeEntry('op-2', true, CUTOFF + 1000), // undone but newer than cutoff → keep
    ];
    expect(compactEntries(entries, CUTOFF)).toEqual([]);
  });

  it('returns only the opIds of undone entries older than cutoff', () => {
    const entries = [
      makeEntry('old-undone', true, CUTOFF - 5000), // ← delete
      makeEntry('old-done', false, CUTOFF - 5000), // keep: not undone
      makeEntry('new-undone', true, CUTOFF + 5000), // keep: newer than cutoff
      makeEntry('new-done', false, CUTOFF + 5000), // keep: not undone + newer
    ];
    const result = compactEntries(entries, CUTOFF);
    expect(result).toEqual(['old-undone']);
  });

  it('returns all opIds when all entries are undone and older than cutoff', () => {
    const entries = [
      makeEntry('op-a', true, CUTOFF - 1000),
      makeEntry('op-b', true, CUTOFF - 2000),
      makeEntry('op-c', true, CUTOFF - 3000),
    ];
    const result = compactEntries(entries, CUTOFF);
    expect(result).toHaveLength(3);
    expect(result).toContain('op-a');
    expect(result).toContain('op-b');
    expect(result).toContain('op-c');
  });
});
