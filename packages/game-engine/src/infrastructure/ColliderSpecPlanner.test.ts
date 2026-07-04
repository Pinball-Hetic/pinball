import { afterEach, describe, expect, test } from 'bun:test';
import type { BossDefinition } from '../domain/BossRegistry';
import type { MapLayout, ShooterLaneLayout } from '../domain/MapLayout';
import {
  getBallRadius,
  resetBallRadius,
  SLINGSHOT_LEFT_CENTER,
  SLINGSHOT_RIGHT_CENTER,
} from '../domain/Ball';
import {
  BOTTOM_OUT_Z,
  resetSurfaceCoefficients,
  surfaceYAtZ,
} from '../domain/PlayfieldGeometry';
import {
  planBossTargets,
  planBottomOutSensor,
  planBumpers,
  planDropTargets,
  planLaneFloor,
  planPlayfieldFloor,
  planPopZoneSensors,
  planRocketSensor,
  planSensors,
  planShooterGuide,
  planShooterLane,
  planShooterLaneFloor,
  planSlingshotSensors,
  planTiltedLaneWall,
  planWalls,
  type CuboidShape,
} from './ColliderSpecPlanner';

afterEach(() => {
  resetBallRadius();
  resetSurfaceCoefficients();
});

const shooterLane: ShooterLaneLayout = {
  xMin: 0.2,
  xMax: 0.26,
  bottomZ: 0.4,
  topZ: 0.0,
  wallHeight: 0.06,
  wallThickness: 0.006,
  restitution: 0.4,
  friction: 0.1,
  leftWallTopZ: 0.1,
  lockX: 0.23,
  exitX: 0.18,
  failZ: 0.35,
  guideCenter: { x: 0.1, z: 0.05 },
  guideRadius: 0.08,
  guideSegments: 4,
  guideAngleStart: 0,
  guideAngleEnd: Math.PI / 2,
};

const layout: MapLayout = {
  bumpers: [
    { x: -0.1, y: 1.01, z: -0.2 },
    { x: 0.12, y: 1.02, z: -0.25 },
  ],
  dropTargets: [
    { id: 'drop_a', x: -0.15, y: 1.0, z: 0.1, side: 'left' },
    { id: 'drop_b', x: 0.15, y: 1.0, z: 0.1, side: 'right' },
  ],
  sensors: {
    popZones: [
      { x: -0.05, y: 1.0, z: -0.3 },
      { x: 0.05, y: 1.0, z: -0.32 },
    ],
    rocket: { x: 0.0, y: 1.0, z: -0.4 },
    bossReveal: { x: 0, y: 1, z: 0 },
    portal: { x: 0, y: 1, z: 0 },
  },
  spawns: {
    ball: { x: 0.2355, y: 1.0, z: 0.4 },
    alternateWorld: { x: 0, z: 0 },
    alternateWorldImpulse: { x: 0, y: 0, z: 0 },
    normalReturn: { x: 0, z: 0 },
    normalReturnImpulse: { x: 0, y: 0, z: 0 },
  },
  shooterLane,
  flipperPivots: { leftX: -0.1, rightX: 0.1, y: 1.0, z: 0.3 },
  bosses: [
    { colliderRole: 'boss_demogorgon', target: { x: -0.08, y: 1.03, z: -0.15 } } as BossDefinition,
    { colliderRole: 'boss_mindflayer', target: { x: 0.09, y: 1.04, z: -0.18 } } as BossDefinition,
  ],
  geometry: {
    coefficients: { base: 1.068, zOffset: 0.552, zSpan: 0.97, yDrop: 0.11 },
    bounds: { leftX: -0.265, rightX: 0.265, topZ: -0.552, bottomZ: 0.418 },
    shade: { width: 0.58, depth: 1.02, y: 1.062, z: -0.067, maxOpacity: 0.96 },
  },
  atmosphere: {} as MapLayout['atmosphere'],
};

function cuboid(spec: { shape: { kind: string } }): CuboidShape {
  expect(spec.shape.kind).toBe('cuboid');
  return spec.shape as CuboidShape;
}

/** Expected quaternion for a rotation about X (playfield tilt). */
function quatX(angle: number) {
  return { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) };
}

