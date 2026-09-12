import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('visual, text contrast and keyboard checks across the main screens', async ({ page }, testInfo) => {
  mkdirSync('docs/screenshots', { recursive: true });
  async function check(label: string) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: no horizontal overflow`).toBe(true);
    const failures = await page.evaluate(() => {
      const rgb = (s: string) => (s.match(/[\d.]+/g) || []).map(Number);
      const lum = (c: number[]) => c.slice(0, 3).map(n => { n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
      return [...document.querySelectorAll<HTMLElement>('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent?.trim()) && e.getClientRects().length && !['SCRIPT', 'STYLE', 'OPTION', 'SVG'].includes(e.tagName)).map(e => {
        const style = getComputedStyle(e); let parent: HTMLElement | null = e; let bg = [255, 255, 255];
        while (parent) { const current = rgb(getComputedStyle(parent).backgroundColor); if (current.length === 3 || current[3] > .9) { bg = current; break; } parent = parent.parentElement; }
        const fgLum = lum(rgb(style.color)); const bgLum = lum(bg);
        const ratio = (Math.max(fgLum, bgLum) + .05) / (Math.min(fgLum, bgLum) + .05);
        const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
        return { text: e.textContent?.slice(0, 75), class: e.className, ratio, minimum: large ? 3 : 4.5 };
      }).filter(e => e.ratio < e.minimum);
    });
    expect(failures, `${label}: rendered text contrast`).toEqual([]);
    await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-${label}.png`, fullPage: true });
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Every student deserves to be seen.' })).toBeVisible();
  await page.locator('h1').press('Tab');
  await expect(page.locator('.hero a')).toBeFocused();
  await check('dashboard');
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.getByRole('button', { name: 'Close navigation' }).click();
  }
  await page.locator('.assessment-row').filter({ hasText: 'Student A' }).click();
  await expect(page.getByRole('heading', { name: 'A way forward for Student A.' })).toBeVisible();
  await check('results');
  await page.goto('/#/resources');
  await expect(page.getByRole('heading', { name: 'A little guidance. A lot of care.' })).toBeVisible();
  await check('resources');
  await page.goto('/#/new');
  await page.getByRole('button', { name: 'Fill fictional example' }).click();
  await check('context');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await check('observations');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await check('review');
  await page.getByLabel('Unsure about immediate safety', { exact: true }).check();
  await check('safety');
});
