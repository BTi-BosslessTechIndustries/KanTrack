/***********************
 * NOTEBOOK SIDEBAR SYSTEM
 ***********************/
import {
  notebookItems,
  currentPageId,
  contextMenuTargetId,
  notebookSidebarOpen,
  pageHasChanges,
  notebookDraggedItem,
  setNotebookItems,
  setCurrentPageId,
  setContextMenuTargetId,
  setNotebookSidebarOpen,
  setPageHasChanges,
  setNotebookDraggedItem,
  pushToNotebookItems,
} from './state.js';
import { saveNotebookToLocalStorage } from './storage.js';
import { getUIPref, setUIPref, getNotebookItemContent } from './repository.js';
import { storeNotebookImage, getNotebookImage, deletePageImages } from './database.js';
import { openImageViewer } from './images.js';
import { initMentionHandler, setOpenPageModal } from './mentions.js';
import { exportFolderAsZip } from './notebook-export.js';
import { sanitizeHTML } from './sanitize.js';
import { createFocusTrap } from './utils.js';

/***********************
 * SIDEBAR UI
 ***********************/
export function toggleNotebookSidebar() {
  setNotebookSidebarOpen(!notebookSidebarOpen);
  const sidebar = document.getElementById('notebookSidebar');
  const toggleBtn = document.querySelector('.notebook-toggle-btn');

  if (notebookSidebarOpen) {
    sidebar.classList.add('open');
    toggleBtn.classList.add('active');
    document.body.classList.add('notebook-sidebar-open');
  } else {
    sidebar.classList.remove('open');
    toggleBtn.classList.remove('active');
    document.body.classList.remove('notebook-sidebar-open');
  }

  // Persist sidebar state
  setUIPref('notebookSidebarOpen', notebookSidebarOpen);
}

export function setupSidebarResize() {
  const resizeHandle = document.getElementById('notebookSidebarResize');
  const sidebar = document.getElementById('notebookSidebar');
  if (!resizeHandle || !sidebar) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  const startResize = e => {
    isResizing = true;
    startX = e.clientX || e.touches[0].clientX;
    startWidth = sidebar.offsetWidth;

    resizeHandle.classList.add('resizing');
    sidebar.classList.add('resizing');
    document.body.classList.add('sidebar-resizing');

    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', doResize);
    document.addEventListener('touchend', stopResize);

    e.preventDefault();
  };

  const doResize = e => {
    if (!isResizing) return;

    const clientX = e.clientX || e.touches[0].clientX;
    const delta = clientX - startX;
    let newWidth = startWidth + delta;

    // Clamp between min and max
    newWidth = Math.max(200, Math.min(600, newWidth));

    document.documentElement.style.setProperty('--notebook-sidebar-width', `${newWidth}px`);
  };

  const stopResize = () => {
    if (!isResizing) return;

    isResizing = false;
    resizeHandle.classList.remove('resizing');
    sidebar.classList.remove('resizing');
    document.body.classList.remove('sidebar-resizing');

    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
    document.removeEventListener('touchmove', doResize);
    document.removeEventListener('touchend', stopResize);

    // Save the width
    const currentWidth = getComputedStyle(document.documentElement).getPropertyValue(
      '--notebook-sidebar-width'
    );
    setUIPref('notebookSidebarWidth', currentWidth.trim());
  };

  resizeHandle.addEventListener('mousedown', startResize);
  resizeHandle.addEventListener('touchstart', startResize);
}

export function renderNotebookTree() {
  const treeContainer = document.getElementById('notebookTree');
  if (!treeContainer) return;

  treeContainer.innerHTML = '';

  const searchTerm = document.getElementById('notebookSearchInput')?.value.toLowerCase() || '';

  // Get root items (parentId === null)
  const rootItems = getChildItems(null);

  if (rootItems.length === 0 && !searchTerm) {
    treeContainer.innerHTML =
      '<div class="notebook-tree-empty">No items yet. Click the folder or page icon above to create one.</div>';
    return;
  }

  // Render tree recursively
  rootItems.forEach(item => {
    renderTreeItem(treeContainer, item, 0, searchTerm);
  });
}

