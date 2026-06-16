import type { BossCameraCinematicConfig } from '@pinball/game-engine'
import {
  VECNA_SPAWN,
  VECNA_WALK_DURATION,
  VECNA_WALK_SETTLE_FACING,
} from './systems/VecnaConstants'

const BOSS_FACE_DIR = { x: -0.52, y: 0.2, z: 0.83 }

export const DEMOGORGON_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.06,
  zoomInDuration: 1.55,
  faceDirToCamera: BOSS_FACE_DIR,
  holdDuration: 1.25,
  zoomOutDuration: 1.1,
  distanceScale: 0.54,
}

export const DEMOGORGON_VICTORY_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.028,
  zoomInDuration: 0.28,
  holdDuration: 0.55,
  zoomOutDuration: 0.38,
  distanceScale: 0.68,
}

export const VECNA_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.06,
  panFrom: { x: VECNA_SPAWN.x, y: 1.012, z: VECNA_SPAWN.z },
  zoomInDuration: VECNA_WALK_DURATION,
  holdDuration: VECNA_WALK_SETTLE_FACING + 0.5,
  zoomOutDuration: 1.1,
  distanceScale: 0.54,
  faceDirToCamera: BOSS_FACE_DIR,
  panEasing: 'linear',
}

export const VECNA_VICTORY_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.035,
  zoomInDuration: 0.3,
  holdDuration: 0.55,
  zoomOutDuration: 0.4,
  distanceScale: 0.72,
}
