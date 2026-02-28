/**
 * Global test setup — runs once before all test files.
 * Installs browser API stubs needed by KanTrack modules in Node.js.
 */
import 'fake-indexeddb/auto';

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------
let _lsStore = {};

global.localStorage = {
  getItem: key => (Object.prototype.hasOwnProperty.call(_lsStore, key) ? _lsStore[key] : null),
  setItem: (key, value) => {
    _lsStore[key] = String(value);
  },
  removeItem: key => {
    delete _lsStore[key];
  },
  clear: () => {
    _lsStore = {};
  },
  get length() {
    return Object.keys(_lsStore).length;
  },
  key: i => Object.keys(_lsStore)[i] ?? null,
};

// Called from beforeEach in each test file to get a clean slate
export function resetLocalStorage() {
  _lsStore = {};
}

// ---------------------------------------------------------------------------
// CustomEvent (used in undo.js for window.dispatchEvent)
// ---------------------------------------------------------------------------
global.CustomEvent = class CustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail ?? {};
  }
};

// ---------------------------------------------------------------------------
// window stub
// ---------------------------------------------------------------------------
global.window = {
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

// ---------------------------------------------------------------------------
// document stub (initUndo registers keyboard listener; storage-monitor reads DOM)
// ---------------------------------------------------------------------------
global.document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById: () => null, // overridden per-test in storage-monitor tests
  body: { appendChild: () => {} },
  createElement: () => ({
    // minimal stub for notifications.js (if not mocked)
    className: '',
    id: '',
    textContent: '',
    innerHTML: '',
    appendChild: () => {},
    remove: () => {},
    addEventListener: () => {},
  }),
};

// ---------------------------------------------------------------------------
// navigator.storage stub (used by storage-monitor.js)
// global.navigator is a read-only getter in Node/Vitest — use defineProperty.
// ---------------------------------------------------------------------------
Object.defineProperty(global, 'navigator', {
  value: {
    storage: {
      persist: async () => true,
      estimate: async () => ({ usage: 500_000, quota: 10_000_000 }),
    },
  },
  writable: true,
  configurable: true,
});
