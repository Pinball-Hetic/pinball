import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { BottomOutBall } from './BottomOutBall';
import type { IBallPhysics } from './LaunchBall';
import type { GameEvent } from '../domain/GameEvents';

function makeBall() {
  const physics: IBallPhysics = {
    applyPlungerImpulse: mock(() => {}),
    resetToSpawn: mock(() => {}),
  };
  const events: GameEvent[] = [];
  const emit = mock((e: GameEvent) => {
    events.push(e);
  });
  return { physics, emit, events };
}

describe('BottomOutBall.execute', () => {
  let ball: ReturnType<typeof makeBall>;
  let uc: BottomOutBall;

  beforeEach(() => {
    ball = makeBall();
    uc = new BottomOutBall(ball.physics, ball.emit);
  });

  test('émet BOTTOM_OUT et reset le ball au premier appel', () => {
    uc.execute();
    expect(ball.events).toEqual([{ type: 'BOTTOM_OUT' }]);
    expect(ball.physics.resetToSpawn).toHaveBeenCalledTimes(1);
  });

  test('latch : les appels suivants sont ignorés', () => {
    uc.execute();
    uc.execute();
    uc.execute();
    expect(ball.emit).toHaveBeenCalledTimes(1);
    expect(ball.physics.resetToSpawn).toHaveBeenCalledTimes(1);
  });

  test('resetLatch réarme le use-case', () => {
    uc.execute();
    uc.resetLatch();
    uc.execute();
    expect(ball.emit).toHaveBeenCalledTimes(2);
    expect(ball.physics.resetToSpawn).toHaveBeenCalledTimes(2);
  });

  test('resetLatch avant tout execute n\'émet rien', () => {
    uc.resetLatch();
    expect(ball.emit).not.toHaveBeenCalled();
  });

  test('noteRespawn réarme le latch (filet de sécurité reset de partie)', () => {
    uc.execute();
    uc.noteRespawn();
    uc.execute();
    expect(ball.emit).toHaveBeenCalledTimes(2);
    expect(ball.physics.resetToSpawn).toHaveBeenCalledTimes(2);
  });

  test('noteRespawn seul n\'émet rien (ne fait que réarmer)', () => {
    uc.noteRespawn();
    expect(ball.emit).not.toHaveBeenCalled();
    expect(ball.physics.resetToSpawn).not.toHaveBeenCalled();
  });

  test('émet l\'event AVANT de reset le ball', () => {
    const order: string[] = [];
    const physics: IBallPhysics = {
      applyPlungerImpulse: () => {},
      resetToSpawn: mock(() => order.push('reset')),
    };
    const emit = mock(() => order.push('emit'));
    new BottomOutBall(physics, emit).execute();
    expect(order).toEqual(['emit', 'reset']);
  });
});
