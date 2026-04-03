/***********************
 * TASK TAGGING SYSTEM
 * Color-coded labels for task categorization
 ***********************/
import * as state from './state.js';
import { saveNotesToLocalStorage } from './storage.js';
import { escapeHtml } from './utils.js';
import { getAllTags, saveTags as _saveTags } from './repository.js';

// Maximum tags per task
export const MAX_TAGS_PER_TASK = 5;

// Predefined tag colors
export const TAG_COLORS = [
  { name: 'red', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' },
  { name: 'orange', color: '#f97316', bg: 'rgba(249, 115, 22, 0.2)' },
  { name: 'yellow', color: '#eab308', bg: 'rgba(234, 179, 8, 0.2)' },
  { name: 'green', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.2)' },
  { name: 'teal', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.2)' },
  { name: 'blue', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)' },
  { name: 'indigo', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.2)' },
  { name: 'purple', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.2)' },
  { name: 'pink', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.2)' },
  { name: 'gray', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.2)' },
];

// In-memory tag definitions
let tagDefinitions = [];

/**
 * Initialize tags system
 */
export async function initTags() {
  await loadTagDefinitions();
}

// Old default tag IDs to remove during migration
const OLD_DEFAULT_TAG_IDS = ['urgent', 'review', 'user-story', 'incident', 'rollout'];

/**
 * Load tag definitions from IDB (with localStorage fallback)
 */
async function loadTagDefinitions() {
  try {
    const loaded = await getAllTags();

    if (loaded.length > 0) {
      tagDefinitions = loaded;
      const beforeCount = tagDefinitions.length;

      // Get tags currently in use by tasks (reads from state, tasks must be loaded first)
      const usedTagIds = getUsedTagIds();

      // Remove old default tags (unless they're in use)
      tagDefinitions = tagDefinitions.filter(
        tag => !OLD_DEFAULT_TAG_IDS.includes(tag.id) || usedTagIds.has(tag.id)
      );

      // Keep tags that are pinned OR in use by tasks
      tagDefinitions = tagDefinitions.filter(tag => tag.pinned === true || usedTagIds.has(tag.id));

      // Save if any tags were removed
      if (tagDefinitions.length !== beforeCount) {
        saveTagDefinitions();
      }
    } else {
      // Start with empty tags — users create their own
      tagDefinitions = [];
    }
  } catch (e) {
    console.warn('Error loading tags:', e);
    tagDefinitions = [];
  }
}

/**
 * Get all tag IDs currently in use by tasks.
 * Reads from state (tasks must be loaded before initTags is called).
 */
function getUsedTagIds() {
  const usedTagIds = new Set();
  state.notesData.forEach(task => {
    if (task.tags && task.tags.length > 0) {
      task.tags.forEach(tagId => usedTagIds.add(tagId));
    }
  });
  return usedTagIds;
}

/**
 * Save tag definitions via repository.js
 */
function saveTagDefinitions() {
  _saveTags([...tagDefinitions]);
}

/**
 * Get all tag definitions
 */
export function getTagDefinitions() {
  return [...tagDefinitions];
}

/**
 * Get tag by ID
 */
export function getTagById(id) {
  return tagDefinitions.find(t => t.id === id);
}

/**
 * Get tag color info
 */
export function getTagColor(tagId) {
  const tag = getTagById(tagId);
  if (!tag) return TAG_COLORS[9]; // default gray
  return resolveTagColor(tag);
}

function resolveTagColor(tag) {
  if (tag.customColor) {
    return { color: tag.customColor, bg: hexToRgba(tag.customColor, 0.2) };
  }
  return TAG_COLORS[tag.colorIndex] || TAG_COLORS[9];
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Create a new tag
 */
export function createTag(name, colorIndex = 9, pinned = false, customColor = null) {
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');

  // Check for duplicate
  if (tagDefinitions.find(t => t.id === id)) {
    return null;
  }

  const tag = {
    id,
    name,
    colorIndex: Math.min(Math.max(0, colorIndex), TAG_COLORS.length - 1),
    pinned,
  };

  if (customColor) tag.customColor = customColor;

  tagDefinitions.push(tag);
  saveTagDefinitions();

  return tag;
}

/**
 * Toggle pinned state of a tag
 */
export function toggleTagPinned(id) {
  const tag = tagDefinitions.find(t => t.id === id);
  if (!tag) return false;

  tag.pinned = !tag.pinned;
  saveTagDefinitions();

  // Refresh tag filter buttons
  renderTagFilterButtons();

  return tag.pinned;
}

/**
 * Set pinned state of a tag
 */
export function setTagPinned(id, pinned) {
  const tag = tagDefinitions.find(t => t.id === id);
  if (!tag) return false;

  tag.pinned = pinned;
  saveTagDefinitions();

  return true;
}

/**
 * Get all pinned tags
 */
export function getPinnedTags() {
  return tagDefinitions.filter(t => t.pinned);
}

/**
 * Update a tag
 */
export function updateTag(id, updates) {
  const index = tagDefinitions.findIndex(t => t.id === id);
  if (index === -1) return false;

  tagDefinitions[index] = { ...tagDefinitions[index], ...updates };
  saveTagDefinitions();

  return true;
}

/**
 * Delete a tag
 */
export function deleteTag(id) {
  const index = tagDefinitions.findIndex(t => t.id === id);
  if (index === -1) return false;

  tagDefinitions.splice(index, 1);
  saveTagDefinitions();

  // Remove tag from all tasks
  state.notesData.forEach(task => {
    if (task.tags) {
      task.tags = task.tags.filter(t => t !== id);
    }
  });
  saveNotesToLocalStorage();

  return true;
}

/**
 * Clean up unused tag definitions
 * Removes tags that are not used by any task (keeps pinned tags)
 */
export function cleanupUnusedTags() {
  // Get all tag IDs used by any task — including soft-deleted (trashed) ones,
  // because those tasks might be restored and their tag definitions must survive.
  const usedTagIds = new Set();
  state.notesData.forEach(task => {
    if (task.tags && task.tags.length > 0) {
      task.tags.forEach(tagId => usedTagIds.add(tagId));
    }
  });

  // Filter out unused tags (keep pinned tags)
  const previousCount = tagDefinitions.length;

  tagDefinitions = tagDefinitions.filter(tag => usedTagIds.has(tag.id) || tag.pinned);

  // Save if any tags were removed
  if (tagDefinitions.length !== previousCount) {
    saveTagDefinitions();
  }
}

/**
 * Add tag to a task (does NOT save immediately - save happens in modal saveAndClose)
 */
export function addTagToTask(taskId, tagId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task) return false;

  if (!task.tags) {
    task.tags = [];
  }

  // Check max tags limit
  if (task.tags.length >= MAX_TAGS_PER_TASK) {
    return false; // Already at max
  }

  if (!task.tags.includes(tagId)) {
    task.tags.push(tagId);
    // Note: History entry and save will happen in saveAndCloseModal()
  }

  return true;
}

/**
 * Remove tag from a task (does NOT save immediately - save happens in modal saveAndClose)
 */
export function removeTagFromTask(taskId, tagId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task || !task.tags) return false;

  const index = task.tags.indexOf(tagId);
  if (index !== -1) {
    task.tags.splice(index, 1);
    // Note: History entry and save will happen in saveAndCloseModal()
  }

  return true;
}

