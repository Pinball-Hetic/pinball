import * as THREE from 'three';
import type { GameEvent, BumperMatchRule } from '@pinball/game-engine';
import { collectBumperParts, tickPunchTimers, applyPunchScale } from '@pinball/game-engine';
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

    // Échoue bruyamment : aucun mesh matché = effets bumper silencieusement
    // morts (convention de nommage GLB changée). Parité diagnostic avec ST.
    if (this.parts.length === 0) {
      console.warn(
        '[BumperVisuals] aucun mesh bumper reconnu (VIS_BUMPER) — ' +
          'vérifier les noms de meshes du GLB.',
      );
    }
  }

  onGameEvent(event: GameEvent): void {
    if (event.type !== 'BUMPER_HIT') return;
    this.punchTimers.set(event.bumperIndex, PUNCH_DURATION);
  }

  update(dt: number): void {
    tickPunchTimers(this.punchTimers, dt);
    // Animation scale : 1 → 1+PEAK → 1 avec easeOutBack.
    applyPunchScale(this.parts, this.punchTimers, PUNCH_DURATION, PUNCH_PEAK);
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
