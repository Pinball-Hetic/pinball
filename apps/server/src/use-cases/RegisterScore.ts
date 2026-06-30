import { randomUUID } from 'crypto';
import type { GameOver, GameRegistered } from '@pinball/shared-types';
import type { GameRepository, ScoreGateway } from './ports';

export interface RegisterScoreDeps {
  games: GameRepository;
  scores: ScoreGateway;
}

/**
 * Use-case factory (DIP): receives a game repository + score gateway as ports,
 * so it is unit-testable with in-memory fakes — no prisma, no fetch, no mocking.
 */
export function createRegisterScore({ games, scores }: RegisterScoreDeps) {
  return async function registerScore(data: GameOver): Promise<GameRegistered> {
    const score = Math.max(1, Math.min(99_999_999, data.finalScore)); // contrat [1..99999999]
    const playedAt = new Date().toISOString(); // ISO avec offset (Z)
    // Idempotence : un seul gameId par partie, constant sur tous les retries
    // internes de postScore → le global dédoublonne (pas de double insert).
    const gameId = randomUUID();

    // 1) record local d'abord (jamais perdu, même si global KO)
    const local = await games.create({
      player: data.player,
      mapId: data.mapId,
      score,
      maxCombo: data.stats.maxCombo,
      maxMultiplier: data.stats.maxMultiplier,
      counters: data.stats.counters,
      durationS: data.stats.durationS,
    });

    // 2) global → code + claimUrl
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

    // 3) lier le code au record local (support/debug)
    await games.setCode(local.id, reg.code);
    console.log('[server] score global enregistré scoreId=', reg.scoreId, 'code=', reg.code);

    return { code: reg.code, claimUrl: reg.claimUrl };
  };
}
