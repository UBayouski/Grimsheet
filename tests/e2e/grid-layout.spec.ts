import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'grimsheet.progress',
      JSON.stringify({
        version: 1,
        cleared: ['01-fixture-corridor'],
        current: '02-fixture-lab',
      }),
    );
  });
  await page.goto('/tests/fixtures/index.html');
  await expect(page.locator('#status-bar')).toContainText('Ink 3/3');
});

test('committing a long formula does not widen a column or shift the map', async ({ page }) => {
  const box = async (selector: string) => {
    const b = await page.locator(selector).boundingBox();
    if (b === null) throw new Error(`no box for ${selector}`);
    return b;
  };

  const tableBefore = await box('#grid-table');
  const mapCellBefore = await box('[data-address="C3"]');
  const editedBefore = await box('[data-address="B15"]');

  await page.locator('[data-address="B15"]').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('#formula-bar')).toBeFocused();
  await page.keyboard.type('="a very long piece of text that would widen an auto-sized column"');
  await page.keyboard.press('Enter');
  await expect(page.locator('#status-bar')).toContainText('Ink 2/3');

  const tableAfter = await box('#grid-table');
  const mapCellAfter = await box('[data-address="C3"]');
  const editedAfter = await box('[data-address="B15"]');

  expect(tableAfter.width).toBe(tableBefore.width);
  expect(editedAfter.width).toBe(editedBefore.width);
  expect(mapCellAfter.x).toBe(mapCellBefore.x);
  expect(mapCellAfter.width).toBe(mapCellBefore.width);
});

test('focus stays on the grid table while playing with the arrow keys', async ({ page }) => {
  const table = page.locator('#grid-table');
  await expect(table).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(table).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(table).toBeFocused();

  const activeId = await page.evaluate(() => document.activeElement?.id);
  expect(activeId).toBe('grid-table');
});
