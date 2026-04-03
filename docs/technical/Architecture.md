# KanTrack — Technical Architecture

> **Audience:** Engineers working on or auditing the KanTrack codebase.
> **Scope:** Internal module design, data flow, storage model, and component interactions.

---

## 1. Overview

KanTrack is a single-page, local-first Kanban board application. It runs entirely in the browser. There is no backend server, no account system, and no network communication except serving the static asset bundle itself.

**Key properties:**

- Vanilla JavaScript + TypeScript, ES modules, no runtime framework
- Build: Vite 5 (Rollup under the hood)
- Persistence: `localStorage` (synchronous, primary) + IndexedDB (asynchronous, fallback)
- Test suite: Vitest (529 unit) + Playwright (43 E2E)
- Entry point: `index.html` → `scripts/kantrack.js`

---

## 2. Directory Structure

```
KanTrack/
├── index.html                        # SPA shell, CSP meta tag, all modal markup
├── package.json
│
├── scripts/
│   ├── kantrack.js                   # Bootstrap, event wiring, keyboard shortcuts
│   │
│   └── kantrack-modules/             # Feature modules (ES modules, tree-shaken)
│       ├── state.js                  # Shared mutable in-memory state
│       ├── storage.js                # Thin shim: state ↔ repository
│       ├── repository.ts             # Persistence logic (localStorage + IDB, debounce)
│       ├── database.js               # IndexedDB schema + CRUD helpers
│       ├── store.ts                  # Minimal flux store (typed, frozen snapshots)
│       ├── router.ts                 # data-action event delegation
│       │
│       ├── tasks.js                  # Task CRUD, virtual list init
│       ├── modal.js                  # Task detail modal (open/close/save)
│       ├── virtual-list.js           # IntersectionObserver windowed rendering
│       │
│       ├── undo.js                   # Undo/redo stacks + oplog persistence
│       ├── search.js                 # Full-text search + tag/column filtering
│       ├── tags.js                   # Tag definitions, assignment, pin/unpin
│       ├── due-dates.js              # Due date CRUD, overdue/today/soon predicates
│       ├── priority.js               # Priority levels + sort values
│       ├── timer.js                  # Per-task time tracker
│       ├── sorting.js                # Column sort (priority-first)
│       ├── drag-drop.js              # Mouse + touch drag between columns
│       ├── sub-kanban.js             # Sub-task decomposition
│       │
│       ├── notebook.js               # Notebook sidebar + page editor
│       ├── notebook-export.js        # Notebook ZIP/PDF export
│       ├── mentions.js               # @mention system inside notebooks
│       │
│       ├── clocks.js                 # World clocks + chronometers
│       ├── timezones.js              # Timezone data
│       │
│       ├── export.js                 # Board exports (JSON, encrypted, HTML)
│       ├── import-validator.js       # Import file structure validation
│       │
│       ├── sanitize.js               # Allowlist HTML sanitizer
│       ├── crypto.js                 # AES-256-GCM + PBKDF2 encryption
│       │
│       ├── images.js                 # Clipboard paste + image viewer
│       ├── notifications.js          # Toast notifications
│       ├── compaction.js             # Oplog compaction scheduler
│       ├── storage-monitor.js        # StorageManager quota monitoring
│       ├── loading.js                # Loading state helpers
│       ├── context-menu.js           # Context menu utility
│       ├── utils.js                  # Shared utilities + createFocusTrap
│       └── types.ts                  # Shared TypeScript interfaces
│
│   └── workers/
│       ├── export-worker.js          # JSON.stringify() off main thread
│       └── compaction-worker.js      # Oplog filter computation off main thread
│
├── styles/
│   ├── base.css                      # Layout, typography, CSS variables
│   ├── components.css                # Buttons, cards, modals, inputs
│   ├── features.css                  # Board, sidebar, notebook, clocks
│   └── responsive.css                # Mobile/tablet breakpoints
│
├── tests/
│   ├── setup.js                      # Vitest global stubs (fake-indexeddb, localStorage, document)
│   ├── *.test.js                     # 19 unit test files
│   └── e2e/*.spec.js                 # 7 Playwright spec files
│
└── config/
    ├── vite.config.js
    ├── vitest.config.js
    └── playwright.config.js
```

---

## 3. Layer Model

