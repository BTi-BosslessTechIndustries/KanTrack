# KANTRACK — TECHNICAL ARCHITECTURE PROMPT (ENGINEERING BLUEPRINT)

## AI-READABLE PROMPT FOR IMPLEMENTATION AGENTS

You are an AI Engineering Agent helping implement **KanTrack**, a local-first, privacy-first kanban platform with optional end-to-end encrypted cloud sync.

Your job:

- Propose and implement architecture decisions consistent with the Product Strategy.
- Produce code changes incrementally (small PR-sized steps).
- Never break Local Mode.
- Never introduce non-E2EE server access to user content.
- Always preserve exportability and user ownership.

This document specifies:

1. System goals & constraints (technical)
2. Storage architecture (Local Mode)
3. Data model and identifiers
4. Change tracking / operation log design
5. Export/import format & encryption
6. Cloud Vault (E2EE) architecture
7. Key management (zero-knowledge)
8. Sync protocol and conflict resolution
9. Security/threat model & hardening
10. Observability and privacy-respecting analytics
11. Phased implementation tasks with acceptance criteria

Use this as the canonical engineering plan.

---

# 1) TECHNICAL GOALS & CONSTRAINTS

## Goals

- Web-first SPA (works in modern browsers)
- Offline-first in Local Mode
- Local Mode uses only on-device browser storage
- Cloud Vault (paid) provides large storage + multi-device sync
- Cloud Vault is zero-knowledge: server stores only ciphertext
- Robustness: low corruption risk; recoverable workflows
- Performance: usable at 1,000+ tasks; scalable to 100k+ with engineering
- Transparency: users can always export/import workspace
- Minimal vendor lock-in: documented formats

## Constraints / non-negotiables

- Local Mode must work without login and without network
- Server must never see plaintext user data in Vault Mode
- Keys must never be sent to server (no key escrow)
- No “silent” filesystem storage (no hidden vault folders required)
- Avoid architecture that forces collaboration complexity early
- Avoid rewrites: migrate existing code incrementally

---

# 2) SYSTEM OVERVIEW (LAYERED ARCHITECTURE)

Implement strict separation:

## A) UI Layer

- Pure rendering + input handling
- No persistence logic
- Dispatches actions/commands

## B) Domain Layer (State + Reducers)

- Canonical in-memory state for current session
- Reducers apply actions and compute next state
- Deterministic and testable

## C) Persistence Layer (Local Store)

- IndexedDB as source of truth in Local Mode
- Responsible for schema migrations, reads, writes
- Exposes repository-style API

## D) Sync Layer (optional Vault)

- Pull/push encrypted objects
- Handles conflict resolution
- Integrates with operation log

## E) Crypto Layer (Vault only + optional encrypted export)

- WebCrypto wrappers (KDF, AEAD, key wrapping)
- Strict API: encrypt/decrypt only

## F) Platform Layer

- Storage quota estimation
- Persistent storage request
- Connectivity detection
- Background sync triggers (optional)

All boundaries must be enforced by module imports and testing.

---

# 3) LOCAL MODE STORAGE ARCHITECTURE

## Canonical store: IndexedDB

Use IndexedDB for structured data. Use localStorage only for tiny prefs.

### Databases/Stores (suggested)

- `meta`:
  - schemaVersion, lastCompactionAt, deviceId
- `boards`:
  - boardId, name, createdAt, updatedAt, settings
- `columns`:
  - columnId, boardId, name, order
- `tasks`:
  - taskId, boardId, columnId, order, title, descriptionRef, dueDate, priority, status, createdAt, updatedAt, deletedAt?
- `task_text` (or `blobs/text`):
  - taskId, descriptionCompressed (optional), other large text fields
- `tags`:
  - tagId, boardId, name
- `task_tags` (join):
  - taskId, tagId
- `notes` / `notebook_pages`:
  - pageId, boardId, title, bodyCompressed, updatedAt
- `trash`:
  - entityType, entityId, deletedAt (store refs, not full copies)
- `oplog` (operation log):
  - opId, deviceId, lamport, timestamp, entityType, entityId, actionType, patch, hash, prevHash
- `snapshots` (optional minimal):
  - snapshotId, createdAt, kind, data (limited)
- `attachments` (Local Mode: disabled by default or capped hard):
  - attachmentId, taskId, mime, blob (discouraged in Local Mode)

### Schema versioning

- Maintain integer `schemaVersion`
- On upgrade, migrate data; never silently wipe without user consent

### Persistent storage request

- Use `navigator.storage.persist()`
- Expose “Enable durable storage” in settings and show status

### Quota monitoring

- Use `navigator.storage.estimate()`
- Track usage over time; warn at thresholds

