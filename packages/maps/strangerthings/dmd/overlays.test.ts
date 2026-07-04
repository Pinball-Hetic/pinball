import { test, expect, describe } from 'bun:test'
import { GRID_W, GRID_H, DOT } from '@pinball/dmd-core'
import type { ScoreDisplay } from '@pinball/dmd-core'
import { scoreOverlay, feverBanner } from './overlays'

const newGrid = () => new Uint8Array(GRID_W * GRID_H)
const usedColors = (g: Uint8Array) => new Set([...g].filter((v) => v !== 0))
const countColor = (g: Uint8Array, c: number) => [...g].filter((v) => v === c).length

const scoreDisplay = (hetic: number): ScoreDisplay => ({
  mode: 'SCORE',
  player: 'AAA',
  score: 12345,
  combo: 0,
  multiplier: 1,
  lives: 3,
  mapState: { hetic },
  alternateWorld: false,
})

describe('scoreOverlay (rangée HETIC)', () => {
  test('hetic=0 → toutes les lettres en heticOff', () => {
    const grid = newGrid()
    scoreOverlay(grid, scoreDisplay(0), 0)
    expect(countColor(grid, DOT.heticOn)).toBe(0)
    expect(countColor(grid, DOT.heticOff)).toBeGreaterThan(0)
  })

  test('hetic=5 → toutes les lettres en heticOn', () => {
    const grid = newGrid()
    scoreOverlay(grid, scoreDisplay(5), 0)
    expect(countColor(grid, DOT.heticOn)).toBeGreaterThan(0)
    expect(countColor(grid, DOT.heticOff)).toBe(0)
  })

  test('hetic partiel : plus on monte, plus de dots heticOn', () => {
    const g2 = newGrid()
    const g4 = newGrid()
    scoreOverlay(g2, scoreDisplay(2), 0)
    scoreOverlay(g4, scoreDisplay(4), 0)
    expect(countColor(g4, DOT.heticOn)).toBeGreaterThan(countColor(g2, DOT.heticOn))
  })

  test('mapState sans clé hetic → fallback 0 (lecture sûre)', () => {
    const grid = newGrid()
    const display = { ...scoreDisplay(0), mapState: {} }
    expect(() => scoreOverlay(grid, display, 0)).not.toThrow()
    expect(countColor(grid, DOT.heticOn)).toBe(0)
  })

  test('overlay confiné à la rangée droite (x élevé)', () => {
    const grid = newGrid()
    scoreOverlay(grid, scoreDisplay(5), 0)
    let minX = GRID_W
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (grid[y * GRID_W + x]) minX = Math.min(minX, x)
      }
    }
    // startX = GRID_W - 2 - width → well inside the right half.
    expect(minX).toBeGreaterThan(GRID_W / 2)
  })
})

describe('feverBanner', () => {
  test('dessine le score en gros (DOT.event) + chenillards', () => {
    const grid = newGrid()
    feverBanner(grid, 99999, 0)
    const colors = usedColors(grid)
    expect(colors.has(DOT.event)).toBe(true)
    // chase uses combo/multi
    expect(colors.has(DOT.combo) || colors.has(DOT.multi)).toBe(true)
  })

  test('le libellé FEVER X5 clignote selon clockMs', () => {
    // floor(ms/350)%2===0 → label visible; otherwise hidden.
    const on = newGrid()
    const off = newGrid()
    feverBanner(on, 1000, 0) // floor(0/350)=0 → visible
    feverBanner(off, 1000, 350) // floor(350/350)=1 → hidden
    // The "on" frame must have at least as many dots as the "off" frame
    // (the label adds event dots at the bottom of the screen).
    const litOn = [...on].filter(Boolean).length
    const litOff = [...off].filter(Boolean).length
    expect(litOn).toBeGreaterThanOrEqual(litOff)
  })

  test('les chenillards défilent avec le temps (frames différentes)', () => {
    const a = newGrid()
    const b = newGrid()
    feverBanner(a, 12345, 0)
    feverBanner(b, 12345, 120) // shifts the chases (off = floor(ms/60))
    expect([...a].join(',')).not.toBe([...b].join(','))
  })

  test('score différent → rendu différent', () => {
    const a = newGrid()
    const b = newGrid()
    feverBanner(a, 1, 0)
    feverBanner(b, 888888, 0)
    expect([...a].join(',')).not.toBe([...b].join(','))
  })
})
