import { test, expect } from '@playwright/test';

test.describe('Hero Section Interactions', () => {

  test('editorial banner opens BriefingModal and Escape closes it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });

    const banner = page.locator('.editorial-banner');
    const count = await banner.count();
    test.skip(count === 0, 'No editorial banner in test data');

    await banner.click();
    // BriefingModal renders inside a .modal-overlay containing .briefing-modal
    await expect(page.locator('.modal-overlay .briefing-modal')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 5000 });
  });

  test('"3 in 30 Sekunden" headline opens DetailModal and Escape closes it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });

    const headlines = page.locator('.headlines-30s-item.headlines-30s-clickable');
    const count = await headlines.count();
    test.skip(count === 0, 'No headlines in test data');

    await headlines.first().click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 5000 });
  });

  test('history fact opens DetailModal and Escape closes it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });

    const historyItems = page.locator('.status-card-history-item.status-card-history-clickable');
    const count = await historyItems.count();
    test.skip(count === 0, 'No history items in test data');

    await historyItems.first().click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 5000 });
  });

  test('calendar widget reveal via masthead logo click', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });

    const calendarCard = page.locator('.status-card-calendar');
    const cardCount = await calendarCard.count();
    test.skip(cardCount === 0, 'No calendar card in test data');

    // Initially blurred
    await expect(calendarCard).toHaveClass(/status-card-blurred/);

    // Click logo to reveal
    await page.locator('.masthead-logo.masthead-logo-clickable').click();
    await expect(calendarCard).not.toHaveClass(/status-card-blurred/, { timeout: 5000 });

    // Click logo again to re-blur
    await page.locator('.masthead-logo.masthead-logo-clickable').click();
    await expect(calendarCard).toHaveClass(/status-card-blurred/, { timeout: 5000 });
  });

});
