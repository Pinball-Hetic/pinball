import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { postScore, getWorldLeaderboard, type ScorePayload } from './GlobalApiClient';

// Helper : construit une réponse fetch minimale.
function makeRes(opts: {
  status: number;
  json?: unknown;
  text?: string;
  etag?: string | null;
}): Response {
  const headers = new Map<string, string>();
  if (opts.etag) headers.set('ETag', opts.etag);
  return {
    status: opts.status,
    ok: opts.status >= 200 && opts.status < 300,
    json: async () => opts.json,
    text: async () => opts.text ?? '',
    headers: { get: (k: string) => headers.get(k) ?? null },
  } as unknown as Response;
}

const PAYLOAD: ScorePayload = {
  gameId: 'g1',
  mapId: 'strangerthings',
  score: 1234,
  playedAt: '2026-06-28T00:00:00.000Z',
};

const realFetch = globalThis.fetch;
let envBackup: { url?: string; token?: string };

beforeEach(() => {
  envBackup = { url: process.env.GLOBAL_API_URL, token: process.env.BORNE_TOKEN };
  process.env.GLOBAL_API_URL = 'https://global.example';
  process.env.BORNE_TOKEN = 'tok-abc';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (envBackup.url === undefined) delete process.env.GLOBAL_API_URL;
  else process.env.GLOBAL_API_URL = envBackup.url;
  if (envBackup.token === undefined) delete process.env.BORNE_TOKEN;
  else process.env.BORNE_TOKEN = envBackup.token;
});

describe('postScore', () => {
  test('jette si GLOBAL_API_URL manquant', async () => {
    delete process.env.GLOBAL_API_URL;
    await expect(postScore(PAYLOAD)).rejects.toThrow(/manquants/);
  });

  test('jette si BORNE_TOKEN manquant', async () => {
    delete process.env.BORNE_TOKEN;
    await expect(postScore(PAYLOAD)).rejects.toThrow(/manquants/);
  });

  test('201 → retourne le corps ScoreRegistered', async () => {
    const registered = { scoreId: 's1', code: 'AB12', claimUrl: 'https://c/AB12' };
    const fetchMock = mock(async () => makeRes({ status: 201, json: registered }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await postScore(PAYLOAD);
    expect(out).toEqual(registered);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('200 (replay idempotent) → retourne le corps', async () => {
    const registered = { scoreId: 's1', code: 'AB12', claimUrl: 'https://c/AB12' };
    globalThis.fetch = mock(async () => makeRes({ status: 200, json: registered })) as never;
    expect(await postScore(PAYLOAD)).toEqual(registered);
  });

  test('envoie URL, méthode, Authorization Bearer et body JSON', async () => {
    const fetchMock = mock(async () =>
      makeRes({ status: 201, json: { scoreId: 's', code: 'C', claimUrl: 'u' } }),
    );
    globalThis.fetch = fetchMock as never;

    await postScore(PAYLOAD);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://global.example/v1/scores');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-abc');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(PAYLOAD);
  });

  test('4xx → erreur définitive, pas de retry', async () => {
    const fetchMock = mock(async () => makeRes({ status: 400, text: 'bad request' }));
    globalThis.fetch = fetchMock as never;

    await expect(postScore(PAYLOAD)).rejects.toThrow(/400: bad request/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // un seul essai
  });

  test('5xx persistant → retry jusqu\'à 3 fois puis jette (épuisé)', async () => {
    const fetchMock = mock(async () => makeRes({ status: 503, text: 'down' }));
    globalThis.fetch = fetchMock as never;

    await expect(postScore(PAYLOAD)).rejects.toThrow(/épuisé/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('5xx puis 201 → succès après retry', async () => {
    let n = 0;
    const fetchMock = mock(async () => {
      n += 1;
      if (n === 1) return makeRes({ status: 500, text: 'oops' });
      return makeRes({ status: 201, json: { scoreId: 's', code: 'OK', claimUrl: 'u' } });
    });
    globalThis.fetch = fetchMock as never;

    const out = await postScore(PAYLOAD);
    expect(out.code).toBe('OK');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('erreur réseau (rejet fetch) → retry puis rethrow au dernier essai', async () => {
    const fetchMock = mock(async () => {
      throw new Error('network boom');
    });
    globalThis.fetch = fetchMock as never;

    await expect(postScore(PAYLOAD)).rejects.toThrow(/network boom/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('erreur réseau puis succès → récupère', async () => {
    let n = 0;
    const fetchMock = mock(async () => {
      n += 1;
      if (n === 1) throw new Error('transient');
      return makeRes({ status: 201, json: { scoreId: 's', code: 'R', claimUrl: 'u' } });
    });
    globalThis.fetch = fetchMock as never;

    expect((await postScore(PAYLOAD)).code).toBe('R');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('getWorldLeaderboard', () => {
  test('jette si GLOBAL_API_URL manquant', async () => {
    delete process.env.GLOBAL_API_URL;
    await expect(getWorldLeaderboard('mapX')).rejects.toThrow(/manquant/);
  });

  test('200 → retourne le body et construit l\'URL avec mapId/scope/limit', async () => {
    const board = [{ pseudo: 'A', score: 10 }];
    const fetchMock = mock(async () => makeRes({ status: 200, json: board }));
    globalThis.fetch = fetchMock as never;

    const out = await getWorldLeaderboard('map enc', 5);
    expect(out).toEqual(board);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      'https://global.example/v1/leaderboard?mapId=map%20enc&scope=world&limit=5',
    );
  });

  test('limit par défaut = 10', async () => {
    const fetchMock = mock(async () => makeRes({ status: 200, json: [] }));
    globalThis.fetch = fetchMock as never;
    await getWorldLeaderboard('m');
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('limit=10');
  });

  test('!ok (500) → jette', async () => {
    globalThis.fetch = mock(async () => makeRes({ status: 500 })) as never;
    await expect(getWorldLeaderboard('m')).rejects.toThrow(/leaderboard 500/);
  });

  test('cache ETag : 2e appel envoie If-None-Match, 304 renvoie le body caché', async () => {
    const board = [{ pseudo: 'X', score: 99 }];
    let n = 0;
    const fetchMock = mock(async (_url: string, init?: RequestInit) => {
      n += 1;
      if (n === 1) return makeRes({ status: 200, json: board, etag: 'W/"v1"' });
      // 2e appel : doit porter If-None-Match
      expect((init?.headers as Record<string, string>)['If-None-Match']).toBe('W/"v1"');
      return makeRes({ status: 304 });
    });
    globalThis.fetch = fetchMock as never;

    const key = `etagmap-${Date.now()}`; // clé unique pour isoler le cache de module
    const first = await getWorldLeaderboard(key, 7);
    expect(first).toEqual(board);
    const second = await getWorldLeaderboard(key, 7);
    expect(second).toEqual(board); // body servi depuis le cache
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('rejet fetch → propage l\'erreur', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('offline');
    }) as never;
    await expect(getWorldLeaderboard('m')).rejects.toThrow(/offline/);
  });
});
