import { test, expect, describe } from 'bun:test';
import type { GameEvent } from '../../src/domain/GameEvents';
import { SCORE_SCOOP } from '../../src/domain/ScoringConstants';
import { ScoopCollisionHandler } from '../../src/infrastructure/ScoopCollisionHandler';

function harness() {
  const events: GameEvent[] = [];
  const handler = new ScoopCollisionHandler((e) => events.push(e));
  return { handler, events };
}

describe('ScoopCollisionHandler', () => {
  test('canHandle : rôle "scoop" seulement', () => {
    const { handler } = harness();
    expect(handler.canHandle('scoop')).toBe(true);
    expect(handler.canHandle('scoop_2')).toBe(false);
    expect(handler.canHandle('pop_zone_0')).toBe(false);
    expect(handler.canHandle('rocket_ramp')).toBe(false);
  });

  test('contact start en jeu → SCOOP_ENTER avec le score scoop', () => {
    const { handler, events } = harness();
    handler.handle('scoop', 'playing', true);
    expect(events).toEqual([{ type: 'SCOOP_ENTER', scoreIncrement: SCORE_SCOOP }]);
  });

  test('contact end (started=false) → rien', () => {
    const { handler, events } = harness();
    handler.handle('scoop', 'playing', false);
    expect(events).toEqual([]);
  });

  test('hors jeu (game_over/idle) → rien', () => {
    const { handler, events } = harness();
    handler.handle('scoop', 'game_over', true);
    handler.handle('scoop', 'idle', true);
    expect(events).toEqual([]);
  });
});
