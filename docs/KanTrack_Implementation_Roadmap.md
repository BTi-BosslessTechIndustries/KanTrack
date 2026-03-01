# KanTrack — Implementation Roadmap

## From Current State to Millions of Users

**Document Purpose:**
This is the master engineering checklist for evolving KanTrack from its current working prototype into a production-grade, local-first, privacy-first platform capable of serving millions of users. Every item is grounded in the actual current codebase and cross-validated against the full project philosophy.

Read alongside:

- `KanTrack_Master_Strategy_AI_Prompt.md` — product vision and tier strategy
- `KanTrack_Technical_Architecture_Prompt.md` — full technical spec
- `KanTrack_Improvement_Plan.md` — UX and architectural refactor checklist
- `philosophy/` — the complete philosophical framework governing every decision

---

## The Founding Lens

Before any implementation decision is made, it must pass this filter. These questions come directly from the project's philosophy documents and override any technical preference or business pressure.

**Does this serve the individual doing the work — not the organization assigning it?**
**Does it increase personal workflow clarity, calm, and control?**
**Does it preserve full data ownership and the ability to leave freely?**
**Does it keep the board as the central thinking surface?**
**Does it make the product more like itself — or less?**

If the answer to any of these is "no", reconsider before building.

### Red Lines (never cross these, at any phase)

1. Local Mode must always work fully — offline, without an account, without network
2. No productivity feature may ever require an account
3. The server must never store or be able to read plaintext user data
4. No behavioral analytics — never collect what tasks users create, how often, what they name things
5. No gamification, scoring, rankings, or productivity grades of any kind
6. No urgency-inducing design — no red badges pressuring action, no streaks, no performance pressure
7. No drift toward team management, reporting dashboards, or organizational oversight features
8. Users must always be able to export all their data and leave without friction
9. No silent data corruption or loss — always fail clearly and offer recovery
10. No external runtime dependency added without explicit justification — each one is a liability

---

## Deployment Context

> **KanTrack is deployed as a fully static site on Cloudflare Pages (free tier).** There is no backend, no server-side code, no Workers, and no database outside the user's own browser. All data is local to the user's device. Cloud sync and vault features are future opt-in additions and are explicitly deferred — see Phase 8 and Phase 9.

---

## Current State (Baseline Audit)

Before any phase begins, the honest state of the codebase:

| Concern            | Current State                                                 | Problem                                           |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------- |
| Primary data store | `localStorage` (kanbanNotes, notebookItems, tags, clocks)     | 5–10 MB limit; evictable; not structured          |
| IDB usage          | Only for images (1 store: `images`)                           | No business data in IDB                           |
| Task IDs           | `Date.now()` integer                                          | Collision-prone; not globally unique; breaks sync |
| Notebook IDs       | `Date.now() + Math.random()`                                  | Non-deterministic; not sync-safe                  |
| State management   | 27 mutable exports + 44 setters in `state.js`                 | Any module can corrupt any other module's state   |
| Event wiring       | 25+ `window.*` exports, inline `onclick` in HTML              | Global namespace pollution; untestable            |
| Undo history       | In-memory only, max 50 actions, lost on refresh               | Not durable                                       |
| Trash              | `kantrackTrash` localStorage, max 20 items, silently discards | Loses data without warning                        |
| Schema versioning  | None                                                          | Future data migrations are unsafe                 |
| Build system       | Vanilla ES modules, no bundler                                | No types, no tests, no tree-shaking               |
| Deployment         | None (served from filesystem or `npx serve`)                  | No CI, no deploy pipeline                         |
| Security           | `innerHTML` used broadly, no CSP, CDN without SRI             | XSS risk; supply-chain risk                       |
| Encryption         | None                                                          | Local data fully exposed                          |
| Cloud sync         | None                                                          | Single-device only                                |
| Accessibility      | No focus traps, no ARIA, limited keyboard support             | Fails keyboard-only users                         |

---

## Phase 0 — Stabilization

### Goal: Make Local Mode reliable enough that no user ever loses data

This is the prerequisite for everything else. No new features. No refactoring. The single purpose is making the current system trustworthy. Trust is KanTrack's core competitive advantage — it starts here.

---

### 0.1 — Migrate all business data from localStorage to IndexedDB

**Why it matters:**
`localStorage` is capped at ~5–10 MB, synchronous (blocks the main thread), and can be silently evicted by the browser under storage pressure. A user with a year of tasks and notes will hit this wall. When they do, saves fail silently — which violates the Engineering Philosophy principle of "transparent failure modes."

**What to change:**

- Expand `database.js` with new IDB stores:
  - `tasks` — replaces `localStorage['kanbanNotes']`
  - `notebook_items` — replaces `localStorage['notebookItems']`
  - `tags` — replaces `localStorage['kantrackTags']`
  - `clocks` — replaces `localStorage['kanbanClocks']`
  - `trash` — replaces `localStorage['kantrackTrash']`
  - `permanent_notes` — replaces `localStorage['permanentNotes']`
  - `meta` — new store: schemaVersion, deviceId, lastCompactionAt
  - `prefs` — small UI preferences (sidebar open, width)
- Keep `localStorage` only for: `notebookSidebarOpen`, `notebookSidebarWidth` (acceptable, tiny)
- Write a one-time migration: read from localStorage → write to IDB → verify → remove old keys
- Migration must be idempotent and run silently on first load after update

**Files affected:** `database.js`, `storage.js`, `tags.js`, `notebook.js`, `clocks.js`, `undo.js`

**Acceptance criteria:**

- All board data survives a `localStorage.clear()` call
- Cold load from IDB under 200ms for 500 tasks
- Migration completes silently; old localStorage keys removed after verified success

---

### 0.2 — Add schema versioning and migration system

**Why it matters:**
Without versioning, every future data structure change is dangerous. Users who have trusted KanTrack with months of work cannot be exposed to silent corruption on an update. This is a trust issue as much as a technical one.

**What to change:**

- `schemaVersion` integer in `meta` IDB store, starting at `1`
- Wrap `initIndexedDB()` in a migration runner:
  - Reads current version from `meta`
  - Runs all pending migrations sequentially
  - Updates version after each
- Each migration is a pure function: `migrate_v1_to_v2(db, tx)`
- If a migration fails: surface a calm, honest message to the user with an option to export their data before the migration is retried. Never silently wipe.

**Files affected:** `database.js`

**Acceptance criteria:**

- Version stored and readable after first run
- Running app twice does not re-run migrations
- A future migration can be added without touching existing ones

---

### 0.3 — Request durable storage

**Why it matters:**
Browsers can evict IndexedDB under storage pressure without warning. `navigator.storage.persist()` prevents this. The Engineering Philosophy requires "offline confidence" — users must trust their data is safe.

**What to change:**

- Call `navigator.storage.persist()` on first load
- If granted: store result in `meta`; no UI needed
- If denied: show a single, calm, non-alarming one-time message:
  > "Your browser may clear data under storage pressure. Enable durable storage in browser settings to protect your work."
  - This is information, not a warning. No red icons. No urgency.
- Show persistence status in settings panel (informational only)

**Design constraint:** The message tone must match the brand — calm, honest, respectful. Not alarming.

**Files affected:** `database.js` or new `platform.js`

**Acceptance criteria:**

- Data is eviction-protected on supporting browsers
- User is informed once, calmly, if persistence is unavailable

---

### 0.4 — Storage quota monitoring with UI

**Why it matters:**
Users with large boards will fill storage eventually. Discovering this at the moment a save fails is a terrible experience. They should see it coming — calmly, with time to act.

**What to change:**

- Use `navigator.storage.estimate()` for `{ usage, quota }`
- In settings: a clean storage usage bar showing `used / quota` with percentage breakdown by category (tasks, notebook, images, trash)
- Warning thresholds — all messaging must be **calm and informational**, not alarming:
  - 70%: Subtle indicator "Storage at 70% — manage in Settings" (no badge, no popup)
  - 90%: Soft banner (dismissable): "Your storage is nearly full. Consider exporting a backup or clearing old data."
  - 100%: Non-blocking modal with single action: "Export your data" or "Clear trash and old history"
- No red exclamation marks. No countdown timers. No "your data is at risk" language. Information only.

