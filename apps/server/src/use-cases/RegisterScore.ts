import { randomUUID } from 'crypto';
import type { GameOver, GameRegistered } from '@pinball/shared-types';
import type { GameRepository, ScoreGateway } from './ports';

export interface RegisterScoreDeps {
  games: GameRepository;
  scores: ScoreGateway;
}

export function createRegisterScore({ games, scores }: RegisterScoreDeps) {
  return async function registerScore(data: GameOver): Promise<GameRegistered> {
    const score = Math.max(1, Math.min(99_999_999, data.finalScore)); // API contract [1..99999999]
    const playedAt = new Date().toISOString();
    const gameId = randomUUID();

    // Local record first: never lost even if the global API is down.
    const local = await games.create({
      player: data.player,
      mapId: data.mapId,
      score,
      maxCombo: data.stats.maxCombo,
      maxMultiplier: data.stats.maxMultiplier,
      counters: data.stats.counters,
      durationS: data.stats.durationS,
    });

    const reg = await scores.postScore({
      gameId,
      mapId: data.mapId,
      score,
      maxCombo: data.stats.maxCombo,
      maxMultiplier: data.stats.maxMultiplier,
      counters: data.stats.counters,
      durationS: data.stats.durationS,
      playedAt,
    });

    await games.setCode(local.id, reg.code);
    console.log('[server] score global enregistré scoreId=', reg.scoreId, 'code=', reg.code);

    return { code: reg.code, claimUrl: reg.claimUrl };
  };
}
