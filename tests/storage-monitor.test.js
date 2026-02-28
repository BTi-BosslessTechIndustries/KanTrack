/**
 * Tests for storage-monitor.js — requestDurableStorage + initStorageMonitor.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetLocalStorage } from './setup.js';

vi.mock('../scripts/kantrack-modules/notifications.js', () => ({
  showError: vi.fn(),
  showWarning: vi.fn(),
  showNotification: vi.fn(),
  showSuccess: vi.fn(),
}));

import { initIndexedDB, idbGet } from '../scripts/kantrack-modules/database.js';
import {
  requestDurableStorage,
  initStorageMonitor,
} from '../scripts/kantrack-modules/storage-monitor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake navigator.storage.estimate() that returns a given usage ratio. */
function mockEstimate(usageRatio) {
  const quota = 10_000_000;
  const usage = Math.round(quota * usageRatio);
  return vi.fn(async () => ({ usage, quota }));
}

/** Return a minimal element stub that records what was written to it. */
function makeFakeElement() {
  return {
    textContent: '',
    style: { display: '' },
  };
}

// ---------------------------------------------------------------------------
// Fresh DB before every test
// ---------------------------------------------------------------------------
/** Overwrite navigator.storage in a way that works with the read-only global. */
function setNavigatorStorage(storage) {
  Object.defineProperty(global, 'navigator', {
    value: { ...global.navigator, storage },
    writable: true,
    configurable: true,
  });
}

beforeEach(async () => {
  global.indexedDB = new IDBFactory();
  resetLocalStorage();
  await initIndexedDB();

  // Restore navigator.storage to clean defaults between tests
  setNavigatorStorage({
    persist: vi.fn(async () => true),
    estimate: mockEstimate(0.05), // 5% — well below every threshold
  });
});

