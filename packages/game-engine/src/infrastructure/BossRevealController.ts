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
   * Nombre max de PointLights que CE reveal ajoute dynamiquement à la scène
   * pendant son combat (flash strobe, glow boss, lumière de cible, assist…).
   * Sert au pré-chauffage des variantes de shaders — voir
   * BossRevealOrchestrator.preloadAll / prewarmPointLightProgramVariants.
   */
  dynamicPointLightCount?(): number;
  endFight(): void;
  update(dt: number): void;
  dispose(): void;
  isGameplayFrozen(): boolean;
}
