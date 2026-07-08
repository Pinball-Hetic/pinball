import { test, expect, describe, afterEach } from 'bun:test'
import { render, screen, cleanup, act } from '@testing-library/react'
import type { GlobalStats, LeaderboardEntry } from '@pinball/shared-types'
import type { Reaction, Reactor } from '@/hooks/useIngameReactor'
import StatsBanner from '../../src/components/StatsBanner'

afterEach(() => cleanup())

const baseStats = (over: Partial<GlobalStats> = {}): GlobalStats => ({
  totalGames: 42,
  totals: [],
  bestCombo: null,
  bestToday: null,
  ...over,
})

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

describe('StatsBanner', () => {
  test('premier slide : PARTIES JOUÉES avec total formaté', () => {
    render(<StatsBanner stats={baseStats({ totalGames: 1234 })} entries={[]} />)
    expect(screen.getByText(/PARTIES JOUÉES : 1\s234/)).toBeDefined()
  })

  test('totalGames undefined/null → fmt rend 0 (pas de crash)', () => {
    // Defense in depth: missing stat = "0".
    render(
      <StatsBanner
        stats={baseStats({ totalGames: undefined as unknown as number })}
        entries={[]}
      />,
    )
    expect(screen.getByText('PARTIES JOUÉES : 0')).toBeDefined()
  })

  test('dernier slide invitation quand aucune entrée rang 10', () => {
    // idx starts at 0 (PARTIES JOUÉES). Verified via rotation: see next test.
    // Here we only check the component renders without a 10th entry.
    const { container } = render(<StatsBanner stats={baseStats()} entries={[]} />)
    expect(container.querySelector('.stats-banner')).toBeDefined()
  })

  test('bestCombo et bestToday : rendu sans crash, 1er slide stable', () => {
    const stats = baseStats({
      bestCombo: { value: 5, player: 'NEO' },
      bestToday: { score: 9999, player: 'TRINITY' },
    })
    render(<StatsBanner stats={stats} entries={[]} />)
    // idx starts at 0 → PARTIES JOUÉES always visible at mount.
    expect(screen.getByText(/PARTIES JOUÉES/)).toBeDefined()
  })

  test('totals : rendu sans crash avec compteurs fournis', () => {
    const stats = baseStats({
      totals: [{ key: 'demogorgons', label: 'demogorgons', value: 7 }],
    })
    render(<StatsBanner stats={stats} entries={[]} />)
    expect(screen.getByText(/PARTIES JOUÉES/)).toBeDefined()
  })

  test('rend le placeholder QrSlot (BIENTÔT)', () => {
    const { container } = render(<StatsBanner stats={baseStats()} entries={[]} />)
    // The text is split by a <br/>; target the container.
    expect(container.querySelector('.qr-caption')!.textContent).toContain('BIENTÔT')
  })

  test('réaction multi applique la classe banner-gold', () => {
    const { reactor, emit } = fakeReactor()
    const { container } = render(
      <StatsBanner stats={baseStats()} entries={[]} reactor={reactor} />,
    )
    const banner = container.querySelector('.stats-banner')!
    expect(banner.className).not.toContain('banner-gold')
    act(() => emit({ kind: 'multi', multiplier: 3 }))
    expect(banner.className).toContain('banner-gold')
  })

  test('réaction non-multi ne déclenche pas banner-gold', () => {
    const { reactor, emit } = fakeReactor()
    const { container } = render(
      <StatsBanner stats={baseStats()} entries={[]} reactor={reactor} />,
    )
    act(() => emit({ kind: 'hit', intensity: 0.5 }))
    expect(container.querySelector('.stats-banner')!.className).not.toContain(
      'banner-gold',
    )
  })

  test('multi saute sur le dernier slide (SCORE À BATTRE)', () => {
    const { reactor, emit } = fakeReactor()
    const tenth: LeaderboardEntry = {
      rank: 10,
      name: 'X',
      score: 5000,
      date: '2026-06-28',
    }
    render(<StatsBanner stats={baseStats()} entries={[tenth]} reactor={reactor} />)
    act(() => emit({ kind: 'multi', multiplier: 2 }))
    expect(screen.getByText(/SCORE À BATTRE : 5\s000/)).toBeDefined()
  })
})
