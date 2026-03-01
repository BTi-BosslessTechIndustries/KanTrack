/***********************
 * DRAG & DROP (Main Kanban Board)
 ***********************/
import { draggedItem, setDraggedItem } from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { updateNoteColumn, updateColumnVirtualList, getColumnVirtualList } from './tasks.js';
import { sortColumnByPriority } from './sorting.js';
import { applyFilters } from './search.js';

// Reference setter for draggedItem (used by tasks.js)
export function setDraggedItemRef(item) {
  setDraggedItem(item);
}

export function setupDragAndDrop() {
  const columns = document.querySelectorAll('.column');

  columns.forEach(column => {
    column.addEventListener('dragover', e => e.preventDefault());
    column.addEventListener('drop', function () {
      if (draggedItem) {
        const oldColumnId = draggedItem.parentElement?.id;
        const newColumnId = this.id;
        const noteId = draggedItem.dataset.id; // string UUID

        updateNoteColumn(noteId, oldColumnId, newColumnId);

        if (getColumnVirtualList(newColumnId)) {
          // VL manages DOM; update both columns from data
          updateColumnVirtualList(oldColumnId);
          updateColumnVirtualList(newColumnId);
        } else {
          // DOM-based fallback
          this.appendChild(draggedItem);
          sortColumnByPriority(newColumnId);
        }

        setDraggedItem(null);
        saveNotesToLocalStorage();

        // Update column counts
        applyFilters();
      }
    });
  });
}

export function enableTouchDrag(noteEl, openTaskModalFn) {
  let touchStartX = 0;
  let touchStartY = 0;
  let isDragging = false;
  const dragThreshold = 10; // pixels of movement before considered a drag

  noteEl.addEventListener(
    'touchstart',
    e => {
      if (e.target.closest('button')) return;

      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      isDragging = false;
      setDraggedItem(noteEl);
      // Don't preventDefault here - allow click/tap to work
    },
    { passive: true }
  );

  noteEl.addEventListener(
    'touchmove',
    e => {
      if (!draggedItem) return;

      const t = e.touches[0];
      const deltaX = Math.abs(t.clientX - touchStartX);
      const deltaY = Math.abs(t.clientY - touchStartY);

      // Only start dragging if moved beyond threshold
      if (!isDragging && (deltaX > dragThreshold || deltaY > dragThreshold)) {
        isDragging = true;
      }

      if (isDragging) {
        e.preventDefault();
        const elUnderFinger = document.elementFromPoint(t.clientX, t.clientY);
        const hoveredCol = elUnderFinger && elUnderFinger.closest('.column');

        document
          .querySelectorAll('.column')
          .forEach(c => c.classList.toggle('drop-hover', c === hoveredCol));
      }
    },
    { passive: false }
  );

  noteEl.addEventListener('touchend', e => {
    if (!draggedItem) return;

    document.querySelectorAll('.column').forEach(c => c.classList.remove('drop-hover'));

    if (isDragging) {
      // It was a drag - handle the drop
      const t = e.changedTouches[0];
      const elUnderFinger = document.elementFromPoint(t.clientX, t.clientY);
      const dropCol = elUnderFinger && elUnderFinger.closest('.column');

      if (dropCol) {
        const oldColumnId = draggedItem.parentElement?.id;
        const newColumnId = dropCol.id;
        const noteId = draggedItem.dataset.id; // string UUID

        updateNoteColumn(noteId, oldColumnId, newColumnId);

        if (getColumnVirtualList(newColumnId)) {
          updateColumnVirtualList(oldColumnId);
          updateColumnVirtualList(newColumnId);
        } else {
          dropCol.appendChild(draggedItem);
          sortColumnByPriority(newColumnId);
        }

        saveNotesToLocalStorage();

        // Update column counts
        applyFilters();
      }
    } else {
      // It was a tap - open the modal
      const noteId = noteEl.dataset.id; // string UUID
      if (!e.target.closest('button') && !e.target.closest('.quick-time-menu')) {
        if (openTaskModalFn) openTaskModalFn(noteId);
      }
    }

    setDraggedItem(null);
    isDragging = false;
  });
}
