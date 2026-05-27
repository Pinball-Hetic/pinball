import * as THREE from 'three';
import type { GameEvent } from '../domain/GameEvents';
import type { BumperVisuals } from './BumperVisuals';
import type { GarlandLights } from './GarlandLights';
import { normalizeGltfName } from './GltfNodeNames';

const BLEND_DURATION = 2.8;
const TARGET_BG = 0x0a0818;
const TARGET_TINT = 0x2a1835;
const TARGET_EMISSIVE = 0x551133;
const TARGET_EXPOSURE = 1.05;
const TARGET_AMBIENT_INTENSITY = 0.52;
const TARGET_HEMI_INTENSITY = 0.32;
const TARGET_DIR_INTENSITY = 1.05;
const TARGET_FILL_INTENSITY = 0.38;
const TARGET_SHADE_OPACITY = 0.46;

const PLAYFIELD_W = 0.58;
const PLAYFIELD_D = 1.02;
const PLAYFIELD_TILT = Math.atan2(0.110, 0.970);

type MaterialSnapshot = {
  material: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
};

type SceneLighting = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  dir: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
};

type SetupConfig = {
  root: THREE.Object3D;
  lighting: SceneLighting;
  garlandLights: GarlandLights | null;
  bumperVisuals: BumperVisuals | null;
};

const _lerpColor = new THREE.Color();

function skipAtmosphereTint(obj: THREE.Object3D): boolean {
  const n = normalizeGltfName(obj.name);
  if (/^guirlande-\d+$/.test(n)) return true;
  if (/bumper-strangerthings/.test(n)) return true;
  if (/^bumper_ring/.test(n)) return true;
  return false;
}

export class UpsideDownAtmosphere {
  private materials: MaterialSnapshot[] = [];
  private lighting: SceneLighting | null = null;
  private garlandLights: GarlandLights | null = null;
  private bumperVisuals: BumperVisuals | null = null;
  private playfieldShade: THREE.Mesh | null = null;
  private playfieldShadeMat: THREE.MeshBasicMaterial | null = null;
  private mix = 0;
  private targetMix = 0;
  private visited = false;

  private origBg = new THREE.Color();
  private origExposure = 1.45;
  private origAmbientColor = new THREE.Color();
  private origAmbientIntensity = 1;
  private origHemiSky = new THREE.Color();
  private origHemiGround = new THREE.Color();
  private origHemiIntensity = 1;
  private origDirColor = new THREE.Color();
  private origDirIntensity = 1;
  private origFillColor = new THREE.Color();
  private origFillIntensity = 1;