function renderTreeItem(container, item, level, searchTerm = '') {
  // Filter logic
  const matchesSearch = !searchTerm || item.name.toLowerCase().includes(searchTerm);
  const children = getChildItems(item.id);
  const hasMatchingChildren = children.some(
    child =>
      child.name.toLowerCase().includes(searchTerm) ||
      getChildItems(child.id).some(grandchild => grandchild.name.toLowerCase().includes(searchTerm))
  );

  // Skip if doesn't match and has no matching children
  if (searchTerm && !matchesSearch && !hasMatchingChildren) {
    return;
  }

  const itemEl = document.createElement('div');
  itemEl.classList.add('notebook-tree-item');
  itemEl.dataset.id = item.id;
  itemEl.dataset.type = item.type;
  itemEl.dataset.level = level;
  itemEl.draggable = true;

  // Expand arrow (only for folders)
  const expandEl = document.createElement('div');
  expandEl.classList.add('tree-item-expand');
  if (item.type === 'folder') {
    if (item.expanded) {
      expandEl.classList.add('expanded');
    }
    expandEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
    expandEl.onclick = e => {
      e.stopPropagation();
      toggleFolderExpand(item.id);
    };
  } else {
    expandEl.classList.add('hidden');
  }
  itemEl.appendChild(expandEl);

  // Icon
  const iconEl = document.createElement('div');
  iconEl.classList.add('tree-item-icon', item.type);
  if (item.type === 'folder') {
    iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
  } else {
    iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
  }
  itemEl.appendChild(iconEl);

  // Name
  const nameEl = document.createElement('div');
  nameEl.classList.add('tree-item-name');
  nameEl.textContent = item.name;
  itemEl.appendChild(nameEl);

  // Double-click to rename
  nameEl.ondblclick = e => {
    e.stopPropagation();
    startInlineRename(item.id);
  };

  // Click to open page or select folder
  itemEl.onclick = () => {
    if (item.type === 'page') {
      openPageModal(item.id);
    } else {
      toggleFolderExpand(item.id);
    }
  };

  // Right-click context menu
  itemEl.oncontextmenu = e => {
    e.preventDefault();
    showContextMenu(e, item.id);
  };

  // Drag events
  itemEl.ondragstart = e => handleTreeDragStart(e, item);
  itemEl.ondragover = e => handleTreeDragOver(e, item);
  itemEl.ondrop = e => handleTreeDrop(e, item);
  itemEl.ondragend = handleTreeDragEnd;
  itemEl.ondragleave = handleTreeDragLeave;

  container.appendChild(itemEl);

  // Render children if folder is expanded
  if (item.type === 'folder' && (item.expanded || searchTerm)) {
    children.forEach(child => {
      renderTreeItem(container, child, level + 1, searchTerm);
    });
  }
}

export function getChildItems(parentId) {
  return notebookItems.filter(item => item.parentId === parentId).sort((a, b) => a.order - b.order);
}

/***********************
 * CRUD OPERATIONS
 ***********************/
export function createNotebookItem(type, parentId) {
  const timestamp = new Date().toISOString();
  const siblings = getChildItems(parentId);
  const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(s => s.order)) : -1;

  const newItem = {
    id: crypto.randomUUID(),
    type: type,
    parentId: parentId,
    name: type === 'folder' ? 'New Folder' : 'New Page',
    order: maxOrder + 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (type === 'folder') {
    newItem.expanded = true;
  } else {
    newItem.content = '';
    newItem.images = [];
  }

  pushToNotebookItems(newItem);
  saveNotebookToLocalStorage();

  // Expand parent folder if creating inside one
  if (parentId !== null) {
    const parent = notebookItems.find(i => i.id === parentId);
    if (parent && parent.type === 'folder') {
      parent.expanded = true;
      saveNotebookToLocalStorage();
    }
  }

  renderNotebookTree();

  // Start inline rename for new item
  setTimeout(() => {
    startInlineRename(newItem.id);
  }, 50);

  return newItem;
}

