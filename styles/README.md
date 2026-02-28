# styles/

CSS stylesheets split by concern. All four files are imported by `index.html`.

---

## Files

### `base.css`

Reset, typography, CSS variables (colours, spacing, font sizes), and global element defaults. This is the foundation — everything else builds on it.

### `components.css`

Reusable UI components: cards (`.note`), buttons, modals, the top header, inputs, badges, tags, priority indicators, context menus, and the notebook sidebar. If it appears on-screen in more than one place, it lives here.

### `features.css`

Feature-specific styles that are large or isolated enough to need their own section: the sub-kanban board, the history panel inside the task modal, the clocks widget, the search overlay, the storage monitor indicator, and the drag-and-drop visual feedback.

### `responsive.css`

Media queries for small screens (≤ 768 px). Adjusts the layout from multi-column kanban to a stacked single-column view. Also handles touch-friendly spacing and font size adjustments.

---

## Conventions

- CSS custom properties (variables) are declared in `base.css` under `:root`
- Priority colours: `.priority-high` / `.priority-medium` / `.priority-low` are in `components.css`
- No CSS-in-JS, no Tailwind, no CSS modules — plain CSS that any browser can read
- All styles are globally scoped (no shadow DOM); class names act as the namespace
