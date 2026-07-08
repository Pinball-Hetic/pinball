import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import {
  AtmosphereBlend,
  AtmosphereFog,
  LightingSnapshot,
  PlayfieldShadeOverlay,
  applyColorTint,
  applyLightTint,
  applyMaterialTint,
  collectAtmosphereMaterials,
} from '@pinball/game-engine';
import type { AtmosphereMaterialEntry, SceneLighting } from '@pinball/game-engine';

// Transition duration in seconds (in + out).
const BLEND_DURATION = 2.0;

const SACRED_BG              = 0x12002e;
const SACRED_MAT_TINT        = 0x200040;
const SACRED_MAT_EMISSIVE    = 0x1a0033;

const SACRED_AMBIENT_INTENSITY = 0.62;
const SACRED_HEMI_INTENSITY    = 0.52;
const SACRED_DIR_INTENSITY     = 0.82;
const SACRED_FILL_INTENSITY    = 0.54;

const SACRED_EXPOSURE = 1.18;

const SACRED_SHADE_COLOR   = 0x08001a;
const SACRED_SHADE_OPACITY = 0.18;

// FogExp2 density: 0.5 is light haze on a sub-1 m map.
const SACRED_FOG_COLOR   = 0x0c001a;
const SACRED_FOG_DENSITY = 0.5;

const SACRED_PULSE_SPEED   = 0.55;
const SACRED_PULSE_EXP_MIN = 1.12;
const SACRED_PULSE_EXP_MAX = 1.28;

type MaterialSnapshot = AtmosphereMaterialEntry;

export type SacredRealmSetupConfig = {
  root: THREE.Object3D;
  lighting: SceneLighting;
};

export class SacredRealmAtmosphere {
  private materials: MaterialSnapshot[] = [];
  private lighting: SceneLighting | null = null;
  private shade = new PlayfieldShadeOverlay();

  private blend = new AtmosphereBlend(BLEND_DURATION);

  private snapshot = new LightingSnapshot();
  private sacredFog: AtmosphereFog | null = null;

  setup(config: SacredRealmSetupConfig): void {
    this.dispose();
    this.lighting = config.lighting;

    this.materials = collectAtmosphereMaterials(config.root);

    this.shade.mount(config.root, {
      color: SACRED_SHADE_COLOR,
      renderOrder: 551,
    });

    this.snapshot.capture(config.lighting);
    this.sacredFog = new AtmosphereFog(SACRED_FOG_COLOR);
    this.sacredFog.save(config.lighting.scene);

    this.blend.reset();
  }

  onGameEvent(event: GameEvent): void {
    if (event.type === 'PORTAL_TRANSITION_END') {
      this.blend.visited = true;
      this.blend.targetMix = 1;
    }
    if (event.type === 'RETURN_PORTAL_TRANSITION_END') {
      this.blend.targetMix = 0;
    }
  }

  reset(): void {
    this.blend.targetMix = 0;
  }

  update(dt: number): void {
    if (this.blend.isIdle()) return;

    const tick = this.blend.step(dt);
    this.applyMix(tick.mix);
    this.blend.releaseVisitedIfAtRest();
  }

  dispose(): void {
    this.applyMix(0);
    this.restoreFog();
    this.shade.dispose();
    this.materials = [];
    this.lighting = null;
    this.shade = new PlayfieldShadeOverlay();
    this.sacredFog = null;
    this.blend.reset();
  }

  private applyMix(t: number): void {
    if (!this.blend.shouldApply(t)) return;

    const ease = AtmosphereBlend.ease(t);
    const fullyActive = t >= 1 && this.blend.targetMix >= 1;

    for (const entry of this.materials) {
      applyMaterialTint(entry, ease, {
        tint: SACRED_MAT_TINT,
        tintK: 0.35,
        darken: 0.18,
        emissive: SACRED_MAT_EMISSIVE,
        emissiveK: 0.30,
        emissiveMul: 1.12,
        emissiveAdd: 0.05,
      });
    }

    this.shade.setOpacity(SACRED_SHADE_OPACITY * ease);

    if (!this.lighting) return;
    const { scene, renderer, ambient, hemi, dir, fill } = this.lighting;

    if (scene.background instanceof THREE.Color) {
      applyColorTint(scene.background, this.snapshot.bg, SACRED_BG, ease, 1);
    }

    if (!fullyActive) {
      renderer.toneMappingExposure = THREE.MathUtils.lerp(this.snapshot.exposure, SACRED_EXPOSURE, ease);
    } else {
      const wave = 0.5 + Math.sin(this.blend.pulseT * SACRED_PULSE_SPEED) * 0.5;
      renderer.toneMappingExposure = THREE.MathUtils.lerp(SACRED_PULSE_EXP_MIN, SACRED_PULSE_EXP_MAX, wave);
    }

    applyLightTint(
      ambient,
      { color: this.snapshot.ambientColor, intensity: this.snapshot.ambientIntensity },
      ease,
      { color: 0xcc88ff, colorK: 0.5, intensity: SACRED_AMBIENT_INTENSITY },
    );

    applyLightTint(
      hemi,
      { color: this.snapshot.hemiSky, intensity: this.snapshot.hemiIntensity },
      ease,
      { color: 0x330055, colorK: 0.65, intensity: SACRED_HEMI_INTENSITY },
    );
    applyColorTint(hemi.groundColor, this.snapshot.hemiGround, 0x180022, ease, 0.70);

    applyLightTint(
      dir,
      { color: this.snapshot.dirColor, intensity: this.snapshot.dirIntensity },
      ease,
      { color: 0xccaaff, colorK: 0.38, intensity: SACRED_DIR_INTENSITY },
    );

    applyLightTint(
      fill,
      { color: this.snapshot.fillColor, intensity: this.snapshot.fillIntensity },
      ease,
      { color: 0x9933cc, colorK: 0.48, intensity: SACRED_FILL_INTENSITY },
    );

    this.applyFog(ease);
  }

  private applyFog(ease: number): void {
    if (!this.lighting || !this.sacredFog) return;
    this.sacredFog.apply(this.lighting.scene, ease, SACRED_FOG_DENSITY * ease);
  }

  private restoreFog(): void {
    if (!this.lighting || !this.sacredFog) return;
    this.sacredFog.restore(this.lighting.scene);
  }
}
