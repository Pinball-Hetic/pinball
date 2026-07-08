import { expect, test } from '@playwright/test'
import { DMD_URL, PLAYFIELD_URL } from '../../playwright.config'

// Real cross-screen flow: an event emitted from the playfield /debug page must
// travel through the server (Socket.io) and update the DMD screen. This
// exercises the whole chain playfield -> server -> dmd, deterministically
// (no physics), which is the point of the socket architecture.
test.describe('cross-screen socket propagation', () => {
  test('SCORE emitted from playfield /debug shows on the DMD', async ({ browser }) => {
    // ?flat = the DMD's DOM renderer (the default page draws a <canvas>, so the
    // score would not be a queryable DOM node).
    const dmdCtx = await browser.newContext({ baseURL: DMD_URL })
    const dmd = await dmdCtx.newPage()
    await dmd.goto('/?flat')
    // Wait until the DMD's socket is up, else the broadcast arrives before it
    // subscribed and is lost.
    await expect(dmd.getByText('Disconnected')).toBeHidden({ timeout: 15000 })

    const debugCtx = await browser.newContext({ baseURL: PLAYFIELD_URL })
    const debug = await debugCtx.newPage()
    await debug.goto('/debug')
    await expect(debug.getByText('socket connecté')).toBeVisible({ timeout: 15000 })

    // Emit a dmd:display SCORE frame from the debug console.
    await debug.getByRole('button', { name: 'SCORE', exact: true }).click()

    // The DMD switches to SCORE mode and renders the formatted number.
    await expect(dmd.locator('.tabular-nums')).toBeVisible({ timeout: 10000 })

    await debugCtx.close()
    await dmdCtx.close()
  })
})
