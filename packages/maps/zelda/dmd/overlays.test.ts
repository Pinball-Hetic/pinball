import { describe, expect, test } from 'bun:test'
import { GRID_W, GRID_H, DOT } from '@pinball/dmd-core'
import type { ScoreDisplay } from '@pinball/dmd-core'
import { scoreOverlay, feverBanner } from './overlays'

function newGrid(): Uint8Array {
  return new Uint8Array(GRID_W * GRID_H)
}

function countColor(grid: Uint8Array, color: number): number {
  let n = 0
  for (const v of grid) if (v === color) n++
  return n
}

function colorsUsed(grid: Uint8Array): Set<number> {
  const s = new Set<number>()
  for (const v of grid) if (v !== 0) s.add(v)
  return s
}

const scoreDisplay = (hetic: number): ScoreDisplay =>
  ({
    mode: 'SCORE',
    player: 'AZ',
    score: 1234,
    combo: 0,
    multiplier: 1,
    lives: 3,
    mapState: { hetic },
  }) as ScoreDisplay

describe('scoreOverlay (rangée HETIC)', () => {
  test('hetic=0 : toutes les lettres en heticOff', () => {
    const grid = newGrid()
    scoreOverlay(grid, scoreDisplay(0), 0)
    expect(countColor(grid, DOT.heticOn)).toBe(0)
    expect(countColor(grid, DOT.heticOff)).toBeGreaterThan(0)
  })

  test('hetic=5 : toutes les lettres en heticOn (aucune off)', () => {
    const grid = newGrid()
    scoreOverlay(grid, scoreDisplay(5), 0)
    expect(countColor(grid, DOT.heticOn)).toBeGreaterThan(0)
    expect(countColor(grid, DOT.heticOff)).toBe(0)
  })

  test('hetic=2 : mélange on/off (les 2 premières allumées)', () => {
    const grid = newGrid()
    scoreOverlay(grid, scoreDisplay(2), 0)
    expect(countColor(grid, DOT.heticOn)).toBeGreaterThan(0)
    expect(countColor(grid, DOT.heticOff)).toBeGreaterThan(0)
  })

  test('plus hetic monte, plus de dots heticOn', () => {
    const g1 = newGrid()
    scoreOverlay(g1, scoreDisplay(1), 0)
    const g4 = newGrid()
    scoreOverlay(g4, scoreDisplay(4), 0)
    expect(countColor(g4, DOT.heticOn)).toBeGreaterThan(countColor(g1, DOT.heticOn))
  })

  test('mapState sans clé hetic → traité comme 0 (pas de plantage)', () => {
    const grid = newGrid()
    const display = { ...scoreDisplay(0), mapState: {} } as ScoreDisplay
    expect(() => scoreOverlay(grid, display, 0)).not.toThrow()
    expect(countColor(grid, DOT.heticOn)).toBe(0)
    expect(countColor(grid, DOT.heticOff)).toBeGreaterThan(0)
  })
})

describe('feverBanner', () => {
  test('dessine le chenillard (combo/multi) + le score (event)', () => {
    const grid = newGrid()
    feverBanner(grid, 9000, 0)
    const used = colorsUsed(grid)
    // chenillard utilise combo OU multi selon la position
    expect(used.has(DOT.combo) || used.has(DOT.multi)).toBe(true)
    expect(used.has(DOT.event)).toBe(true)
  })

  test('affiche "FEVER X5" sur la frame on du clignotement', () => {
    // floor(0/350)%2===0 → on. On compare le nombre de dots event entre une
    // frame "on" et une frame "off" pour isoler le texte clignotant.
    const on = newGrid()
    feverBanner(on, 1000, 0)
    const off = newGrid()
    feverBanner(off, 1000, 350) // floor(350/350)=1 → off
    expect(countColor(on, DOT.event)).toBeGreaterThan(countColor(off, DOT.event))
  })

  test('le score apparaît dans la grille quelle que soit la frame', () => {
    const grid = newGrid()
    feverBanner(grid, 42, 350) // frame off : pas de FEVER X5, mais le score reste
    expect(countColor(grid, DOT.event)).toBeGreaterThan(0)
  })
})
