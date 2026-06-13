export interface ScorePayload {
  mapId: string;
  score: number;
  maxCombo?: number;
  maxMultiplier?: number;
  counters?: Record<string, number>;
  durationS?: number;
  playedAt: string; // ISO-8601 avec offset
}

export interface ScoreRegistered {
  scoreId: string;
  code: string;
  claimUrl: string;
}

export async function postScore(p: ScorePayload): Promise<ScoreRegistered> {
  const base = process.env.GLOBAL_API_URL;
  const key = process.env.CABINET_KEY;
  const cabinetId = process.env.CABINET_ID ?? 'borne-dev';
  if (!base || !key) throw new Error('GLOBAL_API_URL / CABINET_KEY manquants');

  const body = JSON.stringify({ cabinetId, ...p });
  // score borné au contrat [1, 99_999_999] (clamp fait par l'appelant — voir G2)

  const MAX = 3;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000); // timeout généreux
    try {
      const res = await fetch(`${base}/v1/scores`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.status === 201) return (await res.json()) as ScoreRegistered;
      // 4xx = erreur définitive, pas de retry. 5xx = retry.
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`global /v1/scores ${res.status}: ${await res.text()}`);
      }
      if (attempt === MAX) throw new Error(`global /v1/scores ${res.status} (épuisé)`);
    } catch (err) {
      clearTimeout(t);
      // AbortError (timeout) = AMBIGU (peut avoir réussi) → PAS de retry (anti-doublon, cf doc §7).
      if ((err as Error).name === 'AbortError') throw err;
      // erreur définitive 4xx remontée ci-dessus → rethrow
      if (attempt === MAX) throw err;
    }
    await new Promise((r) => setTimeout(r, 500 * attempt)); // backoff
  }
  throw new Error('global /v1/scores: inatteignable');
}

// Cache ETag en mémoire (process server) : évite de re-télécharger un board
// inchangé. Clé = `${mapId}:${limit}`.
const lbCache = new Map<string, { etag: string; body: unknown }>();

export async function getWorldLeaderboard(mapId: string, limit = 10): Promise<unknown> {
  const base = process.env.GLOBAL_API_URL;
  if (!base) throw new Error('GLOBAL_API_URL manquant');
  const key = `${mapId}:${limit}`;
  const prev = lbCache.get(key);
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
    if (etag) lbCache.set(key, { etag, body });
    return body;
  } catch (err) {
    clearTimeout(t);
    throw err;
  }
}
