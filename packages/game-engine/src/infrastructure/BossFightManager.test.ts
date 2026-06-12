import { test, expect } from 'bun:test';
import { BossFightManager } from './BossFightManager';
import type { BossDefinition } from '../domain/BossRegistry';
import type { GameEvent } from '../domain/GameEvents';

// Définitions de boss FIXTURES génériques (pas de contenu ST) : la mécanique
// du moteur doit marcher sur n'importe quelles définitions injectées.
function boss(over: Partial<BossDefinition> & Pick<BossDefinition, 'id' | 'colliderRole'>): BossDefinition {
  return {
    target: { x: 0, y: 1, z: 0 },
    targetHits: 5,
    scoreTargetHit: 250,
    reveal: { scoreThreshold: 3000, scoreIncrement: 150, requiresUpsideDown: false },
    hud: {
      label: '',
      victoryLabel: '',
      dmdLabel: '',
      requiresUpsideDown: false,
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

// boss_a : monde normal, palier 3000, +150 reveal, 5 hits @250.
const BOSS_A = boss({ id: 'boss_a', colliderRole: 'a_target', unlocksPortal: true });
// boss_b : Upside Down, palier 3000, +200 reveal, 10 hits @300.
const BOSS_B = boss({
  id: 'boss_b',
  colliderRole: 'b_target',
  targetHits: 10,
  scoreTargetHit: 300,
  reveal: { scoreThreshold: 3000, scoreIncrement: 200, requiresUpsideDown: true },
  unlocksReturnPortal: true,
});

function make() {
  const events: GameEvent[] = [];
  const mgr = new BossFightManager((e) => events.push(e), [BOSS_A, BOSS_B]);
  return { mgr, events };
}

const PLAYING = (over: Partial<{
  totalScore: number;
  upsideDownActive: boolean;
  normalWorldScoreBaseline: number;
  upsideDownScoreBaseline: number;
}> = {}) => ({
  totalScore: 0,
  gameState: 'playing',
  upsideDownActive: false,
  normalWorldScoreBaseline: 0,
  upsideDownScoreBaseline: 0,
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

test('boss_a does not reveal in the Upside Down', () => {
  const { mgr, events } = make();
  mgr.tryReveal('boss_a', PLAYING({ totalScore: 9000, upsideDownActive: true }));
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

test('boss_b requires the Upside Down and a baseline-adjusted score', () => {
  const { mgr, events } = make();
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 9999, upsideDownActive: false }));
  expect(events).toHaveLength(0);
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 5000, upsideDownActive: true, upsideDownScoreBaseline: 4000 }));
  expect(events).toHaveLength(0);
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 7000, upsideDownActive: true, upsideDownScoreBaseline: 4000 }));
  expect(events).toEqual([{ type: 'BOSS_REVEAL', bossId: 'boss_b', scoreIncrement: 200 }]);
});

test('boss_b requires score since Upside Down entry on each cycle', () => {
  const { mgr, events } = make();
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 20000, upsideDownActive: true, upsideDownScoreBaseline: 20000 }));
  expect(events).toHaveLength(0);
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 23000, upsideDownActive: true, upsideDownScoreBaseline: 20000 }));
  expect(events).toEqual([{ type: 'BOSS_REVEAL', bossId: 'boss_b', scoreIncrement: 200 }]);
});

test('mutual exclusion: cannot reveal a second boss while another fight is active', () => {
  const { mgr, events } = make();
  mgr.tryReveal('boss_a', PLAYING({ totalScore: 3000 })); // boss_a fight now active
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 7000, upsideDownActive: true, upsideDownScoreBaseline: 4000 }));
  expect(events).toHaveLength(1); // boss_b blocked
  mgr.setFightActive('boss_a', false);
  mgr.tryReveal('boss_b', PLAYING({ totalScore: 7000, upsideDownActive: true, upsideDownScoreBaseline: 4000 }));
  expect(events).toHaveLength(2);
  expect(events[1]).toEqual({ type: 'BOSS_REVEAL', bossId: 'boss_b', scoreIncrement: 200 });
});

test('handleTargetCollision routes by collider role and emits a hit', async () => {
  await new Promise((r) => setTimeout(r, 500));
  const { mgr, events } = make();
  mgr.beginFight('boss_a', true); // fightActive + targetArmed
  const handled = mgr.handleTargetCollision('a_target', true, 'playing');
  expect(handled).toBe(true);
  expect(events).toEqual([{ type: 'BOSS_TARGET_HIT', bossId: 'boss_a', hitCount: 1, scoreIncrement: 250 }]);
});

test('handleTargetCollision ignores unknown roles', () => {
  const { mgr } = make();
  expect(mgr.handleTargetCollision('not_a_boss', true, 'playing')).toBe(false);
});
