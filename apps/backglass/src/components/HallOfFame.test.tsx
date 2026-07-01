import { test, expect, describe, afterEach, spyOn } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import type { LeaderboardEntry } from '@pinball/shared-types'
import type { Reaction, Reactor } from '@/hooks/useIngameReactor'
import HallOfFame from './HallOfFame'

afterEach(() => cleanup())

const entry = (over: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  rank: 1,
  name: 'ALICE',
  score: 12345,
  date: '2026-06-28T10:00:00.000Z',
  ...over,
})

// Reactor factice : on capture le listener pour pouvoir émettre à la main.
function fakeReactor(): { reactor: Reactor; emit: (r: Reaction) => void } {
  const listeners = new Set<(r: Reaction) => void>()
  return {
    reactor: {
      on: (cb) => {
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
      getHeat: () => 0,
      setSuspended: () => {},
      setHeatLock: () => {},
    },
    emit: (r) => listeners.forEach((cb) => cb(r)),
  }
}

describe('HallOfFame', () => {
  test('affiche le titre HALL OF FAME', () => {
    render(<HallOfFame entries={[]} />)
    expect(screen.getByText('HALL OF FAME')).toBeDefined()
  })

  test('liste vide : 10 lignes fantômes (slots vides)', () => {
    const { container } = render(<HallOfFame entries={[]} />)
    expect(container.querySelectorAll('.hof-ghost').length).toBe(10)
  })

  test('rend une entrée réelle avec nom et score formaté fr-FR', () => {
    render(<HallOfFame entries={[entry({ name: 'BOB', score: 1234567 })]} />)
    expect(screen.getByText('BOB')).toBeDefined()
    // 1234567 → "1 234 567" (espaces insécables fr-FR)
    expect(screen.getByText(/1\s234\s567/)).toBeDefined()
  })

  test('une entrée réelle réduit le nombre de fantômes à 9', () => {
    const { container } = render(<HallOfFame entries={[entry({ rank: 1 })]} />)
    expect(container.querySelectorAll('.hof-ghost').length).toBe(9)
    expect(container.querySelectorAll('.hof-row').length).toBe(10)
  })

  test('attribue les médailles or/argent/bronze aux rangs 1-3', () => {
    const { container } = render(
      <HallOfFame
        entries={[
          entry({ rank: 1, name: 'A' }),
          entry({ rank: 2, name: 'B' }),
          entry({ rank: 3, name: 'C' }),
          entry({ rank: 4, name: 'D' }),
        ]}
      />,
    )
    expect(container.querySelectorAll('.hof-gold').length).toBe(1)
    expect(container.querySelectorAll('.hof-silver').length).toBe(1)
    expect(container.querySelectorAll('.hof-bronze').length).toBe(1)
    // rang 4 : aucune classe médaille
    const dRow = screen.getByText('D').closest('.hof-row')!
    expect(dRow.className).not.toContain('hof-gold')
  })

  test('highlightRank applique la classe hof-hot à la bonne ligne', () => {
    const { container } = render(
      <HallOfFame
        entries={[entry({ rank: 1, name: 'A' }), entry({ rank: 2, name: 'B' })]}
        highlightRank={2}
      />,
    )
    const hot = container.querySelectorAll('.hof-hot')
    expect(hot.length).toBe(1)
    expect(screen.getByText('B').closest('.hof-row')!.className).toContain('hof-hot')
  })

  test('inverted ajoute la classe hof-inverted sur la racine', () => {
    const { container } = render(<HallOfFame entries={[]} inverted />)
    expect(container.querySelector('.hof')!.className).toContain('hof-inverted')
  })

  test('non inverted : pas de classe hof-inverted', () => {
    const { container } = render(<HallOfFame entries={[]} />)
    expect(container.querySelector('.hof')!.className).not.toContain('hof-inverted')
  })

  test('date invalide → shortDate ne crash pas (rend la ligne)', () => {
    // new Date("nope") donne NaN → getDate() = NaN → "NaN" padStart, pas de throw.
    render(<HallOfFame entries={[entry({ name: 'ZED', date: 'not-a-date' })]} />)
    expect(screen.getByText('ZED')).toBeDefined()
  })

  test('réaction event DROP applique la classe hof-shake', () => {
    const { reactor, emit } = fakeReactor()
    const { container } = render(<HallOfFame entries={[]} reactor={reactor} />)
    const root = container.querySelector('.hof')!
    expect(root.className).not.toContain('hof-shake')
    emit({ kind: 'event', label: 'DROP_TARGET' })
    expect(root.className).toContain('hof-shake')
  })

  test('réaction event non-DROP ne déclenche pas hof-shake', () => {
    const { reactor, emit } = fakeReactor()
    const { container } = render(<HallOfFame entries={[]} reactor={reactor} />)
    emit({ kind: 'event', label: 'BUMPER' })
    expect(container.querySelector('.hof')!.className).not.toContain('hof-shake')
  })

  // Régression : anonName (server) génère des pseudos "PLAYERxxxx" pouvant
  // entrer en collision → deux entrées de rangs différents peuvent partager
  // le même `name`. La key React doit rester unique (basée sur rank), sinon
  // React râle "same key" et fusionne/glitch les lignes.
  test('noms dupliqués (collisions anonName) : keys uniques, pas de warning React', () => {
    const errSpy = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { container } = render(
        <HallOfFame
          entries={[
            entry({ rank: 1, name: 'PLAYER0042' }),
            entry({ rank: 2, name: 'PLAYER0042' }),
            entry({ rank: 3, name: 'PLAYER0042' }),
          ]}
        />,
      )
      // Les 3 lignes réelles sont rendues distinctement (positionnées par rang).
      expect(container.querySelectorAll('.hof-row:not(.hof-ghost)').length).toBe(3)
      // Aucun warning React de type "same key" / "unique key".
      const keyWarning = errSpy.mock.calls.some((args) =>
        args.some(
          (a) =>
            typeof a === 'string' &&
            (a.includes('same key') || a.includes('unique "key"')),
        ),
      )
      expect(keyWarning).toBe(false)
    } finally {
      errSpy.mockRestore()
    }
  })
})
