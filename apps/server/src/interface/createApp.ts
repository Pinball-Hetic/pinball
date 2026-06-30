import express, { type Express } from 'express';
import type { LeaderboardEntry, GlobalStats } from '@pinball/shared-types';

/**
 * Read queries the HTTP API depends on. Injected (DIP) so createApp can be
 * unit-tested with in-memory fakes — no prisma, no module mocking.
 */
export interface LeaderboardQueries {
  worldTopTen(mapId?: string): Promise<LeaderboardEntry[]>;
  globalStats(mapId?: string): Promise<GlobalStats>;
}

/**
 * Builds the Express app (routes only — no listen, no socket, no module-level
 * side effects). The composition root (index.ts) injects the real queries.
 */
export function createApp(queries: LeaderboardQueries): Express {
  const app = express();

  app.get('/', (_req, res) => {
    res.send('Pinball Server is running');
  });

  app.get('/api/leaderboard', async (req, res) => {
    try {
      const mapId = typeof req.query.mapId === 'string' ? req.query.mapId : undefined;
      res.json(await queries.worldTopTen(mapId));
    } catch (err) {
      console.error('[server] /api/leaderboard failed:', err);
      res.status(500).json({ error: 'leaderboard unavailable' });
    }
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const mapId = typeof req.query.mapId === 'string' ? req.query.mapId : undefined;
      res.json(await queries.globalStats(mapId));
    } catch (err) {
      console.error('[server] /api/stats failed:', err);
      res.status(500).json({ error: 'stats unavailable' });
    }
  });

  return app;
}
