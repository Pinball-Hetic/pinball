import * as THREE from 'three';

/**
 * Shared SETUP/TEARDOWN plumbing for map atmosphere systems (Stranger Things
 * Upside Down, Zelda Sacred Realm). The per-element apply-side lerps live in
 * `AtmosphereTint`; the blend integrator in `AtmosphereBlend` (domain). These
 * helpers capture/restore the scene lighting snapshot, collect the material
 * snapshots, and run the fog apply/restore lifecycle — all VERBATIM from the
 * original duplicated `setup()`/`dispose()`/`applyFog()` bodies.
 *
 * game-engine takes THREE types only — no map import.
 */

/** The five lighting handles every atmosphere mutates. Identical per map. */
export type SceneLighting = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  dir: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
};

/**
 * Snapshot of the scene/renderer/light state captured at `setup()`. Mirrors the
 * `orig*` fields that both atmospheres duplicated verbatim. `capture()` reads
 * them off a `SceneLighting`; the caller passes the stored snapshot fields back
 * into the `AtmosphereTint` apply helpers each frame.
 */
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

  /** Read the current lighting state into this snapshot. VERBATIM capture. */
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

/** Original (snapshot) values for one tinted material, captured at setup. */
export type AtmosphereMaterialEntry<Extra = unknown> = {
  material: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
} & Extra;

/**
 * Traverse `root`, snapshotting every unique `MeshStandardMaterial` into an
 * entry. `skip(obj)` drops a mesh entirely (ST flippers/garlands/bumpers);
 * `extra(obj)` adds per-map fields (ST `kind`). VERBATIM dedupe + clone.
 */
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

/**
 * FogExp2 apply/restore lifecycle. `apply()` swaps the map fog onto the scene
 * (restoring the saved fog when `ease <= 0`) and sets its density; `restore()`
 * puts the saved fog back. The caller owns the density formula (ST folds in a
 * `revealLift` factor, Zelda does not). VERBATIM plumbing.
 */
export class AtmosphereFog {
  private readonly fog: THREE.FogExp2;
  private savedFog: THREE.Fog | THREE.FogExp2 | null = null;

  constructor(color: THREE.ColorRepresentation) {
    this.fog = new THREE.FogExp2(color, 0);
  }

  /** Capture the scene's current fog so `restore()` can put it back. */
  save(scene: THREE.Scene): void {
    this.savedFog = scene.fog;
  }

  /** Swap in the map fog at `density` (or restore when `ease <= 0`). */
  apply(scene: THREE.Scene, ease: number, density: number): void {
    if (ease <= 0) {
      this.restore(scene);
      return;
    }
    this.fog.density = density;
    if (scene.fog !== this.fog) scene.fog = this.fog;
  }

  /** Restore the saved fog onto the scene. */
  restore(scene: THREE.Scene): void {
    scene.fog = this.savedFog;
  }
}
