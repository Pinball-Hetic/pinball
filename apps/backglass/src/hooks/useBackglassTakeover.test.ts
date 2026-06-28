import {
  test,
  expect,
  describe,
  mock,
  beforeEach,
  afterEach,
} from 'bun:test';
import { renderHook, act, cleanup } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { LeaderboardEntry } from '@pinball/shared-types';
import { MapContentProvider, EMPTY_CONTENT } from '@/map/content';
import type { BackglassContent } from '@/map/content';

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

// ── Horloge déterministe : performance.now() pilotée par la variable `clock`. ─
let clock: number;
const realNow = performance.now.bind(performance);

// ── Capture du tick (window.setInterval @ 250 ms du hook). ───────────────────
let tickCallback: (() => void) | null;
let tickHandle: ReturnType<typeof setInterval> | null;
let clearIntervalCalls: number;
const realSetInterval = window.setInterval.bind(window);
const realClearInterval = window.clearInterval.bind(window);

// Avance l'horloge à `t` puis exécute un tick de la machine à états.
function tickAt(t: number) {
  clock = t;
  act(() => {
    tickCallback?.();
  });
}

const ENTRIES: LeaderboardEntry[] = [
  { rank: 1, name: 'NEO', score: 9000, date: '2026-01-01' },
  { rank: 10, name: 'TENTH', score: 1000, date: '2026-01-01' },
];

beforeEach(() => {
  handlers = {};
  disconnectCalls = 0;
  clock = 0;
  tickCallback = null;
  tickHandle = null;
  clearIntervalCalls = 0;
  createPinballSocket.mockClear();

  performance.now = () => clock;

  window.setInterval = ((cb: () => void, delay?: number, ...rest: unknown[]) => {
    if (delay === 250) {
      tickCallback = cb;
      tickHandle = 77_777 as unknown as ReturnType<typeof setInterval>;
      return tickHandle;
    }
    return realSetInterval(cb, delay as number, ...rest);
  }) as typeof window.setInterval;
  window.clearInterval = ((handle?: ReturnType<typeof setInterval>) => {
    if (handle === tickHandle) {
      clearIntervalCalls += 1;
      return;
    }
    return realClearInterval(handle);
  }) as typeof window.clearInterval;
});

afterEach(() => {
  cleanup();
  performance.now = realNow;
  window.setInterval = realSetInterval;
  window.clearInterval = realClearInterval;
});

async function importHook() {
  const mod = await import('./useBackglassTakeover');
  return mod.useBackglassTakeover;
}

// Contenu de map de test : clipBehavior data-driven + clips timings.
function makeContent(over: Partial<BackglassContent> = {}): BackglassContent {
  return {
    ...EMPTY_CONTENT,
    clipBehavior: {},
    eventTakeovers: {},
    clips: {},
    ...over,
  } as BackglassContent;
}

function renderTakeover(
  entries: LeaderboardEntry[] = ENTRIES,
  content: BackglassContent = makeContent(),
) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(MapContentProvider, { value: content }, children);
  return renderHook(() => __hook(entries), { wrapper });
}

// __hook est rempli juste avant chaque renderTakeover (importHook async).
let __hook: Awaited<ReturnType<typeof importHook>>;

beforeEach(async () => {
  __hook = await importHook();
});

describe('useBackglassTakeover — état initial', () => {
  test('état initial neutre, aucun takeover', () => {
    const { result } = renderTakeover();
    expect(result.current.takeover).toBeNull();
    expect(result.current.alternateWorld).toBe(false);
    expect(result.current.fever).toBe(false);
    expect(result.current.goldWaveId).toBe(0);
    expect(result.current.highlightRank).toBeUndefined();
  });

  test('ouvre un socket au montage', () => {
    renderTakeover();
    expect(createPinballSocket).toHaveBeenCalledTimes(1);
  });
});

