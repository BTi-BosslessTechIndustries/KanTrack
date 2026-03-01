/**
 * Type declarations for database.js.
 *
 * database.js is a plain JS module. These declarations give TypeScript enough
 * information to type-check callers without requiring allowJs or ts-ignore hacks.
 * Return types use `unknown` for IDB records — callers cast to their concrete types.
 */

// ── Core IDB helpers ──────────────────────────────────────────────────────────

export function initIndexedDB(): Promise<IDBDatabase>;

export function idbGet(storeName: string, key: IDBValidKey): Promise<unknown>;
export function idbGetAll(storeName: string): Promise<unknown[]>;
export function idbPut(storeName: string, value: object): Promise<void>;
export function idbDelete(storeName: string, key: IDBValidKey): Promise<void>;
export function idbClear(storeName: string): Promise<void>;
export function idbBulkPut(storeName: string, values: object[]): Promise<void>;
export function idbClearAndBulkPut(storeName: string, values: object[]): Promise<void>;

// ── Migration ─────────────────────────────────────────────────────────────────

export function migrateLocalStorageToIDB(): Promise<void>;
export function runDataMigrations(): Promise<void>;

// ── Task image storage ────────────────────────────────────────────────────────

export function storeImage(taskId: string, imageId: string, dataUrl: string): Promise<void>;
export function getImage(taskId: string, imageId: string): Promise<string | null>;
export function deleteTaskImages(taskId: string): Promise<void>;
export function deleteImagesByIds(taskId: string, imageIds: string[]): Promise<void>;

// ── Notebook image storage ────────────────────────────────────────────────────

export function storeNotebookImage(pageId: string, imageId: string, dataUrl: string): Promise<void>;
export function getNotebookImage(pageId: string, imageId: string): Promise<string | null>;
export function deletePageImages(pageId: string): Promise<void>;

// ── Meta store helpers ────────────────────────────────────────────────────────

export function getMetaValue(key: string): Promise<unknown>;
export function setMetaValue(key: string, value: unknown): void;
export function getOrCreateDeviceId(): Promise<string>;
export function getMetaLamport(): Promise<number>;

// ── Oplog IDB helpers ─────────────────────────────────────────────────────────

export function idbGetAllOplog(): Promise<unknown[]>;
export function idbPutOplog(entry: object): Promise<void>;
export function idbDeleteOplog(opId: string): Promise<void>;
export function idbDeleteAllUndoneOplog(): Promise<void>;
