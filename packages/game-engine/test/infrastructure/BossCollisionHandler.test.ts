import { test, expect } from 'bun:test';
import { BossCollisionHandler } from '../../src/infrastructure/BossCollisionHandler';
import { BossFightManager } from '../../src/infrastructure/BossFightManager';
import type { BossDefinition, BossGateContext } from '../../src/domain/BossRegistry';
import type { GameEvent } from '../../src/domain/GameEvents';

// Generic FIXTURE boss definitions (no ST content): the engine mechanics must
// work on any injected definitions.
function boss(
  over: Partial<BossDefinition> & Pick<BossDefinition, 'id' | 'colliderRole'>,
): BossDefinition {
  return {
    target: { x: 0, y: 1, z: 0 },
    targetHits: 5,
    scoreTargetHit: 250,
    reveal: { scoreThreshold: 3000, scoreIncrement: 150, requiresAlternateWorld: false },
    hud: {
      label: '',
      victoryLabel: '',
      dmdLabel: '',
      requiresAlternateWorld: false,
      bottomClass: '',
      borderClass: '',
      subtitleClass: '',
      hitsClass: '',
      victoryClass: '',
      victoryClearMs: 1000,
    },
    unlocksPortal: false,
    unlocksReturnPortal: false,
    targetMeshTheme: {
      ring: { color: 0, emissive: 0, emissiveIntensity: 1 },
      core: { color: 0, emissive: 0, emissiveIntensity: 1 },
      light: { color: 0, intensity: 1 },
    },
    targetPulse: {
      hitFlashDuration: 0.18,
      pulseSpeed: 2.5,
      pulseAmp: 0.18,
      hitBoost: 1.4,
      ringEmissiveBase: 1.6,
      coreEmissiveBase: 1.2,
      lightIntensityBase: 0.45,
      wobbleSpeed: 3,
      wobbleAmp: 0.08,
      hitScaleBoost: 0.25,
    },
    ...over,
  };
}

// boss_a: normal world, threshold 3000. boss_b: alternate world, threshold 3000.
const BOSS_A = boss({ id: 'boss_a', colliderRole: 'a_target' });
const BOSS_B = boss({
  id: 'boss_b',
  colliderRole: 'b_target',
  reveal: { scoreThreshold: 3000, scoreIncrement: 200, requiresAlternateWorld: true },
});

// Injected clock: driven by the test, deterministic, no global stub. Start
// >= 2000 so the 1st locked hit passes the throttle (the code compares
// now - (lastMs ?? 0) >= 2000, initial lastMs = 0).
function makeClock(start = 5000) {
  const clock = { t: start };
  return { now: () => clock.t, set: (ms: number) => { clock.t = ms; } };
}

function ctx(over: Partial<BossGateContext> = {}): BossGateContext {
  return {
    totalScore: 0,
    alternateWorldActive: false,
    normalWorldScoreBaseline: 0,
    alternateWorldScoreBaseline: 0,
    ...over,
  };
}

type World = { active: boolean };

function make(
  worldActive = false,
  gate: BossGateContext = ctx(),
  clock = makeClock().now,
) {
  const events: GameEvent[] = [];
  const world: World = { active: worldActive };
  const mgr = new BossFightManager((e) => events.push(e), [BOSS_A, BOSS_B], clock);
  const handler = new BossCollisionHandler(
    [BOSS_A, BOSS_B],
    mgr,
    (e) => events.push(e),
    () => world.active,
    () => gate,
    clock,
  );
  return { handler, mgr, events, world };
}

test('canHandle ne reconnaît que les rôles de collider de boss', () => {
  const { handler } = make();
  expect(handler.canHandle('a_target')).toBe(true);
  expect(handler.canHandle('b_target')).toBe(true);
  expect(handler.canHandle('bumper_0')).toBe(false);
  expect(handler.canHandle('drain')).toBe(false);
});

test('émet BOSS_LOCKED_HIT quand le palier n\'est pas atteint (monde normal)', () => {
  const { handler, events } = make(false, ctx({ totalScore: 1000 }));
  handler.handle('a_target', 'playing', true);
  expect(events).toEqual([
    { type: 'BOSS_LOCKED_HIT', bossId: 'boss_a', remaining: 2000 },
  ]);
});

test('n\'émet PAS BOSS_LOCKED_HIT quand le palier est atteint', () => {
  const { handler, events } = make(false, ctx({ totalScore: 3000 }));
  handler.handle('a_target', 'playing', true);
  expect(events).toHaveLength(0);
});

