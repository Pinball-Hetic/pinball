const HIT_FLASH_DURATION = 0.18;
const PULSE_SPEED = 2.2;
const PULSE_AMP = 0.14;
const PULSE_BASE = 0.82;
const HIT_BOOST = 1.5;

/** Duration (seconds) of the hit flash used by the walk-boss actors. */
export const WALK_BOSS_HIT_FLASH_DURATION = HIT_FLASH_DURATION;

/** Hit flash intensity applied on a normal hit. */
export const WALK_BOSS_HIT_FLASH = 0.18;

/** Hit flash intensity applied on the victory/dead finisher. */
export const WALK_BOSS_FINISHER_FLASH = 0.28;

/**
 * Pure glow pulse multiplier shared verbatim by the walk-boss target visuals
 * (Vecna / Dark Link): pulse = (0.82 + sin(t*2.2)*0.14) * (hitFlash>0 ? 1.5 : 1).
 * NB: distinct from BossActorAnimator's static-boss pulse (2.5 / 0.12 / 1.4).
 */
export function walkBossPulse(pulseT: number, hitFlash: number): number {
  const hitBoost = hitFlash > 0 ? HIT_BOOST : 1;
  return (PULSE_BASE + Math.sin(pulseT * PULSE_SPEED) * PULSE_AMP) * hitBoost;
}

/**
 * Pure anchor scale during a hit flash: 1 + (hitFlash/0.18)*scaleBoost.
 * scaleBoost is per-boss (Vecna 0.12, Dark Link 0.10).
 */
export function walkBossScale(hitFlash: number, scaleBoost: number): number {
  return 1 + (hitFlash / HIT_FLASH_DURATION) * scaleBoost;
}
