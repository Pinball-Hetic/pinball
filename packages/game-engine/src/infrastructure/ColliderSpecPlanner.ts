import {
  getBallRadius,
  SLINGSHOT_LEFT_CENTER,
  SLINGSHOT_RIGHT_CENTER,
} from '../domain/Ball';
import type { MapLayout } from '../domain/MapLayout';
import { surfaceYAtZ, BOTTOM_OUT_Z } from '../domain/PlayfieldGeometry';

export type SpecQuat = { x: number; y: number; z: number; w: number };
export type SpecVec3 = { x: number; y: number; z: number };

export interface CuboidShape {
  kind: 'cuboid';
  halfExtents: SpecVec3;
}

export interface CylinderShape {
  kind: 'cylinder';
  halfHeight: number;
  radius: number;
}

export interface BallShape {
  kind: 'ball';
  radius: number;
}

export type ColliderShape = CuboidShape | CylinderShape | BallShape;

export interface ColliderSpec {
  shape: ColliderShape;
  translation: SpecVec3;
  rotation?: SpecQuat;
  restitution?: number;
  friction?: number;
  sensor?: boolean;
  collisionEvents?: boolean;
  role?: string;
}

const PLAYFIELD_MIN_Z = -0.552;
const PLAYFIELD_MAX_Z = 0.418;
const PLAYFIELD_HALF_X = 0.27; // not a bound (bounds = ±0.265): collider margin
const PLAYFIELD_FLOOR_HALF_Y = 0.003;
const PLAYFIELD_FLOOR_RESTITUTION = 0.35;
const PLAYFIELD_FLOOR_FRICTION = 0.12;

// 0.206 is not a layout bound → kept literal.
const LANE_FLOOR_X_MIN = 0.206;
const LANE_FLOOR_X_MAX = 0.265;
const LANE_FLOOR_HALF_Y = 0.003;
const LANE_FLOOR_RESTITUTION = 0.35;
const LANE_FLOOR_FRICTION = 0.15;

const WALL_HEIGHT = 0.06;
const WALL_THICKNESS = 0.015;
const WALL_SIDE_LEFT_X = -0.265; // = bounds.leftX, kept literal (hardcoded ST values)
const WALL_SIDE_RIGHT_X = 0.265;
const WALL_SIDE_HALF_Z = 0.485;
const WALL_SIDE_Z = -0.067;
const WALL_BACK_HALF_X = 0.265;
const WALL_BACK_Z = -0.552;
const WALL_LANE_SEP_HALF_Z = 0.5;
const WALL_LANE_SEP_Z = -0.05;
const WALL_RESTITUTION = 0.4;
const WALL_FRICTION = 0.1;

function quatAroundX(angle: number): SpecQuat {
  return { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) };
}

function quatAroundY(angle: number): SpecQuat {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}

export function planPlayfieldFloor(): ColliderSpec {
  const zMin = PLAYFIELD_MIN_Z;
  const zMax = PLAYFIELD_MAX_Z;
  const midZ = (zMin + zMax) / 2;
  const midY = surfaceYAtZ(midZ);
  const halfX = PLAYFIELD_HALF_X;
  const halfZ = (zMax - zMin) / 2;
  const tiltAngle = Math.atan2(surfaceYAtZ(zMin) - surfaceYAtZ(zMax), zMax - zMin);
  return {
    shape: { kind: 'cuboid', halfExtents: { x: halfX, y: PLAYFIELD_FLOOR_HALF_Y, z: halfZ } },
    translation: { x: 0, y: midY, z: midZ },
    rotation: quatAroundX(tiltAngle),
    restitution: PLAYFIELD_FLOOR_RESTITUTION,
    friction: PLAYFIELD_FLOOR_FRICTION,
  };
}

export function planLaneFloor(laneTopZ = 0.03, laneBotZ = 0.42): ColliderSpec {
  const laneMidZ = (laneTopZ + laneBotZ) / 2;
  const laneHalfZ = (laneBotZ - laneTopZ) / 2;
  const laneMidX = (LANE_FLOOR_X_MIN + LANE_FLOOR_X_MAX) / 2;
  const laneHalfX = (LANE_FLOOR_X_MAX - LANE_FLOOR_X_MIN) / 2;
  const yTop = surfaceYAtZ(laneTopZ);
  const yBot = surfaceYAtZ(laneBotZ);
  const laneMidY = (yTop + yBot) / 2;
  const tiltAngle = Math.atan2(yTop - yBot, laneBotZ - laneTopZ);
  return {
    shape: { kind: 'cuboid', halfExtents: { x: laneHalfX, y: LANE_FLOOR_HALF_Y, z: laneHalfZ } },
    translation: { x: laneMidX, y: laneMidY, z: laneMidZ },
    rotation: quatAroundX(tiltAngle),
    restitution: LANE_FLOOR_RESTITUTION,
    friction: LANE_FLOOR_FRICTION,
  };
}

