import { randomUUID } from 'crypto';
import type { GameOver, GameRegistered } from '@pinball/shared-types';
import type { GameRepository, ScoreGateway } from './ports';

export interface RegisterScoreDeps {
  games: GameRepository;
  scores: ScoreGateway;
}

/**
 * Receives a game repository + score gateway as ports, so it is unit-testable
 * with in-memory fakes — no prisma, no fetch, no mocking.
 */
export function createRegisterScore({ games, scores }: RegisterScoreDeps) {
  return async function registerScore(data: GameOver): Promise<GameRegistered> {
    const score = Math.max(1, Math.min(99_999_999, data.finalScore)); // API contract [1..99999999]
    const playedAt = new Date().toISOString(); // ISO with offset (Z)
    // Idempotency: one gameId per game, constant across all internal postScore
    // retries → the global API dedupes on it (no double insert).
    const gameId = randomUUID();

    // 1) local record first (never lost, even if the global API is down)
    const local = await games.create({
      player: data.player,
      mapId: data.mapId,
      score,
      maxCombo: data.stats.maxCombo,
      maxMultiplier: data.stats.maxMultiplier,
      counters: data.stats.counters,
      durationS: data.stats.durationS,
    });

    // 2) global API → code + claimUrl
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

    // 3) link the claim code to the local record (support/debug)
    await games.setCode(local.id, reg.code);
    console.log('[server] score global enregistré scoreId=', reg.scoreId, 'code=', reg.code);

    return { code: reg.code, claimUrl: reg.claimUrl };
  };
}
