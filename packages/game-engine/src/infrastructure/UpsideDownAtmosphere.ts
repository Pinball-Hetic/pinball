import * as THREE from 'three';
import type { GameEvent } from '../domain/GameEvents';
import {
  UPSIDE_DOWN_ATMOSPHERE_AMBIENT_INTENSITY,
  UPSIDE_DOWN_ATMOSPHERE_BG,
  UPSIDE_DOWN_ATMOSPHERE_BLEND,
  UPSIDE_DOWN_ATMOSPHERE_BLEND_STROBE_HZ,
  UPSIDE_DOWN_ATMOSPHERE_DECOR_EMISSIVE,
  UPSIDE_DOWN_ATMOSPHERE_DECOR_TINT,
  UPSIDE_DOWN_ATMOSPHERE_DIR_INTENSITY,
  UPSIDE_DOWN_ATMOSPHERE_EMISSIVE,
  UPSIDE_DOWN_ATMOSPHERE_EXPOSURE,
  UPSIDE_DOWN_ATMOSPHERE_FILL_INTENSITY,
  UPSIDE_DOWN_ATMOSPHERE_FOG_COLOR,
  UPSIDE_DOWN_ATMOSPHERE_FOG_DENSITY,
  UPSIDE_DOWN_ATMOSPHERE_HEMI_INTENSITY,
  UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_MAX,
  UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_MIN,
  UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_SPEED,
  UPSIDE_DOWN_ATMOSPHERE_SHADE_COLOR,
  UPSIDE_DOWN_ATMOSPHERE_SHADE_OPACITY,
  UPSIDE_DOWN_ATMOSPHERE_SPORE_COUNT,
  UPSIDE_DOWN_ATMOSPHERE_STROBE_HZ,
  UPSIDE_DOWN_ATMOSPHERE_SURFACE_TINT,
  UPSIDE_DOWN_ATMOSPHERE_TINT,
  UPSIDE_DOWN_ATMOSPHERE_WALL_TINT,
} from '../domain/UpsideDownConstants';
import type { BumperVisuals } from './BumperVisuals';
import type { GarlandLights } from './GarlandLights';
import { PlayfieldShadeOverlay } from './PlayfieldShadeOverlay';
import { canonicalGltfName, isFlipperGltfMesh, isPinballmapRailMesh, normalizeGltfName } from './GltfNodeNames';

type MaterialKind = 'surface' | 'wall' | 'decor' | 'default';

type MaterialSnapshot = {
  material: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
  kind: MaterialKind;
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
  if (obj instanceof THREE.Mesh && isFlipperGltfMesh(obj)) return true;
  const n = normalizeGltfName(obj.name);
  if (/^guirlande-\d+$/.test(n)) return true;
  if (/bumper-strangerthings/.test(n)) return true;
  if (/^bumper_ring/.test(n)) return true;
  return false;
}

function atmosphereMaterialKind(obj: THREE.Object3D): MaterialKind {
  if (!(obj instanceof THREE.Mesh)) return 'default';

  const n = canonicalGltfName(obj.name);
  if (
    n === 'playfield'
    || /^table(\.\d+)?$/.test(n)
    || n === 'pinballmap'
  ) {
    return 'surface';
  }

  if (
    n === 'playfield_sides'
    || n === 'shoulder'
    || n === 'slingshot'
    || n === 'plastic'
    || n.startsWith('plastic_')
    || n.startsWith('separator_')
    || n === 'plunger_panel'
    || isPinballmapRailMesh(obj)
  ) {
    return 'wall';
  }

  if (n.startsWith('vis_') || /logo|sign|art|dec|text|letter/.test(n)) {
    return 'decor';
  }

  return 'default';
}

function materialTintTargets(kind: MaterialKind): {
  tint: number;
  darken: number;
  emissive: number;
  emissiveMul: number;
  emissiveAdd: number;
} {
  switch (kind) {
    case 'surface':
      return {
        tint: UPSIDE_DOWN_ATMOSPHERE_SURFACE_TINT,
        darken: 0.42,
        emissive: UPSIDE_DOWN_ATMOSPHERE_EMISSIVE,
        emissiveMul: 1.05,
        emissiveAdd: 0.04,
      };
    case 'wall':
      return {
        tint: UPSIDE_DOWN_ATMOSPHERE_WALL_TINT,
        darken: 0.34,
        emissive: UPSIDE_DOWN_ATMOSPHERE_EMISSIVE,
        emissiveMul: 1.15,
        emissiveAdd: 0.08,
      };
    case 'decor':
      return {
        tint: UPSIDE_DOWN_ATMOSPHERE_DECOR_TINT,
        darken: 0.22,
        emissive: UPSIDE_DOWN_ATMOSPHERE_DECOR_EMISSIVE,
        emissiveMul: 1.45,
        emissiveAdd: 0.18,
      };
    default:
      return {
        tint: UPSIDE_DOWN_ATMOSPHERE_TINT,
        darken: 0.38,
        emissive: UPSIDE_DOWN_ATMOSPHERE_EMISSIVE,
        emissiveMul: 1.25,
        emissiveAdd: 0.12,
      };
  }
}

