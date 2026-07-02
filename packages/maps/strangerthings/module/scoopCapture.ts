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
  /** impulsion de sortie (à-coup) appliquée au body à l'éjection — À TUNER au smoke */
  kickImpulse: { x: number; y: number; z: number };
}

// Défauts tunables au smoke : capture 1.5 s, ×2 pendant 5 s, kick vers le
// terrain (−x léger, +y pour décoller du trou, +z vers les flippers).
export const DEFAULT_SCOOP_CONFIG: ScoopConfig = {
  holdMs: 1500,
  multiplier: 2,
  multiplierMs: 5000,
  kickImpulse: { x: -0.02, y: 0.015, z: 0.06 },
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
