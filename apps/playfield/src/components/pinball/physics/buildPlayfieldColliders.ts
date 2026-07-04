import type * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import {
  MeshRoleResolver,
  LayoutResolver,
  PlayfieldTrimeshBuilder,
  PlayfieldColliderFactory,
  type MapLayout,
} from "@pinball/game-engine";
import type { MapManifest } from "@pinball/shared-types";

export interface BuildPlayfieldCollidersDeps {
  world: RAPIER.World;
  /** resolved GLB root (playfieldRoot) */
  root: THREE.Object3D;
  manifest: MapManifest;
  layout: MapLayout;
  /** filled by the factory: collider handle → role name (later consumed by
   * CollisionEventProcessor) */
  colliderMap: Map<number, string>;
}

// Builds every physics collider from the role-driven GLB (inert setup):
// walls/lane = trimeshes classified by role; drop targets derived from the
// GLB (LayoutResolver); floor/bumpers/sensors = analytic from the layout.
// Side effects on `world` + `colliderMap`.
export function buildPlayfieldColliders(deps: BuildPlayfieldCollidersDeps): void {
  const { world, root, manifest, layout, colliderMap } = deps;

  const meshResolver = new MeshRoleResolver(manifest.meshAliases);
  PlayfieldTrimeshBuilder.buildRoleDriven(root, world, meshResolver, manifest.elements ?? {});

  // Drop targets derived from the GLB (deltas ≤ 0.7 mm validated); bumpers
  // kept literal (Box3 center ≠ tuned collider). The comparison log stays on.
  const derivedLayout = LayoutResolver.deriveAndCompare(root, meshResolver, layout);
  const resolvedLayout = LayoutResolver.withDerivedDropTargets(layout, derivedLayout);
  PlayfieldColliderFactory.createForMap(world, resolvedLayout, colliderMap);
}