---

# 4) IDENTIFIERS & ENTITY RULES

## ID requirements

- Globally unique IDs across devices for sync compatibility
- Use UUIDv4 or ULID (ULID gives sortable IDs)

## Entity invariants

- A task belongs to one board and one column (at a time)
- Ordering must be stable and conflict-resilient:
  - Use fractional indexing (LexoRank-like) OR
  - Use an `orderKey` string generated between neighbors

Avoid integer reindexing at scale.

---

# 5) CHANGE TRACKING (OPERATION LOG) — REQUIRED FOR SYNC

Do not rely solely on “current state” for sync. Maintain an operation log.

## Oplog design

Each operation event records:

- `opId` (unique)
- `deviceId`
- `lamport` (monotonic counter per device, persisted in meta)
- `timestamp`
- `entityType` (task/column/tag/note/etc.)
- `entityId`
- `actionType` (create/update/move/delete/restore)
- `patch` (field-level changes; JSON patch-like)
- `prevHash` + `hash` (optional integrity chain)

### Compaction

To prevent oplog growth:

- Periodically compact:
  - Keep only ops since last snapshot OR since last sync anchor
  - Merge sequential updates to same entity
  - Drop redundant edits
- Maintain a “compaction watermark” (last compacted lamport)

### Undo/Redo (optional benefit)

Oplog enables reversible operations if you store inverse patches.

---

# 6) EXPORT / IMPORT FORMAT (MANDATORY)

## Requirements

- Single-file workspace export
- Human-transportable
- Versioned format
- Supports plaintext export (free) and optional encrypted export
- Import validation and preview

## Suggested file formats

- `.kantrack.json` (plaintext)
- `.kantrack.enc` (encrypted)
- For large data: consider `.kantrack.pack` (chunked objects)

### Export contents (logical)

- `formatVersion`
- `createdAt`
- `appVersion`
- `boards`, `columns`, `tasks`, `tags`, `notes`
- `oplog` (optional: can omit for smaller export; or include last N)
- `settings`
- `integrity`:
  - checksums per section

### Import rules

- Validate formatVersion
- Validate referential integrity (tasks reference columns/tags)
- Ask user: merge vs replace
- On replace, create a restore point snapshot first (small)

---

# 7) ENCRYPTION SPEC (VAULT + OPTIONAL ENCRYPTED EXPORT)

Use WebCrypto (no custom crypto).

## Cryptographic primitives (high level)

- KDF: PBKDF2 (WebCrypto-supported) with high iteration count
  - If using Argon2, requires WASM lib; acceptable later
- AEAD: AES-GCM
- Hash: SHA-256 for integrity checks
- Random: `crypto.getRandomValues`

## Key hierarchy (recommended)

- User passphrase -> KDF -> `KEK` (key encryption key)
- Generate random `DEK` (data encryption key)
- Wrap `DEK` with `KEK` (store wrapped DEK on server)

Server stores:

- wrapped DEK
- encrypted data blobs
- non-sensitive metadata needed for sync (minimal)

Client stores locally:

- cached decrypted data
- optionally wrapped DEK for “remember this device” (still encrypted)

### Recovery model

- If user forgets passphrase, data is unrecoverable (must be explicit)
- Optional recovery key can be added later:
  - generate random recovery secret; wrap DEK with it too

---

# 8) CLOUD VAULT ARCHITECTURE (ZERO-KNOWLEDGE)

## Server responsibilities (must never see plaintext)

- Auth + subscriptions
- Store encrypted objects/blobs
- Store wrapped DEK(s)
- Provide object listing + versioning
- Provide sync endpoints
- Rate limiting + abuse prevention
- Account/device registry (minimal)

## Client responsibilities

- Encrypt/decrypt all user content
- Maintain local cache in IndexedDB
- Maintain oplog and sync anchors
- Resolve conflicts locally

### Data storage model on server

Store encrypted “objects” (recommended):

- `objectId`
- `type` (board/task/note/blob/opbatch)
- `ciphertext`
- `nonce/iv`
- `aad` (optional, includes objectId/type/version)
- `createdAt`, `updatedAt`
- `version` (server monotonically increments per object or per write)

Avoid storing plaintext titles/names in metadata; keep inside ciphertext.

### Chunking

For large notes/boards:

- chunk into fixed-size encrypted blocks (e.g., 256KB–1MB)
- content-addressed IDs (hash of plaintext or ciphertext) optional
- enables partial sync and reduces rewrite costs

---

# 9) SYNC PROTOCOL (MVP -> FULL)

Start simple.

## Phase 5 MVP: “Encrypted Backup Sync” (single-user)

