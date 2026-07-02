import { applyTranslations } from './i18n.js';

let _editor = null;
let _selStart = null;
let _selEnd = null;
let _dragTable = null;
let _selTable = null;

// ── helpers ───────────────────────────────────────────────────────────────────

export function _getTableRows(table) {
  // tfoot intentionally excluded: this feature creates thead/tbody tables only
  return Array.from(
    table.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr')
  );
}

function _getGridWidth(grid) {
  return grid.reduce((max, row) => Math.max(max, row ? row.length : 0), 0);
}

// ── computeGridMap ────────────────────────────────────────────────────────────

export function computeGridMap(table) {
  const rows = _getTableRows(table);
  const grid = [];
  for (let r = 0; r < rows.length; r++) {
    if (!grid[r]) grid[r] = [];
    let c = 0;
    for (const cell of Array.from(rows[r].cells)) {
      while (grid[r][c]) c++;
      const rowspan = cell.rowSpan || 1;
      const colspan = cell.colSpan || 1;
      for (let dr = 0; dr < rowspan; dr++) {
        if (!grid[r + dr]) grid[r + dr] = [];
        for (let dc = 0; dc < colspan; dc++) {
          grid[r + dr][c + dc] = { cell, rowspan, colspan, originRow: r, originCol: c };
        }
      }
      c += colspan;
    }
  }
  return grid;
}

// ── stripTableFormatting ──────────────────────────────────────────────────────

export function stripTableFormatting(tableEl) {
  const KEEP = { td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] };
  for (const el of [tableEl, ...tableEl.querySelectorAll('*')]) {
    const tag = el.tagName.toLowerCase();
    const keep = KEEP[tag] || [];
    for (const attr of Array.from(el.attributes)) {
      if (!keep.includes(attr.name.toLowerCase())) el.removeAttribute(attr.name);
    }
  }
  return tableEl;
}

// ── handleTablePaste ──────────────────────────────────────────────────────────

function _tsvToTable(text) {
  if (!text) return null;
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return null;
  if (!lines[0].includes('\t')) return null;

  const rows = lines.map(line => line.split('\t'));
  const maxCols = Math.max(...rows.map(r => r.length));

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  rows.forEach((cells, ri) => {
    const tr = document.createElement('tr');
    for (let c = 0; c < maxCols; c++) {
      const cell = document.createElement(ri === 0 ? 'th' : 'td');
      cell.textContent = cells[c] !== undefined ? cells[c] : '';
      tr.appendChild(cell);
    }
    if (ri === 0) thead.appendChild(tr);
    else tbody.appendChild(tr);
  });

  table.appendChild(thead);
  if (tbody.children.length > 0) table.appendChild(tbody);
  return table;
}

export function handleTablePaste(html, plainText = '') {
  // 1. Try HTML table (works for Excel, web, Word, Pages, sometimes Numbers)
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tables = Array.from(doc.body.querySelectorAll('table'));
    if (tables.length > 0) {
      const frag = document.createDocumentFragment();
      for (const table of tables) {
        stripTableFormatting(table);
        frag.appendChild(document.adoptNode(table));
      }
      return frag;
    }
  }

  // 2. TSV fallback: handles Numbers (and any app that puts TSV in text/plain)
  const table = _tsvToTable(plainText);
  if (table) {
    const frag = document.createDocumentFragment();
    frag.appendChild(table);
    return frag;
  }

  return null;
}

// ── _createTable ──────────────────────────────────────────────────────────────

export function _createTable(rows, cols) {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');
  for (let c = 0; c < cols; c++) hrow.appendChild(document.createElement('th'));
  thead.appendChild(hrow);
  table.appendChild(thead);
  if (rows > 1) {
    const tbody = document.createElement('tbody');
    for (let r = 1; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) tr.appendChild(document.createElement('td'));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
  }
  return table;
}

// ── _addRowToTable ────────────────────────────────────────────────────────────

