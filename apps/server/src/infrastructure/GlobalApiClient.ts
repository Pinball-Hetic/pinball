import type {
  ScoreGateway,
  LeaderboardGateway,
  ScorePayload,
  ScoreRegistered,
} from '../use-cases/ports';
export type { ScorePayload, ScoreRegistered } from '../use-cases/ports';

// Key = `${mapId}:${limit}`.
export type LeaderboardCache = Map<string, { etag: string; body: unknown }>;

export interface GlobalApiConfig {
  baseUrl?: string;
  token?: string;
}

export interface GlobalApiDeps {
  fetch: typeof fetch;
  config: GlobalApiConfig;
  cache: LeaderboardCache;
}

export interface GlobalApiClient extends ScoreGateway, LeaderboardGateway {}

export function createGlobalApiClient({ fetch, config, cache }: GlobalApiDeps): GlobalApiClient {
  const { baseUrl: base, token } = config;

  async function postScore(p: ScorePayload): Promise<ScoreRegistered> {
    if (!base || !token) throw new Error('GLOBAL_API_URL / BORNE_TOKEN manquants');

    // cabinetId is derived from the token by the global server → not in the payload.
    const body = JSON.stringify(p);

    const MAX = 3;
    for (let attempt = 1; attempt <= MAX; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      try {
        const res = await fetch(`${base}/v1/scores`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body,
          signal: ctrl.signal,
        });
        // 200 = idempotent replay (gameId already seen), 201 = created. Same body.
        if (res.status === 200 || res.status === 201) {
          return (await res.json()) as ScoreRegistered;
        }
        // 4xx = definitive (no retry) → flagged so the catch rethrows directly.
        if (res.status >= 400 && res.status < 500) {
          const e = new Error(`global /v1/scores ${res.status}: ${await res.text()}`);
          (e as { definitive?: boolean }).definitive = true;
          throw e;
        }
        if (attempt === MAX) throw new Error(`global /v1/scores ${res.status} (épuisé)`);
      } catch (err) {
        if ((err as { definitive?: boolean }).definitive) throw err;
        if (attempt === MAX) throw err;
      } finally {
        clearTimeout(t);
      }
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
    throw new Error('global /v1/scores: inatteignable');
  }

  async function getWorldLeaderboard(mapId: string, limit = 10): Promise<unknown> {
    if (!base) throw new Error('GLOBAL_API_URL manquant');
    const key = `${mapId}:${limit}`;
    const prev = cache.get(key);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const res = await fetch(
        `${base}/v1/leaderboard?mapId=${encodeURIComponent(mapId)}&scope=world&limit=${limit}`,
        { headers: prev ? { 'If-None-Match': prev.etag } : {}, signal: ctrl.signal },
      );
      clearTimeout(t);
      if (res.status === 304 && prev) return prev.body;
      if (!res.ok) throw new Error(`global /v1/leaderboard ${res.status}`);
      const body = await res.json();
      const etag = res.headers.get('ETag');
      if (etag) cache.set(key, { etag, body });
      return body;
    } catch (err) {
      clearTimeout(t);
      throw err;
    }
  }

  return { postScore, getWorldLeaderboard };
}
