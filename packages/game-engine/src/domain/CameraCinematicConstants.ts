import {
  VECNA_SPAWN,
  VECNA_WALK_DURATION,
  VECNA_WALK_SETTLE_FACING,
} from './VecnaConstants';

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

export const DEMOGORGON_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.028,
  zoomInDuration: 0.5,
  holdDuration: 0.35,
  zoomOutDuration: 0.4,
  distanceScale: 0.74,
};

export const VECNA_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.035,
  panFrom: { x: VECNA_SPAWN.x, y: 1.012, z: VECNA_SPAWN.z },
  zoomInDuration: VECNA_WALK_DURATION + VECNA_WALK_SETTLE_FACING,
  holdDuration: 0.3,
  zoomOutDuration: 0.45,
  distanceScale: 0.78,
};
