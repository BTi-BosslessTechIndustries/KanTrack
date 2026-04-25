# tests/e2e/

Playwright end-to-end smoke tests. These run against the **production build** (not the dev server) to catch issues that only appear after bundling.

---

## Spec files

| File                    | Tests | What it covers                                                                                             |
| ----------------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| `smoke.spec.js`         | 2     | Create task + persist; set priority + persist after reload                                                 |
| `flows.spec.js`         | 6     | Delete, edit title, add note, undo, undo-persist, redo                                                     |
| `accessibility.spec.js` | 9     | Keyboard shortcuts (N, /, ?), ESC closes modals, Enter/arrow card nav                                      |
| `import-export.spec.js` | 7     | JSON export/import, encrypted export/import, format-version validation                                     |
| `performance.spec.js`   | 2     | Virtual list DOM node budget (200 tasks, scroll to bottom)                                                 |
| `search.spec.js`        | 5     | Live search filtering, case-insensitivity, clear, ESC clear, no-match                                      |
| `header.spec.js`        | 15    | Support Us modal (open, ESC, backdrop, close btn), credit button, ⋮ dropdown, About modal, Shortcuts modal |

---

## What is tested

### `smoke.spec.js` — core persistence

**Test 1 — Create a task and verify it persists after reload**

1. Open the app
2. Fill in the `#newNote` input and click the Add button (`[data-action="task:add"]`)
3. Assert the task card appears in the `#todo` column
4. Hard reload the page (`waitUntil: 'networkidle'`)
5. Assert the card is still there (data survived the reload via IDB/localStorage)

**Test 2 — Open the task modal, set priority, and verify it persists after reload**

1. Create a task (same as above)
2. Click the card's `<strong>` title element to open the task modal
3. Click the "High" priority button (`[data-action="task:setPriority"][data-action-param="high"]`)
4. Assert `#modalPriorityLabel` shows "High"
5. Click "Save & Close" (`[data-action="task:saveModal"]`)
6. Assert modal is hidden
7. Assert the card element has the `priority-high` CSS class (DOM was updated synchronously)
8. **Poll IDB** until the task's `priority === 'high'` is confirmed in the database (see note below)
9. Hard reload
10. Assert the card still has `priority-high` class after reload

---

### `flows.spec.js` — user flows

**Test 1 — Delete a task via the modal**

1. Create a task
2. Open the modal, click Delete (`[data-action="task:deleteModal"]`)
3. Accept the browser confirm dialog
4. Assert the card is gone from the board

**Test 2 — Edit task title in the modal and verify it persists after reload**

1. Create a task
2. Open modal, double-click `#modalTitle` to enable editing
3. Type a new title, press Enter
4. Save & Close
5. Assert card shows the new title
6. Poll IDB until the new title is committed
7. Reload — assert title still correct

**Test 3 — Add a note entry and verify the preview appears after reload**

1. Create a task
2. Open modal, type into `#modalNotesEditor` (contenteditable)
3. Save & Close
4. Assert the card's `.note-text` is no longer "No additional notes"
5. Poll IDB until `noteEntries.length > 0`
6. Reload — assert note preview still present

**Test 4 — Undo removes a newly created task**

1. Create a task
2. Click the Undo button (`[data-action="history:undo"]`)
3. Assert the card is gone from the board

**Test 5 — Undo survives a page refresh (oplog persistence)**

1. Create a task, wait for the oplog entry to commit to IDB
2. Reload the page (oplog rebuilds the undo stack)
3. Assert the task is still visible
4. Undo — assert the card is gone (stack was rebuilt correctly)

**Test 6 — Redo re-applies an undone action**

1. Create a task, undo it, redo it — assert card reappears

---

### `accessibility.spec.js` — keyboard shortcuts & focus (Phase 7)

- **ESC closes task modal** — open modal via card click, press Escape
- **N key** focuses `#newNote` input when no modal is open
- **/ key** focuses `#taskSearchInput` when no modal is open
- **? key** opens `#shortcutsModal`
- **ESC closes shortcuts dialog**
- **Close button** (`×`) closes shortcuts dialog
- **Enter on focused card** opens the task modal (cards have `tabIndex=0`)
- **ArrowDown / ArrowUp** move focus between cards in a column