**Design constraint:** The Design Philosophy says "avoid urgency cues." Storage warnings are the most common place apps violate this. Every message must read like it was written by a calm, competent colleague — not an alarm system.

**Files affected:** `notifications.js`, settings panel, `storage.js`

**Acceptance criteria:**

- Storage bar accurate in settings
- 70/90/100% thresholds trigger correct, calmly-worded messages
- No false alarms from other sites sharing localStorage domain

---

### 0.5 — Fix task ID generation

**Why it matters:**
`Date.now()` produces integer IDs. Two tasks created in the same millisecond (bulk import, rapid creation) share an ID — silent data corruption. Sync requires globally unique IDs. This is foundational.

**What to change:**

- Replace `Date.now()` with `crypto.randomUUID()` (built into all modern browsers — zero external dependency)
- Apply to: task IDs, notebook item IDs, tag IDs, clock IDs
- Write migration: existing integer IDs mapped to new UUIDs, all cross-references updated
- All internal comparisons use string equality (no `parseInt`)

**Dependency note:** Use `crypto.randomUUID()` — a browser built-in. Do not add a `ulid` or `uuid` library. External runtime dependencies must justify themselves against the Engineering Philosophy's "minimal external dependencies" principle. A built-in achieves the same goal here.

**Files affected:** `tasks.js`, `notebook.js`, `tags.js`, `clocks.js`, `undo.js`, `storage.js`

**Acceptance criteria:**

- No two entities ever share an ID regardless of creation timing
- Existing data loads correctly after migration
- All IDs are strings throughout the codebase

---

### 0.6 — Fix Trash system

**Why it matters:**
Current trash is capped at 20 items and silently discards older ones. Users lose recoverable work without knowing it. This violates the principle "never lose data without an explicit destructive action by the user."

**What to change:**

- Move trash to IDB `trash` store with no hardcoded item limit (bounded by storage quota only)
- Store: `{ trashId, entityType, entityId, deletedAt, snapshot }` — full snapshot in IDB, not localStorage
- Add trash section in settings: total count, storage used, configurable auto-expiry (never / 7 / 30 / 90 days — default: 30)
- Auto-expiry message: "Items older than 30 days will be permanently deleted. Change this in Settings." — calm, factual

**Files affected:** `undo.js`, `database.js`

**Acceptance criteria:**

- Trash holds items bounded only by storage quota
- Auto-expiry is configurable and communicates clearly what will happen

---

### 0.7 — Cap and persist undo history

**Why it matters:**
Undo stack lives only in memory. Every browser refresh clears it. The Engineering Philosophy requires "reversibility" — actions should be undoable. This is not reversibility; it is reversibility until the user closes a tab.

**What to change:**

- Persist undo stack to IDB (simple serialized array initially, oplog-backed in Phase 3)
- Cap: 200 entries in IDB, 50 in memory
- Restore memory stack from IDB on load
- Clear entries older than 7 days or beyond 200 on next compaction

**Files affected:** `undo.js`, `database.js`

**Acceptance criteria:**

- Undo/redo works after browser refresh
- Memory stack bounded at 50; IDB bounded at 200 entries

---

### Phase 0 Checklist

- [x] Expand IDB schema with all business data stores
      _(database.js bumped to v2; stores added: tasks, notebook_items, tags, clocks, trash, undo_history, meta, prefs. 7 IDB helper functions exported: idbGet, idbGetAll, idbPut, idbDelete, idbClear, idbBulkPut, idbClearAndBulkPut)_
- [x] One-time migration: localStorage → IDB (idempotent)
      _(migrateLocalStorageToIDB() in database.js; checks migrationDone flag in meta store; skips per-store if already populated; safe to call multiple times)_
- [x] Schema version + migration runner
      _(DATA_SCHEMA_VERSION = 1 constant in database.js. runDataMigrations() reads schemaVersion from meta, runs pending migrate_vN_to_vN1() functions sequentially, writes new version. v0→v1 migration delegates to migrateLocalStorageToIDB(). kantrack.js now calls runDataMigrations() instead of migrateLocalStorageToIDB() directly. Adding future migrations requires only: bump DATA_SCHEMA_VERSION, add function, add case branch.)_
- [~] Request persistent storage; calm message if denied
  _(Partial: requestDurableStorage() implemented in storage-monitor.js — silently calls navigator.storage.persist() and writes result to meta IDB store. Missing: user-facing UI message if permission is denied. Deferred to Phase 7 settings panel.)_
