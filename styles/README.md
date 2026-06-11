# styles/

CSS stylesheets split by concern. All four files are imported by `index.html`.

---

## Files

### `base.css`

Reset, typography, CSS variables (colours, spacing, font sizes), global element defaults, and the `.sr-only` utility class (visually hidden but accessible to screen readers). This is the foundation - everything else builds on it.

Theme variables live in `:root` (dark, the default) and `body.theme-light` (light overrides); see Theming below.

`.language-picker`, `.language-picker-label`, and `.language-picker-select` style the Language picker in the ⋮ menu, stacking the label above the `<select>` (`flex-direction: column`) so the fixed-width control never overlaps the label.

### `components.css`

Reusable UI components: cards (`.note`), buttons, modals, the top header, inputs, badges, tags, priority indicators, context menus, and the notebook sidebar. If it appears on-screen in more than one place, it lives here.

### `features.css`

Feature-specific styles that are large or isolated enough to need their own section: the sub-kanban board, the history panel inside the task modal, the clocks widget, the search overlay, the storage monitor indicator, drag-and-drop visual feedback, the pinned-tag management panel inside the tag selector, the `.kt-hidden-*` Hidden Cards modal (and `.kt-capacity-*` Done-column-limit dialog, which reuses the same classes), and `.note:focus-visible` keyboard focus ring for card navigation.

Notable rules:

- `.kt-hidden-modal` / `.kt-hidden-*` - shared "KanTrack look" for native `<dialog>` pop-ups (dark gradient background, teal `#43ffd2` accent, pill badges/buttons), matching the Help modal aesthetic; used by both the Hidden Cards modal (`hidden-cards.js`) and the Done column limit dialog (`done-capacity.js`, via the additional `.kt-capacity-*` accent classes)
- `.tag-color-input-hidden` - collapses the `<input type="color">` to zero size with `pointer-events: none`; the picker is opened programmatically to prevent its browser-enforced minimum dimensions from overlapping adjacent elements (e.g. the Pin checkbox)
- `.tag-pin-checkbox input[type='checkbox']` - explicitly resets `flex: none` and `min-width: unset` to cancel the broad `.tag-dropdown-create input` rule that would otherwise stretch the checkbox across the row
- `.tree-item-expand` - includes `cursor: pointer` so click events fire reliably on the folder expand arrow across all platforms

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
- No CSS-in-JS, no Tailwind, no CSS modules - plain CSS that any browser can read
- All styles are globally scoped (no shadow DOM); class names act as the namespace

## Theming

KanTrack supports Light, Dark, and System Default themes via the theme picker in the header's "More Options" (⋮) menu, next to Card Size.

- `:root` in `base.css` defines the dark theme's colours as the default values for a set of semantic variables: `--overlay-rgb`, `--page-bg-start`, `--page-bg-mid`, `--text-primary`, `--text-muted`, `--input-bg-solid`, `--panel-bg-rgb` / `--panel-bg-rgb-alt` (header, dropdowns, modals), and `--card-bg-rgb` / `--card-bg-rgb-alt` (note cards).
- `body.theme-light` overrides each of these with the light-theme equivalents.
- `--overlay-rgb` is the key trick: it's `255, 255, 255` (white) in dark mode and `0, 0, 0` (black) in light mode. Any `rgba(var(--overlay-rgb), X)` declaration therefore lightens content on dark backgrounds and darkens it on light backgrounds at the same alpha - used throughout `components.css` and `features.css` for borders, hover states, and translucent surfaces.
- `scripts/kantrack.js` resolves the active theme (`getEffectiveTheme()`), applies it by toggling `body.theme-light` (`applyTheme()`), and listens for OS colour-scheme changes (`initThemeSystemListener()`) when the mode is `'system'`. The chosen mode (`'light' | 'dark' | 'system'`) is persisted as `themeMode` and defaults to `'system'`.
- Dark backdrops/scrims (e.g. `.kt-hidden-modal::backdrop`, `.modal-overlay`) intentionally stay `rgba(0, 0, 0, A)` in both themes: a dimming layer should always be dark.

## Language

The Language picker (`.language-picker` in `base.css`) sits in the header's "More Options" (⋮) menu, next to Theme. It is a native `<select>` (`#cardLanguageSelect`) with five options: System Default, English (UK), Español, Français, and Português (PT). Selecting a language sets `lang`/`spellcheck="true"` on all editable card and notebook fields so the browser's native spell-checker uses that language's dictionary; "System Default" removes those attributes and leaves spell-check to the OS/browser. The choice is persisted as `cardLanguage` in localStorage.

**Browser support varies**: Safari and Firefox honour the `lang` attribute when choosing a spell-check dictionary, so the picker reliably changes spell-check language in those browsers. Chrome and Edge largely ignore `lang` for dictionary selection and instead use the languages enabled in their own settings, so users on Chrome/Edge may not see any change - this is a browser limitation, not a bug in KanTrack.

`.language-picker` stacks the "Language" label above the `<select>` (`flex-direction: column`). `.language-picker-select` has a fixed `width: 128px` (sized to fit "System Default", the longest option) so the control doesn't resize as the selection changes; `.header-dropdown`'s `min-width` was bumped from 182px to 210px to give the picker enough room. The select uses `appearance: none` with a custom SVG chevron background - Safari ignores the CSS `width` on native `<select>` elements unless their default appearance is removed, so this is required for the fixed width to hold across browsers. See `applyLanguageAttrs()` / `setActiveLanguageCode()` in `scripts/kantrack-modules/utils.js` and `applyLanguageSettings()` in `scripts/kantrack.js`.