export function startInlineRename(itemId) {
  const itemEl = document.querySelector(`.notebook-tree-item[data-id="${itemId}"]`);
  if (!itemEl) return;

  const nameEl = itemEl.querySelector('.tree-item-name');
  if (!nameEl) return;

  const item = notebookItems.find(i => i.id === itemId);
  if (!item) return;

  nameEl.contentEditable = true;
  nameEl.classList.add('editing');
  nameEl.focus();

  // Select all text
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finishRename = () => {
    nameEl.contentEditable = false;
    nameEl.classList.remove('editing');
    const newName = nameEl.textContent.trim();
    if (newName && newName !== item.name) {
      renameNotebookItem(itemId, newName);
    } else {
      nameEl.textContent = item.name;
    }
  };

  nameEl.onblur = finishRename;
  nameEl.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameEl.blur();
    } else if (e.key === 'Escape') {
      nameEl.textContent = item.name;
      nameEl.blur();
    }
  };
}

export function renameNotebookItem(itemId, newName) {
  const item = notebookItems.find(i => i.id === itemId);
  if (!item) return;

  item.name = newName;
  item.updatedAt = new Date().toISOString();
  saveNotebookToLocalStorage();
  renderNotebookTree();
}

export async function deleteNotebookItem(itemId, skipConfirm = false) {
  const item = notebookItems.find(i => i.id === itemId);
  if (!item) return;

  // Get all descendants
  const getDescendants = parentId => {
    const children = notebookItems.filter(i => i.parentId === parentId);
    let descendants = [...children];
    children.forEach(child => {
      descendants = descendants.concat(getDescendants(child.id));
    });
    return descendants;
  };

  const descendants = getDescendants(itemId);
  const totalItems = 1 + descendants.length;

  if (!skipConfirm) {
    const message =
      item.type === 'folder' && descendants.length > 0
        ? `Delete "${item.name}" and ${descendants.length} item(s) inside it?`
        : `Delete "${item.name}"?`;

    if (!confirm(message)) {
      return;
    }
  }

  // Delete images for pages
  const pagesToDelete = [item, ...descendants].filter(i => i.type === 'page');
  for (const page of pagesToDelete) {
    await deletePageImages(page.id);
  }

  // Remove from array
  const idsToDelete = new Set([itemId, ...descendants.map(d => d.id)]);
  setNotebookItems(notebookItems.filter(i => !idsToDelete.has(i.id)));

  saveNotebookToLocalStorage();
  renderNotebookTree();
  hideContextMenu();
}

export function moveNotebookItem(itemId, newParentId, newOrder = null) {
  const item = notebookItems.find(i => i.id === itemId);
  if (!item) return;

  // Prevent moving a folder into itself or its descendants
  if (item.type === 'folder' && newParentId !== null) {
    const isDescendant = (parentId, targetId) => {
      if (parentId === targetId) return true;
      const children = notebookItems.filter(i => i.parentId === parentId);
      return children.some(child => isDescendant(child.id, targetId));
    };
    if (isDescendant(itemId, newParentId)) {
      return; // Can't move into own descendant
    }
  }

  // Update parent
  item.parentId = newParentId;

  // Update order
  if (newOrder !== null) {
    const siblings = getChildItems(newParentId).filter(i => i.id !== itemId);
    siblings.splice(newOrder, 0, item);
    siblings.forEach((sibling, index) => {
      sibling.order = index;
    });
  }

  item.updatedAt = new Date().toISOString();
  saveNotebookToLocalStorage();
  renderNotebookTree();
}

/***********************
 * FOLDER ACTIONS
 ***********************/
export function toggleFolderExpand(folderId) {
  const folder = notebookItems.find(i => i.id === folderId && i.type === 'folder');
  if (!folder) return;

  folder.expanded = !folder.expanded;
  saveNotebookToLocalStorage();
  renderNotebookTree();
}

export function expandToItem(itemId) {
  let item = notebookItems.find(i => i.id === itemId);
  if (!item) return;

  // Walk up the tree and expand all parent folders
  while (item.parentId !== null) {
    const parent = notebookItems.find(i => i.id === item.parentId);
    if (parent && parent.type === 'folder') {
      parent.expanded = true;
    }
    item = parent;
  }

  saveNotebookToLocalStorage();
  renderNotebookTree();
}

// Track last-opened page id for idle preload
let _lastOpenedPageId = null;

/***********************
 * PAGE MODAL
 ***********************/
let _pageModalTrap = null;
let _pageModalReturnFocus = null;

