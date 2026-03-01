/**
 * KanTrack E2E accessibility tests — Phase 7.
 *
 * Covers the keyboard-driven UX and accessibility features added in Phase 7:
 *   1. ESC closes the task modal.
 *   2. N key focuses the new-task input.
 *   3. / key focuses the search input.
 *   4. ? key opens the shortcuts dialog.
 *   5. ESC closes the shortcuts dialog and returns focus.
 *   6. Enter on a focused task card opens the task modal.
 *   7. Arrow keys navigate between cards in a column.
 *
 * All tests run against the production build served by `npm run preview`
 * (started automatically by Playwright's webServer config in playwright.config.js).
 */
import { test, expect } from '@playwright/test';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Create a task via the #newNote input and wait for the card to appear. */
async function createTask(page, title) {
  await page.locator('#newNote').fill(title);
  await page.locator('[data-action="task:add"]').click();
  await expect(page.locator('#todo .note').filter({ hasText: title })).toBeVisible();
}

/**
 * Click a neutral area of the board so no input/interactive element has focus,
 * allowing global keyboard shortcuts to fire.
 */
async function blurAllInputs(page) {
  // Click the board background — not on a card or control
  await page.evaluate(() => document.body.click());
  // Small wait to let any focus side-effects settle
  await page.waitForTimeout(50);
}

// ─── tests ────────────────────────────────────────────────────────────────────

test.describe('Phase 7 — Keyboard shortcuts & accessibility', () => {
  // ── ESC closes task modal ──────────────────────────────────────────────────

  test('ESC closes the task modal', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `ESC test ${Date.now()}`;
    await createTask(page, title);

    // Open modal via the card title
    await page.locator('#todo .note').filter({ hasText: title }).locator('strong').click();
    const modal = page.locator('#taskModal');
    await expect(modal).toBeVisible();

    // Press ESC — modal should close
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
  });

  // ── N key focuses new-task input ───────────────────────────────────────────

  test('N key focuses the new-task input when no modal is open', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await blurAllInputs(page);

    await page.keyboard.press('n');

    await expect(page.locator('#newNote')).toBeFocused();
  });

  // ── / key focuses search ───────────────────────────────────────────────────

  test('/ key focuses the search input when no modal is open', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await blurAllInputs(page);

    await page.keyboard.press('/');

    await expect(page.locator('#taskSearchInput')).toBeFocused();
  });

  // ── ? key opens shortcuts dialog ──────────────────────────────────────────

  test('? key opens the shortcuts dialog when no modal is open', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await blurAllInputs(page);

    // '?' is a shifted character — use keyboard.type to fire keydown with key:'?'
    await page.keyboard.type('?');

    await expect(page.locator('#shortcutsModal')).toBeVisible();
  });

  // ── ESC closes shortcuts dialog ───────────────────────────────────────────

  test('ESC closes the shortcuts dialog', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    // Open the shortcuts dialog
    await blurAllInputs(page);
    await page.keyboard.type('?');
    await expect(page.locator('#shortcutsModal')).toBeVisible();

    // ESC should close it
    await page.keyboard.press('Escape');
    await expect(page.locator('#shortcutsModal')).toBeHidden();
  });

  // ── Close button closes shortcuts dialog ──────────────────────────────────

  test('shortcuts dialog close button closes the dialog', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await blurAllInputs(page);
    await page.keyboard.type('?');
    await expect(page.locator('#shortcutsModal')).toBeVisible();

    // Click the × close button
    await page.locator('#shortcutsModal .modal-close').click();
    await expect(page.locator('#shortcutsModal')).toBeHidden();
  });

  // ── Enter on focused card opens modal ─────────────────────────────────────

  test('Enter on a focused task card opens the task modal', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Enter key test ${Date.now()}`;
    await createTask(page, title);

    const card = page.locator('#todo .note').filter({ hasText: title });

    // Focus the card programmatically (cards have tabIndex=0)
    await card.evaluate(el => el.focus());
    await expect(card).toBeFocused();

    // Press Enter — task modal should open
    await page.keyboard.press('Enter');

    await expect(page.locator('#taskModal')).toBeVisible();

    // Clean up
    await page.keyboard.press('Escape');
  });

  // ── Arrow key card navigation ──────────────────────────────────────────────

  test('ArrowDown moves focus to the next card in the column', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title1 = `Arrow nav A ${Date.now()}`;
    const title2 = `Arrow nav B ${Date.now() + 1}`;
    await createTask(page, title1);
    await createTask(page, title2);

    const cards = page.locator('#todo .note');

    // Focus the first card
    await cards.first().evaluate(el => el.focus());
    await expect(cards.first()).toBeFocused();

    // ArrowDown should move to the second card
    await page.keyboard.press('ArrowDown');
    await expect(cards.nth(1)).toBeFocused();
  });

  test('ArrowUp moves focus to the previous card in the column', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title1 = `Arrow up A ${Date.now()}`;
    const title2 = `Arrow up B ${Date.now() + 1}`;
    await createTask(page, title1);
    await createTask(page, title2);

    const cards = page.locator('#todo .note');

    // Focus the second card
    await cards.nth(1).evaluate(el => el.focus());

    // ArrowUp should move back to the first card
    await page.keyboard.press('ArrowUp');
    await expect(cards.first()).toBeFocused();
  });
});
