/***********************
 * ROUTER — centralized event delegation
 *
 * Replaces window.* exports and inline onclick handlers.
 * Zero external dependencies — a 30-line event delegation pattern.
 *
 * Usage (in kantrack.js bootstrap):
 *   import { registerAction, initRouter } from './kantrack-modules/router.js';
 *   registerAction('task:add', () => addNote());
 *   initRouter();
 *
 * Usage (in HTML):
 *   <button data-action="task:add">Add</button>
 *   <button data-action="task:setPriority" data-action-param="high">High</button>
 ***********************/

type ActionHandler = (param: string | null, event: Event, element: Element) => void;

const actionMap = new Map<string, ActionHandler>();

/**
 * Register a handler for a data-action name.
 * @param action - The action identifier (e.g. "task:add")
 * @param handler - Called with (param, event, element) on every matching click
 */
export function registerAction(action: string, handler: ActionHandler): void {
  actionMap.set(action, handler);
}

/**
 * Attach the single delegated click listener to the document.
 * Call once during bootstrap, after all actions are registered.
 */
export function initRouter(): void {
  document.addEventListener('click', (e: Event) => {
    const target = e.target as Element | null;
    const el = target?.closest('[data-action]') as HTMLElement | null;
    if (!el) return;

    const action = el.dataset['action'];
    const param = el.dataset['actionParam'] ?? null;
    const handler = action ? actionMap.get(action) : undefined;

    if (handler && action) {
      handler(param, e, el);
    }
  });
}
