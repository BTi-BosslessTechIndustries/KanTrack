/**
 * Tests for context-menu.js: showContextMenu, closeActiveMenu, isMenuOpen.
 *
 * context-menu.js creates DOM nodes, uses requestAnimationFrame for position
 * adjustment, and sets up click-outside listeners via setTimeout. A real JSDOM
 * environment is used. Fake timers keep setTimeout in check.
 *
 * setup.js provides a global.window stub without innerWidth/innerHeight, so the
 * rAF position-adjustment code evaluates NaN comparisons that short-circuit to
 * false — no errors, no position changes. That is fine for these behavioural tests.
 */
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  showContextMenu,
  closeActiveMenu,
  isMenuOpen,
} from '../scripts/kantrack-modules/context-menu.js';

let jsdomDoc;

beforeAll(() => {
  const { window } = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  jsdomDoc = window.document;
  vi.stubGlobal('document', jsdomDoc);
  vi.stubGlobal('requestAnimationFrame', cb => cb());
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  closeActiveMenu();
  vi.useFakeTimers();
});

afterEach(() => {
  closeActiveMenu();
  vi.useRealTimers();
});

// Helper: create a button that acts as the menu anchor
function makeAnchor() {
  const btn = jsdomDoc.createElement('button');
  jsdomDoc.body.appendChild(btn);
  return btn;
}

// ── isMenuOpen ────────────────────────────────────────────────────────────────

describe('isMenuOpen', () => {
  it('returns false when no menu is active', () => {
    expect(isMenuOpen()).toBe(false);
  });

  it('returns true after showContextMenu is called', () => {
    const anchor = makeAnchor();
    showContextMenu({ anchorElement: anchor, items: [{ label: 'X', value: 'x' }] });
    expect(isMenuOpen()).toBe(true);
    anchor.remove();
  });

  it('returns false after closeActiveMenu is called', () => {
    const anchor = makeAnchor();
    showContextMenu({ anchorElement: anchor, items: [{ label: 'X', value: 'x' }] });
    closeActiveMenu();
    expect(isMenuOpen()).toBe(false);
    anchor.remove();
  });
});

// ── showContextMenu ───────────────────────────────────────────────────────────

