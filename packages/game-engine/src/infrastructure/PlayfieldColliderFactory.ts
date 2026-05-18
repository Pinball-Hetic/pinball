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

export type AnalyticalColliderOptions = {
  /** Sol incliné du couloir plongeur (souvent en double avec le GLB). */
  laneFloor?: boolean;
  /** Murs latéraux / haut / séparateur lane (souvent en double avec le trimesh). */
  walls?: boolean;
  /** Outlanes, poteaux, murets analytiques. */
  barriers?: boolean;
  /** Cylindres bumpers (restent utiles si les bumpers sont exclus du trimesh). */
  bumpers?: boolean;
};

export class PlayfieldColliderFactory {
  static createAll(
    world: RAPIER.World,
    colliderMap: Map<number, string>,
    analytical?: AnalyticalColliderOptions,
  ): void {
    const a = {
      laneFloor: analytical?.laneFloor ?? true,
      walls: analytical?.walls ?? true,
      barriers: analytical?.barriers ?? true,
      bumpers: analytical?.bumpers ?? true,
    };

    if (a.laneFloor) PlayfieldColliderFactory.createLaneFloor(world);
    if (a.walls) PlayfieldColliderFactory.createWalls(world);
    if (a.bumpers) PlayfieldColliderFactory.createBumpers(world, colliderMap);
    if (a.barriers) PlayfieldColliderFactory.createBarriers(world);
    PlayfieldColliderFactory.createSlingshotSensors(world, colliderMap);
    PlayfieldColliderFactory.createPopZoneSensors(world, colliderMap);
    PlayfieldColliderFactory.createRocketSensor(world, colliderMap);
    PlayfieldColliderFactory.createDropTargets(world, colliderMap);
    PlayfieldColliderFactory.createDrainSensor(world, colliderMap);
  }

  private static createLaneFloor(world: RAPIER.World): void {
    const laneTopZ = 0.03;
    const laneBotZ = 0.42;
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
      { hx: 0.265, hy: HH, hz: HT, px: 0.0, py: surfaceYAtZ(0.418) + HH, pz: 0.420 },
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

  private static createBarriers(world: RAPIER.World): void {
    const surfY = surfaceYAtZ;

    type BarrierDef = {
      type: 'cyl' | 'box';
      px: number;
      pz: number;
      hAbove: number;
      r?: number;
      hh?: number;
      hx?: number;
      hy?: number;
      hz?: number;
      rest?: number;
    };

    const barriers: BarrierDef[] = [
      { type: 'cyl', px: -0.14, pz: 0.28, hAbove: 0.012, r: 0.012, hh: 0.015 },
      { type: 'cyl', px:  0.10, pz: 0.28, hAbove: 0.012, r: 0.012, hh: 0.015 },
      { type: 'cyl', px: -0.02, pz: 0.32, hAbove: 0.012, r: 0.015, hh: 0.015 },
      { type: 'box', px:  0.155, pz: 0.32, hAbove: 0.015, hx: 0.008, hy: 0.025, hz: 0.08 },
      { type: 'box', px: -0.20,  pz: 0.32, hAbove: 0.015, hx: 0.008, hy: 0.025, hz: 0.08 },
    ];

    for (const b of barriers) {
      const py = surfY(b.pz) + b.hAbove;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(b.px, py, b.pz),
      );

      if (b.type === 'cyl') {
        world.createCollider(
          RAPIER.ColliderDesc.cylinder(b.hh!, b.r!)
            .setRestitution(b.rest ?? 0.4).setFriction(0.1),
          body,
        );
      } else {
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(b.hx!, b.hy!, b.hz!)
            .setRestitution(b.rest ?? 0.4).setFriction(0.1),
          body,
        );
      }
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
