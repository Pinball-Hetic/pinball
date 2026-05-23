import type * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  BUMPER_POSITIONS,
  BALL_RADIUS,
  BALL_SPAWN_POSITION,
  SLINGSHOT_LEFT_CENTER,
  SLINGSHOT_RIGHT_CENTER,
  POP_ZONE_SENSORS,
  ROCKET_SENSOR,
  DROP_TARGETS,
} from '../domain/Ball';
import { surfaceYAtZ } from '../domain/PlayfieldGeometry';
import { computeLauncherLaneZBounds } from './LauncherLaneBounds';
import { hasPinballmapRoot } from './GltfNodeNames';

export type AnalyticalColliderOptions = {
  laneFloor?: boolean;
  walls?: boolean;
  bumpers?: boolean;
};

export class PlayfieldColliderFactory {
  static createAll(
    world: RAPIER.World,
    colliderMap: Map<number, string>,
    playfieldRoot?: THREE.Object3D,
    analytical?: AnalyticalColliderOptions,
  ): void {
    if (playfieldRoot && hasPinballmapRoot(playfieldRoot)) {
      PlayfieldColliderFactory.createPinballmap(world, colliderMap);
      return;
    }

    const a = {
      laneFloor: analytical?.laneFloor ?? true,
      walls: analytical?.walls ?? true,
      bumpers: analytical?.bumpers ?? true,
    };

    PlayfieldColliderFactory.createPlayfieldFloor(world);
    if (a.laneFloor) {
      if (playfieldRoot) {
        PlayfieldColliderFactory.createLaneFloorFromPlayfield(world, playfieldRoot);
      } else {
        PlayfieldColliderFactory.createLaneFloor(world);
      }
    }
    if (a.walls) PlayfieldColliderFactory.createWalls(world);
    if (a.bumpers) PlayfieldColliderFactory.createBumpers(world, colliderMap);
    PlayfieldColliderFactory.createSensors(world, colliderMap);
  }

  private static createPinballmap(
    world: RAPIER.World,
    colliderMap: Map<number, string>,
  ): void {
    PlayfieldColliderFactory.createBumpers(world, colliderMap);
    PlayfieldColliderFactory.createSensors(world, colliderMap);
  }

  private static createSensors(world: RAPIER.World, colliderMap: Map<number, string>): void {
    PlayfieldColliderFactory.createSlingshotSensors(world, colliderMap);
    PlayfieldColliderFactory.createPopZoneSensors(world, colliderMap);
    PlayfieldColliderFactory.createRocketSensor(world, colliderMap);
    PlayfieldColliderFactory.createDropTargets(world, colliderMap);
    PlayfieldColliderFactory.createDrainSensor(world, colliderMap);
  }

