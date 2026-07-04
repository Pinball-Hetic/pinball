import { test, expect, describe } from 'bun:test';
import { TakeoverStack } from './takeoverStack';
import type { StackEntry, TakeoverTickDeps } from './takeoverStack';

// Neutral default deps: no side effects, no hold.
function makeDeps(over: Partial<TakeoverTickDeps> = {}): TakeoverTickDeps {
  return {
    holdsHallFlip: () => false,
    attractJoyceName: () => null,
    onJoyce: () => {},
    ...over,
  };
}

function entry(over: Partial<StackEntry> = {}): StackEntry {
  return {
    scene: 'RECAP',
    priority: 50,
    expiresAt: Number.POSITIVE_INFINITY,
    ...over,
  };
}

const HIGHLIGHT_MS = 4_000;
const ATTRACT_IDLE_MS = 60_000;
const JOYCE_IDLE_MS = 90_000;

describe('TakeoverStack — priorité (top)', () => {
  test('renvoie top=null sur une pile vide (et pas d’attract si actif)', () => {
    const s = new TakeoverStack();
    s.start(0);
    const r = s.tick(0, makeDeps());
    expect(r.top).toBeNull();
    expect(r.highlightRank).toBeUndefined();
    expect(r.holdHallFlip).toBe(false);
  });

  test('choisit la scène de plus haute priorité', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(entry({ scene: 'RECAP', priority: 50 }));
    s.push(entry({ scene: 'MAP_EVENT', priority: 90 }));
    s.push(entry({ scene: 'HIGH_SCORE', priority: 70 }));
    const r = s.tick(100, makeDeps());
    expect(r.top?.scene).toBe('MAP_EVENT');
    expect(r.top?.priority).toBe(90);
  });

  test('en cas d’égalité de priorité, garde le premier rencontré (best gagne)', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(entry({ scene: 'RECAP', priority: 80 }));
    s.push(entry({ scene: 'MAP_EVENT', priority: 80 }));
    const r = s.tick(0, makeDeps());
    // strict `>` → the first one stays best.
    expect(r.top?.scene).toBe('RECAP');
  });
});

describe('TakeoverStack — purge / expiration', () => {
  test('purge les scènes expirées (expiresAt <= now)', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(entry({ scene: 'RECAP', priority: 50, expiresAt: 100 }));
    expect(s.tick(99, makeDeps()).top?.scene).toBe('RECAP');
    // At the exact expiration instant, the scene disappears.
    expect(s.tick(100, makeDeps()).top).toBeNull();
  });

  test('une scène à expiresAt Infinity ne se purge jamais', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(entry({ scene: 'MAP_EVENT', priority: 50 }));
    expect(s.tick(1_000_000, makeDeps()).top?.scene).toBe('MAP_EVENT');
  });
});

describe('TakeoverStack — followUp (chaînage)', () => {
  test('pousse la scène suivante à l’expiration, durée démarrant à now', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(
      entry({
        scene: 'HIGH_SCORE',
        priority: 90,
        expiresAt: 100,
        followUp: { scene: 'RECAP', durationMs: 500, priority: 60 },
      }),
    );
    // Before expiration: HIGH_SCORE active.
    expect(s.tick(50, makeDeps()).top?.scene).toBe('HIGH_SCORE');
    // On expiration: RECAP pushed, priority 60, expires at now+500.
    const r = s.tick(100, makeDeps());
    expect(r.top?.scene).toBe('RECAP');
    expect(r.top?.priority).toBe(60);
    expect(r.top?.expiresAt).toBe(600);
    // RECAP survives until 600.
    expect(s.tick(599, makeDeps()).top?.scene).toBe('RECAP');
    expect(s.tick(600, makeDeps()).top).toBeNull();
  });

  test('followUp sans priorité explicite utilise 80 par défaut', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(
      entry({
        scene: 'MAP_EVENT',
        priority: 50,
        expiresAt: 10,
        followUp: { scene: 'RECAP', durationMs: 100 },
      }),
    );
    const r = s.tick(10, makeDeps());
    expect(r.top?.scene).toBe('RECAP');
    expect(r.top?.priority).toBe(80);
  });

  test('propage le payload du followUp', () => {
    const s = new TakeoverStack();
    s.start(0);
    const payload = { rank: 3 } as StackEntry['payload'];
    s.push(
      entry({
        scene: 'MAP_EVENT',
        expiresAt: 10,
        followUp: { scene: 'RECAP', durationMs: 100, payload },
      }),
    );
    const r = s.tick(10, makeDeps());
    expect(r.top?.payload).toBe(payload);
  });

  test('une scène sans followUp n’enchaîne rien', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(entry({ scene: 'RECAP', expiresAt: 10 }));
    expect(s.tick(10, makeDeps()).top).toBeNull();
  });
});

describe('TakeoverStack — surbrillance high-score', () => {
  test('un HIGH_SCORE expiré active la surbrillance du rank pendant HIGHLIGHT_MS', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(
      entry({
        scene: 'HIGH_SCORE',
        priority: 90,
        expiresAt: 100,
        payload: { rank: 2 } as StackEntry['payload'],
      }),
    );
    const r = s.tick(100, makeDeps());
    expect(r.highlightRank).toBe(2);
    // Survives until now + HIGHLIGHT_MS.
    expect(s.tick(100 + HIGHLIGHT_MS, makeDeps()).highlightRank).toBe(2);
    // Beyond that, the highlight turns off (now > highlightUntil).
    expect(s.tick(100 + HIGHLIGHT_MS + 1, makeDeps()).highlightRank).toBeUndefined();
  });

  test('un followUp prolonge la surbrillance de sa durée', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(
      entry({
        scene: 'HIGH_SCORE',
        priority: 90,
        expiresAt: 100,
        payload: { rank: 1 } as StackEntry['payload'],
        followUp: { scene: 'RECAP', durationMs: 2_000 },
      }),
    );
    s.tick(100, makeDeps());
    // highlightUntil = 100 + 2000 + 4000 = 6100.
    expect(s.tick(6_100, makeDeps()).highlightRank).toBe(1);
    expect(s.tick(6_101, makeDeps()).highlightRank).toBeUndefined();
  });

  test('un HIGH_SCORE expiré sans payload n’active pas de surbrillance', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(entry({ scene: 'HIGH_SCORE', priority: 90, expiresAt: 50 }));
    expect(s.tick(50, makeDeps()).highlightRank).toBeUndefined();
  });
});