```
┌─────────────────────────────────────────────────────┐
│                      UI Layer                       │
│  index.html  ·  kantrack.js  ·  feature modules    │
│  (tasks, modal, search, tags, undo, notebook …)     │
└───────────────────────┬─────────────────────────────┘
                        │ reads / writes
                        ▼
┌─────────────────────────────────────────────────────┐
│                    State Layer                      │
│  state.js  — mutable in-memory singleton            │
│  store.ts  — immutable snapshots / flux dispatch    │
└───────────────────────┬─────────────────────────────┘
                        │ serialise / load
                        ▼
┌─────────────────────────────────────────────────────┐
│                 Repository Layer                    │
│  storage.js  — state ↔ repo shim                   │
│  repository.ts — persistence logic, debounce, sync  │
└───────────┬───────────────────────┬─────────────────┘
            │ sync write            │ async write (300ms)
            ▼                       ▼
┌───────────────────┐   ┌───────────────────────────┐
│   localStorage    │   │        IndexedDB           │
│  (primary store)  │   │   (fallback / images)      │
└───────────────────┘   └───────────────────────────┘
```

---

## 4. State Layer

### 4.1 `state.js`

Module-level `let` bindings that act as the shared, mutable in-memory state. Exported as live bindings; every module that imports them sees the current value.

Key exports:

| Variable          | Type                  | Purpose                                            |
| ----------------- | --------------------- | -------------------------------------------------- |
| `notesData`       | `Task[]`              | All tasks (loaded from localStorage on boot)       |
| `clocksData`      | `Clock[]`             | Clock widget definitions                           |
| `notebookItems`   | `NotebookItem[]`      | Notebook tree (metadata only; content lazy-loaded) |
| `draggedItem`     | `HTMLElement \| null` | Active drag target                                 |
| `currentTaskId`   | `string \| null`      | Task open in modal                                 |
| `currentPageId`   | `string \| null`      | Notebook page open in editor                       |
| `modalHasChanges` | `boolean`             | Dirty flag for unsaved-change prompt               |

Setter functions (e.g. `setNotesData`, `setModalHasChanges`) are co-exported to allow atomic updates and signal intent.

### 4.2 `store.ts`

A minimal, typed flux store layered _on top of_ `state.js`. It maintains frozen immutable snapshots that components can subscribe to reactively. Currently used for bootstrapping; not all writes flow through it.

```
dispatch(TASK_ADD, task) → reducer(state, action) → frozen snapshot → notify subscribers
```

---

## 5. Persistence Layer

### 5.1 Dual-Write Model

Every write goes to **localStorage synchronously**, then to **IndexedDB asynchronously** (300 ms debounced). This gives:

- Instant read-after-write (localStorage, no await)
- Durable long-term storage (IDB, survives localStorage clears in some browsers)
- Non-blocking main thread (IDB writes deferred)

**On boot**, `repository.ts` reads from `localStorage` first. If the key is absent or empty, it falls back to an IDB `getAll`. This means fresh private-browsing tabs that inherit IDB from a prior session still load data correctly.

```
saveNotesToLocalStorage()
    └─ repository.ts:saveTasks(tasks)
            ├─ localStorage.setItem('kanbanNotes', JSON.stringify(tasks))     ← sync
            └─ setTimeout(300ms) → idbClearAndBulkPut('tasks', snapshot)     ← async
```

### 5.2 `storage.js`

A thin shim that adds state.js interaction around `repository.ts`. It is the _only_ public API that other modules call when they want to persist tasks.

```js
// storage.js
export function saveNotesToLocalStorage() {
  return _saveTasks([...notesData]); // reads from state, calls repository
}
```

### 5.3 `repository.ts`

Business logic for persistence. Rules enforced here:

- **Only this file and `database.js` touch `localStorage` / IDB** for business data
- **Does not import `state.js`** — pure persistence, no circular deps
- Debounced IDB writes (300 ms `setTimeout`, reset on each call)
- Fires `onAutoSaveCallback` after every write (shows the "Saved" indicator)
- Migrates legacy data formats on load

### 5.4 `database.js`

IndexedDB schema + all CRUD helpers.

**Schema (v3, 10 stores):**

