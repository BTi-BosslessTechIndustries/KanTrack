/**
 * KanTrack E2E tests: notebook ZIP import/export and "Download everything" button.
 *
 * Covers:
 *   1. "Download everything" button is visible, first in controls row, and styled correctly.
 *   2. "Download everything" triggers two downloads: a workspace JSON and a notebook ZIP.
 *   3. Notebook ZIP export includes actual page content from IDB (not empty pages from state).
 *   4. Notebook ZIP import saves page content correctly to IDB.
 *   5. Notebook ZIP import does not wipe content of pages already in the notebook.
 */
import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'fs';

// Clear the notebook_items IDB store directly.
async function clearNotebookItems(page) {
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('KanbanDB');
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
    const tx = db.transaction('notebook_items', 'readwrite');
    tx.objectStore('notebook_items').clear();
    await new Promise(resolve => {
      tx.oncomplete = resolve;
    });
  });
}

// Write notebook items directly into IDB, bypassing the app layer.
async function injectNotebookItems(page, items) {
  await page.evaluate(async items => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('KanbanDB');
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
    const tx = db.transaction('notebook_items', 'readwrite');
    for (const item of items) {
      tx.objectStore('notebook_items').put(item);
    }
    await new Promise(resolve => {
      tx.oncomplete = resolve;
    });
  }, items);
}

// Read a single notebook item from IDB by id.
async function getNotebookItemFromIDB(page, id) {
  return page.evaluate(async id => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('KanbanDB');
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
    return new Promise(resolve => {
      const req = db
        .transaction('notebook_items', 'readonly')
        .objectStore('notebook_items')
        .get(id);
      req.onsuccess = () => resolve(req.result);
    });
  }, id);
}

// Build a minimal valid notebook ZIP buffer in Node, usable with setInputFiles.
async function buildNotebookZip(items) {
  const zip = new JSZip();
  zip.file(
    'notebook_data.json',
    JSON.stringify({
      exportDate: new Date().toISOString(),
      version: 1,
      items,
    })
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

// ── Download everything button ─────────────────────────────────────────────

test.describe('Download everything button', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();
  });

  test('is visible, carries the export-btn--all class, and is the first child of the controls row', async ({
    page,
  }) => {
    const btn = page.locator('[data-action="board:exportEverything"]');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveClass(/export-btn--all/);

    const isFirstChild = await page.evaluate(() => {
      const row = document.querySelector('.controls-row-secondary');
      return row.firstElementChild?.getAttribute('data-action') === 'board:exportEverything';
    });
    expect(isFirstChild).toBe(true);
  });

  test('triggers two downloads: a workspace JSON and a notebook ZIP', async ({ page }) => {
    // Inject a page so exportAllNotebook does not bail with "No pages to export."
    await clearNotebookItems(page);
    await injectNotebookItems(page, [
      {
        id: 'trigger-test-page',
        type: 'page',
        name: 'Trigger Test',
        parentId: null,
        content: '<p>test</p>',
        order: 0,
      },
    ]);
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('.top-header')).toBeVisible();

    // Register both listeners before the click so neither download is missed.
    const jsonDownload = page.waitForEvent('download', d =>
      d.suggestedFilename().endsWith('.kantrack.json')
    );
    const zipDownload = page.waitForEvent('download', d => d.suggestedFilename().endsWith('.zip'));

    await page.locator('[data-action="board:exportEverything"]').click();

    const [json, zip] = await Promise.all([jsonDownload, zipDownload]);

    expect(json.suggestedFilename()).toMatch(/KanTrack_.*\.kantrack\.json$/);
    expect(zip.suggestedFilename()).toMatch(/Notebook_Export_.*\.zip$/);
  });
});

// ── Notebook ZIP export ────────────────────────────────────────────────────

