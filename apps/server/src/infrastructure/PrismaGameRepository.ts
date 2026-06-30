import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import type {
  GameRepository,
  NewGame,
  ScoreRow,
  CounterRow,
  ComboRow,
  TodayRow,
} from '../use-cases/ports';

/**
 * Prisma-backed adapter for GameRepository. The composition root wires this in;
 * use-cases never import prisma directly (DIP).
 */
export const prismaGameRepository: GameRepository = {
  async create(input: NewGame): Promise<{ id: string }> {
    const row = await prisma.game.create({
      data: {
        player: input.player,
        mapId: input.mapId,
        score: input.score,
        maxCombo: input.maxCombo,
        maxMultiplier: input.maxMultiplier,
        counters: input.counters as Prisma.InputJsonValue,
        durationS: input.durationS,
      },
    });
    return { id: row.id };
  },

  async setCode(id: string, code: string): Promise<void> {
    await prisma.game.update({ where: { id }, data: { code } });
  },

  async topByScore(mapId: string, take: number): Promise<ScoreRow[]> {
    const rows = await prisma.game.findMany({
      where: { mapId },
      orderBy: { score: 'desc' },
      take,
    });
    return rows.map((g) => ({ player: g.player, score: g.score, createdAt: g.createdAt }));
  },

  async allCounters(mapId: string): Promise<CounterRow[]> {
    return prisma.game.findMany({ where: { mapId }, select: { counters: true } });
  },

  async topByCombo(mapId: string): Promise<ComboRow | null> {
    const g = await prisma.game.findFirst({ where: { mapId }, orderBy: { maxCombo: 'desc' } });
    return g ? { maxCombo: g.maxCombo, player: g.player } : null;
  },

  async topTodayByScore(mapId: string, since: Date): Promise<TodayRow | null> {
    const g = await prisma.game.findFirst({
      where: { mapId, createdAt: { gte: since } },
      orderBy: { score: 'desc' },
    });
    return g ? { score: g.score, player: g.player } : null;
  },
};
