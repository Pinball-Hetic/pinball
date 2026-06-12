import { FONT_5X7, drawText, measureText } from './fonts'
import { GRID_W, GRID_H } from './DmdRenderer'
import { DOT } from './palette'
import { applyGlitch } from './effects'

// Attract mode : state machine PURE pilotée par l'horloge. Aucun état
// persistant — tout dérive de clockMs, donc résiste aux re-renders et aux
// reconnexions Socket.io.

const MARQUEE_TEXT = 'DEFY THE DEMOGORGON * ENTER THE UPSIDE DOWN'
const MARQUEE_SPEED = 22 // dots/s
const MARQUEE_SCALE = 3
const marqueeDuration =
  ((measureText(MARQUEE_TEXT, FONT_5X7, 1) * MARQUEE_SCALE + GRID_W) / MARQUEE_SPEED) * 1000

const PHASES: { id: string; duration: number }[] = [
  { id: 'title', duration: 5000 },
  { id: 'marquee', duration: marqueeDuration },
  { id: 'coin', duration: 5000 },
  { id: 'rules', duration: 12000 },
  { id: 'ready', duration: 4000 },
]
const TOTAL = PHASES.reduce((s, p) => s + p.duration, 0)
const TRANSITION_MS = 250

function centerX(width: number): number {
  return Math.round((GRID_W - width) / 2)
}

function drawCentered(grid: Uint8Array, text: string, y: number, color: number, scale: number): void {
  const x = centerX(measureText(text, FONT_5X7, 1, scale))
  drawText(grid, GRID_W, x, y, text, FONT_5X7, color, 1, scale)
}

function fitScale(text: string, max: number): number {
  for (let s = max; s > 1; s--) {
    if (measureText(text, FONT_5X7, 1, s) <= GRID_W) return s
  }
  return 1
}

function plot(grid: Uint8Array, x: number, y: number, color: number): void {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || px >= GRID_W || py < 0 || py >= GRID_H) return
  grid[py * GRID_W + px] = color
}

function blinkOn(tLocal: number, on: number, off: number): boolean {
  return tLocal % (on + off) < on
}

export function attractFrame(grid: Uint8Array, display: { player: string }, clockMs: number): void {
  const t = ((clockMs % TOTAL) + TOTAL) % TOTAL
  let acc = 0
  let phaseId = PHASES[0].id
  let tLocal = t
  for (const p of PHASES) {
    if (t < acc + p.duration) {
      phaseId = p.id
      tLocal = t - acc
      break
    }
    acc += p.duration
  }

  switch (phaseId) {
    case 'title':
      phaseTitle(grid, tLocal)
      break
    case 'marquee':
      phaseMarquee(grid, tLocal)
      break
    case 'coin':
      phaseCoin(grid, tLocal)
      break
    case 'rules':
      phaseRules(grid, tLocal)
      break
    case 'ready':
      phaseReady(grid, tLocal, display.player)
      break
  }

  // Transition : glitch décroissant sur les 250 premières ms de chaque phase.
  if (tLocal < TRANSITION_MS) {
    applyGlitch(grid, GRID_W, GRID_H, (TRANSITION_MS - tLocal) / TRANSITION_MS)
  }
}

// Phase 'title' — typewriter 'PINBALL' / 'HETIC' scale 2, puis pulse.
function phaseTitle(grid: Uint8Array, tLocal: number): void {
  const w1 = 'PINBALL'
  const w2 = 'HETIC'
  const scale = 2
  const total = w1.length + w2.length
  const visible = Math.floor(tLocal / 80)
  const complete = visible >= total

  let color = DOT.marquee
  if (complete) color = Math.floor(tLocal / 900) % 2 ? DOT.heticOn : DOT.marquee

  const v1 = complete ? w1.length : Math.min(w1.length, visible)
  const v2 = complete ? w2.length : Math.max(0, Math.min(w2.length, visible - w1.length))

  const x1 = centerX(measureText(w1, FONT_5X7, 1, scale))
  const x2 = centerX(measureText(w2, FONT_5X7, 1, scale))
  drawText(grid, GRID_W, x1, 2, w1.slice(0, v1), FONT_5X7, color, 1, scale)
  drawText(grid, GRID_W, x2, 17, w2.slice(0, v2), FONT_5X7, color, 1, scale)

  if (!complete && blinkOn(tLocal, 300, 300)) {
    const step = (FONT_5X7.width + 1) * scale
    if (v1 < w1.length) cursor2x2(grid, x1 + v1 * step, 2 + 2 * scale)
    else cursor2x2(grid, x2 + v2 * step, 17 + 2 * scale)
  }
}

function cursor2x2(grid: Uint8Array, x: number, y: number): void {
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) plot(grid, x + i, y + j, DOT.marquee)
}