- [~] Storage estimate UI in settings (calm thresholds)
  _(Partial: initStorageMonitor() implemented with 70%/85% calm thresholds, writes lastStorageCheck to meta. #storageMonitorInfo element added to controls-bottom in index.html (calm grey text, hidden by default). Full per-category breakdown bar deferred to Phase 7 when a proper settings panel is built.)_
- [x] Replace `Date.now()` IDs with `crypto.randomUUID()` (no new dependency)
      _(New entity IDs use crypto.randomUUID() in tasks.js, notebook.js, clocks.js. Note: existing integer IDs in localStorage/IDB are not migrated — parseInt fallback added to kantrack.js for backward compatibility. Full ID migration deferred.)_
- [x] Move trash to IDB, remove 20-item hard cap
      _(Trash now persists to IDB trash store. Hard cap of 20 removed; replaced with 200-item soft cap (newest kept). initUndo() loads trash from IDB on startup. Configurable auto-expiry not yet implemented.)_
- [x] Persist undo stack to IDB
      _(undo_history IDB store with autoIncrement seq. Every recordAction/undo/redo call triggers idbClearAndBulkPut. initUndo() restores last 200 entries on load. initUndo() clears in-memory stacks before repopulating to prevent accumulation on re-init.)_

**Automated test suite added** _(Vitest + fake-indexeddb, Node environment, no browser required)_

- [x] tests/database.test.js — 40 tests: IDB helpers, migration, schema version runner, Phase 3 meta/oplog helpers
- [x] tests/storage.test.js — 17 tests: IDB-first load, localStorage fallback, cleanup
- [x] tests/undo.test.js — 14 tests: trash cap, IDB persistence, oplog-backed undo history
- [x] tests/storage-monitor.test.js — 14 tests: quota thresholds, durable storage
- [x] tests/repository.test.js — 54 tests: all repository functions, IDB/localStorage priority, auto-save callback, Phase 3 oplog CRUD

---

## Phase 1 — Architecture Refactor

### Goal: A clean internal foundation that won't collapse under feature growth

The current architecture creates 25+ global functions and allows any module to mutate any state. Every new feature is a potential regression. This phase cleans the internals without changing any user-facing behavior. **Zero new user-visible features. Zero regressions.**

---

### 1.1 — Replace inline onclick with event delegation

**Why it matters:**
Every `onclick="addNote()"` requires `window.addNote`. The 25+ globals are untestable, unencapsulated, and fragile. The Engineering Philosophy requires code that is "readable, maintainable, and testable."

**What to change:**

- Add `data-action="..."` attributes to all interactive elements in `index.html`:

  ```html
  <!-- Before -->
  <button onclick="addNote()">Add</button>

  <!-- After -->
  <button data-action="task:add">Add</button>
  ```

- Create `router.js` with a single delegated listener and an action map
- Parameters via `data-action-param`:
  ```html
  <button data-action="priority:set" data-action-param="high">High</button>
  ```
- Remove all inline `onclick` from HTML
- Remove all `window.*` exports from `kantrack.js`

**Dependency constraint:** No external router library. A 10-line event delegation function covers this entirely. Adding a library for this would violate "minimal external dependencies."

**Files affected:** `index.html`, `kantrack.js`, new `router.js`

**Acceptance criteria:**

- Zero inline `onclick` in HTML
- Zero `window.*` exports in `kantrack.js`
- All existing functionality works identically

---

### 1.2 — Introduce a predictable Store

**Why it matters:**
Currently any module can read or write any of the 27 mutable state variables. A bug in `clocks.js` can corrupt `notesData`. As features grow, this becomes undebuggable. The Engineering Philosophy requires "transparent failure modes" — this requires knowable state.

**What to change:**

- Create `store.js` — minimal Redux-like pattern, no external library:

  ```javascript
  let state = initialState;
  const listeners = new Set();

  export const getState = () => Object.freeze({ ...state });
  export const dispatch = action => {
    state = reducer(state, action);
    listeners.forEach(fn => fn(state));
  };
  export const subscribe = fn => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  ```

- Define action types as constants: `TASK_CREATE`, `TASK_UPDATE`, `TASK_MOVE`, `TASK_DELETE`, etc.
- Reducer is a pure function: `(state, action) => newState`
- Migrate slice by slice: tasks first, then modal state, then tags, clocks, notebook
- `state.js` becomes a compatibility shim during migration, then removed
- Side effects (IDB writes, DOM events) triggered by middleware, never inside reducers

**Dependency constraint:** No Redux, Zustand, or any state library. The store is ~30 lines and requires no dependencies. External state libraries introduce framework lock-in, which the Engineering Philosophy explicitly warns against.

**Files affected:** new `store.js`, `state.js` (phased out), all modules (incremental)

**Acceptance criteria:**

- State only changes via `dispatch()`
- Reducers are pure functions with unit tests
- No module mutates another module's state directly

---

### 1.3 — Isolate persistence behind a Repository API

**Why it matters:**
Every module currently calls `saveNotesToLocalStorage()` directly. When the storage layer changes (Phase 0, and again when cloud sync arrives in Phase 9), every module needs to change. The Engineering Philosophy requires "independence from platforms" and the ability to swap implementations.

**What to change:**

- Create `repository.js` exposing a clean async API:
  ```javascript
  export async function getAllTasks() { ... }
  export async function saveTask(task) { ... }
  export async function deleteTask(taskId) { ... }
  ```
- No module outside `repository.js` touches IDB or localStorage directly
- Persistence logic (serialization, transactions, migrations) lives only in the repo
- Repository can be swapped with a mock in tests — no DOM required

**Files affected:** new `repository.js`, `storage.js` (absorbed), all data modules

**Acceptance criteria:**

- Zero direct `localStorage` or `indexedDB` calls outside `repository.js` and `database.js`
- Repository can be mocked in unit tests without a browser

---

### Phase 1 Checklist

- [x] `router.js` with action map (no external router library)
      _(router.js created in kantrack-modules/. registerAction() maps data-action strings to handlers. initRouter() attaches a single delegated document.addEventListener('click'). Zero external dependencies.)_
- [x] Replace all `onclick` with `data-action` attributes
      _(All 57+ inline onclick/oninput/onchange/ondblclick/onkeydown removed from index.html. Static HTML uses data-action + data-action-param. Non-click events (oninput, onchange, ondblclick, onkeydown) converted to addEventListener in kantrack.js DOMContentLoaded. Dynamic trash-list HTML uses data-action. Context-menu divs use data-action.)_
- [x] Remove all `window.*` exports
      _(All user-facing window.\* exports removed from kantrack.js. Inter-module window.renderTagSelector/renderDueDatePicker replaced with direct imports in modal.js. window.updateColumnCounts/window.updateTrashCount in tasks.js replaced with custom events (kantrack:updateColumnCounts, kantrack:updateTrashCount). Storage diagnostics (checkStorageQuota, getStorageBreakdown, logStorageDiagnostics) remain on window — these are dev-console tools, not product code.)_
- [x] `store.js` with dispatch/subscribe/getState (no external state library)
      _(store.js created: ~90 lines, no dependencies. dispatch/subscribe/getState exports. TASK_SET_ALL, TASK_ADD, TASK_UPDATE, TASK_MOVE, TASK_DELETE action types. Pure reducer. Initial task set dispatched via TASK_SET_ALL on app load in kantrack.js.)_
- [~] Migrate task state to store (first slice)
  _(Partial: Initial load dispatches TASK_SET_ALL to seed the store. Full migration (all modules reading from getState().tasks instead of state.notesData) deferred — requires updating tasks.js, modal.js, drag-drop.js, search.js etc. State.js compatibility shim continues to serve all modules until full migration.)_
- [x] `repository.js` as persistence abstraction
      _(Already complete from Phase 0 work. repository.js exposes getAllTasks/saveTasks/getAllNotebookItems/saveNotebookItems/getAllTags/saveTags/getAllClocks/saveClocks/getAllTrash/saveTrash/getAllUndoHistory/saveUndoHistory/loadPermanentNotes/savePermanentNotes/getUIPref/setUIPref. Full test suite in tests/repository.test.js.)_
- [x] Move all storage calls behind repository
      _(Complete. storage.js is a thin compatibility shim that delegates all persistence to repository.js. No module calls localStorage or IDB directly except repository.js and database.js.)_

**Phase 1 test suite** _(37 new tests — total now 148, all passing)_

- [x] tests/router.test.js — 10 tests: action registration, click delegation, param passing, closest() traversal, child element clicks, unknown actions, overwrite, multi-click
- [x] tests/store.test.js — 27 tests: getState, TASK_SET_ALL/ADD/UPDATE/MOVE/DELETE, unknown actions, subscribe/unsubscribe, multiple subscribers, state immutability

---

## Phase 2 — Build System & Developer Experience

### Goal: A professional development environment with tests and CI

No production app serving millions of users is maintained without a build pipeline, type safety, and automated tests. This phase adds the tooling layer.

**Technology selection principle (from Engineering Philosophy):** Choose technologies that are stable and likely to remain so for years, not fashionable ones. Prefer tools with broad community support and clear long-term trajectories.

---

### 2.1 — Vite as build tool

**Justification for longevity:** Vite is maintained by the Vue/Vite team, backed by major companies, and has become the standard for modern web tooling — stable, well-documented, framework-agnostic. It aligns with the "reliability over novelty" engineering principle.

**What to change:**

- `package.json` with scripts: `dev`, `build`, `preview`, `test`, `lint`
- Vite config: input `index.html`, output `dist/`, code splitting, asset hashing
- Development: `npm run dev` → hot module replacement
- Production: `npm run build` → minified, tree-shaken bundle
- CDN scripts (jsPDF, JSZip) bundled via Vite — eliminates CDN runtime dependency and SRI management
- GitHub Pages deploy via GitHub Actions on push to `main`

**Acceptance criteria:**

- `npm run dev` serves the app with hot reload
- `npm run build` produces a working production build under 200KB gzipped
- jsPDF and JSZip bundled — zero CDN runtime dependencies

---

### 2.2 — TypeScript (incremental)

**Justification for longevity:** TypeScript has been stable for 10+ years, is maintained by Microsoft, and is the de facto standard for typed JavaScript. It directly serves the Engineering Philosophy goal of "maintainability over speed."

**What to change:**

- Start with `jsconfig.json` + JSDoc annotations on existing files (zero rewrite cost)
- Add `tsconfig.json` with `allowJs: true, checkJs: true`
- Convert to `.ts` in priority order: `store.js`, `repository.js`, `router.js`, `tasks.js`
- Define shared types: `Task`, `Tag`, `NotebookItem`, `Clock`, `UndoAction`, `Op`
- Enable strict mode after all modules converted

**Acceptance criteria:**

- `npm run typecheck` passes with zero errors
- All exported functions have typed signatures
- IDE provides autocomplete and inline error detection

---

### 2.3 — ESLint + Prettier

**What to change:**

- `eslint.config.js`: no-unused-vars, no-undef, no-console (warn)
- `.prettierrc`: consistent formatting
- `npm run lint` and `npm run format`
- Pre-commit hook via `husky` + `lint-staged` (dev-only dependencies — acceptable)

---

### 2.4 — Testing: Vitest + Playwright

**What to change:**

- **Unit tests (Vitest):**
  - Reducers — pure functions, easiest to test
  - Repository functions — mock IDB
  - ID generation, UUID uniqueness
  - Export/import validation logic
  - Oplog integrity checks
- **E2E smoke tests (Playwright):**
  - Load app → create task → verify persists after refresh
  - Add tag → assign to task → filter → verify
  - Export board → reimport → verify round-trip integrity
- Target coverage: 80% on `store.js` and `repository.js`

**Acceptance criteria:**

- `npm test` runs all unit tests in under 30 seconds
- `npm run e2e` runs smoke tests headlessly
- CI blocks merge if any test fails

---

### 2.5 — GitHub Actions CI

**What to change:**

- `ci.yml`: on every PR — lint, typecheck, unit tests, build
- `deploy.yml`: on push to `main` — build and deploy `dist/` to GitHub Pages

**Acceptance criteria:**

- PRs show CI status
- Broken builds cannot be merged

---

### Phase 2 Checklist

- [x] `package.json` + Vite config (CDN scripts bundled, not loaded externally)
  - `vite.config.js` created; base `/KanTrack/` set via GITHUB_ACTIONS env var
  - jsPDF/JSZip imported from npm; CDN <script> tags removed from index.html
  - `npm run dev` → Vite dev server; `npm run build` → `dist/`; `npm run preview`
- [x] `jsconfig.json` + TypeScript conversion: store, router, repository
  - `jsconfig.json` for IDE support on .js files
  - `tsconfig.json` with strict mode, moduleResolution: bundler
  - `scripts/kantrack-modules/types.ts` — shared domain types (Task, Tag, NotebookItem, Clock, UndoEntry, etc.)
  - `store.js` → `store.ts` — full typed reducer, AppState, StoreAction interfaces
  - `router.js` → `router.ts` — typed ActionHandler, typed DOM event handling
  - `repository.js` → `repository.ts` — typed public API, @ts-ignore for untyped .js imports
  - Vitest resolve alias strips .js → resolves .ts (node env doesn't auto-remap)
- [x] ESLint + Prettier
  - `eslint.config.js` — flat config, browser globals via `globals` package, TypeScript files excluded (tsc handles them)
  - `.prettierrc` — singleQuote, semi, tabWidth 2, trailingComma es5, printWidth 100
  - Scripts: `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run format:check`
  - husky pre-commit hook → `lint-staged` (eslint --fix + prettier --write on staged files)
- [x] Vitest with reducer and repository tests — 321 unit tests, 13 files, all passing
- [x] Playwright E2E — 15 tests across 3 spec files, all passing
  - `config/playwright.config.js` — chromium only, webServer builds + previews app
  - `tests/e2e/smoke.spec.js` — create task persists after reload; priority persists after reload
  - `tests/e2e/flows.spec.js` — delete via modal; edit title+persist; add note+persist; undo; undo-after-reload (Phase 3 oplog); redo
  - `tests/e2e/import-export.spec.js` — export JSON structure; lightweight export; import merge; import dialog summary; invalid file error; encrypted export+import round-trip; wrong passphrase error
  - `npm run e2e` / `npm run e2e:ui`
- [x] GitHub Actions CI pipeline
  - `.github/workflows/ci.yml` — lint + typecheck + test:run + build + e2e on push/PR to main/master
  - Deployment is handled by Cloudflare Pages (connected to the repo, deploys automatically on push to main)
- [x] Project reorganisation
  - `config/` — Vite, Vitest, Playwright, ESLint configs moved out of root
  - `.github/` — CONTRIBUTING.md and SECURITY.md moved to standard GitHub locations
  - `docs/PRIVACY.md` — moved from root
  - `.prettierrc` merged into `package.json` "prettier" key
  - `tests/e2e/` — E2E specs consolidated under `tests/`
  - `.gitignore` added (dist/, node_modules/, test-results/, playwright-report/ gitignored)
  - Per-folder README.md files added to every meaningful directory

---

## Phase 3 — Operation Log (Oplog)

### Goal: Every mutation is recorded, reversible, and eventually syncable

The oplog is the foundation of durable undo/redo and the backbone of future multi-device sync. The Engineering Philosophy requires "reversibility" — this is what makes it real. Build it now; sync plugs in later without structural changes.

---

### 3.1 — Define and implement oplog schema

**What to change:**

- Add `oplog` store to IDB:
  ```
  opId:       string (UUID)
  deviceId:   string (UUID, generated once per device)
  lamport:    number (monotonic counter, persisted in meta)
  timestamp:  number (Date.now())
  entityType: 'task' | 'tag' | 'notebook_item' | 'clock' | 'prefs'
  entityId:   string (UUID)
  actionType: 'create' | 'update' | 'move' | 'delete' | 'restore'
  patch:      object (field-level: { field: { prev, next } })
  prevHash:   string (SHA-256 of previous op)
  hash:       string (SHA-256 of this op)
  ```
- `deviceId`: generated once with `crypto.randomUUID()`, stored in `meta`
- Lamport clock: read from `meta`, increment on every write, persist back
- Every mutation in `store.js` writes an op as a side effect (middleware, not reducer)

**Files affected:** `database.js`, `store.js`, `repository.js`

**Acceptance criteria:**

- Every CRUD operation produces a correct oplog entry
- Lamport ordering is monotonically increasing per device
- Hash chain verifiable

---

### 3.2 — Rebuild undo/redo on oplog

**What to change:**

- Replace `undoStack`/`redoStack` with an oplog cursor
- Undo: apply inverse patch from latest op
- Redo: re-apply the op
- Undo history survives refresh (in IDB)
- 200-entry limit in IDB

**Files affected:** `undo.js`

**Acceptance criteria:**

- Undo works after browser refresh
- Ctrl+Z / Ctrl+Shift+Z work for all action types

---

### 3.3 — Oplog compaction

**What to change:**

- Compaction runs via `requestIdleCallback` (with `setTimeout` fallback — no new dependency)
- Rules: keep all ops from last 7 days; merge sequential updates to the same field on the same entity; drop ops for permanently deleted entities
- `lastCompactedAt` stored in `meta`
- Compaction never removes ops newer than `lastSyncedLamport` (used in Phase 10)

**Files affected:** new `compaction.js`

**Acceptance criteria:**

- Oplog size stays bounded for multi-year usage
- Compaction runs without UI jank
- State rebuilt from snapshot + remaining oplog matches live state in tests

---

### Phase 3 Checklist

- [x] `oplog` IDB store
- [x] `deviceId` generation and persistence
- [x] Lamport clock
- [x] Every mutation writes to oplog (via `recordAction()` — all undoable mutations already route through it; store middleware deferred to Phase 10 sync)
- [x] Undo/redo rebuilt on oplog cursor (`undone` flag pattern; stacks rebuilt from oplog on `initUndo()`)
- [x] Compaction on idle (`requestIdleCallback`, `setTimeout` fallback, no new dep)
- [x] Unit test coverage: 321 unit tests passing (28 new unit tests for Phase 3: database.test.js +15, repository.test.js +13)
- [x] E2E test coverage: undo-after-reload (oplog persistence) + redo in tests/e2e/flows.spec.js

---

## Phase 4 — Export / Import v2

### Goal: Genuine data ownership — users can move their work anywhere, forever

The current HTML export is not data ownership — it's a read-only snapshot. "An app, not a trap" requires a structured, re-importable format. This is both a product principle and a trust signal.

---

### 4.1 — Versioned JSON export (.kantrack.json)

**What to change:**

- Export format:
  ```json
  {
    "formatVersion": 1,
    "appVersion": "x.y.z",
    "exportedAt": "ISO timestamp",
    "boards": [...],
    "tasks": [...],
    "tags": [...],
    "notebook_items": [...],
    "clocks": [...],
    "settings": {...},
    "integrity": {
      "tasks_count": 42,
      "tasks_hash": "sha256..."
    }
  }
  ```
- Two modes: **Full export** (includes images as base64) and **Lightweight export** (data only, smaller file)
- Replace current "Export Board (HTML)" with this — keep HTML as a separate "Share as HTML (read-only)" option
- Export UI language: "Download your workspace" — ownership framing, not technical framing

**Files affected:** `export.js`

---

### 4.2 — Import with validation and preview

**What to change:**

- Before applying any import:
  1. Validate `formatVersion` is known and supported
  2. Validate referential integrity: task columns exist, all tagId references exist in tags, etc.
  3. Check `integrity.tasks_count` matches actual count
  4. Show preview: "This contains X tasks, Y tags, Z notebook pages" — calm, informational
  5. Ask user: **Merge** (add to existing) or **Replace** (overwrite)
  6. On Replace: auto-export current data first, silently, as a safety net
- On validation failure: specific, clear message — "This file references a column that no longer exists" — not a generic error

**Design constraint:** Import preview must feel calm and in control, not alarming. Language: "Here's what this file contains" — not "WARNING: This will overwrite your data!"

**Files affected:** `export.js`, new `import-validator.js`

---

### 4.3 — Optional encrypted export (.kantrack.enc)

**What to change:**

- User sets a passphrase before exporting
- PBKDF2 (100,000 iterations) + AES-GCM via WebCrypto — no external crypto library
- Same JSON structure inside, encrypted before write
- Import detects encryption, prompts for passphrase calmly
- Honest messaging: "If you lose this passphrase, the file cannot be opened. Keep it safe."

**Files affected:** `export.js`, new `crypto.js`

---

### Phase 4 Checklist

- [x] `.kantrack.json` versioned export (formatVersion:1, appVersion, exportedAt, integrity hash)
- [x] Full (with images) and lightweight (data only) export modes
- [x] Import validation: format version + referential integrity (`import-validator.js`)
- [x] Import preview: calm count summary + merge/replace choice (`<dialog>` element, no static HTML)
- [x] Auto-backup before Replace import (silent lightweight export)
- [x] Encrypted export with passphrase (WebCrypto only — PBKDF2 + AES-GCM, `crypto.js`)
- [x] Unit test coverage: 321 unit tests passing (30 new: import-validator.test.js ×18, crypto.test.js ×12)
- [x] E2E test coverage: 9 new E2E tests in tests/e2e/import-export.spec.js covering export, import merge, invalid file error, encrypted round-trip, wrong passphrase error
- [x] Bug fixes: imageData race condition in \_applyImport (stripped before saveTasks); 300ms backup-download delay before location.reload()

---

## Phase 5 — Performance & Scalability

### Goal: The board remains fast and responsive at 1,000+ tasks

From the Engineering Philosophy: "Performance as calmness — the interface should feel instant, predictable, and stable." Performance is not a metric here; it is a feeling. Users should never notice the app working.

---

### 5.1 — Virtual list rendering for columns

**Why it matters:**
With 500 tasks in "Done", the browser renders 500 DOM nodes on every filter change. The result is visible jank — a calm interface cannot jank.

**What to change:**

- Implement row virtualization per column using `IntersectionObserver`:
  - Render only visible cards plus a buffer of 5 above and below viewport
  - Spacer divs maintain scroll position
  - Apply to all 4 kanban columns and the trash list
- No virtual list library — `IntersectionObserver` is a browser built-in, covers this use case, zero new dependency

**Files affected:** `tasks.js`, new `virtual-list.js`

**Acceptance criteria:**

- 1,000 tasks: column scrolls at 60 fps
- DOM node count under 100 per column regardless of total count

---

### 5.2 — Patch-based card updates

**What to change:**

- For each field type, update only the relevant sub-element:
  - Priority → `.priority-badge` only
  - Tags → `.tags-row` only
  - Due date → `.due-date-label` only
  - Timer → `.timer-badge` only
- Full re-render only when card is created or title changes

**Files affected:** `tasks.js`

---

### 5.3 — Move heavy operations to Web Workers

**What to change:**

- Export (JSON serialization of large boards) → Worker
- Import (parsing + validation) → Worker
- Oplog compaction → Worker
- Future: encryption/decryption → Worker
- Use raw `postMessage` / `onmessage` — no `comlink` or wrapper library (Worker communication is 10 lines; adding a library for it contradicts the minimal dependencies principle)

**Files affected:** `export.js`, `compaction.js`, new `workers/` directory

**Acceptance criteria:**

- Exporting a 1,000-task board does not freeze the UI
- Main thread frame rate stays above 55 fps during export

---

### 5.4 — IDB read batching and caching

**What to change:**

- On load: read all tasks in a single `getAll()` — never per-task reads at startup
- Cache in store — never re-read from IDB unless data changes externally
- For images: lazy-load only when task modal or notebook page opens
- Debounce IDB writes: batch changes over 300ms in a single transaction

**Files affected:** `repository.js`, `database.js`

---

### 5.5 — Lazy-load notebook content

**What to change:**

- On startup: load only notebook metadata (id, name, type, parentId, order) — not content
- Load full page content on demand when user opens a page
- Preload last-opened page on idle

**Files affected:** `notebook.js`, `repository.js`

---

### Phase 5 Checklist

- [x] Virtual list for columns (IntersectionObserver, no new lib)
- [x] Patch-based card field updates
- [x] Export/import in Web Worker (raw postMessage, no comlink)
- [x] Single `getAll()` on load
- [x] 300ms debounced batch IDB writes
- [x] Lazy-load notebook page content

---

## Phase 6 — Security Hardening

### Goal: An app that holds private data must protect it actively

From the Engineering Philosophy: "Privacy by design — embedded into architecture, not added later." From the Manifesto: "Privacy is a default, not an option." Security failures would destroy the core competitive advantage permanently.

---

### 6.1 — Audit and sanitize all innerHTML usage

**Why it matters:**
`innerHTML` with user-controlled content is the primary XSS vector. KanTrack uses contenteditable editors and re-renders stored HTML — high risk.

**What to change:**

- Audit every `innerHTML =` and `insertAdjacentHTML` call
- For user-generated content: implement a custom allowlist-based sanitizer:
  - Allowed tags: `<b>`, `<i>`, `<u>`, `<em>`, `<strong>`, `<br>`, `<p>`, `<ul>`, `<ol>`, `<li>`, `<img>` (src: blob: or data: only), `<a>` (href: http/https only)
  - Blocked: `<script>`, `<iframe>`, `<object>`, `onerror=`, `onload=`, `onclick=`, `javascript:`, `data:text/html`

**Dependency decision:** DOMPurify is a well-audited, widely-used sanitizer. However, it is a runtime dependency (~45KB). Given the Engineering Philosophy, prefer a lightweight custom implementation unless the complexity of handling all edge cases becomes a liability. Revisit if security audit (Phase 11) reveals gaps in the custom approach.

**Files affected:** `tasks.js`, `notebook.js`, `modal.js`, `export.js`

---

### 6.2 — Content Security Policy

**What to change:**

- Add to `index.html` `<head>`:
  ```html
  <meta
    http-equiv="Content-Security-Policy"
    content="
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:;
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
  "
  />
  ```
- Removing inline `onclick` (Phase 1) is prerequisite — CSP `script-src 'self'` blocks inline handlers
- CDN scripts eliminated via Phase 2 bundling — `script-src` can be strict

**Files affected:** `index.html`

---

### 6.3 — Subresource Integrity (if CDN scripts remain)

**What to change:**

- If for any reason jsPDF or JSZip remain as CDN scripts (not bundled):
  ```html
  <script src="..." integrity="sha384-[hash]" crossorigin="anonymous"></script>
  ```
- Preferred: bundle via Vite (Phase 2) to eliminate CDN entirely

---

### 6.4 — Security documentation

**What to change:**

- Update `SECURITY.md`:
  - Honest threat model: what is and isn't protected
  - What data is stored and where
  - Known limitations (local device compromise cannot be prevented by KanTrack)
  - Vulnerability disclosure process
- In-app security page in settings (accessible from the app itself — transparency, not just on GitHub)

**Design constraint:** Security documentation must be written in plain, honest language. No marketing language. "We cannot protect your data if your device is compromised" is the right tone.

---

### Phase 6 Checklist

- [x] Audit all `innerHTML` insertions
- [x] Custom allowlist-based sanitizer for user content (`scripts/kantrack-modules/sanitize.js`; applied to note history viewer, note editor, notebook page editor)
- [x] CSP meta tag (strict, no inline scripts — `script-src 'self'`, `object-src 'none'`)
- [x] Bundle jsPDF/JSZip (already npm dependencies; no CDN script tags in `index.html`)
- [x] Update SECURITY.md with honest threat model (merged into `.github/SECURITY.md`)
- [ ] In-app security transparency page

---

## Phase 7 — Design Integrity, Accessibility & UX Philosophy

### Goal: Every part of the app feels like a calm, private workspace — and works for everyone

This phase is not just accessibility compliance. It is the full implementation of the Design Philosophy: "calm clarity", "private space feeling", "no judgment design." These principles must be enforced through code, not just stated in documents.

---

### 7.1 — Enforce the Design Philosophy in every UI component

These are not aesthetic preferences — they are product requirements:

**No judgment design (must be enforced):**

- No productivity scores, completion percentages, or performance grades shown anywhere
- No streak counters or "you've completed X tasks today" congratulations
- No gamification elements of any kind
- No urgency-inducing language ("overdue!" styled as alarm vs. calm informational label)
- Due dates shown as calm information: "Due Mar 5" — never as a flashing red alert

**Private space feeling (must be enforced):**

- Default layout is clean and spacious — no cramming features into the header
- No promotional banners or upgrade nudges inside the board area
- Settings and account controls live in a settings panel, never interrupting the workspace
- Empty board state: a simple, calm invitation — "Add your first task" — not a tutorial or a product tour

**Progressive disclosure (must be enforced):**

- Advanced features (tags, due dates, sub-tasks, timer) revealed inside the task modal — not cluttering the card view
- Settings are layered: basic → advanced, not a wall of options on first visit

**No forced flows (must be enforced):**

- No "take the tour" modals on first load
- No onboarding wizard that must be completed before using the app
- No email capture gates

**Files affected:** `index.html`, all CSS, `tasks.js`, `modal.js`

---

### 7.2 — Modal accessibility

**What to change:**

- All modals:
  - `role="dialog"` + `aria-modal="true"` + `aria-labelledby="[title-id]"`
  - Focus trap: Tab/Shift+Tab cycle only within modal while open
  - ESC closes every modal consistently
  - On open: focus first interactive element
  - On close: restore focus to triggering element
- All icon-only buttons get `aria-label`:
  - Undo, Redo, Trash, Notebook toggle, Clock buttons, all modal close buttons

**Files affected:** `index.html`, `modal.js`, `notebook.js`, `clocks.js`

---

### 7.3 — Board keyboard navigation

**What to change:**

- Keyboard shortcuts:
  - `N` — focus new task input (when not in an input field)
  - `/` — focus search
  - `?` — open shortcuts help dialog
  - `Ctrl+Z` — undo (already partially works)
  - `Ctrl+Shift+Z` / `Ctrl+Y` — redo
  - `Ctrl+B` — toggle notebook sidebar
  - `Escape` — close any open modal or panel
- Arrow keys to navigate between task cards within a column
- `Enter` on focused card — open task modal

**Files affected:** `kantrack.js`, `modal.js`

---

### 7.4 — Keyboard shortcuts help dialog

**What to change:**

- `?` key opens an overlay listing all shortcuts
- Grouped by: Board, Task Modal, Notebook, Search, General
- Dismissable with `Escape` or clicking outside

---

### 7.5 — Accessibility targets

**Acceptance criteria:**

- Lighthouse Accessibility score: 90+
- WCAG 2.1 AA for all core workflows
- All core flows usable with keyboard only

---

### Phase 7 Checklist

- [x] No productivity scores, grades, or streaks anywhere in the UI
- [x] No gamification elements
- [x] Due dates as calm informational labels (removed `pulse-overdue` animation from `styles/features.css`)
- [x] No upgrade nudges inside the board area
- [x] Empty state: calm invitation, no tutorial pressure (columns show empty without any forced flow)
- [x] Focus trap on all modals (`createFocusTrap` in `utils.js`; applied to taskModal, pageModal, addClockModal, shortcutsModal)
- [x] ESC closes all modals consistently (global keydown handler in `kantrack.js`)
- [x] `aria-label` on all icon-only buttons (`index.html`)
- [x] `role="dialog"` + `aria-modal` on all modals (`index.html`)
- [x] Keyboard shortcuts: N, /, ?, Escape, Ctrl+Z/Y, Ctrl+B (global handler + arrow key delegation in `kantrack.js`)
- [x] Shortcuts help dialog (`#shortcutsModal` in `index.html`; `openShortcutsDialog`/`closeShortcutsDialog` in `kantrack.js`)

---

## Phase 8 — Account Infrastructure

### Goal: Backend foundation for paid services, with zero contact with user content

> ⚠️ **DEFERRED** — KanTrack currently runs as a fully static site on Cloudflare Pages (free tier) with no backend. This phase is intentionally not in scope. The local architecture is kept sync-ready (UUID IDs, oplog structure, IDB-first storage) so that account infrastructure can be added later without reworking the data layer. No backend work will begin until a deliberate, documented decision is made to add it.

Accounts are an enabler for the Vault (Phase 9) — nothing more. The Product Doctrine and anti-drift rule are most at risk during this phase. Every decision here must be checked against the founding lens.

---

### 8.1 — Backend service (minimal, content-free)

**What to change:**

- Minimal backend service (Node/Bun + PostgreSQL or equivalent):
  - `users`: id (UUID), email, created_at, subscription_status, subscription_expires_at
  - `devices`: device_id (UUID from client), user_id, registered_at, last_seen_at
  - **No task, note, tag, clock, or any content table — ever**
- Auth: magic link (email) or passkey (WebAuthn) — no passwords (simpler, more secure)
- JWT: 15-minute access tokens + 7-day refresh tokens
- Rate limiting: 60 req/min per IP, stricter on auth endpoints

**Anti-drift constraint:** The backend must have a formal rule in its codebase: no endpoint may accept or return task content. This is enforced architecturally (no content tables), not just by policy.

**Acceptance criteria:**

- Local Mode works 100% without signing in
- Server database contains zero task, note, or tag content
- Account creation is optional and never required for any productivity feature

---

### 8.2 — Account UI

**What to change:**

- Settings panel → Account section (not the main UI — the board is the primary surface):
  - "Sign in / Create account" if signed out
  - Email, plan, device list if signed in
  - "Sign out" and "Delete account" (with confirmation)
- No persistent account prompts inside the board workspace
- Account badge in header only when signed in and as a small, unobtrusive icon

**Design constraint:** Account UI must never compete with the board for attention. A user who never signs in should never be made to feel they're missing out or using an inferior version. Local Mode is complete and first-class.

---

### 8.3 — Subscription system

**What to change:**

- Stripe integration: webhooks update `subscription_status` in DB
- Two tiers only:
  - **Free** — Local Mode (full, permanent, no credit card)
  - **Pro** — Encrypted Cloud Vault + multi-device sync
- Account page: tier, renewal date, manage billing link
- No dark patterns: no "your trial ends in X days" inside the app, no feature teasing, no artificial limitations on Local Mode

**Anti-drift constraint:** Free tier must never be degraded to push upgrades. If features are added to Local Mode, they stay in Local Mode.

---

### Phase 8 Checklist

- [ ] Backend: users + devices tables (zero content tables)
- [ ] Magic link auth or WebAuthn
- [ ] JWT + refresh token flow
- [ ] Rate limiting on all endpoints
- [ ] Account UI in settings panel (not in board workspace)
- [ ] No persistent account prompts inside the app
- [ ] Stripe subscription: Free (permanent, full) and Pro tiers
- [ ] No dark patterns in upgrade flow

---

## Phase 9 — Encrypted Cloud Vault (E2EE)

### Goal: Zero-knowledge backup and storage expansion — the server sees only ciphertext

> ⚠️ **DEFERRED** — Not in scope for the current Cloudflare Pages static deployment. No cloud work will begin until Phase 8 (Account Infrastructure) is deliberately chosen and implemented. The local architecture is intentionally kept E2EE-ready (client-side only, oplog-based, IDB-first), but no encryption, sync, or server code will be written now. When this phase is started, the full implementation can proceed without reworking the data layer.

From the Master Strategy: "Cloud acts as removable storage, not dependency." The Vault does not make KanTrack a cloud app. It makes a cloud option available to users who want it, while changing nothing about Local Mode.

---

### 9.1 — Crypto module

**What to change:**

- Create `crypto.js` using WebCrypto only — no external crypto library:

  ```javascript
  // Key derivation
  deriveKEK(passphrase, salt); // PBKDF2, 100k iterations, AES-GCM 256-bit

  // Data encryption key
  generateDEK(); // crypto.getRandomValues
  wrapDEK(dek, kek); // AES-GCM wrap
  unwrapDEK(wrappedDek, kek); // AES-GCM unwrap

  // Encryption/decryption
  encrypt(plaintext, dek); // AES-GCM, random IV
  decrypt(ciphertext, iv, dek);

  // Integrity
  sha256(data); // SubtleCrypto.digest
  ```

- Salt: unique per user, stored on server (not secret, but unique)
- DEK never leaves device unencrypted
- Wrapped DEK stored on server alongside ciphertext

**Dependency constraint:** WebCrypto is a browser built-in. No external crypto library is needed or acceptable here. Crypto code with external dependencies cannot be audited with confidence.

---

### 9.2 — Vault server endpoints

**What to change:**

- Server accepts only opaque encrypted blobs:
  ```
  POST /vault/objects      — upload encrypted blob
  GET  /vault/objects      — list (objectId, type, updatedAt only)
  GET  /vault/objects/:id  — download encrypted blob
  DELETE /vault/objects/:id
  GET  /vault/dek          — download wrapped DEK
  PUT  /vault/dek          — upload wrapped DEK
  ```
- Server never parses blob content
- Metadata (objectId, type, updatedAt) is the only non-encrypted data stored

---

### 9.3 — Vault user flow

**First-time setup (language is calm and clear):**

1. User enables Vault in settings
2. "Set a passphrase to protect your backup. We cannot read your data — not even to recover it."
3. Passphrase + confirmation → DEK generated → wrapped → uploaded
4. Recovery key shown: "Save this somewhere safe. It's the only way to recover your data if you forget your passphrase."
5. First backup triggered automatically and silently

**Ongoing:**

- Auto-backup every 30 minutes (background, silent)
- "Back up now" button in settings
- Status: "Last backed up 12 minutes ago" — informational, not urgent
- "Restore from Vault" with passphrase prompt and preview: "Backup from March 5, 2026 — 142 tasks, 8 notebook pages"

**Design constraint:** Vault UI must be calm. No "your data is unprotected" framing. No alarming icons next to the backup status. This is a reassurance feature, not an anxiety-inducing one.

---

### 9.4 — Passphrase change

- Old passphrase → decrypt DEK → re-encrypt with new KEK → upload
- Server never receives either passphrase

---

### Phase 9 Checklist

- [ ] `crypto.js` with WebCrypto only (no external library)
- [ ] DEK/KEK key hierarchy
- [ ] Vault server endpoints (opaque blobs only)
- [ ] First-time vault setup with recovery key
- [ ] Auto-backup every 30 min (background, silent)
- [ ] Restore from vault with passphrase prompt and backup preview
- [ ] Passphrase change flow
- [ ] Vault UI: calm language, no urgency framing

---

## Phase 10 — Multi-Device Sync

### Goal: Seamless, invisible convergence across all a user's devices

The Engineering Philosophy says "performance as calmness." Sync should feel invisible — the board is just always current, without the user thinking about it. Conflicts are resolved silently where possible; surfaced only when a decision is genuinely needed.

---

### 10.1 — Encrypted opbatch push/pull

**What to change:**

- Each device tracks `lastSyncedLamport` in `meta`
- **Push:** collect ops since `lastSyncedLamport` → serialize → encrypt → upload as `opbatch`
- **Pull:** fetch new opbatches → decrypt → apply via reducers → update watermark
- Sync triggers: on app open, every 5 minutes, on tab visibility gain, on reconnect after offline
- Offline: operations queue locally, sync transparently when back online

**Files affected:** new `sync.js`, `repository.js`, `store.js`

---

### 10.2 — Conflict resolution

**What to change:**

- **Field-level LWW (Last-Write-Wins):** highest `(lamport, deviceId)` wins per field
- **Task order:** fractional indexing via `orderKey` string — no integer re-indexing, no position conflicts
- **Delete wins:** a delete op on an entity always supersedes an update op (deletedAt takes precedence)
- **Surface conflicts only when necessary:** most changes merge silently

**Conflict notification language (calm, non-alarming):**

- "Some changes from another device were merged." — never "CONFLICT DETECTED"
- If a task was deleted on one device and edited on another: "A task you edited on this device was deleted on another. It has been restored here. You can delete it if you no longer need it."

**Design constraint:** Conflict messages must read like helpful information, not system errors. The Design Philosophy says "respect the user's pace" — a conflict notification should never be alarming or demand immediate action.

**Files affected:** new `conflict-resolver.js`, `tasks.js`

---

### 10.3 — Device management UI

**What to change:**

- Settings → Devices: list with device name, last-seen date, "This device" label
- "Remove device" (revokes sync for that device)
- Simple, clean — not a security dashboard

---

### 10.4 — Sync status indicator

**What to change:**

- Small, unobtrusive indicator in header: "Synced", "Syncing...", "Sync unavailable — will retry"
- Tap to force sync
- Offline: operations queued locally, indicator shows "Offline — changes saved locally"

**Design constraint:** Sync status must be informational, not alarming. "Sync unavailable" is better than "Sync failed — your data may be out of date." The second creates anxiety; the first states fact.

---

### Phase 10 Checklist

- [ ] `sync.js` with push/pull opbatch logic
- [ ] `lastSyncedLamport` tracking per device
- [ ] LWW conflict resolution
- [ ] Fractional indexing (`orderKey`) for task positions
- [ ] Background sync: on open + every 5 min + on reconnect
- [ ] Calm conflict messaging language
- [ ] Device management UI in settings
- [ ] Sync status indicator (calm, unobtrusive)

---

## Phase 11 — Scale, Polish & Production Readiness

### Goal: Ready for millions of users, press coverage, and enterprise scrutiny

---

### 11.1 — Privacy-respecting analytics (no behavioral data)

**What to change:**

- Self-hosted analytics (Plausible or Umami) — no Google Analytics, ever
- **Allowed:** page views, feature usage counts (anonymous aggregate), error rates, performance metrics
- **Never allowed:**
  - Task titles, note content, tag names, or any user-generated content
  - Behavioral patterns: how often a user creates tasks, when they work, how many tasks they complete
  - Identifiers that can be linked to individuals without consent
- Opt-out toggle in settings (default: opted in if they accepted during onboarding, opt-out available always)
- Privacy policy states exactly what is and is not collected — in plain language, not legal jargon

**Anti-drift constraint:** Behavioral analytics is surveillance. KanTrack must never know "how productive" a user is, when they work, or what they work on. This is a hard line, not a policy preference.

---

### 11.2 — Onboarding (respecting the user's pace)

From the Roadmap Philosophy: "Protect the aha moment" and "no forced flows."

**What to change:**

- First-time load: the board is immediately usable — no welcome screen, no required tour, no email gate
- Single optional, dismissable banner (shown once): "Welcome to KanTrack. Add a task to get started."
- No "take the tour" modal
- No step-by-step wizard that must be completed
- No productivity tips popup
- The aha moment is the board itself — the first task they add is the onboarding

**Design constraint:** A user who opens KanTrack and immediately adds a task without reading anything has had the correct onboarding experience. Any onboarding that delays or interrupts this is wrong.

---

### 11.3 — Performance benchmarks (targets, not metrics to display)

**Targets (never shown to users — these are engineering thresholds):**

- Cold load (empty cache): under 1.5s on 3G (Lighthouse)
- Cold load with 500 tasks: under 2.5s
- 1,000-task board: 60 fps scroll
- Export of 1,000-task board: under 3s in Worker
- IDB write latency: under 50ms (debounced batch)

---

### 11.4 — Security audit readiness

**What to change:**

- Document all server endpoints, auth flows, crypto assumptions
- Dependency audit: `npm audit` clean; Dependabot automated PRs
- Bug bounty program: GitHub Security Advisories or HackerOne
- Signed releases: GPG-signed GitHub Releases

---

### 11.5 — Documentation

**What to change:**

- `README.md`: screenshots, feature list, keyboard shortcuts, storage model, export format
- `CONTRIBUTING.md`: development setup, PR process, code style
- `CHANGELOG.md`: semantic versioning, release notes
- In-app help: `?` key opens searchable keyboard shortcuts reference (not a full manual — respects the "no tutorial pressure" principle)

**Design constraint:** Documentation should feel like a knowledgeable colleague answering a question — not a product manual trying to sell features.

---

### 11.6 — Release workflow

**What to change:**

- Semantic versioning: MAJOR.MINOR.PATCH
- GitHub Releases with human-written release notes (not auto-generated changelogs)
- `npm run release` script: bumps version, creates tag, triggers deploy

---

### Phase 11 Checklist

- [ ] Self-hosted analytics (no behavioral data, no content)
- [ ] Analytics opt-out in settings
- [ ] Onboarding: single dismissable banner, no forced tour, no email gate
- [ ] Performance benchmarks: measure and hit all targets
- [ ] Dependency audit clean
- [ ] Bug bounty program
- [ ] README, CONTRIBUTING, CHANGELOG
- [ ] In-app keyboard shortcuts reference (not a product tour)
- [ ] Semantic versioning + GitHub Releases

---

## Phase 12 — Long-Term Vision

### Goal: KanTrack becomes "The Personal Operating System for Work"

These capabilities are validated by the Vision Deck as the long-term destination. They are **not** scope for current phases — they inform architectural decisions made earlier so this expansion doesn't require rewrites.

---

### 12.1 — Local workflow analytics (private, on-device only)

**What it is:** Optional, local-only statistics about your own work patterns — "I tend to complete more tasks on Tuesdays" — visible only to the user, never leaving the device.

**What it is not:** Reporting for managers, performance tracking, or any data sent to a server.

**Why it matters for earlier phases:** Oplog (Phase 3) is the data foundation for this. Every mutation recorded with timestamps enables local analytics without any new infrastructure.

**Design constraint:** These analytics answer "What do I notice about my own work?" — not "How productive am I?" No scoring, no benchmarks, no external comparisons.

---

### 12.2 — Local AI assistance (private, on-device)

**What it is:** AI features that run entirely on-device — task suggestions, due date recommendations, notebook summaries — without any content leaving the browser.

**Technologies:** WebLLM (runs models in browser via WebGPU), or server-side with E2EE (model sees only ciphertext-decrypted content, never server-visible).

**Why it matters for earlier phases:** E2EE infrastructure (Phase 9) is the prerequisite. Any AI assistance must operate within the same zero-knowledge model.

**Design constraint:** AI assistance is a suggestion, never a directive. It reduces cognitive load; it does not replace user decision-making. Fully optional, opt-in, and dismissable.

---

### 12.3 — Integration layer (read-only connectors)

**What it is:** Pull in data from Jira, GitHub, Linear, etc. as read-only context visible in KanTrack — not a replacement for those tools, a personal overlay above them.

**Why it matters for earlier phases:** The domain model (Phase 1) must be flexible enough to represent tasks from external sources alongside local tasks. IDs and entity schema must support "source: 'jira'" metadata.

**Design constraint:** KanTrack does not sync back to external tools. It is a personal view, not a two-way integration platform. This prevents scope creep toward project management tooling.

---

### 12.4 — Advanced personal knowledge base

**What it is:** Evolution of the current Notebook into a richer personal knowledge system — backlinks, templates, search across all content, structured notes.

**Why it matters for earlier phases:** Notebook architecture (Phase 0 IDB migration, Phase 3 oplog) must handle richer data types. The content model should not be locked into the current simple HTML structure.

---

### Phase 12 Pre-requisites to protect in earlier phases

- [ ] Phase 3 oplog: include full timestamp and entity metadata (enables local analytics)
- [ ] Phase 9 E2EE: zero-knowledge model (enables private AI assistance)
- [ ] Phase 1 domain model: flexible entity schema with optional `source` field (enables integrations)
- [ ] Phase 0 IDB: content stored in a structure that can be queried and extended (enables knowledge base)

---

## Anti-Drift Safeguard

### The product's long-term immune system

The greatest risk to KanTrack is not technical failure — it is gradual drift toward what it explicitly chose not to be. Every feature request, business opportunity, or competitive pressure will contain small invitations to drift. This appendix is the immune system.

---

### The Decision Checklist (from `philosophy/KanTrack_Decision_Checklist.md`)

Apply to every proposed feature or change:

**Core Alignment**

- Does this increase personal workflow clarity?
- Does this strengthen user autonomy?
- Does this reduce cognitive load?

**Individual-First Test**

- Is this primarily for the person doing the work?
- Would a self-directed professional find this valuable without being told?

**Privacy & Ownership**

- Does this preserve data ownership?
- Does it avoid surveillance, tracking, or performance measurement?
- Can users export their data freely after this change?

**Simplicity & Focus**

- Does this keep the product focused on personal workflow?
- Does it maintain the kanban board as the central thinking surface?
- Is this solving a real problem or adding capability for its own sake?

**Anti-Drift Check**

- Could this push KanTrack toward team management?
- Would this make it feel like enterprise software?
- Does it risk making the app a dependency rather than a tool?

**Long-Term Sustainability**

- Can this be maintained without compromising independence?
- Will it still make sense in five years?

**Final Question:** Does this help someone feel more organized, calm, and in control?

---

### Hard Stops (features that must always be refused)

These are not judgment calls. If a proposal falls into these categories, the answer is no:

| Category                 | Examples                                                            | Why                                           |
| ------------------------ | ------------------------------------------------------------------- | --------------------------------------------- |
| Team oversight           | "See all tasks your team added", "Manager view", "Activity feed"    | Turns personal tool into surveillance         |
| Performance measurement  | "Tasks completed this week", "Productivity score", "Streak counter" | Adds pressure; violates private space         |
| Forced accounts          | "Sign in to save your board"                                        | Breaks local-first promise                    |
| Behavioral analytics     | "Which features users use most", "When users are most active"       | Content surveillance; trust destruction       |
| Gamification             | Badges, levels, points, leaderboards                                | Adds pressure; changes the emotional register |
| Lock-in architecture     | Proprietary format, no export, required cloud                       | "An app, not a trap"                          |
| Organizational reporting | "Export team progress", "Sprint report", "Velocity metrics"         | Wrong product category                        |

---

### Drift Warning Signs

If these appear in the product or codebase, investigate immediately:

- Any UI element that shows a number the user didn't explicitly put there (tasks completed today, productivity percentage)
- Any server endpoint that accepts or returns task content
- Any feature that only makes sense if multiple people can see a user's board
- Any onboarding step that delays the user from adding their first task
- Any notification or reminder the user didn't ask for
- Any metric that compares a user to other users or to their past self

---

## Implementation Order Summary

| Phase | Name                             | Prerequisite | Complexity |
| ----- | -------------------------------- | ------------ | ---------- |
| 0     | Stabilization                    | None         | Medium     |
| 1     | Architecture Refactor            | Phase 0      | High       |
| 2     | Build System & DX                | Phase 1      | Medium     |
| 3     | Operation Log                    | Phase 1 + 2  | High       |
| 4     | Export/Import v2                 | Phase 3      | Medium     |
| 5     | Performance                      | Phase 1      | Medium     |
| 6     | Security Hardening               | Phase 1      | Medium     |
| 7     | Design Integrity & Accessibility | Phase 1      | Medium     |
| 8     | Account Infrastructure           | Phase 4      | High       |
| 9     | Encrypted Vault                  | Phase 8 + 4  | Very High  |
| 10    | Multi-Device Sync                | Phase 9 + 3  | Very High  |
| 11    | Scale & Production               | All previous | Medium     |
| 12    | Long-Term Vision                 | Phase 3 + 9  | Ongoing    |

---

## The Ten Non-Negotiables

These rules govern every phase and every decision. No business pressure, user request, or technical convenience overrides them:

1. **Local Mode is always complete** — works offline, without an account, without network, forever
2. **No productivity feature ever requires an account** — accounts enable Vault only
3. **The server never stores or reads plaintext user data** — zero-knowledge, always
4. **No behavioral analytics** — KanTrack never knows what you work on, when, or how much
5. **Users can always export all their data** — in a portable, documented format
6. **No gamification, scoring, or performance pressure** — the app has no opinion about your productivity
7. **No urgency-inducing design** — no pressure, no alarms, no streaks
8. **No drift toward team management or organizational oversight** — this is a personal tool
9. **Minimal external runtime dependencies** — each one is a liability; justify every addition
10. **Fail clearly and safely** — never lose data silently; always offer recovery

---

_Last updated: 2026-02-27_
_Cross-referenced against: Master Strategy, Technical Architecture, Improvement Plan, Brand Philosophy, Builder Ethos, Decision Checklist, Design Philosophy, Engineering Philosophy, Product Doctrine, Roadmap Philosophy, Homepage Blueprint, Public Homepage, Sponsor Brief, Vision Deck, Manifesto_
_Baseline: KanTrack standalone v0 — vanilla ES modules, localStorage primary storage_
