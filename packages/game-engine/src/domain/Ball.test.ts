import { test, expect, describe, afterEach } from 'bun:test';
import {
  DEFAULT_BALL_RADIUS,
  BALL_RADIUS,
  getBallRadius,
  configureBallRadius,
  resetBallRadius,
  BALL_MASS,
  BALL_RESTITUTION,
  BALL_FRICTION,
  BALL_LINEAR_DAMPING,
  BALL_ANGULAR_DAMPING,
  BALL_MAX_SPEED,
  PLUNGER_IMPULSE_Z,
  PLAYFIELD_TILT_DEG,
  PLAYFIELD_SURFACE_Y,
  PORTAL_HOLE_RADIUS,
  PORTAL_COVER_RADIUS,
  PORTAL_SENSOR_RADIUS,
  PORTAL_MAGNET_RADIUS,
  BUMP_EJECT_SCALE,
  BUMPER_RADIUS,
  BUMPER_RESTITUTION,
  BUMPER_EJECT_IMPULSE,
  SURFACE_SNAP_THRESHOLD,
  WALL_LEFT_X,
  WALL_RIGHT_X,
  WALL_TOP_Z,
  WALL_BOTTOM_Z,
  SLINGSHOT_LEFT_CENTER,
  SLINGSHOT_RIGHT_CENTER,
  SLINGSHOT_RESTITUTION,
} from './Ball';

// Always restore the default radius so other tests are not polluted.
afterEach(() => resetBallRadius());

describe('ball radius state (getter/setter/reset)', () => {
  test('getBallRadius defaults to DEFAULT_BALL_RADIUS', () => {
    expect(getBallRadius()).toBe(DEFAULT_BALL_RADIUS);
  });

  test('BALL_RADIUS constant equals the default radius', () => {
    expect(BALL_RADIUS).toBe(DEFAULT_BALL_RADIUS);
  });

  test('configureBallRadius overrides the active radius', () => {
    configureBallRadius(0.02);
    expect(getBallRadius()).toBe(0.02);
  });

  test('configureBallRadius does not mutate the DEFAULT constant', () => {
    configureBallRadius(0.05);
    expect(DEFAULT_BALL_RADIUS).not.toBe(0.05);
    expect(getBallRadius()).toBe(0.05);
  });

  test('resetBallRadius restores the default after an override', () => {
    configureBallRadius(0.09);
    expect(getBallRadius()).toBe(0.09);
    resetBallRadius();
    expect(getBallRadius()).toBe(DEFAULT_BALL_RADIUS);
  });

  test('configure then reset then configure again works repeatedly', () => {
    configureBallRadius(0.01);
    resetBallRadius();
    configureBallRadius(0.03);
    expect(getBallRadius()).toBe(0.03);
  });

  test('accepts zero and negative values (no clamping by design)', () => {
    configureBallRadius(0);
    expect(getBallRadius()).toBe(0);
    configureBallRadius(-1);
    expect(getBallRadius()).toBe(-1);
  });
});

