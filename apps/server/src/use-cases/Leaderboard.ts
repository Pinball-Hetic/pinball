import { type LeaderboardEntry, type GlobalStats, DEFAULT_MAP_ID } from '@pinball/shared-types';
import type { GameRepository, LeaderboardGateway, CounterRow } from './ports';

// Anonyme stable par entrée (même affichage à chaque poll, pas de random).
export function anonName(playedAt: string): string {
  const n = Math.abs(Date.parse(playedAt)) % 10_000;
  return `PLAYER${n.toString().padStart(4, '0')}`;
}

// Agrégat des counters numériques sur toutes les parties (pur, testable seul).
export function aggregateCounters(rows: CounterRow[]): { key: string; label: string; value: number }[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const counters = (row.counters ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(counters)) {
      if (typeof value === 'number') sums.set(key, (sums.get(key) ?? 0) + value);
    }
  }
  // label = key pour l'instant ; les libellés viendront du contenu de la map.
  return [...sums.entries()].map(([key, value]) => ({ key, label: key, value }));
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface LeaderboardDeps {
  games: GameRepository;
  world: LeaderboardGateway;
}

/**
 * Use-case factory (DIP): all data access goes through injected ports, so the
 * mapping/fallback/aggregation logic is unit-testable with in-memory fakes.
 */
export function createLeaderboard({ games, world }: LeaderboardDeps) {
  async function topTen(mapId = DEFAULT_MAP_ID): Promise<LeaderboardEntry[]> {
    const rows = await games.topByScore(mapId, 10);
    return rows.map((g, i) => ({
      rank: i + 1,
      name: g.player,
      score: g.score,
      date: g.createdAt.toISOString(),
    }));
  }

  // Leaderboard mondial : proxy l'API globale, mappe vers LeaderboardEntry.
  // pseudo null = score pas encore réclamé (affiché en anonyme stable). Fallback
  // board local si le global est KO (offline-safe).
  async function worldTopTen(mapId = DEFAULT_MAP_ID): Promise<LeaderboardEntry[]> {
    try {
      const data = (await world.getWorldLeaderboard(mapId, 10)) as {
        entries: { rank: number; pseudo: string | null; score: number; playedAt: string }[];
      };
      return data.entries.map((e) => ({
        rank: e.rank,
        name: e.pseudo ?? anonName(e.playedAt), // anonyme tant que non réclamé
        score: e.score,
        date: e.playedAt,
      }));
    } catch (err) {
      console.error('[server] world leaderboard KO, fallback local:', (err as Error).message);
      return topTen(mapId); // offline → board local
    }
  }

  async function globalStats(mapId = DEFAULT_MAP_ID): Promise<GlobalStats> {
    const [counters, topCombo, today] = await Promise.all([
      games.allCounters(mapId),
      games.topByCombo(mapId),
      games.topTodayByScore(mapId, startOfToday()),
    ]);

    return {
      totalGames: counters.length,
      totals: aggregateCounters(counters),
      bestCombo: topCombo ? { value: topCombo.maxCombo, player: topCombo.player } : null,
      bestToday: today ? { score: today.score, player: today.player } : null,
    };
  }

  return { topTen, worldTopTen, globalStats };
}
