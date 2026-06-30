import { test, expect, describe } from 'bun:test'
import { GRID_W, GRID_H, DOT } from '@pinball/dmd-core'
import type { ClipContext } from '@pinball/dmd-core'
import { cinematicHandlers } from './handlers'

// Crée un buffer grid vierge (index palette par dot, 0 = éteint).
const newGrid = () => new Uint8Array(GRID_W * GRID_H)
const litCount = (g: Uint8Array) => g.reduce((acc, v) => acc + (v ? 1 : 0), 0)
const usedColors = (g: Uint8Array) => new Set([...g].filter((v) => v !== 0))
const ctx = (over: Partial<ClipContext> = {}): ClipContext => ({
  clip: 'x',
  value: 0,
  score: 0,
  ...over,
})

describe('cinematicHandlers registry', () => {
  test('expose les 6 clips ST attendus', () => {
    expect(Object.keys(cinematicHandlers).sort()).toEqual(
      [
        'demogorgon_rises',
        'demogorgon_slain',
        'hetic_complete',
        'hetic_letter',
        'last_chance',
        'portal_swallow',
      ].sort(),
    )
  })

  test('chaque handler écrit dans la grille sans déborder du buffer', () => {
    for (const [, handler] of Object.entries(cinematicHandlers)) {
      const grid = newGrid()
      handler(grid, 500, ctx({ value: 3, score: 1000 }))
      expect(grid.length).toBe(GRID_W * GRID_H)
      // aucun handler ne doit allumer un index hors palette (1..11)
      for (const v of grid) {
        expect(v).toBeLessThanOrEqual(11)
        expect(v).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe('demogorgon_rises', () => {
  test('reveal progressif allume des dots avant 2800ms', () => {
    const grid = newGrid()
    cinematicHandlers.demogorgon_rises(grid, 1400, ctx())
    expect(litCount(grid)).toBeGreaterThan(0)
  })

  test('alterne entre deux palettes en phase pulse (>=2800ms)', () => {
    // pulse=true à (clockMs-2800) dans [0,300[, pulse=false dans [300,600[
    const a = newGrid()
    const b = newGrid()
    cinematicHandlers.demogorgon_rises(a, 2900, ctx()) // pulse true
    cinematicHandlers.demogorgon_rises(b, 3200, ctx()) // pulse false
    // Les deux frames sont pleines (reveal complet à p=1) mais diffèrent par
    // la palette d'accent (gameOver vs event).
    expect(litCount(a)).toBeGreaterThan(0)
    expect(litCount(b)).toBeGreaterThan(0)
    expect([...a].join(',')).not.toBe([...b].join(','))
  })
})

describe('demogorgon_slain', () => {
  test('phase flash (<600ms) allume le hero', () => {
    const grid = newGrid()
    cinematicHandlers.demogorgon_slain(grid, 100, ctx())
    expect(litCount(grid)).toBeGreaterThan(0)
  })

  test('phase dissolve (600-2600ms) réduit progressivement les dots', () => {
    const early = newGrid()
    const late = newGrid()
    cinematicHandlers.demogorgon_slain(early, 700, ctx()) // dissolve ~5%
    cinematicHandlers.demogorgon_slain(late, 2500, ctx()) // dissolve ~95%
    expect(litCount(late)).toBeLessThan(litCount(early))
  })

  test('phase finale (>=2600ms) affiche VAINCU + bonus', () => {
    const grid = newGrid()
    cinematicHandlers.demogorgon_slain(grid, 3000, ctx())
    const colors = usedColors(grid)
    // VAINCU en event, +500 en gameOver
    expect(colors.has(DOT.event)).toBe(true)
    expect(colors.has(DOT.gameOver)).toBe(true)
  })
})

describe('hetic_letter', () => {
  test('utilise ctx.value pour choisir la lettre et la fait tomber', () => {
    const falling = newGrid()
    const landed = newGrid()
    cinematicHandlers.hetic_letter(falling, 100, ctx({ value: 3 })) // en chute
    cinematicHandlers.hetic_letter(landed, 950, ctx({ value: 3 })) // atterri
    expect(litCount(falling)).toBeGreaterThan(0)
    expect(litCount(landed)).toBeGreaterThan(0)
  })

  test('clamp value hors bornes (0 et 99) sans crash', () => {
    const low = newGrid()
    const high = newGrid()
    expect(() => cinematicHandlers.hetic_letter(low, 950, ctx({ value: 0 }))).not.toThrow()
    expect(() => cinematicHandlers.hetic_letter(high, 950, ctx({ value: 99 }))).not.toThrow()
    expect(litCount(low)).toBeGreaterThan(0)
    expect(litCount(high)).toBeGreaterThan(0)
  })

  test('value=0 par défaut (|| 1) traité comme lettre 1', () => {
    const a = newGrid()
    const b = newGrid()
    cinematicHandlers.hetic_letter(a, 950, ctx({ value: 0 }))
    cinematicHandlers.hetic_letter(b, 950, ctx({ value: 1 }))
    expect([...a].join(',')).toBe([...b].join(','))
  })

  test('la rangée HETIC allume plus de lettres quand value augmente', () => {
    // i <= idx → heticOn (DOT.heticOn=3), sinon heticOff (DOT.heticOff=4).
    const countOn = (value: number) => {
      const g = newGrid()
      cinematicHandlers.hetic_letter(g, 950, ctx({ value }))
      return [...g].filter((v) => v === DOT.heticOn).length
    }
    expect(countOn(5)).toBeGreaterThan(countOn(1))
  })
})

describe('hetic_complete', () => {
  test('phase converge (<3000ms) finit par allumer des lettres', () => {
    // Les lettres convergent depuis l'extérieur de l'écran ; on échantillonne
    // la fenêtre pour trouver une frame où elles sont visibles.
    let anyLit = false
    for (let ms = 1000; ms < 3000; ms += 100) {
      const g = newGrid()
      cinematicHandlers.hetic_complete(g, ms, ctx())
      if (litCount(g) > 0) {
        anyLit = true
        break
      }
    }
    expect(anyLit).toBe(true)
  })

  test('phase blink (3000-5000ms) clignote selon le temps', () => {
    // Le draw est conditionné par Math.floor(ms/speed)%2 ; on cherche au
    // moins une frame allumée dans la fenêtre.
    let anyLit = false
    for (let ms = 3000; ms < 5000; ms += 50) {
      const g = newGrid()
      cinematicHandlers.hetic_complete(g, ms, ctx())
      if (litCount(g) > 0) {
        anyLit = true
        break
      }
    }
    expect(anyLit).toBe(true)
  })

  test('phase burst (5000-7000ms) utilise event et combo', () => {
    const grid = newGrid()
    cinematicHandlers.hetic_complete(grid, 6000, ctx())
    const colors = usedColors(grid)
    expect(colors.has(DOT.event) || colors.has(DOT.combo)).toBe(true)
  })

  test('phase finale (>=7000ms) affiche HETIC FEVER / X5', () => {
    // Cherche une frame "on" du clignotement final.
    let colors = new Set<number>()
    for (let ms = 7000; ms < 7600; ms += 50) {
      const g = newGrid()
      cinematicHandlers.hetic_complete(g, ms, ctx())
      if (litCount(g) > 0) {
        colors = usedColors(g)
        break
      }
    }
    expect(colors.has(DOT.event)).toBe(true)
    expect(colors.has(DOT.combo)).toBe(true)
  })

  test('déterministe : même ms → même grille (seeded RNG)', () => {
    const a = newGrid()
    const b = newGrid()
    cinematicHandlers.hetic_complete(a, 6000, ctx())
    cinematicHandlers.hetic_complete(b, 6000, ctx())
    expect([...a].join(',')).toBe([...b].join(','))
  })
})

describe('portal_swallow & last_chance (clip frames)', () => {
  test('portal_swallow dessine une frame du clip', () => {
    const grid = newGrid()
    cinematicHandlers.portal_swallow(grid, 200, ctx())
    expect(litCount(grid)).toBeGreaterThan(0)
  })

  test('last_chance dessine la frame + libellé DERNIERE VIE', () => {
    const grid = newGrid()
    cinematicHandlers.last_chance(grid, 200, ctx())
    const colors = usedColors(grid)
    // Le label "DERNIERE VIE" est dessiné en DOT.lives.
    expect(colors.has(DOT.lives)).toBe(true)
    expect(litCount(grid)).toBeGreaterThan(0)
  })
})
