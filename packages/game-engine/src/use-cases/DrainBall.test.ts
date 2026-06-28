import { test, expect, mock } from 'bun:test';
import { DrainBall } from './DrainBall';
import type { IBallPhysics } from './LaunchBall';
import type { GameEvent } from '../domain/GameEvents';

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

test('chaque execute() ré-émet et reset (idempotence des appels)', () => {
  const events: GameEvent[] = [];
  const ball = makeBallPhysics();
  const drain = new DrainBall(ball, (e) => events.push(e));
  drain.execute();
  drain.execute();

  expect(events).toHaveLength(2);
  expect(ball.resetToSpawn).toHaveBeenCalledTimes(2);
});