export function planWalls(layout: MapLayout): ColliderSpec[] {
  const HH = WALL_HEIGHT / 2;
  const HT = WALL_THICKNESS / 2;
  const laneSepX = layout.spawns.ball.x - getBallRadius() * 2;

  const boxes = [
    { hx: HT, hy: HH, hz: WALL_SIDE_HALF_Z, px: WALL_SIDE_LEFT_X, py: surfaceYAtZ(WALL_SIDE_Z) + HH, pz: WALL_SIDE_Z },
    { hx: HT, hy: HH, hz: WALL_SIDE_HALF_Z, px: WALL_SIDE_RIGHT_X, py: surfaceYAtZ(WALL_SIDE_Z) + HH, pz: WALL_SIDE_Z },
    { hx: WALL_BACK_HALF_X, hy: HH, hz: HT, px: 0.0, py: surfaceYAtZ(WALL_BACK_Z) + HH, pz: WALL_BACK_Z },
    { hx: HT, hy: HH, hz: WALL_LANE_SEP_HALF_Z, px: laneSepX, py: surfaceYAtZ(WALL_LANE_SEP_Z) + HH, pz: WALL_LANE_SEP_Z },
  ];

  return boxes.map((w) => ({
    shape: { kind: 'cuboid', halfExtents: { x: w.hx, y: w.hy, z: w.hz } },
    translation: { x: w.px, y: w.py, z: w.pz },
    restitution: WALL_RESTITUTION,
    friction: WALL_FRICTION,
  }));
}

export function planBumpers(layout: MapLayout): ColliderSpec[] {
  return layout.bumpers.map((pos, i) => ({
    shape: { kind: 'cylinder', halfHeight: 0.02, radius: 0.025 },
    translation: { x: pos.x, y: pos.y, z: pos.z },
    restitution: 0.3,
    friction: 0,
    collisionEvents: true,
    role: `bumper_${i}`,
  }));
}

export function planSlingshotSensors(): ColliderSpec[] {
  const slings = [
    { pos: SLINGSHOT_LEFT_CENTER, role: 'slingshot_left' },
    { pos: SLINGSHOT_RIGHT_CENTER, role: 'slingshot_right' },
  ];
  return slings.map((s) => ({
    shape: { kind: 'cuboid', halfExtents: { x: 0.06, y: 0.015, z: 0.03 } },
    translation: { x: s.pos.x, y: s.pos.y, z: s.pos.z },
    sensor: true,
    collisionEvents: true,
    role: s.role,
  }));
}

export function planPopZoneSensors(layout: MapLayout): ColliderSpec[] {
  return layout.sensors.popZones.map((p, i) => ({
    shape: { kind: 'cuboid', halfExtents: { x: 0.015, y: 0.01, z: 0.015 } },
    translation: { x: p.x, y: p.y, z: p.z },
    sensor: true,
    collisionEvents: true,
    role: `pop_zone_${i}`,
  }));
}

export function planBossTargets(layout: MapLayout): ColliderSpec[] {
  return layout.bosses.map((boss) => ({
    shape: { kind: 'ball', radius: 0.034 },
    translation: { x: boss.target.x, y: boss.target.y, z: boss.target.z },
    sensor: true,
    collisionEvents: true,
    role: boss.colliderRole,
  }));
}

export function planRocketSensor(layout: MapLayout): ColliderSpec {
  const rocket = layout.sensors.rocket;
  return {
    shape: { kind: 'cuboid', halfExtents: { x: 0.015, y: 0.01, z: 0.02 } },
    translation: { x: rocket.x, y: rocket.y, z: rocket.z },
    sensor: true,
    collisionEvents: true,
    role: 'rocket_ramp',
  };
}

export function planDropTargets(layout: MapLayout): ColliderSpec[] {
  return layout.dropTargets.map((dt) => ({
    shape: { kind: 'cuboid', halfExtents: { x: 0.006, y: 0.02, z: 0.015 } },
    translation: { x: dt.x, y: dt.y, z: dt.z },
    restitution: 0.3,
    friction: 0.1,
    collisionEvents: true,
    role: dt.id,
  }));
}

export function planBottomOutSensor(layout: MapLayout): ColliderSpec {
  const leftX = layout.geometry.bounds.leftX;
  const rightX = layout.geometry.bounds.rightX;
  const centerX = (leftX + rightX) / 2;
  const halfX = (rightX - leftX) / 2;
  // +0.03 offset: centers the sensor just past the drain line (BOTTOM_OUT_Z),
  // so it only fires once the ball has crossed. halfZ 0.06 is deliberately
  // thick: a fast-draining ball could tunnel through a thin band between steps.
  const sensorZ = BOTTOM_OUT_Z + 0.03;
  return {
    shape: { kind: 'cuboid', halfExtents: { x: halfX, y: 0.03, z: 0.06 } },
    translation: { x: centerX, y: surfaceYAtZ(sensorZ), z: sensorZ },
    sensor: true,
    collisionEvents: true,
    role: 'bottom_out',
  };
}

