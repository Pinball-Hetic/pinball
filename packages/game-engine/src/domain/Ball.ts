// Bille — GLB ball size=[0.0269] → radius 0.01345, +10% margin
export const BALL_RADIUS          = 0.01474;
export const BALL_MASS            = 0.08;
export const BALL_RESTITUTION     = 0.4;
export const BALL_FRICTION        = 0.1;
export const BALL_LINEAR_DAMPING  = 0.02;
export const BALL_ANGULAR_DAMPING = 0.02;

// Spawn — lane: left sep X≈0.208, right wall X=0.265, center≈0.236
export const BALL_SPAWN_POSITION = { x: 0.235, y: 1.010, z: 0.1610 } as const;

// Plunger
export const PLUNGER_IMPULSE_Z = -2.4;

// Playfield — GLB: center=[0,1.0171,-0.0671] size=[0.53,0.1019,0.9697]
// Surface is already tilted in GLB geometry → gravity stays straight down
export const PLAYFIELD_TILT_DEG  = 6.5;
export const PLAYFIELD_SURFACE_Y = 1.0681; // top of playfield mesh = 1.0171 + 0.1019/2

export const BUMPER_POSITIONS = [
  { x: -0.020586, y: 1.0482, z: -0.1967 },
  { x: -0.097406, y: 1.0621, z: -0.30509 },
  { x:  0.059483, y: 1.0621, z: -0.30509 },
] as const;
export const DEMOGORGON_SENSOR = {
  x: -0.0195,
  y: 1.0575,
  z: -0.269,
} as const;

export const DEMOGORGON_TARGET = {
  x: 0,
  y: 1.012,
  z: -0.02,
} as const;

export const DEMOGORGON_TARGET_HITS = 2;

export const BUMPER_RADIUS       = 0.038;
export const BUMPER_RESTITUTION  = 0.3;
export const BUMPER_EJECT_IMPULSE = 0.09;

// Walls — from GLB playfield mesh extents
export const WALL_LEFT_X    = -0.265;
export const WALL_RIGHT_X   =  0.265;
export const WALL_TOP_Z     = -0.552;
export const WALL_BOTTOM_Z  =  0.418;
export const WALL_HEIGHT    =  0.06;
export const WALL_THICKNESS =  0.006;

// Drain — exact GLB switch_out center
export const DRAIN_SWITCH_CENTER = { x: -0.0219, y: 0.9990, z: 0.0989 } as const;

// Slingshots — from GLB slingshot center=[−0.0225,1.032,0.1162] size=[0.2881,_,0.1132]
// Y lowered to surface level so ball doesn't land on top
export const SLINGSHOT_LEFT_CENTER  = { x: -0.166, y: 1.005, z: 0.116 } as const;
export const SLINGSHOT_RIGHT_CENTER = { x:  0.121, y: 1.005, z: 0.116 } as const;
export const SLINGSHOT_RESTITUTION  = 0.8;

// Pop bumper zone sensors — from GLB switch positions
export const POP_ZONE_SENSORS = [
  { x: -0.0225, y: 1.057, z: -0.448 },
  { x: -0.087,  y: 1.056, z: -0.438 },
  { x:  0.042,  y: 1.056, z: -0.438 },
] as const;

// Rocket ramp sensor
export const ROCKET_SENSOR = { x: 0.193, y: 1.021, z: -0.130 } as const;

// Drop targets — from GLB
export const DROP_TARGETS = [
  { id: 'drop_left_1',  x: -0.209, y: 1.022, z: -0.019, side: 'left' as const },
  { id: 'drop_left_2',  x: -0.205, y: 1.026, z: -0.049, side: 'left' as const },
  { id: 'drop_right_1', x:  0.157, y: 1.024, z: -0.041, side: 'right' as const },
  { id: 'drop_right_2', x:  0.148, y: 1.028, z: -0.077, side: 'right' as const },
  { id: 'drop_right_3', x:  0.137, y: 1.032, z: -0.114, side: 'right' as const },
] as const;
