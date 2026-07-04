import * as THREE from "three";
import type { FlipperPivot } from "@pinball/game-engine";

export interface Vec3Coords {
  x: number;
  y: number;
  z: number;
}

export interface PivotCoords {
  left: Vec3Coords;
  right: Vec3Coords;
}

export interface DebugMeshRefs {
  colliders: THREE.LineSegments;
  leftHull: THREE.Mesh | null;
  rightHull: THREE.Mesh | null;
  leftPivotMarker: THREE.Mesh | null;
  rightPivotMarker: THREE.Mesh | null;
}

// Debug meshes (collider wireframes + flipper hulls + pivot spheres). Owns the
// `collidersOn` state (read by the animate loop for the Rapier debug render) and
// centralizes the H toggle — keeps the Three side effects out of the keyboard
// routing logic (cf. createKeyboardRouter).
export class DebugMeshManager {
  private on = false;

  constructor(
    private readonly meshes: DebugMeshRefs,
    private readonly getPivots: () => {
      left: FlipperPivot | null;
      right: FlipperPivot | null;
    },
  ) {}

  /** true when the collider debug render is active (read by animate). */
  get collidersOn(): boolean {
    return this.on;
  }

  // H toggle: flips visibility of all debug meshes. Returns the pivots'
  // world coordinates when turning on (both present), otherwise null — the
  // caller pushes them into the overlay.
  toggleColliders(): PivotCoords | null {
    this.on = !this.on;
    this.meshes.colliders.visible = this.on;
    if (this.meshes.leftHull) this.meshes.leftHull.visible = this.on;
    if (this.meshes.rightHull) this.meshes.rightHull.visible = this.on;
    if (this.meshes.leftPivotMarker) this.meshes.leftPivotMarker.visible = this.on;
    if (this.meshes.rightPivotMarker) this.meshes.rightPivotMarker.visible = this.on;

    const { left, right } = this.getPivots();
    if (this.on && left && right) {
      return { left: worldCoords(left), right: worldCoords(right) };
    }
    return null;
  }
}

function worldCoords(pivot: FlipperPivot): Vec3Coords {
  const v = new THREE.Vector3();
  pivot.pivot.getWorldPosition(v);
  return { x: +v.x.toFixed(4), y: +v.y.toFixed(4), z: +v.z.toFixed(4) };
}
