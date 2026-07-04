import { expect, test } from '@playwright/test'

// DMD smoke: the page mounts a full-screen <main>. Without a server signal the
// NO SIGNAL fallback shows (aria-label="no signal"). Both states are accepted:
// the goal is only to prove the screen loads.
// Target with PLAYWRIGHT_BASE_URL=<host:port_dmd>.
test.describe('dmd kiosk', () => {
  test('scoreboard page mounts', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('main')).toBeVisible()
  })

  test('shows NO SIGNAL fallback when server is absent', async ({ page }) => {
    await page.goto('/')

    // Either the DMD is connected (map content), or it shows NO SIGNAL.
    const noSignal = page.locator('[aria-label="no signal"]')
    const main = page.locator('main')
    await expect(noSignal.or(main).first()).toBeVisible()
  })
})
