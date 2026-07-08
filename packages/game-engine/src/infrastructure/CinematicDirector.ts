export interface CinematicSpec {
  id: string;
  durationMs: number;
  freezePhysics: boolean;
  onStart?: () => void;
  onEnd?: () => void;
}

export class CinematicDirector {
  private active: CinematicSpec | null = null;
  private startedAt = 0;
  private playedThisGame = new Set<string>();
  private readonly now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  isActive(): boolean {
    return this.active !== null;
  }

  shouldFreeze(): boolean {
    return this.active !== null && this.active.freezePhysics;
  }

  activeElapsedMs(now: number = this.now()): number {
    if (!this.active) return -1;
    return now - this.startedAt;
  }

  activeDurationMs(): number {
    return this.active?.durationMs ?? -1;
  }

  play(spec: CinematicSpec, opts?: { once?: boolean }): boolean {
    if (opts?.once && this.playedThisGame.has(spec.id)) return false;
    if (opts?.once) this.playedThisGame.add(spec.id);
    this.active = spec;
    this.startedAt = this.now();
    spec.onStart?.();
    return true;
  }

  update(now: number): void {
    if (!this.active) return;
    if (now - this.startedAt >= this.active.durationMs) {
      const spec = this.active;
      this.active = null;
      spec.onEnd?.();
    }
  }

  resetGame(): void {
    this.playedThisGame.clear();
    // Cancel a still-active clip (otherwise shouldFreeze() would stay true
    // and freeze the new game's physics). onEnd() lifts the gameplay freeze /
    // restores camera+DMD → must be called before nulling.
    const spec = this.active;
    this.active = null;
    spec?.onEnd?.();
  }
}
