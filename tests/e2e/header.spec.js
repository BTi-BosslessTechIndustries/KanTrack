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
