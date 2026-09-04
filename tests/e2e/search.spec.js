/**
 * KanTrack E2E search & filter tests.
 *
 * Covers the live search and keyboard-clear flows:
 *   1. Typing in the search box shows only matching cards.
 *   2. Search is case-insensitive.
 *   3. Clearing the search box restores all cards.
 *   4. Pressing ESC in the search input clears the term and restores cards.
 *   5. A search with no matches results in zero matching cards being rendered.
 *   6. The clear ("×") button's hover hit-box has no dead zones inside its
 *      visible bounds and does not drift past its visible edges.
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

    // Press ESC: the initSearch() handler clears the input and calls setSearchTerm('')
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

  test('clear button hit-box has no hover dead zones and no drift past its visible edges', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    await page.waitForSelector('body[data-app-ready="true"]');

    await page.locator('#taskSearchInput').fill('hit-box regression probe');
    const clearBtn = page.locator('#clearSearchBtn');
    await expect(clearBtn).toBeVisible();

    const rect = await clearBtn.evaluate(el => el.getBoundingClientRect().toJSON());
    const cx = (rect.left + rect.right) / 2;

    // Local helper: what element is actually under the cursor right now.
    const hitId = (x, y) =>
      page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id ?? null, { x, y });

    // Arrive from above via continuous motion, matching how a real mouse
    // approaches the button (a single jump does not reproduce the bug).
    // The -10 offset (like the +5 and -1 below) is deliberate relative to the
    // ~11px drift found during investigation; don't shrink these for "precision"
    // or the test goes flaky against sub-pixel rounding.
    await page.mouse.move(cx, Math.ceil(rect.top) - 10);

    // No dead zone: every row strictly inside the button's own box must hit the button.
    // The page.mouse.move() below is load-bearing: it drives Chromium's real
    // :hover tracking via CDP. Do not "optimize" this into a single batched
    // page.evaluate() that sweeps all rows without moving the real mouse —
    // that would silently stop exercising the actual bug this test guards against.
    for (let y = Math.ceil(rect.top); y < Math.floor(rect.bottom); y++) {
      await page.mouse.move(cx, y);
      const rowHitId = await hitId(cx, y);
      expect(
        rowHitId,
        `expected #clearSearchBtn to be hit at y=${y} (button rect ${rect.top}-${rect.bottom})`
      ).toBe('clearSearchBtn');
    }

    // No drift: a few pixels past the visible bottom edge must NOT still resolve to the button.
    const belowY = Math.round(rect.bottom) + 5;
    await page.mouse.move(cx, belowY);
    const hitBelowId = await hitId(cx, belowY);
    expect(hitBelowId).not.toBe('clearSearchBtn');

    // Functional check: clicking right at the boundary still clears the input.
    await page.mouse.move(cx, Math.floor(rect.bottom) - 1);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator('#taskSearchInput')).toHaveValue('');
  });
});
