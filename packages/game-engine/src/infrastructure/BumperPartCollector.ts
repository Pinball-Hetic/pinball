import * as THREE from 'three';
import { normalizeGltfName } from './GltfNodeNames';
import {
  classifyBumperName,
  nearestBumperIndex,
  type BumperMatchRule,
  type BumperPoint,
} from '../domain/BumperVisualMath';

/**
 * Contexte passé au callback `build` pour chaque mesh bumper reconnu :
 * le mesh, sa catégorie résolue (`kind`), l'index de bumper de layout le
 * plus proche (position monde) et sa scale d'origine clonée.
 */
export interface BumperPartContext<K extends string> {
  mesh: THREE.Mesh;
  kind: K;
  bumperIndex: number;
  baseScale: THREE.Vector3;
}

/**
 * Traverse `root` et construit la liste des "parts" bumper via le matcher
 * configurable (`rules`) partagé. Logique commune ST/Zelda extraite verbatim :
 * - `hide` : masque le nœud (et ses descendants) sans créer de part.
 * - `part` : sur un THREE.Mesh, calcule l'index bumper le plus proche +
 *   capture `baseScale`, puis délègue à `build` la construction du part map-spécifique.
 *
 * `build` peut retourner `null` pour ignorer (parité avec le `continue` implicite).
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
