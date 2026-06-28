import { test, expect, describe, mock, beforeEach } from 'bun:test';
import request from 'supertest';

// Mocks des use-cases AVANT le dynamic import du module testé. bun mock.module
// est GLOBAL par process : ce fichier tourne dans une passe `bun test
// src/interface` isolée (cf. package.json) pour ne pas polluer les autres.
const worldTopTen = mock(async (..._a: unknown[]) => [] as unknown);
const globalStats = mock(async (..._a: unknown[]) => ({}) as unknown);
const registerScore = mock(async (..._a: unknown[]) => ({}) as unknown);

mock.module('../use-cases/Leaderboard', () => ({
  worldTopTen,
  globalStats,
}));

mock.module('../use-cases/RegisterScore', () => ({
  registerScore,
}));

// Import dynamique après les mocks.
const { app, handleConnection } = await import('./index');

beforeEach(() => {
  worldTopTen.mockReset();
  globalStats.mockReset();
  registerScore.mockReset();
  worldTopTen.mockResolvedValue([]);
  globalStats.mockResolvedValue({});
  registerScore.mockResolvedValue({});
});

describe('GET /', () => {
  test('répond avec le message de santé', async () => {
    const res = (await request(app).get('/')) as unknown as { status: number; text: string };
    expect(res.status).toBe(200);
    expect(res.text).toBe('Pinball Server is running');
  });
});

describe('GET /api/leaderboard', () => {
  test('retourne les données de worldTopTen (200)', async () => {
    const board = [{ rank: 1, name: 'ALICE', score: 500, date: '2026-01-01' }];
    worldTopTen.mockResolvedValue(board);

    const res = (await request(app).get('/api/leaderboard')) as unknown as {
      status: number;
      body: unknown;
    };

    expect(res.status).toBe(200);
    expect(res.body).toEqual(board);
  });

  test('transmet le query param mapId à worldTopTen', async () => {
    worldTopTen.mockResolvedValue([]);
    await request(app).get('/api/leaderboard?mapId=zelda');
    expect(worldTopTen).toHaveBeenCalledWith('zelda');
  });

  test('mapId undefined quand le query param est absent', async () => {
    worldTopTen.mockResolvedValue([]);
    await request(app).get('/api/leaderboard');
    expect(worldTopTen).toHaveBeenCalledWith(undefined);
  });

  test('mappe une erreur du use-case en 500', async () => {
    worldTopTen.mockRejectedValue(new Error('db down'));
    const res = (await request(app).get('/api/leaderboard')) as unknown as {
      status: number;
      body: { error?: string };
    };
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'leaderboard unavailable' });
  });
});

describe('GET /api/stats', () => {
  test('retourne les données de globalStats (200)', async () => {
    const stats = { totalGames: 3, totals: [], bestCombo: null, bestToday: null };
    globalStats.mockResolvedValue(stats);

    const res = (await request(app).get('/api/stats')) as unknown as {
      status: number;
      body: unknown;
    };

    expect(res.status).toBe(200);
    expect(res.body).toEqual(stats);
  });

  test('transmet le query param mapId à globalStats', async () => {
    globalStats.mockResolvedValue({});
    await request(app).get('/api/stats?mapId=strangerthings');
    expect(globalStats).toHaveBeenCalledWith('strangerthings');
  });

  test('mapId undefined quand le query param est absent', async () => {
    globalStats.mockResolvedValue({});
    await request(app).get('/api/stats');
    expect(globalStats).toHaveBeenCalledWith(undefined);
  });

  test('mappe une erreur du use-case en 500', async () => {
    globalStats.mockRejectedValue(new Error('boom'));
    const res = (await request(app).get('/api/stats')) as unknown as {
      status: number;
      body: { error?: string };
    };
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'stats unavailable' });
  });
});

// ---------------------------------------------------------------------------
// Socket handler : fake io + fake socket minimaux. On capture les handlers
// `socket.on(event, cb)` pour pouvoir les déclencher manuellement.
// ---------------------------------------------------------------------------

type Handler = (data: unknown) => void;

