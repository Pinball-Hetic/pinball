// ── Geometry ────────────────────────────────────────────────────────────────
export const SWING_RAD    = 0.75;
export const SWING_SMOOTH = 0.78;
export const HINGE_INSET_FROM_EDGE = 0.0;

// Flipper Z zone (PlayfieldGeometry + BallDiagnostics). X bounds are derived
// from the mesh bboxes at load time (see FlipperZones.ts).
export const FLIPPER_Z_MIN = 0.20;
export const FLIPPER_Z_MAX = 0.33;

// ── Contact physics ──────────────────────────────────────────────────────────
export const FLIPPER_POWER       = 0.138;   // kept for compatibility (unused)
export const FLIPPER_RESTITUTION = 0.82;
export const FLIPPER_FRICTION    = 0.05;

// ── Guaranteed minimum launch speed (uniform launches) ────────────────
/** Guaranteed minimum Z speed when the flipper hits the ball (m/s, negative = up the table). */
export const FLIPPER_MIN_LAUNCH_VZ = -2.8;
/**
 * Flipper upswing angular velocity (rad/s) above which the ball is guaranteed
 * FLIPPER_MIN_LAUNCH_VZ. Normalized to rad/s (was 0.004 rad/frame × 60 = 0.24)
 * → fps-independent.
 */
export const FLIPPER_MIN_LAUNCH_ANGVEL = 0.24;
/**
 * Attenuation factor applied to the X velocity component on a guaranteed
 * launch. Without it, accumulated X produces unrealistic sideways launches;
 * we want launches mostly up the table (−Z).
 */
export const FLIPPER_LAUNCH_VX_ATTENUATION = 0.3;

// ── Game ──────────────────────────────────────────────────────────────────────
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
