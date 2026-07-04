import * as THREE from 'three';

/**
 * Snapshot of the camera + playfield-root transforms taken before a tremor,
 * restored once the shake ends. Shared by the Stranger Things
 * UpsideDownTransition and the Zelda ZeldaTransition.
 *
 * No map import here (game-engine never imports a map): the THREE objects are
 * injected by the caller. `capture`/`restore` are null-safe.
 */
export class ShakeBasis {
  readonly camPos = new THREE.Vector3();
  readonly rootPos = new THREE.Vector3();
  readonly rootRot = new THREE.Euler();

  capture(camera: THREE.Camera | null, root: THREE.Object3D | null): void {
    if (camera) this.camPos.copy(camera.position);
    if (root) {
      this.rootPos.copy(root.position);
      this.rootRot.copy(root.rotation);
    }
  }

  restore(camera: THREE.Camera | null, root: THREE.Object3D | null): void {
    if (camera) camera.position.copy(this.camPos);
    if (root) {
      root.position.copy(this.rootPos);
      root.rotation.copy(this.rootRot);
    }
  }
}
