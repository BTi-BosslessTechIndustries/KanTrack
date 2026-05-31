/**
 * Tests for loading.js: overlay and save-indicator helpers.
 *
 * loading.js manipulates the DOM and holds module-level state
 * (loadingOverlay, loadingCount). A real JSDOM environment is used so that
 * classList, querySelector, style, and createElement all behave correctly.
 *
 * forceHideLoading() is called in beforeEach to reset the loading counter
 * between tests.
 */
import { JSDOM } from 'jsdom';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  showLoading,
  hideLoading,
  forceHideLoading,
  updateLoadingMessage,
  showLoadingWithProgress,
  updateProgress,
  createSaveIndicator,
} from '../scripts/kantrack-modules/loading.js';

let jsdomDoc;

beforeAll(() => {
  const { window } = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  jsdomDoc = window.document;
  vi.stubGlobal('document', jsdomDoc);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  forceHideLoading();
});

// ── showLoading ───────────────────────────────────────────────────────────────

describe('showLoading', () => {
  it('creates the overlay and adds loading-visible class', () => {
    showLoading();
    const overlay = jsdomDoc.getElementById('loadingOverlay');
    expect(overlay).toBeTruthy();
    expect(overlay.classList.contains('loading-visible')).toBe(true);
  });

  it('sets the loading text', () => {
    showLoading('Please wait');
    expect(jsdomDoc.querySelector('.loading-text').textContent).toBe('Please wait');
  });

  it('defaults to "Loading..." message', () => {
    showLoading();
    expect(jsdomDoc.querySelector('.loading-text').textContent).toBe('Loading...');
  });

  it('nested calls keep the overlay visible', () => {
    showLoading();
    showLoading();
    expect(jsdomDoc.getElementById('loadingOverlay').classList.contains('loading-visible')).toBe(
      true
    );
  });
});

// ── hideLoading ───────────────────────────────────────────────────────────────

describe('hideLoading', () => {
  it('removes loading-visible when the count reaches zero', () => {
    showLoading();
    hideLoading();
    expect(jsdomDoc.getElementById('loadingOverlay').classList.contains('loading-visible')).toBe(
      false
    );
  });

  it('keeps overlay visible when nested show count is still positive', () => {
    showLoading();
    showLoading();
    hideLoading(); // count goes to 1, still visible
    expect(jsdomDoc.getElementById('loadingOverlay').classList.contains('loading-visible')).toBe(
      true
    );
    hideLoading(); // count goes to 0, hidden
    expect(jsdomDoc.getElementById('loadingOverlay').classList.contains('loading-visible')).toBe(
      false
    );
  });

  it('does not go below zero: extra calls do not throw', () => {
    expect(() => hideLoading()).not.toThrow();
    expect(() => hideLoading()).not.toThrow();
  });

  it('resets progress bar fill to 0% on hide', () => {
    showLoadingWithProgress('working', 80);
    hideLoading();
    expect(jsdomDoc.querySelector('.loading-progress-bar').style.width).toBe('0%');
  });

  it('hides the progress bar container on hide', () => {
    showLoadingWithProgress('working', 80);
    hideLoading();
    expect(jsdomDoc.querySelector('.loading-progress').style.display).toBe('none');
  });
});

// ── forceHideLoading ─────────────────────────────────────────────────────────

describe('forceHideLoading', () => {
  it('removes loading-visible even after multiple nested shows', () => {
    showLoading();
    showLoading();
    showLoading();
    forceHideLoading();
    expect(jsdomDoc.getElementById('loadingOverlay').classList.contains('loading-visible')).toBe(
      false
    );
  });

  it('is safe to call before any showLoading', () => {
    expect(() => forceHideLoading()).not.toThrow();
  });
});

// ── updateLoadingMessage ──────────────────────────────────────────────────────

describe('updateLoadingMessage', () => {
  it('changes the text shown in the overlay', () => {
    showLoading('first');
    updateLoadingMessage('second message');
    expect(jsdomDoc.querySelector('.loading-text').textContent).toBe('second message');
  });
});

// ── showLoadingWithProgress ───────────────────────────────────────────────────

