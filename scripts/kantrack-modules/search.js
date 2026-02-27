/***********************
 * SEARCH & FILTERING
 * Task search and tag filtering
 ***********************/
import * as state from './state.js';
import { getTextPreview } from './utils.js';
import { getTagById } from './tags.js';

// Current filter state
let currentSearchTerm = '';
let currentColumnFilter = null; // null = all columns
let currentTagFilter = []; // array of tag names

/**
 * Initialize search functionality
 */
export function initSearch() {
  const searchInput = document.getElementById('taskSearchInput');
  if (searchInput) {
    // Debounced search
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        setSearchTerm(e.target.value);
      }, 200);
    });

    // Clear on Escape
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        setSearchTerm('');
        searchInput.blur();
      }
    });
  }

  // Initialize tag filter buttons
  const tagFilterButtons = document.querySelectorAll('.tag-filter-btn');
  tagFilterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      toggleTagFilter(tag);
    });
  });
}

/**
 * Set the search term and filter tasks
 */
export function setSearchTerm(term) {
  currentSearchTerm = term.toLowerCase().trim();
  applyFilters();
}

/**
 * Set the column filter
 */
export function setColumnFilter(column) {
  currentColumnFilter = column;

  // Update button states
  const filterButtons = document.querySelectorAll('.column-filter-btn');
  filterButtons.forEach(btn => {
    const btnColumn = btn.dataset.column || null;
    if (btnColumn === column) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  applyFilters();
}

/**
 * Set tag filter
 */
export function setTagFilter(tags) {
  currentTagFilter = Array.isArray(tags) ? tags : [tags];
  updateTagFilterButtons();
  applyFilters();
}

/**
 * Toggle a tag in the filter (add if not present, remove if present)
 */
export function toggleTagFilter(tag) {
  const index = currentTagFilter.indexOf(tag);
  if (index === -1) {
    // Add tag to filter
    currentTagFilter.push(tag);
  } else {
    // Remove tag from filter
    currentTagFilter.splice(index, 1);
  }
  updateTagFilterButtons();
  applyFilters();
}

/**
 * Update tag filter button visual states
 */
function updateTagFilterButtons() {
  const tagFilterButtons = document.querySelectorAll('.tag-filter-btn');
  tagFilterButtons.forEach(btn => {
    const tag = btn.dataset.tag;
    if (currentTagFilter.includes(tag)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * Clear all filters
 */
export function clearFilters() {
  currentSearchTerm = '';
  currentColumnFilter = null;
  currentTagFilter = [];

  const searchInput = document.getElementById('taskSearchInput');
  if (searchInput) searchInput.value = '';

  // Clear tag filter buttons
  const tagFilterButtons = document.querySelectorAll('.tag-filter-btn');
  tagFilterButtons.forEach(btn => {
    btn.classList.remove('active');
  });

  applyFilters();
}

/**
 * Apply all active filters to task display
 */
export function applyFilters() {
  // Get all note elements from the DOM
  const allNoteElements = document.querySelectorAll('.note');

  allNoteElements.forEach(noteElement => {
    const taskId = noteElement.dataset.id;
    // Try both string and number versions of the ID
    let task = state.notesData.find(t => t.id === taskId);
    if (!task) {
      task = state.notesData.find(t => String(t.id) === String(taskId));
    }
    if (!task) {
      task = state.notesData.find(t => t.id === parseInt(taskId));
    }

    if (!task || task.deleted) {
      noteElement.style.display = 'none';
      return;
    }

    const isVisible = checkTaskVisibility(task);
    noteElement.style.display = isVisible ? '' : 'none';
  });

  // Update column counts
  updateColumnCounts();
}

/**
 * Check if a task should be visible based on current filters
 */
function checkTaskVisibility(task) {
  // Don't show deleted tasks
  if (task.deleted) {
    return false;
  }

  // Check column filter
  if (currentColumnFilter && task.column !== currentColumnFilter) {
    return false;
  }

  // Check tag filter - match by tag name (case-insensitive)
  if (currentTagFilter.length > 0) {
    const taskTagIds = task.tags || [];

    // Get the names of all tags on this task
    const taskTagNames = taskTagIds.map(tagId => {
      const tagDef = getTagById(tagId);
      return tagDef ? tagDef.name.toLowerCase() : tagId.toLowerCase();
    });

    // Get the names of filter tags
    const filterTagNames = currentTagFilter.map(tagId => {
      const tagDef = getTagById(tagId);
      return tagDef ? tagDef.name.toLowerCase() : tagId.toLowerCase();
    });

    // Check if any task tag name matches any filter tag name
    const hasMatchingTag = filterTagNames.some(filterName =>
      taskTagNames.includes(filterName)
    );

    if (!hasMatchingTag) {
      return false;
    }
  }

  // Check search term
  if (currentSearchTerm) {
    const searchableText = getSearchableText(task);
    if (!searchableText.includes(currentSearchTerm)) {
      return false;
    }
  }

  return true;
}

/**
 * Get all searchable text from a task
 */
function getSearchableText(task) {
  const parts = [];

  // Title
  if (task.title) {
    parts.push(task.title.toLowerCase());
  }

  // Notes content
  if (task.noteEntries) {
    task.noteEntries.forEach(entry => {
      const text = getTextPreview(entry.notesHTML);
      if (text) parts.push(text.toLowerCase());
    });
  }

  // Tags
  if (task.tags) {
    parts.push(...task.tags.map(t => t.toLowerCase()));
  }

  // Priority
  if (task.priority) {
    parts.push(task.priority.toLowerCase());
  }

  return parts.join(' ');
}

/**
 * Update visible task counts in column headers
 */
function updateColumnCounts() {
  const columns = ['todo', 'inProgress', 'onHold', 'done'];

  columns.forEach(columnId => {
    const column = document.getElementById(columnId);
    if (!column) return;

    const header = column.querySelector('h2');
    if (!header) return;

    // Create or get count span
    let countSpan = header.querySelector('.column-count');
    if (!countSpan) {
      countSpan = document.createElement('span');
      countSpan.className = 'column-count';
      header.appendChild(countSpan);
    }

    // Get all note elements
    const allNoteElements = Array.from(column.querySelectorAll('.note'));

    // Count visible elements (check computed style, not just inline)
    const visibleTasks = allNoteElements.filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).length;

    const totalTasks = allNoteElements.filter(el => {
      // Only count elements that have a real task (not orphaned)
      const taskId = el.dataset.id;
      return state.notesData.some(t => String(t.id) === String(taskId) && !t.deleted);
    }).length;

    // Show visible/total when filters are active, otherwise just visible count
    if (currentSearchTerm || currentColumnFilter || currentTagFilter.length > 0) {
      countSpan.textContent = totalTasks > 0
        ? `(${visibleTasks}/${totalTasks})`
        : '';
    } else {
      countSpan.textContent = visibleTasks > 0 ? `(${visibleTasks})` : '';
    }
  });
}

/**
 * Get current filter state
 */
export function getFilterState() {
  return {
    searchTerm: currentSearchTerm,
    columnFilter: currentColumnFilter,
    tagFilter: [...currentTagFilter]
  };
}

/**
 * Check if any filters are active
 */
export function hasActiveFilters() {
  return currentSearchTerm !== '' ||
         currentColumnFilter !== null ||
         currentTagFilter.length > 0;
}
