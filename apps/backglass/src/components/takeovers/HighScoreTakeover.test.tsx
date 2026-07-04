import { test, expect, describe, afterEach } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import type { GameOver } from '@pinball/shared-types'
import HighScoreTakeover from './HighScoreTakeover'

afterEach(() => cleanup())

function payload(over: Partial<GameOver & { rank: number }> = {}): GameOver & {
  rank: number
} {
  return {
    player: 'NEO',
    finalScore: 987654,
    mapId: 'strangerthings',
    rank: 1,
    stats: { maxCombo: 3, maxMultiplier: 2, counters: {}, durationS: 60 },
    ...over,
  }
}

describe('HighScoreTakeover', () => {
  test('affiche NEW HIGH SCORE, rang, joueur et score formaté', () => {
    render(<HighScoreTakeover payload={payload({ rank: 2, player: 'TRINITY' })} />)
    expect(screen.getAllByText('NEW HIGH SCORE').length).toBeGreaterThan(0)
    expect(screen.getByText('#2')).toBeDefined()
    expect(screen.getByText('TRINITY')).toBeDefined()
    expect(screen.getByText('987 654')).toBeDefined()
  })

  test('génère 40 confettis', () => {
    const { container } = render(<HighScoreTakeover payload={payload()} />)
    expect(container.querySelectorAll('.confetti-dot').length).toBe(40)
  })

  test('le kicker porte l attribut data-text pour le glitch', () => {
    const { container } = render(<HighScoreTakeover payload={payload()} />)
    const kicker = container.querySelector('.tk-kicker')!
    expect(kicker.getAttribute('data-text')).toBe('NEW HIGH SCORE')
  })

  test('utilise le wrapper VhsGlitch (.tk-highscore)', () => {
    const { container } = render(<HighScoreTakeover payload={payload()} />)
    expect(container.querySelector('.vhs.tk-highscore')).not.toBeNull()
  })
})