- Client periodically uploads encrypted snapshot blobs:
  - “latest snapshot” + optional last N snapshots
- Download restores entire workspace
- No real-time merge; user chooses “restore from cloud”

This proves:

- encryption works
- server never sees plaintext
- users get storage expansion

## Phase 6: Incremental sync (multi-device)

Move to oplog-based sync.

### Sync concepts

- Each device has `deviceId` + lamport counter
- Each device maintains `lastSyncedLamport` watermark per device OR global anchor

### Push

- Batch new oplog entries since last sync
- Encrypt batch (“opbatch”) and upload

### Pull

- Fetch new opbatches since last pull
- Decrypt and apply operations to local DB via reducers

### Conflict resolution

Prefer deterministic rules:

- Last-write-wins per field using (lamport, deviceId) ordering
  OR
- CRDT-like merges for specific fields (later)

For MVP incremental sync:

- LWW is acceptable if documented
- Task order conflicts handled by orderKey (fractional indexing)

### Integrity checks

- Each opbatch includes hash chain and batch checksum
- Client rejects corrupted batches

---

# 10) SECURITY / THREAT MODEL

## Primary threats

- Server breach (must yield ciphertext only)
- Network interception (TLS + ciphertext)
- Malicious insiders (zero-knowledge prevents plaintext access)
- Local device compromise (cannot prevent; document)
- XSS (critical): can exfiltrate plaintext from browser

## Required mitigations

- Strict CSP (no inline scripts; limit sources)
- Avoid `innerHTML` with user content; sanitize if rich text allowed
- Dependency auditing
- Subresource Integrity where possible
- Signed releases (later)
- Rate limiting and auth hardening on server

## Honest security promise

- “Local Mode: data never leaves your device.”
- “Vault Mode: end-to-end encrypted; we cannot read your data.”
- Never claim “completely secure.”

---

# 11) OBSERVABILITY (PRIVACY-RESPECTING)

Analytics must not capture user content.

Allowed:

- aggregate performance metrics
- feature usage counters (anonymous)
- error rates (stack traces must be scrubbed)
- opt-in telemetry toggle in settings

No:

- task titles
- notes
- identifiers that can be linked without consent

---

# 12) PHASED IMPLEMENTATION TASK LIST (WITH ACCEPTANCE CRITERIA)

## PHASE 0 — Stabilization

Tasks:

- Add storage estimate UI + thresholds
- Remove persistence of generated exports (PDF/ZIP/HTML)
- Cap history + compact mechanism
- Trash as references only
- Add “Archive completed tasks” feature
  Acceptance:
- Users cannot fill storage via exports/history runaway
- Large boards remain responsive

## PHASE 1 — Refactor for layers

Tasks:

- Replace inline handlers with action routing (data-action)
- Introduce store (dispatch/reducer/subscribe)
- Isolate persistence module behind repository API
  Acceptance:
- UI no longer mutates persistence directly
- Unit tests for reducers exist

## PHASE 2 — Oplog

Tasks:

- Define operation schema
- Record ops for each mutation
- Compaction job
  Acceptance:
- Rebuilding state from base snapshot + oplog works in tests

## PHASE 3 — Export/Import v1

Tasks:

- Versioned export JSON
- Import validation + preview
- Optional encrypted export (.enc)
  Acceptance:
- Export/import roundtrip preserves data

## PHASE 4 — Accounts (no content)

Tasks:

- Auth + subscription tracking
- Device registry
  Acceptance:
- Local mode still works without account

## PHASE 5 — Cloud Vault MVP (backup sync)

Tasks:

- Implement crypto key hierarchy
- Encrypt snapshot uploads
- Restore from cloud snapshot
  Acceptance:
- Server stores ciphertext only
- Same user can restore on a second device

## PHASE 6 — Incremental sync

Tasks:

- Encrypted opbatch push/pull
- LWW conflict resolution
- OrderKey conflict-safe ordering
  Acceptance:
- Two devices can concurrently edit and converge deterministically

## PHASE 7 — Scale & polish

Tasks:

- Security page + threat model disclosure
- Pen-test readiness, bug bounty prep
- Performance upgrades (virtualization)
  Acceptance:
- Production readiness for large user base

---

# OUTPUTS EXPECTED FROM AI AGENT

When implementing, produce:

1. Updated module boundaries (imports)
2. Storage schema migrations
3. Reducers + tests
4. Oplog implementation + compaction
5. Export/import implementation
6. Crypto module with clear API + tests
7. Server API spec for Vault (minimal)
8. Sync engine implementation

Always:

- keep changes incremental
- include tests for critical logic
- preserve backwards compatibility or provide migration steps

---

END OF TECHNICAL ARCHITECTURE PROMPT
