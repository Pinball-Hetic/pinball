import type { GameOver } from '@pinball/shared-types';
import { prisma } from '../infrastructure/prisma';

export async function recordGame(data: GameOver): Promise<void> {
  await prisma.game.create({
    data: {
      player: data.player,
      score: data.finalScore,
      maxCombo: data.stats.maxCombo,
      maxMultiplier: data.stats.maxMultiplier,
      demogorgons: data.stats.demogorgons,
      portals: data.stats.portals,
      hetic: data.stats.hetic,
      durationS: data.stats.durationS,
    },
  });
}