export async function openPageModal(pageId) {
  _pageModalReturnFocus = document.activeElement;
  const page = notebookItems.find(i => i.id === pageId && i.type === 'page');
  if (!page) return;

  setCurrentPageId(pageId);
  setPageHasChanges(false);

  const modal = document.getElementById('pageModal');
  const titleEl = document.getElementById('pageModalTitle');
  const editorEl = document.getElementById('pageEditor');

  titleEl.textContent = page.name;

  // Lazy-load content: use in-memory content if freshly saved, otherwise fetch from IDB
  const content = page.content != null ? page.content : await getNotebookItemContent(pageId);
  editorEl.innerHTML = sanitizeHTML(content);

  // Preload the next page we open on idle (warm the IDB cache)
  if (_lastOpenedPageId && _lastOpenedPageId !== pageId) {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => getNotebookItemContent(_lastOpenedPageId));
    }
  }
  _lastOpenedPageId = pageId;

  // Restore images from IndexedDB
  if (page.images && page.images.length > 0) {
    const images = editorEl.querySelectorAll('img');
    for (const img of images) {
      const imageId = img.dataset.imageId;
      if (imageId) {
        const dataUrl = await getNotebookImage(pageId, imageId);
        if (dataUrl) {
          img.src = dataUrl;
          img.onclick = () => openImageViewer(dataUrl);
        }
      }
    }
  }

  // Mark title changes
  titleEl.oninput = () => {
    setPageHasChanges(true);
  };

  // Setup clipboard paste for page editor
  setupPageClipboardPaste();

  modal.style.display = 'flex';
  _pageModalTrap = createFocusTrap(modal);
  _pageModalTrap.activate();
}

// Register openPageModal with mentions.js
setOpenPageModal(openPageModal);

export function closePageModal() {
  if (pageHasChanges) {
    if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
      return;
    }
  }

  _pageModalTrap?.deactivate();
  _pageModalTrap = null;
  const modal = document.getElementById('pageModal');
  modal.style.display = 'none';
  setCurrentPageId(null);
  setPageHasChanges(false);
  _pageModalReturnFocus?.focus();
  _pageModalReturnFocus = null;
}

export async function saveAndClosePage() {
  if (!currentPageId) return;

  const page = notebookItems.find(i => i.id === currentPageId);
  if (!page) return;

  const titleEl = document.getElementById('pageModalTitle');
  const editorEl = document.getElementById('pageEditor');

  // Update name
  const newName = titleEl.textContent.trim() || 'Untitled Page';
  page.name = newName;

  // Extract and save images to IndexedDB
  const images = editorEl.querySelectorAll('img');
  const imageIds = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imageId = img.dataset.imageId || `img_${crypto.randomUUID()}`;
    img.dataset.imageId = imageId;
    imageIds.push(imageId);

    if (img.src.startsWith('data:')) {
      await storeNotebookImage(currentPageId, imageId, img.src);
      // Keep original src in data-src for PDF export
      img.setAttribute('data-src', img.src);
      // Replace with placeholder to reduce localStorage size
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }
  }

  page.content = editorEl.innerHTML;
  page.images = imageIds;
  page.updatedAt = new Date().toISOString();

  saveNotebookToLocalStorage();
  renderNotebookTree();

  setPageHasChanges(false);
  const modal = document.getElementById('pageModal');
  modal.style.display = 'none';
  setCurrentPageId(null);
}

function setupPageClipboardPaste() {
  const editorEl = document.getElementById('pageEditor');
  if (!editorEl) return;

  // Initialize mention handler for notebook pages
  initMentionHandler(editorEl);

  // Mark changes on input
  editorEl.oninput = () => {
    setPageHasChanges(true);
  };

  // Prevent formatting shortcuts
  editorEl.onkeydown = e => {
    if (e.ctrlKey || e.metaKey) {
      const allowedKeys = ['c', 'v', 'x', 'a', 'z', 'y'];
      if (!allowedKeys.includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    }
  };

  editorEl.onpaste = async e => {
    const items = e.clipboardData.items;
    let hasImage = false;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        hasImage = true;
        e.preventDefault();
        setPageHasChanges(true);

        const blob = items[i].getAsFile();
        const reader = new FileReader();

        reader.onload = event => {
          const img = document.createElement('img');
          img.src = event.target.result;
          img.style.maxWidth = '100%';
          img.style.cursor = 'pointer';
          img.dataset.imageId = `img_${crypto.randomUUID()}`;
          img.onclick = () => openImageViewer(img.src);

          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(img);
            range.collapse(false);
          } else {
            editorEl.appendChild(img);
          }
        };

        reader.readAsDataURL(blob);
      }
    }

    if (!hasImage) {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');

      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      setPageHasChanges(true);
    }
  };
}

