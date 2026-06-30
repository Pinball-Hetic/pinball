import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
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
} from './UpsideDownConstants';
import type { BumperVisuals } from './BumperVisuals';
import type { GarlandLights } from './GarlandLights';
import {
  AtmosphereBlend,
  PlayfieldShadeOverlay,
  applyColorTint,
  applyLightTint,
  applyMaterialTint,
  seedSpores,
  stepSporeField,
} from '@pinball/game-engine';
import type { SporeParticle } from '@pinball/game-engine';
import { canonicalGltfName, isFlipperGltfMesh, isPinballmapRailMesh, normalizeGltfName } from '@pinball/game-engine';

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

function sporeTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 16);
  return new THREE.CanvasTexture(c);
}

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
  private sporePoints: THREE.Points | null = null;
  private sporeGeo: THREE.BufferGeometry | null = null;
  private sporePositions: Float32Array | null = null;
  private spores: SporeParticle[] = [];
  private sporeMat: THREE.PointsMaterial | null = null;
  private sporeTex: THREE.CanvasTexture | null = null;
  private sporesEnabled = true;
  private blend = new AtmosphereBlend(UPSIDE_DOWN_ATMOSPHERE_BLEND);
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

    this.blend.reset();
  }

  onGameEvent(event: GameEvent): void {
    if (event.type !== 'PORTAL_TRANSITION_END') return;
    this.blend.visited = true;
    this.blend.targetMix = 1;
  }

  update(dt: number): void {
    if (this.blend.isIdle()) return;

    const tick = this.blend.step(dt);

    this.applyMix(tick.mix);

    if (tick.fullyActivePre) {
      this.applyLivePulse();
    }

    this.updateSpores(dt, tick.sporeIntensity);

    this.blend.releaseVisitedIfAtRest();
  }

  reset(): void {
    this.blend.targetMix = 0;
    this.revealLift = 0;
  }

  setRevealLift(lift: number): void {
    this.revealLift = THREE.MathUtils.clamp(lift, 0, 1);
    if (this.blend.mix > 0) {
      this.applyMix(this.blend.mix);
    }
  }

  debugForceActive(): void {
    this.blend.visited = true;
    this.blend.targetMix = 1;
    this.blend.mix = 1;
    this.applyMix(1);
    this.updateSpores(0, 1);
  }

  dispose(): void {
    this.applyMix(0);
    this.restoreFog();
    this.updateSpores(0, 0);

    this.playfieldShade.dispose();

    if (this.sporePoints) this.sporePoints.parent?.remove(this.sporePoints);
    this.sporeGeo?.dispose();
    this.sporeMat?.dispose();
    this.sporeTex?.dispose();

    this.materials = [];
    this.lighting = null;
    this.garlandLights = null;
    this.bumperVisuals = null;
    this.playfieldShade = new PlayfieldShadeOverlay();
    this.sporePoints = null;
    this.sporeGeo = null;
    this.sporePositions = null;
    this.spores = [];
    this.sporeMat = null;
    this.sporeTex = null;
    this.savedFog = null;
    this.upsideDownFog = null;
    this.blend.reset();
    this.revealLift = 0;
  }

  setSporesEnabled(enabled: boolean): void {
    this.sporesEnabled = enabled;
  }

  // Toutes les spores en UN THREE.Points (1 draw call) — l'animation met à
  // jour l'attribut position.
  private buildSpores(root: THREE.Object3D): void {
    const n = UPSIDE_DOWN_ATMOSPHERE_SPORE_COUNT;
    this.sporePositions = new Float32Array(n * 3);
    this.sporeGeo = new THREE.BufferGeometry();
    this.sporeGeo.setAttribute('position', new THREE.BufferAttribute(this.sporePositions, 3));
    this.sporeTex = sporeTexture();
    this.sporeMat = new THREE.PointsMaterial({
      color: 0xff6688,
      map: this.sporeTex,
      size: 0.018,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.sporePoints = new THREE.Points(this.sporeGeo, this.sporeMat);
    this.sporePoints.frustumCulled = false;
    this.sporePoints.visible = false;
    this.sporePoints.renderOrder = 520;

    this.spores = seedSpores(n);

    root.add(this.sporePoints);
  }

  private updateSpores(dt: number, intensity: number): void {
    if (!this.sporeMat || !this.sporePoints || !this.sporePositions || !this.sporeGeo) return;

    const active = intensity > 0.01 && this.sporesEnabled;
    this.sporePoints.visible = active;
    this.sporeMat.opacity = 0.72 * intensity;
    if (!active) return;

    stepSporeField(this.spores, dt, this.blend.pulseT, this.sporePositions);
    this.sporeGeo.attributes.position.needsUpdate = true;
  }

  private applyLivePulse(): void {
    if (!this.lighting) return;
    const wave = 0.5 + Math.sin(this.blend.pulseT * UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_SPEED) * 0.5;
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
    // Early return : ne retoucher les matériaux/lumières que si mix a bougé.
    if (!this.blend.shouldApply(t)) return;

    const ease = AtmosphereBlend.ease(t);
    const fullyActive = t >= 1 && this.blend.targetMix >= 1;

    for (const entry of this.materials) {
      const targets = materialTintTargets(entry.kind);

      applyMaterialTint(entry, ease, {
        tint: targets.tint,
        tintK: 0.5,
        darken: targets.darken,
        emissive: targets.emissive,
        emissiveK: 0.35,
        emissiveMul: targets.emissiveMul,
        emissiveAdd: targets.emissiveAdd,
      });
    }

    this.playfieldShade.setOpacity(
      UPSIDE_DOWN_ATMOSPHERE_SHADE_OPACITY * ease * (1 - this.revealLift * 0.92),
    );

    if (this.lighting) {
      const { scene, renderer, ambient, hemi, dir, fill } = this.lighting;

      if (scene.background instanceof THREE.Color) {
        applyColorTint(scene.background, this.origBg, UPSIDE_DOWN_ATMOSPHERE_BG, ease, 1);
      }

      if (!fullyActive) {
        renderer.toneMappingExposure = THREE.MathUtils.lerp(this.origExposure, UPSIDE_DOWN_ATMOSPHERE_EXPOSURE, ease);
      }

      applyLightTint(
        ambient,
        { color: this.origAmbientColor, intensity: this.origAmbientIntensity },
        ease,
        { color: 0xccb8d8, colorK: 0.45, intensity: UPSIDE_DOWN_ATMOSPHERE_AMBIENT_INTENSITY },
      );

      applyLightTint(
        hemi,
        { color: this.origHemiSky, intensity: this.origHemiIntensity },
        ease,
        { color: 0x443366, colorK: 0.6, intensity: UPSIDE_DOWN_ATMOSPHERE_HEMI_INTENSITY },
      );
      applyColorTint(hemi.groundColor, this.origHemiGround, 0x1a0a14, ease, 0.65);

      applyLightTint(
        dir,
        { color: this.origDirColor, intensity: this.origDirIntensity },
        ease,
        { color: 0xd8c8e8, colorK: 0.35, intensity: UPSIDE_DOWN_ATMOSPHERE_DIR_INTENSITY },
      );

      applyLightTint(
        fill,
        { color: this.origFillColor, intensity: this.origFillIntensity },
        ease,
        { color: 0x8866aa, colorK: 0.4, intensity: UPSIDE_DOWN_ATMOSPHERE_FILL_INTENSITY },
      );

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
