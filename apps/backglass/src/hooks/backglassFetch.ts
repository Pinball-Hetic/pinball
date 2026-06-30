import type { LeaderboardEntry, GlobalStats } from '@pinball/shared-types'

// Predicats de forme : kiosk-safe, une reponse mal formee ne doit jamais
// remplacer un etat valide. On valide statut + forme avant d'accepter.

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

// Fetch generique valide par un type-guard. Rejette (Error) sur statut non-OK
// ou forme invalide ; renvoie la donnee typee sinon. fetch injectable pour les
// tests.
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
