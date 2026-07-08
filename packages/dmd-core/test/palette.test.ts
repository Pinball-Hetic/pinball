import { test, expect, describe } from 'bun:test'
import {
  PALETTE_NORMAL,
  INDEX_TO_COLOR,
  DOT,
  type DotColor,
} from '../src/palette'

const COLORS: DotColor[] = [
  'score',
  'lives',
  'heticOn',
  'heticOff',
  'combo',
  'multi',
  'event',
  'gameOver',
  'marquee',
  'rain',
  'rainGo',
]

describe('PALETTE_NORMAL', () => {
  test('a une couleur hex valide pour chaque DotColor', () => {
    for (const c of COLORS) {
      expect(PALETTE_NORMAL[c]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  test('contient exactement les 11 clés attendues', () => {
    expect(Object.keys(PALETTE_NORMAL).sort()).toEqual([...COLORS].sort())
  })
})

describe('DOT', () => {
  test('mappe chaque couleur vers un index 1..11 unique', () => {
    const indices = COLORS.map((c) => DOT[c])
    expect(indices).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    // 0 is reserved for the off dot → no index 0.
    expect(indices).not.toContain(0)
    // uniqueness
    expect(new Set(indices).size).toBe(indices.length)
  })
})

describe('INDEX_TO_COLOR', () => {
  test('est cohérent avec DOT : DOT[color] - 1 pointe sur color', () => {
    for (const c of COLORS) {
      expect(INDEX_TO_COLOR[DOT[c] - 1]).toBe(c)
    }
  })

  test('liste les 11 couleurs dans l’ordre des index', () => {
    expect(INDEX_TO_COLOR).toEqual(COLORS)
  })

  test('chaque entrée a une couleur résolvable dans PALETTE_NORMAL', () => {
    for (const c of INDEX_TO_COLOR) {
      expect(PALETTE_NORMAL[c]).toBeDefined()
    }
  })
})
