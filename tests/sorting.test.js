/**
 * Unit tests for sorting.js
 * Tests the pure getPrioritySortValue function and the VL-updater delegation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPrioritySortValue,
  registerVLUpdater,
  sortColumnByPriority,
} from '../scripts/kantrack-modules/sorting.js';

// ── getPrioritySortValue ──────────────────────────────────────

describe('getPrioritySortValue — non-todo column (High=0, Medium=1, Low=2, None=3)', () => {
  it('returns 0 for high', () => {
    expect(getPrioritySortValue('high', false)).toBe(0);
  });
  it('returns 1 for medium', () => {
    expect(getPrioritySortValue('medium', false)).toBe(1);
  });
  it('returns 2 for low', () => {
    expect(getPrioritySortValue('low', false)).toBe(2);
  });
  it('returns 3 for null (no priority)', () => {
    expect(getPrioritySortValue(null, false)).toBe(3);
  });
  it('returns 3 for undefined', () => {
    expect(getPrioritySortValue(undefined, false)).toBe(3);
  });
  it('high sorts before medium', () => {
    expect(getPrioritySortValue('high', false)).toBeLessThan(getPrioritySortValue('medium', false));
  });
  it('medium sorts before low', () => {
    expect(getPrioritySortValue('medium', false)).toBeLessThan(getPrioritySortValue('low', false));
  });
  it('low sorts before none', () => {
    expect(getPrioritySortValue('low', false)).toBeLessThan(getPrioritySortValue(null, false));
  });
});

describe('getPrioritySortValue — todo column (None=0, High=1, Medium=2, Low=3)', () => {
  it('returns 0 for null (no priority — floats to top)', () => {
    expect(getPrioritySortValue(null, true)).toBe(0);
  });
  it('returns 0 for undefined', () => {
    expect(getPrioritySortValue(undefined, true)).toBe(0);
  });
  it('returns 1 for high', () => {
    expect(getPrioritySortValue('high', true)).toBe(1);
  });
  it('returns 2 for medium', () => {
    expect(getPrioritySortValue('medium', true)).toBe(2);
  });
  it('returns 3 for low', () => {
    expect(getPrioritySortValue('low', true)).toBe(3);
  });
  it('none sorts before high in todo column', () => {
    expect(getPrioritySortValue(null, true)).toBeLessThan(getPrioritySortValue('high', true));
  });
  it('high sorts before low in todo column', () => {
    expect(getPrioritySortValue('high', true)).toBeLessThan(getPrioritySortValue('low', true));
  });
});

// ── registerVLUpdater / sortColumnByPriority delegation ──────

describe('sortColumnByPriority — VL updater delegation', () => {
  afterEach(() => {
    registerVLUpdater(null); // restore to DOM-fallback mode after each test
  });

  it('calls the registered VL updater with the column ID', () => {
    const updater = vi.fn();
    registerVLUpdater(updater);
    sortColumnByPriority('todo');
    expect(updater).toHaveBeenCalledOnce();
    expect(updater).toHaveBeenCalledWith('todo');
  });

  it('calls the updater for each column independently', () => {
    const updater = vi.fn();
    registerVLUpdater(updater);
    sortColumnByPriority('inProgress');
    sortColumnByPriority('done');
    expect(updater).toHaveBeenCalledTimes(2);
    expect(updater).toHaveBeenCalledWith('inProgress');
    expect(updater).toHaveBeenCalledWith('done');
  });

  it('falls back to DOM path (no-op in jsdom) when no updater is registered', () => {
    registerVLUpdater(null);
    // Should not throw even without column elements in DOM
    expect(() => sortColumnByPriority('todo')).not.toThrow();
  });
});

// ── Unknown/arbitrary priority strings ───────────────────────

describe('getPrioritySortValue — unknown priority strings', () => {
  it('treats an unknown string as "none" in a non-todo column (returns 3)', () => {
    expect(getPrioritySortValue('critical', false)).toBe(3);
  });

  it('treats an unknown string as "none" in the todo column (returns 0)', () => {
    expect(getPrioritySortValue('critical', true)).toBe(0);
  });

  it('returns the same value as null for an unknown non-todo priority', () => {
    expect(getPrioritySortValue('??', false)).toBe(getPrioritySortValue(null, false));
  });

  it('returns the same value as null for an unknown todo priority', () => {
    expect(getPrioritySortValue('??', true)).toBe(getPrioritySortValue(null, true));
  });

  it('empty string is treated as unknown (same as null) in non-todo column', () => {
    expect(getPrioritySortValue('', false)).toBe(getPrioritySortValue(null, false));
  });
});

// ── Complete ordering contract ────────────────────────────────

describe('getPrioritySortValue — complete ordering contract', () => {
  it('enforces full non-todo order: high < medium < low < none', () => {
    const values = ['high', 'medium', 'low', null].map(p => getPrioritySortValue(p, false));
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeLessThan(values[i + 1]);
    }
  });

  it('enforces full todo order: none < high < medium < low', () => {
    const values = [null, 'high', 'medium', 'low'].map(p => getPrioritySortValue(p, true));
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeLessThan(values[i + 1]);
    }
  });

  it('non-todo high (0) sorts strictly before todo high (1)', () => {
    expect(getPrioritySortValue('high', false)).toBeLessThan(getPrioritySortValue('high', true));
  });
});
