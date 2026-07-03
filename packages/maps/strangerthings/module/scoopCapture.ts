// Mécanique du trou scoop (saucer) : arme au contact, capture SEULEMENT une
// bille posée (dwell), puis récompenses → hold → kick (téléport-eject).
// State machine PURE (temps en ms), testable sans Three/Rapier.
//
// Pourquoi le dwell : le capteur est à hauteur de bille roulante, dans un
// couloir de passage (rampe rocket). Sans dwell, toute bille qui TRAVERSE la
// zone déclenchait la capture (gel + téléport en plein jeu = « impulsions »
// irréalistes). Un vrai saucer ne capture que la bille qui s'y pose.

export interface ScoopConfig {
  /** temps de présence continue dans la zone avant capture (ms) */
  armDwellMs: number;
  /** rayon (m) autour du capteur dans lequel la bille doit rester pour capturer */
  captureRadius: number;
  /** vitesse (m/s) sous laquelle la bille est considérée « posée » */
  settleSpeed: number;
  /** durée de capture avant éjection (ms) — le temps de l'anim */
  holdMs: number;
  /** valeur du multiplicateur accordé */
  multiplier: number;
  /** durée du multiplicateur (ms) */
  multiplierMs: number;
  /**
   * Téléport-eject (standard flipper) : à l'éjection la bille est REPLACÉE à
   * `ejectPos` (absolu, posée sur la surface via ballCenterOnSurface) avec une
   * vitesse de sortie directe. Aucune impulse ne sort d'un trou GLB profond.
   * Même pattern que les portails (spawnFromAlternateWorld).
   */
  ejectPos: { x: number; z: number };
  /** vitesse de sortie (m/s) posée telle quelle (setLinvel) — À TUNER au smoke */
  ejectVelocity: { x: number; y: number; z: number };
}

// Défauts tunables au smoke. Sortie : position pointée EN 3D par l'auteur de la
// map (0.143, −0.172), projetée vers la GAUCHE (−x). (y observé 1.041 =
// ballCenterOnSurface(−0.172) → formule conservée.)
export const DEFAULT_SCOOP_CONFIG: ScoopConfig = {
  armDwellMs: 300,
  captureRadius: 0.03,
  settleSpeed: 0.25,
  holdMs: 1500,
  multiplier: 2,
  multiplierMs: 5000,
  ejectPos: { x: 0.143, z: -0.172 },
  ejectVelocity: { x: -0.6, y: 0, z: 0 },
};

/**
 * Phase rendue à chaque tick :
 * - idle    : rien à faire
 * - armed   : contact eu lieu, on attend que la bille se pose (ou reparte)
 * - capture : transition armed→hold (UNE frame) — le module donne les récompenses
 * - hold    : tenir la bille au trou
 * - eject   : kick de sortie (UNE frame)
 */
export type ScoopPhase = 'idle' | 'armed' | 'capture' | 'hold' | 'eject';

export interface ScoopBallState {
  /** bille dans le rayon de capture du capteur */
  inZone: boolean;
  /** vitesse ≤ settleSpeed */
  slow: boolean;
}

export interface ScoopCapture {
  /** true pendant le hold (le playfield gèle la physique sur ce flag) */
  isHolding(): boolean;
  /** contact capteur (SCOOP_ENTER) → arme le dwell (no-op si déjà armé/capturé) */
  arm(): void;
  /** avance d'une frame ; cf. ScoopPhase */
  tick(dtMs: number, ball: ScoopBallState): ScoopPhase;
  reset(): void;
  readonly config: ScoopConfig;
}

export function createScoopCapture(config: ScoopConfig = DEFAULT_SCOOP_CONFIG): ScoopCapture {
  type State = 'idle' | 'armed' | 'hold';
  let state: State = 'idle';
  let dwellRemaining = 0;
  let holdRemaining = 0;

  return {
    config,
    isHolding: () => state === 'hold',
    arm() {
      if (state !== 'idle') return;
      state = 'armed';
      dwellRemaining = config.armDwellMs;
    },
    tick(dtMs, ball) {
      if (state === 'idle') return 'idle';

      if (state === 'armed') {
        // Bille repartie → flythrough : désarme sans aucun effet.
        if (!ball.inZone) {
          state = 'idle';
          return 'idle';
        }
        // Le dwell ne compte que bille posée (lente) dans la zone.
        if (ball.slow) dwellRemaining -= dtMs;
        if (dwellRemaining > 0) return 'armed';
        state = 'hold';
        holdRemaining = config.holdMs;
        return 'capture'; // une frame : le module donne les récompenses ici
      }

      // hold
      holdRemaining -= dtMs;
      if (holdRemaining > 0) return 'hold';
      state = 'idle';
      return 'eject';
    },
    reset() {
      state = 'idle';
      dwellRemaining = 0;
      holdRemaining = 0;
    },
  };
}
