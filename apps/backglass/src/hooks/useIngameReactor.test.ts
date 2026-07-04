import {
  test,
  expect,
  describe,
  beforeEach,
  afterEach,
} from 'bun:test';
import { renderHook, act, cleanup } from '@testing-library/react';
import { createRef } from 'react';

// ── Fake socket INJECTED into the hook: captures .on() handlers to trigger
// them by hand, and counts .off() on cleanup. The hook no longer creates its
// own socket (it is lifted into BackglassStage and passed as an argument). ──
type Handler = (...args: unknown[]) => void;

let handlers: Record<string, Handler>;
let offCalls: number;

function emit(event: string, ...args: unknown[]) {
  handlers[event]?.(...args);
}

function makeSocket() {
  return {
    on(event: string, cb: Handler) {
      handlers[event] = cb;
    },
    off(event: string) {
      offCalls += 1;
      delete handlers[event];
    },
  } as unknown as import('@pinball/shared-types/src/socket-client').PinballSocket;
}

// ── RAF loop control: capture the hook's callback and advance it manually
// with deterministic timestamps. ─────────────────────────────────────────────
let rafCallback: FrameRequestCallback | null;
let rafCancelled: boolean;
let nextRafId: number;
const realRaf = globalThis.requestAnimationFrame;
const realCancelRaf = globalThis.cancelAnimationFrame;

// Advances the loop one step to time `t` (ms). The loop re-arms via raf,
// so we pick up the new callback for the next frame.
function frame(t: number) {
  const cb = rafCallback;
  rafCallback = null;
  act(() => {
    cb?.(t);
  });
}

beforeEach(() => {
  handlers = {};
  offCalls = 0;
  rafCallback = null;
  rafCancelled = false;
  nextRafId = 1;

  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafCallback = cb;
    return nextRafId++;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {
    rafCancelled = true;
  }) as typeof cancelAnimationFrame;
});

afterEach(() => {
  cleanup();
  globalThis.requestAnimationFrame = realRaf;
  globalThis.cancelAnimationFrame = realCancelRaf;
});

async function importHook() {
  const mod = await import('./useIngameReactor');
  return mod.useIngameReactor;
}

function makeTarget() {
  // Real happy-dom element: --heat is read via its style.
  const el = document.createElement('div');
  const ref = createRef<HTMLElement | null>();
  (ref as { current: HTMLElement | null }).current = el;
  return { ref, el, socket: makeSocket() };
}