describe('ball physics constants — invariants', () => {
  test('default radius is a small positive number (~ real ball)', () => {
    expect(DEFAULT_BALL_RADIUS).toBeGreaterThan(0);
    expect(DEFAULT_BALL_RADIUS).toBeLessThan(0.05);
  });

  test('mass is the official 80 g standard', () => {
    expect(BALL_MASS).toBeCloseTo(0.08, 5);
  });

  test('restitution and friction are in [0, 1]', () => {
    for (const v of [BALL_RESTITUTION, BALL_FRICTION]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('damping values are non-negative and small', () => {
    expect(BALL_LINEAR_DAMPING).toBeGreaterThanOrEqual(0);
    expect(BALL_ANGULAR_DAMPING).toBeGreaterThanOrEqual(0);
    expect(BALL_LINEAR_DAMPING).toBeLessThan(1);
    expect(BALL_ANGULAR_DAMPING).toBeLessThan(1);
  });

  test('max speed is positive and within a realistic pinball ceiling', () => {
    expect(BALL_MAX_SPEED).toBeGreaterThan(0);
    expect(BALL_MAX_SPEED).toBeLessThanOrEqual(15);
  });

  test('plunger impulse pushes towards -Z (up the lane)', () => {
    expect(PLUNGER_IMPULSE_Z).toBeLessThan(0);
  });

  test('full-charge plunge stays under the speed ceiling', () => {
    // Δv = |impulse| / mass, must stay under the BALL_MAX_SPEED clamp.
    const dv = Math.abs(PLUNGER_IMPULSE_Z) / BALL_MASS;
    expect(dv).toBeLessThanOrEqual(BALL_MAX_SPEED);
  });
});

describe('playfield geometry constants', () => {
  test('tilt is a realistic pinball angle', () => {
    expect(PLAYFIELD_TILT_DEG).toBeGreaterThan(0);
    expect(PLAYFIELD_TILT_DEG).toBeLessThan(15);
  });

  test('surface Y is above the playfield mesh base', () => {
    expect(PLAYFIELD_SURFACE_Y).toBeGreaterThan(1);
  });

  test('wall X bounds are symmetric left/right', () => {
    expect(WALL_LEFT_X).toBeLessThan(0);
    expect(WALL_RIGHT_X).toBeGreaterThan(0);
    expect(WALL_LEFT_X).toBeCloseTo(-WALL_RIGHT_X, 5);
  });

  test('top of playfield is further (-Z) than the bottom', () => {
    expect(WALL_TOP_Z).toBeLessThan(WALL_BOTTOM_Z);
  });
});

describe('portal radii relationships', () => {
  test('cover radius is larger than the hole it covers', () => {
    expect(PORTAL_COVER_RADIUS).toBeGreaterThan(PORTAL_HOLE_RADIUS);
  });

  test('sensor radius is smaller than the hole', () => {
    expect(PORTAL_SENSOR_RADIUS).toBeLessThan(PORTAL_HOLE_RADIUS);
  });

  test('magnet reach is the largest of the portal radii', () => {
    expect(PORTAL_MAGNET_RADIUS).toBeGreaterThan(PORTAL_COVER_RADIUS);
    expect(PORTAL_MAGNET_RADIUS).toBeGreaterThan(PORTAL_SENSOR_RADIUS);
  });
});

describe('bumper constants', () => {
  test('bumper radius is positive', () => {
    expect(BUMPER_RADIUS).toBeGreaterThan(0);
  });

  test('bumper restitution in [0, 1]', () => {
    expect(BUMPER_RESTITUTION).toBeGreaterThanOrEqual(0);
    expect(BUMPER_RESTITUTION).toBeLessThanOrEqual(1);
  });

  test('eject impulse is positive', () => {
    expect(BUMPER_EJECT_IMPULSE).toBeGreaterThan(0);
  });

  test('bump (mèche) is a fraction of a full pop bumper kick', () => {
    expect(BUMP_EJECT_SCALE).toBeGreaterThan(0);
    expect(BUMP_EJECT_SCALE).toBeLessThan(1);
  });
});

describe('slingshot constants', () => {
  test('left slingshot is on the -X side, right on the +X side', () => {
    expect(SLINGSHOT_LEFT_CENTER.x).toBeLessThan(0);
    expect(SLINGSHOT_RIGHT_CENTER.x).toBeGreaterThan(0);
  });

  test('both slingshots share the same surface level and Z', () => {
    expect(SLINGSHOT_LEFT_CENTER.y).toBe(SLINGSHOT_RIGHT_CENTER.y);
    expect(SLINGSHOT_LEFT_CENTER.z).toBe(SLINGSHOT_RIGHT_CENTER.z);
  });

  test('slingshot restitution is bouncier than the ball/wall default', () => {
    expect(SLINGSHOT_RESTITUTION).toBeGreaterThan(BALL_RESTITUTION);
    expect(SLINGSHOT_RESTITUTION).toBeLessThanOrEqual(1);
  });
});

describe('surface snap threshold', () => {
  test('is a small positive lift-off tolerance', () => {
    expect(SURFACE_SNAP_THRESHOLD).toBeGreaterThan(0);
    expect(SURFACE_SNAP_THRESHOLD).toBeLessThan(0.05);
  });
});
