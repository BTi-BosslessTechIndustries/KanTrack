/**
 * Tests for database.js — IDB helpers and localStorage → IDB migration.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetLocalStorage } from './setup.js';

// Mock notifications.js to avoid DOM errors
vi.mock('../scripts/kantrack-modules/notifications.js', () => ({
  showError: vi.fn(),
  showWarning: vi.fn(),
  showNotification: vi.fn(),
  showSuccess: vi.fn(),
  checkStorageQuota: vi.fn(() => ({ percentage: 10 })),
  warnIfStorageHigh: vi.fn(),
  getStorageBreakdown: vi.fn(() => ({})),
  logStorageDiagnostics: vi.fn(),
}));

import {
  initIndexedDB,
  idbGet,
  idbGetAll,
  idbPut,
  idbDelete,
  idbClear,
  idbBulkPut,
  idbClearAndBulkPut,
  migrateLocalStorageToIDB,
  runDataMigrations,
} from '../scripts/kantrack-modules/database.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Delete and re-open KanbanDB to get a clean slate between tests. */
async function resetDB() {
  await new Promise(resolve => {
    const req = indexedDB.deleteDatabase('KanbanDB');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
  await initIndexedDB();
}

beforeEach(async () => {
  global.indexedDB = new IDBFactory(); // fresh factory — no leftover data
  resetLocalStorage();
  await initIndexedDB();
});

// ---------------------------------------------------------------------------
// IDB helper: idbPut / idbGet
// ---------------------------------------------------------------------------
describe('idbPut + idbGet', () => {
  it('stores a value and retrieves it by key', async () => {
    await idbPut('meta', { key: 'foo', value: 42 });
    const result = await idbGet('meta', 'foo');
    expect(result).toEqual({ key: 'foo', value: 42 });
  });

  it('returns undefined for a key that does not exist', async () => {
    const result = await idbGet('meta', 'nonexistent');
    expect(result).toBeUndefined();
  });

  it('overwrites an existing record with the same key', async () => {
    await idbPut('meta', { key: 'x', value: 1 });
    await idbPut('meta', { key: 'x', value: 2 });
    const result = await idbGet('meta', 'x');
    expect(result.value).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// IDB helper: idbGetAll
// ---------------------------------------------------------------------------
describe('idbGetAll', () => {
  it('returns all records in a store', async () => {
    await idbPut('meta', { key: 'a', value: 1 });
    await idbPut('meta', { key: 'b', value: 2 });
    const all = await idbGetAll('meta');
    expect(all).toHaveLength(2);
  });

  it('returns empty array for an empty store', async () => {
    const all = await idbGetAll('meta');
    expect(all).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// IDB helper: idbDelete
// ---------------------------------------------------------------------------
describe('idbDelete', () => {
  it('removes a record by key', async () => {
    await idbPut('meta', { key: 'del-me', value: 'gone' });
    await idbDelete('meta', 'del-me');
    const result = await idbGet('meta', 'del-me');
    expect(result).toBeUndefined();
  });

  it('does not throw when deleting a key that does not exist', async () => {
    await expect(idbDelete('meta', 'ghost')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// IDB helper: idbClear
// ---------------------------------------------------------------------------
describe('idbClear', () => {
  it('removes all records from a store', async () => {
    await idbPut('meta', { key: 'a', value: 1 });
    await idbPut('meta', { key: 'b', value: 2 });
    await idbClear('meta');
    const all = await idbGetAll('meta');
    expect(all).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// IDB helper: idbBulkPut
// ---------------------------------------------------------------------------
describe('idbBulkPut', () => {
  it('stores multiple records in a single transaction', async () => {
    const tasks = [
      { id: 'task-1', title: 'Alpha', column: 'todo', noteEntries: [], tags: [] },
      { id: 'task-2', title: 'Beta', column: 'inProgress', noteEntries: [], tags: [] },
    ];
    await idbBulkPut('tasks', tasks);
    const all = await idbGetAll('tasks');
    expect(all).toHaveLength(2);
  });

  it('resolves immediately for an empty array', async () => {
    await expect(idbBulkPut('tasks', [])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// IDB helper: idbClearAndBulkPut
// ---------------------------------------------------------------------------
describe('idbClearAndBulkPut', () => {
  it('replaces existing records atomically', async () => {
    await idbBulkPut('tasks', [
      { id: 'old-1', title: 'Old', column: 'todo', noteEntries: [], tags: [] },
    ]);

    await idbClearAndBulkPut('tasks', [
      { id: 'new-1', title: 'New A', column: 'todo', noteEntries: [], tags: [] },
      { id: 'new-2', title: 'New B', column: 'inProgress', noteEntries: [], tags: [] },
    ]);

    const all = await idbGetAll('tasks');
    expect(all).toHaveLength(2);
    expect(all.find(t => t.id === 'old-1')).toBeUndefined();
    expect(all.find(t => t.id === 'new-1')).toBeDefined();
  });

  it('results in an empty store when passed an empty array', async () => {
    await idbBulkPut('tasks', [
      { id: 'task-1', title: 'X', column: 'todo', noteEntries: [], tags: [] },
    ]);
    await idbClearAndBulkPut('tasks', []);
    expect(await idbGetAll('tasks')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// migrateLocalStorageToIDB
// ---------------------------------------------------------------------------
describe('migrateLocalStorageToIDB', () => {
  const sampleTask = {
    id: 'ls-task-1',
    title: 'From LS',
    column: 'todo',
    noteEntries: [],
    tags: [],
  };
  const sampleTag = { id: 'tag-red', name: 'Red', colorIndex: 0, pinned: true };
  const sampleClock = { id: 123456, type: 'timezone', name: 'Paris', timezone: 'Europe/Paris' };
  const sampleTrash = { id: 'trash-1', title: 'Deleted', column: 'done', trashedAt: Date.now() };
  const sampleNotebook = { id: 789, type: 'page', name: 'Page 1', parentId: null, order: 0 };

  function seedLocalStorage() {
    localStorage.setItem('kanbanNotes', JSON.stringify([sampleTask]));
    localStorage.setItem('kantrackTags', JSON.stringify([sampleTag]));
    localStorage.setItem('kanbanClocks', JSON.stringify([sampleClock]));
    localStorage.setItem('kantrackTrash', JSON.stringify([sampleTrash]));
    localStorage.setItem('notebookItems', JSON.stringify([sampleNotebook]));
  }

  it('copies tasks from localStorage to the tasks IDB store', async () => {
    seedLocalStorage();
    await migrateLocalStorageToIDB();
    const tasks = await idbGetAll('tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('ls-task-1');
  });

  it('copies tags from localStorage to the tags IDB store', async () => {
    seedLocalStorage();
    await migrateLocalStorageToIDB();
    const tags = await idbGetAll('tags');
    expect(tags).toHaveLength(1);
    expect(tags[0].id).toBe('tag-red');
  });

  it('copies clocks and adds an order field', async () => {
    seedLocalStorage();
    await migrateLocalStorageToIDB();
    const clocks = await idbGetAll('clocks');
    expect(clocks).toHaveLength(1);
    expect(clocks[0]).toHaveProperty('order', 0);
  });

  it('copies trash items to the trash IDB store', async () => {
    seedLocalStorage();
    await migrateLocalStorageToIDB();
    const trash = await idbGetAll('trash');
    expect(trash).toHaveLength(1);
    expect(trash[0].id).toBe('trash-1');
  });

  it('copies notebook items to the notebook_items IDB store', async () => {
    seedLocalStorage();
    await migrateLocalStorageToIDB();
    const items = await idbGetAll('notebook_items');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(789);
  });

  it('marks migration as done in the meta store', async () => {
    seedLocalStorage();
    await migrateLocalStorageToIDB();
    const meta = await idbGet('meta', 'migrationDone');
    expect(meta?.value).toBe(true);
  });

  it('does NOT re-run if migrationDone flag is already set (idempotent)', async () => {
    // Mark migration done without doing actual migration
    await idbPut('meta', { key: 'migrationDone', value: true, migratedAt: Date.now() });
    // Put a task in localStorage that would be picked up if migration re-ran
    localStorage.setItem('kanbanNotes', JSON.stringify([sampleTask]));

    await migrateLocalStorageToIDB();

    // Tasks store should still be empty — migration was skipped
    const tasks = await idbGetAll('tasks');
    expect(tasks).toHaveLength(0);
  });

  it('skips a store that already has data (no double-write)', async () => {
    // Pre-populate IDB tasks store
    await idbBulkPut('tasks', [
      { id: 'idb-task', title: 'Already in IDB', column: 'todo', noteEntries: [], tags: [] },
    ]);
    // Put a different task in localStorage
    localStorage.setItem('kanbanNotes', JSON.stringify([sampleTask]));

    await migrateLocalStorageToIDB();

    const tasks = await idbGetAll('tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('idb-task'); // localStorage task was NOT added
  });

  it('does not throw when localStorage keys are absent', async () => {
    // localStorage is empty — migration should complete cleanly
    await expect(migrateLocalStorageToIDB()).resolves.toBeUndefined();
    const meta = await idbGet('meta', 'migrationDone');
    expect(meta?.value).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runDataMigrations — sequential data schema version runner
// ---------------------------------------------------------------------------
describe('runDataMigrations', () => {
  const sampleTask = {
    id: 'ls-task-1',
    title: 'From LS',
    column: 'todo',
    noteEntries: [],
    tags: [],
  };

  it('writes schemaVersion to meta after running', async () => {
    await runDataMigrations();
    const meta = await idbGet('meta', 'schemaVersion');
    expect(meta?.value).toBeGreaterThanOrEqual(1);
  });

  it('runs the v0→v1 data migration (copies localStorage tasks to IDB)', async () => {
    localStorage.setItem('kanbanNotes', JSON.stringify([sampleTask]));
    await runDataMigrations();

    const tasks = await idbGetAll('tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('ls-task-1');
  });

  it('is idempotent — does not re-run migrations when schemaVersion is already current', async () => {
    // Simulate a user who already ran migrations
    await runDataMigrations();

    // Now put a task in localStorage that would be picked up if migrations re-ran
    localStorage.setItem('kanbanNotes', JSON.stringify([{ ...sampleTask, id: 'second-run-task' }]));

    await runDataMigrations();

    // Tasks store should still have the original state (migration skipped)
    const tasks = await idbGetAll('tasks');
    expect(tasks.find(t => t.id === 'second-run-task')).toBeUndefined();
  });

  it('does not throw when called on a fresh database with empty localStorage', async () => {
    await expect(runDataMigrations()).resolves.toBeUndefined();
  });
});
