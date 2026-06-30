import { test, expect, afterEach } from 'bun:test';
import { BumpCollisionHandler } from './BumpCollisionHandler';
import { BUMP_HIT_COOLDOWN_MS, BUMP_EJECT_SCALE } from '../domain/Ball';

// Fake BumpHit : on capture les appels execute(side, scale).
type Call = { side: 'left' | 'right'; scale: number };
function makeBumpHitUC() {
  const calls: Call[] = [];
  return {
    uc: { execute: (side: 'left' | 'right', scale: number) => calls.push({ side, scale }) },
    calls,
  };
}

// performance.now() est appelé inline (pas injecté) → on stub le global pour
// piloter le cooldown de façon déterministe. Restauré après chaque test.
const realNow = performance.now;
let clock = 0;
function setClock(ms: number) {
  clock = ms;
  performance.now = () => clock;
}
afterEach(() => {
  performance.now = realNow;
  clock = 0;
});

// Vide la file pendingPhysics : le handler diffère l'exécution.
function drain(pending: Array<() => void>) {
  for (const fn of pending) fn();
  pending.length = 0;
}

test('canHandle reconnaît bump_left et bump_right uniquement', () => {
  const { uc } = makeBumpHitUC();
  const h = new BumpCollisionHandler([], uc as never);
  expect(h.canHandle('bump_left')).toBe(true);
  expect(h.canHandle('bump_right')).toBe(true);
  expect(h.canHandle('bumper_0')).toBe(false);
  expect(h.canHandle('slingshot_left')).toBe(false);
});

test('éjecte (push pendingPhysics) sur started + playing, côté correct', () => {
  setClock(1000);
  const { uc, calls } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never);

  h.handle('bump_left', 'playing', true);
  expect(pending.length).toBe(1);
  drain(pending);
  expect(calls).toEqual([{ side: 'left', scale: BUMP_EJECT_SCALE }]);
});

test('mappe bump_right vers le côté right', () => {
  setClock(1000);
  const { uc, calls } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never);

  h.handle('bump_right', 'playing', true);
  drain(pending);
  expect(calls).toEqual([{ side: 'right', scale: BUMP_EJECT_SCALE }]);
});

test('no-op si started=false', () => {
  setClock(1000);
  const { uc } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never);

  h.handle('bump_left', 'playing', false);
  expect(pending.length).toBe(0);
});

test('no-op si gameState != playing', () => {
  setClock(1000);
  const { uc } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never);

  h.handle('bump_left', 'game_over', true);
  expect(pending.length).toBe(0);
});

test('cooldown : un 2e hit dans la fenêtre est ignoré', () => {
  setClock(1000);
  const { uc } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never);

  h.handle('bump_left', 'playing', true);
  setClock(1000 + BUMP_HIT_COOLDOWN_MS - 1);
  h.handle('bump_left', 'playing', true);
  expect(pending.length).toBe(1); // 2e ignoré
});

test('cooldown : un hit après expiration ré-éjecte', () => {
  setClock(1000);
  const { uc } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never);

  h.handle('bump_left', 'playing', true);
  setClock(1000 + BUMP_HIT_COOLDOWN_MS);
  h.handle('bump_left', 'playing', true);
  expect(pending.length).toBe(2);
});

test('cooldown indépendant par côté (left vs right)', () => {
  setClock(1000);
  const { uc } = makeBumpHitUC();
  const pending: Array<() => void> = [];
  const h = new BumpCollisionHandler(pending, uc as never);

  h.handle('bump_left', 'playing', true);
  // Même instant : le côté droit n'est pas en cooldown.
  h.handle('bump_right', 'playing', true);
  expect(pending.length).toBe(2);
});
