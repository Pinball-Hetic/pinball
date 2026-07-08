import { test, expect } from 'bun:test';
import { BumpHit, type IBumpEject } from '../../src/use-cases/BumpHit';
import { SCORE_BUMP } from '../../src/domain/ScoringConstants';
import type { GameEvent } from '../../src/domain/GameEvents';

function setup() {
  const ejectCalls: { scale: number; side: 'left' | 'right' }[] = [];
  const eject: IBumpEject = {
    applyScaledEjectionForce: (scale, side) => ejectCalls.push({ scale, side }),
  };
  const events: GameEvent[] = [];
  const emit = (e: GameEvent) => events.push(e);
  return { ejectCalls, eject, events, emit, hit: new BumpHit(eject, emit) };
}

test('applique la force échelonnée avec scale et côté', () => {
  const { ejectCalls, hit } = setup();
  hit.execute('left', 0.75);
  expect(ejectCalls).toEqual([{ scale: 0.75, side: 'left' }]);
});

test('émet BUMP_HIT avec côté et score', () => {
  const { events, hit } = setup();
  hit.execute('right', 1);
  expect(events).toEqual([
    { type: 'BUMP_HIT', side: 'right', scoreIncrement: SCORE_BUMP },
  ]);
});

test('le côté droit est propagé sans altération', () => {
  const { ejectCalls, events, hit } = setup();
  hit.execute('right', 0.5);
  expect(ejectCalls[0].side).toBe('right');
  expect(events[0].type === 'BUMP_HIT' && events[0].side).toBe('right');
});

test('ejection appelée avant emit', () => {
  const order: string[] = [];
  const eject: IBumpEject = {
    applyScaledEjectionForce: () => order.push('eject'),
  };
  const hit = new BumpHit(eject, () => order.push('emit'));
  hit.execute('left', 1);
  expect(order).toEqual(['eject', 'emit']);
});

test('propage un scale 0 (bord) sans le filtrer', () => {
  const { ejectCalls, hit } = setup();
  hit.execute('left', 0);
  expect(ejectCalls[0].scale).toBe(0);
});

test('score constant indépendant du scale', () => {
  const { events, hit } = setup();
  hit.execute('left', 2.5);
  expect(events[0].type === 'BUMP_HIT' && events[0].scoreIncrement).toBe(SCORE_BUMP);
});
