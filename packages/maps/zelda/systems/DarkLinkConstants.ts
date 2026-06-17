import { mapAsset } from '../manifest'

export const DARK_LINK_MODEL_URL          = mapAsset('playfield/darklink.glb')
export const DARK_LINK_MODEL_HEIGHT       = 0.19
export const DARK_LINK_MODEL_YAW          = 0
export const DARK_LINK_MODEL_FOOT_LIFT    = 0.024
export const DARK_LINK_MODEL_FLOOR_CLEARANCE = 0.006
export const DARK_LINK_MODEL_FIT_FRAMES   = 8

// Noms des clips dans darklink.glb
export const DARK_LINK_ANIM_WALK    = 'walk'
export const DARK_LINK_ANIM_IDLE    = 'idle'
export const DARK_LINK_ANIM_HIT     = 'hit'
export const DARK_LINK_ANIM_DEAD    = 'dead'

// Marche : durée approximative d'un cycle × nb de cycles
export const DARK_LINK_WALK_CLIP_DURATION = 1.0   // secondes
export const DARK_LINK_WALK_CYCLES        = 2.2
export const DARK_LINK_WALK_DURATION      = DARK_LINK_WALK_CLIP_DURATION * DARK_LINK_WALK_CYCLES
export const DARK_LINK_WALK_SETTLE_FACING = 0.35
export const DARK_LINK_WALK_FADE_OUT      = 0.2

// Point de départ (hors champ, Sacred Realm)
export const DARK_LINK_SPAWN = { x: 0, z: -0.32 } as const