describe('TakeoverStack — attract mode', () => {
  test('déclenche ATTRACT après ATTRACT_IDLE_MS d’inactivité, pile vide', () => {
    const s = new TakeoverStack();
    s.start(0);
    // Just before the threshold: no attract.
    expect(s.tick(ATTRACT_IDLE_MS, makeDeps()).top).toBeNull();
    // Strictly above the threshold: attract pushed.
    const r = s.tick(ATTRACT_IDLE_MS + 1, makeDeps());
    expect(r.top?.scene).toBe('ATTRACT');
    expect(r.top?.priority).toBe(10);
  });

  test('markActivity repousse l’attract mode', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.markActivity(ATTRACT_IDLE_MS);
    // Idleness is measured since markActivity.
    expect(s.tick(ATTRACT_IDLE_MS + ATTRACT_IDLE_MS, makeDeps()).top).toBeNull();
    expect(
      s.tick(ATTRACT_IDLE_MS + ATTRACT_IDLE_MS + 1, makeDeps()).top?.scene,
    ).toBe('ATTRACT');
  });

  test('une vraie scène empêche l’attract et l’attract ancien est purgé', () => {
    const s = new TakeoverStack();
    s.start(0);
    // First idle tick → attract.
    expect(s.tick(ATTRACT_IDLE_MS + 1, makeDeps()).top?.scene).toBe('ATTRACT');
    // A real scene arrives: the attract is removed, the real scene wins.
    s.push(entry({ scene: 'RECAP', priority: 50 }));
    const r = s.tick(ATTRACT_IDLE_MS + 2, makeDeps());
    expect(r.top?.scene).toBe('RECAP');
  });

  test('émet le pseudo Joyce après JOYCE_IDLE_MS quand un nom existe', () => {
    const s = new TakeoverStack();
    s.start(0);
    const calls: string[] = [];
    const deps = makeDeps({
      attractJoyceName: () => 'NEO',
      onJoyce: (t) => calls.push(t),
    });
    // Before JOYCE_IDLE_MS: attract but no Joyce.
    s.tick(ATTRACT_IDLE_MS + 1, deps);
    expect(calls).toEqual([]);
    // Beyond JOYCE_IDLE_MS: Joyce emitted once.
    s.tick(JOYCE_IDLE_MS + 1, deps);
    expect(calls).toEqual(['NEO']);
  });

  test('n’émet pas de Joyce si attractJoyceName renvoie null', () => {
    const s = new TakeoverStack();
    s.start(0);
    const calls: string[] = [];
    const deps = makeDeps({
      attractJoyceName: () => null,
      onJoyce: (t) => calls.push(t),
    });
    s.tick(JOYCE_IDLE_MS + 1, deps);
    expect(calls).toEqual([]);
  });

  test('ne ré-émet pas Joyce avant le prochain intervalle JOYCE_IDLE_MS', () => {
    const s = new TakeoverStack();
    s.start(0);
    const calls: string[] = [];
    const deps = makeDeps({
      attractJoyceName: () => 'NEO',
      onJoyce: (t) => calls.push(t),
    });
    s.tick(JOYCE_IDLE_MS + 1, deps); // emits
    s.tick(JOYCE_IDLE_MS + 100, deps); // too soon since lastJoyceIdle
    expect(calls).toEqual(['NEO']);
    // Another full interval later → re-emits.
    s.tick(JOYCE_IDLE_MS + 1 + JOYCE_IDLE_MS + 1, deps);
    expect(calls).toEqual(['NEO', 'NEO']);
  });
});

describe('TakeoverStack — holdHallFlip', () => {
  test('vrai si une CINEMATIC a un clip que holdsHallFlip retient', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(entry({ scene: 'CINEMATIC', priority: 95, clip: 'portal_swallow' }));
    const deps = makeDeps({ holdsHallFlip: (c) => c === 'portal_swallow' });
    expect(s.tick(0, deps).holdHallFlip).toBe(true);
  });

  test('faux si le clip n’est pas retenu', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(entry({ scene: 'CINEMATIC', priority: 95, clip: 'autre' }));
    const deps = makeDeps({ holdsHallFlip: () => false });
    expect(s.tick(0, deps).holdHallFlip).toBe(false);
  });

  test('faux pour une CINEMATIC sans clip', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(entry({ scene: 'CINEMATIC', priority: 95 }));
    const deps = makeDeps({ holdsHallFlip: () => true });
    expect(s.tick(0, deps).holdHallFlip).toBe(false);
  });

  test('faux pour un clip présent sur une scène non-CINEMATIC', () => {
    const s = new TakeoverStack();
    s.start(0);
    s.push(entry({ scene: 'MAP_EVENT', priority: 95, clip: 'portal_swallow' }));
    const deps = makeDeps({ holdsHallFlip: () => true });
    expect(s.tick(0, deps).holdHallFlip).toBe(false);
  });
});
