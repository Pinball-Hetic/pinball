import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { DEFAULT_MAP_ID } from '@pinball/shared-types';
import { GameStateManager } from '../../src/infrastructure/GameStateManager';
import type { GameOver, GameRegistered, LeaderboardEntry } from '@pinball/shared-types';
import { createSocketGateway, type IoLike, type SocketLike } from '../../src/interface/socketGateway';

// Injected fakes — no mock.module.
const registerScore = mock((_data: GameOver): Promise<GameRegistered> =>
  Promise.resolve({ code: '', claimUrl: '' }));
const worldTopTen = mock((_mapId?: string): Promise<LeaderboardEntry[]> => Promise.resolve([]));

function makeGateway(gameState = new GameStateManager()) {
  return createSocketGateway({ registerScore, worldTopTen, gameState });
}

beforeEach(() => {
  registerScore.mockReset();
  worldTopTen.mockReset();
  registerScore.mockResolvedValue({ code: '', claimUrl: '' });
  worldTopTen.mockResolvedValue([]);
});

// Minimal fake io + fake socket; capture socket.on(event, cb) handlers.
// Structurally compatible with IoLike / SocketLike → no cast.
type Handler = (...args: unknown[]) => void;

function makeFakeIo() {
  const emit = mock((..._a: unknown[]) => true);
  const toEmit = mock((..._a: unknown[]) => true);
  const to = mock((_room: string) => ({ emit: toEmit }));
  const io: IoLike = { emit, to };
  return { io, emit, to, toEmit };
}

