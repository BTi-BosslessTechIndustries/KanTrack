/**
 * Tests for virtual-list.js: VirtualList class.
 *
 * VirtualList requires IntersectionObserver (not available in Node) and real
 * DOM operations. Both are handled here: IntersectionObserver is mocked globally,
 * and a JSDOM environment is configured in beforeAll.
 *
 * JSDOM returns height 0 from getBoundingClientRect, so the card-height
 * refinement branch in #render() never fires — the initial CARD_HEIGHT_ESTIMATE
 * (120px) is used throughout. This is fine for structural tests.
 *
 * Intersection-triggered scroll windowing (onIntersection) is covered via a
 * helper that fires the IO callback directly.
 */
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { VirtualList } from '../scripts/kantrack-modules/virtual-list.js';

// INITIAL_RENDER constant mirrors the value in virtual-list.js
const INITIAL_RENDER = 20;
const BUFFER = 5;

let jsdomDoc;
let capturedIOCallback;

class MockIntersectionObserver {
  constructor(callback) {
    capturedIOCallback = callback;
    this._observed = [];
  }
  observe(el) {
    this._observed.push(el);
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  const { window } = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  jsdomDoc = window.document;
  vi.stubGlobal('document', jsdomDoc);
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItems(n, prefix = 'task') {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }));
}

function makeContainer() {
  const el = jsdomDoc.createElement('div');
  jsdomDoc.body.appendChild(el);
  return el;
}

const renderItem = task => {
  const el = jsdomDoc.createElement('div');
  el.className = 'vl-card';
  el.dataset.id = task.id;
  return el;
};

// ── Construction ──────────────────────────────────────────────────────────────

describe('VirtualList: construction', () => {
  let container;
  let vl;

  afterEach(() => {
    vl?.destroy();
    container?.remove();
  });

  it('renders up to INITIAL_RENDER items when list is larger', () => {
    container = makeContainer();
    vl = new VirtualList(container, makeItems(INITIAL_RENDER + 10), renderItem);
    expect(container.querySelectorAll('.vl-card').length).toBe(INITIAL_RENDER);
  });

  it('renders all items when list is smaller than INITIAL_RENDER', () => {
    container = makeContainer();
    vl = new VirtualList(container, makeItems(5), renderItem);
    expect(container.querySelectorAll('.vl-card').length).toBe(5);
  });

  it('renders exactly 0 cards for an empty list', () => {
    container = makeContainer();
    vl = new VirtualList(container, [], renderItem);
    expect(container.querySelectorAll('.vl-card').length).toBe(0);
  });

  it('injects a top spacer div', () => {
    container = makeContainer();
    vl = new VirtualList(container, makeItems(3), renderItem);
    expect(container.querySelector('.vl-spacer.vl-top')).toBeTruthy();
  });

  it('injects a bottom spacer div', () => {
    container = makeContainer();
    vl = new VirtualList(container, makeItems(3), renderItem);
    expect(container.querySelector('.vl-spacer.vl-bottom')).toBeTruthy();
  });

  it('injects a top sentinel div', () => {
    container = makeContainer();
    vl = new VirtualList(container, makeItems(3), renderItem);
    expect(container.querySelector('.vl-sentinel.vl-sentinel-top')).toBeTruthy();
  });

  it('injects a bottom sentinel div', () => {
    container = makeContainer();
    vl = new VirtualList(container, makeItems(3), renderItem);
    expect(container.querySelector('.vl-sentinel.vl-sentinel-bottom')).toBeTruthy();
  });

  it('does not throw for an empty items array', () => {
    container = makeContainer();
    expect(() => {
      vl = new VirtualList(container, [], renderItem);
    }).not.toThrow();
  });
});

// ── getRenderedElement ────────────────────────────────────────────────────────

