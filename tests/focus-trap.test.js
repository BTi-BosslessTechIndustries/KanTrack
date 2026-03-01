/**
 * Unit tests for the createFocusTrap() utility (Phase 7 — Accessibility).
 *
 * tests/setup.js installs a minimal document stub over the Node global so that
 * other modules can import without crashing.  That stub has no real DOM methods
 * (no querySelector, no append, etc.), which breaks DOM-based tests.
 *
 * Solution: spin up a real JSDOM instance here and temporarily replace the
 * global document stub with it using vi.stubGlobal.  createFocusTrap() then
 * resolves document.activeElement from the real JSDOM document, and all
 * element interactions work correctly.
 *
 * Note: jsdom does not implement layout (offsetParent is always null), so we
 * patch offsetParent on each test element to return a truthy value — exactly
 * as the focus-trap's getFocusable() visibility filter requires.
 */
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createFocusTrap } from '../scripts/kantrack-modules/utils.js';

// ─── shared JSDOM environment ─────────────────────────────────────────────────

let doc;
let KbEvent;

beforeAll(() => {
  const jsdomEnv = new JSDOM('<!DOCTYPE html><body></body></html>');
  doc = jsdomEnv.window.document;
  KbEvent = jsdomEnv.window.KeyboardEvent;
  // Replace the node-env document stub so createFocusTrap can read activeElement
  vi.stubGlobal('document', doc);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Make an element appear "visible" to getFocusable() (jsdom has no layout). */
function makeVisible(el) {
  Object.defineProperty(el, 'offsetParent', {
    get: () => doc.body,
    configurable: true,
  });
  return el;
}

/** Create a <button> that is both focusable and visible. */
function makeBtn() {
  return makeVisible(doc.createElement('button'));
}

/**
 * Dispatch a Tab keydown event on the container.
 * Returns the event so tests can inspect defaultPrevented.
 */
function tab(target, shiftKey = false) {
  const e = new KbEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
    shiftKey,
  });
  target.dispatchEvent(e);
  return e;
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('createFocusTrap', () => {
  let container;
  let trap;

  beforeEach(() => {
    container = doc.createElement('div');
    doc.body.appendChild(container);
    trap = null;
  });

  afterEach(() => {
    trap?.deactivate();
    container.remove();
  });

  // ── activate / focus ───────────────────────────────────────────────────────

  it('activate() focuses the first focusable element in the container', () => {
    const btn1 = makeBtn();
    const btn2 = makeBtn();
    container.append(btn1, btn2);

    trap = createFocusTrap(container);
    trap.activate();

    expect(doc.activeElement).toBe(btn1);
  });

  it('activate() on an empty container does not throw', () => {
    trap = createFocusTrap(container);
    expect(() => trap.activate()).not.toThrow();
  });

  // ── forward Tab wrapping ───────────────────────────────────────────────────

  it('Tab from the last focusable element wraps focus to the first', () => {
    const btn1 = makeBtn();
    const btn2 = makeBtn();
    container.append(btn1, btn2);

    trap = createFocusTrap(container);
    trap.activate();
    btn2.focus(); // move to last

    const e = tab(container);
    expect(e.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(btn1);
  });

  it('Tab when focus is outside the container wraps to the first element', () => {
    const btn1 = makeBtn();
    const btn2 = makeBtn();
    container.append(btn1, btn2);

    const outside = makeVisible(doc.createElement('button'));
    doc.body.appendChild(outside);
    outside.focus();

    trap = createFocusTrap(container);
    // Activate then immediately re-focus outside to simulate external focus
    trap.activate();
    outside.focus();

    const e = tab(container);
    expect(e.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(btn1);

    outside.remove();
  });

  it('Tab from a non-last element does NOT prevent default', () => {
    const btn1 = makeBtn();
    const btn2 = makeBtn();
    const btn3 = makeBtn();
    container.append(btn1, btn2, btn3);

    trap = createFocusTrap(container);
    trap.activate();
    btn2.focus(); // middle element — Tab should not be intercepted

    const e = tab(container);
    expect(e.defaultPrevented).toBe(false);
  });

  // ── backward Shift+Tab wrapping ────────────────────────────────────────────

  it('Shift+Tab from the first focusable element wraps focus to the last', () => {
    const btn1 = makeBtn();
    const btn2 = makeBtn();
    container.append(btn1, btn2);

    trap = createFocusTrap(container);
    trap.activate(); // focus lands on btn1

    const e = tab(container, /* shiftKey */ true);
    expect(e.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(btn2);
  });

  it('Shift+Tab when focus is outside the container wraps to the last element', () => {
    const btn1 = makeBtn();
    const btn2 = makeBtn();
    container.append(btn1, btn2);

    const outside = makeVisible(doc.createElement('button'));
    doc.body.appendChild(outside);
    outside.focus();

    trap = createFocusTrap(container);
    trap.activate();
    outside.focus();

    const e = tab(container, /* shiftKey */ true);
    expect(e.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(btn2);

    outside.remove();
  });

  it('Shift+Tab from a non-first element does NOT prevent default', () => {
    const btn1 = makeBtn();
    const btn2 = makeBtn();
    const btn3 = makeBtn();
    container.append(btn1, btn2, btn3);

    trap = createFocusTrap(container);
    trap.activate();
    btn2.focus(); // middle element

    const e = tab(container, /* shiftKey */ true);
    expect(e.defaultPrevented).toBe(false);
  });

  // ── empty container ────────────────────────────────────────────────────────

  it('Tab in an empty container prevents default and does not throw', () => {
    trap = createFocusTrap(container);
    trap.activate(); // no focusable children

    const e = tab(container);
    expect(e.defaultPrevented).toBe(true);
  });

  // ── deactivate ─────────────────────────────────────────────────────────────

  it('deactivate() removes the Tab handler — subsequent Tab is no longer intercepted', () => {
    const btn1 = makeBtn();
    const btn2 = makeBtn();
    container.append(btn1, btn2);

    trap = createFocusTrap(container);
    trap.activate();
    trap.deactivate();

    btn2.focus(); // last element — would normally trigger wrap
    const e = tab(container);
    // Handler removed → default NOT prevented, focus stays on btn2
    expect(e.defaultPrevented).toBe(false);
    expect(doc.activeElement).toBe(btn2);
  });

  it('deactivate() can be called multiple times without throwing', () => {
    trap = createFocusTrap(container);
    trap.activate();
    expect(() => {
      trap.deactivate();
      trap.deactivate();
    }).not.toThrow();
  });

  // ── non-Tab keys ───────────────────────────────────────────────────────────

  it('non-Tab keydown events are not intercepted by the trap', () => {
    const btn1 = makeBtn();
    container.append(btn1);

    trap = createFocusTrap(container);
    trap.activate();

    for (const key of ['Enter', 'Escape', 'ArrowDown', 'a']) {
      const e = new KbEvent('keydown', { key, bubbles: true, cancelable: true });
      container.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    }
  });

  // ── full cycle ─────────────────────────────────────────────────────────────

  it('Tab cycles through three elements: activate focuses first, Tab from last wraps to first', () => {
    const btn1 = makeBtn();
    const btn2 = makeBtn();
    const btn3 = makeBtn();
    container.append(btn1, btn2, btn3);

    trap = createFocusTrap(container);
    trap.activate();
    expect(doc.activeElement).toBe(btn1);

    // Tab from btn1 (not last) — should NOT wrap
    let e = tab(container);
    expect(e.defaultPrevented).toBe(false);

    // Move to last manually, then Tab → wraps to first
    btn3.focus();
    e = tab(container);
    expect(e.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(btn1);
  });
});