export function planScoopSensor(layout: MapLayout): ColliderSpec[] {
  const scoop = layout.sensors.scoop;
  if (!scoop) return [];
  return [{
    shape: { kind: 'cuboid', halfExtents: { x: 0.014, y: 0.012, z: 0.014 } },
    translation: { x: scoop.x, y: scoop.y, z: scoop.z },
    sensor: true,
    collisionEvents: true,
    role: 'scoop',
  }];
}

export function planSensors(layout: MapLayout): ColliderSpec[] {
  return [
    ...planSlingshotSensors(),
    ...planPopZoneSensors(layout),
    planRocketSensor(layout),
    ...planScoopSensor(layout),
    ...planBossTargets(layout),
    ...planDropTargets(layout),
    planBottomOutSensor(layout),
  ];
}

export function planShooterLaneFloor(layout: MapLayout): ColliderSpec {
  const lane = layout.shooterLane;
  const zTop = lane.topZ;
  const zBot = lane.bottomZ;
  const midZ = (zTop + zBot) / 2;
  const halfZ = (zBot - zTop) / 2;
  const midX = (lane.xMin + lane.xMax) / 2;
  const halfX = (lane.xMax - lane.xMin) / 2;
  const yTop = surfaceYAtZ(zTop);
  const yBot = surfaceYAtZ(zBot);
  const midY = (yTop + yBot) / 2;
  const tilt = Math.atan2(yTop - yBot, zBot - zTop);
  return {
    shape: { kind: 'cuboid', halfExtents: { x: halfX, y: 0.003, z: halfZ } },
    translation: { x: midX, y: midY, z: midZ },
    rotation: quatAroundX(tilt),
    restitution: 0.3,
    friction: 0.12,
  };
}

export function planTiltedLaneWall(
  layout: MapLayout,
  x: number,
  zTop: number,
  zBot: number,
  thickness?: number,
): ColliderSpec {
  const lane = layout.shooterLane;
  const t = thickness ?? lane.wallThickness;
  const midZ = (zTop + zBot) / 2;
  const halfZ = (zBot - zTop) / 2;
  const yTop = surfaceYAtZ(zTop);
  const yBot = surfaceYAtZ(zBot);
  const midY = (yTop + yBot) / 2 + lane.wallHeight / 2;
  const tilt = Math.atan2(yTop - yBot, zBot - zTop);
  return {
    shape: { kind: 'cuboid', halfExtents: { x: t / 2, y: lane.wallHeight / 2, z: halfZ } },
    translation: { x, y: midY, z: midZ },
    rotation: quatAroundX(tilt),
    restitution: lane.restitution,
    friction: lane.friction,
  };
}

export function planShooterBackWall(layout: MapLayout): ColliderSpec {
  const lane = layout.shooterLane;
  const z = lane.topZ;
  const midX = (lane.xMin + lane.xMax) / 2;
  const halfX = (lane.xMax - lane.xMin) / 2;
  const y = surfaceYAtZ(z) + lane.wallHeight / 2;
  return {
    shape: {
      kind: 'cuboid',
      halfExtents: { x: halfX, y: lane.wallHeight / 2, z: lane.wallThickness / 2 },
    },
    translation: { x: midX, y, z },
    restitution: lane.restitution,
    friction: lane.friction,
  };
}

export function planShooterGuide(layout: MapLayout): ColliderSpec[] {
  const lane = layout.shooterLane;
  const C = lane.guideCenter;
  const R = lane.guideRadius;
  const N = lane.guideSegments;
  const dA = (lane.guideAngleEnd - lane.guideAngleStart) / N;
  const halfLen = (R * Math.abs(dA)) / 2 + lane.wallThickness;

  const specs: ColliderSpec[] = [];
  for (let i = 0; i < N; i++) {
    const aMid = lane.guideAngleStart + dA * (i + 0.5);
    const x = C.x + R * Math.cos(aMid);
    const z = C.z + R * Math.sin(aMid);
    const y = surfaceYAtZ(z) + lane.wallHeight / 2;

    const tx = -Math.sin(aMid);
    const tz = Math.cos(aMid);
    const alpha = Math.atan2(-tz, tx);

    specs.push({
      shape: {
        kind: 'cuboid',
        halfExtents: { x: halfLen, y: lane.wallHeight / 2, z: lane.wallThickness / 2 },
      },
      translation: { x, y, z },
      rotation: quatAroundY(alpha),
      restitution: lane.restitution,
      friction: lane.friction,
    });
  }
  return specs;
}

export function planShooterLane(
  layout: MapLayout,
  options: { includeFloor?: boolean } = {},
): ColliderSpec[] {
  const lane = layout.shooterLane;
  const specs: ColliderSpec[] = [];
  if (options.includeFloor !== false) {
    specs.push(planShooterLaneFloor(layout));
  }
  specs.push(planTiltedLaneWall(layout, lane.xMax, lane.topZ, lane.bottomZ));
  // Left wall stops before the top (leftWallTopZ) → exit opening at the top-left.
  specs.push(planTiltedLaneWall(layout, lane.xMin + 0.005, lane.leftWallTopZ, lane.bottomZ, 0.01));
  specs.push(...planShooterGuide(layout));
  specs.push(planShooterBackWall(layout));
  return specs;
}
