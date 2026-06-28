import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test'
import { render, screen, renderHook, cleanup } from '@testing-library/react'
import { createElement } from 'react'

// On mocke le registry maps pour contrôler la branche "contenu présent / null"
// de content.ts (résolution build-time via getBackglassContent). Le mock doit
// être posé AVANT le `await import('./content')` dynamique.

const fakeContent = {
  JoyceWall: () => createElement('div', { 'data-testid': 'joyce' }, 'JOYCE'),
  SideArt: () => createElement('div', { 'data-testid': 'side' }, 'SIDE'),
  renderMapTakeover: () => createElement('div', { 'data-testid': 'takeover' }, 'TK'),
  clipBehavior: { intro: { loop: true } },
  eventTakeovers: { BUMPER_HIT: 'flash' },
  counterLabels: { combo: 'Combo' },
  clips: { intro: '/clip.mp4' },
  backglassTheme: { color: 'red' },
  backglassThemeAlternate: { color: 'blue' },
}

afterEach(() => {
  cleanup()
  mock.restore()
})

describe('content.ts — contenu présent', () => {
  beforeEach(() => {
    mock.module('@pinball/maps/backglass', () => ({
      getBackglassContent: (id: string) => (id ? fakeContent : null),
    }))
  })

  test('EMPTY_CONTENT expose un no-op pour chaque champ rendu', () => {
    return import('./content').then((mod) => {
      const ec = mod.EMPTY_CONTENT
      expect(ec.JoyceWall()).toBeNull()
      expect(ec.SideArt()).toBeNull()
      expect(ec.renderMapTakeover()).toBeNull()
      expect(ec.clipBehavior).toEqual({})
      expect(ec.eventTakeovers).toEqual({})
      expect(ec.counterLabels).toEqual({})
      expect(ec.clips).toEqual({})
      expect(ec.backglassTheme).toEqual({})
      expect(ec.backglassThemeAlternate).toEqual({})
    })
  })

  test('hasMapContent est true quand le registry renvoie du contenu', () => {
    return import('./content').then((mod) => {
      expect(mod.hasMapContent).toBe(true)
    })
  })

  test('les exports dérivés proviennent du contenu résolu', () => {
    return import('./content').then((mod) => {
      expect(mod.clipBehavior).toEqual(fakeContent.clipBehavior)
      expect(mod.eventTakeovers).toEqual(fakeContent.eventTakeovers)
      expect(mod.counterLabels).toEqual(fakeContent.counterLabels)
      expect(mod.clips).toEqual(fakeContent.clips)
      expect(mod.backglassTheme).toEqual(fakeContent.backglassTheme)
      expect(mod.backglassThemeAlternate).toEqual(fakeContent.backglassThemeAlternate)
    })
  })

  test('useMapContent() lit le contenu fourni par le Provider', () => {
    return import('./content').then((mod) => {
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        createElement(mod.MapContentProvider, { value: fakeContent as never }, children)
      const { result } = renderHook(() => mod.useMapContent(), { wrapper })
      expect(result.current.clips).toEqual(fakeContent.clips)
      expect(result.current.backglassTheme).toEqual(fakeContent.backglassTheme)
    })
  })

  test('useMapContent() retourne EMPTY_CONTENT sans Provider (valeur par défaut du contexte)', () => {
    return import('./content').then((mod) => {
      const { result } = renderHook(() => mod.useMapContent())
      expect(result.current.JoyceWall()).toBeNull()
      expect(result.current.clipBehavior).toEqual({})
    })
  })

  test('le Provider rend les composants du contenu fourni', () => {
    return import('./content').then((mod) => {
      const Child = () => {
        const c = mod.useMapContent()
        return createElement(c.JoyceWall as never)
      }
      render(
        createElement(
          mod.MapContentProvider,
          { value: fakeContent as never },
          createElement(Child),
        ),
      )
      expect(screen.getByTestId('joyce').textContent).toBe('JOYCE')
    })
  })
})

describe('content.ts — pas de contenu (fallback)', () => {
  beforeEach(() => {
    mock.module('@pinball/maps/backglass', () => ({
      getBackglassContent: () => null,
    }))
  })

  test('hasMapContent est false quand le registry renvoie null', () => {
    return import('./content?null').then((mod) => {
      expect(mod.hasMapContent).toBe(false)
    })
  })

  test('les exports dérivés retombent sur EMPTY_CONTENT (no-op)', () => {
    return import('./content?null').then((mod) => {
      expect(mod.JoyceWall()).toBeNull()
      expect(mod.SideArt()).toBeNull()
      expect(mod.renderMapTakeover()).toBeNull()
      expect(mod.clips).toEqual({})
      expect(mod.backglassTheme).toEqual({})
    })
  })
})
