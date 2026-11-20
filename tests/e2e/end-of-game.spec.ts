import { expect, test, type Page } from '@playwright/test';

const PROGRESS_KEY = 'grimsheet.progress';

const LEVEL_IDS = [
  '01-the-corridor',
  '02-the-chaser',
  '03-the-locked-crypt',
  '04-the-trap-row',
  '05-the-lich',
  '06-the-audit',
] as const;

test.use({ viewport: { width: 1280, height: 1024 } });

async function seed(page: Page, n: number): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, JSON.stringify(value));
    },
    [PROGRESS_KEY, { version: 1, cleared: LEVEL_IDS.slice(0, 5), current: LEVEL_IDS[n - 1] }],
  );
}

async function dismissTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#title-start').click();
  await expect(page.locator('#title-dialog')).toHaveCount(0);
}

test('after clearing five levels, tab 6 is enabled and a confirmed switch opens The Audit', async ({ page }) => {
  await seed(page, 5);
  await dismissTitle(page);
  await expect(page.locator('#status-bar')).toContainText('Sheet5: The Lich');

  const tab = page.locator('#tab-bar button').nth(5);
  await expect(tab).toHaveText('6: The Audit');
  await expect(tab).toBeEnabled();

  await tab.click();
  await expect(page.locator('#message')).toContainText('Switch to Sheet6: The Audit?');

  await page.keyboard.press('Enter');
  await expect(page.locator('#status-bar')).toContainText('Sheet6: The Audit');
  await expect(tab).toHaveAttribute('aria-current', 'page');
});

test('final win: clearing The Audit shows the last-level message and records all six levels', async ({ page }) => {
  await seed(page, 6);
  await dismissTitle(page);
  await expect(page.locator('#status-bar')).toContainText('Sheet6: The Audit');

  // The stored solution: edit B17 to -1, then four steps up and eight steps right.
  await page.locator('[data-address="B17"]').click();
  await page.keyboard.press('Enter');
  await expect(page.locator('#formula-bar')).toBeFocused();
  await page.keyboard.type('-1');
  await page.keyboard.press('Enter');
  await expect(page.locator('#status-bar')).toContainText('Ink 0/1');
  await expect(page.locator('#grid-table')).toBeFocused();

  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');

  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'won');
  await expect(page.locator('#win-body')).toHaveText('Workbook saved. Your soul was not.');
  await expect(page.locator('#win-next')).toBeHidden();
  await expect(page.locator('#win-ok')).toBeFocused();
  await expect(page.locator('#win-ok')).toHaveAttribute('data-default', '');

  await expect
    .poll(async () => {
      const raw = await page.evaluate((key) => window.localStorage.getItem(key), PROGRESS_KEY);
      if (raw === null) return [];
      const parsed = JSON.parse(raw) as { cleared?: unknown };
      return Array.isArray(parsed.cleared) ? [...parsed.cleared].sort() : [];
    })
    .toEqual([...LEVEL_IDS]);
});
