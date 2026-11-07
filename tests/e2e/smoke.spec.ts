import { expect, test } from '@playwright/test';

test('page loads and shows the title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('GRIMSHEET.XLS');

  // The title dialog is shown first; Enter on the focused Start button dismisses it.
  await expect(page.locator('#title-dialog')).toBeVisible();
  await expect(page.locator('#title-start')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#title-dialog')).toBeHidden();

  await expect(page.locator('.title-bar .title-text')).toHaveText('GRIMSHEET.XLS');
});
