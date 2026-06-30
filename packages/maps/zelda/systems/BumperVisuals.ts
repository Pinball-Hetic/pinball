import * as THREE from 'three';
import type { GameEvent, BumperMatchRule } from '@pinball/game-engine';
import { collectBumperParts, bumperPunchScale } from '@pinball/game-engine';
import { layout } from '../layout';

// Matche vis_bumper, vis_bumper.001, vis_bumper.002, vis_bumper_1, etc.
const VIS_BUMPER = /^vis_bumper/;

type BumperKind = 'vis';

const MATCH_RULES: readonly BumperMatchRule<BumperKind>[] = [
  { pattern: VIS_BUMPER, result: { action: 'part', kind: 'vis' } },
];

const PUNCH_DURATION = 0.18; // secondes
const PUNCH_PEAK     = 0.28; // +28% scale au pic

type BumperPart = {
  mesh: THREE.Mesh;
  bumperIndex: number;
  baseScale: THREE.Vector3;
};

export class BumperVisuals {
  private parts: BumperPart[]            = [];
  private punchTimers = new Map<number, number>();

  setup(root: THREE.Object3D): void {
    this.dispose();

    this.parts = collectBumperParts(root, layout.bumpers, MATCH_RULES, (ctx) => ({
      mesh:        ctx.mesh,
      bumperIndex: ctx.bumperIndex,
      baseScale:   ctx.baseScale,
    }));
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
      const factor = bumperPunchScale(pt, PUNCH_DURATION, PUNCH_PEAK);
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
