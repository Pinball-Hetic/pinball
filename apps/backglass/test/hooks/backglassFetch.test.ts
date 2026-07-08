import { test, expect, describe } from 'bun:test'
import type { GlobalStats, LeaderboardEntry } from '@pinball/shared-types'
import { isLeaderboardShape, isStatsShape, safeFetch } from '../../src/hooks/backglassFetch'

const VALID_ENTRIES: LeaderboardEntry[] = [
  { rank: 1, name: 'NEO', score: 9000, date: '2026-01-01' },
]
const VALID_STATS: GlobalStats = {
  totalGames: 42,
  totals: [{ key: 'demogorgons', label: 'Demogorgons', value: 7 }],
  bestCombo: { value: 5, player: 'NEO' },
  bestToday: { score: 9000, player: 'NEO' },
}

type FetchResult = { ok: boolean; status: number; body: unknown }

function fakeFetch(r: FetchResult) {
  return () =>
    Promise.resolve({
      ok: r.ok,
      status: r.status,
      json: () => Promise.resolve(r.body),
    })
}

describe('isLeaderboardShape', () => {
  test('accepte un tableau (meme vide)', () => {
    expect(isLeaderboardShape([])).toBe(true)
    expect(isLeaderboardShape(VALID_ENTRIES)).toBe(true)
  })

  test('rejette non-array', () => {
    expect(isLeaderboardShape({ error: 'nope' })).toBe(false)
    expect(isLeaderboardShape(null)).toBe(false)
    expect(isLeaderboardShape('html')).toBe(false)
    expect(isLeaderboardShape(undefined)).toBe(false)
  })
})

describe('isStatsShape', () => {
  test('accepte un objet avec totalGames numerique', () => {
    expect(isStatsShape(VALID_STATS)).toBe(true)
    expect(isStatsShape({ totalGames: 0 })).toBe(true)
  })

  test('rejette totalGames manquant ou non-numerique', () => {
    expect(isStatsShape({ error: 'nope' })).toBe(false)
    expect(isStatsShape({ totalGames: '5' })).toBe(false)
    expect(isStatsShape(null)).toBe(false)
    expect(isStatsShape(undefined)).toBe(false)
  })
})

describe('safeFetch', () => {
  test('renvoie la donnee typee quand ok + forme valide', async () => {
    const data = await safeFetch<LeaderboardEntry[]>(
      '/api/leaderboard',
      isLeaderboardShape,
      fakeFetch({ ok: true, status: 200, body: VALID_ENTRIES }),
    )
    expect(data).toEqual(VALID_ENTRIES)
  })

  test('rejette quand la reponse n est pas ok', async () => {
    await expect(
      safeFetch(
        '/api/stats',
        isStatsShape,
        fakeFetch({ ok: false, status: 500, body: '<html>err</html>' }),
      ),
    ).rejects.toThrow('/api/stats 500')
  })

  test('rejette quand la forme est invalide malgre un statut ok', async () => {
    await expect(
      safeFetch(
        '/api/leaderboard',
        isLeaderboardShape,
        fakeFetch({ ok: true, status: 200, body: { error: 'nope' } }),
      ),
    ).rejects.toThrow('/api/leaderboard shape')
  })
})
