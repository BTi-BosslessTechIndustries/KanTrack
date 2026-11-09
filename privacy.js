import { setLanguage, applyTranslations } from './scripts/kantrack-modules/i18n.js';

document.getElementById('year').textContent = new Date().getFullYear();

// Read the persisted card-content language preference (set in the main
// app's "More Options" > Language picker). Stored as a JSON string via
// safeSetItem, so it needs JSON.parse. Defaults to 'system' if missing,
// invalid, or if localStorage is unavailable (e.g. file:// restrictions).
let savedLanguage = 'system';
try {
  const raw = localStorage.getItem('cardLanguage');
  if (raw !== null) {
    savedLanguage = JSON.parse(raw);
  }
} catch {
  savedLanguage = 'system';
}

setLanguage(savedLanguage);
applyTranslations(document);
