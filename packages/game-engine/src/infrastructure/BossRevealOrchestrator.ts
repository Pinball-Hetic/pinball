import type * as THREE from 'three';
import { type BossId } from '../domain/BossRegistry';
import type { GameEvent } from '../domain/GameEvents';
import type { BossRevealController } from './BossRevealController';
import { prewarmPointLightProgramVariants } from './SkinnedModelWarmup';

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

    // Variantes d'éclairage : tout compte de PointLights jamais rencontré
    // déclenche une recompilation de TOUS les matériaux éclairés à la frame du
    // reveal (freeze). On pré-compile 0..max+1 — le +1 absorbe une lumière
    // dynamique concurrente hors reveal (ex. cœur de portail actif pendant un
    // combat).
    const maxLights = Math.max(
      0,
      ...[...this.reveals.values()].map((r) => r.dynamicPointLightCount?.() ?? 0),
    );
    if (maxLights > 0) {
      await prewarmPointLightProgramVariants(renderer, scene, camera, maxLights + 1).catch(
        () => undefined,
      );
    }
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
    for (const id of this.reveals.keys()) {
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
