# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in KanTrack, please report it responsibly.

**Do not open a public issue.**

Send details to: email TBD

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

## Scope

Security reports are especially relevant for:

- Local data storage mechanisms (IndexedDB, localStorage)
- Data export/import functionality
- XSS and injection vulnerabilities in the HTML renderer
- Any future network communication when cloud mode is enabled

---

## Supported Versions

Security fixes will be applied to the latest version.

Users are encouraged to keep their copy up to date.

---

## Architecture Note

KanTrack currently runs as a fully static site (Cloudflare Pages, free tier). There is no backend, no server-side code, and no network requests. All data is stored locally in the user's browser. This significantly limits the attack surface compared to server-connected applications.

---

Thank you for helping keep KanTrack secure.
