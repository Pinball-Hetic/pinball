import { describe, expect, test } from 'bun:test'
import { getMapPackage, AVAILABLE_MAPS } from './index'

describe('getMapPackage', () => {
  test('resolves strangerthings with layout and module', () => {
    const pkg = getMapPackage('strangerthings')
    expect(pkg).not.toBeNull()
    expect(pkg!.manifest.id).toBe('strangerthings')
    expect(pkg!.layout.bosses.length).toBeGreaterThan(0)
    expect(pkg!.module).toBeDefined()
  })

  test('resolves zelda with layout and module', () => {
    const pkg = getMapPackage('zelda')
    expect(pkg).not.toBeNull()
    expect(pkg!.manifest.id).toBe('zelda')
    expect(pkg!.layout.bosses.length).toBeGreaterThan(0)
    expect(pkg!.module).toBeDefined()
  })

  test('module est une factory lazy (fonction, pas un module déjà instancié)', () => {
    const pkg = getMapPackage('strangerthings')
    expect(typeof pkg!.module).toBe('function')
  })

  test('enrichit le MapPackage avec layout + module (ResolvedMap)', () => {
    const pkg = getMapPackage('zelda')!
    // layout and module are added by the registry, not by the raw MapPackage.
    expect(pkg).toHaveProperty('layout')
    expect(pkg).toHaveProperty('module')
    expect(pkg).toHaveProperty('manifest')
  })

  test('returns null for unknown map id', () => {
    expect(getMapPackage('unknown')).toBeNull()
  })

  test('returns null for empty id', () => {
    expect(getMapPackage('')).toBeNull()
  })

  test('id résolution est sensible à la casse (pas de normalisation)', () => {
    expect(getMapPackage('Strangerthings')).toBeNull()
    expect(getMapPackage('ZELDA')).toBeNull()
  })

  test('chaque appel produit un objet frais (spread, pas de partage de ref)', () => {
    const a = getMapPackage('strangerthings')
    const b = getMapPackage('strangerthings')
    expect(a).not.toBe(b)
    expect(a!.manifest.id).toBe(b!.manifest.id)
  })
})

describe('AVAILABLE_MAPS', () => {
  test('expose strangerthings et zelda', () => {
    const ids = AVAILABLE_MAPS.map((m) => m.id)
    expect(ids).toContain('strangerthings')
    expect(ids).toContain('zelda')
  })

  test('chaque meta a id/name/tagline/accentColor non vides', () => {
    for (const meta of AVAILABLE_MAPS) {
      expect(meta.id.length).toBeGreaterThan(0)
      expect(meta.name.length).toBeGreaterThan(0)
      expect(meta.tagline.length).toBeGreaterThan(0)
      expect(meta.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  test('chaque id listé est résolvable via getMapPackage', () => {
    for (const meta of AVAILABLE_MAPS) {
      expect(getMapPackage(meta.id)).not.toBeNull()
    }
  })

  test('les ids sont uniques', () => {
    const ids = AVAILABLE_MAPS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
