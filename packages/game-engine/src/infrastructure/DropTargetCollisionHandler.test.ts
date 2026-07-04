import { test, expect } from 'bun:test';
import { DropTargetCollisionHandler } from './DropTargetCollisionHandler';
import type { MapLayout, DropTargetDef } from '../domain/MapLayout';
import type { GameEvent } from '../domain/GameEvents';
import { SCORE_DROP_TARGET, SCORE_DROP_COMPLETE } from '../domain/ScoringConstants';

// Minimal layout: the handler only reads `dropTargets` (id + side).
function makeLayout(targets: DropTargetDef[]): MapLayout {
  return { dropTargets: targets } as unknown as MapLayout;
}

const dt = (id: string, side: 'left' | 'right'): DropTargetDef => ({ id, x: 0, y: 0, z: 0, side });

function setup(targets: DropTargetDef[]) {
  const events: GameEvent[] = [];
  const handler = new DropTargetCollisionHandler((e) => events.push(e), makeLayout(targets));
  return { handler, events };
}

test('canHandle: drop_<id> oui, drop_target* non, autre rôle non', () => {
  const { handler } = setup([]);
  expect(handler.canHandle('drop_a')).toBe(true);
  expect(handler.canHandle('drop_target')).toBe(false);
  expect(handler.canHandle('drop_target_0')).toBe(false);
  expect(handler.canHandle('bumper_0')).toBe(false);
});

test('handle: ignore si contact non démarré', () => {
  const { handler, events } = setup([dt('drop_a', 'left')]);
  handler.handle('drop_a', 'playing', false);
  expect(events).toEqual([]);
});

test('handle: ignore si gameState != playing', () => {
  const { handler, events } = setup([dt('drop_a', 'left')]);
  handler.handle('drop_a', 'game_over', true);
  expect(events).toEqual([]);
});

test('handle: premier contact émet DROP_TARGET_HIT', () => {
  const { handler, events } = setup([dt('drop_a', 'left'), dt('drop_b', 'left')]);
  handler.handle('drop_a', 'playing', true);
  expect(events).toEqual([
    { type: 'DROP_TARGET_HIT', targetId: 'drop_a', scoreIncrement: SCORE_DROP_TARGET },
  ]);
});

test('handle: idempotent — une cible déjà down ne réémet rien', () => {
  const { handler, events } = setup([dt('drop_a', 'left'), dt('drop_b', 'left')]);
  handler.handle('drop_a', 'playing', true);
  handler.handle('drop_a', 'playing', true);
  expect(events).toEqual([
    { type: 'DROP_TARGET_HIT', targetId: 'drop_a', scoreIncrement: SCORE_DROP_TARGET },
  ]);
});

test('handle: cible inconnue (absente du layout) → HIT seul, pas de complete', () => {
  const { handler, events } = setup([dt('drop_a', 'left')]);
  handler.handle('drop_x', 'playing', true);
  // HIT emitted (state tracked per role), but find() finds nothing → early return.
  expect(events).toEqual([
    { type: 'DROP_TARGET_HIT', targetId: 'drop_x', scoreIncrement: SCORE_DROP_TARGET },
  ]);
});

test('handle: toutes les cibles du côté down → COMPLETE une fois + reset du côté', () => {
  const { handler, events } = setup([dt('drop_a', 'left'), dt('drop_b', 'left')]);
  handler.handle('drop_a', 'playing', true);
  handler.handle('drop_b', 'playing', true);

  expect(events).toEqual([
    { type: 'DROP_TARGET_HIT', targetId: 'drop_a', scoreIncrement: SCORE_DROP_TARGET },
    { type: 'DROP_TARGET_HIT', targetId: 'drop_b', scoreIncrement: SCORE_DROP_TARGET },
    { type: 'DROP_TARGET_COMPLETE', side: 'left', scoreIncrement: SCORE_DROP_COMPLETE },
  ]);

  // After reset, the side is playable again (re-HIT without error).
  handler.handle('drop_a', 'playing', true);
  expect(events.at(-1)).toEqual({
    type: 'DROP_TARGET_HIT',
    targetId: 'drop_a',
    scoreIncrement: SCORE_DROP_TARGET,
  });
});

test('handle: un seul côté complété ne reset pas/affecte pas l’autre côté', () => {
  const { handler, events } = setup([
    dt('drop_a', 'left'),
    dt('drop_b', 'left'),
    dt('drop_c', 'right'),
    dt('drop_d', 'right'),
  ]);
  handler.handle('drop_c', 'playing', true); // right partial (drop_d still up)
  handler.handle('drop_a', 'playing', true);
  handler.handle('drop_b', 'playing', true); // left complete → COMPLETE left + reset left

  const completes = events.filter((e) => e.type === 'DROP_TARGET_COMPLETE');
  expect(completes).toEqual([
    { type: 'DROP_TARGET_COMPLETE', side: 'left', scoreIncrement: SCORE_DROP_COMPLETE },
  ]);

  // drop_c (right) must stay down: a new contact is idempotent (nothing emitted).
  const before = events.length;
  handler.handle('drop_c', 'playing', true);
  expect(events.length).toBe(before);
});

test('resetDropTargets: réinitialise aussi un rôle orphelin (absent du layout) — régression', () => {
  // Regression: resetDropTargets only reset the ids present in
  // layout.dropTargets; an orphan 'drop_*' role (in colliderMap but not the
  // layout) stayed down forever. It must now become playable again.
  const { handler, events } = setup([dt('drop_a', 'left')]);
  handler.handle('drop_orphan', 'playing', true); // sets an unknown role down
  expect(events.at(-1)).toEqual({
    type: 'DROP_TARGET_HIT',
    targetId: 'drop_orphan',
    scoreIncrement: SCORE_DROP_TARGET,
  });

  handler.resetDropTargets();
  events.length = 0;

  handler.handle('drop_orphan', 'playing', true); // must re-emit after reset
  expect(events).toEqual([
    { type: 'DROP_TARGET_HIT', targetId: 'drop_orphan', scoreIncrement: SCORE_DROP_TARGET },
  ]);
});

test('resetDropTargets: remet tout up et émet DROP_TARGET_RESET', () => {
  const { handler, events } = setup([dt('drop_a', 'left'), dt('drop_b', 'left')]);
  handler.handle('drop_a', 'playing', true);
  events.length = 0;

  handler.resetDropTargets();
  expect(events).toEqual([{ type: 'DROP_TARGET_RESET' }]);

  // drop_a is up again: a contact re-emits a HIT.
  handler.handle('drop_a', 'playing', true);
  expect(events.at(-1)).toEqual({
    type: 'DROP_TARGET_HIT',
    targetId: 'drop_a',
    scoreIncrement: SCORE_DROP_TARGET,
  });
});
