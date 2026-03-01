# KanTrack — Cloud Platform Roadmap

## Phases 8–12: Account Infrastructure, E2EE Vault, Multi-Device Sync, and Long-Term Vision

---

## Preamble

**Phases 0–7 are complete.** KanTrack is a fully working, production-deployed, local-first personal kanban board. It runs as a static site on Cloudflare Pages with no backend, no accounts, and no network requirement. Every feature works offline, permanently, for free.

This document covers the phases that add an **optional** cloud layer on top of that foundation. Nothing in these phases modifies or degrades Local Mode. The existing data architecture (UUID IDs, oplog structure, IDB-first storage) was designed from the beginning to be sync-ready — no rework of the data layer is needed when cloud work begins.

**No work in this document begins until a deliberate, documented decision is made to start it.** These phases exist to be thought through in advance, not to create pressure to build them.

---

## The Founding Lens

Every decision in these phases must pass this filter before implementation:

- Does this serve the individual doing the work — not the organization assigning it?
- Does it increase personal workflow clarity, calm, and control?
- Does it preserve full data ownership and the ability to leave freely?
- Does it keep the board as the central thinking surface?
- Does it make the product more like itself — or less?

If the answer to any of these is "no", reconsider before building.

---

## Red Lines (never cross these, at any phase)

1. Local Mode must always work fully — offline, without an account, without network
2. No productivity feature may ever require an account
3. The server must never store or be able to read plaintext user data
4. No behavioral analytics — never collect what tasks users create, how often, what they name things
5. Users can always export all their data in a portable, documented format
6. No gamification, scoring, or performance pressure
7. No urgency-inducing design
8. No drift toward team management or organizational oversight

---

## Phase 8 — Account Infrastructure

### Goal: Backend foundation for paid services, with zero contact with user content

Accounts are an enabler for the Vault (Phase 9) — nothing more. The Product Doctrine and anti-drift rule are most at risk during this phase. Every decision here must be checked against the founding lens before implementation.

---

### 8.1 — Backend service (minimal, content-free)

**What to build:**

- Minimal backend service (Node/Bun + PostgreSQL or equivalent):
  - `users`: id (UUID), email, created_at, subscription_status, subscription_expires_at
  - `devices`: device_id (UUID from client), user_id, registered_at, last_seen_at
  - **No task, note, tag, clock, or any content table — ever**
- Auth: magic link (email) or passkey (WebAuthn) — no passwords
- JWT: 15-minute access tokens + 7-day refresh tokens
- Rate limiting: 60 req/min per IP, stricter on auth endpoints

**Anti-drift constraint:** The backend must have a formal rule in its codebase — no endpoint may accept or return task content. This is enforced architecturally (no content tables), not just by policy.

**Acceptance criteria:**

- Local Mode works 100% without signing in
- Server database contains zero task, note, or tag content
- Account creation is optional and never required for any productivity feature

---

### 8.2 — Account UI

**What to build:**

- Settings panel → Account section (not the main UI — the board is the primary surface):
  - "Sign in / Create account" if signed out
  - Email, plan, device list if signed in
  - "Sign out" and "Delete account" (with confirmation)
- No persistent account prompts inside the board workspace
- Account badge in header only when signed in — small, unobtrusive

**Design constraint:** Account UI must never compete with the board for attention. A user who never signs in should never be made to feel they're missing out or using an inferior version. Local Mode is complete and first-class.

---

### 8.3 — Subscription system

**What to build:**

- Stripe integration: webhooks update `subscription_status` in DB
- Two tiers only:
  - **Free** — Local Mode (full, permanent, no credit card)
  - **Pro** — Encrypted Cloud Vault + multi-device sync
- Account page: tier, renewal date, manage billing link
- No dark patterns: no "your trial ends in X days", no feature teasing, no artificial limitations on Local Mode

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

Prerequisite: Phase 8 complete.

From the Master Strategy: "Cloud acts as removable storage, not dependency." The Vault does not make KanTrack a cloud app. It makes a cloud option available to users who want it, while changing nothing about Local Mode.

---

### 9.1 — Crypto module

**What to build:**

Create `scripts/kantrack-modules/vault-crypto.js` using WebCrypto only — no external crypto library:

