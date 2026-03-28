import { test, expect } from '@playwright/test';

/** Helper: load page and wait for content */
async function loadPage(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
}

/** Helper: click top story to mark an article as read, then close modal */
async function markArticleAsRead(page: import('@playwright/test').Page) {
  await page.locator('.top-story-clickable').click();
  await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 5000 });
}

test.describe('Read Tracking', () => {

  test('article click marks as read in localStorage', async ({ page }) => {
    await loadPage(page);

    // Clear any prior state
    await page.evaluate(() => localStorage.removeItem('brakefast-read-items'));

    await markArticleAsRead(page);

    const stored = await page.evaluate(() => localStorage.getItem('brakefast-read-items'));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    // Could be array or object — just check it has content
    if (Array.isArray(parsed)) {
      expect(parsed.length).toBeGreaterThan(0);
    } else {
      expect(Object.keys(parsed).length).toBeGreaterThan(0);
    }
  });

  test('clear history requires double-click confirmation', async ({ page }) => {
    await loadPage(page);

    // First mark an article so the clear button appears
    await markArticleAsRead(page);

    // Scroll to footer
    await page.locator('footer.footer').scrollIntoViewIfNeeded();

    const clearBtn = page.locator('.footer-clear-history');
    await expect(clearBtn).toBeVisible({ timeout: 5000 });

    // First click shows confirmation text
    await clearBtn.click();
    await expect(clearBtn).toContainText('Wirklich');

    // Second click confirms
    await clearBtn.click();
    // Toast should appear
    await expect(page.locator('.toast.toast-visible')).toBeVisible({ timeout: 3000 });
  });

  test('toast auto-dismisses after clearing history', async ({ page }) => {
    await loadPage(page);

    await markArticleAsRead(page);

    await page.locator('footer.footer').scrollIntoViewIfNeeded();
    const clearBtn = page.locator('.footer-clear-history');
    await expect(clearBtn).toBeVisible({ timeout: 5000 });

    // Double-click to clear
    await clearBtn.click();
    await clearBtn.click();

    // Toast visible
    await expect(page.locator('.toast.toast-visible')).toBeVisible({ timeout: 3000 });

    // Toast auto-dismisses (Toast has 2000ms timer)
    await page.waitForSelector('.toast.toast-visible', { state: 'hidden', timeout: 5000 });
  });

  test('after clearing history, localStorage is empty', async ({ page }) => {
    await loadPage(page);

    await markArticleAsRead(page);

    // Verify something was stored
    const before = await page.evaluate(() => localStorage.getItem('brakefast-read-items'));
    expect(before).not.toBeNull();

    // Double-click clear
    await page.locator('footer.footer').scrollIntoViewIfNeeded();
    const clearBtn = page.locator('.footer-clear-history');
    await expect(clearBtn).toBeVisible({ timeout: 5000 });
    await clearBtn.click();
    await clearBtn.click();

    // Wait for toast to confirm action happened
    await expect(page.locator('.toast.toast-visible')).toBeVisible({ timeout: 3000 });

    const after = await page.evaluate(() => localStorage.getItem('brakefast-read-items'));
    if (after !== null) {
      const parsed = JSON.parse(after);
      if (Array.isArray(parsed)) {
        expect(parsed.length).toBe(0);
      } else {
        expect(Object.keys(parsed).length).toBe(0);
      }
    }
    // null is also valid (completely removed)
  });

});