describe('planPlayfieldFloor', () => {
  test('computes a tilted cuboid floor over the full Z range', () => {
    const spec = planPlayfieldFloor();
    const zMin = -0.552;
    const zMax = 0.418;
    const midZ = (zMin + zMax) / 2;
    expect(spec.shape).toEqual({
      kind: 'cuboid',
      halfExtents: { x: 0.27, y: 0.003, z: (zMax - zMin) / 2 },
    });
    expect(spec.translation.x).toBe(0);
    expect(spec.translation.z).toBeCloseTo(midZ, 9);
    expect(spec.translation.y).toBeCloseTo(surfaceYAtZ(midZ), 9);
    expect(spec.restitution).toBe(0.35);
    expect(spec.friction).toBe(0.12);
    const tilt = Math.atan2(surfaceYAtZ(zMin) - surfaceYAtZ(zMax), zMax - zMin);
    expect(spec.rotation).toEqual(quatX(tilt));
  });

  test('has no role and is not a sensor', () => {
    const spec = planPlayfieldFloor();
    expect(spec.role).toBeUndefined();
    expect(spec.sensor).toBeUndefined();
  });
});

describe('planLaneFloor', () => {
  test('uses default lane Z bounds when none provided', () => {
    const spec = planLaneFloor();
    const c = cuboid(spec);
    expect(c.halfExtents.x).toBeCloseTo((0.265 - 0.206) / 2, 9);
    expect(c.halfExtents.z).toBeCloseTo((0.42 - 0.03) / 2, 9);
    expect(spec.translation.x).toBeCloseTo((0.206 + 0.265) / 2, 9);
    expect(spec.translation.z).toBeCloseTo((0.03 + 0.42) / 2, 9);
    expect(spec.friction).toBe(0.15);
    expect(spec.restitution).toBe(0.35);
  });

  test('honours explicit lane bounds and tilt sign', () => {
    const spec = planLaneFloor(0.1, 0.5);
    const yTop = surfaceYAtZ(0.1);
    const yBot = surfaceYAtZ(0.5);
    const tilt = Math.atan2(yTop - yBot, 0.5 - 0.1);
    expect(spec.translation.y).toBeCloseTo((yTop + yBot) / 2, 9);
    expect(spec.rotation).toEqual(quatX(tilt));
  });
});

describe('planWalls', () => {
  test('produces 4 walls with side/back geometry and shared material', () => {
    const specs = planWalls(layout);
    expect(specs).toHaveLength(4);
    for (const s of specs) {
      expect(s.restitution).toBe(0.4);
      expect(s.friction).toBe(0.1);
      expect(s.shape.kind).toBe('cuboid');
    }
    // Left + right side walls mirrored on X.
    expect(specs[0].translation.x).toBe(-0.265);
    expect(specs[1].translation.x).toBe(0.265);
    // Back wall spans full width on X.
    expect(cuboid(specs[2]).halfExtents.x).toBe(0.265);
  });

  test('lane separator X derives from ball spawn minus 2 radii', () => {
    const specs = planWalls(layout);
    const sep = specs[3];
    expect(sep.translation.x).toBeCloseTo(layout.spawns.ball.x - getBallRadius() * 2, 9);
    expect(sep.translation.y).toBeCloseTo(surfaceYAtZ(-0.05) + 0.06 / 2, 9);
  });
});

describe('planBumpers', () => {
  test('maps each bumper to a cylinder with role bumper_${i}', () => {
    const specs = planBumpers(layout);
    expect(specs).toHaveLength(2);
    expect(specs[0]).toEqual({
      shape: { kind: 'cylinder', halfHeight: 0.02, radius: 0.025 },
      translation: { x: -0.1, y: 1.01, z: -0.2 },
      restitution: 0.3,
      friction: 0,
      collisionEvents: true,
      role: 'bumper_0',
    });
    expect(specs[1].role).toBe('bumper_1');
  });
});

describe('planSlingshotSensors', () => {
  test('places left/right sensors at the Ball constants', () => {
    const specs = planSlingshotSensors();
    expect(specs).toHaveLength(2);
    expect(specs[0].translation).toEqual({ ...SLINGSHOT_LEFT_CENTER });
    expect(specs[0].role).toBe('slingshot_left');
    expect(specs[1].translation).toEqual({ ...SLINGSHOT_RIGHT_CENTER });
    expect(specs[1].role).toBe('slingshot_right');
    for (const s of specs) {
      expect(s.sensor).toBe(true);
      expect(s.collisionEvents).toBe(true);
      expect(cuboid(s).halfExtents).toEqual({ x: 0.06, y: 0.015, z: 0.03 });
    }
  });
});

