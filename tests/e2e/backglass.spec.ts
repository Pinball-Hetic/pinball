import { expect, test } from '@playwright/test'

// Smoke backglass : la page monte le Stage (classement) quand le contenu de map
// est résolu, sinon NoSignal (aria-label="no signal"). Sans stack live, on
// tombe sur NO SIGNAL — c'est attendu.
// Cibler avec PLAYWRIGHT_BASE_URL=<host:port_backglass>.
test.describe('backglass kiosk', () => {
  test('page renders stage or NO SIGNAL fallback', async ({ page }) => {
    await page.goto('/')

    const noSignal = page.locator('[aria-label="no signal"]')
    const stage = page.locator('.stage-fit, main')
    await expect(noSignal.or(stage).first()).toBeVisible()
  })
})
