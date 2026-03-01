# scripts/

Application source code. The entire KanTrack front-end lives here.

---

## Entry point

### `kantrack.js`

The bootstrap file loaded by `index.html`. It:

1. Imports all feature modules
2. Registers every `data-action` handler with the router (`registerAction()`)
3. Calls `initRouter()` to attach the single delegated click listener
4. Calls `dispatch(TASK_SET_ALL, tasks)` to seed the store after loading from IDB
5. Sets up column count listeners, the auto-save indicator, and the storage monitor
6. Registers global keyboard shortcuts: **N** (new task), **/** (search), **?** (shortcuts dialog), **ESC** (close any open modal), and arrow-key card navigation

If you add a new button or interactive element to `index.html`, the corresponding action handler is registered here.

---

## Module directory

See [`kantrack-modules/README.md`](kantrack-modules/README.md) for the full per-module breakdown.

## Workers

`scripts/workers/` contains two Web Worker modules that offload expensive operations from the main thread:

| File                   | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `export-worker.js`     | JSON serialisation of large workspaces             |
| `compaction-worker.js` | Oplog compaction (removes superseded undo entries) |

Workers are created with `new Worker(new URL(..., import.meta.url), { type: 'module' })` and fall back to main-thread execution if `Worker` is unavailable.

---

## Architecture rules

1. **`repository.ts` is the only file that touches IDB/localStorage for business data.** All other modules call `saveNotesToLocalStorage()` (storage.js) which delegates to `repository.ts`.

2. **All click handling goes through `router.ts`.** No inline `onclick` attributes. No `window.*` exports. Use `data-action` + `data-action-param` on HTML elements and `registerAction()` in `kantrack.js`.

3. **Cross-module communication via custom events.** `tasks.js` and other modules dispatch `kantrack:updateColumnCounts` and `kantrack:updateTrashCount` window events instead of calling each other directly.

4. **TypeScript for shared infrastructure, JavaScript for feature modules.** The four `.ts` files (types, store, router, repository) form the typed core. Feature modules (modal.js, tasks.js, etc.) remain in JavaScript for now.
