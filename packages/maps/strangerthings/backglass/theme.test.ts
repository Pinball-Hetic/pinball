import { test, expect, describe } from 'bun:test'
import { backglassTheme, backglassThemeAlternate } from './theme'

// All token keys are CSS custom properties (--xxx).
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
    // An override must target a base-palette token, otherwise it only
    // introduces an orphan token never reset on return to the real world.
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
    // Overridden tokens take the alternate value.
    expect(merged['--glow']).toBe('#b14dff')
    expect(merged['--stage-filter']).toBe('hue-rotate(8deg) saturate(1.1)')
    // Non-overridden tokens keep the base value.
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
