# tests/

All automated tests for KanTrack.

---

## Structure

```
tests/
├── setup.js                     # Vitest global setup (mocks IDB, localStorage, crypto)
├── compaction.test.js            # oplog compaction worker logic
├── context-menu.test.js          # floating context-menu positioning and keyboard handling
├── crypto.test.js                # encrypted export/import round-trips (AES-256-GCM)
├── database.test.js              # IDB schema, migrations, image CRUD
├── done-capacity.test.js         # Done column cap: oldest-overflow selection, doneAt backfill, permanent deletion
├── due-dates.test.js             # formatDueDate, isOverdue, isDueToday, getDueDateStatus, etc.
├── focus-trap.test.js            # createFocusTrap(): Tab cycling and deactivation (uses JSDOM)
├── clocks.test.js                # formatChronometer(): ms-to-"HH:MM:SS" formatting
├── hidden-cards.test.js          # hideCard/showCard/showCards, getHiddenTasks/getHiddenCount, countHiddenMatches, undo/redo, translated notifications
├── i18n.test.js                   # t(), interpolate(), getLanguage(), setLanguage(), applyTranslations(), dictionary completeness, translation key-usage scan
├── images.test.js                # image modal open/close and clipboard paste handler
├── images-paste.test.js          # paste handler routing: table (HTML+TSV) wins over image/tiff; plain-text fallback; Numbers/Excel clipboard fix (jsdom)
├── import-validator.test.js      # .kantrack.json import validation and error cases
├── loading.test.js               # loading overlay show/hide and progress indicator utilities
├── modal-notes.test.js           # task modal notes editor: add, render, history entries
├── notebook.test.js              # getChildItems(): notebook tree filter+sort
├── notebook-export.test.js       # notebook PDF export and ZIP export/import round-trips
├── notifications.test.js         # showError / showWarning / showInfo toast notifications
├── priority.test.js              # getPriorityLabel, getPriorityColor
├── repository.test.js            # getAllTasks, saveTasks, getAllNotebookItems, etc.
├── router.test.js                # registerAction, initRouter, event delegation
├── sanitize.test.js              # allowlist HTML sanitizer (XSS protection)
├── search.test.js                # full-text search and tag/column filter logic
├── sorting.test.js               # priority-based column sort
├── storage-monitor.test.js       # quota monitoring and durable storage request
├── storage.test.js               # loadNotesFromLocalStorage, saveNotesToLocalStorage
├── store.test.js                 # Redux-like store: dispatch, subscribe, getState, reducer
├── sub-kanban.test.js            # add/move/rename/delete sub-tasks, undo entries, language attributes
├── table-editor.test.js          # table grid navigation, cell selection, merge/unmerge, TSV paste, HTML paste, row/column add/delete (jsdom)
├── tags.test.js                  # tag CRUD, pinning, assignment, cleanupUnusedTags
├── timer.test.js                 # addTime(), quickAddTime(), LONG_PRESS_THRESHOLD
├── undo.test.js                  # recordAction, undo, redo, trash
├── utils.test.js                 # pure utility functions: escapeHtml, formatTime, deepClone, etc.
├── virtual-list.test.js          # VirtualList IntersectionObserver-based card rendering
└── e2e/
    ├── smoke.spec.js                   # Playwright E2E: create task + persist; set priority + persist
    ├── flows.spec.js                   # Playwright E2E: delete, edit title, add note, undo/redo, clock reset, hide/show cards, Done-cap dialog
    ├── accessibility.spec.js           # Playwright E2E: keyboard shortcuts, ESC, arrow nav, focus
    ├── drag-drop.spec.js               # Playwright E2E: card drag-and-drop between columns, doneAt stamping
    ├── import-export.spec.js           # Playwright E2E: export/import round-trips
    ├── notebook-import-export.spec.js  # Playwright E2E: Download everything button, notebook ZIP export/import, notebook item language attributes
    ├── performance.spec.js             # Playwright E2E: virtual list DOM node budget
    ├── search.spec.js                  # Playwright E2E: live search, case-insensitivity, ESC clear, no-match
    ├── header.spec.js                  # Playwright E2E: header UI, responsive layout, clock collapsed state, card size, language picker, UI translation
    ├── privacy.spec.js                 # Playwright E2E: privacy.html renders in the language set via cardLanguage
    ├── responsive.spec.js              # Playwright E2E: column layout, clock panel 700px breakpoint
    ├── sub-kanban.spec.js              # Playwright E2E: sub-task add/move/delete/rename within a task's mini-board, language attributes
    └── README.md
```

---

## Running unit tests

```bash
npm run test:run    # run once, exit
npm run test        # watch mode
npm run test:ui     # Vitest UI in browser
```

**868 tests across 34 files**: all should pass on every run.

### What is mocked

`tests/setup.js` sets up:

- **`fake-indexeddb`**: a complete in-memory IDB implementation (no browser required)
- **`localStorage`**: a Map-backed mock (global)
- **`document`**: stub with `getElementById`, `querySelector`, `querySelectorAll`, `createElement`, `addEventListener`, `removeEventListener`, and `body.appendChild` so modules can import without crashing. **Note:** under Vitest's module isolation (`isolate: true`), this stub is not reliably accessible as a bare `document` identifier inside production-module code. Test files that call production code which uses `document` must re-set `global.document` inside their own `beforeEach` (see `timer.test.js`, `tags.test.js`, `sorting.test.js`, `search.test.js` for the pattern).
- **`window`**: stub with no-op `dispatchEvent` / `addEventListener` — skipped when a real jsdom window is already present (same guard as the `document` stub, so `@vitest-environment jsdom` test files keep the full jsdom `window` including `getSelection`)
- **`navigator.storage`**: stub that returns fixed quota values

> **Tests that need real DOM** use one of two patterns:
>
> - `focus-trap.test.js` imports `JSDOM` directly and uses `vi.stubGlobal('document', jsdomDoc)` to replace the setup.js stub for the duration of those tests.
> - `table-editor.test.js` and `images-paste.test.js` use the `@vitest-environment jsdom` file-level annotation, which installs a full jsdom environment (including `window.getSelection`) before `setup.js` runs. The `setup.js` window stub is guarded to skip when a real jsdom window is present.

---

## Running E2E tests

```bash
npm run build   # required first: E2E tests run against the production build
npm run e2e     # build + start vite preview + run Playwright
npm run e2e:ui  # same but opens the Playwright UI
```

E2E tests require a working Chromium install:

```bash
npx playwright install chromium
```

See [`e2e/README.md`](e2e/README.md) for details on what the E2E tests cover and how to extend them.

---

## Adding a new unit test

1. Create `tests/<module-name>.test.js`
2. Import from the module under test (use `.js` extension: the vitest resolve alias maps `.js` → `.ts` automatically for TypeScript modules)
3. Use Vitest globals (`describe`, `it`, `expect`, `beforeEach`, `vi`): they're injected automatically via `globals: true` in the config
4. The test file is automatically picked up by `include: ['tests/**/*.test.{js,ts}']`

Example skeleton:

```js
import { myFunction } from '../scripts/kantrack-modules/my-module.js';

describe('myFunction', () => {
  it('does the expected thing', () => {
    expect(myFunction('input')).toBe('expected output');
  });
});
```
