import { test, expect } from '@playwright/test';

test.describe('Otto Monitor View', () => {

  test('loads monitor dashboard via hash', async ({ page }) => {
    await page.goto('/#monitor');
    // Monitor should render with header visible
    await expect(page.locator('.monitor-header')).toBeVisible({ timeout: 10000 });
  });

  test('view switcher FAB navigates back to BrakeFast', async ({ page }) => {
    await page.goto('/#monitor');
    await expect(page.locator('.monitor-header')).toBeVisible({ timeout: 10000 });
    // Click FAB to go back
    await page.locator('.view-switcher-fab').click();
    // Should be on BrakeFast view now (loading or loaded)
    await page.waitForSelector('.masthead, .loading-screen', { timeout: 10000 });
    // URL hash should not be #monitor
    expect(page.url()).not.toContain('#monitor');
  });

});
