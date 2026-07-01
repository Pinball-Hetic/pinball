import { describe, it, expect } from 'bun:test';
import {
  walkBossPulse,
  walkBossScale,
  WALK_BOSS_HIT_FLASH_DURATION,
  WALK_BOSS_HIT_FLASH,
  WALK_BOSS_FINISHER_FLASH,
} from './WalkBossPulse';

describe('walkBossPulse', () => {
  it('is the base curve when not flashing (2.2 speed, 0.14 amp)', () => {
    const t = 1.3;
    const expected = 0.82 + Math.sin(t * 2.2) * 0.14;
    expect(walkBossPulse(t, 0)).toBeCloseTo(expected, 12);
  });

  it('boosts by 1.5x while hit-flashing', () => {
    const t = 0.7;
    const base = 0.82 + Math.sin(t * 2.2) * 0.14;
    expect(walkBossPulse(t, 0.1)).toBeCloseTo(base * 1.5, 12);
  });

  it('does not boost at exactly zero flash', () => {
    expect(walkBossPulse(0, 0)).toBeCloseTo(0.82, 12);
  });
});

describe('walkBossScale', () => {
  it('is 1 with no flash regardless of boost', () => {
    expect(walkBossScale(0, 0.12)).toBe(1);
    expect(walkBossScale(0, 0.1)).toBe(1);
  });

  it('peaks at 1 + boost at full flash duration (Vecna 0.12)', () => {
    expect(walkBossScale(WALK_BOSS_HIT_FLASH_DURATION, 0.12)).toBeCloseTo(1.12, 12);
  });

  it('peaks at 1 + boost at full flash duration (Dark Link 0.10)', () => {
    expect(walkBossScale(WALK_BOSS_HIT_FLASH_DURATION, 0.1)).toBeCloseTo(1.1, 12);
  });

  it('lerps linearly mid-flash', () => {
    expect(walkBossScale(0.09, 0.12)).toBeCloseTo(1.06, 12);
  });
});

describe('walk-boss flash constants', () => {
  it('matches the verbatim values from the former *TargetVisual', () => {
    expect(WALK_BOSS_HIT_FLASH_DURATION).toBe(0.18);
    expect(WALK_BOSS_HIT_FLASH).toBe(0.18);
    expect(WALK_BOSS_FINISHER_FLASH).toBe(0.28);
  });
});
