import { test, expect, describe } from 'bun:test'
import { backglassTheme, backglassThemeAlternate } from './theme'

// Toutes les clés de tokens sont des CSS custom properties (--xxx).
const isCssVar = (k: string) => /^--[a-z-]+$/.test(k)

describe('backglassTheme (palette monde réel)', () => {
  test('toutes les clés sont des custom properties CSS valides', () => {
    const keys = Object.keys(backglassTheme)
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys) expect(isCssVar(k)).toBe(true)
  })

  test('toutes les valeurs sont des chaînes non vides', () => {
    for (const v of Object.values(backglassTheme)) {
      expect(typeof v).toBe('string')
      expect(v.length).toBeGreaterThan(0)
    }
  })

  test('expose les tokens structurels attendus par le CSS de l app', () => {
    expect(backglassTheme['--foreground']).toBe('#ede4d3')
    expect(backglassTheme['--glow']).toBe('#ff2d2d')
    expect(backglassTheme['--vignette']).toBe('#2a0606')
    expect(backglassTheme['--stage-filter']).toBe('none')
  })

  test('contient les tokens fever utilisés par les modules ST', () => {
    expect(backglassTheme['--fever-a']).toBeDefined()
    expect(backglassTheme['--fever-b']).toBeDefined()
  })
})

describe('backglassThemeAlternate (surcharges Upside Down)', () => {
  test('toutes les clés sont des custom properties CSS valides', () => {
    const keys = Object.keys(backglassThemeAlternate)
    expect(keys.length).toBeGreaterThan(0)
    for (const k of keys) expect(isCssVar(k)).toBe(true)
  })

  test('ne contient que des surcharges existant déjà dans la base', () => {
    // Une surcharge doit cibler un token de la palette de base, sinon elle
    // n introduit qu un token orphelin jamais réinitialisé au retour au réel.
    for (const k of Object.keys(backglassThemeAlternate)) {
      expect(backglassTheme).toHaveProperty(k)
    }
  })

  test('modifie réellement les valeurs (pas une copie identique)', () => {
    for (const [k, v] of Object.entries(backglassThemeAlternate)) {
      expect(v).not.toBe(backglassTheme[k as keyof typeof backglassTheme])
    }
  })

  test('ne touche pas --foreground (texte reste lisible dans l Upside Down)', () => {
    expect(backglassThemeAlternate['--foreground' as keyof typeof backglassThemeAlternate]).toBeUndefined()
  })
})

describe('fusion app : base puis surcharge alternate (cf. pages/index.tsx)', () => {
  test('monde réel = palette de base intacte', () => {
    const merged = { ...backglassTheme, ...{} }
    expect(merged).toEqual(backglassTheme)
  })

  test('Upside Down = base écrasée par les surcharges alternate', () => {
    const merged = { ...backglassTheme, ...backglassThemeAlternate }
    // Les tokens surchargés prennent la valeur alternate.
    expect(merged['--glow']).toBe('#b14dff')
    expect(merged['--stage-filter']).toBe('hue-rotate(8deg) saturate(1.1)')
    // Les tokens non surchargés gardent la valeur de base.
    expect(merged['--foreground']).toBe(backglassTheme['--foreground'])
    expect(merged['--fever-a']).toBe(backglassTheme['--fever-a'])
  })

  test('la fusion ne mute aucun des deux objets sources', () => {
    const baseSnapshot = { ...backglassTheme }
    const altSnapshot = { ...backglassThemeAlternate }
    void { ...backglassTheme, ...backglassThemeAlternate }
    expect(backglassTheme).toEqual(baseSnapshot)
    expect(backglassThemeAlternate).toEqual(altSnapshot)
  })
})
