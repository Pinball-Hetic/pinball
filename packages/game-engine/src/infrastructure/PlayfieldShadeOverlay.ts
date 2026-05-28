import * as THREE from 'three';
import {
  PLAYFIELD_SHADE_D,
  PLAYFIELD_SHADE_MAX_OPACITY,
  PLAYFIELD_SHADE_W,
  PLAYFIELD_SHADE_Y,
  PLAYFIELD_SHADE_Z,
  PLAYFIELD_TILT,
} from '../domain/PlayfieldGeometry';

export type PlayfieldShadeConfig = {
  color?: number;
  renderOrder?: number;
  maxOpacity?: number;
};

export function playfieldShadeStrobeOpacity(on: boolean, fullMap: boolean, mix: number): number {
  if (mix <= 0.02) return 0;
  return on ? (fullMap ? 0 : 0.12) * mix : 0.94 * mix;
}

export class PlayfieldShadeOverlay {
  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private maxOpacity = PLAYFIELD_SHADE_MAX_OPACITY;

  mount(root: THREE.Object3D, config?: PlayfieldShadeConfig): void {
    this.dispose();
    this.maxOpacity = config?.maxOpacity ?? PLAYFIELD_SHADE_MAX_OPACITY;

    this.material = new THREE.MeshBasicMaterial({
      color: config?.color ?? 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(PLAYFIELD_SHADE_W, PLAYFIELD_SHADE_D),
      this.material,
    );
    this.mesh.rotation.x = -Math.PI / 2 + PLAYFIELD_TILT;
    this.mesh.position.set(0, PLAYFIELD_SHADE_Y, PLAYFIELD_SHADE_Z);
    this.mesh.renderOrder = config?.renderOrder ?? 600;
    this.mesh.visible = false;
    root.add(this.mesh);
  }

  setOpacity(opacity: number): void {
    if (!this.material) return;
    const clamped = THREE.MathUtils.clamp(opacity, 0, this.maxOpacity);
    this.material.opacity = clamped;
    if (this.mesh) this.mesh.visible = clamped > 0.01;
  }

  hide(): void {
    this.setOpacity(0);
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.parent?.remove(this.mesh);
    }
    this.material?.dispose();
    this.mesh = null;
    this.material = null;
  }
}