export async function deletePageFromModal() {
  if (!currentPageId) return;

  const page = notebookItems.find(i => i.id === currentPageId);
  if (!page) return;

  if (confirm(`Delete "${page.name}"?`)) {
    await deleteNotebookItem(currentPageId, true);
    setPageHasChanges(false);
    const modal = document.getElementById('pageModal');
    modal.style.display = 'none';
    setCurrentPageId(null);
  }
}

/***********************
 * CONTEXT MENU
 ***********************/
export function showContextMenu(e, itemId) {
  e.stopPropagation();

  const menu = document.getElementById('notebookContextMenu');
  if (!menu) return;

  setContextMenuTargetId(itemId);
  const item = notebookItems.find(i => i.id === itemId);
  if (!item) return;

  // Show/hide folder-only options
  const folderOnlyItems = menu.querySelectorAll('.folder-only');
  folderOnlyItems.forEach(el => {
    el.style.display = item.type === 'folder' ? 'flex' : 'none';
  });

  // Position menu initially
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  // Make visible first so we can measure
  menu.classList.add('visible');

  // Ensure menu stays within viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 10}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 10}px`;
  }
}

export function hideContextMenu() {
  const menu = document.getElementById('notebookContextMenu');
  if (menu) {
    menu.classList.remove('visible');
  }
  setContextMenuTargetId(null);
}

export function contextMenuAction(action) {
  if (!contextMenuTargetId) return;

  const targetId = contextMenuTargetId; // Save before hideContextMenu clears it
  const item = notebookItems.find(i => i.id === targetId);
  if (!item) {
    hideContextMenu();
    return;
  }

  switch (action) {
    case 'rename':
      hideContextMenu();
      setTimeout(() => startInlineRename(targetId), 50);
      break;
    case 'newFolder':
      createNotebookItem('folder', targetId);
      hideContextMenu();
      break;
    case 'newPage':
      createNotebookItem('page', targetId);
      hideContextMenu();
      break;
    case 'exportFolder':
      hideContextMenu();
      exportFolderAsZip(targetId);
      break;
    case 'delete':
      deleteNotebookItem(targetId);
      break;
  }
}

/***********************
 * DRAG & DROP
 ***********************/
function handleTreeDragStart(e, item) {
  setNotebookDraggedItem(item);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', item.id);

  // Add dragging class after a small delay
  setTimeout(() => {
    const el = document.querySelector(`.notebook-tree-item[data-id="${item.id}"]`);
    if (el) el.style.opacity = '0.5';
  }, 0);
}

function handleTreeDragOver(e, item) {
  e.preventDefault();
  if (!notebookDraggedItem || notebookDraggedItem.id === item.id) return;

  const el = e.currentTarget;

  // Clear all drag states
  document.querySelectorAll('.notebook-tree-item').forEach(i => {
    i.classList.remove('drag-over', 'drag-over-folder');
  });

  // If dropping on a folder, highlight it
  if (item.type === 'folder') {
    el.classList.add('drag-over-folder');
  } else {
    el.classList.add('drag-over');
  }
}

function handleTreeDragLeave(e) {
  e.currentTarget.classList.remove('drag-over', 'drag-over-folder');
}

function handleTreeDrop(e, targetItem) {
  e.preventDefault();

  // Clear all drag states
  document.querySelectorAll('.notebook-tree-item').forEach(i => {
    i.classList.remove('drag-over', 'drag-over-folder');
    i.style.opacity = '';
  });

  if (!notebookDraggedItem || notebookDraggedItem.id === targetItem.id) {
    setNotebookDraggedItem(null);
    return;
  }

  // Determine new parent and order
  if (targetItem.type === 'folder') {
    // Drop into folder
    moveNotebookItem(notebookDraggedItem.id, targetItem.id, 0);
    // Expand the target folder
    targetItem.expanded = true;
    saveNotebookToLocalStorage();
  } else {
    // Drop as sibling (before target)
    const targetIndex = getChildItems(targetItem.parentId).findIndex(i => i.id === targetItem.id);
    moveNotebookItem(notebookDraggedItem.id, targetItem.parentId, targetIndex);
  }

  setNotebookDraggedItem(null);
  renderNotebookTree();
}