/**
 * Get tags for a task
 */
export function getTaskTags(taskId) {
  const task = state.notesData.find(t => t.id === taskId);
  if (!task || !task.tags) return [];

  return task.tags.map(tagId => {
    const tagDef = getTagById(tagId);
    const color = getTagColor(tagId);
    return {
      id: tagId,
      name: tagDef ? tagDef.name : tagId,
      color: color.color,
      bg: color.bg,
    };
  });
}

/**
 * Render tags display for a task card
 */
export function renderTaskTagsHTML(taskId) {
  const tags = getTaskTags(taskId);
  if (tags.length === 0) return '';

  return `<div class="task-tags">${tags
    .map(
      tag =>
        `<span class="task-tag" style="background: ${tag.bg}; color: ${tag.color}; border-color: ${tag.color};">${escapeHtml(tag.name)}</span>`
    )
    .join('')}</div>`;
}

/**
 * Render tag selector UI in modal
 */
export function renderTagSelector(taskId, container) {
  if (!container) return;

  const task = state.notesData.find(t => t.id === taskId);
  const currentTags = task?.tags || [];
  const atMaxTags = currentTags.length >= MAX_TAGS_PER_TASK;

  // Separate pinned tags from unpinned for display
  const availableTags = tagDefinitions.filter(t => !currentTags.includes(t.id));
  const pinnedTags = availableTags.filter(t => t.pinned);
  const unpinnedTags = availableTags.filter(t => !t.pinned);

  container.innerHTML = `
    <div class="tag-selector">
      <div class="tag-selector-current">
        ${currentTags.length === 0 ? '<span class="no-tags">No tags</span>' : ''}
        ${currentTags
          .map(tagId => {
            const tag = getTagById(tagId);
            const color = getTagColor(tagId);
            const isPinned = tag?.pinned || false;
            return `
            <span class="tag-chip" style="background: ${color.bg}; color: ${color.color}; border-color: ${color.color};">
              ${escapeHtml(tag ? tag.name : tagId)}
              <button class="tag-pin${isPinned ? ' pinned' : ''}" data-tag-id="${tagId}" title="${isPinned ? 'Unpin tag' : 'Pin tag for reuse'}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                </svg>
              </button>
              <button class="tag-remove" data-tag-id="${tagId}" title="Remove tag">&times;</button>
            </span>
          `;
          })
          .join('')}
      </div>
      <div class="tag-selector-add">
        ${
          atMaxTags
            ? '<span class="max-tags-message">Maximum 5 tags reached</span>'
            : '<button class="tag-add-btn" id="tagAddBtn">+ Add Tag</button>'
        }
      </div>
      ${(() => {
        const pinned = tagDefinitions.filter(t => t.pinned);
        if (pinned.length === 0) return '';
        return `
      <div class="tag-pinned-mgmt">
        <span class="tag-pinned-mgmt-label">Pinned Tags</span>
        <div class="tag-pinned-mgmt-list">
          ${pinned
            .map(tag => {
              const color = resolveTagColor(tag);
              const isOnTask = currentTags.includes(tag.id);
              return `
            <span class="tag-pinned-mgmt-row">
              <span class="tag-chip" style="background: ${color.bg}; color: ${color.color}; border-color: ${color.color};">${escapeHtml(tag.name)}</span>
              ${
                isOnTask
                  ? '<span class="tag-pinned-on-task">On task</span>'
                  : `<button class="tag-pinned-assign" data-tag-id="${tag.id}" title="Add to task" ${atMaxTags ? 'disabled' : ''}>Assign</button>`
              }
              <button class="tag-pinned-delete" data-tag-id="${tag.id}" title="Delete tag permanently from all tasks">Delete</button>
            </span>`;
            })
            .join('')}
        </div>
      </div>`;
      })()}
      <div class="tag-selector-dropdown" id="tagDropdown" style="display: none;">
        <div class="tag-dropdown-list">
          ${
            unpinnedTags.length > 0
              ? unpinnedTags
                  .map(tag => {
                    const color = resolveTagColor(tag);
                    return `
                <div class="tag-dropdown-row">
                  <button class="tag-dropdown-item" data-tag-id="${tag.id}" style="--tag-color: ${color.color}; --tag-bg: ${color.bg};">
                    <span class="tag-color-dot" style="background: ${color.color};"></span>
                    ${escapeHtml(tag.name)}
                  </button>
                  <button class="tag-dropdown-pin" data-tag-id="${tag.id}" title="Pin tag for reuse">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                    </svg>
                  </button>
                </div>
              `;
                  })
                  .join('')
              : ''
          }
          ${availableTags.length === 0 ? '<div class="tag-dropdown-empty">No saved tags. Create one below!</div>' : ''}
        </div>
        <div class="tag-dropdown-create">
          <input type="text" id="newTagInput" placeholder="Create new tag..." maxlength="20">
          <div class="tag-color-picker" id="tagColorPicker">
            ${TAG_COLORS.map(
              (c, i) =>
                `<button class="tag-color-option${i === 5 ? ' selected' : ''}" data-color-index="${i}" style="background: ${c.color};" title="${c.name}"></button>`
            ).join('')}
            <label class="tag-color-custom" title="Custom color">
              <input type="color" id="tagCustomColor" value="#8b5cf6">
              <span class="tag-color-option tag-color-custom-btn" id="tagCustomColorBtn"></span>
            </label>
          </div>
          <label class="tag-pin-checkbox">
            <input type="checkbox" id="newTagPinned"> Pin
          </label>
          <button id="createTagBtn" class="tag-create-btn">Create</button>
        </div>
      </div>
    </div>
  `;

  // Setup event handlers
  setupTagSelectorEvents(taskId, container);
}

