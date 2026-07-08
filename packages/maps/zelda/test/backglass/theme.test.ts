import { test, expect, describe } from 'bun:test'
import { backglassTheme, backglassThemeAlternate } from '../../backglass/theme'

// All token keys must be CSS custom properties (--xxx), a contract carried
// by the ThemeTokens = Record<`--${string}`, string> type.
const isCssVar = (key: string) => key.startsWith('--')

describe('backglassTheme (base Hyrule)', () => {
  test('expose les tokens structurels attendus par le CSS de l’app', () => {
    expect(backglassTheme).toMatchObject({
      '--foreground': '#dff5c8',
      '--glow': '#22cc44',
      '--vignette': '#020b03',
      '--stage-filter': 'none',
      '--fever-a': '#FFD700',
      '--fever-b': '#22cc44',
    })
  })

  test('toutes les clés sont des CSS custom properties', () => {
    for (const key of Object.keys(backglassTheme)) {
      expect(isCssVar(key)).toBe(true)
    }
  })

  test('toutes les valeurs sont des chaînes non vides', () => {
    for (const value of Object.values(backglassTheme)) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })

  test('définit une police serif (--st-font)', () => {
    expect(backglassTheme['--st-font']).toContain('serif')
  })
})

describe('backglassThemeAlternate (Sacred Realm)', () => {
  test('ne contient que des surcharges, sous-ensemble des clés de base', () => {
    const baseKeys = new Set(Object.keys(backglassTheme))
    for (const key of Object.keys(backglassThemeAlternate)) {
      expect(baseKeys.has(key)).toBe(true)
    }
  })

  test('passe le glow en or et applique un filtre sépia', () => {
    expect(backglassThemeAlternate['--glow']).toBe('#FFD700')
    expect(backglassThemeAlternate['--stage-filter']).toContain('sepia')
  })

  test('toutes les clés sont des CSS custom properties', () => {
    for (const key of Object.keys(backglassThemeAlternate)) {
      expect(isCssVar(key)).toBe(true)
    }
  })

  test('ne redéfinit pas les tokens non-monde-alternatif (--foreground, --st-font, --fever-*)', () => {
    expect(backglassThemeAlternate).not.toHaveProperty('--foreground')
    expect(backglassThemeAlternate).not.toHaveProperty('--st-font')
    expect(backglassThemeAlternate).not.toHaveProperty('--fever-a')
    expect(backglassThemeAlternate).not.toHaveProperty('--fever-b')
  })
})

describe('fusion des thèmes (contrat app : { ...base, ...alternate })', () => {
  test('le monde alternatif surcharge le glow par-dessus la base', () => {
    const merged = { ...backglassTheme, ...backglassThemeAlternate }
    expect(merged['--glow']).toBe('#FFD700')
    expect(merged['--glow']).not.toBe(backglassTheme['--glow'])
  })

  test('les tokens non surchargés survivent à la fusion', () => {
    const merged = { ...backglassTheme, ...backglassThemeAlternate }
    expect(merged['--foreground']).toBe(backglassTheme['--foreground'])
    expect(merged['--st-font']).toBe(backglassTheme['--st-font'])
    expect(merged['--fever-a']).toBe(backglassTheme['--fever-a'])
  })

  test('sans monde alternatif, la base reste intacte ({ ...base })', () => {
    const merged = { ...backglassTheme, ...{} }
    expect(merged).toEqual(backglassTheme)
  })

  test('la fusion ne mute pas les objets sources', () => {
    const baseSnapshot = { ...backglassTheme }
    const altSnapshot = { ...backglassThemeAlternate }
    void { ...backglassTheme, ...backglassThemeAlternate }
    expect(backglassTheme).toEqual(baseSnapshot)
    expect(backglassThemeAlternate).toEqual(altSnapshot)
  })
})