export function _addRowToTable(table, rowIndex, direction) {
  const grid = computeGridMap(table);
  const rows = _getTableRows(table);
  const targetRow = rows[rowIndex];
  const numCols = _getGridWidth(grid);
  const newRow = document.createElement('tr');
  const seenCells = new Set();

  for (let c = 0; c < numCols; ) {
    const entry = grid[rowIndex] && grid[rowIndex][c];
    if (!entry) {
      newRow.appendChild(document.createElement('td'));
      c++;
      continue;
    }
    if (entry.originCol < c) {
      c++;
      continue;
    }

    const spansIntoNewRow =
      direction === 'after'
        ? entry.originRow + entry.rowspan - 1 > rowIndex
        : entry.originRow < rowIndex;

    if (spansIntoNewRow) {
      if (!seenCells.has(entry.cell)) {
        seenCells.add(entry.cell);
        entry.cell.rowSpan = (entry.cell.rowSpan || 1) + 1;
      }
    } else {
      const td = document.createElement('td');
      if (entry.colspan > 1) td.colSpan = entry.colspan;
      newRow.appendChild(td);
    }
    c += entry.colspan;
  }

  if (direction === 'after') targetRow.after(newRow);
  else targetRow.before(newRow);
}

// ── _deleteRowFromTable ───────────────────────────────────────────────────────

export function _deleteRowFromTable(table, rowIndex) {
  const grid = computeGridMap(table);
  const rows = _getTableRows(table);

  if (rows.length === 1) {
    table.remove();
    return true;
  }

  const targetRow = rows[rowIndex];
  const numCols = _getGridWidth(grid);
  const seenCells = new Set();

  for (let c = 0; c < numCols; ) {
    const entry = grid[rowIndex] && grid[rowIndex][c];
    if (!entry) {
      c++;
      continue;
    }
    if (entry.originCol < c) {
      c++;
      continue;
    }

    if (!seenCells.has(entry.cell)) {
      seenCells.add(entry.cell);
      if (entry.rowspan > 1) {
        entry.cell.rowSpan = entry.cell.rowSpan - 1;
        if (entry.originRow === rowIndex) {
          const nextRow = rows[rowIndex + 1];
          if (nextRow) {
            let insertBefore = null;
            const nextRowEntries = grid[rowIndex + 1] || [];
            for (let nc = entry.originCol + entry.colspan; nc < numCols; nc++) {
              const ne = nextRowEntries[nc];
              if (ne && ne.originRow === rowIndex + 1 && ne.originCol === nc) {
                insertBefore = ne.cell;
                break;
              }
            }
            nextRow.insertBefore(entry.cell, insertBefore || null);
          }
        }
      }
    }
    c += entry.colspan;
  }

  targetRow.remove();
  return false;
}

// ── _addColToTable ────────────────────────────────────────────────────────────

export function _addColToTable(table, colIndex, direction) {
  const grid = computeGridMap(table);
  const rows = _getTableRows(table);
  const seenCells = new Set();

  for (let r = 0; r < rows.length; r++) {
    const entry = grid[r] && grid[r][colIndex];
    if (!entry) {
      rows[r].appendChild(document.createElement('td'));
      continue;
    }
    if (seenCells.has(entry.cell)) continue;
    seenCells.add(entry.cell);

    const spansAcross =
      direction === 'after'
        ? entry.originCol + entry.colspan - 1 > colIndex
        : entry.originCol < colIndex;

    if (spansAcross) {
      entry.cell.colSpan = (entry.cell.colSpan || 1) + 1;
    } else {
      const newCell = document.createElement(entry.cell.tagName.toLowerCase());
      if (direction === 'after') entry.cell.after(newCell);
      else entry.cell.before(newCell);
    }
  }
}

// ── _deleteColFromTable ───────────────────────────────────────────────────────

export function _deleteColFromTable(table, colIndex) {
  const grid = computeGridMap(table);
  const numCols = _getGridWidth(grid);
  if (numCols === 1) {
    table.remove();
    return true;
  }

  const rows = _getTableRows(table);
  const seenCells = new Set();

  for (let r = 0; r < rows.length; r++) {
    const entry = grid[r] && grid[r][colIndex];
    if (!entry || seenCells.has(entry.cell)) continue;
    seenCells.add(entry.cell);
    if (entry.colspan > 1) entry.cell.colSpan = entry.cell.colSpan - 1;
    else entry.cell.remove();
  }
  return false;
}