test('throttle 2s : un 2e hit verrouillé dans la fenêtre est ignoré', () => {
  const clock = makeClock(5000);
  const { handler, events } = make(false, ctx({ totalScore: 1000 }), clock.now);
  handler.handle('a_target', 'playing', true);
  clock.set(5000 + 1999);
  handler.handle('a_target', 'playing', true);
  expect(events).toHaveLength(1);
});

test('throttle 2s : un hit verrouillé après expiration ré-émet', () => {
  const clock = makeClock(5000);
  const { handler, events } = make(false, ctx({ totalScore: 1000 }), clock.now);
  handler.handle('a_target', 'playing', true);
  clock.set(5000 + 2000);
  handler.handle('a_target', 'playing', true);
  expect(events).toHaveLength(2);
});

test('throttle indépendant par boss', () => {
  const clock = makeClock(5000);
  // locked boss_b requires the alternate world active.
  const { handler, events } = make(true, ctx({ totalScore: 1000, alternateWorldActive: true }), clock.now);
  handler.handle('a_target', 'playing', true);
  handler.handle('b_target', 'playing', true);
  // a_target requires normal world → no emit; b_target requires alternate → emits.
  expect(events).toEqual([
    { type: 'BOSS_LOCKED_HIT', bossId: 'boss_b', remaining: 2000 },
  ]);
});

test('pas de BOSS_LOCKED_HIT hors started/playing', () => {
  const { handler, events } = make(false, ctx({ totalScore: 1000 }));
  handler.handle('a_target', 'playing', false);
  handler.handle('a_target', 'game_over', true);
  expect(events).toHaveLength(0);
});

test('locked-hit dépend du monde requis par le boss', () => {
  // boss_a requires the normal world; in the alternate world it does nothing.
  const { handler, events } = make(true, ctx({ totalScore: 1000, alternateWorldActive: true }));
  handler.handle('a_target', 'playing', true);
  expect(events).toHaveLength(0);
});

test('pas de locked-hit une fois le boss déclenché (fight en cours)', () => {
  const { handler, mgr, events } = make(false, ctx({ totalScore: 1000 }));
  mgr.beginFight('boss_a', false); // triggered
  handler.handle('a_target', 'playing', true);
  // isTriggered → locked-hit branch skipped; fight not armed → no hit either.
  expect(events).toHaveLength(0);
});

test('délègue la collision de combat : émet BOSS_TARGET_HIT quand armé', () => {
  // Injected clock (start 5000) shared handler + sensor: the 1st hit always
  // passes the cooldown (initial lastHitMs = 0), deterministic without setTimeout.
  const { handler, mgr, events } = make(false, ctx({ totalScore: 3000 }));
  mgr.beginFight('boss_a', true); // fightActive + targetArmed
  handler.handle('a_target', 'playing', true);
  expect(events).toEqual([
    { type: 'BOSS_TARGET_HIT', bossId: 'boss_a', hitCount: 1, scoreIncrement: 250 },
  ]);
});

test('resetThrottle ré-arme le locked-hit après un reset (régression)', () => {
  // Regression: without resetThrottle, a boss re-armed after reset would stay
  // silent until 2s. Hit at t=5000, reset, hit at t=5001 → must re-emit.
  const clock = makeClock(5000);
  const { handler, events } = make(false, ctx({ totalScore: 1000 }), clock.now);
  handler.handle('a_target', 'playing', true);
  expect(events).toHaveLength(1);

  handler.resetThrottle(); // clear all
  clock.set(5001); // 1ms later, well within the 2s window

  handler.handle('a_target', 'playing', true);
  expect(events).toHaveLength(2);
});

test('resetThrottle(id) ne ré-arme que le boss ciblé', () => {
  const clock = makeClock(5000);
  const { handler, events } = make(true, ctx({ totalScore: 1000, alternateWorldActive: true }), clock.now);
  handler.handle('b_target', 'playing', true); // boss_b émet
  expect(events).toHaveLength(1);
  handler.resetThrottle('boss_b');
  clock.set(5001);
  handler.handle('b_target', 'playing', true);
  expect(events).toHaveLength(2);
});

test('horloge par défaut = performance.now quand non injectée (prod)', () => {
  // performance.now() at process start may be < 2000ms → we can't guarantee the
  // locked emit. We only check that the constructor without a clock works and
  // that reaching the threshold does cut off the locked-hit branch.
  const events: GameEvent[] = [];
  const mgr = new BossFightManager((e) => events.push(e), [BOSS_A]);
  const handler = new BossCollisionHandler(
    [BOSS_A],
    mgr,
    (e) => events.push(e),
    () => false,
    () => ctx({ totalScore: 3000 }),
  ); // pas de clock
  handler.handle('a_target', 'playing', true);
  expect(events).toHaveLength(0);
});
