import * as THREE from 'three';
import type { GameEvent } from '../domain/GameEvents';
import { BUMPER_POSITIONS } from '../domain/Ball';
import { normalizeGltfName } from './GltfNodeNames';

const LEGACY_BUMPER = /^bumper-st-\d+$/;
const GLTF_BUMPER = /^bumper-\d+$/;
const LEGACY_BASE = /bumper-strangerthings/;
const LEGACY_RING = /^bumper_ring/;

const BUMPER_METALNESS = 0.42;
const BUMPER_ROUGHNESS = 0.36;
const BUMPER_SURFACE = 0xffffff;
const BUMPER_EMISSIVE = 0xff1122;
const BUMPER_EMISSIVE_INTENSITY = 3.4;
const BUMPER_LIGHT_COLOR = 0xff5566;
const BUMPER_LIGHT_INTENSITY = 0.95;
const BUMPER_LIGHT_DISTANCE = 0.38;

const RING_SURFACE = 0xc82838;
const RING_EMISSIVE = 0x881018;
const RING_METALNESS = 0.78;
const RING_ROUGHNESS = 0.3;

const IDLE_PULSE_SPEED = 1.35;
const IDLE_PULSE_AMP = 0.18;
const HIT_FLASH_DURATION = 0.2;
const HIT_FLASH_BOOST = 1.1;
const PUNCH_DURATION = 0.15; // scale punch 1 → 1.22 → 1
const PUNCH_PEAK = 0.22;

// easeOutBack : léger dépassement puis retour.
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

const _emissiveA = new THREE.Color();
const _emissiveB = new THREE.Color();
const _portalLightColor = new THREE.Color();

type BumperKind = 'gltf' | 'base' | 'ring';

type BumperPart = {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  bumperIndex: number;
  kind: BumperKind;
  portalLight: THREE.PointLight | null;
  baseIntensity: number;
  baseScale: THREE.Vector3;
};

function cloneStandardMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
  const src = mesh.material;
  const mat = (Array.isArray(src) ? src[0] : src) as THREE.Material;
  if (mat instanceof THREE.MeshStandardMaterial) return mat.clone();
  return new THREE.MeshStandardMaterial({ color: 0xffffff });
}

function nearestBumperIndex(pos: THREE.Vector3): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < BUMPER_POSITIONS.length; i++) {
    const p = BUMPER_POSITIONS[i]!;
    const dx = pos.x - p.x;
    const dy = pos.y - p.y;
    const dz = pos.z - p.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function applyGltfBumperLook(material: THREE.MeshStandardMaterial, portalLight: THREE.PointLight): void {
  material.color.setHex(BUMPER_SURFACE);
  material.emissive.setHex(BUMPER_EMISSIVE);
  material.emissiveIntensity = BUMPER_EMISSIVE_INTENSITY;
  material.metalness = BUMPER_METALNESS;
  material.roughness = BUMPER_ROUGHNESS;
  material.toneMapped = false;

  portalLight.color.setHex(BUMPER_LIGHT_COLOR);
  portalLight.intensity = BUMPER_LIGHT_INTENSITY;
  portalLight.distance = BUMPER_LIGHT_DISTANCE;
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
      const bumperIndex = nearestBumperIndex(wp);
      const material = cloneStandardMaterial(obj);
      let portalLight: THREE.PointLight | null = null;

      if (kind === 'gltf') {
        portalLight = new THREE.PointLight(BUMPER_LIGHT_COLOR, BUMPER_LIGHT_INTENSITY, BUMPER_LIGHT_DISTANCE, 2);
        portalLight.castShadow = false;
        obj.add(portalLight);
        applyGltfBumperLook(material, portalLight);
      } else if (kind === 'base') {
        material.color.setHex(0xffccd5);
        material.emissive.setHex(0xff2244);
        material.emissiveIntensity = 2.2;
        material.metalness = 0.08;
        material.roughness = 0.42;
        material.toneMapped = false;

        portalLight = new THREE.PointLight(0xff4466, 0.75, 0.3, 2);
        portalLight.castShadow = false;
        obj.add(portalLight);
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
        portalLight,
        baseIntensity: material.emissiveIntensity,
        baseScale: obj.scale.clone(),
      });
    });
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
      let factor = 1;
      if (pt > 0) {
        const prog = 1 - pt / PUNCH_DURATION; // 0 → 1
        const env = prog < 0.5 ? easeOutBack(prog * 2) : 1 - (prog - 0.5) * 2;
        factor = 1 + PUNCH_PEAK * Math.max(0, env);
      }
      part.mesh.scale.copy(part.baseScale).multiplyScalar(factor);
    }

    if (this.strobeActive) {
      if (!this.strobeOn) {
        for (const part of this.parts) {
          part.material.emissiveIntensity = 0;
          if (part.portalLight) part.portalLight.intensity = 0;
        }
        return;
      }
      if (!this.strobeNormalWhenOn) {
        for (const part of this.parts) {
          part.material.emissive.setHex(0xff1133);
          part.material.emissiveIntensity = 2.6;
          if (part.portalLight) {
            part.portalLight.color.setHex(0xff1133);
            part.portalLight.intensity = 1.1;
          }
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

        if (part.portalLight) {
          _portalLightColor.setHex(upsideDown && strobeFlash > 0.45 ? 0xff2244 : BUMPER_LIGHT_COLOR);
          part.portalLight.color.copy(_portalLightColor);
          part.portalLight.intensity = (BUMPER_LIGHT_INTENSITY * slowBreath + hitFactor * 0.35) * moodMul;
        }
      } else if (part.kind === 'base') {
        part.material.emissive.setHex(upsideDown && strobeFlash > 0.45 ? 0xff1133 : 0xff2244);
        part.material.emissiveIntensity = (part.baseIntensity * slowBreath + hitFactor) * moodMul;

        if (part.portalLight) {
          part.portalLight.color.setHex(upsideDown && strobeFlash > 0.45 ? 0xff2244 : 0xff5577);
          part.portalLight.intensity = (0.55 * slowBreath + hitFactor * 0.25) * moodMul;
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
      if (part.portalLight) {
        part.portalLight.removeFromParent();
        part.portalLight.dispose();
      }
    }
    this.parts = [];
    this.hitTimers.clear();
    this.punchTimers.clear();
    this.atmosphereDim = 1;
    this.atmosphereStrobe = 0;
    this.atmosphereStrobeHz = 4;
  }
}
