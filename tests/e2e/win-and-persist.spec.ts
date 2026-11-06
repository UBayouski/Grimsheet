import { expect, test } from '@playwright/test';

const FIXTURE_URL = '/tests/fixtures/index.html';
const PROGRESS_KEY = 'grimsheet.progress';

test('win a level, advance, and keep progress across a reload', async ({ page }) => {
  await page.goto(FIXTURE_URL);

  const tabs = page.locator('#tab-bar button');
  const firstTab = tabs.nth(0);
  const secondTab = tabs.nth(1);

  await expect(tabs).toHaveCount(2);
  await expect(firstTab).toHaveAttribute('aria-current', 'page');
  await expect(secondTab).toBeDisabled();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'won');
  await expect(page.locator('#message')).toHaveText('Changes saved.');

  await expect
    .poll(async () => {
      const raw = await page.evaluate((key) => window.localStorage.getItem(key), PROGRESS_KEY);
      if (raw === null) return [];
      const parsed = JSON.parse(raw) as { cleared?: unknown };
      return Array.isArray(parsed.cleared) ? parsed.cleared : [];
    })
    .toContain('01-fixture-corridor');

  await page.keyboard.press('n');

  await expect(secondTab).toHaveAttribute('aria-current', 'page');
  await expect(secondTab).toBeEnabled();

  await page.reload();

  await expect(tabs).toHaveCount(2);
  await expect(secondTab).toHaveAttribute('aria-current', 'page');
  await expect(firstTab).toBeEnabled();
});
