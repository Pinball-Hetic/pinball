import { test, expect } from 'bun:test';
import { BossFightManager } from './BossFightManager';
import { getBossByColliderRole } from '../domain/BossRegistry';
import type { GameEvent } from '../domain/GameEvents';

function make() {
  const events: GameEvent[] = [];
  const mgr = new BossFightManager((e) => events.push(e));
  return { mgr, events };
}

const PLAYING = (over: Partial<{ totalScore: number; upsideDownActive: boolean; upsideDownScoreBaseline: number }> = {}) => ({
  totalScore: 0,
  gameState: 'playing',
  upsideDownActive: false,
  upsideDownScoreBaseline: 0,
  ...over,
});

test('reveals demogorgon at its score threshold with the right payload', () => {
  const { mgr, events } = make();
  mgr.tryReveal('demogorgon', PLAYING({ totalScore: 3000 }));
  expect(events).toEqual([{ type: 'BOSS_REVEAL', bossId: 'demogorgon', scoreIncrement: 150 }]);
});

test('does not reveal below threshold or outside playing', () => {
  const { mgr, events } = make();
  mgr.tryReveal('demogorgon', PLAYING({ totalScore: 2999 }));
  mgr.tryReveal('demogorgon', { ...PLAYING({ totalScore: 9999 }), gameState: 'idle' });
  expect(events).toHaveLength(0);
});

test('reveal is once-only', () => {
  const { mgr, events } = make();
  mgr.tryReveal('demogorgon', PLAYING({ totalScore: 3000 }));
  mgr.tryReveal('demogorgon', PLAYING({ totalScore: 9000 }));
  expect(events).toHaveLength(1);
});

test('vecna requires the Upside Down and a baseline-adjusted score', () => {
  const { mgr, events } = make();
  // High raw score but not in the Upside Down → no reveal.
  mgr.tryReveal('vecna', PLAYING({ totalScore: 9999, upsideDownActive: false }));
  expect(events).toHaveLength(0);
  // In Upside Down but score-since-entry < threshold → no reveal.
  mgr.tryReveal('vecna', PLAYING({ totalScore: 5000, upsideDownActive: true, upsideDownScoreBaseline: 4000 }));
  expect(events).toHaveLength(0);
  // score - baseline >= 3000 → reveal.
  mgr.tryReveal('vecna', PLAYING({ totalScore: 7000, upsideDownActive: true, upsideDownScoreBaseline: 4000 }));
  expect(events).toEqual([{ type: 'BOSS_REVEAL', bossId: 'vecna', scoreIncrement: 200 }]);
});

test('mutual exclusion: cannot reveal a second boss while another fight is active', () => {
  const { mgr, events } = make();
  mgr.tryReveal('demogorgon', PLAYING({ totalScore: 3000 })); // demogorgon fight now active
  mgr.tryReveal('vecna', PLAYING({ totalScore: 7000, upsideDownActive: true, upsideDownScoreBaseline: 4000 }));
  expect(events).toHaveLength(1); // vecna blocked
  // Demogorgon fight ends → vecna may now reveal.
  mgr.setFightActive('demogorgon', false);
  mgr.tryReveal('vecna', PLAYING({ totalScore: 7000, upsideDownActive: true, upsideDownScoreBaseline: 4000 }));
  expect(events).toHaveLength(2);
  expect(events[1]).toEqual({ type: 'BOSS_REVEAL', bossId: 'vecna', scoreIncrement: 200 });
});

test('handleTargetCollision routes by collider role and emits a hit', async () => {
  // The manager uses the sensor's default 450ms hit cooldown, gated on
  // performance.now(); in a fresh process the clock can start below 450ms, so
  // wait past that window to let the first hit through deterministically.
  await new Promise((r) => setTimeout(r, 500));
  const { mgr, events } = make();
  mgr.beginFight('demogorgon', true); // fightActive + targetArmed
  const handled = mgr.handleTargetCollision('demogorgon_target', true, 'playing');
  expect(handled).toBe(true);
  expect(events).toEqual([{ type: 'BOSS_TARGET_HIT', bossId: 'demogorgon', hitCount: 1, scoreIncrement: 250 }]);
});

test('handleTargetCollision ignores unknown roles', () => {
  const { mgr } = make();
  expect(mgr.handleTargetCollision('not_a_boss', true, 'playing')).toBe(false);
});

test('getBossByColliderRole maps roles to definitions', () => {
  expect(getBossByColliderRole('demogorgon_target')?.id).toBe('demogorgon');
  expect(getBossByColliderRole('vecna_target')?.id).toBe('vecna');
  expect(getBossByColliderRole('nope')).toBeUndefined();
});
