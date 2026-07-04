import { test, expect, mock } from 'bun:test';
import { BumperHit, type IBumperEject } from './BumperHit';
import { SCORE_BUMPER } from '../domain/ScoringConstants';
import type { GameEvent } from '../domain/GameEvents';

function setup() {
  const ejectCalls: { x: number; z: number }[] = [];
  const eject: IBumperEject = {
    applyEjectionForce: (pos) => ejectCalls.push(pos),
  };
  const events: GameEvent[] = [];
  const emit = mock((e: GameEvent) => events.push(e));
  return { ejectCalls, eject, events, emit, hit: new BumperHit(eject, emit) };
}

test('applique la force d ejection à la position du bumper', () => {
  const { ejectCalls, hit } = setup();
  const pos = { x: 0.12, z: -0.34 };
  hit.execute(2, pos);
  expect(ejectCalls).toEqual([pos]);
});

test('émet BUMPER_HIT avec index et score', () => {
  const { events, hit } = setup();
  hit.execute(5, { x: 0, z: 0 });
  expect(events).toEqual([
    { type: 'BUMPER_HIT', bumperIndex: 5, scoreIncrement: SCORE_BUMPER },
  ]);
});

test('ejection appelée avant emit', () => {
  const order: string[] = [];
  const eject: IBumperEject = {
    applyEjectionForce: () => order.push('eject'),
  };
  const hit = new BumperHit(eject, () => order.push('emit'));
  hit.execute(0, { x: 0, z: 0 });
  expect(order).toEqual(['eject', 'emit']);
});

test('propage la position négative telle quelle (pas de clamp)', () => {
  const { ejectCalls, hit } = setup();
  hit.execute(0, { x: -999, z: 999 });
  expect(ejectCalls[0]).toEqual({ x: -999, z: 999 });
});

test('chaque execute déclenche un nouvel évènement', () => {
  const { events, hit } = setup();
  hit.execute(0, { x: 0, z: 0 });
  hit.execute(1, { x: 0, z: 0 });
  expect(events.map((e) => (e.type === 'BUMPER_HIT' ? e.bumperIndex : -1))).toEqual([0, 1]);
});
