/**
 * Tests for images.js: updateClearNotesButton, preview click-to-edit,
 * and format button (Bold / Italic / Strikethrough) handlers.
 *
 * setup.js overwrites global.document with a minimal stub. We spin up a real
 * JSDOM instance (same pattern as focus-trap.test.js) and stub the globals so
 * the production code and helpers can use real DOM APIs.
 */
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

vi.mock('../scripts/kantrack-modules/state.js', () => ({
  setModalHasChanges: vi.fn(),
}));

vi.mock('../scripts/kantrack-modules/mentions.js', () => ({
  initMentionHandler: vi.fn(),
}));

vi.mock('../scripts/kantrack-modules/utils.js', () => ({
  plainTextToFragment: vi.fn(),
}));

import { setupClipboardPaste, updateClearNotesButton } from '../scripts/kantrack-modules/images.js';

// ── JSDOM setup ───────────────────────────────────────────────────────────────
// setup.js overwrites global.document with a stub. Replace it with a real JSDOM
// document for this file so DOM elements have style, dispatchEvent, etc.

let jsdomWindow;

beforeAll(() => {
  const { window } = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  jsdomWindow = window;
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('MouseEvent', window.MouseEvent);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ── DOM helpers ───────────────────────────────────────────────────────────────

function buildDOM() {
  const editor = document.createElement('div');
  editor.id = 'modalNotesEditor';
  editor.contentEditable = 'true';

  const preview = document.createElement('div');
  preview.id = 'notesPreview';
  preview.style.display = 'none';

  const clearBtn = document.createElement('button');
  clearBtn.id = 'clearNotesBtn';
  clearBtn.style.display = 'none';

  const formatBtns = document.createElement('div');
  formatBtns.id = 'notesFormatBtns';
  formatBtns.style.display = 'none';

  const boldBtn = document.createElement('button');
  boldBtn.id = 'boldBtn';
  boldBtn.type = 'button';

  const italicBtn = document.createElement('button');
  italicBtn.id = 'italicBtn';
  italicBtn.type = 'button';

  const strikeBtn = document.createElement('button');
  strikeBtn.id = 'strikeBtn';
  strikeBtn.type = 'button';

  document.body.append(editor, preview, clearBtn, formatBtns, boldBtn, italicBtn, strikeBtn);
  return { editor, preview, clearBtn, formatBtns, boldBtn, italicBtn, strikeBtn };
}

function tearDownDOM(els) {
  Object.values(els).forEach(el => el.remove());
}

// ── updateClearNotesButton ────────────────────────────────────────────────────

describe('updateClearNotesButton', () => {
  let els;

  beforeEach(() => {
    els = buildDOM();
  });
  afterEach(() => tearDownDOM(els));

  it('hides Clear All and format buttons when editor is empty', () => {
    els.editor.innerHTML = '';
    updateClearNotesButton();
    expect(els.clearBtn.style.display).toBe('none');
    expect(els.formatBtns.style.display).toBe('none');
  });

  it('shows Clear All and format buttons when editor has text', () => {
    els.editor.textContent = 'some notes';
    updateClearNotesButton();
    expect(els.clearBtn.style.display).toBe('inline-block');
    expect(els.formatBtns.style.display).toBe('flex');
  });

  it('shows Clear All and format buttons when editor contains only an image', () => {
    const img = document.createElement('img');
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    els.editor.innerHTML = '';
    els.editor.appendChild(img);
    updateClearNotesButton();
    expect(els.clearBtn.style.display).toBe('inline-block');
    expect(els.formatBtns.style.display).toBe('flex');
  });

  it('hides both again after editor is cleared back to empty', () => {
    els.editor.textContent = 'text';
    updateClearNotesButton();
    els.editor.textContent = '';
    updateClearNotesButton();
    expect(els.clearBtn.style.display).toBe('none');
    expect(els.formatBtns.style.display).toBe('none');
  });

  it('does not throw when notesFormatBtns element is absent', () => {
    els.formatBtns.remove();
    els.editor.textContent = 'text';
    expect(() => updateClearNotesButton()).not.toThrow();
    expect(els.clearBtn.style.display).toBe('inline-block');
  });
});

// ── Preview click → edit mode ─────────────────────────────────────────────────

describe('setupClipboardPaste: preview click switches to edit mode', () => {
  let els;

  beforeEach(() => {
    els = buildDOM();
    els.editor.style.display = 'none';
    els.preview.style.display = 'block';
    setupClipboardPaste();
  });
  afterEach(() => tearDownDOM(els));

  it('hides the preview when clicked', () => {
    els.preview.click();
    expect(els.preview.style.display).toBe('none');
  });

  it('makes the editor visible when preview is clicked', () => {
    els.preview.click();
    expect(els.editor.style.display).toBe('');
  });
});

// ── Format buttons ────────────────────────────────────────────────────────────

describe('setupClipboardPaste: format buttons', () => {
  let els;
  let execSpy;

  beforeEach(() => {
    els = buildDOM();
    setupClipboardPaste();
    // jsdom does not define execCommand: install it so vi.spyOn can wrap it
    if (!document.execCommand) {
      document.execCommand = () => false;
    }
    execSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true);
  });
  afterEach(() => {
    execSpy?.mockRestore();
    tearDownDOM(els);
  });

  it('bold button calls execCommand("bold")', () => {
    els.boldBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(execSpy).toHaveBeenCalledWith('bold');
  });

  it('bold button prevents default to keep editor selection', () => {
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    els.boldBtn.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('italic button calls execCommand("italic")', () => {
    els.italicBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(execSpy).toHaveBeenCalledWith('italic');
  });

  it('italic button prevents default to keep editor selection', () => {
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    els.italicBtn.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('strikethrough button calls execCommand("strikeThrough")', () => {
    els.strikeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(execSpy).toHaveBeenCalledWith('strikeThrough');
  });

  it('strikethrough button prevents default to keep editor selection', () => {
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    els.strikeBtn.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
