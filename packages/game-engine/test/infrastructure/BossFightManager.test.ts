import { test, expect } from 'bun:test';
import { BossFightManager } from '../../src/infrastructure/BossFightManager';
import { BossTargetSensor } from '../../src/infrastructure/BossTargetSensor';
import type { BossDefinition } from '../../src/domain/BossRegistry';
import type { GameEvent } from '../../src/domain/GameEvents';

// Generic FIXTURE boss definitions (no ST content): the engine mechanics must
// work on any injected definitions.
function boss(over: Partial<BossDefinition> & Pick<BossDefinition, 'id' | 'colliderRole'>): BossDefinition {
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

// boss_a: normal world, threshold 3000, +150 reveal, 5 hits @250.
const BOSS_A = boss({ id: 'boss_a', colliderRole: 'a_target', unlocksPortal: true });
// boss_b: alternate world, threshold 3000, +200 reveal, 10 hits @300.
const BOSS_B = boss({
  id: 'boss_b',
  colliderRole: 'b_target',
  targetHits: 10,
  scoreTargetHit: 300,
  reveal: { scoreThreshold: 3000, scoreIncrement: 200, requiresAlternateWorld: true },
  unlocksReturnPortal: true,
});

function make(now: () => number = () => 0) {
  const events: GameEvent[] = [];
  const mgr = new BossFightManager((e) => events.push(e), [BOSS_A, BOSS_B], now);
  return { mgr, events };
}

const PLAYING = (over: Partial<{
  totalScore: number;
  alternateWorldActive: boolean;
  normalWorldScoreBaseline: number;
  alternateWorldScoreBaseline: number;
}> = {}) => ({
  totalScore: 0,
  gameState: 'playing',
  alternateWorldActive: false,
  normalWorldScoreBaseline: 0,
  alternateWorldScoreBaseline: 0,
  ...over,
});

test('reveals boss_a at its score threshold with the right payload', () => {
  const { mgr, events } = make();
  mgr.tryReveal('boss_a', PLAYING({ totalScore: 3000 }));
  expect(events).toEqual([{ type: 'BOSS_REVEAL', bossId: 'boss_a', scoreIncrement: 150 }]);
});

test('boss_a requires score since normal world entry', () => {
  const { mgr, events } = make();
  mgr.tryReveal('boss_a', PLAYING({ totalScore: 15000, normalWorldScoreBaseline: 15000 }));
  expect(events).toHaveLength(0);
  mgr.tryReveal('boss_a', PLAYING({ totalScore: 18000, normalWorldScoreBaseline: 15000 }));
  expect(events).toEqual([{ type: 'BOSS_REVEAL', bossId: 'boss_a', scoreIncrement: 150 }]);
});

test('boss_a does not reveal in the monde alternatif', () => {
  const { mgr, events } = make();
  mgr.tryReveal('boss_a', PLAYING({ totalScore: 9000, alternateWorldActive: true }));
  expect(events).toHaveLength(0);
});

test('does not reveal below threshold or outside playing', () => {
  const { mgr, events } = make();
  mgr.tryReveal('boss_a', PLAYING({ totalScore: 2999 }));
  mgr.tryReveal('boss_a', { ...PLAYING({ totalScore: 9999 }), gameState: 'idle' });
  expect(events).toHaveLength(0);
});

test('reveal is once-only', () => {
  const { mgr, events } = make();
  mgr.tryReveal('boss_a', PLAYING({ totalScore: 3000 }));
  mgr.tryReveal('boss_a', PLAYING({ totalScore: 9000 }));
  expect(events).toHaveLength(1);
});

test('boss_b requires the monde alternatif and a baseline-adjusted score', () => {
  const { mgr, events } = make();
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 9999, alternateWorldActive: false }));
  expect(events).toHaveLength(0);
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 5000, alternateWorldActive: true, alternateWorldScoreBaseline: 4000 }));
  expect(events).toHaveLength(0);
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 7000, alternateWorldActive: true, alternateWorldScoreBaseline: 4000 }));
  expect(events).toEqual([{ type: 'BOSS_REVEAL', bossId: 'boss_b', scoreIncrement: 200 }]);
});

test('boss_b requires score since monde alternatif entry on each cycle', () => {
  const { mgr, events } = make();
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 20000, alternateWorldActive: true, alternateWorldScoreBaseline: 20000 }));
  expect(events).toHaveLength(0);
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 23000, alternateWorldActive: true, alternateWorldScoreBaseline: 20000 }));
  expect(events).toEqual([{ type: 'BOSS_REVEAL', bossId: 'boss_b', scoreIncrement: 200 }]);
});

test('mutual exclusion: cannot reveal a second boss while another fight is active', () => {
  const { mgr, events } = make();
  mgr.tryReveal('boss_a', PLAYING({ totalScore: 3000 })); // boss_a fight now active
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 7000, alternateWorldActive: true, alternateWorldScoreBaseline: 4000 }));
  expect(events).toHaveLength(1); // boss_b blocked
  mgr.setFightActive('boss_a', false);
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 7000, alternateWorldActive: true, alternateWorldScoreBaseline: 4000 }));
  expect(events).toHaveLength(2);
  expect(events[1]).toEqual({ type: 'BOSS_REVEAL', bossId: 'boss_b', scoreIncrement: 200 });
});

test('handleTargetCollision routes by collider role and emits a hit', () => {
  // Injected clock (start at 0, no wall-clock leak between tests) — the first
  // hit always passes the cooldown since lastHitMs starts at 0.
  const { mgr, events } = make(() => 1000);
  mgr.beginFight('boss_a', true); // fightActive + targetArmed
  const handled = mgr.handleTargetCollision('a_target', true, 'playing');
  expect(handled).toBe(true);
  expect(events).toEqual([{ type: 'BOSS_TARGET_HIT', bossId: 'boss_a', hitCount: 1, scoreIncrement: 250 }]);
});

