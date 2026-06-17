import { mapAsset } from '../manifest'

export const GANONDORF_MODEL_URL = mapAsset('playfield/ganondorf.glb')
export const GANONDORF_MODEL_HEIGHT = 0.2
export const GANONDORF_MODEL_YAW = 0
export const GANONDORF_MODEL_FOOT_LIFT = 0.026
export const GANONDORF_MODEL_FLOOR_CLEARANCE = 0.006
export const GANONDORF_MODEL_FIT_FRAMES = 8

// Animations disponibles dans le GLB (export Blender "Export all armature actions").
export const GANONDORF_ANIM_IDLE             = 'Idle'
export const GANONDORF_ANIM_HIT              = 'hit'
export const GANONDORF_ANIM_VICTORY          = 'death'
export const GANONDORF_ANIM_VICTORY_FALLBACK = 'death'
