/**
 * KanTrack E2E header UI tests.
 *
 * Covers the header elements added post-Phase 7:
 *   1.  Support Us button opens the Support modal.
 *   2.  ESC closes the Support modal.
 *   3.  Clicking the Support modal backdrop closes it.
 *   4.  Clicking the close button on the Support modal closes it.
 *   5.  Credit button contains "BTi".
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

    // Verify the dropdown is not clipped by an overflow boundary —
    // it must have non-zero dimensions and be rendered on screen.
    // Note: the dropdown opens below the menu button, which is centred
    // inside the 60px header, so its top may sit within the header's
    // height range — checking only that it is rendered on screen (y >= 0)
    // and has a usable size is the correct invariant.
    const box = await page.locator('#headerDropdown').boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThan(0);
    expect(box.width).toBeGreaterThan(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
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

  // ── Card size picker ──────────────────────────────────────────────────────

  test('card size picker is visible in the dropdown', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await expect(page.locator('.card-size-picker')).toBeVisible();
    await expect(page.locator('.card-size-btn[data-action-param="small"]')).toBeVisible();
    await expect(page.locator('.card-size-btn[data-action-param="medium"]')).toBeVisible();
    await expect(page.locator('.card-size-btn[data-action-param="large"]')).toBeVisible();
  });

  test('medium button is active by default', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await expect(page.locator('.card-size-btn[data-action-param="medium"]')).toHaveClass(/active/);
    await expect(page.locator('.card-size-btn[data-action-param="small"]')).not.toHaveClass(
      /active/
    );
    await expect(page.locator('.card-size-btn[data-action-param="large"]')).not.toHaveClass(
      /active/
    );
  });

  test('clicking Small adds card-size-small class to body', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await page.locator('.card-size-btn[data-action-param="small"]').click();
    await expect(page.locator('body')).toHaveClass(/card-size-small/);
    await expect(page.locator('.card-size-btn[data-action-param="small"]')).toHaveClass(/active/);
    await expect(page.locator('.card-size-btn[data-action-param="medium"]')).not.toHaveClass(
      /active/
    );
  });

  test('clicking Large adds card-size-large class to body', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await page.locator('.card-size-btn[data-action-param="large"]').click();
    await expect(page.locator('body')).toHaveClass(/card-size-large/);
    await expect(page.locator('.card-size-btn[data-action-param="large"]')).toHaveClass(/active/);
  });

  test('card size preference persists across page reloads', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await page.locator('.card-size-btn[data-action-param="small"]').click();
    await expect(page.locator('body')).toHaveClass(/card-size-small/);

    await page.reload();
    await expect(page.locator('.top-header')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/card-size-small/);
  });

  test('dropdown stays open after selecting a card size', async ({ page }) => {
    await page.locator('#headerMenuBtn').click();
    await page.locator('.card-size-btn[data-action-param="small"]').click();
    await expect(page.locator('#headerDropdown')).toBeVisible();
  });

  // ── Card size font-size proportionality ───────────────────────────────────

  test.describe('card text scales proportionally with card size', () => {
    async function getCardFontSizes(page) {
      return page.evaluate(() => {
        const ids = {
          noteContent: 'tc-note-content',
          noteText: 'tc-note-text',
          priority: 'tc-priority',
          taskTag: 'tc-task-tag',
          dueDate: 'tc-due-date',
          subtask: 'tc-subtask',
        };
        return Object.fromEntries(
          Object.entries(ids).map(([key, id]) => [
            key,
            parseFloat(getComputedStyle(document.getElementById(id)).fontSize),
          ])
        );
      });
    }

    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.top-header')).toBeVisible();
      await page.evaluate(() => {
        const card = document.createElement('div');
        card.id = 'test-card';
        card.className = 'note';
        card.innerHTML = `
          <div class="note-content" id="tc-note-content">Title</div>
          <div class="note-text" id="tc-note-text">Preview text</div>
          <div class="priority-display" id="tc-priority">Priority: None</div>
          <div class="worked-time" id="tc-worked-time">Worked Time: 0h</div>
          <div class="timestamp" id="tc-timestamp">Created: now</div>
          <span class="task-tag" id="tc-task-tag">bug</span>
          <div class="task-due-date" id="tc-due-date">2026-05-10</div>
          <div class="sub-task-indicator" id="tc-subtask">0/2 sub-tasks</div>
        `;
        document.body.appendChild(card);
      });
    });

    test.afterEach(async ({ page }) => {
      await page.evaluate(() => {
        document.getElementById('test-card')?.remove();
        document.body.classList.remove('card-size-small', 'card-size-large');
        localStorage.removeItem('cardSize');
      });
    });

    test('all card text elements shrink when switching to small', async ({ page }) => {
      const medium = await getCardFontSizes(page);

      await page.locator('#headerMenuBtn').click();
      await page.locator('.card-size-btn[data-action-param="small"]').click();

      const small = await getCardFontSizes(page);

      expect(small.noteContent).toBeLessThan(medium.noteContent);
      expect(small.noteText).toBeLessThan(medium.noteText);
      expect(small.priority).toBeLessThan(medium.priority);
      expect(small.taskTag).toBeLessThan(medium.taskTag);
      expect(small.dueDate).toBeLessThan(medium.dueDate);
      expect(small.subtask).toBeLessThan(medium.subtask);
    });

    test('all card text elements grow when switching to large', async ({ page }) => {
      const medium = await getCardFontSizes(page);

      await page.locator('#headerMenuBtn').click();
      await page.locator('.card-size-btn[data-action-param="large"]').click();

      const large = await getCardFontSizes(page);

      expect(large.noteContent).toBeGreaterThan(medium.noteContent);
      expect(large.noteText).toBeGreaterThan(medium.noteText);
      expect(large.priority).toBeGreaterThan(medium.priority);
      expect(large.taskTag).toBeGreaterThan(medium.taskTag);
      expect(large.dueDate).toBeGreaterThan(medium.dueDate);
      expect(large.subtask).toBeGreaterThan(medium.subtask);
    });

    test('note-text scales at same rate as note-content in small', async ({ page }) => {
      const medium = await getCardFontSizes(page);

      await page.locator('#headerMenuBtn').click();
      await page.locator('.card-size-btn[data-action-param="small"]').click();

      const small = await getCardFontSizes(page);

      const contentRatio = small.noteContent / medium.noteContent;
      const textRatio = small.noteText / medium.noteText;

      // Ratios should be within 5% of each other
      expect(Math.abs(textRatio - contentRatio)).toBeLessThan(0.05); // 5% tolerance for sub-pixel rounding
    });

    test('note-text scales at same rate as note-content in large', async ({ page }) => {
      const medium = await getCardFontSizes(page);

      await page.locator('#headerMenuBtn').click();
      await page.locator('.card-size-btn[data-action-param="large"]').click();

      const large = await getCardFontSizes(page);

      const contentRatio = large.noteContent / medium.noteContent;
      const textRatio = large.noteText / medium.noteText;

      expect(Math.abs(textRatio - contentRatio)).toBeLessThan(0.05); // 5% tolerance for sub-pixel rounding
    });
  });
});

test.describe('header responsive layout', () => {
  const getHeight = (page, selector) =>
    page.locator(selector).evaluate(el => Math.round(parseFloat(getComputedStyle(el).height)));

  const getBox = (page, selector) => page.locator(selector).boundingBox();

  // ── Support button visibility and proportional scaling ───────────────────
  // Visible above 480px, scaling continuously via clamp(). Hidden at <=480px.

  test('support button is visible at 1280px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    await expect(page.locator('.support-us-btn')).toBeVisible();
  });

  test('support button is visible at 768px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    await expect(page.locator('.support-us-btn')).toBeVisible();
  });

  test('support button is visible at 481px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 481, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    await expect(page.locator('.support-us-btn')).toBeVisible();
  });

  test('support button is hidden at 480px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    await expect(page.locator('.support-us-btn')).toBeHidden();
  });

  test('support button is hidden at 400px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    await expect(page.locator('.support-us-btn')).toBeHidden();
  });

  test('support button shrinks proportionally as viewport narrows', async ({ page }) => {
    const getBtnWidth = async () =>
      page.locator('.support-us-btn').evaluate(el => el.getBoundingClientRect().width);

    // At 1280px: clamp max — font 12.5px, horizontal padding 14px each side
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const widthAt1280 = await getBtnWidth();

    // At 600px: padding hits clamp min (7px each side) — clearly smaller than 1280px
    // 1.1vw=6.6px < 7px floor, so horizontal padding = 7px vs 14px at 1280px
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const widthAt600 = await getBtnWidth();

    expect(widthAt600).toBeLessThan(widthAt1280);
  });

  // ── BTi logo scaling ──────────────────────────────────────────────────────

  test('BTi logo shrinks at each responsive breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const h1280 = await getHeight(page, '.header-credit-logo');
    expect(h1280).toBe(52);

    await page.setViewportSize({ width: 900, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const h900 = await getHeight(page, '.header-credit-logo');
    expect(h900).toBe(44);

    await page.setViewportSize({ width: 768, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const h768 = await getHeight(page, '.header-credit-logo');
    expect(h768).toBe(36);

    expect(h900).toBeLessThan(h1280);
    expect(h768).toBeLessThan(h900);
  });

  // ── KanTrack logo scaling ─────────────────────────────────────────────────
  // Logo uses clamp(100px, 18vw, 210px) width so it scales proportionally.

  test('KanTrack logo width scales proportionally with the viewport', async ({ page }) => {
    const getLogoWidth = () =>
      page
        .locator('.header-logo img')
        .evaluate(el => Math.round(parseFloat(getComputedStyle(el).width)));

    // At 1280px: 18vw = 230px → capped at 210px
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const w1280 = await getLogoWidth();
    expect(w1280).toBe(210);

    // At 900px: 18vw = 162px (within clamp range)
    await page.setViewportSize({ width: 900, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const w900 = await getLogoWidth();
    expect(w900).toBe(162);

    // At 600px: 18vw = 108px (within clamp range)
    await page.setViewportSize({ width: 600, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const w600 = await getLogoWidth();
    expect(w600).toBe(108);

    // At 480px: 18vw = 86px → floored at 100px (clamp minimum)
    await page.setViewportSize({ width: 480, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const w480 = await getLogoWidth();
    expect(w480).toBe(100);

    // Verify monotonically decreasing
    expect(w900).toBeLessThan(w1280);
    expect(w600).toBeLessThan(w900);
    expect(w480).toBeLessThanOrEqual(w600);
  });

  test('KanTrack logo maintains aspect ratio as it scales', async ({ page }) => {
    const getBox = selector =>
      page.locator(selector).evaluate(el => {
        const s = getComputedStyle(el);
        return { width: parseFloat(s.width), height: parseFloat(s.height) };
      });

    // KanTrack logo is 700x150px natural — aspect ratio ≈ 4.67:1
    const expectedRatio = 700 / 150;

    for (const width of [1280, 900, 600]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.locator('.top-header')).toBeVisible();
      const { width: w, height: h } = await getBox('.header-logo img');
      const ratio = w / h;
      expect(Math.abs(ratio - expectedRatio)).toBeLessThan(0.1);
    }
  });

  // ── No overlap between header columns ────────────────────────────────────

  test('header left, center, and right sections do not overlap at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const left = await getBox(page, '.header-left');
    const center = await getBox(page, '.header-center');
    const right = await getBox(page, '.header-right');

    expect(left.x + left.width).toBeLessThanOrEqual(center.x + 1);
    expect(center.x + center.width).toBeLessThanOrEqual(right.x + 1);
  });

  test('header left, center, and right sections do not overlap at 900px', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const left = await getBox(page, '.header-left');
    const center = await getBox(page, '.header-center');
    const right = await getBox(page, '.header-right');

    expect(left.x + left.width).toBeLessThanOrEqual(center.x + 1);
    expect(center.x + center.width).toBeLessThanOrEqual(right.x + 1);
  });

  test('header left, center, and right sections do not overlap at 768px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const left = await getBox(page, '.header-left');
    const center = await getBox(page, '.header-center');
    const right = await getBox(page, '.header-right');

    expect(left.x + left.width).toBeLessThanOrEqual(center.x + 1);
    expect(center.x + center.width).toBeLessThanOrEqual(right.x + 1);
  });

  test('header left, center, and right sections do not overlap at 500px', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const left = await getBox(page, '.header-left');
    const center = await getBox(page, '.header-center');
    const right = await getBox(page, '.header-right');

    expect(left.x + left.width).toBeLessThanOrEqual(center.x + 1);
    expect(center.x + center.width).toBeLessThanOrEqual(right.x + 1);
  });

  test('support button does not overflow into the center logo at 500px', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const btnBox = await page.locator('.support-us-btn').boundingBox();
    const centerBox = await getBox(page, '.header-center');

    // Right edge of support button must not reach the left edge of center logo
    expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(centerBox.x + 1);
  });

  // ── Button proportional scaling ───────────────────────────────────────────

  test('header action buttons scale proportionally as viewport narrows', async ({ page }) => {
    const getBtnSize = async () =>
      page.locator('#undoBtn').evaluate(el => Math.round(el.getBoundingClientRect().width));

    // At 1280px: clamp(28px, 3.5vw, 36px) → 3.5vw = 44.8px → capped at 36px
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const at1280 = await getBtnSize();
    expect(at1280).toBe(36);

    // Navigate fresh at 768px so vw units are calculated from scratch.
    // clamp(28px, 3.5vw, 36px) → 3.5vw = 26.9px → floored at 28px.
    await page.setViewportSize({ width: 768, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const at768 = await getBtnSize();

    // Button must be smaller than at 1280px (proportional scaling works)
    // and must not fall below the clamp minimum of 28px.
    expect(at768).toBeLessThan(at1280);
    expect(at768).toBeGreaterThanOrEqual(28);
  });

  test('space between More Options and View Trash buttons shrinks as viewport narrows', async ({
    page,
  }) => {
    const getGap = async () => {
      const menu = await page.locator('#headerMenuBtn').boundingBox();
      const trash = await page.locator('#trashToggleBtn').boundingBox();
      return trash.x - (menu.x + menu.width);
    };

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const gapWide = await getGap();

    await page.setViewportSize({ width: 768, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const gapNarrow = await getGap();

    expect(gapNarrow).toBeLessThan(gapWide);
  });

  test('notebook toggle button scales proportionally as viewport narrows', async ({ page }) => {
    const getSize = async () =>
      page
        .locator('.notebook-toggle-btn')
        .evaluate(el => Math.round(el.getBoundingClientRect().width));

    // At 1280px: clamp(30px, 3.7vw, 40px) → 3.7vw = 47.4px → capped at 40px
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const at1280 = await getSize();
    expect(at1280).toBe(40);

    // Navigate fresh at 768px so vw units are calculated from scratch.
    // clamp(30px, 3.7vw, 40px) → 3.7vw = 28.4px → floored at 30px.
    await page.setViewportSize({ width: 768, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const at768 = await getSize();

    // Button must be smaller than at 1280px (proportional scaling works)
    // and must not fall below the clamp minimum of 30px.
    expect(at768).toBeLessThan(at1280);
    expect(at768).toBeGreaterThanOrEqual(30);
  });

  test('action button SVG icons scale proportionally as viewport narrows', async ({ page }) => {
    const getSvgSize = () =>
      page
        .locator('#undoBtn svg')
        .evaluate(el => Math.round(parseFloat(getComputedStyle(el).width)));

    // At 1280px: clamp max — 1.8vw = 23px, capped at 20px
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const svgAt1280 = await getSvgSize();
    expect(svgAt1280).toBe(20);

    // At 768px: clamp min — 1.8vw = 13.8px, floored at 14px
    await page.setViewportSize({ width: 768, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const svgAt768 = await getSvgSize();
    expect(svgAt768).toBe(14);

    expect(svgAt768).toBeLessThan(svgAt1280);
  });

  test('notebook toggle SVG icon scales proportionally as viewport narrows', async ({ page }) => {
    const getSvgSize = () =>
      page
        .locator('.notebook-toggle-btn svg')
        .evaluate(el => Math.round(parseFloat(getComputedStyle(el).width)));

    // At 1280px: clamp max — 2vw = 25.6px, capped at 22px
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const svgAt1280 = await getSvgSize();
    expect(svgAt1280).toBe(22);

    // At 768px: clamp min — 2vw = 15.4px, floored at 16px
    await page.setViewportSize({ width: 768, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const svgAt768 = await getSvgSize();
    expect(svgAt768).toBe(16);

    expect(svgAt768).toBeLessThan(svgAt1280);
  });

  test('header-right gap shrinks proportionally as viewport narrows', async ({ page }) => {
    const getRightGap = async () => {
      const undoRedo = await page.locator('.header-undo-redo').boundingBox();
      const menu = await page.locator('.header-menu-wrapper').boundingBox();
      return Math.round(menu.x - (undoRedo.x + undoRedo.width));
    };

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const gapWide = await getRightGap();
    expect(gapWide).toBe(12);

    await page.setViewportSize({ width: 768, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const gapNarrow = await getRightGap();

    expect(gapNarrow).toBeLessThan(gapWide);
    expect(gapNarrow).toBeGreaterThanOrEqual(4);
  });

  test('undo-redo gap shrinks proportionally as viewport narrows', async ({ page }) => {
    const getUndoRedoGap = async () => {
      const undo = await page.locator('#undoBtn').boundingBox();
      const redo = await page.locator('#redoBtn').boundingBox();
      return redo.x - (undo.x + undo.width);
    };

    // At 1280px: clamp(2px, 0.6vw, 6px) → 0.6vw=7.68px → capped at 6px
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const gapWide = await getUndoRedoGap();
    expect(gapWide).toBeCloseTo(6, 0);

    // At 768px: 0.6vw=4.6px — smaller than at 1280px
    await page.setViewportSize({ width: 768, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const gapNarrow = await getUndoRedoGap();

    expect(gapNarrow).toBeLessThan(gapWide);
    expect(gapNarrow).toBeGreaterThanOrEqual(2);
  });

  // ── Header height at responsive breakpoints ───────────────────────────────

  test('header height is 60px above 768px and 54px at and below 768px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
    const hFull = await getHeight(page, '.top-header');
    expect(hFull).toBe(60);

    await page.setViewportSize({ width: 768, height: 800 });
    await page.evaluate(() => void document.body.offsetHeight);
    const hNarrow = await getHeight(page, '.top-header');
    expect(hNarrow).toBe(54);
  });

  // ── Essential elements remain usable at smallest tested viewport ──────────

  test('all essential header controls remain visible at 500px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await expect(page.locator('.notebook-toggle-btn')).toBeVisible();
    await expect(page.locator('.header-credit-logo')).toBeVisible();
    await expect(page.locator('.header-logo img')).toBeVisible();
    // Support button is visible above 480px
    await expect(page.locator('.support-us-btn')).toBeVisible();
    await expect(page.locator('#undoBtn')).toBeVisible();
    await expect(page.locator('#redoBtn')).toBeVisible();
    await expect(page.locator('#headerMenuBtn')).toBeVisible();
    await expect(page.locator('#trashToggleBtn')).toBeVisible();
  });

  test('action buttons and BTi logo remain visible at 400px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    await expect(page.locator('.notebook-toggle-btn')).toBeVisible();
    await expect(page.locator('.header-credit-logo')).toBeVisible();
    await expect(page.locator('.header-logo img')).toBeVisible();
    await expect(page.locator('#undoBtn')).toBeVisible();
    await expect(page.locator('#redoBtn')).toBeVisible();
    await expect(page.locator('#headerMenuBtn')).toBeVisible();
    await expect(page.locator('#trashToggleBtn')).toBeVisible();
  });
});
