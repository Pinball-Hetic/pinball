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
  root: THREE.Object3D;
  manifest: MapManifest;
  layout: MapLayout;
  colliderMap: Map<number, string>;
}

export function buildPlayfieldColliders(deps: BuildPlayfieldCollidersDeps): void {
  const { world, root, manifest, layout, colliderMap } = deps;

  const meshResolver = new MeshRoleResolver(manifest.meshAliases);
  PlayfieldTrimeshBuilder.buildRoleDriven(root, world, meshResolver, manifest.elements ?? {});

  // Drop targets are derived from the GLB, but bumpers stay literal: a Box3
  // center is not the tuned collider position.
  const derivedLayout = LayoutResolver.deriveAndCompare(root, meshResolver, layout);
  const resolvedLayout = LayoutResolver.withDerivedDropTargets(layout, derivedLayout);
  PlayfieldColliderFactory.createForMap(world, resolvedLayout, colliderMap);
}
