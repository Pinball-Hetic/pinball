import type { DmdDisplay } from '@pinball/shared-types'
import { FONT_5X7, FONT_12X22, drawText, measureText } from './fonts'
import { GRID_W, GRID_H } from './DmdRenderer'
import { DOT } from './palette'
import { attractFrame } from './attract'
import {
  clipFor,
  drawClipFrame,
  revealRadial,
  dissolve,
  HERO_FRAME,
} from './AsciiClipPlayer'

// Palette du demogorgon (rouge + accent jaune) pour les transfos procédurales.
const HERO_MAP = { ':': DOT.heticOff, '#': DOT.lives, '@': DOT.gameOver, '!': DOT.event }
// Variante pulse : '!' ↔ '@' inversés (gueule qui clignote).
const HERO_MAP_PULSE = { ':': DOT.heticOff, '#': DOT.lives, '@': DOT.event, '!': DOT.gameOver }

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

// Flash plein cadre scale 2 : une ligne si ça tient (≤ 8 chars), sinon
// label + valeur sur deux lignes.
function drawFlash(grid: Uint8Array, label: string, value: string, color: number): void {
  // Bandeau informatif sans valeur (« LE NID S EVEILLE », « ENCORE X PTS ») :
  // une seule ligne, échelle réduite si nécessaire pour tenir dans le cadre.
  if (!value) {
    const scale = measureText(label, FONT_5X7, 1, 2) <= GRID_W ? 2 : 1
    drawCentered(grid, label, 9, FONT_5X7, color, 1, scale)
    return
  }
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

// ── Helpers procéduraux (paliers / HETIC) ────────────────────────────────
function plot(grid: Uint8Array, x: number, y: number, color: number): void {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || px >= GRID_W || py < 0 || py >= GRID_H) return
  grid[py * GRID_W + px] = color
}

