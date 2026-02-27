/***********************
 * IMAGE FUNCTIONS
 ***********************/
import * as state from './state.js';
import { initMentionHandler } from './mentions.js';

export function setupClipboardPaste() {
  const notesEditor = document.getElementById('modalNotesEditor');
  if (!notesEditor) return;

  // Initialize mention handler for Kanban notes
  initMentionHandler(notesEditor);

  // Mark changes when notes are edited and show/hide Clear All button
  notesEditor.addEventListener('input', () => {
    state.setModalHasChanges(true);
    updateClearNotesButton();
  });

  // Prevent any formatting keyboard shortcuts
  notesEditor.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      // Allow only basic shortcuts: Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+Z, Ctrl+Y
      const allowedKeys = ['c', 'v', 'x', 'a', 'z', 'y'];
      if (!allowedKeys.includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    }
  });

  notesEditor.addEventListener('paste', async (e) => {
    const items = e.clipboardData.items;
    let hasImage = false;

    // Check for images first
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        hasImage = true;
        e.preventDefault();
        state.setModalHasChanges(true);

        const blob = items[i].getAsFile();
        const reader = new FileReader();

        reader.onload = async (event) => {
          const img = document.createElement('img');
          img.src = event.target.result;
          img.style.maxWidth = '100%';
          img.style.cursor = 'pointer';
          img.dataset.imageId = `img_${Date.now()}_${i}`;

          img.onclick = () => openImageViewer(img.src);

          // Insert at cursor position
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
      }
    }

    // If no image, paste as plain text only
    if (!hasImage) {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');

      // Insert plain text at cursor position
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

      state.setModalHasChanges(true);
      updateClearNotesButton();
    }
  });
}

export function updateClearNotesButton() {
  const notesEditor = document.getElementById('modalNotesEditor');
  const clearNotesBtn = document.getElementById('clearNotesBtn');

  if (notesEditor && clearNotesBtn) {
    const hasTextContent = notesEditor.textContent.trim().length > 0;
    const hasImages = notesEditor.querySelectorAll('img').length > 0;
    const hasContent = notesEditor.innerHTML.trim() && (hasTextContent || hasImages);
    clearNotesBtn.style.display = hasContent ? 'inline-block' : 'none';
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
  modal.style.display = 'block';
  if (backButton) backButton.style.display = 'none';

  // Add scroll wheel zoom
  imageContainer.onwheel = function(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    zoomImage(delta);
  };

  // Click outside image to close
  imageContainer.onclick = function(e) {
    if (e.target === imageContainer) {
      closeImageModal();
    }
  };

  // Drag to pan when zoomed
  img.onmousedown = function(e) {
    if (state.imageZoomLevel > 1) {
      state.setIsDraggingImage(true);
      state.setDragStart({ x: e.clientX - state.imagePanOffset.x, y: e.clientY - state.imagePanOffset.y });
      img.style.cursor = 'grabbing';
      e.preventDefault();
    }
  };

  document.onmousemove = function(e) {
    if (state.isDraggingImage) {
      state.setImagePanOffset({ x: e.clientX - state.dragStart.x, y: e.clientY - state.dragStart.y });
      updateImageTransform(img);
    }
  };

  document.onmouseup = function() {
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
