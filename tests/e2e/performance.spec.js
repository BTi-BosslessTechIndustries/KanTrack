/**
 * Virtual list performance tests.
 *
 * Verifies that the VirtualList keeps the DOM node count well below
 * the total task count when a column has many tasks.
 *
 * INITIAL_RENDER = 20, BUFFER = 5 → at most 25 nodes on first paint.
 * After a full scroll: at most INITIAL_RENDER + 2×BUFFER = 30 extra nodes
 * may accumulate, keeping the total comfortably below 60.
 */
import { test, expect } from '@playwright/test';

/** Seed localStorage with `count` tasks all in the 'todo' column. */
async function seedTasks(page, count, prefix = 'perf') {
  await page.evaluate(
    ({ count, prefix }) => {
      const tasks = Array.from({ length: count }, (_, i) => ({
        id: `${prefix}-${i}`,
        title: `Performance task ${i}`,
        noteEntries: [],
        timer: 0,
        priority: null,
        tags: [],
        dueDate: null,
        column: 'todo',
        deleted: false,
        actions: [{ action: 'Created', timestamp: new Date().toLocaleString(), type: 'created' }],
      }));
      localStorage.setItem('kanbanNotes', JSON.stringify(tasks));
    },
    { count, prefix }
  );
}

test.describe('Virtual list — DOM node budget', () => {
  test('200 tasks should render fewer than 30 .note nodes initially', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await seedTasks(page, 200);

    // Reload so the app boots with 200 tasks
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.top-header')).toBeVisible();

    // VL renders at most INITIAL_RENDER (20) cards on first paint
    const count = await page.locator('#todo .note').count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(30);
  });

  test('scrolling to the bottom of a 200-task column keeps DOM count below 60', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await seedTasks(page, 200, 'scroll');

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.top-header')).toBeVisible();

    // Scroll the todo column to its bottom edge
    const todoCol = page.locator('#todo');
    await todoCol.evaluate(el => (el.scrollTop = el.scrollHeight));

    // Allow IntersectionObserver callbacks to fire and VL to expand the window
    await page.waitForTimeout(400);

    const count = await page.locator('#todo .note').count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(60);
  });
});