// ── _mergeCellsInTable ────────────────────────────────────────────────────────

export function _mergeCellsInTable(table, r1, c1, r2, c2) {
  const grid = computeGridMap(table);
  const cells = new Set();
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const entry = grid[r] && grid[r][c];
      if (entry) cells.add(entry.cell);
    }
  }
  const originCell = grid[r1][c1].cell;
  const texts = [];
  for (const cell of cells) {
    const t = cell.textContent.trim();
    if (t) texts.push(t);
  }
  originCell.colSpan = c2 - c1 + 1;
  originCell.rowSpan = r2 - r1 + 1;
  originCell.textContent = texts.join('\n');
  for (const cell of cells) {
    if (cell !== originCell) cell.remove();
  }
}

// ── _unmergeCellInTable ───────────────────────────────────────────────────────

export function _unmergeCellInTable(table, rowIndex, colIndex) {
  const grid = computeGridMap(table);
  const entry = grid[rowIndex] && grid[rowIndex][colIndex];
  if (!entry) return;
  const cell = entry.cell;
  const colspan = cell.colSpan || 1;
  const rowspan = cell.rowSpan || 1;
  if (colspan === 1 && rowspan === 1) return;

  const rows = _getTableRows(table);
  cell.colSpan = 1;
  cell.rowSpan = 1;

  for (let dr = 0; dr < rowspan; dr++) {
    const targetRow = rows[rowIndex + dr];
    if (!targetRow) continue;
    let prevCellInRow = dr === 0 ? cell : null;
    const startDc = dr === 0 ? 1 : 0;
    for (let dc = startDc; dc < colspan; dc++) {
      const newCell = document.createElement('td');
      if (prevCellInRow) {
        prevCellInRow.after(newCell);
      } else {
        let insertBefore = null;
        for (let nc = colIndex + colspan; nc < _getGridWidth(grid); nc++) {
          const ne = (grid[rowIndex + dr] || [])[nc];
          if (ne && ne.originRow === rowIndex + dr && ne.originCol === nc) {
            insertBefore = ne.cell;
            break;
          }
        }
        targetRow.insertBefore(newCell, insertBefore || null);
      }
      prevCellInRow = newCell;
    }
  }
}

// ── cursor helpers ────────────────────────────────────────────────────────────

function _getCursorCell() {
  if (!_editor) return null;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  while (node && node !== _editor) {
    if (node.nodeName === 'TD' || node.nodeName === 'TH') return node;
    node = node.parentNode;
  }
  return null;
}

function _getCursorTable() {
  const cell = _getCursorCell();
  if (!cell) return null;
  let node = cell.parentNode;
  while (node && node !== _editor) {
    if (node.nodeName === 'TABLE') return node;
    node = node.parentNode;
  }
  return null;
}

function _getCursorPosition(table, cell) {
  const targetCell = cell || _getCursorCell();
  if (!targetCell) return null;
  const grid = computeGridMap(table);
  for (let r = 0; r < grid.length; r++) {
    if (!grid[r]) continue;
    for (let c = 0; c < grid[r].length; c++) {
      const entry = grid[r][c];
      if (entry && entry.cell === targetCell && entry.originRow === r && entry.originCol === c) {
        return { rowIndex: r, colIndex: c };
      }
    }
  }
  return null;
}

// ── toolbar state ─────────────────────────────────────────────────────────────

export function updateTableToolbar() {
  const cell = _getCursorCell();
  const inTable = cell !== null || _selStart !== null;
  const createBtn = document.getElementById('createTableBtn');
  if (createBtn) {
    createBtn.textContent = inTable ? '⊞ Table ▾' : '⊞ Table';
    createBtn.classList.toggle('format-btn-active', inTable);
  }
  if (!inTable) document.getElementById('tableDropdown')?.remove();
}

export function resetTableEditor() {
  if (_editor) {
    _editor
      .querySelectorAll('.table-cell-selected')
      .forEach(el => el.classList.remove('table-cell-selected'));
  }
  _selStart = null;
  _selEnd = null;
  _dragTable = null;
  _selTable = null;
  document.getElementById('tableDropdown')?.remove();
  updateTableToolbar();
}

