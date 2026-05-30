/**
 * Tests for modal.js: clearNotes DOM behaviour.
 *
 * All heavy dependencies of modal.js are mocked. The test focuses on the
 * observable DOM side-effects of clearNotes(): editor cleared, toolbar hidden,
 * preview shown/hidden based on whether it has content.
 *
 * setup.js overwrites global.document with a minimal stub. We spin up a real
 * JSDOM instance (same pattern as focus-trap.test.js) so DOM elements have
 * style, innerHTML, getElementById, etc.
 */
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

// ── Mocks (must appear before any import of the module under test) ────────────

const mockState = vi.hoisted(() => ({
  setModalHasChanges: vi.fn(),
  setModalPendingActions: vi.fn(),
  setCurrentTaskId: vi.fn(),
  setOriginalTimerValue: vi.fn(),
  setOriginalPriorityValue: vi.fn(),
  setCurrentModalPriority: vi.fn(),
  setOriginalTagsValue: vi.fn(),
  setOriginalTitleValue: vi.fn(),
  notesData: [],
  currentTaskId: null,
  modalHasChanges: false,
  originalTimerValue: 0,
  originalPriorityValue: null,
  currentModalPriority: null,
  originalTagsValue: [],
  originalTitleValue: '',
  modalPendingActions: [],
}));

vi.mock('../scripts/kantrack-modules/state.js', () => mockState);
vi.mock('../scripts/kantrack-modules/storage.js', () => ({ saveNotesToLocalStorage: vi.fn() }));
vi.mock('../scripts/kantrack-modules/database.js', () => ({
  storeImage: vi.fn(),
  getImage: vi.fn(),
  deleteImagesByIds: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/utils.js', () => ({
  formatTime: vi.fn(() => '0m'),
  escapeHtml: vi.fn(s => s),
  getTextPreview: vi.fn(() => ''),
  deepClone: vi.fn(o => JSON.parse(JSON.stringify(o))),
  createFocusTrap: vi.fn(() => ({ activate: vi.fn(), deactivate: vi.fn() })),
  plainTextToFragment: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/sanitize.js', () => ({ sanitizeHTML: vi.fn(s => s) }));
vi.mock('../scripts/kantrack-modules/priority.js', () => ({
  getPriorityLabel: vi.fn(() => 'None'),
  updateModalPriorityButtons: vi.fn(),
  updateNoteCardPriority: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/sorting.js', () => ({ sortColumnByPriority: vi.fn() }));
vi.mock('../scripts/kantrack-modules/sub-kanban.js', () => ({ renderSubKanban: vi.fn() }));
vi.mock('../scripts/kantrack-modules/images.js', () => ({ openImageViewer: vi.fn() }));
vi.mock('../scripts/kantrack-modules/tasks.js', () => ({
  updateNoteCardDisplay: vi.fn(),
  setOpenTaskModal: vi.fn(),
  setDeactivateModalTrap: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/tags.js', () => ({
  getTagById: vi.fn(),
  cleanupUnusedTags: vi.fn(),
  renderTagSelector: vi.fn(),
  renderTagFilterButtons: vi.fn(),
}));
vi.mock('../scripts/kantrack-modules/due-dates.js', () => ({ renderDueDatePicker: vi.fn() }));
vi.mock('../scripts/kantrack-modules/undo.js', () => ({ recordAction: vi.fn() }));

import { clearNotes } from '../scripts/kantrack-modules/modal.js';

// ── JSDOM setup ───────────────────────────────────────────────────────────────

beforeAll(() => {
  const { window } = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  vi.stubGlobal('document', window.document);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ── DOM helpers ───────────────────────────────────────────────────────────────

function buildDOM({ previewContent = '' } = {}) {
  const editor = document.createElement('div');
  editor.id = 'modalNotesEditor';
  editor.innerHTML = '<p>existing content</p>';
  editor.style.display = '';

  const preview = document.createElement('div');
  preview.id = 'notesPreview';
  preview.innerHTML = previewContent;
  preview.style.display = 'none';

  const clearBtn = document.createElement('button');
  clearBtn.id = 'clearNotesBtn';
  clearBtn.style.display = 'inline-block';

  const formatBtns = document.createElement('div');
  formatBtns.id = 'notesFormatBtns';
  formatBtns.style.display = 'flex';

  document.body.append(editor, preview, clearBtn, formatBtns);
  return { editor, preview, clearBtn, formatBtns };
}

function tearDownDOM(els) {
  Object.values(els).forEach(el => el.remove());
}

// ── clearNotes ────────────────────────────────────────────────────────────────

describe('clearNotes', () => {
  let els;

  beforeEach(() => {
    mockState.setModalHasChanges.mockClear();
  });
  afterEach(() => tearDownDOM(els));

  it('empties the editor innerHTML', () => {
    els = buildDOM();
    clearNotes();
    expect(els.editor.innerHTML).toBe('');
  });

  it('marks the modal as having changes', () => {
    els = buildDOM();
    clearNotes();
    expect(mockState.setModalHasChanges).toHaveBeenCalledWith(true);
  });

  it('hides the Clear All button', () => {
    els = buildDOM();
    clearNotes();
    expect(els.clearBtn.style.display).toBe('none');
  });

  it('hides the format buttons', () => {
    els = buildDOM();
    clearNotes();
    expect(els.formatBtns.style.display).toBe('none');
  });

  it('shows the preview when it has content', () => {
    els = buildDOM({ previewContent: '<p>Previous note</p>' });
    clearNotes();
    expect(els.preview.style.display).toBe('block');
  });

  it('hides the editor when preview has content', () => {
    els = buildDOM({ previewContent: '<p>Previous note</p>' });
    clearNotes();
    expect(els.editor.style.display).toBe('none');
  });

  it('leaves the preview hidden when it has no content', () => {
    els = buildDOM({ previewContent: '' });
    clearNotes();
    expect(els.preview.style.display).toBe('none');
  });

  it('does not hide the editor when preview has no content', () => {
    els = buildDOM({ previewContent: '' });
    clearNotes();
    expect(els.editor.style.display).toBe('');
  });

  it('does not throw when format buttons element is absent', () => {
    els = buildDOM();
    els.formatBtns.remove();
    expect(() => clearNotes()).not.toThrow();
  });
});
