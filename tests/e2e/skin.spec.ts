import { expect, test, type Page } from '@playwright/test';

const LEVEL_IDS = [
  '01-the-corridor',
  '02-the-chaser',
  '03-the-locked-crypt',
  '04-the-trap-row',
  '05-the-lich',
] as const;

test.use({ viewport: { width: 1280, height: 1024 } });

/** Seeds the stored progress so that level `n` (1-based) is the current, unlocked one. */
async function seedLevel(page: Page, n: number): Promise<void> {
  const progress = {
    version: 1,
    cleared: LEVEL_IDS.slice(0, n - 1),
    current: LEVEL_IDS[n - 1],
  };
  await page.addInitScript((value) => {
    window.localStorage.setItem('grimsheet.progress', JSON.stringify(value));
  }, progress);
}

async function pressStart(page: Page): Promise<void> {
  await page.locator('#title-start').click();
  await expect(page.locator('#title-dialog')).toHaveCount(0);
}

test('title flow: dialog, focus on Start, Start hands the grid to the player', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#title-dialog')).toBeVisible();
  await expect(page.locator('#title-start')).toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('title-start');

  await page.locator('#title-start').click();
  await expect(page.locator('#title-dialog')).toBeHidden();
  await expect(page.locator('#grid-table')).toBeFocused();

  const hero = page.locator('td[data-entity="hero"]');
  const before = await hero.getAttribute('data-address');
  await page.keyboard.press('ArrowRight');
  await expect(hero).not.toHaveAttribute('data-address', before ?? '');
});

test('mute choice persists across a reload', async ({ page }) => {
  await page.goto('/');
  await pressStart(page);

  const sound = page.locator('[data-control="sound"]');
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.localStorage.getItem('grimsheet.muted'))).toBe('1');

  await page.reload();
  await pressStart(page);
  await expect(sound).toHaveAttribute('aria-pressed', 'false');

  await sound.click();
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.localStorage.getItem('grimsheet.muted'))).toBe('0');
});

test('every request stays on the page origin and every response succeeds', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:5173').origin;
  const requestUrls: string[] = [];
  const responses: Array<{ url: string; status: number }> = [];
  page.on('request', (request) => requestUrls.push(request.url()));
  page.on('response', (response) => responses.push({ url: response.url(), status: response.status() }));

  await page.goto('/');
  await expect(page.locator('#title-dialog')).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect.poll(() => responses.some((r) => r.url.endsWith('.ttf'))).toBe(true);

  for (const url of requestUrls) {
    if (url.startsWith('data:') || url.startsWith('blob:')) continue;
    expect(new URL(url).origin, url).toBe(origin);
  }
  for (const r of responses) {
    expect(r.status, r.url).toBeLessThan(400);
  }

  const favicon = await page.request.get('/favicon.svg');
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()['content-type'] ?? '').not.toContain('text/html');

  const ttfUrl = responses.find((r) => r.url.endsWith('.ttf'))?.url ?? '/fonts/vt323-regular.ttf';
  const ttf = await page.request.get(ttfUrl);
  expect(ttf.status()).toBe(200);
  expect(ttf.headers()['content-type'] ?? '').not.toContain('text/html');
});