function makeFakeIo() {
  const emit = mock((..._a: unknown[]) => undefined);
  const toEmit = mock((..._a: unknown[]) => undefined);
  const to = mock((..._a: unknown[]) => ({ emit: toEmit }));
  return { io: { emit, to }, emit, to, toEmit };
}

function makeFakeSocket(role?: string) {
  const handlers = new Map<string, Handler>();
  const join = mock((..._a: unknown[]) => undefined);
  const emit = mock((..._a: unknown[]) => undefined);
  const on = mock((event: string, cb: Handler) => {
    handlers.set(event, cb);
  });
  const socket = {
    id: 'socket-1',
    handshake: { auth: role ? { role } : {} },
    join,
    emit,
    on,
  };
  const fire = (event: string, data?: unknown) => {
    const cb = handlers.get(event);
    if (!cb) throw new Error(`no handler registered for ${event}`);
    cb(data);
  };
  return { socket, join, emit, on, fire };
}

function invoke(io: unknown, socket: unknown) {
  // handleConnection est typé sur les vrais types socket.io ; on passe des
  // fakes structurellement compatibles via un cast.
  (handleConnection as unknown as (io: unknown, socket: unknown) => void)(io, socket);
}

describe('handleConnection', () => {
  test("role 'input-bridge' rejoint la room input-bridge", () => {
    const { io } = makeFakeIo();
    const { socket, join } = makeFakeSocket('input-bridge');
    invoke(io, socket);
    expect(join).toHaveBeenCalledWith('input-bridge');
  });

  test('un frontend (sans role) ne rejoint aucune room', () => {
    const { io } = makeFakeIo();
    const { socket, join } = makeFakeSocket();
    invoke(io, socket);
    expect(join).not.toHaveBeenCalled();
  });

  test('émet map:selected au nouveau connecté', () => {
    const { io } = makeFakeIo();
    const { socket, emit } = makeFakeSocket();
    invoke(io, socket);
    expect(emit).toHaveBeenCalledWith('map:selected', expect.objectContaining({ mapId: expect.any(String) }));
  });

  test('map:select met à jour la map courante et broadcast map:selected', () => {
    const { io, emit } = makeFakeIo();
    const { socket, fire } = makeFakeSocket();
    invoke(io, socket);

    fire('map:select', { mapId: 'a-new-map-id' });
    expect(emit).toHaveBeenCalledWith('map:selected', { mapId: 'a-new-map-id' });
  });

  test('map:select ignore un mapId non-string', () => {
    const { io, emit } = makeFakeIo();
    const { socket, fire } = makeFakeSocket();
    invoke(io, socket);

    fire('map:select', { mapId: 123 });
    expect(emit).not.toHaveBeenCalled();
  });

  test('map:select ignore un mapId identique à la map courante', () => {
    const { io, emit } = makeFakeIo();
    const { socket, emit: socketEmit, fire } = makeFakeSocket();
    invoke(io, socket);

    // map courante = ce qui a été émis en connexion via socket.emit.
    const current = (socketEmit.mock.calls[0]![1] as { mapId: string }).mapId;
    fire('map:select', { mapId: current });
    expect(emit).not.toHaveBeenCalled();
  });

  test('dev:simulate-button est routé vers la room input-bridge', () => {
    const { io, to, toEmit } = makeFakeIo();
    const { socket, fire } = makeFakeSocket();
    invoke(io, socket);

    const payload = { id: 'WHITE_LEFT', action: 'DOWN' };
    fire('dev:simulate-button', payload);
    expect(to).toHaveBeenCalledWith('input-bridge');
    expect(toEmit).toHaveBeenCalledWith('dev:simulate-button', payload);
  });

  test('input:button est relayé à tous via io.emit', () => {
    const { io, emit } = makeFakeIo();
    const { socket, fire } = makeFakeSocket();
    invoke(io, socket);

    const payload = { id: 'WHITE_LEFT', action: 'UP' };
    fire('input:button', payload);
    expect(emit).toHaveBeenCalledWith('input:button', payload);
  });

  test('input:tilt est relayé à tous via io.emit', () => {
    const { io, emit } = makeFakeIo();
    const { socket, fire } = makeFakeSocket();
    invoke(io, socket);

    const payload = { state: 'TRIGGERED' };
    fire('input:tilt', payload);
    expect(emit).toHaveBeenCalledWith('input:tilt', payload);
  });

  test('input:sensor est relayé à tous via io.emit', () => {
    const { io, emit } = makeFakeIo();
    const { socket, fire } = makeFakeSocket();
    invoke(io, socket);

    const payload = { id: 'PLUNGER', value: 42 };
    fire('input:sensor', payload);
    expect(emit).toHaveBeenCalledWith('input:sensor', payload);
  });

  test('score:update / game:start / dmd:display / dev:trigger-game-event sont relayés', () => {
    const { io, emit } = makeFakeIo();
    const { socket, fire } = makeFakeSocket();
    invoke(io, socket);

    fire('score:update', { player: 'A', score: 1, combo: 2, multiplier: 3 });
    fire('game:start', { player: 'A' });
    fire('dmd:display', { mode: 'idle' });
    fire('dev:trigger-game-event', { type: 'BUMPER_HIT' });

    expect(emit).toHaveBeenCalledWith('score:update', { player: 'A', score: 1, combo: 2, multiplier: 3 });
    expect(emit).toHaveBeenCalledWith('game:start', { player: 'A' });
    expect(emit).toHaveBeenCalledWith('dmd:display', { mode: 'idle' });
    expect(emit).toHaveBeenCalledWith('dev:trigger-game-event', { type: 'BUMPER_HIT' });
  });

  test('game:over en mode debug : relay seul, pas de persistence', async () => {
    const { io, emit } = makeFakeIo();
    const { socket, fire } = makeFakeSocket();
    invoke(io, socket);

    fire('game:over', { player: 'A', finalScore: 100, debug: true });
    await Promise.resolve();

    expect(emit).toHaveBeenCalledWith('game:over', expect.objectContaining({ debug: true }));
    expect(registerScore).not.toHaveBeenCalled();
  });

  test('game:over normal : persiste via registerScore + refresh leaderboard', async () => {
    const { io, emit } = makeFakeIo();
    const { socket, emit: socketEmit, fire } = makeFakeSocket();
    invoke(io, socket);

    registerScore.mockResolvedValue({ code: 'XYZ', claimUrl: 'u' });
    worldTopTen.mockResolvedValue([{ rank: 1, name: 'A', score: 100, date: 'd' }]);

    const data = { player: 'A', finalScore: 100, mapId: 'strangerthings', stats: {} };
    fire('game:over', data);
    // laisse la chaîne de promesses se résoudre
    await new Promise((r) => setTimeout(r, 0));

    expect(emit).toHaveBeenCalledWith('game:over', data);
    expect(registerScore).toHaveBeenCalledWith(data);
    expect(socketEmit).toHaveBeenCalledWith('game:registered', { code: 'XYZ', claimUrl: 'u' });
    expect(worldTopTen).toHaveBeenCalledWith('strangerthings');
    expect(emit).toHaveBeenCalledWith('leaderboard:refresh', [
      { rank: 1, name: 'A', score: 100, date: 'd' },
    ]);
  });

  test('game:over : une erreur de persistence ne bloque pas le relay', async () => {
    const { io, emit } = makeFakeIo();
    const { socket, fire } = makeFakeSocket();
    invoke(io, socket);

    registerScore.mockRejectedValue(new Error('persist KO'));

    const data = { player: 'A', finalScore: 100, mapId: 'strangerthings', stats: {} };
    fire('game:over', data);
    await new Promise((r) => setTimeout(r, 0));

    // le relay a bien eu lieu malgré l'échec de persistence
    expect(emit).toHaveBeenCalledWith('game:over', data);
  });

  test('disconnect : handler enregistré sans crash', () => {
    const { io } = makeFakeIo();
    const { socket, fire } = makeFakeSocket();
    invoke(io, socket);
    expect(() => fire('disconnect')).not.toThrow();
  });
});
