// Shared domain types for KanTrack.
// Imported by store.ts, repository.ts, and any future typed module.

export type Column = 'todo' | 'inProgress' | 'onHold' | 'done';
export type Priority = 'high' | 'medium' | 'low' | null;

export interface NoteEntry {
  timestamp: string;
  notesHTML: string;
  images: string[];
}

export interface TaskAction {
  type: string;
  action: string;
  timestamp: string;
  notesHTML?: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  column: Column;
  noteEntries: NoteEntry[];
  tags: string[];
  timer: number;
  priority?: Priority;
  deleted?: boolean;
  trashedAt?: number;
  actions?: TaskAction[];
  subtasks?: Subtask[];
  dueDate?: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface NotebookItem {
  id: string;
  type: 'page' | 'folder';
  name: string;
  parentId: string | null;
  content?: string;
  images?: Array<{ id: string; data: string }>;
  order?: number;
  expanded?: boolean;
}

export interface Clock {
  id: string;
  label: string;
  timezone: string;
  order?: number;
}

export interface UndoEntry {
  action: unknown;
  savedAt: number;
}

// ==================== OPLOG TYPES (Phase 3) ====================

export type OplogActionType = 'create' | 'update' | 'move' | 'delete' | 'restore';
export type OplogEntityType = 'task' | 'tag' | 'prefs';

export interface PatchField {
  prev: unknown;
  next: unknown;
}

export interface OplogEntry {
  opId: string;
  deviceId: string;
  lamport: number;
  timestamp: number;
  entityType: OplogEntityType;
  entityId: string;
  actionType: OplogActionType;
  patch: Record<string, PatchField>;
  description: string;
  undone: boolean;
  undoneAt?: number; // ms timestamp of when the action was undone — used to rebuild redo order
  prevHash: null; // reserved for Phase 10 (sync)
  hash: null; // reserved for Phase 10 (sync)
  _action: unknown; // original recordAction() argument — for stack reconstruction on init
}
