// ── Géométrie ────────────────────────────────────────────────────────────────
export const SWING_RAD    = 0.75;
export const SWING_SMOOTH = 0.78;
export const FLIPPER_SWING_AXIS: 'x' | 'y' | 'z' = 'x';
export const HINGE_INSET_FROM_EDGE = 0.0;

// Réglage fin du pivot des flippers : déplacé dans le layout de la map
// (layout.flipperPivots), injecté dans FlipperSplitter.attachFlipperAtHinge.

// Zone flipper Z (PlayfieldGeometry + BallDiagnostics). Les bornes X sont
// désormais dérivées des bbox mesh au chargement (cf. FlipperZones.ts).
export const FLIPPER_Z_MIN = 0.20;
export const FLIPPER_Z_MAX = 0.33;

// ── Physique contact ──────────────────────────────────────────────────────────
export const FLIPPER_POWER       = 0.138;   // conservé pour compatibilité (inutilisé)
export const FLIPPER_RESTITUTION = 0.82;
export const FLIPPER_FRICTION    = 0.05;

// ── Vitesse minimale garantie (garantie de lancement uniforme) ────────────────
/** Vitesse Z minimale garantie quand le flipper frappe la balle (m/s, négatif = haut du tapis). */
export const FLIPPER_MIN_LAUNCH_VZ = -2.8;
/**
 * Vitesse angulaire de montée du flipper (rad/s) au-dessus de laquelle on
 * garantit FLIPPER_MIN_LAUNCH_VZ à la balle. Normalisé en rad/s (était
 * 0.004 rad/frame × 60 = 0.24) → indépendant du fps.
 */
export const FLIPPER_MIN_LAUNCH_ANGVEL = 0.24;

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
