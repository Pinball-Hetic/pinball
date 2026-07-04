import type * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { MapLayout } from '../domain/MapLayout';
import { computeLauncherLaneZBounds } from './LauncherLaneBounds';
import { hasPinballmapRoot } from './GltfNodeNames';
import {
  planBumpers,
  planLaneFloor,
  planPlayfieldFloor,
  planSensors,
  planShooterLane,
  planWalls,
  type ColliderSpec,
} from './ColliderSpecPlanner';

export type AnalyticalColliderOptions = {
  laneFloor?: boolean;
  walls?: boolean;
  bumpers?: boolean;
};

/**
 * Thin applier: translates a ColliderSpec (see ColliderSpecPlanner) into
 * Rapier createRigidBody/createCollider calls. All the math (translation /
 * halfExtents / quaternion / restitution / sensor) lives in the planner.
 */
function applyColliderSpec(
  world: RAPIER.World,
  spec: ColliderSpec,
  colliderMap?: Map<number, string>,
): void {
  const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
    spec.translation.x,
    spec.translation.y,
    spec.translation.z,
  );
  if (spec.rotation) bodyDesc.setRotation(spec.rotation);
  const body = world.createRigidBody(bodyDesc);

  let colliderDesc: RAPIER.ColliderDesc;
  switch (spec.shape.kind) {
    case 'cuboid':
      colliderDesc = RAPIER.ColliderDesc.cuboid(
        spec.shape.halfExtents.x,
        spec.shape.halfExtents.y,
        spec.shape.halfExtents.z,
      );
      break;
    case 'cylinder':
      colliderDesc = RAPIER.ColliderDesc.cylinder(spec.shape.halfHeight, spec.shape.radius);
      break;
    case 'ball':
      colliderDesc = RAPIER.ColliderDesc.ball(spec.shape.radius);
      break;
  }
  if (spec.restitution !== undefined) colliderDesc.setRestitution(spec.restitution);
  if (spec.friction !== undefined) colliderDesc.setFriction(spec.friction);
  if (spec.sensor) colliderDesc.setSensor(true);
  if (spec.collisionEvents) colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

  const col = world.createCollider(colliderDesc, body);
  if (spec.role !== undefined && colliderMap) colliderMap.set(col.handle, spec.role);
}

function applySpecs(
  world: RAPIER.World,
  specs: ColliderSpec[],
  colliderMap?: Map<number, string>,
): void {
  for (const spec of specs) applyColliderSpec(world, spec, colliderMap);
}

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
   * Analytic colliders for a conventioned map (role-driven GLB): smooth
   * floor + bumpers + sensors + shooter lane. Walls come from the wall_
   * trimeshes (PlayfieldTrimeshBuilder.buildRoleDriven), not from here.
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
    // Smooth analytic floor (tilted cuboid) replacing the bumpy GLB trimesh
    // (Mesh_0, excluded in PlayfieldTrimeshBuilder). A box primitive has no
    // facets → the ball glides without snagging on the trimesh's internal
    // edges (Rapier "ghost collisions") that used to slow it down.
    PlayfieldColliderFactory.createPlayfieldFloor(world);
    PlayfieldColliderFactory.createBumpers(world, layout, colliderMap);
    PlayfieldColliderFactory.createSensors(world, layout, colliderMap);
    // Analytic floor ENABLED: the GLB playfield is split into 2 trimeshes
    // with a seam at Z≈-0.286 right in the lane (+ a ~3mm lip on Circle.001).
    // The smooth strip shadows the seam → reliable launch.
    PlayfieldColliderFactory.createShooterLane(world, layout, { includeFloor: true });
  }

  /**
   * Analytic shooter lane: walls + guide (+ optional floor).
   * When the GLB floor is multi-mesh, the analytic floor is REQUIRED: the
   * GLB playfield is split into 2 trimeshes (Mesh_1 / Circle.001) with a
   * seam + ~3mm lip at Z≈-0.286 right in the lane → the climbing ball
   * deviated. The smooth strip (createShooterLaneFloor) shadows the seam.
   * includeFloor: true.
   */
  static createShooterLane(
    world: RAPIER.World,
    layout: MapLayout,
    options: { includeFloor?: boolean } = {},
  ): void {
    applySpecs(world, planShooterLane(layout, options));
  }

  private static createPlayfieldFloor(world: RAPIER.World): void {
    applyColliderSpec(world, planPlayfieldFloor());
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
    applyColliderSpec(world, planLaneFloor(laneTopZ, laneBotZ));
  }

  private static createWalls(world: RAPIER.World, layout: MapLayout): void {
    applySpecs(world, planWalls(layout));
  }

  private static createBumpers(
    world: RAPIER.World,
    layout: MapLayout,
    colliderMap: Map<number, string>,
  ): void {
    applySpecs(world, planBumpers(layout), colliderMap);
  }

  private static createSensors(
    world: RAPIER.World,
    layout: MapLayout,
    colliderMap: Map<number, string>,
  ): void {
    applySpecs(world, planSensors(layout), colliderMap);
  }
}
