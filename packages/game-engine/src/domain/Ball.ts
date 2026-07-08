export const DEFAULT_BALL_RADIUS = 0.01374;
let _ballRadius = DEFAULT_BALL_RADIUS;
export function getBallRadius(): number { return _ballRadius; }
// Must be called before any physics setup.
export function configureBallRadius(r: number): void { _ballRadius = r; }
export function resetBallRadius(): void { _ballRadius = DEFAULT_BALL_RADIUS; }
export const BALL_RADIUS = DEFAULT_BALL_RADIUS;
export const BALL_MASS            = 0.08;
export const BALL_RESTITUTION     = 0.4;
export const BALL_FRICTION        = 0.05;
export const BALL_LINEAR_DAMPING  = 0.04;
export const BALL_ANGULAR_DAMPING = 0.05;

export const BALL_MAX_SPEED = 7.0;

export const PLUNGER_IMPULSE_Z = -0.26;

// Surface is already tilted in the GLB geometry, so gravity stays straight down.
export const PLAYFIELD_TILT_DEG  = 6.5;
export const PLAYFIELD_SURFACE_Y = 1.0681;

export const PORTAL_HOLE_RADIUS = 0.02;
export const PORTAL_COVER_RADIUS = 0.021;
export const PORTAL_SENSOR_RADIUS = 0.017;
export const PORTAL_MAGNET_RADIUS = 0.058;
export const PORTAL_MAGNET_STRENGTH = 0.0055;
export const PORTAL_ENTER_SCORE = 500;
export const RETURN_PORTAL_ENTER_SCORE = 500;

export const ASSIST_SCORE = 100;
export const ASSIST_INTERVAL = 3.2;

export const BUMP_EJECT_SCALE     = 0.45;
// Anti multi-bounce: the same wick cannot re-trigger within this delay so a
// stuck/vibrating ball can't farm score + impulses.
export const BUMP_HIT_COOLDOWN_MS = 60;

export const BUMPER_RADIUS       = 0.038;
export const BUMPER_RESTITUTION  = 0.20;
export const BUMPER_EJECT_IMPULSE = 0.11;

export const SURFACE_SNAP_THRESHOLD = 0.006;

export const WALL_LEFT_X    = -0.265;
export const WALL_RIGHT_X   =  0.265;
export const WALL_TOP_Z     = -0.552;
export const WALL_BOTTOM_Z  =  0.418;
export const WALL_HEIGHT    =  0.06;
export const WALL_THICKNESS =  0.006;

// Y is lowered to surface level so the ball doesn't land on top of the slingshot.
export const SLINGSHOT_LEFT_CENTER  = { x: -0.166, y: 1.005, z: 0.116 } as const;
export const SLINGSHOT_RIGHT_CENTER = { x:  0.121, y: 1.005, z: 0.116 } as const;
export const SLINGSHOT_RESTITUTION  = 0.8;
