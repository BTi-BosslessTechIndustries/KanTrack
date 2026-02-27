/***********************
 * LOADING STATES
 * Loading overlays and progress indicators
 ***********************/

let loadingOverlay = null;
let loadingCount = 0;

/**
 * Create loading overlay if it doesn't exist
 */
function getLoadingOverlay() {
  if (!loadingOverlay) {
    loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loadingOverlay';
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading...</div>
        <div class="loading-progress" style="display: none;">
          <div class="loading-progress-bar"></div>
        </div>
      </div>
    `;
    document.body.appendChild(loadingOverlay);
  }
  return loadingOverlay;
}

/**
 * Show loading overlay
 * @param {string} message - Loading message to display
 */
export function showLoading(message = 'Loading...') {
  loadingCount++;
  const overlay = getLoadingOverlay();
  const textEl = overlay.querySelector('.loading-text');

  if (textEl) {
    textEl.textContent = message;
  }

  overlay.classList.add('loading-visible');
}

/**
 * Hide loading overlay
 */
export function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);

  if (loadingCount === 0 && loadingOverlay) {
    loadingOverlay.classList.remove('loading-visible');

    // Reset progress bar
    const progressBar = loadingOverlay.querySelector('.loading-progress');
    const progressFill = loadingOverlay.querySelector('.loading-progress-bar');
    if (progressBar) progressBar.style.display = 'none';
    if (progressFill) progressFill.style.width = '0%';
  }
}

/**
 * Force hide loading overlay (resets count)
 */
export function forceHideLoading() {
  loadingCount = 0;
  if (loadingOverlay) {
    loadingOverlay.classList.remove('loading-visible');
  }
}

/**
 * Update loading message
 * @param {string} message - New message to display
 */
export function updateLoadingMessage(message) {
  const overlay = getLoadingOverlay();
  const textEl = overlay.querySelector('.loading-text');
  if (textEl) {
    textEl.textContent = message;
  }
}

/**
 * Show loading with progress bar
 * @param {string} message - Loading message
 * @param {number} progress - Progress percentage (0-100)
 */
export function showLoadingWithProgress(message, progress = 0) {
  loadingCount++;
  const overlay = getLoadingOverlay();
  const textEl = overlay.querySelector('.loading-text');
  const progressBar = overlay.querySelector('.loading-progress');
  const progressFill = overlay.querySelector('.loading-progress-bar');

  if (textEl) textEl.textContent = message;
  if (progressBar) progressBar.style.display = 'block';
  if (progressFill) progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;

  overlay.classList.add('loading-visible');
}

/**
 * Update progress bar
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} message - Optional message update
 */
export function updateProgress(progress, message) {
  const overlay = getLoadingOverlay();
  const progressFill = overlay.querySelector('.loading-progress-bar');
  const textEl = overlay.querySelector('.loading-text');

  if (progressFill) {
    progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  }

  if (message && textEl) {
    textEl.textContent = message;
  }
}

/**
 * Create inline save indicator
 * @param {HTMLElement} container - Container to show indicator in
 * @returns {Object} Controller with show/hide/update methods
 */
export function createSaveIndicator(container) {
  const indicator = document.createElement('span');
  indicator.className = 'save-indicator';
  indicator.textContent = 'Saved';

  return {
    show(text = 'Saving...') {
      indicator.textContent = text;
      indicator.classList.add('save-indicator-visible');
      if (!container.contains(indicator)) {
        container.appendChild(indicator);
      }
    },

    saved() {
      indicator.textContent = 'Saved';
      indicator.classList.add('save-indicator-success');

      setTimeout(() => {
        indicator.classList.remove('save-indicator-visible', 'save-indicator-success');
      }, 2000);
    },

    hide() {
      indicator.classList.remove('save-indicator-visible', 'save-indicator-success');
    },

    error(text = 'Save failed') {
      indicator.textContent = text;
      indicator.classList.add('save-indicator-error');

      setTimeout(() => {
        indicator.classList.remove('save-indicator-visible', 'save-indicator-error');
      }, 3000);
    }
  };
}
