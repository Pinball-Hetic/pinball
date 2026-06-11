import type { BossId, BossDefinition } from '../domain/BossRegistry';
import { BOSS_IDS, getBossByColliderRole, getBossDefinition } from '../domain/BossRegistry';
import type { GameEventListener } from '../domain/GameEvents';
import { BossTargetSensor } from './BossTargetSensor';

type BossFightState = {
  triggered: boolean;
  sensor: BossTargetSensor;
};

export type BossRevealContext = {
  totalScore: number;
  gameState: string;
  upsideDownActive: boolean;
  upsideDownScoreBaseline: number;
};

export class BossFightManager {
  private readonly states = new Map<BossId, BossFightState>();

  constructor(private readonly emit: GameEventListener) {
    for (const id of BOSS_IDS) {
      this.states.set(id, { triggered: false, sensor: new BossTargetSensor() });
    }
  }

  resetBoss(id: BossId): void {
    const state = this.states.get(id);
    if (!state) return;
    state.triggered = false;
    state.sensor.reset();
  }

  resetAll(): void {
    for (const id of BOSS_IDS) {
      this.resetBoss(id);
    }
  }

  setFightActive(id: BossId, active: boolean): void {
    this.states.get(id)?.sensor.setFightActive(active);
  }

  setTargetArmed(id: BossId, armed: boolean): void {
    this.states.get(id)?.sensor.setTargetArmed(armed);
  }

  beginFight(id: BossId, targetArmed: boolean): void {
    const state = this.states.get(id);
    if (!state) return;
    state.triggered = true;
    state.sensor.beginFight(targetArmed);
  }

  tryReveal(id: BossId, context: BossRevealContext): void {
    const def = getBossDefinition(id);
    const state = this.states.get(id);
    if (!state) return;
    if (context.gameState !== 'playing') return;
    if (state.triggered) return;
    if (def.reveal.requiresUpsideDown && !context.upsideDownActive) return;

    const score = def.reveal.useUpsideDownScoreBaseline
      ? context.totalScore - context.upsideDownScoreBaseline
      : context.totalScore;
    if (score < def.reveal.scoreThreshold) return;

    this.beginFight(id, false);
    this.emit({
      type: 'BOSS_REVEAL',
      bossId: id,
      scoreIncrement: def.reveal.scoreIncrement,
    });
  }

  tryAllReveals(context: BossRevealContext): void {
    for (const id of BOSS_IDS) {
      this.tryReveal(id, context);
    }
  }

  prepareDebugFight(id: BossId, score: number, upsideDown: { active: boolean; baseline: number }): void {
    if (getBossDefinition(id).reveal.requiresUpsideDown) {
      upsideDown.active = true;
      upsideDown.baseline = score;
    }
    this.beginFight(id, false);
  }

  handleTargetCollision(role: string, started: boolean, gameState: string): boolean {
    const def = getBossByColliderRole(role);
    if (!def) return false;

    const sensor = this.states.get(def.id)?.sensor;
    if (!sensor) return false;

    sensor.handleCollision(started, gameState, {
      maxHits: def.targetHits,
      onHit: (hitCount) => {
        this.emit({
          type: 'BOSS_TARGET_HIT',
          bossId: def.id,
          hitCount,
          scoreIncrement: def.scoreTargetHit,
        });
      },
    });
    return true;
  }

  getDefinition(id: BossId): BossDefinition {
    return getBossDefinition(id);
  }
}
