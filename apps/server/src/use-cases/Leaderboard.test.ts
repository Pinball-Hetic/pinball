import { test, expect, describe, mock, beforeEach } from 'bun:test';

// Mocks des dépendances externes AVANT le dynamic import de l'unité testée.
// On évite ainsi d'instancier le vrai PrismaClient (side-effect à l'import).
const findMany = mock();
const findFirst = mock();
const getWorldLeaderboard = mock();

mock.module('../infrastructure/prisma', () => ({
  prisma: { game: { findMany, findFirst } },
}));

mock.module('../infrastructure/GlobalApiClient', () => ({
  getWorldLeaderboard,
  postScore: mock(),
}));

const { topTen, worldTopTen, globalStats } = await import('./Leaderboard');

beforeEach(() => {
  findMany.mockReset();
  findFirst.mockReset();
  getWorldLeaderboard.mockReset();
});

describe('topTen', () => {
  test('mappe les lignes prisma en entrées classées (rank = index + 1)', async () => {
    const d1 = new Date('2026-01-01T10:00:00.000Z');
    const d2 = new Date('2026-01-02T10:00:00.000Z');
    findMany.mockResolvedValue([
      { player: 'ALICE', score: 500, createdAt: d1 },
      { player: 'BOB', score: 200, createdAt: d2 },
    ]);

    const res = await topTen('strangerthings');

    expect(res).toEqual([
      { rank: 1, name: 'ALICE', score: 500, date: d1.toISOString() },
      { rank: 2, name: 'BOB', score: 200, date: d2.toISOString() },
    ]);
  });

  test('interroge prisma avec mapId, tri desc et take 10', async () => {
    findMany.mockResolvedValue([]);
    await topTen('zelda');

    expect(findMany).toHaveBeenCalledWith({
      where: { mapId: 'zelda' },
      orderBy: { score: 'desc' },
      take: 10,
    });
  });

  test('utilise le mapId par défaut quand non fourni', async () => {
    findMany.mockResolvedValue([]);
    await topTen();

    expect(findMany.mock.calls[0]![0].where.mapId).toBe('strangerthings');
  });

  test('retourne un tableau vide quand aucune partie', async () => {
    findMany.mockResolvedValue([]);
    expect(await topTen()).toEqual([]);
  });
});

describe('worldTopTen', () => {
  test('mappe les entrées globales avec pseudo présent', async () => {
    getWorldLeaderboard.mockResolvedValue({
      entries: [
        { rank: 1, pseudo: 'NEO', score: 9000, playedAt: '2026-03-01T12:00:00.000Z' },
      ],
    });

    const res = await worldTopTen('strangerthings');

    expect(res).toEqual([
      { rank: 1, name: 'NEO', score: 9000, date: '2026-03-01T12:00:00.000Z' },
    ]);
    expect(getWorldLeaderboard).toHaveBeenCalledWith('strangerthings', 10);
  });

  test('fallback anonName stable quand pseudo null', async () => {
    const playedAt = '2026-03-01T12:00:00.000Z';
    getWorldLeaderboard.mockResolvedValue({
      entries: [{ rank: 1, pseudo: null, score: 100, playedAt }],
    });

    const res = await worldTopTen();

    // anonName = PLAYER + (|Date.parse(playedAt)| % 10000) zéro-paddé sur 4.
    const expectedN = Math.abs(Date.parse(playedAt)) % 10_000;
    const expectedName = `PLAYER${expectedN.toString().padStart(4, '0')}`;
    expect(res[0]!.name).toBe(expectedName);
    expect(expectedName).toMatch(/^PLAYER\d{4}$/);
  });

  test('anonName est stable pour le même playedAt', async () => {
    const playedAt = '2026-03-01T12:00:00.000Z';
    getWorldLeaderboard.mockResolvedValue({
      entries: [{ rank: 1, pseudo: null, score: 100, playedAt }],
    });

    const first = (await worldTopTen())[0]!.name;
    getWorldLeaderboard.mockResolvedValue({
      entries: [{ rank: 1, pseudo: null, score: 100, playedAt }],
    });
    const second = (await worldTopTen())[0]!.name;

    expect(first).toBe(second);
  });

  test('FALLBACK sur topTen local quand getWorldLeaderboard throw', async () => {
    getWorldLeaderboard.mockRejectedValue(new Error('global KO'));
    const d = new Date('2026-01-01T10:00:00.000Z');
    findMany.mockResolvedValue([{ player: 'LOCAL', score: 42, createdAt: d }]);

    const res = await worldTopTen('strangerthings');

    expect(res).toEqual([
      { rank: 1, name: 'LOCAL', score: 42, date: d.toISOString() },
    ]);
    // Le fallback réutilise le même mapId.
    expect(findMany.mock.calls[0]![0].where.mapId).toBe('strangerthings');
  });

  test('retourne un tableau vide quand le global ne renvoie aucune entrée', async () => {
    getWorldLeaderboard.mockResolvedValue({ entries: [] });
    expect(await worldTopTen()).toEqual([]);
  });
});

