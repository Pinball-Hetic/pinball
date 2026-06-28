import { test, expect, describe } from 'bun:test'
import * as dmdCore from './index'

// Le barrel ne contient que des ré-exports : on vérifie que l'API publique
// est exposée et que les helpers purs restent appelables via le barrel.

describe('@pinball/dmd-core barrel', () => {
  test('ré-exporte les constantes/classe du renderer', () => {
    expect(dmdCore.GRID_W).toBe(96)
    expect(dmdCore.GRID_H).toBe(32)
    expect(dmdCore.PITCH).toBe(20)
    expect(typeof dmdCore.DmdRenderer).toBe('function')
  })

  test('ré-exporte la palette', () => {
    expect(dmdCore.PALETTE_NORMAL).toBeDefined()
    expect(dmdCore.INDEX_TO_COLOR.length).toBe(11)
    expect(dmdCore.DOT.score).toBe(1)
  })

  test('ré-exporte les helpers de fonts', () => {
    expect(typeof dmdCore.measureText).toBe('function')
    expect(typeof dmdCore.drawText).toBe('function')
    expect(dmdCore.FONT_5X7).toBeDefined()
    expect(dmdCore.FONT_12X22).toBeDefined()
  })

  test('ré-exporte les helpers d effets', () => {
    expect(typeof dmdCore.centerX).toBe('function')
    expect(typeof dmdCore.flickerSkip).toBe('function')
    expect(typeof dmdCore.plot).toBe('function')
    expect(typeof dmdCore.seeded).toBe('function')
    expect(typeof dmdCore.fmtNum).toBe('function')
    expect(typeof dmdCore.MatrixRain).toBe('function')
  })

  test('ré-exporte le player de clip ASCII et les layouts', () => {
    expect(typeof dmdCore.parseClip).toBe('function')
    expect(typeof dmdCore.drawClipFrame).toBe('function')
    expect(typeof dmdCore.makeLayouts).toBe('function')
  })

  test('ré-exporte les helpers de layout', () => {
    expect(typeof dmdCore.blit).toBe('function')
    expect(typeof dmdCore.revealRadial).toBe('function')
    expect(typeof dmdCore.dissolve).toBe('function')
  })

  test('un helper pur ré-exporté reste fonctionnel (centerX)', () => {
    // centerX(width) = position de départ pour centrer sur GRID_W (96).
    expect(dmdCore.centerX(10)).toBe(Math.round((96 - 10) / 2))
    expect(dmdCore.centerX(11)).toBe(Math.round((96 - 11) / 2)) // arrondi impair
  })

  test('fmtNum ré-exporté formate un nombre', () => {
    // sanity : retourne une chaîne pour une entrée numérique.
    expect(typeof dmdCore.fmtNum(1234)).toBe('string')
  })
})
