# styles/

CSS stylesheets split by concern. All four files are imported by `index.html`.

---

## Files

### `base.css`

Reset, typography, CSS variables (colours, spacing, font sizes), global element defaults, and the `.sr-only` utility class (visually hidden but accessible to screen readers). This is the foundation — everything else builds on it.

### `components.css`

Reusable UI components: cards (`.note`), buttons, modals, the top header, inputs, badges, tags, priority indicators, context menus, and the notebook sidebar. If it appears on-screen in more than one place, it lives here.

### `features.css`

Feature-specific styles that are large or isolated enough to need their own section: the sub-kanban board, the history panel inside the task modal, the clocks widget, the search overlay, the storage monitor indicator, drag-and-drop visual feedback, the pinned-tag management panel inside the tag selector, the `.kt-hidden-*` Hidden Cards modal (and `.kt-capacity-*` Done-column-limit dialog, which reuses the same classes), and `.note:focus-visible` keyboard focus ring for card navigation.

Notable rules:

- `.kt-hidden-modal` / `.kt-hidden-*` — shared "KanTrack look" for native `<dialog>` pop-ups (dark gradient background, teal `#43ffd2` accent, pill badges/buttons), matching the Help modal aesthetic; used by both the Hidden Cards modal (`hidden-cards.js`) and the Done column limit dialog (`done-capacity.js`, via the additional `.kt-capacity-*` accent classes)
- `.tag-color-input-hidden` — collapses the `<input type="color">` to zero size with `pointer-events: none`; the picker is opened programmatically to prevent its browser-enforced minimum dimensions from overlapping adjacent elements (e.g. the Pin checkbox)
- `.tag-pin-checkbox input[type='checkbox']` — explicitly resets `flex: none` and `min-width: unset` to cancel the broad `.tag-dropdown-create input` rule that would otherwise stretch the checkbox across the row
- `.tree-item-expand` — includes `cursor: pointer` so click events fire reliably on the folder expand arrow across all platforms

### `responsive.css`

Media queries keyed by viewport width. Each breakpoint and what it governs:

| Breakpoint            | Governs                                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 1200 px (min-width) | Widens the notes container to use more horizontal space                                                                                                                                       |
| ≤ 1024 px             | Reduces kanban column min-width so columns scale down gracefully                                                                                                                              |
| ≤ 900 px              | Shrinks the header height and adjusts header padding                                                                                                                                          |
| ≤ 768 px              | Notebook sidebar goes full-width; notes container, sub-kanban modal, tag filter row, trash panel, notification container all switch to stacked/auto layouts                                   |
| ≤ 700 px              | Hides the clock widget row; shows current time in the header; makes `.header-center` `position: absolute` so `positionHeaderLogo()` can centre it between the visible left and right sections |
| ≤ 640 px              | Reduces kanban column gap                                                                                                                                                                     |
| ≤ 600 px              | Collapses the help feature grid to a single column                                                                                                                                            |
| ≤ 480 px              | Hides the Support Us button; collapses sub-kanban modal action row; small-screen general adjustments                                                                                          |
| ≤ 400 px              | Collapses the help feature grid cards to minimal layout                                                                                                                                       |

---

## Conventions

- CSS custom properties (variables) are declared in `base.css` under `:root`
- Priority colours: `.priority-high` / `.priority-medium` / `.priority-low` are in `components.css`
- No CSS-in-JS, no Tailwind, no CSS modules — plain CSS that any browser can read
- All styles are globally scoped (no shadow DOM); class names act as the namespace
