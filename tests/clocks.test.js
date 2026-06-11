/**
 * Tests for clocks.js: pure formatting logic.
 *
 * Only formatChronometer() is testable as a unit test - it's a pure
 * milliseconds-to-"HH:MM:SS" formatter with no DOM or timer dependencies.
 * Everything else in this module (rendering, drag-reorder, interval-driven
 * updates, modal wiring) is DOM/setInterval-heavy orchestration that belongs
 * in E2E tests (see tests/e2e/flows.spec.js for clock reset coverage).
 */
import { describe, it, expect } from 'vitest';
import { formatChronometer } from '../scripts/kantrack-modules/clocks.js';

describe('formatChronometer', () => {
  it('formats 0 ms as "00:00:00"', () => {
    expect(formatChronometer(0)).toBe('00:00:00');
  });

  it('formats sub-second values as "00:00:00"', () => {
    expect(formatChronometer(999)).toBe('00:00:00');
  });

  it('formats exactly one second as "00:00:01"', () => {
    expect(formatChronometer(1000)).toBe('00:00:01');
  });

  it('formats 59 seconds as "00:00:59"', () => {
    expect(formatChronometer(59_000)).toBe('00:00:59');
  });

  it('formats exactly one minute as "00:01:00"', () => {
    expect(formatChronometer(60_000)).toBe('00:01:00');
  });

  it('formats minutes and seconds together', () => {
    expect(formatChronometer(61_000)).toBe('00:01:01');
  });

  it('formats exactly one hour as "01:00:00"', () => {
    expect(formatChronometer(3_600_000)).toBe('01:00:00');
  });

  it('formats hours, minutes, and seconds together', () => {
    expect(formatChronometer(3_661_000)).toBe('01:01:01');
  });

  it('does not roll minutes/seconds over into the next unit', () => {
    // 23 minutes 59 seconds - minutes must not show as 24, seconds not as 60
    expect(formatChronometer(23 * 60_000 + 59_000)).toBe('00:23:59');
  });

  it('pads single-digit hours, minutes, and seconds to two digits', () => {
    expect(formatChronometer(5 * 3_600_000 + 9 * 60_000 + 7_000)).toBe('05:09:07');
  });

  it('does not pad hours beyond two digits for very long durations', () => {
    expect(formatChronometer(100 * 3_600_000)).toBe('100:00:00');
  });
});
