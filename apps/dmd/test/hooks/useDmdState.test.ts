import {
  test,
  expect,
  describe,
  mock,
  beforeEach,
  afterEach,
} from 'bun:test';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { DmdDisplay } from '@pinball/shared-types';

// ── Fake socket: captures handlers registered via .on() so they can be
// triggered manually to observe the effect on the hook's state. ────────────────
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

beforeEach(() => {
  handlers = {};
  disconnectCalls = 0;
  createPinballSocket.mockClear();
});

afterEach(() => {
  cleanup();
});

async function importHook() {
  const mod = await import('../../src/hooks/useDmdState');
  return mod.useDmdState;
}

describe('useDmdState — état initial', () => {
  test('démarre en mode INTRO, déconnecté, sur la map par défaut', async () => {
    const useDmdState = await importHook();
    const { result } = renderHook(() => useDmdState());

    expect(result.current.display.mode).toBe('INTRO');
    expect(result.current.connected).toBe(false);
    expect(result.current.mapId).toBe('strangerthings');
    expect(result.current.alternateWorld).toBe(false);
  });

  test('ouvre exactement une connexion socket', async () => {
    const useDmdState = await importHook();
    renderHook(() => useDmdState());
    expect(createPinballSocket).toHaveBeenCalledTimes(1);
  });
});

describe('useDmdState — events socket', () => {
  test('connect / disconnect bascule le flag connected', async () => {
    const useDmdState = await importHook();
    const { result } = renderHook(() => useDmdState());

    act(() => emit('connect'));
    expect(result.current.connected).toBe(true);

    act(() => emit('disconnect'));
    expect(result.current.connected).toBe(false);
  });

  test('dmd:display remplace le display courant', async () => {
    const useDmdState = await importHook();
    const { result } = renderHook(() => useDmdState());

    const score: DmdDisplay = {
      mode: 'SCORE',
      player: 'NEO',
      score: 4200,
      combo: 0,
      multiplier: 1,
      lives: 3,
      counters: {},
      alternateWorld: true,
    } as unknown as DmdDisplay;

    act(() => emit('dmd:display', score));
    expect(result.current.display).toEqual(score);
  });

  test('alternateWorld est dérivé du dernier display reçu', async () => {
    const useDmdState = await importHook();
    const { result } = renderHook(() => useDmdState());

    expect(result.current.alternateWorld).toBe(false);

    act(() =>
      emit('dmd:display', {
        mode: 'INTRO',
        player: '—',
        alternateWorld: true,
      } as DmdDisplay),
    );
    expect(result.current.alternateWorld).toBe(true);

    act(() =>
      emit('dmd:display', {
        mode: 'INTRO',
        player: '—',
        alternateWorld: false,
      } as DmdDisplay),
    );
    expect(result.current.alternateWorld).toBe(false);
  });

  test('map:selected met à jour mapId (NEXT_PUBLIC_MAP_ID non forcé)', async () => {
    const useDmdState = await importHook();
    const { result } = renderHook(() => useDmdState());

    act(() => emit('map:selected', { mapId: 'zelda' }));
    expect(result.current.mapId).toBe('zelda');
  });
});

describe('useDmdState — cycle de vie', () => {
  test('déconnecte le socket au démontage', async () => {
    const useDmdState = await importHook();
    const { unmount } = renderHook(() => useDmdState());

    expect(disconnectCalls).toBe(0);
    unmount();
    expect(disconnectCalls).toBe(1);
  });
});
