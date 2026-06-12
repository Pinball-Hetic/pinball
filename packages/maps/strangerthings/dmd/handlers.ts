import {
  DOT,
  FONT_5X7,
  GRID_W,
  GRID_H,
  drawText,
  drawCentered,
  parseClip,
  trimFrame,
  revealRadial,
  dissolve,
  drawClipFrame,
  plot,
  seeded,
  type ClipHandler,
  type ParsedClip,
} from '@pinball/dmd-core'
import { DEMOGORGON_HERO } from './demogorgonHero'
import { RAW_CLIPS } from './rawClips'

// Palettes par clip (résolution char → index palette du DMD).
const RED = { ':': DOT.heticOff, '#': DOT.lives, '@': DOT.gameOver, '!': DOT.event }
const VIOLET = { ':': DOT.heticOff, '#': DOT.multi, '@': DOT.rain, '!': DOT.event }

const CLIPS: Record<'portal_swallow' | 'last_chance', ParsedClip> = {
  portal_swallow: parseClip(RAW_CLIPS.portal_swallow, VIOLET),
  last_chance: parseClip(RAW_CLIPS.last_chance, RED),
}

// Frame statique hero demogorgon + palettes procédurales.
const HERO_FRAME: string[] = trimFrame(DEMOGORGON_HERO.replace(/\r/g, '').split('\n'))
const HERO_MAP = { ':': DOT.heticOff, '#': DOT.lives, '@': DOT.gameOver, '!': DOT.event }
const HERO_MAP_PULSE = { ':': DOT.heticOff, '#': DOT.lives, '@': DOT.event, '!': DOT.gameOver }

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
  void GRID_H
}

// Handlers de cinématiques Stranger Things (injectés dans le moteur DMD).
export const cinematicHandlers: Record<string, ClipHandler> = {
  demogorgon_rises: (grid, clockMs) => {
    if (clockMs < 2800) {
      revealRadial(grid, HERO_FRAME, HERO_MAP, clockMs / 2800)
    } else {
      const pulse = Math.floor((clockMs - 2800) / 300) % 2 === 0
      revealRadial(grid, HERO_FRAME, pulse ? HERO_MAP : HERO_MAP_PULSE, 1)
    }
  },
  demogorgon_slain: (grid, clockMs) => {
    if (clockMs < 600) {
      const accent = Math.floor(clockMs / 150) % 2 === 0
      revealRadial(grid, HERO_FRAME, accent ? HERO_MAP_PULSE : HERO_MAP, 1)
    } else if (clockMs < 2600) {
      dissolve(grid, HERO_FRAME, HERO_MAP, (clockMs - 600) / 2000)
    } else {
      drawCentered(grid, 'VAINCU', 4, FONT_5X7, DOT.event, 1, 2)
      drawCentered(grid, '+500', 20, FONT_5X7, DOT.gameOver, 1, 1)
    }
  },
  hetic_letter: (grid, clockMs, ctx) => clipHeticLetter(grid, ctx.value || 1, clockMs),
  hetic_complete: (grid, clockMs) => clipHeticComplete(grid, clockMs),
  portal_swallow: (grid, clockMs) => drawClipFrame(grid, CLIPS.portal_swallow, clockMs),
  last_chance: (grid, clockMs) => {
    drawClipFrame(grid, CLIPS.last_chance, clockMs)
    drawCentered(grid, 'DERNIERE VIE', 25, FONT_5X7, DOT.lives)
  },
}