/**
 * Setup event handlers for tag selector
 */
function setupTagSelectorEvents(taskId, container) {
  const addBtn = container.querySelector('#tagAddBtn');
  const dropdown = container.querySelector('#tagDropdown');
  const newTagInput = container.querySelector('#newTagInput');
  const createTagBtn = container.querySelector('#createTagBtn');
  const colorPicker = container.querySelector('#tagColorPicker');
  const newTagPinnedCheckbox = container.querySelector('#newTagPinned');

  let selectedColorIndex = 5;
  let selectedCustomColor = null;

  // Toggle dropdown
  addBtn?.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  });

  // Add existing tag
  container.querySelectorAll('.tag-dropdown-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      const tagId = item.dataset.tagId;
      addTagToTask(taskId, tagId);
      renderTagSelector(taskId, container);
      state.setModalHasChanges(true);
    });
  });

  // Remove tag
  container.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tagId = btn.dataset.tagId;
      removeTagFromTask(taskId, tagId);
      renderTagSelector(taskId, container);
      state.setModalHasChanges(true);
    });
  });

  // Pinned tags management: assign to task
  container.querySelectorAll('.tag-pinned-assign').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      addTagToTask(taskId, btn.dataset.tagId);
      renderTagSelector(taskId, container);
      state.setModalHasChanges(true);
    });
  });

  // Pinned tags management: delete permanently from all tasks
  container.querySelectorAll('.tag-pinned-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteTag(btn.dataset.tagId);
      renderTagSelector(taskId, container);
      renderTagFilterButtons();
    });
  });

  // Pin/unpin tag from current tags
  container.querySelectorAll('.tag-chip .tag-pin').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tagId = btn.dataset.tagId;
      toggleTagPinned(tagId);
      renderTagSelector(taskId, container);
    });
  });

  // Pin/unpin tag from dropdown
  container.querySelectorAll('.tag-dropdown-pin').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tagId = btn.dataset.tagId;
      toggleTagPinned(tagId);
      renderTagSelector(taskId, container);
    });
  });

  // Preset color swatches
  colorPicker?.querySelectorAll('.tag-color-option:not(.tag-color-custom-btn)').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      colorPicker
        .querySelectorAll('.tag-color-option')
        .forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedColorIndex = parseInt(opt.dataset.colorIndex);
      selectedCustomColor = null;
    });
  });

  // Custom color picker
  const customColorInput = container.querySelector('#tagCustomColor');
  const customColorBtn = container.querySelector('#tagCustomColorBtn');
  customColorInput?.addEventListener('input', e => {
    selectedCustomColor = e.target.value;
    colorPicker.querySelectorAll('.tag-color-option').forEach(o => o.classList.remove('selected'));
    customColorBtn.style.background = selectedCustomColor;
    customColorBtn.classList.add('selected');
  });
  customColorInput?.addEventListener('click', e => e.stopPropagation());

  // Create new tag
  createTagBtn?.addEventListener('click', e => {
    e.stopPropagation();
    const name = newTagInput.value.trim();
    if (name) {
      const shouldPin = newTagPinnedCheckbox?.checked || false;
      const tag = createTag(name, selectedColorIndex, shouldPin, selectedCustomColor);
      if (tag) {
        addTagToTask(taskId, tag.id);
        renderTagSelector(taskId, container);
        state.setModalHasChanges(true);
      }
    }
  });

  // Enter key in input
  newTagInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      createTagBtn?.click();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', function closeDropdown(e) {
    if (!container.contains(e.target)) {
      dropdown.style.display = 'none';
      document.removeEventListener('click', closeDropdown);
    }
  });
}

