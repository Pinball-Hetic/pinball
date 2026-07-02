// Mécanique du trou scoop (saucer) : capture → récompenses → hold → kick.
// State machine PURE (temps en ms), testable sans Three/Rapier. Le module ST la
// pilote : onGameEvent(SCOOP_ENTER) → start() + récompenses ; update(dt) →
// tick() dicte tenir la bille (hold) puis l'éjecter (eject) une fois.

export interface ScoopConfig {
  /** durée de capture avant éjection (ms) — le temps de l'anim */
  holdMs: number;
  /** valeur du multiplicateur accordé */
  multiplier: number;
  /** durée du multiplicateur (ms) */
  multiplierMs: number;
  /**
   * Téléport-eject (standard flipper) : à l'éjection la bille est REPLACÉE au
   * bord du trou (offset x/z depuis le capteur, posée sur la surface) avec une
   * vitesse de sortie directe. Aucune impulse ne sort d'un trou GLB profond
   * (~2 mm de montée pour une impulse raisonnable) — on ne lutte pas contre la
   * géométrie. Même pattern que les portails (spawnFromAlternateWorld).
   */
  ejectOffset: { x: number; z: number };
  /** vitesse de sortie (m/s) posée telle quelle (setLinvel) — À TUNER au smoke */
  ejectVelocity: { x: number; y: number; z: number };
}

// Défauts tunables au smoke : capture 1.5 s, ×2 pendant 5 s.
// Sortie CALCULÉE depuis les bbox monde du GLB (pas au hasard) : le trou
// (0.192, −0.061) est une poche dans le massif wall_middle_right
// (x[0.133,0.219], z[−0.267,+0.023]) — sortie −x bloquée par les drop targets
// (target_right_1 : x[0.149,0.166], z[−0.058,−0.024]). Le massif finit à
// z=+0.023 → on ressort AU SUD dans l'axe du couloir (même x), à z=+0.04,
// zone dégagée qui débouche vers le flipper droit.
export const DEFAULT_SCOOP_CONFIG: ScoopConfig = {
  holdMs: 1500,
  multiplier: 2,
  multiplierMs: 5000,
  ejectOffset: { x: 0, z: 0.101 }, // −0.061 + 0.101 = z +0.04, x inchangé (0.192)
  ejectVelocity: { x: -0.2, y: 0, z: 0.6 },
};

export type ScoopPhase = 'idle' | 'hold' | 'eject';

export interface ScoopCapture {
  isActive(): boolean;
  /** bille tombée dans le trou → démarre la capture (idempotent tant qu'actif) */
  start(): void;
  /** avance d'une frame ; 'hold' = tenir la bille, 'eject' = kick (une fois) */
  tick(dtMs: number): ScoopPhase;
  reset(): void;
  readonly config: ScoopConfig;
}

export function createScoopCapture(config: ScoopConfig = DEFAULT_SCOOP_CONFIG): ScoopCapture {
  let active = false;
  let holdRemaining = 0;

  return {
    config,
    isActive: () => active,
    start() {
      // Idempotent : un 2e SCOOP_ENTER pendant la capture ne relance pas le timer.
      if (active) return;
      active = true;
      holdRemaining = config.holdMs;
    },
    tick(dtMs) {
      if (!active) return 'idle';
      holdRemaining -= dtMs;
      if (holdRemaining > 0) return 'hold';
      active = false;
      return 'eject';
    },
    reset() {
      active = false;
      holdRemaining = 0;
    },
  };
}
