/**
 * @vitest-environment jsdom
 *
 * Tests for the paste handler routing in images.js.
 * Runs in a real JSDOM environment so window.getSelection() and
 * document.createRange() work without manual stubs.
 *
 * Focuses on the priority ordering introduced to fix Numbers (and other
 * spreadsheet apps) placing both an image preview and TSV/HTML data on the
 * clipboard:
 *   1. Table (HTML <table> or TSV) wins unconditionally
 *   2. Image paste only happens when there is no table data
 *   3. Plain text fallback when there is neither table nor image
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../scripts/kantrack-modules/state.js', () => ({
  setModalHasChanges: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/mentions.js', () => ({
  initMentionHandler: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/utils.js', () => ({
  plainTextToFragment: vi.fn(() => document.createDocumentFragment()),
}));

import { setModalHasChanges } from '../scripts/kantrack-modules/state.js';
import { plainTextToFragment } from '../scripts/kantrack-modules/utils.js';
import { setupClipboardPaste } from '../scripts/kantrack-modules/images.js';

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

  const formatBtns = document.createElement('div');
  formatBtns.id = 'notesFormatBtns';

  const boldBtn = document.createElement('button');
  boldBtn.id = 'boldBtn';
  const italicBtn = document.createElement('button');
  italicBtn.id = 'italicBtn';
  const strikeBtn = document.createElement('button');
  strikeBtn.id = 'strikeBtn';

  // Needed by updateTableToolbar (called from updateClearNotesButton)
  const toolbar = document.createElement('div');
  toolbar.className = 'notes-toolbar-right';
  const createTableBtn = document.createElement('button');
  createTableBtn.id = 'createTableBtn';
  toolbar.appendChild(createTableBtn);

  document.body.append(
    editor,
    preview,
    clearBtn,
    formatBtns,
    boldBtn,
    italicBtn,
    strikeBtn,
    toolbar
  );
  return { editor, preview, clearBtn, formatBtns, boldBtn, italicBtn, strikeBtn, toolbar };
}

function tearDownDOM(els) {
  Object.values(els).forEach(el => el?.remove?.());
}

/**
 * Build a paste ClipboardEvent with controlled clipboard data.
 * @param {object} opts
 * @param {string}  opts.html       - text/html clipboard content
 * @param {string}  opts.text       - text/plain clipboard content
 * @param {string|null} opts.imageType - MIME type for a fake image item (e.g. 'image/tiff')
 */
function makePasteEvent({ html = '', text = '', imageType = null } = {}) {
  const items = imageType
    ? [{ type: imageType, getAsFile: () => new Blob(['x'], { type: imageType }) }]
    : [];

  const e = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', {
    value: {
      getData: type => {
        if (type === 'text/html') return html;
        if (type === 'text/plain') return text;
        return '';
      },
      items,
    },
  });
  return e;
}

// ── paste handler routing ─────────────────────────────────────────────────────

