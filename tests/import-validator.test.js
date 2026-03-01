/**
 * Tests for import-validator.js — pure validation functions.
 */
import { describe, it, expect } from 'vitest';
import {
  validateImportFile,
  extractImportSummary,
  SUPPORTED_FORMAT_VERSIONS,
} from '../scripts/kantrack-modules/import-validator.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validTask = (id = 'task-1', column = 'todo', tags = []) => ({
  id,
  title: 'Test Task',
  column,
  noteEntries: [],
  tags,
});

const validTag = (id = 'tag-1') => ({ id, name: 'Work', colorIndex: 0, pinned: false });

const validPayload = () => ({
  formatVersion: 1,
  appVersion: '1.0.0',
  exportedAt: new Date().toISOString(),
  tasks: [validTask()],
  tags: [validTag()],
  notebook_items: [],
  clocks: [],
  settings: {},
  integrity: { tasks_count: 1, tasks_hash: 'abc123' },
});

// ---------------------------------------------------------------------------
// validateImportFile — hard errors
// ---------------------------------------------------------------------------

describe('validateImportFile — errors', () => {
  it('returns invalid for null input', () => {
    const result = validateImportFile(null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns invalid when formatVersion is missing', () => {
    const payload = validPayload();
    delete payload.formatVersion;
    const result = validateImportFile(payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('formatVersion'))).toBe(true);
  });

  it('returns invalid when formatVersion is unsupported', () => {
    const payload = validPayload();
    payload.formatVersion = 999;
    const result = validateImportFile(payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('999'))).toBe(true);
  });

  it('returns invalid when tasks is not an array', () => {
    const payload = validPayload();
    payload.tasks = 'not an array';
    const result = validateImportFile(payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.toLowerCase().includes('task'))).toBe(true);
  });

  it('returns invalid when tasks is missing', () => {
    const payload = validPayload();
    delete payload.tasks;
    const result = validateImportFile(payload);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateImportFile — warnings (do not make valid → invalid)
// ---------------------------------------------------------------------------

describe('validateImportFile — warnings', () => {
  it('warns when integrity.tasks_count does not match actual task count', () => {
    const payload = validPayload();
    payload.integrity.tasks_count = 99; // claims 99, has 1
    const result = validateImportFile(payload);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('99'))).toBe(true);
  });

  it('warns when tasks reference tag IDs not present in tags array', () => {
    const payload = validPayload();
    payload.tasks = [validTask('t1', 'todo', ['missing-tag-id'])];
    payload.tags = []; // no tags defined
    const result = validateImportFile(payload);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.toLowerCase().includes('tag'))).toBe(true);
  });

  it('does not warn when tag references all resolve', () => {
    const payload = validPayload();
    payload.tasks = [validTask('t1', 'todo', ['tag-1'])];
    payload.tags = [validTag('tag-1')];
    const result = validateImportFile(payload);
    expect(result.warnings.filter(w => w.toLowerCase().includes('tag'))).toHaveLength(0);
  });

  it('warns when a task has an unknown column', () => {
    const payload = validPayload();
    payload.tasks = [validTask('t1', 'nonexistent')];
    payload.integrity.tasks_count = 1;
    const result = validateImportFile(payload);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.toLowerCase().includes('column'))).toBe(true);
  });

  it('does not warn when all tasks have valid columns', () => {
    const payload = validPayload();
    payload.tasks = [
      validTask('t1', 'todo'),
      validTask('t2', 'inProgress'),
      validTask('t3', 'onHold'),
      validTask('t4', 'done'),
    ];
    payload.integrity.tasks_count = 4;
    const result = validateImportFile(payload);
    expect(result.warnings.filter(w => w.toLowerCase().includes('column'))).toHaveLength(0);
  });

  it('produces no warnings for a clean file', () => {
    const payload = validPayload();
    const result = validateImportFile(payload);
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateImportFile — valid file
// ---------------------------------------------------------------------------

describe('validateImportFile — valid', () => {
  it('returns valid: true for a well-formed payload', () => {
    const result = validateImportFile(validPayload());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid: true when optional fields are absent (tags, clocks, notebook_items)', () => {
    const payload = {
      formatVersion: 1,
      tasks: [validTask()],
    };
    const result = validateImportFile(payload);
    expect(result.valid).toBe(true);
  });

  it('returns valid: true for an empty tasks array', () => {
    const payload = validPayload();
    payload.tasks = [];
    payload.integrity.tasks_count = 0;
    const result = validateImportFile(payload);
    expect(result.valid).toBe(true);
  });

  it('SUPPORTED_FORMAT_VERSIONS contains 1', () => {
    expect(SUPPORTED_FORMAT_VERSIONS).toContain(1);
  });
});

// ---------------------------------------------------------------------------
// extractImportSummary
// ---------------------------------------------------------------------------

describe('extractImportSummary', () => {
  it('returns correct counts for all entity types', () => {
    const payload = {
      tasks: [validTask(), validTask('t2')],
      tags: [validTag(), validTag('tag-2')],
      notebook_items: [{ id: 'p1' }],
      clocks: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
    };
    const summary = extractImportSummary(payload);
    expect(summary.tasks).toBe(2);
    expect(summary.tags).toBe(2);
    expect(summary.pages).toBe(1);
    expect(summary.clocks).toBe(3);
  });

  it('returns zero for absent arrays', () => {
    const summary = extractImportSummary({});
    expect(summary.tasks).toBe(0);
    expect(summary.tags).toBe(0);
    expect(summary.pages).toBe(0);
    expect(summary.clocks).toBe(0);
  });

  it('returns zero when arrays are empty', () => {
    const summary = extractImportSummary({ tasks: [], tags: [], notebook_items: [], clocks: [] });
    expect(summary.tasks).toBe(0);
    expect(summary.tags).toBe(0);
    expect(summary.pages).toBe(0);
    expect(summary.clocks).toBe(0);
  });
});
