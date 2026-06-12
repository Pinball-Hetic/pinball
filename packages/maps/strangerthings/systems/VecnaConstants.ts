import { mapAsset } from '../manifest';

export const VECNA_MODEL_URL = mapAsset('playfield/vecna.glb');
export const VECNA_MODEL_HEIGHT = 0.2;
export const VECNA_MODEL_YAW = 0;
export const VECNA_MODEL_FOOT_LIFT = 0.026;
export const VECNA_MODEL_FLOOR_CLEARANCE = 0.006;
export const VECNA_MODEL_BIND_HEIGHT = 1.65;
export const VECNA_MODEL_FIT_FRAMES = 8;
export const VECNA_ANIM_WALK = 'walking_man';
export const VECNA_WALK_CLIP_DURATION = 1.07;
export const VECNA_WALK_CYCLES = 2.2;
export const VECNA_WALK_DURATION = VECNA_WALK_CLIP_DURATION * VECNA_WALK_CYCLES;
export const VECNA_WALK_SETTLE_FACING = 0.35;
export const VECNA_WALK_FADE_OUT = 0.2;
export const VECNA_SPAWN = {
  x: 0,
  z: -0.31,
} as const;
