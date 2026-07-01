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
  /** racine GLB résolue (playfieldRoot) */
  root: THREE.Object3D;
  manifest: MapManifest;
  layout: MapLayout;
  /** rempli par la factory : handle collider → nom de rôle (consommé ensuite
   * par CollisionEventProcessor) */
  colliderMap: Map<number, string>;
}

// Construit tous les colliders physiques depuis le GLB conventionné role-driven
// (setup, inerte) : murs/couloir = trimeshes classés par rôle ; drop targets
// dérivés du GLB (LayoutResolver) ; sol/bumpers/sensors = analytiques du layout.
// Side-effects sur `world` + `colliderMap`. Behavior-preserving 1:1.
export function buildPlayfieldColliders(deps: BuildPlayfieldCollidersDeps): void {
  const { world, root, manifest, layout, colliderMap } = deps;

  const meshResolver = new MeshRoleResolver(manifest.meshAliases);
  PlayfieldTrimeshBuilder.buildRoleDriven(root, world, meshResolver, manifest.elements ?? {});

  // Drop targets dérivés du GLB (deltas ≤ 0.7 mm validés) ; bumpers gardés au
  // littéral (centre Box3 ≠ collider tuné). Le log de comparaison reste actif.
  const derivedLayout = LayoutResolver.deriveAndCompare(root, meshResolver, layout);
  const resolvedLayout = LayoutResolver.withDerivedDropTargets(layout, derivedLayout);
  PlayfieldColliderFactory.createForMap(world, resolvedLayout, colliderMap);
}
