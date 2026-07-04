// Render interpolation: physics runs at 60 real steps/s but the screen may
// refresh at 120/144 Hz. Rendering lerps the ball position between the last
// two physics states — purely visual, zero impact on the simulation.

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Max plausible distance the ball can travel in ONE physics step:
 * BALL_MAX_SPEED (7 m/s) × SIM_TIMESTEP (1/98 s) ≈ 0.071 m. Anything beyond is
 * necessarily an external teleport (direct setTranslation: map scoop, boss
 * intro hold, debug drag, stepBallSync locks) → rendering must snap instead of
 * lerping, or the ball streaks across the playfield for a frame.
 */
export const BALL_INTERPOLATION_TELEPORT_DIST = 0.08;

/**
 * Per-component lerp, alpha clamped to [0,1] (never extrapolates).
 * Writes into the caller-provided `out` — zero allocation in the hot path.
 */
export function lerpVec3(prev: Vec3Like, curr: Vec3Like, alpha: number, out: Vec3Like): Vec3Like {
  const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  out.x = prev.x + (curr.x - prev.x) * t;
  out.y = prev.y + (curr.y - prev.y) * t;
  out.z = prev.z + (curr.z - prev.z) * t;
  return out;
}
