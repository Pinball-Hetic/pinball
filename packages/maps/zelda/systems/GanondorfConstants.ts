import { mapAsset } from '../manifest'

export const GANONDORF_MODEL_URL = mapAsset('playfield/ganondorf.glb')
export const GANONDORF_MODEL_HEIGHT = 0.2
export const GANONDORF_MODEL_YAW = 0
export const GANONDORF_MODEL_FOOT_LIFT = 0.026
export const GANONDORF_MODEL_FLOOR_CLEARANCE = 0.006
export const GANONDORF_MODEL_FIT_FRAMES = 8

// Animations available in the GLB (Blender "Export all armature actions").
export const GANONDORF_ANIM_IDLE             = 'Idle'
export const GANONDORF_ANIM_HIT              = 'hit'
export const GANONDORF_ANIM_VICTORY          = 'death'
export const GANONDORF_ANIM_VICTORY_FALLBACK = 'death'

// Blender project FPS (Output Properties > Frame Rate).
export const GANONDORF_ANIM_FPS = 24
// Exact frame ranges (Manual Frame Range of each Action in Blender).
// Needed because the GLB exports keyframes in absolute time — without a
// subclip, Three.js would play frames from t=0 instead of the right interval.
export const GANONDORF_ANIM_IDLE_FRAMES    = { start: 1,  end: 89 } as const
export const GANONDORF_ANIM_HIT_FRAMES     = { start: 40, end: 70 } as const
export const GANONDORF_ANIM_VICTORY_FRAMES = { start: 20, end: 50 } as const
