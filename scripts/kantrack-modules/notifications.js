/***********************
 * NOTIFICATIONS SYSTEM
 * User-friendly error and status notifications
 ***********************/

// Notification types and their styles
const NOTIFICATION_TYPES = {
  success: { icon: '✓', className: 'notification-success' },
  error: { icon: '✕', className: 'notification-error' },
  warning: { icon: '⚠', className: 'notification-warning' },
  info: { icon: 'ℹ', className: 'notification-info' }
};

// Create notification container if it doesn't exist
function getNotificationContainer() {
  let container = document.getElementById('notificationContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notificationContainer';
    container.className = 'notification-container';
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
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[s]));
}

// KanTrack's localStorage keys
const KANTRACK_STORAGE_KEYS = [
  'kanbanNotes',
  'notebookItems',
  'permanentNotes',
  'kanbanClocks',
  'kanban-tags',
  'kantrackTrash',
  'notebookSidebarOpen',
  'notebookSidebarWidth'
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
    percentage: parseFloat(percentage)
  };
}

/**
 * Show storage warning if usage is high
 */
export function warnIfStorageHigh() {
  const quota = checkStorageQuota();

  if (quota.percentage >= 90) {
    showWarning(`Storage almost full (${quota.percentage}%). Consider exporting and deleting old tasks.`, 6000);
  } else if (quota.percentage >= 75) {
    showInfo(`Storage usage: ${quota.percentage}%`, 3000);
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
        mb: (bytes / (1024 * 1024)).toFixed(3)
      };
      total += bytes;
    }
  }

  breakdown._total = {
    bytes: total,
    kb: (total / 1024).toFixed(2),
    mb: (total / (1024 * 1024)).toFixed(2)
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
