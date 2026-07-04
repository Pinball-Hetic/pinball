import { expect, test } from '@playwright/test'

// Backglass smoke: the page mounts the Stage (leaderboard) when map content is
// resolved, otherwise NoSignal (aria-label="no signal"). Without a live stack we
// land on NO SIGNAL — that is expected.
// Target with PLAYWRIGHT_BASE_URL=<host:port_backglass>.
test.describe('backglass kiosk', () => {
  test('page renders stage or NO SIGNAL fallback', async ({ page }) => {
    await page.goto('/')

    const noSignal = page.locator('[aria-label="no signal"]')
    const stage = page.locator('.stage-fit, main')
    await expect(noSignal.or(stage).first()).toBeVisible()
  })
})
