import type { GameOver } from '@pinball/shared-types';
import { prisma } from '../infrastructure/prisma';

export async function recordGame(data: GameOver): Promise<void> {
  await prisma.game.create({
    data: {
      player: data.player,
      mapId: data.mapId,
      score: data.finalScore,
      maxCombo: data.stats.maxCombo,
      maxMultiplier: data.stats.maxMultiplier,
      counters: data.stats.counters,
      durationS: data.stats.durationS,
    },
  });
}
