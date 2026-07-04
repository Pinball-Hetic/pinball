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
  /** raw resolved meshes (for buildFlipperBodies) */
  leftMesh: THREE.Object3D | null;
  rightMesh: THREE.Object3D | null;
  /** hinge pivots (null when the flipper is not a mesh) */
  leftPivot: FlipperPivot | null;
  rightPivot: FlipperPivot | null;
  /** objects animate uses for transforms (= the mesh when isMesh) */
  leftObj: THREE.Object3D | null;
  rightObj: THREE.Object3D | null;
  leftFlashMats: FlashMat[];
  rightFlashMats: FlashMat[];
  /** launch-guarantee zones, or null when a flipper is missing */
  zones: FlipperZones | null;
}

// Resolves + attaches the GLB flippers (inert setup): new format
// (flipper-left/right) or legacy (geometric split). Attaches each flipper at
// its hinge, collects hit-flash materials, computes the launch zones.
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

  // Zones derived from the mesh bboxes (rest pose).
  if (r.leftObj && r.rightObj) {
    r.zones = computeFlipperZones(r.leftObj, r.rightObj, ballRadius);
  }

  return r;
}
