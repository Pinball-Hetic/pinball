import type * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
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

  // Walls come from the wall_ trimeshes (PlayfieldTrimeshBuilder), not from here.
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
    // Smooth analytic floor replaces the bumpy GLB trimesh (Mesh_0, excluded in
    // PlayfieldTrimeshBuilder): a box has no facets, so the ball glides without
    // snagging on the trimesh's internal edges (Rapier "ghost collisions").
    PlayfieldColliderFactory.createPlayfieldFloor(world);
    PlayfieldColliderFactory.createBumpers(world, layout, colliderMap);
    PlayfieldColliderFactory.createSensors(world, layout, colliderMap);
    // Analytic lane floor shadows the GLB seam (2 trimeshes meeting at Z≈-0.286
    // + ~3mm lip on Circle.001) that otherwise deviates the climbing ball.
    PlayfieldColliderFactory.createShooterLane(world, layout, { includeFloor: true });
  }

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
