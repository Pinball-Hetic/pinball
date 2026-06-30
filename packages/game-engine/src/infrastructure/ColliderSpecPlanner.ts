import {
  getBallRadius,
  SLINGSHOT_LEFT_CENTER,
  SLINGSHOT_RIGHT_CENTER,
} from '../domain/Ball';
import type { MapLayout } from '../domain/MapLayout';
import { surfaceYAtZ, BOTTOM_OUT_Z } from '../domain/PlayfieldGeometry';

// ── ColliderSpec : description PURE d'un collider physique ───────────────────
// Capture exactement ce que le code passe à Rapier (forme, position, rotation,
// matière, sensor, role pour le colliderMap) SANS dépendre de RAPIER. Le module
// applier (PlayfieldColliderFactory) traduit un ColliderSpec en
// createRigidBody/createCollider. Les planners ci-dessous sont la partie math
// (bug-prone) testée à l'unité.

export type SpecQuat = { x: number; y: number; z: number; w: number };
export type SpecVec3 = { x: number; y: number; z: number };

export interface CuboidShape {
  kind: 'cuboid';
  halfExtents: SpecVec3; // (hx, hy, hz)
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
  /** Rotation du rigid body. Absente → pas de setRotation (identité). */
  rotation?: SpecQuat;
  restitution?: number;
  friction?: number;
  sensor?: boolean;
  /** Émet des COLLISION_EVENTS Rapier. */
  collisionEvents?: boolean;
  /** Étiquette enregistrée dans colliderMap (handle → role). */
  role?: string;
}

/** Quaternion d'une rotation autour de l'axe X (tilt du tapis). */
function quatAroundX(angle: number): SpecQuat {
  return { x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) };
}

/** Quaternion d'une rotation autour de l'axe Y (orientation guide). */
function quatAroundY(angle: number): SpecQuat {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}

/**
 * Sol analytique principal (cuboïde incliné lisse) — remplace le trimesh
 * bosselé du GLB. Z ∈ [-0.552, 0.418], inclinaison dérivée de surfaceYAtZ.
 */
export function planPlayfieldFloor(): ColliderSpec {
  const zMin = -0.552;
  const zMax = 0.418;
  const midZ = (zMin + zMax) / 2;
  const midY = surfaceYAtZ(midZ);
  const halfX = 0.27;
  const halfZ = (zMax - zMin) / 2;
  const tiltAngle = Math.atan2(surfaceYAtZ(zMin) - surfaceYAtZ(zMax), zMax - zMin);
  return {
    shape: { kind: 'cuboid', halfExtents: { x: halfX, y: 0.003, z: halfZ } },
    translation: { x: 0, y: midY, z: midZ },
    rotation: quatAroundX(tiltAngle),
    restitution: 0.35,
    friction: 0.12,
  };
}

/** Sol du couloir plongeur (strip lisse qui shadow la couture GLB). */
export function planLaneFloor(laneTopZ = 0.03, laneBotZ = 0.42): ColliderSpec {
  const laneMidZ = (laneTopZ + laneBotZ) / 2;
  const laneHalfZ = (laneBotZ - laneTopZ) / 2;
  const laneMidX = (0.206 + 0.265) / 2;
  const laneHalfX = (0.265 - 0.206) / 2;
  const yTop = surfaceYAtZ(laneTopZ);
  const yBot = surfaceYAtZ(laneBotZ);
  const laneMidY = (yTop + yBot) / 2;
  const tiltAngle = Math.atan2(yTop - yBot, laneBotZ - laneTopZ);
  return {
    shape: { kind: 'cuboid', halfExtents: { x: laneHalfX, y: 0.003, z: laneHalfZ } },
    translation: { x: laneMidX, y: laneMidY, z: laneMidZ },
    rotation: quatAroundX(tiltAngle),
    restitution: 0.35,
    friction: 0.15,
  };
}

/** Murs analytiques du terrain (côtés + fond + séparateur couloir). */
export function planWalls(layout: MapLayout): ColliderSpec[] {
  const WALL_H = 0.06;
  const WALL_T = 0.015;
  const HH = WALL_H / 2;
  const HT = WALL_T / 2;
  const laneSepX = layout.spawns.ball.x - getBallRadius() * 2;

  const boxes = [
    { hx: HT, hy: HH, hz: 0.485, px: -0.265, py: surfaceYAtZ(-0.067) + HH, pz: -0.067 },
    { hx: HT, hy: HH, hz: 0.485, px: 0.265, py: surfaceYAtZ(-0.067) + HH, pz: -0.067 },
    { hx: 0.265, hy: HH, hz: HT, px: 0.0, py: surfaceYAtZ(-0.552) + HH, pz: -0.552 },
    { hx: HT, hy: HH, hz: 0.5, px: laneSepX, py: surfaceYAtZ(-0.05) + HH, pz: -0.05 },
  ];

  return boxes.map((w) => ({
    shape: { kind: 'cuboid', halfExtents: { x: w.hx, y: w.hy, z: w.hz } },
    translation: { x: w.px, y: w.py, z: w.pz },
    restitution: 0.4,
    friction: 0.1,
  }));
}

