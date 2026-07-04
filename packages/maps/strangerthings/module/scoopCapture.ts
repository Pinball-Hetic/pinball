// Scoop hole (saucer) mechanic: arms on contact, captures ONLY a settled
// ball (dwell), then rewards → hold → kick (teleport-eject).
// Pure state machine (time in ms), testable without Three/Rapier.
//
// Why the dwell: the sensor sits at rolling-ball height in a pass-through
// lane (rocket ramp). Without dwell, any ball merely CROSSING the zone
// triggered capture (freeze + teleport mid-play = unrealistic "impulses").
// A real saucer only captures a ball that settles into it.

export interface ScoopConfig {
  /** continuous in-zone time before capture (ms) */
  armDwellMs: number;
  /** radius (m) around the sensor the ball must stay within to capture */
  captureRadius: number;
  /** speed (m/s) below which the ball counts as "settled" */
  settleSpeed: number;
  /** capture duration before eject (ms) — time for the anim */
  holdMs: number;
  /** multiplier value granted */
  multiplier: number;
  /** multiplier duration (ms) */
  multiplierMs: number;
  /**
   * Teleport-eject (pinball standard): on eject the ball is PLACED at
   * `ejectPos` (absolute, resting on the surface via ballCenterOnSurface)
   * with a direct exit velocity. No impulse escapes a deep GLB hole.
   * Same pattern as the portals (spawnFromAlternateWorld).
   */
  ejectPos: { x: number; z: number };
  /** exit velocity (m/s) applied as-is (setLinvel) — TUNE at smoke test */
  ejectVelocity: { x: number; y: number; z: number };
}

// Defaults tunable at smoke test. Exit: position picked in 3D by the map
// author (0.143, −0.172), projected LEFT (−x). (Observed y 1.041 =
// ballCenterOnSurface(−0.172) → formula kept.)
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
 * Phase returned each tick:
 * - idle    : nothing to do
 * - armed   : contact happened, waiting for the ball to settle (or leave)
 * - capture : armed→hold transition (ONE frame) — the module grants rewards
 * - hold    : keep the ball in the hole
 * - eject   : exit kick (ONE frame)
 */
export type ScoopPhase = 'idle' | 'armed' | 'capture' | 'hold' | 'eject';

export interface ScoopBallState {
  /** ball within the sensor capture radius */
  inZone: boolean;
  /** speed ≤ settleSpeed */
  slow: boolean;
}

export interface ScoopCapture {
  /** true during hold (the playfield freezes physics on this flag) */
  isHolding(): boolean;
  /** sensor contact (SCOOP_ENTER) → arms the dwell (no-op if already armed/captured) */
  arm(): void;
  /** advance one frame; see ScoopPhase */
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
        // Ball left → flythrough: disarm with no effect.
        if (!ball.inZone) {
          state = 'idle';
          return 'idle';
        }
        // Dwell only counts while the ball is settled (slow) in the zone.
        if (ball.slow) dwellRemaining -= dtMs;
        if (dwellRemaining > 0) return 'armed';
        state = 'hold';
        holdRemaining = config.holdMs;
        return 'capture'; // one frame: the module grants rewards here
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
