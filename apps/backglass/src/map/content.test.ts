import { test, expect, describe, mock, afterEach } from 'bun:test'
import { render, screen, renderHook, cleanup } from '@testing-library/react'
import { createElement } from 'react'

// content.ts no longer has an import side effect (no getBackglassContent called
// at module load): content resolution lives in the page. We still mock the
// registry to stay decoupled from the real content.

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

mock.module('@pinball/maps/backglass', () => ({
  getBackglassContent: (id: string) => (id ? fakeContent : null),
}))

afterEach(() => {
  cleanup()
})

describe('content.ts', () => {
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
