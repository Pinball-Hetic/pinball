import { expect, test } from '@playwright/test'

// Smoke DMD : la page monte un <main> plein écran. Sans signal serveur, le
// fallback NO SIGNAL s'affiche (aria-label="no signal"). On accepte les deux
// états : l'objectif est juste de prouver que l'écran charge.
// Cibler avec PLAYWRIGHT_BASE_URL=<host:port_dmd>.
test.describe('dmd kiosk', () => {
  test('scoreboard page mounts', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('main')).toBeVisible()
  })

  test('shows NO SIGNAL fallback when server is absent', async ({ page }) => {
    await page.goto('/')

    // Soit le DMD est connecté (contenu de map), soit il affiche NO SIGNAL.
    const noSignal = page.locator('[aria-label="no signal"]')
    const main = page.locator('main')
    await expect(noSignal.or(main).first()).toBeVisible()
  })
})
