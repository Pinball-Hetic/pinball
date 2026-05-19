export const SWING_RAD = 0.65;
export const SWING_SMOOTH = 0.42;
export const HINGE_INSET_FROM_EDGE = 0.18;
/** Impulsion manuelle au moment du flip (évite les tirs trop violents avec la restitution). */
export const FLIPPER_POWER = 0.138; // +25 % vs 0.11
/** Rebond du collider flipper (Rapier) — bas = on s'appuie surtout sur FLIPPER_POWER. */
export const FLIPPER_RESTITUTION = 0.22;
/** Friction du collider flipper — bas pour que la balle glisse sans accrocher. */
export const FLIPPER_FRICTION = 0.05;
export const FLIPPER_TRIGGER = 0.15;
export const FLIPPER_Z_MIN = 0.20;
export const FLIPPER_Z_MAX = 0.33;
// Zone de hit : seulement la partie active (pointe), pas la charnière (~40% côté pivot exclus)
export const FLIPPER_LEFT_X_MIN = -0.085;  // was -0.145 — coupe la zone près du pivot gauche
export const FLIPPER_LEFT_X_MAX = 0.015;
export const FLIPPER_LEFT_MID_X = -0.035;  // centre de la zone active gauche
export const FLIPPER_RIGHT_X_MIN = -0.015;
export const FLIPPER_RIGHT_X_MAX = 0.055;  // was 0.10 — coupe la zone près du pivot droit
export const FLIPPER_RIGHT_MID_X = 0.020;  // centre de la zone active droite
export const INITIAL_LIVES = 3;
export const PLUNGER_CHARGE_MS = 1800;
export const PLUNGER_MIN_FACTOR = 0.32;
export const PLUNGER_MAX_FACTOR = 1.0;
