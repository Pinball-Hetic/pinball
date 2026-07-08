import { test, expect } from 'bun:test';
import { BossTargetSensor } from '../../src/infrastructure/BossTargetSensor';

function collector() {
  const hits: number[] = [];
  return { hits, opts: (over: { maxHits?: number; hitCooldownMs?: number } = {}) => ({
    maxHits: 5,
    hitCooldownMs: 0,
    onHit: (h: number) => hits.push(h),
    ...over,
  }) };
}

test('no hit unless fight active AND target armed', () => {
  const s = new BossTargetSensor();
  const { hits, opts } = collector();
  s.handleCollision(true, 'playing', opts()); // neither active nor armed
  s.setFightActive(true); // active but not armed
  s.handleCollision(true, 'playing', opts());
  expect(hits).toHaveLength(0);
});

test('counts a hit once armed and active', () => {
  const s = new BossTargetSensor();
  const { hits, opts } = collector();
  s.beginFight(true); // fightActive + targetArmed
  s.handleCollision(true, 'playing', opts());
  expect(hits).toEqual([1]);
});

test('per-target cooldown blocks a rapid second hit', () => {
  const s = new BossTargetSensor();
  const { hits, opts } = collector();
  s.beginFight(true);
  s.handleCollision(true, 'playing', opts({ hitCooldownMs: 0 })); // first always fires
  s.handleCollision(true, 'playing', opts({ hitCooldownMs: 10000 })); // <10s later → ignored
  expect(hits).toEqual([1]);
});

test('latchIgnore: arming while the ball is already inside suppresses the stale hit until it leaves', () => {
  const s = new BossTargetSensor();
  const { hits, opts } = collector();
  s.setFightActive(true);
  s.handleCollision(true, 'playing', opts()); // ball enters before armed → no hit
  s.setTargetArmed(true); // armed while inside → latch
  s.handleCollision(true, 'playing', opts()); // still inside → latched, no hit
  expect(hits).toHaveLength(0);
  s.handleCollision(false, 'playing', opts()); // ball leaves → clears latch
  s.handleCollision(true, 'playing', opts()); // fresh entry → counts
  expect(hits).toEqual([1]);
});

test('auto-disables the fight once maxHits reached', () => {
  const s = new BossTargetSensor();
  const { hits, opts } = collector();
  s.beginFight(true);
  s.handleCollision(true, 'playing', opts({ maxHits: 2 }));
  s.handleCollision(true, 'playing', opts({ maxHits: 2 }));
  s.handleCollision(true, 'playing', opts({ maxHits: 2 })); // fight over → ignored
  expect(hits).toEqual([1, 2]);
  expect(s.fightActive).toBe(false);
  expect(s.targetArmed).toBe(false);
});

test('injected clock: two hits across the cooldown boundary (régression)', () => {
  // Regression: BossTargetSensor called performance.now() directly while the
  // rest of the subsystem injects a clock. With the injected clock, two hits
  // separated by the cooldown both count — deterministic.
  const clock = { t: 1000 };
  const s = new BossTargetSensor(() => clock.t);
  const { hits, opts } = collector();
  s.beginFight(true);
  s.handleCollision(true, 'playing', opts({ hitCooldownMs: 450 })); // t=1000 → hit 1
  s.handleCollision(false, 'playing', opts({ hitCooldownMs: 450 })); // ball leaves
  clock.t = 1449; // < cooldown depuis t=1000
  s.handleCollision(true, 'playing', opts({ hitCooldownMs: 450 })); // ignoré
  expect(hits).toEqual([1]);
  clock.t = 1450; // frontière exacte du cooldown
  s.handleCollision(false, 'playing', opts({ hitCooldownMs: 450 }));
  s.handleCollision(true, 'playing', opts({ hitCooldownMs: 450 })); // hit 2
  expect(hits).toEqual([1, 2]);
});

test('no hit outside the playing state', () => {
  const s = new BossTargetSensor();
  const { hits, opts } = collector();
  s.beginFight(true);
  s.handleCollision(true, 'idle', opts());
  expect(hits).toHaveLength(0);
});