| Store            | Key                    | Purpose                                                                      |
| ---------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `tasks`          | `id`                   | Task snapshots                                                               |
| `notebook_items` | `id`                   | Notebook page/folder metadata                                                |
| `tags`           | `id`                   | Tag definitions                                                              |
| `clocks`         | `id`                   | Clock widget definitions                                                     |
| `trash`          | `id`                   | Soft-deleted tasks                                                           |
| `images`         | `${taskId}_${imageId}` | Task + notebook images (Base64 data URLs)                                    |
| `oplog`          | `opId`                 | Operation log for undo/redo                                                  |
| `undo_history`   | `id`                   | Legacy undo stack (superseded by oplog)                                      |
| `meta`           | string key             | Infrastructure values (migrationDone, schemaVersion, deviceId, lamportClock) |
| `prefs`          | string key             | UI preferences                                                               |

---

## 6. Bootstrap Sequence

`kantrack.js` owns the startup sequence. Abbreviated:

```
DOMContentLoaded
  1. initRouter()                    — attach single delegated click listener
  2. initIndexedDB()                 — open / upgrade IDB schema
  3. runDataMigrations()             — migrate localStorage → IDB if needed
  4. loadNotesFromLocalStorage()     — hydrate state.notesData
  5. dispatch(TASK_SET_ALL, notes)   — bootstrap flux store
  6. initVirtualLists(notes)         — create one VirtualList per column
  7. initTags()                      — load tag definitions from IDB
  8. renderTagFilterButtons()
  9. initUndo()                      — reconstruct undo stacks from oplog
 10. scheduleCompaction()            — hourly background oplog cleanup
 11. initSearch()                    — attach search input listeners
 12. loadClocks()                    — hydrate clocksData
 13. cleanupUnusedTags()
 14. sortAllColumnsByPriority()
 15. applyFilters()                  — apply any active search/tag filters
 16. requestDurableStorage()         — request persistent quota
 17. initStorageMonitor()            — background quota monitoring
 18. setupDragAndDrop()
 19. setupClipboardPaste()           — images.js paste handler
 20. loadNotebookFromLocalStorage() + renderNotebookTree()
     Keyboard shortcuts, custom event listeners, modal backdrop handlers
```

---

## 7. Router (`router.ts`)

A single delegated click listener on `document` maps `data-action` attributes to registered handler functions. This eliminates all inline `onclick` handlers and allows dynamic markup to participate in the action system without re-attaching listeners.

```html
<button data-action="task:delete" data-action-param="abc123">Delete</button>
```

```js
registerAction('task:delete', param => deleteNote(param));
initRouter(); // Called once at boot
```

`data-action-param` is passed as the first argument to the handler.

---

## 8. Virtual List

### Problem

DOM columns with hundreds of task cards cause layout thrashing and memory pressure. Rendering all of them on load is not feasible.

### Solution

`VirtualList` (in `virtual-list.js`) renders only the visible window of cards using `IntersectionObserver`.

### Structure

Each column's card area is wrapped:

```
.column
  └── .cards-container
        ├── #topSentinel          ← IntersectionObserver target
        ├── .vl-spacer-top        ← height = (firstRenderedIndex × estimatedCardHeight)
        │
        │   ... rendered cards (INITIAL_RENDER=20 + BUFFER=5) ...
        │
        ├── .vl-spacer-bottom     ← height = remaining cards × estimatedCardHeight
        └── #bottomSentinel       ← IntersectionObserver target
```

When a sentinel becomes visible, `VirtualList._onSentinelIntersect()` expands or contracts the render window.

### Inversion-of-Control Hooks

Sorting and search cannot import `tasks.js` directly (circular dependency). Instead:

```js
// tasks.js
registerVLUpdater(updateColumnVirtualList); // used by sorting.js
registerVLUpdaterForFilters(updateColumnVirtualList); // used by search.js
```

When a filter or sort changes, the registered callback is invoked with the column id. `updateColumnVirtualList` re-sorts, re-filters, and pipes the full data set to `vl.update()`.

---

## 9. Undo/Redo System

### In-Memory Stacks

```
undoStack []   MAX_HISTORY = 200
redoStack []
```

`recordAction({ type, taskId, previousState, newState, description })` pushes to `undoStack` and clears `redoStack`.

### Oplog Persistence