// RNG déterministe seedée (stable entre frames → pas de scintillement).
function seeded(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function fmtNum(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

// Cadre étoilé procédural (hall_of_fame) : étoiles CONFINÉES aux bords
// (bandes x<8 / x>GRID_W-8 / y<2 / y>GRID_H-3) → jamais sur la zone centrale
// du titre. Scintillement déterministe via seeded (pas de Math.random).
function drawStarBorder(grid: Uint8Array, ms: number): void {
  const phase = Math.floor(ms / 350)
  for (let y = 0; y < GRID_H; y++) {
    const edgeY = y < 2 || y >= GRID_H - 2
    for (let x = 0; x < GRID_W; x++) {
      const edgeX = x < 8 || x >= GRID_W - 8
      if (!edgeY && !edgeX) continue
      if (seeded(x * 7.1 + y * 131.3) >= 0.1) continue
      const lit = (Math.floor(seeded(x + y * 3) * 4) + phase) % 4 === 0
      if (!lit) continue
      plot(grid, x, y, x % 2 ? DOT.score : DOT.marquee)
    }
  }
}

// Chenillard orange/cyan défilant sur une rangée.
function drawChenillard(grid: Uint8Array, clockMs: number, y: number): void {
  const off = Math.floor(clockMs / 60)
  for (let x = 0; x < GRID_W; x++) {
    if ((x + off) % 3 === 0) {
      plot(grid, x, y, ((x + off) >> 1) % 2 === 0 ? DOT.combo : DOT.multi)
    }
  }
}

// Bandeau FEVER (mode SCORE) : chenillard haut/bas + score accent + "FEVER X5".
function drawFeverBanner(grid: Uint8Array, score: number, clockMs: number): void {
  drawChenillard(grid, clockMs, 0)
  drawChenillard(grid, -clockMs, GRID_H - 1)
  drawCentered(grid, String(score), 2, FONT_12X22, DOT.event)
  if (Math.floor(clockMs / 350) % 2 === 0) {
    drawCentered(grid, 'FEVER X5', 25, FONT_5X7, DOT.event)
  }
}

function layoutScore(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'SCORE'>
  if (d.fever) {
    drawFeverBanner(grid, d.score, clockMs)
    return
  }
  // Le score remplit la bande (rows 1-22). Combo/multiplier ne s'affichent
  // que via les overlays COMBO_FLASH / MULTI_FLASH (pas de ligne permanente).
  drawCentered(grid, String(d.score), 1, FONT_12X22, DOT.score)
  drawStatusRow(grid, d.lives, d.hetic, 24)
}

// ── Clips paliers (procéduraux) ───────────────────────────────────────────
function clipMilestone5k(grid: Uint8Array, value: number, ms: number): void {
  const t = Math.min(1, ms / 4000)
  const cx = GRID_W / 2
  const cy = 12
  const r = (1 - Math.pow(1 - Math.min(1, ms / 1500), 3)) * 26
  const fade = ms > 3200 ? 1 - (ms - 3200) / 800 : 1
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    if (seeded(i) < fade) {
      plot(grid, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, DOT.event)
    }
  }
  if (t < 0.95) drawCentered(grid, `${fmtNum(value)} !`, 22, FONT_5X7, DOT.score, 1, 2)
}

function clipMilestone15k(grid: Uint8Array, value: number, ms: number): void {
  const celebrate = ms > 3000
  // 3 éclairs verticaux seedés, flashent alternativement.
  const active = Math.floor(ms / 120) % 3
  for (let b = 0; b < 3; b++) {
    if (celebrate && b !== active) continue
    if (b !== active && !celebrate) continue
    const x0 = 12 + Math.floor(seeded(b * 7 + 1) * (GRID_W - 24))
    let x = x0
    for (let y = 0; y < GRID_H; y++) {
      plot(grid, x, y, DOT.multi)
      x += seeded(b * 31 + y) < 0.5 ? -1 : 1
    }
  }
  if (!celebrate) {
    drawCentered(grid, fmtNum(value), 4, FONT_5X7, DOT.score, 1, 3)
  } else {
    drawCentered(grid, fmtNum(value), 0, FONT_5X7, DOT.score, 1, 1)
    for (let i = 0; i < 14; i++) {
      plot(grid, seeded(i + Math.floor(ms / 200)) * GRID_W, seeded(i * 3) * GRID_H, DOT.event)
    }
  }
}

function clipMilestone30k(grid: Uint8Array, value: number, ms: number): void {
  const cx = GRID_W / 2
  if (ms < 2500) {
    // fusée qui monte
    const y = GRID_H - (ms / 2500) * (GRID_H - 4)
    plot(grid, cx, y, DOT.event)
    plot(grid, cx - 1, y + 1, DOT.score)
    plot(grid, cx + 1, y + 1, DOT.score)
    plot(grid, cx, y + 2, DOT.lives) // flamme
    plot(grid, cx, y + 3, DOT.combo)
  } else {
    // explosion en pluie d'étoiles depuis le sommet
    const et = (ms - 2500) / (13000 - 2500)
    for (let i = 0; i < 26; i++) {
      const a = seeded(i) * Math.PI * 2
      const speed = 6 + seeded(i * 2) * 18
      const x = cx + Math.cos(a) * speed * et * 2
      const y = 4 + Math.sin(a) * speed * et + et * et * 30 // retombée
      plot(grid, x, y, seeded(i) > 0.5 ? DOT.event : DOT.score)
    }
    drawCentered(grid, fmtNum(value), 22, FONT_5X7, DOT.score, 1, 1)
  }
}

function clipMilestoneBig(grid: Uint8Array, value: number, ms: number): void {
  // 5 explosions successives (cercles concentriques seedés par value).
  for (let e = 0; e < 5; e++) {
    const start = e * 1800
    const local = ms - start
    if (local < 0 || local > 2200) continue
    const cx = 14 + seeded(value + e) * (GRID_W - 28)
    const cy = 6 + seeded(value + e * 5) * 16
    const r = (local / 2200) * 14
    const fade = 1 - local / 2200
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      if (seeded(i + e) < fade + 0.3) {
        plot(grid, cx + Math.cos(a) * r, cy + Math.sin(a) * r, i % 2 ? DOT.event : DOT.combo)
      }
    }
  }
  drawCentered(grid, fmtNum(value), 4, FONT_5X7, DOT.score, 1, 3)
}

