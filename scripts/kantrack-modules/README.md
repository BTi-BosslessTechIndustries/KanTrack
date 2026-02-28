# scripts/kantrack-modules/

Every feature module of the KanTrack application. Each file has one responsibility.

---

## TypeScript core (typed infrastructure)

| File            | What it does                                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`      | Shared domain types: `Task`, `Column`, `Priority`, `Tag`, `NotebookItem`, `Clock`, `UndoEntry`                                                             |
| `store.ts`      | Minimal flux-like store — `dispatch()`, `subscribe()`, `getState()`, typed reducer, `TASK_*` action types                                                  |
| `router.ts`     | Event delegation router — `registerAction()` maps `data-action` names to handlers; `initRouter()` attaches one document-level click listener               |
| `repository.ts` | **All** persistence logic: `getAllTasks()`, `saveTasks()`, `getAllNotebookItems()`, etc. Writes localStorage synchronously and IDB async (fire-and-forget) |

---

## JavaScript feature modules

| File                 | What it does                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `clocks.js`          | World clock panel: add/remove timezone clocks and chronometers                                                                             |
| `context-menu.js`    | Generic floating context-menu utility used by priority and timer pickers                                                                   |
| `database.js`        | Raw IndexedDB setup, schema migration runner, image CRUD helpers                                                                           |
| `drag-drop.js`       | Drag-and-drop between kanban columns; touch drag support                                                                                   |
| `due-dates.js`       | Due date picker render, overdue/today status detection and card CSS classes                                                                |
| `export.js`          | Export a single task as PDF (uses jsPDF)                                                                                                   |
| `images.js`          | Image modal viewer; clipboard paste-to-image handler                                                                                       |
| `loading.js`         | Loading overlay and progress indicator utilities                                                                                           |
| `mentions.js`        | Disabled @mention system — kept as no-ops for backward compatibility                                                                       |
| `modal.js`           | Task detail modal: `openTaskModal()`, `saveAndCloseModal()`, `closeTaskModal()`, note history render                                       |
| `notebook-export.js` | Export notebook pages as PDF or entire notebook as ZIP (uses jsPDF + JSZip)                                                                |
| `notebook.js`        | Notebook sidebar: page/folder tree, page editor modal, import/export                                                                       |
| `notifications.js`   | `showError()` / `showWarning()` / `showInfo()` toast notifications                                                                         |
| `priority.js`        | Priority logic: `setModalPriority()`, `updateNoteCardPriority()`, quick priority context menu                                              |
| `search.js`          | Search bar and tag/column filter overlay                                                                                                   |
| `sorting.js`         | Priority-based sort within a kanban column (`sortColumnByPriority()`)                                                                      |
| `state.js`           | Shared mutable state object — 27 values + 44 setters. The central source of truth for in-memory app state                                  |
| `storage.js`         | Thin shim: wraps `repository.ts` calls with `state.js` interaction. Provides `loadNotesFromLocalStorage()` and `saveNotesToLocalStorage()` |
| `storage-monitor.js` | Requests durable storage, monitors quota, dispatches warning notifications                                                                 |
| `sub-kanban.js`      | Nested sub-kanban board inside the task modal                                                                                              |
| `tags.js`            | Tag creation, assignment, color coding, tag selector render                                                                                |
| `tasks.js`           | Core task CRUD: `addNote()`, `deleteNote()`, `createNoteElement()`, `updateNoteCardDisplay()`                                              |
| `timer.js`           | Task timer: add/remove time, quick-time context menu, long-press support                                                                   |
| `timezones.js`       | Static timezone data list used by the clock system                                                                                         |
| `undo.js`            | Undo/redo system: `recordAction()`, `undo()`, `redo()`, trash integration                                                                  |
| `utils.js`           | Pure utilities: `formatTime()`, `escapeHtml()`, `getTextPreview()`, `deepClone()`, `validateTitle()`                                       |

---

## Key data flows

### Creating a task

`addNote()` (tasks.js) → `state.pushToNotesData()` → `saveNotesToLocalStorage()` → `repository.saveTasks()` → localStorage (sync) + IDB (async)

### Saving modal changes

`saveAndCloseModal()` (modal.js) → mutates task in `notesData` → `updateNoteCardPriority()` → `saveNotesToLocalStorage()` → `updateNoteCardDisplay()` → `closeTaskModal()`

### Loading on startup

`loadNotesFromLocalStorage()` (storage.js) → `repository.getAllTasks()` → IDB (primary) or localStorage (fallback) → `state.setNotesData()` → render all cards
