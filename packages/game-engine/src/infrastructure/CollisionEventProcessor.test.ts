import { test, expect, mock } from 'bun:test';
import { CollisionEventProcessor } from './CollisionEventProcessor';
import type { MapLayout } from '../domain/MapLayout';
import type { BumperHit } from '../use-cases/BumperHit';
import type { BumpHit } from '../use-cases/BumpHit';
import type { DrainBall } from '../use-cases/DrainBall';
import type { BottomOutBall } from '../use-cases/BottomOutBall';

// Minimal fakes — only the fields the processor touches.
function makeLayout(): MapLayout {
  return {
    bosses: [],
    dropTargets: [],
    bumpers: [{ x: 0, y: 1, z: 0 }],
  } as unknown as MapLayout;
}

// Fake Rapier EventQueue that replays one collision (h1 = ball collider handle,
// h2 = the role collider handle) through drainCollisionEvents.
function queueFor(roleHandle: number) {
  return {
    drainCollisionEvents: (cb: (h1: number, h2: number, started: boolean) => void) => {
      cb(0, roleHandle, true);
    },
  } as never;
}

function makeProcessor() {
  const bumperExec = mock((..._a: unknown[]) => undefined);
  const bottomOutExec = mock((..._a: unknown[]) => undefined);
  const colliderMap = new Map<number, string>([
    [1, 'bumper_0'],
    [2, 'bottom_out'],
  ]);
  const cep = new CollisionEventProcessor(
    makeLayout(),
    colliderMap,
    { execute: bumperExec } as unknown as BumperHit,
    { execute: mock() } as unknown as BumpHit,
    { execute: mock() } as unknown as DrainBall,
    { execute: bottomOutExec } as unknown as BottomOutBall,
    mock((..._a: unknown[]) => undefined),
  );
  return { cep, bumperExec, bottomOutExec };
}

// Regression guard for the pendingPhysics ref-detachment bug: handlers capture
// the pendingPhysics array at construction; flushPendingPhysics must empty it
// IN PLACE (splice), never reassign — otherwise every deferred physics call
// after the first flush silently stops (bumpers mute, drain/game-over never fire).
test('deferred physics still runs on the 2nd flush cycle (bumper)', () => {
  const { cep, bumperExec } = makeProcessor();

  cep.process(queueFor(1), 'playing');
  cep.flushPendingPhysics();
  expect(bumperExec).toHaveBeenCalledTimes(1);

  // 2nd cycle — with the reassignment bug this never executes.
  cep.process(queueFor(1), 'playing');
  cep.flushPendingPhysics();
  expect(bumperExec).toHaveBeenCalledTimes(2);
});

test('bumper collision during game_over does not run the use-case (régression)', () => {
  // Régression : le handler bumper manquait la garde gameState === 'playing',
  // donc les bumpers éjectaient/scoraient pendant game_over/idle.
  const { cep, bumperExec } = makeProcessor();

  cep.process(queueFor(1), 'game_over');
  cep.flushPendingPhysics();
  expect(bumperExec).toHaveBeenCalledTimes(0);
});

test('bottom_out still drains on a later flush cycle (game-over path)', () => {
  const { cep, bottomOutExec } = makeProcessor();

  // Warm up one flush cycle with a bumper so pendingPhysics has been flushed once.
  cep.process(queueFor(1), 'playing');
  cep.flushPendingPhysics();

  // Now the ball drains — must still execute BottomOutBall.
  cep.process(queueFor(2), 'playing');
  cep.flushPendingPhysics();
  expect(bottomOutExec).toHaveBeenCalledTimes(1);
});
