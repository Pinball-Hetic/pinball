import {
  DOT,
  FONT_5X7,
  FONT_12X22,
  GRID_W,
  GRID_H,
  drawText,
  drawCentered,
  drawChenillard,
  type ScoreOverlay,
  type FeverBanner,
} from '@pinball/dmd-core'
import { mapStateNumber } from '@pinball/shared-types'

// Overlay HETIC (rangée droite) — identique à ST, indépendant du thème.
export const scoreOverlay: ScoreOverlay = (grid, display) => {
  const hetic = mapStateNumber(display.mapState, 'hetic')
  const letters = 'HETIC'
  const step = 8
  const startX = GRID_W - 2 - (letters.length * FONT_5X7.width + (letters.length - 1) * (step - FONT_5X7.width))
  for (let i = 0; i < letters.length; i++) {
    const color = i < hetic ? DOT.heticOn : DOT.heticOff
    drawText(grid, GRID_W, startX + i * step, 24, letters[i], FONT_5X7, color)
  }
}

// Bandeau FEVER Zelda : chenillard doré + gros score + "FEVER X5".
export const feverBanner: FeverBanner = (grid, score, clockMs) => {
  drawChenillard(grid, clockMs, 0)
  drawChenillard(grid, -clockMs, GRID_H - 1)
  drawCentered(grid, String(score), 2, FONT_12X22, DOT.event)
  if (Math.floor(clockMs / 350) % 2 === 0) {
    drawCentered(grid, 'FEVER X5', 25, FONT_5X7, DOT.event)
  }
}
