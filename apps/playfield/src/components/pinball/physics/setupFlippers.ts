import type * as THREE from "three";
import {
  resolvePlayfieldFlippers,
  attachFlipperAtHinge,
  collectFlashMats,
  computeFlipperZones,
  findObjectByNormalizedName,
  type FlipperPivot,
  type FlipperZones,
  type FlashMat,
} from "@pinball/game-engine";

type FlipperPivotsConfig = Parameters<typeof attachFlipperAtHinge>[2];

export interface FlipperSetupResult {
  /** meshes bruts résolus (pour buildFlipperBodies) */
  leftMesh: THREE.Object3D | null;
  rightMesh: THREE.Object3D | null;
  /** hinge pivots (null si le flipper n'est pas un mesh) */
  leftPivot: FlipperPivot | null;
  rightPivot: FlipperPivot | null;
  /** objets utilisés par animate pour les transforms (= mesh si isMesh) */
  leftObj: THREE.Object3D | null;
  rightObj: THREE.Object3D | null;
  leftFlashMats: FlashMat[];
  rightFlashMats: FlashMat[];
  /** zones de garantie de lancement, ou null si un flipper manque */
  zones: FlipperZones | null;
}

// Résout + attache les flippers du GLB (setup, inerte) : format nouveau
// (flipper-left/right) ou héritage (split géométrique). Attache chaque flipper à
// son hinge, collecte les matériaux de hit-flash, calcule les zones de lancement.
// Behavior-preserving 1:1 — retourne les refs assignées ensuite dans la closure.
export function setupFlippers(
  root: THREE.Object3D,
  flipperPivots: FlipperPivotsConfig,
  ballRadius: number,
): FlipperSetupResult {
  const pinballmap =
    findObjectByNormalizedName(root, "Pinballmap", "pinballmap") ?? root;
  const resolved = resolvePlayfieldFlippers(root);
  const leftMesh = resolved?.left ?? null;
  const rightMesh = resolved?.right ?? null;
  leftMesh?.updateMatrixWorld(true);
  rightMesh?.updateMatrixWorld(true);

  const r: FlipperSetupResult = {
    leftMesh,
    rightMesh,
    leftPivot: null,
    rightPivot: null,
    leftObj: null,
    rightObj: null,
    leftFlashMats: [],
    rightFlashMats: [],
    zones: null,
  };

  if (leftMesh && (leftMesh as THREE.Mesh).isMesh) {
    r.leftPivot = attachFlipperAtHinge(leftMesh, "left", flipperPivots, pinballmap);
    r.leftObj = leftMesh;
    r.leftFlashMats = collectFlashMats(leftMesh);
  }
  if (rightMesh && (rightMesh as THREE.Mesh).isMesh) {
    r.rightPivot = attachFlipperAtHinge(rightMesh, "right", flipperPivots, pinballmap);
    r.rightObj = rightMesh;
    r.rightFlashMats = collectFlashMats(rightMesh);
  }

  // Zones dérivées des bbox mesh (pose de repos).
  if (r.leftObj && r.rightObj) {
    r.zones = computeFlipperZones(r.leftObj, r.rightObj, ballRadius);
  }

  return r;
}
