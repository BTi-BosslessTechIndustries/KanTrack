/***********************
 * I18N - UI translation
 ***********************/
import enGB from '../i18n/en-GB.json' with { type: 'json' };
import es from '../i18n/es.json' with { type: 'json' };
import fr from '../i18n/fr.json' with { type: 'json' };
import ptPT from '../i18n/pt-PT.json' with { type: 'json' };
import deDE from '../i18n/de-DE.json' with { type: 'json' };

const DICTIONARIES = {
  'en-GB': enGB,
  es,
  fr,
  'pt-PT': ptPT,
  'de-DE': deDE,
};

/**
 * Maps a `cardLanguage` setting value (including 'system') to a dictionary
 * code. 'system' always resolves to English (UK).
 */
const LANGUAGE_MAP = {
  system: 'en-GB',
  'en-GB': 'en-GB',
  es: 'es',
  fr: 'fr',
  'pt-PT': 'pt-PT',
  'de-DE': 'de-DE',
};

let activeCode = 'en-GB';

/**
 * Replace `{key}` placeholders in `str` with values from `params`.
 * @param {string} str
 * @param {Object<string,string>} [params]
 * @returns {string}
 */
export function interpolate(str, params) {
  if (!params) return str;
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.split(`{${key}}`).join(value),
    str
  );
}

/**
 * Returns the currently active dictionary code ('en-GB' | 'es' | 'fr' | 'pt-PT' | 'de-DE').
 */
export function getLanguage() {
  return activeCode;
}

/**
 * Look up `key` in the active dictionary, falling back to English (UK), then
 * to the key itself if missing everywhere. Interpolates `params` if given.
 * @param {string} key
 * @param {Object<string,string>} [params]
 * @returns {string}
 */
export function t(key, params) {
  const dict = DICTIONARIES[activeCode] || DICTIONARIES['en-GB'];
  const raw = dict[key] ?? DICTIONARIES['en-GB'][key] ?? key;
  return interpolate(raw, params);
}

/**
 * Set the active UI language, update <html lang>, and re-translate the
 * current document. 'system' resolves to English (UK).
 * @param {string} code - One of 'system', 'en-GB', 'es', 'fr', 'pt-PT', 'de-DE'
 * @returns {string} the resolved dictionary code
 */
export function setLanguage(code) {
  activeCode = LANGUAGE_MAP[code] || 'en-GB';
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = activeCode;
  }
  applyTranslations(document);
  return activeCode;
}

/**
 * Walk `root` for elements tagged with data-i18n / data-i18n-attr and apply
 * the active dictionary's strings to their textContent / attributes.
 * Safe to call with the whole document or a single modal root.
 * @param {Document|Element} root
 */
export function applyTranslations(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;

  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });

  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    el.getAttribute('data-i18n-attr')
      .split('|')
      .forEach(pair => {
        const [attr, key] = pair.split(':');
        el.setAttribute(attr, t(key));
      });
  });
}