  private static createPlayfieldFloor(world: RAPIER.World): void {
    const zMin = -0.552, zMax = 0.418;
    const midZ = (zMin + zMax) / 2;
    const midY = surfaceYAtZ(midZ);
    const halfX = 0.270;
    const halfZ = (zMax - zMin) / 2;
    const tiltAngle = Math.atan2(
      surfaceYAtZ(zMin) - surfaceYAtZ(zMax),
      zMax - zMin,
    );
    const qx = Math.sin(tiltAngle / 2);
    const qw = Math.cos(tiltAngle / 2);
    const floorBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(0, midY, midZ)
        .setRotation({ x: qx, y: 0, z: 0, w: qw }),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfX, 0.003, halfZ)
        .setRestitution(0.35).setFriction(0.15),
      floorBody,
    );
  }

  static createLaneFloorFromPlayfield(
    world: RAPIER.World,
    playfieldRoot: THREE.Object3D,
  ): void {
    const { minZ, maxZ } = computeLauncherLaneZBounds(playfieldRoot);
    PlayfieldColliderFactory.createLaneFloor(world, minZ, maxZ);
  }

  private static createLaneFloor(
    world: RAPIER.World,
    laneTopZ = 0.03,
    laneBotZ = 0.42,
  ): void {
    const laneMidZ = (laneTopZ + laneBotZ) / 2;
    const laneHalfZ = (laneBotZ - laneTopZ) / 2;
    const laneMidX = (0.206 + 0.265) / 2;
    const laneHalfX = (0.265 - 0.206) / 2;
    const yTop = surfaceYAtZ(laneTopZ);
    const yBot = surfaceYAtZ(laneBotZ);
    const laneMidY = (yTop + yBot) / 2;
    const tiltAngle = Math.atan2(yTop - yBot, laneBotZ - laneTopZ);

    const laneFloorBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(laneMidX, laneMidY, laneMidZ)
        .setRotation({
          x: Math.sin(tiltAngle / 2), y: 0, z: 0, w: Math.cos(tiltAngle / 2),
        }),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(laneHalfX, 0.003, laneHalfZ)
        .setRestitution(0.35).setFriction(0.15),
      laneFloorBody,
    );
  }

  private static createWalls(world: RAPIER.World): void {
    const WALL_H = 0.06;
    const WALL_T = 0.015;
    const HH = WALL_H / 2;
    const HT = WALL_T / 2;
    const laneSepX = BALL_SPAWN_POSITION.x - BALL_RADIUS * 2;

    const walls = [
      { hx: HT, hy: HH, hz: 0.485, px: -0.265, py: surfaceYAtZ(-0.067) + HH, pz: -0.067 },
      { hx: HT, hy: HH, hz: 0.485, px:  0.265, py: surfaceYAtZ(-0.067) + HH, pz: -0.067 },
      { hx: 0.265, hy: HH, hz: HT, px: 0.0, py: surfaceYAtZ(-0.552) + HH, pz: -0.552 },
      { hx: HT, hy: HH, hz: 0.50, px: laneSepX, py: surfaceYAtZ(-0.05) + HH, pz: -0.05 },
    ];

    for (const w of walls) {
      const wallBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(w.px, w.py, w.pz),
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(w.hx, w.hy, w.hz).setRestitution(0.4).setFriction(0.1),
        wallBody,
      );
    }
  }

  private static createBumpers(world: RAPIER.World, colliderMap: Map<number, string>): void {
    for (let i = 0; i < BUMPER_POSITIONS.length; i++) {
      const pos = BUMPER_POSITIONS[i];
      const bumperBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z),
      );
      const bumperCol = world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.020, 0.025)
          .setRestitution(0.3)
          .setFriction(0)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        bumperBody,
      );
      colliderMap.set(bumperCol.handle, `bumper_${i}`);
    }
  }

  private static createSlingshotSensors(world: RAPIER.World, colliderMap: Map<number, string>): void {
    const slings = [
      { pos: SLINGSHOT_LEFT_CENTER,  role: 'slingshot_left' },
      { pos: SLINGSHOT_RIGHT_CENTER, role: 'slingshot_right' },
    ];
    for (const s of slings) {
      const b = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(s.pos.x, s.pos.y, s.pos.z),
      );
      const col = world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.06, 0.015, 0.03)
          .setSensor(true)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        b,
      );
      colliderMap.set(col.handle, s.role);
    }
  }

  private static createPopZoneSensors(world: RAPIER.World, colliderMap: Map<number, string>): void {
    for (let i = 0; i < POP_ZONE_SENSORS.length; i++) {
      const p = POP_ZONE_SENSORS[i];
      const b = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z),
      );
      const col = world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.015, 0.010, 0.015)
          .setSensor(true)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        b,
      );
      colliderMap.set(col.handle, `pop_zone_${i}`);
    }
  }

  private static createRocketSensor(world: RAPIER.World, colliderMap: Map<number, string>): void {
    const b = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(ROCKET_SENSOR.x, ROCKET_SENSOR.y, ROCKET_SENSOR.z),
    );
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.015, 0.010, 0.020)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      b,
    );
    colliderMap.set(col.handle, 'rocket_ramp');
  }

  private static createDropTargets(world: RAPIER.World, colliderMap: Map<number, string>): void {
    for (const dt of DROP_TARGETS) {
      const b = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(dt.x, dt.y, dt.z),
      );
      const col = world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.006, 0.020, 0.015)
          .setRestitution(0.3)
          .setFriction(0.1)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        b,
      );
      colliderMap.set(col.handle, dt.id);
    }
  }

  private static createDrainSensor(world: RAPIER.World, colliderMap: Map<number, string>): void {
    const drainZ = 0.40;
    const drainBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0.0, surfaceYAtZ(drainZ), drainZ),
    );
    const drainCol = world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.25, 0.03, 0.01)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      drainBody,
    );
    colliderMap.set(drainCol.handle, 'drain');
  }
}
