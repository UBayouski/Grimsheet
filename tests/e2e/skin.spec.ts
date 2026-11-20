import { expect, test, type Page } from '@playwright/test';

const LEVEL_IDS = [
  '01-the-corridor',
  '02-the-chaser',
  '03-the-locked-crypt',
  '04-the-trap-row',
  '05-the-lich',
  '06-the-audit',
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

const TAB_TEXTS = [
  '1: The Corridor',
  '2: The Chaser',
  '3: The Locked Crypt',
  '4: The Trap Row',
  '5: The Lich',
  '6: The Audit',
] as const;
const FULL_LABELS = [
  'Sheet1: The Corridor',
  'Sheet2: The Chaser',
  'Sheet3: The Locked Crypt',
  'Sheet4: The Trap Row',
  'Sheet5: The Lich',
  'Sheet6: The Audit',
] as const;

test.describe('tab texts and status label', () => {
  for (const [index, id] of LEVEL_IDS.entries()) {
    test(`level ${index + 1} (${id}) shows the short tab texts and the full status label`, async ({ page }) => {
      await seedLevel(page, index + 1);
      await page.goto('/');
      await pressStart(page);

      await expect(page.locator('#tab-bar button')).toHaveText([...TAB_TEXTS]);
      await expect(page.locator('#status-bar')).toContainText(FULL_LABELS[index] ?? '');
    });
  }
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

test.describe('sticky formula row at 1366x768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`keeps the selected rule formula visible while scrolled (${reducedMotion})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await seedLevel(page, 5);
      await page.goto('/');
      await pressStart(page);
      const before = await page.evaluate(() => {
        const windowBox = document.querySelector('#window')?.getBoundingClientRect();
        return {
          height: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth,
          windowWidth: windowBox?.width ?? NaN,
          windowHeight: windowBox?.height ?? NaN,
          windowLeft: windowBox?.left ?? NaN,
        };
      });
      await page.locator('#cell-B16').click();
      await page.locator('#cell-B16').scrollIntoViewIfNeeded();
      await expect(page.locator('#formula-bar')).toHaveValue('=MAX(1,PHYLACTERY)');

      const boxes = await page.evaluate(() => {
        const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
        const formula = rect('.formula-row');
        const status = rect('#status-bar');
        const cell = rect('#cell-B16');
        return {
          formulaTop: formula?.top ?? NaN,
          formulaBottom: formula?.bottom ?? NaN,
          formulaHeight: formula?.height ?? NaN,
          statusTop: status?.top ?? NaN,
          statusBottom: status?.bottom ?? NaN,
          cellTop: cell?.top ?? NaN,
          cellBottom: cell?.bottom ?? NaN,
          innerHeight: window.innerHeight,
          scrollY: window.scrollY,
          scrollHeight: document.documentElement.scrollHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollPaddingTop: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
        };
      });
      expect(boxes.scrollY).toBeGreaterThan(0);
      expect(boxes.formulaTop).toBeGreaterThanOrEqual(0);
      expect(boxes.formulaBottom).toBeLessThanOrEqual(boxes.cellTop);
      expect(boxes.cellBottom).toBeLessThanOrEqual(boxes.statusTop);
      expect(boxes.statusBottom).toBeLessThanOrEqual(boxes.innerHeight);
      expect(boxes.scrollPaddingTop).toBe(boxes.formulaHeight);
      const dimensions = await page.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
        windowWidth: document.querySelector('#window')?.getBoundingClientRect().width ?? NaN,
        windowHeight: document.querySelector('#window')?.getBoundingClientRect().height ?? NaN,
        windowLeft: document.querySelector('#window')?.getBoundingClientRect().left ?? NaN,
      }));
      expect(dimensions).toEqual(before);
    });

    test(`keeps keyboard-selected top map cells below the row (${reducedMotion})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.goto('/');
      await pressStart(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.keyboard.press('Control+ArrowUp');
      await page.keyboard.press('Control+ArrowUp');
      await page.keyboard.press('Control+ArrowUp');
      await page.keyboard.press('Control+ArrowUp');
      await expect(page.locator('#cell-B2')).toHaveAttribute('aria-selected', 'true');
      const boxes = await page.evaluate(() => ({
        row: document.querySelector('.formula-row')?.getBoundingClientRect().bottom ?? NaN,
        cell: document.querySelector('#cell-B2')?.getBoundingClientRect().top ?? NaN,
      }));
      expect(boxes.cell).toBeGreaterThanOrEqual(boxes.row);
    });
  }
});

test.describe('populated editable rules cells', () => {
  for (const viewport of [
    { width: 1280, height: 1024 },
    { width: 1366, height: 768 },
  ]) {
    test(`shows a shape cue without changing cell size at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await seedLevel(page, 2);
      await page.goto('/');
      await pressStart(page);
      await page.locator('#cell-B14').click();
      await expect(page.locator('#cell-B14 .editable-cue')).toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator('#cell-C14 .editable-cue')).toHaveCount(0);
      await expect(page.locator('#cell-A14 .editable-cue')).toHaveCount(0);
      await expect(page.locator('#cell-A14 .padlock')).toHaveCount(1);
      await expect(page.locator('#cell-B2 .editable-cue')).toHaveCount(0);
      const geometry = await page.evaluate(() => {
        const cell = document.querySelector('#cell-B14');
        const cue = cell?.querySelector('.editable-cue');
        const text = cell?.querySelector('.cell-text');
        const cellBox = cell?.getBoundingClientRect();
        const cueBox = cue?.getBoundingClientRect();
        const textBox = text?.getBoundingClientRect();
        return {
          cellWidth: cellBox?.width ?? NaN,
          cueWidth: cueBox?.width ?? NaN,
          cueHeight: cueBox?.height ?? NaN,
          cueTop: cueBox?.top ?? NaN,
          cueBottom: cueBox?.bottom ?? NaN,
          cueLeft: cueBox?.left ?? NaN,
          cueRight: cueBox?.right ?? NaN,
          textBottom: textBox?.bottom ?? NaN,
          cellTop: cellBox?.top ?? NaN,
          cellBottom: cellBox?.bottom ?? NaN,
          cellLeft: cellBox?.left ?? NaN,
          cellRight: cellBox?.right ?? NaN,
          outline: cell === null ? '' : getComputedStyle(cell).outlineWidth,
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        };
      });
      expect(geometry.cellWidth).toBe(40);
      expect(geometry.cueWidth).toBeGreaterThan(20);
      expect(geometry.cueHeight).toBe(2);
      expect(geometry.cueTop).toBeGreaterThanOrEqual(geometry.textBottom);
      expect(geometry.cueBottom).toBeLessThanOrEqual(geometry.cellBottom - 4);
      expect(geometry.cueLeft).toBeGreaterThanOrEqual(geometry.cellLeft + 4);
      expect(geometry.cueRight).toBeLessThanOrEqual(geometry.cellRight - 4);
      expect(geometry.outline).toBe('3px');
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth);
    });
  }

  test('keeps the error art and ghost without a cue on unlocked cycle cells', async ({ page }) => {
    await page.clock.install();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedLevel(page, 5);
    await page.goto('/');
    await pressStart(page);
    for (const address of ['B18', 'B19']) {
      const cell = page.locator(`#cell-${address}`);
      await expect(cell).toHaveAttribute('data-error', '#CYCLE!');
      await expect(cell).toHaveClass(/cell-error-cycle/);
      await expect(cell).not.toHaveAttribute('data-locked', 'true');
      await expect(cell.locator('.editable-cue')).toHaveCount(0);
      const art = await cell.evaluate((el) => ({
        ring: getComputedStyle(el, '::before').borderTopStyle,
        underline: getComputedStyle(el).textDecorationLine,
      }));
      expect(art.ring).toBe('dotted');
      expect(art.underline).toContain('underline');
    }
    await expect(page.locator('#cell-B18')).toHaveAttribute('data-ghost', 'true');
    await expect(page.locator('[data-ghost]')).toHaveCount(1);
    const ghost = await page.locator('#cell-B18').evaluate((el) => ({
      content: getComputedStyle(el, '::after').content,
      width: getComputedStyle(el, '::after').width,
      height: getComputedStyle(el, '::after').height,
    }));
    expect(ghost.content).toBe('""');
    expect(ghost.width).toBe('14px');
    expect(ghost.height).toBe('16px');
    await expect(page.locator('#cell-B17 .editable-cue')).toHaveCount(0);
  });
});

