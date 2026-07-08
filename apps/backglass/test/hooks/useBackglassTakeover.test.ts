import {
  test,
  expect,
  describe,
  beforeEach,
  afterEach,
} from 'bun:test';
import { renderHook, act, cleanup } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import type { LeaderboardEntry } from '@pinball/shared-types';
import type { PinballSocket } from '@pinball/shared-types/src/socket-client';
import { MapContentProvider, EMPTY_CONTENT } from '@/map/content';
import type { BackglassContent } from '@/map/content';

// ── Fake socket INJECTED into the hook: captures .on() handlers to fire them
// manually, counts .off() on cleanup. The hook no longer creates its own socket
// (it is lifted in BackglassStage and passed as an argument). ──
type Handler = (...args: unknown[]) => void;

let handlers: Record<string, Handler>;
let offCalls: number;

function emit(event: string, ...args: unknown[]) {
  handlers[event]?.(...args);
}

function makeSocket(): PinballSocket {
  return {
    on(event: string, cb: Handler) {
      handlers[event] = cb;
    },
    off(event: string) {
      offCalls += 1;
      delete handlers[event];
    },
  } as unknown as PinballSocket;
}

// ── Deterministic clock: performance.now() driven by the `clock` variable. ───
let clock: number;
const realNow = performance.now.bind(performance);

// ── Capture the tick (the hook's window.setInterval @ 250 ms). ───────────────
let tickCallback: (() => void) | null;
let tickHandle: ReturnType<typeof setInterval> | null;
let clearIntervalCalls: number;
const realSetInterval = window.setInterval.bind(window);
const realClearInterval = window.clearInterval.bind(window);

// Advances the clock to `t` then runs one state-machine tick.
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
  offCalls = 0;
  clock = 0;
  tickCallback = null;
  tickHandle = null;
  clearIntervalCalls = 0;

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
  const mod = await import('../../src/hooks/useBackglassTakeover');
  return mod.useBackglassTakeover;
}

// Test map content: data-driven clipBehavior + clip timings.
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
  const socket = makeSocket();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(MapContentProvider, { value: content }, children);
  return renderHook(() => __hook(entries, socket), { wrapper });
}

// __hook is filled just before each renderTakeover (async importHook).
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

  test('enregistre ses handlers sur le socket injecté au montage', () => {
    renderTakeover();
    expect(typeof handlers['game:over']).toBe('function');
    expect(typeof handlers['dmd:display']).toBe('function');
  });
});

describe('useBackglassTakeover — game:over', () => {
  test('high score → scène HIGH_SCORE projetée au tick suivant', () => {
    const { result } = renderTakeover();
    // finalScore 5000 > 10th place (1000) → qualifies.
    act(() => emit('game:over', { player: 'NEO', finalScore: 5000 }));
    tickAt(10);
    expect(result.current.takeover?.scene).toBe('HIGH_SCORE');
    // rank: 1 entry (9000) above 5000 → rank 2.
    expect((result.current.takeover?.payload as { rank: number }).rank).toBe(2);
    // Joyce receives the player name.
    expect(result.current.joyce.text).toBe('NEO');
  });

  test('score non qualifiant → scène RECAP + Joyce GAME OVER', () => {
    const { result } = renderTakeover();
    // 500 < 10th place (1000) → does not qualify.
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

    // HIGH_SCORE_MS = 5000 → expires, RECAP followUp pushed.
    tickAt(5_100);
    expect(result.current.takeover?.scene).toBe('RECAP');
    // The rank stays highlighted during the highlight window.
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
    // Event pushed at clock=0 → expiresAt = 0 + DEFAULT_CLIP_SHOW_MS (4000).
    // Still active just before, purged at the exact expiry instant.
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
    // Expires at 1000, not at 4000.
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
    // agitation starts at current clock (0); tick just after → > 0.
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
  test('au démontage : clearInterval + retrait des handlers (pas de disconnect du socket partagé)', () => {
    const { unmount } = renderTakeover();
    unmount();
    expect(clearIntervalCalls).toBe(1);
    // Shared socket (lifted in BackglassStage): the hook removes its 4 handlers
    // (game:start, score:update, game:over, dmd:display) without disconnecting it.
    expect(offCalls).toBe(4);
  });
});
