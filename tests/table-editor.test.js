/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  computeGridMap,
  _getTableRows,
  stripTableFormatting,
  handleTablePaste,
  _createTable,
  _addRowToTable,
  _deleteRowFromTable,
  _addColToTable,
  _deleteColFromTable,
  _mergeCellsInTable,
  _unmergeCellInTable,
} from '../scripts/kantrack-modules/table-editor.js';

function makeTable(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.querySelector('table');
}

// ── computeGridMap ────────────────────────────────────────────────────────────

describe('computeGridMap', () => {
  it('maps a simple 2×2 table', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td><td>B</td></tr>
      <tr><td>C</td><td>D</td></tr>
    </tbody></table>`);
    const grid = computeGridMap(t);
    expect(grid.length).toBe(2);
    expect(grid[0].length).toBe(2);
    expect(grid[0][0].cell.textContent).toBe('A');
    expect(grid[0][1].cell.textContent).toBe('B');
    expect(grid[1][0].cell.textContent).toBe('C');
    expect(grid[1][1].cell.textContent).toBe('D');
    expect(grid[0][0]).toMatchObject({ rowspan: 1, colspan: 1, originRow: 0, originCol: 0 });
  });

  it('resolves colspan=2: both columns point to same cell', () => {
    const t = makeTable(`<table><tbody>
      <tr><td colspan="2">AB</td></tr>
      <tr><td>C</td><td>D</td></tr>
    </tbody></table>`);
    const grid = computeGridMap(t);
    expect(grid[0][0].cell).toBe(grid[0][1].cell);
    expect(grid[0][0].colspan).toBe(2);
    expect(grid[0][0].originCol).toBe(0);
    expect(grid[0][1].originCol).toBe(0);
    expect(grid[0][1].originRow).toBe(0);
    expect(grid[1][0].cell.textContent).toBe('C');
    expect(grid[1][1].cell.textContent).toBe('D');
  });

  it('resolves rowspan=2: both rows point to same cell', () => {
    const t = makeTable(`<table><tbody>
      <tr><td rowspan="2">A</td><td>B</td></tr>
      <tr><td>C</td></tr>
    </tbody></table>`);
    const grid = computeGridMap(t);
    expect(grid[0][0].cell).toBe(grid[1][0].cell);
    expect(grid[0][0].rowspan).toBe(2);
    expect(grid[0][0].originRow).toBe(0);
    expect(grid[1][0].originRow).toBe(0);
    expect(grid[1][0].originCol).toBe(0);
    expect(grid[1][1].cell.textContent).toBe('C');
  });

  it('resolves combined rowspan+colspan', () => {
    const t = makeTable(`<table><tbody>
      <tr><td colspan="2" rowspan="2">BIG</td><td>C</td></tr>
      <tr><td>F</td></tr>
    </tbody></table>`);
    const grid = computeGridMap(t);
    const big = grid[0][0].cell;
    expect(grid[0][0].cell).toBe(big);
    expect(grid[0][1].cell).toBe(big);
    expect(grid[1][0].cell).toBe(big);
    expect(grid[1][1].cell).toBe(big);
    expect(grid[0][2].cell.textContent).toBe('C');
    expect(grid[1][2].cell.textContent).toBe('F');
  });

  it('handles thead + tbody rows', () => {
    const t = makeTable(`<table>
      <thead><tr><th>H1</th><th>H2</th></tr></thead>
      <tbody><tr><td>R1</td><td>R2</td></tr></tbody>
    </table>`);
    const grid = computeGridMap(t);
    expect(grid.length).toBe(2);
    expect(grid[0][0].cell.tagName).toBe('TH');
    expect(grid[1][0].cell.tagName).toBe('TD');
  });

  it('returns empty grid for table with no rows', () => {
    const t = makeTable('<table><tbody></tbody></table>');
    const grid = computeGridMap(t);
    expect(grid.length).toBe(0);
  });
});

// ── _getTableRows ──────────────────────────────────────────────────────────────

describe('_getTableRows', () => {
  it('returns rows from thead and tbody', () => {
    const t = makeTable(`<table>
      <thead><tr><th>H</th></tr></thead>
      <tbody><tr><td>R</td></tr><tr><td>R2</td></tr></tbody>
    </table>`);
    expect(_getTableRows(t).length).toBe(3);
  });

  it('returns rows from table without thead/tbody', () => {
    const t = makeTable(`<table><tr><td>A</td></tr><tr><td>B</td></tr></table>`);
    expect(_getTableRows(t).length).toBe(2);
  });
});

// ── stripTableFormatting ──────────────────────────────────────────────────────

describe('stripTableFormatting', () => {
  it('removes style and class from all elements', () => {
    const t = makeTable(`<table style="color:red" class="foo">
      <tbody><tr style="background:blue"><td class="bar" style="font-weight:bold">A</td></tr></tbody>
    </table>`);
    stripTableFormatting(t);
    expect(t.getAttribute('style')).toBeNull();
    expect(t.getAttribute('class')).toBeNull();
    expect(t.querySelector('tr').getAttribute('style')).toBeNull();
    expect(t.querySelector('td').getAttribute('style')).toBeNull();
    expect(t.querySelector('td').getAttribute('class')).toBeNull();
  });

  it('keeps colspan and rowspan on td and th', () => {
    const t = makeTable(`<table>
      <tbody><tr><td colspan="2" rowspan="3" style="color:red">A</td></tr></tbody>
    </table>`);
    stripTableFormatting(t);
    const td = t.querySelector('td');
    expect(td.getAttribute('colspan')).toBe('2');
    expect(td.getAttribute('rowspan')).toBe('3');
    expect(td.getAttribute('style')).toBeNull();
  });

  it('preserves text content', () => {
    const t = makeTable(`<table><tbody><tr><td style="color:red">Hello</td></tr></tbody></table>`);
    stripTableFormatting(t);
    expect(t.querySelector('td').textContent).toBe('Hello');
  });

  it('returns the table element', () => {
    const t = makeTable(`<table><tbody><tr><td>A</td></tr></tbody></table>`);
    expect(stripTableFormatting(t)).toBe(t);
  });
});

// ── handleTablePaste ──────────────────────────────────────────────────────────

describe('handleTablePaste', () => {
  it('returns null when no table in HTML and no plain text', () => {
    expect(handleTablePaste('<p>just text</p>')).toBeNull();
    expect(handleTablePaste('')).toBeNull();
    expect(handleTablePaste('', '')).toBeNull();
  });

  it('returns null when plain text has no tabs (not TSV)', () => {
    expect(handleTablePaste('', 'just plain text')).toBeNull();
    expect(handleTablePaste('', 'line1\nline2\nline3')).toBeNull();
  });

  it('returns a DocumentFragment for HTML containing a table', () => {
    const frag = handleTablePaste('<table><tbody><tr><td>A</td></tr></tbody></table>');
    expect(frag).not.toBeNull();
    expect(frag.querySelector('table')).not.toBeNull();
  });

  it('strips formatting from pasted table', () => {
    const frag = handleTablePaste(
      '<table style="color:red"><tbody><tr><td class="x" colspan="2">A</td></tr></tbody></table>'
    );
    const table = frag.querySelector('table');
    expect(table.getAttribute('style')).toBeNull();
    const td = table.querySelector('td');
    expect(td.getAttribute('class')).toBeNull();
    expect(td.getAttribute('colspan')).toBe('2');
  });

  it('returns fragment with all tables from clipboard HTML', () => {
    const html = `
      <p>text</p>
      <table><tbody><tr><td>T1</td></tr></tbody></table>
      <p>between</p>
      <table><tbody><tr><td>T2</td></tr></tbody></table>
    `;
    const frag = handleTablePaste(html);
    expect(frag.querySelectorAll('table').length).toBe(2);
  });

  // TSV fallback (Numbers, Excel without HTML, any TSV source)
  it('builds a table from TSV plain text when HTML has no table', () => {
    const tsv = 'Name\tAge\tCity\nAlice\t30\tLondon\nBob\t25\tParis';
    const frag = handleTablePaste('', tsv);
    expect(frag).not.toBeNull();
    const table = frag.querySelector('table');
    expect(table).not.toBeNull();
    expect(table.querySelectorAll('th').length).toBe(3);
    expect(table.querySelectorAll('tbody tr').length).toBe(2);
    expect(table.querySelector('th').textContent).toBe('Name');
    expect(table.querySelector('tbody td').textContent).toBe('Alice');
  });

  it('builds a table from TSV when HTML is absent (Numbers-style paste)', () => {
    const tsv = 'Q1\tQ2\tQ3\tQ4\n100\t200\t300\t400\n';
    const frag = handleTablePaste('', tsv);
    const table = frag.querySelector('table');
    expect(table.querySelectorAll('th').length).toBe(4);
    expect(table.querySelectorAll('td').length).toBe(4);
  });

  it('prefers HTML table over TSV when both are present', () => {
    const html = '<table><tbody><tr><td>HTML</td></tr></tbody></table>';
    const tsv = 'TSV\tdata\n1\t2';
    const frag = handleTablePaste(html, tsv);
    expect(frag.querySelector('td').textContent).toBe('HTML');
  });

  it('falls back to TSV when HTML has no table', () => {
    const html = '<p>no table here</p>';
    const tsv = 'A\tB\nC\tD';
    const frag = handleTablePaste(html, tsv);
    const ths = frag.querySelectorAll('th');
    expect(ths.length).toBe(2);
    expect(ths[0].textContent).toBe('A');
  });

  it('handles single-row TSV (column headers only)', () => {
    const tsv = 'Name\tScore\tGrade';
    const frag = handleTablePaste('', tsv);
    const table = frag.querySelector('table');
    expect(table.querySelectorAll('th').length).toBe(3);
    expect(table.querySelectorAll('td').length).toBe(0);
  });

  it('handles uneven TSV rows by padding shorter rows', () => {
    const tsv = 'A\tB\tC\n1\t2';
    const frag = handleTablePaste('', tsv);
    const tds = frag.querySelectorAll('td');
    expect(tds.length).toBe(3);
    expect(tds[2].textContent).toBe('');
  });

  it('handles Windows CRLF line endings in TSV', () => {
    const tsv = 'Col1\tCol2\r\nVal1\tVal2';
    const frag = handleTablePaste('', tsv);
    expect(frag.querySelectorAll('th').length).toBe(2);
    expect(frag.querySelectorAll('td').length).toBe(2);
    expect(frag.querySelector('th').textContent).toBe('Col1');
    expect(frag.querySelector('td').textContent).toBe('Val1');
  });

  it('handles old Mac CR-only line endings in TSV', () => {
    const tsv = 'X\tY\rA\tB';
    const frag = handleTablePaste('', tsv);
    expect(frag.querySelectorAll('th').length).toBe(2);
    expect(frag.querySelectorAll('td').length).toBe(2);
  });

  it('handles empty cells in the middle of a TSV row', () => {
    const tsv = 'A\t\tC\n1\t\t3';
    const frag = handleTablePaste('', tsv);
    const ths = frag.querySelectorAll('th');
    const tds = frag.querySelectorAll('td');
    expect(ths.length).toBe(3);
    expect(ths[1].textContent).toBe('');
    expect(ths[2].textContent).toBe('C');
    expect(tds[1].textContent).toBe('');
    expect(tds[2].textContent).toBe('3');
  });

  it('handles null html by falling back to TSV', () => {
    const frag = handleTablePaste(null, 'A\tB\n1\t2');
    expect(frag).not.toBeNull();
    expect(frag.querySelectorAll('th').length).toBe(2);
  });

  it('returns null for null html and empty plain text', () => {
    expect(handleTablePaste(null, '')).toBeNull();
    expect(handleTablePaste(null)).toBeNull();
  });
});

// ── _createTable ──────────────────────────────────────────────────────────────

describe('_createTable', () => {
  it('creates a table with the correct number of header columns', () => {
    const t = _createTable(3, 4);
    expect(t.querySelectorAll('thead th').length).toBe(4);
  });

  it('creates a table with rows-1 body rows', () => {
    const t = _createTable(3, 4);
    expect(t.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('body rows have the correct number of td cells', () => {
    const t = _createTable(3, 4);
    const bodyRows = t.querySelectorAll('tbody tr');
    bodyRows.forEach(tr => expect(tr.querySelectorAll('td').length).toBe(4));
  });

  it('creates a single-row table with only thead', () => {
    const t = _createTable(1, 3);
    expect(t.querySelector('thead')).not.toBeNull();
    expect(t.querySelector('tbody')).toBeNull();
    expect(t.querySelectorAll('thead th').length).toBe(3);
  });
});

// ── _addRowToTable ─────────────────────────────────────────────────────────────

describe('_addRowToTable', () => {
  it('adds a row after the target row in a simple table', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td><td>B</td></tr>
      <tr><td>C</td><td>D</td></tr>
    </tbody></table>`);
    _addRowToTable(t, 0, 'after');
    expect(_getTableRows(t).length).toBe(3);
    const rows = _getTableRows(t);
    expect(rows[0].querySelectorAll('td').length).toBe(2);
    expect(rows[1].querySelectorAll('td').length).toBe(2);
    expect(rows[1].textContent.trim()).toBe('');
    expect(rows[2].textContent.trim()).toBe('CD');
  });

  it('adds a row before the target row in a simple table', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td><td>B</td></tr>
      <tr><td>C</td><td>D</td></tr>
    </tbody></table>`);
    _addRowToTable(t, 1, 'before');
    expect(_getTableRows(t).length).toBe(3);
    const rows = _getTableRows(t);
    expect(rows[0].textContent.trim()).toBe('AB');
    expect(rows[1].textContent.trim()).toBe('');
    expect(rows[2].textContent.trim()).toBe('CD');
  });

  it('increments rowspan of a cell that spans into the new row (add after)', () => {
    const t = makeTable(`<table><tbody>
      <tr><td rowspan="2">SPAN</td><td>B</td></tr>
      <tr><td>D</td></tr>
    </tbody></table>`);
    _addRowToTable(t, 0, 'after');
    expect(_getTableRows(t).length).toBe(3);
    const spanCell = t.querySelector('[rowspan]');
    expect(spanCell.rowSpan).toBe(3);
    expect(_getTableRows(t)[1].querySelectorAll('td').length).toBe(1);
  });

  it('does not increment rowspan when adding before a spanning cell origin', () => {
    const t = makeTable(`<table><tbody>
      <tr><td rowspan="2">SPAN</td><td>B</td></tr>
      <tr><td>D</td></tr>
    </tbody></table>`);
    _addRowToTable(t, 0, 'before');
    expect(_getTableRows(t).length).toBe(3);
    const spanCell = t.querySelector('[rowspan]');
    expect(spanCell.rowSpan).toBe(2);
    expect(_getTableRows(t)[0].querySelectorAll('td').length).toBe(2);
  });

  it('preserves colspan in new row for colspan cells', () => {
    const t = makeTable(`<table><tbody>
      <tr><td colspan="2">AB</td></tr>
      <tr><td>C</td><td>D</td></tr>
    </tbody></table>`);
    _addRowToTable(t, 0, 'after');
    const newRow = _getTableRows(t)[1];
    expect(newRow.cells.length).toBe(1);
    expect(newRow.cells[0].colSpan).toBe(2);
  });
});

// ── _deleteRowFromTable ────────────────────────────────────────────────────────

describe('_deleteRowFromTable', () => {
  it('removes the target row from a simple table', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td></tr>
      <tr><td>B</td></tr>
      <tr><td>C</td></tr>
    </tbody></table>`);
    _deleteRowFromTable(t, 1);
    const rows = _getTableRows(t);
    expect(rows.length).toBe(2);
    expect(rows[0].textContent.trim()).toBe('A');
    expect(rows[1].textContent.trim()).toBe('C');
  });

  it('removes the entire table when deleting the last row', () => {
    const container = document.createElement('div');
    const t = makeTable(`<table><tbody><tr><td>Only</td></tr></tbody></table>`);
    container.appendChild(t);
    const removed = _deleteRowFromTable(t, 0);
    expect(removed).toBe(true);
    expect(container.querySelector('table')).toBeNull();
  });

  it('returns false when table still exists after deletion', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td></tr>
      <tr><td>B</td></tr>
    </tbody></table>`);
    const removed = _deleteRowFromTable(t, 0);
    expect(removed).toBe(false);
  });

  it('decrements rowspan of a cell spanning from above into the deleted row', () => {
    const t = makeTable(`<table><tbody>
      <tr><td rowspan="3">SPAN</td><td>B</td></tr>
      <tr><td>D</td></tr>
      <tr><td>F</td></tr>
    </tbody></table>`);
    _deleteRowFromTable(t, 1);
    expect(_getTableRows(t).length).toBe(2);
    expect(t.querySelector('[rowspan]').rowSpan).toBe(2);
  });

  it('moves a rowspan cell to the next row when its origin row is deleted', () => {
    const t = makeTable(`<table><tbody>
      <tr><td rowspan="2">SPAN</td><td>B</td></tr>
      <tr><td>D</td></tr>
    </tbody></table>`);
    _deleteRowFromTable(t, 0);
    const rows = _getTableRows(t);
    expect(rows.length).toBe(1);
    const cells = Array.from(rows[0].cells);
    expect(cells.length).toBe(2);
    expect(cells[0].textContent).toBe('SPAN');
    expect(cells[0].rowSpan).toBe(1);
    expect(cells[1].textContent).toBe('D');
  });
});

// ── _addColToTable ────────────────────────────────────────────────────────────

describe('_addColToTable', () => {
  it('adds a column after target column in a simple table', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td><td>B</td></tr>
      <tr><td>C</td><td>D</td></tr>
    </tbody></table>`);
    _addColToTable(t, 0, 'after');
    expect(computeGridMap(t)[0].length).toBe(3);
    const rows = _getTableRows(t);
    expect(rows[0].cells[1].textContent).toBe('');
    expect(rows[0].cells[0].textContent).toBe('A');
    expect(rows[0].cells[2].textContent).toBe('B');
  });

  it('adds a column before target column in a simple table', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td><td>B</td></tr>
      <tr><td>C</td><td>D</td></tr>
    </tbody></table>`);
    _addColToTable(t, 1, 'before');
    const grid = computeGridMap(t);
    expect(grid[0].length).toBe(3);
    const rows = _getTableRows(t);
    expect(rows[0].cells[1].textContent).toBe('');
    expect(rows[0].cells[2].textContent).toBe('B');
  });

  it('increments colspan of a spanning cell when column inserted inside its span', () => {
    const t = makeTable(`<table><tbody>
      <tr><td colspan="2">AB</td><td>C</td></tr>
      <tr><td>D</td><td>E</td><td>F</td></tr>
    </tbody></table>`);
    _addColToTable(t, 0, 'after');
    const spanCell = t.querySelector('[colspan]');
    expect(spanCell.colSpan).toBe(3);
    expect(_getTableRows(t)[1].cells.length).toBe(4);
  });

  it('preserves th in header row when adding column', () => {
    const t = makeTable(`<table>
      <thead><tr><th>H1</th><th>H2</th></tr></thead>
      <tbody><tr><td>A</td><td>B</td></tr></tbody>
    </table>`);
    _addColToTable(t, 0, 'after');
    const headerCells = t.querySelectorAll('thead tr th');
    expect(headerCells.length).toBe(3);
  });
});

// ── _deleteColFromTable ────────────────────────────────────────────────────────

describe('_deleteColFromTable', () => {
  it('removes the target column from a simple table', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td><td>B</td><td>C</td></tr>
      <tr><td>D</td><td>E</td><td>F</td></tr>
    </tbody></table>`);
    _deleteColFromTable(t, 1);
    const rows = _getTableRows(t);
    expect(rows[0].cells.length).toBe(2);
    expect(rows[0].cells[0].textContent).toBe('A');
    expect(rows[0].cells[1].textContent).toBe('C');
  });

  it('removes the table when deleting the last column', () => {
    const container = document.createElement('div');
    const t = makeTable(`<table><tbody><tr><td>Only</td></tr></tbody></table>`);
    container.appendChild(t);
    const removed = _deleteColFromTable(t, 0);
    expect(removed).toBe(true);
    expect(container.querySelector('table')).toBeNull();
  });

  it('returns false when table still exists', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td><td>B</td></tr>
    </tbody></table>`);
    expect(_deleteColFromTable(t, 0)).toBe(false);
  });

  it('decrements colspan instead of removing when cell spans the deleted column', () => {
    const t = makeTable(`<table><tbody>
      <tr><td colspan="3">ABC</td></tr>
      <tr><td>D</td><td>E</td><td>F</td></tr>
    </tbody></table>`);
    _deleteColFromTable(t, 1);
    expect(t.querySelector('[colspan]').colSpan).toBe(2);
    expect(_getTableRows(t)[1].cells.length).toBe(2);
  });
});

// ── _mergeCellsInTable ────────────────────────────────────────────────────────

describe('_mergeCellsInTable', () => {
  it('merges a 1x2 range (two columns) into the top-left cell', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td><td>B</td><td>C</td></tr>
    </tbody></table>`);
    _mergeCellsInTable(t, 0, 0, 0, 1);
    const row = _getTableRows(t)[0];
    expect(row.cells.length).toBe(2);
    expect(row.cells[0].colSpan).toBe(2);
    expect(row.cells[1].textContent).toBe('C');
  });

  it('merges a 2x1 range (two rows) into the top-left cell', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td><td>B</td></tr>
      <tr><td>C</td><td>D</td></tr>
    </tbody></table>`);
    _mergeCellsInTable(t, 0, 0, 1, 0);
    expect(t.querySelector('[rowspan]').rowSpan).toBe(2);
    expect(_getTableRows(t)[0].cells.length).toBe(2);
    expect(_getTableRows(t)[1].cells.length).toBe(1);
  });

  it('merges a 2x2 range and concatenates non-empty text', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td><td>B</td></tr>
      <tr><td>C</td><td></td></tr>
    </tbody></table>`);
    _mergeCellsInTable(t, 0, 0, 1, 1);
    const origin = _getTableRows(t)[0].cells[0];
    expect(origin.colSpan).toBe(2);
    expect(origin.rowSpan).toBe(2);
    expect(origin.textContent).toBe('A\nB\nC');
  });

  it('leaves only the origin cell plus non-merged cells in the table', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td><td>B</td><td>E</td></tr>
      <tr><td>C</td><td>D</td><td>F</td></tr>
    </tbody></table>`);
    _mergeCellsInTable(t, 0, 0, 1, 1);
    expect(_getTableRows(t)[0].cells.length).toBe(2);
    expect(_getTableRows(t)[1].cells.length).toBe(1);
    expect(_getTableRows(t)[0].cells[1].textContent).toBe('E');
    expect(_getTableRows(t)[1].cells[0].textContent).toBe('F');
  });
});

// ── _unmergeCellInTable ───────────────────────────────────────────────────────

describe('_unmergeCellInTable', () => {
  it('splits a colspan=2 cell into two cells in the same row', () => {
    const t = makeTable(`<table><tbody>
      <tr><td colspan="2">AB</td><td>C</td></tr>
    </tbody></table>`);
    _unmergeCellInTable(t, 0, 0);
    const row = _getTableRows(t)[0];
    expect(row.cells.length).toBe(3);
    expect(row.cells[0].colSpan).toBe(1);
    expect(row.cells[0].textContent).toBe('AB');
    expect(row.cells[1].textContent).toBe('');
    expect(row.cells[2].textContent).toBe('C');
  });

  it('splits a rowspan=2 cell into two cells in separate rows', () => {
    const t = makeTable(`<table><tbody>
      <tr><td rowspan="2">A</td><td>B</td></tr>
      <tr><td>D</td></tr>
    </tbody></table>`);
    _unmergeCellInTable(t, 0, 0);
    const rows = _getTableRows(t);
    expect(rows[0].cells.length).toBe(2);
    expect(rows[1].cells.length).toBe(2);
    expect(rows[0].cells[0].rowSpan).toBe(1);
    expect(rows[1].cells[0].textContent).toBe('');
    expect(rows[1].cells[1].textContent).toBe('D');
  });

  it('splits a colspan=2 rowspan=2 cell correctly', () => {
    const t = makeTable(`<table><tbody>
      <tr><td colspan="2" rowspan="2">BIG</td><td>C</td></tr>
      <tr><td>F</td></tr>
    </tbody></table>`);
    _unmergeCellInTable(t, 0, 0);
    const rows = _getTableRows(t);
    expect(rows[0].cells.length).toBe(3);
    expect(rows[1].cells.length).toBe(3);
    expect(rows[0].cells[0].colSpan).toBe(1);
    expect(rows[0].cells[0].rowSpan).toBe(1);
  });

  it('does nothing for a cell with no spans', () => {
    const t = makeTable(`<table><tbody>
      <tr><td>A</td><td>B</td></tr>
    </tbody></table>`);
    const before = _getTableRows(t)[0].cells.length;
    _unmergeCellInTable(t, 0, 0);
    expect(_getTableRows(t)[0].cells.length).toBe(before);
  });
});
