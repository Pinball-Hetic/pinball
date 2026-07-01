import {
  test,
  expect,
  describe,
  beforeEach,
  afterEach,
} from 'bun:test';
import { renderHook, act, cleanup } from '@testing-library/react';
import { createRef } from 'react';

// ── Faux socket INJECTÉ dans le hook : capture les handlers .on() pour les
// déclencher à la main, et compte les .off() au nettoyage. Le hook ne crée plus
// son propre socket (il est lifté dans BackglassStage et passé en argument). ──
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

// ── Contrôle de la boucle RAF : on capture le callback du hook et on l'avance
// manuellement avec des timestamps déterministes. ───────────────────────────
let rafCallback: FrameRequestCallback | null;
let rafCancelled: boolean;
let nextRafId: number;
const realRaf = globalThis.requestAnimationFrame;
const realCancelRaf = globalThis.cancelAnimationFrame;

// Avance la boucle d'un cran au temps `t` (ms). La boucle se ré-arme via raf,
// on récupère donc le nouveau callback pour le prochain frame.
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
  // Élément réel happy-dom : on lira --heat via son style.
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
    // Plus rien après désabonnement.
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

    // Premier SCORE : prev=null → pas de hit, juste mémorise le score.
    act(() => emit('dmd:display', { mode: 'SCORE', score: 1000 }));
    expect(received).toHaveLength(0);
    expect(result.current.getHeat()).toBe(0);

    // Deuxième SCORE plus haut : hit émis, heat monte.
    act(() => emit('dmd:display', { mode: 'SCORE', score: 1500 }));
    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe('hit');
    // delta 500 / 500 = 1 (clampé à 1), heat += 1 * 0.3.
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
    // Tout petit delta → clamp bas à 0.1.
    act(() => emit('dmd:display', { mode: 'SCORE', score: 10 }));
    expect(hits[0]).toBe(0.1);
    // Gros delta → clamp haut à 1.
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
    act(() => emit('dmd:display', { mode: 'SCORE', score: 1000 })); // égal
    act(() => emit('dmd:display', { mode: 'SCORE', score: 500 })); // baisse
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
    // Le SCORE suivant repart de zéro → prev=null → pas de hit.
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

    // Monte le heat via deux SCORE (delta 500 → +0.3).
    act(() => emit('dmd:display', { mode: 'SCORE', score: 0 }));
    act(() => emit('dmd:display', { mode: 'SCORE', score: 500 }));
    expect(result.current.getHeat()).toBeCloseTo(0.3, 5);

    // Premier frame : last=null → pas de decay, écrit 0.3.
    frame(0);
    expect(el.style.getPropertyValue('--heat')).toBe('0.3');

    // 1 s plus tard : decay 0.5/s → 0.3 - 0.5 = clamp 0 → écrit 0.
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

    // Même après du temps, reste verrouillé à 1 (pas de decay).
    frame(5000);
    expect(result.current.getHeat()).toBe(1);
  });

  test('n’écrit --heat que lorsque la valeur arrondie change', async () => {
    const useIngameReactor = await importHook();
    const { ref, el, socket } = makeTarget();
    renderHook(() => useIngameReactor(ref, socket));

    frame(0); // heat 0 → écrit "0"
    expect(el.style.getPropertyValue('--heat')).toBe('0');
    // Force une valeur différente puis remet : on vérifie juste que setProperty
    // a bien été appelé une 1re fois (idempotence couverte par l’absence d’erreur).
    el.style.setProperty('--heat', 'sentinel');
    frame(16); // heat reste 0 (déjà à 0) → rounded inchangé → pas de ré-écriture
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
    // Le socket est partagé (lifté dans BackglassStage) : le hook retire ses
    // propres handlers (game:start + dmd:display) sans déconnecter le socket.
    expect(offCalls).toBe(2);
  });
});
