import { test, expect } from '@playwright/test';

// iPad viewport presets from CONTEXT.md success criterion 2.
// Playwright's devices bundle doesn't carry exact BrakeFast target sizes, so we
// set viewport explicitly via test.use() per describe block.
const IPAD_PRO_12_9 = { width: 1366, height: 1024 };
const IPAD_11 = { width: 1194, height: 834 };

test.describe('Editorial first screen — iPad Pro 12.9 landscape (1366x1024)', () => {
  test.use({ viewport: IPAD_PRO_12_9 });

  test('first screen fits in 100svh without scrolling (EDIT-02)', async ({ page }) => {
    await page.goto('/?editorial=1');
    // Wait for the app to finish loading the JSON payload
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
    await page.waitForSelector('.ed-firstscreen', { timeout: 10000 });

    // EDIT-02 contract (CONTEXT.md §"Viewport Lock"): the editorial FIRST screen
    // must fit in 100svh. The wider document is expected to be taller because Phase 4
    // leaves the category sections below the fold untouched — only the ed-firstscreen
    // block is the viewport-locked region.
    const fits = await page.evaluate(() => {
      const el = document.querySelector('.ed-firstscreen') as HTMLElement | null;
      if (!el) return { ok: false, reason: 'no-root' };
      return {
        ok: el.scrollHeight <= window.innerHeight,
        scrollHeight: el.scrollHeight,
        innerHeight: window.innerHeight,
      };
    });
    expect(
      fits.ok,
      `EDIT-02 viewport lock failed on 1366x1024: ${JSON.stringify(fits)}`
    ).toBe(true);
  });

  test('weather modal opens on click and closes on Escape (PAR-03)', async ({ page }) => {
    await page.goto('/?editorial=1');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
    await page.waitForSelector('.ed-weather-row', { timeout: 10000 });
    await page.locator('.ed-weather-row').click();
    await expect(page.locator('.weather-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.weather-modal')).toHaveCount(0);
  });

  test('section-nav buttons are clickable (PAR-05)', async ({ page }) => {
    await page.goto('/?editorial=1');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
    await page.waitForSelector('.ed-nav', { timeout: 10000 });
    const navButtons = page.locator('.ed-nav button');
    const count = await navButtons.count();
    expect(count).toBeGreaterThan(0);
    // Click the first non-Titelseite nav button. The target may not be visible off-screen
    // but the click itself must succeed without throwing.
    if (count >= 2) {
      await navButtons.nth(1).click();
    }
  });
});

test.describe('Editorial first screen — iPad 11 landscape (1194x834)', () => {
  test.use({ viewport: IPAD_11 });

  test('first screen fits in 100svh on the smaller iPad (EDIT-02 + A11Y-03)', async ({ page }) => {
    await page.goto('/?editorial=1');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
    await page.waitForSelector('.ed-firstscreen', { timeout: 10000 });
    // Same EDIT-02 contract on the smaller iPad 11 landscape. Category sections
    // below the ed-firstscreen legitimately make documentElement.scrollHeight >
    // innerHeight — only the ed-firstscreen region is viewport-locked.
    const fits = await page.evaluate(() => {
      const el = document.querySelector('.ed-firstscreen') as HTMLElement | null;
      if (!el) return { ok: false };
      return {
        ok: el.scrollHeight <= window.innerHeight,
        scrollHeight: el.scrollHeight,
        innerHeight: window.innerHeight,
      };
    });
    expect(
      fits.ok,
      `EDIT-02 viewport lock failed on 1194x834: ${JSON.stringify(fits)}`
    ).toBe(true);
  });

  test('body copy is at least 12px (A11Y-03 readability)', async ({ page }) => {
    await page.goto('/?editorial=1');
    await page.waitForSelector('.loading-screen', { state: 'hidden', timeout: 10000 });
    await page.waitForSelector('.ed-col-1', { timeout: 10000 });
    // Measure computed font-size of the deck paragraph (primary body copy in the lead column).
    const bodyFontPx = await page.evaluate(() => {
      const el = document.querySelector('.ed-col-1 .ed-deck, .ed-col-1 p') as HTMLElement | null;
      if (!el) return 0;
      const fs = window.getComputedStyle(el).fontSize;
      return parseFloat(fs);
    });
    expect(
      bodyFontPx,
      `primary body copy below 12px: ${bodyFontPx}px`
    ).toBeGreaterThanOrEqual(12);
  });
});

test.describe('Otto Monitor view is unaffected by ?editorial=1 (EDIT-05)', () => {
  test.use({ viewport: IPAD_PRO_12_9 });

  test('visiting #monitor without the flag does not render the editorial first screen', async ({ page }) => {
    await page.goto('/#monitor');
    // Monitor owns its own root. .ed-firstscreen must NOT appear — that proves the
    // editorial branch is gated by BrakeFastApp, which is not mounted in monitor view.
    await expect(page.locator('.monitor-header')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.ed-firstscreen')).toHaveCount(0);
  });

  test('visiting #monitor WITH ?editorial=1 still renders the monitor (flag does not leak)', async ({ page }) => {
    await page.goto('/?editorial=1#monitor');
    await expect(page.locator('.monitor-header')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.ed-firstscreen')).toHaveCount(0);
  });
});
