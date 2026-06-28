import { test, expect, describe, mock, beforeEach } from 'bun:test';
import type { GameOver } from '@pinball/shared-types';

// Mocks d'infra : prisma (record local) + GlobalApiClient (postScore).
// Posés AVANT le dynamic import du use-case pour que celui-ci les voie.
const create = mock(async (..._a: unknown[]) => ({ id: 'local-id-1' }));
const update = mock(async (..._a: unknown[]) => ({}));
const postScore = mock(async (..._a: unknown[]) => ({
  scoreId: 'sid-1',
  code: 'ABC123',
  claimUrl: 'https://claim/ABC123',
}));

mock.module('../infrastructure/prisma', () => ({
  prisma: { game: { create, update } },
}));
mock.module('../infrastructure/GlobalApiClient', () => ({
  postScore,
  getWorldLeaderboard: mock(),
}));

// Import dynamique après les mocks.
const { registerScore } = await import('./RegisterScore');

function makeGameOver(overrides: Partial<GameOver> = {}): GameOver {
  return {
    player: 'Alice',
    finalScore: 4200,
    mapId: 'strangerthings',
    stats: {
      maxCombo: 5,
      maxMultiplier: 3,
      counters: { demogorgons: 2 },
      durationS: 90,
    },
    ...overrides,
  };
}

beforeEach(() => {
  create.mockClear();
  update.mockClear();
  postScore.mockClear();
  create.mockResolvedValue({ id: 'local-id-1' } as never);
  update.mockResolvedValue({} as never);
  postScore.mockResolvedValue({
    scoreId: 'sid-1',
    code: 'ABC123',
    claimUrl: 'https://claim/ABC123',
  } as never);
});

describe('registerScore', () => {
  test('retourne le code et la claimUrl du global', async () => {
    const res = await registerScore(makeGameOver());
    expect(res).toEqual({ code: 'ABC123', claimUrl: 'https://claim/ABC123' });
  });

  test('crée le record local AVANT postScore, puis update avec le code', async () => {
    const order: string[] = [];
    create.mockImplementation(async () => {
      order.push('create');
      return { id: 'local-id-1' } as never;
    });
    postScore.mockImplementation(async () => {
      order.push('postScore');
      return { scoreId: 'sid-1', code: 'ABC123', claimUrl: 'u' } as never;
    });
    update.mockImplementation(async () => {
      order.push('update');
      return {} as never;
    });

    await registerScore(makeGameOver());
    expect(order).toEqual(['create', 'postScore', 'update']);
  });

  test('transmet les stats au record local', async () => {
    await registerScore(makeGameOver());
    const arg = create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data).toMatchObject({
      player: 'Alice',
      mapId: 'strangerthings',
      score: 4200,
      maxCombo: 5,
      maxMultiplier: 3,
      counters: { demogorgons: 2 },
      durationS: 90,
    });
  });

  test('lie le code retourné au record local via update', async () => {
    await registerScore(makeGameOver());
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]![0]).toEqual({
      where: { id: 'local-id-1' },
      data: { code: 'ABC123' },
    });
  });

  test('transmet un gameId + playedAt ISO à postScore', async () => {
    await registerScore(makeGameOver());
    const payload = postScore.mock.calls[0]![0] as {
      gameId: string;
      playedAt: string;
      mapId: string;
      score: number;
    };
    expect(typeof payload.gameId).toBe('string');
    expect(payload.gameId.length).toBeGreaterThan(0);
    expect(() => new Date(payload.playedAt).toISOString()).not.toThrow();
    expect(payload.mapId).toBe('strangerthings');
    expect(payload.score).toBe(4200);
  });

  describe('clamp du score [1..99999999]', () => {
    test('clamp le minimum à 1 (score 0)', async () => {
      await registerScore(makeGameOver({ finalScore: 0 }));
      const localArg = create.mock.calls[0]![0] as { data: { score: number } };
      const globalArg = postScore.mock.calls[0]![0] as { score: number };
      expect(localArg.data.score).toBe(1);
      expect(globalArg.score).toBe(1);
    });

    test('clamp les scores négatifs à 1', async () => {
      await registerScore(makeGameOver({ finalScore: -500 }));
      const localArg = create.mock.calls[0]![0] as { data: { score: number } };
      expect(localArg.data.score).toBe(1);
    });

    test('clamp le maximum à 99999999', async () => {
      await registerScore(makeGameOver({ finalScore: 100_000_000 }));
      const localArg = create.mock.calls[0]![0] as { data: { score: number } };
      const globalArg = postScore.mock.calls[0]![0] as { score: number };
      expect(localArg.data.score).toBe(99_999_999);
      expect(globalArg.score).toBe(99_999_999);
    });

    test('laisse un score dans les bornes inchangé', async () => {
      await registerScore(makeGameOver({ finalScore: 12_345 }));
      const localArg = create.mock.calls[0]![0] as { data: { score: number } };
      expect(localArg.data.score).toBe(12_345);
    });

    test('accepte exactement la borne haute', async () => {
      await registerScore(makeGameOver({ finalScore: 99_999_999 }));
      const localArg = create.mock.calls[0]![0] as { data: { score: number } };
      expect(localArg.data.score).toBe(99_999_999);
    });
  });

  test('propage l erreur si postScore échoue (record local déjà écrit)', async () => {
    postScore.mockRejectedValueOnce(new Error('global KO'));
    await expect(registerScore(makeGameOver())).rejects.toThrow('global KO');
    // Le record local a bien été tenté avant l échec global.
    expect(create).toHaveBeenCalledTimes(1);
    // Pas d update : on n a pas de code à lier.
    expect(update).not.toHaveBeenCalled();
  });

  test('utilise le même score borné pour le local ET le global', async () => {
    await registerScore(makeGameOver({ finalScore: 7 }));
    const localArg = create.mock.calls[0]![0] as { data: { score: number } };
    const globalArg = postScore.mock.calls[0]![0] as { score: number };
    expect(localArg.data.score).toBe(globalArg.score);
  });
});
