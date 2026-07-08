import { defineConfig, devices } from '@playwright/test'

// Live-stack E2E. Start the app first:
//   docker compose -f docker-compose.dev.yml up
// then: bun run test:e2e
// Each screen has its own dev host port; override if yours differ.
export const PLAYFIELD_URL = process.env.PLAYFIELD_URL ?? 'http://localhost:3333'
export const DMD_URL = process.env.DMD_URL ?? 'http://localhost:3335'
export const BACKGLASS_URL = process.env.BACKGLASS_URL ?? 'http://localhost:3336'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: { trace: 'on-first-retry' },
  projects: [
    {
      name: 'playfield',
      testMatch: /playfield\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: PLAYFIELD_URL },
    },
    {
      name: 'dmd',
      testMatch: /dmd\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: DMD_URL },
    },
    {
      name: 'backglass',
      testMatch: /backglass\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: BACKGLASS_URL },
    },
    {
      // Cross-screen flow: opens several screens at once, uses absolute URLs.
      name: 'flow',
      testMatch: /flow\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
