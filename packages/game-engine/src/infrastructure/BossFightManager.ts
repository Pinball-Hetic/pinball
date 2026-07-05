import type { BossId, BossGateContext, BossDefinition } from '../domain/BossRegistry';
import { bossThresholdMet } from '../domain/BossRegistry';
import type { GameEventListener } from '../domain/GameEvents';
import { BossTargetSensor } from './BossTargetSensor';

type BossFightState = {
  triggered: boolean;
  sensor: BossTargetSensor;
};

export type BossRevealContext = BossGateContext & {
  gameState: string;
};

export type BossTargetSensorFactory = (now: () => number) => BossTargetSensor;

const defaultSensorFactory: BossTargetSensorFactory = (now) => new BossTargetSensor(now);

export class BossFightManager {
  private readonly states = new Map<BossId, BossFightState>();
  private readonly byId = new Map<BossId, BossDefinition>();
  private readonly byRole = new Map<string, BossDefinition>();

  constructor(
    private readonly emit: GameEventListener,
    private readonly bosses: BossDefinition[],
    now: () => number = () => performance.now(),
    createSensor: BossTargetSensorFactory = defaultSensorFactory,
  ) {
    for (const def of bosses) {
      this.states.set(def.id, { triggered: false, sensor: createSensor(now) });
      this.byId.set(def.id, def);
      this.byRole.set(def.colliderRole, def);
    }
  }

  resetBoss(id: BossId): void {
    const state = this.states.get(id);
    if (!state) return;
    state.triggered = false;
    state.sensor.reset();
  }

  resetAll(): void {
    for (const def of this.bosses) {
      this.resetBoss(def.id);
    }
  }

  resetAlternateWorldBosses(): void {
    for (const def of this.bosses) {
      if (def.reveal.requiresAlternateWorld) this.resetBoss(def.id);
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

  isTriggered(id: BossId): boolean {
    return this.states.get(id)?.triggered ?? false;
  }

  // Un seul boss actif à la fois : les cibles des boss se chevauchent physiquement, donc deux boss armés en même temps feraient compter un même coup de balle deux fois (double-comptage injuste).
  private anyOtherFightActive(except: BossId): boolean {
    for (const [id, state] of this.states) {
      if (id !== except && state.sensor.fightActive) return true;
    }
    return false;
  }

  tryReveal(id: BossId, context: BossRevealContext): void {
    const def = this.byId.get(id);
    const state = this.states.get(id);
    if (!def || !state) return;
    if (context.gameState !== 'playing') return;
    if (state.triggered) return;
    if (this.anyOtherFightActive(id)) return;
    if (!bossThresholdMet(def, context)) return;

    this.beginFight(id, false);
    this.emit({
      type: 'BOSS_REVEAL',
      bossId: id,
      scoreIncrement: def.reveal.scoreIncrement,
    });
  }

  tryAllReveals(context: BossRevealContext): void {
    for (const def of this.bosses) {
      this.tryReveal(def.id, context);
    }
  }


  forceReveal(id: BossId, gameState: string): void {
    const def = this.byId.get(id);
    const state = this.states.get(id);
    if (!def || !state) return;
    if (gameState !== 'playing') return;
    if (state.triggered) return;
    if (this.anyOtherFightActive(id)) return;

    this.beginFight(id, false);
    this.emit({
      type: 'BOSS_REVEAL',
      bossId: id,
      scoreIncrement: def.reveal.scoreIncrement,
    });
  }

  forceTargetHit(id: BossId, gameState: string): void {
    const def = this.byId.get(id);
    const sensor = this.states.get(id)?.sensor;
    if (!def || !sensor) return;
    const opts = {
      maxHits: def.targetHits,
      hitCooldownMs: 0,
      onHit: (hitCount: number) => {
        this.emit({
          type: 'BOSS_TARGET_HIT',
          bossId: def.id,
          hitCount,
          scoreIncrement: def.scoreTargetHit,
        });
      },
    };
    sensor.handleCollision(true, gameState, opts);
    sensor.handleCollision(false, gameState, opts);
  }

  handleTargetCollision(role: string, started: boolean, gameState: string): boolean {
    const def = this.byRole.get(role);
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
}
