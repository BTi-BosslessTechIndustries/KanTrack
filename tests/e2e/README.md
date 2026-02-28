# tests/e2e/

Playwright end-to-end smoke tests. These run against the **production build** (not the dev server) to catch issues that only appear after bundling.

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

---

## IDB polling pattern

`saveTasks()` in `repository.ts` writes localStorage **synchronously** but fires the IDB write as a **fire-and-forget** async operation. On reload, `getAllTasks()` prefers IDB over localStorage. If the reload fires before the IDB transaction commits, the task re-renders with stale (null) priority.

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

Apply this pattern any time a test needs to reload after a write and assert on persisted state.

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
- Create a new spec file for a clearly distinct area (e.g. `notebook.spec.js`, `search.spec.js`)

Keep E2E tests focused on critical user paths (happy path only). Edge cases and unit-level behaviour belong in `tests/*.test.js`.
