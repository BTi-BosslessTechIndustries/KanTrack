# tests/e2e/

Playwright end-to-end smoke tests. These run against the **production build** (not the dev server) to catch issues that only appear after bundling.

---

## Spec files

| File                             | Tests | What it covers                                                                                                                                           |
| -------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke.spec.js`                  | 2     | Create task + persist; set priority + persist after reload                                                                                               |
| `flows.spec.js`                  | 11    | Delete, edit title, add note, undo, undo-persist, redo; clock reset button visibility and behaviour                                                      |
| `accessibility.spec.js`          | 9     | Keyboard shortcuts (N, /, ?), ESC closes modals, Enter/arrow card nav                                                                                    |
| `drag-drop.spec.js`              | 3     | Card drag-and-drop between board columns; persistence; `doneAt` stamped on entering Done and cleared on leaving                                          |
| `import-export.spec.js`          | 7     | JSON export/import, encrypted export/import, format-version validation                                                                                   |
| `notebook-import-export.spec.js` | 5     | Download everything button (visibility, dual-file download); notebook ZIP export content; notebook ZIP import (merge, no data loss)                      |
| `performance.spec.js`            | 2     | Virtual list DOM node budget (200 tasks, scroll to bottom)                                                                                               |
| `search.spec.js`                 | 5     | Live search filtering, case-insensitivity, clear, ESC clear, no-match                                                                                    |
| `header.spec.js`                 | 54    | Support Us / About / Shortcuts modals; credit button; ⋮ dropdown; card size picker and persistence; header responsive scaling; clock collapsed state     |
| `responsive.spec.js`             | 12    | Kanban column count at 800 px / 500 px; clock container no-wrap; clock font scaling; clock panel 700 px breakpoint (hide/show, header time, logo centre) |
| `sub-kanban.spec.js`             | 5     | Per-task mini-board: add a sub-task, drag it between columns, drag to Done updates the count badge, delete with confirmation, double-click rename        |

---

## What is tested

### `smoke.spec.js`: core persistence

**Test 1: Create a task and verify it persists after reload**

1. Open the app
2. Fill in the `#newNote` input and click the Add button (`[data-action="task:add"]`)
3. Assert the task card appears in the `#todo` column
4. Hard reload the page (`waitUntil: 'networkidle'`)
5. Assert the card is still there (data survived the reload via IDB/localStorage)

**Test 2: Open the task modal, set priority, and verify it persists after reload**

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

### `flows.spec.js`: user flows

**Test 1: Delete a task via the modal**

1. Create a task
2. Open the modal, click Delete (`[data-action="task:deleteModal"]`)
3. Accept the browser confirm dialog
4. Assert the card is gone from the board

**Test 2: Edit task title in the modal and verify it persists after reload**

1. Create a task
2. Open modal, double-click `#modalTitle` to enable editing
3. Type a new title, press Enter
4. Save & Close
5. Assert card shows the new title
6. Poll IDB until the new title is committed
7. Reload: assert title still correct

**Test 3: Add a note entry and verify the preview appears after reload**

1. Create a task
2. Open modal, type into `#modalNotesEditor` (contenteditable)
3. Save & Close
4. Assert the card's `.note-text` is no longer "No additional notes"
5. Poll IDB until `noteEntries.length > 0`
6. Reload: assert note preview still present

**Test 4: Undo removes a newly created task**

1. Create a task
2. Click the Undo button (`[data-action="history:undo"]`)
3. Assert the card is gone from the board

**Test 5: Undo survives a page refresh (oplog persistence)**

1. Create a task, wait for the oplog entry to commit to IDB
2. Reload the page (oplog rebuilds the undo stack)
3. Assert the task is still visible
4. Undo: assert the card is gone (stack was rebuilt correctly)

**Test 6: Redo re-applies an undone action**

1. Create a task, undo it, redo it: assert card reappears

---

### `accessibility.spec.js`: keyboard shortcuts & focus (Phase 7)