// Phase 'marquee' — texte scale 3 qui entre à droite, sort à gauche, lu en
// entier (la phase dure exactement un passage).
function phaseMarquee(grid: Uint8Array, tLocal: number): void {
  const x = GRID_W - (tLocal / 1000) * MARQUEE_SPEED
  drawText(grid, GRID_W, Math.round(x), 5, MARQUEE_TEXT, FONT_5X7, DOT.marquee, 1, MARQUEE_SCALE)
}

// Phase 'coin' — pièce qui tombe dans une fente + 'INSERT COIN' blink.
function phaseCoin(grid: Uint8Array, tLocal: number): void {
  // Fente fixe (rect 14×2) sous la pièce.
  for (let dx = 0; dx < 14; dx++) {
    plot(grid, 2 + dx, 15, DOT.event)
    plot(grid, 2 + dx, 16, DOT.event)
  }

  const dropCycle = 1100 // ~700ms chute + 400ms pause → ~4 chutes / 5s
  const ct = tLocal % dropCycle
  if (ct < 660) {
    const topY = -9 + (ct / 700) * 17
    drawCoin(grid, 5, topY, false)
  } else if (ct < 700) {
    drawCoin(grid, 4, 8, true) // squash au contact
  }

  if (blinkOn(tLocal, 600, 400)) {
    drawText(grid, GRID_W, 20, 3, 'INSERT', FONT_5X7, DOT.event, 1, 2)
    drawText(grid, GRID_W, 20, 18, 'COIN', FONT_5X7, DOT.event, 1, 2)
  }
}

// Pièce dot-art : anneau 9×9 + barre verticale (type ₵), ou aplatie 11×7.
function drawCoin(grid: Uint8Array, cx: number, cy: number, squashed: boolean): void {
  if (squashed) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 11; dx++) {
        const d = Math.hypot((dx - 5) / 5, (dy - 3) / 3)
        if (Math.abs(d - 1) < 0.22) plot(grid, cx + dx, cy + dy, DOT.event)
      }
    }
    return
  }
  for (let dy = 0; dy < 9; dy++) {
    for (let dx = 0; dx < 9; dx++) {
      if (Math.abs(Math.hypot(dx - 4, dy - 4) - 3.7) < 0.9) plot(grid, cx + dx, cy + dy, DOT.event)
    }
  }
  for (let dy = 2; dy <= 6; dy++) plot(grid, cx + 4, cy + dy, DOT.event)
}

// Phase 'rules' — pédagogie : cibles → rangée HETIC lettre par lettre →
// FEVER X5 → le nid (déblocage du boss). 4 sous-phases sur 12s.
function phaseRules(grid: Uint8Array, tLocal: number): void {
  if (tLocal < 2500) {
    drawCentered(grid, 'COMPLETE', 4, DOT.score, 2)
    drawCentered(grid, 'LES CIBLES', 18, DOT.score, 2)
    return
  }
  if (tLocal < 5500) {
    const letters = 'HETIC'.split('')
    const lit = Math.min(5, Math.floor((tLocal - 2500) / 600) + 1)
    const step = 14
    const startX = centerX(letters.length * step)
    for (let i = 0; i < letters.length; i++) {
      drawText(grid, GRID_W, startX + i * step, 9, letters[i], FONT_5X7, i < lit ? DOT.heticOn : DOT.heticOff, 1, 2)
    }
    return
  }
  if (tLocal < 8000) {
    if (blinkOn(tLocal - 5500, 350, 350)) {
      drawCentered(grid, 'FEVER X5 !', 9, DOT.event, 2)
    }
    return
  }
  // Le nid : 3000 pts l'ouvre, puis où frapper. 2 écrans de 2s.
  if (tLocal < 10000) {
    drawCentered(grid, '3000 PTS', 4, DOT.event, fitScale('3000 PTS', 2))
    drawCentered(grid, 'LE NID S OUVRE', 18, DOT.event, fitScale('LE NID S OUVRE', 2))
    return
  }
  drawCentered(grid, 'FRAPPE LE NID', 4, DOT.heticOn, fitScale('FRAPPE LE NID', 2))
  drawCentered(grid, 'ENTRE LES BUMPERS', 18, DOT.heticOn, fitScale('ENTRE LES BUMPERS', 2))
}

// Phase 'ready' — nom joueur + 'START !' blink.
function phaseReady(grid: Uint8Array, tLocal: number, player: string): void {
  const name = player && player !== '—' ? player : 'PLAYER'
  const ns = fitScale(name, 2)
  drawCentered(grid, name, ns === 2 ? 2 : 6, DOT.score, ns)
  if (blinkOn(tLocal, 600, 400)) drawCentered(grid, 'START !', 18, DOT.event, 2)
}
