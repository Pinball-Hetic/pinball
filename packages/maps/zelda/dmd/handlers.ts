import {
  DOT,
  FONT_5X7,
  GRID_W,
  drawText,
  drawCentered,
  plot,
  seeded,
  type ClipHandler,
} from '@pinball/dmd-core'

// Handlers de cinématiques Zelda.
// TODO: ajouter des frames hero Ganondorf (équivalent DEMOGORGON_HERO) quand
// les assets dot-art seront disponibles.

const HETIC_LETTERS = 'HETIC'.split('')

function clipHeticLetter(grid: Uint8Array, n: number, ms: number): void {
  const idx = Math.max(0, Math.min(4, n - 1))
  const letter = HETIC_LETTERS[idx]
  const landMs = 900
  const landY = 2
  let y: number
  let shake = 0
  if (ms < landMs) {
    const p = ms / landMs
    y = -21 + p * (landY + 21)
  } else {
    y = landY
    if (ms < landMs + 80) shake = 1
  }
  const sx = shake ? (Math.floor(ms) % 2 ? 1 : -1) : 0
  const step = 8
  const startX = Math.round((GRID_W - 5 * step) / 2)
  for (let i = 0; i < 5; i++) {
    const lit = i <= idx
    drawText(grid, GRID_W, startX + i * step + sx, 25, HETIC_LETTERS[i], FONT_5X7, lit ? DOT.heticOn : DOT.heticOff)
  }
  drawCentered(grid, letter, y, FONT_5X7, DOT.heticOn, 1, 3)
}

function clipHeticComplete(grid: Uint8Array, ms: number): void {
  const cx = GRID_W / 2
  const cy = 12
  if (ms < 3000) {
    const p = ms / 3000
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const x = cx + Math.cos(a) * (1 - p) * 50
      const yy = cy + Math.sin(a) * (1 - p) * 14
      drawText(grid, GRID_W, x, yy, HETIC_LETTERS[i], FONT_5X7, DOT.heticOn, 1, 2)
    }
  } else if (ms < 5000) {
    const speed = 200 - ((ms - 3000) / 2000) * 150
    if (Math.floor(ms / speed) % 2 === 0) {
      drawCentered(grid, 'HETIC', 4, FONT_5X7, DOT.heticOn, 1, 3)
    }
  } else if (ms < 7000) {
    const p = (ms - 5000) / 2000
    for (let i = 0; i < 60; i++) {
      const a = seeded(i) * Math.PI * 2
      const d = seeded(i * 2) * p * 60
      plot(grid, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.5, i % 2 ? DOT.event : DOT.combo)
    }
  } else {
    if (Math.floor(ms / 250) % 2 === 0) {
      drawCentered(grid, 'HETIC FEVER', 3, FONT_5X7, DOT.event, 1, 2)
      drawCentered(grid, 'X5', 18, FONT_5X7, DOT.combo, 1, 2)
    }
  }
}

// Placeholder hero Ganondorf : texte ASCII en attendant un vrai dot-art.
function clipGanondorfRises(grid: Uint8Array, ms: number): void {
  const p = Math.min(1, ms / 2000)
  const y = Math.round(15 - p * 10)
  drawCentered(grid, 'GANONDORF', y, FONT_5X7, DOT.gameOver, 1, 2)
  if (ms > 2000 && Math.floor(ms / 400) % 2 === 0) {
    drawCentered(grid, 'S EVEILLE', y + 14, FONT_5X7, DOT.lives, 1, 1)
  }
}

function clipGanondorfSlain(grid: Uint8Array, ms: number): void {
  if (ms < 2600) {
    const cx = GRID_W / 2
    const cy = 12
    for (let i = 0; i < 60; i++) {
      const a = seeded(i) * Math.PI * 2
      const d = seeded(i * 2) * (ms / 2600) * 40
      plot(grid, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.5, i % 2 ? DOT.event : DOT.lives)
    }
  } else {
    drawCentered(grid, 'VAINCU', 4, FONT_5X7, DOT.event, 1, 2)
    drawCentered(grid, '+500', 20, FONT_5X7, DOT.gameOver, 1, 1)
  }
}

export const cinematicHandlers: Record<string, ClipHandler> = {
  ganondorf_rises: (grid, clockMs) => clipGanondorfRises(grid, clockMs),
  ganondorf_slain: (grid, clockMs) => clipGanondorfSlain(grid, clockMs),
  hetic_letter: (grid, clockMs, ctx) => clipHeticLetter(grid, ctx.value || 1, clockMs),
  hetic_complete: (grid, clockMs) => clipHeticComplete(grid, clockMs),
  // sacred_realm : TODO — ajouter un clip dot-art du portail / Triforce.
  last_chance: (grid, _clockMs) => {
    drawCentered(grid, 'DERNIERE VIE', 25, FONT_5X7, DOT.lives)
  },
}
