import { test, expect, describe } from 'bun:test'
import {
  GRID_W,
  GRID_H,
  PITCH,
  CANVAS_W,
  CANVAS_H,
  hexToRgb,
  spriteGradientStops,
  gridDrawPlan,
} from './dmdGrid'

describe('constantes', () => {
  test('dimensions logiques et pitch', () => {
    expect(GRID_W).toBe(96)
    expect(GRID_H).toBe(32)
    expect(PITCH).toBe(20)
  })

  test('dimensions canvas physiques dérivées', () => {
    expect(CANVAS_W).toBe(GRID_W * PITCH)
    expect(CANVAS_H).toBe(GRID_H * PITCH)
    expect(CANVAS_W).toBe(1920)
    expect(CANVAS_H).toBe(640)
  })
})

describe('hexToRgb', () => {
  test('parse un hex avec dièse', () => {
    expect(hexToRgb('#FFA028')).toEqual([255, 160, 40])
  })

  test('parse un hex sans dièse', () => {
    expect(hexToRgb('00C8FF')).toEqual([0, 200, 255])
  })

  test('noir et blanc', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0])
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255])
  })
})

describe('spriteGradientStops', () => {
  test('produit exactement 4 color stops aux offsets attendus', () => {
    const stops = spriteGradientStops('#010203')
    expect(stops.map((s) => s.offset)).toEqual([0, 0.55, 0.75, 1])
  })

  test('alpha décroissant verbatim selon le halo', () => {
    const stops = spriteGradientStops('#010203')
    expect(stops[0].color).toBe('rgba(1,2,3,1)')
    expect(stops[1].color).toBe('rgba(1,2,3,1)')
    expect(stops[2].color).toBe('rgba(1,2,3,0.85)')
    expect(stops[3].color).toBe('rgba(1,2,3,0)')
  })
})

describe('gridDrawPlan', () => {
  test('grille éteinte → plan vide', () => {
    const grid = new Uint8Array(GRID_W * GRID_H)
    expect(gridDrawPlan(grid)).toEqual([])
  })

  test('ignore les dots index 0', () => {
    const grid = new Uint8Array(GRID_W * GRID_H)
    grid[0] = 0
    grid[1] = 0
    expect(gridDrawPlan(grid)).toHaveLength(0)
  })

  test('mappe un dot allumé vers sa position pixel', () => {
    const grid = new Uint8Array(GRID_W * GRID_H)
    const x = 3
    const y = 2
    grid[y * GRID_W + x] = 5
    const plan = gridDrawPlan(grid)
    expect(plan).toEqual([{ colorIndex: 5, px: x * PITCH, py: y * PITCH }])
  })

  test('un dot par cellule allumée', () => {
    const grid = new Uint8Array(GRID_W * GRID_H)
    grid[0] = 1
    grid[1] = 2
    grid[2] = 3
    expect(gridDrawPlan(grid)).toHaveLength(3)
  })

  test('ordre de parcours y puis x (row-major)', () => {
    const grid = new Uint8Array(GRID_W * GRID_H)
    // one dot on row 1 (col 0) and one on row 0 (col 1):
    // row-major order must visit (y=0,x=1) before (y=1,x=0).
    grid[1 * GRID_W + 0] = 9 // y=1, x=0
    grid[0 * GRID_W + 1] = 7 // y=0, x=1
    const plan = gridDrawPlan(grid)
    expect(plan.map((d) => d.colorIndex)).toEqual([7, 9])
    expect(plan[0]).toEqual({ colorIndex: 7, px: 1 * PITCH, py: 0 })
    expect(plan[1]).toEqual({ colorIndex: 9, px: 0, py: 1 * PITCH })
  })
})