const HETIC_LETTERS = 'HETIC'.split('')

function clipHeticLetter(grid: Uint8Array, n: number, ms: number): void {
  const idx = Math.max(0, Math.min(4, n - 1))
  const letter = HETIC_LETTERS[idx]
  const landMs = 900
  const landY = 2 // atterrit au-dessus de la rangée (rows 2-22)
  let y: number
  let shake = 0
  if (ms < landMs) {
    const p = ms / landMs
    y = -21 + p * (landY + 21) // chute hors écran (y=-21) → y=2
  } else {
    y = landY
    if (ms < landMs + 80) shake = 1 // clunk
  }
  const sx = shake ? (Math.floor(ms) % 2 ? 1 : -1) : 0
  // rangée H E T I C en bas dessinée AVANT la grande lettre
  const step = 8
  const startX = Math.round((GRID_W - 5 * step) / 2)
  for (let i = 0; i < 5; i++) {
    const lit = i <= idx
    drawText(grid, GRID_W, startX + i * step + sx, 25, HETIC_LETTERS[i], FONT_5X7, lit ? DOT.heticOn : DOT.heticOff)
  }
  drawCentered(grid, letter, y, FONT_5X7, DOT.heticOn, 1, 3)
}

function clipHeticComplete(grid: Uint8Array, _score: number, ms: number): void {
  // 10s de cinématique plein écran. Après, l'orchestrator rend la main au
  // mode SCORE (bandeau fever + score LIVE) — voir CLIP_TAKEOVER_MS.
  void _score
  const cx = GRID_W / 2
  const cy = 12
  if (ms < 3000) {
    // les 5 lettres convergent du bord vers le centre
    const p = ms / 3000
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const x = cx + Math.cos(a) * (1 - p) * 50
      const y = cy + Math.sin(a) * (1 - p) * 14
      drawText(grid, GRID_W, x, y, HETIC_LETTERS[i], FONT_5X7, DOT.heticOn, 1, 2)
    }
  } else if (ms < 5000) {
    // assemblage "HETIC" qui pulse de plus en plus vite
    const speed = 200 - ((ms - 3000) / 2000) * 150
    if (Math.floor(ms / speed) % 2 === 0) {
      drawCentered(grid, 'HETIC', 4, FONT_5X7, DOT.heticOn, 1, 3)
    }
  } else if (ms < 7000) {
    // explosion : particules qui remplissent l'écran
    const p = (ms - 5000) / 2000
    for (let i = 0; i < 60; i++) {
      const a = seeded(i) * Math.PI * 2
      const d = seeded(i * 2) * p * 60
      plot(grid, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.5, i % 2 ? DOT.event : DOT.combo)
    }
  } else {
    // "HETIC FEVER" + "MULTIPLIER X5" clignotant
    if (Math.floor(ms / 250) % 2 === 0) {
      drawCentered(grid, 'HETIC FEVER', 3, FONT_5X7, DOT.event, 1, 2)
      drawCentered(grid, 'X5', 18, FONT_5X7, DOT.combo, 1, 2)
    }
  }
}

function layoutIntro(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'INTRO'>
  attractFrame(grid, d, clockMs)
}

