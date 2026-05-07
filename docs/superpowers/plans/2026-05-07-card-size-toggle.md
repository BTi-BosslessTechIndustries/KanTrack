# Card Size Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global Small / Medium / Large card size toggle in the header dropdown, persisted to localStorage, applied via a body class with CSS-only overrides.

**Architecture:** A class (`card-size-small` / `card-size-large`) on `<body>` drives CSS descendant overrides in `base.css`. Medium = no class = existing default. JS helper `applyCardSize(size)` toggles the class and updates the active state on the three dropdown buttons. Preference is saved to localStorage via the existing `safeSetItem`/`safeGetItem` helpers.

**Tech Stack:** Vanilla JS ES modules, CSS, Playwright (E2E tests), Vite (build/preview)

---

### Task 1: CSS — size override rules + picker row layout

**Files:**

- Modify: `styles/base.css` (append before closing `@media (prefers-reduced-motion)` block)

- [ ] **Step 1: Add the CSS size overrides and picker row rule**

Append the following block to `styles/base.css` immediately **before** the `/* ===== Motion preference ===== */` comment (line 671):

```css
/* ===== Card Size Overrides ===== */

/* Small cards */
body.card-size-small .note {
  padding: 8px 12px;
  margin: 5px 0;
}
body.card-size-small .note-content {
  font-size: 0.95em;
}
body.card-size-small .note-text {
  margin-top: 3px;
}
body.card-size-small .timestamp {
  margin-top: 6px;
  font-size: 0.68em;
}
body.card-size-small .worked-time {
  margin-top: 3px;
  font-size: 0.78em;
}
body.card-size-small .edit-delete {
  margin-top: 6px;
}

/* Large cards */
body.card-size-large .note {
  padding: 22px;
  margin: 14px 0;
}
body.card-size-large .note-content {
  font-size: 1.25em;
}
body.card-size-large .note-text {
  margin-top: 8px;
}
body.card-size-large .timestamp {
  margin-top: 14px;
  font-size: 0.82em;
}
body.card-size-large .worked-time {
  margin-top: 8px;
  font-size: 0.92em;
}
body.card-size-large .edit-delete {
  margin-top: 14px;
}

/* Card size picker row (inside header dropdown) */
.card-size-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.card-size-picker-label {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.78);
}
.card-size-picker-btns {
  display: flex;
  gap: 4px;
}
.card-size-btn {
  margin: 0;
  padding: 3px 9px;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1.4;
  box-shadow: none;
  transform: none;
}
.card-size-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  transform: none;
  box-shadow: none;
}
.card-size-btn.active {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.6);
  color: #93c5fd;
}
```

- [ ] **Step 2: Verify the CSS file is valid (no syntax errors)**

Open `styles/base.css` in an editor and confirm the new block sits between the `.back-to-index` rule and the `@media (prefers-reduced-motion)` block with no unclosed braces.

---

### Task 2: HTML — Card Size row in the dropdown

**Files:**

- Modify: `index.html` lines 64–69

- [ ] **Step 1: Add the Card Size row to the dropdown**

Replace the current `#headerDropdown` content (lines 64–69):

```html
<div class="header-dropdown" id="headerDropdown" style="display:none;" role="menu">
  <button class="header-dropdown-item" data-action="about:open" role="menuitem">
    About KanTrack
  </button>
  <a
    class="header-dropdown-item"
    href="https://github.com/BTi-BosslessTechIndustries/KanTrack"
    target="_blank"
    rel="noopener noreferrer"
    role="menuitem"
    >View the Code</a
  >
  <button class="header-dropdown-item" data-action="shortcuts:open" role="menuitem">Help</button>
  <a
    class="header-dropdown-item"
    href="privacy.html"
    target="_blank"
    rel="noopener noreferrer"
    role="menuitem"
    >Privacy Policy</a
  >
</div>
```

With:

```html
<div class="header-dropdown" id="headerDropdown" style="display:none;" role="menu">
  <button class="header-dropdown-item" data-action="about:open" role="menuitem">
    About KanTrack
  </button>
  <a
    class="header-dropdown-item"
    href="https://github.com/BTi-BosslessTechIndustries/KanTrack"
    target="_blank"
    rel="noopener noreferrer"
    role="menuitem"
    >View the Code</a
  >
  <button class="header-dropdown-item" data-action="shortcuts:open" role="menuitem">Help</button>
  <div class="card-size-picker" role="group" aria-label="Card size">
    <span class="card-size-picker-label">Card Size</span>
    <div class="card-size-picker-btns">
      <button
        class="card-size-btn"
        data-action="cardSize:set"
        data-action-param="small"
        aria-label="Small cards"
        title="Small"
      >
        S
      </button>
      <button
        class="card-size-btn"
        data-action="cardSize:set"
        data-action-param="medium"
        aria-label="Medium cards"
        title="Medium"
      >
        M
      </button>
      <button
        class="card-size-btn"
        data-action="cardSize:set"
        data-action-param="large"
        aria-label="Large cards"
        title="Large"
      >
        L
      </button>
    </div>
  </div>
  <a
    class="header-dropdown-item"
    href="privacy.html"
    target="_blank"
    rel="noopener noreferrer"
    role="menuitem"
    >Privacy Policy</a
  >
</div>
```

---

