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
    if (event.type === 'BUMPER_HIT') {
      this.hitSurge = HIT_SURGE_DURATION;
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.hitSurge > 0) this.hitSurge = Math.max(0, this.hitSurge - dt);

    const surge = this.hitSurge > 0
      ? (this.hitSurge / HIT_SURGE_DURATION) * HIT_SURGE_BOOST
      : 0;

    for (const bulb of this.bulbs) {
      const twinkle =
        0.65 +
        Math.sin(this.elapsed * TWINKLE_SPEED + bulb.phase) * bulb.twinkleAmp;
      const emissive = bulb.baseIntensity * twinkle + surge * 0.3;

      bulb.material.emissiveIntensity = emissive;
      bulb.light.intensity = bulb.lightBase * twinkle + surge * 0.12;
      bulb.material.emissive.setHex(bulb.color);
      bulb.light.color.setHex(bulb.color);
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
