import { test, expect } from 'bun:test';
import { PopZoneCollisionHandler } from '../../src/infrastructure/PopZoneCollisionHandler';
import { SCORE_POP_ZONE } from '../../src/domain/ScoringConstants';
import type { GameEvent } from '../../src/domain/GameEvents';

function setup() {
  const events: GameEvent[] = [];
  const handler = new PopZoneCollisionHandler((e) => events.push(e));
  return { handler, events };
}

test('canHandle reconnaît les rôles préfixés pop_zone_', () => {
  const { handler } = setup();
  expect(handler.canHandle('pop_zone_0')).toBe(true);
  expect(handler.canHandle('pop_zone_left')).toBe(true);
  expect(handler.canHandle('pop_zone_')).toBe(true);
  expect(handler.canHandle('drain')).toBe(false);
  expect(handler.canHandle('zone_pop_0')).toBe(false);
});

test('handle (started, playing) émet ZONE_HIT avec le rôle complet + score', () => {
  const { handler, events } = setup();
  handler.handle('pop_zone_7', 'playing', true);
  expect(events).toEqual([
    { type: 'ZONE_HIT', zone: 'pop_zone_7', scoreIncrement: SCORE_POP_ZONE },
  ]);
});

test('handle ignore le contact end (started=false)', () => {
  const { handler, events } = setup();
  handler.handle('pop_zone_0', 'playing', false);
  expect(events).toHaveLength(0);
});

test('handle ignore les états non-playing', () => {
  const { handler, events } = setup();
  handler.handle('pop_zone_0', 'game_over', true);
  handler.handle('pop_zone_0', 'idle', true);
  expect(events).toHaveLength(0);
});
