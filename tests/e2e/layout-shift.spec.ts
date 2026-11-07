import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Selecting or deselecting a cell must not move or resize the window, and the page must never need a
// vertical scrollbar at 1280 by 1024 (a scrollbar narrows the page and makes the window jump sideways).

const LEVEL_IDS = [
  '01-the-corridor',
  '02-the-chaser',
  '03-the-locked-crypt',
  '04-the-trap-row',
  '05-the-lich',
] as const;

test.use({ viewport: { width: 1280, height: 1024 } });

/** Seeds the stored progress so that level `n` (1-based) is the current, unlocked one, then starts it. */
async function startLevel(page: Page, n: number): Promise<void> {
  await page.addInitScript(
    (value) => {
      window.localStorage.setItem('grimsheet.progress', JSON.stringify(value));
    },
    { version: 1, cleared: LEVEL_IDS.slice(0, n - 1), current: LEVEL_IDS[n - 1] },
  );
  await page.goto('/');
  await page.locator('#title-start').click();
  await expect(page.locator('#title-dialog')).toHaveCount(0);
  await expect(page.locator('#status-bar')).toContainText(`Sheet${n}:`);
}

async function windowBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('#window').boundingBox();
  if (box === null) throw new Error('#window has no bounding box');
  return box;
}

const scrollHeight = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollHeight);
const pageWidth = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.clientWidth);

test('level 4: selecting and deselecting the error cell F6 leaves the window and the page unchanged', async ({
  page,
}) => {
  await startLevel(page, 4);
  const explanation = page.locator('#cell-explanation');
  await expect(explanation).toBeHidden();

  const before = await windowBox(page);
  const widthBefore = await pageWidth(page);
  expect(await scrollHeight(page)).toBeLessThanOrEqual(1024);

  await page.locator('[data-address="F6"]').click();
  await expect(explanation).toBeVisible();
  await expect(explanation).toContainText('divides by zero');

  expect(await windowBox(page)).toEqual(before);
  expect(await pageWidth(page)).toBe(widthBefore);
  expect(await scrollHeight(page)).toBeLessThanOrEqual(1024);

  // Deselect: a plain floor cell has no cause line.
  await page.locator('[data-address="C6"]').click();
  await expect(explanation).toBeHidden();
  expect(await windowBox(page)).toEqual(before);
  expect(await scrollHeight(page)).toBeLessThanOrEqual(1024);
});

test('all five levels: selecting any error cell keeps the window box and a page height of at most 1024', async ({
  page,
}) => {
  let errorCellsSeen = 0;
  for (let n = 1; n <= LEVEL_IDS.length; n++) {
    // A fresh page per level keeps the seeded progress and the layout measurements independent.
    await page.goto('about:blank');
    await startLevel(page, n);

    const before = await windowBox(page);
    expect(await scrollHeight(page), `level ${n} at start`).toBeLessThanOrEqual(1024);

    const addresses = await page.locator('td[data-error]').evaluateAll((cells) =>
      cells.map((cell) => cell.getAttribute('data-address') ?? ''),
    );
    for (const address of addresses) {
      errorCellsSeen += 1;
      await page.locator(`[data-address="${address}"]`).click();
      await expect(page.locator('#cell-explanation')).toBeVisible();
      expect(await windowBox(page), `level ${n}, ${address} selected`).toEqual(before);
      expect(await scrollHeight(page), `level ${n}, ${address} selected`).toBeLessThanOrEqual(1024);
    }
  }
  // Level 4 has a #DIV/0! cell on the map and in the rules panel; level 5 has the two cycle cells.
  expect(errorCellsSeen).toBeGreaterThanOrEqual(4);
});
