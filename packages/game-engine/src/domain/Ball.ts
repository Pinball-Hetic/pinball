// Ball — GLB ball size=[0.0269] → radius 0.01345.
export const DEFAULT_BALL_RADIUS = 0.01374;
let _ballRadius = DEFAULT_BALL_RADIUS;
export function getBallRadius(): number { return _ballRadius; }
// Configures the radius for the current map. Must be called before any physics setup.
export function configureBallRadius(r: number): void { _ballRadius = r; }
// Restores the default radius. Mainly for tests.
export function resetBallRadius(): void { _ballRadius = DEFAULT_BALL_RADIUS; }
// Kept for compatibility (static value = DEFAULT_BALL_RADIUS).
export const BALL_RADIUS = DEFAULT_BALL_RADIUS;
export const BALL_MASS            = 0.08;   // 80 g — official standard
export const BALL_RESTITUTION     = 0.4;    // steel on varnished wood: low bounce
export const BALL_FRICTION        = 0.05;   // polished steel, very slippery
// Rolling resistance: deceleration ≈ damping × v. 0.04 × 2 m/s ≈ 0.08 m/s²,
// consistent with a steel ball on waxed wood.
export const BALL_LINEAR_DAMPING  = 0.04;
export const BALL_ANGULAR_DAMPING = 0.05;

// Ball speed ceiling (m/s). The sim is ~1:1 real scale (mass 80g, Ø27mm, g,
// 6.5° tilt) → these are real m/s. Real pinball: roll 0.5–1.5, launch 2.5–4.5,
// active play 4–8, peaks ~10. 7 = lively play without tunneling
// (CCD on + 0.02-thick shooter lane walls).
export const BALL_MAX_SPEED = 7.0;

// Ball spawn lives in the map layout (layout.spawns.ball); the engine reads the
// injected layout. bottomOutLaneSepX(spawnX) parameterizes the bottom-out zone
// (PlayfieldGeometry).

// Plunger — impulse = mass * Δv. At full charge: 0.26/0.08 = 3.25 m/s
// (realistic full plunge, below the BALL_MAX_SPEED clamp).
export const PLUNGER_IMPULSE_Z = -0.26;

// Playfield — GLB: center=[0,1.0171,-0.0671] size=[0.53,0.1019,0.9697]
// Surface is already tilted in GLB geometry → gravity stays straight down
export const PLAYFIELD_TILT_DEG  = 6.5;
export const PLAYFIELD_SURFACE_Y = 1.0681; // top of playfield mesh = 1.0171 + 0.1019/2

// Portal position comes from the map layout (layout.sensors.portal);
// portal radii/scores stay generic here.
export const PORTAL_HOLE_RADIUS = 0.02;
export const PORTAL_COVER_RADIUS = 0.021;
export const PORTAL_SENSOR_RADIUS = 0.017;
export const PORTAL_MAGNET_RADIUS = 0.058;
export const PORTAL_MAGNET_STRENGTH = 0.0055;
export const PORTAL_ENTER_SCORE = 500;
export const RETURN_PORTAL_ENTER_SCORE = 500;

export const ASSIST_SCORE = 100;
export const ASSIST_INTERVAL = 3.2;

// Bump-right / bump-left (wicks). Push direction is fixed per side, not
// contact-position dependent → no coordinates needed here.
export const BUMP_EJECT_SCALE     = 0.45;  // 45% of a pop bumper kick
// Anti multi-bounce: the same wick cannot re-trigger within this delay
// (a stuck/vibrating ball must not farm score + impulses).
export const BUMP_HIT_COOLDOWN_MS = 60;

export const BUMPER_RADIUS       = 0.038;
export const BUMPER_RESTITUTION  = 0.20;  // lowered from 0.30 (−33%) — softer collider bounce
// Pop bumper kick: Δv = impulse/mass = 0.11/0.08 = 1.38 m/s (−35% vs original 2.25 m/s).
export const BUMPER_EJECT_IMPULSE = 0.11;

/** Above this lift-off (m) over the surface, the ball is snapped back to the
 *  tilted playfield (absorbs normal physics jitter, ~6 mm). */
export const SURFACE_SNAP_THRESHOLD = 0.006;

// Walls — from GLB playfield mesh extents
export const WALL_LEFT_X    = -0.265;
export const WALL_RIGHT_X   =  0.265;
export const WALL_TOP_Z     = -0.552;
export const WALL_BOTTOM_Z  =  0.418;
export const WALL_HEIGHT    =  0.06;
export const WALL_THICKNESS =  0.006;

// Drain threshold is analytic — see DRAIN_Z_THRESHOLD in PlayfieldGeometry.

// Slingshots — from GLB slingshot center=[−0.0225,1.032,0.1162] size=[0.2881,_,0.1132]
// Y lowered to surface level so ball doesn't land on top
export const SLINGSHOT_LEFT_CENTER  = { x: -0.166, y: 1.005, z: 0.116 } as const;
export const SLINGSHOT_RIGHT_CENTER = { x:  0.121, y: 1.005, z: 0.116 } as const;
export const SLINGSHOT_RESTITUTION  = 0.8;
