import { test, expect } from '@playwright/test';

/** Helper: load page and wait for content */
async function loadPage(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
}

test.describe('Category Sections', () => {

  test('lead story click opens article modal', async ({ page }) => {
    await loadPage(page);

    const leadStory = page.locator('.lead-story').first();
    const count = await leadStory.count();
    test.skip(count === 0, 'No lead stories in test data');

    await leadStory.click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });
  });

  test('secondary story click opens article modal', async ({ page }) => {
    await loadPage(page);

    const secondaryStory = page.locator('.secondary-story').first();
    const count = await secondaryStory.count();
    test.skip(count === 0, 'No secondary stories in test data');

    await secondaryStory.click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });
  });

  test('article modal shows source link with href', async ({ page }) => {
    await loadPage(page);

    const leadStory = page.locator('.lead-story').first();
    const count = await leadStory.count();
    test.skip(count === 0, 'No lead stories in test data');

    await leadStory.click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });

    const sourceLink = page.locator('.modal-source-link');
    await expect(sourceLink).toBeVisible({ timeout: 5000 });
    const href = await sourceLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href!).toMatch(/^https?:\/\//);
  });

  test('article modal shows bullet points if available', async ({ page }) => {
    await loadPage(page);

    const leadStory = page.locator('.lead-story').first();
    const count = await leadStory.count();
    test.skip(count === 0, 'No lead stories in test data');

    await leadStory.click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });

    const bullets = page.locator('.modal-bullets');
    const bulletCount = await bullets.count();
    if (bulletCount > 0) {
      const items = bullets.locator('li');
      expect(await items.count()).toBeGreaterThan(0);
    }
    // If no bullets, test passes — data-dependent
  });

  test('modal close via close button', async ({ page }) => {
    await loadPage(page);

    await page.waitForSelector('.lead-story', { timeout: 10000 });
    const leadStory = page.locator('.lead-story').first();
    const count = await leadStory.count();
    test.skip(count === 0, 'No lead stories in test data');

    await leadStory.click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });

    await page.locator('.modal-close').click();
    await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 5000 });
  });

});