describe('planPopZoneSensors', () => {
  test('one sensor per pop zone, role pop_zone_${i}', () => {
    const specs = planPopZoneSensors(layout);
    expect(specs.map((s) => s.role)).toEqual(['pop_zone_0', 'pop_zone_1']);
    expect(cuboid(specs[0]).halfExtents).toEqual({ x: 0.015, y: 0.01, z: 0.015 });
    expect(specs[0].sensor).toBe(true);
  });
});

describe('planBossTargets', () => {
  test('ball sensors keyed by boss.colliderRole', () => {
    const specs = planBossTargets(layout);
    expect(specs).toHaveLength(2);
    expect(specs[0].shape).toEqual({ kind: 'ball', radius: 0.034 });
    expect(specs[0].translation).toEqual({ x: -0.08, y: 1.03, z: -0.15 });
    expect(specs[0].role).toBe('boss_demogorgon');
    expect(specs[0].sensor).toBe(true);
  });
});

describe('planRocketSensor', () => {
  test('rocket_ramp sensor at layout rocket position', () => {
    const spec = planRocketSensor(layout);
    expect(spec.role).toBe('rocket_ramp');
    expect(spec.translation).toEqual({ x: 0, y: 1, z: -0.4 });
    expect(cuboid(spec).halfExtents).toEqual({ x: 0.015, y: 0.01, z: 0.02 });
    expect(spec.sensor).toBe(true);
  });
});

describe('planDropTargets', () => {
  test('keyed by drop target id, with restitution/friction', () => {
    const specs = planDropTargets(layout);
    expect(specs.map((s) => s.role)).toEqual(['drop_a', 'drop_b']);
    expect(cuboid(specs[0]).halfExtents).toEqual({ x: 0.006, y: 0.02, z: 0.015 });
    expect(specs[0].restitution).toBe(0.3);
    expect(specs[0].friction).toBe(0.1);
    expect(specs[0].collisionEvents).toBe(true);
    expect(specs[0].sensor).toBeUndefined();
  });
});

describe('planBottomOutSensor', () => {
  test('full-width sensor centered on bounds, offset below BOTTOM_OUT_Z', () => {
    const spec = planBottomOutSensor(layout);
    const { leftX, rightX } = layout.geometry.bounds;
    const sensorZ = BOTTOM_OUT_Z + 0.03;
    expect(spec.role).toBe('bottom_out');
    expect(spec.translation.x).toBeCloseTo((leftX + rightX) / 2, 9);
    expect(spec.translation.z).toBeCloseTo(sensorZ, 9);
    expect(spec.translation.y).toBeCloseTo(surfaceYAtZ(sensorZ), 9);
    expect(cuboid(spec).halfExtents).toEqual({ x: (rightX - leftX) / 2, y: 0.03, z: 0.06 });
    expect(spec.sensor).toBe(true);
  });
});

describe('planSensors', () => {
  test('aggregates sensors in the legacy order', () => {
    const specs = planSensors(layout);
    // 2 slingshots + 2 pop + 1 rocket + 2 boss + 2 drop + 1 bottom-out = 10
    expect(specs).toHaveLength(10);
    expect(specs.map((s) => s.role)).toEqual([
      'slingshot_left',
      'slingshot_right',
      'pop_zone_0',
      'pop_zone_1',
      'rocket_ramp',
      'boss_demogorgon',
      'boss_mindflayer',
      'drop_a',
      'drop_b',
      'bottom_out',
    ]);
  });
});

describe('planShooterLaneFloor', () => {
  test('tilted strip floor with restitution 0.3 / friction 0.12', () => {
    const spec = planShooterLaneFloor(layout);
    const { topZ, bottomZ, xMin, xMax } = shooterLane;
    const yTop = surfaceYAtZ(topZ);
    const yBot = surfaceYAtZ(bottomZ);
    const tilt = Math.atan2(yTop - yBot, bottomZ - topZ);
    expect(cuboid(spec).halfExtents).toEqual({
      x: (xMax - xMin) / 2,
      y: 0.003,
      z: (bottomZ - topZ) / 2,
    });
    expect(spec.translation.x).toBeCloseTo((xMin + xMax) / 2, 9);
    expect(spec.translation.z).toBeCloseTo((topZ + bottomZ) / 2, 9);
    expect(spec.translation.y).toBeCloseTo((yTop + yBot) / 2, 9);
    expect(spec.rotation).toEqual(quatX(tilt));
    expect(spec.restitution).toBe(0.3);
    expect(spec.friction).toBe(0.12);
  });
});

