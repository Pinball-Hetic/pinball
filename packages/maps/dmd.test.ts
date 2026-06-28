import { describe, expect, test } from 'bun:test'
import { getDmdContent } from './dmd'

describe('getDmdContent', () => {
  test('résout le contenu DMD strangerthings', () => {
    const content = getDmdContent('strangerthings')
    expect(content).not.toBeNull()
    expect(content!.cinematicHandlers).toBeDefined()
    expect(content!.scoreOverlay).toBeDefined()
    expect(content!.attract).toBeDefined()
  })

  test('résout le contenu DMD zelda', () => {
    const content = getDmdContent('zelda')
    expect(content).not.toBeNull()
    expect(content!.cinematicHandlers).toBeDefined()
    expect(content!.scoreOverlay).toBeDefined()
  })

  test('expose la palette alternate world et la durée de burst', () => {
    const content = getDmdContent('strangerthings')!
    expect(content.paletteAlternateWorld).toBeDefined()
    expect(typeof content.alternateWorldBurstMs).toBe('number')
    expect(content.alternateWorldBurstMs).toBeGreaterThan(0)
  })

  test('retourne null pour un id inconnu', () => {
    expect(getDmdContent('unknown')).toBeNull()
  })

  test('retourne null pour un id vide', () => {
    expect(getDmdContent('')).toBeNull()
  })

  test('résolution sensible à la casse', () => {
    expect(getDmdContent('StrangerThings')).toBeNull()
  })
})
