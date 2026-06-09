import * as THREE from 'three';
import type { GameEvent } from '../domain/GameEvents';
import { normalizeGltfName } from './GltfNodeNames';

const GARLAND_NAME = /^guirlande-\d+$/;

const TWINKLE_SPEED = 2.5;
const TWINKLE_AMP = 0.28;
const HIT_SURGE_DURATION = 0.3;
const HIT_SURGE_BOOST = 0.55;

type GarlandBulb = {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  /** Emissive original (couleur texture GLB, généralement blanc [1,1,1]) */
  origEmissive: THREE.Color;
  /** emissiveIntensity original du GLB */
  origIntensity: number;
  /** Phase de décalage pour le scintillement */
  phase: number;
};

export class GarlandLights {
  private bulbs: GarlandBulb[] = [];
  private hitSurge = 0;
  private elapsed = 0;
  private atmosphereDim = 1;
  private atmosphereStrobe = 0;
  private atmosphereStrobeHz = 4;
  private strobeActive = false;
  private strobeOn = false;
  private strobeNormalWhenOn = false;

  setAtmosphere(dim: number, strobe: number, strobeHz = 4): void {
    this.atmosphereDim = dim;
    this.atmosphereStrobe = strobe;
    this.atmosphereStrobeHz = strobeHz;
  }

  setStrobe(active: boolean, on: boolean, normalWhenOn = false): void {
    this.strobeActive = active;
    this.strobeOn = on;
    this.strobeNormalWhenOn = normalWhenOn;
  }

  /**
   * Repère les meshes guirlande dans le GLB et conserve leurs matériaux
   * d'origine (textures câble + bulbes colorés). On ne fait qu'animer
   * emissiveIntensity — les couleurs viennent de l'emissiveTexture du GLB.
   */
  setup(root: THREE.Object3D): void {
    this.dispose();
    this.elapsed = 0;
    this.hitSurge = 0;

    root.traverse((obj) => {
      const n = normalizeGltfName(obj.name);
      if (!GARLAND_NAME.test(n)) return;
      if (!(obj instanceof THREE.Mesh)) return;

      const mat = Array.isArray(obj.material) ? null : obj.material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;

      this.bulbs.push({
        mesh: obj,
        material: mat,
        origEmissive: mat.emissive.clone(),
        origIntensity: mat.emissiveIntensity,
        phase: this.bulbs.length * 0.7,
      });
    });
  }

  onGameEvent(event: GameEvent): void {
    if (event.type === 'BUMPER_HIT' || event.type === 'DEMOGORGON_REVEAL') {
      this.hitSurge = HIT_SURGE_DURATION;
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.hitSurge > 0) this.hitSurge = Math.max(0, this.hitSurge - dt);

    const surge = this.hitSurge > 0
      ? (this.hitSurge / HIT_SURGE_DURATION) * HIT_SURGE_BOOST
      : 0;

    // Mode strobe (DemogorgonReveal)
    if (this.strobeActive) {
      if (!this.strobeOn) {
        for (const bulb of this.bulbs) {
          bulb.material.emissiveIntensity = 0;
        }
        return;
      }
      if (!this.strobeNormalWhenOn) {
        for (const bulb of this.bulbs) {
          bulb.material.emissiveIntensity = bulb.origIntensity * 3.5;
          bulb.material.emissive.setHex(0xff1133);
        }
        return;
      }
    }

    const strobeFlash = this.atmosphereStrobe > 0
      ? (Math.sin(this.elapsed * this.atmosphereStrobeHz * Math.PI * 2) * 0.5 + 0.5) * this.atmosphereStrobe
      : 0;
    const moodMul = this.atmosphereDim + strobeFlash * (1 - this.atmosphereDim);
    const upsideDown = this.atmosphereStrobe > 0.2;

    for (const bulb of this.bulbs) {
      // Scintillement doux autour de l'intensité d'origine
      const twinkle = 0.75 + Math.sin(this.elapsed * TWINKLE_SPEED + bulb.phase) * TWINKLE_AMP;
      const emissive = (bulb.origIntensity * twinkle + surge * 0.4) * moodMul;
      bulb.material.emissiveIntensity = Math.max(0, emissive);

      // Teinte emissive : rouge en mode UpsideDown, original sinon
      if (upsideDown) {
        const flashRed = strobeFlash > 0.45 ? 0xff0022 : 0x660011;
        bulb.material.emissive.setHex(flashRed);
      } else {
        bulb.material.emissive.copy(bulb.origEmissive);
      }
    }
  }

  /** Restaure l'état d'origine des matériaux GLB. */
  dispose(): void {
    for (const bulb of this.bulbs) {
      bulb.material.emissive.copy(bulb.origEmissive);
      bulb.material.emissiveIntensity = bulb.origIntensity;
    }
    this.bulbs = [];
  }
}