Every action is also written to IDB `oplog` store asynchronously (fire-and-forget). On next boot, `_loadStacksFromOplog()` reconstructs both stacks from the oplog, giving undo/redo durability across page reloads.

### Action Types

| Type       | Undo behaviour                    |
| ---------- | --------------------------------- |
| `create`   | Remove the created task           |
| `delete`   | Restore the deleted task          |
| `update`   | Apply `previousState` to the task |
| `move`     | Revert `task.column`              |
| `priority` | Revert `task.priority`            |
| `timer`    | Revert timer value                |
| `tags`     | Revert `task.tags`                |
| `dueDate`  | Revert `task.dueDate`             |
| `notes`    | Revert `task.noteEntries`         |

### Trash (Soft Delete)

Deleted tasks are soft-deleted (`task.deleted = true`) in `state.notesData` and simultaneously cloned to `trashedTasks[]` (persisted in IDB `trash` store). Keeping the soft-deleted entry in `state.notesData` ensures tag cleanup and due-date queries can correctly exclude or account for them. `TRASH_SOFT_CAP = 200` — oldest entries auto-purged when limit is exceeded. Users can restore or permanently delete from the trash panel.

- **Restore** — removes `task.deleted`, pushes a "Restored from trash" history entry, replaces the soft-deleted entry in `state.notesData` in-place (preventing duplicates).
- **Permanent delete / empty trash** — removes entries from both `trashedTasks[]` and `state.notesData`, then calls `cleanupUnusedTags()`.

### Oplog Compaction

`compaction-worker.js` runs hourly (via `scheduleCompaction()`). It filters the oplog to remove stale undone entries beyond the MAX_HISTORY window, keeping the store bounded.

---

## 10. Search & Filter System

### Filter State (`search.js`)

| State                 | Type             | Behaviour                                                |
| --------------------- | ---------------- | -------------------------------------------------------- |
| `currentSearchTerm`   | `string`         | Case-insensitive substring match on title + note preview |
| `currentTagFilter`    | `string[]`       | AND logic — task must have ALL selected tags             |
| `currentColumnFilter` | `string \| null` | Show only one column's tasks                             |

### `checkTaskVisibility(task)`

Returns `true` if the task passes all active filters. Called by `applyFilters()` and by VirtualList's render function.

### Search Debounce

Input events are debounced 200 ms before `applyFilters()` runs, preventing per-keystroke re-renders on large boards.

### VirtualList Integration

`applyFilters()` calls the registered VL updater for each column. The VL receives the full filtered+sorted dataset and re-renders its window.

---

## 11. Tag System

### Tag Definition

```ts
{
  id: string;          // derived: name.toLowerCase().replace(/[^a-z0-9]/g, '-')
  name: string;        // display name (max 20 chars)
  colorIndex: number;  // 0–9 index into TAG_COLORS[]
  pinned: boolean;     // if true, shown in the filter bar
  customColor?: string; // optional hex (e.g. "#8b5cf6") — overrides colorIndex
}
```

Stored in IDB `tags` store. Up to **5 tags per task** (`MAX_TAGS_PER_TASK`).

### Color Palette

10 predefined colours (red, orange, yellow, green, teal, blue, indigo, purple, pink, gray). Each has a foreground hex + a 20%-opacity background via `TAG_COLORS[]`. Tags can also use a custom hex colour set via `<input type="color">` in the tag creator; `resolveTagColor(tag)` selects between the two.

### Pinned Tags

Pinned tags appear in the board's filter bar. Clicking a pinned tag adds it to `currentTagFilter`. Filter uses AND logic for multiple selections.

Inside the task modal, pinned tags are also shown in a dedicated management panel above the dropdown, with **Assign** (add to task) and **Delete** (remove tag permanently) actions — removing the need to open the dropdown to manage pinned tags.

### Tag Filter Matching

`checkTaskVisibility()` in `search.js` compares tag IDs directly (`currentTagFilter.some(id => taskTagIds.includes(id))`). Name-based comparison was removed to prevent false matches between tags with similar names.

### Cleanup

`cleanupUnusedTags()` removes unpinned tags not referenced by any task. It scans **all** tasks in `state.notesData`, including soft-deleted (trashed) ones, so a tag referenced only by a trashed task is preserved until that task is permanently deleted. Called at boot and after task deletion or permanent trash operations.

---