test.describe('Notebook ZIP export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearNotebookItems(page);
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('.top-header')).toBeVisible();
  });

  test('notebook_data.json inside the ZIP contains page content from IDB', async ({ page }) => {
    await injectNotebookItems(page, [
      {
        id: 'export-content-page',
        type: 'page',
        name: 'Export Content Test',
        parentId: null,
        content: '<p>Export test content</p>',
        order: 0,
      },
    ]);

    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('.top-header')).toBeVisible();

    // Open the notebook sidebar so the export button is interactive.
    await page.locator('.notebook-toggle-btn').click();
    await expect(page.locator('#notebookSidebar')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-action="notebook:exportAll"]').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/Notebook_Export_.*\.zip$/);

    const buffer = fs.readFileSync(await download.path());
    const zip = await JSZip.loadAsync(buffer);

    const dataFile = zip.file('notebook_data.json');
    expect(dataFile).not.toBeNull();

    const notebookData = JSON.parse(await dataFile.async('string'));
    const exported = notebookData.items.find(i => i.id === 'export-content-page');
    expect(exported).toBeDefined();
    expect(exported.content).toBe('<p>Export test content</p>');
  });
});

// ── Notebook ZIP import ────────────────────────────────────────────────────

test.describe('Notebook ZIP import', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearNotebookItems(page);
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('.top-header')).toBeVisible();
  });

  test('saves imported page content to IDB', async ({ page }) => {
    const importContent = '<p>Imported page content</p>';
    const zipBuffer = await buildNotebookZip([
      {
        id: 'zip-import-page',
        type: 'page',
        name: 'Zip Import Page',
        parentId: null,
        content: importContent,
        order: 0,
        images: [],
      },
    ]);

    // Open the sidebar so the notebook module has registered the import handler.
    await page.locator('.notebook-toggle-btn').click();
    await expect(page.locator('#notebookSidebar')).toBeVisible();

    // Accept the success alert that fires after the import completes.
    page.once('dialog', d => d.accept());

    await page.locator('#notebookImportFile').setInputFiles({
      name: 'notebook.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    });

    // Confirm the custom import dialog.
    await page.locator('#kt-notebook-import').click();

    // Wait for the 300 ms debounced IDB write to complete.
    await page.waitForTimeout(600);

    // The import assigns a new UUID; find the page by name in IDB.
    const content = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('KanbanDB');
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
      });
      const items = await new Promise(resolve => {
        const req = db
          .transaction('notebook_items', 'readonly')
          .objectStore('notebook_items')
          .getAll();
        req.onsuccess = () => resolve(req.result);
      });
      return items.find(i => i.name === 'Zip Import Page')?.content;
    });

    expect(content).toBe(importContent);
  });

  test('does not wipe content of pages already in the notebook', async ({ page }) => {
    const existingContent = '<p>Existing content that must survive the import</p>';

    // Inject an existing page with content into IDB.
    await injectNotebookItems(page, [
      {
        id: 'pre-existing-page',
        type: 'page',
        name: 'Pre-existing Page',
        parentId: null,
        content: existingContent,
        order: 0,
      },
    ]);

    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('.top-header')).toBeVisible();

    // Build a ZIP that contains a completely different page.
    const zipBuffer = await buildNotebookZip([
      {
        id: 'new-page-from-zip',
        type: 'page',
        name: 'New Page From Zip',
        parentId: null,
        content: '<p>Brand new content</p>',
        order: 1,
        images: [],
      },
    ]);

    await page.locator('.notebook-toggle-btn').click();
    await expect(page.locator('#notebookSidebar')).toBeVisible();

    // Accept the success alert that fires after the import completes.
    page.once('dialog', d => d.accept());

    await page.locator('#notebookImportFile').setInputFiles({
      name: 'new-pages.zip',
      mimeType: 'application/zip',
      buffer: zipBuffer,
    });

    // Confirm the custom import dialog.
    await page.locator('#kt-notebook-import').click();

    // Wait for the 300 ms debounced IDB write to complete.
    await page.waitForTimeout(600);

    // The pre-existing page must still carry its original content.
    const item = await getNotebookItemFromIDB(page, 'pre-existing-page');
    expect(item).toBeDefined();
    expect(item.content).toBe(existingContent);
  });
});