describe('useBackglassTakeover — game:over', () => {
  test('high score → scène HIGH_SCORE projetée au tick suivant', () => {
    const { result } = renderTakeover();
    // finalScore 5000 > 10e place (1000) → qualifie.
    act(() => emit('game:over', { player: 'NEO', finalScore: 5000 }));
    tickAt(10);
    expect(result.current.takeover?.scene).toBe('HIGH_SCORE');
    // rank : 1 entrée (9000) au-dessus de 5000 → rang 2.
    expect((result.current.takeover?.payload as { rank: number }).rank).toBe(2);
    // Joyce reçoit le nom du joueur.
    expect(result.current.joyce.text).toBe('NEO');
  });

  test('score non qualifiant → scène RECAP + Joyce GAME OVER', () => {
    const { result } = renderTakeover();
    // 500 < 10e place (1000) → ne qualifie pas.
    act(() => emit('game:over', { player: 'BOB', finalScore: 500 }));
    tickAt(10);
    expect(result.current.takeover?.scene).toBe('RECAP');
    expect(result.current.joyce.text).toBe('GAME OVER');
  });

  test('HIGH_SCORE enchaîne sur RECAP puis surbrillance du rang', () => {
    const { result } = renderTakeover();
    act(() => emit('game:over', { player: 'NEO', finalScore: 5000 }));
    tickAt(100);
    expect(result.current.takeover?.scene).toBe('HIGH_SCORE');

    // HIGH_SCORE_MS = 5000 → expire, followUp RECAP poussé.
    tickAt(5_100);
    expect(result.current.takeover?.scene).toBe('RECAP');
    // Le rang reste surligné pendant la fenêtre highlight.
    expect(result.current.highlightRank).toBe(2);
  });
});

describe('useBackglassTakeover — dmd:display CINEMATIC', () => {
  test('clip null en mode CINEMATIC est ignoré (garde kiosk)', () => {
    const { result } = renderTakeover();
    act(() => emit('dmd:display', { mode: 'CINEMATIC', clip: null }));
    tickAt(10);
    expect(result.current.takeover).toBeNull();
  });

  test('clip standard → scène CINEMATIC via clipShowMs par défaut', () => {
    const { result } = renderTakeover();
    act(() => emit('dmd:display', { mode: 'CINEMATIC', clip: 'demogorgon' }));
    tickAt(10);
    expect(result.current.takeover?.scene).toBe('CINEMATIC');
    expect(result.current.takeover?.clip).toBe('demogorgon');
    // Event poussé à clock=0 → expiresAt = 0 + DEFAULT_CLIP_SHOW_MS (4000).
    // Toujours actif juste avant, purgé à l’instant exact d’expiration.
    tickAt(3_999);
    expect(result.current.takeover?.scene).toBe('CINEMATIC');
    tickAt(4_000);
    expect(result.current.takeover).toBeNull();
  });

  test('clipBehavior data-driven : goldWave, fever et joyce', () => {
    const content = makeContent({
      clipBehavior: {
        portal: { goldWave: true, fever: true, joyce: 'HELLO' },
      },
    } as Partial<BackglassContent>);
    const { result } = renderTakeover(ENTRIES, content);

    act(() => emit('dmd:display', { mode: 'CINEMATIC', clip: 'portal' }));
    tickAt(10);
    expect(result.current.goldWaveId).toBe(1);
    expect(result.current.fever).toBe(true);
    expect(result.current.joyce.text).toBe('HELLO');
  });

  test('joyce fonction reçoit la valeur de l’event', () => {
    const content = makeContent({
      clipBehavior: {
        combo: { joyce: (v: unknown) => `x${v}` },
      },
    } as unknown as Partial<BackglassContent>);
    const { result } = renderTakeover(ENTRIES, content);

    act(() => emit('dmd:display', { mode: 'CINEMATIC', clip: 'combo', value: 5 }));
    tickAt(10);
    expect(result.current.joyce.text).toBe('x5');
  });

  test('noTakeover : aucun takeover poussé mais effets appliqués', () => {
    const content = makeContent({
      clipBehavior: {
        silent: { noTakeover: true, fever: true },
      },
    } as Partial<BackglassContent>);
    const { result } = renderTakeover(ENTRIES, content);

    act(() => emit('dmd:display', { mode: 'CINEMATIC', clip: 'silent' }));
    tickAt(10);
    expect(result.current.takeover).toBeNull();
    expect(result.current.fever).toBe(true);
  });

  test('takeoverMs explicite l’emporte sur clipShowMs', () => {
    const content = makeContent({
      clipBehavior: {
        quick: { takeoverMs: 1_000 },
      },
    } as Partial<BackglassContent>);
    const { result } = renderTakeover(ENTRIES, content);

    act(() => emit('dmd:display', { mode: 'CINEMATIC', clip: 'quick' }));
    tickAt(10);
    expect(result.current.takeover?.scene).toBe('CINEMATIC');
    // Expire à 1000, pas à 4000.
    tickAt(1_000);
    expect(result.current.takeover).toBeNull();
  });

  test('hall_of_fame rebranche le dernier game:over comme payload', () => {
    const { result } = renderTakeover();
    act(() => emit('game:over', { player: 'NEO', finalScore: 5000 }));
    act(() => emit('dmd:display', { mode: 'CINEMATIC', clip: 'hall_of_fame' }));
    tickAt(10);
    expect(result.current.takeover?.scene).toBe('CINEMATIC');
    expect(result.current.takeover?.clip).toBe('hall_of_fame');
    expect((result.current.takeover?.payload as { player: string }).player).toBe(
      'NEO',
    );
  });
});

