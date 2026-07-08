export const MAX_FRAME_DT = 0.05;
export const FIRST_FRAME_DT = 0.016;

export function computeFrameDt(prevFrameTime: number, time: number): number {
  if (prevFrameTime <= 0) return FIRST_FRAME_DT;
  return Math.min((time - prevFrameTime) / 1000, MAX_FRAME_DT);
}

export function computeTrailIntensity(
  playing: boolean,
  fever: boolean,
  combo: number,
): number {
  if (!playing) return 0;
  if (fever) return 1;
  return Math.max(0, Math.min(1, (combo - 3) / 7));
}