function _placeCursorInCell(cell) {
  if (!cell) return;
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(true);
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// ── cell selection ────────────────────────────────────────────────────────────

function _highlightRange(table) {
  if (_editor)
    _editor
      .querySelectorAll('.table-cell-selected')
      .forEach(el => el.classList.remove('table-cell-selected'));
  if (!_selStart || !_selEnd) return;
  const grid = computeGridMap(table);
  const r1 = Math.min(_selStart.rowIndex, _selEnd.rowIndex);
  const r2 = Math.max(_selStart.rowIndex, _selEnd.rowIndex);
  const c1 = Math.min(_selStart.colIndex, _selEnd.colIndex);
  const c2 = Math.max(_selStart.colIndex, _selEnd.colIndex);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const entry = grid[r] && grid[r][c];
      if (entry) entry.cell.classList.add('table-cell-selected');
    }
  }
}

function _clearCellSelection() {
  if (_editor) {
    _editor
      .querySelectorAll('.table-cell-selected')
      .forEach(el => el.classList.remove('table-cell-selected'));
  }
  _selStart = null;
  _selEnd = null;
  _dragTable = null;
  _selTable = null;
}

// ── UI-facing wrappers ────────────────────────────────────────────────────────

function _makeParagraph() {
  const p = document.createElement('p');
  p.appendChild(document.createElement('br'));
  return p;
}

export function insertTable(rows, cols) {
  if (!_editor) return;
  const table = _createTable(rows, cols);
  const after = _makeParagraph();
  const frag = document.createDocumentFragment();
  frag.appendChild(table);
  frag.appendChild(after);

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && _editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(frag);
  } else {
    _editor.appendChild(frag);
  }

  // Ensure a text node exists before the table so the user can click above it
  if (_editor.firstChild === table) {
    _editor.insertBefore(_makeParagraph(), table);
  }

  // Place cursor in the paragraph after the table
  const newRange = document.createRange();
  newRange.setStart(after, 0);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);

  updateTableToolbar();
}

export function deleteTable() {
  const table = _getCursorTable();
  if (table) table.remove();
  updateTableToolbar();
}

export function addRowBefore() {
  const table = _getCursorTable();
  if (!table) return;
  const pos = _getCursorPosition(table);
  if (!pos) return;
  _addRowToTable(table, pos.rowIndex, 'before');
}

export function addRowAfter() {
  const table = _getCursorTable();
  if (!table) return;
  const pos = _getCursorPosition(table);
  if (!pos) return;
  _addRowToTable(table, pos.rowIndex, 'after');
}

export function deleteRow() {
  const table = _getCursorTable();
  if (!table) return;
  const pos = _getCursorPosition(table);
  if (!pos) return;
  _deleteRowFromTable(table, pos.rowIndex);
  _placeCursorInCell(table.querySelector('td, th'));
  updateTableToolbar();
}

export function addColBefore() {
  const table = _getCursorTable();
  if (!table) return;
  const pos = _getCursorPosition(table);
  if (!pos) return;
  _addColToTable(table, pos.colIndex, 'before');
}

export function addColAfter() {
  const table = _getCursorTable();
  if (!table) return;
  const pos = _getCursorPosition(table);
  if (!pos) return;
  _addColToTable(table, pos.colIndex, 'after');
}

export function deleteCol() {
  const table = _getCursorTable();
  if (!table) return;
  const pos = _getCursorPosition(table);
  if (!pos) return;
  _deleteColFromTable(table, pos.colIndex);
  _placeCursorInCell(table.querySelector('td, th'));
  updateTableToolbar();
}

export function mergeCells() {
  if (!_selStart || !_selEnd || !_selTable) return;
  const r1 = Math.min(_selStart.rowIndex, _selEnd.rowIndex);
  const r2 = Math.max(_selStart.rowIndex, _selEnd.rowIndex);
  const c1 = Math.min(_selStart.colIndex, _selEnd.colIndex);
  const c2 = Math.max(_selStart.colIndex, _selEnd.colIndex);
  _mergeCellsInTable(_selTable, r1, c1, r2, c2);
  const grid = computeGridMap(_selTable);
  const originCell = grid[r1] && grid[r1][c1] && grid[r1][c1].cell;
  _clearCellSelection();
  _placeCursorInCell(originCell || _selTable.querySelector('td, th'));
  updateTableToolbar();
}

