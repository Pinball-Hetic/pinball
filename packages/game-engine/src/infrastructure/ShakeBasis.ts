import * as THREE from 'three';

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
