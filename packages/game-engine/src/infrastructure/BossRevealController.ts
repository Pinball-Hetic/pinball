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
  /**
   * Max number of PointLights THIS reveal adds dynamically to the scene during
   * its fight (strobe flash, boss glow, target light, assist…). Used to prewarm
   * shader variants — see
   * BossRevealOrchestrator.preloadAll / prewarmPointLightProgramVariants.
   */
  dynamicPointLightCount?(): number;
  endFight(): void;
  update(dt: number): void;
  dispose(): void;
  isGameplayFrozen(): boolean;
}
