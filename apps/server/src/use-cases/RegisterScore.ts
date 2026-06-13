import { postScore } from '../infrastructure/GlobalApiClient';
import type { GameOver, GameRegistered } from '@pinball/shared-types';
import { prisma } from '../infrastructure/prisma';

export async function registerScore(data: GameOver): Promise<GameRegistered> {
  const score = Math.max(1, Math.min(99_999_999, data.finalScore)); // contrat [1..99999999]
  const playedAt = new Date().toISOString(); // ISO avec offset (Z)

  // 1) record local d'abord (jamais perdu, même si global KO)
  const local = await prisma.game.create({
    data: {
      player: data.player,
      mapId: data.mapId,
      score,
      maxCombo: data.stats.maxCombo,
      maxMultiplier: data.stats.maxMultiplier,
      counters: data.stats.counters,
      durationS: data.stats.durationS,
    },
  });

  // 2) global → code + claimUrl
  const reg = await postScore({
    mapId: data.mapId,
    score,
    maxCombo: data.stats.maxCombo,
    maxMultiplier: data.stats.maxMultiplier,
    counters: data.stats.counters,
    durationS: data.stats.durationS,
    playedAt,
  });

  // 3) lier le code au record local (support/debug)
  await prisma.game.update({ where: { id: local.id }, data: { code: reg.code } });
  console.log('[server] score global enregistré scoreId=', reg.scoreId, 'code=', reg.code);

  return { code: reg.code, claimUrl: reg.claimUrl };
}
