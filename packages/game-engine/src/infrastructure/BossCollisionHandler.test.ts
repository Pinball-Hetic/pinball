import { test, expect } from 'bun:test';
import { BossCollisionHandler } from './BossCollisionHandler';
import { BossFightManager } from './BossFightManager';
import type { BossDefinition, BossGateContext } from '../domain/BossRegistry';
import type { GameEvent } from '../domain/GameEvents';

// Définitions de boss FIXTURES génériques (pas de contenu ST) : la mécanique
// du moteur doit marcher sur n'importe quelles définitions injectées.
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

// boss_a : monde normal, palier 3000. boss_b : monde alternatif, palier 3000.
const BOSS_A = boss({ id: 'boss_a', colliderRole: 'a_target' });
const BOSS_B = boss({
  id: 'boss_b',
  colliderRole: 'b_target',
  reveal: { scoreThreshold: 3000, scoreIncrement: 200, requiresAlternateWorld: true },
});

// Horloge injectée (DIP) : pilotée par le test, déterministe, sans stub global.
// Départ >= 2000 pour que le 1er hit verrouillé passe le throttle (le code
// compare now - (lastMs ?? 0) >= 2000, lastMs initial = 0).
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
  const mgr = new BossFightManager((e) => events.push(e), [BOSS_A, BOSS_B]);
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
  // boss_b verrouillé requiert le monde alternatif actif.
  const { handler, events } = make(true, ctx({ totalScore: 1000, alternateWorldActive: true }), clock.now);
  handler.handle('a_target', 'playing', true);
  handler.handle('b_target', 'playing', true);
  // a_target requiert monde normal → pas d'émission ; b_target requiert alternatif → émet.
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
  // boss_a requiert le monde normal ; en monde alternatif il ne fait rien.
  const { handler, events } = make(true, ctx({ totalScore: 1000, alternateWorldActive: true }));
  handler.handle('a_target', 'playing', true);
  expect(events).toHaveLength(0);
});

test('pas de locked-hit une fois le boss déclenché (fight en cours)', () => {
  const { handler, mgr, events } = make(false, ctx({ totalScore: 1000 }));
  mgr.beginFight('boss_a', false); // triggered
  handler.handle('a_target', 'playing', true);
  // isTriggered → branche locked-hit ignorée ; fight non armé → pas de hit non plus.
  expect(events).toHaveLength(0);
});

test('délègue la collision de combat : émet BOSS_TARGET_HIT quand armé', async () => {
  // BossTargetSensor utilise performance.now() interne avec un cooldown 450ms ;
  // on attend pour éviter une fuite de timing entre tests (cf. BossFightManager.test).
  await new Promise((r) => setTimeout(r, 500));
  const { handler, mgr, events } = make(false, ctx({ totalScore: 3000 }));
  mgr.beginFight('boss_a', true); // fightActive + targetArmed
  handler.handle('a_target', 'playing', true);
  expect(events).toEqual([
    { type: 'BOSS_TARGET_HIT', bossId: 'boss_a', hitCount: 1, scoreIncrement: 250 },
  ]);
});

test('horloge par défaut = performance.now quand non injectée (prod)', () => {
  // performance.now() au démarrage process peut être < 2000ms → on ne peut pas
  // garantir l'émission verrouillée. On vérifie juste que le constructeur sans
  // clock fonctionne et que le seuil atteint coupe bien la branche locked-hit.
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
