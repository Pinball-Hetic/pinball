import { test, expect } from 'bun:test';
import { SlingshotCollisionHandler } from './SlingshotCollisionHandler';
import { SCORE_SLINGSHOT } from '../domain/ScoringConstants';
import type { GameEvent } from '../domain/GameEvents';

function makeEmit() {
  const events: GameEvent[] = [];
  return { emit: (e: GameEvent) => events.push(e), events };
}

test('canHandle matche slingshot_left / slingshot_right uniquement', () => {
  const { emit } = makeEmit();
  const h = new SlingshotCollisionHandler(emit);
  expect(h.canHandle('slingshot_left')).toBe(true);
  expect(h.canHandle('slingshot_right')).toBe(true);
  expect(h.canHandle('bumper_0')).toBe(false);
  expect(h.canHandle('bump_left')).toBe(false);
});

test('émet SLINGSHOT_HIT avec side left + score sur started/playing', () => {
  const { emit, events } = makeEmit();
  const h = new SlingshotCollisionHandler(emit);

  h.handle('slingshot_left', 'playing', true);
  expect(events).toEqual([
    { type: 'SLINGSHOT_HIT', side: 'left', scoreIncrement: SCORE_SLINGSHOT },
  ]);
});

test('mappe slingshot_right vers side right', () => {
  const { emit, events } = makeEmit();
  const h = new SlingshotCollisionHandler(emit);

  h.handle('slingshot_right', 'playing', true);
  expect(events).toEqual([
    { type: 'SLINGSHOT_HIT', side: 'right', scoreIncrement: SCORE_SLINGSHOT },
  ]);
});

test('no-op si started=false', () => {
  const { emit, events } = makeEmit();
  const h = new SlingshotCollisionHandler(emit);

  h.handle('slingshot_left', 'playing', false);
  expect(events).toEqual([]);
});

test('no-op si gameState != playing', () => {
  const { emit, events } = makeEmit();
  const h = new SlingshotCollisionHandler(emit);

  h.handle('slingshot_left', 'game_over', true);
  expect(events).toEqual([]);
});
