/**
 * KanTrack E2E drag-and-drop tests.
 *
 * Covers moving cards between board columns via HTML5 drag-and-drop:
 *   1. Dragging a card from To Do to In Progress moves it (and persists).
 *   2. Dragging a card into Done stamps `doneAt` on the task record.
 *   3. Dragging a card out of Done clears `doneAt`.
 *
 * The app's drag-and-drop is state-based, not DataTransfer-based: `dragstart`
 * stores a reference to the dragged note in module state (see tasks.js), and
 * the `drop` handler in drag-drop.js reads that reference and calls
 * `updateNoteColumn(id, oldColumn, newColumn)`. This means Playwright's
 * `locator.dragTo(target)` triggers the real move logic without needing to
 * populate a DataTransfer payload.
 *
 * Moving a card into Done triggers a `confirm("...export it as PDF?")`
 * dialog (tasks.js:287); these tests dismiss it to skip the PDF export.
 *
 * All tests run against the production build served by `npm run preview`
 * (started automatically by Playwright's webServer config).
 */
import { test, expect } from '@playwright/test';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Create a task via the #newNote input and wait for the card to appear. */
async function createTask(page, title) {
  await page.locator('#newNote').fill(title);
  await page.locator('[data-action="task:add"]').click();
  await expect(page.locator('#todo .note').filter({ hasText: title })).toBeVisible();
}

/** Poll IDB until the task with the given title satisfies `predicate`. */
async function waitForTask(page, title, predicateSource) {
  await page.waitForFunction(
    async ([taskTitle, predicateStr]) => {
      try {
        const db = await new Promise((res, rej) => {
          const req = indexedDB.open('KanbanDB');
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(new Error('IDB open failed'));
        });
        const tasks = await new Promise(res => {
          const req = db.transaction('tasks', 'readonly').objectStore('tasks').getAll();
          req.onsuccess = () => res(req.result);
          req.onerror = () => res([]);
        });
        const task = tasks.find(t => t.title === taskTitle);
        if (!task) return false;
        const predicate = new Function('task', `return (${predicateStr})(task);`);
        return predicate(task);
      } catch {
        return false;
      }
    },
    [title, predicateSource]
  );
}

// ─── tests ────────────────────────────────────────────────────────────────────

test.describe('KanTrack drag-and-drop tests', () => {
  test('dragging a card from To Do to In Progress moves and persists it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Drag to In Progress ${Date.now()}`;
    await createTask(page, title);

    const card = page.locator('#todo .note').filter({ hasText: title });
    await card.first().dragTo(page.locator('#inProgress'));

    await expect(page.locator('#inProgress .note').filter({ hasText: title })).toBeVisible();
    await expect(page.locator('#todo .note').filter({ hasText: title })).toHaveCount(0);

    await waitForTask(page, title, 'task => task.column === "inProgress"');

    await page.reload({ waitUntil: 'networkidle' });

    await expect(page.locator('#inProgress .note').filter({ hasText: title })).toBeVisible();
    await expect(page.locator('#todo .note').filter({ hasText: title })).toHaveCount(0);
  });

  test('dragging a card into Done stamps doneAt and offers a PDF export', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Drag to Done ${Date.now()}`;
    await createTask(page, title);

    let dialogMessage = '';
    page.on('dialog', dialog => {
      dialogMessage = dialog.message();
      dialog.dismiss();
    });

    const card = page.locator('#todo .note').filter({ hasText: title });
    await card.first().dragTo(page.locator('#done'));

    await expect(page.locator('#done .note').filter({ hasText: title })).toBeVisible();

    await waitForTask(
      page,
      title,
      'task => task.column === "done" && typeof task.doneAt === "number"'
    );

    await expect.poll(() => dialogMessage).toContain('Do you want to export it as PDF?');
  });

  test('dragging a card out of Done clears doneAt', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Drag out of Done ${Date.now()}`;
    await createTask(page, title);

    page.on('dialog', dialog => dialog.dismiss());

    const card = page.locator('#todo .note').filter({ hasText: title });
    await card.first().dragTo(page.locator('#done'));
    await expect(page.locator('#done .note').filter({ hasText: title })).toBeVisible();
    await waitForTask(
      page,
      title,
      'task => task.column === "done" && typeof task.doneAt === "number"'
    );

    await page
      .locator('#done .note')
      .filter({ hasText: title })
      .first()
      .dragTo(page.locator('#onHold'));
    await expect(page.locator('#onHold .note').filter({ hasText: title })).toBeVisible();

    await waitForTask(
      page,
      title,
      'task => task.column === "onHold" && typeof task.doneAt === "undefined"'
    );
  });
});
