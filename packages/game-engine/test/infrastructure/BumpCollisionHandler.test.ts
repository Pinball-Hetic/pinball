import { test, expect } from 'bun:test';
import { BumpCollisionHandler } from '../../src/infrastructure/BumpCollisionHandler';
import { BUMP_HIT_COOLDOWN_MS, BUMP_EJECT_SCALE } from '../../src/domain/Ball';

// Fake BumpHit: capture the execute(side, scale) calls.
type Call = { side: 'left' | 'right'; scale: number };
function makeBumpHitUC() {
  const calls: Call[] = [];
  return {
    uc: { execute: (side: 'left' | 'right', scale: number) => calls.push({ side, scale }) },
    calls,
  };
}

// Injected clock: driven by the test, no global performance.now stub —
// deterministic and no leak between tests.
function makeClock(start = 1000) {
  const clock = { t: start };
  return { now: () => clock.t, set: (ms: number) => { clock.t = ms; } };
}

// Drain the pendingPhysics queue: the handler defers execution.
function drain(pending: Array<() => void>) {
  for (const fn of pending) fn();
  pending.length = 0;
}

test('canHandle reconnaît bump_left et bump_right uniquement', () => {
  const { uc } = makeBumpHitUC();
  const h = new BumpCollisionHandler([], uc as never, makeClock().now);
  expect(h.canHandle('bump_left')).toBe(true);
  expect(h.canHandle('bump_right')).toBe(true);
  expect(h.canHandle('bumper_0')).toBe(false);
  expect(h.canHandle('slingshot_left')).toBe(false);
});

test('éjecte (push pendingPhysics) sur started + playing, côté correct', () => {
  const { uc, calls } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never, makeClock().now);

  h.handle('bump_left', 'playing', true);
  expect(pending.length).toBe(1);
  drain(pending);
  expect(calls).toEqual([{ side: 'left', scale: BUMP_EJECT_SCALE }]);
});

test('mappe bump_right vers le côté right', () => {
  const { uc, calls } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never, makeClock().now);

  h.handle('bump_right', 'playing', true);
  drain(pending);
  expect(calls).toEqual([{ side: 'right', scale: BUMP_EJECT_SCALE }]);
});

test('no-op si started=false', () => {
  const { uc } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never, makeClock().now);

  h.handle('bump_left', 'playing', false);
  expect(pending.length).toBe(0);
});

test('no-op si gameState != playing', () => {
  const { uc } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never, makeClock().now);

  h.handle('bump_left', 'game_over', true);
  expect(pending.length).toBe(0);
});

test('cooldown : un 2e hit dans la fenêtre est ignoré', () => {
  const clock = makeClock(1000);
  const { uc } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never, clock.now);

  h.handle('bump_left', 'playing', true);
  clock.set(1000 + BUMP_HIT_COOLDOWN_MS - 1);
  h.handle('bump_left', 'playing', true);
  expect(pending.length).toBe(1); // 2e ignoré
});

test('cooldown : un hit après expiration ré-éjecte', () => {
  const clock = makeClock(1000);
  const { uc } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never, clock.now);

  h.handle('bump_left', 'playing', true);
  clock.set(1000 + BUMP_HIT_COOLDOWN_MS);
  h.handle('bump_left', 'playing', true);
  expect(pending.length).toBe(2);
});

test('cooldown indépendant par côté (left vs right)', () => {
  const { uc } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never, makeClock().now);

  h.handle('bump_left', 'playing', true);
  // Same instant: the right side is not on cooldown.
  h.handle('bump_right', 'playing', true);
  expect(pending.length).toBe(2);
});

test('horloge par défaut = performance.now quand non injectée (prod)', () => {
  const { uc, calls } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never); // pas de clock

  h.handle('bump_left', 'playing', true);
  drain(pending);
  expect(calls).toEqual([{ side: 'left', scale: BUMP_EJECT_SCALE }]);
});
