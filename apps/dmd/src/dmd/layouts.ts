import type { DmdDisplay } from '@pinball/shared-types'
import { FONT_5X7, FONT_12X22, drawText, measureText } from './fonts'
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
  scale = 1,
): void {
  const x = centerX(measureText(text, font, spacing, scale))
  drawText(grid, GRID_W, x, y, text, font, color, spacing, scale)
}

// Plus grand scale ≤ max dont le texte tient dans la largeur.
function fitScale(text: string, max: number): number {
  for (let s = max; s > 1; s--) {
    if (measureText(text, FONT_5X7, 1, s) <= GRID_W) return s
  }
  return 1
}

// Flash plein cadre scale 2 : une ligne si ça tient (≤ 8 chars), sinon
// label + valeur sur deux lignes.
function drawFlash(grid: Uint8Array, label: string, value: string, color: number): void {
  const oneLine = `${label} ${value}`
  if (measureText(oneLine, FONT_5X7, 1, 2) <= GRID_W) {
    drawCentered(grid, oneLine, 9, FONT_5X7, color, 1, 2)
  } else {
    drawCentered(grid, label, 2, FONT_5X7, color, 1, 2)
    drawCentered(grid, value, 17, FONT_5X7, color, 1, 2)
  }
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
  // Le score remplit la bande (rows 1-22). Combo/multiplier ne s'affichent
  // que via les overlays COMBO_FLASH / MULTI_FLASH (pas de ligne permanente).
  drawCentered(grid, String(d.score), 1, FONT_12X22, DOT.score)
  drawStatusRow(grid, d.lives, d.hetic, 24)
}

function layoutIntro(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'INTRO'>
  // Alterne toutes les 3s entre le marquee défilant et l'écran joueur.
  if (Math.floor(clockMs / 3000) % 2 === 0) {
    const text = 'PINBALL HETIC - PRESS START'
    const textW = measureText(text, FONT_5X7, 1, 3)
    const offset = Math.floor(clockMs / 30) % (textW + GRID_W)
    drawText(grid, GRID_W, GRID_W - offset, 5, text, FONT_5X7, DOT.marquee, 1, 3)
    return
  }

  const name = d.player && d.player !== '—' ? d.player : 'PLAYER'
  const press = 'PRESS START'
  const nameScale = fitScale(name, 2)
  const pressScale = fitScale(press, 2)
  const nameH = FONT_5X7.height * nameScale
  const pressH = FONT_5X7.height * pressScale
  const startY = Math.round((32 - (nameH + 4 + pressH)) / 2)
  drawCentered(grid, name, startY, FONT_5X7, DOT.marquee, 1, nameScale)
  drawCentered(grid, press, startY + nameH + 4, FONT_5X7, DOT.score, 1, pressScale)
}

function layoutEvent(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'EVENT'>
  if (flickerSkip(clockMs, 60, -0.7)) return
  drawFlash(grid, d.label, `+${d.points}`, DOT.event)
}

function layoutComboFlash(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'COMBO_FLASH'>
  if (flickerSkip(clockMs, 90, -0.85)) return
  drawFlash(grid, 'COMBO', `X${d.combo}`, DOT.combo)
}

function layoutMultiFlash(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'MULTI_FLASH'>
  if (flickerSkip(clockMs, 90, -0.85)) return
  drawFlash(grid, 'MULTI', `X${d.multiplier}`, DOT.multi)
}

function layoutLifeLost(grid: Uint8Array, display: DmdDisplay): void {
  // 'BALL LOST' (9 chars) ne tient pas scale 2 sur une ligne → 2 lignes.
  // Les vies sont réaffichées par le pushScore suivant (status row).
  void display
  drawCentered(grid, 'BALL', 2, FONT_5X7, DOT.lives, 1, 2)
  drawCentered(grid, 'LOST', 16, FONT_5X7, DOT.lives, 1, 2)
}

function layoutGameOver(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'GAME_OVER'>
  // 'GAME OVER' (9 chars) dépasse en scale 2 → cycle 2s GAME/OVER ↔ score.
  if (Math.floor(clockMs / 2000) % 2 === 0) {
    drawCentered(grid, 'GAME', 1, FONT_5X7, DOT.gameOver, 1, 2)
    drawCentered(grid, 'OVER', 17, FONT_5X7, DOT.gameOver, 1, 2)
  } else {
    drawCentered(grid, String(d.finalScore), 5, FONT_12X22, DOT.gameOver)
  }
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
