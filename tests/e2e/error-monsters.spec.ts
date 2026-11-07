import { expect, test } from '@playwright/test';

const FIXTURE_URL = '/tests/fixtures/errors.html';

// The exact cause texts come from the error-monsters design (describeCellError, not invented here).
const CAUSES: ReadonlyArray<{ cell: string; kind: string; text: string }> = [
  { cell: 'B9', kind: '#REF!', text: 'B9 refers to M30, which does not exist' },
  { cell: 'D9', kind: '#NAME?', text: 'D9 calls FOO, which is not a function' },
  { cell: 'F9', kind: '#DIV/0!', text: 'F9 divides by zero' },
  { cell: 'H9', kind: '#VALUE!', text: 'H9 used text where a number is needed' },
  { cell: 'J9', kind: '#CYCLE!', text: 'J9 is on a circular reference with K9' },
];

test('error cells show their look, cause, and a ghost that drifts, stops and honours reduced motion', async ({
  page,
}) => {
  // Playwright 1.65: install the clock before navigating so the ghost timer is under our control.
  await page.clock.install();
  await page.goto(FIXTURE_URL);

  const grid = page.locator('#grid-table');
  await expect(grid).toBeFocused();

  // 1. Classes and data-error of the five error kinds.
  await expect(page.locator('#cell-B9')).toHaveClass(/cell-error-ref/);
  await expect(page.locator('#cell-B9')).toHaveAttribute('data-error', '#REF!');
  await expect(page.locator('#cell-D9')).toHaveClass(/cell-error-name/);
  await expect(page.locator('#cell-D9')).toHaveAttribute('data-error', '#NAME?');
  await expect(page.locator('#cell-F9')).toHaveClass(/cell-error-div0/);
  await expect(page.locator('#cell-F9')).toHaveAttribute('data-error', '#DIV/0!');
  await expect(page.locator('#cell-H9')).toHaveClass(/cell-error-value/);
  await expect(page.locator('#cell-H9')).toHaveAttribute('data-error', '#VALUE!');
  for (const address of ['J9', 'K9', 'L9']) {
    await expect(page.locator(`#cell-${address}`)).toHaveClass(/cell-error-cycle/);
    await expect(page.locator(`#cell-${address}`)).toHaveAttribute('data-error', '#CYCLE!');
  }

  // 2. The title of B9 carries the cause verbatim.
  await expect(page.locator('#cell-B9')).toHaveAttribute(
    'title',
    'B9 refers to M30, which does not exist',
  );

  // 3. Ctrl/Meta+Arrow moves the selection (no turn) to each error cell; the explanation line follows.
  const explanation = page.locator('#cell-explanation');

  // Selection starts at the hero cell B2. Seven downs reach B9.
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('ControlOrMeta+ArrowDown');
  }

  // Then two rights per step along row 9: B9 -> D9 -> F9 -> H9 -> J9.
  for (const [i, cause] of CAUSES.entries()) {
    if (i > 0) {
      await page.keyboard.press('ControlOrMeta+ArrowRight');
      await page.keyboard.press('ControlOrMeta+ArrowRight');
    }
    await expect(explanation).toHaveText(cause.text);
    await expect(explanation).toHaveAttribute('data-error', cause.kind);
  }

  // 4. The ghost sits on J9, the first cycle cell in reading order; exactly one cell carries it.
  await expect(page.locator('#cell-J9')).toHaveAttribute('data-ghost', 'true');
  await expect(page.locator('[data-ghost]')).toHaveCount(1);

  // After one interval it steps to K9; the downstream cell L9 never carries the ghost.
  await page.clock.runFor(800);
  await expect(page.locator('#cell-K9')).toHaveAttribute('data-ghost', 'true');
  await expect(page.locator('[data-ghost]')).toHaveCount(1);
  await expect(page.locator('#cell-L9')).not.toHaveAttribute('data-ghost', 'true');

  // 5. Error text fits its cell (S11): the text box is no wider than the cell's inner width.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.fonts.check('12px VT323'));
  for (const address of ['F9', 'H9', 'J9']) {
    const fit = await page.evaluate((addr) => {
      const td = document.querySelector(`#cell-${addr}`);
      const el = document.querySelector(`#cell-${addr} .cell-text`);
      if (td === null || el === null) return null;
      return {
        textWidth: el.getBoundingClientRect().width,
        cellInner: td.clientWidth,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    }, address);
    expect(fit, `${address} has a text element`).not.toBeNull();
    if (fit === null) continue;
    expect(fit.textWidth, `${address} text box vs cell inner width`).toBeLessThanOrEqual(
      fit.cellInner,
    );
    expect(fit.scrollWidth, `${address} scrollWidth vs clientWidth`).toBeLessThanOrEqual(
      fit.clientWidth,
    );
  }

  // 6. Reduced motion holds the ghost still; the current position is kept, no stepping over time.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#cell-J9')).toHaveAttribute('data-ghost', 'true');
  await page.clock.runFor(2400);
  await expect(page.locator('#cell-J9')).toHaveAttribute('data-ghost', 'true');
  await expect(page.locator('[data-ghost]')).toHaveCount(1);

  // Turning motion back on lets the ghost drift again.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.runFor(800);
  await expect(page.locator('#cell-K9')).toHaveAttribute('data-ghost', 'true');

  // 7. Editing K9 to a plain number breaks the cycle; the ghost disappears entirely.
  await page.keyboard.press('ControlOrMeta+ArrowRight'); // selection J9 -> K9
  await page.keyboard.press('Enter');
  await expect(page.locator('#formula-bar')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-ghost]')).toHaveCount(0);
});
