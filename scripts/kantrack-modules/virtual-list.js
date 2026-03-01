/***********************
 * VIRTUAL LIST
 * IntersectionObserver-based windowed rendering for large kanban columns.
 * Only cards in (or near) the viewport are kept in the DOM; spacer divs
 * maintain correct scroll height for off-screen cards.
 *
 * Usage:
 *   const vl = new VirtualList(columnEl, tasks, createNoteElement);
 *   vl.update(newFilteredTasks); // call when data/filter changes
 *   vl.destroy();               // disconnect observer, remove structural nodes
 ***********************/

const INITIAL_RENDER = 20; // cards to render on first paint
const BUFFER = 5; // extra cards above/below the visible area
const CARD_HEIGHT_ESTIMATE = 120; // px — refined after first real render

/**
 * Manages windowed rendering for a single kanban column.
 */
export class VirtualList {
  #container;
  #items;
  #renderItem;
  #topSpacer;
  #bottomSpacer;
  #topSentinel;
  #bottomSentinel;
  #observer;
  #startIndex;
  #endIndex;
  #cardHeight;
  #nodes; // Map<taskId, HTMLElement>

  /**
   * @param {HTMLElement} containerEl  Scrollable column element (overflow: auto)
   * @param {object[]}    items        Sorted + filtered task objects
   * @param {Function}    renderItem   (task) => HTMLElement
   */
  constructor(containerEl, items, renderItem) {
    this.#container = containerEl;
    this.#items = items;
    this.#renderItem = renderItem;
    this.#startIndex = 0;
    this.#endIndex = Math.min(INITIAL_RENDER, items.length);
    this.#cardHeight = CARD_HEIGHT_ESTIMATE;
    this.#nodes = new Map();

    this.#topSpacer = _makeSpacer('vl-top');
    this.#bottomSpacer = _makeSpacer('vl-bottom');
    this.#topSentinel = _makeSentinel('vl-sentinel-top');
    this.#bottomSentinel = _makeSentinel('vl-sentinel-bottom');

    containerEl.appendChild(this.#topSpacer);
    containerEl.appendChild(this.#topSentinel);
    // Rendered cards go between the two sentinels (inserted via #bottomSentinel.before())
    containerEl.appendChild(this.#bottomSentinel);
    containerEl.appendChild(this.#bottomSpacer);

    this.#observer = new IntersectionObserver(entries => this.#onIntersection(entries), {
      root: containerEl,
      rootMargin: '100px',
    });
    this.#observer.observe(this.#topSentinel);
    this.#observer.observe(this.#bottomSentinel);

    this.#render();
  }

  /**
   * Replace the item list and re-render from the top of the window.
   * @param {object[]} newItems  New sorted + filtered task objects
   */
  update(newItems) {
    this.#items = newItems;
    this.#startIndex = 0;
    this.#endIndex = Math.min(INITIAL_RENDER, newItems.length);
    this.#clearNodes();
    this.#render();
  }

  /**
   * Return the live DOM element for a task ID, or null if off-screen.
   * @param {string} taskId
   * @returns {HTMLElement|null}
   */
  getRenderedElement(taskId) {
    return this.#nodes.get(taskId) ?? null;
  }

  /**
   * Disconnect the observer and remove all VL-owned DOM nodes.
   */
  destroy() {
    this.#observer.disconnect();
    this.#clearNodes();
    this.#topSpacer.remove();
    this.#bottomSpacer.remove();
    this.#topSentinel.remove();
    this.#bottomSentinel.remove();
  }

  // ── Private ──────────────────────────────────────────────────

  #onIntersection(entries) {
    let changed = false;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (entry.target === this.#bottomSentinel) {
        const newEnd = Math.min(this.#endIndex + BUFFER, this.#items.length);
        if (newEnd !== this.#endIndex) {
          this.#endIndex = newEnd;
          changed = true;
        }
      } else if (entry.target === this.#topSentinel) {
        const newStart = Math.max(0, this.#startIndex - BUFFER);
        if (newStart !== this.#startIndex) {
          this.#startIndex = newStart;
          changed = true;
        }
      }
    }
    if (changed) this.#render();
  }

  #render() {
    const items = this.#items;
    const start = this.#startIndex;
    const end = this.#endIndex;
    const h = this.#cardHeight;

    this.#topSpacer.style.height = `${start * h}px`;
    this.#bottomSpacer.style.height = `${Math.max(0, items.length - end) * h}px`;

    // Remove cards that slid out of the render window
    for (const [id, el] of this.#nodes) {
      const idx = items.findIndex(t => t.id === id);
      if (idx < start || idx >= end) {
        el.remove();
        this.#nodes.delete(id);
      }
    }

    // Add cards that entered the render window, preserving DOM order.
    // Always inserting before #bottomSentinel would be wrong for scroll-up: cards
    // at the top of the new window would end up AFTER existing rendered cards.
    // Instead, each new card is inserted before the next already-rendered card
    // (or before #bottomSentinel if it is the last in the window).
    for (let i = start; i < end; i++) {
      const task = items[i];
      if (!this.#nodes.has(task.id)) {
        const el = this.#renderItem(task);
        this.#nodes.set(task.id, el);
        let anchor = this.#bottomSentinel;
        for (let j = i + 1; j < end; j++) {
          const nextEl = this.#nodes.get(items[j]?.id);
          if (nextEl) {
            anchor = nextEl;
            break;
          }
        }
        anchor.before(el);
      }
    }

    // Refine card height estimate after first real render
    if (this.#cardHeight === CARD_HEIGHT_ESTIMATE && this.#nodes.size > 0) {
      const firstEl = this.#nodes.values().next().value;
      const measured = firstEl?.getBoundingClientRect().height;
      if (measured && measured > 0) this.#cardHeight = measured;
    }
  }

  #clearNodes() {
    for (const el of this.#nodes.values()) el.remove();
    this.#nodes.clear();
  }
}

function _makeSpacer(cls) {
  const el = document.createElement('div');
  el.className = `vl-spacer ${cls}`;
  el.style.height = '0';
  return el;
}

function _makeSentinel(cls) {
  const el = document.createElement('div');
  el.className = `vl-sentinel ${cls}`;
  return el;
}
