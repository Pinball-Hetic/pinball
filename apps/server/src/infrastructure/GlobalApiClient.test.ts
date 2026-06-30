import { test, expect, describe, mock } from 'bun:test';
import {
  createGlobalApiClient,
  type GlobalApiConfig,
  type LeaderboardCache,
  type ScorePayload,
} from './GlobalApiClient';

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

const CONFIG: GlobalApiConfig = { baseUrl: 'https://global.example', token: 'tok-abc' };

function makeClient(
  fetchImpl: typeof fetch,
  config: GlobalApiConfig = CONFIG,
  cache: LeaderboardCache = new Map(),
) {
  return createGlobalApiClient({ fetch: fetchImpl, config, cache });
}

describe('postScore', () => {
  test('jette si baseUrl manquant', async () => {
    const client = makeClient(mock(async () => makeRes({ status: 201 })) as never, {
      baseUrl: undefined,
      token: 'tok-abc',
    });
    await expect(client.postScore(PAYLOAD)).rejects.toThrow(/manquants/);
  });

  test('jette si token manquant', async () => {
    const client = makeClient(mock(async () => makeRes({ status: 201 })) as never, {
      baseUrl: 'https://global.example',
      token: undefined,
    });
    await expect(client.postScore(PAYLOAD)).rejects.toThrow(/manquants/);
  });

  test('201 → retourne le corps ScoreRegistered', async () => {
    const registered = { scoreId: 's1', code: 'AB12', claimUrl: 'https://c/AB12' };
    const fetchMock = mock(async () => makeRes({ status: 201, json: registered }));
    const client = makeClient(fetchMock as unknown as typeof fetch);

    const out = await client.postScore(PAYLOAD);
    expect(out).toEqual(registered);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('200 (replay idempotent) → retourne le corps', async () => {
    const registered = { scoreId: 's1', code: 'AB12', claimUrl: 'https://c/AB12' };
    const client = makeClient(mock(async () => makeRes({ status: 200, json: registered })) as never);
    expect(await client.postScore(PAYLOAD)).toEqual(registered);
  });

  test('envoie URL, méthode, Authorization Bearer et body JSON', async () => {
    const fetchMock = mock(async () =>
      makeRes({ status: 201, json: { scoreId: 's', code: 'C', claimUrl: 'u' } }),
    );
    const client = makeClient(fetchMock as never);

    await client.postScore(PAYLOAD);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://global.example/v1/scores');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-abc');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(PAYLOAD);
  });

  test('4xx → erreur définitive, pas de retry', async () => {
    const fetchMock = mock(async () => makeRes({ status: 400, text: 'bad request' }));
    const client = makeClient(fetchMock as never);

    await expect(client.postScore(PAYLOAD)).rejects.toThrow(/400: bad request/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // un seul essai
  });

  test('5xx persistant → retry jusqu\'à 3 fois puis jette (épuisé)', async () => {
    const fetchMock = mock(async () => makeRes({ status: 503, text: 'down' }));
    const client = makeClient(fetchMock as never);

    await expect(client.postScore(PAYLOAD)).rejects.toThrow(/épuisé/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('5xx puis 201 → succès après retry', async () => {
    let n = 0;
    const fetchMock = mock(async () => {
      n += 1;
      if (n === 1) return makeRes({ status: 500, text: 'oops' });
      return makeRes({ status: 201, json: { scoreId: 's', code: 'OK', claimUrl: 'u' } });
    });
    const client = makeClient(fetchMock as never);

    const out = await client.postScore(PAYLOAD);
    expect(out.code).toBe('OK');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('erreur réseau (rejet fetch) → retry puis rethrow au dernier essai', async () => {
    const fetchMock = mock(async () => {
      throw new Error('network boom');
    });
    const client = makeClient(fetchMock as never);

    await expect(client.postScore(PAYLOAD)).rejects.toThrow(/network boom/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('erreur réseau puis succès → récupère', async () => {
    let n = 0;
    const fetchMock = mock(async () => {
      n += 1;
      if (n === 1) throw new Error('transient');
      return makeRes({ status: 201, json: { scoreId: 's', code: 'R', claimUrl: 'u' } });
    });
    const client = makeClient(fetchMock as never);

    expect((await client.postScore(PAYLOAD)).code).toBe('R');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('getWorldLeaderboard', () => {
  test('jette si baseUrl manquant', async () => {
    const client = makeClient(mock(async () => makeRes({ status: 200 })) as never, {
      baseUrl: undefined,
      token: 'tok-abc',
    });
    await expect(client.getWorldLeaderboard('mapX')).rejects.toThrow(/manquant/);
  });

  test('200 → retourne le body et construit l\'URL avec mapId/scope/limit', async () => {
    const board = [{ pseudo: 'A', score: 10 }];
    const fetchMock = mock(async () => makeRes({ status: 200, json: board }));
    const client = makeClient(fetchMock as never);

    const out = await client.getWorldLeaderboard('map enc', 5);
    expect(out).toEqual(board);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      'https://global.example/v1/leaderboard?mapId=map%20enc&scope=world&limit=5',
    );
  });

  test('limit par défaut = 10', async () => {
    const fetchMock = mock(async () => makeRes({ status: 200, json: [] }));
    const client = makeClient(fetchMock as never);
    await client.getWorldLeaderboard('m');
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain('limit=10');
  });

  test('!ok (500) → jette', async () => {
    const client = makeClient(mock(async () => makeRes({ status: 500 })) as never);
    await expect(client.getWorldLeaderboard('m')).rejects.toThrow(/leaderboard 500/);
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
    // Cache frais injecté → isolation sans clé unique.
    const client = makeClient(fetchMock as never, CONFIG, new Map());

    const first = await client.getWorldLeaderboard('etagmap', 7);
    expect(first).toEqual(board);
    const second = await client.getWorldLeaderboard('etagmap', 7);
    expect(second).toEqual(board); // body servi depuis le cache
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('rejet fetch → propage l\'erreur', async () => {
    const client = makeClient(
      mock(async () => {
        throw new Error('offline');
      }) as never,
    );
    await expect(client.getWorldLeaderboard('m')).rejects.toThrow(/offline/);
  });
});