```javascript
// Key derivation
deriveKEK(passphrase, salt); // PBKDF2, 100k iterations, AES-GCM 256-bit

// Data encryption key
generateDEK(); // crypto.getRandomValues
wrapDEK(dek, kek); // AES-GCM wrap
unwrapDEK(wrappedDek, kek); // AES-GCM unwrap

// Encryption / decryption
encrypt(plaintext, dek); // AES-GCM, random IV per call
decrypt(ciphertext, iv, dek);

// Integrity
sha256(data); // SubtleCrypto.digest
```

- Salt: unique per user, stored on server (not secret — just unique per account)
- DEK never leaves the device unencrypted
- Wrapped DEK stored on server alongside ciphertext

**Dependency constraint:** WebCrypto is a browser built-in. No external crypto library is needed or acceptable. Crypto code with external dependencies cannot be audited with confidence.

---

### 9.2 — Vault server endpoints

**What to build:**

Server accepts only opaque encrypted blobs:

```
POST   /vault/objects       — upload encrypted blob
GET    /vault/objects       — list objects (objectId, type, updatedAt only)
GET    /vault/objects/:id   — download encrypted blob
DELETE /vault/objects/:id

GET    /vault/dek           — download wrapped DEK
PUT    /vault/dek           — upload wrapped DEK
```

- Server never parses blob content
- Metadata (objectId, type, updatedAt) is the only non-encrypted data stored

---

### 9.3 — Vault user flow

**First-time setup (calm, clear language):**

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

**Design constraint:** Vault UI must be calm. No "your data is unprotected" framing. No alarming icons next to backup status. This is a reassurance feature, not an anxiety-inducing one.

---

### 9.4 — Passphrase change

- Old passphrase → decrypt DEK → re-encrypt with new KEK → upload
- Server never receives either passphrase

---

### Phase 9 Checklist

- [ ] `vault-crypto.js` using WebCrypto only (no external library)
- [ ] DEK/KEK key hierarchy implemented and tested
- [ ] Vault server endpoints (opaque blobs only, no content parsing)
- [ ] First-time vault setup with recovery key
- [ ] Auto-backup every 30 min (background, silent)
- [ ] Restore from vault with passphrase prompt and backup preview
- [ ] Passphrase change flow (re-wraps DEK, server never sees passphrases)
- [ ] Vault UI: calm language, no urgency framing

---

## Phase 10 — Multi-Device Sync

### Goal: Seamless, invisible convergence across all a user's devices

Prerequisite: Phases 8 and 9 complete.

Sync should feel invisible — the board is just always current, without the user thinking about it. Conflicts are resolved silently where possible and surfaced only when a decision is genuinely needed.

---

### 10.1 — Encrypted opbatch push/pull

**What to build:**

- Each device tracks `lastSyncedLamport` in `meta`
- **Push:** collect ops since `lastSyncedLamport` → serialize → encrypt → upload as `opbatch`
- **Pull:** fetch new opbatches → decrypt → apply via reducers → update watermark
- Sync triggers: on app open, every 5 minutes, on tab visibility gain, on reconnect after offline
- Offline: operations queue locally, sync transparently when back online

**Files affected:** new `sync.js`, updates to `repository.ts`, `store.ts`

---

### 10.2 — Conflict resolution

**What to build:**

- **Field-level LWW (Last-Write-Wins):** highest `(lamport, deviceId)` wins per field
- **Task order:** fractional indexing via `orderKey` string — no integer re-indexing, no position conflicts
- **Delete wins:** a delete op always supersedes an update op (deletedAt takes precedence)
- **Silent merge:** most changes merge without surfacing anything to the user

**Conflict notification language (calm, non-alarming):**

- "Some changes from another device were merged." — never "CONFLICT DETECTED"
- If a task was deleted on one device and edited on another: "A task you edited on this device was deleted on another. It has been restored here. You can delete it if you no longer need it."

**Design constraint:** Conflict messages must read like helpful information, not system errors. A conflict notification should never be alarming or demand immediate action.

**Files affected:** new `conflict-resolver.js`, updates to `tasks.js`

---

### 10.3 — Device management UI

**What to build:**

- Settings → Devices: list with device name, last-seen date, "This device" label
- "Remove device" — revokes sync for that device
- Simple and clean — not a security dashboard

---

### 10.4 — Sync status indicator

**What to build:**

- Small, unobtrusive indicator in header: "Synced", "Syncing...", "Sync unavailable — will retry"
- Tap/click to force sync
- Offline: "Offline — changes saved locally"

**Design constraint:** Sync status must be informational, not alarming. "Sync unavailable" is better than "Sync failed — your data may be out of date." The second creates anxiety; the first states fact.

---

