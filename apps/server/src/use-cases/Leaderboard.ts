import { type LeaderboardEntry, type GlobalStats, DEFAULT_MAP_ID } from '@pinball/shared-types';
import type { GameRepository, LeaderboardGateway, CounterRow } from './ports';

export function anonName(playedAt: string): string {
  const n = Math.abs(Date.parse(playedAt)) % 10_000;
  return `PLAYER${n.toString().padStart(4, '0')}`;
}

export function aggregateCounters(rows: CounterRow[]): { key: string; label: string; value: number }[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const counters = (row.counters ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(counters)) {
      if (typeof value === 'number') sums.set(key, (sums.get(key) ?? 0) + value);
    }
  }
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

  async function worldTopTen(mapId = DEFAULT_MAP_ID): Promise<LeaderboardEntry[]> {
    try {
      const data = (await world.getWorldLeaderboard(mapId, 10)) as {
        entries: { rank: number; pseudo: string | null; score: number; playedAt: string }[];
      };
      return data.entries.map((e) => ({
        rank: e.rank,
        name: e.pseudo ?? anonName(e.playedAt),
        score: e.score,
        date: e.playedAt,
      }));
    } catch (err) {
      console.error('[server] world leaderboard KO, fallback local:', (err as Error).message);
      return topTen(mapId);
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
