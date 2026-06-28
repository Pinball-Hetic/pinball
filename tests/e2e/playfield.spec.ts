import { expect, test } from '@playwright/test'

// Smoke playfield : l'écran d'accueil monorepo charge et propose le lien vers
// la scène 3D. Cibler avec PLAYWRIGHT_BASE_URL=<host:port_playfield>.
test.describe('playfield kiosk', () => {
  test('home page loads with title and playfield link', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Pinball Monorepo' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ouvrir le playfield' })).toBeVisible()
  })
})
