import type { CinematicClip } from '@pinball/shared-types'
import { GRID_W, GRID_H } from '@pinball/dmd-core'
import { DOT } from '@pinball/dmd-core'
import { RAW_CLIPS } from './clips'
import { DEMOGORGON_HERO } from './clips/demogorgonHero'

export interface ParsedClip {
  fps: number
  frames: string[][]
  charMap: Record<string, number>
}

function trimFrame(lines: string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === '') start++
  while (end > start && lines[end - 1].trim() === '') end--
  return lines.slice(start, end)
}

export function parseClip(src: string, charMap: Record<string, number>): ParsedClip {
  let fps = 8
  const frames: string[][] = []
  let cur: string[] = []
  for (const line of src.replace(/\r/g, '').split('\n')) {
    const m = /^#\s*fps:\s*(\d+)/.exec(line)
    if (m) {
      fps = parseInt(m[1], 10)
      continue
    }
    if (line.startsWith('#')) continue
    if (line.trim() === '===') {
      const f = trimFrame(cur)
      if (f.length) frames.push(f)
      cur = []
      continue
    }
    cur.push(line)
  }
  const last = trimFrame(cur)
  if (last.length) frames.push(last)
  return { fps, frames, charMap }
}

// Palettes par clip (résolution char → index palette du DMD).
const RED = { ':': DOT.heticOff, '#': DOT.lives, '@': DOT.gameOver, '!': DOT.event }
const VIOLET = { ':': DOT.heticOff, '#': DOT.multi, '@': DOT.rain, '!': DOT.event }
const AMBER = { ':': DOT.heticOff, '#': DOT.score, '@': DOT.marquee, '!': DOT.event }

// Clips frame-par-frame restants (rises/slain sont désormais procéduraux).
export const CLIPS: Record<'portal_swallow' | 'last_chance' | 'hall_of_fame', ParsedClip> = {
  portal_swallow: parseClip(RAW_CLIPS.portal_swallow, VIOLET),
  last_chance: parseClip(RAW_CLIPS.last_chance, RED),
  hall_of_fame: parseClip(RAW_CLIPS.hall_of_fame, AMBER),
}

export function clipFor(clip: CinematicClip): ParsedClip | null {
  return clip in CLIPS ? CLIPS[clip as keyof typeof CLIPS] : null
}

// Dessine la frame courante d'un clip frame-par-frame, centrée sur la grille.
export function drawClipFrame(grid: Uint8Array, clip: ParsedClip, elapsedMs: number): void {
  if (!clip.frames.length) return
  const raw = Math.floor((elapsedMs / 1000) * clip.fps)
  const idx = Math.min(clip.frames.length - 1, Math.max(0, raw))
  blit(grid, clip.frames[idx], (ch) => clip.charMap[ch] ?? 0)
}

// ── Frame statique hero + transformations procédurales ────────────────────
export const HERO_FRAME: string[] = trimFrame(DEMOGORGON_HERO.replace(/\r/g, '').split('\n'))

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

// Hash déterministe (x,y) → [0,1) — stable entre frames (pas de scintillement).
function hash01(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0
  n = (n ^ (n >> 13)) * 1274126177
  n = n ^ (n >> 16)
  return ((n >>> 0) % 1000) / 1000
}

// Blit générique : map(char, x, y) → index palette (0 = ne pas dessiner).
function blit(
  grid: Uint8Array,
  lines: string[],
  map: (ch: string, x: number, y: number) => number,
): void {
  const y0 = Math.floor((GRID_H - lines.length) / 2)
  for (let r = 0; r < lines.length; r++) {
    const gy = y0 + r
    if (gy < 0 || gy >= GRID_H) continue
    const line = lines[r]
    const x0 = Math.floor((GRID_W - line.length) / 2)
    for (let c = 0; c < line.length; c++) {
      const ch = line[c]
      if (ch === '.' || ch === ' ') continue
      const ci = map(ch, c, r)
      if (!ci) continue
      const gx = x0 + c
      if (gx < 0 || gx >= GRID_W) continue
      grid[gy * GRID_W + gx] = ci
    }
  }
}

// Le monstre "pousse" du sol vers la corolle : une cellule n'apparaît que
// si sa distance à l'ancre (centre-bas = les pieds) est dans le rayon
// révélé. Les 15% de front montent en intensité accent (lisière incandescente).
export function revealRadial(
  grid: Uint8Array,
  frame: string[],
  charMap: Record<string, number>,
  t01: number,
): void {
  const h = frame.length
  const w = Math.max(...frame.map((l) => l.length))
  const ax = w / 2
  const ay = h - 1
  // distance max depuis l'ancre (coin haut de la corolle)
  const distMax = Math.hypot(Math.max(ax, w - ax), ay)
  const reveal = easeOutCubic(Math.max(0, Math.min(1, t01))) * distMax
  const front = distMax * 0.15

  blit(grid, frame, (ch, x, y) => {
    const dist = Math.hypot(x - ax, y - ay)
    if (dist > reveal) return 0
    if (dist >= reveal - front) return charMap['!'] // lisière incandescente
    return charMap[ch] ?? 0
  })
}

// Désintégration en poussière : chaque cellule a un seuil stable ; elle
// disparaît quand t01 dépasse son seuil, en passant par ':' (poussière).
export function dissolve(
  grid: Uint8Array,
  frame: string[],
  charMap: Record<string, number>,
  t01: number,
): void {
  blit(grid, frame, (ch, x, y) => {
    const threshold = hash01(x, y)
    if (t01 <= threshold) return charMap[ch] ?? 0
    if (t01 <= threshold + 0.1) return charMap[':'] // poussière
    return 0
  })
}
