import { test, expect } from '@playwright/test';

// iPad viewport presets from Phase 4 + Phase 5 CONTEXT.md (success criterion — visual
// consistency on iPad landscape).
// Playwright's devices bundle doesn't carry exact BrakeFast target sizes, so we set
// viewport explicitly via test.use() per describe block.
const IPAD_PRO_12_9 = { width: 1366, height: 1024 };
const IPAD_11 = { width: 1194, height: 834 };

test.describe('Editorial category sections — iPad Pro 12.9 landscape (1366x1024)', () => {
  test.use({ viewport: IPAD_PRO_12_9 });

  test('renders at least one .ed-category below the first screen with ?editorial=1 (EDIT-04)', async ({ page }) => {
    await page.goto('/?editorial=1');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
    await page.waitForSelector('.ed-firstscreen', { timeout: 10000 });
    await page.waitForSelector('.ed-category', { timeout: 10000 });

    const categoryCount = await page.locator('.ed-category').count();
    expect(categoryCount, `expected at least one .ed-category, got ${categoryCount}`).toBeGreaterThanOrEqual(1);

    // Each .ed-category has the two structural regions (section head + 2-col grid)
    const firstCat = page.locator('.ed-category').first();
    await expect(firstCat.locator('.ed-cat-head')).toBeVisible();
    await expect(firstCat.locator('.ed-cat-grid')).toBeVisible();
    await expect(firstCat.locator('.ed-cat-lead')).toBeVisible();
    await expect(firstCat.locator('.ed-cat-stack')).toBeVisible();
  });

  test('clicking a .ed-cat-stack-item opens the DetailModal overlay (D-11 parity)', async ({ page }) => {
    await page.goto('/?editorial=1');
    await page.waitForSelector('.ed-category', { timeout: 10000 });
    const firstStackItem = page.locator('.ed-cat-stack-item').first();
    await firstStackItem.scrollIntoViewIfNeeded();
    await firstStackItem.click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });
  });

  test('without ?editorial=1 the editorial categories are absent and legacy dividers are present (EDIT-04 legacy preservation)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
    await page.waitForSelector('.section-divider', { timeout: 10000 });
    await expect(page.locator('.ed-category')).toHaveCount(0);
    const dividerCount = await page.locator('.section-divider').count();
    expect(dividerCount).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Editorial category sections — iPad 11 landscape (1194x834)', () => {
  test.use({ viewport: IPAD_11 });

  test('renders .ed-category on the smaller iPad and body copy is >= 12px (A11Y-03 carry-forward)', async ({ page }) => {
    await page.goto('/?editorial=1');
    await page.waitForSelector('.ed-category', { timeout: 10000 });

    // Measure computed font-size of primary body paragraphs — lead body OR stacked deck.
    const primaryFontPx = await page.evaluate(() => {
      const el = document.querySelector('.ed-category .ed-cat-lead-body, .ed-category .ed-cat-stack-d') as HTMLElement | null;
      if (!el) return 0;
      const fs = window.getComputedStyle(el).fontSize;
      return parseFloat(fs);
    });
    expect(primaryFontPx, `primary editorial category body below 12px: ${primaryFontPx}px`).toBeGreaterThanOrEqual(12);
  });

  test('clicking a .ed-cat-stack-item opens the DetailModal on iPad 11 too', async ({ page }) => {
    await page.goto('/?editorial=1');
    await page.waitForSelector('.ed-cat-stack-item', { timeout: 10000 });
    // Use locator.click() directly — Playwright auto-scrolls and retries on detach.
    await page.locator('.ed-cat-stack-item').first().click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Otto Monitor view is unaffected by ?editorial=1 (EDIT-05 carry-forward from Phase 4)', () => {
  test.use({ viewport: IPAD_PRO_12_9 });

  test('#monitor with no flag renders the monitor and no .ed-category anywhere on the page', async ({ page }) => {
    await page.goto('/#monitor');
    await expect(page.locator('.ed-firstscreen')).toHaveCount(0);
    await expect(page.locator('.ed-category')).toHaveCount(0);
  });

  test('#monitor with ?editorial=1 still has zero .ed-category (flag does not leak into the monitor view)', async ({ page }) => {
    await page.goto('/?editorial=1#monitor');
    await expect(page.locator('.ed-firstscreen')).toHaveCount(0);
    await expect(page.locator('.ed-category')).toHaveCount(0);
  });
});
