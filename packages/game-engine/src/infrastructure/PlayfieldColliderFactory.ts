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
 * Applier mince : traduit un ColliderSpec PUR (cf. ColliderSpecPlanner) en
 * appels Rapier createRigidBody/createCollider. Toute la math (translation /
 * halfExtents / quaternion / restitution / sensor) vit dans le planner testable.
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
    // Sol analytique ACTIVÉ : le tapis GLB est splitté en 2
    // trimeshes avec une couture à Z≈-0.286 en plein couloir (+ lèvre ~3mm
    // sur Circle.001). Le strip lisse shadow la couture → launch fiable.
    PlayfieldColliderFactory.createShooterLane(world, layout, { includeFloor: true });
  }

  /**
   * Couloir plongeur analytique : murs + guide (+ sol optionnel).
   * Quand le sol GLB est multi-mesh, le sol analytique est REQUIS : le tapis GLB est
   * splitté en 2 trimeshes (Mesh_1 / Circle.001) avec une couture + lèvre
   * ~3mm à Z≈-0.286 en plein couloir → la bille montante déviait. Le strip
   * lisse (createShooterLaneFloor) shadow la couture. includeFloor: true.
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
