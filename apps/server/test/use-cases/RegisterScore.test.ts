import { test, expect, describe, mock, beforeEach } from 'bun:test';
import type { GameOver } from '@pinball/shared-types';
import { createRegisterScore } from '../../src/use-cases/RegisterScore';
import type { GameRepository, ScoreGateway } from '../../src/use-cases/ports';

// Fake ports — no prisma, no fetch, no mock.module.
const create = mock(async (..._a: unknown[]) => ({ id: 'local-id-1' }));
const setCode = mock(async (..._a: unknown[]) => undefined);
const postScore = mock(async (..._a: unknown[]) => ({
  scoreId: 'sid-1',
  code: 'ABC123',
  claimUrl: 'https://claim/ABC123',
}));

function makeRegisterScore() {
  const games = { create, setCode } as unknown as GameRepository;
  const scores = { postScore } as unknown as ScoreGateway;
  return createRegisterScore({ games, scores });
}

function makeGameOver(overrides: Partial<GameOver> = {}): GameOver {
  return {
    player: 'Alice',
    finalScore: 4200,
    mapId: 'strangerthings',
    stats: { maxCombo: 5, maxMultiplier: 3, counters: { demogorgons: 2 }, durationS: 90 },
    ...overrides,
  };
}

beforeEach(() => {
  create.mockReset();
  setCode.mockReset();
  postScore.mockReset();
  create.mockResolvedValue({ id: 'local-id-1' });
  setCode.mockResolvedValue(undefined);
  postScore.mockResolvedValue({ scoreId: 'sid-1', code: 'ABC123', claimUrl: 'https://claim/ABC123' });
});

describe('registerScore', () => {
  test('retourne le code et la claimUrl du global', async () => {
    const res = await makeRegisterScore()(makeGameOver());
    expect(res).toEqual({ code: 'ABC123', claimUrl: 'https://claim/ABC123' });
  });

  test('crée le record local AVANT postScore, puis setCode avec le code', async () => {
    const order: string[] = [];
    create.mockImplementation(async () => { order.push('create'); return { id: 'local-id-1' }; });
    postScore.mockImplementation(async () => { order.push('postScore'); return { scoreId: 'sid-1', code: 'ABC123', claimUrl: 'u' }; });
    setCode.mockImplementation(async () => { order.push('setCode'); });

    await makeRegisterScore()(makeGameOver());
    expect(order).toEqual(['create', 'postScore', 'setCode']);
  });

  test('transmet les stats au record local', async () => {
    await makeRegisterScore()(makeGameOver());
    const arg = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      player: 'Alice',
      mapId: 'strangerthings',
      score: 4200,
      maxCombo: 5,
      maxMultiplier: 3,
      counters: { demogorgons: 2 },
      durationS: 90,
    });
  });

  test('lie le code retourné au record local via setCode(id, code)', async () => {
    await makeRegisterScore()(makeGameOver());
    expect(setCode).toHaveBeenCalledTimes(1);
    expect(setCode).toHaveBeenCalledWith('local-id-1', 'ABC123');
  });

  test('transmet un gameId + playedAt ISO à postScore', async () => {
    await makeRegisterScore()(makeGameOver());
    const payload = postScore.mock.calls[0]![0] as { gameId: string; playedAt: string; mapId: string; score: number };
    expect(typeof payload.gameId).toBe('string');
    expect(payload.gameId.length).toBeGreaterThan(0);
    expect(() => new Date(payload.playedAt).toISOString()).not.toThrow();
    expect(payload.mapId).toBe('strangerthings');
    expect(payload.score).toBe(4200);
  });

  describe('clamp du score [1..99999999]', () => {
    test('clamp le minimum à 1 (score 0)', async () => {
      await makeRegisterScore()(makeGameOver({ finalScore: 0 }));
      expect((create.mock.calls[0]![0] as { score: number }).score).toBe(1);
      expect((postScore.mock.calls[0]![0] as { score: number }).score).toBe(1);
    });

    test('clamp les scores négatifs à 1', async () => {
      await makeRegisterScore()(makeGameOver({ finalScore: -500 }));
      expect((create.mock.calls[0]![0] as { score: number }).score).toBe(1);
    });

    test('clamp le maximum à 99999999', async () => {
      await makeRegisterScore()(makeGameOver({ finalScore: 100_000_000 }));
      expect((create.mock.calls[0]![0] as { score: number }).score).toBe(99_999_999);
      expect((postScore.mock.calls[0]![0] as { score: number }).score).toBe(99_999_999);
    });

    test('laisse un score dans les bornes inchangé', async () => {
      await makeRegisterScore()(makeGameOver({ finalScore: 12_345 }));
      expect((create.mock.calls[0]![0] as { score: number }).score).toBe(12_345);
    });

    test('accepte exactement la borne haute', async () => {
      await makeRegisterScore()(makeGameOver({ finalScore: 99_999_999 }));
      expect((create.mock.calls[0]![0] as { score: number }).score).toBe(99_999_999);
    });
  });

  test('propage l erreur si postScore échoue (record local déjà écrit)', async () => {
    postScore.mockRejectedValueOnce(new Error('global KO'));
    await expect(makeRegisterScore()(makeGameOver())).rejects.toThrow('global KO');
    expect(create).toHaveBeenCalledTimes(1);
    expect(setCode).not.toHaveBeenCalled(); // no code to link
  });

  test('utilise le même score borné pour le local ET le global', async () => {
    await makeRegisterScore()(makeGameOver({ finalScore: 7 }));
    const localScore = (create.mock.calls[0]![0] as { score: number }).score;
    const globalScore = (postScore.mock.calls[0]![0] as { score: number }).score;
    expect(localScore).toBe(globalScore);
  });
});
