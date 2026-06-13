export type BossCameraFocus = {
  x: number;
  y: number;
  z: number;
};

export type BossCameraCinematicConfig = {
  lookAtLift: number;
  panFrom?: BossCameraFocus;
  zoomInDuration: number;
  holdDuration: number;
  zoomOutDuration: number;
  distanceScale: number;
};

export const CAMERA_CINEMATIC_DISTANCE_MIN = 0.05;
export const CAMERA_CINEMATIC_FOV_MIN = 35;
export const CAMERA_CINEMATIC_FOV_MAX = 55;
export const PORTRAIT_CINEMATIC_DISTANCE_MUL = 1.22;

export function cinematicZoomDistance(
  baseDistance: number,
  distanceScale: number,
  portraitFill: boolean,
): number {
  const mul = portraitFill ? PORTRAIT_CINEMATIC_DISTANCE_MUL : 1;
  return Math.max(CAMERA_CINEMATIC_DISTANCE_MIN, baseDistance * distanceScale * mul);
}
