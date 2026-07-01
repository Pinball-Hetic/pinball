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

// Injectable sensor factory (DIP): defaults to a real BossTargetSensor, but
// tests can substitute a fake to observe/drive per-boss sensor behaviour
// without touching the wall clock.
export type BossTargetSensorFactory = (now: () => number) => BossTargetSensor;

const defaultSensorFactory: BossTargetSensorFactory = (now) => new BossTargetSensor(now);

export class BossFightManager {
  private readonly states = new Map<BossId, BossFightState>();
  private readonly byId = new Map<BossId, BossDefinition>();
  private readonly byRole = new Map<string, BossDefinition>();

  // Définitions de boss injectées par la map (layout.bosses) — le moteur ne
  // connaît plus de boss en dur.
  constructor(
    private readonly emit: GameEventListener,
    private readonly bosses: BossDefinition[],
    // Injected clock (DIP): threaded into each BossTargetSensor so the per-hit
    // cooldown is deterministic in tests.
    now: () => number = () => performance.now(),
    // Injected sensor factory (DIP): substitutable in tests, defaults to a real
    // BossTargetSensor wired to `now`.
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

  /** True si le combat du boss est déclenché (reveal consommé, nid « ouvert »). */
  isTriggered(id: BossId): boolean {
    return this.states.get(id)?.triggered ?? false;
  }

  /** True if any boss OTHER than `except` is currently in an active (scoreable)
   *  fight. Used to keep at most one boss armed at a time — the boss target
   *  sensors physically overlap, so two simultaneously-armed bosses would let a
   *  single ball pass double-credit hits. */
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
    // One boss fight at a time — don't reveal while another is still active.
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