## 12. Due Dates

Tasks carry an optional `dueDate: string` (ISO `YYYY-MM-DD`).

| Predicate    | Condition                                                                      |
| ------------ | ------------------------------------------------------------------------------ |
| `isOverdue`  | `task.column !== 'done'` AND `dueDate < today`                                 |
| `isDueToday` | `task.column !== 'done'` AND `dueDate.toDateString() === today.toDateString()` |
| `isDueSoon`  | `task.column !== 'done'` AND `today < dueDate ≤ today + 3 days`                |

`getDueDateStatus` returns `'overdue' | 'today' | 'soon' | 'normal'`. This drives the CSS class applied to the due date badge on each task card.

All mutations via `setDueDate(taskId, isoDate | null)` — records an undo action and saves.

---

## 13. Export / Import System

### Board Export Formats

| Format             | Extension        | Contents                                           | Encrypted |
| ------------------ | ---------------- | -------------------------------------------------- | --------- |
| Full backup        | `.kantrack.json` | Tasks, tags, notebook, clocks, images (Base64)     | No        |
| Lightweight backup | `.kantrack.json` | Tasks, tags, notebook, clocks — **no images**      | No        |
| Encrypted backup   | `.kantrack.enc`  | Full backup + AES-256-GCM                          | Yes       |
| Board snapshot     | `.html`          | Read-only visual render of the board               | No        |
| Task export        | `.pdf`           | Single task notes + timeline (jsPDF + html2canvas) | No        |

### Notebook Export Formats

| Format           | Contents                                                  |
| ---------------- | --------------------------------------------------------- |
| Folder `.zip`    | All pages in folder, images embedded, preserves hierarchy |
| All pages `.zip` | Every notebook page                                       |

### Import Modes

- **Merge** — appends imported tasks/items not already present (matched by `id`)
- **Replace** — replaces all local data (auto-downloads a lightweight backup first as safety net)

### Worker Thread

`export-worker.js` receives the full payload and runs `JSON.stringify()` off the main thread to prevent UI freezes on large exports.

### Encryption (`crypto.js`)

```
Algorithm : AES-256-GCM
Key derive: PBKDF2-SHA256, 100 000 iterations
IV        : 12 bytes (random, prepended to ciphertext)
Salt      : 16 bytes (random, prepended before IV)

Binary layout: [ 16 B salt ][ 12 B IV ][ ciphertext ]

encryptWorkspace(json, passphrase) → ArrayBuffer
decryptWorkspace(buffer, passphrase) → string (JSON)
```

No keys are stored. The key is re-derived from the passphrase on every encrypt/decrypt call.

---

## 14. Notebook System

### Data Model

```ts
{
  id: string;
  type: 'page' | 'folder';
  name: string;
  parentId: string | null;   // null = root
  content?: string;          // HTML (lazy-loaded from IDB on open)
  images: string[];          // imageId list; data stored in images IDB store
  order: number;
}
```

### Content Lazy Loading

Notebook item metadata (name, type, parentId, order) is kept in memory. `content` is loaded from IDB only when a page is opened in the editor (`getNotebookItemContent(pageId)`). This keeps the in-memory footprint small for notebooks with many pages.

### Image Storage

Images are stored in IDB under the composite key `notebook_${pageId}_${imageId}`. They are embedded in workspace exports (full mode only) and restored on import.

---

## 15. Accessibility Layer

Implemented in Phase 7. Key components:

- **`createFocusTrap(containerEl)`** (`utils.js`) — returns `{ activate(), deactivate() }`. Traps keyboard focus inside a modal; wraps Tab/Shift+Tab at boundaries. Activated on modal open, deactivated on close.
- **Focus restore** — each modal saves `document.activeElement` before opening and restores it on close.
- **ESC chain** — single global `keydown` handler closes the topmost open modal/panel in priority order.
- **Card keyboard nav** — task cards have `tabIndex=0`. Arrow keys navigate within a column; Enter/Space opens the modal.
- **ARIA** — all modals carry `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
- **`.sr-only`** — visually-hidden utility class for screen-reader-only labels (`base.css`).

---

## 16. CSS Architecture

### Variables (defined in `base.css`)

```css
--primary-color: #3b82f6 --secondary-color: #6366f1 --danger-color: #ef4444 --warning-color: #f59e0b
  --success-color: #22c55e --background-color: #ffffff --surface-color: #f8fafc
  --border-color: #e2e8f0 --text-primary: #1e293b --text-secondary: #64748b
  --notebook-sidebar-width: 300px (resizable via JS);