describe('planTiltedLaneWall', () => {
  test('default thickness comes from lane.wallThickness', () => {
    const spec = planTiltedLaneWall(layout, shooterLane.xMax, shooterLane.topZ, shooterLane.bottomZ);
    const c = cuboid(spec);
    expect(c.halfExtents.x).toBeCloseTo(shooterLane.wallThickness / 2, 9);
    expect(c.halfExtents.y).toBe(shooterLane.wallHeight / 2);
    expect(c.halfExtents.z).toBeCloseTo((shooterLane.bottomZ - shooterLane.topZ) / 2, 9);
    expect(spec.translation.x).toBe(shooterLane.xMax);
    expect(spec.restitution).toBe(shooterLane.restitution);
    expect(spec.friction).toBe(shooterLane.friction);
  });

  test('explicit thickness overrides and wall Y lifts by half wall height', () => {
    const spec = planTiltedLaneWall(layout, 0.205, 0.1, 0.4, 0.01);
    expect(cuboid(spec).halfExtents.x).toBe(0.005);
    const yTop = surfaceYAtZ(0.1);
    const yBot = surfaceYAtZ(0.4);
    expect(spec.translation.y).toBeCloseTo((yTop + yBot) / 2 + shooterLane.wallHeight / 2, 9);
  });
});

describe('planShooterGuide', () => {
  test('produces guideSegments cuboids on the quarter-circle arc', () => {
    const specs = planShooterGuide(layout);
    expect(specs).toHaveLength(shooterLane.guideSegments);

    const C = shooterLane.guideCenter;
    const R = shooterLane.guideRadius;
    const N = shooterLane.guideSegments;
    const dA = (shooterLane.guideAngleEnd - shooterLane.guideAngleStart) / N;
    const halfLen = (R * Math.abs(dA)) / 2 + shooterLane.wallThickness;

    // Verify segment 0 fully.
    const aMid0 = shooterLane.guideAngleStart + dA * 0.5;
    const x0 = C.x + R * Math.cos(aMid0);
    const z0 = C.z + R * Math.sin(aMid0);
    expect(specs[0].translation.x).toBeCloseTo(x0, 9);
    expect(specs[0].translation.z).toBeCloseTo(z0, 9);
    expect(specs[0].translation.y).toBeCloseTo(surfaceYAtZ(z0) + shooterLane.wallHeight / 2, 9);
    expect(cuboid(specs[0]).halfExtents).toEqual({
      x: halfLen,
      y: shooterLane.wallHeight / 2,
      z: shooterLane.wallThickness / 2,
    });

    // Rotation about Y from the arc tangent.
    const tx = -Math.sin(aMid0);
    const tz = Math.cos(aMid0);
    const alpha = Math.atan2(-tz, tx);
    expect(specs[0].rotation).toEqual({
      x: 0,
      y: Math.sin(alpha / 2),
      z: 0,
      w: Math.cos(alpha / 2),
    });
  });
});

describe('planShooterLane', () => {
  test('includes floor by default: floor + 2 walls + guide + back wall', () => {
    const specs = planShooterLane(layout);
    // 1 floor + 2 walls + N guide + 1 back wall
    expect(specs).toHaveLength(1 + 2 + shooterLane.guideSegments + 1);
  });

  test('omits floor when includeFloor=false', () => {
    const withFloor = planShooterLane(layout);
    const noFloor = planShooterLane(layout, { includeFloor: false });
    expect(noFloor).toHaveLength(withFloor.length - 1);
  });

  test('left wall is thinned to 0.01 and offset to xMin+0.005', () => {
    const specs = planShooterLane(layout, { includeFloor: false });
    // [rightWall, leftWall, ...guide, backWall]
    const leftWall = specs[1];
    expect(leftWall.translation.x).toBeCloseTo(shooterLane.xMin + 0.005, 9);
    expect(cuboid(leftWall).halfExtents.x).toBe(0.005);
  });
});
