/**
 * Tests for i18n.js: t(), interpolate(), setLanguage(), applyTranslations().
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  t,
  interpolate,
  getLanguage,
  setLanguage,
  applyTranslations,
} from '../scripts/kantrack-modules/i18n.js';
import enGB from '../scripts/i18n/en-GB.json' with { type: 'json' };
import esDict from '../scripts/i18n/es.json' with { type: 'json' };
import frDict from '../scripts/i18n/fr.json' with { type: 'json' };
import ptPTDict from '../scripts/i18n/pt-PT.json' with { type: 'json' };
import deDE from '../scripts/i18n/de-DE.json' with { type: 'json' };

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

beforeEach(() => {
  global.document = {
    documentElement: { lang: '' },
    querySelectorAll: vi.fn(() => []),
    hasAttribute: () => false,
  };
  setLanguage('en-GB');
});

describe('interpolate', () => {
  it('replaces {placeholder} tokens with values from params', () => {
    expect(interpolate('Undone: {description}', { description: 'Delete card' })).toBe(
      'Undone: Delete card'
    );
  });

  it('leaves the string unchanged when params is undefined', () => {
    expect(interpolate('Plain string', undefined)).toBe('Plain string');
  });

  it('replaces multiple distinct placeholders', () => {
    expect(interpolate('{a} and {b}', { a: 'x', b: 'y' })).toBe('x and y');
  });
});

describe('t', () => {
  it('returns the English (UK) string for a known key', () => {
    setLanguage('en-GB');
    expect(t('column.todo')).toBe('To Do');
  });

  it('returns the Spanish string when the active language is es', () => {
    setLanguage('es');
    expect(t('column.todo')).toBe('Por hacer');
  });

  it('returns the French string when the active language is fr', () => {
    setLanguage('fr');
    expect(t('column.inProgress')).toBe('En cours');
  });

  it('returns the Portuguese (PT) string when the active language is pt-PT', () => {
    setLanguage('pt-PT');
    expect(t('column.done')).toBe('Concluído');
  });

  it('returns the German string when the active language is de-DE', () => {
    setLanguage('de-DE');
    expect(t('column.todo')).toBe('Zu erledigen');
  });

  it('falls back to the key itself when the key exists in no dictionary', () => {
    setLanguage('es');
    expect(t('not.a.real.key')).toBe('not.a.real.key');
  });

  it('interpolates params into the resolved string', () => {
    setLanguage('en-GB');
    expect(t('header.toggleNotebook')).toBe('Toggle Notebook (Ctrl+B)');
  });
});

describe('setLanguage', () => {
  it('maps "system" to the en-GB dictionary and document language', () => {
    setLanguage('system');
    expect(getLanguage()).toBe('en-GB');
    expect(document.documentElement.lang).toBe('en-GB');
  });

  it('sets document.documentElement.lang to the chosen language', () => {
    setLanguage('fr');
    expect(getLanguage()).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('sets document.documentElement.lang to de-DE when chosen', () => {
    setLanguage('de-DE');
    expect(getLanguage()).toBe('de-DE');
    expect(document.documentElement.lang).toBe('de-DE');
  });

  it('falls back to en-GB for an unrecognized code', () => {
    setLanguage('xx-not-real');
    expect(getLanguage()).toBe('en-GB');
  });
});

describe('applyTranslations', () => {
  it('sets textContent on elements with data-i18n and attributes on elements with data-i18n-attr', () => {
    const textEl = {
      getAttribute: vi.fn(name => (name === 'data-i18n' ? 'column.todo' : null)),
      textContent: 'placeholder',
      hasAttribute: name => name === 'data-i18n',
    };
    const attrEl = {
      getAttribute: vi.fn(name =>
        name === 'data-i18n-attr' ? 'title:header.undo|aria-label:header.undo' : null
      ),
      setAttribute: vi.fn(),
      hasAttribute: name => name === 'data-i18n-attr',
    };

    global.document.querySelectorAll = vi.fn(selector => {
      if (selector === '[data-i18n]') return [textEl];
      if (selector === '[data-i18n-attr]') return [attrEl];
      return [];
    });

    setLanguage('en-GB');
    applyTranslations(document);

    expect(textEl.textContent).toBe('To Do');
    expect(attrEl.setAttribute).toHaveBeenCalledWith('title', 'Undo (Ctrl+Z)');
    expect(attrEl.setAttribute).toHaveBeenCalledWith('aria-label', 'Undo (Ctrl+Z)');
  });

  it('translates into the active language after a language switch', () => {
    const textEl = {
      getAttribute: vi.fn(name => (name === 'data-i18n' ? 'column.done' : null)),
      textContent: 'placeholder',
      hasAttribute: name => name === 'data-i18n',
    };
    global.document.querySelectorAll = vi.fn(selector =>
      selector === '[data-i18n]' ? [textEl] : []
    );

    setLanguage('pt-PT');
    applyTranslations(document);

    expect(textEl.textContent).toBe('Concluído');
  });
});

describe('dictionary completeness', () => {
  const dictionaries = { es: esDict, fr: frDict, 'pt-PT': ptPTDict, 'de-DE': deDE };
  const baseKeys = Object.keys(enGB).sort();

  it('en-GB has no duplicate-looking empty values', () => {
    Object.values(enGB).forEach(value => {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    });
  });

  Object.entries(dictionaries).forEach(([code, dict]) => {
    it(`${code} defines exactly the same keys as en-GB`, () => {
      expect(Object.keys(dict).sort()).toEqual(baseKeys);
    });

    it(`${code} has no empty translations`, () => {
      Object.values(dict).forEach(value => {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });
});

describe('translation key usage', () => {
  // Matches dotted lookup keys such as "column.todo" or "dueDate.relative.inDays"
  // - the shape every i18n key in this project follows.
  const KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/;

  function dottedKeysIn(content) {
    const found = new Set();
    for (const m of content.matchAll(/['"]([a-zA-Z0-9_.]+)['"]/g)) {
      if (KEY_PATTERN.test(m[1])) found.add(m[1]);
    }
    return found;
  }

  it('every dotted-key string literal in scripts/ resolves to an en-GB dictionary entry', () => {
    const modulesDir = path.join(PROJECT_ROOT, 'scripts', 'kantrack-modules');
    const files = fs
      .readdirSync(modulesDir)
      .filter(f => f.endsWith('.js') && f !== 'i18n.js')
      .map(f => path.join(modulesDir, f));
    files.push(path.join(PROJECT_ROOT, 'scripts', 'kantrack.js'));

    const missing = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const key of dottedKeysIn(content)) {
        if (!(key in enGB)) missing.push(`${path.basename(file)}: "${key}"`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every data-i18n / data-i18n-attr key in index.html and privacy.html resolves to an en-GB dictionary entry', () => {
    const missing = [];
    for (const fileName of ['index.html', 'privacy.html']) {
      const content = fs.readFileSync(path.join(PROJECT_ROOT, fileName), 'utf8');

      for (const m of content.matchAll(/data-i18n="([a-zA-Z0-9_.]+)"/g)) {
        if (!(m[1] in enGB)) missing.push(`${fileName}: data-i18n="${m[1]}"`);
      }

      for (const m of content.matchAll(/data-i18n-attr="([^"]+)"/g)) {
        for (const pair of m[1].split('|')) {
          const key = pair.split(':')[1];
          if (!(key in enGB)) missing.push(`${fileName}: data-i18n-attr key "${key}"`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