describe('useIngameReactor — listeners', () => {
  test('on() enregistre un listener et retourne un unsubscribe', async () => {
    const useIngameReactor = await importHook();
    const { ref, socket } = makeTarget();
    const { result } = renderHook(() => useIngameReactor(ref, socket));

    const received: unknown[] = [];
    const off = result.current.on((r) => received.push(r));

    act(() => emit('game:start', { player: 'NEO' }));
    expect(received).toEqual([{ kind: 'gameStart', player: 'NEO' }]);

    off();
    act(() => emit('game:start', { player: 'TREY' }));
    // Nothing more after unsubscribing.
    expect(received).toHaveLength(1);
  });

  test('plusieurs listeners reçoivent tous l’événement', async () => {
    const useIngameReactor = await importHook();
    const { ref, socket } = makeTarget();
    const { result } = renderHook(() => useIngameReactor(ref, socket));

    const a: unknown[] = [];
    const b: unknown[] = [];
    result.current.on((r) => a.push(r));
    result.current.on((r) => b.push(r));

    act(() => emit('game:start', { player: 'NEO' }));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

describe('useIngameReactor — events dmd:display', () => {
  test('SCORE en hausse émet hit et augmente le heat', async () => {
    const useIngameReactor = await importHook();
    const { ref, socket } = makeTarget();
    const { result } = renderHook(() => useIngameReactor(ref, socket));

    const received: Array<{ kind: string; intensity?: number }> = [];
    result.current.on((r) => received.push(r as never));

    // First SCORE: prev=null → no hit, just remembers the score.
    act(() => emit('dmd:display', { mode: 'SCORE', score: 1000 }));
    expect(received).toHaveLength(0);
    expect(result.current.getHeat()).toBe(0);

    // Second, higher SCORE: hit emitted, heat rises.
    act(() => emit('dmd:display', { mode: 'SCORE', score: 1500 }));
    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe('hit');
    // delta 500 / 500 = 1 (clamped to 1), heat += 1 * 0.3.
    expect(received[0].intensity).toBe(1);
    expect(result.current.getHeat()).toBeCloseTo(0.3, 5);
  });

  test('intensité clampée entre 0.1 et 1', async () => {
    const useIngameReactor = await importHook();
    const { ref, socket } = makeTarget();
    const { result } = renderHook(() => useIngameReactor(ref, socket));
    const hits: number[] = [];
    result.current.on((r) => {
      if (r.kind === 'hit') hits.push(r.intensity);
    });

    act(() => emit('dmd:display', { mode: 'SCORE', score: 0 }));
    // Tiny delta → clamped low at 0.1.
    act(() => emit('dmd:display', { mode: 'SCORE', score: 10 }));
    expect(hits[0]).toBe(0.1);
    // Big delta → clamped high at 1.
    act(() => emit('dmd:display', { mode: 'SCORE', score: 99999 }));
    expect(hits[1]).toBe(1);
  });

  test('un SCORE non croissant n’émet pas de hit', async () => {
    const useIngameReactor = await importHook();
    const { ref, socket } = makeTarget();
    const { result } = renderHook(() => useIngameReactor(ref, socket));
    const hits: unknown[] = [];
    result.current.on((r) => {
      if (r.kind === 'hit') hits.push(r);
    });

    act(() => emit('dmd:display', { mode: 'SCORE', score: 1000 }));
    act(() => emit('dmd:display', { mode: 'SCORE', score: 1000 })); // equal
    act(() => emit('dmd:display', { mode: 'SCORE', score: 500 })); // lower
    expect(hits).toHaveLength(0);
  });

  test('EVENT / COMBO_FLASH / MULTI_FLASH / LIFE_LOST émettent la bonne réaction', async () => {
    const useIngameReactor = await importHook();
    const { ref, socket } = makeTarget();
    const { result } = renderHook(() => useIngameReactor(ref, socket));
    const received: Array<{ kind: string } & Record<string, unknown>> = [];
    result.current.on((r) => received.push(r as never));

    act(() => emit('dmd:display', { mode: 'EVENT', label: 'BOSS', score: 10 }));
    act(() => emit('dmd:display', { mode: 'COMBO_FLASH', combo: 3, score: 20 }));
    act(() => emit('dmd:display', { mode: 'MULTI_FLASH', multiplier: 2, score: 30 }));
    act(() => emit('dmd:display', { mode: 'LIFE_LOST', livesRemaining: 1 }));

    expect(received).toEqual([
      { kind: 'event', label: 'BOSS' },
      { kind: 'combo', combo: 3 },
      { kind: 'multi', multiplier: 2 },
      { kind: 'lifeLost', livesRemaining: 1 },
    ]);
  });

  test('un mode inconnu (default) n’émet rien', async () => {
    const useIngameReactor = await importHook();
    const { ref, socket } = makeTarget();
    const { result } = renderHook(() => useIngameReactor(ref, socket));
    const received: unknown[] = [];
    result.current.on((r) => received.push(r));

    act(() => emit('dmd:display', { mode: 'INTRO', player: 'NEO' }));
    expect(received).toHaveLength(0);
  });

  test('game:start réinitialise le baseline de score (pas de hit au prochain SCORE)', async () => {
    const useIngameReactor = await importHook();
    const { ref, socket } = makeTarget();
    const { result } = renderHook(() => useIngameReactor(ref, socket));
    const hits: unknown[] = [];
    result.current.on((r) => {
      if (r.kind === 'hit') hits.push(r);
    });

    act(() => emit('dmd:display', { mode: 'SCORE', score: 1000 }));
    act(() => emit('game:start', { player: 'NEO' })); // reset lastScore=null
    // The next SCORE starts from scratch → prev=null → no hit.
    act(() => emit('dmd:display', { mode: 'SCORE', score: 2000 }));
    expect(hits).toHaveLength(0);
  });
});

describe('useIngameReactor — suspension', () => {
  test('setSuspended(true) bloque toute émission', async () => {
    const useIngameReactor = await importHook();
    const { ref, socket } = makeTarget();
    const { result } = renderHook(() => useIngameReactor(ref, socket));
    const received: unknown[] = [];
    result.current.on((r) => received.push(r));

    act(() => result.current.setSuspended(true));
    act(() => emit('game:start', { player: 'NEO' }));
    act(() => emit('dmd:display', { mode: 'EVENT', label: 'X', score: 1 }));
    expect(received).toHaveLength(0);

    act(() => result.current.setSuspended(false));
    act(() => emit('dmd:display', { mode: 'EVENT', label: 'Y', score: 1 }));
    expect(received).toHaveLength(1);
  });

  test('suspendu : un SCORE croissant ne fait pas monter le heat ni n’émet de hit', async () => {
    const useIngameReactor = await importHook();
    const { ref, socket } = makeTarget();
    const { result } = renderHook(() => useIngameReactor(ref, socket));
    const hits: unknown[] = [];
    result.current.on((r) => {
      if (r.kind === 'hit') hits.push(r);
    });

    act(() => emit('dmd:display', { mode: 'SCORE', score: 1000 }));
    act(() => result.current.setSuspended(true));
    act(() => emit('dmd:display', { mode: 'SCORE', score: 5000 }));
    expect(hits).toHaveLength(0);
    expect(result.current.getHeat()).toBe(0);
  });
});

describe('useIngameReactor — boucle heat (RAF)', () => {
  test('écrit --heat sur l’élément cible et décroît avec le temps', async () => {
    const useIngameReactor = await importHook();
    const { ref, el, socket } = makeTarget();
    const { result } = renderHook(() => useIngameReactor(ref, socket));

    // Raise the heat via two SCOREs (delta 500 → +0.3).
    act(() => emit('dmd:display', { mode: 'SCORE', score: 0 }));
    act(() => emit('dmd:display', { mode: 'SCORE', score: 500 }));
    expect(result.current.getHeat()).toBeCloseTo(0.3, 5);

    // First frame: last=null → no decay, writes 0.3.
    frame(0);
    expect(el.style.getPropertyValue('--heat')).toBe('0.3');

    // 1 s later: decay 0.5/s → 0.3 - 0.5 = clamp 0 → writes 0.
    frame(1000);
    expect(result.current.getHeat()).toBe(0);
    expect(el.style.getPropertyValue('--heat')).toBe('0');
  });

  test('heatLock verrouille le heat à 1 à chaque frame', async () => {
    const useIngameReactor = await importHook();
    const { ref, el, socket } = makeTarget();
    const { result } = renderHook(() => useIngameReactor(ref, socket));

    act(() => result.current.setHeatLock(true));
    frame(0);
    expect(result.current.getHeat()).toBe(1);
    expect(el.style.getPropertyValue('--heat')).toBe('1');

    // Even after time passes, stays locked at 1 (no decay).
    frame(5000);
    expect(result.current.getHeat()).toBe(1);
  });

  test('n’écrit --heat que lorsque la valeur arrondie change', async () => {
    const useIngameReactor = await importHook();
    const { ref, el, socket } = makeTarget();
    renderHook(() => useIngameReactor(ref, socket));

    frame(0); // heat 0 → writes "0"
    expect(el.style.getPropertyValue('--heat')).toBe('0');
    // Force a different value then check: the sentinel surviving the next
    // frame proves --heat is not rewritten when rounded heat is unchanged.
    el.style.setProperty('--heat', 'sentinel');
    frame(16); // heat stays 0 (already 0) → rounded unchanged → no rewrite
    expect(el.style.getPropertyValue('--heat')).toBe('sentinel');
  });
});

describe('useIngameReactor — cycle de vie', () => {
  test('au démontage : cancelAnimationFrame + retrait des handlers (pas de disconnect du socket partagé)', async () => {
    const useIngameReactor = await importHook();
    const { ref, socket } = makeTarget();
    const { unmount } = renderHook(() => useIngameReactor(ref, socket));

    unmount();
    expect(rafCancelled).toBe(true);
    // The socket is shared (lifted into BackglassStage): the hook removes its
    // own handlers (game:start + dmd:display) without disconnecting the socket.
    expect(offCalls).toBe(2);
  });
});