function handleTreeDragEnd() {
  // Clear all drag states
  document.querySelectorAll('.notebook-tree-item').forEach(i => {
    i.classList.remove('drag-over', 'drag-over-folder');
    i.style.opacity = '';
  });
  setNotebookDraggedItem(null);
}

/***********************
 * SEARCH
 ***********************/
export function filterNotebookItems() {
  renderNotebookTree();
}

/***********************
 * NOTEBOOK IMPORT FROM ZIP
 ***********************/
export async function importNotebookFromZip(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const zip = await JSZip.loadAsync(file);

    // First, check if there's a notebook_data.json file (full data export)
    const dataFile = zip.file('notebook_data.json');
    if (dataFile) {
      await importFromNotebookData(dataFile);
      event.target.value = '';
      return;
    }

    // Fallback: Import from PDF files only (legacy/external ZIPs)
    const pdfFiles = [];
    zip.forEach((relativePath, zipEntry) => {
      if (relativePath.endsWith('.pdf') && !zipEntry.dir) {
        pdfFiles.push({
          path: relativePath,
          entry: zipEntry,
        });
      }
    });

    if (pdfFiles.length === 0) {
      alert('No notebook data or PDF files found in the ZIP.');
      event.target.value = '';
      return;
    }

    if (
      !confirm(
        `Found ${pdfFiles.length} PDF file(s). Import them as notebook pages?\n\nNote: Only file names will be imported. PDF content cannot be extracted.`
      )
    ) {
      event.target.value = '';
      return;
    }

    // Process each PDF file (legacy import)
    let importedCount = 0;
    const folderMap = new Map();

    for (const pdfFile of pdfFiles) {
      const pathParts = pdfFile.path.split('/');
      const fileName = pathParts.pop();

      let pageName = fileName;
      if (pageName.startsWith('Note_')) {
        pageName = pageName.substring(5);
      }
      if (pageName.endsWith('.pdf')) {
        pageName = pageName.slice(0, -4);
      }
      pageName = pageName.replace(/_/g, ' ');

      let parentId = null;
      let currentPath = '';

      for (const folderName of pathParts) {
        if (!folderName) continue;

        currentPath += (currentPath ? '/' : '') + folderName;

        if (!folderMap.has(currentPath)) {
          const existingFolder = notebookItems.find(
            i => i.type === 'folder' && i.name === folderName && i.parentId === parentId
          );

          if (existingFolder) {
            folderMap.set(currentPath, existingFolder.id);
            parentId = existingFolder.id;
          } else {
            const newFolder = {
              id: crypto.randomUUID(),
              type: 'folder',
              parentId: parentId,
              name: folderName,
              order: getChildItems(parentId).length,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              expanded: true,
            };
            pushToNotebookItems(newFolder);
            folderMap.set(currentPath, newFolder.id);
            parentId = newFolder.id;
          }
        } else {
          parentId = folderMap.get(currentPath);
        }
      }

      const timestamp = new Date().toISOString();
      const newPage = {
        id: crypto.randomUUID(),
        type: 'page',
        parentId: parentId,
        name: pageName,
        order: getChildItems(parentId).length,
        createdAt: timestamp,
        updatedAt: timestamp,
        content: `<p><em>Imported from: ${pdfFile.path}</em></p><p>Note: PDF content cannot be extracted in the browser. This page was created as a placeholder for the imported file.</p>`,
        images: [],
      };

      pushToNotebookItems(newPage);
      importedCount++;
    }

    saveNotebookToLocalStorage();
    renderNotebookTree();

    alert(`Successfully imported ${importedCount} page(s) to the notebook.`);
  } catch (err) {
    console.error('Import error:', err);
    alert('Error importing ZIP file: ' + err.message);
  }

  event.target.value = '';
}

