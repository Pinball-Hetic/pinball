import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { createLeaderboard, anonName, aggregateCounters } from '../../src/use-cases/Leaderboard';
import type { GameRepository, LeaderboardGateway } from '../../src/use-cases/ports';

// Fake ports — no prisma, no mock.module.
const topByScore = mock(async (..._a: unknown[]) => [] as unknown[]);
const allCounters = mock(async (..._a: unknown[]) => [] as unknown[]);
const topByCombo = mock(async (..._a: unknown[]) => null as unknown);
const topTodayByScore = mock(async (..._a: unknown[]) => null as unknown);
const getWorldLeaderboard = mock(async (..._a: unknown[]) => ({ entries: [] }) as unknown);

function makeLeaderboard() {
  const games = { topByScore, allCounters, topByCombo, topTodayByScore } as unknown as GameRepository;
  const world = { getWorldLeaderboard } as unknown as LeaderboardGateway;
  return createLeaderboard({ games, world });
}

beforeEach(() => {
  topByScore.mockReset();
  allCounters.mockReset();
  topByCombo.mockReset();
  topTodayByScore.mockReset();
  getWorldLeaderboard.mockReset();
  topByScore.mockResolvedValue([]);
  allCounters.mockResolvedValue([]);
  topByCombo.mockResolvedValue(null);
  topTodayByScore.mockResolvedValue(null);
  getWorldLeaderboard.mockResolvedValue({ entries: [] });
});

describe('topTen', () => {
  test('mappe les lignes du repo en entrées classées (rank = index + 1)', async () => {
    const d1 = new Date('2026-01-01T10:00:00.000Z');
    const d2 = new Date('2026-01-02T10:00:00.000Z');
    topByScore.mockResolvedValue([
      { player: 'ALICE', score: 500, createdAt: d1 },
      { player: 'BOB', score: 200, createdAt: d2 },
    ]);
    expect(await makeLeaderboard().topTen('strangerthings')).toEqual([
      { rank: 1, name: 'ALICE', score: 500, date: d1.toISOString() },
      { rank: 2, name: 'BOB', score: 200, date: d2.toISOString() },
    ]);
  });

  test('interroge le repo avec mapId et take 10', async () => {
    await makeLeaderboard().topTen('zelda');
    expect(topByScore).toHaveBeenCalledWith('zelda', 10);
  });

  test('utilise le mapId par défaut quand non fourni', async () => {
    await makeLeaderboard().topTen();
    expect((topByScore.mock.calls[0]![0] as string)).toBe('strangerthings');
  });

  test('retourne un tableau vide quand aucune partie', async () => {
    expect(await makeLeaderboard().topTen()).toEqual([]);
  });
});

describe('worldTopTen', () => {
  test('mappe les entrées globales avec pseudo présent', async () => {
    getWorldLeaderboard.mockResolvedValue({
      entries: [{ rank: 1, pseudo: 'NEO', score: 9000, playedAt: '2026-03-01T12:00:00.000Z' }],
    });
    const res = await makeLeaderboard().worldTopTen('strangerthings');
    expect(res).toEqual([{ rank: 1, name: 'NEO', score: 9000, date: '2026-03-01T12:00:00.000Z' }]);
    expect(getWorldLeaderboard).toHaveBeenCalledWith('strangerthings', 10);
  });

  test('fallback anonName stable quand pseudo null', async () => {
    const playedAt = '2026-03-01T12:00:00.000Z';
    getWorldLeaderboard.mockResolvedValue({ entries: [{ rank: 1, pseudo: null, score: 100, playedAt }] });
    const res = await makeLeaderboard().worldTopTen();
    expect(res[0]!.name).toBe(anonName(playedAt));
    expect(res[0]!.name).toMatch(/^PLAYER\d{4}$/);
  });

  test('FALLBACK sur topTen local quand getWorldLeaderboard throw', async () => {
    getWorldLeaderboard.mockRejectedValue(new Error('global KO'));
    const d = new Date('2026-01-01T10:00:00.000Z');
    topByScore.mockResolvedValue([{ player: 'LOCAL', score: 42, createdAt: d }]);
    const res = await makeLeaderboard().worldTopTen('strangerthings');
    expect(res).toEqual([{ rank: 1, name: 'LOCAL', score: 42, date: d.toISOString() }]);
    expect(topByScore).toHaveBeenCalledWith('strangerthings', 10);
  });

  test('retourne un tableau vide quand le global ne renvoie aucune entrée', async () => {
    getWorldLeaderboard.mockResolvedValue({ entries: [] });
    expect(await makeLeaderboard().worldTopTen()).toEqual([]);
  });
});

