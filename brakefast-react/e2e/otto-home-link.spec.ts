import { test, expect, type Page } from '@playwright/test';

async function expectAccessibleOttoHomeLink(page: Page) {
  const link = page.locator('[data-otto-home]');

  await expect(link).toHaveCount(1);
  await expect(link).toBeVisible();
  await expect(link).toHaveText('← OTTO');
  await expect(link).toHaveAttribute('href', 'https://ottobot.net/');
  await expect(link).toHaveAttribute('aria-label', 'Zur OTTO-Übersicht');

  const box = await link.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await link.focus();
  const focusStyle = await link.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
}

test.describe('global OTTO home link', () => {
  test('meets the navigation contract in the newspaper view', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.ed-firstscreen', { timeout: 10000 });

    await expectAccessibleOttoHomeLink(page);

    const firstScreenBox = await page.locator('.ed-firstscreen').boundingBox();
    const viewport = page.viewportSize();
    expect(firstScreenBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect((firstScreenBox?.y ?? 0) + (firstScreenBox?.height ?? 0))
      .toBeLessThanOrEqual(viewport?.height ?? 0);
  });

  test('remains available in the monitor view', async ({ page }) => {
    await page.goto('/#monitor');

    await expectAccessibleOttoHomeLink(page);
  });

  test('keeps its touch target inside a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('.ed-firstscreen', { timeout: 10000 });

    await expectAccessibleOttoHomeLink(page);

    const box = await page.locator('[data-otto-home]').boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  });
});
