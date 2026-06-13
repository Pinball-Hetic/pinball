import type { BossCameraCinematicConfig } from '@pinball/game-engine'
import {
  VECNA_SPAWN,
  VECNA_WALK_DURATION,
  VECNA_WALK_SETTLE_FACING,
} from './systems/VecnaConstants'

export const DEMOGORGON_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.028,
  panFrom: { x: -0.0195, y: 1.012, z: -0.269 },
  zoomInDuration: 1.75,
  holdDuration: 1.1,
  zoomOutDuration: 1.05,
  distanceScale: 0.58,
}

export const DEMOGORGON_VICTORY_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.028,
  zoomInDuration: 0.28,
  holdDuration: 0.55,
  zoomOutDuration: 0.38,
  distanceScale: 0.68,
}

export const VECNA_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.035,
  panFrom: { x: VECNA_SPAWN.x, y: 1.012, z: VECNA_SPAWN.z },
  zoomInDuration: VECNA_WALK_DURATION + VECNA_WALK_SETTLE_FACING + 0.35,
  holdDuration: 1.0,
  zoomOutDuration: 1.05,
  distanceScale: 0.58,
}

export const VECNA_VICTORY_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.035,
  zoomInDuration: 0.3,
  holdDuration: 0.55,
  zoomOutDuration: 0.4,
  distanceScale: 0.72,
}
