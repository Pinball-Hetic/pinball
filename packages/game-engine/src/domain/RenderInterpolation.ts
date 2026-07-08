export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

// Max plausible distance the ball travels in one physics step is
// BALL_MAX_SPEED (7 m/s) × SIM_TIMESTEP (1/98 s) ≈ 0.071 m. Beyond this is an
// external teleport (setTranslation from scoop/boss hold/debug drag/locks);
// rendering must snap instead of lerping.
export const BALL_INTERPOLATION_TELEPORT_DIST = 0.08;

export function lerpVec3(prev: Vec3Like, curr: Vec3Like, alpha: number, out: Vec3Like): Vec3Like {
  const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  out.x = prev.x + (curr.x - prev.x) * t;
  out.y = prev.y + (curr.y - prev.y) * t;
  out.z = prev.z + (curr.z - prev.z) * t;
  return out;
}
