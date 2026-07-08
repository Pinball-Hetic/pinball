const HIT_FLASH_DURATION = 0.18;
const PULSE_SPEED = 2.2;
const PULSE_AMP = 0.14;
const PULSE_BASE = 0.82;
const HIT_BOOST = 1.5;

export const WALK_BOSS_HIT_FLASH_DURATION = HIT_FLASH_DURATION;

export const WALK_BOSS_HIT_FLASH = 0.18;

export const WALK_BOSS_FINISHER_FLASH = 0.28;

export function walkBossPulse(pulseT: number, hitFlash: number): number {
  const hitBoost = hitFlash > 0 ? HIT_BOOST : 1;
  return (PULSE_BASE + Math.sin(pulseT * PULSE_SPEED) * PULSE_AMP) * hitBoost;
}

export function walkBossScale(hitFlash: number, scaleBoost: number): number {
  return 1 + (hitFlash / HIT_FLASH_DURATION) * scaleBoost;
}
