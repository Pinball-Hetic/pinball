import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import { normalizeGltfName, nearestBumperIndex, bumperPunchScale } from '@pinball/game-engine';
import { layout } from '../layout';
import { GlowSprite } from '@pinball/game-engine';

const LEGACY_BUMPER = /^bumper-st-\d+$/;
const GLTF_BUMPER = /^bumper[-_]\d+$/;
const LEGACY_BASE = /bumper-strangerthings/;
const LEGACY_RING = /^bumper_ring/;

const BUMPER_METALNESS = 0.42;
const BUMPER_ROUGHNESS = 0.36;
const BUMPER_SURFACE = 0xffffff;
const BUMPER_EMISSIVE = 0xff1122;
const BUMPER_EMISSIVE_INTENSITY = 3.4;
const BUMPER_LIGHT_COLOR = 0xff5566;
const BUMPER_LIGHT_INTENSITY = 0.95;

const RING_SURFACE = 0xc82838;
const RING_EMISSIVE = 0x881018;
const RING_METALNESS = 0.78;
const RING_ROUGHNESS = 0.3;

const IDLE_PULSE_SPEED = 1.35;
const IDLE_PULSE_AMP = 0.18;
const HIT_FLASH_DURATION = 0.2;
const HIT_FLASH_BOOST = 1.1;
const PUNCH_DURATION = 0.15; // durée du pop en secondes
const PUNCH_PEAK = 0.20; // ampleur : 0.20 = grossit à 1.20×

const _emissiveA = new THREE.Color();
const _emissiveB = new THREE.Color();

type BumperKind = 'gltf' | 'base' | 'ring';

const GLOW_SIZE = 0.11;

type BumperPart = {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  bumperIndex: number;
  kind: BumperKind;
  glow: GlowSprite | null; // remplace l'ancienne PointLight (coût shader nul)
  glowColor: number;
  baseIntensity: number;
  baseScale: THREE.Vector3;
};

function cloneStandardMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
  const src = mesh.material;
  const mat = (Array.isArray(src) ? src[0] : src) as THREE.Material;
  if (mat instanceof THREE.MeshStandardMaterial) return mat.clone();
  return new THREE.MeshStandardMaterial({ color: 0xffffff });
}

function applyGltfBumperLook(material: THREE.MeshStandardMaterial): void {
  material.color.setHex(BUMPER_SURFACE);
  material.emissive.setHex(BUMPER_EMISSIVE);
  material.emissiveIntensity = BUMPER_EMISSIVE_INTENSITY;
  material.metalness = BUMPER_METALNESS;
  material.roughness = BUMPER_ROUGHNESS;
  material.toneMapped = false;
}

export class BumperVisuals {
  private parts: BumperPart[] = [];
  private hitTimers = new Map<number, number>();
  private punchTimers = new Map<number, number>();
  private elapsed = 0;
  private strobeActive = false;
  private strobeOn = false;
  private strobeNormalWhenOn = false;
  private atmosphereDim = 1;
  private atmosphereStrobe = 0;
  private atmosphereStrobeHz = 4;

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

    const wp = new THREE.Vector3();

    root.traverse((obj) => {
      const n = normalizeGltfName(obj.name);

      if (LEGACY_BUMPER.test(n)) {
        obj.visible = false;
        obj.traverse((child) => {
          child.visible = false;
        });
        return;
      }

      if (!(obj instanceof THREE.Mesh)) return;

      let kind: BumperKind | null = null;
      if (GLTF_BUMPER.test(n)) kind = 'gltf';
      else if (LEGACY_BASE.test(n)) kind = 'base';
      else if (LEGACY_RING.test(n)) kind = 'ring';
      else return;

      obj.getWorldPosition(wp);
      const bumperIndex = nearestBumperIndex(wp, layout.bumpers);
      const material = cloneStandardMaterial(obj);
      let glow: GlowSprite | null = null;
      let glowColor = BUMPER_LIGHT_COLOR;

      if (kind === 'gltf') {
        applyGltfBumperLook(material);
        glowColor = BUMPER_LIGHT_COLOR;
        glow = new GlowSprite(glowColor, GLOW_SIZE);
        glow.sprite.position.y = 0.01;
        obj.add(glow.sprite);
      } else if (kind === 'base') {
        material.color.setHex(0xffccd5);
        material.emissive.setHex(0xff2244);
        material.emissiveIntensity = 2.2;
        material.metalness = 0.08;
        material.roughness = 0.42;
        material.toneMapped = false;

        glowColor = 0xff5577;
        glow = new GlowSprite(glowColor, GLOW_SIZE * 0.85);
        glow.sprite.position.y = 0.008;
        obj.add(glow.sprite);
      } else {
        material.color.setHex(RING_SURFACE);
        material.emissive.setHex(RING_EMISSIVE);
        material.emissiveIntensity = 0.55;
        material.roughness = RING_ROUGHNESS;
        material.metalness = RING_METALNESS;
        material.toneMapped = true;
      }

      obj.material = material;

      this.parts.push({
        mesh: obj,
        material,
        bumperIndex,
        kind,
        glow,
        glowColor,
        baseIntensity: material.emissiveIntensity,
        baseScale: obj.scale.clone(),
      });
    });

