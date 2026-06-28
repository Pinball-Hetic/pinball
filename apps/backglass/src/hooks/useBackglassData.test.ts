import {
  test,
  expect,
  describe,
  mock,
  beforeEach,
  afterEach,
} from 'bun:test';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import type { GlobalStats, LeaderboardEntry } from '@pinball/shared-types';

// ── Faux socket : capture les handlers .on() pour les déclencher à la main. ──
type Handler = (...args: unknown[]) => void;

let handlers: Record<string, Handler>;
let disconnectCalls: number;

function emit(event: string, ...args: unknown[]) {
  handlers[event]?.(...args);
}

const createPinballSocket = mock(() => ({
  on(event: string, cb: Handler) {
    handlers[event] = cb;
  },
  disconnect() {
    disconnectCalls += 1;
  },
}));

mock.module('@pinball/shared-types/src/socket-client', () => ({
  createPinballSocket,
}));

// ── Stub fetch : file de réponses programmables par URL prefix. ──────────────
type FetchResult = { ok: boolean; status: number; body: unknown };

let leaderboardResult: FetchResult;
let statsResult: FetchResult;
let fetchedUrls: string[];

function makeResponse(r: FetchResult) {
  return Promise.resolve({
    ok: r.ok,
    status: r.status,
    json: () => Promise.resolve(r.body),
  });
}

const fetchMock = mock((url: string) => {
  fetchedUrls.push(url);
  if (url.startsWith('/api/leaderboard')) return makeResponse(leaderboardResult);
  if (url.startsWith('/api/stats')) return makeResponse(statsResult);
  throw new Error(`unexpected fetch ${url}`);
});

// ── Capture du poll : on n'intercepte QUE l'interval de 30 s du hook, en
// laissant passer tous les autres setInterval (waitFor de testing-library en
// dépend pour son propre polling). ──────────────────────────────────────────
let pollCallback: (() => void) | null;
let pollHandle: ReturnType<typeof setInterval> | null;
let clearIntervalCalls: number;
const realSetInterval = window.setInterval.bind(window);
const realClearInterval = window.clearInterval.bind(window);

const VALID_ENTRIES: LeaderboardEntry[] = [
  { rank: 1, name: 'NEO', score: 9000, date: '2026-01-01' },
];
const VALID_STATS: GlobalStats = {
  totalGames: 42,
  totals: [{ key: 'demogorgons', label: 'Demogorgons', value: 7 }],
  bestCombo: { value: 5, player: 'NEO' },
  bestToday: { score: 9000, player: 'NEO' },
};

beforeEach(() => {
  handlers = {};
  disconnectCalls = 0;
  fetchedUrls = [];
  pollCallback = null;
  pollHandle = null;
  clearIntervalCalls = 0;
  leaderboardResult = { ok: true, status: 200, body: VALID_ENTRIES };
  statsResult = { ok: true, status: 200, body: VALID_STATS };

  createPinballSocket.mockClear();
  fetchMock.mockClear();

  globalThis.fetch = fetchMock as unknown as typeof fetch;
  // On ne capture QUE le poll du hook (delay 30000). Tout le reste (waitFor)
  // passe par les vrais timers.
  window.setInterval = ((cb: () => void, delay?: number, ...rest: unknown[]) => {
    if (delay === 30_000) {
      pollCallback = cb;
      pollHandle = 99_999 as unknown as ReturnType<typeof setInterval>;
      return pollHandle;
    }
    return realSetInterval(cb, delay as number, ...rest);
  }) as typeof window.setInterval;
  window.clearInterval = ((handle?: ReturnType<typeof setInterval>) => {
    if (handle === pollHandle) {
      clearIntervalCalls += 1;
      return;
    }
    return realClearInterval(handle);
  }) as typeof window.clearInterval;
});

afterEach(() => {
  cleanup();
  window.setInterval = realSetInterval;
  window.clearInterval = realClearInterval;
});

async function importHook() {
  const mod = await import('./useBackglassData');
  return mod.useBackglassData;
}

describe('useBackglassData — fetch initial', () => {
  test('état initial vide puis peuplé par le fetch initial', async () => {
    const useBackglassData = await importHook();
    const { result } = renderHook(() => useBackglassData());

    await waitFor(() => expect(result.current.entries).toEqual(VALID_ENTRIES));
    expect(result.current.stats).toEqual(VALID_STATS);
    expect(result.current.connected).toBe(false);
    expect(result.current.mapId).toBe('strangerthings');
  });

  test('fetch les deux endpoints avec le mapId par défaut', async () => {
    const useBackglassData = await importHook();
    renderHook(() => useBackglassData());

    await waitFor(() => expect(fetchedUrls.length).toBeGreaterThanOrEqual(2));
    expect(
      fetchedUrls.some((u) => u === '/api/leaderboard?mapId=strangerthings'),
    ).toBe(true);
    expect(fetchedUrls.some((u) => u === '/api/stats?mapId=strangerthings')).toBe(
      true,
    );
  });
});

