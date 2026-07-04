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

// ── Sacred Realm constants ────────────────────────────────────────────────────
// Inspired by UpsideDownAtmosphere (ST) — no spores, no GarlandLights/BumperVisuals.

/** Transition duration (seconds, in + out). */
const BLEND_DURATION = 2.0;

// Background & material tint
const SACRED_BG              = 0x12002e;   // dark but visible violet
const SACRED_MAT_TINT        = 0x200040;   // soft violet tint
const SACRED_MAT_EMISSIVE    = 0x1a0033;   // emissive glow

// Sacred Realm light intensities — dark but readable
const SACRED_AMBIENT_INTENSITY = 0.62;
const SACRED_HEMI_INTENSITY    = 0.52;
const SACRED_DIR_INTENSITY     = 0.82;
const SACRED_FILL_INTENSITY    = 0.54;

// Exposure target
const SACRED_EXPOSURE = 1.18;

// Shade overlay (light violet veil)
const SACRED_SHADE_COLOR   = 0x08001a;
const SACRED_SHADE_OPACITY = 0.18;

// Fog — low density: FogExp2 @ 0.5 on a sub-1 m map = light haze
const SACRED_FOG_COLOR   = 0x0c001a;
const SACRED_FOG_DENSITY = 0.5;

// Pulse (slow exposure sway when fully active)
const SACRED_PULSE_SPEED   = 0.55;
const SACRED_PULSE_EXP_MIN = 1.12;
const SACRED_PULSE_EXP_MAX = 1.28;

// ── Internal types ────────────────────────────────────────────────────────────

type MaterialSnapshot = AtmosphereMaterialEntry;

export type SacredRealmSetupConfig = {
  root: THREE.Object3D;
  lighting: SceneLighting;
};

// ── Main class ────────────────────────────────────────────────────────────────

/**
 * Sacred Realm atmosphere (Zelda).
 *
 * - Triggered by `PORTAL_TRANSITION_END` → transition to dark violet atmosphere.
 * - Reset by `RETURN_PORTAL_TRANSITION_END` → back to normal lighting.
 *
 * Same pattern as `UpsideDownAtmosphere` (ST): setup/onGameEvent/update/reset/dispose.
 */
export class SacredRealmAtmosphere {
  private materials: MaterialSnapshot[] = [];
  private lighting: SceneLighting | null = null;
  private shade = new PlayfieldShadeOverlay();

  private blend = new AtmosphereBlend(BLEND_DURATION);

  // Original values captured at setup
  private snapshot = new LightingSnapshot();
  private sacredFog: AtmosphereFog | null = null;

  setup(config: SacredRealmSetupConfig): void {
    this.dispose();
    this.lighting = config.lighting;

    // Snapshot every MeshStandard material in the root tree.
    this.materials = collectAtmosphereMaterials(config.root);

    // Dark violet veil.
    this.shade.mount(config.root, {
      color: SACRED_SHADE_COLOR,
      renderOrder: 551,
    });

    // Save the original lighting state.
    this.snapshot.capture(config.lighting);
    this.sacredFog = new AtmosphereFog(SACRED_FOG_COLOR);
    this.sacredFog.save(config.lighting.scene);

    this.blend.reset();
  }

  onGameEvent(event: GameEvent): void {
    // Sacred Realm entry.
    if (event.type === 'PORTAL_TRANSITION_END') {
      this.blend.visited = true;
      this.blend.targetMix = 1;
    }
    // Return from the Sacred Realm.
    if (event.type === 'RETURN_PORTAL_TRANSITION_END') {
      this.blend.targetMix = 0;
    }
  }

  /** Resets the atmosphere (back to normal) without dispose. */
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

  // ── Internals ───────────────────────────────────────────────────────────────

  private applyMix(t: number): void {
    if (!this.blend.shouldApply(t)) return;

    const ease = AtmosphereBlend.ease(t);
    const fullyActive = t >= 1 && this.blend.targetMix >= 1;

    // ── Materials: dark violet tint + darkening ──────────────────────────────
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

    // ── Violet veil ─────────────────────────────────────────────────────────
    this.shade.setOpacity(SACRED_SHADE_OPACITY * ease);

    // ── Lighting ────────────────────────────────────────────────────────────
    if (!this.lighting) return;
    const { scene, renderer, ambient, hemi, dir, fill } = this.lighting;

    if (scene.background instanceof THREE.Color) {
      applyColorTint(scene.background, this.snapshot.bg, SACRED_BG, ease, 1);
    }

    // Exposure: transition, then slow pulse when fully active.
    if (!fullyActive) {
      renderer.toneMappingExposure = THREE.MathUtils.lerp(this.snapshot.exposure, SACRED_EXPOSURE, ease);
    } else {
      const wave = 0.5 + Math.sin(this.blend.pulseT * SACRED_PULSE_SPEED) * 0.5;
      renderer.toneMappingExposure = THREE.MathUtils.lerp(SACRED_PULSE_EXP_MIN, SACRED_PULSE_EXP_MAX, wave);
    }

    // Ambient: violet-ish, heavily reduced.
    applyLightTint(
      ambient,
      { color: this.snapshot.ambientColor, intensity: this.snapshot.ambientIntensity },
      ease,
      { color: 0xcc88ff, colorK: 0.5, intensity: SACRED_AMBIENT_INTENSITY },
    );

    // Hemi: dark violet.
    applyLightTint(
      hemi,
      { color: this.snapshot.hemiSky, intensity: this.snapshot.hemiIntensity },
      ease,
      { color: 0x330055, colorK: 0.65, intensity: SACRED_HEMI_INTENSITY },
    );
    applyColorTint(hemi.groundColor, this.snapshot.hemiGround, 0x180022, ease, 0.70);

    // Directional: pale lavender, weakened.
    applyLightTint(
      dir,
      { color: this.snapshot.dirColor, intensity: this.snapshot.dirIntensity },
      ease,
      { color: 0xccaaff, colorK: 0.38, intensity: SACRED_DIR_INTENSITY },
    );

    // Fill: warm violet, reduced.
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