    // Échoue bruyamment : si aucun mesh n'a matché (ex. convention de nommage
    // GLB changée), tous les effets bumper sont silencieusement morts. On le
    // signale plutôt que de laisser croire que l'animation est branchée.
    if (this.parts.length === 0) {
      console.warn(
        '[BumperVisuals] aucun mesh bumper reconnu (GLTF_BUMPER/LEGACY_*) — ' +
          'vérifier les noms de meshes du GLB.',
      );
    }
  }

  onGameEvent(event: GameEvent): void {
    if (event.type !== 'BUMPER_HIT') return;
    this.hitTimers.set(event.bumperIndex, HIT_FLASH_DURATION);
    this.punchTimers.set(event.bumperIndex, PUNCH_DURATION);
  }

  update(dt: number): void {
    this.elapsed += dt;

    for (const [idx, t] of this.hitTimers) {
      const next = t - dt;
      if (next <= 0) this.hitTimers.delete(idx);
      else this.hitTimers.set(idx, next);
    }

    // Scale punch (mesh visuel uniquement, colliders inchangés).
    for (const [idx, t] of this.punchTimers) {
      const next = t - dt;
      if (next <= 0) this.punchTimers.delete(idx);
      else this.punchTimers.set(idx, next);
    }
    for (const part of this.parts) {
      const pt = this.punchTimers.get(part.bumperIndex) ?? 0;
      const factor = bumperPunchScale(pt, PUNCH_DURATION, PUNCH_PEAK);
      part.mesh.scale.copy(part.baseScale).multiplyScalar(factor);
    }

    if (this.strobeActive) {
      if (!this.strobeOn) {
        for (const part of this.parts) {
          part.material.emissiveIntensity = 0;
          part.glow?.set(0);
        }
        return;
      }
      if (!this.strobeNormalWhenOn) {
        for (const part of this.parts) {
          part.material.emissive.setHex(0xff1133);
          part.material.emissiveIntensity = 2.6;
          part.glow?.set(0.9, 1.1);
        }
        return;
      }
    }

    const strobeFlash = this.atmosphereStrobe > 0
      ? (Math.sin(this.elapsed * this.atmosphereStrobeHz * Math.PI * 2) * 0.5 + 0.5) * this.atmosphereStrobe
      : 0;
    const moodMul = this.atmosphereDim + strobeFlash * (1 - this.atmosphereDim);
    const upsideDown = this.atmosphereStrobe > 0.2;

    for (const part of this.parts) {
      const hitT = this.hitTimers.get(part.bumperIndex) ?? 0;
      const hitFactor = hitT > 0 ? (hitT / HIT_FLASH_DURATION) * HIT_FLASH_BOOST : 0;
      const slowBreath =
        0.82 + Math.sin(this.elapsed * IDLE_PULSE_SPEED + part.bumperIndex * 1.4) * IDLE_PULSE_AMP;

      if (part.kind === 'gltf') {
        part.material.emissive.setHex(upsideDown && strobeFlash > 0.45 ? 0xff1133 : BUMPER_EMISSIVE);
        part.material.emissiveIntensity = (part.baseIntensity * slowBreath + hitFactor) * moodMul;

        if (part.glow) {
          part.glow.setColor(upsideDown && strobeFlash > 0.45 ? 0xff2244 : BUMPER_LIGHT_COLOR);
          // opacité ∝ ancienne intensité lumière (normalisée), pulse en scale.
          const v = (BUMPER_LIGHT_INTENSITY * slowBreath + hitFactor * 0.35) * moodMul;
          part.glow.set(Math.min(1, v * 0.55), 0.9 + hitFactor * 0.5);
        }
      } else if (part.kind === 'base') {
        part.material.emissive.setHex(upsideDown && strobeFlash > 0.45 ? 0xff1133 : 0xff2244);
        part.material.emissiveIntensity = (part.baseIntensity * slowBreath + hitFactor) * moodMul;

        if (part.glow) {
          part.glow.setColor(upsideDown && strobeFlash > 0.45 ? 0xff2244 : 0xff5577);
          const v = (0.55 * slowBreath + hitFactor * 0.25) * moodMul;
          part.glow.set(Math.min(1, v * 0.7), 0.9 + hitFactor * 0.5);
        }
      } else {
        part.material.emissive.setHex(upsideDown && strobeFlash > 0.45 ? 0xff1133 : RING_EMISSIVE);
        if (hitFactor > 0) {
          _emissiveA.setHex(RING_EMISSIVE);
          _emissiveB.setHex(0xff3355);
          part.material.emissive.copy(_emissiveA).lerp(_emissiveB, Math.min(0.35, hitFactor * 0.2));
        }
        part.material.emissiveIntensity = (0.55 + slowBreath * 0.2 + hitFactor * 0.25) * moodMul;
      }
    }
  }

  dispose(): void {
    for (const part of this.parts) {
      part.glow?.dispose();
    }
    this.parts = [];
    this.hitTimers.clear();
    this.punchTimers.clear();
    this.atmosphereDim = 1;
    this.atmosphereStrobe = 0;
    this.atmosphereStrobeHz = 4;
  }
}
