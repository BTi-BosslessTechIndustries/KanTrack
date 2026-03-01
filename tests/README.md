# tests/

All automated tests for KanTrack.

---

## Structure

```
tests/
├── setup.js                  # Vitest global setup (mocks IDB, localStorage, crypto)
├── database.test.js          # IDB schema, migrations, image CRUD
├── repository.test.js        # getAllTasks, saveTasks, getAllNotebookItems, etc.
├── storage.test.js           # loadNotesFromLocalStorage, saveNotesToLocalStorage
├── storage-monitor.test.js   # quota monitoring and durable storage request
├── store.test.js             # Redux-like store: dispatch, subscribe, getState, reducer
├── router.test.js            # registerAction, initRouter, event delegation
├── undo.test.js              # recordAction, undo, redo, trash
├── utils.test.js             # pure utility functions: escapeHtml, formatTime, deepClone, etc.
├── priority.test.js          # getPriorityLabel, getPriorityColor
├── due-dates.test.js         # formatDueDate, formatRelativeDueDate, sortByDueDate, isOverdue, isDueToday, isDueSoon, getDueDateStatus, getDueDate, getOverdueTasks, getTasksDueToday, getTasksDueSoon, setDueDate
├── timer.test.js             # addTime(), quickAddTime(), LONG_PRESS_THRESHOLD
├── tags.test.js              # getTagDefinitions, getTagById, getTagColor, getPinnedTags, createTag, toggleTagPinned, setTagPinned, updateTag, deleteTag, cleanupUnusedTags, addTagToTask, removeTagFromTask, getTaskTags
├── search.test.js            # full-text search and tag/column filter logic
├── sorting.test.js           # priority-based column sort
├── import-validator.test.js  # .kantrack.json import validation and error cases
├── compaction.test.js        # oplog compaction worker logic
├── crypto.test.js            # encrypted export/import round-trips
├── sanitize.test.js          # allowlist HTML sanitizer (XSS protection)
├── focus-trap.test.js        # createFocusTrap() — Tab cycling and deactivation (uses JSDOM)
└── e2e/
    ├── smoke.spec.js         # Playwright E2E: create task + persist; set priority + persist
    ├── flows.spec.js         # Playwright E2E: delete, edit title, add note, undo/redo
    ├── accessibility.spec.js # Playwright E2E: keyboard shortcuts, ESC, arrow nav, focus (Phase 7)
    ├── import-export.spec.js # Playwright E2E: export/import round-trips (Phase 4)
    ├── performance.spec.js   # Playwright E2E: virtual list DOM node budget (Phase 5)
    ├── search.spec.js        # Playwright E2E: live search, case-insensitivity, ESC clear, no-match
    ├── header.spec.js        # Playwright E2E: header UI — dropdown, About modal, Shortcuts modal
    └── README.md
```

---

## Running unit tests

```bash
npm run test:run    # run once, exit
npm run test        # watch mode
npm run test:ui     # Vitest UI in browser
```

**529 tests across 19 files** — all should pass on every run.

### What is mocked

`tests/setup.js` sets up:

- **`fake-indexeddb`** — a complete in-memory IDB implementation (no browser required)
- **`localStorage`** — a Map-backed mock (global)
- **`document`** — minimal stub (no real DOM methods) so modules can import without crashing
- **`window`** — stub with no-op `dispatchEvent` / `addEventListener`
- **`navigator.storage`** — stub that returns fixed quota values

> **Tests that need real DOM** (e.g. `focus-trap.test.js`) import `JSDOM` directly and use
> `vi.stubGlobal('document', jsdomDoc)` to temporarily replace the setup.js stub with a real
> jsdom document for the duration of those tests.

---

## Running E2E tests

```bash
npm run build   # required first — E2E tests run against the production build
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
2. Import from the module under test (use `.js` extension — the vitest resolve alias maps `.js` → `.ts` automatically for TypeScript modules)
3. Use Vitest globals (`describe`, `it`, `expect`, `beforeEach`, `vi`) — they're injected automatically via `globals: true` in the config
4. The test file is automatically picked up by `include: ['tests/**/*.{test,spec}.*']`

Example skeleton:

```js
import { myFunction } from '../scripts/kantrack-modules/my-module.js';

describe('myFunction', () => {
  it('does the expected thing', () => {
    expect(myFunction('input')).toBe('expected output');
  });
});
```
