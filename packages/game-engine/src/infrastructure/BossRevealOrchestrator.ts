import type * as THREE from 'three';
import { BOSS_IDS, type BossId } from '../domain/BossRegistry';
import type { GameEvent } from '../domain/GameEvents';
import type { BossRevealController } from './BossRevealController';

export class BossRevealOrchestrator {
  private readonly reveals = new Map<BossId, BossRevealController>();

  register(controller: BossRevealController): this {
    this.reveals.set(controller.bossId, controller);
    return this;
  }

  get(id: BossId): BossRevealController | undefined {
    return this.reveals.get(id);
  }

  async preloadAll(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): Promise<void> {
    await Promise.all(
      [...this.reveals.values()].map((reveal) =>
        reveal.preload(renderer, scene, camera).catch(() => undefined),
      ),
    );
  }

  onGameEvent(event: GameEvent): void {
    for (const reveal of this.reveals.values()) {
      reveal.onGameEvent(event);
    }
  }

  update(dt: number): void {
    for (const reveal of this.reveals.values()) {
      reveal.update(dt);
    }
  }

  endFight(id: BossId): void {
    this.reveals.get(id)?.endFight();
  }

  endAllFights(): void {
    for (const id of BOSS_IDS) {
      this.endFight(id);
    }
  }

  dispose(): void {
    for (const reveal of this.reveals.values()) {
      reveal.dispose();
    }
    this.reveals.clear();
  }

  isGameplayFrozen(): boolean {
    for (const reveal of this.reveals.values()) {
      if (reveal.isGameplayFrozen()) return true;
    }
    return false;
  }
}
