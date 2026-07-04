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
  private texture: THREE.Texture | null = null;
  private readonly textureCache = new Map<string, THREE.Texture>();
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

    this.loadPromise = this.setTextureUrl(config.textureUrl);
  }

  /** Preload a texture without showing it (avoids the flash on swap). */
  preloadTexture(url: string): Promise<void> {
    return this.fetchTexture(url).then(() => undefined);
  }

  getActiveTextureUrl(): string | null {
    return (this.texture?.userData?.url as string | undefined) ?? null;
  }

  ensureReady(): Promise<void> {
    return this.loadPromise ?? Promise.resolve();
  }

  warmup(renderer: THREE.WebGLRenderer): void {
    for (const tex of this.textureCache.values()) {
      renderer.initTexture(tex);
    }
  }

  get object3D(): THREE.Object3D | null {
    return this.sprite;
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

  /** Switch to a single texture — never two images on the same sprite. */
  setTextureUrl(url: string): Promise<void> {
    if (this.getActiveTextureUrl() === url && this.imageReady) {
      return Promise.resolve();
    }

    this.imageReady = false;
    const load = this.fetchTexture(url).then((tex) => {
      if (!tex || !this.material) {
        this.imageReady = this.texture !== null;
        return;
      }
      this.texture = tex;
      this.material.map = tex;
      this.material.needsUpdate = true;
      this.imageReady = true;
    });
    this.loadPromise = load;
    return load;
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
      this.material.map = null;
      this.material.dispose();
    }
    for (const tex of this.textureCache.values()) {
      tex.dispose();
    }
    this.textureCache.clear();
    this.sprite?.parent?.remove(this.sprite);
    this.camera = null;
    this.sprite = null;
    this.material = null;
    this.texture = null;
    this.imageReady = false;
    this.loadPromise = null;
  }

  private fetchTexture(url: string): Promise<THREE.Texture | null> {
    const cached = this.textureCache.get(url);
    if (cached) return Promise.resolve(cached);

    const loader = new THREE.TextureLoader();
    return new Promise((resolve) => {
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.userData.url = url;
          this.textureCache.set(url, tex);
          resolve(tex);
        },
        undefined,
        () => resolve(null),
      );
    });
  }
}
