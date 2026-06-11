import * as THREE from 'three';

export type CameraBillboardConfig = {
  textureUrl: string;
  center?: THREE.Vector2;
  scale?: THREE.Vector3;
  renderOrder?: number;
  depth?: number;
  yOffset?: number;
};

const _camPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

export class CameraBillboardSprite {
  private camera: THREE.Camera | null = null;
  private sprite: THREE.Sprite | null = null;
  private material: THREE.SpriteMaterial | null = null;
  private imageReady = false;
  private depth = 0.38;
  private yOffset = 0.06;
  private loadPromise: Promise<void> | null = null;

  mount(scene: THREE.Scene, camera: THREE.Camera, config: CameraBillboardConfig): void {
    this.dispose();
    this.camera = camera;
    this.depth = config.depth ?? 0.38;
    this.yOffset = config.yOffset ?? 0.06;

    this.material = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.center.copy(config.center ?? new THREE.Vector2(0.5, 0.35));
    this.sprite.scale.copy(config.scale ?? new THREE.Vector3(0.55, 0.72, 1));
    this.sprite.renderOrder = config.renderOrder ?? 950;
    this.sprite.visible = false;
    scene.add(this.sprite);

    const loader = new THREE.TextureLoader();
    this.loadPromise = new Promise<void>((resolve) => {
      loader.load(
        config.textureUrl,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          if (this.material) {
            this.material.map = tex;
            this.material.needsUpdate = true;
          }
          this.imageReady = true;
          resolve();
        },
        undefined,
        () => {
          this.imageReady = true;
          resolve();
        },
      );
    });
  }

  ensureReady(): Promise<void> {
    return this.loadPromise ?? Promise.resolve();
  }

  isReady(): boolean {
    return this.imageReady;
  }

  sync(): void {
    if (!this.camera || !this.sprite?.visible) return;

    this.camera.getWorldPosition(_camPos);
    this.camera.getWorldDirection(_lookTarget);
    _lookTarget.normalize();

    this.sprite.position.copy(_camPos).addScaledVector(_lookTarget, this.depth);
    this.sprite.position.y += this.yOffset;
    this.sprite.quaternion.copy(this.camera.quaternion);
  }

  setOpacity(opacity: number): void {
    if (this.material) {
      this.material.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
    }
  }

  show(): void {
    if (this.sprite) this.sprite.visible = true;
  }

  hide(): void {
    if (this.sprite) this.sprite.visible = false;
    this.setOpacity(0);
  }

  dispose(): void {
    if (this.material) {
      this.material.map?.dispose();
      this.material.dispose();
    }
    this.sprite?.parent?.remove(this.sprite);
    this.camera = null;
    this.sprite = null;
    this.material = null;
    this.imageReady = false;
    this.loadPromise = null;
  }
}
