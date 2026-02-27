/***********************
 * UTILITY FUNCTIONS
 ***********************/

// Debug flag - set to false for production
export const DEBUG = false;

// Column name mapping (centralized)
export const COLUMN_NAMES = {
  todo: 'To Do',
  inProgress: 'In Progress',
  done: 'Done',
  onHold: 'On Hold'
};

export function getColumnName(columnId) {
  switch (columnId) {
    case 'todo': return 'To Do';
    case 'inProgress': return 'In Progress';
    case 'done': return 'Done';
    case 'onHold': return 'On Hold';
    default: return '';
  }
}

export function getCurrentDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[s]));
}

export function formatTime(minutes) {
  if (minutes < 60) {
    return `${minutes}m`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}

export function getFirstLine(html) {
  if (!html) return 'No additional notes';
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const text = tempDiv.textContent || '';
  const textTrimmed = text.trim();

  if (textTrimmed) {
    return textTrimmed;
  }

  const hasImages = tempDiv.querySelectorAll('img').length > 0;
  if (hasImages) {
    return 'Image attached';
  }

  return 'No additional notes';
}

export function getTextPreview(html) {
  if (!html) return '';
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  return tempDiv.textContent || '';
}

export function getImageDimensions(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve({ width: 150, height: 100 });
    };
    img.src = src;
  });
}

/**
 * Create a debounced version of a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Create a throttled version of a function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} Throttled function
 */
export function throttle(func, limit = 100) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Deep clone an object (simple version for JSON-serializable data)
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    return obj;
  }
}

/**
 * Sanitize filename for downloads
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
export function sanitizeFilename(filename) {
  return String(filename)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}

/**
 * Check if we're on a touch device
 * @returns {boolean}
 */
export function isTouchDevice() {
  return 'ontouchstart' in window ||
         navigator.maxTouchPoints > 0 ||
         navigator.msMaxTouchPoints > 0;
}

/**
 * Get the max input length for titles
 */
export const MAX_TITLE_LENGTH = 200;

/**
 * Get the max input length for notes
 */
export const MAX_NOTE_LENGTH = 50000;

/**
 * Validate and truncate title
 */
export function validateTitle(title) {
  const trimmed = String(title || '').trim();
  return trimmed.substring(0, MAX_TITLE_LENGTH);
}

/**
 * Log debug message (only in debug mode)
 */
export function debugLog(...args) {
  if (DEBUG) {
    console.log('[KanTrack Debug]', ...args);
  }
}

/**
 * Log warning (only in debug mode)
 */
export function debugWarn(...args) {
  if (DEBUG) {
    console.warn('[KanTrack Warning]', ...args);
  }
}