### Phase 10 Checklist

- [ ] `sync.js` with push/pull opbatch logic
- [ ] `lastSyncedLamport` tracking per device
- [ ] LWW conflict resolution
- [ ] Fractional indexing (`orderKey`) for task positions
- [ ] Background sync: on open + every 5 min + on tab visibility gain + on reconnect
- [ ] Calm conflict messaging language
- [ ] Device management UI in settings
- [ ] Sync status indicator (calm, unobtrusive)

---

## Phase 11 — Scale, Polish & Production Readiness

### Goal: Ready for millions of users, press coverage, and enterprise scrutiny

Prerequisite: All previous phases complete.

---

### 11.1 — Privacy-respecting analytics (no behavioral data)

**What to build:**

- Self-hosted analytics (Plausible or Umami) — no Google Analytics, ever
- **Allowed:** page views, anonymous feature usage counts, error rates, performance metrics
- **Never allowed:**
  - Task titles, note content, tag names, or any user-generated content
  - Behavioral patterns: how often a user creates tasks, when they work, how many tasks they complete
  - Identifiers linkable to individuals without consent
- Opt-out toggle in settings
- Privacy policy in plain language stating exactly what is and is not collected

**Anti-drift constraint:** Behavioral analytics is surveillance. KanTrack must never know what you work on, when, or how much. This is a hard line, not a policy preference.

---

### 11.2 — Onboarding (respecting the user's pace)

**What to build:**

- First-time load: the board is immediately usable — no welcome screen, no required tour, no email gate
- Single optional, dismissable banner (shown once): "Welcome to KanTrack. Add a task to get started."
- No "take the tour" modal, no wizard, no productivity tips popup

**Design constraint:** A user who opens KanTrack and immediately adds a task without reading anything has had the correct onboarding experience. Any onboarding that delays or interrupts this is wrong. The aha moment is the board itself.

---

### 11.3 — Performance benchmarks

Targets (internal engineering thresholds — never shown to users):

| Scenario                   | Target                    |
| -------------------------- | ------------------------- |
| Cold load, empty cache     | < 1.5s on 3G (Lighthouse) |
| Cold load with 500 tasks   | < 2.5s                    |
| 1,000-task board scroll    | 60 fps                    |
| Export of 1,000-task board | < 3s in Worker            |
| IDB write latency          | < 50ms (debounced batch)  |

---

### 11.4 — Security audit readiness

**What to build:**

- Document all server endpoints, auth flows, crypto assumptions
- `npm audit` clean; Dependabot automated PRs
- Bug bounty program via GitHub Security Advisories or HackerOne
- GPG-signed GitHub Releases

---

### 11.5 — Documentation completeness

**What to build:**

- `README.md`: screenshots, full feature list, keyboard shortcuts, storage model, export format spec
- `CONTRIBUTING.md`: development setup, PR process, code style
- `CHANGELOG.md`: semantic versioning, human-written release notes
- In-app help: `?` key already opens the keyboard shortcuts dialog (Phase 7); extend if needed

---

### 11.6 — Release workflow

**What to build:**

- Semantic versioning: MAJOR.MINOR.PATCH
- GitHub Releases with human-written release notes (not auto-generated changelogs)
- `npm run release` script: bumps version, creates tag, triggers Cloudflare Pages deploy

---

### Phase 11 Checklist

- [ ] Self-hosted analytics (no behavioral data, no user content)
- [ ] Analytics opt-out in settings
- [ ] Onboarding: single dismissable banner, no forced tour, no email gate
- [ ] Performance benchmarks: measure and meet all targets
- [ ] `npm audit` clean; Dependabot configured
- [ ] Bug bounty program active
- [ ] README, CONTRIBUTING, CHANGELOG complete
- [ ] Semantic versioning + GitHub Releases workflow

---

## Phase 12 — Long-Term Vision

### Goal: KanTrack evolves into a personal operating system for individual work

These capabilities are validated by the Vision Deck as the long-term destination. They are **not** scope for current phases — they inform architectural decisions made earlier so this expansion doesn't require rewrites.

---

### 12.1 — Local workflow analytics (private, on-device only)

**What it is:** Optional, local-only statistics about your own work patterns — "I tend to complete more tasks on Tuesdays" — visible only to you, never leaving the device.

**What it is not:** Reporting for managers, performance tracking, or any data sent to a server.

**Foundation:** The Phase 3 oplog is the data source — every mutation is recorded with timestamps. No new infrastructure is needed.

