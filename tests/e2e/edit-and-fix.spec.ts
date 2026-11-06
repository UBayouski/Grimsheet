import { expect, test } from '@playwright/test';

test('a refused edit costs no ink and keeps focus; a valid edit costs 1 ink and returns to the grid', async ({
  page,
}) => {
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

  const statusBar = page.locator('#status-bar');
  const formulaBar = page.locator('#formula-bar');
  await expect(statusBar).toContainText('Ink 3/3');

  await page.locator('[data-address="B15"]').click();
  await page.keyboard.press('Enter');
  await expect(formulaBar).toBeFocused();

  // A formula that fails to parse is refused and costs nothing.
  await page.keyboard.type('=1+');
  await page.keyboard.press('Enter');
  await expect(page.locator('#formula-alert')).toHaveText(/^Col /);
  await expect(statusBar).toContainText('Ink 3/3');
  await expect(formulaBar).toBeFocused();

  // Replace the text with a valid formula and commit it.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('"S"');
  await page.keyboard.press('Enter');
  await expect(statusBar).toContainText('Ink 2/3');
  await expect(page.locator('#grid-table')).toBeFocused();
});
