# KanTrack — Trust Model

> **Audience:** Engineers, security reviewers, and technically informed users.
> **Scope:** What KanTrack protects, what it does not protect, the boundaries of trust, and the mechanisms in place.

---

## 1. Fundamental Position

KanTrack is a **local-first application with no server component**. It is served as a static asset bundle (HTML + JS + CSS). It does not transmit user data to any external endpoint. It does not authenticate users. It does not operate a backend.

This means the trust surface is entirely local:

- The **browser** is trusted to faithfully execute the application.
- The **operating system** is trusted to protect the user's profile directory.
- **Other browser extensions** are partially trusted — see §5.

There is no KanTrack server that could be compromised to leak user data, because no such server exists and no user data ever reaches one.

---

## 2. Threat Model

### 2.1 In-Scope Threats (what KanTrack defends against)

| Threat                                     | Mechanism                                                                | Where |
| ------------------------------------------ | ------------------------------------------------------------------------ | ----- |
| Malicious HTML in imported data            | Allowlist sanitiser (`sanitize.js`)                                      | §3    |
| XSS via task content rendered to DOM       | `escapeHtml()` for all text fields; sanitise on import                   | §3    |
| Inline script injection                    | Content Security Policy blocks `unsafe-eval` and inline scripts          | §4    |
| External resource exfiltration             | CSP `connect-src 'self'` — no outbound fetch to third parties            | §4    |
| Tampering with import files                | `import-validator.js` checks schema, version, required fields            | §3.3  |
| Encrypted backup brute-force               | PBKDF2 with 100 000 iterations raises the cost per guess                 | §6    |
| Casual local eavesdropping (shared device) | Encrypted export option provides at-rest encryption for portable backups | §6    |

### 2.2 Out-of-Scope Threats (what KanTrack does NOT defend against)

| Threat                                          | Reason                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| OS-level access to browser profile              | Cannot be prevented by a web application                                 |
| Malicious or over-privileged browser extensions | Extensions with `storage` or `tabs` permissions can read any web storage |
| Compromised browser binary                      | If the runtime is hostile, no JavaScript application can be trusted      |
| Physical access to an unlocked device           | Outside the threat model of a client-side web app                        |
| Weak user-chosen passwords                      | PBKDF2 is rate-limited, but a weak passphrase is a weak key              |
| Side-channel attacks on AES-GCM                 | Relies on browser's WebCrypto implementation                             |
| Data loss from browser storage eviction         | Mitigated by `requestDurableStorage()` but not guaranteed                |

---

## 3. Input Handling

### 3.1 HTML Sanitiser (`sanitize.js`)

Any HTML that arrives from outside the application (imported `.kantrack.json` files, pasted notebook content, clipboard images) must pass through the allowlist sanitiser before it is assigned to `.innerHTML`.

The sanitiser is **not** a deny-list. It operates by:

1. Parsing the input with `DOMParser` (browser native; never executes scripts during parse).
2. Walking the resulting DOM tree bottom-up (leaf nodes first).
3. For every element:
   - If the tag is **not on the allowlist** → unwrap (preserve children, remove the element).
   - If the tag is on the allowlist → filter its attributes:
     - Strip any `on*` event handler attribute (regardless of case or prefix).
     - Strip any attribute not in the per-tag permitted list.
     - For `<a href>`: accept only `http://`, `https://`, and `#` (fragments). Strip everything else.
     - For `<img src>`: accept only `blob:` and `data:image/` schemes.

**Permitted tags (52):** `b i u em strong s sub sup br font p div span blockquote pre code h1 h2 h3 h4 h5 h6 ul ol li img figure figcaption a table thead tbody tr th td`

No `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<link>`, `<meta>`, `<svg>`, or similar executable/active elements are permitted.

### 3.2 Text Escaping (`utils.js:escapeHtml`)

Task titles, tag names, due dates, and any other plain-text fields that are interpolated into HTML templates use `escapeHtml()`:

