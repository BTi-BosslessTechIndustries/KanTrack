/**
 * KanTrack E2E search & filter tests.
 *
 * Covers the live search and keyboard-clear flows:
 *   1. Typing in the search box shows only matching cards.
 *   2. Search is case-insensitive.
 *   3. Clearing the search box restores all cards.
 *   4. Pressing ESC in the search input clears the term and restores cards.
 *   5. A search with no matches results in zero matching cards being rendered.
 *
 * All tests run against the production build served by `npm run preview`
 * (started automatically by Playwright's webServer config).
 *
 * Note: The search input is debounced by 200 ms. Playwright's built-in
 * assertion retrying (up to 5 s by default) handles this without explicit
 * waitForTimeout calls.
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

test.describe('KanTrack search & filter', () => {
  test('typing in the search box shows only matching cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const ts = Date.now();
    await createTask(page, `Apple ${ts}`);
    await createTask(page, `Banana ${ts}`);

    await page.locator('#taskSearchInput').fill(`Apple ${ts}`);

    // Matching card remains visible; non-matching card is removed from the DOM
    await expect(page.locator('.note').filter({ hasText: `Apple ${ts}` })).toBeVisible();
    await expect(page.locator('.note').filter({ hasText: `Banana ${ts}` })).toHaveCount(0);
  });

  test('search is case-insensitive', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const ts = Date.now();
    await createTask(page, `CaseSensitive ${ts}`);

    // Type the search term in all-lowercase while the title has mixed case
    await page.locator('#taskSearchInput').fill(`casesensitive ${ts}`);

    await expect(page.locator('.note').filter({ hasText: `CaseSensitive ${ts}` })).toBeVisible();
  });

  test('clearing the search box restores all cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const ts = Date.now();
    await createTask(page, `Alpha ${ts}`);
    await createTask(page, `Beta ${ts}`);

    // Filter down to Alpha only
    await page.locator('#taskSearchInput').fill(`Alpha ${ts}`);
    await expect(page.locator('.note').filter({ hasText: `Beta ${ts}` })).toHaveCount(0);

    // Clear the search
    await page.locator('#taskSearchInput').fill('');

    // Both cards should be visible again
    await expect(page.locator('.note').filter({ hasText: `Alpha ${ts}` })).toBeVisible();
    await expect(page.locator('.note').filter({ hasText: `Beta ${ts}` })).toBeVisible();
  });

  test('pressing ESC in the search input clears the term and restores cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const ts = Date.now();
    await createTask(page, `EscapeTest ${ts}`);

    // Filter the card away with a non-matching term
    await page.locator('#taskSearchInput').fill('zzz_no_match');
    await expect(page.locator('.note').filter({ hasText: `EscapeTest ${ts}` })).toHaveCount(0);

    // Press ESC — the initSearch() handler clears the input and calls setSearchTerm('')
    await page.locator('#taskSearchInput').press('Escape');

    // Card should reappear and the input should be empty
    await expect(page.locator('.note').filter({ hasText: `EscapeTest ${ts}` })).toBeVisible();
    await expect(page.locator('#taskSearchInput')).toHaveValue('');
  });

  test('a search with no matches renders zero cards for that query', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const ts = Date.now();
    await createTask(page, `Visible Task ${ts}`);

    await page.locator('#taskSearchInput').fill(`zzz_impossible_${ts}`);

    // The created task must not appear
    await expect(page.locator('.note').filter({ hasText: `Visible Task ${ts}` })).toHaveCount(0);
  });
});
