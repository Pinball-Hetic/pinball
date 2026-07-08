import * as THREE from 'three';

export type SceneLighting = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  dir: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
};

export class LightingSnapshot {
  readonly bg = new THREE.Color();
  exposure = 1.45;
  readonly ambientColor = new THREE.Color();
  ambientIntensity = 1;
  readonly hemiSky = new THREE.Color();
  readonly hemiGround = new THREE.Color();
  hemiIntensity = 1;
  readonly dirColor = new THREE.Color();
  dirIntensity = 1;
  readonly fillColor = new THREE.Color();
  fillIntensity = 1;

  capture(lighting: SceneLighting): void {
    const bg = lighting.scene.background;
    if (bg instanceof THREE.Color) this.bg.copy(bg);
    this.exposure = lighting.renderer.toneMappingExposure;
    this.ambientColor.copy(lighting.ambient.color);
    this.ambientIntensity = lighting.ambient.intensity;
    this.hemiSky.copy(lighting.hemi.color);
    this.hemiGround.copy(lighting.hemi.groundColor);
    this.hemiIntensity = lighting.hemi.intensity;
    this.dirColor.copy(lighting.dir.color);
    this.dirIntensity = lighting.dir.intensity;
    this.fillColor.copy(lighting.fill.color);
    this.fillIntensity = lighting.fill.intensity;
  }
}

export type AtmosphereMaterialEntry<Extra = unknown> = {
  material: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
} & Extra;

export function collectAtmosphereMaterials<Extra extends object = Record<never, never>>(
  root: THREE.Object3D,
  options: {
    skip?: (obj: THREE.Mesh) => boolean;
    extra?: (obj: THREE.Mesh) => Extra;
  } = {},
): AtmosphereMaterialEntry<Extra>[] {
  const out: AtmosphereMaterialEntry<Extra>[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (options.skip?.(obj)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      if (out.some((entry) => entry.material === mat)) continue;
      const extra = options.extra ? options.extra(obj) : ({} as Extra);
      out.push({
        material: mat,
        color: mat.color.clone(),
        emissive: mat.emissive.clone(),
        emissiveIntensity: mat.emissiveIntensity,
        ...extra,
      });
    }
  });
  return out;
}

export class AtmosphereFog {
  private readonly fog: THREE.FogExp2;
  private savedFog: THREE.Fog | THREE.FogExp2 | null = null;

  constructor(color: THREE.ColorRepresentation) {
    this.fog = new THREE.FogExp2(color, 0);
  }

  save(scene: THREE.Scene): void {
    this.savedFog = scene.fog;
  }

  apply(scene: THREE.Scene, ease: number, density: number): void {
    if (ease <= 0) {
      this.restore(scene);
      return;
    }
    this.fog.density = density;
    if (scene.fog !== this.fog) scene.fog = this.fog;
  }

  restore(scene: THREE.Scene): void {
    scene.fog = this.savedFog;
  }
}
