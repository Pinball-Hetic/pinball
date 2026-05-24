import * as THREE from 'three';
import type { GameEvent } from '../domain/GameEvents';
import { BUMPER_POSITIONS } from '../domain/Ball';
import { normalizeGltfName } from './GltfNodeNames';
import { BumperVineTextures } from './BumperVineTextures';

const LEGACY_BUMPER = /^bumper-st-\d+$/;
const NEW_BASE = /bumper-strangerthings/;
const NEW_RING = /^bumper_ring/;

const PORTAL_BY_INDEX = [
  { tint: 0xdd8899, core: 0xc02848, rim: 0xff4466 },
  { tint: 0xcc88cc, core: 0xa03088, rim: 0xee5599 },
  { tint: 0xdd8899, core: 0xb82850, rim: 0xff5577 },
] as const;

const UV_PHASE = [0, 0.37, 0.71];

const RING_SURFACE = 0xccb0b8;
const RING_EMISSIVE = 0x882844;
const RING_METALNESS = 0.82;
const RING_ROUGHNESS = 0.48;

const IDLE_PULSE_SPEED = 1.35;
const IDLE_PULSE_AMP = 0.22;
const HIT_FLASH_DURATION = 0.2;
const HIT_FLASH_BOOST = 0.85;

const _emissiveA = new THREE.Color();
const _emissiveB = new THREE.Color();
const _portalLightColor = new THREE.Color();

