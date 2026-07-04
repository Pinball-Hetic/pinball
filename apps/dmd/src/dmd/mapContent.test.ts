import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test'

// mapContent.ts resolves the active map's DMD content (build-time) via the
// registry and falls back to `{}` when no map provides DMD content.
// The registry is mocked to drive both branches; the mock must be set BEFORE
// the `await import('./mapContent')`. A `?xxx` suffix busts Bun's module
// cache between the two scenarios.

const fakeDmd = {
  ScoreTakeover: () => null,
  theme: { accent: '#ff0000' },
  counterLabels: { combo: 'Combo' },
}

afterEach(() => {
  mock.restore()
})

describe('mapContent.ts — contenu présent', () => {
  beforeEach(() => {
    mock.module('@pinball/maps/dmd', () => ({
      getDmdContent: (id: string) => (id ? fakeDmd : null),
    }))
  })

  test('mapDmdContent reflète le contenu résolu par le registry', () => {
    return import('./mapContent?present').then((mod) => {
      expect(mod.mapDmdContent).toEqual(fakeDmd)
    })
  })

  test('mapDmdContent conserve les champs du contenu (pas de fallback)', () => {
    return import('./mapContent?present').then((mod) => {
      expect(mod.mapDmdContent.theme).toEqual(fakeDmd.theme)
      expect(mod.mapDmdContent.counterLabels).toEqual(fakeDmd.counterLabels)
    })
  })
})

describe('mapContent.ts — pas de contenu (fallback)', () => {
  beforeEach(() => {
    mock.module('@pinball/maps/dmd', () => ({
      getDmdContent: () => null,
    }))
  })

  test('mapDmdContent retombe sur un objet vide quand le registry renvoie null', () => {
    return import('./mapContent?empty').then((mod) => {
      expect(mod.mapDmdContent).toEqual({})
    })
  })

  test('le fallback est un objet (jamais null/undefined)', () => {
    return import('./mapContent?empty').then((mod) => {
      expect(mod.mapDmdContent).toBeDefined()
      expect(mod.mapDmdContent).not.toBeNull()
      expect(typeof mod.mapDmdContent).toBe('object')
    })
  })
})
