import { test, expect, describe, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import type { GameOver } from '@pinball/shared-types'
import { MapContentProvider, EMPTY_CONTENT } from '@/map/content'
import RecapTakeover from './RecapTakeover'

afterEach(() => cleanup())

function payload(over: Partial<GameOver & { rank: number }> = {}): GameOver & {
  rank: number
} {
  return {
    player: 'NEO',
    finalScore: 54321,
    mapId: 'strangerthings',
    rank: 12,
    stats: {
      maxCombo: 4,
      maxMultiplier: 3,
      counters: { demogorgons: 7 },
      durationS: 90,
    },
    ...over,
  }
}

function renderWithContent(
  node: React.ReactElement,
  counterLabels: Record<string, string> = {},
) {
  const content = { ...EMPTY_CONTENT, counterLabels }
  return render(
    <MapContentProvider value={content as never}>{node}</MapContentProvider>,
  )
}

describe('RecapTakeover', () => {
  test('affiche VOTRE PARTIE, score formaté et cellules génériques', () => {
    renderWithContent(<RecapTakeover payload={payload()} />)
    expect(screen.getByText('VOTRE PARTIE')).toBeDefined()
    expect(screen.getByText('54 321')).toBeDefined()
    expect(screen.getByText('COMBO MAX')).toBeDefined()
    expect(screen.getByText('x4')).toBeDefined()
    expect(screen.getByText('MULTIPLIER MAX')).toBeDefined()
    expect(screen.getByText('x3')).toBeDefined()
    expect(screen.getByText('DURÉE')).toBeDefined()
    expect(screen.getByText('90s')).toBeDefined()
  })

  test('libellé de compteur fourni par la map (counterLabels)', () => {
    renderWithContent(<RecapTakeover payload={payload()} />, {
      demogorgons: 'Démogorgons',
    })
    expect(screen.getByText('Démogorgons')).toBeDefined()
    expect(screen.getByText('7')).toBeDefined()
  })

  test('counter sans libellé map : fallback id.toUpperCase()', () => {
    renderWithContent(<RecapTakeover payload={payload()} />)
    expect(screen.getByText('DEMOGORGONS')).toBeDefined()
  })

  test('rang > 10 : affiche l invitation à rejouer', () => {
    renderWithContent(<RecapTakeover payload={payload({ rank: 12 })} />)
    expect(screen.getByText('REJOUEZ POUR ENTRER AU HALL OF FAME')).toBeDefined()
  })

  test('rang <= 10 (qualifié) : pas d invitation', () => {
    renderWithContent(<RecapTakeover payload={payload({ rank: 5 })} />)
    expect(screen.queryByText('REJOUEZ POUR ENTRER AU HALL OF FAME')).toBeNull()
  })

  test('sans compteurs : cellules de base seulement, pas de crash', () => {
    const { container } = renderWithContent(
      <RecapTakeover payload={payload({ stats: {
        maxCombo: 1,
        maxMultiplier: 1,
        counters: {},
        durationS: 10,
      } })} />,
    )
    // COMBO MAX, MULTIPLIER MAX, DURÉE => 3 cellules.
    expect(container.querySelectorAll('.recap-cell').length).toBe(3)
  })
})
