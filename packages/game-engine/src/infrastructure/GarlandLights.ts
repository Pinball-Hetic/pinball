import * as THREE from 'three';
import type { GameEvent } from '../domain/GameEvents';
import { normalizeGltfName } from './GltfNodeNames';

const GARLAND_NAME = /^guirlande-\d+$/;

const BULB_PALETTE = [
  0xff3344, 0x33ccff, 0xffee44, 0x9933ff, 0x33ff88,
  0xff6633, 0x4488ff, 0xff3399,
];

const WARM_WHITE = 0xffd4a8;
const MID_RED = 0xcc2233;

const ZONE_BOTTOM_Z = -0.15;
const ZONE_TOP_Z = -0.45;

const TWINKLE_SPEED = 3.2;
const TWINKLE_AMP = 0.45;
const HIT_SURGE_DURATION = 0.25;
const HIT_SURGE_BOOST = 0.5;

type GarlandZone = 'bottom' | 'middle' | 'top';

type GarlandBulb = {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  color: number;
  phase: number;
  baseIntensity: number;
  lightBase: number;
  twinkleAmp: number;
};

const _worldPos = new THREE.Vector3();

function bulbColor(index: number): number {
  return BULB_PALETTE[index % BULB_PALETTE.length]!;
}

function zoneForZ(z: number): GarlandZone {
  if (z > ZONE_BOTTOM_Z) return 'bottom';
  if (z > ZONE_TOP_Z) return 'middle';
  return 'top';
}

function zoneStyle(zone: GarlandZone, rainbowIndex: number) {
  switch (zone) {
    case 'bottom':
      return {
        color: WARM_WHITE,
        baseIntensity: 0.45,
        lightBase: 0.06,
        twinkleAmp: 0.12,
      };
    case 'middle':
      return {
        color: MID_RED,
        baseIntensity: 0.95,
        lightBase: 0.18,
        twinkleAmp: 0.3,
      };
    case 'top':
      return {
        color: bulbColor(rainbowIndex),
        baseIntensity: 1.4,
        lightBase: 0.35,
        twinkleAmp: TWINKLE_AMP,
      };
  }
}

export class GarlandLights {
  private bulbs: GarlandBulb[] = [];
  private hitSurge = 0;
  private elapsed = 0;
  private atmosphereDim = 1;
  private atmosphereStrobe = 0;
  private strobeActive = false;
  private strobeOn = false;

  setAtmosphere(dim: number, strobe: number): void {
    this.atmosphereDim = dim;
    this.atmosphereStrobe = strobe;
  }

  setStrobe(active: boolean, on: boolean): void {
    this.strobeActive = active;
    this.strobeOn = on;
  }

  setup(root: THREE.Object3D): void {
    this.dispose();
    this.elapsed = 0;
    this.hitSurge = 0;

    let rainbowIndex = 0;

    root.traverse((obj) => {
      const n = normalizeGltfName(obj.name);
      if (!GARLAND_NAME.test(n)) return;
      if (!(obj instanceof THREE.Mesh)) return;

      obj.getWorldPosition(_worldPos);
      const zone = zoneForZ(_worldPos.z);
      if (zone === 'top') rainbowIndex += 1;

      const style = zoneStyle(zone, rainbowIndex);
      const phase = this.bulbs.length * 0.7;

      const material = new THREE.MeshStandardMaterial({
        color: style.color,
        emissive: style.color,
        emissiveIntensity: style.baseIntensity,
        roughness: 0.35,
        metalness: 0.1,
        toneMapped: true,
      });
      obj.material = material;

      const light = new THREE.PointLight(style.color, style.lightBase, 0.22, 2);
      light.castShadow = false;
      obj.add(light);

      this.bulbs.push({
        mesh: obj,
        material,
        light,
        color: style.color,
        phase,
        baseIntensity: style.baseIntensity,
        lightBase: style.lightBase,
        twinkleAmp: style.twinkleAmp,
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

    if (this.strobeActive) {
      for (const bulb of this.bulbs) {
        const emissive = this.strobeOn ? bulb.baseIntensity * 3.2 : 0;
        const lightLevel = this.strobeOn ? bulb.lightBase * 5 : 0;
        bulb.material.emissiveIntensity = emissive;
        bulb.light.intensity = lightLevel;
        bulb.material.emissive.setHex(this.strobeOn ? 0xff1133 : 0x000000);
        bulb.light.color.setHex(this.strobeOn ? 0xff1133 : 0x000000);
      }
      return;
    }

    const strobeFlash = this.atmosphereStrobe > 0
      ? (Math.sin(this.elapsed * 18) * 0.5 + 0.5) * this.atmosphereStrobe
      : 0;
    const moodMul = this.atmosphereDim + strobeFlash * (1 - this.atmosphereDim);
    const upsideDown = this.atmosphereStrobe > 0.2;

    for (const bulb of this.bulbs) {
      const twinkle =
        0.65 +
        Math.sin(this.elapsed * TWINKLE_SPEED + bulb.phase) * bulb.twinkleAmp;
      const emissive = (bulb.baseIntensity * twinkle + surge * 0.3) * moodMul;
      const lightLevel = (bulb.lightBase * twinkle + surge * 0.12) * moodMul;

      bulb.material.emissiveIntensity = emissive;
      bulb.light.intensity = lightLevel;
      if (upsideDown) {
        const flashRed = strobeFlash > 0.45 ? 0xff0022 : 0x660011;
        bulb.material.emissive.setHex(flashRed);
        bulb.light.color.setHex(flashRed);
      } else {
        bulb.material.emissive.setHex(bulb.color);
        bulb.light.color.setHex(bulb.color);
      }
    }
  }

  dispose(): void {
    for (const bulb of this.bulbs) {
      bulb.light.removeFromParent();
      bulb.light.dispose();
    }
    this.bulbs = [];
  }
}