**Design constraint:** These analytics answer "What do I notice about my own work?" — not "How productive am I?" No scoring, no benchmarks, no comparisons to others or to your past self.

---

### 12.2 — Local AI assistance (private, on-device)

**What it is:** AI features that run entirely on-device — task suggestions, due date recommendations, notebook summaries — without any content leaving the browser.

**Technologies:** WebLLM (runs models in browser via WebGPU), or server-side within the E2EE model (model operates on decrypted content client-side; server sees only ciphertext).

**Foundation:** Phase 9 E2EE infrastructure is the prerequisite.

**Design constraint:** AI assistance is a suggestion, never a directive. It reduces cognitive load; it does not replace user decision-making. Fully optional, opt-in, and dismissable at any time.

---

### 12.3 — Integration layer (read-only connectors)

**What it is:** Pull in data from Jira, GitHub, Linear, etc. as read-only context visible in KanTrack — a personal overlay above external tools, not a replacement for them.

**Foundation:** The Phase 1 domain model must be flexible enough to represent tasks from external sources. IDs and entity schema need to support `source: 'jira'` metadata.

**Design constraint:** KanTrack does not sync back to external tools. It is a personal view, not a two-way integration platform. This constraint prevents drift toward project management tooling.

---

### 12.4 — Advanced personal knowledge base

**What it is:** Evolution of the current Notebook into a richer personal knowledge system — backlinks, templates, full-content search, structured notes.

**Foundation:** The IDB content model (Phase 0) and oplog (Phase 3) must handle richer data types. The notebook content structure should not be locked to the current flat HTML model.

---

### Phase 12 — Architectural prerequisites to protect now

These properties of the current codebase must be preserved in all future work so Phase 12 doesn't require rewrites:

- [ ] Phase 3 oplog: full timestamp and entity metadata on every mutation (enables local analytics)
- [ ] Phase 9 E2EE: zero-knowledge model preserved (enables private AI assistance)
- [ ] Phase 1 domain model: flexible entity schema with optional `source` field (enables integrations)
- [ ] Phase 0 IDB: content stored in a queryable, extensible structure (enables knowledge base)

---

## Implementation Order

| Phase | Name                         | Prerequisite        | Complexity |
| ----- | ---------------------------- | ------------------- | ---------- |
| 8     | Account Infrastructure       | Phases 0–7 complete | High       |
| 9     | Encrypted Cloud Vault        | Phase 8             | Very High  |
| 10    | Multi-Device Sync            | Phases 8 + 9        | Very High  |
| 11    | Scale & Production Readiness | All previous        | Medium     |
| 12    | Long-Term Vision             | Phases 3 + 9        | Ongoing    |

---

## Anti-Drift Safeguard

The greatest risk to KanTrack is not technical failure — it is gradual drift toward what it explicitly chose not to be. Every feature request, business opportunity, or competitive pressure will contain small invitations to drift.

---

### The Decision Checklist

Apply to every proposed feature or change:

**Core alignment**

- Does this increase personal workflow clarity?
- Does this strengthen user autonomy?
- Does this reduce cognitive load?

**Individual-first test**

- Is this primarily for the person doing the work?
- Would a self-directed professional find this valuable without being told?

**Privacy & ownership**

- Does this preserve data ownership?
- Does it avoid surveillance, tracking, or performance measurement?
- Can users export their data freely after this change?

**Simplicity & focus**

- Does this keep the product focused on personal workflow?
- Does it maintain the kanban board as the central thinking surface?
- Is this solving a real problem or adding capability for its own sake?

**Anti-drift check**

- Could this push KanTrack toward team management?
- Would this make it feel like enterprise software?
- Does it risk making the app a dependency rather than a tool?

**Final question:** Does this help someone feel more organized, calm, and in control?

---

### Hard Stops

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

If any of these appear in the product or codebase, investigate immediately:

- Any UI element that shows a number the user didn't explicitly put there (tasks completed today, productivity percentage)
- Any server endpoint that accepts or returns task content
- Any feature that only makes sense if multiple people can see a user's board
- Any onboarding step that delays the user from adding their first task
- Any notification or reminder the user didn't ask for
- Any metric that compares a user to other users or to their past self

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

_Cross-referenced against: Master Strategy, Technical Architecture, Engineering Philosophy, Design Philosophy, Product Doctrine, Decision Checklist, Roadmap Philosophy_
_Local phases 0–7 documented in: `KanTrack_Implementation_Roadmap.md`_
