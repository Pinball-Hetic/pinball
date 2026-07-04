import { DEFAULT_BOSS_FACE_DIR, type BossCameraCinematicConfig } from '@pinball/game-engine'

// Camera direction → boss face (same as ST for consistency).
const BOSS_FACE_DIR = DEFAULT_BOSS_FACE_DIR

// ── Ganondorf (normal world) ──────────────────────────────────────────────

export const GANONDORF_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.06,
  faceDirToCamera: BOSS_FACE_DIR,
  zoomInDuration: 1.5,
  holdDuration: 1.2,
  zoomOutDuration: 1.0,
  distanceScale: 0.54,
}

export const GANONDORF_VICTORY_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.03,
  zoomInDuration: 0.28,
  holdDuration: 0.55,
  zoomOutDuration: 0.4,
  distanceScale: 0.68,
}

// ── Dark Link (Sacred Realm) ──────────────────────────────────────────────

export const DARK_LINK_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.07,
  faceDirToCamera: BOSS_FACE_DIR,
  zoomInDuration: 1.6,
  holdDuration: 1.3,
  zoomOutDuration: 1.1,
  distanceScale: 0.52,
}

export const DARK_LINK_VICTORY_CAMERA_CINEMATIC: BossCameraCinematicConfig = {
  lookAtLift: 0.03,
  zoomInDuration: 0.3,
  holdDuration: 0.6,
  zoomOutDuration: 0.4,
  distanceScale: 0.7,
}
