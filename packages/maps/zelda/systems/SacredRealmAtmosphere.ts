import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import { AtmosphereBlend, PlayfieldShadeOverlay } from '@pinball/game-engine';

// ── Constantes Sacred Realm ───────────────────────────────────────────────────
// Inspiré de UpsideDownAtmosphere (ST) — sans spores ni GarlandLights/BumperVisuals.

/** Durée de la transition (secondes, in + out). */
const BLEND_DURATION = 2.0;

// Background & tinte matériaux
const SACRED_BG              = 0x12002e;   // violet sombre mais visible
const SACRED_MAT_TINT        = 0x200040;   // teinte violette douce
const SACRED_MAT_EMISSIVE    = 0x1a0033;   // lueur émissive

// Intensités de lumière Sacred Realm — sombre mais lisible
const SACRED_AMBIENT_INTENSITY = 0.62;
const SACRED_HEMI_INTENSITY    = 0.52;
const SACRED_DIR_INTENSITY     = 0.82;
const SACRED_FILL_INTENSITY    = 0.54;

// Exposure target
const SACRED_EXPOSURE = 1.18;

// Shade overlay (voile violet léger)
const SACRED_SHADE_COLOR   = 0x08001a;
const SACRED_SHADE_OPACITY = 0.18;

// Brouillard — densité faible : FogExp2 @ 0.5 sur une map < 1 m = brume légère
const SACRED_FOG_COLOR   = 0x0c001a;
const SACRED_FOG_DENSITY = 0.5;

// Pulse (exposition lente quand pleinement actif)
const SACRED_PULSE_SPEED   = 0.55;
const SACRED_PULSE_EXP_MIN = 1.12;
const SACRED_PULSE_EXP_MAX = 1.28;

// ── Types internes ────────────────────────────────────────────────────────────

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

export type SacredRealmSetupConfig = {
  root: THREE.Object3D;
  lighting: SceneLighting;
};

const _c = new THREE.Color();

// ── Classe principale ─────────────────────────────────────────────────────────

/**
 * Ambiance Sacred Realm (Zelda).
 *
 * - Déclenché par `PORTAL_TRANSITION_END` → transition vers atmosphère sombre violette.
 * - Réinitialisé par `RETURN_PORTAL_TRANSITION_END` → retour à l'éclairage normal.
 *
 * Pattern identique à `UpsideDownAtmosphere` (ST) : setup/onGameEvent/update/reset/dispose.
 */
export class SacredRealmAtmosphere {
  private materials: MaterialSnapshot[] = [];
  private lighting: SceneLighting | null = null;
  private shade = new PlayfieldShadeOverlay();

  private blend = new AtmosphereBlend(BLEND_DURATION);

  // Valeurs d'origine sauvegardées au setup
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
  private sacredFog: THREE.FogExp2 | null = null;

