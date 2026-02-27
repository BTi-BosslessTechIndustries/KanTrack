/***********************
 * CONTEXT MENU UTILITY
 * Shared context menu creation for quick menus
 ***********************/

// Track active menu for cleanup
let activeMenu = null;
let activeCloseHandler = null;

/**
 * Create and show a context menu near a button
 * @param {Object} options - Menu configuration
 * @param {HTMLElement} options.anchorElement - Element to position menu near
 * @param {string} options.menuClass - CSS class for the menu
 * @param {Array} options.items - Menu items: [{label, value, color?, active?, onClick}]
 * @param {Function} options.onSelect - Callback when item selected (receives value)
 * @param {boolean} options.closeOnSelect - Whether to close menu on selection (default: true)
 */
export function showContextMenu(options) {
  const {
    anchorElement,
    menuClass = 'context-quick-menu',
    items = [],
    onSelect,
    closeOnSelect = true
  } = options;

  // Remove any existing menu
  closeActiveMenu();

  // Create menu
  const menu = document.createElement('div');
  menu.classList.add(menuClass);

  // Create menu items
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.textContent = item.label;

    if (item.color) {
      btn.style.borderColor = item.color;
      btn.style.color = item.color;
    }

    if (item.active) {
      btn.classList.add('active');
    }

    btn.onclick = (e) => {
      e.stopPropagation();

      if (item.onClick) {
        item.onClick(item.value, e);
      }

      if (onSelect) {
        onSelect(item.value);
      }

      if (closeOnSelect) {
        closeActiveMenu();
      }
    };

    menu.appendChild(btn);
  });

  // Position menu near the anchor element
  const rect = anchorElement.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 5}px`;
  menu.style.left = `${rect.left}px`;

  document.body.appendChild(menu);
  activeMenu = menu;

  // Adjust position if menu goes off screen
  requestAnimationFrame(() => {
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust horizontal position
    if (menuRect.right > viewportWidth - 10) {
      menu.style.left = `${viewportWidth - menuRect.width - 10}px`;
    }

    // Adjust vertical position
    if (menuRect.bottom > viewportHeight - 10) {
      menu.style.top = `${rect.top - menuRect.height - 5}px`;
    }
  });

  // Setup close handler
  activeCloseHandler = (e) => {
    if (!menu.contains(e.target) && !anchorElement.contains(e.target)) {
      closeActiveMenu();
    }
  };

  // Delay adding listener to prevent immediate close
  setTimeout(() => {
    document.addEventListener('click', activeCloseHandler);
    document.addEventListener('touchend', activeCloseHandler);
  }, 100);

  return menu;
}

/**
 * Close the currently active menu
 */
export function closeActiveMenu() {
  if (activeMenu && activeMenu.parentNode) {
    activeMenu.parentNode.removeChild(activeMenu);
  }
  activeMenu = null;

  if (activeCloseHandler) {
    document.removeEventListener('click', activeCloseHandler);
    document.removeEventListener('touchend', activeCloseHandler);
    activeCloseHandler = null;
  }
}

/**
 * Check if a menu is currently open
 */
export function isMenuOpen() {
  return activeMenu !== null;
}