describe('showContextMenu', () => {
  it('returns the created menu element', () => {
    const anchor = makeAnchor();
    const menu = showContextMenu({ anchorElement: anchor, items: [] });
    expect(menu).toBeTruthy();
    expect(menu.tagName).toBe('DIV');
    anchor.remove();
  });

  it('appends the menu to document.body', () => {
    const anchor = makeAnchor();
    const menu = showContextMenu({ anchorElement: anchor, items: [] });
    expect(jsdomDoc.body.contains(menu)).toBe(true);
    anchor.remove();
  });

  it('applies the default "context-quick-menu" class', () => {
    const anchor = makeAnchor();
    const menu = showContextMenu({ anchorElement: anchor, items: [] });
    expect(menu.classList.contains('context-quick-menu')).toBe(true);
    anchor.remove();
  });

  it('applies a custom menuClass', () => {
    const anchor = makeAnchor();
    const menu = showContextMenu({ anchorElement: anchor, menuClass: 'my-menu', items: [] });
    expect(menu.classList.contains('my-menu')).toBe(true);
    anchor.remove();
  });

  it('creates one button per item', () => {
    const anchor = makeAnchor();
    const items = [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
      { label: 'C', value: 'c' },
    ];
    const menu = showContextMenu({ anchorElement: anchor, items });
    expect(menu.querySelectorAll('button').length).toBe(3);
    anchor.remove();
  });

  it('button text content matches item label', () => {
    const anchor = makeAnchor();
    const menu = showContextMenu({
      anchorElement: anchor,
      items: [{ label: 'Click me', value: 'v' }],
    });
    expect(menu.querySelector('button').textContent).toBe('Click me');
    anchor.remove();
  });

  it('calls onSelect with the item value when a button is clicked', () => {
    const anchor = makeAnchor();
    const onSelect = vi.fn();
    const menu = showContextMenu({
      anchorElement: anchor,
      items: [{ label: 'Go', value: 'go-value' }],
      onSelect,
    });
    menu.querySelector('button').click();
    expect(onSelect).toHaveBeenCalledWith('go-value');
    anchor.remove();
  });

  it('calls item.onClick with (value, event) when provided', () => {
    const anchor = makeAnchor();
    const onClick = vi.fn();
    const menu = showContextMenu({
      anchorElement: anchor,
      items: [{ label: 'X', value: 'val', onClick }],
    });
    menu.querySelector('button').click();
    expect(onClick).toHaveBeenCalledWith('val', expect.any(Object));
    anchor.remove();
  });

  it('closes the menu on click when closeOnSelect is true (default)', () => {
    const anchor = makeAnchor();
    const menu = showContextMenu({ anchorElement: anchor, items: [{ label: 'X', value: 'v' }] });
    menu.querySelector('button').click();
    expect(isMenuOpen()).toBe(false);
    anchor.remove();
  });

  it('keeps the menu open on click when closeOnSelect is false', () => {
    const anchor = makeAnchor();
    const menu = showContextMenu({
      anchorElement: anchor,
      items: [{ label: 'X', value: 'v' }],
      closeOnSelect: false,
    });
    menu.querySelector('button').click();
    expect(isMenuOpen()).toBe(true);
    anchor.remove();
  });

  it('adds "active" class to items where active is true', () => {
    const anchor = makeAnchor();
    const menu = showContextMenu({
      anchorElement: anchor,
      items: [
        { label: 'On', value: 'on', active: true },
        { label: 'Off', value: 'off', active: false },
      ],
    });
    const btns = menu.querySelectorAll('button');
    expect(btns[0].classList.contains('active')).toBe(true);
    expect(btns[1].classList.contains('active')).toBe(false);
    anchor.remove();
  });

  it('closes any existing menu before opening a new one', () => {
    const anchor = makeAnchor();
    showContextMenu({ anchorElement: anchor, items: [{ label: 'A', value: 'a' }] });
    showContextMenu({ anchorElement: anchor, items: [{ label: 'B', value: 'b' }] });
    expect(jsdomDoc.querySelectorAll('.context-quick-menu').length).toBe(1);
    anchor.remove();
  });

  it('sets item button color style when item.color is provided', () => {
    const anchor = makeAnchor();
    const menu = showContextMenu({
      anchorElement: anchor,
      items: [{ label: 'Red', value: 'r', color: '#ff0000' }],
    });
    const btn = menu.querySelector('button');
    expect(btn.style.color).toBe('rgb(255, 0, 0)');
    anchor.remove();
  });
});

// ── closeActiveMenu ───────────────────────────────────────────────────────────

describe('closeActiveMenu', () => {
  it('removes the menu element from document.body', () => {
    const anchor = makeAnchor();
    const menu = showContextMenu({ anchorElement: anchor, items: [{ label: 'X', value: 'v' }] });
    expect(jsdomDoc.body.contains(menu)).toBe(true);
    closeActiveMenu();
    expect(jsdomDoc.body.contains(menu)).toBe(false);
    anchor.remove();
  });

  it('is safe to call when no menu is open', () => {
    expect(() => closeActiveMenu()).not.toThrow();
  });

  it('sets isMenuOpen to false', () => {
    const anchor = makeAnchor();
    showContextMenu({ anchorElement: anchor, items: [{ label: 'X', value: 'v' }] });
    closeActiveMenu();
    expect(isMenuOpen()).toBe(false);
    anchor.remove();
  });

  it('is idempotent: calling twice does not throw', () => {
    const anchor = makeAnchor();
    showContextMenu({ anchorElement: anchor, items: [{ label: 'X', value: 'v' }] });
    closeActiveMenu();
    expect(() => closeActiveMenu()).not.toThrow();
    anchor.remove();
  });
});
