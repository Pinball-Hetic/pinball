import type { LeaderboardEntry, GlobalStats } from '@pinball/shared-types'

// Shape predicates: kiosk-safe — a malformed response must never replace a
// valid state. Status + shape are validated before accepting.

export function isLeaderboardShape(x: unknown): x is LeaderboardEntry[] {
  return Array.isArray(x)
}

export function isStatsShape(x: unknown): x is GlobalStats {
  return typeof (x as { totalGames?: unknown } | null)?.totalGames === 'number'
}

type FetchImpl = (url: string) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

// Generic fetch validated by a type guard. Rejects (Error) on a non-OK status
// or invalid shape; returns the typed data otherwise. fetch is injectable
// for tests.
export async function safeFetch<T>(
  url: string,
  guard: (x: unknown) => x is T,
  fetchImpl: FetchImpl = fetch,
): Promise<T> {
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`${url} ${res.status}`)
  const data = await res.json()
  if (!guard(data)) throw new Error(`${url} shape`)
  return data
}