- **ESC closes task modal**: open modal via card click, press Escape
- **N key** focuses `#newNote` input when no modal is open
- **/ key** focuses `#taskSearchInput` when no modal is open
- **? key** opens `#shortcutsModal`
- **ESC closes shortcuts dialog**
- **Close button** (`×`) closes shortcuts dialog
- **Enter on focused card** opens the task modal (cards have `tabIndex=0`)
- **ArrowDown / ArrowUp** move focus between cards in a column

---

### `drag-drop.spec.js`: card drag-and-drop between columns

The app's drag-and-drop is **state-based**, not `DataTransfer`-based: `dragstart` stores a reference to the dragged note in module state (`setDraggedItemRef`), and the `drop` handler reads that reference and calls `updateNoteColumn(id, oldColumn, newColumn)`. This means Playwright's `locator.dragTo(target)` exercises the real move logic without needing to populate a `DataTransfer` payload.

- **To Do → In Progress**: drag a card via `locator.dragTo(#inProgress)`; assert it lands in the target column and disappears from the source; poll IDB for `column === 'inProgress'`; reload and re-assert
- **Drag into Done stamps `doneAt`**: drag a card to `#done`; poll IDB for `column === 'done' && typeof doneAt === 'number'`; assert the per-move `confirm("...export it as PDF?")` dialog appears (dismissed to skip the export)
- **Drag out of Done clears `doneAt`**: move a card into Done, then to On Hold; poll IDB for `column === 'onHold' && typeof doneAt === 'undefined'`

---

### `import-export.spec.js`: export / import round-trips (Phase 4)

- JSON export produces `.kantrack.json` with correct structure
- Lightweight export strips `imageData`
- JSON import (Merge): imported task appears after reload
- Import summary shows task count
- Unsupported `formatVersion` shows an error
- Encrypted export + import round-trip restores data
- Encrypted import with wrong passphrase shows an error

---

### `performance.spec.js`: virtual list DOM budget (Phase 5)

- 200 tasks renders fewer than 30 `.note` DOM nodes initially
- Scrolling to the bottom keeps the DOM count below 60

---

### `search.spec.js`: live search & filter

- Typing in the search box shows only cards whose titles match
- Search is case-insensitive (uppercase title, lowercase query)
- Clearing the search box restores all cards
- Pressing ESC while the search input is focused clears the term and restores cards
- A search with no matches results in zero matching cards rendered

---

### `flows.spec.js`: user flows

**Tests 1–6** (task CRUD and undo): delete, edit title, add note, undo, undo-persist across reload, redo — documented above.

**Tests 7–11: Clock reset button**

- Reset button is visible when multiple clocks are shown
- Reset button is hidden when only Current Time is shown
- Clicking Reset leaves exactly one clock labelled "Current Time"
- The Add Clock button in the header is accessible after reset
- `.clock-spacer` and `.clock-actions-col` layout elements are present

---

### `notebook-import-export.spec.js`: notebook export/import and Download everything

**Download everything button**

- Visible, carries the `export-btn--all` class, and is the first child of the controls row
- Triggers two downloads: a workspace JSON and a notebook ZIP

**Notebook ZIP export**

- `notebook_data.json` inside the ZIP contains page content from IDB

**Notebook ZIP import**

- Saves imported page content to IDB
- Does not wipe content of pages already in the notebook (safe merge)

---

### `header.spec.js`: header UI, responsive layout, and clock state

**KanTrack header UI** (~25 tests)

- **Support Us button**: opens `#supportModal`; ESC, backdrop click, and close button all dismiss it
- **Credit button**: visible, links to the BTi website
- **⋮ menu**: opens/closes `#headerDropdown`; click outside or second toggle closes it
- **About modal**: opens via dropdown item; dismissed by ESC, backdrop click, or close button; opens scrolled to top
- **Shortcuts modal**: opens via dropdown "Help" item; dismissed by backdrop click
- **Card size picker**: visible in dropdown; Small/Medium/Large buttons set body class; preference persists across reloads; dropdown stays open after selection; card text scales proportionally at each size

**Header responsive layout** (~20 tests)

