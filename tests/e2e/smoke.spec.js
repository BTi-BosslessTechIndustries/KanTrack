/**
 * KanTrack E2E smoke test.
 *
 * Verifies the most critical user paths:
 *   1. Create a task via the #newNote input → Add button.
 *   2. Confirm the task card appears in the To Do column.
 *   3. Reload → task still there (localStorage/IDB persistence).
 *   4. Click the task card → modal opens.
 *   5. Set priority via the modal → save → reload → priority persisted.
 *
 * This test intentionally covers only the happy path. Edge cases and
 * unit-level behaviour are covered by the Vitest test suite.
 */
import { test, expect } from '@playwright/test';

test.describe('KanTrack smoke tests', () => {
  test('creates a task and it persists after a hard reload', async ({ page }) => {
    await page.goto('/');

    // App should load — the board header must be visible
    await expect(page.locator('.top-header')).toBeVisible();

    const taskTitle = `Smoke test ${Date.now()}`;

    // Type a title into the #newNote input and click Add
    await page.locator('#newNote').fill(taskTitle);
    await page.locator('[data-action="task:add"]').click();

    // The new task card should appear in the To Do column
    const todoCol = page.locator('#todo');
    await expect(todoCol.locator('.note').filter({ hasText: taskTitle })).toBeVisible();

    // Hard reload — simulates a new session; app re-reads from localStorage/IDB
    await page.reload({ waitUntil: 'networkidle' });

    // Task must still be visible (persisted successfully)
    await expect(page.locator('#todo .note').filter({ hasText: taskTitle })).toBeVisible();
  });

  test('opens the task modal, sets priority, and priority persists after reload', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const taskTitle = `Modal test ${Date.now()}`;

    // Create a task
    await page.locator('#newNote').fill(taskTitle);
    await page.locator('[data-action="task:add"]').click();

    const card = page.locator('#todo .note').filter({ hasText: taskTitle });
    await expect(card).toBeVisible();

    // Click the card's title (strong element) to open the task modal.
    // Clicking buttons on the card is excluded by the onclick handler.
    await card.locator('strong').click();

    // Modal should open
    const modal = page.locator('#taskModal');
    await expect(modal).toBeVisible();

    // Set priority to High — the label inside the modal updates immediately
    await modal.locator('[data-action="task:setPriority"][data-action-param="high"]').click();
    await expect(modal.locator('#modalPriorityLabel')).toHaveText('High');

    // Save & Close
    await modal.locator('[data-action="task:saveModal"]').click();
    await expect(modal).toBeHidden();

    // Verify updateNoteCardPriority ran — class is added synchronously during save
    await expect(card).toHaveClass(/priority-high/);

    // saveTasks() commits to localStorage synchronously but fires the IDB write
    // as a fire-and-forget async operation.  getAllTasks() on reload prefers IDB,
    // so if the IDB transaction hasn't committed yet the task re-renders with the
    // old (null) priority.  Poll IDB directly until the write is confirmed before
    // triggering the reload.
    await page.waitForFunction(async title => {
      try {
        const db = await new Promise((res, rej) => {
          const req = indexedDB.open('KanbanDB');
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(new Error('IDB open failed'));
        });
        return await new Promise(res => {
          const req = db.transaction('tasks', 'readonly').objectStore('tasks').getAll();
          req.onsuccess = () =>
            res(req.result.some(t => t.title === title && t.priority === 'high'));
          req.onerror = () => res(false);
        });
      } catch {
        return false;
      }
    }, taskTitle);

    await page.reload({ waitUntil: 'networkidle' });

    // After reload the card should carry the high-priority class (persisted in IDB)
    await expect(page.locator('#todo .note').filter({ hasText: taskTitle })).toHaveClass(
      /priority-high/
    );
  });
});
