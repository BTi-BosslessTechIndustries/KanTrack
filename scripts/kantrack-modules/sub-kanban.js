/***********************
 * SUB-KANBAN FUNCTIONS
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { getColumnName } from './utils.js';
import { updateNoteCardDisplay } from './tasks.js';

export function toggleSubKanban() {
  const content = document.getElementById('subKanbanContent');
  const toggle = document.getElementById('subKanbanToggle');

  if (content.style.display === 'none') {
    content.style.display = 'block';
    toggle.textContent = '▲';
  } else {
    content.style.display = 'none';
    toggle.textContent = '▼';
  }
}

export function renderSubKanban(task) {
  // Clear all columns
  ['todo', 'inProgress', 'onHold', 'done'].forEach(col => {
    const colEl = document.getElementById(`subKanban${col.charAt(0).toUpperCase() + col.slice(1)}`);
    if (colEl) colEl.innerHTML = '';
  });

  // Ensure subKanban exists
  if (!task.subKanban) {
    task.subKanban = { enabled: false, items: [] };
  }

  // Update count display
  const countEl = document.getElementById('subKanbanCount');
  if (countEl) {
    const total = task.subKanban.items.length;
    const done = task.subKanban.items.filter(i => i.column === 'done').length;
    countEl.textContent = total > 0 ? `(${done}/${total})` : '';
  }

  // Render items
  task.subKanban.items.forEach(item => {
    const itemEl = createSubKanbanItem(item, task.id);
    const colId = item.column.charAt(0).toUpperCase() + item.column.slice(1);
    const colEl = document.getElementById(`subKanban${colId}`);
    if (colEl) colEl.appendChild(itemEl);
  });

  // Setup drag and drop for columns
  setupSubKanbanDragDrop();
}

export function createSubKanbanItem(item, parentTaskId) {
  const itemEl = document.createElement('div');
  itemEl.classList.add('sub-kanban-item');
  itemEl.dataset.id = item.id;
  itemEl.dataset.parentId = parentTaskId;
  itemEl.draggable = true;

  // Title
  const titleEl = document.createElement('span');
  titleEl.classList.add('sub-kanban-item-title');
  titleEl.textContent = item.title;
  titleEl.ondblclick = (e) => {
    e.stopPropagation();
    enableSubItemTitleEdit(parentTaskId, item.id, titleEl);
  };
  itemEl.appendChild(titleEl);

  // Actions
  const actionsEl = document.createElement('div');
  actionsEl.classList.add('sub-kanban-item-actions');

  // Delete button only
  const deleteBtn = document.createElement('button');
  deleteBtn.classList.add('delete-sub-item');
  deleteBtn.title = 'Delete';
  deleteBtn.textContent = '❌';
  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    deleteSubKanbanItem(parentTaskId, item.id);
  };
  actionsEl.appendChild(deleteBtn);

  itemEl.appendChild(actionsEl);

  // Drag events
  itemEl.ondragstart = (e) => {
    state.setSubKanbanDraggedItem({ element: itemEl, itemId: item.id, parentId: parentTaskId });
    itemEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  };

  itemEl.ondragend = () => {
    itemEl.classList.remove('dragging');
    state.setSubKanbanDraggedItem(null);
    document.querySelectorAll('.sub-kanban-column').forEach(col => {
      col.classList.remove('drop-hover');
    });
  };

  return itemEl;
}

export function setupSubKanbanDragDrop() {
  const columns = document.querySelectorAll('.sub-kanban-column-items');

  columns.forEach(column => {
    column.ondragover = (e) => {
      e.preventDefault();
      if (state.subKanbanDraggedItem) {
        column.parentElement.classList.add('drop-hover');
      }
    };

    column.ondragleave = (e) => {
      if (!column.contains(e.relatedTarget)) {
        column.parentElement.classList.remove('drop-hover');
      }
    };

    column.ondrop = (e) => {
      e.preventDefault();
      column.parentElement.classList.remove('drop-hover');

      if (!state.subKanbanDraggedItem) return;

      const newColumn = column.parentElement.dataset.column;
      moveSubKanbanItem(state.subKanbanDraggedItem.parentId, state.subKanbanDraggedItem.itemId, newColumn);
    };
  });
}

export function addSubKanbanItem() {
  if (!state.currentTaskId) return;

  const input = document.getElementById('newSubTaskInput');
  let title = input.value.trim();
  if (!title) return;

  // Limit to 200 characters
  if (title.length > 200) {
    title = title.substring(0, 200);
  }

  const task = state.notesData.find(t => t.id === state.currentTaskId);
  if (!task) return;

  // Ensure subKanban exists
  if (!task.subKanban) {
    task.subKanban = { enabled: true, items: [] };
  }

  const newItem = {
    id: Date.now(),
    title: title,
    column: 'todo',
    createdAt: new Date().toISOString()
  };

  task.subKanban.items.push(newItem);
  task.subKanban.enabled = true;

  // Add to history
  const timestamp = new Date().toLocaleString();
  task.actions.push({
    action: `Added sub-task: "${title}"`,
    timestamp,
    type: 'subtask'
  });

  input.value = '';
  saveNotesToLocalStorage();
  renderSubKanban(task);
  updateNoteCardDisplay(state.currentTaskId);
}

export function moveSubKanbanItem(parentId, itemId, newColumn) {
  const task = state.notesData.find(t => t.id === parentId);
  if (!task || !task.subKanban) return;

  const item = task.subKanban.items.find(i => i.id === itemId);
  if (!item) return;

  const oldColumn = item.column;
  if (oldColumn === newColumn) return;

  item.column = newColumn;

  // Add to history
  const timestamp = new Date().toLocaleString();
  task.actions.push({
    action: `Sub-task "${item.title}" moved from ${getColumnName(oldColumn)} to ${getColumnName(newColumn)}`,
    timestamp,
    type: 'subtask'
  });

  saveNotesToLocalStorage();
  renderSubKanban(task);
  updateNoteCardDisplay(parentId);
}

export function deleteSubKanbanItem(parentId, itemId) {
  const task = state.notesData.find(t => t.id === parentId);
  if (!task || !task.subKanban) return;

  const item = task.subKanban.items.find(i => i.id === itemId);
  if (!item) return;

  if (!confirm(`Delete sub-task "${item.title}"?`)) return;

  // Remove from array
  task.subKanban.items = task.subKanban.items.filter(i => i.id !== itemId);

  // Add to history
  const timestamp = new Date().toLocaleString();
  task.actions.push({
    action: `Deleted sub-task: "${item.title}"`,
    timestamp,
    type: 'subtask'
  });

  saveNotesToLocalStorage();
  renderSubKanban(task);
  updateNoteCardDisplay(parentId);
}

export function enableSubItemTitleEdit(parentId, itemId, titleEl) {
  const task = state.notesData.find(t => t.id === parentId);
  if (!task || !task.subKanban) return;

  const item = task.subKanban.items.find(i => i.id === itemId);
  if (!item) return;

  const originalTitle = item.title;

  titleEl.contentEditable = true;
  titleEl.classList.add('editing');
  titleEl.focus();

  // Select all text
  const range = document.createRange();
  range.selectNodeContents(titleEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finishEdit = () => {
    titleEl.contentEditable = false;
    titleEl.classList.remove('editing');
    let newTitle = titleEl.textContent.trim();

    // Limit to 200 characters
    if (newTitle.length > 200) {
      newTitle = newTitle.substring(0, 200);
    }

    if (newTitle && newTitle !== originalTitle) {
      item.title = newTitle;
      titleEl.textContent = newTitle; // Update display with truncated version

      // Add to history
      const timestamp = new Date().toLocaleString();
      task.actions.push({
        action: `Renamed sub-task from "${originalTitle}" to "${newTitle}"`,
        timestamp,
        type: 'subtask'
      });

      saveNotesToLocalStorage();
    } else {
      titleEl.textContent = originalTitle;
    }
  };

  titleEl.onblur = finishEdit;
  titleEl.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleEl.blur();
    } else if (e.key === 'Escape') {
      titleEl.textContent = originalTitle;
      titleEl.blur();
    }
  };
}