// Import from notebook_data.json (full data with content)
async function importFromNotebookData(dataFile) {
  const jsonContent = await dataFile.async('string');
  const data = JSON.parse(jsonContent);

  if (!data.items || !Array.isArray(data.items)) {
    alert('Invalid notebook data file.');
    return;
  }

  const itemCount = data.items.length;
  const pageCount = data.items.filter(i => i.type === 'page').length;

  if (
    !confirm(
      `Found ${pageCount} page(s) and ${itemCount - pageCount} folder(s). Import them to your notebook?`
    )
  ) {
    return;
  }

  // Create ID mapping for new IDs
  const idMap = new Map();

  // First pass: create new IDs for all items
  for (const item of data.items) {
    const newId = crypto.randomUUID();
    idMap.set(item.id, newId);
  }

  // Second pass: create items with new IDs and updated parentIds
  for (const item of data.items) {
    const newItem = {
      ...item,
      id: idMap.get(item.id),
      parentId: item.parentId ? idMap.get(item.parentId) : null,
      order: item.order || 0,
    };

    // Restore images from embedded data
    if (item.type === 'page' && item.images && item.images.length > 0) {
      for (const img of item.images) {
        if (img.id && img.data) {
          await storeNotebookImage(newItem.id, img.id, img.data);
        }
      }
    }

    // Clean up images array (don't store data in localStorage)
    delete newItem.images;

    pushToNotebookItems(newItem);
  }

  saveNotebookToLocalStorage();
  renderNotebookTree();

  alert(`Successfully imported ${pageCount} page(s) to the notebook.`);
}

/***********************
 * EVENT LISTENERS SETUP
 ***********************/
export function setupNotebookEventListeners() {
  // Click outside to close context menu
  document.addEventListener('click', e => {
    const menu = document.getElementById('notebookContextMenu');
    if (menu && !menu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // Keyboard shortcut: Ctrl+B to toggle sidebar
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      toggleNotebookSidebar();
    }
  });

  // Restore sidebar state
  const savedSidebarState = getUIPref('notebookSidebarOpen', null);
  if (savedSidebarState === true || savedSidebarState === 'true') {
    toggleNotebookSidebar();
  }

  // Restore sidebar width
  const savedSidebarWidth = getUIPref('notebookSidebarWidth', null);
  if (savedSidebarWidth) {
    document.documentElement.style.setProperty('--notebook-sidebar-width', savedSidebarWidth);
  }

  // Sidebar resize functionality
  setupSidebarResize();

  // Touch support for tree items
  const treeContainer = document.getElementById('notebookTree');
  if (treeContainer) {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let longPressTimer = null;
    let touchedItem = null;

    treeContainer.addEventListener(
      'touchstart',
      e => {
        const itemEl = e.target.closest('.notebook-tree-item');
        if (!itemEl) return;

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        touchedItem = itemEl;

        // Long press for context menu
        longPressTimer = setTimeout(() => {
          const itemId = parseInt(itemEl.dataset.id);
          showContextMenu({ clientX: touchStartX, clientY: touchStartY }, itemId);
          touchedItem = null;
        }, 600);
      },
      { passive: true }
    );

    treeContainer.addEventListener(
      'touchmove',
      e => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      },
      { passive: true }
    );

    treeContainer.addEventListener(
      'touchend',
      e => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }

        if (!touchedItem) return;

        const touchDuration = Date.now() - touchStartTime;
        if (touchDuration < 300) {
          // Short tap - trigger click
          const itemId = touchedItem.dataset.id;
          const item = notebookItems.find(i => i.id === itemId);
          if (item) {
            if (item.type === 'page') {
              openPageModal(itemId);
            } else {
              toggleFolderExpand(itemId);
            }
          }
        }

        touchedItem = null;
      },
      { passive: true }
    );
  }

  // iOS touch support for page modal close
  const pageModal = document.getElementById('pageModal');
  if (pageModal) {
    const pageCloseBtn = pageModal.querySelector('.modal-close');
    if (pageCloseBtn) {
      pageCloseBtn.addEventListener('touchend', e => {
        e.preventDefault();
        closePageModal();
      });
    }

    pageModal.addEventListener('touchend', e => {
      if (e.target === pageModal) {
        e.preventDefault();
        closePageModal();
      }
    });
  }
}
