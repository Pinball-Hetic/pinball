import type * as THREE from 'three';
import type { BossId } from '../domain/BossRegistry';
import type { GameEvent } from '../domain/GameEvents';

export interface BossRevealController {
  readonly bossId: BossId;
  preload(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): Promise<void>;
  onGameEvent(event: GameEvent): void;
  endFight(): void;
  update(dt: number): void;
  dispose(): void;
}