  setup(config: SetupConfig): void {
    this.dispose();
    this.lighting = config.lighting;
    this.garlandLights = config.garlandLights;
    this.bumperVisuals = config.bumperVisuals;
    this.materials = [];

    config.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (skipAtmosphereTint(obj)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        if (this.materials.some((entry) => entry.material === mat)) continue;
        this.materials.push({
          material: mat,
          color: mat.color.clone(),
          emissive: mat.emissive.clone(),
          emissiveIntensity: mat.emissiveIntensity,
        });
      }
    });

    this.playfieldShadeMat = new THREE.MeshBasicMaterial({
      color: 0x180818,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    this.playfieldShade = new THREE.Mesh(
      new THREE.PlaneGeometry(PLAYFIELD_W, PLAYFIELD_D),
      this.playfieldShadeMat,
    );
    this.playfieldShade.rotation.x = -Math.PI / 2 + PLAYFIELD_TILT;
    this.playfieldShade.position.set(0, 1.062, -0.067);
    this.playfieldShade.renderOrder = 550;
    this.playfieldShade.visible = false;
    config.root.add(this.playfieldShade);

    const bg = config.lighting.scene.background;
    if (bg instanceof THREE.Color) this.origBg.copy(bg);
    this.origExposure = config.lighting.renderer.toneMappingExposure;

    this.origAmbientColor.copy(config.lighting.ambient.color);
    this.origAmbientIntensity = config.lighting.ambient.intensity;
    this.origHemiSky.copy(config.lighting.hemi.color);
    this.origHemiGround.copy(config.lighting.hemi.groundColor);
    this.origHemiIntensity = config.lighting.hemi.intensity;
    this.origDirColor.copy(config.lighting.dir.color);
    this.origDirIntensity = config.lighting.dir.intensity;
    this.origFillColor.copy(config.lighting.fill.color);
    this.origFillIntensity = config.lighting.fill.intensity;

    this.mix = 0;
    this.targetMix = 0;
    this.visited = false;
  }

  onGameEvent(event: GameEvent): void {
    if (event.type !== 'PORTAL_TRANSITION_END') return;
    this.visited = true;
    this.targetMix = 1;
  }

  update(dt: number): void {
    if (this.mix === this.targetMix && this.targetMix === 0 && !this.visited) return;

    const step = dt / BLEND_DURATION;
    if (this.mix < this.targetMix) {
      this.mix = Math.min(this.targetMix, this.mix + step);
    } else if (this.mix > this.targetMix) {
      this.mix = Math.max(this.targetMix, this.mix - step);
    }

    this.applyMix(this.mix);

    if (this.mix === 0 && this.targetMix === 0) {
      this.visited = false;
    }
  }

  reset(): void {
    this.targetMix = 0;
  }

  dispose(): void {
    this.applyMix(0);

    if (this.playfieldShade) {
      this.playfieldShade.geometry.dispose();
      this.playfieldShade.parent?.remove(this.playfieldShade);
    }
    this.playfieldShadeMat?.dispose();

    this.materials = [];
    this.lighting = null;
    this.garlandLights = null;
    this.bumperVisuals = null;
    this.playfieldShade = null;
    this.playfieldShadeMat = null;
    this.mix = 0;
    this.targetMix = 0;
    this.visited = false;
  }

  private applyMix(t: number): void {
    const ease = t * t * (3 - 2 * t);

    for (const entry of this.materials) {
      entry.material.color.copy(entry.color);
      _lerpColor.set(TARGET_TINT);
      entry.material.color.lerp(_lerpColor, ease * 0.5);
      entry.material.color.multiplyScalar(1 - ease * 0.38);

      entry.material.emissive.copy(entry.emissive);
      _lerpColor.set(TARGET_EMISSIVE);
      entry.material.emissive.lerp(_lerpColor, ease * 0.35);
      entry.material.emissiveIntensity = THREE.MathUtils.lerp(
        entry.emissiveIntensity,
        entry.emissiveIntensity * 1.25 + 0.12,
        ease,
      );
    }

    if (this.playfieldShadeMat) {
      const shadeOpacity = TARGET_SHADE_OPACITY * ease;
      this.playfieldShadeMat.opacity = shadeOpacity;
      if (this.playfieldShade) {
        this.playfieldShade.visible = shadeOpacity > 0.01;
      }
    }

    if (this.lighting) {
      const { scene, renderer, ambient, hemi, dir, fill } = this.lighting;

      if (scene.background instanceof THREE.Color) {
        scene.background.copy(this.origBg);
        _lerpColor.set(TARGET_BG);
        (scene.background as THREE.Color).lerp(_lerpColor, ease);
      }

      renderer.toneMappingExposure = THREE.MathUtils.lerp(this.origExposure, TARGET_EXPOSURE, ease);

      ambient.color.copy(this.origAmbientColor);
      _lerpColor.set(0xccb8d8);
      ambient.color.lerp(_lerpColor, ease * 0.45);
      ambient.intensity = THREE.MathUtils.lerp(this.origAmbientIntensity, TARGET_AMBIENT_INTENSITY, ease);

      hemi.color.copy(this.origHemiSky);
      _lerpColor.set(0x443366);
      hemi.color.lerp(_lerpColor, ease * 0.6);
      hemi.groundColor.copy(this.origHemiGround);
      _lerpColor.set(0x1a0a14);
      hemi.groundColor.lerp(_lerpColor, ease * 0.65);
      hemi.intensity = THREE.MathUtils.lerp(this.origHemiIntensity, TARGET_HEMI_INTENSITY, ease);

      dir.color.copy(this.origDirColor);
      _lerpColor.set(0xd8c8e8);
      dir.color.lerp(_lerpColor, ease * 0.35);
      dir.intensity = THREE.MathUtils.lerp(this.origDirIntensity, TARGET_DIR_INTENSITY, ease);

      fill.color.copy(this.origFillColor);
      _lerpColor.set(0x8866aa);
      fill.color.lerp(_lerpColor, ease * 0.4);
      fill.intensity = THREE.MathUtils.lerp(this.origFillIntensity, TARGET_FILL_INTENSITY, ease);
    }

    const dim = THREE.MathUtils.lerp(1, 0.36, ease);
    const strobe = THREE.MathUtils.lerp(0, 0.48, ease);

    this.garlandLights?.setAtmosphere(dim, strobe);
    this.bumperVisuals?.setAtmosphere(dim, strobe);
  }
}
