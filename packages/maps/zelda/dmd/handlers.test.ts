import { describe, expect, test } from 'bun:test'
import { GRID_W, GRID_H, DOT } from '@pinball/dmd-core'
import { cinematicHandlers } from './handlers'
import type { ClipContext } from '@pinball/dmd-core'

// 96×32 DMD grid, palette index per dot (0 = off).
function newGrid(): Uint8Array {
  return new Uint8Array(GRID_W * GRID_H)
}

// Number of lit dots (index != 0).
function litCount(grid: Uint8Array): number {
  let n = 0
  for (const v of grid) if (v !== 0) n++
  return n
}

// Set of palette indices present.
function colorsUsed(grid: Uint8Array): Set<number> {
  const s = new Set<number>()
  for (const v of grid) if (v !== 0) s.add(v)
  return s
}

const ctx = (over: Partial<ClipContext> = {}): ClipContext => ({
  clip: 'x',
  value: 0,
  score: 0,
  ...over,
})

describe('cinematicHandlers registry', () => {
  test('expose les clips Zelda attendus', () => {
    expect(Object.keys(cinematicHandlers).sort()).toEqual(
      ['ganondorf_rises', 'ganondorf_slain', 'hetic_complete', 'hetic_letter', 'last_chance'].sort(),
    )
  })

  test('chaque handler dessine sans déborder de la grille', () => {
    for (const handler of Object.values(cinematicHandlers)) {
      const grid = newGrid()
      // several timestamps to cover the temporal branches
      for (const ms of [0, 500, 1500, 3500, 5500, 8000]) {
        handler(grid, ms, ctx({ value: 3 }))
      }
      expect(grid.length).toBe(GRID_W * GRID_H)
    }
  })
})

describe('hetic_letter', () => {
  const handler = cinematicHandlers.hetic_letter

  test('dessine la rangée HETIC + la lettre qui tombe', () => {
    const grid = newGrid()
    handler(grid, 0, ctx({ value: 1 }))
    expect(litCount(grid)).toBeGreaterThan(0)
    // at start (ms=0) the letter is off-screen top (y=-21) → only the
    // bottom row (y=25) may light up. heticOn for the 1st letter, else heticOff.
    expect(colorsUsed(grid).has(DOT.heticOn)).toBe(true)
  })

  test('après l atterrissage (ms grand) la lettre est posée dans la grille', () => {
    const early = newGrid()
    handler(early, 0, ctx({ value: 1 }))
    const late = newGrid()
    handler(late, 2000, ctx({ value: 1 }))
    // at ms=2000 the landed letter (y=2) adds dots at the top of the grid.
    expect(litCount(late)).toBeGreaterThan(litCount(early))
  })

  test('plus n est grand, plus de lettres sont allumées en heticOn', () => {
    const g1 = newGrid()
    handler(g1, 2000, ctx({ value: 1 }))
    const g5 = newGrid()
    handler(g5, 2000, ctx({ value: 5 }))
    const on = (g: Uint8Array) => {
      let n = 0
      for (const v of g) if (v === DOT.heticOn) n++
      return n
    }
    expect(on(g5)).toBeGreaterThan(on(g1))
  })

  test('clampe value hors bornes (0 et 99) sans planter', () => {
    const gLow = newGrid()
    expect(() => handler(gLow, 1000, ctx({ value: 0 }))).not.toThrow()
    expect(litCount(gLow)).toBeGreaterThan(0)
    const gHigh = newGrid()
    expect(() => handler(gHigh, 1000, ctx({ value: 99 }))).not.toThrow()
    expect(litCount(gHigh)).toBeGreaterThan(0)
  })
})

describe('hetic_complete', () => {
  const handler = cinematicHandlers.hetic_complete

  test('phase pulse (3000<ms<5000) affiche HETIC en heticOn', () => {
    // Letters orbit off-screen before 3000ms; the centered HETIC text
    // (heticOn) only appears in the pulse phase.
    const grid = newGrid()
    handler(grid, 4000, ctx())
    expect(colorsUsed(grid).has(DOT.heticOn)).toBe(true)
  })

  test('phase explosion (5000<ms<7000) utilise event/combo', () => {
    const grid = newGrid()
    handler(grid, 6000, ctx())
    const used = colorsUsed(grid)
    expect(used.has(DOT.event) || used.has(DOT.combo)).toBe(true)
  })

  test('phase finale (ms>7000) affiche HETIC FEVER en event/combo', () => {
    // ms chosen to land on the "on" frame of the blink.
    const grid = newGrid()
    handler(grid, 7000, ctx())
    const used = colorsUsed(grid)
    expect(used.has(DOT.event)).toBe(true)
    expect(used.has(DOT.combo)).toBe(true)
  })

  test('clignotement: frame off de la phase finale peut être vide', () => {
    // Math.floor(ms/250)%2 === 1 → nothing drawn.
    const grid = newGrid()
    handler(grid, 7250, ctx())
    expect(litCount(grid)).toBe(0)
  })
})

describe('ganondorf_rises', () => {
  const handler = cinematicHandlers.ganondorf_rises

  test('affiche GANONDORF en gameOver dès le début', () => {
    const grid = newGrid()
    handler(grid, 0, ctx())
    expect(colorsUsed(grid).has(DOT.gameOver)).toBe(true)
  })

  test('après 2000ms ajoute "S EVEILLE" en lives sur frame on', () => {
    // on frame = floor(ms/400)%2===0 → ms=2400.
    const grid = newGrid()
    handler(grid, 2400, ctx())
    expect(colorsUsed(grid).has(DOT.lives)).toBe(true)
  })

  test('le sous-titre clignote (frame off n affiche que GANONDORF)', () => {
    const grid = newGrid()
    // ms=2400 → floor(2400/400)=6, %2===0 → on; ms=2800 → 7 → off
    handler(grid, 2800, ctx())
    expect(colorsUsed(grid).has(DOT.gameOver)).toBe(true)
    expect(colorsUsed(grid).has(DOT.lives)).toBe(false)
  })
})

describe('ganondorf_slain', () => {
  const handler = cinematicHandlers.ganondorf_slain

  test('explosion (ms<2600) éparpille des dots event/lives', () => {
    const grid = newGrid()
    handler(grid, 1300, ctx())
    const used = colorsUsed(grid)
    expect(used.has(DOT.event) || used.has(DOT.lives)).toBe(true)
  })

  test('après 2600ms affiche VAINCU (event) + 500 (gameOver)', () => {
    const grid = newGrid()
    handler(grid, 3000, ctx())
    const used = colorsUsed(grid)
    expect(used.has(DOT.event)).toBe(true)
    expect(used.has(DOT.gameOver)).toBe(true)
  })
})

describe('last_chance', () => {
  test('affiche DERNIERE VIE en lives, indépendant de l horloge', () => {
    const handler = cinematicHandlers.last_chance
    const grid = newGrid()
    handler(grid, 99999, ctx())
    expect(colorsUsed(grid).has(DOT.lives)).toBe(true)
    expect(litCount(grid)).toBeGreaterThan(0)
  })
})
