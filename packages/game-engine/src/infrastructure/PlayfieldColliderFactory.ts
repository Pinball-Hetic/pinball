import type * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  BALL_RADIUS,
  SLINGSHOT_LEFT_CENTER,
  SLINGSHOT_RIGHT_CENTER,
} from '../domain/Ball';
import type { MapLayout } from '../domain/MapLayout';
import { surfaceYAtZ, bottomOutLaneSepX, BOTTOM_OUT_Z } from '../domain/PlayfieldGeometry';
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
    layout: MapLayout,
    colliderMap: Map<number, string>,
    playfieldRoot?: THREE.Object3D,
    analytical?: AnalyticalColliderOptions,
  ): void {
    if (playfieldRoot && hasPinballmapRoot(playfieldRoot)) {
      PlayfieldColliderFactory.createPinballmap(world, layout, colliderMap);
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
    if (a.walls) PlayfieldColliderFactory.createWalls(world, layout);
    if (a.bumpers) PlayfieldColliderFactory.createBumpers(world, layout, colliderMap);
    PlayfieldColliderFactory.createSensors(world, layout, colliderMap);
  }

  /**
   * Colliders analytiques pour une map conventionnée (GLB role-driven) : sol
   * lisse + bumpers + sensors + couloir plongeur. Les murs viennent des
   * trimeshes wall_ (PlayfieldTrimeshBuilder.buildRoleDriven), pas d'ici.
   */
  static createForMap(
    world: RAPIER.World,
    layout: MapLayout,
    colliderMap: Map<number, string>,
  ): void {
    PlayfieldColliderFactory.createPlayfieldFloor(world);
    PlayfieldColliderFactory.createBumpers(world, layout, colliderMap);
    PlayfieldColliderFactory.createSensors(world, layout, colliderMap);
    PlayfieldColliderFactory.createShooterLane(world, layout, { includeFloor: true });
  }

  private static createPinballmap(
    world: RAPIER.World,
    layout: MapLayout,
    colliderMap: Map<number, string>,
  ): void {
    // Sol analytique lisse (cuboïde incliné) qui remplace le trimesh bosselé du
    // GLB (Mesh_0, exclu côté PlayfieldTrimeshBuilder). Une primitive boîte n'a
    // aucune facette → la balle glisse sans accrocher les arêtes internes du
    // trimesh (« ghost collisions » Rapier) qui la ralentissaient.
    PlayfieldColliderFactory.createPlayfieldFloor(world);
    PlayfieldColliderFactory.createBumpers(world, layout, colliderMap);
    PlayfieldColliderFactory.createSensors(world, layout, colliderMap);
    // Sol analytique ACTIVÉ : le tapis Strangerthings est splitté en 2
    // trimeshes avec une couture à Z≈-0.286 en plein couloir (+ lèvre ~3mm
    // sur Circle.001). Le strip lisse shadow la couture → launch fiable.
    PlayfieldColliderFactory.createShooterLane(world, layout, { includeFloor: true });
  }

  /**
   * Couloir plongeur analytique : murs + guide (+ sol optionnel).
   * Sur Strangerthings le sol analytique est REQUIS : le tapis GLB est
   * splitté en 2 trimeshes (Mesh_1 / Circle.001) avec une couture + lèvre
   * ~3mm à Z≈-0.286 en plein couloir → la bille montante déviait. Le strip
   * lisse (createShooterLaneFloor) shadow la couture. includeFloor: true.
   */
  static createShooterLane(
    world: RAPIER.World,
    layout: MapLayout,
    options: { includeFloor?: boolean } = {},
  ): void {
    const lane = layout.shooterLane;
    if (options.includeFloor !== false) {
      PlayfieldColliderFactory.createShooterLaneFloor(world, layout);
    }
    // Mur droit : pleine hauteur, contient la balle côté +X jusqu'au sommet.
    PlayfieldColliderFactory.createTiltedLaneWall(
      world,
      layout,
      lane.xMax,
      lane.topZ,
      lane.bottomZ,
    );
    // Mur gauche : s'arrête avant le sommet → ouverture de sortie en haut-gauche.
    // Aminci à 1cm, centre décalé à 0.211 → face extérieure 0.206 (au lieu de
    // 0.196) : ne déborde plus dans l'outlane droite (guide Plane.008 à 0.170,
    // canal 36mm pour bille 29.5mm). Face intérieure couloir inchangée (0.216).
    PlayfieldColliderFactory.createTiltedLaneWall(
      world,
      layout,
      lane.xMin + 0.005,
      lane.leftWallTopZ,
      lane.bottomZ,
      0.01,
    );
    PlayfieldColliderFactory.createShooterGuide(world, layout);
    PlayfieldColliderFactory.createShooterBackWall(world, layout);
  }

  /** Filet de sécurité : mur de fond en haut du couloir → la balle ne peut
   *  jamais s'échapper de la table, même si le guide la rate. */
  private static createShooterBackWall(world: RAPIER.World, layout: MapLayout): void {
    const lane = layout.shooterLane;
    const z = lane.topZ;
    const midX = (lane.xMin + lane.xMax) / 2;
    const halfX = (lane.xMax - lane.xMin) / 2;
    const y = surfaceYAtZ(z) + lane.wallHeight / 2;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(midX, y, z),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        halfX,
        lane.wallHeight / 2,
        lane.wallThickness / 2,
      )
        .setRestitution(lane.restitution)
        .setFriction(lane.friction),
      body,
    );
  }

  private static createShooterLaneFloor(world: RAPIER.World, layout: MapLayout): void {
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

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(midX, midY, midZ)
        .setRotation({ x: Math.sin(tilt / 2), y: 0, z: 0, w: Math.cos(tilt / 2) }),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfX, 0.003, halfZ)
        .setRestitution(0.3)
        .setFriction(0.12),
      body,
    );
  }

  /** Mur droit le long de Z (suit l'inclinaison du tapis), épaisseur sur X. */
  private static createTiltedLaneWall(
    world: RAPIER.World,
    layout: MapLayout,
    x: number,
    zTop: number,
    zBot: number,
    thickness?: number,
  ): void {
    const lane = layout.shooterLane;
    const t = thickness ?? lane.wallThickness;
    const midZ = (zTop + zBot) / 2;
    const halfZ = (zBot - zTop) / 2;
    const yTop = surfaceYAtZ(zTop);
    const yBot = surfaceYAtZ(zBot);
    const midY = (yTop + yBot) / 2 + lane.wallHeight / 2;
    const tilt = Math.atan2(yTop - yBot, zBot - zTop);

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(x, midY, midZ)
        .setRotation({ x: Math.sin(tilt / 2), y: 0, z: 0, w: Math.cos(tilt / 2) }),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        t / 2,
        lane.wallHeight / 2,
        halfZ,
      )
        .setRestitution(lane.restitution)
        .setFriction(lane.friction),
      body,
    );
  }

  /**
   * Guide courbe : quart de cercle approximé par N cuboïdes tangents.
   * La normale concave pousse la balle montante (-Z) vers le terrain (-X).
   */
  private static createShooterGuide(world: RAPIER.World, layout: MapLayout): void {
    const lane = layout.shooterLane;
    const C = lane.guideCenter;
    const R = lane.guideRadius;
    const N = lane.guideSegments;
    const dA = (lane.guideAngleEnd - lane.guideAngleStart) / N;
    const halfLen = (R * Math.abs(dA)) / 2 + lane.wallThickness;

    for (let i = 0; i < N; i++) {
      const aMid = lane.guideAngleStart + dA * (i + 0.5);
      const x = C.x + R * Math.cos(aMid);
      const z = C.z + R * Math.sin(aMid);
      const y = surfaceYAtZ(z) + lane.wallHeight / 2;

      // Tangente à l'arc dans le plan XZ → axe local +X du cuboïde.
      const tx = -Math.sin(aMid);
      const tz = Math.cos(aMid);
      const alpha = Math.atan2(-tz, tx);
      const qy = Math.sin(alpha / 2);
      const qw = Math.cos(alpha / 2);

      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(x, y, z)
          .setRotation({ x: 0, y: qy, z: 0, w: qw }),
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          halfLen,
          lane.wallHeight / 2,
          lane.wallThickness / 2,
        )
          .setRestitution(lane.restitution)
          .setFriction(lane.friction),
        body,
      );
    }
  }

  private static createSensors(
    world: RAPIER.World,
    layout: MapLayout,
    colliderMap: Map<number, string>,
  ): void {
    PlayfieldColliderFactory.createSlingshotSensors(world, colliderMap);
    PlayfieldColliderFactory.createPopZoneSensors(world, layout, colliderMap);
    PlayfieldColliderFactory.createRocketSensor(world, layout, colliderMap);
    PlayfieldColliderFactory.createBossTargets(world, layout, colliderMap);
    PlayfieldColliderFactory.createDropTargets(world, layout, colliderMap);
    PlayfieldColliderFactory.createBottomOutSensor(world, layout, colliderMap);
    // Les bumps (Bump-left / Bump-right) sont détectés via leur trimesh GLB,
    // taggé dans colliderMap par PlayfieldTrimeshBuilder. Aucun sensor cylindrique
    // supplémentaire : la surface réelle du mèche est la zone de rebond.
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
        .setRestitution(0.35).setFriction(0.12),
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

  private static createWalls(world: RAPIER.World, layout: MapLayout): void {
    const WALL_H = 0.06;
    const WALL_T = 0.015;
    const HH = WALL_H / 2;
    const HT = WALL_T / 2;
    const laneSepX = layout.spawns.ball.x - BALL_RADIUS * 2;

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

  private static createBumpers(
    world: RAPIER.World,
    layout: MapLayout,
    colliderMap: Map<number, string>,
  ): void {
    for (let i = 0; i < layout.bumpers.length; i++) {
      const pos = layout.bumpers[i];
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

  private static createPopZoneSensors(
    world: RAPIER.World,
    layout: MapLayout,
    colliderMap: Map<number, string>,
  ): void {
    const zones = layout.sensors.popZones;
    for (let i = 0; i < zones.length; i++) {
      const p = zones[i];
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

  private static createBossTargets(
    world: RAPIER.World,
    layout: MapLayout,
    colliderMap: Map<number, string>,
  ): void {
    for (const boss of layout.bosses) {
      const p = boss.target;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z),
      );
      const col = world.createCollider(
        RAPIER.ColliderDesc.ball(0.034)
          .setSensor(true)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      colliderMap.set(col.handle, boss.colliderRole);
    }
  }

  private static createRocketSensor(
    world: RAPIER.World,
    layout: MapLayout,
    colliderMap: Map<number, string>,
  ): void {
    const rocket = layout.sensors.rocket;
    const b = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(rocket.x, rocket.y, rocket.z),
    );
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.015, 0.010, 0.020)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      b,
    );
    colliderMap.set(col.handle, 'rocket_ramp');
  }

  private static createDropTargets(
    world: RAPIER.World,
    layout: MapLayout,
    colliderMap: Map<number, string>,
  ): void {
    for (const dt of layout.dropTargets) {
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

  private static createBottomOutSensor(
    world: RAPIER.World,
    layout: MapLayout,
    colliderMap: Map<number, string>,
  ): void {
    const leftX = layout.geometry.bounds.leftX;
    const laneSepX = bottomOutLaneSepX(layout.spawns.ball.x);
    const centerX = (leftX + laneSepX) / 2;
    const halfX = (laneSepX - leftX) / 2;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(centerX, surfaceYAtZ(BOTTOM_OUT_Z), BOTTOM_OUT_Z),
    );
    const col = world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfX, 0.03, 0.01)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    colliderMap.set(col.handle, 'bottom_out');
  }
}
