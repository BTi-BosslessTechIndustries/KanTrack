/**
 * KanTrack Phase 4 E2E tests — Export / Import v2.
 *
 * Covers flows that cannot be tested at the unit level:
 *   1. Export workspace as JSON — download is intercepted; content verified.
 *   2. Import .kantrack.json (Merge) — file upload via setInputFiles; dialog
 *      interaction; data present after reload.
 *   3. Import file with unsupported formatVersion — error notification shown.
 *   4. Encrypted export + import round-trip — passphrase dialogs; decrypt on
 *      import; data present after reload.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Create a task via the #newNote input and wait for the card to appear. */
async function createTask(page, title) {
  await page.locator('#newNote').fill(title);
  await page.locator('[data-action="task:add"]').click();
  await expect(page.locator('#todo .note').filter({ hasText: title })).toBeVisible();
}

/** Build a minimal valid .kantrack.json payload string. */
function makeImportPayload(tasks = []) {
  return JSON.stringify({
    formatVersion: 1,
    appVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    tasks,
    tags: [],
    notebook_items: [],
    clocks: [],
    settings: {},
    integrity: { tasks_count: tasks.length, tasks_hash: 'test-hash' },
  });
}

// ─── tests ────────────────────────────────────────────────────────────────────

test.describe('Phase 4 — Export / Import', () => {
  // ── 4.1 Export JSON ─────────────────────────────────────────────────────────

  test('exports workspace as .kantrack.json with correct structure', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Export check ${Date.now()}`;
    await createTask(page, title);

    // Intercept the download before clicking the button
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-action="board:exportJSON"]').click();
    const download = await downloadPromise;

    // Filename ends with .kantrack.json
    expect(download.suggestedFilename()).toMatch(/\.kantrack\.json$/);

    // Read and parse the file
    const filePath = await download.path();
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);

    expect(parsed.formatVersion).toBe(1);
    expect(typeof parsed.appVersion).toBe('string');
    expect(typeof parsed.exportedAt).toBe('string');
    expect(Array.isArray(parsed.tasks)).toBe(true);
    expect(parsed.tasks.some(t => t.title === title)).toBe(true);
    expect(parsed.integrity).toBeDefined();
    expect(typeof parsed.integrity.tasks_count).toBe('number');
    expect(typeof parsed.integrity.tasks_hash).toBe('string');
    expect(parsed.integrity.tasks_hash).toHaveLength(64); // SHA-256 hex
  });

  test('exports lightweight workspace without imageData in note entries', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Lite export ${Date.now()}`;
    await createTask(page, title);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-action="board:exportJSONLite"]').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/_lite\.kantrack\.json$/);

    const filePath = await download.path();
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    expect(parsed.formatVersion).toBe(1);
    // Lightweight export: no note entry should have imageData
    const hasImageData = parsed.tasks.some(t =>
      (t.noteEntries || []).some(e => e.imageData !== undefined)
    );
    expect(hasImageData).toBe(false);
  });

  // ── 4.2 Import .kantrack.json ────────────────────────────────────────────────

  test('imports .kantrack.json via Merge — imported task appears after reload', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const importedTitle = `Imported ${Date.now()}`;
    const payload = makeImportPayload([
      {
        id: `imported-${Date.now()}`,
        title: importedTitle,
        column: 'todo',
        noteEntries: [],
        tags: [],
        timer: 0,
        actions: [],
      },
    ]);

    // Upload the file to the hidden input
    await page.locator('#importFile').setInputFiles({
      name: 'workspace.kantrack.json',
      mimeType: 'application/json',
      buffer: Buffer.from(payload),
    });

    // Import preview dialog should appear
    const dialog = page.locator('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('This file contains:');

    // Click Merge
    await dialog.locator('#kt-import-merge').click();

    // Page reloads after merge — wait for it
    await page.waitForLoadState('networkidle');

    // Imported task must be visible
    await expect(page.locator('#todo .note').filter({ hasText: importedTitle })).toBeVisible();
  });

  test('import dialog shows task count in summary', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const payload = makeImportPayload([
      {
        id: 't1',
        title: 'Alpha',
        column: 'todo',
        noteEntries: [],
        tags: [],
        timer: 0,
        actions: [],
      },
      { id: 't2', title: 'Beta', column: 'todo', noteEntries: [], tags: [], timer: 0, actions: [] },
    ]);

    await page.locator('#importFile').setInputFiles({
      name: 'two-tasks.kantrack.json',
      mimeType: 'application/json',
      buffer: Buffer.from(payload),
    });

    const dialog = page.locator('dialog');
    await expect(dialog).toBeVisible();
    // Summary should mention "2 tasks"
    await expect(dialog).toContainText('2 tasks');

    // Cancel — we don't need to actually import
    await dialog.locator('#kt-import-cancel').click();
    await expect(dialog).toBeHidden();
  });

  test('importing a file with unsupported formatVersion shows an error', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const badPayload = JSON.stringify({ formatVersion: 999, tasks: [] });

    await page.locator('#importFile').setInputFiles({
      name: 'bad.kantrack.json',
      mimeType: 'application/json',
      buffer: Buffer.from(badPayload),
    });

    // Error notification must appear (no dialog shown)
    await expect(page.locator('.notification-error')).toBeVisible();
  });

  // ── 4.3 Encrypted export + import ───────────────────────────────────────────

  test('encrypted export and import round-trip restores data', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Encrypted ${Date.now()}`;
    await createTask(page, title);

    // ── Export step ──────────────────────────────────────────────────────────

    // Click the encrypted export button — passphrase dialog appears
    await page.locator('[data-action="board:exportEncrypted"]').click();

    const passphraseDialog = page.locator('dialog');
    await expect(passphraseDialog).toBeVisible();
    await passphraseDialog.locator('#kt-passphrase').fill('e2e-passphrase-test');

    // Set up download interception before confirming
    const downloadPromise = page.waitForEvent('download');
    await passphraseDialog.locator('#kt-pass-confirm').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.kantrack\.enc$/);

    // Save the encrypted file so we can re-upload it
    const encPath = await download.path();
    const encBuffer = fs.readFileSync(encPath);

    // ── Import step ──────────────────────────────────────────────────────────

    // Upload the .kantrack.enc file
    await page.locator('#importFile').setInputFiles({
      name: 'workspace.kantrack.enc',
      mimeType: 'application/octet-stream',
      buffer: encBuffer,
    });

    // Passphrase dialog for decryption
    const decryptDialog = page.locator('dialog');
    await expect(decryptDialog).toBeVisible();
    await decryptDialog.locator('#kt-passphrase').fill('e2e-passphrase-test');
    await decryptDialog.locator('#kt-pass-confirm').click();

    // Import preview dialog
    const previewDialog = page.locator('dialog');
    await expect(previewDialog).toBeVisible();
    await expect(previewDialog).toContainText('This file contains:');
    await previewDialog.locator('#kt-import-merge').click();

    await page.waitForLoadState('networkidle');

    // Task must survive the full encrypt → decrypt → import → reload cycle
    await expect(page.locator('#todo .note').filter({ hasText: title })).toBeVisible();
  });

  test('encrypted import with wrong passphrase shows an error', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-header')).toBeVisible();

    const title = `Wrong pass ${Date.now()}`;
    await createTask(page, title);

    // Export encrypted
    await page.locator('[data-action="board:exportEncrypted"]').click();
    const exportDialog = page.locator('dialog');
    await expect(exportDialog).toBeVisible();
    await exportDialog.locator('#kt-passphrase').fill('correct-pass');

    const downloadPromise = page.waitForEvent('download');
    await exportDialog.locator('#kt-pass-confirm').click();
    const download = await downloadPromise;

    const encPath = await download.path();
    const encBuffer = fs.readFileSync(encPath);

    // Import with WRONG passphrase
    await page.locator('#importFile').setInputFiles({
      name: 'workspace.kantrack.enc',
      mimeType: 'application/octet-stream',
      buffer: encBuffer,
    });

    const decryptDialog = page.locator('dialog');
    await expect(decryptDialog).toBeVisible();
    await decryptDialog.locator('#kt-passphrase').fill('wrong-pass');
    await decryptDialog.locator('#kt-pass-confirm').click();

    // Error notification must appear
    await expect(page.locator('.notification-error')).toBeVisible();
  });
});
