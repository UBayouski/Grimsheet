import { expect, test } from '@playwright/test';

const FIXTURE_URL = '/tests/fixtures/index.html';

// Regression (found in play): after clicking Recover, focus stays on the button, and pressing R
// to confirm the restart did nothing. R must confirm the pending restart even from the button.
test('click Recover, press R, and the level restarts at turn 0 with full ink', async ({ page }) => {
  await page.goto(FIXTURE_URL);

  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-screen', 'playing');
  const hero = page.locator('[data-entity="hero"]');
  const startAddress = await hero.getAttribute('data-address');

  // Make a move so a restart has a visible effect, then open the restart confirmation.
  await page.keyboard.press('ArrowRight');
  await expect(hero).not.toHaveAttribute('data-address', startAddress ?? '');

  const recover = page.locator('[data-control="recover"]');
  await recover.click();
  await expect(page.locator('#message')).toContainText('Restart this level?');
  // Focus is on the Recover button after the click, the state that broke confirming with R.
  await expect(recover).toBeFocused();

  await page.keyboard.press('r');

  await expect(app).toHaveAttribute('data-screen', 'playing');
  await expect(hero).toHaveAttribute('data-address', startAddress ?? '');
  await expect(page.locator('#status-bar')).toContainText('Turn 0');
  await expect(page.locator('#status-bar')).toContainText('Ink 3/3');
});