export function unmergeCells() {
  const table = _getCursorTable() || _selTable;
  if (!table) return;
  const cell = _getCursorCell();
  const pos = cell ? _getCursorPosition(table, cell) : _selStart ? _selStart : null;
  if (!pos) return;
  _unmergeCellInTable(table, pos.rowIndex, pos.colIndex);
  _clearCellSelection();
  const grid = computeGridMap(table);
  const targetCell =
    grid[pos.rowIndex] && grid[pos.rowIndex][pos.colIndex] && grid[pos.rowIndex][pos.colIndex].cell;
  _placeCursorInCell(targetCell || table.querySelector('td, th'));
  updateTableToolbar();
}

// ── dimension prompt ──────────────────────────────────────────────────────────

function _showCreatePrompt() {
  const existing = document.getElementById('tableCreatePrompt');
  if (existing) existing.remove();

  const prompt = document.createElement('div');
  prompt.id = 'tableCreatePrompt';
  prompt.className = 'table-create-prompt';
  prompt.innerHTML = `
    <label><span data-i18n="modal.task.tableRowsLabel">Rows</span>
      <input id="tableRowsInput" type="number" min="1" value="3">
    </label>
    <label><span data-i18n="modal.task.tableColsLabel">Cols</span>
      <input id="tableColsInput" type="number" min="1" value="3">
    </label>
    <button id="tableCreateConfirmBtn" class="format-btn" data-i18n="modal.task.tableCreateConfirm">Create</button>
  `;

  const createBtn = document.getElementById('createTableBtn');
  createBtn.parentNode.insertBefore(prompt, createBtn.nextSibling);

  document.getElementById('tableCreateConfirmBtn').addEventListener('mousedown', e => {
    e.preventDefault();
    const rows = Math.max(1, parseInt(document.getElementById('tableRowsInput').value, 10) || 3);
    const cols = Math.max(1, parseInt(document.getElementById('tableColsInput').value, 10) || 3);
    prompt.remove();
    if (_editor) _editor.focus();
    insertTable(rows, cols);
  });

  const onClickOutside = e => {
    if (!prompt.contains(e.target) && e.target.id !== 'createTableBtn') {
      prompt.remove();
      document.removeEventListener('mousedown', onClickOutside, true);
    }
  };
  document.addEventListener('mousedown', onClickOutside, true);
}

// ── table action dropdown ─────────────────────────────────────────────────────

