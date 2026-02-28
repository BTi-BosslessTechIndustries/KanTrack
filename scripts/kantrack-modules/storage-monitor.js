/***********************
 * STORAGE MONITOR
 * Calm, non-alarming storage quota monitoring.
 * No external libraries. No toast popups. No alarming red warnings.
 ***********************/
import { idbPut } from './database.js';
import { debugWarn } from './utils.js';

/**
 * Request durable storage permission from the browser.
 * Called once at startup — silent background operation.
 * Persisted result is stored in the meta IDB store.
 */
export async function requestDurableStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    const granted = await navigator.storage.persist();
    await idbPut('meta', { key: 'durableStorageGranted', value: granted, checkedAt: Date.now() });
  } catch (e) {
    debugWarn('Durable storage request failed (non-fatal):', e);
  }
}

/**
 * Check storage quota and show a calm informational message
 * in the settings panel if usage is getting high.
 * Thresholds:
 *   < 70%  — no message
 *   70–85% — "Storage is getting full. Consider exporting a backup."
 *   85%+   — "Storage is nearly full. Export a backup to avoid losing recent changes."
 */
export async function initStorageMonitor() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return;

    const { usage, quota } = await navigator.storage.estimate();
    if (!quota || quota === 0) return;

    const percentage = Math.round((usage / quota) * 100);

    // Store last check in meta
    await idbPut('meta', {
      key: 'lastStorageCheck',
      value: { usage, quota, percentage, checkedAt: Date.now() },
    });

    // Only show messages at 70%+
    if (percentage < 70) return;

    const message =
      percentage >= 85
        ? 'Storage is nearly full. Export a backup to avoid losing recent changes.'
        : 'Storage is getting full. Consider exporting a backup.';

    // Display in settings panel only — calm, informational
    const storageInfoEl = document.getElementById('storageMonitorInfo');
    if (storageInfoEl) {
      storageInfoEl.textContent = message;
      storageInfoEl.style.display = 'block';
    }
  } catch (e) {
    debugWarn('Storage monitor check failed (non-fatal):', e);
  }
}
