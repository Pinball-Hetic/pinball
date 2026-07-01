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

// Façade des meshes de debug (wireframes colliders + hulls flippers + sphères
// pivot). Possède l'état `collidersOn` (lu par la boucle animate pour le rendu
// Rapier debug) et centralise le toggle H — isole les side-effects Three de la
// logique de routage clavier (cf. createKeyboardRouter).
export class DebugMeshManager {
  private on = false;

  constructor(
    private readonly meshes: DebugMeshRefs,
    private readonly getPivots: () => {
      left: FlipperPivot | null;
      right: FlipperPivot | null;
    },
  ) {}

  /** true si le rendu debug des colliders est actif (lu par animate). */
  get collidersOn(): boolean {
    return this.on;
  }

  // Toggle H : bascule la visibilité de tous les meshes debug. Renvoie les
  // coordonnées monde des pivots quand on allume (les deux présents), sinon null
  // — l'appelant les pousse dans l'overlay.
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
