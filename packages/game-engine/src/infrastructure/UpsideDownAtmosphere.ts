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
const PULSE_EXPOSURE_MIN = 0.95;
const PULSE_EXPOSURE_MAX = 1.08;
const PULSE_EXPOSURE_SPEED = 1.8;
const ATMOSPHERE_STROBE_HZ = 4;
const BLEND_STROBE_HZ = 11;
const SPORE_COUNT = 28;

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

type SporeParticle = {
  mesh: THREE.Mesh;
  anchorX: number;
  anchorZ: number;
  baseY: number;
  angle: number;
  radius: number;
  speed: number;
  drift: number;
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
  private sporeGroup: THREE.Group | null = null;
  private spores: SporeParticle[] = [];
  private sporeMat: THREE.MeshBasicMaterial | null = null;
  private sporeGeos: THREE.BufferGeometry[] = [];
  private mix = 0;
  private targetMix = 0;
  private visited = false;
  private pulseT = 0;

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

    this.buildSpores(config.root);

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
    this.pulseT = 0;
  }

  onGameEvent(event: GameEvent): void {
    if (event.type !== 'PORTAL_TRANSITION_END') return;
    this.visited = true;
    this.targetMix = 1;
  }

  update(dt: number): void {
    const fullyActive = this.mix >= 1 && this.targetMix >= 1;
    if (this.mix === this.targetMix && this.targetMix === 0 && !this.visited && !fullyActive) return;

    this.pulseT += dt;

    const step = dt / BLEND_DURATION;
    if (this.mix < this.targetMix) {
      this.mix = Math.min(this.targetMix, this.mix + step);
    } else if (this.mix > this.targetMix) {
      this.mix = Math.max(this.targetMix, this.mix - step);
    }

    this.applyMix(this.mix);

    if (fullyActive) {
      this.applyLivePulse();
    }

    let sporeIntensity = 0;
    if (this.mix > 0) {
      if (this.targetMix >= 1) {
        sporeIntensity = this.mix >= 1 ? 1 : Math.max(0, (this.mix - 0.85) / 0.15);
      } else {
        sporeIntensity = this.mix;
      }
    }
    this.updateSpores(dt, sporeIntensity);

    if (this.mix === 0 && this.targetMix === 0) {
      this.visited = false;
    }
  }

  reset(): void {
    this.targetMix = 0;
  }

  dispose(): void {
    this.applyMix(0);
    this.updateSpores(0, 0);

    if (this.playfieldShade) {
      this.playfieldShade.geometry.dispose();
      this.playfieldShade.parent?.remove(this.playfieldShade);
    }
    this.playfieldShadeMat?.dispose();

    if (this.sporeGroup) this.sporeGroup.parent?.remove(this.sporeGroup);
    for (const geo of this.sporeGeos) geo.dispose();
    this.sporeMat?.dispose();

    this.materials = [];
    this.lighting = null;
    this.garlandLights = null;
    this.bumperVisuals = null;
    this.playfieldShade = null;
    this.playfieldShadeMat = null;
    this.sporeGroup = null;
    this.spores = [];
    this.sporeMat = null;
    this.sporeGeos = [];
    this.mix = 0;
    this.targetMix = 0;
    this.visited = false;
    this.pulseT = 0;
  }

  private buildSpores(root: THREE.Object3D): void {
    this.sporeGroup = new THREE.Group();
    this.sporeMat = new THREE.MeshBasicMaterial({
      color: 0xff6688,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < SPORE_COUNT; i++) {
      const geo = new THREE.SphereGeometry(0.0016 + (i % 3) * 0.0005, 6, 6);
      const mesh = new THREE.Mesh(geo, this.sporeMat);
      mesh.visible = false;
      mesh.renderOrder = 520;
      this.sporeGroup.add(mesh);
      this.sporeGeos.push(geo);

      this.spores.push({
        mesh,
        anchorX: THREE.MathUtils.lerp(-0.22, 0.22, ((i * 0.37) % 1)),
        anchorZ: THREE.MathUtils.lerp(-0.48, 0.32, ((i * 0.53 + 0.11) % 1)),
        baseY: 1.035 + (i % 6) * 0.009,
        angle: (i / SPORE_COUNT) * Math.PI * 2,
        radius: 0.014 + (i % 5) * 0.006,
        speed: 0.32 + (i % 7) * 0.1,
        drift: 0.55 + (i % 4) * 0.18,
      });
    }

    root.add(this.sporeGroup);
  }

  private updateSpores(dt: number, intensity: number): void {
    if (!this.sporeMat) return;

    const active = intensity > 0.01;
    this.sporeMat.opacity = 0.72 * intensity;

    for (const spore of this.spores) {
      spore.mesh.visible = active;
      if (!active) continue;

      spore.angle += spore.speed * dt;
      const r = spore.radius * (0.9 + Math.sin(this.pulseT * 2.4 + spore.angle) * 0.1);
      const lift = Math.sin(this.pulseT * spore.drift + spore.angle) * 0.014;
      const wander = Math.sin(this.pulseT * 1.6 + spore.angle * 2.1) * 0.006;

      spore.mesh.position.set(
        spore.anchorX + Math.cos(spore.angle) * r + wander,
        spore.baseY + lift + Math.sin(this.pulseT * 0.35 + spore.angle) * 0.018,
        spore.anchorZ + Math.sin(spore.angle) * r - wander * 0.6,
      );

      const scale = (0.48 + Math.sin(this.pulseT * 4.2 + spore.angle) * 0.32) * intensity;
      spore.mesh.scale.setScalar(Math.max(0.15, scale));
    }
  }

  private applyLivePulse(): void {
    if (!this.lighting) return;
    const wave = 0.5 + Math.sin(this.pulseT * PULSE_EXPOSURE_SPEED) * 0.5;
    this.lighting.renderer.toneMappingExposure = THREE.MathUtils.lerp(
      PULSE_EXPOSURE_MIN,
      PULSE_EXPOSURE_MAX,
      wave,
    );
  }

  private applyMix(t: number): void {
    const ease = t * t * (3 - 2 * t);
    const fullyActive = t >= 1 && this.targetMix >= 1;

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

      if (!fullyActive) {
        renderer.toneMappingExposure = THREE.MathUtils.lerp(this.origExposure, TARGET_EXPOSURE, ease);
      }

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
    const strobeHz = fullyActive ? ATMOSPHERE_STROBE_HZ : BLEND_STROBE_HZ;

    this.garlandLights?.setAtmosphere(dim, strobe, strobeHz);
    this.bumperVisuals?.setAtmosphere(dim, strobe, strobeHz);
  }
}
