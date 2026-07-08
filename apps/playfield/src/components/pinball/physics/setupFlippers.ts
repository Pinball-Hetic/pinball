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
  leftMesh: THREE.Object3D | null;
  rightMesh: THREE.Object3D | null;
  leftPivot: FlipperPivot | null;
  rightPivot: FlipperPivot | null;
  leftObj: THREE.Object3D | null;
  rightObj: THREE.Object3D | null;
  leftFlashMats: FlashMat[];
  rightFlashMats: FlashMat[];
  zones: FlipperZones | null;
}

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

  if (r.leftObj && r.rightObj) {
    r.zones = computeFlipperZones(r.leftObj, r.rightObj, ballRadius);
  }

  return r;
}
