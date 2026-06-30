import type {
  ScoreGateway,
  LeaderboardGateway,
  ScorePayload,
  ScoreRegistered,
} from '../use-cases/ports';
export type { ScorePayload, ScoreRegistered } from '../use-cases/ports';

// Cache ETag : évite de re-télécharger un board inchangé. Clé = `${mapId}:${limit}`.
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

    // cabinetId déduit du token côté serveur global → plus dans le payload.
    const body = JSON.stringify(p);
    // score borné au contrat [1, 99_999_999] (clamp fait par l'appelant — voir G2)

    const MAX = 3;
    for (let attempt = 1; attempt <= MAX; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000); // timeout généreux
      try {
        const res = await fetch(`${base}/v1/scores`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body,
          signal: ctrl.signal,
        });
        clearTimeout(t);
        // 200 = replay idempotent (gameId déjà vu), 201 = créé. Même corps.
        if (res.status === 200 || res.status === 201) {
          return (await res.json()) as ScoreRegistered;
        }
        // 4xx = définitif (pas de retry) → marqué pour que le catch rethrow direct.
        if (res.status >= 400 && res.status < 500) {
          const e = new Error(`global /v1/scores ${res.status}: ${await res.text()}`);
          (e as { definitive?: boolean }).definitive = true;
          throw e;
        }
        // 5xx → retry. Épuisé au dernier essai.
        if (attempt === MAX) throw new Error(`global /v1/scores ${res.status} (épuisé)`);
      } catch (err) {
        clearTimeout(t);
        // 4xx définitif → pas de retry. gameId rend timeout/réseau/5xx sûrs à
        // retenter (le global dédoublonne sur gameId → idempotent).
        if ((err as { definitive?: boolean }).definitive) throw err;
        if (attempt === MAX) throw err;
      }
      await new Promise((r) => setTimeout(r, 500 * attempt)); // backoff
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
