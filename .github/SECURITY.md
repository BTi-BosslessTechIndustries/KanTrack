# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in KanTrack, please report it responsibly.

**Do not open a public issue.**

Send details to: general@bosslesstechindustries.com

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested mitigation (if known)

---

## Responsible Disclosure

Please allow time to investigate and address the issue before public disclosure.

KanTrack is a privacy-first project, and security issues are treated with high priority.

---

## Threat Model

KanTrack is a local-first, privacy-focused Kanban application. All data stays on your device. This section is honest about what KanTrack protects against and what it does not.

### What Data Is Stored and Where

| Data                                           | Storage                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| Tasks (titles, notes, tags, priority, history) | `localStorage` + IndexedDB (`KanbanDB`)                                              |
| Notebook pages (HTML content, images)          | IndexedDB (`KanbanDB`)                                                               |
| UI preferences (sidebar width, etc.)           | `localStorage`                                                                       |
| Encryption keys                                | **Never stored** — derived per-session from your password using PBKDF2 + AES-256-GCM |

All storage is local to your browser. Nothing is sent to any server.

### What KanTrack Protects Against

**Cross-site scripting (XSS) via imported data:**
Notes and notebook pages store rich HTML. Before rendering any stored HTML back to the page, KanTrack passes it through an allowlist-based sanitizer that:

- Strips all event-handler attributes (`onclick`, `onerror`, `onload`, etc.)
- Removes tags not on the allowlist (keeping their text content)
- Validates `<a href>` to allow only `http://`, `https://`, and `#` anchors
- Validates `<img src>` to allow only `blob:` and `data:image/` URLs

**Inline script injection:**
A strict Content Security Policy (`script-src 'self'`) prevents inline `<script>` tags and `javascript:` URL navigation from executing.

**Malicious export file injection:**
The sanitizer runs on content loaded from imported workspace files, not just locally authored content. A crafted `.kantrack.json` with embedded XSS payloads in note HTML will have those payloads stripped before display.

### What KanTrack Does Not Protect Against

**Device compromise:**
If your device is physically compromised or infected with malware, your data in `localStorage` and IndexedDB is accessible. KanTrack cannot protect data against OS-level access.

**Browser extension access:**
Browser extensions with `<all_urls>` permissions can read page content and storage. Use a browser profile with minimal extensions for sensitive data.

**Unencrypted export files:**
Standard `.kantrack.json` exports are plain JSON. Anyone with access to the file can read your tasks and notes. Use the encrypted export option for sensitive data.

**Encrypted export password strength:**
The encrypted export uses PBKDF2 (100,000 iterations, SHA-256) + AES-256-GCM. The encryption is only as strong as your password. A weak or guessable password significantly reduces security.

**HTTP (non-HTTPS) serving:**
The CSP is enforced by the browser regardless, but for anything beyond `localhost`, serve over HTTPS to prevent in-transit interception.

**Local device access:**
KanTrack does not encrypt data at rest in localStorage or IndexedDB. Anyone with access to your logged-in user account can read your KanTrack data via browser DevTools.

We cannot protect your data if your device is compromised. That is an honest limitation we cannot engineer away.

---

## Scope

Security reports are especially relevant for:

- Local data storage mechanisms (IndexedDB, localStorage)
- Data export/import functionality
- XSS and injection vulnerabilities in the HTML renderer
- The allowlist sanitizer or CSP configuration
- Any future network communication when cloud mode is enabled

---

## Supported Versions

Security fixes will be applied to the latest version.

Users are encouraged to keep their copy up to date.

---

## Architecture Note

KanTrack runs as a fully static site (Cloudflare Pages, free tier). There is no backend, no server-side code, and no network requests. All data is stored locally in the user's browser. This significantly limits the attack surface compared to server-connected applications.

Defense-in-depth layers currently in place:

1. An allowlist-based HTML sanitizer applied to all stored rich-text content before DOM insertion
2. A Content Security Policy (`script-src 'self'`) blocking inline script execution
3. Optional AES-256-GCM encryption for exported workspace files

---

Thank you for helping keep KanTrack secure.
