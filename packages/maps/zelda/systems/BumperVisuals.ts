import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import { normalizeGltfName } from '@pinball/game-engine';
import { layout } from '../layout';

// Matche vis_bumper, vis_bumper.001, vis_bumper.002, vis_bumper_1, etc.
const VIS_BUMPER = /^vis_bumper/;

const PUNCH_DURATION = 0.18; // secondes
const PUNCH_PEAK     = 0.28; // +28% scale au pic

// easeOutBack : monte vite, léger dépassement, retour fluide.
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

type BumperPart = {
  mesh: THREE.Mesh;
  bumperIndex: number;
  baseScale: THREE.Vector3;
};

function nearestBumperIndex(pos: THREE.Vector3): number {
  let best     = 0;
  let bestDist = Infinity;
  for (let i = 0; i < layout.bumpers.length; i++) {
    const p  = layout.bumpers[i]!;
    const dx = pos.x - p.x;
    const dy = pos.y - p.y;
    const dz = pos.z - p.z;
    const d  = dx * dx + dy * dy + dz * dz;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

export class BumperVisuals {
  private parts: BumperPart[]            = [];
  private punchTimers = new Map<number, number>();

  setup(root: THREE.Object3D): void {
    this.dispose();

    const wp = new THREE.Vector3();

    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!VIS_BUMPER.test(normalizeGltfName(obj.name))) return;

      obj.getWorldPosition(wp);
      this.parts.push({
        mesh:        obj,
        bumperIndex: nearestBumperIndex(wp),
        baseScale:   obj.scale.clone(),
      });
    });
  }

  onGameEvent(event: GameEvent): void {
    if (event.type !== 'BUMPER_HIT') return;
    this.punchTimers.set(event.bumperIndex, PUNCH_DURATION);
  }

  update(dt: number): void {
    // Tick des timers.
    for (const [idx, t] of this.punchTimers) {
      const next = t - dt;
      if (next <= 0) this.punchTimers.delete(idx);
      else           this.punchTimers.set(idx, next);
    }

    // Animation scale : 1 → 1+PEAK → 1 avec easeOutBack.
    for (const part of this.parts) {
      const pt = this.punchTimers.get(part.bumperIndex) ?? 0;
      let factor = 1;
      if (pt > 0) {
        const prog = 1 - pt / PUNCH_DURATION; // 0 → 1
        const env  = prog < 0.5
          ? easeOutBack(prog * 2)
          : 1 - (prog - 0.5) * 2;
        factor = 1 + PUNCH_PEAK * Math.max(0, env);
      }
      part.mesh.scale.copy(part.baseScale).multiplyScalar(factor);
    }
  }

  dispose(): void {
    // Remet les scales à leur valeur d'origine avant de vider.
    for (const part of this.parts) {
      part.mesh.scale.copy(part.baseScale);
    }
    this.parts = [];
    this.punchTimers.clear();
  }
}
