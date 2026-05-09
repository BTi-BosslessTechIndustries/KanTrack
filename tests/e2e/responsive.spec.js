/**
 * KanTrack responsive layout tests.
 *
 * Verifies that:
 *   1. The kanban board always renders 4 columns regardless of viewport width.
 *   2. The clock row never wraps its items onto a second line.
 *
 * All tests run against the production build served by `npm run preview`.
 */
import { test, expect } from '@playwright/test';

test.describe('Layout persistence at narrow viewports', () => {
  test('kanban board keeps 4 columns at 800px viewport width', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const columnCount = await page.evaluate(() => {
      const cols = getComputedStyle(document.querySelector('.kanban-board')).gridTemplateColumns;
      // Computed value is space-separated pixel widths, e.g. "175px 175px 175px 175px"
      return cols.trim().split(/\s+/).length;
    });

    expect(columnCount).toBe(4);
  });

  test('kanban board keeps 4 columns at 500px viewport width', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 900 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const columnCount = await page.evaluate(() => {
      const cols = getComputedStyle(document.querySelector('.kanban-board')).gridTemplateColumns;
      return cols.trim().split(/\s+/).length;
    });

    expect(columnCount).toBe(4);
  });

  test('clock container does not wrap at 500px viewport width', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 900 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const flexWrap = await page.evaluate(() => {
      const container = document.querySelector('.clock-container');
      return container ? getComputedStyle(container).flexWrap : null;
    });

    expect(flexWrap).toBe('nowrap');
  });

  test('clock card text shrinks as the card gets narrower', async ({ page }) => {
    // Wide viewport: 5 default clocks each hit max-width 160px — cqw at max
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const wideFontSize = await page.evaluate(() => {
      const el = document.querySelector('.clock .clock-time');
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    });

    expect(wideFontSize).not.toBeNull();
    // At 160px wide, 13cqw ≈ 20.8px (1.3rem); allow for browser rounding
    expect(wideFontSize).toBeGreaterThan(14);

    // Narrow viewport: 5 clocks divide ~300px of space ≈ 60px each — cqw scales down
    await page.setViewportSize({ width: 400, height: 900 });
    // Force layout recalculation before reading computed style
    await page.evaluate(() => void document.body.offsetHeight);

    const narrowFontSize = await page.evaluate(() => {
      const el = document.querySelector('.clock .clock-time');
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    });

    expect(narrowFontSize).not.toBeNull();
    expect(narrowFontSize).toBeLessThan(wideFontSize);
  });
});
