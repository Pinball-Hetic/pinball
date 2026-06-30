import { test, expect } from 'bun:test';
import { RocketRampCollisionHandler } from './RocketRampCollisionHandler';
import { SCORE_RAMP } from '../domain/ScoringConstants';
import type { GameEvent } from '../domain/GameEvents';

function setup() {
  const events: GameEvent[] = [];
  const handler = new RocketRampCollisionHandler((e) => events.push(e));
  return { handler, events };
}

test('canHandle reconnaît uniquement le rôle rocket_ramp', () => {
  const { handler } = setup();
  expect(handler.canHandle('rocket_ramp')).toBe(true);
  expect(handler.canHandle('rocket_ramp_0')).toBe(false);
  expect(handler.canHandle('drain')).toBe(false);
});

test('handle (started, playing) émet RAMP_HIT avec le score', () => {
  const { handler, events } = setup();
  handler.handle('rocket_ramp', 'playing', true);
  expect(events).toEqual([{ type: 'RAMP_HIT', scoreIncrement: SCORE_RAMP }]);
});

test('handle ignore le contact end (started=false)', () => {
  const { handler, events } = setup();
  handler.handle('rocket_ramp', 'playing', false);
  expect(events).toHaveLength(0);
});

test('handle ignore les états non-playing', () => {
  const { handler, events } = setup();
  handler.handle('rocket_ramp', 'game_over', true);
  expect(events).toHaveLength(0);
});
