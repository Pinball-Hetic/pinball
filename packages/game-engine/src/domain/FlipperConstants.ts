export const SWING_RAD    = 0.75;
export const SWING_SMOOTH = 0.78;
export const HINGE_INSET_FROM_EDGE = 0.0;

export const FLIPPER_Z_MIN = 0.20;
export const FLIPPER_Z_MAX = 0.33;

export const FLIPPER_POWER       = 0.138;
export const FLIPPER_RESTITUTION = 0.82;
export const FLIPPER_FRICTION    = 0.05;

export const FLIPPER_MIN_LAUNCH_VZ = -2.8;
export const FLIPPER_MIN_LAUNCH_ANGVEL = 0.24;
export const FLIPPER_LAUNCH_VX_ATTENUATION = 0.3;

export const INITIAL_LIVES    = 3;
export const PLUNGER_CHARGE_MS = 1800;
export const PLUNGER_MIN_FACTOR = 0.6;
export const PLUNGER_MAX_FACTOR = 1.0;

export function plungerChargeProgress(nowMs: number, chargeStartMs: number): number {
  return Math.min(1, (nowMs - chargeStartMs) / PLUNGER_CHARGE_MS) ** 1.15;
}

export function plungerLaunchFactor(chargeProgress: number): number {
  return PLUNGER_MIN_FACTOR + (PLUNGER_MAX_FACTOR - PLUNGER_MIN_FACTOR) * chargeProgress;
}