```

### Stylesheet Responsibilities

| File             | Purpose                                                         |
| ---------------- | --------------------------------------------------------------- |
| `base.css`       | Reset, layout, typography, colour variables, `.sr-only`         |
| `components.css` | Buttons, modals, inputs, dropdowns, tag chips, shortcuts dialog |
| `features.css`   | Kanban board, cards, sidebar, notebook, clocks, due-date badges |
| `responsive.css` | Breakpoints at 320px, 768px, 1024px                             |

---

## 17. Build & Test

### Build

```bash
npm run build      # Vite → dist/ (Rollup tree-shaking, ES modules)
npm run preview    # Serve dist/ locally
```

Web Workers are bundled as separate chunks. `jsPDF` and `html2canvas` are excluded from Vite's pre-bundling (complex ESM internals).

### Unit Tests

```bash
npm run test:run   # Vitest — 529 tests, ~1.5 s
npm run test       # Vitest watch mode
npm run test:ui    # Vitest browser UI
```

Config: `config/vitest.config.js`
Environment: `node` (not jsdom). `tests/setup.js` installs `fake-indexeddb`, `localStorage` stub, `window`/`document` stubs, `CustomEvent`, and `navigator.storage`.

### E2E Tests

```bash
npm run e2e        # Playwright headless — 43 tests, ~35 s
npm run e2e:ui     # Playwright interactive
```

Config: `config/playwright.config.js`
Browser: Chromium (single worker, serial).

### Linting

```bash
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier write
npm run typecheck      # tsc --noEmit
```

---

## 18. Module Dependency Summary

```
kantrack.js
  ├── router.ts
  ├── state.js
  ├── storage.js ──────── repository.ts ──── database.js
  ├── tasks.js ─────────── state.js, storage.js, undo.js, virtual-list.js
  ├── modal.js ─────────── state.js, storage.js, undo.js, due-dates.js, tags.js, timer.js
  ├── undo.js ──────────── state.js, storage.js, repository.ts, notifications.js
  ├── search.js ─────────── state.js
  ├── tags.js ──────────── state.js, storage.js, repository.ts
  ├── due-dates.js ────────── state.js, storage.js, undo.js, utils.js
  ├── sorting.js ──────────── state.js
  ├── drag-drop.js ──────── state.js, storage.js, undo.js
  ├── notebook.js ──────── state.js, storage.js, repository.ts, database.js
  ├── export.js ──────────── state.js, repository.ts, database.js, crypto.js, sanitize.js
  ├── clocks.js ─────────── state.js, storage.js
  └── utils.js              (no upstream imports)
```

`sanitize.js` and `crypto.js` have no imports from the KanTrack module graph. They are standalone utilities.

---

## 19. Data Flow: End-to-End Examples

### Create a task

```
User types title in #newNote input, presses Enter
  → addNote() in tasks.js
  → { id, title, column:'todo', noteEntries:[], timer:0, … }
  → recordAction({ type:'create', … })      [undo.js]
  → state.notesData.push(newTask)
  → saveNotesToLocalStorage()               [storage.js → repository.ts]
      → localStorage.setItem(…)            [sync]
      → IDB write in 300 ms               [async]
  → updateColumnVirtualList('todo')
  → window.dispatchEvent('kantrack:updateColumnCounts')
```

### Import an encrypted workspace

```
User selects .kantrack.enc file
  → importBoardFromFile() [export.js]
  → validateImportFile(file)               [import-validator.js]
  → User enters passphrase in prompt
  → decryptWorkspace(buffer, passphrase)   [crypto.js]
      → PBKDF2 key derivation (100k iter)
      → AES-GCM decrypt
      → JSON.parse
  → sanitize all HTML fields               [sanitize.js]
  → User chooses Merge or Replace
  → If Replace: export lightweight backup first (safety net)
  → applyImport(data, mode)
      → update state.notesData
      → saveTasks, saveTags, saveNotebookItems …
  → updateColumnVirtualList (all columns)
  → showSuccess('Imported N tasks')
```
