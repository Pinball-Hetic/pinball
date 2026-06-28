import { test, expect, describe, afterEach } from 'bun:test'
import { render, screen, cleanup, act } from '@testing-library/react'
import type { LeaderboardEntry } from '@pinball/shared-types'
import AttractScene from './AttractScene'

// La rotation de panneau s'appuie sur window.setInterval. bun:test n'a pas de
// faux timers d'intervalle, alors on intercepte setInterval pour capturer le
// callback et le déclencher à la main (bascule panneau 0 → 1).
const realSetInterval = window.setInterval
let tick: (() => void) | null = null

afterEach(() => {
  cleanup()
  window.setInterval = realSetInterval
  tick = null
})

function captureInterval() {
  window.setInterval = ((cb: () => void) => {
    tick = cb
    return 1 as unknown as ReturnType<typeof setInterval>
  }) as typeof window.setInterval
}

function entry(over: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return { rank: 1, name: 'NEO', score: 1000, date: '2026-06-28', ...over }
}

describe('AttractScene', () => {
  test('panneau 0 : HALL OF FAME avec le top 5', () => {
    const entries = [
      entry({ rank: 1, name: 'AAA', score: 9000 }),
      entry({ rank: 2, name: 'BBB', score: 8000 }),
      entry({ rank: 3, name: 'CCC', score: 7000 }),
    ]
    render(<AttractScene entries={entries} />)
    expect(screen.getByText('HALL OF FAME')).toBeDefined()
    expect(screen.getByText('AAA')).toBeDefined()
    expect(screen.getByText('CCC')).toBeDefined()
  })

  test('liste vide : affiche le placeholder — — —', () => {
    const { container } = render(<AttractScene entries={[]} />)
    expect(container.querySelector('.attract-empty')).not.toBeNull()
    expect(screen.getByText('— — —')).toBeDefined()
  })

  test('ne rend que 5 lignes même avec plus d entrées', () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      entry({ rank: i + 1, name: `P${i}`, score: 100 - i }),
    )
    const { container } = render(<AttractScene entries={entries} />)
    expect(container.querySelectorAll('.attract-hof-row').length).toBe(5)
  })

  test('panneau 1 avec rang 10 présent : SCORE À BATTRE et score formaté', () => {
    captureInterval()
    const entries = [entry({ rank: 10, name: 'TEN', score: 123456 })]
    render(<AttractScene entries={entries} />)
    act(() => tick?.()) // bascule vers le panneau 1
    expect(screen.getByText('SCORE À BATTRE')).toBeDefined()
    expect(screen.getByText('123 456')).toBeDefined()
  })

  test('panneau 1 sans rang 10 : invite à tenter le hall of fame', () => {
    captureInterval()
    render(<AttractScene entries={[entry({ rank: 1 })]} />)
    act(() => tick?.())
    expect(screen.getByText('TENTEZ LE HALL OF FAME !')).toBeDefined()
    expect(screen.getByText('UNE PIÈCE, UNE LÉGENDE')).toBeDefined()
  })

  test('rotation cyclique : panneau 1 puis retour panneau 0', () => {
    captureInterval()
    render(<AttractScene entries={[entry({ rank: 1, name: 'ZED' })]} />)
    act(() => tick?.()) // → panneau 1
    expect(screen.getByText('UNE PIÈCE, UNE LÉGENDE')).toBeDefined()
    act(() => tick?.()) // → panneau 0
    expect(screen.getByText('HALL OF FAME')).toBeDefined()
    expect(screen.getByText('ZED')).toBeDefined()
  })
})
