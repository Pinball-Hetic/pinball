import * as THREE from 'three';
import type { GameEvent } from '../domain/GameEvents';
import { normalizeGltfName } from './GltfNodeNames';

const GARLAND_NAME = /^guirlande-\d+$/;

const BULB_PALETTE = [
  0xff3344, 0x33ccff, 0xffee44, 0x9933ff, 0x33ff88,
  0xff6633, 0x4488ff, 0xff3399,
];

const TWINKLE_SPEED = 3.2;
const TWINKLE_AMP = 0.45;
const HIT_SURGE_DURATION = 0.45;
const HIT_SURGE_BOOST = 2.2;

type GarlandBulb = {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  color: number;
  phase: number;
  baseIntensity: number;
};

function bulbColor(index: number): number {
  return BULB_PALETTE[index % BULB_PALETTE.length]!;
}

export class GarlandLights {
  private bulbs: GarlandBulb[] = [];
  private hitSurge = 0;
  private elapsed = 0;

  setup(root: THREE.Object3D): void {
    this.dispose();
    this.elapsed = 0;
    this.hitSurge = 0;

    let bulbIndex = 0;

    root.traverse((obj) => {
      const n = normalizeGltfName(obj.name);
      if (!GARLAND_NAME.test(n)) return;
      if (!(obj instanceof THREE.Mesh)) return;

      const color = bulbColor(bulbIndex);
      bulbIndex += 1;
      const phase = bulbIndex * 0.7;

      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.4,
        roughness: 0.35,
        metalness: 0.1,
        toneMapped: true,
      });
      obj.material = material;

      const light = new THREE.PointLight(color, 0.35, 0.22, 2);
      light.castShadow = false;
      obj.add(light);

      this.bulbs.push({
        mesh: obj,
        material,
        light,
        color,
        phase,
        baseIntensity: 1.4,
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
        Math.sin(this.elapsed * TWINKLE_SPEED + bulb.phase) * TWINKLE_AMP;
      const emissive = bulb.baseIntensity * twinkle + surge;

      bulb.material.emissiveIntensity = emissive;
      bulb.light.intensity = 0.25 * twinkle + surge * 0.5;

      if (surge > 0) {
        bulb.material.emissive.setHex(0xcc44ff);
        bulb.light.color.setHex(0xcc44ff);
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
