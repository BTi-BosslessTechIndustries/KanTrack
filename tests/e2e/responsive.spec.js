/**
 * KanTrack responsive layout tests.
 *
 * Verifies that:
 *   1. The kanban board always renders 4 columns regardless of viewport width.
 *   2. The clock row never wraps its items onto a second line.
 *   3. The clock panel hides at ≤700px and the header shows current time instead.
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
    // Wide viewport: 5 default clocks each hit max-width 160px: cqw at max
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

    // Narrow viewport above 700px: clock panel is still visible, container queries apply.
    // Must stay above 700px — below that the panel is hidden and the container has no size.
    await page.setViewportSize({ width: 750, height: 900 });
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

test.describe('Clock panel 700px breakpoint', () => {
  // Start each test with 5 default clocks so the clock panel is expanded.
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      localStorage.removeItem('kanbanClocks');
      await new Promise(resolve => {
        const req = indexedDB.open('KanbanDB');
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction('clocks', 'readwrite');
            tx.objectStore('clocks').clear();
            tx.oncomplete = resolve;
            tx.onerror = resolve;
          } catch {
            resolve();
          }
        };
        req.onerror = resolve;
      });
    });
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('.top-header')).toBeVisible();
    // Confirm 5 default clocks are loaded (expanded state)
    await expect(page.locator('body')).not.toHaveClass(/clocks-collapsed/);
  });

  test('clock panel is hidden at 699px when multiple clocks are present', async ({ page }) => {
    await page.setViewportSize({ width: 699, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    await expect(page.locator('.clock-wrapper')).toBeHidden();
  });

  test('header clock group is visible at 699px when multiple clocks are present', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 699, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    await expect(page.locator('#headerClockGroup')).toBeVisible();
  });

  test('header clock time shows HH:MM format at 699px', async ({ page }) => {
    await page.setViewportSize({ width: 699, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const timeText = await page.locator('#headerClockTime').textContent();
    expect(timeText).toMatch(/^\d{2}:\d{2}$/);
  });

  test('clock panel is visible at 701px when multiple clocks are present', async ({ page }) => {
    await page.setViewportSize({ width: 701, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    await expect(page.locator('.clock-wrapper')).toBeVisible();
  });

  test('header clock group is hidden at 701px when multiple clocks are present', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 701, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    await expect(page.locator('#headerClockGroup')).toBeHidden();
  });

  test('logo is centered between left and right header content at 699px', async ({ page }) => {
    await page.setViewportSize({ width: 699, height: 800 });
    // positionHeaderLogo runs inside a requestAnimationFrame — tick one frame so
    // style.left is updated before we read positions.
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));

    const { logoCenter, visualMidpoint } = await page.evaluate(() => {
      const center = document.querySelector('.header-center');
      const rect = center.getBoundingClientRect();
      const logoCenter = rect.left + rect.width / 2;
      const supportRight = document.querySelector('.support-us-btn').getBoundingClientRect().right;
      const addClockLeft = document
        .getElementById('headerAddClockBtn')
        .getBoundingClientRect().left;
      return { logoCenter, visualMidpoint: (supportRight + addClockLeft) / 2 };
    });

    expect(Math.abs(logoCenter - visualMidpoint)).toBeLessThanOrEqual(2);
  });

  test('header-center is position:absolute at 699px and position:static at 701px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 699, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const posNarrow = await page
      .locator('.header-center')
      .evaluate(el => getComputedStyle(el).position);
    expect(posNarrow).toBe('absolute');

    await page.setViewportSize({ width: 701, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const posWide = await page
      .locator('.header-center')
      .evaluate(el => getComputedStyle(el).position);
    expect(posWide).toBe('static');
  });

  test('clock panel reappears and header clock group hides when resizing above 700px', async ({
    page,
  }) => {
    // Start narrow — panel hidden
    await page.setViewportSize({ width: 699, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    await expect(page.locator('.clock-wrapper')).toBeHidden();

    // Resize above breakpoint — panel should reappear, no data lost
    await page.setViewportSize({ width: 701, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    await expect(page.locator('.clock-wrapper')).toBeVisible();
    await expect(page.locator('#headerClockGroup')).toBeHidden();
    // All 5 clocks still present
    expect(await page.locator('.clock').count()).toBe(5);
  });
});