/**
 * Render tag filter buttons based on pinned tags
 */
export function renderTagFilterButtons() {
  const container = document.getElementById('tagFilters');
  if (!container) return;

  // Count tag frequency across all active (non-deleted) tasks
  const tagFrequency = new Map();
  state.notesData.forEach(task => {
    if (task.deleted) return;
    (task.tags || []).forEach(tagId => {
      tagFrequency.set(tagId, (tagFrequency.get(tagId) || 0) + 1);
    });
  });

  if (tagFrequency.size === 0) {
    container.innerHTML =
      '<span class="no-tag-filters">Assign tags to tasks to filter by them</span>';
    return;
  }

  // Sort by frequency descending, take top 8, resolve to tag definitions
  const topTags = [...tagFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => getTagById(id))
    .filter(Boolean);

  if (topTags.length === 0) {
    container.innerHTML =
      '<span class="no-tag-filters">Assign tags to tasks to filter by them</span>';
    return;
  }

  container.innerHTML = topTags
    .map(tag => {
      const color = resolveTagColor(tag);
      return `<button class="tag-filter-btn" data-tag="${tag.id}" title="Filter by ${escapeHtml(tag.name)}" style="--tag-color: ${color.color}; --tag-bg: ${color.bg};">${escapeHtml(tag.name)}</button>`;
    })
    .join('');

  container.querySelectorAll('.tag-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      import('./search.js').then(searchModule => {
        searchModule.toggleTagFilter(tag);
      });
    });
  });
}
