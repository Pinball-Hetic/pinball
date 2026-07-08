import { expect, test } from '@playwright/test'

// Playfield smoke: the game entry is /pinball (there is no '/' home). It boots
// into the map selector, which renders interactive nav buttons.
test.describe('playfield kiosk', () => {
  test('/pinball boots into the map selector', async ({ page }) => {
    await page.goto('/pinball')
    await expect(page.locator('button').first()).toBeVisible()
  })
})