function _showTableDropdown() {
  const existing = document.getElementById('tableDropdown');
  if (existing) {
    existing.remove();
    return;
  }

  const dropdown = document.createElement('div');
  dropdown.id = 'tableDropdown';
  dropdown.className = 'table-dropdown';

  const items = [
    { type: 'group', label: 'Table' },
    {
      type: 'item',
      icon: '✕',
      label: 'Delete Table',
      i18n: 'modal.task.deleteTableTooltip',
      action: deleteTable,
      danger: true,
    },
    { type: 'divider' },
    { type: 'group', label: 'Rows' },
    {
      type: 'item',
      icon: '↑',
      label: 'Add Row Above',
      i18n: 'modal.task.addRowBeforeTooltip',
      action: addRowBefore,
    },
    {
      type: 'item',
      icon: '↓',
      label: 'Add Row Below',
      i18n: 'modal.task.addRowAfterTooltip',
      action: addRowAfter,
    },
    {
      type: 'item',
      icon: '✕',
      label: 'Delete Row',
      i18n: 'modal.task.deleteRowTooltip',
      action: deleteRow,
      danger: true,
    },
    { type: 'divider' },
    { type: 'group', label: 'Columns' },
    {
      type: 'item',
      icon: '←',
      label: 'Add Column Left',
      i18n: 'modal.task.addColBeforeTooltip',
      action: addColBefore,
    },
    {
      type: 'item',
      icon: '→',
      label: 'Add Column Right',
      i18n: 'modal.task.addColAfterTooltip',
      action: addColAfter,
    },
    {
      type: 'item',
      icon: '✕',
      label: 'Delete Column',
      i18n: 'modal.task.deleteColTooltip',
      action: deleteCol,
      danger: true,
    },
    { type: 'divider' },
    { type: 'group', label: 'Cells' },
    {
      type: 'item',
      icon: '⊞',
      label: 'Merge Cells',
      i18n: 'modal.task.mergeCellsTooltip',
      action: mergeCells,
    },
    {
      type: 'item',
      icon: '⊟',
      label: 'Unmerge Cell',
      i18n: 'modal.task.unmergeCellsTooltip',
      action: unmergeCells,
    },
  ];

  for (const item of items) {
    if (item.type === 'group') {
      const el = document.createElement('div');
      el.className = 'table-dropdown-group';
      el.textContent = item.label;
      dropdown.appendChild(el);
    } else if (item.type === 'divider') {
      const el = document.createElement('div');
      el.className = 'table-dropdown-divider';
      dropdown.appendChild(el);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'table-dropdown-item' + (item.danger ? ' tdi-danger' : '');
      const icon = document.createElement('span');
      icon.className = 'tdi-icon';
      icon.textContent = item.icon;
      const label = document.createElement('span');
      label.setAttribute('data-i18n', item.i18n);
      label.textContent = item.label;
      btn.appendChild(icon);
      btn.appendChild(label);
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        dropdown.remove();
        item.action();
      });
      dropdown.appendChild(btn);
    }
  }

  applyTranslations(dropdown);

  const createBtn = document.getElementById('createTableBtn');
  createBtn.closest('.notes-toolbar-right').appendChild(dropdown);

  const dismiss = e => {
    if (!dropdown.contains(e.target) && e.target.id !== 'createTableBtn') {
      dropdown.remove();
      document.removeEventListener('mousedown', dismiss, true);
      document.removeEventListener('keydown', onKey);
    }
  };
  const onKey = e => {
    if (e.key === 'Escape') {
      dropdown.remove();
      document.removeEventListener('mousedown', dismiss, true);
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('mousedown', dismiss, true);
  document.addEventListener('keydown', onKey);
}

// ── init ──────────────────────────────────────────────────────────────────────

export function initTableEditor(editor) {
  _editor = editor;

  document.getElementById('createTableBtn')?.addEventListener('mousedown', e => {
    e.preventDefault();
    const inTable = _getCursorCell() !== null || _selStart !== null;
    if (inTable) {
      _showTableDropdown();
    } else {
      _showCreatePrompt();
    }
  });

  // Cell range selection: click-drag or shift-click
  editor.addEventListener('mousedown', e => {
    const cell = e.target.closest('td, th');
    if (!cell || !editor.contains(cell)) {
      _clearCellSelection();
      updateTableToolbar();
      return;
    }
    const table = cell.closest('table');
    if (!table) return;
    const pos = _getCursorPosition(table, cell);
    if (!pos) return;

    if (e.shiftKey && _selStart && _dragTable === table) {
      e.preventDefault();
      _selEnd = pos;
      _highlightRange(table);
      updateTableToolbar();
    } else {
      _clearCellSelection();
      _selStart = pos;
      _selEnd = null;
      _dragTable = table;
      _selTable = table;
    }
  });

  editor.addEventListener('mousemove', e => {
    if (!(e.buttons & 1) || !_selStart || !_dragTable) return;
    const cell = e.target.closest('td, th');
    if (!cell || !editor.contains(cell) || !_dragTable.contains(cell)) return;
    const pos = _getCursorPosition(_dragTable, cell);
    if (!pos) return;
    if (_selEnd && pos.rowIndex === _selEnd.rowIndex && pos.colIndex === _selEnd.colIndex) return;
    e.preventDefault();
    _selEnd = pos;
    _highlightRange(_dragTable);
    updateTableToolbar();
  });

  editor.addEventListener('mouseup', () => {
    _dragTable = null;
  });

  // Update toolbar whenever the cursor moves in the editor
  document.addEventListener('selectionchange', () => {
    if (
      _editor &&
      (document.activeElement === _editor || _editor.contains(document.activeElement))
    ) {
      updateTableToolbar();
    }
  });
}
