/**
 * KanTrack E2E sub-kanban tests.
 *
 * Covers the per-task mini-board (sub-kanban.js) reachable from the task
 * modal's "Sub-Tasks" section:
 *   1. Adding a sub-task creates an item in the To Do column.
 *   2. Dragging a sub-task to another column moves it there.
 *   3. Deleting a sub-task (via its ❌ button + confirm dialog) removes it.
 *   4. Double-clicking a sub-task title renames it in place.
 *
 * Like the board's card drag-and-drop, sub-kanban drag-and-drop is
 * state-based (`state.setSubKanbanDraggedItem`, read by the column's `ondrop`
 * handler), so `locator.dragTo(target)` exercises the real move logic.
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

/** Open the task modal for the given card title and expand the Sub-Tasks section. */
async function openSubKanban(page, title) {
  const card = page.locator('#todo .note').filter({ hasText: title });
  await card.first().locator('strong').click();

  const modal = page.locator('#taskModal');
  await expect(modal).toBeVisible();

  await modal.locator('[data-action="task:toggleSubKanban"]').click();
  await expect(modal.locator('#subKanbanContent')).toBeVisible();

  return modal;
}

/** Add a sub-task with the given title via the modal's input + Add button. */
async function addSubTask(modal, title) {
  await modal.locator('#newSubTaskInput').fill(title);
  await modal.locator('[data-action="task:addSubItem"]').click();
  await expect(
    modal.locator('#subKanbanTodo .sub-kanban-item').filter({ hasText: title })
  ).toBeVisible();
}

// ─── tests ────────────────────────────────────────────────────────────────────

test.describe('KanTrack sub-kanban tests', () => {
  test('adding a sub-task creates an item in the To Do column', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Sub-kanban parent ${Date.now()}`;
    await createTask(page, title);

    const modal = await openSubKanban(page, title);
    const subTitle = 'Write the spec';
    await addSubTask(modal, subTitle);

    await expect(modal.locator('#subKanbanCount')).toHaveText('(0/1)');
  });

  test('dragging a sub-task to another column moves it there', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Sub-kanban drag ${Date.now()}`;
    await createTask(page, title);

    const modal = await openSubKanban(page, title);
    const subTitle = 'Review the PR';
    await addSubTask(modal, subTitle);

    const item = modal.locator('#subKanbanTodo .sub-kanban-item').filter({ hasText: subTitle });
    await item.first().dragTo(modal.locator('#subKanbanInProgress'));

    await expect(
      modal.locator('#subKanbanInProgress .sub-kanban-item').filter({ hasText: subTitle })
    ).toBeVisible();
    await expect(
      modal.locator('#subKanbanTodo .sub-kanban-item').filter({ hasText: subTitle })
    ).toHaveCount(0);
  });

  test('dragging a sub-task to Done updates the count badge', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Sub-kanban done ${Date.now()}`;
    await createTask(page, title);

    const modal = await openSubKanban(page, title);
    const subTitle = 'Ship it';
    await addSubTask(modal, subTitle);

    const item = modal.locator('#subKanbanTodo .sub-kanban-item').filter({ hasText: subTitle });
    await item.first().dragTo(modal.locator('#subKanbanDone'));

    await expect(
      modal.locator('#subKanbanDone .sub-kanban-item').filter({ hasText: subTitle })
    ).toBeVisible();
    await expect(modal.locator('#subKanbanCount')).toHaveText('(1/1)');
  });

  test('deleting a sub-task removes it after confirmation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Sub-kanban delete ${Date.now()}`;
    await createTask(page, title);

    const modal = await openSubKanban(page, title);
    const subTitle = 'Delete me too';
    await addSubTask(modal, subTitle);

    page.on('dialog', dialog => dialog.accept());

    const item = modal.locator('#subKanbanTodo .sub-kanban-item').filter({ hasText: subTitle });
    await item.first().locator('.delete-sub-item').click();

    await expect(
      modal.locator('#subKanbanTodo .sub-kanban-item').filter({ hasText: subTitle })
    ).toHaveCount(0);
    await expect(modal.locator('#subKanbanCount')).toHaveText('');
  });

  test('double-clicking a sub-task title renames it in place', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Sub-kanban rename ${Date.now()}`;
    await createTask(page, title);

    const modal = await openSubKanban(page, title);
    const originalSubTitle = 'Original sub-task name';
    const updatedSubTitle = 'Renamed sub-task';
    await addSubTask(modal, originalSubTitle);

    const titleEl = modal
      .locator('#subKanbanTodo .sub-kanban-item .sub-kanban-item-title')
      .filter({ hasText: originalSubTitle });
    await titleEl.dblclick();

    await titleEl.selectText();
    await page.keyboard.type(updatedSubTitle);
    await page.keyboard.press('Enter');

    await expect(
      modal.locator('#subKanbanTodo .sub-kanban-item').filter({ hasText: updatedSubTitle })
    ).toBeVisible();
    await expect(
      modal.locator('#subKanbanTodo .sub-kanban-item').filter({ hasText: originalSubTitle })
    ).toHaveCount(0);
  });

  test('sub-kanban item title picks up the active card language', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await page.locator('#headerMenuBtn').click();
    await page.locator('#cardLanguageSelect').selectOption('fr');
    await page.locator('#headerMenuBtn').click();

    const title = `Sub-kanban language ${Date.now()}`;
    await createTask(page, title);

    const modal = await openSubKanban(page, title);
    const subTitle = 'Sub-task with language';
    await addSubTask(modal, subTitle);

    const titleEl = modal
      .locator('#subKanbanTodo .sub-kanban-item .sub-kanban-item-title')
      .filter({ hasText: subTitle });
    await expect(titleEl).toHaveAttribute('lang', 'fr');
    await expect(titleEl).toHaveAttribute('spellcheck', 'true');
  });

  test('sub-kanban item title picks up a language selected after creation when renamed', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Sub-kanban rename language ${Date.now()}`;
    await createTask(page, title);

    const modal = await openSubKanban(page, title);
    const subTitle = 'Sub-task created before language change';
    await addSubTask(modal, subTitle);

    const titleElBefore = modal
      .locator('#subKanbanTodo .sub-kanban-item .sub-kanban-item-title')
      .filter({ hasText: subTitle });
    await expect(titleElBefore).not.toHaveAttribute('lang');

    // Close the task modal so the header dropdown is reachable.
    await modal.locator('[data-action="task:closeModal"]').click();
    await expect(modal).not.toBeVisible();

    // Select a language after the sub-task was created.
    await page.locator('#headerMenuBtn').click();
    await page.locator('#cardLanguageSelect').selectOption('es');
    await page.locator('#headerMenuBtn').click();

    // Reopen the task modal; the sub-kanban panel stays expanded from before.
    const card = page.locator('#todo .note').filter({ hasText: title });
    await card.first().locator('strong').click();
    const reopenedModal = page.locator('#taskModal');
    await expect(reopenedModal).toBeVisible();
    await expect(reopenedModal.locator('#subKanbanContent')).toBeVisible();

    const titleEl = reopenedModal
      .locator('#subKanbanTodo .sub-kanban-item .sub-kanban-item-title')
      .filter({ hasText: subTitle });
    await titleEl.dblclick();
    await expect(titleEl).toHaveAttribute('lang', 'es');
    await expect(titleEl).toHaveAttribute('spellcheck', 'true');

    await page.keyboard.press('Escape');
  });
});
