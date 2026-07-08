import { mapAsset } from '../manifest'

export const DARK_LINK_MODEL_URL          = mapAsset('playfield/darklink.glb')
export const DARK_LINK_MODEL_HEIGHT       = 0.19
export const DARK_LINK_MODEL_YAW          = 0
export const DARK_LINK_MODEL_FOOT_LIFT    = 0.024
export const DARK_LINK_MODEL_FLOOR_CLEARANCE = 0.006
export const DARK_LINK_MODEL_FIT_FRAMES   = 8

// Clip names in darklink.glb
export const DARK_LINK_ANIM_WALK    = 'walk'
export const DARK_LINK_ANIM_IDLE    = 'idle'
export const DARK_LINK_ANIM_HIT     = 'hit'
export const DARK_LINK_ANIM_DEAD    = 'dead'

// Blender project FPS (Output Properties > Frame Rate).
export const DARK_LINK_ANIM_FPS = 24
// Exact frame ranges (Manual Frame Range of each Action in Blender).
export const DARK_LINK_ANIM_WALK_FRAMES = { start: 1,  end: 25 } as const
export const DARK_LINK_ANIM_IDLE_FRAMES = { start: 1,  end: 89 } as const
export const DARK_LINK_ANIM_HIT_FRAMES  = { start: 40, end: 70 } as const
export const DARK_LINK_ANIM_DEAD_FRAMES = { start: 20, end: 50 } as const

export const DARK_LINK_WALK_CLIP_DURATION = 1.0   // seconds
export const DARK_LINK_WALK_CYCLES        = 2.2
export const DARK_LINK_WALK_DURATION      = DARK_LINK_WALK_CLIP_DURATION * DARK_LINK_WALK_CYCLES
export const DARK_LINK_WALK_SETTLE_FACING = 0.35
export const DARK_LINK_WALK_FADE_OUT      = 0.2

export const DARK_LINK_SPAWN = { x: 0, z: -0.32 } as const

// Delay before the RETURN portal activates after Dark Link's defeat: on the
// fatal hit the ball is stuck to the boss, so activating immediately would
// suck it in instead of leaving it in play.
export const RETURN_PORTAL_REVEAL_DELAY_S = 5

