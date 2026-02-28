# KanTrack — Improvement Plan (High-Impact Roadmap)

This document captures a comprehensive set of improvements for the KanTrack page and repo, based on a review of:

- Live page: `pages/kantrack.html`
- Repo: `SkoiZz94/SkoiZz94.github.io` (modules under `scripts/kantrack-modules/`, entry `scripts/kantrack.js`)

Use this as a working checklist and implementation plan.

---

## 1) Architecture & Maintainability (Highest ROI)

### 1.1 Replace inline handlers + `window.*` exports with event delegation

**Current pattern**

- Many functions are attached to `window` to support HTML `onclick` handlers.

**Why improve**

- Global namespace pollution
- Harder refactors (everything becomes “public API”)
- Harder testing and encapsulation
- Greater risk of accidental collisions

**Target pattern**

- Add `data-action="..."` attributes to buttons/links
- Use a single delegated listener:
  - `document.addEventListener("click", (e) => {...})`
  - Route to action handlers via an `actions` map

**Acceptance criteria**

- No inline `onclick` in HTML
- No (or minimal) `window.* = fn` exports
- All UI actions triggered through `data-action` routing

---

### 1.2 Replace shared mutable exported state with a predictable Store

**Current pattern**

- Central state module exports many mutable variables (`let`) plus setters.

**Why improve**

- “Spooky action at a distance”
- Hard to reason about correctness as features grow
- Hard to test without DOM

**Target pattern**
Implement a small store (framework-free):

- `getState()` – returns immutable snapshot (or deep-frozen in dev)
- `dispatch(action)` – only way to change state
- `subscribe(listener)` – react to state changes

**Action design**

- `type` + `payload`
- Keep all state transitions in reducers (pure functions)

**Side effects**

- Storage writes, PDF export, IDB sync should be handled explicitly:
  - (A) by middleware layer, or
  - (B) in async “effects” functions triggered by actions

**Acceptance criteria**

- No direct mutation of exported variables from modules
- Most logic is testable without the DOM

---

### 1.3 Add a build pipeline (Vite + TypeScript recommended)

**Why improve**

- Faster load (bundling/code splitting)
- Type safety (huge refactor leverage)
- Linting/formatting consistency
- Testing harness becomes easy

**Suggested stack**

- Vite
- TypeScript
- ESLint + Prettier
- Vitest (unit tests)
- Playwright (smoke/e2e tests)

**Acceptance criteria**

- `npm run dev`, `npm run build`, `npm test`, `npm run lint` all work
- GitHub Pages deploy pipeline updated (e.g., Actions) if needed

---

## 2) UI/UX & Accessibility (Professional polish)

### 2.1 Modal accessibility & keyboard UX

**Problems to prevent**

- Focus getting lost behind modals
- No ESC close
- Mouse-only flows

**Implement**

- Focus trap for modals
- ESC closes modal
- Enter confirms primary action where appropriate
- Restore focus to the triggering element on close
- Add visible focus states

**ARIA**

- Add `aria-label` to icon-only buttons
- Ensure correct roles for dialogs (`role="dialog"`, `aria-modal="true"`)
- Proper heading labels for dialogs (`aria-labelledby`)

**Acceptance criteria**

- Full modal flows usable with keyboard only
- Lighthouse accessibility score improves measurably

---

### 2.2 Keyboard navigation for board

**Implement**

- Arrow keys to move selection between tasks/columns
- Shortcut keys:
  - `N` new task
  - `/` focus search
  - `?` open shortcuts help
  - `Ctrl/Cmd+Z` undo, `Shift+Ctrl/Cmd+Z` redo (if you add history)
- Provide a shortcuts help dialog

**Acceptance criteria**

- Power users can navigate and add tasks without leaving keyboard

---

### 2.3 Improve information hierarchy & microinteractions

- Consistent button sizing/spacing
- Clear primary vs secondary actions
- Toast notifications for success/failure (exports, restores, saves)
- “Saving…” indicator with offline-friendly behavior

---

## 3) Data Integrity, Storage & Reliability (Trust)

### 3.1 Prefer IndexedDB for structured data; localStorage for prefs only

**Implement**

- Store board/tasks/notes in IDB (versioned)
- Store UI prefs (theme, view toggles) in localStorage

### 3.2 Add schema versioning + migrations

- `DB_VERSION` number
- Upgrade path for older schemas
- Always keep backward-compatible import of exports when possible

### 3.3 Backups & recovery