export class UpsideDownAtmosphere {
  private materials: MaterialSnapshot[] = [];
  private lighting: SceneLighting | null = null;
  private garlandLights: GarlandLights | null = null;
  private bumperVisuals: BumperVisuals | null = null;
  private playfieldShade = new PlayfieldShadeOverlay();
  private sporeGroup: THREE.Group | null = null;
  private spores: SporeParticle[] = [];
  private sporeMat: THREE.MeshBasicMaterial | null = null;
  private sporeGeos: THREE.BufferGeometry[] = [];
  private mix = 0;
  private targetMix = 0;
  private visited = false;
  private pulseT = 0;
  private revealLift = 0;

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
  private savedFog: THREE.Fog | THREE.FogExp2 | null = null;
  private upsideDownFog: THREE.FogExp2 | null = null;

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
          kind: atmosphereMaterialKind(obj),
        });
      }
    });

    this.playfieldShade.mount(config.root, {
      color: UPSIDE_DOWN_ATMOSPHERE_SHADE_COLOR,
      renderOrder: 550,
    });

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

    this.savedFog = config.lighting.scene.fog;
    this.upsideDownFog = new THREE.FogExp2(UPSIDE_DOWN_ATMOSPHERE_FOG_COLOR, 0);

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

    const step = dt / UPSIDE_DOWN_ATMOSPHERE_BLEND;
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
    this.revealLift = 0;
  }

  setRevealLift(lift: number): void {
    this.revealLift = THREE.MathUtils.clamp(lift, 0, 1);
    if (this.mix > 0) {
      this.applyMix(this.mix);
    }
  }

  debugForceActive(): void {
    this.visited = true;
    this.targetMix = 1;
    this.mix = 1;
    this.applyMix(1);
    this.updateSpores(0, 1);
  }

  dispose(): void {
    this.applyMix(0);
    this.restoreFog();
    this.updateSpores(0, 0);

    this.playfieldShade.dispose();

    if (this.sporeGroup) this.sporeGroup.parent?.remove(this.sporeGroup);
    for (const geo of this.sporeGeos) geo.dispose();
    this.sporeMat?.dispose();

    this.materials = [];
    this.lighting = null;
    this.garlandLights = null;
    this.bumperVisuals = null;
    this.playfieldShade = new PlayfieldShadeOverlay();
    this.sporeGroup = null;
    this.spores = [];
    this.sporeMat = null;
    this.sporeGeos = [];
    this.savedFog = null;
    this.upsideDownFog = null;
    this.mix = 0;
    this.targetMix = 0;
    this.visited = false;
    this.pulseT = 0;
    this.revealLift = 0;
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

    for (let i = 0; i < UPSIDE_DOWN_ATMOSPHERE_SPORE_COUNT; i++) {
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
        angle: (i / UPSIDE_DOWN_ATMOSPHERE_SPORE_COUNT) * Math.PI * 2,
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
    const wave = 0.5 + Math.sin(this.pulseT * UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_SPEED) * 0.5;
    const minExp = THREE.MathUtils.lerp(
      UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_MIN,
      1.48,
      this.revealLift,
    );
    const maxExp = THREE.MathUtils.lerp(
      UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_MAX,
      1.64,
      this.revealLift,
    );
    this.lighting.renderer.toneMappingExposure = THREE.MathUtils.lerp(minExp, maxExp, wave);
  }

  private applyMix(t: number): void {
    const ease = t * t * (3 - 2 * t);
    const fullyActive = t >= 1 && this.targetMix >= 1;

    for (const entry of this.materials) {
      const targets = materialTintTargets(entry.kind);

      entry.material.color.copy(entry.color);
      _lerpColor.set(targets.tint);
      entry.material.color.lerp(_lerpColor, ease * 0.5);
      entry.material.color.multiplyScalar(1 - ease * targets.darken);

      entry.material.emissive.copy(entry.emissive);
      _lerpColor.set(targets.emissive);
      entry.material.emissive.lerp(_lerpColor, ease * 0.35);
      entry.material.emissiveIntensity = THREE.MathUtils.lerp(
        entry.emissiveIntensity,
        entry.emissiveIntensity * targets.emissiveMul + targets.emissiveAdd,
        ease,
      );
    }

    this.playfieldShade.setOpacity(
      UPSIDE_DOWN_ATMOSPHERE_SHADE_OPACITY * ease * (1 - this.revealLift * 0.92),
    );

    if (this.lighting) {
      const { scene, renderer, ambient, hemi, dir, fill } = this.lighting;

      if (scene.background instanceof THREE.Color) {
        scene.background.copy(this.origBg);
        _lerpColor.set(UPSIDE_DOWN_ATMOSPHERE_BG);
        (scene.background as THREE.Color).lerp(_lerpColor, ease);
      }

      if (!fullyActive) {
        renderer.toneMappingExposure = THREE.MathUtils.lerp(this.origExposure, UPSIDE_DOWN_ATMOSPHERE_EXPOSURE, ease);
      }

      ambient.color.copy(this.origAmbientColor);
      _lerpColor.set(0xccb8d8);
      ambient.color.lerp(_lerpColor, ease * 0.45);
      ambient.intensity = THREE.MathUtils.lerp(this.origAmbientIntensity, UPSIDE_DOWN_ATMOSPHERE_AMBIENT_INTENSITY, ease);

      hemi.color.copy(this.origHemiSky);
      _lerpColor.set(0x443366);
      hemi.color.lerp(_lerpColor, ease * 0.6);
      hemi.groundColor.copy(this.origHemiGround);
      _lerpColor.set(0x1a0a14);
      hemi.groundColor.lerp(_lerpColor, ease * 0.65);
      hemi.intensity = THREE.MathUtils.lerp(this.origHemiIntensity, UPSIDE_DOWN_ATMOSPHERE_HEMI_INTENSITY, ease);

      dir.color.copy(this.origDirColor);
      _lerpColor.set(0xd8c8e8);
      dir.color.lerp(_lerpColor, ease * 0.35);
      dir.intensity = THREE.MathUtils.lerp(this.origDirIntensity, UPSIDE_DOWN_ATMOSPHERE_DIR_INTENSITY, ease);

      fill.color.copy(this.origFillColor);
      _lerpColor.set(0x8866aa);
      fill.color.lerp(_lerpColor, ease * 0.4);
      fill.intensity = THREE.MathUtils.lerp(this.origFillIntensity, UPSIDE_DOWN_ATMOSPHERE_FILL_INTENSITY, ease);

      if (this.revealLift > 0 && fullyActive) {
        ambient.intensity += 0.34 * this.revealLift;
        dir.intensity += 0.3 * this.revealLift;
        fill.intensity += 0.24 * this.revealLift;
      }

      this.applyFog(ease);
    }

    const dim = THREE.MathUtils.lerp(1, 0.36, ease);
    const strobe = THREE.MathUtils.lerp(0, 0.48, ease);
    const strobeHz = fullyActive ? UPSIDE_DOWN_ATMOSPHERE_STROBE_HZ : UPSIDE_DOWN_ATMOSPHERE_BLEND_STROBE_HZ;
    const lift = this.revealLift;
    const effectiveDim = THREE.MathUtils.lerp(dim, Math.min(1, dim + 0.58), lift);
    const effectiveStrobe = strobe * (1 - lift * 0.88);

    this.garlandLights?.setAtmosphere(effectiveDim, effectiveStrobe, strobeHz);
    this.bumperVisuals?.setAtmosphere(effectiveDim, effectiveStrobe, strobeHz);
  }

  private applyFog(ease: number): void {
    if (!this.lighting || !this.upsideDownFog) return;

    const scene = this.lighting.scene;
    if (ease <= 0) {
      this.restoreFog();
      return;
    }

    this.upsideDownFog.density = UPSIDE_DOWN_ATMOSPHERE_FOG_DENSITY * ease * (1 - this.revealLift * 0.8);
    if (scene.fog !== this.upsideDownFog) scene.fog = this.upsideDownFog;
  }

  private restoreFog(): void {
    if (!this.lighting) return;
    this.lighting.scene.fog = this.savedFog;
  }
}
