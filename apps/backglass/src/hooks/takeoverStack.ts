// ── Backglass takeover state machine ────────────────────────────────────────
// Decides which scene to display:
//   - a STACK of candidate scenes, each with a PRIORITY and an expiration,
//   - purge of expired scenes + chaining (`followUp`),
//   - temporary highlight of a leaderboard row (high-score),
//   - attract mode after an idle period,
//   - active scene = highest priority.
//
// This class knows NEITHER React NOR Socket.io — `now` and callbacks are
// injected, so it is unit-testable. The hook (useBackglassTakeover.ts) is a
// thin orchestrator around it.
// ────────────────────────────────────────────────────────────────────────────

import type { GameOver } from '@pinball/shared-types';

export type TakeoverScene =
  | 'HIGH_SCORE'
  | 'RECAP'
  | 'MAP_EVENT'
  | 'ATTRACT'
  | 'CINEMATIC';

/** Scene actually displayed by the UI (result exposed to the component). */
export interface Takeover {
  scene: TakeoverScene;
  payload?: GameOver & { rank: number };
  clip?: string;
}

// Chaining: the next scene is only pushed when the current one expires (its
// duration starts then). The priority-stack model preempts but does not
// sequence — followUp adds sequencing.
export interface FollowUp {
  scene: TakeoverScene;
  durationMs: number;
  priority?: number;
  payload?: GameOver & { rank: number };
}

/** A candidate scene in the stack (with priority + expiration timestamp). */
export interface StackEntry {
  scene: TakeoverScene;
  priority: number;
  expiresAt: number;
  payload?: GameOver & { rank: number };
  clip?: string;
  followUp?: FollowUp;
}

/** Dependencies injected into `tick` (keep the class pure: no direct access). */
export interface TakeoverTickDeps {
  /** true if this clip must delay the hall of fame 3D flip (e.g. portal_swallow). */
  holdsHallFlip: (clip: string) => boolean;
  /** Name to display on the Joyce wall in attract mode (leaderboard #1), or null. */
  attractJoyceName: () => string | null;
  /** Emits a Joyce signal (side effect delegated to the hook). */
  onJoyce: (text: string) => void;
}

/** Derived state returned on each tick (consumed by the hook for its setState). */
export interface TakeoverTickResult {
  top: StackEntry | null;
  highlightRank: number | undefined;
  holdHallFlip: boolean;
}

const HIGHLIGHT_MS = 4_000;
const ATTRACT_IDLE_MS = 60_000;
const JOYCE_IDLE_MS = 90_000;

export class TakeoverStack {
  private stack: StackEntry[] = [];
  private lastActivity = 0;
  private lastJoyceIdle = 0;
  private highlightUntil = 0;
  private highlightRank: number | undefined = undefined;

  /** Call once at startup: initializes the idle clocks. */
  start(now: number): void {
    this.lastActivity = now;
    this.lastJoyceIdle = now;
  }

  /** Signals game activity → pushes back the attract mode trigger. */
  markActivity(now: number): void {
    this.lastActivity = now;
  }

  /** Pushes a candidate scene (the highest priority wins on the next tick). */
  push(entry: StackEntry): void {
    this.stack.push(entry);
  }

  /**
   * Advances the machine to time `now`:
   *  1. purge expired scenes,
   *  2. chain the `followUp`s of scenes that just expired,
   *  3. manage the high-score row highlight,
   *  4. toggle attract mode based on idleness,
   *  5. return the active scene (max priority) + derived state.
   */
  tick(now: number, deps: TakeoverTickDeps): TakeoverTickResult {
    // 1. purge expired scenes
    const expiring = this.stack.filter((e) => e.expiresAt <= now);
    this.stack = this.stack.filter((e) => e.expiresAt > now);

    // 2. chaining: an expired scene with a followUp pushes the next one NOW
    //    (its duration starts here, no longer masked).
    for (const e of expiring) {
      if (e.followUp) {
        this.stack.push({
          scene: e.followUp.scene,
          priority: e.followUp.priority ?? 80,
          expiresAt: now + e.followUp.durationMs,
          payload: e.followUp.payload,
        });
      }
    }

    // 3. a HIGH_SCORE that just expired → highlight the row. If a followUp
    //    (RECAP) comes next, extend the highlight so it survives the recap
    //    and stays visible on the base scene.
    const highExpired = expiring.find((e) => e.scene === 'HIGH_SCORE');
    if (highExpired?.payload) {
      this.highlightRank = highExpired.payload.rank;
      const extra = highExpired.followUp ? highExpired.followUp.durationMs : 0;
      this.highlightUntil = now + extra + HIGHLIGHT_MS;
    }
    if (this.highlightUntil && now > this.highlightUntil) {
      this.highlightUntil = 0;
      this.highlightRank = undefined;
    }

    // 4. ATTRACT: no activity for ATTRACT_IDLE_MS
    const idle = now - this.lastActivity > ATTRACT_IDLE_MS;
    const hasReal = this.stack.some((e) => e.scene !== 'ATTRACT');
    this.stack = this.stack.filter((e) => e.scene !== 'ATTRACT');
    if (idle && !hasReal) {
      this.stack.push({ scene: 'ATTRACT', priority: 10, expiresAt: Infinity });
      // leaderboard #1's name on the Joyce wall, periodically
      if (now - this.lastJoyceIdle > JOYCE_IDLE_MS) {
        this.lastJoyceIdle = now;
        const name = deps.attractJoyceName();
        if (name) deps.onJoyce(name);
      }
    }

    // 5. active takeover = highest priority
    const top = this.stack.reduce<StackEntry | null>(
      (best, e) => (!best || e.priority > best.priority ? e : best),
      null,
    );

    // Clip delaying the hall of fame 3D flip (e.g. portal_swallow).
    const holdHallFlip = this.stack.some(
      (e) => e.scene === 'CINEMATIC' && e.clip != null && deps.holdsHallFlip(e.clip),
    );

    return { top, highlightRank: this.highlightRank, holdHallFlip };
  }
}