describe('showLoadingWithProgress', () => {
  it('adds loading-visible class', () => {
    showLoadingWithProgress('Uploading', 50);
    expect(jsdomDoc.getElementById('loadingOverlay').classList.contains('loading-visible')).toBe(
      true
    );
  });

  it('makes the progress bar visible', () => {
    showLoadingWithProgress('Working', 30);
    expect(jsdomDoc.querySelector('.loading-progress').style.display).toBe('block');
  });

  it('sets the progress fill width', () => {
    showLoadingWithProgress('Processing', 65);
    expect(jsdomDoc.querySelector('.loading-progress-bar').style.width).toBe('65%');
  });

  it('clamps progress to 100', () => {
    showLoadingWithProgress('Overloaded', 150);
    expect(jsdomDoc.querySelector('.loading-progress-bar').style.width).toBe('100%');
  });

  it('clamps progress to 0 for negative values', () => {
    showLoadingWithProgress('Start', -20);
    expect(jsdomDoc.querySelector('.loading-progress-bar').style.width).toBe('0%');
  });

  it('sets the loading text', () => {
    showLoadingWithProgress('Custom text', 10);
    expect(jsdomDoc.querySelector('.loading-text').textContent).toBe('Custom text');
  });
});

// ── updateProgress ────────────────────────────────────────────────────────────

describe('updateProgress', () => {
  beforeEach(() => {
    showLoadingWithProgress('start', 0);
  });

  it('updates the progress fill width', () => {
    updateProgress(72);
    expect(jsdomDoc.querySelector('.loading-progress-bar').style.width).toBe('72%');
  });

  it('clamps to 100', () => {
    updateProgress(200);
    expect(jsdomDoc.querySelector('.loading-progress-bar').style.width).toBe('100%');
  });

  it('clamps to 0', () => {
    updateProgress(-5);
    expect(jsdomDoc.querySelector('.loading-progress-bar').style.width).toBe('0%');
  });

  it('updates the message when provided', () => {
    updateProgress(50, 'halfway there');
    expect(jsdomDoc.querySelector('.loading-text').textContent).toBe('halfway there');
  });

  it('leaves the message unchanged when no message is provided', () => {
    showLoading('keep me');
    updateProgress(50);
    expect(jsdomDoc.querySelector('.loading-text').textContent).toBe('keep me');
  });
});

// ── createSaveIndicator ───────────────────────────────────────────────────────

describe('createSaveIndicator', () => {
  let container;

  beforeEach(() => {
    container = jsdomDoc.createElement('div');
    jsdomDoc.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('returns an object with show, saved, hide, and error methods', () => {
    const ind = createSaveIndicator(container);
    expect(typeof ind.show).toBe('function');
    expect(typeof ind.saved).toBe('function');
    expect(typeof ind.hide).toBe('function');
    expect(typeof ind.error).toBe('function');
  });

  it('show() appends the indicator span to the container', () => {
    const ind = createSaveIndicator(container);
    ind.show();
    expect(container.querySelector('.save-indicator')).toBeTruthy();
  });

  it('show() adds save-indicator-visible class', () => {
    const ind = createSaveIndicator(container);
    ind.show();
    expect(
      container.querySelector('.save-indicator').classList.contains('save-indicator-visible')
    ).toBe(true);
  });

  it('show() uses "Saving..." text by default', () => {
    const ind = createSaveIndicator(container);
    ind.show();
    expect(container.querySelector('.save-indicator').textContent).toBe('Saving...');
  });

  it('show() accepts custom text', () => {
    const ind = createSaveIndicator(container);
    ind.show('Applying changes...');
    expect(container.querySelector('.save-indicator').textContent).toBe('Applying changes...');
  });

  it('calling show() twice does not append a second indicator element', () => {
    const ind = createSaveIndicator(container);
    ind.show();
    ind.show();
    expect(container.querySelectorAll('.save-indicator').length).toBe(1);
  });

  it('saved() sets text to "Saved" and adds save-indicator-success class', () => {
    vi.useFakeTimers();
    const ind = createSaveIndicator(container);
    ind.show();
    ind.saved();
    const el = container.querySelector('.save-indicator');
    expect(el.textContent).toBe('Saved');
    expect(el.classList.contains('save-indicator-success')).toBe(true);
    vi.useRealTimers();
  });

  it('hide() removes save-indicator-visible class', () => {
    const ind = createSaveIndicator(container);
    ind.show();
    ind.hide();
    expect(
      container.querySelector('.save-indicator').classList.contains('save-indicator-visible')
    ).toBe(false);
  });

  it('error() sets the error text and adds save-indicator-error class', () => {
    vi.useFakeTimers();
    const ind = createSaveIndicator(container);
    ind.show();
    ind.error('Save failed');
    const el = container.querySelector('.save-indicator');
    expect(el.textContent).toBe('Save failed');
    expect(el.classList.contains('save-indicator-error')).toBe(true);
    vi.useRealTimers();
  });
});
