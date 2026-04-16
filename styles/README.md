# styles/

CSS stylesheets split by concern. All four files are imported by `index.html`.

---

## Files

### `base.css`

Reset, typography, CSS variables (colours, spacing, font sizes), global element defaults, and the `.sr-only` utility class (visually hidden but accessible to screen readers). This is the foundation — everything else builds on it.

### `components.css`

Reusable UI components: cards (`.note`), buttons, modals, the top header, inputs, badges, tags, priority indicators, context menus, and the notebook sidebar. If it appears on-screen in more than one place, it lives here.

### `features.css`

Feature-specific styles that are large or isolated enough to need their own section: the sub-kanban board, the history panel inside the task modal, the clocks widget, the search overlay, the storage monitor indicator, drag-and-drop visual feedback, the pinned-tag management panel inside the tag selector, and `.note:focus-visible` keyboard focus ring for card navigation.

Notable rules:

- `.tag-color-input-hidden` — collapses the `<input type="color">` to zero size with `pointer-events: none`; the picker is opened programmatically to prevent its browser-enforced minimum dimensions from overlapping adjacent elements (e.g. the Pin checkbox)
- `.tag-pin-checkbox input[type='checkbox']` — explicitly resets `flex: none` and `min-width: unset` to cancel the broad `.tag-dropdown-create input` rule that would otherwise stretch the checkbox across the row
- `.tree-item-expand` — includes `cursor: pointer` so click events fire reliably on the folder expand arrow across all platforms

### `responsive.css`

Media queries for small screens (≤ 768 px). Adjusts the layout from multi-column kanban to a stacked single-column view. Also handles touch-friendly spacing and font size adjustments.

---

## Conventions

- CSS custom properties (variables) are declared in `base.css` under `:root`
- Priority colours: `.priority-high` / `.priority-medium` / `.priority-low` are in `components.css`
- No CSS-in-JS, no Tailwind, no CSS modules — plain CSS that any browser can read
- All styles are globally scoped (no shadow DOM); class names act as the namespace
