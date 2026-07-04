import { test, expect, describe, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import { createElement } from 'react'
import type { GameOver, LeaderboardEntry } from '@pinball/shared-types'
import { MapContentProvider, EMPTY_CONTENT } from '@/map/content'
import type { BackglassContent } from '@/map/content'
import CinematicTakeover from './CinematicTakeover'

afterEach(() => cleanup())

function payload(over: Partial<GameOver & { rank: number }> = {}): GameOver & {
  rank: number
} {
  return {
    player: 'NEO',
    finalScore: 42000,
    mapId: 'strangerthings',
    rank: 3,
    stats: { maxCombo: 2, maxMultiplier: 2, counters: {}, durationS: 30 },
    ...over,
  }
}

function renderWithContent(
  node: React.ReactElement,
  over: Partial<BackglassContent> = {},
) {
  const content = { ...EMPTY_CONTENT, ...over }
  return render(
    <MapContentProvider value={content as never}>{node}</MapContentProvider>,
  )
}

const noEntries: LeaderboardEntry[] = []

describe('CinematicTakeover', () => {
  test('hall_of_fame + rang <= 10 → HighScoreTakeover (NEW HIGH SCORE)', () => {
    renderWithContent(
      <CinematicTakeover
        clip="hall_of_fame"
        payload={payload({ rank: 4 })}
        entries={noEntries}
      />,
    )
    expect(screen.getAllByText('NEW HIGH SCORE').length).toBeGreaterThan(0)
  })

  test('hall_of_fame + rang > 10 → RecapTakeover (VOTRE PARTIE)', () => {
    renderWithContent(
      <CinematicTakeover
        clip="hall_of_fame"
        payload={payload({ rank: 50 })}
        entries={noEntries}
      />,
    )
    expect(screen.getByText('VOTRE PARTIE')).toBeDefined()
  })

  test('hall_of_fame sans payload → kicker HALL OF FAME neutre', () => {
    renderWithContent(
      <CinematicTakeover clip="hall_of_fame" entries={noEntries} />,
    )
    expect(screen.getByText('HALL OF FAME')).toBeDefined()
  })

  test('clip map avec takeover dédié → rend le noeud de la map', () => {
    renderWithContent(
      <CinematicTakeover clip="boss_intro" entries={noEntries} />,
      {
        renderMapTakeover: () =>
          createElement('div', { 'data-testid': 'map-tk' }, 'MAP TAKEOVER'),
      },
    )
    expect(screen.getByTestId('map-tk').textContent).toBe('MAP TAKEOVER')
  })

  test('clip sans takeover dédié → libellé neutre formaté (underscores → espaces, majuscules)', () => {
    renderWithContent(
      <CinematicTakeover clip="some_random_clip" entries={noEntries} />,
      { renderMapTakeover: () => null },
    )
    expect(screen.getByText('SOME RANDOM CLIP')).toBeDefined()
  })
})
