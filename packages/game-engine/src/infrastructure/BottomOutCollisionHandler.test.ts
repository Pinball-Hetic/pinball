import { test, expect } from 'bun:test';
import { BottomOutCollisionHandler } from './BottomOutCollisionHandler';
import type { BottomOutBall } from '../use-cases/BottomOutBall';

function setup() {
  const pending: Array<() => void> = [];
  let resetCount = 0;
  let executeCount = 0;
  const resetDropTargets = () => { resetCount += 1; };
  const bottomOutBallUC = { execute: () => { executeCount += 1; } } as unknown as BottomOutBall;
  const handler = new BottomOutCollisionHandler(pending, resetDropTargets, bottomOutBallUC);
  return {
    handler,
    pending,
    counts: () => ({ resetCount, executeCount }),
  };
}

test('canHandle reconnaît uniquement le rôle bottom_out', () => {
  const { handler } = setup();
  expect(handler.canHandle('bottom_out')).toBe(true);
  expect(handler.canHandle('drain')).toBe(false);
  expect(handler.canHandle('rocket_ramp')).toBe(false);
});

test('handle (started, playing) diffère respawn + reset via pendingPhysics', () => {
  const { handler, pending, counts } = setup();
  handler.handle('bottom_out', 'playing', true);

  expect(pending).toHaveLength(1);
  expect(counts()).toEqual({ resetCount: 0, executeCount: 0 });

  pending[0]();
  expect(counts()).toEqual({ resetCount: 1, executeCount: 1 });
});

test('handle ignore le contact end (started=false)', () => {
  const { handler, pending } = setup();
  handler.handle('bottom_out', 'playing', false);
  expect(pending).toHaveLength(0);
});

test('handle ignore les états non-playing', () => {
  const { handler, pending } = setup();
  handler.handle('bottom_out', 'game_over', true);
  expect(pending).toHaveLength(0);
});
