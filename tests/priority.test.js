// priority.js imports several modules that touch the DOM and state.
// We mock them all as no-ops so we can test the two pure lookup functions
// (getPriorityLabel and getPriorityColor) in a Node environment.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../scripts/kantrack-modules/state.js', () => ({ notesData: [] }));
vi.mock('../scripts/kantrack-modules/storage.js', () => ({
  saveNotesToLocalStorage: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/tasks.js', () => ({
  updateNoteCardDisplay: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/sorting.js', () => ({
  sortColumnByPriority: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/context-menu.js', () => ({
  showContextMenu: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/undo.js', () => ({
  recordAction: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/utils.js', () => ({
  deepClone: obj => JSON.parse(JSON.stringify(obj)),
}));

import {
  getPriorityLabel,
  getPriorityColor,
  PRIORITIES,
} from '../scripts/kantrack-modules/priority.js';

// ─── getPriorityLabel ─────────────────────────────────────────────────────────

describe('getPriorityLabel', () => {
  it('returns "None" for null', () => {
    expect(getPriorityLabel(null)).toBe('None');
  });
  it('returns "Low" for "low"', () => {
    expect(getPriorityLabel('low')).toBe('Low');
  });
  it('returns "Medium" for "medium"', () => {
    expect(getPriorityLabel('medium')).toBe('Medium');
  });
  it('returns "High" for "high"', () => {
    expect(getPriorityLabel('high')).toBe('High');
  });
  it('returns "None" for unknown value', () => {
    expect(getPriorityLabel('critical')).toBe('None');
  });
  it('returns "None" for undefined', () => {
    expect(getPriorityLabel(undefined)).toBe('None');
  });
  it('covers every entry in the PRIORITIES constant', () => {
    PRIORITIES.forEach(({ value, label }) => {
      expect(getPriorityLabel(value)).toBe(label);
    });
  });
});

// ─── getPriorityColor ─────────────────────────────────────────────────────────

describe('getPriorityColor', () => {
  it('returns a non-empty string for null priority', () => {
    expect(getPriorityColor(null)).toBeTruthy();
  });
  it('returns a non-empty string for "low"', () => {
    expect(getPriorityColor('low')).toBeTruthy();
  });
  it('returns a non-empty string for "medium"', () => {
    expect(getPriorityColor('medium')).toBeTruthy();
  });
  it('returns a non-empty string for "high"', () => {
    expect(getPriorityColor('high')).toBeTruthy();
  });
  it('matches the color in the PRIORITIES constant for each value', () => {
    PRIORITIES.forEach(({ value, color }) => {
      expect(getPriorityColor(value)).toBe(color);
    });
  });
  it('falls back to the null-priority color for unknown values', () => {
    const fallback = PRIORITIES.find(p => p.value === null).color;
    expect(getPriorityColor('unknown')).toBe(fallback);
  });
  it('returns distinct colors for low, medium, and high', () => {
    const low = getPriorityColor('low');
    const medium = getPriorityColor('medium');
    const high = getPriorityColor('high');
    expect(low).not.toBe(medium);
    expect(medium).not.toBe(high);
    expect(low).not.toBe(high);
  });
});
