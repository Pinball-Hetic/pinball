import { describe, expect, test } from 'bun:test'
import { getBackglassContent } from './backglass'

describe('getBackglassContent', () => {
  test('résout le contenu backglass strangerthings', () => {
    const content = getBackglassContent('strangerthings')
    expect(content).not.toBeNull()
    expect(content!.renderMapTakeover).toBeDefined()
    expect(content!.backglassTheme).toBeDefined()
  })

  test('résout le contenu backglass zelda', () => {
    const content = getBackglassContent('zelda')
    expect(content).not.toBeNull()
    expect(content!.renderMapTakeover).toBeDefined()
    expect(content!.backglassTheme).toBeDefined()
  })

  test('expose les data légères du manifest (counterLabels, clips)', () => {
    const content = getBackglassContent('strangerthings')!
    expect(content.counterLabels).toBeDefined()
    expect(typeof content.counterLabels).toBe('object')
    expect(content.clips).toBeDefined()
    expect(typeof content.clips).toBe('object')
  })

  test('expose un thème normal et un thème alternate distincts', () => {
    const content = getBackglassContent('strangerthings')!
    expect(content.backglassTheme).toBeDefined()
    expect(content.backglassThemeAlternate).toBeDefined()
  })

  test('renderMapTakeover est une fonction, clipBehavior/eventTakeovers des objets', () => {
    const content = getBackglassContent('strangerthings')!
    expect(typeof content.renderMapTakeover).toBe('function')
    expect(typeof content.clipBehavior).toBe('object')
    expect(typeof content.eventTakeovers).toBe('object')
  })

  test('retourne null pour un id inconnu', () => {
    expect(getBackglassContent('unknown')).toBeNull()
  })

  test('retourne null pour un id vide', () => {
    expect(getBackglassContent('')).toBeNull()
  })
})