describe('paste handler routing', () => {
  let els;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any stale selection left by a previous test before building fresh DOM.
    // Without this, a range added by test N (e.g. cursor placed after a table)
    // persists into test N+1 and causes insertNode() to target detached nodes.
    window.getSelection().removeAllRanges();
    els = buildDOM();
    setupClipboardPaste();
  });

  afterEach(() => {
    tearDownDOM(els);
  });

  // ── always prevent default ──────────────────────────────────────────────────

  it('prevents the default paste action in all cases', () => {
    const e = makePasteEvent({ text: 'hello' });
    els.editor.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  // ── HTML table path ─────────────────────────────────────────────────────────

  it('inserts a <table> when HTML clipboard contains one', () => {
    const html =
      '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>';
    els.editor.dispatchEvent(makePasteEvent({ html }));
    expect(els.editor.querySelector('table')).not.toBeNull();
    expect(els.editor.querySelector('img')).toBeNull();
  });

  it('strips inline styles from HTML tables on paste', () => {
    const html =
      '<table style="color:red"><tbody><tr><td class="x" style="font-weight:bold">A</td></tr></tbody></table>';
    els.editor.dispatchEvent(makePasteEvent({ html }));
    const td = els.editor.querySelector('td');
    expect(td.getAttribute('style')).toBeNull();
    expect(td.getAttribute('class')).toBeNull();
  });

  it('wraps the inserted table with a paragraph after it so typing can continue', () => {
    const html = '<table><tbody><tr><td>X</td></tr></tbody></table>';
    els.editor.dispatchEvent(makePasteEvent({ html }));
    const children = Array.from(els.editor.childNodes);
    const ti = children.findIndex(n => n.nodeName === 'TABLE');
    expect(ti).toBeGreaterThanOrEqual(0);
    expect(children[ti + 1]?.nodeName).toBe('P');
  });

  it('adds a paragraph before the table when it lands as the first child', () => {
    els.editor.innerHTML = '';
    const html = '<table><tbody><tr><td>X</td></tr></tbody></table>';
    els.editor.dispatchEvent(makePasteEvent({ html }));
    expect(els.editor.firstChild?.nodeName).toBe('P');
  });

  it('marks the modal as changed after an HTML table paste', () => {
    const html = '<table><tbody><tr><td>A</td></tr></tbody></table>';
    els.editor.dispatchEvent(makePasteEvent({ html }));
    expect(setModalHasChanges).toHaveBeenCalledWith(true);
  });

  // ── TSV path (Numbers, Excel without rich HTML, etc.) ──────────────────────

  it('inserts a table from TSV plain text when HTML has no table', () => {
    els.editor.dispatchEvent(makePasteEvent({ text: 'Col1\tCol2\nVal1\tVal2' }));
    const table = els.editor.querySelector('table');
    expect(table).not.toBeNull();
    expect(table.querySelectorAll('th').length).toBe(2);
    expect(table.querySelectorAll('td').length).toBe(2);
  });

  it('marks the modal as changed after a TSV paste', () => {
    els.editor.dispatchEvent(makePasteEvent({ text: 'A\tB\nC\tD' }));
    expect(setModalHasChanges).toHaveBeenCalledWith(true);
  });

  it('does not call plainTextToFragment when a table was pasted from TSV', () => {
    els.editor.dispatchEvent(makePasteEvent({ text: 'A\tB\n1\t2' }));
    expect(plainTextToFragment).not.toHaveBeenCalled();
  });

  // ── table wins over image (the Numbers-style bug fix) ──────────────────────

  it('table wins over image when clipboard has TSV + image/tiff (Numbers)', () => {
    els.editor.dispatchEvent(
      makePasteEvent({
        text: 'Name\tScore\nAlice\t100',
        imageType: 'image/tiff',
      })
    );
    expect(els.editor.querySelector('table')).not.toBeNull();
    expect(els.editor.querySelector('img')).toBeNull();
  });

  it('table wins over image when clipboard has HTML table + image/png', () => {
    const html = '<table><tbody><tr><td>Cell</td></tr></tbody></table>';
    els.editor.dispatchEvent(makePasteEvent({ html, imageType: 'image/png' }));
    expect(els.editor.querySelector('table')).not.toBeNull();
    expect(els.editor.querySelector('img')).toBeNull();
  });

  it('does not call plainTextToFragment when table wins over image', () => {
    els.editor.dispatchEvent(
      makePasteEvent({
        text: 'A\tB\nC\tD',
        imageType: 'image/tiff',
      })
    );
    expect(plainTextToFragment).not.toHaveBeenCalled();
  });

  // ── plain text path ─────────────────────────────────────────────────────────

  it('calls plainTextToFragment for plain text with no table data or image', () => {
    // Set up a real selection so rangeCount > 0
    els.editor.focus();
    const range = document.createRange();
    range.selectNodeContents(els.editor);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    els.editor.dispatchEvent(makePasteEvent({ text: 'just plain text' }));
    expect(plainTextToFragment).toHaveBeenCalledWith('just plain text');
  });

  it('does not insert a table when pasting plain text without tabs', () => {
    els.editor.dispatchEvent(makePasteEvent({ text: 'no tabs here' }));
    expect(els.editor.querySelector('table')).toBeNull();
  });

  it('does not insert a table for multi-line plain text with no tabs', () => {
    els.editor.dispatchEvent(makePasteEvent({ text: 'line1\nline2\nline3' }));
    expect(els.editor.querySelector('table')).toBeNull();
  });

  it('marks the modal as changed after plain text paste', () => {
    els.editor.focus();
    const range = document.createRange();
    range.selectNodeContents(els.editor);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    els.editor.dispatchEvent(makePasteEvent({ text: 'some text' }));
    expect(setModalHasChanges).toHaveBeenCalledWith(true);
  });
});
