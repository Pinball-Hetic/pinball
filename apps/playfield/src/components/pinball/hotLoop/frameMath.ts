// Frame time step (seconds), capped at 50 ms to avoid big physics jumps
// after a stall/background tab. First frame (no previous time) → 16 ms
// (~60 FPS).
export const MAX_FRAME_DT = 0.05;
export const FIRST_FRAME_DT = 0.016;

export function computeFrameDt(prevFrameTime: number, time: number): number {
  if (prevFrameTime <= 0) return FIRST_FRAME_DT;
  return Math.min((time - prevFrameTime) / 1000, MAX_FRAME_DT);
}

// Fire trail intensity [0,1]: 0 outside play, 1 during fever, otherwise a
// linear ramp on combo (0 at combo≤3 → 1 at combo≥10).
export function computeTrailIntensity(
  playing: boolean,
  fever: boolean,
  combo: number,
): number {
  if (!playing) return 0;
  if (fever) return 1;
  return Math.max(0, Math.min(1, (combo - 3) / 7));
}
