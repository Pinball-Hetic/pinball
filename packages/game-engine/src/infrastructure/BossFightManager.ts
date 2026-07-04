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

// Sensor factory: tests substitute a fake to observe/drive per-boss sensor
// behaviour without touching the wall clock.
export type BossTargetSensorFactory = (now: () => number) => BossTargetSensor;

const defaultSensorFactory: BossTargetSensorFactory = (now) => new BossTargetSensor(now);

export class BossFightManager {
  private readonly states = new Map<BossId, BossFightState>();
  private readonly byId = new Map<BossId, BossDefinition>();
  private readonly byRole = new Map<string, BossDefinition>();

  // Boss definitions injected by the map (layout.bosses) — the engine knows
  // no hardcoded bosses.
  constructor(
    private readonly emit: GameEventListener,
    private readonly bosses: BossDefinition[],
    // Injected clock: threaded into each BossTargetSensor so the per-hit
    // cooldown is deterministic in tests.
    now: () => number = () => performance.now(),
    // Injected sensor factory: substitutable in tests, defaults to a real
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

  /** Reset only the bosses that gate on the alternate world — used when the
   *  alternate-world session ends without completing a full world cycle. */
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

  /** True if the boss fight is triggered (reveal consumed, nest "open"). */
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

  /**
   * DEBUG (/debug): reveal via the REAL state path — beginFight + emit, like
   * tryReveal, but without the score-threshold gate. Keeps the other
   * invariants (playing, not already triggered, one fight at a time): the
   * boss appears ARMED and its colliders really credit balls, unlike a raw
   * BOSS_REVEAL event (visuals only, ghost boss).
   */
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

  /**
   * DEBUG (/debug): credits ONE hit via the real sensor (real counter,
   * cooldown ignored — it's a button, not a physical bounce). The boss thus
   * really dies after targetHits clicks, with consistent states/resets.
   */
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
    // Simulates a full ball pass: contact then exit (the sensor requires
    // contact end before counting again).
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