- Support button visible above 480 px, hidden at ≤ 480 px, shrinks proportionally via `clamp()`
- BTi logo shrinks at 1280 → 900 → 768 px breakpoints
- KanTrack logo width scales with `clamp(100px, 18vw, 210px)` and maintains aspect ratio
- Header left/center/right sections do not overlap at 1280 / 900 / 768 px; at ≤ 700 px the logo uses `position:absolute` — checked by asserting the logo center sits between the support button and the Add Clock button
- Header action buttons, SVG icons, notebook toggle, and gaps all scale proportionally
- Header height is 60 px above 768 px and 54 px at ≤ 768 px
- All essential controls remain visible at 500 px and 400 px

**Clock collapsed / expanded state** (5 tests)

- Clock group hidden when multiple clocks are present (expanded state)
- Resetting clocks collapses the widget and shows the header clock group
- Header clock time shows `HH:MM` format when collapsed
- Add Clock button in the header opens `#addClockModal`
- Adding a clock from the collapsed state restores the expanded widget

---

### `responsive.spec.js`: responsive layout

**Layout persistence at narrow viewports** (4 tests)

- Kanban board keeps 4 columns at 800 px and 500 px viewport width
- Clock container does not wrap (`flex-wrap: nowrap`) at 500 px
- Clock card font size shrinks as the viewport narrows from 1200 px to 750 px (container-query scaling; tested above 700 px where the panel is visible)

**Clock panel 700 px breakpoint** (8 tests)

- Clock panel (`clock-wrapper`) is hidden at 699 px when multiple clocks are present
- Header clock group (`#headerClockGroup`) is visible at 699 px when multiple clocks are present
- Header clock time shows `HH:MM` format at 699 px
- Clock panel is visible at 701 px; header clock group is hidden at 701 px
- Logo is centered between the support button and Add Clock button at 699 px (offset ≤ 2 px)
- `header-center` is `position:absolute` at 699 px and `position:static` at 701 px
- Resizing from 699 px → 701 px restores the clock panel and all 5 clocks without data loss

---

### `sub-kanban.spec.js`: per-task mini-board

Covers the "Sub-Tasks" mini-board reachable from the task modal (`sub-kanban.js`). Like the board's card drag-and-drop, sub-kanban drag-and-drop is state-based (`state.setSubKanbanDraggedItem`, read by the column's `ondrop` handler), so `locator.dragTo(target)` exercises the real move logic.

- **Add a sub-task**: type into `#newSubTaskInput`, click `[data-action="task:addSubItem"]`; assert it appears in the To Do column and the `(0/1)` count badge updates
- **Drag a sub-task to another column**: `dragTo(#subKanbanInProgress)`; assert it moves and disappears from the source column
- **Drag a sub-task to Done updates the count badge**: `dragTo(#subKanbanDone)`; assert the badge reads `(1/1)`
- **Delete a sub-task**: click its `.delete-sub-item` ❌ button, accept the `confirm("Delete sub-task...")` dialog; assert it's removed and the badge clears
- **Rename a sub-task**: double-click its title to enable `contenteditable`, `selectText()`, type a new title, press Enter; assert the new title replaced the old one

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

The `webServer` in `config/playwright.config.js` automatically runs `npm run build && npm run preview` before tests start. If a preview server is already running on port 4173, it is reused (skipping the build step): useful during local development.

---

## Adding a new E2E test

Add `test()` blocks to an existing spec file or create a new `*.spec.js` file in this directory. Both are automatically picked up by `testDir: '../tests/e2e'` in `config/playwright.config.js`.

- Use `smoke.spec.js` for tests that verify data persistence across reloads
- Use `flows.spec.js` for tests that cover specific user interaction flows
- Use `accessibility.spec.js` for keyboard navigation and focus management
- Use `drag-drop.spec.js` for board-level drag-and-drop interactions
- Use `import-export.spec.js` for data export/import round-trips
- Use `performance.spec.js` for DOM budget and rendering performance assertions
- Use `sub-kanban.spec.js` for the per-task mini-board's CRUD and drag-and-drop
- Create a new spec file for a clearly distinct area (e.g. `notebook.spec.js`, `search.spec.js`)

Keep E2E tests focused on critical user paths (happy path only). Edge cases and unit-level behaviour belong in `tests/*.test.js`.
