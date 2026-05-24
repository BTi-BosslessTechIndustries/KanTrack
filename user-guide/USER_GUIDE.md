# KanTrack — A Personal Kanban Board That Respects Your Work

**Organize your work your way. No account. No cloud. No tracking.**

KanTrack is a browser-based kanban board built for individuals — not teams, not managers, not
dashboards. Your tasks, notes, and plans stay on your device. Nothing is sent anywhere unless you
choose to export it.

Open it at [kantrack.com](https://kantrack.com). Start working. That is the entire setup process.

---

## The Problem This Solves

Most productivity tools were built to coordinate teams and report progress upward. Jira tells your
organization what is happening. Notion stores your team's collective knowledge. Asana tracks your
sprint against goals set by someone else.

None of them were built to answer the question you ask every single morning:

> **"What should I do right now?"**

To fill that gap, most professionals maintain a hidden layer of personal systems — a sticky-note
wall, a private notebook, a text file of things they are actually tracking. KanTrack is that private
layer, purpose-built.

It sits alongside the tools your organization requires. It does not replace them. It gives you a
personal command center above them — one that belongs to you, not your employer.

---

## What KanTrack Is

A calm, focused planning surface that helps you see everything you are working on in one place.

The core is a kanban board with four columns: To Do, In Progress, On Hold, and Done. You add tasks,
move them as work progresses, and attach the context that matters — notes, images, sub-tasks, time
tracked, deadlines. Everything stays local. The app runs entirely in your browser, stores data in
your browser's own storage, and works without an internet connection.

KanTrack is built by [BTi — Bossless Tech Industries](https://bosslesstechindustries.com), a
company with one governing idea: software should serve the person using it. That conviction shapes
every decision in this product, from how data is stored to how the business model will scale.

---

## What You Can Do With KanTrack

### Your Work, Visible

The board gives you an immediate, honest picture of where everything stands.

Tasks move between columns by drag and drop. Each card carries a priority level — High, Medium, or
Low — with colour tinting that makes urgency visible at a glance. Columns sort automatically by
priority so the most important work rises to the top. Due dates appear on cards with clear overdue
and "due today" indicators, so nothing slips quietly past you.

Tags let you add colour-coded labels to tasks. Choose from a preset palette or set a custom hex
colour. Pin your most-used tags to a quick-assign panel for fast labelling. Filter the entire board
by tag, column, or a text search to focus on exactly what needs your attention. Three global card
sizes — Small, Medium, Large — let you scale the board to your screen and your working style, with
the preference persisting across sessions.

---

### Built to Think

Most tools track tasks. KanTrack is designed to carry the context behind them.

Open any task into a full detail view. Write rich notes with bold, italic, and strikethrough
formatting. Paste images directly — they are stored locally and viewable in a full-screen viewer
with zoom controls. A chronological log records every edit and deletion, so you always have a clear
history of how a task evolved. Double-click the title to rename it inline without opening a separate
form.

Each task can contain its own sub-kanban board: a collapsible mini board with the same four columns,
drag-and-drop support between states, and a live done/total counter visible on the parent card. Use
it to break complex work into concrete steps without adding clutter at the board level.

A per-task timer lets you track time spent with quick-add and quick-remove controls. The task modal
gives you two save options: **Save** keeps it open for multi-step edits, and **Save & Close** saves
and dismisses in one action.

---

### Private by Design

This is not a feature. It is the foundation.

KanTrack stores everything in your browser's IndexedDB and localStorage. Nothing is transmitted,
synced, or logged to any external server. There are no analytics libraries loaded at any point. No
telemetry. No cookies. Not ever.

The app runs fully offline with no CDN dependencies at runtime — every asset is bundled into the
app itself. A strict Content Security Policy, enforced at the browser level, blocks all third-party
scripts and network connections. This is not a convention. It is enforced by the browser regardless
of what any future update might attempt.

At startup, KanTrack silently checks your browser storage quota. It surfaces a calm informational
notice in settings when usage reaches 70%, and prompts you to export a backup at 85%. It also
requests durable storage permission from your browser so your data is protected from automatic
eviction — a browser behaviour most apps ignore entirely.

Privacy is not a setting you need to configure. It is the default state of the application.

---

### Yours to Keep

KanTrack will never hold your data hostage.

Export your entire board at any time as a **static HTML snapshot**, **full JSON with embedded
images**, **lightweight JSON**, or an **AES-256-GCM encrypted `.kantrack.enc` file**. Export
individual tasks or notebook pages as **PDF** on any platform, including Mac. Export your entire
notebook as a **ZIP archive**.

Import any previously exported file in **merge mode** (adds to your existing board) or **replace
mode** (starts fresh from the export). If you want to move to a different tool, your data moves with
you, in a format you can read without KanTrack.

There is no lock-in by design. An app should not become a trap.

---

### The Details That Matter

**Notebook.** A resizable sidebar with a folder and page tree for notes, references, and longer-form
thinking that does not belong on a task card. Pages support rich text with image paste, per-page PDF
export, right-click context menus for rename and delete, drag-and-drop reordering, and live search
to filter by name. Import pages from a ZIP archive or export the whole notebook in one action.

**Search and filter.** Full-text search with tag and column filters lets you find anything
immediately. The search bar, task input, and Add button scale proportionally with the window —
they never wrap or break at narrow widths.

**Keyboard shortcuts.** Work without touching the mouse: `N` to focus the new task input, `/` to
search, `?` to open the shortcuts reference, arrow keys to navigate cards across and within columns,
`Ctrl+Z` / `Ctrl+Shift+Z` for undo and redo, `Ctrl+B` to toggle the notebook sidebar, `Escape` to
close any open modal or panel.

**Undo and redo.** Backed by a durable IndexedDB history that survives page reloads. Nothing is
gone until you decide it should be — a trash system provides soft-delete with restore, and you
control when the trash is emptied.

**World clocks.** Track multiple time zones and run a chronometer alongside your work, useful if
your responsibilities span geographies.

---

## What Sets It Apart

The local-first software movement is a direct response to the structural problems of centralized
cloud applications — data breaches, vendor lock-in, sudden shutdowns, price escalation, and
surveillance that is on by default. Awareness of these risks is accelerating, and demand for tools
that work differently is growing with it.

KanTrack sits at that intersection: privacy, personal productivity, and individual autonomy. It does
not compete with Jira or Asana or Notion. Those tools are designed to answer organizational
questions. KanTrack is designed to answer the question those tools were never built to address.

> _If Jira tracks projects, KanTrack tracks your day._

The architecture reflects the philosophy. No backend. No account system. No runtime framework
dependencies. The Content Security Policy is browser-enforced, not aspirational. Every engineering
decision is governed by a set of non-negotiable principles — documented publicly in the project's
philosophy files — that hold regardless of growth pressure or investor expectations.

This is BTi's approach to every product it builds: start from a clear conviction about what the
software is for and what it will never become, and hold that line. KanTrack's roadmap includes an
optional encrypted vault for cross-device backup and sync, and a future desktop mode for unlimited
local storage. Paid tiers will extend capability without removing freedom. That constraint is not a
marketing position. It is a design rule with teeth.

---

## Try It Now

KanTrack is free. No signup required.

Open it in any modern browser: **[kantrack.com](https://kantrack.com)**

Your board is ready immediately. Add your first task, move it across the board, open the detail view
and start writing notes. Everything you create stays on your device.

The full source code is available if you want to run it locally, audit it, or contribute:
[github.com/BTi-BosslessTechIndustries/KanTrack](https://github.com/BTi-BosslessTechIndustries/KanTrack)

To learn more about BTi and what we are building next:
[bosslesstechindustries.com](https://bosslesstechindustries.com)

---

_KanTrack is an app — not a trap._
