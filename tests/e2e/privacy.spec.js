import { test, expect } from '@playwright/test';

test.describe('privacy.html translation', () => {
  test('renders in English (UK) by default (no cardLanguage set)', async ({ page }) => {
    await page.goto('/privacy.html');

    await expect(page.locator('h1')).toHaveText('Privacy & Cookie Policy');
    await expect(page.locator('.site-header-back')).toContainText('Back to app');
    await expect(page.locator('h2', { hasText: '1.' })).toHaveText('1. Who we are');
  });

  test('renders in Spanish when cardLanguage is "es"', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cardLanguage', JSON.stringify('es'));
    });
    await page.goto('/privacy.html');

    await expect(page.locator('h1')).toHaveText('Política de Privacidad y Cookies');
    await expect(page.locator('.site-header-back')).toContainText('Volver a la aplicación');
    await expect(page.locator('h2', { hasText: '6.' })).toHaveText('6. Sus derechos (RGPD)');
  });

  test('renders in French when cardLanguage is "fr"', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cardLanguage', JSON.stringify('fr'));
    });
    await page.goto('/privacy.html');

    await expect(page.locator('h1')).toHaveText('Politique de confidentialité et cookies');
    await expect(page.locator('.site-header-back')).toContainText("Retour à l'application");
  });

  test('renders in Portuguese (PT) when cardLanguage is "pt-PT"', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cardLanguage', JSON.stringify('pt-PT'));
    });
    await page.goto('/privacy.html');

    await expect(page.locator('h1')).toHaveText('Política de Privacidade e Cookies');
    await expect(page.locator('.site-footer a')).toHaveText('Voltar ao KanTrack');
  });

  test('renders in German when cardLanguage is "de-DE"', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cardLanguage', JSON.stringify('de-DE'));
    });
    await page.goto('/privacy.html');

    await expect(page.locator('h1')).toHaveText('Datenschutz- und Cookie-Richtlinie');
    await expect(page.locator('.site-header-back')).toContainText('Zurück zur App');
    await expect(page.locator('h2', { hasText: '6.' })).toHaveText('6. Deine Rechte (DSGVO)');
  });

  test('falls back to English (UK) when cardLanguage is "system"', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cardLanguage', JSON.stringify('system'));
    });
    await page.goto('/privacy.html');

    await expect(page.locator('h1')).toHaveText('Privacy & Cookie Policy');
  });
});
