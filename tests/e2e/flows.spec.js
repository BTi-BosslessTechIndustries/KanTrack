/**
 * KanTrack E2E flow tests.
 *
 * Covers core user workflows not tested by smoke.spec.js:
 *   1. Delete a task via the modal — card is removed from the board.
 *   2. Edit a task's title in the modal — change persists after reload.
 *   3. Add a note entry in the modal — preview appears on card after reload.
 *   4. Undo a task creation — card disappears.
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

    // Reload — the oplog must rebuild the undo stack on re-init
    await page.reload({ waitUntil: 'networkidle' });

    // Task should still be visible after reload
    await expect(page.locator('#todo .note').filter({ hasText: title })).toBeVisible();

    // Undo should still work — the stack was rebuilt from the oplog
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

    // Redo — task should reappear
    await page.locator('[data-action="history:redo"]').click();
    await expect(page.locator('#todo .note').filter({ hasText: title })).toBeVisible();
  });
});