describe('globalStats', () => {
  test('agrège les counters numériques sur toutes les parties', async () => {
    findMany.mockResolvedValue([
      { counters: { bumper: 3, drain: 1 } },
      { counters: { bumper: 2, slingshot: 5 } },
    ]);
    // topCombo et bestToday
    findFirst
      .mockResolvedValueOnce({ maxCombo: 12, player: 'COMBOKING' })
      .mockResolvedValueOnce({ score: 8000, player: 'TODAYWIN' });

    const res = await globalStats('strangerthings');

    expect(res.totalGames).toBe(2);
    const totalsMap = Object.fromEntries(res.totals.map((t) => [t.key, t.value]));
    expect(totalsMap).toEqual({ bumper: 5, drain: 1, slingshot: 5 });
    // label = key pour l'instant.
    expect(res.totals.every((t) => t.label === t.key)).toBe(true);
    expect(res.bestCombo).toEqual({ value: 12, player: 'COMBOKING' });
    expect(res.bestToday).toEqual({ score: 8000, player: 'TODAYWIN' });
  });

  test('ignore les valeurs de counters non numériques', async () => {
    findMany.mockResolvedValue([
      { counters: { bumper: 4, label: 'oops', flag: true, nested: { x: 1 } } },
    ]);
    findFirst.mockResolvedValue(null);

    const res = await globalStats();

    const totalsMap = Object.fromEntries(res.totals.map((t) => [t.key, t.value]));
    expect(totalsMap).toEqual({ bumper: 4 });
  });

  test('counters null/absent traité comme objet vide (pas de crash)', async () => {
    findMany.mockResolvedValue([{ counters: null }, {}]);
    findFirst.mockResolvedValue(null);

    const res = await globalStats();

    expect(res.totalGames).toBe(2);
    expect(res.totals).toEqual([]);
  });

  test('bestCombo et bestToday null quand findFirst ne renvoie rien', async () => {
    findMany.mockResolvedValue([]);
    findFirst.mockResolvedValue(null);

    const res = await globalStats();

    expect(res.totalGames).toBe(0);
    expect(res.totals).toEqual([]);
    expect(res.bestCombo).toBeNull();
    expect(res.bestToday).toBeNull();
  });

  test('bestToday null mais bestCombo présent (cas mixte)', async () => {
    findMany.mockResolvedValue([{ counters: {} }]);
    findFirst
      .mockResolvedValueOnce({ maxCombo: 7, player: 'P' })
      .mockResolvedValueOnce(null);

    const res = await globalStats();

    expect(res.bestCombo).toEqual({ value: 7, player: 'P' });
    expect(res.bestToday).toBeNull();
  });

  test('filtre bestToday sur createdAt >= début de journée', async () => {
    findMany.mockResolvedValue([]);
    findFirst.mockResolvedValue(null);

    await globalStats('zelda');

    // 3e appel prisma = findFirst bestToday (le 2e des findFirst).
    const todayCall = findFirst.mock.calls[1]![0];
    expect(todayCall.where.mapId).toBe('zelda');
    expect(todayCall.where.createdAt.gte).toBeInstanceOf(Date);
    const gte = todayCall.where.createdAt.gte as Date;
    expect(gte.getHours()).toBe(0);
    expect(gte.getMinutes()).toBe(0);
    expect(gte.getSeconds()).toBe(0);
    expect(gte.getMilliseconds()).toBe(0);
  });
});