test('handleTargetCollision: two hits across the cooldown boundary via injected clock', () => {
  const clock = { t: 1000 };
  const { mgr, events } = make(() => clock.t);
  mgr.beginFight('boss_a', true);
  mgr.handleTargetCollision('a_target', true, 'playing'); // 1st hit (t=1000)
  mgr.handleTargetCollision('a_target', false, 'playing'); // ball leaves
  clock.t = 1000 + 450; // exactly at the 450ms cooldown boundary
  mgr.handleTargetCollision('a_target', true, 'playing'); // 2nd hit
  expect(events).toEqual([
    { type: 'BOSS_TARGET_HIT', bossId: 'boss_a', hitCount: 1, scoreIncrement: 250 },
    { type: 'BOSS_TARGET_HIT', bossId: 'boss_a', hitCount: 2, scoreIncrement: 250 },
  ]);
});

test('resetAlternateWorldBosses resets only alternate-world bosses', () => {
  const { mgr } = make();
  mgr.beginFight('boss_a', false); // normal-world boss triggered
  mgr.beginFight('boss_b', false); // alternate-world boss triggered
  expect(mgr.isTriggered('boss_a')).toBe(true);
  expect(mgr.isTriggered('boss_b')).toBe(true);

  mgr.resetAlternateWorldBosses();
  expect(mgr.isTriggered('boss_a')).toBe(true); // normal-world boss untouched
  expect(mgr.isTriggered('boss_b')).toBe(false); // alternate-world boss reset
});

test('handleTargetCollision ignores unknown roles', () => {
  const { mgr } = make();
  expect(mgr.handleTargetCollision('not_a_boss', true, 'playing')).toBe(false);
});

test('sensor factory is injectable: one sensor built per boss, wired to the clock', () => {
  const built: BossTargetSensor[] = [];
  const clock = { t: 1000 };
  const events: GameEvent[] = [];
  const mgr = new BossFightManager(
    (e) => events.push(e),
    [BOSS_A, BOSS_B],
    () => clock.t,
    (now) => {
      const s = new BossTargetSensor(now);
      built.push(s);
      return s;
    },
  );
  // One sensor instantiated per injected boss definition.
  expect(built).toHaveLength(2);
  // Behaviour identical to the default factory: the injected clock still drives
  // the cooldown, so a first hit lands then a second lands at the boundary.
  mgr.beginFight('boss_a', true);
  mgr.handleTargetCollision('a_target', true, 'playing');
  mgr.handleTargetCollision('a_target', false, 'playing');
  clock.t = 1000 + 450;
  mgr.handleTargetCollision('a_target', true, 'playing');
  expect(events).toEqual([
    { type: 'BOSS_TARGET_HIT', bossId: 'boss_a', hitCount: 1, scoreIncrement: 250 },
    { type: 'BOSS_TARGET_HIT', bossId: 'boss_a', hitCount: 2, scoreIncrement: 250 },
  ]);
});

// ── Debug triggers (/debug): real state path, no phantom event ──────────────

test('forceReveal: arme le VRAI combat (isTriggered) + émet BOSS_REVEAL, sans gate de seuil', () => {
  const events: GameEvent[] = [];
  const mgr = new BossFightManager((e) => events.push(e), [BOSS_A], () => 0);
  // No score earned (threshold 3000 NOT reached) → tryReveal would refuse.
  mgr.forceReveal('boss_a', 'playing');
  expect(mgr.isTriggered('boss_a')).toBe(true);
  expect(events).toEqual([
    { type: 'BOSS_REVEAL', bossId: 'boss_a', scoreIncrement: 150 },
  ]);
});

test('forceReveal: garde les invariants — pas hors jeu, pas de double reveal', () => {
  const events: GameEvent[] = [];
  const mgr = new BossFightManager((e) => events.push(e), [BOSS_A], () => 0);
  mgr.forceReveal('boss_a', 'game_over');
  expect(mgr.isTriggered('boss_a')).toBe(false);
  mgr.forceReveal('boss_a', 'playing');
  mgr.forceReveal('boss_a', 'playing'); // no-op
  expect(events.filter((e) => e.type === 'BOSS_REVEAL')).toHaveLength(1);
});

test('forceTargetHit: crédite le vrai compteur (cooldown ignoré) → défaite réelle à maxHits', () => {
  const events: GameEvent[] = [];
  // FROZEN clock: the 450ms cooldown would block repeated hits — forceTargetHit must bypass it.
  const mgr = new BossFightManager((e) => events.push(e), [BOSS_A], () => 1000);
  mgr.forceReveal('boss_a', 'playing');
  mgr.setTargetArmed('boss_a', true); // le module arme la cible après l'anim de reveal
  for (let i = 0; i < 5; i++) mgr.forceTargetHit('boss_a', 'playing');
  const hits = events.filter((e) => e.type === 'BOSS_TARGET_HIT');
  expect(hits).toHaveLength(5);
  expect(hits[4]).toMatchObject({ hitCount: 5 });
});

test('forceTargetHit: sans cible armée (anim de reveal pas finie) → aucun crédit', () => {
  const events: GameEvent[] = [];
  const mgr = new BossFightManager((e) => events.push(e), [BOSS_A], () => 1000);
  mgr.forceReveal('boss_a', 'playing'); // beginFight(targetArmed=false)
  mgr.forceTargetHit('boss_a', 'playing');
  expect(events.filter((e) => e.type === 'BOSS_TARGET_HIT')).toHaveLength(0);
});
