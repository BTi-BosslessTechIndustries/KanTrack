/**
 * KanTrack E2E flow tests.
 *
 * Covers core user workflows not tested by smoke.spec.js:
 *   1. Delete a task via the modal: card is removed from the board.
 *   2. Edit a task's title in the modal: change persists after reload.
 *   3. Add a note entry in the modal: preview appears on card after reload.
 *   4. Undo a task creation: card disappears.
 *
 * All tests run against the production build served by `npm run preview`
 * (started automatically by Playwright's webServer config).
 *
 * IDB polling pattern: saveTasks() is fire-and-forget async.  When a test
 * needs to verify persistence across a reload, it polls IDB directly before
 * calling page.reload() to ensure the write has committed.
 */
import { test, expect } from '@playwright/test';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Create a task via the #newNote input and wait for the card to appear. */
async function createTask(page, title) {
  await page.locator('#newNote').fill(title);
  await page.locator('[data-action="task:add"]').click();
  await expect(page.locator('#todo .note').filter({ hasText: title })).toBeVisible();
}

// ─── tests ────────────────────────────────────────────────────────────────────

test.describe('KanTrack flow tests', () => {
  test('deletes a task via the modal and removes it from the board', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Delete me ${Date.now()}`;
    await createTask(page, title);

    const card = page.locator('#todo .note').filter({ hasText: title });

    // Open modal by clicking the title area of the card
    await card.locator('strong').click();
    const modal = page.locator('#taskModal');
    await expect(modal).toBeVisible();

    // Accept the browser confirm dialog that appears on delete
    page.on('dialog', dialog => dialog.accept());

    // Click the Delete button inside the modal
    await modal.locator('[data-action="task:deleteModal"]').click();

    // Modal should close and the card should no longer exist
    await expect(modal).toBeHidden();
    await expect(page.locator('#todo .note').filter({ hasText: title })).toHaveCount(0);
  });

  test('edits a task title in the modal and it persists after reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const originalTitle = `Original ${Date.now()}`;
    const updatedTitle = `Updated ${Date.now()}`;

    await createTask(page, originalTitle);

    const card = page.locator('#todo .note').filter({ hasText: originalTitle });
    await card.locator('strong').click();

    const modal = page.locator('#taskModal');
    await expect(modal).toBeVisible();

    // Double-click the modal title to enable editing
    const titleEl = modal.locator('#modalTitle');
    await titleEl.dblclick();

    // Clear and type the new title
    await page.keyboard.press('Control+a');
    await page.keyboard.type(updatedTitle);
    await page.keyboard.press('Enter');

    // Save & Close
    await modal.locator('[data-action="task:saveModal"]').click();
    await expect(modal).toBeHidden();

    // Card should show the updated title
    await expect(page.locator('#todo .note').filter({ hasText: updatedTitle })).toBeVisible();

    // Wait for IDB to commit the title change before reloading.
    // Only serializable values (strings) can be passed to waitForFunction.
    await page.waitForFunction(async title => {
      try {
        const db = await new Promise((res, rej) => {
          const req = indexedDB.open('KanbanDB');
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(new Error('IDB open failed'));
        });
        return await new Promise(res => {
          const req = db.transaction('tasks', 'readonly').objectStore('tasks').getAll();
          req.onsuccess = () => res(req.result.some(t => t.title === title));
          req.onerror = () => res(false);
        });
      } catch {
        return false;
      }
    }, updatedTitle);

    await page.reload({ waitUntil: 'networkidle' });

    // Title must still be there after reload
    await expect(page.locator('#todo .note').filter({ hasText: updatedTitle })).toBeVisible();
  });

  test('adds a note in the modal and the preview appears on the card after reload', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Note test ${Date.now()}`;
    const noteText = 'This is my test note content';

    await createTask(page, title);

    const card = page.locator('#todo .note').filter({ hasText: title });
    await card.locator('strong').click();

    const modal = page.locator('#taskModal');
    await expect(modal).toBeVisible();

    // Type into the contenteditable notes editor
    const notesEditor = modal.locator('#modalNotesEditor');
    await notesEditor.click();
    await page.keyboard.type(noteText);

    // Save & Close
    await modal.locator('[data-action="task:saveModal"]').click();
    await expect(modal).toBeHidden();

    // The card's note preview (.note-text) should now be non-empty and not the default
    const notePreview = card.locator('.note-text');
    await expect(notePreview).not.toHaveText('No additional notes');

    // Wait for IDB to commit the note entry before reloading.
    // Only serializable values (strings) can be passed to waitForFunction.
    await page.waitForFunction(async taskTitle => {
      try {
        const db = await new Promise((res, rej) => {
          const req = indexedDB.open('KanbanDB');
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(new Error('IDB open failed'));
        });
        return await new Promise(res => {
          const req = db.transaction('tasks', 'readonly').objectStore('tasks').getAll();
          req.onsuccess = () =>
            res(
              req.result.some(
                t => t.title === taskTitle && t.noteEntries && t.noteEntries.length > 0
              )
            );
          req.onerror = () => res(false);
        });
      } catch {
        return false;
      }
    }, title);

    await page.reload({ waitUntil: 'networkidle' });

    // Note preview should still be present after reload
    const cardAfterReload = page.locator('#todo .note').filter({ hasText: title });
    await expect(cardAfterReload.locator('.note-text')).not.toHaveText('No additional notes');
  });

  test('undo removes a newly created task from the board', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Undo test ${Date.now()}`;
    await createTask(page, title);

    // Trigger undo via the header button
    await page.locator('[data-action="history:undo"]').click();

    // The task card should no longer be visible
    await expect(page.locator('#todo .note').filter({ hasText: title })).toHaveCount(0);
  });

  // ─── Phase 3: oplog persistence ───────────────────────────────────────────

  test('undo survives a page refresh (oplog persistence)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Oplog undo ${Date.now()}`;
    await createTask(page, title);

    // Wait for the oplog entry to be committed to IDB before reloading.
    await page.waitForFunction(async () => {
      try {
        const db = await new Promise((res, rej) => {
          const req = indexedDB.open('KanbanDB');
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(new Error('IDB open failed'));
        });
        return await new Promise(res => {
          const req = db.transaction('oplog', 'readonly').objectStore('oplog').getAll();
          req.onsuccess = () => res(req.result.some(e => !e.undone));
          req.onerror = () => res(false);
        });
      } catch {
        return false;
      }
    });

    // Reload: the oplog must rebuild the undo stack on re-init
    await page.reload({ waitUntil: 'networkidle' });

    // Task should still be visible after reload
    await expect(page.locator('#todo .note').filter({ hasText: title })).toBeVisible();

    // Undo should still work: the stack was rebuilt from the oplog
    await page.locator('[data-action="history:undo"]').click();
    await expect(page.locator('#todo .note').filter({ hasText: title })).toHaveCount(0);
  });

  test('redo re-applies an undone action', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Redo test ${Date.now()}`;
    await createTask(page, title);

    // Undo
    await page.locator('[data-action="history:undo"]').click();
    await expect(page.locator('#todo .note').filter({ hasText: title })).toHaveCount(0);

    // Redo: task should reappear
    await page.locator('[data-action="history:redo"]').click();
    await expect(page.locator('#todo .note').filter({ hasText: title })).toBeVisible();
  });

  // ─── Hide Cards feature ────────────────────────────────────────────────────

  test('hides a card, shows it from the Hidden Cards modal, and it returns to its column', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Hide me ${Date.now()}`;
    await createTask(page, title);

    const card = page.locator('#todo .note').filter({ hasText: title });
    await expect(card).toBeVisible();

    // Hover to reveal the action buttons, then click Hide
    await card.hover();
    await card.locator('.hide-card-btn').click();

    // Card leaves the board
    await expect(page.locator('#todo .note').filter({ hasText: title })).toHaveCount(0);

    // Header badge shows 1 hidden card
    await expect(page.locator('#hiddenCount')).toBeVisible();
    await expect(page.locator('#hiddenCount')).toHaveText('1');

    // Open the Hidden Cards modal
    await page.locator('#hiddenToggleBtn').click();
    const modal = page.locator('#kt-hidden-modal');
    await expect(modal).toBeVisible();

    const row = modal.locator('li').filter({ hasText: title });
    await expect(row).toBeVisible();

    // Show it
    await row.locator('[data-show-id]').click();

    // Row disappears from the modal, badge clears
    await expect(modal.locator('li').filter({ hasText: title })).toHaveCount(0);
    await expect(page.locator('#hiddenCount')).toBeHidden();

    await modal.locator('#kt-hidden-close').click();
    await expect(modal).toBeHidden();

    // Card is back on the board, in its original column
    await expect(page.locator('#todo .note').filter({ hasText: title })).toBeVisible();
  });

  test('bulk-shows multiple hidden cards via Select All / Show Selected', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const ts = Date.now();
    const titleA = `Bulk hide A ${ts}`;
    const titleB = `Bulk hide B ${ts}`;
    await createTask(page, titleA);
    await createTask(page, titleB);

    for (const title of [titleA, titleB]) {
      const card = page.locator('#todo .note').filter({ hasText: title });
      await card.hover();
      await card.locator('.hide-card-btn').click();
      await expect(page.locator('#todo .note').filter({ hasText: title })).toHaveCount(0);
    }

    await expect(page.locator('#hiddenCount')).toHaveText('2');

    await page.locator('#hiddenToggleBtn').click();
    const modal = page.locator('#kt-hidden-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('li').filter({ hasText: titleA })).toBeVisible();
    await expect(modal.locator('li').filter({ hasText: titleB })).toBeVisible();

    // Select All checks every row and flips the label to Deselect All
    await modal.locator('#kt-hidden-select-all').click();
    await expect(modal.locator('#kt-hidden-select-all')).toHaveText('Deselect All');
    const checkboxes = modal.locator('.kt-hidden-row-check');
    await expect(checkboxes).toHaveCount(2);
    for (let i = 0; i < (await checkboxes.count()); i++) {
      await expect(checkboxes.nth(i)).toBeChecked();
    }

    // Show Selected restores both cards in one action
    await modal.locator('#kt-hidden-show-selected').click();
    await expect(modal.locator('li').filter({ hasText: titleA })).toHaveCount(0);
    await expect(modal.locator('li').filter({ hasText: titleB })).toHaveCount(0);
    await expect(modal.locator('li.kt-hidden-empty')).toBeVisible();
    await expect(page.locator('#hiddenCount')).toBeHidden();

    await modal.locator('#kt-hidden-close').click();
    await expect(page.locator('#todo .note').filter({ hasText: titleA })).toBeVisible();
    await expect(page.locator('#todo .note').filter({ hasText: titleB })).toBeVisible();
  });

  test('search hint links a matching hidden card to the Hidden Cards modal, pre-filtered', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Hidden searchable ${Date.now()}`;
    await createTask(page, title);

    const card = page.locator('#todo .note').filter({ hasText: title });
    await card.hover();
    await card.locator('.hide-card-btn').click();
    await expect(page.locator('#todo .note').filter({ hasText: title })).toHaveCount(0);

    // Searching for the hidden card's title surfaces the inline hint
    await page.locator('#taskSearchInput').fill(title);
    const hint = page.locator('#hiddenSearchHint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('1 hidden card');

    // Clicking "View" opens the Hidden Cards modal pre-filtered to the query
    await hint.locator('#hiddenSearchHintLink').click();
    const modal = page.locator('#kt-hidden-modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('li').filter({ hasText: title })).toBeVisible();
    await expect(modal.locator('#kt-hidden-clear-filter')).toBeVisible();
  });

  test('hide button only appears on To Do and On Hold cards, not In Progress or Done', async ({
    page,
  }) => {
    const ts = Date.now();
    await page.addInitScript(ts => {
      if (localStorage.getItem('kanbanNotes')) return;
      const tasks = [
        { id: 'todo-1', title: `Hide-check todo ${ts}`, column: 'todo' },
        { id: 'inprogress-1', title: `Hide-check inprogress ${ts}`, column: 'inProgress' },
        { id: 'onhold-1', title: `Hide-check onhold ${ts}`, column: 'onHold' },
        { id: 'done-1', title: `Hide-check done ${ts}`, column: 'done' },
      ].map(t => ({
        ...t,
        noteEntries: [],
        tags: [],
        timer: 0,
        actions: [],
      }));
      localStorage.setItem('kanbanNotes', JSON.stringify(tasks));
    }, ts);

    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const todoCard = page.locator('#todo .note').filter({ hasText: `Hide-check todo ${ts}` });
    const onHoldCard = page.locator('#onHold .note').filter({ hasText: `Hide-check onhold ${ts}` });
    const inProgressCard = page
      .locator('#inProgress .note')
      .filter({ hasText: `Hide-check inprogress ${ts}` });
    const doneCard = page.locator('#done .note').filter({ hasText: `Hide-check done ${ts}` });

    await todoCard.hover();
    await expect(todoCard.locator('.hide-card-btn')).toHaveCount(1);

    await onHoldCard.hover();
    await expect(onHoldCard.locator('.hide-card-btn')).toHaveCount(1);

    await inProgressCard.hover();
    await expect(inProgressCard.locator('.hide-card-btn')).toHaveCount(0);

    await doneCard.hover();
    await expect(doneCard.locator('.hide-card-btn')).toHaveCount(0);
  });
});

// Tests for the clock reset button added in the Remove-all-clocks-keep-Current-Time feature.
// Each test gets a fresh browser context (clean storage) so the app initialises
// 5 default clocks: Current Time, Europe, China, Americas, Africa.
test.describe('Clock reset button', () => {
  test('reset button is visible when multiple clocks are shown', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    // Default state: 5 clocks, so the reset button must be visible
    await expect(page.locator('.clock-reset-btn')).toBeVisible();
  });

  test('reset button is hidden when only Current Time is shown', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await page.locator('.clock-reset-btn').click();
    await page.waitForTimeout(300);

    await expect(page.locator('.clock-reset-btn')).toBeHidden();
  });

  test('clicking reset leaves exactly one clock labelled Current Time', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await page.locator('.clock-reset-btn').click();
    await page.waitForTimeout(300);

    const clocks = page.locator('#clockContainer .clock');
    await expect(clocks).toHaveCount(1);
    await expect(clocks.first().locator('.clock-name')).toHaveText('Current Time');
  });

  test('add clock button is accessible in header after reset', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await page.locator('.clock-reset-btn').click();
    await page.waitForTimeout(300);

    // After reset the widget row is hidden; the add button moves to the header
    await expect(page.locator('#headerAddClockBtn')).toBeVisible();
  });

  test('clock-spacer and clock-actions-col layout elements are present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await expect(page.locator('.clock-spacer')).toBeAttached();
    await expect(page.locator('.clock-actions-col')).toBeAttached();
  });
});

// Tests for the "Done column limit reached" pop-up (30-card cap on Done).
test.describe('Done column capacity', () => {
  test('shows the limit dialog on load, exports a card, and deleting trims the column to 15', async ({
    page,
  }) => {
    // Seed 30 Done-column tasks directly into localStorage before the app boots,
    // so checkDoneCapacity() trips on the very first load.
    await page.addInitScript(() => {
      // addInitScript runs on every navigation (including the reload below),
      // so only seed when localStorage is still empty.
      if (localStorage.getItem('kanbanNotes')) return;
      const now = Date.now();
      const tasks = [];
      for (let i = 0; i < 30; i++) {
        tasks.push({
          id: `done-${i}`,
          title: `Completed task #${i + 1}`,
          column: 'done',
          noteEntries: [],
          tags: [],
          timer: 0,
          actions: [],
          doneAt: now - (30 - i) * 86400000,
        });
      }
      localStorage.setItem('kanbanNotes', JSON.stringify(tasks));
    });

    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const dialog = page.locator('.kt-capacity-modal');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.kt-hidden-title h3')).toHaveText('Done Column Limit Reached');

    // The 15 oldest cards are listed, each with an Export PDF action
    const rows = dialog.locator('li.kt-hidden-row');
    await expect(rows).toHaveCount(15);
    await expect(rows.first()).toContainText('Completed task #1');

    // Exporting a single card flips its button to the "DONE" state
    const firstExportBtn = rows.first().locator('[data-export-id]');
    await firstExportBtn.click();
    await expect(firstExportBtn).toHaveText('DONE');
    await expect(firstExportBtn).toHaveClass(/is-done/);

    // Clicking Delete permanently removes the 15 oldest, closing the dialog
    await dialog.locator('#kt-capacity-delete').click();
    await expect(dialog).toBeHidden();

    const remaining = await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('kanbanNotes') || '[]');
      return stored.filter(t => t.column === 'done').length;
    });
    expect(remaining).toBe(15);

    // Reloading does not re-trigger the dialog (column is now under the cap)
    await page.reload();
    await expect(page.locator('.top-header')).toBeVisible();
    await expect(page.locator('.kt-capacity-modal')).toHaveCount(0);
  });
});
