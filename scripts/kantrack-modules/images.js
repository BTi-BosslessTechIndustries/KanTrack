/***********************
 * IMAGE FUNCTIONS
 ***********************/
import * as state from './state.js';
import { initMentionHandler } from './mentions.js';
import { plainTextToFragment } from './utils.js';
import { initTableEditor, handleTablePaste, updateTableToolbar } from './table-editor.js';

export function setupClipboardPaste() {
  const notesEditor = document.getElementById('modalNotesEditor');
  if (!notesEditor) return;

  // Initialize mention handler for Kanban notes
  initMentionHandler(notesEditor);
  notesEditor.addEventListener('focus', () => updateClearNotesButton());
  notesEditor.addEventListener('blur', () => updateClearNotesButton());

  // Mark changes when notes are edited and show/hide toolbar
  notesEditor.addEventListener('input', () => {
    state.setModalHasChanges(true);
    updateClearNotesButton();
  });

  // Clicking the preview switches to edit mode
  const preview = document.getElementById('notesPreview');
  if (preview) {
    preview.addEventListener('click', () => {
      preview.style.display = 'none';
      notesEditor.style.display = '';
      notesEditor.focus();
    });
  }

  // Format buttons - use mousedown + preventDefault to keep editor selection intact
  document.getElementById('boldBtn')?.addEventListener('mousedown', e => {
    e.preventDefault();
    document.execCommand('bold');
  });
  document.getElementById('italicBtn')?.addEventListener('mousedown', e => {
    e.preventDefault();
    document.execCommand('italic');
  });
  document.getElementById('strikeBtn')?.addEventListener('mousedown', e => {
    e.preventDefault();
    document.execCommand('strikeThrough');
  });

  // Prevent any formatting keyboard shortcuts
  notesEditor.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) {
      // Allow only basic shortcuts: Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+Z, Ctrl+Y
      const allowedKeys = ['c', 'v', 'x', 'a', 'z', 'y'];
      if (!allowedKeys.includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    }
  });

  notesEditor.addEventListener('paste', async e => {
    e.preventDefault();

    const htmlData = e.clipboardData.getData('text/html');
    const plainText = e.clipboardData.getData('text/plain');

    // Table check runs first: spreadsheet apps (Numbers, Excel) put an image
    // preview on the clipboard alongside the actual cell data — we must not
    // treat that preview as a real image paste.
    const tableFrag = handleTablePaste(htmlData, plainText);
    if (tableFrag) {
      const after = document.createElement('p');
      after.appendChild(document.createElement('br'));
      tableFrag.appendChild(after);
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(tableFrag);
      } else {
        notesEditor.appendChild(tableFrag);
      }
      if (notesEditor.firstChild && notesEditor.firstChild.nodeName === 'TABLE') {
        const before = document.createElement('p');
        before.appendChild(document.createElement('br'));
        notesEditor.insertBefore(before, notesEditor.firstChild);
      }
      const newRange = document.createRange();
      newRange.setStart(after, 0);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
      state.setModalHasChanges(true);
      updateClearNotesButton();
      return;
    }

    // Check for a real image paste (screenshot, photo — no table data present)
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        state.setModalHasChanges(true);

        const blob = items[i].getAsFile();
        const reader = new FileReader();

        reader.onload = async event => {
          const img = document.createElement('img');
          img.src = event.target.result;
          img.style.maxWidth = '100%';
          img.style.cursor = 'pointer';
          img.dataset.imageId = `img_${Date.now()}_${i}`;

          img.onclick = () => openImageViewer(img.src);

          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(img);
            range.collapse(false);
          } else {
            notesEditor.appendChild(img);
          }

          updateClearNotesButton();
        };

        reader.readAsDataURL(blob);
        return;
      }
    }

    // Plain text fallback
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const fragment = plainTextToFragment(plainText);
      const lastNode = fragment.lastChild;
      range.insertNode(fragment);
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    state.setModalHasChanges(true);
    updateClearNotesButton();
  });

  initTableEditor(notesEditor);
}

