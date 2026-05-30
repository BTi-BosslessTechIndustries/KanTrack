# KanTrack

**A local-first personal kanban board. No accounts. No tracking. Your data stays on your device.**

KanTrack is a privacy-first personal workflow tool that runs entirely in the browser. There is no backend, no account system, and no network required. Everything you create lives in your own browser's storage (IndexedDB and localStorage) and goes nowhere unless you explicitly export it.

---

## Features

- **Kanban board**: four columns (To Do, In Progress, On Hold, Done) with drag-and-drop
- **Task detail modal**: rich notes editor with **Bold**, **Italic**, and **Strikethrough** formatting; images (paste-to-insert, with full-screen viewer and zoom controls); a chronological edit/delete log; a collapsible sub-kanban board; **Save** keeps the modal open for multi-step edits, **Save & Close** saves and dismisses; double-click the title to rename it inline
- **Sub-kanban boards**: each task contains a toggleable mini kanban board with the same four columns (To Do, In Progress, On Hold, Done); sub-tasks support drag-and-drop between states and display a live done/total counter on the parent card
- **Card size**: three global card sizes (Small / Medium / Large) selectable from the ⋮ menu; preference persists across sessions
- **Priority system**: High / Medium / Low with colour tinting and column sorting
- **Tags**: colour-coded labels with preset palette or custom hex colour; pinned tags appear in a quick-assign panel
- **Due dates**: visual overdue and "due today" indicators on cards
- **Timer**: per-task time tracking with quick-add and quick-remove
- **Undo / Redo**: full history with durable IDB-backed undo entries
- **Trash**: soft-delete with restore; recoverable until you empty it
- **Notebook**: a resizable sidebar with a folder/page tree; pages support rich text, image paste, and per-page PDF export; right-click any item for a context menu (rename, delete); drag-and-drop to reorder and move pages and folders; live search to filter by name; import pages from a ZIP archive or export the whole notebook as ZIP; sidebar open/closed state and width persist across sessions
- **Export & Import**: export individual tasks or notebook pages as PDF (cross-platform, including Mac); export the entire board as a static HTML snapshot (task data and images embedded for re-import), full JSON (with embedded images), lightweight JSON, or AES-256-GCM encrypted `.kantrack.enc`; export the entire notebook as a ZIP; import a full board (merge or replace mode) from any previously exported JSON or encrypted file; import a notebook from a ZIP archive
- **World clocks**: multiple timezone clocks and a chronometer displayed in a widget row above the board; Reset collapses the row and moves a live 24-hour current time display and an Add Clock icon button into the header, reclaiming the vertical space; adding any clock restores the full widget row
- **Search & filter**: full-text search with tag and column filters; the task input, Add button, and search bar form a single proportional-scaling row that never wraps on window resize; tag filters occupy a dedicated row below
- **Column task counts**: each column header shows a live count of visible tasks; the count reflects active search and filter state
- **Storage quota monitoring**: checks browser storage quota silently at startup; displays a calm informational message in the settings panel when usage reaches 70%, and a stronger prompt to export a backup at 85%; also requests durable storage permission from the browser so data is protected from automatic eviction
- **Keyboard shortcuts**: `N` focus new task input; `/` focus search; `?` open shortcuts reference; arrow keys navigate cards across and within columns; `Ctrl+Z` undo; `Ctrl+Shift+Z` / `Ctrl+Y` redo; `Ctrl+B` toggle notebook sidebar; `Escape` closes any open modal or panel
- **Fully offline**: no CDN dependencies at runtime; everything is bundled
- **No analytics, no telemetry, no cookies**: not ever

---

## Live app