/** Bumpers (cylindres) — role `bumper_${i}`. */
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

/** Sensors slingshot gauche/droite (cuboïdes sensor). */
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

/** Sensors pop-zone (cuboïdes sensor) — role `pop_zone_${i}`. */
export function planPopZoneSensors(layout: MapLayout): ColliderSpec[] {
  return layout.sensors.popZones.map((p, i) => ({
    shape: { kind: 'cuboid', halfExtents: { x: 0.015, y: 0.01, z: 0.015 } },
    translation: { x: p.x, y: p.y, z: p.z },
    sensor: true,
    collisionEvents: true,
    role: `pop_zone_${i}`,
  }));
}

/** Cibles boss (sphères sensor) — role = boss.colliderRole. */
export function planBossTargets(layout: MapLayout): ColliderSpec[] {
  return layout.bosses.map((boss) => ({
    shape: { kind: 'ball', radius: 0.034 },
    translation: { x: boss.target.x, y: boss.target.y, z: boss.target.z },
    sensor: true,
    collisionEvents: true,
    role: boss.colliderRole,
  }));
}

/** Sensor rampe rocket (cuboïde sensor) — role `rocket_ramp`. */
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

/** Drop targets (cuboïdes) — role = dropTarget.id. */
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

/** Sensor bottom-out (cuboïde sensor pleine largeur) — role `bottom_out`. */
export function planBottomOutSensor(layout: MapLayout): ColliderSpec {
  const leftX = layout.geometry.bounds.leftX;
  const rightX = layout.geometry.bounds.rightX;
  const centerX = (leftX + rightX) / 2;
  const halfX = (rightX - leftX) / 2;
  const sensorZ = BOTTOM_OUT_Z + 0.03;
  return {
    shape: { kind: 'cuboid', halfExtents: { x: halfX, y: 0.03, z: 0.06 } },
    translation: { x: centerX, y: surfaceYAtZ(sensorZ), z: sensorZ },
    sensor: true,
    collisionEvents: true,
    role: 'bottom_out',
  };
}

/** Tous les sensors (slingshots + pop-zones + rocket + boss + drop + bottom-out). */
export function planSensors(layout: MapLayout): ColliderSpec[] {
  return [
    ...planSlingshotSensors(),
    ...planPopZoneSensors(layout),
    planRocketSensor(layout),
    ...planBossTargets(layout),
    ...planDropTargets(layout),
    planBottomOutSensor(layout),
  ];
}

// ── Couloir plongeur (shooter lane) ──────────────────────────────────────────

/** Sol incliné du couloir plongeur. */
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

/** Mur latéral incliné du couloir (suit l'inclinaison du tapis, épaisseur sur X). */
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

/** Mur de fond (filet de sécurité en haut du couloir). */
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

/**
 * Guide courbe : quart de cercle approximé par N cuboïdes tangents. La normale
 * concave pousse la balle montante (-Z) vers le terrain (-X).
 */
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

    // Tangente à l'arc dans le plan XZ → axe local +X du cuboïde.
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

/** Tout le couloir plongeur : sol (optionnel) + murs + guide + mur de fond. */
export function planShooterLane(
  layout: MapLayout,
  options: { includeFloor?: boolean } = {},
): ColliderSpec[] {
  const lane = layout.shooterLane;
  const specs: ColliderSpec[] = [];
  if (options.includeFloor !== false) {
    specs.push(planShooterLaneFloor(layout));
  }
  // Mur droit : pleine hauteur, contient la balle côté +X jusqu'au sommet.
  specs.push(planTiltedLaneWall(layout, lane.xMax, lane.topZ, lane.bottomZ));
  // Mur gauche : s'arrête avant le sommet → ouverture de sortie en haut-gauche.
  specs.push(planTiltedLaneWall(layout, lane.xMin + 0.005, lane.leftWallTopZ, lane.bottomZ, 0.01));
  specs.push(...planShooterGuide(layout));
  specs.push(planShooterBackWall(layout));
  return specs;
}
