import type { GameOver } from '@pinball/shared-types';

export type TakeoverScene =
  | 'HIGH_SCORE'
  | 'RECAP'
  | 'MAP_EVENT'
  | 'ATTRACT'
  | 'CINEMATIC';

export interface Takeover {
  scene: TakeoverScene;
  payload?: GameOver & { rank: number };
  clip?: string;
}

export interface FollowUp {
  scene: TakeoverScene;
  durationMs: number;
  priority?: number;
  payload?: GameOver & { rank: number };
}

export interface StackEntry {
  scene: TakeoverScene;
  priority: number;
  expiresAt: number;
  payload?: GameOver & { rank: number };
  clip?: string;
  followUp?: FollowUp;
}

export interface TakeoverTickDeps {
  holdsHallFlip: (clip: string) => boolean;
  attractJoyceName: () => string | null;
  onJoyce: (text: string) => void;
}

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

  start(now: number): void {
    this.lastActivity = now;
    this.lastJoyceIdle = now;
  }

  markActivity(now: number): void {
    this.lastActivity = now;
  }

  push(entry: StackEntry): void {
    this.stack.push(entry);
  }

  tick(now: number, deps: TakeoverTickDeps): TakeoverTickResult {
    const expiring = this.stack.filter((e) => e.expiresAt <= now);
    this.stack = this.stack.filter((e) => e.expiresAt > now);

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

    const idle = now - this.lastActivity > ATTRACT_IDLE_MS;
    const hasReal = this.stack.some((e) => e.scene !== 'ATTRACT');
    this.stack = this.stack.filter((e) => e.scene !== 'ATTRACT');
    if (idle && !hasReal) {
      this.stack.push({ scene: 'ATTRACT', priority: 10, expiresAt: Infinity });
      if (now - this.lastJoyceIdle > JOYCE_IDLE_MS) {
        this.lastJoyceIdle = now;
        const name = deps.attractJoyceName();
        if (name) deps.onJoyce(name);
      }
    }

    const top = this.stack.reduce<StackEntry | null>(
      (best, e) => (!best || e.priority > best.priority ? e : best),
      null,
    );

    const holdHallFlip = this.stack.some(
      (e) => e.scene === 'CINEMATIC' && e.clip != null && deps.holdsHallFlip(e.clip),
    );

    return { top, highlightRank: this.highlightRank, holdHallFlip };
  }
}