// ---------------------------------------------------------------------------
// requestDurableStorage
// ---------------------------------------------------------------------------
describe('requestDurableStorage', () => {
  it('writes durableStorageGranted=true to meta when persist() returns true', async () => {
    setNavigatorStorage({ persist: vi.fn(async () => true), estimate: mockEstimate(0.05) });

    await requestDurableStorage();

    const meta = await idbGet('meta', 'durableStorageGranted');
    expect(meta?.value).toBe(true);
    expect(meta).toHaveProperty('checkedAt');
  });

  it('writes durableStorageGranted=false to meta when persist() returns false', async () => {
    setNavigatorStorage({ persist: vi.fn(async () => false), estimate: mockEstimate(0.05) });

    await requestDurableStorage();

    const meta = await idbGet('meta', 'durableStorageGranted');
    expect(meta?.value).toBe(false);
  });

  it('does not throw when navigator.storage is unavailable', async () => {
    setNavigatorStorage(undefined);
    await expect(requestDurableStorage()).resolves.toBeUndefined();
  });

  it('does not throw when persist() rejects', async () => {
    setNavigatorStorage({
      persist: vi.fn(async () => {
        throw new Error('denied');
      }),
      estimate: mockEstimate(0.05),
    });
    await expect(requestDurableStorage()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// initStorageMonitor — IDB persistence
// ---------------------------------------------------------------------------
describe('initStorageMonitor — IDB persistence', () => {
  it('writes lastStorageCheck to meta IDB store', async () => {
    setNavigatorStorage({ persist: vi.fn(async () => true), estimate: mockEstimate(0.5) }); // 50%

    await initStorageMonitor();

    const meta = await idbGet('meta', 'lastStorageCheck');
    expect(meta?.value).toBeDefined();
    expect(meta.value).toHaveProperty('usage');
    expect(meta.value).toHaveProperty('quota');
    expect(meta.value).toHaveProperty('percentage');
    expect(meta.value).toHaveProperty('checkedAt');
  });

  it('does not throw when navigator.storage is unavailable', async () => {
    setNavigatorStorage(undefined);
    await expect(initStorageMonitor()).resolves.toBeUndefined();
  });

  it('does not throw when estimate() rejects', async () => {
    setNavigatorStorage({
      persist: vi.fn(async () => true),
      estimate: vi.fn(async () => {
        throw new Error('quota unavailable');
      }),
    });
    await expect(initStorageMonitor()).resolves.toBeUndefined();
  });

  it('does nothing when quota is 0 (edge case)', async () => {
    setNavigatorStorage({
      persist: vi.fn(async () => true),
      estimate: vi.fn(async () => ({ usage: 0, quota: 0 })),
    });
    await expect(initStorageMonitor()).resolves.toBeUndefined();
    const meta = await idbGet('meta', 'lastStorageCheck');
    expect(meta).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// initStorageMonitor — threshold + message logic
// ---------------------------------------------------------------------------
describe('initStorageMonitor — threshold behaviour', () => {
  it('shows no message when usage is below 70%', async () => {
    setNavigatorStorage({ persist: vi.fn(async () => true), estimate: mockEstimate(0.6) }); // 60%

    const fakeEl = makeFakeElement();
    global.document = {
      ...global.document,
      getElementById: vi.fn(id => (id === 'storageMonitorInfo' ? fakeEl : null)),
    };

    await initStorageMonitor();

    // Element should not have been written to
    expect(fakeEl.textContent).toBe('');
    expect(fakeEl.style.display).toBe('');
  });

  it('shows "getting full" message at exactly 70%', async () => {
    setNavigatorStorage({ persist: vi.fn(async () => true), estimate: mockEstimate(0.7) }); // 70%

    const fakeEl = makeFakeElement();
    global.document = {
      ...global.document,
      getElementById: vi.fn(id => (id === 'storageMonitorInfo' ? fakeEl : null)),
    };

    await initStorageMonitor();

    expect(fakeEl.textContent).toBe('Storage is getting full. Consider exporting a backup.');
    expect(fakeEl.style.display).toBe('block');
  });

  it('shows "getting full" message at 80% (between 70 and 85)', async () => {
    setNavigatorStorage({ persist: vi.fn(async () => true), estimate: mockEstimate(0.8) }); // 80%

    const fakeEl = makeFakeElement();
    global.document = {
      ...global.document,
      getElementById: vi.fn(id => (id === 'storageMonitorInfo' ? fakeEl : null)),
    };

    await initStorageMonitor();

    expect(fakeEl.textContent).toBe('Storage is getting full. Consider exporting a backup.');
  });

  it('shows "nearly full" message at exactly 85%', async () => {
    setNavigatorStorage({ persist: vi.fn(async () => true), estimate: mockEstimate(0.85) }); // 85%

    const fakeEl = makeFakeElement();
    global.document = {
      ...global.document,
      getElementById: vi.fn(id => (id === 'storageMonitorInfo' ? fakeEl : null)),
    };

    await initStorageMonitor();

    expect(fakeEl.textContent).toBe(
      'Storage is nearly full. Export a backup to avoid losing recent changes.'
    );
    expect(fakeEl.style.display).toBe('block');
  });

  it('shows "nearly full" message at 95%', async () => {
    setNavigatorStorage({ persist: vi.fn(async () => true), estimate: mockEstimate(0.95) }); // 95%

    const fakeEl = makeFakeElement();
    global.document = {
      ...global.document,
      getElementById: vi.fn(id => (id === 'storageMonitorInfo' ? fakeEl : null)),
    };

    await initStorageMonitor();

    expect(fakeEl.textContent).toBe(
      'Storage is nearly full. Export a backup to avoid losing recent changes.'
    );
  });

  it('does not touch the DOM when the storageMonitorInfo element is absent', async () => {
    setNavigatorStorage({ persist: vi.fn(async () => true), estimate: mockEstimate(0.9) }); // 90% — would show message

    global.document = { ...global.document, getElementById: vi.fn(() => null) };

    // Should resolve cleanly without throwing
    await expect(initStorageMonitor()).resolves.toBeUndefined();
  });
});