```js
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

This prevents injected content from being interpreted as markup.

### 3.3 Import Validation (`import-validator.js`)

Before any imported file is applied, `validateImportFile(data)` checks:

- `formatVersion` is a recognised value.
- `tasks` is an array.
- Each task has required fields (`id`, `title`, `column`) with the correct types.
- `column` value is one of the four permitted columns (`todo`, `inProgress`, `onHold`, `done`).
- Unknown top-level keys are ignored (future-compatibility without error).

Files that fail validation are rejected with a user-visible error; no partial application occurs.

---

## 4. Content Security Policy

`index.html` carries a CSP `<meta>` tag:

```
default-src  'self'
script-src   'self'
style-src    'self' 'unsafe-inline'
img-src      'self' data: blob:
connect-src  'self'
object-src   'none'
base-uri     'self'
```

### What this enforces

| Directive                   | Effect                                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script-src 'self'`         | Only scripts from the same origin may execute. Inline `<script>` tags and `javascript:` URIs are blocked.                                                                  |
| `connect-src 'self'`        | `fetch()`, `XMLHttpRequest`, WebSocket, and EventSource connections are restricted to the same origin. No data can be exfiltrated to a remote server via JS network calls. |
| `object-src 'none'`         | `<object>`, `<embed>`, and `<applet>` are blocked entirely.                                                                                                                |
| `base-uri 'self'`           | `<base href>` injection is blocked.                                                                                                                                        |
| `img-src data: blob:`       | Permits task and notebook images stored as data URLs or Blob object URLs.                                                                                                  |
| `style-src 'unsafe-inline'` | Inline styles are permitted (required for dynamic card colours and per-tag styling). This is a conscious trade-off.                                                        |

### What CSP does not cover

- CSP does not protect against injections that execute within a permitted inline style (e.g., CSS expression injection is a historical IE-only issue and does not apply to modern browsers).
- CSP does not protect against malicious `file://` origins or localhost bypasses if the app is served under non-standard conditions.
- `'unsafe-inline'` for styles means a malicious script that CAN execute (e.g., via an extension bypass) could inject `<style>` to exfiltrate data via CSS timing attacks — this risk is accepted as extremely low given the no-inline-script restriction.

---

## 5. Browser Storage Trust

### 5.1 What is stored and where

| Data                     | Storage           | Format           | Accessible to                     |
| ------------------------ | ----------------- | ---------------- | --------------------------------- |
| Tasks, tags, clocks      | `localStorage`    | JSON (plain)     | Any JS on the same origin         |
| Tasks, tags, clocks      | IndexedDB         | JSON (plain)     | Any JS on the same origin         |
| Images (task + notebook) | IndexedDB         | Base64 data URL  | Any JS on the same origin         |
| Undo oplog               | IndexedDB         | JSON (plain)     | Any JS on the same origin         |
| Encrypted export file    | User's filesystem | Binary (AES-GCM) | Whoever has the file + passphrase |

### 5.2 Browser origin isolation

Web storage is scoped to the origin (`scheme + host + port`). Data stored by KanTrack is accessible only to JavaScript running at the same origin. Other origins (tabs, iframes) cannot read it.

### 5.3 Browser extension risk

Extensions with the `storage`, `tabs`, or `<all_urls>` host permissions granted by the user can access `localStorage` and IndexedDB of any tab they cover. This is a browser-level trust decision, not something KanTrack can prevent.

**Mitigation available to users:** Use an encrypted export when moving data between devices or creating off-device backups. Do not grant broad permissions to extensions.

### 5.4 Developer Tools

Any logged-in OS user can open DevTools and read `localStorage` or IDB directly. This is intentional browser design. KanTrack does not attempt to obstruct DevTools access.

---

## 6. Encryption

### 6.1 Algorithm

```
Key derivation : PBKDF2
  - Hash    : SHA-256
  - Salt    : 16 bytes (random, generated with crypto.getRandomValues)
  - Rounds  : 100 000 iterations

Encryption : AES-256-GCM
  - Key length : 256 bits
  - IV         : 12 bytes (random, generated per encryption)
  - Auth tag   : 128 bits (16 bytes, appended by WebCrypto automatically)

Binary envelope:
  ┌─────────────────────┬──────────────────┬──────────────────────┐
  │  salt (16 bytes)    │   IV (12 bytes)  │  ciphertext + tag    │
  └─────────────────────┴──────────────────┴──────────────────────┘
```

Implemented via the browser's native `window.crypto.subtle` (WebCrypto API). No third-party cryptography libraries are used.

### 6.2 What encrypted exports protect

An encrypted `.kantrack.enc` file is unreadable without the correct passphrase. AES-GCM provides both confidentiality and integrity: the auth tag will fail verification if the file has been tampered with, producing a decryption error rather than silently returning corrupt data.

### 6.3 What encrypted exports do NOT protect

