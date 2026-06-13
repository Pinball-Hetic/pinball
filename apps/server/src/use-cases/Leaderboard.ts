import { type LeaderboardEntry, type GlobalStats, DEFAULT_MAP_ID } from '@pinball/shared-types';
import { prisma } from '../infrastructure/prisma';
import { getWorldLeaderboard } from '../infrastructure/GlobalApiClient';

export async function topTen(mapId = DEFAULT_MAP_ID): Promise<LeaderboardEntry[]> {
  const games = await prisma.game.findMany({
    where: { mapId },
    orderBy: { score: 'desc' },
    take: 10,
  });

  return games.map((g, i) => ({
    rank: i + 1,
    name: g.player,
    score: g.score,
    date: g.createdAt.toISOString(),
  }));
}

// Leaderboard mondial : proxy l'API globale, mappe vers LeaderboardEntry.
// pseudo null = score pas encore réclamé (affiché '—'). Fallback board local
// si le global est KO (offline-safe).
export async function worldTopTen(mapId = DEFAULT_MAP_ID): Promise<LeaderboardEntry[]> {
  try {
    const data = (await getWorldLeaderboard(mapId, 10)) as {
      entries: { rank: number; pseudo: string | null; score: number; playedAt: string }[];
    };
    return data.entries.map((e) => ({
      rank: e.rank,
      name: e.pseudo ?? '—', // null = pas encore réclamé
      score: e.score,
      date: e.playedAt,
    }));
  } catch (err) {
    console.error('[server] world leaderboard KO, fallback local:', (err as Error).message);
    return topTen(mapId); // offline → board local
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function globalStats(mapId = DEFAULT_MAP_ID): Promise<GlobalStats> {
  // Agrégat des counters côté JS (volume faible, borne unique) — pas de raw SQL.
  const [games, topCombo, today] = await Promise.all([
    prisma.game.findMany({ where: { mapId }, select: { counters: true } }),
    prisma.game.findFirst({ where: { mapId }, orderBy: { maxCombo: 'desc' } }),
    prisma.game.findFirst({
      where: { mapId, createdAt: { gte: startOfToday() } },
      orderBy: { score: 'desc' },
    }),
  ]);

  const sums = new Map<string, number>();
  for (const g of games) {
    const counters = (g.counters ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(counters)) {
      if (typeof value === 'number') sums.set(key, (sums.get(key) ?? 0) + value);
    }
  }
  // label = key pour l'instant ; les libellés d'affichage viendront du contenu
  // de la map (phase 5).
  const totals = [...sums.entries()].map(([key, value]) => ({ key, label: key, value }));

  return {
    totalGames: games.length,
    totals,
    bestCombo: topCombo
      ? { value: topCombo.maxCombo, player: topCombo.player }
      : null,
    bestToday: today ? { score: today.score, player: today.player } : null,
  };
}
