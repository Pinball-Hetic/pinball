import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import { normalizeGltfName } from '@pinball/game-engine';

const GARLAND_NAME = /^guirlande-\d+$/;

const TWINKLE_SPEED = 2.5;
const TWINKLE_AMP = 0.28;
const HIT_SURGE_DURATION = 0.3;
const HIT_SURGE_BOOST = 0.55;

// Largeur (en nombre de bulbes) de la bande lumineuse du décollage rocket.
const ROCKET_BAND = 3;

// Position du front lumineux du décollage rocket, indexé sur les bulbes.
// rocketT décroît de 1 → 0 ; le front monte de -ROCKET_BAND (avant le premier
// bulbe) jusqu'à count (au-delà du dernier) → balayage complet montant. Pur.
export function rocketFront(rocketT: number, count: number): number {
  const progress = 1 - Math.max(0, Math.min(1, rocketT));
  return -ROCKET_BAND + progress * (count + ROCKET_BAND);
}

// Intensité [0,1] d'un bulbe donné pour un front rocket : 1 au front, décroît
// linéairement sur ROCKET_BAND en dessous, 0 ailleurs. Pur.
export function rocketGlow(index: number, front: number): number {
  const d = front - index;
  if (d < 0 || d > ROCKET_BAND) return 0;
  return 1 - d / ROCKET_BAND;
}

/**
 * Chaque guirlande dans le GLB newStrangerthings.glb possède :
 *  - baseColorTexture  : câble sombre + bulbes colorés
 *  - emissiveTexture   : carte de brillance des bulbes
 *  - emissiveFactor    : [1,1,1] (blanc = multiplicateur neutre)
 *
 * On ne remplace PLUS le matériau. On conserve le matériau GLB d'origine
 * et on anime uniquement emissiveIntensity pour le scintillement et les
 * réactions aux événements de jeu.
 */
type GarlandBulb = {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  origEmissive: THREE.Color;
  origIntensity: number;
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
  private feverActive = false;
  private celebrateT = 0;
  private rocketT = 0;

  // Chenillard continu pendant le fever (vague permanente).
  setFever(on: boolean): void {
    this.feverActive = on;
  }

  // 1s de chenillard ponctuel (palier franchi).
  celebrate(): void {
    this.celebrateT = 1;
  }

  // Décollage rocket (palier de score) : balayage montant orange/or, cohérent
  // avec la fusée du backglass/DMD. Remplace le chenillard jaune « celebrate »
  // sur les paliers pour l'unité rocket cross-écrans.
  rocketBurst(): void {
    this.rocketT = 1;
  }

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
    if (event.type === 'BUMPER_HIT' || event.type === 'BOSS_REVEAL') {
      this.hitSurge = HIT_SURGE_DURATION;
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.hitSurge > 0) this.hitSurge = Math.max(0, this.hitSurge - dt);

    const surge = this.hitSurge > 0
      ? (this.hitSurge / HIT_SURGE_DURATION) * HIT_SURGE_BOOST
      : 0;

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
      const twinkle = 0.75 + Math.sin(this.elapsed * TWINKLE_SPEED + bulb.phase) * TWINKLE_AMP;
      const emissive = (bulb.origIntensity * twinkle + surge * 0.4) * moodMul;
      bulb.material.emissiveIntensity = Math.max(0, emissive);

      if (upsideDown) {
        const flashRed = strobeFlash > 0.45 ? 0xff0022 : 0x660011;
        bulb.material.emissive.setHex(flashRed);
      } else {
        bulb.material.emissive.copy(bulb.origEmissive);
      }
    }

    // Vague (chenillard) — fever continu OU célébration ponctuelle.
    if (this.celebrateT > 0) this.celebrateT = Math.max(0, this.celebrateT - dt);
    if (this.feverActive || this.celebrateT > 0) {
      const speed = this.feverActive ? 6 : 9;
      for (let i = 0; i < this.bulbs.length; i++) {
        const bulb = this.bulbs[i];
        const w = Math.sin(this.elapsed * speed - i * 0.5) * 0.5 + 0.5;
        bulb.material.emissiveIntensity = Math.max(
          bulb.material.emissiveIntensity,
          bulb.origIntensity * (0.6 + w * 1.6),
        );
        if (this.feverActive) {
          bulb.material.emissive.setHex(i % 2 === 0 ? 0xff8800 : 0x00c8ff);
        }
      }
    }

    // Décollage rocket (palier) : bande lumineuse orange/or qui remonte les
    // guirlandes une fois, puis retombe. Cohérent avec la fusée backglass/DMD.
    if (this.rocketT > 0) {
      this.rocketT = Math.max(0, this.rocketT - dt);
      const front = rocketFront(this.rocketT, this.bulbs.length);
      for (let i = 0; i < this.bulbs.length; i++) {
        const bulb = this.bulbs[i];
        const glow = rocketGlow(i, front);
        if (glow <= 0) continue;
        bulb.material.emissiveIntensity = Math.max(
          bulb.material.emissiveIntensity,
          bulb.origIntensity * (0.6 + glow * 2.4),
        );
        bulb.material.emissive.setHex(glow > 0.6 ? 0xffe08a : 0xff7700);
      }
    }
  }

  dispose(): void {
    for (const bulb of this.bulbs) {
      bulb.material.emissive.copy(bulb.origEmissive);
      bulb.material.emissiveIntensity = bulb.origIntensity;
    }
    this.bulbs = [];
  }
}