- **Passphrase strength is the user's responsibility.** A short or guessable passphrase produces a weak key regardless of the algorithm used. PBKDF2 with 100k rounds raises the cost of brute-force attacks but does not eliminate them for weak passwords.
- **The encryption does not protect data while it remains in `localStorage` or IDB** (the live app state is always plaintext).
- **The encrypted file format is authenticated but not deniable** — an attacker who recovers the file and the passphrase gets the full plaintext.
- **Key material is never cached.** The derived key exists only for the duration of the encrypt/decrypt call and is not stored anywhere.

### 6.4 No keys stored

KanTrack never writes a derived key, a passphrase, or any key material to any storage. The user must remember their passphrase. There is no recovery mechanism.

---

## 7. Third-Party Code

KanTrack's runtime bundle includes two third-party libraries:

| Library | Version | Purpose        | Security surface                                                            |
| ------- | ------- | -------------- | --------------------------------------------------------------------------- |
| `jsPDF` | 4.2.0   | PDF generation | Processes task note HTML; output is a PDF file, not DOM                     |
| `JSZip` | 3.10.1  | ZIP creation   | Compresses notebook files for ZIP export; no parsing of untrusted ZIP input |

Neither library has network access (blocked by CSP). Neither library handles user-supplied input in a way that creates an execution surface — jsPDF renders sanitised HTML to a canvas and then PDF bytes; JSZip only creates archives, never reads and executes ZIP archives from users.

No analytics, telemetry, CDN-hosted scripts, or tracking pixels are included.

---

## 8. Trust Boundaries

```
┌────────────────────────────────────────────────────────────────┐
│  TRUSTED ZONE (same origin, same browser session)              │
│                                                                │
│   KanTrack JS  ──reads/writes──►  localStorage / IDB          │
│                                                                │
│   CSP prevents external connections                            │
│   Input sanitiser prevents XSS from imported data             │
│   escapeHtml() prevents XSS from task content templates        │
│                                                                │
└──────────────────────────────────┬─────────────────────────────┘
                                   │
                         TRUST BOUNDARY
                                   │
┌──────────────────────────────────▼─────────────────────────────┐
│  PARTIALLY TRUSTED (browser + OS layer)                        │
│                                                                │
│   Browser extensions with broad permissions                    │
│   OS-level user with profile directory access                  │
│   DevTools (logged-in user)                                    │
│   Browser itself (executes KanTrack code faithfully)           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
                                   │
                         TRUST BOUNDARY
                                   │
┌──────────────────────────────────▼─────────────────────────────┐
│  UNTRUSTED (KanTrack provides no protection here)              │
│                                                                │
│   Other origins in the browser                                 │
│   External servers                                             │
│   Other OS users                                               │
│   Physical attackers with device access                        │
│   Actors who possess an unencrypted export file                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 9. Storage Durability

### 9.1 Persistent Storage Request

At boot, KanTrack calls `navigator.storage.persist()` to request that the browser designate its storage as persistent. Persistent storage is not evicted under low-disk conditions (unlike best-effort storage, which the browser may clear without warning).

The browser may grant or deny this request based on its own heuristics (installed PWA, user engagement score, origin policy). KanTrack uses the result only to display an advisory status indicator — it does not alter behaviour based on the outcome.

### 9.2 Dual-Write Redundancy

Writes go to both `localStorage` and IndexedDB. If one becomes unavailable or corrupted, the other serves as a recovery path on next boot. This is not a full backup strategy; it is a redundancy measure against partial storage failures.

### 9.3 Recommended Practice for Users

For durable, portable backups:

- **Encrypted export** (`.kantrack.enc`) — strongest protection, requires passphrase
- **Full JSON export** (`.kantrack.json`) — plaintext, keep in a secure location
- **Do not rely solely on browser storage** for data you cannot afford to lose

---

## 10. Summary Table

| Property                                  | Value                                             |
| ----------------------------------------- | ------------------------------------------------- |
| Data transmitted to KanTrack servers      | **None** (no server exists)                       |
| External network access                   | **None** (CSP blocks it)                          |
| XSS protection for imported HTML          | **Allowlist sanitiser**                           |
| XSS protection for task text in templates | **`escapeHtml()` escaping**                       |
| Inline script execution                   | **Blocked by CSP**                                |
| Encryption algorithm                      | **AES-256-GCM + PBKDF2 (100k rounds, SHA-256)**   |
| Key storage                               | **None — derived per-operation, discarded after** |
| Plaintext storage by default              | **Yes** (`localStorage` + IDB)                    |
| Protection against OS-level access        | **None**                                          |
| Protection against browser extensions     | **None**                                          |
| Third-party analytics / telemetry         | **None**                                          |
| Dependency count (runtime)                | **2** (`jsPDF`, `JSZip`)                          |