---

### `import-export.spec.js` — export / import round-trips (Phase 4)

- JSON export produces `.kantrack.json` with correct structure
- Lightweight export strips `imageData`
- JSON import (Merge) — imported task appears after reload
- Import summary shows task count
- Unsupported `formatVersion` shows an error
- Encrypted export + import round-trip restores data
- Encrypted import with wrong passphrase shows an error

---

### `performance.spec.js` — virtual list DOM budget (Phase 5)

- 200 tasks renders fewer than 30 `.note` DOM nodes initially
- Scrolling to the bottom keeps the DOM count below 60

---

### `search.spec.js` — live search & filter

- Typing in the search box shows only cards whose titles match
- Search is case-insensitive (uppercase title, lowercase query)
- Clearing the search box restores all cards
- Pressing ESC while the search input is focused clears the term and restores cards
- A search with no matches results in zero matching cards rendered

---

### `header.spec.js` — header UI

- **Support Us button** — clicking it opens `#supportModal`
- **ESC** closes the Support modal
- **Backdrop click** closes the Support modal
- **Close button** closes the Support modal
- **Credit button** — visible, links to the BTi website
- **⋮ menu button** — clicking opens `#headerDropdown`
- **Click outside** — clicking the board area closes the open dropdown
- **Toggle** — clicking the menu button a second time closes the dropdown
- **About modal** — "About KanTrack" item opens `#aboutModal`
- **ESC** closes the About modal
- **Backdrop click** closes the About modal
- **Close button** closes the About modal
- **Scroll position** — About modal opens scrolled to the top
- **Shortcuts from dropdown** — "Shortcuts" item opens `#shortcutsModal`
- **Backdrop click** closes the Shortcuts modal

---

## IDB polling pattern

`saveTasks()` in `repository.ts` writes localStorage **synchronously** but fires the IDB write as a **fire-and-forget** async operation. On reload, `getAllTasks()` prefers **localStorage** (always up-to-date after a sync write) and falls back to IDB. The IDB polling pattern in tests is retained as a safety net to confirm the async write also completed before reloading:

The fix: use `page.waitForFunction()` to poll IndexedDB directly before reloading:

```js
await page.waitForFunction(async title => {
  try {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('KanbanDB');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(new Error('IDB open failed'));
    });
    return await new Promise(res => {
      const req = db.transaction('tasks', 'readonly').objectStore('tasks').getAll();
      req.onsuccess = () => res(req.result.some(t => t.title === title && t.priority === 'high'));
      req.onerror = () => res(false);
    });
  } catch {
    return false;
  }
}, taskTitle);
```

Apply this pattern any time a test needs to reload after a write and assert on persisted state. Because localStorage is the primary source on reload, the poll is technically optional, but it prevents any race between the async IDB write and subsequent test steps that inspect IDB directly.

---

## Running E2E tests

```bash
# One-time browser install (if not already done)
npx playwright install chromium

# Run all E2E tests
npm run e2e

# Open the Playwright UI (visual test runner)
npm run e2e:ui
```

The `webServer` in `config/playwright.config.js` automatically runs `npm run build && npm run preview` before tests start. If a preview server is already running on port 4173, it is reused (skipping the build step) — useful during local development.

---

## Adding a new E2E test

Add `test()` blocks to an existing spec file or create a new `*.spec.js` file in this directory. Both are automatically picked up by `testDir: '../tests/e2e'` in `config/playwright.config.js`.

- Use `smoke.spec.js` for tests that verify data persistence across reloads
- Use `flows.spec.js` for tests that cover specific user interaction flows
- Use `accessibility.spec.js` for keyboard navigation and focus management
- Use `import-export.spec.js` for data export/import round-trips
- Use `performance.spec.js` for DOM budget and rendering performance assertions
- Create a new spec file for a clearly distinct area (e.g. `notebook.spec.js`, `search.spec.js`)

Keep E2E tests focused on critical user paths (happy path only). Edge cases and unit-level behaviour belong in `tests/*.test.js`.
