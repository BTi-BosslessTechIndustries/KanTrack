/**
 * Tests for router.js — centralized event delegation module.
 *
 * Strategy: initRouter() registers a click handler on document.addEventListener.
 * In tests we intercept that registration, then call the captured handler manually
 * with mock events — no browser required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Re-import the module fresh in each describe block ───────────────────────
// Because registerAction() writes to module-level state, we need a clean
// import per test run. Vitest's `isolate: true` gives us a fresh module per
// FILE; within the file we manage state carefully with beforeEach resets.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal element mock that implements .closest('[data-action]').
 * If `action` is set, the element itself carries data-action.
 */
function makeEl({ action = null, param = null } = {}) {
  return {
    dataset: {
      ...(action ? { action } : {}),
      ...(param !== null ? { actionParam: param } : {}),
    },
    closest(selector) {
      if (selector !== '[data-action]') return null;
      return this.dataset.action ? this : null;
    },
  };
}

/**
 * Build an element with NO data-action whose parent DOES have one.
 * Simulates clicking an SVG icon inside a button[data-action].
 */
function makeChildEl(parent) {
  return {
    dataset: {},
    closest(selector) {
      if (selector !== '[data-action]') return null;
      return parent.dataset.action ? parent : null;
    },
  };
}

/**
 * Intercept document.addEventListener so we can grab the click handler
 * that initRouter() registers, then call it manually in tests.
 * Returns a function that fires the captured click handler with a mock event.
 */
function captureRouter() {
  let clickHandler = null;

  global.document = {
    ...global.document,
    addEventListener: vi.fn((event, handler) => {
      if (event === 'click') clickHandler = handler;
    }),
  };

  return target => {
    if (!clickHandler) throw new Error('initRouter() was not called');
    clickHandler({ target });
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerAction + initRouter', () => {
  let fireClick;

  beforeEach(async () => {
    // Fresh module import so module-level actionMap is empty
    vi.resetModules();
    const mod = await import('../scripts/kantrack-modules/router.js');

    fireClick = captureRouter();
    mod.initRouter();
    return mod; // give calling code access if needed
  });

  it('calls the registered handler when a matching element is clicked', async () => {
    const { registerAction } = await import('../scripts/kantrack-modules/router.js');
    const handler = vi.fn();
    registerAction('test:action', handler);

    fireClick(makeEl({ action: 'test:action' }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('passes data-action-param to the handler', async () => {
    const { registerAction } = await import('../scripts/kantrack-modules/router.js');
    const handler = vi.fn();
    registerAction('test:withParam', handler);

    fireClick(makeEl({ action: 'test:withParam', param: 'hello' }));

    expect(handler).toHaveBeenCalledWith('hello', expect.anything(), expect.anything());
  });

  it('passes null when data-action-param is absent', async () => {
    const { registerAction } = await import('../scripts/kantrack-modules/router.js');
    const handler = vi.fn();
    registerAction('test:noParam', handler);

    fireClick(makeEl({ action: 'test:noParam' }));

    expect(handler).toHaveBeenCalledWith(null, expect.anything(), expect.anything());
  });

  it('does nothing when no data-action element is found', async () => {
    const { registerAction } = await import('../scripts/kantrack-modules/router.js');
    const handler = vi.fn();
    registerAction('test:orphan', handler);

    // Element with no data-action and no data-action parent
    const noActionEl = {
      dataset: {},
      closest: () => null,
    };
    fireClick(noActionEl);

    expect(handler).not.toHaveBeenCalled();
  });

  it('does nothing when the action is not registered', async () => {
    // No handler registered for 'unregistered:action'
    const unregisteredEl = makeEl({ action: 'unregistered:action' });
    // Should not throw
    expect(() => fireClick(unregisteredEl)).not.toThrow();
  });

  it('walks up to the closest ancestor with data-action (child element click)', async () => {
    const { registerAction } = await import('../scripts/kantrack-modules/router.js');
    const handler = vi.fn();
    registerAction('test:parent', handler);

    const parent = makeEl({ action: 'test:parent', param: 'p' });
    const child = makeChildEl(parent); // e.g. an SVG icon inside the button

    fireClick(child); // click lands on child, router walks up to parent

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('p', expect.anything(), parent);
  });

  it('calls the most recently registered handler for the same action', async () => {
    const { registerAction } = await import('../scripts/kantrack-modules/router.js');
    const first = vi.fn();
    const second = vi.fn();
    registerAction('test:overwrite', first);
    registerAction('test:overwrite', second);

    fireClick(makeEl({ action: 'test:overwrite' }));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('dispatches independent actions to their own handlers', async () => {
    const { registerAction } = await import('../scripts/kantrack-modules/router.js');
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    registerAction('test:a', handlerA);
    registerAction('test:b', handlerB);

    fireClick(makeEl({ action: 'test:a' }));
    fireClick(makeEl({ action: 'test:b' }));

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
  });

  it('routes multiple clicks to the same handler each time', async () => {
    const { registerAction } = await import('../scripts/kantrack-modules/router.js');
    const handler = vi.fn();
    registerAction('test:multi', handler);

    fireClick(makeEl({ action: 'test:multi' }));
    fireClick(makeEl({ action: 'test:multi' }));
    fireClick(makeEl({ action: 'test:multi' }));

    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('attaches exactly one click listener to document', async () => {
    // document.addEventListener is mocked in captureRouter(); check call count
    expect(global.document.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    // Called only once (initRouter called once in beforeEach)
    const clickCalls = global.document.addEventListener.mock.calls.filter(
      ([event]) => event === 'click'
    );
    expect(clickCalls).toHaveLength(1);
  });
});