type BumperPart = {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  bumperIndex: number;
  kind: 'base' | 'ring';
  portalLight: THREE.PointLight | null;
  baseIntensity: number;
  uvPhase: number;
  ownedTextures: THREE.Texture[];
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

function applyVineMaps(
  material: THREE.MeshStandardMaterial,
  vines: BumperVineTextures,
  bumperIndex: number,
  kind: 'base' | 'ring',
): THREE.CanvasTexture[] {
  const phase = UV_PHASE[bumperIndex] ?? 0;
  const repeat = kind === 'base' ? 2.2 : 2.8;

  const albedo = vines.cloneAlbedoMap();
  const emissive = vines.cloneEmissiveMap();
  albedo.repeat.set(repeat, repeat);
  emissive.repeat.set(repeat, repeat);
  albedo.offset.set(phase, phase * 0.63);
  emissive.offset.set(phase * 0.8, phase * 0.45);

  material.map = albedo;
  material.emissiveMap = emissive;
  return [albedo, emissive];
}

export class BumperVisuals {
  private parts: BumperPart[] = [];
  private hitTimers = new Map<number, number>();
  private elapsed = 0;
  private vines: BumperVineTextures | null = null;
  private strobeActive = false;
  private strobeOn = false;
  private strobeNormalWhenOn = false;

  setStrobe(active: boolean, on: boolean, normalWhenOn = false): void {
    this.strobeActive = active;
    this.strobeOn = on;
    this.strobeNormalWhenOn = normalWhenOn;
  }

  setup(root: THREE.Object3D): void {
    this.dispose();
    this.elapsed = 0;
    this.vines = new BumperVineTextures();

    const wp = new THREE.Vector3();

    root.traverse((obj) => {
      const n = normalizeGltfName(obj.name);

      if (LEGACY_BUMPER.test(n)) {
        obj.visible = false;
        obj.traverse((child) => {
          child.visible = false;
        });
        if (obj instanceof THREE.Mesh) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m instanceof THREE.MeshStandardMaterial) {
              m.emissiveIntensity = 0;
              m.emissive.setHex(0x000000);
              m.emissiveMap = null;
            }
          }
        }
        return;
      }

      if (!(obj instanceof THREE.Mesh)) return;

      let kind: 'base' | 'ring' | null = null;
      if (NEW_BASE.test(n)) kind = 'base';
      else if (NEW_RING.test(n)) kind = 'ring';
      else return;

      obj.getWorldPosition(wp);
      const bumperIndex = nearestBumperIndex(wp);
      const material = cloneStandardMaterial(obj);
      const portal = PORTAL_BY_INDEX[bumperIndex] ?? PORTAL_BY_INDEX[0]!;
      const uvPhase = UV_PHASE[bumperIndex] ?? 0;
      let portalLight: THREE.PointLight | null = null;

      const ownedTextures = applyVineMaps(material, this.vines!, bumperIndex, kind);

      if (kind === 'base') {
        material.color.setHex(portal.tint);
        material.emissive.setHex(portal.core);
        material.emissiveIntensity = 1.55;
        material.roughness = 0.52;
        material.metalness = 0.04;

        portalLight = new THREE.PointLight(portal.rim, 0.38, 0.22, 2);
        portalLight.castShadow = false;
        obj.add(portalLight);
      } else {
        material.color.setHex(RING_SURFACE);
        material.emissive.setHex(RING_EMISSIVE);
        material.emissiveIntensity = 0.75;
        material.roughness = RING_ROUGHNESS;
        material.metalness = RING_METALNESS;
      }

      material.toneMapped = true;
      obj.material = material;

      this.parts.push({
        mesh: obj,
        material,
        bumperIndex,
        kind,
        portalLight,
        baseIntensity: material.emissiveIntensity,
        uvPhase,
        ownedTextures,
      });
    });
  }

  onGameEvent(event: GameEvent): void {
    if (event.type !== 'BUMPER_HIT') return;
    this.hitTimers.set(event.bumperIndex, HIT_FLASH_DURATION);
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.vines?.update(this.elapsed);

    if (this.vines?.repainted) {
      for (const part of this.parts) {
        if (part.material.map) part.material.map.needsUpdate = true;
        if (part.material.emissiveMap) part.material.emissiveMap.needsUpdate = true;
      }
    }

    for (const [idx, t] of this.hitTimers) {
      const next = t - dt;
      if (next <= 0) this.hitTimers.delete(idx);
      else this.hitTimers.set(idx, next);
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
          part.material.emissiveIntensity = 1.8;
          if (part.portalLight) {
            part.portalLight.color.setHex(0xff1133);
            part.portalLight.intensity = 0.7;
          }
        }
        return;
      }
    }

    for (const part of this.parts) {
      const portal = PORTAL_BY_INDEX[part.bumperIndex] ?? PORTAL_BY_INDEX[0]!;
      const hitT = this.hitTimers.get(part.bumperIndex) ?? 0;
      const hitFactor = hitT > 0 ? (hitT / HIT_FLASH_DURATION) * HIT_FLASH_BOOST : 0;

      const slowBreath =
        0.78 + Math.sin(this.elapsed * IDLE_PULSE_SPEED + part.bumperIndex * 1.4) * IDLE_PULSE_AMP;
      const fastFlicker =
        0.92 + Math.sin(this.elapsed * 7.5 + part.bumperIndex * 2.1) * 0.08;

      if (part.material.map) {
        part.material.map.offset.x =
          part.uvPhase + Math.sin(this.elapsed * 0.18 + part.bumperIndex) * 0.04;
        part.material.map.offset.y =
          part.uvPhase * 0.63 + (this.elapsed * 0.035) % 1;
      }
      if (part.material.emissiveMap) {
        part.material.emissiveMap.offset.x =
          part.uvPhase * 0.8 - Math.sin(this.elapsed * 0.22 + part.bumperIndex * 1.3) * 0.05;
        part.material.emissiveMap.offset.y =
          part.uvPhase * 0.45 + (this.elapsed * 0.04) % 1;
      }

      if (part.kind === 'base') {
        _emissiveA.setHex(portal.core);
        _emissiveB.setHex(portal.rim);
        part.material.emissive.copy(_emissiveA).lerp(_emissiveB, 0.35 + slowBreath * 0.25);

        const intensity = part.baseIntensity * slowBreath * fastFlicker + hitFactor;
        part.material.emissiveIntensity = intensity;

        if (hitFactor > 0) {
          part.material.emissive.lerp(_emissiveB.setHex(0xff2244), Math.min(0.25, hitFactor * 0.12));
        }

        if (part.portalLight) {
          _portalLightColor.setHex(portal.rim).lerp(_emissiveB.setHex(0xff3355), Math.min(0.2, hitFactor * 0.15));
          part.portalLight.color.copy(_portalLightColor);
          part.portalLight.intensity = 0.28 * slowBreath + hitFactor * 0.16;
        }
      } else {
        part.material.emissive.setHex(RING_EMISSIVE);
        if (hitFactor > 0) {
          _emissiveA.setHex(RING_EMISSIVE);
          _emissiveB.setHex(portal.rim);
          part.material.emissive.copy(_emissiveA).lerp(_emissiveB, Math.min(0.3, hitFactor * 0.18));
          part.material.emissiveIntensity = 0.55 + hitFactor * 0.22;
        } else {
          part.material.emissiveIntensity = 0.55 + slowBreath * 0.25;
        }
      }
    }
  }

  dispose(): void {
    for (const part of this.parts) {
      for (const tex of part.ownedTextures) tex.dispose();
      part.material.map = null;
      part.material.emissiveMap = null;
      if (part.portalLight) {
        part.portalLight.removeFromParent();
        part.portalLight.dispose();
      }
    }
    this.vines?.dispose();
    this.vines = null;
    this.parts = [];
    this.hitTimers.clear();
  }
}
