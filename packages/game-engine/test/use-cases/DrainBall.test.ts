import { test, expect, mock } from 'bun:test';
import { DrainBall } from '../../src/use-cases/DrainBall';
import type { IBallPhysics } from '../../src/use-cases/LaunchBall';
import type { GameEvent } from '../../src/domain/GameEvents';

function makeBallPhysics(): IBallPhysics & { applyPlungerImpulse: ReturnType<typeof mock>; resetToSpawn: ReturnType<typeof mock> } {
  return {
    applyPlungerImpulse: mock(() => {}),
    resetToSpawn: mock(() => {}),
  };
}

test('émet un event DRAIN', () => {
  const events: GameEvent[] = [];
  const ball = makeBallPhysics();
  new DrainBall(ball, (e) => events.push(e)).execute();

  expect(events).toEqual([{ type: 'DRAIN' }]);
});

test('remet la bille au spawn', () => {
  const ball = makeBallPhysics();
  new DrainBall(ball, () => {}).execute();

  expect(ball.resetToSpawn).toHaveBeenCalledTimes(1);
});

test('émet DRAIN avant de reset (ordre des effets)', () => {
  const order: string[] = [];
  const ball: IBallPhysics = {
    applyPlungerImpulse: () => {},
    resetToSpawn: () => order.push('reset'),
  };
  new DrainBall(ball, () => order.push('emit')).execute();

  expect(order).toEqual(['emit', 'reset']);
});

test('ne touche jamais au plongeur (applyPlungerImpulse non appelé)', () => {
  const ball = makeBallPhysics();
  new DrainBall(ball, () => {}).execute();

  expect(ball.applyPlungerImpulse).not.toHaveBeenCalled();
});

test('latch anti-rebond : execute() consécutifs ne déclenchent qu\'un DRAIN', () => {
  const events: GameEvent[] = [];
  const ball = makeBallPhysics();
  const drain = new DrainBall(ball, (e) => events.push(e));
  drain.execute();
  drain.execute();
  drain.execute();

  expect(events).toHaveLength(1);
  expect(events).toEqual([{ type: 'DRAIN' }]);
  expect(ball.resetToSpawn).toHaveBeenCalledTimes(1);
});

test('resetLatch réarme le use-case (bille relancée)', () => {
  const events: GameEvent[] = [];
  const ball = makeBallPhysics();
  const drain = new DrainBall(ball, (e) => events.push(e));
  drain.execute();
  drain.resetLatch();
  drain.execute();

  expect(events).toHaveLength(2);
  expect(ball.resetToSpawn).toHaveBeenCalledTimes(2);
});

test('resetLatch avant tout execute n\'émet rien', () => {
  const events: GameEvent[] = [];
  const ball = makeBallPhysics();
  const drain = new DrainBall(ball, (e) => events.push(e));
  drain.resetLatch();

  expect(events).toHaveLength(0);
  expect(ball.resetToSpawn).not.toHaveBeenCalled();
});
