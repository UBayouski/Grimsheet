import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 1024 },
  { width: 1366, height: 768 },
]) {
  test.describe(`at ${viewport.width} by ${viewport.height}`, () => {
    test.use({ viewport });

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

    test('committing a long formula does not widen a column or shift the map', async ({
      page,
    }) => {
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
      await page.keyboard.type(
        '="a very long piece of text that would widen an auto-sized column"',
      );
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

    test('column widths and window width are fixed', async ({ page }) => {
      const width = (selector: string) =>
        page.locator(selector).evaluate((el) => el.getBoundingClientRect().width);

      expect(await width('#cell-A14')).toBe(120);
      expect(await width('#cell-B14')).toBe(40);
      expect(await width('#cell-B5')).toBe(40);
      expect(await width('#cell-L5')).toBe(40);
      expect(await width('#window')).toBe(832);

      const noHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      expect(noHorizontalScroll).toBe(true);


    });

    test('the five tab buttons share one top and nothing sticks out on the right', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        window.localStorage.setItem(
          'grimsheet.progress',
          JSON.stringify({
            version: 1,
            cleared: ['01-the-corridor', '02-the-chaser', '03-the-locked-crypt', '04-the-trap-row'],
            current: '05-the-lich',
          }),
        );
      });
      await page.goto('/');
      await page.locator('#title-start').click();
      await expect(page.locator('#title-dialog')).toBeHidden();

      // The current tab is lifted 2 px by design (chrome.css: .tab[aria-current='page'] top: -2px).
      // The four other tabs must share one top, and the current tab sits exactly 2 px above it.
      const tabs = await page.locator('#tab-bar button').evaluateAll((els) =>
        els.map((el) => ({
          top: el.getBoundingClientRect().top,
          current: el.getAttribute('aria-current') === 'page',
        })),
      );
      expect(tabs).toHaveLength(5);
      const restingTops = tabs.filter((tab) => !tab.current).map((tab) => tab.top);
      const currentTops = tabs.filter((tab) => tab.current).map((tab) => tab.top);
      expect(restingTops).toHaveLength(4);
      expect(new Set(restingTops).size).toBe(1);
      expect(currentTops).toEqual([(restingTops[0] ?? 0) - 2]);
      const beyond = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth;
        return Array.from(document.querySelectorAll('button, input'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > limit;
          })
          .map((el) => el.id || el.tagName);
      });
      expect(beyond).toEqual([]);
    });
  });
}