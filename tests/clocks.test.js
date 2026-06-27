/**
 * Tests for clocks.js: pure formatting logic, plus createClockElement()'s
 * use of i18n for the chronometer Start/Pause/Reset labels and the per-clock
 * delete button's translated title/aria-label.
 *
 * Most of this module (rendering, drag-reorder, interval-driven updates,
 * modal wiring) is DOM/setInterval-heavy orchestration that belongs in E2E
 * tests (see tests/e2e/flows.spec.js for clock reset coverage).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setLanguage } from '../scripts/kantrack-modules/i18n.js';
import { formatChronometer, createClockElement } from '../scripts/kantrack-modules/clocks.js';

// Minimal DOM element stub supporting the APIs createClockElement() touches.
function createElementStub(tagName) {
  const el = {
    tagName,
    classList: {
      _classes: new Set(),
      add(...names) {
        names.forEach(n => this._classes.add(n));
      },
      contains(name) {
        return this._classes.has(name);
      },
    },
    dataset: {},
    attributes: {},
    children: [],
    textContent: '',
    innerHTML: '',
    draggable: false,
    title: '',
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelector(selector) {
      const className = selector.replace(/^\./, '');
      const search = node => {
        for (const child of node.children) {
          if (child.classList.contains(className)) return child;
          const found = search(child);
          if (found) return found;
        }
        return null;
      };
      return search(this);
    },
  };
  return el;
}

beforeEach(() => {
  global.document = {
    createElement: tagName => createElementStub(tagName),
    getElementById: () => null,
  };
});

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

describe('createClockElement', () => {
  it('renders chronometer controls using the active dictionary (Português PT)', () => {
    setLanguage('pt-PT');
    const el = createClockElement({ id: '1', type: 'chronometer', name: 'Work', elapsed: 0 });
    expect(el.querySelector('start-btn').textContent).toBe('Iniciar');
    expect(el.querySelector('pause-btn').textContent).toBe('Pausar');
    expect(el.querySelector('reset-btn').textContent).toBe('Reiniciar');
    setLanguage('en-GB');
  });

  it('renders the per-clock delete button with a translated title/aria-label (French)', () => {
    setLanguage('fr');
    const el = createClockElement({
      id: '2',
      type: 'timezone',
      name: 'Lisbon',
      timezone: 'Europe/Lisbon',
    });
    const deleteBtn = el.querySelector('clock-delete');
    expect(deleteBtn.title).toBe('Supprimer');
    expect(deleteBtn.getAttribute('aria-label')).toBe('Supprimer');
    setLanguage('en-GB');
  });

  it('does not render a delete button for the current-time clock', () => {
    setLanguage('en-GB');
    const el = createClockElement({
      id: '3',
      type: 'timezone',
      name: 'Current Time',
      timezone: null,
      isCurrent: true,
    });
    expect(el.querySelector('clock-delete')).toBeNull();
  });
});
