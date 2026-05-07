# Card Size Toggle — Design Spec

**Date:** 2026-05-07
**Branch:** feature/Resize_cards
**Status:** Approved

---

## Goal

Let users choose between three card sizes (Small / Medium / Large) to control how many cards are visible on screen at once. Medium is the current default. All card information remains visible at every size — only spacing and font scale change. The preference persists across sessions.

---

## Scope

- Global setting (all four columns change together)
- Three sizes: Small, Medium (default, unchanged), Large
- Control lives in the existing 3-dot header dropdown menu
- Dropdown stays open after a size is selected (immediate visual preview)
- Preference persisted to localStorage via existing `safeSetItem`/`safeGetItem` helpers

---

## Approach

**Body class + CSS descendant overrides.**

A class (`card-size-small` or `card-size-large`) is toggled on `<body>`. Medium = no class = existing styles unchanged. All size overrides are CSS-only; no card re-render, no VirtualList changes.

---

## CSS Changes (`styles/base.css`)

Add two override blocks at the bottom of `base.css`. Medium values are the existing defaults — they are not moved or changed.

### Small (`body.card-size-small`)

| Selector        | Property     | Value      |
| --------------- | ------------ | ---------- |
| `.note`         | `padding`    | `8px 12px` |
| `.note`         | `margin`     | `5px 0`    |
| `.note-content` | `font-size`  | `0.95em`   |
| `.note-text`    | `margin-top` | `3px`      |
| `.timestamp`    | `margin-top` | `6px`      |
| `.timestamp`    | `font-size`  | `0.68em`   |
| `.worked-time`  | `margin-top` | `3px`      |
| `.worked-time`  | `font-size`  | `0.78em`   |
| `.edit-delete`  | `margin-top` | `6px`      |

### Large (`body.card-size-large`)

| Selector        | Property     | Value    |
| --------------- | ------------ | -------- |
| `.note`         | `padding`    | `22px`   |
| `.note`         | `margin`     | `14px 0` |
| `.note-content` | `font-size`  | `1.25em` |
| `.note-text`    | `margin-top` | `8px`    |
| `.timestamp`    | `margin-top` | `14px`   |
| `.timestamp`    | `font-size`  | `0.82em` |
| `.worked-time`  | `margin-top` | `8px`    |
| `.worked-time`  | `font-size`  | `0.92em` |
| `.edit-delete`  | `margin-top` | `14px`   |

One additional rule for the card-size picker row layout inside the dropdown (label left, buttons right).

---

## HTML Changes (`index.html`)

Add a Card Size row to the `#headerDropdown`, between "Help" and "Privacy Policy":

```
┌─────────────────────────┐
│ About KanTrack          │
│ View the Code           │
│ Help                    │
│─────────────────────────│
│ Card Size   [S] [M] [L] │
│─────────────────────────│
│ Privacy Policy          │
└─────────────────────────┘
```

- Each button: `data-action="cardSize:set"`, `data-action-param="small"/"medium"/"large"`
- Active button gets `.active` class (accent colour highlight)
- Clicking a size button does **not** close the dropdown

---

## JS Changes (`scripts/kantrack.js`)

### Helper function

```js
function applyCardSize(size) {
  document.body.classList.remove('card-size-small', 'card-size-large');
  if (size === 'small') document.body.classList.add('card-size-small');
  if (size === 'large') document.body.classList.add('card-size-large');

  document.querySelectorAll('[data-action="cardSize:set"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.actionParam === size);
  });
}
```

### Boot (inside DOMContentLoaded, before first render)

```js
const savedSize = safeGetItem('cardSize', 'medium');
applyCardSize(savedSize);
```

### Action registration

```js
registerAction('cardSize:set', param => {
  applyCardSize(param);
  safeSetItem('cardSize', param);
});
```

`safeSetItem` and `safeGetItem` are already imported — no new imports needed.

---

## Files Changed

| File                  | Nature of change                                             |
| --------------------- | ------------------------------------------------------------ |
| `styles/base.css`     | ~25 lines: two size override blocks + picker row layout rule |
| `index.html`          | ~10 lines: Card Size row in `#headerDropdown`                |
| `scripts/kantrack.js` | ~15 lines: `applyCardSize()`, boot call, `registerAction`    |

**No other files touched.** No rendering logic changed. No VirtualList changes. No new dependencies.

---

## What Does Not Change

- Card colours, borders, hover effects, drag behaviour
- Tags, due date badge, sub-task indicator layout
- Priority display
- All four action buttons (🏷️ ⏱️ ❌ and priority)
- Window-resize behaviour (cards already maintain size on window resize — unchanged)
- Any existing tests

---

## Persistence

- Key: `'cardSize'` in localStorage
- Values: `'small'` | `'medium'` | `'large'`
- Default: `'medium'` (returned by `safeGetItem` when key absent)
- Written by `safeSetItem` on every size change
