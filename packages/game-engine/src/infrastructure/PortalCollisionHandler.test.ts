import { test, expect } from 'bun:test';
import { PortalCollisionHandler } from './PortalCollisionHandler';
import type { GameEvent } from '../domain/GameEvents';
import { PORTAL_ENTER_SCORE, RETURN_PORTAL_ENTER_SCORE } from '../domain/Ball';

function setup(alternateWorldActive = false) {
  const events: GameEvent[] = [];
  let altActive = alternateWorldActive;
  const handler = new PortalCollisionHandler(
    (e) => events.push(e),
    () => altActive,
  );
  return {
    handler,
    events,
    setAlt: (v: boolean) => {
      altActive = v;
    },
  };
}

test('canHandle: seulement portal_enter', () => {
  const { handler } = setup();
  expect(handler.canHandle('portal_enter')).toBe(true);
  expect(handler.canHandle('portal_exit')).toBe(false);
  expect(handler.canHandle('bumper_0')).toBe(false);
});

test('handle: ignore si contact non démarré', () => {
  const { handler, events } = setup();
  handler.setPortalOpen(true);
  handler.handle('portal_enter', 'playing', false);
  expect(events).toEqual([]);
});

test('handle: ignore si gameState != playing', () => {
  const { handler, events } = setup();
  handler.setPortalOpen(true);
  handler.handle('portal_enter', 'game_over', true);
  expect(events).toEqual([]);
});

test('handle: ignore si le portail est fermé (défaut)', () => {
  const { handler, events } = setup();
  handler.handle('portal_enter', 'playing', true);
  expect(events).toEqual([]);
});

test('handle: portail ouvert + monde normal → PORTAL_ENTER', () => {
  const { handler, events } = setup(false);
  handler.setPortalOpen(true);
  handler.handle('portal_enter', 'playing', true);
  expect(events).toEqual([{ type: 'PORTAL_ENTER', scoreIncrement: PORTAL_ENTER_SCORE }]);
});

test('handle: portail ouvert + monde alterné → RETURN_PORTAL_ENTER', () => {
  const { handler, events } = setup(true);
  handler.setPortalOpen(true);
  handler.handle('portal_enter', 'playing', true);
  expect(events).toEqual([
    { type: 'RETURN_PORTAL_ENTER', scoreIncrement: RETURN_PORTAL_ENTER_SCORE },
  ]);
});

test('handle: latch — un second passage durant la même ouverture ne réémet rien', () => {
  const { handler, events } = setup(false);
  handler.setPortalOpen(true);
  handler.handle('portal_enter', 'playing', true);
  handler.handle('portal_enter', 'playing', true);
  expect(events).toEqual([{ type: 'PORTAL_ENTER', scoreIncrement: PORTAL_ENTER_SCORE }]);
});

test('setPortalOpen(false): referme et réarme le latch', () => {
  const { handler, events } = setup(false);
  handler.setPortalOpen(true);
  handler.handle('portal_enter', 'playing', true); // 1er fire
  handler.setPortalOpen(false); // referme → reset triggered
  handler.handle('portal_enter', 'playing', true); // ignoré (fermé)
  handler.setPortalOpen(true); // rouvre
  handler.handle('portal_enter', 'playing', true); // refire autorisé
  expect(events).toEqual([
    { type: 'PORTAL_ENTER', scoreIncrement: PORTAL_ENTER_SCORE },
    { type: 'PORTAL_ENTER', scoreIncrement: PORTAL_ENTER_SCORE },
  ]);
});

test('resetPortalTrigger: réautorise un fire sans refermer le portail', () => {
  const { handler, events } = setup(false);
  handler.setPortalOpen(true);
  handler.handle('portal_enter', 'playing', true);
  handler.resetPortalTrigger();
  handler.handle('portal_enter', 'playing', true);
  expect(events).toEqual([
    { type: 'PORTAL_ENTER', scoreIncrement: PORTAL_ENTER_SCORE },
    { type: 'PORTAL_ENTER', scoreIncrement: PORTAL_ENTER_SCORE },
  ]);
});

test('handle: état du monde lu à chaque passage via le getter injecté', () => {
  const { handler, events, setAlt } = setup(false);
  handler.setPortalOpen(true);
  handler.handle('portal_enter', 'playing', true); // normal → PORTAL_ENTER
  handler.resetPortalTrigger();
  setAlt(true);
  handler.handle('portal_enter', 'playing', true); // alterné → RETURN_PORTAL_ENTER
  expect(events).toEqual([
    { type: 'PORTAL_ENTER', scoreIncrement: PORTAL_ENTER_SCORE },
    { type: 'RETURN_PORTAL_ENTER', scoreIncrement: RETURN_PORTAL_ENTER_SCORE },
  ]);
});
