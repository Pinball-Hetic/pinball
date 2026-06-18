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

// FPS du projet Blender (Output Properties > Frame Rate).
export const GANONDORF_ANIM_FPS = 24
// Plages de frames exactes (Manual Frame Range de chaque Action dans Blender).
// Nécessaire car le GLB exporte les keyframes en temps absolu — sans subclip,
// Three.js jouerait les frames depuis t=0 au lieu du bon intervalle.
export const GANONDORF_ANIM_IDLE_FRAMES    = { start: 1,  end: 89 } as const
export const GANONDORF_ANIM_HIT_FRAMES     = { start: 40, end: 70 } as const
export const GANONDORF_ANIM_VICTORY_FRAMES = { start: 20, end: 50 } as const
