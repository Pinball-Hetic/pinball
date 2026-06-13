import type * as THREE from 'three';
import type { BossId } from '@pinball/game-engine';
import type { GameEvent } from '@pinball/game-engine';

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
  isGameplayFrozen(): boolean;
}
