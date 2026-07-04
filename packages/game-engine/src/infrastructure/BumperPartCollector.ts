import * as THREE from 'three';
import { normalizeGltfName } from './GltfNodeNames';
import {
  classifyBumperName,
  nearestBumperIndex,
  type BumperMatchRule,
  type BumperPoint,
} from '../domain/BumperVisualMath';

/**
 * Context passed to the `build` callback for each recognized bumper mesh:
 * the mesh, its resolved category (`kind`), the nearest layout bumper index
 * (world position) and its cloned original scale.
 */
export interface BumperPartContext<K extends string> {
  mesh: THREE.Mesh;
  kind: K;
  bumperIndex: number;
  baseScale: THREE.Vector3;
}

/**
 * Traverses `root` and builds the bumper "parts" list via the shared
 * configurable matcher (`rules`). Common ST/Zelda logic:
 * - `hide`: hides the node (and its descendants) without creating a part.
 * - `part`: on a THREE.Mesh, computes the nearest bumper index + captures
 *   `baseScale`, then delegates the map-specific part construction to `build`.
 *
 * `build` may return `null` to skip.
 */
export function collectBumperParts<K extends string, P>(
  root: THREE.Object3D,
  bumpers: readonly BumperPoint[],
  rules: readonly BumperMatchRule<K>[],
  build: (ctx: BumperPartContext<K>) => P | null,
): P[] {
  const parts: P[] = [];
  const wp = new THREE.Vector3();

  root.traverse((obj) => {
    const match = classifyBumperName(normalizeGltfName(obj.name), rules);

    if (match.action === 'hide') {
      obj.visible = false;
      obj.traverse((child) => {
        child.visible = false;
      });
      return;
    }

    if (match.action === 'skip') return;
    if (!(obj instanceof THREE.Mesh)) return;

    obj.getWorldPosition(wp);
    const part = build({
      mesh: obj,
      kind: match.kind,
      bumperIndex: nearestBumperIndex(wp, bumpers),
      baseScale: obj.scale.clone(),
    });
    if (part !== null) parts.push(part);
  });

  return parts;
}