> **[kantrack.com](https://kantrack.com)** _(Cloudflare Pages, open in any modern browser, no install needed)_

---

## Help and feature guide

The full feature guide is built into the app. Press `?` or select **Help** from the ⋮ menu to open the Help dialog. It covers all features (board, task detail, notebook, privacy), keyboard shortcuts, and the export/import reference in one place.

---

## Running locally

### Prerequisites

- Node.js 18 or later
- npm 9 or later

### Start the dev server

```bash
git clone https://github.com/BTi-BosslessTechIndustries/KanTrack.git
cd KanTrack
npm install
npm run dev        # → http://localhost:5173
```

The dev server uses Vite's hot module replacement. Changes to `scripts/` and `styles/` reflect immediately without refreshing.

### Preview the production build

```bash
npm run build      # bundle everything → dist/
npm run preview    # serve dist/ locally at http://localhost:4173
```

Use this to verify exactly what Cloudflare Pages will deploy.

---

## Build and test

```bash
npm run build        # production build → dist/
npm run preview      # serve dist/ locally at http://localhost:4173

npm run test:run     # unit tests (Vitest, 578 tests across 21 files, ~1s)
npm run test         # unit tests in watch mode
npm run typecheck    # TypeScript type check (tsc --noEmit)
npm run lint         # ESLint

npm run e2e          # Playwright E2E (builds automatically before running)
npm run e2e:ui       # Playwright UI mode (interactive test runner)
```

First-time E2E setup: install the Chromium browser once:

```bash
npx playwright install chromium
```

---

## Project structure

```
KanTrack/
│
├── index.html                   # App entry point (Vite root)
├── privacy.html                 # Privacy & Cookie Policy page (GDPR)
│
├── scripts/                     # Application source code
│   ├── kantrack.js              # Bootstrap: registers all actions, inits router + store
│   ├── kantrack-modules/        # Feature modules (30 files)
│   │   ├── types.ts             # Shared TypeScript types
│   │   ├── store.ts             # Flux-like state store
│   │   ├── router.ts            # data-action event delegation
│   │   ├── repository.ts        # All IDB/localStorage persistence
│   │   ├── sanitize.js          # Allowlist-based HTML sanitizer (XSS protection)
│   │   ├── virtual-list.js      # Virtualised card list (performance)
│   │   └── *.js                 # Feature modules (tasks, modal, priority, ...)
│   └── workers/                 # Web workers
│       ├── export-worker.js     # JSON serialisation off the main thread
│       └── compaction-worker.js # Oplog compaction off the main thread
│
├── styles/                      # CSS split by concern
│   ├── base.css                 # Variables, reset, typography, .sr-only utility
│   ├── components.css           # Reusable UI components
│   ├── features.css             # Feature-specific styles
│   └── responsive.css           # Media queries (breakpoints at 480 / 640 / 768 / 1024 px)
│
├── tests/                       # All automated tests
│   ├── *.test.js                # Vitest unit tests (578 tests, 21 files)
│   ├── setup.js                 # Vitest setup: mocks IDB, localStorage, crypto
│   └── e2e/                     # Playwright end-to-end tests (89 tests, 8 files)
│       ├── smoke.spec.js        # Core persistence smoke tests
│       ├── flows.spec.js        # User flow tests (delete, edit, notes, undo)
│       ├── accessibility.spec.js# Keyboard shortcuts and focus management
│       ├── import-export.spec.js# Export/import round-trips
│       ├── performance.spec.js  # Virtual list DOM budget
│       ├── search.spec.js       # Live search filtering and ESC clear
│       ├── header.spec.js       # Header UI: dropdown, About modal, Shortcuts modal
│       └── responsive.spec.js   # Controls bar and card layout at multiple viewport widths
│
├── config/                      # Build and tool configuration
│   ├── vite.config.js           # Vite build config
│   ├── vitest.config.js         # Vitest unit test config
│   ├── playwright.config.js     # Playwright E2E config
│   └── eslint.config.js         # ESLint flat config (v9)
│
├── docs/                        # Project documentation
│   ├── KanTrack_Cloud_Roadmap.md# Phases 8-12 roadmap (future cloud layer)
│   ├── technical/               # Architecture and security reference
│   ├── philosophy/              # Engineering and design principles
│   ├── product/                 # Product vision and marketing docs
│   └── vision/                  # Manifesto and mission
│
├── images/                      # Static assets (kantrack_logo.png, kantrack_icon.png, bti-logo.png)
│
├── .github/
│   ├── workflows/ci.yml         # CI: lint + typecheck + test + build + e2e
│   ├── CONTRIBUTING.md
│   └── SECURITY.md
│
├── jsconfig.json                # IDE support for .js files
├── tsconfig.json                # TypeScript compiler config
├── package.json                 # Dependencies + scripts + Prettier config
└── .gitignore
```

---

## Tech stack

| Layer      | Technology                                                    |
| ---------- | ------------------------------------------------------------- |
| Language   | Vanilla JavaScript (ES modules) + TypeScript (4 core modules) |
| Build      | Vite 8                                                        |
| Unit tests | Vitest 2 + fake-indexeddb                                     |
| E2E tests  | Playwright                                                    |
| Linting    | ESLint 10 (flat config)                                       |
| Formatting | Prettier 3                                                    |
| Storage    | localStorage (sync primary) + IndexedDB (async secondary)     |
| Export     | jsPDF + JSZip (bundled, no CDN)                               |
| Deployment | Cloudflare Pages (static, free tier)                          |

No framework. No runtime dependencies beyond jsPDF and JSZip.

---

## Philosophy

KanTrack is built around one conviction: **your productivity tools should serve you, not extract value from you.**

Every engineering decision is governed by ten red lines that can never be crossed at any phase of development: no server-stored plaintext, no behavioral analytics, no gamification, no urgency-inducing design, no mandatory accounts. The full framework lives in [`docs/philosophy/`](docs/philosophy/).

At the technical level, a strict Content Security Policy blocks all third-party scripts, styles, and network connections at the browser level, enforced by the browser itself, not just by convention.

---

## Contributing

Read [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) before submitting anything. The short version: bug fixes, accessibility improvements, and documentation are welcome. Features that require accounts, tracking, or team management are not.

---

## License

See [`LICENSE`](LICENSE). Source-available. Commercial use not permitted.
