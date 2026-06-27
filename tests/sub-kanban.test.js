/**
 * Tests for sub-kanban.js: createSubKanbanItem() translated delete tooltip.
 *
 * tasks.js is mocked (it pulls in jspdf via export.js, which doesn't load
 * cleanly under Vitest's Node environment) - only updateNoteCardDisplay is
 * needed by sub-kanban.js and it is never called by createSubKanbanItem().
 */
import { describe, it, expect, beforeEach } from 'vitest';

vi.mock('../scripts/kantrack-modules/tasks.js', () => ({ updateNoteCardDisplay: vi.fn() }));

import { setLanguage } from '../scripts/kantrack-modules/i18n.js';
import { createSubKanbanItem } from '../scripts/kantrack-modules/sub-kanban.js';

// Minimal DOM element stub supporting the APIs createSubKanbanItem() touches.
function createElementStub(tagName) {
  const el = {
    tagName,
    classList: {
      _classes: new Set(),
      add(...names) {
        names.forEach(n => this._classes.add(n));
      },
      contains(name) {
        return this._classes.has(name);
      },
    },
    dataset: {},
    attributes: {},
    children: [],
    textContent: '',
    draggable: false,
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelector(selector) {
      const className = selector.replace(/^\./, '');
      const search = node => {
        for (const child of node.children) {
          if (child.classList.contains(className)) return child;
          const found = search(child);
          if (found) return found;
        }
        return null;
      };
      return search(this);
    },
  };
  return el;
}

beforeEach(() => {
  global.document = {
    createElement: tagName => createElementStub(tagName),
  };
});

describe('createSubKanbanItem', () => {
  it('sets the delete button title from the active dictionary (English UK)', () => {
    setLanguage('en-GB');
    const el = createSubKanbanItem({ id: '1', title: 'Test item', column: 'todo' }, 'parent-1');
    const deleteBtn = el.querySelector('delete-sub-item');
    expect(deleteBtn.title).toBe('Delete');
  });

  it('sets the delete button title from the active dictionary (French)', () => {
    setLanguage('fr');
    const el = createSubKanbanItem({ id: '1', title: 'Test item', column: 'todo' }, 'parent-1');
    const deleteBtn = el.querySelector('delete-sub-item');
    expect(deleteBtn.title).toBe('Supprimer');
    setLanguage('en-GB');
  });
});