### Task 3: JS — applyCardSize helper, action registration, boot

**Files:**

- Modify: `scripts/kantrack.js`

- [ ] **Step 1: Add `safeGetItem` and `safeSetItem` to the storage import**

Find the existing storage import block (lines 10–18):

```js
import {
  loadNotesFromLocalStorage,
  saveNotesToLocalStorage,
  loadNotebookFromLocalStorage,
  loadPermanentNotes,
  savePermanentNotes,
  setAutoSaveCallback,
  flushPendingIDBWrites,
} from './kantrack-modules/storage.js';
```

Replace with:

```js
import {
  loadNotesFromLocalStorage,
  saveNotesToLocalStorage,
  loadNotebookFromLocalStorage,
  loadPermanentNotes,
  savePermanentNotes,
  setAutoSaveCallback,
  flushPendingIDBWrites,
  safeGetItem,
  safeSetItem,
} from './kantrack-modules/storage.js';
```

- [ ] **Step 2: Add the `applyCardSize` helper function**

Find the `/***********************\n * ABOUT MODAL` comment block (around line 122). Add the card size section immediately **before** it:

```js
/***********************
 * CARD SIZE
 ***********************/
function applyCardSize(size) {
  document.body.classList.remove('card-size-small', 'card-size-large');
  if (size === 'small') document.body.classList.add('card-size-small');
  if (size === 'large') document.body.classList.add('card-size-large');
  document.querySelectorAll('[data-action="cardSize:set"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.actionParam === size);
  });
}
```

- [ ] **Step 3: Register the cardSize:set action**

Find the block of `registerAction` calls (around line 226). Add the card size action near the top of that block, after the shortcuts registration:

```js
// Card size
registerAction('cardSize:set', param => {
  applyCardSize(param);
  safeSetItem('cardSize', param);
});
```

- [ ] **Step 4: Apply saved size on boot**

Find the `DOMContentLoaded` callback, specifically the line `initRouter();` (around line 508). Add the boot call immediately after:

```js
// Apply saved card size (before first render so cards paint at the right size)
applyCardSize(safeGetItem('cardSize', 'medium'));
```

---

### Task 4: E2E tests

**Files:**

- Modify: `tests/e2e/header.spec.js` (append inside the existing `describe` block)

- [ ] **Step 1: Add card size E2E tests**

Append the following tests inside the `test.describe('KanTrack header UI', ...)` block, before the closing `});`:

```js
// ── Card size picker ──────────────────────────────────────────────────────

test('card size picker is visible in the dropdown', async ({ page }) => {
  await page.locator('#headerMenuBtn').click();
  await expect(page.locator('.card-size-picker')).toBeVisible();
  await expect(page.locator('[data-action-param="small"]')).toBeVisible();
  await expect(page.locator('[data-action-param="medium"]')).toBeVisible();
  await expect(page.locator('[data-action-param="large"]')).toBeVisible();
});

test('medium button is active by default', async ({ page }) => {
  await page.locator('#headerMenuBtn').click();
  await expect(page.locator('[data-action-param="medium"]')).toHaveClass(/active/);
  await expect(page.locator('[data-action-param="small"]')).not.toHaveClass(/active/);
  await expect(page.locator('[data-action-param="large"]')).not.toHaveClass(/active/);
});

test('clicking Small adds card-size-small class to body', async ({ page }) => {
  await page.locator('#headerMenuBtn').click();
  await page.locator('[data-action-param="small"]').click();
  await expect(page.locator('body')).toHaveClass(/card-size-small/);
  await expect(page.locator('[data-action-param="small"]')).toHaveClass(/active/);
  await expect(page.locator('[data-action-param="medium"]')).not.toHaveClass(/active/);
});

test('clicking Large adds card-size-large class to body', async ({ page }) => {
  await page.locator('#headerMenuBtn').click();
  await page.locator('[data-action-param="large"]').click();
  await expect(page.locator('body')).toHaveClass(/card-size-large/);
  await expect(page.locator('[data-action-param="large"]')).toHaveClass(/active/);
});

test('card size preference persists across page reloads', async ({ page }) => {
  await page.locator('#headerMenuBtn').click();
  await page.locator('[data-action-param="small"]').click();
  await expect(page.locator('body')).toHaveClass(/card-size-small/);

  await page.reload();
  await expect(page.locator('.top-header')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/card-size-small/);
});

test('dropdown stays open after selecting a card size', async ({ page }) => {
  await page.locator('#headerMenuBtn').click();
  await page.locator('[data-action-param="small"]').click();
  await expect(page.locator('#headerDropdown')).toBeVisible();
});
```

- [ ] **Step 2: Run the E2E tests**

```bash
npm run build && npm run e2e -- --grep "card size"
```

Expected: all 6 new card-size tests pass.

---

### Verification

- [ ] Run the dev server and open the app: `npm run dev`
- [ ] Open the ⋮ dropdown — confirm "Card Size" row with S / M / L buttons appears
- [ ] Click S → cards visibly compact. Click M → back to default. Click L → cards visibly larger
- [ ] Reload the page → size is remembered
- [ ] Drag a card between columns at each size — confirm drag still works
- [ ] Open a task modal at each size — confirm modal is unaffected
- [ ] Run unit tests: `npm run test:run` — confirm all existing tests still pass
