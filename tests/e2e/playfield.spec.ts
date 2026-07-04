import { expect, test } from '@playwright/test'

// Playfield smoke: the monorepo home screen loads and offers the link to the
// 3D scene. Target with PLAYWRIGHT_BASE_URL=<host:port_playfield>.
test.describe('playfield kiosk', () => {
  test('home page loads with title and playfield link', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Pinball Monorepo' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ouvrir le playfield' })).toBeVisible()
  })
})
