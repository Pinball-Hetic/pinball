// The dwell requirement is load-bearing: the sensor sits at rolling-ball
// height in a pass-through lane, so without it any ball crossing the zone
// would trigger a capture.

export interface ScoopConfig {
  armDwellMs: number;
  captureRadius: number; // metres
  settleSpeed: number; // m/s
  holdMs: number;
  multiplier: number;
  multiplierMs: number;
  // On eject the ball is teleported (setTranslation) to ejectPos, not
  // impulsed — no impulse escapes a deep GLB hole.
  ejectPos: { x: number; z: number };
  ejectVelocity: { x: number; y: number; z: number }; // TODO: tune at smoke test
}

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

// 'capture' and 'eject' are each returned for a single frame.
export type ScoopPhase = 'idle' | 'armed' | 'capture' | 'hold' | 'eject';

export interface ScoopBallState {
  inZone: boolean;
  slow: boolean;
}

export interface ScoopCapture {
  isHolding(): boolean;
  arm(): void;
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
        if (!ball.inZone) {
          state = 'idle';
          return 'idle';
        }
        if (ball.slow) dwellRemaining -= dtMs;
        if (dwellRemaining > 0) return 'armed';
        state = 'hold';
        holdRemaining = config.holdMs;
        return 'capture';
      }

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
