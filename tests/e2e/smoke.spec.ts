import { expect, test } from '@playwright/test';

test('page loads and shows the title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('GRIMSHEET.XLS');
  await expect(page.locator('.title-bar .title-text')).toHaveText('GRIMSHEET.XLS');
});