function layoutEvent(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'EVENT'>
  if (flickerSkip(clockMs, 60, -0.7)) return
  drawFlash(grid, d.label, d.points > 0 ? `+${d.points}` : '', DOT.event)
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

// clockMs = temps écoulé depuis l'arrivée du mode CINEMATIC (le DmdCanvas
// passe l'elapsed pour ce mode, pas l'horloge absolue).
function layoutCinematic(grid: Uint8Array, display: DmdDisplay, clockMs: number): void {
  const d = display as Variant<'CINEMATIC'>

  // ── demogorgon_rises (4000ms) : pousse radiale puis pulse ───────────────
  if (d.clip === 'demogorgon_rises') {
    if (clockMs < 2800) {
      revealRadial(grid, HERO_FRAME, HERO_MAP, clockMs / 2800)
    } else {
      // frame complète, gueule qui clignote (inversion '!'/'@' toutes les 300ms)
      const pulse = Math.floor((clockMs - 2800) / 300) % 2 === 0
      revealRadial(grid, HERO_FRAME, pulse ? HERO_MAP : HERO_MAP_PULSE, 1)
    }
    return
  }

  // ── demogorgon_slain (3500ms) : flash → dissolve → VAINCU +500 ──────────
  if (d.clip === 'demogorgon_slain') {
    if (clockMs < 600) {
      // flash : 2 ticks accent plein
      const accent = Math.floor(clockMs / 150) % 2 === 0
      revealRadial(grid, HERO_FRAME, accent ? HERO_MAP_PULSE : HERO_MAP, 1)
    } else if (clockMs < 2600) {
      dissolve(grid, HERO_FRAME, HERO_MAP, (clockMs - 600) / 2000)
    } else {
      drawCentered(grid, 'VAINCU', 4, FONT_5X7, DOT.event, 1, 2)
      drawCentered(grid, '+500', 20, FONT_5X7, DOT.gameOver, 1, 1)
    }
    return
  }

  // ── Clips paliers / HETIC (procéduraux, durée = CLIP_SHOW_MS) ───────────
  const value = d.value ?? 0
  switch (d.clip) {
    case 'milestone_5k':
      clipMilestone5k(grid, value || 5000, clockMs)
      return
    case 'milestone_15k':
      clipMilestone15k(grid, value || 15000, clockMs)
      return
    case 'milestone_30k':
      clipMilestone30k(grid, value || 30000, clockMs)
      return
    case 'milestone_big':
      clipMilestoneBig(grid, value || 50000, clockMs)
      return
    case 'hetic_letter':
      clipHeticLetter(grid, value || 1, clockMs)
      return
    case 'hetic_complete':
      clipHeticComplete(grid, d.score, clockMs)
      return
    default:
      break
  }

  const clip = clipFor(d.clip)
  if (!clip) return

  if (d.clip === 'hall_of_fame') {
    // 3.5s de cadre étoilé, puis le compteur roule de 0 au score en 1.5s.
    if (clockMs < 3500) {
      drawStarBorder(grid, clockMs)
      drawCentered(grid, 'HALL OF FAME', 13, FONT_5X7, DOT.marquee)
    } else {
      const t = Math.min(1, (clockMs - 3500) / 1500)
      const eased = 1 - Math.pow(1 - t, 3)
      const shown = Math.round(d.score * eased)
      drawCentered(grid, 'HALL OF FAME', 1, FONT_5X7, DOT.marquee)
      drawCentered(grid, String(shown), 9, FONT_12X22, DOT.score)
    }
    return
  }

  drawClipFrame(grid, clip, clockMs)
  if (d.clip === 'last_chance') {
    drawCentered(grid, 'DERNIERE VIE', 25, FONT_5X7, DOT.lives)
  }
}

export const layouts: Record<DmdDisplay['mode'], LayoutFn> = {
  INTRO: layoutIntro,
  CINEMATIC: layoutCinematic,
  SCORE: layoutScore,
  EVENT: layoutEvent,
  COMBO_FLASH: layoutComboFlash,
  MULTI_FLASH: layoutMultiFlash,
  LIFE_LOST: layoutLifeLost,
  GAME_OVER: layoutGameOver,
}
