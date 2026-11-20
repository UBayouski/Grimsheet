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

    test('the six tab buttons share one top, fit the tab bar with 24 px spare and nothing sticks out', async ({
      page,
    }, testInfo) => {
      await page.addInitScript(() => {
        window.localStorage.setItem(
          'grimsheet.progress',
          JSON.stringify({
            version: 1,
            cleared: [
              '01-the-corridor',
              '02-the-chaser',
              '03-the-locked-crypt',
              '04-the-trap-row',
              '05-the-lich',
            ],
            current: '06-the-audit',
          }),
        );
      });
      await page.goto('/');
      await page.locator('#title-start').click();
      await expect(page.locator('#title-dialog')).toBeHidden();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await expect.poll(() => page.evaluate(() => document.fonts.check('1rem VT323'))).toBe(true);

      // The current tab is lifted 2 px by design (chrome.css: .tab[aria-current='page'] top: -2px).
      // The five other tabs must share one top, and the current tab sits exactly 2 px above it.
      const tabs = await page.locator('#tab-bar button').evaluateAll((els) =>
        els.map((el) => ({
          top: el.getBoundingClientRect().top,
          current: el.getAttribute('aria-current') === 'page',
          text: el.textContent ?? '',
        })),
      );
      expect(tabs).toHaveLength(6);
      expect(tabs.map((tab) => tab.text)).toEqual([
        '1: The Corridor',
        '2: The Chaser',
        '3: The Locked Crypt',
        '4: The Trap Row',
        '5: The Lich',
        '6: The Audit',
      ]);
      const restingTops = tabs.filter((tab) => !tab.current).map((tab) => tab.top);
      const currentTops = tabs.filter((tab) => tab.current).map((tab) => tab.top);
      expect(restingTops).toHaveLength(5);
      expect(new Set(restingTops).size).toBe(1);
      expect(currentTops).toEqual([(restingTops[0] ?? 0) - 2]);

      // Spare width: the right edge of the last button against the content box of the tab bar.
      const spare = await page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>('#tab-bar');
        const last = document.querySelector<HTMLElement>('#tab-bar button:last-child');
        if (bar === null || last === null) return Number.NaN;
        const style = getComputedStyle(bar);
        const contentRight =
          bar.getBoundingClientRect().right -
          parseFloat(style.borderRightWidth) -
          parseFloat(style.paddingRight);
        return contentRight - last.getBoundingClientRect().right;
      });
      console.log(`tab bar spare at ${viewport.width}x${viewport.height}: ${spare} px`);
      testInfo.annotations.push({
        type: 'tab-bar-spare',
        description: `${viewport.width}x${viewport.height}: ${spare} px`,
      });
      expect(spare).toBeGreaterThanOrEqual(24);

      expect(await page.locator('#window').evaluate((el) => el.getBoundingClientRect().width)).toBe(832);
      const noHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      expect(noHorizontalScroll).toBe(true);
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
