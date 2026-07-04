# E2E Tests (Playwright)

Top-of-the-pyramid smoke tests for the three kiosk screens (playfield, dmd,
backglass). They drive a **real browser** against a **live stack** — they are
deliberately thin (page loads + one stable selector each).

> Without a running stack these specs are **expected to fail/skip**. That is
> fine — they are not part of the unit/integration green bar.

## One-time setup

Install the Playwright browser binaries (Chromium):

```sh
bunx playwright install chromium
```

## Bring the stack up

```sh
docker compose -f docker-compose.dev.yml up
```

Each screen is served on its own host port (dynamic under Fliphetic, distinct
in dev). Find the resolved ports with `docker compose port <service> 3000`.

## Run

Point `PLAYWRIGHT_BASE_URL` at the screen you want to exercise, then run the
suite. The base URL defaults to `http://localhost:3000`.

```sh
# playfield
PLAYWRIGHT_BASE_URL=http://localhost:<playfield_port> bun run test:e2e tests/e2e/playfield.spec.ts

# dmd
PLAYWRIGHT_BASE_URL=http://localhost:<dmd_port> bun run test:e2e tests/e2e/dmd.spec.ts

# backglass
PLAYWRIGHT_BASE_URL=http://localhost:<backglass_port> bun run test:e2e tests/e2e/backglass.spec.ts
```

Run everything (single base URL):

```sh
bun run test:e2e
```

## Useful flags

- `bun run test:e2e --list` — discover specs without launching browsers.
- `bun run test:e2e --headed` — watch the browser.
- `bun run test:e2e --ui` — Playwright UI mode.
