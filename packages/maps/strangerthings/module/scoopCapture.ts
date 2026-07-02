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
   * Téléport-eject (standard flipper) : à l'éjection la bille est REPLACÉE à
   * `ejectPos` (absolu, posée sur la surface via ballCenterOnSurface) avec une
   * vitesse de sortie directe. Aucune impulse ne sort d'un trou GLB profond
   * (~2 mm de montée pour une impulse raisonnable) — on ne lutte pas contre la
   * géométrie. Même pattern que les portails (spawnFromAlternateWorld).
   */
  ejectPos: { x: number; z: number };
  /** vitesse de sortie (m/s) posée telle quelle (setLinvel) — À TUNER au smoke */
  ejectVelocity: { x: number; y: number; z: number };
}

// Défauts tunables au smoke : capture 1.5 s, ×2 pendant 5 s.
// Sortie : position pointée EN 3D par l'auteur de la map (0.143, −0.172) —
// nord-ouest du massif wall_middle_right — projetée vers la GAUCHE (−x),
// vers le centre du terrain. (y noté 1.041 en jeu = ballCenterOnSurface(−0.172)
// → formule conservée.)
export const DEFAULT_SCOOP_CONFIG: ScoopConfig = {
  holdMs: 1500,
  multiplier: 2,
  multiplierMs: 5000,
  ejectPos: { x: 0.143, z: -0.172 },
  ejectVelocity: { x: -0.6, y: 0, z: 0 },
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
