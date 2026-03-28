import { test, expect } from '@playwright/test';

test.describe('BrakeFast Newspaper View', () => {

  test('loads and displays newspaper layout', async ({ page }) => {
    await page.goto('/');
    // Wait for loading screen to disappear
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
    // Masthead should be visible with "BrakeFast" in the logo
    await expect(page.locator('.masthead .masthead-logo')).toContainText('BrakeFast');
    // Nav tabs should be present
    await expect(page.locator('.nav-tabs')).toBeVisible();
    // Footer should be present
    await expect(page.locator('footer.footer')).toBeVisible();
  });

  test('nav tabs scroll to sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
    // Wait for nav pills to render (they depend on data loading)
    await page.waitForSelector('.nav-pill', { timeout: 10000 });
    const pills = page.locator('.nav-pill');
    const count = await pills.count();
    expect(count).toBeGreaterThan(0);
    // Click the last nav pill to force scroll
    await pills.last().click();
    // The active class should move to the clicked pill (wait for intersection observer)
    await page.waitForTimeout(500);
    await expect(pills.last()).toHaveClass(/active/);
  });

  test('article click opens modal, Escape closes it', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
    // Click the top story in the hero section (has role="button" and opens article modal)
    const topStory = page.locator('.top-story-clickable');
    await topStory.click();
    // Modal overlay should appear
    await expect(page.locator('.modal-overlay')).toBeVisible();
    // Press Escape to close
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal-overlay')).not.toBeVisible();
  });

  test('view switcher FAB navigates to monitor', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
    // Click the view-switcher FAB
    await page.locator('.view-switcher-fab').click();
    // URL should have #monitor
    await expect(page).toHaveURL(/#monitor/);
    // Monitor view content should be visible
    await expect(page.locator('.monitor-header')).toBeVisible({ timeout: 10000 });
  });

  test('skip-to-content link exists for accessibility', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
    await expect(page.locator('.skip-to-content')).toBeAttached();
  });

});
