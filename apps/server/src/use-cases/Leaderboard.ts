import type { LeaderboardEntry, GlobalStats } from '@pinball/shared-types';
import { prisma } from '../infrastructure/prisma';

export async function topTen(): Promise<LeaderboardEntry[]> {
  const games = await prisma.game.findMany({
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

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function globalStats(): Promise<GlobalStats> {
  const [agg, topCombo, today] = await Promise.all([
    prisma.game.aggregate({
      _count: true,
      _sum: { demogorgons: true, portals: true },
    }),
    prisma.game.findFirst({ orderBy: { maxCombo: 'desc' } }),
    prisma.game.findFirst({
      where: { createdAt: { gte: startOfToday() } },
      orderBy: { score: 'desc' },
    }),
  ]);

  return {
    totalGames: agg._count,
    totalDemogorgons: agg._sum.demogorgons ?? 0,
    totalPortals: agg._sum.portals ?? 0,
    bestCombo: topCombo
      ? { value: topCombo.maxCombo, player: topCombo.player }
      : null,
    bestToday: today ? { score: today.score, player: today.player } : null,
  };
}
