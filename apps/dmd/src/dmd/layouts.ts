import type { DmdDisplay } from '@pinball/shared-types'
import { FONT_5X7, FONT_10X16, drawText, measureText } from './fonts'
import { GRID_W } from './DmdRenderer'
import { DOT } from './palette'

const TOTAL_LIVES = 3

type Variant<M extends DmdDisplay['mode']> = Extract<DmdDisplay, { mode: M }>
export type LayoutFn = (grid: Uint8Array, display: DmdDisplay, clockMs: number) => void

function centerX(width: number): number {
  return Math.round((GRID_W - width) / 2)
}

// "pulse" : occulte le draw 1 frame quand la sinusoïde plonge — donne un
// clignotement nerveux sans masquer trop longtemps (le decay phosphor lisse).
function flickerSkip(clockMs: number, period: number, floor: number): boolean {
  return Math.sin(clockMs / period) < floor
}

function drawCentered(
  grid: Uint8Array,
  text: string,
  y: number,
  font: typeof FONT_5X7,
  color: number,
  spacing = 1,
): void {
  drawText(grid, GRID_W, centerX(measureText(text, font, spacing)), y, text, font, color, spacing)
}

// Vies (gauche) + HETIC (droite) sur les rows basses.
function drawStatusRow(grid: Uint8Array, lives: number, hetic: number, y: number): void {
  for (let i = 0; i < TOTAL_LIVES; i++) {
    const color = i < lives ? DOT.lives : DOT.heticOff
    drawText(grid, GRID_W, 2 + i * 7, y, '●', FONT_5X7, color)
  }
  const letters = 'HETIC'
  const step = 8
  const startX = GRID_W - 2 - (letters.length * FONT_5X7.width + (letters.length - 1) * (step - FONT_5X7.width))
  for (let i = 0; i < letters.length; i++) {
    const color = i < hetic ? DOT.heticOn : DOT.heticOff
    drawText(grid, GRID_W, startX + i * step, y, letters[i], FONT_5X7, color)
  }
}

function layoutScore(grid: Uint8Array, display: DmdDisplay): void {
  const d = display as Variant<'SCORE'>
  drawCentered(grid, String(d.score), 3, FONT_10X16, DOT.score)

  const pieces: { text: string; color: number }[] = []
  if (d.combo > 1) pieces.push({ text: `COMBO x${d.combo}`, color: DOT.combo })
  if (d.multiplier > 1) pieces.push({ text: `MULTI x${d.multiplier}`, color: DOT.multi })
  if (pieces.length > 0) {
    const gap = 4
    const total =
      pieces.reduce((sum, p) => sum + measureText(p.text, FONT_5X7), 0) + gap * (pieces.length - 1)
    let x = centerX(total)
    for (const p of pieces) {
      drawText(grid, GRID_W, x, 21, p.text, FONT_5X7, p.color)
      x += measureText(p.text, FONT_5X7) + gap
    }
  }

  drawStatusRow(grid, d.lives, d.hetic, 25)
}

function layoutIntro(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'INTRO'>
  const text = 'PINBALL HETIC - PRESS START'
  const textW = measureText(text, FONT_5X7)
  const offset = Math.floor(clockMs / 30) % (textW + GRID_W)
  drawText(grid, GRID_W, GRID_W - offset, 8, text, FONT_5X7, DOT.marquee)
  if (d.player && d.player !== '—') {
    drawCentered(grid, d.player, 24, FONT_5X7, DOT.marquee)
  }
}

function layoutEvent(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'EVENT'>
  if (flickerSkip(clockMs, 60, -0.7)) return
  drawCentered(grid, d.label, 3, FONT_5X7, DOT.event)
  drawAmount(grid, d.points, 12, DOT.event)
}

// "+N" : '+' en 5×7 (absent du 10×16) collé aux chiffres épais.
function drawAmount(grid: Uint8Array, points: number, y: number, color: number): void {
  const num = String(points)
  const plusW = FONT_5X7.width
  const gap = 2
  const total = plusW + gap + measureText(num, FONT_10X16)
  const x = centerX(total)
  drawText(grid, GRID_W, x, y + 5, '+', FONT_5X7, color)
  drawText(grid, GRID_W, x + plusW + gap, y, num, FONT_10X16, color)
}

// "x{n}" : 'x' en 5×7 (absent du 10×16) collé au chiffre épais.
function drawTimes(grid: Uint8Array, n: number, y: number, color: number): void {
  const num = String(n)
  const xW = FONT_5X7.width
  const gap = 2
  const total = xW + gap + measureText(num, FONT_10X16)
  const x = centerX(total)
  drawText(grid, GRID_W, x, y + 5, 'x', FONT_5X7, color)
  drawText(grid, GRID_W, x + xW + gap, y, num, FONT_10X16, color)
}

function layoutComboFlash(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'COMBO_FLASH'>
  if (flickerSkip(clockMs, 90, -0.85)) return
  drawCentered(grid, 'COMBO', 2, FONT_5X7, DOT.combo)
  drawTimes(grid, d.combo, 12, DOT.combo)
}

function layoutMultiFlash(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'MULTI_FLASH'>
  if (flickerSkip(clockMs, 90, -0.85)) return
  drawCentered(grid, 'MULTI', 2, FONT_5X7, DOT.multi)
  drawTimes(grid, d.multiplier, 12, DOT.multi)
}

function layoutLifeLost(grid: Uint8Array, display: DmdDisplay): void {
  const d = display as Variant<'LIFE_LOST'>
  drawCentered(grid, 'BALL LOST', 5, FONT_5X7, DOT.lives)
  const dots = '●'.repeat(TOTAL_LIVES)
  const w = measureText(dots, FONT_5X7)
  let x = centerX(w)
  for (let i = 0; i < TOTAL_LIVES; i++) {
    const color = i < d.livesRemaining ? DOT.lives : DOT.heticOff
    drawText(grid, GRID_W, x, 18, '●', FONT_5X7, color)
    x += FONT_5X7.width + 1
  }
}

function layoutGameOver(grid: Uint8Array, display: DmdDisplay): void {
  const d = display as Variant<'GAME_OVER'>
  drawCentered(grid, 'GAME OVER', 2, FONT_5X7, DOT.gameOver)
  drawCentered(grid, String(d.finalScore), 9, FONT_10X16, DOT.gameOver)
  drawCentered(grid, d.player, 25, FONT_5X7, DOT.gameOver)
}

export const layouts: Record<DmdDisplay['mode'], LayoutFn> = {
  INTRO: layoutIntro,
  SCORE: layoutScore,
  EVENT: layoutEvent,
  COMBO_FLASH: layoutComboFlash,
  MULTI_FLASH: layoutMultiFlash,
  LIFE_LOST: layoutLifeLost,
  GAME_OVER: layoutGameOver,
}
