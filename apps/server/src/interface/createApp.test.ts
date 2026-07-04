import { test, expect, describe, mock, beforeEach } from 'bun:test';
import request from 'supertest';
import { createApp, type LeaderboardQueries } from './createApp';

// Injected fakes — no mock.module, static import.
const worldTopTen = mock(async (..._a: unknown[]) => [] as unknown);
const globalStats = mock(async (..._a: unknown[]) => ({}) as unknown);
const app = createApp({ worldTopTen, globalStats } as unknown as LeaderboardQueries);

beforeEach(() => {
  worldTopTen.mockReset();
  globalStats.mockReset();
  worldTopTen.mockResolvedValue([]);
  globalStats.mockResolvedValue({});
});

type Res = { status: number; text: string; body: unknown };

describe('GET /', () => {
  test('répond avec le message de santé', async () => {
    const res = (await request(app).get('/')) as unknown as Res;
    expect(res.status).toBe(200);
    expect(res.text).toBe('Pinball Server is running');
  });
});

describe('GET /api/leaderboard', () => {
  test('retourne les données de worldTopTen (200)', async () => {
    const board = [{ rank: 1, name: 'ALICE', score: 500, date: '2026-01-01' }];
    worldTopTen.mockResolvedValue(board);
    const res = (await request(app).get('/api/leaderboard')) as unknown as Res;
    expect(res.status).toBe(200);
    expect(res.body).toEqual(board);
  });

  test('transmet le query param mapId à worldTopTen', async () => {
    await request(app).get('/api/leaderboard?mapId=zelda');
    expect(worldTopTen).toHaveBeenCalledWith('zelda');
  });

  test('mapId undefined quand le query param est absent', async () => {
    await request(app).get('/api/leaderboard');
    expect(worldTopTen).toHaveBeenCalledWith(undefined);
  });

  test('mappe une erreur du use-case en 500', async () => {
    worldTopTen.mockRejectedValue(new Error('db down'));
    const res = (await request(app).get('/api/leaderboard')) as unknown as Res;
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'leaderboard unavailable' });
  });
});

describe('GET /api/stats', () => {
  test('retourne les données de globalStats (200)', async () => {
    const stats = { totalGames: 3, totals: [], bestCombo: null, bestToday: null };
    globalStats.mockResolvedValue(stats);
    const res = (await request(app).get('/api/stats')) as unknown as Res;
    expect(res.status).toBe(200);
    expect(res.body).toEqual(stats);
  });

  test('transmet le query param mapId à globalStats', async () => {
    await request(app).get('/api/stats?mapId=strangerthings');
    expect(globalStats).toHaveBeenCalledWith('strangerthings');
  });

  test('mapId undefined quand le query param est absent', async () => {
    await request(app).get('/api/stats');
    expect(globalStats).toHaveBeenCalledWith(undefined);
  });

  test('mappe une erreur du use-case en 500', async () => {
    globalStats.mockRejectedValue(new Error('boom'));
    const res = (await request(app).get('/api/stats')) as unknown as Res;
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'stats unavailable' });
  });
});
