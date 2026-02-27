/***********************
 * MODAL FUNCTIONS
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { storeImage, getImage, deleteImagesByIds } from './database.js';
import { formatTime, escapeHtml, getTextPreview, deepClone } from './utils.js';
import { getPriorityLabel, updateModalPriorityButtons, updateNoteCardPriority } from './priority.js';
import { sortColumnByPriority } from './sorting.js';
import { renderSubKanban } from './sub-kanban.js';
import { openImageViewer } from './images.js';
import { updateNoteCardDisplay, setOpenTaskModal } from './tasks.js';
import { getTagById, cleanupUnusedTags } from './tags.js';
import { recordAction } from './undo.js';

export async function openTaskModal(taskId) {
  state.setCurrentTaskId(taskId);
  const task = state.notesData.find(t => t.id === taskId);
  if (!task) return;

  // Reset modal state
  state.setModalPendingActions([]);
  state.setModalHasChanges(false);
  state.setOriginalTimerValue(task.timer || 0);
  state.setOriginalPriorityValue(task.priority || null);
  state.setCurrentModalPriority(task.priority || null);
  state.setOriginalTagsValue(task.tags ? [...task.tags] : []);
  state.setOriginalTitleValue(task.title || '');

  const modal = document.getElementById('taskModal');
  const title = document.getElementById('modalTitle');
  const notesEditor = document.getElementById('modalNotesEditor');
  const timerTotal = document.getElementById('modalTimerTotal');
  const historyList = document.getElementById('modalHistory');
  const clearNotesBtn = document.getElementById('clearNotesBtn');
  const priorityLabel = document.getElementById('modalPriorityLabel');

  title.textContent = task.title;

  // Clear notes editor and set placeholder
  notesEditor.innerHTML = '';
  clearNotesBtn.style.display = 'none';

  if (task.noteEntries && task.noteEntries.length > 0) {
    const lastEntry = task.noteEntries[task.noteEntries.length - 1];
    notesEditor.setAttribute('data-placeholder', getTextPreview(lastEntry.notesHTML));
  } else {
    notesEditor.setAttribute('data-placeholder', 'Write your notes here...');
  }

  // Display timer total
  const totalMinutes = task.timer || 0;
  timerTotal.textContent = formatTime(totalMinutes);

  // Display priority
  if (priorityLabel) {
    priorityLabel.textContent = getPriorityLabel(task.priority);
  }
  updateModalPriorityButtons(task.priority);

  // Always collapse history when opening modal
  historyList.style.display = 'none';
  const toggle = document.getElementById('historyToggle');
  if (toggle) toggle.textContent = '▼';

  // Display history with expandable notes
  await renderHistory(task);

  // Render sub-kanban board
  renderSubKanban(task);

  // Render tags selector
  const tagsContainer = document.getElementById('tagsContainer');
  if (tagsContainer && window.renderTagSelector) {
    window.renderTagSelector(taskId, tagsContainer);
  }

  // Render due date picker
  const dueDateContainer = document.getElementById('dueDateContainer');
  if (dueDateContainer && window.renderDueDatePicker) {
    window.renderDueDatePicker(taskId, dueDateContainer);
  }

  modal.style.display = 'block';
}

// Register openTaskModal with tasks.js
setOpenTaskModal(openTaskModal);

export function enableTitleEdit() {
  if (!state.currentTaskId) return;

  const titleEl = document.getElementById('modalTitle');
  if (!titleEl) return;

  const task = state.notesData.find(t => t.id === state.currentTaskId);
  if (!task) return;

  state.setOriginalTitleValue(task.title);

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
    const newTitle = titleEl.textContent.trim();
    if (newTitle && newTitle !== state.originalTitleValue) {
      // Don't save immediately - just mark as having changes
      // The actual save happens in saveAndCloseModal()
      state.setModalHasChanges(true);
    } else {
      titleEl.textContent = state.originalTitleValue;
    }
  };

  titleEl.onblur = finishEdit;
  titleEl.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleEl.blur();
    } else if (e.key === 'Escape') {
      titleEl.textContent = state.originalTitleValue;
      titleEl.blur();
    }
  };
}

export async function renderHistory(task) {
  const historyList = document.getElementById('modalHistory');
  historyList.innerHTML = '';

  if (!task.actions || task.actions.length === 0) {
    historyList.innerHTML = '<div class="history-item">No history yet</div>';
    return;
  }

  for (let actionIndex = 0; actionIndex < task.actions.length; actionIndex++) {
    const action = task.actions[actionIndex];
    const historyItem = document.createElement('div');
    historyItem.classList.add('history-item');
    historyItem.dataset.actionIndex = actionIndex;

    if (action.type === 'note') {
      // Find corresponding noteEntry index
      const noteEntryIndex = findNoteEntryIndex(task, action.timestamp);

      // This is a note entry - make it expandable with edit/delete buttons
      const header = document.createElement('div');
      header.classList.add('history-note-header');

      const info = document.createElement('div');
      info.classList.add('history-note-info');
      info.innerHTML = `
        <span class="history-action type-note">Note added</span>
        <span class="history-timestamp">${escapeHtml(action.timestamp)}</span>
      `;

      const expand = document.createElement('span');
      expand.classList.add('history-expand');
      expand.textContent = '▼';

      // Edit/Delete buttons
      const actions = document.createElement('div');
      actions.classList.add('history-note-actions');

      const editBtn = document.createElement('button');
      editBtn.title = 'Edit note';
      editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
      editBtn.onclick = (e) => {
        e.stopPropagation();
        editNoteEntry(task.id, noteEntryIndex, actionIndex);
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.classList.add('delete-note-btn');
      deleteBtn.title = 'Delete note';
      deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteNoteEntry(task.id, noteEntryIndex, actionIndex);
      };

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      header.appendChild(info);
      header.appendChild(actions);
      header.appendChild(expand);

      const content = document.createElement('div');
      content.classList.add('history-note-content');
      content.style.display = 'none';
      content.innerHTML = action.notesHTML || 'Empty note';

      // Restore images from IndexedDB
      if (action.images && action.images.length > 0) {
        for (const imageId of action.images) {
          const dataUrl = await getImage(task.id, imageId);
          if (dataUrl) {
            const existingImg = content.querySelector(`img[data-image-id="${imageId}"]`);
            if (existingImg) {
              existingImg.src = dataUrl;
              existingImg.onclick = () => openImageViewer(dataUrl);
            }
          }
        }
      }

      // Click on info or expand to toggle
      const toggleExpand = () => {
        const isExpanded = content.style.display === 'block';
        content.style.display = isExpanded ? 'none' : 'block';
        expand.textContent = isExpanded ? '▼' : '▲';
      };

      info.onclick = toggleExpand;
      expand.onclick = toggleExpand;

      historyItem.appendChild(header);
      historyItem.appendChild(content);
    } else {
      // Regular action with color coding
      const typeClass = action.type ? `type-${action.type}` : '';
      historyItem.innerHTML = `
        <span class="history-action ${typeClass}">${escapeHtml(action.action)}</span><br>
        <span class="history-timestamp">${escapeHtml(action.timestamp)}</span>
      `;
    }

    historyList.appendChild(historyItem);
  }
}

// Find the noteEntry index that matches an action timestamp
function findNoteEntryIndex(task, timestamp) {
  if (!task.noteEntries) return -1;
  return task.noteEntries.findIndex(entry => entry.timestamp === timestamp);
}

// Edit a specific note entry
async function editNoteEntry(taskId, noteEntryIndex, actionIndex) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task || noteEntryIndex < 0 || !task.noteEntries[noteEntryIndex]) return;

  const noteEntry = task.noteEntries[noteEntryIndex];
  const action = task.actions[actionIndex];

  // Find the history item
  const historyItem = document.querySelector(`.history-item[data-action-index="${actionIndex}"]`);
  if (!historyItem) return;

  // Check if already editing
  if (historyItem.querySelector('.note-entry-edit-container')) {
    return;
  }

  // Expand the note content first
  const content = historyItem.querySelector('.history-note-content');
  const expand = historyItem.querySelector('.history-expand');
  if (content) {
    content.style.display = 'block';
    if (expand) expand.textContent = '▲';
  }

  // Create edit container
  const editContainer = document.createElement('div');
  editContainer.classList.add('note-entry-edit-container');

  const editor = document.createElement('div');
  editor.classList.add('note-entry-edit-editor');
  editor.contentEditable = true;
  editor.innerHTML = noteEntry.notesHTML || '';

  // Restore images
  if (noteEntry.images && noteEntry.images.length > 0) {
    for (const imageId of noteEntry.images) {
      const dataUrl = await getImage(taskId, imageId);
      if (dataUrl) {
        const existingImg = editor.querySelector(`img[data-image-id="${imageId}"]`);
        if (existingImg) {
          existingImg.src = dataUrl;
          existingImg.onclick = () => openImageViewer(dataUrl);
        }
      }
    }
  }

  // Setup paste handler
  editor.onpaste = async (e) => {
    const items = e.clipboardData.items;
    let hasImage = false;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        hasImage = true;
        e.preventDefault();

        const blob = items[i].getAsFile();
        const reader = new FileReader();

        reader.onload = (event) => {
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
            editor.appendChild(img);
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
    }
  };

  const actionsDiv = document.createElement('div');
  actionsDiv.classList.add('note-entry-edit-actions');

  const cancelBtn = document.createElement('button');
  cancelBtn.classList.add('clear-btn');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => {
    editContainer.remove();
  };

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save Changes';
  saveBtn.onclick = async () => {
    await saveNoteEntryEdit(taskId, noteEntryIndex, actionIndex, editor);
    editContainer.remove();
  };

  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);

  editContainer.appendChild(editor);
  editContainer.appendChild(actionsDiv);

  // Insert after content
  if (content) {
    content.after(editContainer);
  } else {
    historyItem.appendChild(editContainer);
  }

  editor.focus();
}

// Save edited note entry
async function saveNoteEntryEdit(taskId, noteEntryIndex, actionIndex, editor) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task || noteEntryIndex < 0 || !task.noteEntries[noteEntryIndex]) return;

  const noteEntry = task.noteEntries[noteEntryIndex];
  const action = task.actions[actionIndex];

  // Extract and save images to IndexedDB
  const images = editor.querySelectorAll('img');
  const imageIds = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imageId = img.dataset.imageId || `img_${Date.now()}_${i}`;
    img.dataset.imageId = imageId;
    imageIds.push(imageId);

    if (img.src.startsWith('data:')) {
      await storeImage(taskId, imageId, img.src);
      img.setAttribute('data-src', img.src);
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    }
  }

  // Update note entry
  noteEntry.notesHTML = editor.innerHTML;
  noteEntry.images = imageIds;
  noteEntry.timestamp = new Date().toLocaleString(); // Update timestamp

  // Update action
  action.notesHTML = editor.innerHTML;
  action.images = imageIds;
  action.timestamp = noteEntry.timestamp;

  saveNotesToLocalStorage();
  updateNoteCardDisplay(taskId);

  // Re-render history
  await renderHistory(task);
}

// Delete a specific note entry
async function deleteNoteEntry(taskId, noteEntryIndex, actionIndex) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task) return;

  if (!confirm('Are you sure you want to delete this note entry?')) {
    return;
  }

  // Delete images from IndexedDB
  if (noteEntryIndex >= 0 && task.noteEntries[noteEntryIndex]) {
    const noteEntry = task.noteEntries[noteEntryIndex];
    if (noteEntry.images && noteEntry.images.length > 0) {
      await deleteImagesByIds(taskId, noteEntry.images);
    }
    // Remove from noteEntries
    task.noteEntries.splice(noteEntryIndex, 1);
  }

  // Remove from actions
  if (actionIndex >= 0 && task.actions[actionIndex]) {
    task.actions.splice(actionIndex, 1);
  }

  saveNotesToLocalStorage();
  updateNoteCardDisplay(taskId);

  // Re-render history
  await renderHistory(task);
}

export function closeTaskModal() {
  // Check if there are actual changes
  const task = state.notesData.find(t => t.id === state.currentTaskId);
  const notesEditor = document.getElementById('modalNotesEditor');
  const titleEl = document.getElementById('modalTitle');

  const hasTextContent = notesEditor && notesEditor.textContent.trim().length > 0;
  const hasImages = notesEditor && notesEditor.querySelectorAll('img').length > 0;
  const hasNoteChanges = notesEditor && notesEditor.innerHTML.trim() && (hasTextContent || hasImages);
  const hasTimerChanges = task && (task.timer || 0) !== state.originalTimerValue;
  const hasPriorityChanges = state.currentModalPriority !== state.originalPriorityValue;
  const currentTitle = titleEl ? titleEl.textContent.trim() : '';
  const hasTitleChanges = currentTitle && currentTitle !== state.originalTitleValue;

  // Check for tag changes
  const currentTags = task?.tags || [];
  const originalTags = state.originalTagsValue || [];
  const hasTagChanges = JSON.stringify(currentTags.sort()) !== JSON.stringify([...originalTags].sort());

  const hasRealChanges = hasNoteChanges || hasTimerChanges || hasPriorityChanges || hasTitleChanges || hasTagChanges;

  if (state.modalHasChanges && hasRealChanges) {
    if (!confirm('You have unsaved changes. Are you sure you want to close without saving?')) {
      return;
    }

    // Revert timer changes if closing without saving
    if (task && hasTimerChanges) {
      task.timer = state.originalTimerValue;
    }

    // Revert tag changes if closing without saving
    if (task && hasTagChanges) {
      task.tags = [...state.originalTagsValue];
    }

    // Update display and save reverted state
    if (task && (hasTimerChanges || hasTagChanges)) {
      updateNoteCardDisplay(state.currentTaskId);
      saveNotesToLocalStorage();
    }
  }

  const modal = document.getElementById('taskModal');
  modal.style.display = 'none';
  state.setCurrentTaskId(null);
  state.setModalPendingActions([]);
  state.setModalHasChanges(false);
  state.setOriginalTimerValue(0);
  state.setOriginalPriorityValue(null);
  state.setCurrentModalPriority(null);
  state.setOriginalTagsValue([]);
  state.setOriginalTitleValue('');
}

export function clearNotes() {
  const notesEditor = document.getElementById('modalNotesEditor');
  notesEditor.innerHTML = '';
  state.setModalHasChanges(true);
}

export function toggleHistory() {
  const historyList = document.getElementById('modalHistory');
  const toggle = document.getElementById('historyToggle');

  if (historyList.style.display === 'none') {
    historyList.style.display = 'block';
    toggle.textContent = '▲';
  } else {
    historyList.style.display = 'none';
    toggle.textContent = '▼';
  }
}

export async function saveAndCloseModal() {
  if (!state.currentTaskId) return;

  const task = state.notesData.find(t => t.id === state.currentTaskId);
  if (!task) return;

  // Reconstruct the TRUE previous state from original values saved when modal opened
  // (tags and timer are modified in memory during modal interaction)
  const previousTaskState = deepClone(task);
  previousTaskState.title = state.originalTitleValue || task.title;
  previousTaskState.priority = state.originalPriorityValue;
  previousTaskState.tags = state.originalTagsValue ? [...state.originalTagsValue] : [];
  previousTaskState.timer = state.originalTimerValue || 0;

  const notesEditor = document.getElementById('modalNotesEditor');
  const titleEl = document.getElementById('modalTitle');

  // Save title change if different
  const currentTitle = titleEl ? titleEl.textContent.trim() : task.title;
  if (currentTitle && currentTitle !== state.originalTitleValue) {
    const timestamp = new Date().toLocaleString();
    task.actions.push({
      action: `Renamed from "${state.originalTitleValue}" to "${currentTitle}"`,
      timestamp,
      type: 'status'
    });
    task.title = currentTitle;

    // Update the card display
    const noteElement = document.querySelector(`[data-id="${state.currentTaskId}"]`);
    if (noteElement) {
      const titleSpan = noteElement.querySelector('.note-content strong');
      if (titleSpan) {
        titleSpan.textContent = currentTitle;
      }
    }
  }

  // Save priority change if different
  if (state.currentModalPriority !== state.originalPriorityValue) {
    const timestamp = new Date().toLocaleString();
    task.priority = state.currentModalPriority;
    task.actions.push({
      action: `Priority changed from ${getPriorityLabel(state.originalPriorityValue)} to ${getPriorityLabel(state.currentModalPriority)}`,
      timestamp,
      type: 'priority'
    });
    updateNoteCardPriority(state.currentTaskId);
    // Re-sort the column after priority change
    sortColumnByPriority(task.column);
  }

  // Save tag changes if different
  const currentTags = task.tags || [];
  const originalTags = state.originalTagsValue || [];
  const addedTags = currentTags.filter(t => !originalTags.includes(t));
  const removedTags = originalTags.filter(t => !currentTags.includes(t));

  if (addedTags.length > 0 || removedTags.length > 0) {
    const timestamp = new Date().toLocaleString();

    // Log added tags
    addedTags.forEach(tagId => {
      const tag = getTagById(tagId);
      task.actions.push({
        action: `Added tag "${tag ? tag.name : tagId}"`,
        timestamp,
        type: 'tag'
      });
    });

    // Log removed tags
    removedTags.forEach(tagId => {
      const tag = getTagById(tagId);
      task.actions.push({
        action: `Removed tag "${tag ? tag.name : tagId}"`,
        timestamp,
        type: 'tag'
      });
    });

    // Cleanup unused tag definitions
    cleanupUnusedTags();
  }

  // Save all pending timer actions in a single summary entry
  if (state.modalPendingActions.length > 0) {
    // Calculate total time change
    let totalChange = 0;
    state.modalPendingActions.forEach(action => {
      const match = action.action.match(/(\d+) minute/);
      if (match) {
        const minutes = parseInt(match[1]);
        if (action.action.includes('Removed')) {
          totalChange -= minutes;
        } else {
          totalChange += minutes;
        }
      }
    });

    if (totalChange !== 0) {
      const timestamp = new Date().toLocaleString();
      const summaryAction = totalChange > 0
        ? `Added ${totalChange} minute(s) to timer`
        : `Removed ${Math.abs(totalChange)} minute(s) from timer`;
      task.actions.push({ action: summaryAction, timestamp, type: 'timer' });
    }
  }

  // Check if there's any content (text or images)
  const hasTextContent = notesEditor.textContent.trim().length > 0;
  const hasImages = notesEditor.querySelectorAll('img').length > 0;
  const hasContent = notesEditor.innerHTML.trim() && (hasTextContent || hasImages);

  // Only save notes if there's content
  if (hasContent) {
    const timestamp = new Date().toLocaleString();

    // Initialize noteEntries if it doesn't exist
    if (!task.noteEntries) {
      task.noteEntries = [];
    }

    // Extract and save images to IndexedDB
    const images = notesEditor.querySelectorAll('img');
    const imageIds = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const imageId = img.dataset.imageId || `img_${Date.now()}_${i}`;
      img.dataset.imageId = imageId;
      imageIds.push(imageId);

      if (img.src.startsWith('data:')) {
        await storeImage(state.currentTaskId, imageId, img.src);
        // Keep original src in data-src for PDF export
        img.setAttribute('data-src', img.src);
        // Replace with placeholder to reduce localStorage size
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      }
    }

    // Save note entry
    const noteEntry = {
      timestamp,
      notesHTML: notesEditor.innerHTML,
      images: imageIds
    };

    task.noteEntries.push(noteEntry);

    // Add to actions history
    task.actions.push({
      type: 'note',
      timestamp,
      notesHTML: notesEditor.innerHTML,
      images: imageIds
    });
  }

  // Record action for undo/redo (only if there were actual changes)
  const newTaskState = deepClone(task);
  if (JSON.stringify(previousTaskState) !== JSON.stringify(newTaskState)) {
    // Determine what changed for the description
    let changeDescription = 'Update task';
    if (previousTaskState.title !== newTaskState.title) {
      changeDescription = `Rename "${previousTaskState.title.substring(0, 20)}..."`;
    } else if (previousTaskState.priority !== newTaskState.priority) {
      changeDescription = 'Change priority';
    } else if (JSON.stringify(previousTaskState.tags) !== JSON.stringify(newTaskState.tags)) {
      changeDescription = 'Update tags';
    } else if (previousTaskState.timer !== newTaskState.timer) {
      changeDescription = 'Update timer';
    } else if (previousTaskState.noteEntries?.length !== newTaskState.noteEntries?.length) {
      changeDescription = 'Add note';
    }

    recordAction({
      type: 'update',
      taskId: state.currentTaskId,
      previousState: previousTaskState,
      newState: newTaskState,
      description: changeDescription
    });
  }

  saveNotesToLocalStorage();

  // Update the card display
  updateNoteCardDisplay(state.currentTaskId);

  // Reset modal state
  state.setModalHasChanges(false);
  state.setModalPendingActions([]);

  closeTaskModal();
}
