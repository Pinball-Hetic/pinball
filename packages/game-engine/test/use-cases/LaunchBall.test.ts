import { test, expect, mock } from 'bun:test';
import { LaunchBall, type IBallPhysics } from '../../src/use-cases/LaunchBall';
import { Plunger } from '../../src/domain/Plunger';
import type { GameEvent } from '../../src/domain/GameEvents';

function makeBallPhysics(): IBallPhysics & {
  applyPlungerImpulse: ReturnType<typeof mock>;
  resetToSpawn: ReturnType<typeof mock>;
} {
  return {
    applyPlungerImpulse: mock(() => {}),
    resetToSpawn: mock(() => {}),
  };
}

test('émet BALL_LAUNCHED', () => {
  const events: GameEvent[] = [];
  const ball = makeBallPhysics();
  new LaunchBall(ball, new Plunger(), (e) => events.push(e)).execute();

  expect(events).toEqual([{ type: 'BALL_LAUNCHED' }]);
});

test('applique le facteur par défaut (1) quand non fourni', () => {
  const ball = makeBallPhysics();
  new LaunchBall(ball, new Plunger(), () => {}).execute();

  expect(ball.applyPlungerImpulse).toHaveBeenCalledWith(1);
});

test('propage le facteur fourni à applyPlungerImpulse', () => {
  const ball = makeBallPhysics();
  new LaunchBall(ball, new Plunger(), () => {}).execute(0.42);

  expect(ball.applyPlungerImpulse).toHaveBeenCalledWith(0.42);
});

test('relâche le plongeur en charge (isCharging repasse à false)', () => {
  const ball = makeBallPhysics();
  const plunger = new Plunger();
  plunger.startCharge(1000);
  expect(plunger.getState().isCharging).toBe(true);

  new LaunchBall(ball, plunger, () => {}).execute();

  expect(plunger.getState().isCharging).toBe(false);
  expect(plunger.getState().chargeStartTime).toBeNull();
});

test('ordre des effets : release → impulse → emit', () => {
  const order: string[] = [];
  const plunger = new Plunger();
  const releaseSpy = mock(plunger.release.bind(plunger));
  plunger.release = () => {
    order.push('release');
    return releaseSpy();
  };
  const ball: IBallPhysics = {
    applyPlungerImpulse: () => order.push('impulse'),
    resetToSpawn: () => {},
  };
  new LaunchBall(ball, plunger, () => order.push('emit')).execute();

  expect(order).toEqual(['release', 'impulse', 'emit']);
});

test('un facteur 0 est transmis tel quel (pas de fallback sur falsy)', () => {
  const ball = makeBallPhysics();
  new LaunchBall(ball, new Plunger(), () => {}).execute(0);

  expect(ball.applyPlungerImpulse).toHaveBeenCalledWith(0);
});

test('ne reset jamais la bille au spawn lors du lancement', () => {
  const ball = makeBallPhysics();
  new LaunchBall(ball, new Plunger(), () => {}).execute();

  expect(ball.resetToSpawn).not.toHaveBeenCalled();
});
