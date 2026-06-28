import { defineConfig, devices } from '@playwright/test'

// E2E Playwright — sommet de la pyramide de tests. Smoke only.
// Ces specs tournent contre une stack live (`docker compose up`).
// Sans la stack, ils sont attendus en échec/skip — c'est normal.
//
// baseURL : chaque écran (playfield/dmd/backglass) a son propre port hôte
// dynamique en prod Fliphetic, et un port distinct en dev local. Surcharger
// via PLAYWRIGHT_BASE_URL pour cibler l'écran voulu avant de lancer la suite.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