  setup(config: SacredRealmSetupConfig): void {
    this.dispose();
    this.lighting = config.lighting;
    this.materials = [];

    // Snapshot de tous les matériaux MeshStandard dans l'arbre du root.
    config.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        if (this.materials.some((e) => e.material === mat)) continue;
        this.materials.push({
          material: mat,
          color: mat.color.clone(),
          emissive: mat.emissive.clone(),
          emissiveIntensity: mat.emissiveIntensity,
        });
      }
    });

    // Voile sombre violet.
    this.shade.mount(config.root, {
      color: SACRED_SHADE_COLOR,
      renderOrder: 551,
    });

    // Sauvegarde de l'état d'éclairage d'origine.
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
    this.sacredFog = new THREE.FogExp2(SACRED_FOG_COLOR, 0);

    this.blend.reset();
  }

  onGameEvent(event: GameEvent): void {
    // Entrée dans le Sacred Realm.
    if (event.type === 'PORTAL_TRANSITION_END') {
      this.blend.visited = true;
      this.blend.targetMix = 1;
    }
    // Retour du Sacred Realm.
    if (event.type === 'RETURN_PORTAL_TRANSITION_END') {
      this.blend.targetMix = 0;
    }
  }

  /** Réinitialise l'atmosphère (retour à la normale) sans dispose. */
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
    this.savedFog = null;
    this.blend.reset();
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private applyMix(t: number): void {
    if (!this.blend.shouldApply(t)) return;

    // Smoothstep.
    const ease = AtmosphereBlend.ease(t);
    const fullyActive = t >= 1 && this.blend.targetMix >= 1;

    // ── Matériaux : teinte violet sombre + assombrissement ──────────────────
    for (const entry of this.materials) {
      entry.material.color.copy(entry.color);
      _c.set(SACRED_MAT_TINT);
      entry.material.color.lerp(_c, ease * 0.35);
      entry.material.color.multiplyScalar(1 - ease * 0.18);

      entry.material.emissive.copy(entry.emissive);
      _c.set(SACRED_MAT_EMISSIVE);
      entry.material.emissive.lerp(_c, ease * 0.30);
      entry.material.emissiveIntensity = THREE.MathUtils.lerp(
        entry.emissiveIntensity,
        entry.emissiveIntensity * 1.12 + 0.05,
        ease,
      );
    }

    // ── Voile violet ────────────────────────────────────────────────────────
    this.shade.setOpacity(SACRED_SHADE_OPACITY * ease);

    // ── Éclairage ───────────────────────────────────────────────────────────
    if (!this.lighting) return;
    const { scene, renderer, ambient, hemi, dir, fill } = this.lighting;

    // Background.
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(this.origBg);
      _c.set(SACRED_BG);
      (scene.background as THREE.Color).lerp(_c, ease);
    }

    // Exposure : transition, puis pulse lent quand pleinement actif.
    if (!fullyActive) {
      renderer.toneMappingExposure = THREE.MathUtils.lerp(this.origExposure, SACRED_EXPOSURE, ease);
    } else {
      const wave = 0.5 + Math.sin(this.blend.pulseT * SACRED_PULSE_SPEED) * 0.5;
      renderer.toneMappingExposure = THREE.MathUtils.lerp(SACRED_PULSE_EXP_MIN, SACRED_PULSE_EXP_MAX, wave);
    }

    // Ambient : violacé, très réduit.
    ambient.color.copy(this.origAmbientColor);
    _c.set(0xcc88ff);
    ambient.color.lerp(_c, ease * 0.5);
    ambient.intensity = THREE.MathUtils.lerp(this.origAmbientIntensity, SACRED_AMBIENT_INTENSITY, ease);

    // Hemi : violet sombre.
    hemi.color.copy(this.origHemiSky);
    _c.set(0x330055);
    hemi.color.lerp(_c, ease * 0.65);
    hemi.groundColor.copy(this.origHemiGround);
    _c.set(0x180022);
    hemi.groundColor.lerp(_c, ease * 0.70);
    hemi.intensity = THREE.MathUtils.lerp(this.origHemiIntensity, SACRED_HEMI_INTENSITY, ease);

    // Directional : lavande pâle, affaibli.
    dir.color.copy(this.origDirColor);
    _c.set(0xccaaff);
    dir.color.lerp(_c, ease * 0.38);
    dir.intensity = THREE.MathUtils.lerp(this.origDirIntensity, SACRED_DIR_INTENSITY, ease);

    // Fill : violet chaud, réduit.
    fill.color.copy(this.origFillColor);
    _c.set(0x9933cc);
    fill.color.lerp(_c, ease * 0.48);
    fill.intensity = THREE.MathUtils.lerp(this.origFillIntensity, SACRED_FILL_INTENSITY, ease);

    // Fog.
    this.applyFog(ease);
  }

  private applyFog(ease: number): void {
    if (!this.lighting || !this.sacredFog) return;
    const scene = this.lighting.scene;
    if (ease <= 0) {
      this.restoreFog();
      return;
    }
    this.sacredFog.density = SACRED_FOG_DENSITY * ease;
    if (scene.fog !== this.sacredFog) scene.fog = this.sacredFog;
  }

  private restoreFog(): void {
    if (!this.lighting) return;
    this.lighting.scene.fog = this.savedFog;
  }
}