describe('VirtualList: getRenderedElement', () => {
  let container;
  let vl;

  afterEach(() => {
    vl?.destroy();
    container?.remove();
  });

  it('returns the DOM element for a task in the initial window', () => {
    container = makeContainer();
    vl = new VirtualList(container, makeItems(5), renderItem);
    const el = vl.getRenderedElement('task-0');
    expect(el).toBeTruthy();
    expect(el.dataset.id).toBe('task-0');
  });

  it('returns null for a task beyond the initial render window', () => {
    container = makeContainer();
    vl = new VirtualList(container, makeItems(INITIAL_RENDER + 5), renderItem);
    // task-(INITIAL_RENDER) is at index INITIAL_RENDER, outside window [0, INITIAL_RENDER)
    expect(vl.getRenderedElement(`task-${INITIAL_RENDER}`)).toBeNull();
  });

  it('returns null for an unknown task id', () => {
    container = makeContainer();
    vl = new VirtualList(container, makeItems(5), renderItem);
    expect(vl.getRenderedElement('no-such-task')).toBeNull();
  });
});

// ── update ────────────────────────────────────────────────────────────────────

describe('VirtualList: update', () => {
  let container;
  let vl;

  afterEach(() => {
    vl?.destroy();
    container?.remove();
  });

  it('replaces rendered cards with the new item list', () => {
    container = makeContainer();
    vl = new VirtualList(container, makeItems(3), renderItem);
    vl.update(makeItems(7, 'new'));
    expect(container.querySelectorAll('.vl-card').length).toBe(7);
  });

  it('makes previously rendered tasks unreachable via getRenderedElement', () => {
    container = makeContainer();
    const original = [{ id: 'alpha' }, { id: 'beta' }];
    vl = new VirtualList(container, original, renderItem);
    vl.update([{ id: 'gamma' }, { id: 'delta' }]);
    expect(vl.getRenderedElement('alpha')).toBeNull();
    expect(vl.getRenderedElement('gamma')).toBeTruthy();
  });

  it('handles update to an empty list', () => {
    container = makeContainer();
    vl = new VirtualList(container, makeItems(5), renderItem);
    vl.update([]);
    expect(container.querySelectorAll('.vl-card').length).toBe(0);
  });

  it('respects INITIAL_RENDER cap on update', () => {
    container = makeContainer();
    vl = new VirtualList(container, makeItems(2), renderItem);
    vl.update(makeItems(INITIAL_RENDER + 8));
    expect(container.querySelectorAll('.vl-card').length).toBe(INITIAL_RENDER);
  });
});

// ── destroy ───────────────────────────────────────────────────────────────────

describe('VirtualList: destroy', () => {
  it('removes all structural and card nodes from the container', () => {
    const container = makeContainer();
    const vl = new VirtualList(container, makeItems(5), renderItem);
    vl.destroy();

    expect(container.querySelector('.vl-top')).toBeNull();
    expect(container.querySelector('.vl-bottom')).toBeNull();
    expect(container.querySelector('.vl-sentinel-top')).toBeNull();
    expect(container.querySelector('.vl-sentinel-bottom')).toBeNull();
    expect(container.querySelectorAll('.vl-card').length).toBe(0);

    container.remove();
  });

  it('leaves the container element itself in the DOM', () => {
    const container = makeContainer();
    const vl = new VirtualList(container, makeItems(3), renderItem);
    vl.destroy();
    expect(jsdomDoc.body.contains(container)).toBe(true);
    container.remove();
  });

  it('can be called multiple times without throwing', () => {
    const container = makeContainer();
    const vl = new VirtualList(container, makeItems(3), renderItem);
    vl.destroy();
    expect(() => vl.destroy()).not.toThrow();
    container.remove();
  });
});

// ── Intersection-driven windowing ─────────────────────────────────────────────

describe('VirtualList: scroll windowing via IntersectionObserver', () => {
  let container;
  let vl;

  afterEach(() => {
    vl?.destroy();
    container?.remove();
  });

  it('extends the render window when the bottom sentinel intersects', () => {
    container = makeContainer();
    const items = makeItems(INITIAL_RENDER + BUFFER + 2);
    vl = new VirtualList(container, items, renderItem);

    // Simulate bottom sentinel becoming visible
    const bottomSentinel = container.querySelector('.vl-sentinel-bottom');
    capturedIOCallback([{ isIntersecting: true, target: bottomSentinel }]);

    expect(container.querySelectorAll('.vl-card').length).toBe(INITIAL_RENDER + BUFFER);
  });
});