function makeFakeSocket(role?: string) {
  const handlers = new Map<string, Handler>();
  const join = mock((_room: string) => undefined);
  const emit = mock((..._a: unknown[]) => true);
  const on = mock((event: string, cb: Handler) => { handlers.set(event, cb); });
  const socket: SocketLike = {
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

function invoke(gameState?: GameStateManager, role?: string) {
  const handle = makeGateway(gameState);
  const fio = makeFakeIo();
  const fsock = makeFakeSocket(role);
  handle(fio.io, fsock.socket);
  return {
    ioEmit: fio.emit, // io.emit → broadcast to everyone
    to: fio.to,
    toEmit: fio.toEmit,
    socketEmit: fsock.emit, // socket.emit → the sender only
    join: fsock.join,
    fire: fsock.fire,
  };
}

describe('createSocketGateway / handleConnection', () => {
  test("role 'input-bridge' rejoint la room input-bridge", () => {
    const ctx = invoke(undefined, 'input-bridge');
    expect(ctx.join).toHaveBeenCalledWith('input-bridge');
  });

  test('un frontend (sans role) ne rejoint aucune room', () => {
    const ctx = invoke();
    expect(ctx.join).not.toHaveBeenCalled();
  });

  test('émet map:selected (map courante) au nouveau connecté via socket.emit', () => {
    const gs = new GameStateManager();
    gs.setMapId('zelda');
    const ctx = invoke(gs);
    expect(ctx.socketEmit).toHaveBeenCalledWith('map:selected', { mapId: 'zelda' });
  });

  test('démarre sur DEFAULT_MAP_ID', () => {
    const ctx = invoke();
    expect(ctx.socketEmit).toHaveBeenCalledWith('map:selected', { mapId: DEFAULT_MAP_ID });
  });

  test('map:select met à jour la map + broadcast (io.emit) + mute l état', () => {
    const gs = new GameStateManager();
    const ctx = invoke(gs);
    ctx.fire('map:select', { mapId: 'a-new-map-id' });
    expect(ctx.ioEmit).toHaveBeenCalledWith('map:selected', { mapId: 'a-new-map-id' });
    expect(gs.getMapId()).toBe('a-new-map-id');
  });

  test('map:select ignore un mapId non-string', () => {
    const ctx = invoke();
    ctx.fire('map:select', { mapId: 123 });
    expect(ctx.ioEmit).not.toHaveBeenCalled();
  });

  test('map:select ignore un mapId identique à la map courante', () => {
    const gs = new GameStateManager();
    gs.setMapId('zelda');
    const ctx = invoke(gs);
    ctx.fire('map:select', { mapId: 'zelda' });
    expect(ctx.ioEmit).not.toHaveBeenCalled();
  });

  test('dev:simulate-button est routé vers la room input-bridge', () => {
    const ctx = invoke();
    const payload = { id: 'WHITE_LEFT', action: 'DOWN' };
    ctx.fire('dev:simulate-button', payload);
    expect(ctx.to).toHaveBeenCalledWith('input-bridge');
    expect(ctx.toEmit).toHaveBeenCalledWith('dev:simulate-button', payload);
  });

  test('input:button / tilt / sensor relayés via io.emit', () => {
    const ctx = invoke();
    ctx.fire('input:button', { id: 'WHITE_LEFT', action: 'UP' });
    ctx.fire('input:tilt', { state: 'TRIGGERED' });
    ctx.fire('input:sensor', { id: 'PLUNGER', value: 42 });
    expect(ctx.ioEmit).toHaveBeenCalledWith('input:button', { id: 'WHITE_LEFT', action: 'UP' });
    expect(ctx.ioEmit).toHaveBeenCalledWith('input:tilt', { state: 'TRIGGERED' });
    expect(ctx.ioEmit).toHaveBeenCalledWith('input:sensor', { id: 'PLUNGER', value: 42 });
  });

  test('chaque relay event est rediffusé verbatim via io.emit', () => {
    const relays: Array<[string, unknown]> = [
      ['input:button', { id: 'WHITE_LEFT', action: 'DOWN' }],
      ['input:tilt', { state: 'TRIGGERED' }],
      ['input:sensor', { id: 'PLUNGER', value: 7 }],
      ['score:update', { player: 'A', score: 9, combo: 1, multiplier: 1 }],
      ['game:start', { player: 'A' }],
      ['dmd:display', { mode: 'idle' }],
      ['dev:trigger-game-event', { type: 'DRAIN' }],
    ];
    for (const [event, payload] of relays) {
      const ctx = invoke();
      ctx.fire(event, payload);
      expect(ctx.ioEmit).toHaveBeenCalledWith(event, payload);
    }
  });

  test('score:update / game:start / dmd:display / dev:trigger-game-event relayés', () => {
    const ctx = invoke();
    ctx.fire('score:update', { player: 'A', score: 1, combo: 2, multiplier: 3 });
    ctx.fire('game:start', { player: 'A' });
    ctx.fire('dmd:display', { mode: 'idle' });
    ctx.fire('dev:trigger-game-event', { type: 'BUMPER_HIT' });
    expect(ctx.ioEmit).toHaveBeenCalledWith('score:update', { player: 'A', score: 1, combo: 2, multiplier: 3 });
    expect(ctx.ioEmit).toHaveBeenCalledWith('game:start', { player: 'A' });
    expect(ctx.ioEmit).toHaveBeenCalledWith('dmd:display', { mode: 'idle' });
    expect(ctx.ioEmit).toHaveBeenCalledWith('dev:trigger-game-event', { type: 'BUMPER_HIT' });
  });

  test('game:over debug : relay seul, pas de persistence', async () => {
    const ctx = invoke();
    ctx.fire('game:over', { player: 'A', finalScore: 100, debug: true });
    await Promise.resolve();
    expect(ctx.ioEmit).toHaveBeenCalledWith('game:over', expect.objectContaining({ debug: true }));
    expect(registerScore).not.toHaveBeenCalled();
  });

  test('game:over normal : persiste via registerScore + refresh leaderboard', async () => {
    registerScore.mockResolvedValue({ code: 'XYZ', claimUrl: 'u' });
    worldTopTen.mockResolvedValue([{ rank: 1, name: 'A', score: 100, date: 'd' }]);
    const ctx = invoke();
    const data = { player: 'A', finalScore: 100, mapId: 'strangerthings', stats: {} };
    ctx.fire('game:over', data);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.ioEmit).toHaveBeenCalledWith('game:over', data);
    expect(registerScore).toHaveBeenCalledWith(data);
    expect(ctx.socketEmit).toHaveBeenCalledWith('game:registered', { code: 'XYZ', claimUrl: 'u' });
    expect(worldTopTen).toHaveBeenCalledWith('strangerthings');
    expect(ctx.ioEmit).toHaveBeenCalledWith('leaderboard:refresh', [{ rank: 1, name: 'A', score: 100, date: 'd' }]);
  });

  test('game:over : une erreur de persistence ne bloque pas le relay', async () => {
    registerScore.mockRejectedValue(new Error('persist KO'));
    const ctx = invoke();
    const data = { player: 'A', finalScore: 100, mapId: 'strangerthings', stats: {} };
    ctx.fire('game:over', data);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.ioEmit).toHaveBeenCalledWith('game:over', data);
  });

  test('disconnect : handler enregistré sans crash', () => {
    const ctx = invoke();
    expect(() => ctx.fire('disconnect')).not.toThrow();
  });
});