test.describe('sticky status bar at 1280x1024', () => {
  test.use({ viewport: { width: 1280, height: 1024 } });

  test('stays inside the viewport at every scroll position', async ({ page }) => {
    await checkStickyStatusBar(page, false);
  });
});

// The window sits in the vertical middle of a tall viewport, and at the top of a short one.
async function windowBox(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => document.fonts.check('1rem VT323'))).toBe(true);
  return page.evaluate(() => {
    const box = document.querySelector('#window')?.getBoundingClientRect();
    return {
      top: box?.top ?? NaN,
      bottom: box?.bottom ?? NaN,
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      scrollY: window.scrollY,
    };
  });
}

test.describe('vertical centring', () => {
  for (const [width, height] of [
    [1920, 1200],
    [2560, 1440],
  ] as const) {
    test.describe(`at ${width}x${height}`, () => {
      test.use({ viewport: { width, height } });

      test('the gap above the window equals the gap below it, and the page does not scroll', async ({ page }) => {
        await seedLevel(page, 1);
        await page.goto('/');
        await pressStart(page);

        const box = await windowBox(page);
        const above = box.top;
        const below = box.innerHeight - box.bottom;
        expect(above).toBeGreaterThan(0);
        expect(Math.abs(above - below)).toBeLessThanOrEqual(2);
        expect(box.scrollHeight).toBeLessThanOrEqual(box.innerHeight);
      });
    });
  }

  test.describe('at 1366x768', () => {
    test.use({ viewport: { width: 1366, height: 768 } });

    test('nothing is cut off at the top when the window is taller than the viewport', async ({ page }) => {
      await seedLevel(page, 1);
      await page.goto('/');
      await pressStart(page);

      const box = await windowBox(page);
      expect(box.scrollY).toBe(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      // The window is taller than the viewport here, so the page scrolls instead of centring.
      expect(box.scrollHeight).toBeGreaterThan(box.innerHeight);
    });
  });
});
