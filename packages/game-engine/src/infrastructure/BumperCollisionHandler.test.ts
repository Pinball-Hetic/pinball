import { test, expect } from 'bun:test';
import { BumperCollisionHandler } from './BumperCollisionHandler';
import type { MapLayout } from '../domain/MapLayout';

type Call = { idx: number; pos: { x: number; z: number } };
function makeBumperHitUC() {
  const calls: Call[] = [];
  return {
    uc: { execute: (idx: number, pos: { x: number; z: number }) => calls.push({ idx, pos }) },
    calls,
  };
}

// Minimal layout: only the bumper positions are read.
function makeLayout(bumpers: Array<{ x: number; z: number }>): MapLayout {
  return { bumpers } as unknown as MapLayout;
}

function drain(pending: Array<() => void>) {
  for (const fn of pending) fn();
  pending.length = 0;
}

test('canHandle matche les rôles préfixés bumper_', () => {
  const { uc } = makeBumperHitUC();
  const h = new BumperCollisionHandler([], uc as never, makeLayout([]));
  expect(h.canHandle('bumper_0')).toBe(true);
  expect(h.canHandle('bumper_12')).toBe(true);
  expect(h.canHandle('bump_left')).toBe(false);
  expect(h.canHandle('slingshot_left')).toBe(false);
});

test('exécute le use-case avec idx parsé + position du layout', () => {
  const pos0 = { x: 0.1, z: -0.2 };
  const pos1 = { x: -0.3, z: 0.05 };
  const { uc, calls } = makeBumperHitUC();
  const pending: Array<() => void> = [];
  const h = new BumperCollisionHandler(pending, uc as never, makeLayout([pos0, pos1]));

  h.handle('bumper_1', 'playing', true);
  expect(pending.length).toBe(1);
  drain(pending);
  expect(calls).toEqual([{ idx: 1, pos: pos1 }]);
});

test('no-op si started=false', () => {
  const { uc } = makeBumperHitUC();
  const pending: Array<() => void> = [];
  const h = new BumperCollisionHandler(pending, uc as never, makeLayout([{ x: 0, z: 0 }]));

  h.handle('bumper_0', 'playing', false);
  expect(pending.length).toBe(0);
});

test('no-op si aucune position de bumper pour cet index', () => {
  const { uc } = makeBumperHitUC();
  const pending: Array<() => void> = [];
  const h = new BumperCollisionHandler(pending, uc as never, makeLayout([{ x: 0, z: 0 }]));

  h.handle('bumper_5', 'playing', true); // idx 5 missing from layout
  expect(pending.length).toBe(0);
});

test('no-op si gameState != playing (régression : garde game_over/idle)', () => {
  // Regression: without the gameState === 'playing' guard, bumpers still
  // ejected and emitted during game_over/idle. The use-case must NOT be
  // scheduled outside playing.
  const { uc, calls } = makeBumperHitUC();
  const pending: Array<() => void> = [];
  const h = new BumperCollisionHandler(pending, uc as never, makeLayout([{ x: 0, z: 0 }]));

  h.handle('bumper_0', 'game_over', true);
  h.handle('bumper_0', 'idle', true);
  expect(pending.length).toBe(0);

  // Sanity: in 'playing' the use-case is scheduled.
  h.handle('bumper_0', 'playing', true);
  drain(pending);
  expect(calls).toEqual([{ idx: 0, pos: { x: 0, z: 0 } }]);
});
