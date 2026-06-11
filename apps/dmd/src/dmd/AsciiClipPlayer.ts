import type { CinematicClip } from '@pinball/shared-types'
import { GRID_W, GRID_H } from './DmdRenderer'
import { DOT } from './palette'
import { RAW_CLIPS } from './clips'

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

export const CLIPS: Record<CinematicClip, ParsedClip> = {
  demogorgon_rises: parseClip(RAW_CLIPS.demogorgon_rises, RED),
  portal_swallow: parseClip(RAW_CLIPS.portal_swallow, VIOLET),
  demogorgon_slain: parseClip(RAW_CLIPS.demogorgon_slain, RED),
  last_chance: parseClip(RAW_CLIPS.last_chance, RED),
  hall_of_fame: parseClip(RAW_CLIPS.hall_of_fame, AMBER),
}

// Dessine la frame courante d'un clip, centrée sur la grille.
export function drawClipFrame(grid: Uint8Array, clip: ParsedClip, elapsedMs: number): void {
  if (!clip.frames.length) return
  const raw = Math.floor((elapsedMs / 1000) * clip.fps)
  const idx = Math.min(clip.frames.length - 1, Math.max(0, raw))
  const lines = clip.frames[idx]
  const y0 = Math.floor((GRID_H - lines.length) / 2)
  for (let r = 0; r < lines.length; r++) {
    const gy = y0 + r
    if (gy < 0 || gy >= GRID_H) continue
    const line = lines[r]
    const x0 = Math.floor((GRID_W - line.length) / 2)
    for (let c = 0; c < line.length; c++) {
      const ci = clip.charMap[line[c]] ?? 0
      if (!ci) continue
      const gx = x0 + c
      if (gx < 0 || gx >= GRID_W) continue
      grid[gy * GRID_W + gx] = ci
    }
  }
}