test.describe('layout and label fit', () => {
  for (const [index, id] of LEVEL_IDS.entries()) {
    test(`level ${index + 1} (${id}) fits the window`, async ({ page }) => {
      await seedLevel(page, index + 1);
      await page.goto('/');
      await pressStart(page);

      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await expect.poll(() => page.evaluate(() => document.fonts.check('1rem VT323'))).toBe(true);

      const fit = await page.evaluate(() => {
        const labels = Array.from(
          document.querySelectorAll<HTMLElement>('td[data-col="A"][data-region="rules"]'),
        );
        const size = (selector: string) => {
          const el = document.querySelector<HTMLElement>(selector);
          if (el === null) return null;
          const rect = el.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        };
        const colB = Array.from(document.querySelectorAll<HTMLElement>('td[data-col="B"]')).map(
          (el) => el.getBoundingClientRect().width,
        );
        return {
          labelCount: labels.length,
          overflowing: labels
            .filter((td) => {
              const text = td.querySelector<HTMLElement>('.cell-text');
              return (
                td.scrollWidth > td.clientWidth ||
                (text !== null && text.scrollWidth > text.clientWidth)
              );
            })
            .map((td) => td.id),
          a14: size('#cell-A14'),
          colB,
          c3: size('#cell-C3'),
          scrollHeight: document.documentElement.scrollHeight,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });

      expect(fit.labelCount).toBeGreaterThan(0);
      expect(fit.overflowing).toEqual([]);
      expect(fit.a14?.width).toBe(120);
      expect(fit.colB.length).toBeGreaterThan(0);
      for (const width of fit.colB) expect(width).toBe(40);
      expect(fit.c3).toEqual({ width: 40, height: 40 });
      expect(fit.scrollHeight).toBeLessThanOrEqual(1024);
      expect(fit.scrollWidth).toBeLessThanOrEqual(1280);
    });
  }

  test('the longest error text fits its cell', async ({ page }) => {
    await page.goto('/tests/fixtures/errors.html');
    await expect(page.locator('#cell-F9')).toHaveAttribute('data-error', '#DIV/0!');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await expect.poll(() => page.evaluate(() => document.fonts.check('1rem VT323'))).toBe(true);

    const widths = await page.evaluate(() => {
      const td = document.querySelector<HTMLElement>('#cell-F9');
      const text = document.querySelector<HTMLElement>('#cell-F9 .cell-text');
      if (td === null || text === null) return null;
      return { text: text.getBoundingClientRect().width, inner: td.clientWidth };
    });
    expect(widths).not.toBeNull();
    expect(widths?.text ?? Infinity).toBeLessThanOrEqual(widths?.inner ?? 0);
  });
});

// Error text in a rules-region cell must keep the small error size and fit its cell (S11). A rule
// for the rules region once set 1.25rem without excluding error cells, which clipped "#DIV/" and "#CYCL".
const RULES_ERROR_CELLS = [
  { level: 4, address: 'B15', error: '#DIV/0!' },
  { level: 5, address: 'B18', error: '#CYCLE!' },
  { level: 5, address: 'B19', error: '#CYCLE!' },
] as const;

test.describe('error text in the rules region fits its cell', () => {
  for (const { level, address, error } of RULES_ERROR_CELLS) {
    test(`level ${level} ${address} (${error})`, async ({ page }) => {
      await seedLevel(page, level);
      await page.goto('/');
      await pressStart(page);

      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await expect.poll(() => page.evaluate(() => document.fonts.check('1rem VT323'))).toBe(true);
      await expect(page.locator(`#cell-${address}`)).toHaveAttribute('data-error', error);

      const widths = await page.evaluate((id) => {
        const td = document.querySelector<HTMLElement>(`#cell-${id}`);
        const text = document.querySelector<HTMLElement>(`#cell-${id} .cell-text`);
        if (td === null || text === null) return null;
        return { text: text.getBoundingClientRect().width, inner: td.clientWidth };
      }, address);
      expect(widths).not.toBeNull();
      expect(widths?.text ?? Infinity).toBeLessThanOrEqual(widths?.inner ?? 0);
    });
  }
});

async function checkStickyStatusBar(page: Page, small: boolean): Promise<void> {
  await seedLevel(page, 1);
  await page.goto('/');
  await pressStart(page);

  const max = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  if (small) expect(max).toBeGreaterThan(0);

  const positions = [0, Math.round(max / 2), max];
  const bottoms: number[] = [];
  let innerHeight = 0;
  for (const y of positions) {
    const rect = await page.evaluate((scrollY) => {
      window.scrollTo(0, scrollY);
      const box = document.querySelector('#status-bar')?.getBoundingClientRect();
      return { top: box?.top ?? NaN, bottom: box?.bottom ?? NaN, inner: window.innerHeight };
    }, y);
    innerHeight = rect.inner;
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual(rect.inner);
    bottoms.push(rect.bottom);
  }

  if (small) {
    expect(bottoms[0]).toBe(innerHeight);
    expect(bottoms[1]).toBe(innerHeight);

    await page.locator('#tab-bar button:last-child').focus();
    const tabs = await page.evaluate(() => {
      const tab = document.querySelector('#tab-bar button:last-child')?.getBoundingClientRect();
      const bar = document.querySelector('#status-bar')?.getBoundingClientRect();
      return { tabBottom: tab?.bottom ?? NaN, barTop: bar?.top ?? NaN };
    });
    expect(tabs.tabBottom).toBeLessThanOrEqual(tabs.barTop);
  }
}

test.describe('sticky status bar at 1366x768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('stays inside the viewport at every scroll position', async ({ page }) => {
    await checkStickyStatusBar(page, true);
  });
});

test.describe('sticky status bar at 1280x1024', () => {
  test.use({ viewport: { width: 1280, height: 1024 } });

  test('stays inside the viewport at every scroll position', async ({ page }) => {
    await checkStickyStatusBar(page, false);
  });
});