describe('useBackglassData — réponses invalides (kiosk safety)', () => {
  test('un leaderboard non-OK ne remplace pas l état (reste vide)', async () => {
    leaderboardResult = { ok: false, status: 500, body: '<html>err</html>' };
    const useBackglassData = await importHook();
    const { result } = renderHook(() => useBackglassData());

    await waitFor(() => expect(result.current.stats).toEqual(VALID_STATS));
    expect(result.current.entries).toEqual([]);
  });

  test('un leaderboard non-array est rejeté', async () => {
    leaderboardResult = { ok: true, status: 200, body: { error: 'nope' } };
    const useBackglassData = await importHook();
    const { result } = renderHook(() => useBackglassData());

    await waitFor(() => expect(result.current.stats).toEqual(VALID_STATS));
    expect(result.current.entries).toEqual([]);
  });

  test('des stats sans totalGames numérique sont rejetées (EMPTY_STATS)', async () => {
    statsResult = { ok: true, status: 200, body: { error: 'nope' } };
    const useBackglassData = await importHook();
    const { result } = renderHook(() => useBackglassData());

    await waitFor(() => expect(result.current.entries).toEqual(VALID_ENTRIES));
    expect(result.current.stats).toEqual({
      totalGames: 0,
      totals: [],
      bestCombo: null,
      bestToday: null,
    });
  });

  test('stats non-OK garde EMPTY_STATS', async () => {
    statsResult = { ok: false, status: 503, body: null };
    const useBackglassData = await importHook();
    const { result } = renderHook(() => useBackglassData());

    await waitFor(() => expect(result.current.entries).toEqual(VALID_ENTRIES));
    expect(result.current.stats.totalGames).toBe(0);
  });
});

describe('useBackglassData — events socket', () => {
  test('connect / disconnect bascule connected', async () => {
    const useBackglassData = await importHook();
    const { result } = renderHook(() => useBackglassData());
    await waitFor(() => expect(result.current.entries).toEqual(VALID_ENTRIES));

    act(() => emit('connect'));
    expect(result.current.connected).toBe(true);
    act(() => emit('disconnect'));
    expect(result.current.connected).toBe(false);
  });

  test('leaderboard:refresh re-fetch le leaderboard avec la map courante', async () => {
    const useBackglassData = await importHook();
    renderHook(() => useBackglassData());
    await waitFor(() => expect(fetchedUrls.length).toBeGreaterThanOrEqual(2));

    fetchMock.mockClear();
    fetchedUrls = [];
    act(() => emit('leaderboard:refresh', []));

    await waitFor(() =>
      expect(fetchedUrls).toContain('/api/leaderboard?mapId=strangerthings'),
    );
    // game:over n'a pas été émis → pas de re-fetch stats.
    expect(fetchedUrls.some((u) => u.startsWith('/api/stats'))).toBe(false);
  });

  test('game:over re-fetch les stats', async () => {
    const useBackglassData = await importHook();
    renderHook(() => useBackglassData());
    await waitFor(() => expect(fetchedUrls.length).toBeGreaterThanOrEqual(2));

    fetchedUrls = [];
    act(() => emit('game:over'));
    await waitFor(() =>
      expect(fetchedUrls).toContain('/api/stats?mapId=strangerthings'),
    );
  });

  test('map:selected bascule mapId et re-fetch les deux avec la nouvelle map', async () => {
    const useBackglassData = await importHook();
    const { result } = renderHook(() => useBackglassData());
    await waitFor(() => expect(fetchedUrls.length).toBeGreaterThanOrEqual(2));

    fetchedUrls = [];
    act(() => emit('map:selected', { mapId: 'zelda' }));

    expect(result.current.mapId).toBe('zelda');
    await waitFor(() =>
      expect(fetchedUrls).toContain('/api/leaderboard?mapId=zelda'),
    );
    expect(fetchedUrls).toContain('/api/stats?mapId=zelda');
  });
});

describe('useBackglassData — poll périodique', () => {
  test('le poll re-fetch le leaderboard (pas les stats)', async () => {
    const useBackglassData = await importHook();
    renderHook(() => useBackglassData());
    await waitFor(() => expect(pollCallback).not.toBeNull());

    fetchedUrls = [];
    act(() => pollCallback!());
    await waitFor(() =>
      expect(fetchedUrls).toContain('/api/leaderboard?mapId=strangerthings'),
    );
    expect(fetchedUrls.some((u) => u.startsWith('/api/stats'))).toBe(false);
  });
});

describe('useBackglassData — cycle de vie', () => {
  test('au démontage : disconnect socket + clear du poll', async () => {
    const useBackglassData = await importHook();
    const { unmount } = renderHook(() => useBackglassData());
    await waitFor(() => expect(pollCallback).not.toBeNull());

    unmount();
    expect(disconnectCalls).toBe(1);
    expect(clearIntervalCalls).toBe(1);
  });
});