export function updateClearNotesButton() {
  const notesEditor = document.getElementById('modalNotesEditor');
  const clearNotesBtn = document.getElementById('clearNotesBtn');
  const formatBtns = document.getElementById('notesFormatBtns');

  if (notesEditor && clearNotesBtn) {
    const hasTextContent = notesEditor.textContent.trim().length > 0;
    const hasImages = notesEditor.querySelectorAll('img').length > 0;
    const hasContent = notesEditor.innerHTML.trim() && (hasTextContent || hasImages);
    const isFocused = document.activeElement === notesEditor;
    clearNotesBtn.style.display = hasContent ? 'inline-block' : 'none';
    if (formatBtns) formatBtns.style.display = hasContent || isFocused ? 'flex' : 'none';
    updateTableToolbar();
  }
}

export function openImageViewer(imageSrc) {
  const modal = document.getElementById('imageModal');
  const img = document.getElementById('modalImage');
  const imageContainer = modal.querySelector('.image-container');
  const backButton = document.querySelector('.back-to-index');

  img.src = imageSrc;
  state.setImageZoomLevel(1);
  state.setImagePanOffset({ x: 0, y: 0 });
  updateImageTransform(img);
  modal.style.display = 'flex';
  if (backButton) backButton.style.display = 'none';

  // Add scroll wheel zoom
  imageContainer.onwheel = function (e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    zoomImage(delta);
  };

  // Click outside image to close
  imageContainer.onclick = function (e) {
    if (e.target === imageContainer) {
      closeImageModal();
    }
  };

  // Drag to pan when zoomed
  img.onmousedown = function (e) {
    if (state.imageZoomLevel > 1) {
      state.setIsDraggingImage(true);
      state.setDragStart({
        x: e.clientX - state.imagePanOffset.x,
        y: e.clientY - state.imagePanOffset.y,
      });
      img.style.cursor = 'grabbing';
      e.preventDefault();
    }
  };

  document.onmousemove = function (e) {
    if (state.isDraggingImage) {
      state.setImagePanOffset({
        x: e.clientX - state.dragStart.x,
        y: e.clientY - state.dragStart.y,
      });
      updateImageTransform(img);
    }
  };

  document.onmouseup = function () {
    if (state.isDraggingImage) {
      state.setIsDraggingImage(false);
      img.style.cursor = state.imageZoomLevel > 1 ? 'grab' : 'default';
    }
  };
}

export function updateImageTransform(img) {
  img.style.transform = `scale(${state.imageZoomLevel}) translate(${state.imagePanOffset.x / state.imageZoomLevel}px, ${state.imagePanOffset.y / state.imageZoomLevel}px)`;
  img.style.cursor = state.imageZoomLevel > 1 ? 'grab' : 'default';
}

export function closeImageModal() {
  const modal = document.getElementById('imageModal');
  const backButton = document.querySelector('.back-to-index');
  modal.style.display = 'none';
  if (backButton) backButton.style.display = 'block';
  state.setIsDraggingImage(false);
  state.setImagePanOffset({ x: 0, y: 0 });
  state.setImageZoomLevel(1);
}

export function zoomImage(delta) {
  let newZoom = state.imageZoomLevel + delta;
  newZoom = Math.max(0.5, Math.min(5, newZoom));
  state.setImageZoomLevel(newZoom);

  const img = document.getElementById('modalImage');

  // Reset pan if zooming back to 1 or less
  if (newZoom <= 1) {
    state.setImagePanOffset({ x: 0, y: 0 });
  }

  updateImageTransform(img);
}

export function resetZoom() {
  state.setImageZoomLevel(1);
  state.setImagePanOffset({ x: 0, y: 0 });
  const img = document.getElementById('modalImage');
  updateImageTransform(img);
}
