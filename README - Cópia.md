# KanTrack

**A local-first personal kanban board. No accounts. No tracking. Your data stays on your device.**

KanTrack is a privacy-first personal workflow tool that runs entirely in the browser. There is no backend, no account system, and no network required. Everything you create lives in your own browser's storage — IndexedDB and localStorage — and goes nowhere unless you explicitly export it.

---

## Features

- **Kanban board** — four columns (To Do, In Progress, On Hold, Done) with drag-and-drop
- **Task detail modal** — rich notes with history, images (paste-to-insert), and a full edit/delete log
- **Priority system** — High / Medium / Low with colour tinting and column sorting
- **Tags** — colour-coded labels you can assign to any task
- **Due dates** — visual overdue and "due today" indicators on cards
- **Timer** — per-task time tracking with quick-add and quick-remove
- **Undo / Redo** — full history with durable IDB-backed undo entries
- **Trash** — soft-delete with restore; recoverable until you empty it
- **Notebook** — a separate sidebar for free-form notes and folders
- **Export** — individual tasks or notebook pages as PDF; entire notebook as ZIP
- **World clocks** — multiple timezone clocks and a chronometer
- **Search & filter** — full-text search with tag and column filters
- **Keyboard shortcuts** — N to focus new task, / for search, ? for the shortcuts reference, arrow keys to navigate cards
- **Fully offline** — no CDN dependencies at runtime; everything is bundled
- **No analytics, no telemetry, no cookies** — not ever

---

## Live app

> **[kantrack.com](https://kantrack.com)** _(Cloudflare Pages — open in any modern browser, no install needed)_

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

npm run test:run     # unit tests (Vitest, 529 tests across 19 files)
npm run test         # unit tests in watch mode
npm run typecheck    # TypeScript type check (tsc --noEmit)
npm run lint         # ESLint

npm run e2e          # Playwright E2E — 43 tests (builds automatically before running)
npm run e2e:ui       # Playwright UI mode (interactive test runner)
```

First-time E2E setup — install the Chromium browser once:

```bash
npx playwright install chromium
```

---

## Project structure

```
KanTrack/
│
├── index.html                   # App entry point (Vite root)
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
│   │   └── *.js                 # Feature modules (tasks, modal, priority, …)
│   └── workers/                 # Web workers
│       ├── export-worker.js     # JSON serialisation off the main thread
│       └── compaction-worker.js # Oplog compaction off the main thread
│
├── styles/                      # CSS split by concern
│   ├── base.css                 # Variables, reset, typography, .sr-only utility
│   ├── components.css           # Reusable UI components
│   ├── features.css             # Feature-specific styles
│   └── responsive.css           # Media queries (≤ 768 px)
│
├── tests/                       # All automated tests
│   ├── *.test.js                # Vitest unit tests (529 tests, 19 files)
│   ├── setup.js                 # Vitest setup: mocks IDB, localStorage, crypto
│   └── e2e/                     # Playwright end-to-end tests (43 tests, 7 files)
│       ├── smoke.spec.js        # Core persistence smoke tests
│       ├── flows.spec.js        # User flow tests (delete, edit, notes, undo)
│       ├── accessibility.spec.js# Keyboard shortcuts and focus management (Phase 7)
│       ├── import-export.spec.js# Export/import round-trips (Phase 4)
│       ├── performance.spec.js  # Virtual list DOM budget (Phase 5)
│       ├── search.spec.js       # Live search filtering and ESC clear
│       └── header.spec.js       # Header UI — dropdown, About modal, Shortcuts modal
│
├── config/                      # Build and tool configuration
│   ├── vite.config.js           # Vite build config
│   ├── vitest.config.js         # Vitest unit test config
│   ├── playwright.config.js     # Playwright E2E config
│   └── eslint.config.js         # ESLint flat config (v9)
│
├── docs/                        # Project documentation
│   ├── KanTrack_Cloud_Roadmap.md# Phases 8–12 roadmap (future cloud layer)
│   ├── technical/               # Architecture and security reference
│   ├── philosophy/              # Engineering and design principles
│   ├── product/                 # Product vision and marketing docs
│   └── vision/                  # Manifesto and mission
│
├── images/                      # Static assets (logo)
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
| Build      | Vite 5                                                        |
| Unit tests | Vitest 2 + fake-indexeddb                                     |
| E2E tests  | Playwright                                                    |
| Linting    | ESLint 10 (flat config)                                       |
| Formatting | Prettier 3                                                    |
| Storage    | IndexedDB (primary) + localStorage (sync fallback)            |
| Export     | jsPDF + JSZip (bundled, no CDN)                               |
| Deployment | Cloudflare Pages (static, free tier)                          |

No framework. No runtime dependencies beyond jsPDF and JSZip.

---

## Philosophy

KanTrack is built around one conviction: **your productivity tools should serve you, not extract value from you.**

Every engineering decision is governed by ten red lines that can never be crossed at any phase of development — no server-stored plaintext, no behavioral analytics, no gamification, no urgency-inducing design, no mandatory accounts. The full framework lives in [`docs/philosophy/`](docs/philosophy/).

---

## Contributing

Read [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) before submitting anything. The short version: bug fixes, accessibility improvements, and documentation are welcome. Features that require accounts, tracking, or team management are not.

---

## License

See [`LICENSE`](LICENSE). Source-available. Commercial use not permitted.
