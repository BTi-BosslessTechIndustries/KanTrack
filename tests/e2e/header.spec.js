/**
 * KanTrack E2E header UI tests.
 *
 * Covers the header elements added post-Phase 7:
 *   1.  Support Us button opens the Support modal.
 *   2.  ESC closes the Support modal.
 *   3.  Clicking the Support modal backdrop closes it.
 *   4.  Clicking the close button on the Support modal closes it.
 *   5.  Credit button links to the BTi website.
 *   6.  Clicking the ⋮ menu button opens the dropdown.
 *   7.  Clicking outside the dropdown closes it.
 *   8.  "About KanTrack" item opens the About modal.
 *   9.  ESC closes the About modal.
 *   10. Clicking the About modal backdrop closes it.
 *   11. Clicking the close button on the About modal closes it.
 *   12. About modal opens scrolled to the top (not the bottom).
 *   13. "Shortcuts" item opens the Shortcuts modal.
 *   14. Clicking the Shortcuts modal backdrop closes it.
 *
 * All tests run against the production build served by `npm run preview`.
 */
import { test, expect } from '@playwright/test';

test.describe('KanTrack header UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
  });

  // ── Support Us ────────────────────────────────────────────────────────────

  test('clicking Support Us button opens the Support modal', async ({ page }) => {
    await page.locator('.support-us-btn').click();
    await expect(page.locator('#supportModal')).toBeVisible();
  });

  test('ESC closes the Support modal', async ({ page }) => {
    await page.locator('.support-us-btn').click();
    await expect(page.locator('#supportModal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#supportModal')).toBeHidden();
  });

  test('clicking the Support modal backdrop closes it', async ({ page }) => {
    await page.locator('.support-us-btn').click();
    const modal = page.locator('#supportModal');
    await expect(modal).toBeVisible();

    await modal.click({ position: { x: 5, y: 5 } });
    await expect(modal).toBeHidden();
  });

  test('clicking the close button on the Support modal closes it', async ({ page }) => {
    await page.locator('.support-us-btn').click();
    await expect(page.locator('#supportModal')).toBeVisible();

    await page.locator('#supportModal [data-action="support:close"]').click();
    await expect(page.locator('#supportModal')).toBeHidden();
  });

  // ── Credit button ─────────────────────────────────────────────────────────

  test('credit button is visible and links to the BTi website', async ({ page }) => {
    const credit = page.locator('.header-credit-btn');
    await expect(credit).toBeVisible();
    await expect(credit).toHaveAttribute('href', 'https://www.bosslesstechindustries.com');
  });

  // ── Info dropdown ─────────────────────────────────────────────────────────

  test('clicking the ⋮ menu button opens the dropdown', async ({ page }) => {
    await expect(page.locator('#headerDropdown')).toBeHidden();
    await page.locator('#headerMenuBtn').click();
    await expect(page.locator('#headerDropdown')).toBeVisible();
  });

  test('clicking outside the open dropdown closes it', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await expect(page.locator('#headerDropdown')).toBeVisible();

    // Click the board background — a neutral area not inside the dropdown wrapper
    await page.locator('.kanban-board').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('#headerDropdown')).toBeHidden();
  });

  test('toggling the menu button a second time closes the dropdown', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await expect(page.locator('#headerDropdown')).toBeVisible();
    await page.locator('#headerMenuBtn').click();
    await expect(page.locator('#headerDropdown')).toBeHidden();
  });

  // ── About modal ───────────────────────────────────────────────────────────

  test('clicking "About KanTrack" in the dropdown opens the About modal', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await page.locator('[data-action="about:open"]').click();
    await expect(page.locator('#aboutModal')).toBeVisible();
  });

  test('ESC closes the About modal', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await page.locator('[data-action="about:open"]').click();
    await expect(page.locator('#aboutModal')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#aboutModal')).toBeHidden();
  });

  test('clicking the About modal backdrop closes it', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await page.locator('[data-action="about:open"]').click();
    const modal = page.locator('#aboutModal');
    await expect(modal).toBeVisible();

    // Click the overlay (top-left corner of the modal element, outside the content box)
    await modal.click({ position: { x: 5, y: 5 } });
    await expect(modal).toBeHidden();
  });

  test('clicking the close button on the About modal closes it', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await page.locator('[data-action="about:open"]').click();
    await expect(page.locator('#aboutModal')).toBeVisible();

    await page.locator('#aboutModal [data-action="about:close"]').click();
    await expect(page.locator('#aboutModal')).toBeHidden();
  });

  test('About modal opens scrolled to the top', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await page.locator('[data-action="about:open"]').click();
    await expect(page.locator('#aboutModal')).toBeVisible();

    // The modal content's scrollTop should be 0 immediately on open
    const scrollTop = await page.locator('#aboutModal .modal-content').evaluate(el => el.scrollTop);
    expect(scrollTop).toBe(0);
  });

  // ── Shortcuts modal ───────────────────────────────────────────────────────

  test('clicking "Shortcuts" in the dropdown opens the Shortcuts modal', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await page.locator('[data-action="shortcuts:open"]').click();
    await expect(page.locator('#shortcutsModal')).toBeVisible();
  });

  test('clicking the Shortcuts modal backdrop closes it', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await page.locator('[data-action="shortcuts:open"]').click();
    const modal = page.locator('#shortcutsModal');
    await expect(modal).toBeVisible();

    await modal.click({ position: { x: 5, y: 5 } });
    await expect(modal).toBeHidden();
  });
});
