/***********************
 * SHARED STATE
 * Central state object for cross-module communication
 ***********************/

// Kanban Task State
export let notesData = [];
export let currentTaskId = null;
export let modalPendingActions = [];
export let modalHasChanges = false;
export let originalTimerValue = 0;
export let originalPriorityValue = null;
export let currentModalPriority = null;
export let originalTitleValue = '';
export let editingNoteEntryIndex = null;
export let originalTagsValue = [];

// Database
export let db = null;

// Clock System
export let clocksData = [];
export let draggedClock = null;
export let chronometerIntervals = {};

// Image Viewer
export let imageZoomLevel = 1;
export let imagePanOffset = { x: 0, y: 0 };
export let isDraggingImage = false;
export let dragStart = { x: 0, y: 0 };

// Kanban Drag & Drop
export let draggedItem = null;
export let subKanbanDraggedItem = null;

// Notebook System
export let notebookItems = [];
export let currentPageId = null;
export let contextMenuTargetId = null;
export let notebookSidebarOpen = false;
export let pageHasChanges = false;
export let notebookDraggedItem = null;

// Mentions System removed

// State setters (for modules that need to update state)
export function setNotesData(data) { notesData = data; }
export function setCurrentTaskId(id) { currentTaskId = id; }
export function setModalPendingActions(actions) { modalPendingActions = actions; }
export function setModalHasChanges(value) { modalHasChanges = value; }
export function setOriginalTimerValue(value) { originalTimerValue = value; }
export function setOriginalPriorityValue(value) { originalPriorityValue = value; }
export function setCurrentModalPriority(value) { currentModalPriority = value; }
export function setOriginalTitleValue(value) { originalTitleValue = value; }
export function setEditingNoteEntryIndex(value) { editingNoteEntryIndex = value; }
export function setOriginalTagsValue(value) { originalTagsValue = value; }
export function setDb(database) { db = database; }
export function setClocksData(data) { clocksData = data; }
export function setDraggedClock(clock) { draggedClock = clock; }
export function setChronometerInterval(id, interval) { chronometerIntervals[id] = interval; }
export function deleteChronometerInterval(id) { delete chronometerIntervals[id]; }
export function setImageZoomLevel(level) { imageZoomLevel = level; }
export function setImagePanOffset(offset) { imagePanOffset = offset; }
export function setIsDraggingImage(value) { isDraggingImage = value; }
export function setDragStart(start) { dragStart = start; }
export function setDraggedItem(item) { draggedItem = item; }
export function setSubKanbanDraggedItem(item) { subKanbanDraggedItem = item; }
export function setNotebookItems(items) { notebookItems = items; }
export function setCurrentPageId(id) { currentPageId = id; }
export function setContextMenuTargetId(id) { contextMenuTargetId = id; }
export function setNotebookSidebarOpen(value) { notebookSidebarOpen = value; }
export function setPageHasChanges(value) { pageHasChanges = value; }
export function setNotebookDraggedItem(item) { notebookDraggedItem = item; }

// Helper to push to notesData
export function pushToNotesData(note) { notesData.push(note); }
export function pushToModalPendingActions(action) { modalPendingActions.push(action); }
export function pushToNotebookItems(item) { notebookItems.push(item); }
export function pushToClocksData(clock) { clocksData.push(clock); }