- One-click export: JSON (board + tasks + settings)
- Periodic autosave with debounced writes
- Snapshot system:
  - Keep last N snapshots or a “last known good” snapshot
- “Recovery” UI:
  - Restore from latest snapshot
  - Validate imports before overwriting current state

**Acceptance criteria**

- User never loses data without an explicit destructive action
- Import validates and provides a preview before applying

---

## 4) Performance & Scalability (Smooth large boards)

### 4.1 Virtualize long lists

- Render only visible task cards in a column
- Basic virtualization is enough (windowing)

### 4.2 Update only changed nodes

- Avoid re-rendering entire columns on small edits
- Prefer patch updates based on action diffs

### 4.3 Debounce expensive operations

- Search/filter, autosave, layout measurements

### 4.4 Schedule non-urgent work

- Use `requestIdleCallback` (with fallback) for cleanup/compression tasks

**Acceptance criteria**

- Board remains responsive with 1,000+ tasks

---

## 5) Security Hardening (Safe notes)

### 5.1 Sanitize any rich content

- Never insert untrusted HTML directly
- Prefer DOM APIs over `innerHTML`
- If rich text is required, sanitize with a well-maintained sanitizer

### 5.2 Add a Content Security Policy (CSP)

- Use a strict CSP via meta tag (or headers if possible)
- Avoid inline scripts/styles as you migrate

**Acceptance criteria**

- XSS risk reduced
- No unsanitized user content inserted into DOM

---

## 6) Product Features That Increase Stickiness

### 6.1 “Real Kanban” features

- WIP limits per column (with warnings)
- Swimlanes (by tag/priority/due date)
- Recurring tasks
- Templates (daily/weekly routines)
- Quick add parsing:
  - `p:high #tag due:2026-03-01`

### 6.2 Better task semantics

- Dependencies (blocked by / blocking)
- Bulk edit (tags, due dates, move column)
- Better history view (audit trail per task)

---

## 7) Repo & Process Improvements (Signals quality immediately)

### 7.1 Documentation

Add:

- README with:
  - screenshots
  - feature list
  - keyboard shortcuts
  - storage model
  - export/import formats
- CONTRIBUTING
- CODE_OF_CONDUCT (optional)
- CHANGELOG

### 7.2 GitHub hygiene

- Issue templates (bug/feature)
- PR template
- CI: lint + tests on PR

### 7.3 Release workflow

- Semantic versioning
- Release notes
- Tag + GitHub Releases

---

## 8) Concrete Refactor Plan (Safe, incremental steps)

### Phase 0 — Baseline & safety net (1–2 sessions)

- Add ESLint + Prettier (even before TS)
- Add minimal unit tests for state transitions (or current core functions)
- Add a smoke test to load the app and create a task

### Phase 1 — Events + UI wiring (high leverage)

- Introduce `data-action` attributes
- Add centralized router (event delegation)
- Remove most `window.*` bindings
- Keep function signatures stable during migration

### Phase 2 — Store introduction

- Create store skeleton with `dispatch/subscribe/getState`
- Migrate one feature slice at a time:
  - tasks CRUD
  - column moves
  - tags/priorities
- Wrap persistence as effects triggered by actions

### Phase 3 — Build system + TypeScript

- Move to Vite
- Convert modules gradually to TS
- Add strict TS settings after initial migration

### Phase 4 — Performance + accessibility

- Modal focus management
- Keyboard shortcuts
- Virtualized columns for large boards

### Phase 5 — Reliability + backups

- IDB migrations
- Export/import validation
- Snapshot recovery UI

---

## 9) Quick Wins Checklist (Do these first)

- [ ] Add `data-action` click routing
- [ ] Remove inline `onclick` attributes
- [ ] Reduce/eliminate `window.*` exports
- [ ] Add lint + format
- [ ] Add “Saving…” + toast notifications
- [ ] Modal focus trap + ESC close + ARIA labels
- [ ] Add JSON export/import with validation
- [ ] Add IDB schema version + migration

---

## 10) Suggested Metrics (to validate “considerable” improvement)

- Lighthouse:
  - Accessibility score ↑
  - Performance score ↑
  - Best Practices score ↑
- Bug rate:
  - Fewer regressions after refactors (CI catches issues)
- Maintainability:
  - Fewer global functions
  - More code covered by unit tests
- UX:
  - Keyboard-only usability for core flows
  - Smooth interactions on large boards

---

## Notes for Implementation

- Keep changes incremental and shippable.
- Prefer “small PRs” that preserve functionality.
- Add tests around the store early; it will pay off repeatedly.