describe('useBackglassTakeover — dmd:display EVENT / flashs', () => {
  test('EVENT mappé → scène MAP_EVENT + joyce', () => {
    const content = makeContent({
      eventTakeovers: {
        BOSS: { priority: 90, durationMs: 2_000, clipKey: 'boss_clip', joyce: 'BOSS!' },
      },
    } as Partial<BackglassContent>);
    const { result } = renderTakeover(ENTRIES, content);

    act(() => emit('dmd:display', { mode: 'EVENT', label: 'BOSS' }));
    tickAt(10);
    expect(result.current.takeover?.scene).toBe('MAP_EVENT');
    expect(result.current.takeover?.clip).toBe('boss_clip');
    expect(result.current.joyce.text).toBe('BOSS!');
  });

  test('EVENT non mappé → pas de takeover mais agitation déclenchée', () => {
    const { result } = renderTakeover();
    act(() => emit('dmd:display', { mode: 'EVENT', label: 'UNKNOWN' }));
    // agitation démarre à clock courant (0) ; tick juste après → > 0.
    tickAt(100);
    expect(result.current.takeover).toBeNull();
    expect(result.current.agitation).toBeGreaterThan(0);
  });

  test('COMBO_FLASH déclenche l’agitation', () => {
    const { result } = renderTakeover();
    clock = 0;
    act(() => emit('dmd:display', { mode: 'COMBO_FLASH' }));
    tickAt(200);
    expect(result.current.agitation).toBeGreaterThan(0);
  });
});

describe('useBackglassTakeover — dmd:display SCORE', () => {
  test('alternateWorld et fever extraits du display', () => {
    const { result } = renderTakeover();
    act(() =>
      emit('dmd:display', {
        mode: 'SCORE',
        score: 1,
        alternateWorld: true,
        mapState: { fever: true },
      }),
    );
    tickAt(10);
    expect(result.current.alternateWorld).toBe(true);
    expect(result.current.fever).toBe(true);
  });
});

describe('useBackglassTakeover — cycle de vie', () => {
  test('au démontage : clearInterval + socket.disconnect', () => {
    const { unmount } = renderTakeover();
    unmount();
    expect(clearIntervalCalls).toBe(1);
    expect(disconnectCalls).toBe(1);
  });
});
