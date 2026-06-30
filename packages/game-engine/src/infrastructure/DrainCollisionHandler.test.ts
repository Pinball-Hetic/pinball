import { test, expect } from 'bun:test';
import { DrainCollisionHandler } from './DrainCollisionHandler';
import type { DrainBall } from '../use-cases/DrainBall';

function setup() {
  const pending: Array<() => void> = [];
  let resetCount = 0;
  let executeCount = 0;
  const resetDropTargets = () => { resetCount += 1; };
  const drainBallUC = { execute: () => { executeCount += 1; } } as unknown as DrainBall;
  const handler = new DrainCollisionHandler(pending, resetDropTargets, drainBallUC);
  return {
    handler,
    pending,
    counts: () => ({ resetCount, executeCount }),
  };
}

test('canHandle reconnaît uniquement le rôle drain', () => {
  const { handler } = setup();
  expect(handler.canHandle('drain')).toBe(true);
  expect(handler.canHandle('bottom_out')).toBe(false);
  expect(handler.canHandle('pop_zone_0')).toBe(false);
});

test('handle (started, playing) diffère drain + reset via pendingPhysics', () => {
  const { handler, pending, counts } = setup();
  handler.handle('drain', 'playing', true);

  // Rien n'est exécuté avant le flush (mutation Rapier interdite mid-step).
  expect(pending).toHaveLength(1);
  expect(counts()).toEqual({ resetCount: 0, executeCount: 0 });

  pending[0]();
  expect(counts()).toEqual({ resetCount: 1, executeCount: 1 });
});

test('handle ignore le contact end (started=false)', () => {
  const { handler, pending } = setup();
  handler.handle('drain', 'playing', false);
  expect(pending).toHaveLength(0);
});

test('handle ignore les états non-playing', () => {
  const { handler, pending } = setup();
  handler.handle('drain', 'game_over', true);
  handler.handle('drain', 'idle', true);
  expect(pending).toHaveLength(0);
});
