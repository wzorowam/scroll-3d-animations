import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const frames = [0, 0.3, 0.6, 0.9];

test.beforeAll(async () => {
  await mkdir('media/sneaker', { recursive: true });
});

test('sneaker scroll frames', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/sneaker?motion=full', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__studio?.ready === true);

  let maxCalls = 0;

  for (const progress of frames) {
    await page.evaluate(async (value) => {
      window.__studio.scrollToProgress(value);
      window.__studio.pause();
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
    }, progress);

    await page.waitForFunction((value) => {
      const studio = window.__studio;
      return studio?.rendered && Math.abs(studio.progress - value) < 0.045;
    }, progress);

    const stats = await page.evaluate(() => ({
      drawCalls: window.__studio.drawCalls,
      pixelRatio: window.__studio.pixelRatio,
    }));
    maxCalls = Math.max(maxCalls, stats.drawCalls);

    const label = String(Math.round(progress * 100)).padStart(2, '0');
    await page.screenshot({
      path: `media/sneaker/${testInfo.project.name}-${label}.png`,
      animations: 'disabled',
    });

    expect(stats.pixelRatio).toBeLessThanOrEqual(testInfo.project.name === 'mobile' ? 1.25 : 1.75);
  }

  expect(maxCalls, 'draw calls').toBeGreaterThan(3);
  expect(maxCalls, 'draw calls').toBeLessThan(25);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('reduced motion uses the still', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'fallback smoke runs once');
  await page.goto('/sneaker?motion=reduce');
  await expect(page.locator('[data-fallback]')).toBeVisible();
  await expect(page.locator('#film')).toBeHidden();
  await page.waitForTimeout(200);
  const started = await page.evaluate(() => window.__studio?.ready === true);
  expect(started).toBe(false);
});
