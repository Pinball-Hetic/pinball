import { test, expect, describe } from 'bun:test'
import {
  FONT_5X7,
  FONT_12X22,
  measureText,
  drawText,
  type BitmapFont,
} from '../src/fonts'

// Helper: collects the lit (x,y) coords (index != 0) of a grid.
function litPixels(grid: Uint8Array, gridW: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const gridH = grid.length / gridW
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      if (grid[y * gridW + x] !== 0) out.push([x, y])
    }
  }
  return out
}

describe('font tables', () => {
  test('FONT_5X7 expose width/height attendus', () => {
    expect(FONT_5X7.width).toBe(5)
    expect(FONT_5X7.height).toBe(7)
  })

  test('chaque glyphe 5x7 a height rows', () => {
    for (const rows of Object.values(FONT_5X7.glyphs)) {
      expect(rows).toHaveLength(7)
    }
  })

  test('FONT_12X22 expose width/height attendus', () => {
    expect(FONT_12X22.width).toBe(12)
    expect(FONT_12X22.height).toBe(22)
  })

  test('chaque glyphe 12x22 a 22 rows', () => {
    for (const rows of Object.values(FONT_12X22.glyphs)) {
      expect(rows).toHaveLength(22)
    }
  })
})

describe('measureText', () => {
  test('retourne 0 pour une chaîne vide', () => {
    expect(measureText('', FONT_5X7)).toBe(0)
  })

  test('un seul caractère = font.width (pas de spacing ajouté)', () => {
    expect(measureText('A', FONT_5X7)).toBe(5)
  })

  test('inclut le spacing entre caractères mais pas au bout', () => {
    // 3 chars * 5 + 2 gaps * 1 = 17
    expect(measureText('ABC', FONT_5X7, 1)).toBe(17)
  })

  test('respecte un spacing personnalisé', () => {
    // 2 chars * 5 + 1 gap * 3 = 13
    expect(measureText('AB', FONT_5X7, 3)).toBe(13)
  })

  test('applique le scale sur toute la largeur', () => {
    // (2*5 + 1*1) * 2 = 22
    expect(measureText('AB', FONT_5X7, 1, 2)).toBe(22)
  })

  test('fonctionne avec la grosse fonte 12x22', () => {
    // 2 chars * 12 + 1 gap = 25
    expect(measureText('12', FONT_12X22, 1)).toBe(25)
  })
})

describe('drawText — écriture des pixels', () => {
  test('dessine le glyphe avec MSB = colonne la plus à gauche', () => {
    // 1-row, 3-bit font: set bit = column 0 only (0b100).
    const font: BitmapFont = {
      width: 3,
      height: 1,
      glyphs: { A: [0b100] },
    }
    const grid = new Uint8Array(3 * 1)
    drawText(grid, 3, 0, 0, 'A', font, 5)
    expect(litPixels(grid, 3)).toEqual([[0, 0]])
    expect(grid[0]).toBe(5) // written colorIndex
  })

  test('mappe correctement plusieurs bits dans une row', () => {
    // 0b101 → columns 0 and 2 lit.
    const font: BitmapFont = { width: 3, height: 1, glyphs: { A: [0b101] } }
    const grid = new Uint8Array(3)
    drawText(grid, 3, 0, 0, 'A', font, 1)
    expect(litPixels(grid, 3)).toEqual([
      [0, 0],
      [2, 0],
    ])
  })

  test('écrit le colorIndex donné, laisse 0 ailleurs', () => {
    const grid = new Uint8Array(5 * 7)
    drawText(grid, 5, 0, 0, '1', FONT_5X7, 7)
    const lit = litPixels(grid, 5)
    expect(lit.length).toBeGreaterThan(0)
    for (const [x, y] of lit) {
      expect(grid[y * 5 + x]).toBe(7)
    }
  })

  test('avance le curseur de (width + spacing) * scale par caractère', () => {
    const font: BitmapFont = { width: 3, height: 1, glyphs: { A: [0b100] } }
    const grid = new Uint8Array(10)
    drawText(grid, 10, 0, 0, 'AA', font, 1, 1) // spacing=1
    // 1st A → col 0; 2nd A advances by (3+1) = 4 → col 4
    expect(litPixels(grid, 10)).toEqual([
      [0, 0],
      [4, 0],
    ])
  })

  test('positionne le glyphe à l’offset (x, y)', () => {
    const font: BitmapFont = { width: 1, height: 1, glyphs: { A: [0b1] } }
    const grid = new Uint8Array(5 * 5)
    drawText(grid, 5, 2, 3, 'A', font, 1)
    expect(litPixels(grid, 5)).toEqual([[2, 3]])
  })

  test('agrandit chaque dot en bloc scale×scale', () => {
    const font: BitmapFont = { width: 1, height: 1, glyphs: { A: [0b1] } }
    const grid = new Uint8Array(4 * 4)
    drawText(grid, 4, 0, 0, 'A', font, 1, 1, 2) // scale=2
    expect(litPixels(grid, 4)).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ])
  })

  test('ignore un glyphe inconnu (rien dessiné) mais avance le curseur', () => {
    const font: BitmapFont = { width: 1, height: 1, glyphs: { A: [0b1] } }
    const grid = new Uint8Array(5)
    drawText(grid, 5, 0, 0, '?A', font, 9, 0) // '?' missing
    // unknown '?' → cursor advances by (1+0)=1 → A at col 1
    expect(litPixels(grid, 5)).toEqual([[1, 0]])
  })

  test('clippe les pixels hors de la grille en X', () => {
    const font: BitmapFont = { width: 2, height: 1, glyphs: { A: [0b11] } }
    const grid = new Uint8Array(2)
    // x=1 → col0 inside the grid (x=1), col1 outside (x=2) → ignored, no crash
    drawText(grid, 2, 1, 0, 'A', font, 3)
    expect(litPixels(grid, 2)).toEqual([[1, 0]])
  })

  test('clippe les pixels hors de la grille en Y', () => {
    const font: BitmapFont = { width: 1, height: 2, glyphs: { A: [0b1, 0b1] } }
    const grid = new Uint8Array(1) // only 1 row
    drawText(grid, 1, 0, 0, 'A', font, 3)
    // 2nd row outside the grid → ignored, only (0,0)
    expect(litPixels(grid, 1)).toEqual([[0, 0]])
  })

  test('clippe les coordonnées négatives', () => {
    const font: BitmapFont = { width: 1, height: 1, glyphs: { A: [0b1] } }
    const grid = new Uint8Array(4)
    drawText(grid, 4, -1, 0, 'A', font, 3) // negative x
    expect(litPixels(grid, 4)).toEqual([])
  })

  test('ne dessine rien pour une chaîne vide', () => {
    const grid = new Uint8Array(5 * 7)
    drawText(grid, 5, 0, 0, '', FONT_5X7, 1)
    expect(litPixels(grid, 5)).toEqual([])
  })

  test('rend un vrai glyphe FONT_5X7 (le point « . »)', () => {
    // '.' = [0,0,0,0,0,0x04,0x04] → col-2 bit (0b00100) at rows 5 and 6.
    const grid = new Uint8Array(5 * 7)
    drawText(grid, 5, 0, 0, '.', FONT_5X7, 2)
    expect(litPixels(grid, 5)).toEqual([
      [2, 5],
      [2, 6],
    ])
  })
})
