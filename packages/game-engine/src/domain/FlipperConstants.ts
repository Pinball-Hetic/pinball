// ── Géométrie ────────────────────────────────────────────────────────────────
export const SWING_RAD    = 0.75;
export const SWING_SMOOTH = 0.78;
export const FLIPPER_SWING_AXIS: 'x' | 'y' | 'z' = 'x';
export const HINGE_INSET_FROM_EDGE = 0.18;

// Zone flipper (PlayfieldGeometry + BallDiagnostics)
export const FLIPPER_Z_MIN = 0.20;
export const FLIPPER_Z_MAX = 0.33;
export const FLIPPER_LEFT_X_MIN  = -0.085;
export const FLIPPER_LEFT_X_MAX  =  0.015;
export const FLIPPER_RIGHT_X_MIN = -0.015;
export const FLIPPER_RIGHT_X_MAX =  0.055;

// ── Physique contact ──────────────────────────────────────────────────────────
export const FLIPPER_POWER       = 0.138;   // conservé pour compatibilité (inutilisé)
export const FLIPPER_RESTITUTION = 0.82;
export const FLIPPER_FRICTION    = 0.05;

// ── Vitesse minimale garantie (garantie de lancement uniforme) ────────────────
/** Vitesse Z minimale garantie quand le flipper frappe la balle (m/s, négatif = haut du tapis). */
export const FLIPPER_MIN_LAUNCH_VZ = -2.8;

// ── Jeu ──────────────────────────────────────────────────────────────────────
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