describe('globalStats', () => {
  test('agrège les counters numériques sur toutes les parties', async () => {
    allCounters.mockResolvedValue([
      { counters: { bumper: 3, drain: 1 } },
      { counters: { bumper: 2, slingshot: 5 } },
    ]);
    topByCombo.mockResolvedValue({ maxCombo: 12, player: 'COMBOKING' });
    topTodayByScore.mockResolvedValue({ score: 8000, player: 'TODAYWIN' });

    const res = await makeLeaderboard().globalStats('strangerthings');
    expect(res.totalGames).toBe(2);
    expect(Object.fromEntries(res.totals.map((t) => [t.key, t.value]))).toEqual({ bumper: 5, drain: 1, slingshot: 5 });
    expect(res.totals.every((t) => t.label === t.key)).toBe(true);
    expect(res.bestCombo).toEqual({ value: 12, player: 'COMBOKING' });
    expect(res.bestToday).toEqual({ score: 8000, player: 'TODAYWIN' });
  });

  test('ignore les valeurs de counters non numériques', async () => {
    allCounters.mockResolvedValue([{ counters: { bumper: 4, label: 'oops', flag: true, nested: { x: 1 } } }]);
    const res = await makeLeaderboard().globalStats();
    expect(Object.fromEntries(res.totals.map((t) => [t.key, t.value]))).toEqual({ bumper: 4 });
  });

  test('counters null/absent traité comme objet vide (pas de crash)', async () => {
    allCounters.mockResolvedValue([{ counters: null }, {}]);
    const res = await makeLeaderboard().globalStats();
    expect(res.totalGames).toBe(2);
    expect(res.totals).toEqual([]);
  });

  test('bestCombo et bestToday null quand le repo ne renvoie rien', async () => {
    const res = await makeLeaderboard().globalStats();
    expect(res.totalGames).toBe(0);
    expect(res.totals).toEqual([]);
    expect(res.bestCombo).toBeNull();
    expect(res.bestToday).toBeNull();
  });

  test('filtre bestToday sur un début de journée (00:00:00.000)', async () => {
    await makeLeaderboard().globalStats('zelda');
    const [mapId, since] = topTodayByScore.mock.calls[0]! as unknown as [string, Date];
    expect(mapId).toBe('zelda');
    expect(since).toBeInstanceOf(Date);
    expect(since.getHours()).toBe(0);
    expect(since.getMinutes()).toBe(0);
    expect(since.getSeconds()).toBe(0);
    expect(since.getMilliseconds()).toBe(0);
  });
});

describe('helpers purs', () => {
  test('anonName est stable et au format PLAYERxxxx', () => {
    const a = anonName('2026-03-01T12:00:00.000Z');
    expect(a).toBe(anonName('2026-03-01T12:00:00.000Z'));
    expect(a).toMatch(/^PLAYER\d{4}$/);
  });

  test('aggregateCounters somme par clé en ignorant le non-numérique', () => {
    const out = aggregateCounters([{ counters: { a: 1, x: 'no' } }, { counters: { a: 2, b: 5 } }]);
    expect(Object.fromEntries(out.map((t) => [t.key, t.value]))).toEqual({ a: 3, b: 5 });
  });
});
