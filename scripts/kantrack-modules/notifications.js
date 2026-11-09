/***********************
 * NOTIFICATIONS SYSTEM
 * User-friendly error and status notifications
 ***********************/
import { t } from './i18n.js';

// Notification types and their styles
const NOTIFICATION_TYPES = {
  success: {
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    className: 'notification-success',
  },
  error: {
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    className: 'notification-error',
  },
  warning: {
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    className: 'notification-warning',
  },
  info: {
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    className: 'notification-info',
  },
};

// Create notification container if it doesn't exist
function getNotificationContainer() {
  let container = document.getElementById('notificationContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notificationContainer';
    container.className = 'notification-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a notification to the user
 * @param {string} message - The message to display
 * @param {string} type - Type: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in ms (0 = permanent until dismissed)
 */
export function showNotification(message, type = 'info', duration = 4000) {
  const container = getNotificationContainer();
  const config = NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.info;

  const notification = document.createElement('div');
  notification.className = `notification ${config.className}`;

  notification.innerHTML = `
    <span class="notification-icon">${config.icon}</span>
    <span class="notification-message">${escapeHtml(message)}</span>
    <button class="notification-close" aria-label="Close">&times;</button>
  `;

  // Add close button handler
  const closeBtn = notification.querySelector('.notification-close');
  closeBtn.onclick = () => dismissNotification(notification);

  // Add to container
  container.appendChild(notification);

  // Trigger animation
  requestAnimationFrame(() => {
    notification.classList.add('notification-show');
  });

  // Auto-dismiss after duration (if not permanent)
  if (duration > 0) {
    setTimeout(() => dismissNotification(notification), duration);
  }

  return notification;
}

/**
 * Dismiss a notification
 */
function dismissNotification(notification) {
  if (!notification || !notification.parentNode) return;

  notification.classList.remove('notification-show');
  notification.classList.add('notification-hide');

  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300);
}

/**
 * Show a success notification
 */
export function showSuccess(message, duration = 3000) {
  return showNotification(message, 'success', duration);
}

/**
 * Show an error notification
 */
export function showError(message, duration = 5000) {
  return showNotification(message, 'error', duration);
}

/**
 * Show a warning notification
 */
export function showWarning(message, duration = 4000) {
  return showNotification(message, 'warning', duration);
}

/**
 * Show an info notification
 */
export function showInfo(message, duration = 4000) {
  return showNotification(message, 'info', duration);
}

// Helper function (duplicated here to avoid circular dependency)
function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    s =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[s]
  );
}

// KanTrack's localStorage keys
const KANTRACK_STORAGE_KEYS = [
  'kanbanNotes',
  'notebookItems',
  'permanentNotes',
  'kanbanClocks',
  'kanban-tags',
  'kantrackTrash',
  'notebookSidebarWidth',
];

/**
 * Check localStorage usage and warn if approaching limit
 * Only counts KanTrack's own keys, not other apps on the same domain
 * @returns {object} Storage info with used, total, and percentage
 */
export function checkStorageQuota() {
  let totalSize = 0;

  try {
    for (const key of KANTRACK_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value) {
        totalSize += value.length * 2; // UTF-16 = 2 bytes per char
      }
    }
  } catch (e) {
    // Ignore errors during calculation
  }

  const totalBytes = totalSize;
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
  const limitMB = 5; // Most browsers limit to 5MB
  const percentage = ((totalBytes / (limitMB * 1024 * 1024)) * 100).toFixed(1);

  return {
    usedBytes: totalBytes,
    usedMB: parseFloat(totalMB),
    limitMB: limitMB,
    percentage: parseFloat(percentage),
  };
}

/**
 * Show storage warning if usage is high
 */
export function warnIfStorageHigh() {
  const quota = checkStorageQuota();

  if (quota.percentage >= 90) {
    showWarning(t('storage.notify.almostFull', { percentage: quota.percentage }), 6000);
  } else if (quota.percentage >= 75) {
    showInfo(t('storage.notify.usage', { percentage: quota.percentage }), 3000);
  }
}

/**
 * Get detailed storage breakdown for diagnostics
 * @returns {object} Breakdown of storage usage by key
 */
export function getStorageBreakdown() {
  const breakdown = {};
  let total = 0;

  for (const key of KANTRACK_STORAGE_KEYS) {
    const value = localStorage.getItem(key);
    if (value) {
      const bytes = value.length * 2;
      breakdown[key] = {
        bytes: bytes,
        kb: (bytes / 1024).toFixed(2),
        mb: (bytes / (1024 * 1024)).toFixed(3),
      };
      total += bytes;
    }
  }

  breakdown._total = {
    bytes: total,
    kb: (total / 1024).toFixed(2),
    mb: (total / (1024 * 1024)).toFixed(2),
  };

  return breakdown;
}

/**
 * Log storage diagnostics to console
 */
export function logStorageDiagnostics() {
  const breakdown = getStorageBreakdown();
  console.group('KanTrack Storage Diagnostics');
  console.log('Storage breakdown by key:');
  for (const [key, info] of Object.entries(breakdown)) {
    if (key !== '_total') {
      console.log(`  ${key}: ${info.kb} KB`);
    }
  }
  console.log(`Total: ${breakdown._total.mb} MB`);
  console.groupEnd();
  return breakdown;
}
